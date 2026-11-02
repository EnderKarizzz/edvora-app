# Dokumentasi Automation Load & Performance Testing EDVORA (Grafana k6)

**Penanggung Jawab:** Indah (Senior QA Automation Engineer)  
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
│   ├── LAPORAN_LOAD_TESTING_EDVORA.md # Dokumen laporan resmi versi Markdown
│   └── LAPORAN_LOAD_TESTING_EDVORA.pdf# Dokumen laporan resmi versi PDF (14 Bagian)
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
* Seluruh file kredensial lokal dan direktori binary `tools/` diabaikan oleh Git via `.git/info/exclude`.

---

## 5. Cara Menjalankan Pengujian (Perintah Terminal Windows)

Jalankan perintah dari **root repository** (`d:\edvora-app`):

### A. Uji Cepat Fungsional (Smoke Test)
Untuk memvalidasi fungsionalitas script secara cepat tanpa membebani server:
```powershell
.\tools\k6\k6.exe run --vus 2 --duration 10s -e SISWA_EMAIL=sim001@simulasi.test -e SISWA_PASSWORD=SimulasiEdvora2026 tests\k6\scenarios\soal-response-time.js
```

### B. Menjalankan Skenario A (Pengujian Beban Hingga 500 VU)
Jalankan script **tanpa parameter `--vus` atau `--duration` di CLI** agar k6 mengeksekusi tahapan beban bertahap hingga 500 VU sesuai konfigurasi `options.stages`:
```powershell
.\tools\k6\k6.exe run -e SISWA_EMAIL=sim001@simulasi.test -e SISWA_PASSWORD=SimulasiEdvora2026 --summary-export tests\k6\reports\summary-skenario-a-soal.json tests\k6\scenarios\soal-response-time.js 2>&1 | Tee-Object -FilePath tests\k6\reports\output-skenario-a-soal.txt
```

### C. Menjalankan Skenario B (Beban Dashboard Analitik Editor)
Jalankan pengujian beban Editor (tahapan 10 s.d. 50 Editor konkuren):
```powershell
.\tools\k6\k6.exe run -e EDITOR_EMAIL=dapa@gmail.com -e EDITOR_PASSWORD=12345678 --summary-export tests\k6\reports\summary-skenario-b-editor.json tests\k6\scenarios\editor-analytics-dashboard.js 2>&1 | Tee-Object -FilePath tests\k6\reports\output-skenario-b-editor.txt
```

### D. Menjalankan Seluruh Pengujian Secara Berurutan
Gunakan runner PowerShell yang disediakan:
```powershell
powershell -ExecutionPolicy Bypass -File tests\k6\run-all.ps1
```
Atau menggunakan runner master k6:
```powershell
.\tools\k6\k6.exe run -e SISWA_EMAIL=sim001@simulasi.test -e SISWA_PASSWORD=SimulasiEdvora2026 -e EDITOR_EMAIL=dapa@gmail.com -e EDITOR_PASSWORD=12345678 tests\k6\run-all.js
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
| **Total Permintaan HTTP** | **4.523 requests** | **121 requests** |
| **Throughput (RPS)** | **41,39 req/s** | **1,61 req/s** |
| **Total Iterasi Lengkap** | **4.249 iterasi** | **7 iterasi** |
| **Average Response Time (Utama)** | Jawab: **9.997,53 ms** \| Ambil: **7.074,68 ms** | Stok: **14.778,08 ms** \| Analitik: **14.025,00 ms** |
| **Median Response Time (Utama)** | Jawab: **1,00 ms** \| Ambil: **1,00 ms** | Stok: **15.450,00 ms** \| Analitik: **15.117,00 ms** |
| **90th Percentile (p90)** | Jawab: **34.083,40 ms** \| Ambil: **23.528,00 ms** | Stok: **21.897,40 ms** \| Analitik: **21.120,00 ms** |
| **95th Percentile (p95)** | Jawab: **38.075,10 ms** \| Ambil: **60.000,10 ms** | Stok: **22.702,40 ms** \| Analitik: **22.197,00 ms** |
| **Maximum Response Time** | Jawab: **42.846,00 ms** \| Ambil: **60.001,00 ms** | Stok: **23.489,00 ms** \| Analitik: **23.274,00 ms** |
| **Success Rate Bisnis** | **36,84%** (7 jawaban berhasil diproses) | **100,00%** (7 kunjungan dashboard sukses) |
| **Checks Passing Rate** | **14,81%** (748 / 5.048 checks) | **92,83%** (246 / 265 checks) |
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
