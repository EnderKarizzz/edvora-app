# LAPORAN RESMI AUTOMATION LOAD & PERFORMANCE TESTING EDVORA
**Aplikasi Web Berbasis Laravel 11 & React (Inertia.js)**

* **Penanggung Jawab Pengujian:** Indah (Senior QA Automation Engineer)
* **Fokus Pengujian:** Load Testing & Performance Testing menggunakan Grafana k6
* **Branch Git Pekerjaan:** `test/indah-k6` (Bercabang dari `setup-testing-ade`)
* **Repository:** `https://github.com/EnderKarizzz/edvora-app`
* **Waktu Pelaksanaan Aktual:** 3 November 2026

---

## 1. PENDAHULUAN

Aplikasi **EDVORA** adalah platform simulasi ujian dan latihan soal UTBK berbasis web dengan arsitektur modern yang memadukan backend framework **Laravel 11** dan frontend reaktif **React (Inertia.js)**. Laporan ini disusun oleh Indah selaku Senior QA Automation Engineer untuk mengevaluasi secara objektif kesiapan server backend dalam menghadapi akses massal secara simultan tanpa degradasi performa atau timeout.

---

## 2. TUJUAN DAN RUANG LINGKUP PENGUJIAN

### Tujuan Pengujian:
1. **Skenario A (Waktu Respons Soal Siswa):** Memastikan sistem mampu memproses pengiriman jawaban siswa secara bersamaan dan menyajikan soal berikutnya dengan batas waktu maksimal **1.0 detik (1000 ms)** pada skala beban bertahap 100–500 Virtual Users (VU).
2. **Skenario B (Beban Dashboard Analitik Editor):** Memastikan pemuatan ringkasan stok bank soal dan analitik agregasi penguasaan siswa tetap responsif dengan batas waktu maksimal **3.0 detik (3000 ms)** di bawah beban 50 Editor konkuren.

### Ruang Lingkup:
Sesuai dengan pembagian tanggung jawab tim QA (Quality Assurance), ruang lingkup pengujian beban (Load Testing) pada dokumen ini difokuskan secara eksklusif pada evaluasi performa protokol HTTP dan stabilitas API backend menggunakan **Grafana k6**. Pengujian fungsional komponen (Unit/Feature Testing) PHPUnit oleh Kak Naila serta pengujian antarmuka pengguna (End-to-End/UI Testing) Cypress oleh anggota tim lain secara ketat berada di luar cakupan dokumen ini.

---

## 3. LINGKUNGAN PENGUJIAN

* **Application Server:** Laravel 11.56.1 berjalan pada host lokal (`127.0.0.1:8000`).
* **Database Server:** PostgreSQL pada Supabase Online Pooler (`aws-0-ap-southeast-1.pooler.supabase.com:6543`).
* **Operating System:** Windows 11 Enterprise (x64) dengan runtime PHP 8.5.11 NTS.
* **Integritas Database Bersama:** Zero destructive migration policy (tidak menjalankan `php artisan migrate` atau `migrate:fresh`). Seluruh data anggota lain di database bersama tetap aman dan utuh.

---

## 4. TOOLS YANG DIGUNAKAN

* **Grafana k6 v0.54.0 (Windows amd64):** Runtime engine load testing berbasis JavaScript ES6 modules.
* **PowerShell 5.1 & Node.js:** Automation runner dan manajemen environment variable.
* **Python 3.12 & ReportLab:** Kompiler otomatis dokumen laporan PDF 15 Bagian berhalaman dinamis.

---

## 5. METODOLOGI PENGUJIAN

Pengujian dirancang dengan prinsip pengujian otomasi performa industri terbaik:
* **Ramping Stages Concurrency:** Beban dinaikkan secara bertahap (*ramp-up*), dipertahankan pada beban puncak, dan diturunkan (*ramp-down*) untuk mendeteksi titik jenuh server (*saturation point*).
* **Session Persistence & Anti-Login Storm:** Setiap Virtual User (VU) melakukan autentikasi sekali pada siklus hidupnya dan mempertahankan cookie sesi Laravel (`laravel_session`) antar-iterasi. Jika koneksi terputus akibat socket backlog, VU tidak melakukan spam login yang membebani server.
* **Pemisahan Pengukuran Response Time:** Pengukuran waktu pengiriman jawaban dan pemunculan soal berikutnya diukur secara terpisah menggunakan `response.timings.duration`. Waktu login diisolasi dan tidak dicampur ke metrik utama.
* **Filter Sampel Valid:** Request yang gagal memperoleh respons HTTP (status 0 karena timeout/dropped connection) tidak dimasukkan ke dalam metrik Trend waktu respons untuk mencegah distorsi 0 ms pada nilai rata-rata dan median.

---

## 6. SKENARIO A — RESPONS PENGIRIMAN JAWABAN SISWA

Skenario A mensimulasikan alur kerja siswa mengerjakan latihan ujian fleksibel. Berdasarkan audit kode sumber `routes/web.php` dan `LatihanSoalController.php`, alur pengujian terdiri atas:
1. **Autentikasi Siswa:** `POST /login` memverifikasi kredensial dan hak akses siswa secara ketat via parsing objek `data-page` Inertia. Waktu login diisolasi.
2. **Pengiriman Jawaban (`POST /latihan/ujian/jawab`):** Siswa mengirimkan payload jawaban riil `{ sesiId, soalId, opsiIds, jawabanIsian, pilihanKolom }` sesuai tipe soal. Server mengevaluasi jawaban via `SesiFleksibel::jawab` dan mengembalikan umpan balik instan. Diukur tersendiri sebagai `waktu_pengiriman_jawaban` (SLA ≤ 1000 ms).
3. **Pengambilan Soal Berikutnya (`GET /latihan/kerjakan/{sesiId}`):** Memuat komponen soal dan state sesi aktif. Diukur tersendiri sebagai `waktu_ambil_soal_berikutnya` (SLA ≤ 1000 ms).
4. **Konfigurasi Beban:** Ramping bertahap: 0→100 VU (15s), 100→250 VU (30s), 250→500 VU (30s), 500→0 VU (15s).

---

## 7. HASIL PENGUJIAN SKENARIO A

Eksekusi Skenario A menghasilkan total **836 HTTP requests** dengan **2.123 iterasi** di bawah konkurensi puncak **500 VU**. Rata-rata throughput tercatat **7,68 req/s**.

* **Waktu Pengiriman Jawaban (`POST /latihan/ujian/jawab`):**
  * Average: **33.465,05 ms** (33,47 s)
  * Median: **35.530,35 ms** (35,53 s)
  * Minimum: **5.840,77 ms** (5,84 s)
  * Percentile 90 (p90): **48.604,20 ms** (48,60 s)
  * Percentile 95 (p95): **49.080,13 ms** (49,08 s)
  * Maximum: **49.556,07 ms** (49,56 s)
  * Sampel Valid: **9 respons nyata**
  * Status Evaluasi: **FAIL** (Melampaui target SLA ≤ 1000 ms di bawah beban 500 VU).
* **Waktu Ambil Soal Berikutnya (`GET /latihan/kerjakan/{sesiId}`):**
  * Average: **33.632,90 ms** (33,63 s)
  * Median: **33.632,90 ms** (33,63 s)
  * Minimum: **12.574,43 ms** (12,57 s)
  * Percentile 90 (p90): **50.479,67 ms** (50,48 s)
  * Percentile 95 (p95): **52.585,52 ms** (52,59 s)
  * Maximum: **54.691,37 ms** (54,69 s)
  * Sampel Valid: **2 respons nyata**
  * Status Evaluasi: **FAIL** (Melampaui target SLA ≤ 1000 ms di bawah beban 500 VU).
* **Validasi Proses Bisnis:** Sebanyak **9 jawaban riil** berhasil diverifikasi dan dinilai secara sah oleh backend Laravel sesuai kontrak JSON umpan balik tanpa error 422 (validasi format berhasil), tanpa 410 (sesi aktif valid), dan tanpa 429. Tingkat kegagalan koneksi socket tercatat 63,28% akibat keterbatasan kapasitas antrean koneksi web server lokal saat mencapai beban puncak.

---

## 8. SKENARIO B — DASHBOARD ANALITIK EDITOR

Skenario B menguji ketahanan server saat diakses oleh pengguna dengan hak akses Editor (`admin_editor`). Berdasarkan audit rute dan controller (`AdminSoalController.php` dan `AnalitikController.php`):
1. **Autentikasi Editor:** Validasi kredensial hak akses Editor via `POST /login` dan verifikasi payload Inertia.
2. **Ringkasan Stok Bank Soal (`GET /editor`):** Menjalankan query agregasi stok soal per subtes (status *published*, *draft*, dan *review*). Diukur mandiri sebagai `waktu_dashboard_stok_editor` (SLA ≤ 3000 ms).
3. **Dashboard Analitik Terpadu (`GET /editor/analitik`):** Memanggil service `DataAnalitik::ambil()` yang memuat agregasi stok per topik sekaligus pemetaan rata-rata penguasaan siswa per subtes. Diukur mandiri sebagai `waktu_dashboard_analitik` (SLA ≤ 3000 ms).
4. **Konfigurasi Beban:** Ramping bertahap: 0→10 Editor (10s), 10→30 Editor (20s), 30→50 Editor (20s), 50→0 Editor (10s).

---

## 9. HASIL PENGUJIAN SKENARIO B

Eksekusi Skenario B menghasilkan total **114 HTTP requests** dengan **11 iterasi lengkap** di bawah konkurensi puncak **50 Editor**. Tingkat kegagalan request HTTP transport tercatat sempurna **0,00%** (114 dari 114 request berhasil diproses). Sebanyak **11 kunjungan lengkap** terselesaikan dalam durasi pengujian (sisanya sedang dalam proses eksekusi mengingat durasi per iterasi mencapai ~27–54 detik). Checks passing mencapai **92,08%** (279 dari 303 checks).

* **Pemuatan Stok Bank Soal (`GET /editor`):**
  * Average: **13.223,32 ms** (13,22 s)
  * Median: **12.713,12 ms** (12,71 s)
  * Minimum: **942,40 ms** (0,94 s)
  * Percentile 90 (p90): **25.386,10 ms** (25,39 s)
  * Percentile 95 (p95): **26.408,22 ms** (26,41 s)
  * Maximum: **27.629,54 ms** (27,63 s)
  * Sampel Valid: **17 respons nyata**
  * Status Evaluasi: **FAIL** (Melampaui target SLA ≤ 3000 ms di bawah beban 50 VU).
* **Dashboard Analitik Terpadu (`GET /editor/analitik`):**
  * Average: **14.110,23 ms** (14,11 s)
  * Median: **9.759,16 ms** (9,76 s)
  * Minimum: **1.594,25 ms** (1,59 s)
  * Percentile 90 (p90): **25.569,08 ms** (25,57 s)
  * Percentile 95 (p95): **26.580,68 ms** (26,58 s)
  * Maximum: **27.592,27 ms** (27,59 s)
  * Sampel Valid: **11 respons nyata**
  * Status Evaluasi: **FAIL** (Melampaui target SLA ≤ 3000 ms di bawah beban 50 VU).

---

## 10. TABEL PERBANDINGAN TARGET DAN HASIL AKTUAL

Berikut adalah tabel komparasi formal antara target ketentuan tugas dan hasil pengujian aktual:

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
| **Jumlah Sampel Respons Valid** | Jawab: **9 respons** \| Ambil: **2 respons** | Stok: **17 respons** \| Analitik: **11 respons** |
| **Business Success Rate** | **8,82%** (9 jawaban sah dinilai backend) | **100,00%** (11 kunjungan lengkap berhasil) |
| **HTTP Req Failed Rate** | **63,28%** (karena TCP socket backlog) | **0,00%** (seluruh request HTTP transport terlayani) |
| **Target Batas Waktu (SLA)** | **≤ 1.0 detik (1000 ms)** per request | **≤ 3.0 detik (3000 ms)** per request |
| **Status Evaluasi SLA Akhir** | <span style="color:#9B2C2C">**FAIL (Melebihi SLA target)**</span> | <span style="color:#9B2C2C">**FAIL (Melebihi SLA target)**</span> |

---

## 11. ANALISIS ERROR DAN BOTTLENECK (ROOT CAUSE ANALYSIS)

Berdasarkan data metrik aktual, kedua skenario pengujian melampaui ambang batas SLA target (1s dan 3s). Berdasarkan prinsip objektivitas QA Automation, analisis disusun dengan memisahkan **Fakta Observasi**, **Dugaan Penyebab**, dan **Rekomendasi**:

### A. Hasil Observasi (Fakta Metrik Aktual):
1. **Skenario A (500 VU):** Response time p95 mencapai 49–52 detik, melampaui batas target 1 detik. Tingkat kegagalan koneksi TCP socket mencapai 63,28% di bawah beban 500 VU.
2. **Skenario B (50 Editor):** Tidak ada request transport yang gagal (0,00% failed rate), namun response time p95 mencapai 26,41 detik (Stok) dan 26,58 detik (Analitik), melampaui target 3 detik. Karena durasi respons tinggi, hanya 11 iterasi penuh yang selesai dalam durasi pengujian.

### B. Dugaan / Hipotesis Penyebab (Root Cause Analysis):
1. **Arsitektur Web Server Single-Process (`php artisan serve`):**  
   Perintah `artisan serve` menjalankan runtime CLI web server bawaan PHP yang beroperasi secara *single-threaded* (satu proses tunggal). Server memproses request HTTP secara berurutan (*sequential*). Saat 500 siswa atau 50 editor mengakses bersamaan, request mengantre pada soket TCP OS, menyebabkan waktu tunggu antrean (*waiting time*) melonjak.
2. **Latensi Round-trip Jaringan Database Online Supabase:**  
   Database PostgreSQL berada di cluster cloud Supabase (AWS region Singapore: `aws-0-ap-southeast-1.pooler.supabase.com:6543`). Komunikasi via internet publik dari mesin lokal menambah latensi round-trip jaringan per kueri.
3. **Pemuatan Agregasi Analitik Real-Time:**  
   Endpoint `GET /editor/analitik` menjalankan kalkulasi agregasi penguasaan topik seluruh siswa secara langsung ke database pada setiap request tanpa layer in-memory cache.
4. **Keterbatasan Isolasi Data Pengujian (Skenario A):**  
   Demi menjaga keselamatan data bersama, pembuatan akun massal dilarang. Konkurensi 500 VU pada satu akun/sesi pengerjaan memicu proteksi *atomic session locking* (`block(10, 10)`) dan *rate limiting* (`throttle:30,1`) pada Laravel.

---

## 12. KESIMPULAN RESMI QA AUTOMATION ENGINEER

1. Seluruh script k6 pada folder `tests/k6` telah diperbaiki secara menyeluruh, mematuhi arsitektur aplikasi Laravel EDVORA, menggunakan data sesi riil, memfilter sampel tanpa respons (status 0), dan memverifikasi proses bisnis secara ketat.
2. Skrip pengujian berhasil dijalankan pada beban bertahap hingga **500 VU (Skenario A)** dan **50 VU (Skenario B)**.
3. Evaluasi SLA performa disimpulkan secara transparan dan jujur sebagai **FAIL** karena waktu respons melampaui target SLA, dipengaruhi oleh batasan arsitektur web server single-process dan latensi database online pada lingkungan lokal.

---

## 13. REKOMENDASI SOLUSI DAN OPTIMASI PERFORMA

* **Penerapan Web Server Multi-Worker Produksi:**  
  Mengganti `php artisan serve` dengan web server produksi seperti **Nginx + PHP-FPM** (dengan konfigurasi multi-worker) atau **Laravel Octane** (FrankenPHP / Swoole) agar mampu melayani ratusan request konkuren secara paralel.
* **Penerapan Layer Caching pada Dashboard Analitik:**  
  Menerapkan Redis caching pada `DataAnalitik::ambil()` dengan TTL 60–120 detik guna meniadakan kalkulasi agregasi berulang pada database.
* **Ko-Lokasi Server Aplikasi dan Database:**  
  Menempatkan server backend dan database pada region cloud yang sama melalui koneksi privat berkecepatan tinggi guna meminimalkan latensi round-trip jaringan.

---

## 14. INTEGRITAS DATABASE DAN STANDAR KEAMANAN

Pengujian dilaksanakan dengan kepatuhan penuh terhadap standar keselamatan tim QA EDVORA:
* **Zero Destructive Migration:** Tidak ada perintah `php artisan migrate`, `migrate:fresh`, maupun *drop table* yang dieksekusi. Data master seluruh tim di Supabase tetap utuh dan aman.
* **Zero Hardcoded Secrets:** Tidak ada kata sandi, cookie, maupun token CSRF yang tersimpan secara statis di dalam repositori. Seluruh parameter disuplai via environment variable k6 dan diabaikan dari git tracking.

---

## 15. BUKTI PENGUJIAN & DAFTAR ARTIFAK

| Nama Berkas Artifak | Lokasi Relatif | Deskripsi Isi |
|---|---|---|
| **Script Skenario A** | [`tests/k6/scenarios/soal-response-time.js`](file:///d:/edvora-app/tests/k6/scenarios/soal-response-time.js) | Script pengujian beban soal bertahap hingga 500 VU. |
| **Script Skenario B** | [`tests/k6/scenarios/editor-analytics-dashboard.js`](file:///d:/edvora-app/tests/k6/scenarios/editor-analytics-dashboard.js) | Script pengujian beban dashboard Editor hingga 50 VU. |
| **Raw Log Terminal A** | [`tests/k6/reports/output-skenario-a-soal.txt`](file:///d:/edvora-app/tests/k6/reports/output-skenario-a-soal.txt) | Log eksekusi mentah konsol k6 Skenario A. |
| **Raw Log Terminal B** | [`tests/k6/reports/output-skenario-b-editor.txt`](file:///d:/edvora-app/tests/k6/reports/output-skenario-b-editor.txt) | Log eksekusi mentah konsol k6 Skenario B. |
| **Export Raw JSON A** | [`tests/k6/reports/summary-skenario-a-soal.json`](file:///d:/edvora-app/tests/k6/reports/summary-skenario-a-soal.json) | Ekspor metrik JSON mentah Skenario A. |
| **Export Raw JSON B** | [`tests/k6/reports/summary-skenario-b-editor.json`](file:///d:/edvora-app/tests/k6/reports/summary-skenario-b-editor.json) | Ekspor metrik JSON mentah Skenario B. |
| **Screenshot Bukti A** | [`tests/k6/reports/screenshot-skenario-a.png`](file:///d:/edvora-app/tests/k6/reports/screenshot-skenario-a.png) | Tangkapan layar terminal bukti eksekusi Skenario A. |
| **Screenshot Bukti B** | [`tests/k6/reports/screenshot-skenario-b.png`](file:///d:/edvora-app/tests/k6/reports/screenshot-skenario-b.png) | Tangkapan layar terminal bukti eksekusi Skenario B. |
| **Laporan Resmi MD** | [`tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.md`](file:///d:/edvora-app/tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.md) | Dokumen laporan komprehensif versi Markdown (15 Bagian). |
| **Laporan Resmi PDF** | [`tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf`](file:///d:/edvora-app/tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf) | Dokumen laporan resmi PDF 15 Bagian berhalaman dinamis. |
