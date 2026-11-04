<#
.SYNOPSIS
    Fail-closed fixture generator and pre-flight runner for EDVORA local isolated load test environment.
.DESCRIPTION
    Validates filesystem prerequisites, Git isolation rules, static .env.loadtest variables,
    Laravel runtime configuration, live PostgreSQL identity, and external dataset path security (ACL file: 1245599 & directory: 1245631)
    before any fixture generation can proceed.
    Enforces a strict execution lock preventing accidental mutation unless Mode is ExecuteSeed.
#>
[CmdletBinding()]
param(
    [ValidateSet('ValidateOnly', 'ExecuteSeed')]
    [string]$Mode = 'ValidateOnly',

    [ValidateSet('smoke', 'small', 'medium', 'large')]
    [string]$Stage = 'smoke',

    [string]$DatasetPath = $null,

    # Optional mock parameters for unit and negative testing
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

# Resolve Default Dataset Path di luar repository
$allowedBaseDir = "D:\pgsql-loadtest\datasets"
if (-not $DatasetPath) {
    $DatasetPath = Join-Path $allowedBaseDir "students-$Stage.json"
}

Write-Output "=== EDVORA FAIL-CLOSED FIXTURE SEED RUNNER ==="
Write-Output "Repository Root : $RepoRoot"
Write-Output "Execution Mode  : $Mode"
Write-Output "Target Stage    : $Stage"
Write-Output "Dataset Path    : $DatasetPath"
Write-Output "Timestamp       : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Output ""

# ---------------------------------------------------------
# GATE 1: FILESYSTEM INTEGRITY
# ---------------------------------------------------------
Write-Output "[GATE 1/7] Validating Filesystem Prerequisites..."

$targetEnv = if ($EnvFilePath) { $EnvFilePath } else { Join-Path $RepoRoot ".env.loadtest" }
$targetCache = if ($ConfigCachePath) { $ConfigCachePath } else { Join-Path $RepoRoot "bootstrap\cache\config.php" }

if (-not (Test-Path $targetEnv)) {
    Write-Error "[GATE 1 FAILED] Target environment file not found: $targetEnv" -ErrorAction Continue
    exit 101
}

$envItem = Get-Item $targetEnv
if ($envItem.Length -le 0) {
    Write-Error "[GATE 1 FAILED] Target environment file is empty: $targetEnv" -ErrorAction Continue
    exit 102
}

try {
    $stream = [System.IO.File]::OpenRead($targetEnv)
    $stream.Close()
} catch {
    Write-Error "[GATE 1 FAILED] Target environment file cannot be read: $_" -ErrorAction Continue
    exit 103
}

if (Test-Path $targetCache) {
    Write-Error "[GATE 1 FAILED] Configuration cache detected at $targetCache. Cached configuration risks silent fallback to default .env." -ErrorAction Continue
    exit 104
}

Write-Output "[GATE 1 PASSED] Filesystem prerequisites verified."

# ---------------------------------------------------------
# GATE 2: GIT ISOLATION & EXCLUDE VERIFICATION
# ---------------------------------------------------------
Write-Output "[GATE 2/7] Validating Git Isolation Rules..."

Push-Location $RepoRoot
try {
    # Check git check-ignore for .env.loadtest
    $checkIgnore = git check-ignore -v .env.loadtest 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[GATE 2 FAILED] .env.loadtest is NOT ignored by Git. Exit code: $LASTEXITCODE" -ErrorAction Continue
        exit 201
    }

    if ($checkIgnore -notmatch "\.git/info/exclude") {
        Write-Error "[GATE 2 FAILED] .env.loadtest ignore rule must originate from .git/info/exclude. Found: $checkIgnore" -ErrorAction Continue
        exit 202
    }

    # Verify .gitignore is not modified
    $gitDiffIgnore = git diff --name-only .gitignore 2>&1
    if ($gitDiffIgnore -match "\.gitignore") {
        Write-Error "[GATE 2 FAILED] .gitignore has been modified. Modifying .gitignore is strictly prohibited." -ErrorAction Continue
        exit 203
    }

    # Verify .env.loadtest is not staged
    $gitDiffStaged = git diff --cached --name-only 2>&1
    if ($gitDiffStaged -match "\.env\.loadtest") {
        Write-Error "[GATE 2 FAILED] .env.loadtest is staged in Git index." -ErrorAction Continue
        exit 204
    }
} finally {
    Pop-Location
}

Write-Output "[GATE 2 PASSED] Git isolation rules verified."

# ---------------------------------------------------------
# GATE 3: STATIC ENVIRONMENT CONFIGURATION AUDIT
# ---------------------------------------------------------
Write-Output "[GATE 3/7] Auditing Static Environment Variables..."

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
        Write-Error "[GATE 3 FAILED] Static config mismatch for $k. Expected: '$expected', Actual: '$actual'" -ErrorAction Continue
        exit 301
    }
}

Write-Output "[GATE 3 PASSED] Static environment variables strictly match target: 127.0.0.1:5433/edvora_loadtest_isolated."

# ---------------------------------------------------------
# GATE 4: LARAVEL FRAMEWORK RUNTIME CONFIGURATION PROBE
# ---------------------------------------------------------
Write-Output "[GATE 4/7] Probing Laravel Framework Runtime Configuration..."

$runtimeConfig = @{}
if ($MockRuntimeConfig) {
    $runtimeConfig = $MockRuntimeConfig
} else {
    $tempScript = Join-Path $env:TEMP "seed_runner_probe_$([Guid]::NewGuid().ToString('N')).php"
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
            Write-Error "[GATE 4 FAILED] Laravel bootstrap probe failed with code $($LASTEXITCODE) - $jsonOutput" -ErrorAction Continue
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
    Write-Error "[GATE 4 FAILED] Runtime app.env is '$($runtimeConfig['app_env'])', expected 'loadtest'." -ErrorAction Continue
    exit 402
}
if ($runtimeConfig['database_connection'] -ne 'pgsql') {
    Write-Error "[GATE 4 FAILED] Runtime database default is '$($runtimeConfig['database_connection'])', expected 'pgsql'." -ErrorAction Continue
    exit 403
}
if ($runtimeConfig['database_host'] -ne '127.0.0.1') {
    Write-Error "[GATE 4 FAILED] Runtime database host is '$($runtimeConfig['database_host'])', expected '127.0.0.1'." -ErrorAction Continue
    exit 404
}
if ($runtimeConfig['database_port'] -ne '5433') {
    Write-Error "[GATE 4 FAILED] Runtime database port is '$($runtimeConfig['database_port'])', expected '5433'." -ErrorAction Continue
    exit 405
}
if ($runtimeConfig['database_name'] -ne 'edvora_loadtest_isolated') {
    Write-Error "[GATE 4 FAILED] Runtime database name is '$($runtimeConfig['database_name'])', expected 'edvora_loadtest_isolated'." -ErrorAction Continue
    exit 406
}
if ($runtimeConfig['database_username'] -ne 'edvora_loadtest_app') {
    Write-Error "[GATE 4 FAILED] Runtime database username is '$($runtimeConfig['database_username'])', expected 'edvora_loadtest_app'." -ErrorAction Continue
    exit 407
}

Write-Output "[GATE 4 PASSED] Laravel runtime configuration accurately verified without database connection."

# ---------------------------------------------------------
# GATE 5: ACTUAL DATABASE SERVER IDENTITY ASSERTION
# ---------------------------------------------------------
Write-Output "[GATE 5/7] Asserting Live Database Server Identity (Read-Only)..."

$dbIdentity = @{}
if ($MockDbIdentity) {
    $dbIdentity = $MockDbIdentity
} else {
    $pwdFile = "D:\pgsql-loadtest\app_pwd.txt"
    if (-not (Test-Path $pwdFile)) {
        Write-Error "[GATE 5 FAILED] App password file not found: $pwdFile" -ErrorAction Continue
        exit 501
    }
    $appPwd = (Get-Content -Raw $pwdFile).Trim()
    $env:PGPASSWORD = $appPwd
    try {
        $sqlProbe = "SELECT current_database(), current_user, host(inet_server_addr()), inet_server_port()::text;"
        $psqlOut = & "D:\pgsql-loadtest\pgsql17\bin\psql.exe" -h 127.0.0.1 -p 5433 -U edvora_loadtest_app -d edvora_loadtest_isolated -t -A -F "|" -c $sqlProbe 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "[GATE 5 FAILED] Database identity query failed: $psqlOut" -ErrorAction Continue
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
    Write-Error "[GATE 5 FAILED] Live database identity mismatch: '$($dbIdentity['database'])' != 'edvora_loadtest_isolated'." -ErrorAction Continue
    exit 503
}
if ($dbIdentity['user'] -ne 'edvora_loadtest_app') {
    Write-Error "[GATE 5 FAILED] Live user identity mismatch: '$($dbIdentity['user'])' != 'edvora_loadtest_app'." -ErrorAction Continue
    exit 504
}
if ($dbIdentity['server_addr'] -ne '127.0.0.1') {
    Write-Error "[GATE 5 FAILED] Live server address mismatch: '$($dbIdentity['server_addr'])' != '127.0.0.1'." -ErrorAction Continue
    exit 505
}
if ($dbIdentity['server_port'] -ne '5433') {
    Write-Error "[GATE 5 FAILED] Live server port mismatch: '$($dbIdentity['server_port'])' != '5433'." -ErrorAction Continue
    exit 506
}
if ($dbIdentity['data_directory'] -notmatch "^D:/pgsql-loadtest/data") {
    Write-Error "[GATE 5 FAILED] Live data directory mismatch: '$($dbIdentity['data_directory'])'." -ErrorAction Continue
    exit 507
}

Write-Output "[GATE 5 PASSED] Live PostgreSQL identity confirmed on 127.0.0.1:5433 (D:/pgsql-loadtest/data)."

# ---------------------------------------------------------
# GATE 6: DATASET PATH & STORAGE SECURITY GATE
# ---------------------------------------------------------
Write-Output "[GATE 6/7] Validating Dataset Path & Storage Security..."

# Catatan: Penegakan keamanan ACL berkas dataset (hak eksak pengguna: 1245599 / 0x13019F [Read, Write, Delete, Synchronize])
# dan inheritance protection dilakukan secara fail-closed oleh Artisan command (Gate 7).

# 1. Tolak komponen traversal mentah
if ($DatasetPath -match "\.\." -or $DatasetPath -match "\.[\\/]") {
    Write-Error "[GATE 6 FAILED] Dataset path memuat komponen traversal terlarang: $DatasetPath" -ErrorAction Continue
    exit 607
}

# 2. Tolak UNC path
if ($DatasetPath.StartsWith("\\") -or $DatasetPath.StartsWith("//")) {
    Write-Error "[GATE 6 FAILED] Dataset path tidak boleh berupa UNC path: $DatasetPath" -ErrorAction Continue
    exit 608
}

# 3. Tolak Alternate Data Stream (ADS)
if ($DatasetPath.IndexOf(":", 2) -ge 0) {
    Write-Error "[GATE 6 FAILED] Dataset path memuat sintaks Alternate Data Stream (ADS) terlarang: $DatasetPath" -ErrorAction Continue
    exit 609
}

try {
    $normalizedDataset = [System.IO.Path]::GetFullPath($DatasetPath)
} catch {
    Write-Error "[GATE 6 FAILED] Dataset path tidak dapat dinormalisasi: $DatasetPath" -ErrorAction Continue
    exit 601
}

# 4. Verifikasi ulang pasca-normalisasi terhadap UNC dan ADS
if ($normalizedDataset.StartsWith("\\") -or $normalizedDataset.IndexOf(":", 2) -ge 0) {
    Write-Error "[GATE 6 FAILED] Dataset path hasil normalisasi memuat sintaks UNC atau Alternate Data Stream terlarang: $normalizedDataset" -ErrorAction Continue
    exit 609
}

# 5. Tolak jika berada di dalam repository
$normalizedRepo = [System.IO.Path]::GetFullPath($RepoRoot)
if ($normalizedDataset.StartsWith($normalizedRepo, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "[GATE 6 FAILED] Dataset path DILARANG berada di dalam repository ($normalizedDataset)." -ErrorAction Continue
    exit 602
}

# 6. Wajib berada di bawah allowedBaseDir
$normalizedAllowed = [System.IO.Path]::GetFullPath($allowedBaseDir)
if (-not $normalizedDataset.StartsWith($normalizedAllowed, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "[GATE 6 FAILED] Dataset path wajib berada di bawah '$allowedBaseDir' ($normalizedDataset)." -ErrorAction Continue
    exit 603
}

# 7. Wajib berekstensi .json
if (-not $normalizedDataset.EndsWith(".json", [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "[GATE 6 FAILED] File dataset wajib berformat .json ($normalizedDataset)." -ErrorAction Continue
    exit 604
}

# 8. Tolak jika ada komponen path dari root drive sampai target yang merupakan symlink/reparse point/junction (Fail-Closed)
$pathParts = $normalizedDataset.Split([System.IO.Path]::DirectorySeparatorChar)
if ($pathParts.Length -ge 2) {
    $currentComp = $pathParts[0] + "\"
    for ($i = 1; $i -lt $pathParts.Length; $i++) {
        $currentComp = [System.IO.Path]::Combine($currentComp, $pathParts[$i])
        if (Test-Path -LiteralPath $currentComp) {
            try {
                $item = Get-Item -LiteralPath $currentComp -Force -ErrorAction Stop
            } catch {
                Write-Error "[GATE 6 FAILED] Gagal menginspeksi komponen path '$currentComp' secara fail-closed: $_" -ErrorAction Continue
                exit 612
            }
            if (-not $item) {
                Write-Error "[GATE 6 FAILED] Komponen path tidak dapat dibaca: $currentComp" -ErrorAction Continue
                exit 612
            }
            $isReparse = $item.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint) -or ($null -ne $item.LinkType)
            if ($isReparse) {
                Write-Error "[GATE 6 FAILED] Komponen path adalah reparse point / junction / symlink terlarang: $currentComp" -ErrorAction Continue
                exit 611
            }
        }
    }
}

# 9. Fail-closed jika file final sudah ada
if (Test-Path -LiteralPath $normalizedDataset) {
    Write-Error "[GATE 6 FAILED] File dataset final sudah ada: $normalizedDataset. Dilarang menimpa dataset lama." -ErrorAction Continue
    exit 605
}

# 10. Fail-closed jika file sementara residu sudah ada
if ([string]::IsNullOrWhiteSpace($normalizedDataset)) {
    Write-Error "[GATE 6 FAILED] Normalized dataset path tidak boleh kosong." -ErrorAction Continue
    exit 601
}

$datasetDir = [System.IO.Path]::GetDirectoryName($normalizedDataset)
if ([string]::IsNullOrWhiteSpace($datasetDir)) {
    Write-Error "[GATE 6 FAILED] Gagal mendeteksi direktori dataset dari path: $normalizedDataset" -ErrorAction Continue
    exit 601
}

if (Test-Path -LiteralPath $datasetDir) {
    $baseName = [System.IO.Path]::GetFileName($normalizedDataset)
    $tempMatches = Get-ChildItem -Path $datasetDir -Filter "$baseName*.tmp" -ErrorAction SilentlyContinue
    if ($tempMatches -and $tempMatches.Count -gt 0) {
        Write-Error "[GATE 6 FAILED] Residu file sementara terdeteksi: $($tempMatches[0].FullName). Bersihkan manual sebelum melanjutkan." -ErrorAction Continue
        exit 606
    }
}

Write-Output "[GATE 6 PASSED] Dataset path terisolasi di luar repository dan bebas dari konflik file existing."

# ---------------------------------------------------------
# GATE 7: EXECUTION LOCK & ARTISAN SEED INVOCATION
# ---------------------------------------------------------
Write-Output "[GATE 7/7] Checking Execution Authorization Lock..."

$artisanArgs = @("artisan", "loadtest:seed-fixtures", "--env=loadtest", "--stage=$Stage", "--dataset-path=$normalizedDataset")

if ($Mode -eq 'ValidateOnly') {
    Write-Output "[GATE 7 PASSED] Mode is 'ValidateOnly'. Running Artisan command in Dry-Run mode..."
    Write-Output "Command: php artisan loadtest:seed-fixtures --env=loadtest --stage=$Stage --dataset-path=$normalizedDataset (Dry-Run)"
    Write-Output ""

    Push-Location $RepoRoot
    try {
        $dryRunOutput = & "C:\php85\php.exe" @artisanArgs 2>&1
        $dryRunExitCode = $LASTEXITCODE

        $dryRunOutput | ForEach-Object { Write-Output "  $_" }

        if ($dryRunExitCode -ne 0) {
            Write-Error "[VALIDATION FAILED] Dry-run fixture generator exited with error code $dryRunExitCode." -ErrorAction Continue
            exit 701
        }

        Write-Output ""
        Write-Output "[VALIDATE ONLY SUCCESS] All 7 gates and dry-run execution PASSED: Validasi konfigurasi, probe read-only, dan kueri SELECT selesai tanpa mutasi database, tanpa pembuatan/perubahan file, dan tanpa pengubahan ACL."
        exit 0
    } finally {
        Pop-Location
    }
}

if ($Mode -eq 'ExecuteSeed') {
    Write-Output "[GATE 7 PASSED] Execution authorized for fixture seeding."
    $artisanArgs += "--execute"
    Write-Output "[EXECUTION] Invoking Laravel fixture generator: php artisan loadtest:seed-fixtures --env=loadtest --stage=$Stage --dataset-path=$normalizedDataset --execute..."
    Write-Output ""

    Push-Location $RepoRoot
    try {
        $seedOutput = & "C:\php85\php.exe" @artisanArgs 2>&1
        $seedExitCode = $LASTEXITCODE

        $seedOutput | ForEach-Object { Write-Output "  $_" }

        if ($seedExitCode -ne 0) {
            Write-Error "[SEED FAILED] php artisan loadtest:seed-fixtures exited with error code $seedExitCode." -ErrorAction Continue
            exit 702
        }

        Write-Output ""
        Write-Output "[SEED SUCCESS] Fixture seeding completed successfully with exit code 0."
        exit 0
    } finally {
        Pop-Location
    }
}
