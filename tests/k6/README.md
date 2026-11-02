# Dokumentasi Automation Load & Performance Testing EDVORA (Grafana k6)

**Penanggung Jawab:** Indah (Senior QA Automation Engineer)  
**Branch Pekerjaan:** `test/indah-k6`  
**Repository:** `https://github.com/EnderKarizzz/edvora-app`  

---

## 1. Ruang Lingkup & Tanggung Jawab Pengujian

Pengujian performa dan beban pada proyek EDVORA dibagi secara modular sesuai batasan tugas Indah:

| Skenario | Fokus Pengujian | Target Beban (VU) | Target Batas Waktu (SLA) | Endpoint Aktual Backend | File Script |
|---|---|---|---|---|---|
| **Skenario A** | **Batas Waktu Respons Soal (Siswa)**<br>Pemrosesan pengiriman jawaban bersamaan & pengambilan soal berikutnya. | Ramping hingga **500 VU** | **Maksimal 1.0 detik (1000 ms)** | `POST /latihan/ujian/jawab`<br>`GET /latihan/kerjakan/{sesiId}` | `tests/k6/scenarios/soal-response-time.js` |
| **Skenario B** | **Beban Dashboard Analitik Editor**<br>Pemuatan ringkasan stok bank soal & pemetaan rata-rata penguasaan siswa. | Ramping hingga **50 Editor** | **Maksimal 3.0 detik (3000 ms)** | `GET /editor`<br>`GET /editor/analitik` | `tests/k6/scenarios/editor-analytics-dashboard.js` |
| **Master Runner** | Orkestrasi eksekusi seluruh skenario secara terpadu. | Beban Gabungan | SLA masing-masing skenario | Gabungan rute A & B | `tests/k6/run-all.js` |

---

## 2. Struktur Direktori `tests/k6`

```text
tests/k6/
├── config/
│   └── environment.js                 # URL base, konfigurasi stages 500 VU, SLA (tanpa hardcoded password)
├── helpers/
│   └── auth.js                        # Helper autentikasi ketat, pengelolaan cookie jar per-VU, XSRF token
├── scenarios/
│   ├── soal-response-time.js          # Script Skenario A (Siswa: Jawab Soal & Ambil Soal Berikutnya)
│   └── editor-analytics-dashboard.js  # Script Skenario B (Editor: Dashboard Stok & Analitik Penguasaan)
├── run-all.js                         # Master runner gabungan kedua skenario
├── README.md                          # Panduan teknis eksekusi dan analisis pengujian
└── reports/
    ├── output-skenario-a-soal.txt     # Log output asli eksekusi terminal k6 Skenario A
    ├── output-skenario-b-editor.txt   # Log output asli eksekusi terminal k6 Skenario B
    ├── summary-skenario-a-soal.json   # Export raw metrics JSON k6 Skenario A
    ├── summary-skenario-b-editor.json # Export raw metrics JSON k6 Skenario B
    ├── screenshot-skenario-a.png      # Screenshot PNG bukti eksekusi Skenario A
    ├── screenshot-skenario-b.png      # Screenshot PNG bukti eksekusi Skenario B
    └── LAPORAN_LOAD_TESTING_EDVORA.pdf# Laporan resmi performa (PDF)
```

---

## 3. Konfigurasi Keamanan & Environment Variables

Untuk mematuhi standar keamanan pengujian:
* **Tidak ada kata sandi yang di-hardcode** di dalam `environment.js` maupun file script testing.
* Kredensial disuplai saat runtime menggunakan argumen `-e` k6:
  * `-e SISWA_EMAIL=... -e SISWA_PASSWORD=...`
  * `-e EDITOR_EMAIL=... -e EDITOR_PASSWORD=...`
  * `-e BASE_URL=http://127.0.0.1:8000`
* File kredensial lokal dan file binary `tools/` diabaikan oleh Git via `.git/info/exclude`.

---

## 4. Cara Menjalankan Pengujian (Perintah Terminal)

Jalankan perintah dari **root repository** (`d:\edvora-app`):

### A. Menjalankan Skenario A (Pengujian Beban Hingga 500 VU)
Jalankan script **tanpa menimpa stages** agar k6 mengeksekusi tahapan bertahap hingga 500 Virtual Users sesuai konfigurasi `options.stages`:
```powershell
.\tools\k6\k6.exe run -e SISWA_EMAIL=sim001@simulasi.test -e SISWA_PASSWORD=SimulasiEdvora2026 --summary-export tests\k6\reports\summary-skenario-a-soal.json tests\k6\scenarios\soal-response-time.js
```

### B. Menjalankan Skenario B (Beban Dashboard Analitik Editor)
Jalankan pengujian beban Editor (10 s.d. 50 Editor konkuren):
```powershell
.\tools\k6\k6.exe run -e EDITOR_EMAIL=dapa@gmail.com -e EDITOR_PASSWORD=12345678 --summary-export tests\k6\reports\summary-skenario-b-editor.json tests\k6\scenarios\editor-analytics-dashboard.js
```

### C. Menjalankan Master Runner Gabungan
```powershell
.\tools\k6\k6.exe run -e SISWA_EMAIL=sim001@simulasi.test -e SISWA_PASSWORD=SimulasiEdvora2026 -e EDITOR_EMAIL=dapa@gmail.com -e EDITOR_PASSWORD=12345678 tests\k6\run-all.js
```

---

## 5. Metrik yang Diukur dan Ambang Batas (Thresholds)

| Metrik k6 | Deskripsi Pengukuran | Target SLA |
|---|---|---|
| `waktu_pengiriman_jawaban` | Waktu pemrosesan server saat siswa mengirim jawaban (`POST /latihan/ujian/jawab`) secara terpisah. | `p(95) < 1000 ms`, `max < 1000 ms` |
| `waktu_ambil_soal_berikutnya` | Waktu pengambilan atau pemunculan soal berikutnya secara terpisah. | `p(95) < 1000 ms`, `max < 1000 ms` |
| `waktu_dashboard_stok_editor` | Waktu pemuatan dashboard stok bank soal per subtes (`GET /editor`). | `p(95) < 3000 ms`, `max < 3000 ms` |
| `waktu_dashboard_analitik` | Waktu pemuatan dashboard analitik agregasi stok & penguasaan siswa (`GET /editor/analitik`). | `p(95) < 3000 ms`, `max < 3000 ms` |
| `http_req_failed` | Tingkat kegagalan request HTTP. | `< 1%` |

> **Catatan Pemisahan Waktu:**  
> Waktu proses autentikasi (login) **diisolasi dan tidak digabungkan** ke dalam metrik `waktu_pengiriman_jawaban` atau `waktu_dashboard_analitik`.

---

## 6. Hasil Pengujian Aktual (Ringkasan Metrik)

Berdasarkan eksekusi pengujian terbaru dengan konfigurasi beban bertahap (500 VU untuk Skenario A, 50 VU untuk Skenario B):

| Parameter Metrik | Skenario A (Siswa - Puncak 500 VU) | Skenario B (Editor - Puncak 50 VU) |
|---|---|---|
| **Total Permintaan HTTP** | 6,360 requests | 1,415 requests |
| **Throughput (RPS)** | 73.98 req/s | 22.90 req/s |
| **Total Iterasi Lengkap** | 4,146 iterasi | 707 iterasi |
| **Average Response Time (Avg)** | 1,356.37 ms (1.36 s) | 87.59 ms (0.088 s) |
| **Median Response Time (Med)** | 454.82 ms | 33.08 ms |
| **90th Percentile (p90)** | 3,727.60 ms | 237.98 ms |
| **95th Percentile (p95)** | 4,144.29 ms | 313.65 ms *(Memenuhi target SLA ≤ 3s)* |
| **Maximum Response Time (Max)** | 6,314.66 ms | 3,901.08 ms |
| **Checks Passing Rate** | 45.24% (4,879 / 10,785) | 50.00% (1,414 / 2,828) |
| **Status Thresholds** | FAIL (Auth 422 & TCP saturation) | FAIL (Auth 422) |

---

## 7. Laporan Status Aktual & Kendala Database Bersama

* **Status Autentikasi:**  
  Helper autentikasi (`helpers/auth.js`) menerapkan validasi ketat dan **menolak** status 401, 410, 419, dan 422 sebagai keberhasilan.
* **Kendala Database Bersama Saat Ini:**  
  Berdasarkan inspeksi langsung ke database PostgreSQL Supabase bersama, seluruh tabel saat ini dalam kondisi kosong (0 records) akibat migrasi ulang skema oleh anggota tim lain (commit `dc33f43`). Akun `sim001@simulasi.test` dan `dapa@gmail.com` belum terdaftar di database online sehingga mengembalikan HTTP 422 (*"These credentials do not match our records"*).
* **Kepatuhan Aturan Database Bersama:**  
  Sesuai aturan ketat #5 dan #10, penguji **DILARANG** menjalankan `php artisan migrate`, `migrate:fresh`, maupun seeding di database bersama. Oleh karena itu, laporan pengujian mencatat status kegagalan otentikasi ini secara jujur apa adanya tanpa manipulasi hasil.
* **Kapasitas Concurrency:**  
  PHP built-in server (`php artisan serve`) beroperasi secara *single-threaded*, sehingga mengalami penolakan koneksi (*connection refused*) ketika beban melonjak hingga 500 VU. Di lingkungan produksi/staging, disarankan menggunakan Nginx + PHP-FPM multi-worker atau Laravel Octane.
