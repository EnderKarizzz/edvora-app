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

| Parameter Metrik | Skenario A (Siswa - Puncak 500 VU) | Skenario B (Editor - Puncak 50 VU) |
|---|---|---|
| **Total Permintaan HTTP** | 6.360 requests | 1.415 requests |
| **Throughput (RPS)** | 73,98 req/s | 22,90 req/s |
| **Total Iterasi Lengkap** | 4.146 iterasi | 707 iterasi |
| **Average Response Time (Avg)** | 1.356,37 ms (1,36 s) | 87,59 ms (0,088 s) |
| **Median Response Time (Med)** | 454,82 ms | 33,08 ms |
| **90th Percentile (p90)** | 3.727,60 ms | 237,98 ms |
| **95th Percentile (p95)** | 4.144,29 ms | 313,65 ms *(Memenuhi target SLA ≤ 3s)* |
| **Maximum Response Time (Max)** | 6.314,66 ms | 3.901,08 ms |
| **Checks Passing Rate** | 45,24% (4.879 / 10.785) | 50,00% (1.414 / 2.828) |
| **Sampel Endpoint Utama** | 0 sampel (Tertahan di Auth 422) | 0 sampel (Tertahan di Auth 422) |
| **Status Evaluasi** | **BLOCKED** | **BLOCKED** |

---

## 8. Laporan Status Aktual & Aturan Database Bersama

* **Status Autentikasi:**  
  Helper autentikasi (`helpers/auth.js`) menerapkan validasi ketat dan menolak status 401, 410, 419, dan 422 sebagai keberhasilan.
* **Kendala Database Bersama Saat Ini:**  
  Berdasarkan inspeksi langsung ke database PostgreSQL Supabase bersama, tabel `users` hanya memuat 2 akun personal pengembang dan belum memiliki data akun resmi `sim001@simulasi.test` maupun `dapa@gmail.com`. Akibatnya, Laravel mengembalikan status **HTTP 422 Unprocessable Entity** (*"These credentials do not match our records"*).
* **Kepatuhan Mutlak:**  
  Sesuai aturan #5 dan #10, tim penguji **DILARANG** menjalankan `php artisan migrate`, `migrate:fresh`, maupun seeding di database bersama. Oleh karena itu, hasil pengujian dicatat secara objektif sebagai **BLOCKED** tanpa manipulasi data.
