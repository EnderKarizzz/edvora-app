# Runner PowerShell Pengujian Otomasi Beban EDVORA (Grafana k6)
# Penanggung Jawab: Indah (Senior QA Automation Engineer)
# 
# PANDUAN PENGGUNAAN:
# Kredensial disuplai via parameter CLI atau Environment Variables Windows:
#   $env:SISWA_EMAIL = "siswa@example.test"
#   $env:SISWA_PASSWORD = "PasswordSiswa"
#   $env:EDITOR_EMAIL = "editor@example.test"
#   $env:EDITOR_PASSWORD = "PasswordEditor"
#   .\tests\k6\run-all.ps1

param (
    [string]$BaseUrl = $(if ($env:BASE_URL) { $env:BASE_URL } else { "http://127.0.0.1:8000" }),
    [string]$SiswaEmail = $(if ($env:SISWA_EMAIL) { $env:SISWA_EMAIL } else { "" }),
    [string]$SiswaPassword = $(if ($env:SISWA_PASSWORD) { $env:SISWA_PASSWORD } else { "" }),
    [string]$EditorEmail = $(if ($env:EDITOR_EMAIL) { $env:EDITOR_EMAIL } else { "" }),
    [string]$EditorPassword = $(if ($env:EDITOR_PASSWORD) { $env:EDITOR_PASSWORD } else { "" }),
    [string]$SesiId = $(if ($env:SESI_ID) { $env:SESI_ID } else { "" }),
    [string]$SoalId = $(if ($env:SOAL_ID) { $env:SOAL_ID } else { "" })
)

$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " MEMULAI AUTOMATION LOAD TESTING EDVORA (GRAFANA k6)     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Base URL       : $BaseUrl"
Write-Host "Akun Siswa     : $(if ($SiswaEmail) { $SiswaEmail } else { '[TIDAK DISET]' })"
Write-Host "Akun Editor    : $(if ($EditorEmail) { $EditorEmail } else { '[TIDAK DISET]' })"
Write-Host ""

# Validasi Variabel Wajib
if (-not $SiswaEmail -or -not $SiswaPassword) {
    Write-Host "[ERROR] Konfigurasi kredensial Siswa belum ditentukan!" -ForegroundColor Red
    Write-Host "Harap tentukan melalui parameter atau environment variables:" -ForegroundColor Yellow
    Write-Host "  `$env:SISWA_EMAIL = 'siswa@example.test'" -ForegroundColor Yellow
    Write-Host "  `$env:SISWA_PASSWORD = 'password_siswa'" -ForegroundColor Yellow
    exit 1
}

if (-not $EditorEmail -or -not $EditorPassword) {
    Write-Host "[ERROR] Konfigurasi kredensial Editor belum ditentukan!" -ForegroundColor Red
    Write-Host "Harap tentukan melalui parameter atau environment variables:" -ForegroundColor Yellow
    Write-Host "  `$env:EDITOR_EMAIL = 'editor@example.test'" -ForegroundColor Yellow
    Write-Host "  `$env:EDITOR_PASSWORD = 'password_editor'" -ForegroundColor Yellow
    exit 1
}

$k6Bin = ".\tools\k6\k6.exe"
if (-not (Test-Path $k6Bin)) {
    $k6Bin = "k6"
}

# Verifikasi direktori reports
$reportDir = "tests\k6\reports"
if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$exitStatusOverall = 0

# 1. Eksekusi Skenario A: Waktu Respons Soal (Siswa - Ramping hingga 500 VU)
Write-Host "[1/2] Menjalankan Skenario A: Respons Soal Siswa (Ramping stages hingga 500 VU)..." -ForegroundColor Yellow
$cmdA = @(
    "run",
    "-e", "BASE_URL=$BaseUrl",
    "-e", "SISWA_EMAIL=$SiswaEmail",
    "-e", "SISWA_PASSWORD=$SiswaPassword"
)
if ($SesiId) { $cmdA += @("-e", "SESI_ID=$SesiId") }
if ($SoalId) { $cmdA += @("-e", "SOAL_ID=$SoalId") }
$cmdA += @(
    "--summary-export", "tests\k6\reports\summary-skenario-a-soal.json",
    "tests\k6\scenarios\soal-response-time.js"
)

& $k6Bin @cmdA 2>&1 | Tee-Object -FilePath "tests\k6\reports\output-skenario-a-soal.txt"
$exitCodeA = $LASTEXITCODE

if ($exitCodeA -ne 0) {
    Write-Host "[PERINGATAN] Skenario A selesai dengan Exit Code $exitCodeA (Threshold Crossed / Terjadi Evaluasi FAIL)" -ForegroundColor Yellow
    $exitStatusOverall = 1
} else {
    Write-Host "[SUKSES] Skenario A selesai dengan Exit Code 0 (Seluruh ambang batas terpenuhi)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Jeda pendinginan antrean socket server sebelum menjalankan Skenario B..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# 2. Eksekusi Skenario B: Beban Dashboard Analitik Editor (Ramping hingga 50 VU)
Write-Host "[2/2] Menjalankan Skenario B: Dashboard Analitik Editor (Ramping stages hingga 50 VU)..." -ForegroundColor Yellow
$cmdB = @(
    "run",
    "-e", "BASE_URL=$BaseUrl",
    "-e", "EDITOR_EMAIL=$EditorEmail",
    "-e", "EDITOR_PASSWORD=$EditorPassword",
    "--summary-export", "tests\k6\reports\summary-skenario-b-editor.json",
    "tests\k6\scenarios\editor-analytics-dashboard.js"
)

& $k6Bin @cmdB 2>&1 | Tee-Object -FilePath "tests\k6\reports\output-skenario-b-editor.txt"
$exitCodeB = $LASTEXITCODE

if ($exitCodeB -ne 0) {
    Write-Host "[PERINGATAN] Skenario B selesai dengan Exit Code $exitCodeB (Threshold Crossed / Terjadi Evaluasi FAIL)" -ForegroundColor Yellow
    $exitStatusOverall = 1
} else {
    Write-Host "[SUKSES] Skenario B selesai dengan Exit Code 0 (Seluruh ambang batas terpenuhi)" -ForegroundColor Green
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor $(if ($exitStatusOverall -eq 0) { "Green" } else { "Yellow" })
Write-Host " SELURUH PENGUJIAN SELESAI DIEKSEKUSI                     " -ForegroundColor $(if ($exitStatusOverall -eq 0) { "Green" } else { "Yellow" })
Write-Host " Status Akhir  : $(if ($exitStatusOverall -eq 0) { 'PASS (Semua Threshold Terpenuhi)' } else { 'EVALUATED (Ada Threshold Melampaui Batas SLA)' })" -ForegroundColor $(if ($exitStatusOverall -eq 0) { "Green" } else { "Yellow" })
Write-Host " Output Berkas : tests\k6\reports\                        " -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor $(if ($exitStatusOverall -eq 0) { "Green" } else { "Yellow" })

exit $exitStatusOverall
