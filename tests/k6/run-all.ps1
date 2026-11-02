# Runner PowerShell Pengujian Otomasi Beban EDVORA (Grafana k6)
# Penanggung Jawab: Indah (Load & Performance Testing)

param (
    [string]$BaseUrl = "http://127.0.0.1:8000",
    [string]$SiswaEmail = "sim001@simulasi.test",
    [string]$SiswaPassword = "SimulasiEdvora2026",
    [string]$EditorEmail = "dapa@gmail.com",
    [string]$EditorPassword = "12345678"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " MEMULAI AUTOMATION LOAD TESTING EDVORA (GRAFANA k6)     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Base URL       : $BaseUrl"
Write-Host "Akun Siswa     : $SiswaEmail"
Write-Host "Akun Editor    : $EditorEmail"
Write-Host ""

$k6Bin = ".\tools\k6\k6.exe"
if (-not (Test-Path $k6Bin)) {
    $k6Bin = "k6"
}

# 1. Eksekusi Skenario A: Waktu Respons Soal (Siswa - 500 VU)
Write-Host "[1/2] Menjalankan Skenario A: Respons Soal Siswa (Ramping stages hingga 500 VU)..." -ForegroundColor Yellow
& $k6Bin run `
    -e BASE_URL=$BaseUrl `
    -e SISWA_EMAIL=$SiswaEmail `
    -e SISWA_PASSWORD=$SiswaPassword `
    --summary-export tests\k6\reports\summary-skenario-a-soal.json `
    tests\k6\scenarios\soal-response-time.js 2>&1 | Tee-Object -FilePath tests\k6\reports\output-skenario-a-soal.txt

Write-Host ""

# 2. Eksekusi Skenario B: Beban Dashboard Analitik Editor (50 VU)
Write-Host "[2/2] Menjalankan Skenario B: Dashboard Analitik Editor (Ramping stages hingga 50 VU)..." -ForegroundColor Yellow
& $k6Bin run `
    -e BASE_URL=$BaseUrl `
    -e EDITOR_EMAIL=$EditorEmail `
    -e EDITOR_PASSWORD=$EditorPassword `
    --summary-export tests\k6\reports\summary-skenario-b-editor.json `
    tests\k6\scenarios\editor-analytics-dashboard.js 2>&1 | Tee-Object -FilePath tests\k6\reports\output-skenario-b-editor.txt

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " SELURUH PENGUJIAN SELESAI DIEKSEKUSI                     " -ForegroundColor Green
Write-Host " Output tersimpan di: tests\k6\reports\                   " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

