# Dokumentasi Automation Load & Performance Testing EDVORA (Grafana k6)

**Penanggung Jawab:** Indah   
**Branch Git:** `test/indah-k6` (Bercabang dari `setup-testing-ade`)  
**Repository:** `https://github.com/EnderKarizzz/edvora-app`  

---

## 1. Ruang Lingkup & Tanggung Jawab Pengujian

Pengujian performa dan beban pada aplikasi web **EDVORA** (Laravel 11 backend & React Inertia.js frontend) dilakukan secara terfokus pada komunikasi protokol HTTP dan API backend menggunakan **Grafana k6**:

| Skenario | Fokus Pengujian | Beban Pengujian (VU) | Target Batas Waktu (SLA) | Endpoint Aktual Backend | File Script |
|---|---|---|---|---|---|
| **Skenario A** | **Batas Waktu Respons Soal (Siswa)**<br>Pemrosesan pengiriman jawaban bersamaan & pengambilan soal berikutnya. | Ramping bertahap hingga **500 VU** | **Maksimal 1.0 detik (1000 ms)** | `POST /latihan/ujian/jawab`<br>`GET /latihan/kerjakan/{sesiId}` | [`tests/k6/scenarios/soal-response-time.js`](scenarios/soal-response-time.js) |
| **Skenario B** | **Beban Dashboard Analitik Editor**<br>Pemuatan ringkasan stok bank soal & agregasi penguasaan siswa. | Ramping bertahap hingga **50 Editor** | **Maksimal 3.0 detik (3000 ms)** | `GET /editor`<br>`GET /editor/analitik` | [`tests/k6/scenarios/editor-analytics-dashboard.js`](scenarios/editor-analytics-dashboard.js) |
| **Master Runner** | Orkestrasi eksekusi seluruh skenario secara terpadu. | Beban Gabungan | SLA masing-masing skenario | Gabungan rute A & B | [`tests/k6/run-all.js`](run-all.js) / [`run-all.ps1`](run-all.ps1) |

---

## 2. Struktur Direktori `tests/k6`

Struktur folder terorganisir rapi dan bebas dari file sementara atau kredensial rahasia:

```text
tests/k6/
├── config/
│   └── environment.js                 # URL base, konfigurasi stages 500 VU, SLA (tanpa hardcoded password)
├── helpers/
│   └── auth.js                        # Helper autentikasi ketat, pengelolaan cookie jar per-VU, XSRF token
├── scenarios/
│   ├── soal-response-time.js          # Script Skenario A (Siswa: Jawab Soal & Ambil Soal Berikutnya)
│   └── editor-analytics-dashboard.js  # Script Skenario B (Editor: Dashboard Stok & Analitik Penguasaan)
├── reports/
│   ├── output-skenario-a-soal.txt     # Log output asli eksekusi terminal k6 Skenario A
│   ├── output-skenario-b-editor.txt   # Log output asli eksekusi terminal k6 Skenario B
│   ├── summary-skenario-a-soal.json   # Export raw metrics JSON k6 Skenario A
│   ├── summary-skenario-b-editor.json # Export raw metrics JSON k6 Skenario B
│   ├── screenshot-skenario-a.png      # Screenshot PNG bukti eksekusi Skenario A
│   ├── screenshot-skenario-b.png      # Screenshot PNG bukti eksekusi Skenario B
│   ├── LAPORAN_LOAD_TESTING_EDVORA.md # Dokumen laporan resmi versi Markdown (15 Bagian)
│   └── LAPORAN_LOAD_TESTING_EDVORA.pdf# Dokumen laporan resmi versi PDF (15 Bagian)
├── scripts/
│   └── generate_pdf_report.py         # Generator laporan resmi PDF berbasis ReportLab
├── run-all.js                         # Master runner k6 JavaScript
├── run-all.ps1                        # Runner PowerShell Windows
└── README.md                          # Panduan teknis eksekusi dan analisis pengujian
```

---

## 3. Persyaratan & Instalasi Tools

1. **Grafana k6:**
   * Unduh binary k6 untuk Windows dari [official releases k6](https://github.com/grafana/k6/releases).
   * Letakkan executable di `tools/k6/k6.exe` atau tambahkan folder instalasi k6 ke `PATH` Windows.
2. **Runtime Backend EDVORA:**
   * Pastikan server Laravel aktif di port 8000:
     ```powershell
     php artisan serve --host=127.0.0.1 --port=8000
     ```

---

## 4. Konfigurasi Keamanan & Environment Variables

Untuk mematuhi standar keamanan pengujian:
* **Tidak ada kredensial atau password yang di-hardcode** di dalam seluruh script pengujian.
* Kredensial disuplai saat runtime menggunakan argumen `-e` k6:
  * `-e BASE_URL=http://127.0.0.1:8000`
  * `-e SISWA_EMAIL=sim001@simulasi.test`
  * `-e SISWA_PASSWORD=<password_siswa>`
  * `-e EDITOR_EMAIL=dapa@gmail.com`
  * `-e EDITOR_PASSWORD=<password_editor>`
* Seluruh file kredensial lokal (`.env`), binary executable (`tools/`, `k6.exe`), dan artefak sementara (`*.tmp`, `*.session`, `*.cookie`) telah diabaikan secara formal melalui `.gitignore` di root repositori.

---

## 5. Cara Menjalankan Pengujian (Perintah Terminal Windows)

Jalankan perintah dari **root repository** (`d:\edvora-app`):

### A. Uji Cepat Fungsional (Smoke Test)
Untuk memvalidasi fungsionalitas script secara cepat tanpa membebani server:
```powershell
.\tools\k6\k6.exe run --vus 2 --duration 10s -e SISWA_EMAIL=sim001@simulasi.test -e SISWA_PASSWORD=$env:SISWA_PASSWORD tests\k6\scenarios\soal-response-time.js
```

### B. Menjalankan Skenario A (Pengujian Beban Hingga 500 VU)
Jalankan script **tanpa parameter `--vus` atau `--duration` di CLI** agar k6 mengeksekusi tahapan beban bertahap hingga 500 VU sesuai konfigurasi `options.stages`:
```powershell
.\tools\k6\k6.exe run -e SISWA_EMAIL=sim001@simulasi.test -e SISWA_PASSWORD=$env:SISWA_PASSWORD --summary-export tests\k6\reports\summary-skenario-a-soal.json tests\k6\scenarios\soal-response-time.js 2>&1 | Tee-Object -FilePath tests\k6\reports\output-skenario-a-soal.txt
```

### C. Menjalankan Skenario B (Beban Dashboard Analitik Editor)
Jalankan pengujian beban Editor (tahapan 10 s.d. 50 Editor konkuren):
```powershell
.\tools\k6\k6.exe run -e EDITOR_EMAIL=dapa@gmail.com -e EDITOR_PASSWORD=$env:EDITOR_PASSWORD --summary-export tests\k6\reports\summary-skenario-b-editor.json tests\k6\scenarios\editor-analytics-dashboard.js 2>&1 | Tee-Object -FilePath tests\k6\reports\output-skenario-b-editor.txt
```

### D. Menjalankan Seluruh Pengujian Secara Berurutan
Gunakan runner PowerShell yang disediakan:
```powershell
powershell -ExecutionPolicy Bypass -File tests\k6\run-all.ps1
```
Atau menggunakan runner master k6:
```powershell
.\tools\k6\k6.exe run -e SISWA_EMAIL=sim001@simulasi.test -e SISWA_PASSWORD=$env:SISWA_PASSWORD -e EDITOR_EMAIL=dapa@gmail.com -e EDITOR_PASSWORD=$env:EDITOR_PASSWORD tests\k6\run-all.js
```

---

## 6. Penjelasan Metrik dan Ambang Batas (Thresholds)

| Metrik k6 | Deskripsi Pengukuran | Target SLA |
|---|---|---|
| `waktu_pengiriman_jawaban` | Waktu respons server saat siswa mengirim jawaban (`POST /latihan/ujian/jawab`) secara terpisah. | `p(95) < 1000 ms`, `max < 1000 ms` |
| `waktu_ambil_soal_berikutnya` | Waktu pengambilan atau pemunculan soal berikutnya (`GET /latihan/kerjakan/{sesiId}`) secara terpisah. | `p(95) < 1000 ms`, `max < 1000 ms` |
| `waktu_dashboard_stok_editor` | Waktu pemuatan ringkasan stok bank soal per subtes (`GET /editor`). | `p(95) < 3000 ms`, `max < 3000 ms` |
| `waktu_dashboard_analitik` | Waktu pemuatan dashboard analitik agregasi stok & penguasaan siswa (`GET /editor/analitik`). | `p(95) < 3000 ms`, `max < 3000 ms` |
| `http_req_failed` | Tingkat kegagalan request HTTP. | `< 1%` |

> **Prinsip Pemisahan Metrik:**  
> Waktu proses autentikasi (login) **diisolasi dan tidak dicampur** ke dalam metrik `waktu_pengiriman_jawaban` atau `waktu_dashboard_analitik`.

---

## 7. Hasil Pengujian Aktual (Ringkasan Metrik)

Berdasarkan eksekusi pengujian dengan konfigurasi beban bertahap (puncak 500 VU untuk Skenario A, puncak 50 VU untuk Skenario B):

| Parameter Metrik | Skenario A (Siswa — Soal) | Skenario B (Editor — Dashboard) |
|---|---|---|
| **Puncak Virtual Users (VU)** | **500 VU** (Ramping stages) | **50 VU** (Ramping stages) |
| **Total Permintaan HTTP** | **836 requests** | **114 requests** |
| **Throughput (RPS)** | **7,68 req/s** | **1,49 req/s** |
| **Total Iterasi Lengkap** | **2.123 iterasi** | **11 iterasi** |
| **Average Response Time (Utama)** | Jawab: **33.465,05 ms** \| Ambil: **33.632,90 ms** | Stok: **13.223,32 ms** \| Analitik: **14.110,23 ms** |
| **Median Response Time (Utama)** | Jawab: **35.530,35 ms** \| Ambil: **33.632,90 ms** | Stok: **12.713,12 ms** \| Analitik: **9.759,16 ms** |
| **Minimum Response Time** | Jawab: **5.840,77 ms** \| Ambil: **12.574,43 ms** | Stok: **942,40 ms** \| Analitik: **1.594,25 ms** |
| **90th Percentile (p90)** | Jawab: **48.604,20 ms** \| Ambil: **50.479,67 ms** | Stok: **25.386,10 ms** \| Analitik: **25.569,08 ms** |
| **95th Percentile (p95)** | Jawab: **49.080,13 ms** \| Ambil: **52.585,52 ms** | Stok: **26.408,22 ms** \| Analitik: **26.580,68 ms** |
| **Maximum Response Time** | Jawab: **49.556,07 ms** \| Ambil: **54.691,37 ms** | Stok: **27.629,54 ms** \| Analitik: **27.592,27 ms** |
| **Jumlah Sampel Utama** | Jawab: **9 respons** \| Ambil: **2 respons** | Stok: **17 respons** \| Analitik: **11 respons** |
| **Success Rate Bisnis** | **8,82%** (9 jawaban berhasil diproses) | **100,00%** (11 kunjungan dashboard sukses) |
| **HTTP Req Failed Rate** | **63,28%** (529 gagal karena socket backlog) | **0,00%** (0 request gagal) |
| **Checks Passing Rate** | **56,22%** (1.179 / 2.097 checks) | **92,08%** (279 / 303 checks) |
| **Target Batas Waktu (SLA)** | **≤ 1.0 detik (1000 ms)** per request | **≤ 3.0 detik (3000 ms)** per request |
| **Status Evaluasi SLA Akhir** | **FAIL (Exceeded SLA under load)** | **FAIL (Exceeded SLA under load)** |

---

## 8. Laporan Status Aktual & Analisis Titik Jenuh Server

* **Autentikasi & Otorisasi:**  
  Helper autentikasi (`helpers/auth.js`) memvalidasi session dan cookie secara ketat. Kredensial Siswa (`sim001@simulasi.test`) dan Editor (`dapa@gmail.com`) 100% valid dan berhasil melewati gerbang autentikasi.
* **Proses Bisnis Terverifikasi:**  
  Skenario A berhasil mengirim jawaban riil dan dinilai oleh backend Laravel (`SesiFleksibel::jawab`), dan Skenario B berhasil memuat stok subtes dan analitik penguasaan siswa.
* **Penyebab Evaluasi FAIL:**  
  Sesuai prinsip kejujuran teknis QA Automation, hasil dilaporkan secara transparan sebagai **FAIL** karena waktu respons melampaui SLA di bawah beban tinggi (500 VU dan 50 VU). Hal ini disebabkan oleh arsitektur *single-threaded* PHP built-in development server (`php artisan serve`) yang memproses request secara sekuensial dan menyebabkan antrean TCP socket backlog, ditambah latensi jaringan ke database online Supabase di Singapura (~150-250 ms roundtrip).
* **Rekomendasi Lingkungan Produksi:**  
  Untuk mencapai SLA ≤ 1s dan ≤ 3s di lingkungan produksi, disarankan menggunakan web server multi-worker seperti **Nginx + PHP-FPM** (dengan `pm.max_children >= 500`) atau **Laravel Octane** (FrankenPHP/Swoole), serta mengaktifkan Redis caching untuk endpoint agregasi analitik.
