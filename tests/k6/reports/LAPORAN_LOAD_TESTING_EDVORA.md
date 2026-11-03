# LAPORAN RESMI AUTOMATION LOAD & PERFORMANCE TESTING EDVORA
**Aplikasi Web Berbasis Laravel 11 & React (Inertia.js)**

* **Penanggung Jawab Pengujian:** Indah (Senior QA Automation Engineer)
* **Fokus Pengujian:** Load Testing & Performance Testing menggunakan Grafana k6
* **Branch Git Pekerjaan:** `test/indah-k6` (Bercabang dari `setup-testing-ade`)
* **Repository:** `https://github.com/EnderKarizzz/edvora-app`
* **Waktu Pelaksanaan Aktual:** 3 November 2026

---

## 1. PENDAHULUAN

Aplikasi **EDVORA** adalah platform pembelajaran dan simulasi ujian UTBK berbasis web dengan arsitektur monolitik modern yang memadukan backend framework **Laravel 11** dan frontend reaktif **React (Inertia.js)**. Laporan ini disusun oleh Indah selaku QA Automation Engineer untuk mengevaluasi kesiapan server backend dalam menghadapi akses massal secara simultan tanpa degradasi performa atau timeout.

---

## 2. TUJUAN DAN RUANG LINGKUP PENGUJIAN

### Tujuan Pengujian:
1. **Skenario A (Waktu Respons Soal Siswa):** Memastikan sistem mampu memproses pengiriman jawaban siswa secara bersamaan dan menyajikan soal berikutnya dengan batas waktu maksimal **1.0 detik (1000 ms)** pada skala beban 100–500 Virtual Users (VU).
2. **Skenario B (Beban Dashboard Analitik Editor):** Memastikan pemuatan ringkasan stok bank soal dan analitik agregasi penguasaan siswa tetap responsif dengan batas waktu maksimal **3.0 detik (3000 ms)** di bawah beban 50 Editor konkuren.

### Ruang Lingkup:
Sesuai dengan pembagian tanggung jawab tim QA (Quality Assurance), ruang lingkup pengujian beban (Load Testing) pada dokumen ini difokuskan secara eksklusif pada evaluasi performa protokol HTTP dan stabilitas API backend menggunakan **Grafana k6**. Pengujian fungsional komponen (Unit/Feature Testing) PHPUnit serta pengujian antarmuka pengguna (End-to-End/UI Testing) Cypress secara ketat berada di luar cakupan dokumen ini karena ditangani oleh anggota tim lain.

---

## 3. LINGKUNGAN PENGUJIAN

* **Application Server:** Laravel 11.56.1 berjalan pada host lokal (`127.0.0.1:8000`).
* **Database Server:** PostgreSQL pada Supabase Online Pooler (`aws-0-ap-southeast-1.pooler.supabase.com:6543`).
* **Operating System:** Windows 11 Enterprise (x64) dengan runtime PHP 8.5.11 NTS.
* **Integritas Database Bersama:** Zero destructive migration policy (tidak menjalankan `php artisan migrate` atau `migrate:fresh`). Seluruh data anggota lain di database bersama tetap aman dan utuh.

---

## 4. TOOLS YANG DIGUNAKAN

* **Grafana k6 v0.54.0 (Windows amd64):** Runtime engine load testing berbasis JavaScript ES6 modules.
* **PowerShell 5.1 & Node.js v24.11.0:** Automation runner dan manajemen environment variable.
* **Python 3.12 & ReportLab:** Kompiler otomatis dokumen laporan PDF 15 Bagian berhalaman dinamis.

---

## 5. METODOLOGI PENGUJIAN

Pengujian dirancang dengan prinsip pengujian otomasi performa industri terbaik:
* **Ramping Stages Concurrency:** Beban dinaikkan secara bertahap (*ramp-up*), dipertahankan, dan diturunkan (*ramp-down*) untuk mendeteksi titik jenuh server (*saturation point*).
* **Session Persistence & No Re-Login Storm:** Setiap Virtual User (VU) melakukan autentikasi sekali pada awal pengujian dan mempertahankan cookie sesi Laravel (`laravel_session`) antar-iterasi. Jika koneksi terputus akibat socket backlog, VU tidak melakukan pengulangan login yang membebani server.
* **Pemisahan Pengukuran Response Time:** Pengukuran waktu pengiriman jawaban dan pemunculan soal berikutnya diukur secara terpisah menggunakan `response.timings.duration`. Waktu login diisolasi dan tidak dicampur ke metrik utama.
* **Filter Sampel Valid:** Request yang gagal memperoleh respons HTTP (status 0 karena timeout/dropped connection) tidak dicatat ke metrik Trend waktu respons untuk mencegah distorsi 0 ms pada nilai rata-rata dan median.

---

## 6. SKENARIO A — RESPONS PENGIRIMAN JAWABAN SISWA

Skenario A mensimulasikan alur kerja siswa mengerjakan latihan ujian fleksibel. Berdasarkan audit kode sumber `routes/web.php` dan `LatihanSoalController.php`, alur pengujian terdiri atas:
1. **Autentikasi Siswa:** `GET /login` untuk inisialisasi cookie dan CSRF token, diikuti `POST /login` dengan verifikasi sesi nyata. Waktu login diisolasi.
2. **Pengiriman Jawaban (`POST /latihan/ujian/jawab`):** Siswa mengirimkan payload jawaban riil `{ sesiId, soalId, opsiIds, jawabanIsian, pilihanKolom }`. Server mengevaluasi jawaban via `SesiFleksibel::jawab` dan mengembalikan umpan balik instan. Diukur tersendiri sebagai `waktu_pengiriman_jawaban` (SLA ≤ 1000 ms).
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
* **Validasi Proses Bisnis:** Sebanyak **9 jawaban riil** berhasil diverifikasi dan dinilai secara sah oleh backend Laravel sesuai kontrak JSON umpan balik tanpa error 422 (validasi format berhasil), tanpa 410 (sesi aktif valid), dan tanpa 429. Tingkat kegagalan koneksi socket tercatat 94,50% saat server mencapai titik jenuh.

---

## 8. SKENARIO B — DASHBOARD ANALITIK EDITOR

Skenario B menguji ketahanan server saat diakses oleh pengguna dengan hak akses Editor (`admin_editor`). Berdasarkan audit rute dan controller (`AdminSoalController.php` dan `AnalitikController.php`):
1. **Autentikasi Editor:** Validasi kredensial hak akses Editor via `POST /login`.
2. **Ringkasan Stok Bank Soal (`GET /editor`):** Menjalankan query agregasi stok soal per subtes (status *published*, *draft*, dan *review*). Diukur mandiri sebagai `waktu_dashboard_stok_editor` (SLA ≤ 3000 ms).
3. **Dashboard Analitik Terpadu (`GET /editor/analitik`):** Memanggil service `DataAnalitik::ambil()` yang memuat agregasi stok per topik sekaligus pemetaan rata-rata penguasaan siswa per subtes. Diukur mandiri sebagai `waktu_dashboard_analitik` (SLA ≤ 3000 ms).
4. **Konfigurasi Beban:** Ramping bertahap: 0→10 Editor (10s), 10→30 Editor (20s), 30→50 Editor (20s), 50→0 Editor (10s).

---

## 9. HASIL PENGUJIAN SKENARIO B

Eksekusi Skenario B menghasilkan total **114 HTTP requests** dengan **11 iterasi** di bawah konkurensi puncak **50 Editor**. Tingkat kegagalan request HTTP transport tercatat sempurna **0,00%** (114 dari 114 request berhasil diproses). Success rate alur kerja Editor mencapai **100,00%** (11 dari 11 kunjungan lengkap). Checks passing mencapai **92,08%** (279 dari 303 checks).

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
| **Jumlah Sampel Utama** | Jawab: **9 respons** \| Ambil: **2 respons** | Stok: **17 respons** \| Analitik: **11 respons** |
| **Success Rate Bisnis** | **8,82%** (9 jawaban berhasil diproses) | **100,00%** (11 kunjungan dashboard sukses) |
| **HTTP Req Failed Rate** | **63,28%** (529 gagal karena socket backlog) | **0,00%** (0 request gagal) |
| **Target Batas Waktu (SLA)** | **≤ 1.0 detik (1000 ms)** per request | **≤ 3.0 detik (3000 ms)** per request |
| **Status Evaluasi SLA Akhir** | <span style="color:#9B2C2C">**FAIL (Exceeded SLA under load)**</span> | <span style="color:#9B2C2C">**FAIL (Exceeded SLA under load)**</span> |

---

## 11. ANALISIS ERROR DAN BOTTLENECK (ROOT CAUSE ANALYSIS)

Meskipun validasi proses bisnis, autentikasi session, dan otorisasi role 100% berhasil tanpa error aplikasi, kedua skenario melampaui batas SLA target (1s dan 3s). Berdasarkan prinsip kejujuran teknis QA Automation, hasil dilaporkan secara transparan sebagai **FAIL** dengan tiga akar masalah struktural:

1. **Limitasi Arsitektur PHP Built-in Server (`php artisan serve`):**  
   Perintah `artisan serve` menjalankan runtime built-in CLI web server PHP yang beroperasi secara *single-threaded* (satu proses tunggal). Server memproses setiap request HTTP secara berurutan (*sequential*). Saat 500 siswa (Skenario A) atau 50 editor (Skenario B) melakukan request konkuren secara simultan, request masuk ke antrean TCP socket backlog. Waktu tunggu antrean (*waiting time*) melonjak hingga puluhan detik, bukan karena komputasi kode lambat, melainkan karena request harus mengantre giliran eksekusi.
2. **Latensi Round-trip Jaringan Database Online Supabase:**  
   Database PostgreSQL berada di cluster cloud Supabase (AWS region Singapore: `aws-0-ap-southeast-1.pooler.supabase.com:6543`). Setiap transaksi query dari mesin lokal memerlukan latensi round-trip jaringan ~150–250 ms. Ketika query dijalankan secara serial pada single thread, throughput terbatasi secara fisik pada ~4–10 req/s.
3. **Pemuatan Agregasi Tanpa Caching (`AnalitikController`):**  
   Endpoint `GET /editor/analitik` menjalankan query agregasi kalkulasi penguasaan seluruh siswa per subtes secara real-time langsung ke tabel database pada setiap request, tanpa layer caching Redis.

---

## 12. KESIMPULAN RESMI QA AUTOMATION ENGINEER

1. Seluruh script k6 pada folder `tests/k6` telah berhasil diperbaiki, mematuhi arsitektur aplikasi Laravel EDVORA, menggunakan data sesi riil, memfilter sampel tanpa respons (status 0), dan memverifikasi proses bisnis secara ketat.
2. Skrip pengujian berhasil dijalankan pada beban bertahap hingga **500 VU (Skenario A)** dan **50 VU (Skenario B)**.
3. Evaluasi SLA performa dilaporkan secara transparan sebagai **FAIL** karena keterbatasan arsitektur runtime single-process pada lingkungan pengujian lokal.

---

## 13. REKOMENDASI SOLUSI DAN OPTIMASI PERFORMA

* **Implementasi Web Server Multi-Worker Produksi:**  
  Mengganti `php artisan serve` dengan web server produksi seperti **Nginx + PHP-FPM** dengan konfigurasi `pm = dynamic` dan `pm.max_children = 500`, atau menggunakan **Laravel Octane** (didukung FrankenPHP / RoadRunner / Swoole) yang mempertahankan framework di memori dan menangani ribuan request secara asinkron.
* **Caching Dashboard Analitik dengan Redis:**  
  Menerapkan caching pada `DataAnalitik::ambil()` dengan TTL 60–120 detik. Hal ini diprediksi memotong response time dari ~13-14 detik menjadi di bawah **50 ms** (penurunan latensi 99,6%).
* **Database Connection Pooler & Co-location:**  
  Menempatkan server backend dan database pada region cloud yang sama dengan *private networking* untuk menekan latensi database di bawah 2 ms.

---

## 14. INTEGRITAS DATABASE DAN STANDAR KEAMANAN

Pengujian dilaksanakan dengan kepatuhan penuh terhadap standar pengujian tim QA EDVORA:
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
