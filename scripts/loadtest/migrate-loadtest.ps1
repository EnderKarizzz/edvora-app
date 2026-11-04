<#
.SYNOPSIS
    Fail-closed migration runner and validator for EDVORA local isolated load test environment.
.DESCRIPTION
    Validates filesystem, Git ignore, static .env.loadtest, Laravel runtime configuration,
    and actual PostgreSQL database identity before any migration can be considered.
    Enforces a strict execution lock preventing premature migration execution.
#>
[CmdletBinding()]
param(
    [ValidateSet('ValidateOnly', 'ExecuteMigration')]
    [string]$Mode = 'ValidateOnly',

    # Optional mock parameters for negative testing
    [string]$RepoRoot = $null,
    [string]$EnvFilePath = $null,
    [string]$ConfigCachePath = $null,
    [hashtable]$MockStaticEnv = $null,
    [hashtable]$MockRuntimeConfig = $null,
    [hashtable]$MockDbIdentity = $null
)

$ErrorActionPreference = 'Stop'

# Resolve Repository Root
if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

Write-Output "=== EDVORA FAIL-CLOSED MIGRATION RUNNER ==="
Write-Output "Repository Root : $RepoRoot"
Write-Output "Execution Mode  : $Mode"
Write-Output "Timestamp       : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Output ""

# ---------------------------------------------------------
# GATE 1: FILESYSTEM INTEGRITY
# ---------------------------------------------------------
Write-Output "[GATE 1/6] Validating Filesystem Prerequisites..."

$targetEnv = if ($EnvFilePath) { $EnvFilePath } else { Join-Path $RepoRoot ".env.loadtest" }
$targetCache = if ($ConfigCachePath) { $ConfigCachePath } else { Join-Path $RepoRoot "bootstrap\cache\config.php" }

if (-not (Test-Path $targetEnv)) {
    Write-Error "[GATE 1 FAILED] Target environment file not found: $targetEnv"
    exit 101
}

$envItem = Get-Item $targetEnv
if ($envItem.Length -le 0) {
    Write-Error "[GATE 1 FAILED] Target environment file is empty: $targetEnv"
    exit 102
}

try {
    $stream = [System.IO.File]::OpenRead($targetEnv)
    $stream.Close()
} catch {
    Write-Error "[GATE 1 FAILED] Target environment file cannot be read: $_"
    exit 103
}

if (Test-Path $targetCache) {
    Write-Error "[GATE 1 FAILED] Configuration cache detected at $targetCache. Cached configuration risks silent fallback to default .env."
    exit 104
}

Write-Output "[GATE 1 PASSED] Filesystem prerequisites verified."

# ---------------------------------------------------------
# GATE 2: GIT ISOLATION & EXCLUDE VERIFICATION
# ---------------------------------------------------------
Write-Output "[GATE 2/6] Validating Git Isolation Rules..."

Push-Location $RepoRoot
try {
    # Check git check-ignore
    $checkIgnore = git check-ignore -v .env.loadtest 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[GATE 2 FAILED] .env.loadtest is NOT ignored by Git. Exit code: $LASTEXITCODE"
        exit 201
    }

    if ($checkIgnore -notmatch "\.git/info/exclude") {
        Write-Error "[GATE 2 FAILED] .env.loadtest ignore rule must originate from .git/info/exclude. Found: $checkIgnore"
        exit 202
    }

    # Verify .gitignore is not modified
    $gitDiffIgnore = git diff --name-only .gitignore 2>&1
    if ($gitDiffIgnore -match "\.gitignore") {
        Write-Error "[GATE 2 FAILED] .gitignore has been modified. Modifying .gitignore is strictly prohibited."
        exit 203
    }

    # Verify .env.loadtest is not staged
    $gitDiffStaged = git diff --cached --name-only 2>&1
    if ($gitDiffStaged -match "\.env\.loadtest") {
        Write-Error "[GATE 2 FAILED] .env.loadtest is staged in Git index."
        exit 204
    }
} finally {
    Pop-Location
}

Write-Output "[GATE 2 PASSED] Git isolation rules verified."

# ---------------------------------------------------------
# GATE 3: STATIC ENVIRONMENT CONFIGURATION AUDIT
# ---------------------------------------------------------
Write-Output "[GATE 3/6] Auditing Static Environment Variables..."

$staticConfig = @{}
if ($MockStaticEnv) {
    $staticConfig = $MockStaticEnv
} else {
    $envLines = Get-Content -Path $targetEnv
    foreach ($line in $envLines) {
        $trimmed = $line.Trim()
        if ($trimmed -and -not $trimmed.StartsWith("#") -and $trimmed.Contains("=")) {
            $parts = $trimmed.Split("=", 2)
            $key = $parts[0].Trim()
            $val = $parts[1].Trim().Trim('"').Trim("'")
            $staticConfig[$key] = $val
        }
    }
}

$requiredStatic = @{
    'APP_ENV'       = 'loadtest'
    'DB_CONNECTION' = 'pgsql'
    'DB_HOST'       = '127.0.0.1'
    'DB_PORT'       = '5433'
    'DB_DATABASE'   = 'edvora_loadtest_isolated'
    'DB_USERNAME'   = 'edvora_loadtest_app'
}

foreach ($k in $requiredStatic.Keys) {
    $expected = $requiredStatic[$k]
    $actual = $staticConfig[$k]
    if ($actual -ne $expected) {
        Write-Error "[GATE 3 FAILED] Static config mismatch for $k. Expected: '$expected', Actual: '$actual'"
        exit 301
    }
}

Write-Output "[GATE 3 PASSED] Static environment variables strictly match target: 127.0.0.1:5433/edvora_loadtest_isolated."

# ---------------------------------------------------------
# GATE 4: LARAVEL FRAMEWORK RUNTIME CONFIGURATION PROBE
# ---------------------------------------------------------
Write-Output "[GATE 4/6] Probing Laravel Framework Runtime Configuration..."

$runtimeConfig = @{}
if ($MockRuntimeConfig) {
    $runtimeConfig = $MockRuntimeConfig
} else {
    $tempScript = Join-Path $env:TEMP "runner_probe_$([Guid]::NewGuid().ToString('N')).php"
    $probeCode = @"
<?php
define('LARAVEL_START', microtime(true));
`$_SERVER['argv'] = ['artisan', '--env=loadtest'];
`$_SERVER['argc'] = 2;
require '$($RepoRoot.Replace('\', '/'))/vendor/autoload.php';
`$app = require_once '$($RepoRoot.Replace('\', '/'))/bootstrap/app.php';
`$kernel = `$app->make(\Illuminate\Contracts\Console\Kernel::class);
`$kernel->bootstrap();
`$config = `$app->make('config');
`$db = `$app->make('db');

`$data = [
    'app_env'             => `$config->get('app.env'),
    'database_connection' => `$config->get('database.default'),
    'database_host'       => `$config->get('database.connections.pgsql.host'),
    'database_port'       => (string)`$config->get('database.connections.pgsql.port'),
    'database_name'       => `$config->get('database.connections.pgsql.database'),
    'database_username'   => `$config->get('database.connections.pgsql.username'),
    'active_connections'  => count(`$db->getConnections())
];
echo json_encode(`$data);
"@
    try {
        Set-Content -Path $tempScript -Value $probeCode -Encoding utf8
        $jsonOutput = & "C:\php85\php.exe" $tempScript 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "[GATE 4 FAILED] Laravel bootstrap probe failed with code $($LASTEXITCODE) - $jsonOutput"
            exit 401
        }
        $runtimeObj = $jsonOutput | ConvertFrom-Json
        $runtimeConfig = @{
            'app_env'             = [string]$runtimeObj.app_env
            'database_connection' = [string]$runtimeObj.database_connection
            'database_host'       = [string]$runtimeObj.database_host
            'database_port'       = [string]$runtimeObj.database_port
            'database_name'       = [string]$runtimeObj.database_name
            'database_username'   = [string]$runtimeObj.database_username
        }
    } finally {
        if (Test-Path $tempScript) {
            Remove-Item -Path $tempScript -Force -ErrorAction SilentlyContinue
        }
    }
}

if ($runtimeConfig['app_env'] -ne 'loadtest') {
    Write-Error "[GATE 4 FAILED] Runtime app.env is '$($runtimeConfig['app_env'])', expected 'loadtest'."
    exit 402
}
if ($runtimeConfig['database_connection'] -ne 'pgsql') {
    Write-Error "[GATE 4 FAILED] Runtime database default is '$($runtimeConfig['database_connection'])', expected 'pgsql'."
    exit 403
}
if ($runtimeConfig['database_host'] -ne '127.0.0.1') {
    Write-Error "[GATE 4 FAILED] Runtime database host is '$($runtimeConfig['database_host'])', expected '127.0.0.1'."
    exit 404
}
if ($runtimeConfig['database_port'] -ne '5433') {
    Write-Error "[GATE 4 FAILED] Runtime database port is '$($runtimeConfig['database_port'])', expected '5433'."
    exit 405
}
if ($runtimeConfig['database_name'] -ne 'edvora_loadtest_isolated') {
    Write-Error "[GATE 4 FAILED] Runtime database name is '$($runtimeConfig['database_name'])', expected 'edvora_loadtest_isolated'."
    exit 406
}
if ($runtimeConfig['database_username'] -ne 'edvora_loadtest_app') {
    Write-Error "[GATE 4 FAILED] Runtime database username is '$($runtimeConfig['database_username'])', expected 'edvora_loadtest_app'."
    exit 407
}

Write-Output "[GATE 4 PASSED] Laravel runtime configuration accurately verified without database connection."

# ---------------------------------------------------------
# GATE 5: ACTUAL DATABASE SERVER IDENTITY ASSERTION
# ---------------------------------------------------------
Write-Output "[GATE 5/6] Asserting Live Database Server Identity (Read-Only)..."

$dbIdentity = @{}
if ($MockDbIdentity) {
    $dbIdentity = $MockDbIdentity
} else {
    $pwdFile = "D:\pgsql-loadtest\app_pwd.txt"
    if (-not (Test-Path $pwdFile)) {
        Write-Error "[GATE 5 FAILED] App password file not found: $pwdFile"
        exit 501
    }
    $appPwd = (Get-Content -Raw $pwdFile).Trim()
    $env:PGPASSWORD = $appPwd
    try {
        $sqlProbe = "SELECT current_database(), current_user, host(inet_server_addr()), inet_server_port()::text;"
        $psqlOut = & "D:\pgsql-loadtest\pgsql17\bin\psql.exe" -h 127.0.0.1 -p 5433 -U edvora_loadtest_app -d edvora_loadtest_isolated -t -A -F "|" -c $sqlProbe 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "[GATE 5 FAILED] Database identity query failed: $psqlOut"
            exit 502
        }
        $parts = $psqlOut.Trim().Split("|")

        # Query data_directory using admin account (only superuser has permission to inspect data_directory)
        $adminPwd = (Get-Content -Raw "D:\pgsql-loadtest\admin_pwd.txt").Trim()
        $env:PGPASSWORD = $adminPwd
        $dataDirOut = (& "D:\pgsql-loadtest\pgsql17\bin\psql.exe" -h 127.0.0.1 -p 5433 -U edvora_local_admin -d edvora_loadtest_isolated -t -A -c "SELECT current_setting('data_directory');" 2>&1).Trim()
        $adminPwd = $null

        $dbIdentity = @{
            'database'       = $parts[0]
            'user'           = $parts[1]
            'server_addr'    = $parts[2]
            'server_port'    = $parts[3]
            'data_directory' = $dataDirOut
        }
    } finally {
        $env:PGPASSWORD = $null
        $appPwd = $null
    }
}

if ($dbIdentity['database'] -ne 'edvora_loadtest_isolated') {
    Write-Error "[GATE 5 FAILED] Live database identity mismatch: '$($dbIdentity['database'])' != 'edvora_loadtest_isolated'."
    exit 503
}
if ($dbIdentity['user'] -ne 'edvora_loadtest_app') {
    Write-Error "[GATE 5 FAILED] Live user identity mismatch: '$($dbIdentity['user'])' != 'edvora_loadtest_app'."
    exit 504
}
if ($dbIdentity['server_addr'] -ne '127.0.0.1') {
    Write-Error "[GATE 5 FAILED] Live server address mismatch: '$($dbIdentity['server_addr'])' != '127.0.0.1'."
    exit 505
}
if ($dbIdentity['server_port'] -ne '5433') {
    Write-Error "[GATE 5 FAILED] Live server port mismatch: '$($dbIdentity['server_port'])' != '5433'."
    exit 506
}
if ($dbIdentity['data_directory'] -notmatch "^D:/pgsql-loadtest/data") {
    Write-Error "[GATE 5 FAILED] Live data directory mismatch: '$($dbIdentity['data_directory'])'."
    exit 507
}

Write-Output "[GATE 5 PASSED] Live PostgreSQL identity confirmed on 127.0.0.1:5433 (D:/pgsql-loadtest/data)."

# ---------------------------------------------------------
# GATE 6: EXECUTION LOCK (SAFETY GATE)
# ---------------------------------------------------------
Write-Output "[GATE 6/6] Checking Execution Authorization Lock..."

if ($Mode -eq 'ValidateOnly') {
    Write-Output "[GATE 6 PASSED] Mode is 'ValidateOnly'. All preflight gates passed successfully."
    Write-Output "Status: READY_FOR_AUTHORIZED_MIGRATION (No DDL/DML executed)."
    exit 0
}

if ($Mode -eq 'ExecuteMigration') {
    Write-Output "[GATE 6 PASSED] Execution authorized for Stage 5O-D.2."
    Write-Output "[EXECUTION] Invoking Laravel migration: 'php artisan migrate --env=loadtest --force --no-interaction'..."

    Push-Location $RepoRoot
    try {
        $migrateOutput = & "C:\php85\php.exe" artisan migrate --env=loadtest --force --no-interaction 2>&1
        $migrateExitCode = $LASTEXITCODE

        $migrateOutput | ForEach-Object { Write-Output "  $_" }

        if ($migrateExitCode -ne 0) {
            Write-Error "[MIGRATION FAILED] php artisan migrate exited with error code $migrateExitCode."
            exit 602
        }

        Write-Output "[MIGRATION SUCCESS] Migration finished successfully with exit code 0."
        exit 0
    } finally {
        Pop-Location
    }
}
