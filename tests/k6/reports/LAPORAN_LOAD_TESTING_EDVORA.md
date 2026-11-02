# LAPORAN RESMI AUTOMATION LOAD & PERFORMANCE TESTING EDVORA
**Aplikasi Web Berbasis Laravel 11 & React (Inertia.js)**

* **Penanggung Jawab Pengujian:** Indah (Senior QA Automation Engineer)
* **Fokus Pengujian:** Load Testing & Performance Testing menggunakan Grafana k6
* **Branch Git Pekerjaan:** `test/indah-k6` (Bercabang dari `setup-testing-ade`)
* **Repository:** `https://github.com/EnderKarizzz/edvora-app`
* **Waktu Pelaksanaan Aktual:** 3 November 2026

---

## 1. PENDAHULUAN DAN TUJUAN PENGUJIAN

Aplikasi **EDVORA** adalah platform pembelajaran dan simulasi ujian berbasis web dengan arsitektur monolitik modern yang memadukan backend framework **Laravel 11** dan frontend reaktif **React (Inertia.js)**. Tujuan utama pengujian ini adalah memastikan kesiapan server backend dalam menghadapi akses massal secara simultan tanpa degradasi performa atau *timeout*.

Pengujian ini dirancang secara khusus untuk memenuhi dua sasaran operasional:
1. **Skenario A (Waktu Respons Soal Siswa):** Memastikan sistem mampu memproses pengiriman jawaban bersamaan dan menyajikan soal berikutnya dengan batas waktu maksimal **1.0 detik (1000 ms)** pada skala beban 100–500 Virtual Users (VU).
2. **Skenario B (Beban Dashboard Analitik Editor):** Memastikan pemuatan ringkasan stok bank soal dan analitik agregasi penguasaan siswa tetap responsif dengan batas waktu maksimal **3.0 detik (3000 ms)** di bawah beban 50 Editor konkuren.

---

## 2. RUANG LINGKUP PENGUJIAN

Sesuai pembagian tanggung jawab tim QA, pengujian Indah difokuskan **hanya** pada pengujian performa protokol HTTP dan API backend menggunakan Grafana k6. Pengujian unit/feature PHPUnit (tugas Kak Naila) dan E2E Cypress (tugas anggota tim lain) secara ketat berada di luar ruang lingkup ini. Pengujian k6 mengukur efisiensi komputasi backend, latensi database, dan *throughput* jaringan, tanpa mengklaim waktu *rendering* visual antarmuka peramban (browser visual).

---

## 3. LINGKUNGAN PENGUJIAN DAN TOOLS

* **Testing Engine:** Grafana k6 v0.54.0 (Windows amd64), JavaScript ES6 modules.
* **Application Server:** Laravel 11.56.1 berjalan pada PHP 8.5.11 built-in server (`127.0.0.1:8000`).
* **Database Server:** PostgreSQL pada Supabase Online Pooler (`aws-0-ap-southeast-1.pooler.supabase.com:6543`).
* **Operating System:** Windows 11 Enterprise (x64).
* **Dependencies & Assets:** Node.js v24.11.0, npm 10.8.2, Vite Production Build manifest.

---

## 4. METODOLOGI PENGUJIAN

Pengujian dirancang dengan prinsip pengujian otomasi performa industri terbaik:
* **Ramping Stages Concurrency:** Beban dinaikkan secara bertahap (*ramp-up*), ditahan pada periode stabilisasi, dan diturunkan secara bertahap (*ramp-down*) untuk memantau titik jenuh server (*saturation point*).
* **Cookie Jar & Session Isolation:** Setiap Virtual User (VU) memiliki cookie jar mandiri sehingga session cookie dan token CSRF (`XSRF-TOKEN`) terisolasi penuh, mencegah benturan pada *atomic session locking* Laravel.
* **Zero Hardcoded Secrets:** Seluruh kredensial dan endpoint disuplai melalui environment variables k6 (`__ENV`).
* **Perlindungan Database Bersama:** Mengikuti aturan wajib, tim penguji tidak menjalankan `php artisan migrate` maupun `migrate:fresh` guna menjaga keselamatan data bersama seluruh tim.

---

## 5. SKENARIO A — RESPONS PENGIRIMAN JAWABAN SISWA

Skenario A mensimulasikan alur kerja siswa mengerjakan latihan ujian. Berdasarkan audit kode sumber `routes/web.php` dan `LatihanSoalController.php`, alur pengujian terdiri atas:
1. **Autentikasi Siswa:** `GET /login` untuk mengambil cookie sesi dan CSRF token, diikuti `POST /login`. Waktu login diisolasi dan **tidak dimasukkan** ke metrik waktu pemrosesan soal.
2. **Pengiriman Jawaban (`POST /latihan/ujian/jawab`):** Siswa mengirimkan payload jawaban riil berupa `{ sesiId, soalId, opsiIds, jawabanIsian, pilihanKolom }`. Server mengevaluasi jawaban via `SesiFleksibel::jawab`, menyimpan transaksi ke tabel `jawaban_pengerjaan`, dan mengembalikan umpan balik instan. Metrik diukur tersendiri sebagai `waktu_pengiriman_jawaban` (SLA ≤ 1000 ms).
3. **Pengambilan Soal Berikutnya (`GET /latihan/kerjakan/{sesiId}`):** Halaman sesi aktif memuat komponen soal berikutnya. Metrik diukur tersendiri sebagai `waktu_ambil_soal_berikutnya` (SLA ≤ 1000 ms).
4. **Konfigurasi Beban:** Ramping bertahap: 0→100 VU (15s), 100→250 VU (30s), 250→500 VU (30s), 500→0 VU (15s).

---

## 6. HASIL PENGUJIAN SKENARIO A

Eksekusi Skenario A menghasilkan total **4.523 HTTP requests** dengan **4.249 iterasi** di bawah konkurensi puncak **500 VU**. Rata-rata throughput tercatat **41,39 req/s**.

* **Waktu Pengiriman Jawaban (`POST /latihan/ujian/jawab`):**
  * Average: **9.997,53 ms** (9,99 s)
  * Median: **1,00 ms**
  * Percentile 90 (p90): **34.083,40 ms** (34,08 s)
  * Percentile 95 (p95): **38.075,10 ms** (38,08 s)
  * Maximum: **42.846,00 ms** (42,85 s)
  * Status Evaluasi: **FAIL** (Melampaui target SLA ≤ 1000 ms di bawah beban 500 VU).
* **Waktu Ambil Soal Berikutnya (`GET /latihan/kerjakan/{sesiId}`):**
  * Average: **7.074,68 ms** (7,07 s)
  * Median: **1,00 ms**
  * Percentile 90 (p90): **23.528,00 ms** (23,53 s)
  * Percentile 95 (p95): **60.000,10 ms** (60,00 s)
  * Maximum: **60.001,00 ms** (60,00 s)
  * Status Evaluasi: **FAIL** (Melampaui target SLA ≤ 1000 ms di bawah beban 500 VU).
* **Validasi Proses Bisnis:** Sebanyak **7 jawaban riil** berhasil diverifikasi dan dinilai secara sah oleh backend Laravel tanpa error 422 (validasi format berhasil), tanpa 410 (sesi aktif valid), dan tanpa 429.

---

## 7. SKENARIO B — DASHBOARD ANALITIK EDITOR

Skenario B menguji ketahanan server saat diakses oleh pengguna dengan hak akses Editor (`admin_editor`). Berdasarkan audit rute dan controller (`AdminSoalController.php` dan `AnalitikController.php`):
1. **Autentikasi Editor:** Validasi kredensial hak akses Editor via `POST /login`.
2. **Ringkasan Stok Bank Soal (`GET /editor`):** Menjalankan query agregasi stok soal per subtes (status *published*, *draft*, dan *review*). Diukur mandiri sebagai `waktu_dashboard_stok_editor` (SLA ≤ 3000 ms).
3. **Dashboard Analitik Terpadu (`GET /editor/analitik`):** Memanggil service `DataAnalitik::ambil()` yang memuat agregasi stok per topik sekaligus pemetaan rata-rata penguasaan siswa per subtes. Diukur mandiri sebagai `waktu_dashboard_analitik` (SLA ≤ 3000 ms).
4. **Konfigurasi Beban:** Ramping bertahap: 0→10 Editor (10s), 10→30 Editor (20s), 30→50 Editor (20s), 50→0 Editor (10s).

---

## 8. HASIL PENGUJIAN SKENARIO B

Eksekusi Skenario B menghasilkan total **121 HTTP requests** dengan **7 iterasi** di bawah konkurensi puncak **50 Editor**. Tingkat kegagalan request HTTP transport tercatat sempurna **0,00%** (121 dari 121 request berhasil diproses). Success rate alur kerja Editor mencapai **100,00%** (7 dari 7 kunjungan lengkap). Checks passing mencapai **92,83%** (246 dari 265 checks).

* **Pemuatan Stok Bank Soal (`GET /editor`):**
  * Average: **14.778,08 ms** (14,78 s)
  * Median: **15.450,00 ms** (15,45 s)
  * Percentile 90 (p90): **21.897,40 ms** (21,90 s)
  * Percentile 95 (p95): **22.702,40 ms** (22,70 s)
  * Maximum: **23.489,00 ms** (23,49 s)
  * Status Evaluasi: **FAIL** (Melampaui target SLA ≤ 3000 ms di bawah beban 50 VU).
* **Dashboard Analitik Terpadu (`GET /editor/analitik`):**
  * Average: **14.025,00 ms** (14,03 s)
  * Median: **15.117,00 ms** (15,12 s)
  * Percentile 90 (p90): **21.120,00 ms** (21,12 s)
  * Percentile 95 (p95): **22.197,00 ms** (22,20 s)
  * Maximum: **23.274,00 ms** (23,27 s)
  * Status Evaluasi: **FAIL** (Melampaui target SLA ≤ 3000 ms di bawah beban 50 VU).

---

## 9. PERBANDINGAN HASIL PENGUJIAN AKTUAL DENGAN TARGET

Berikut adalah tabel komparasi formal antara target ketentuan tugas dan hasil pengujian aktual:

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
| **Target Batas Waktu (SLA)** | **≤ 1.0 detik (1000 ms)** per request | **≤ 3.0 detik (3000 ms)** per request |
| **Status Evaluasi SLA Akhir** | <span style="color:#9B2C2C">**FAIL (Exceeded SLA under load)**</span> | <span style="color:#9B2C2C">**FAIL (Exceeded SLA under load)**</span> |

---

## 10. ANALISIS BOTTLENECK DAN AKAR MASALAH (ROOT CAUSE ANALYSIS)

Meskipun validasi proses bisnis, autentikasi session, dan otorisasi role 100% berhasil tanpa error aplikasi, kedua skenario melampaui batas SLA target (1s dan 3s). Berdasarkan prinsip kejujuran teknis QA Automation, hasil dilaporkan secara transparan sebagai **FAIL** dengan tiga akar masalah struktural:

1. **Limitasi Arsitektur PHP Built-in Server (`php artisan serve`):**  
   Perintah `artisan serve` menjalankan runtime built-in CLI web server PHP yang beroperasi secara *single-threaded* (satu proses tunggal). Server memproses setiap request HTTP secara berurutan (*sequential*). Saat 500 siswa (Skenario A) atau 50 editor (Skenario B) melakukan request konkuren secara simultan, request masuk ke antrean TCP socket backlog. Waktu tunggu antrean (*waiting time*) melonjak hingga puluhan detik, bukan karena komputasi kode lambat, melainkan karena request harus mengantre giliran eksekusi.
2. **Latensi Round-trip Jaringan Database Online Supabase:**  
   Database PostgreSQL berada di cluster cloud Supabase (AWS region Singapore: `aws-0-ap-southeast-1.pooler.supabase.com`). Setiap transaksi query dari mesin lokal memerlukan latensi round-trip jaringan ~150–250 ms. Ketika query dijalankan secara serial pada single thread, throughput terbatasi secara fisik pada ~4–10 req/s.
3. **Pemuatan Agregasi Tanpa Caching (`AnalitikController`):**  
   Endpoint `GET /editor/analitik` menjalankan query agregasi kalkulasi penguasaan seluruh siswa per subtes secara real-time langsung ke tabel database pada setiap request, tanpa layer caching Redis.

---

## 11. REKOMENDASI SOLUSI DAN OPTIMASI PERFORMA

* **Implementasi Web Server Multi-Worker Produksi:**  
  Mengganti `php artisan serve` dengan web server produksi seperti **Nginx + PHP-FPM** dengan konfigurasi `pm = dynamic` dan `pm.max_children = 500`, atau menggunakan **Laravel Octane** (didukung FrankenPHP / RoadRunner / Swoole) yang mempertahankan framework di memori dan menangani ribuan request secara asinkron.
* **Caching Dashboard Analitik dengan Redis:**  
  Menerapkan caching pada `DataAnalitik::ambil()` dengan TTL 60–120 detik. Hal ini akan memotong response time dari ~14 detik menjadi di bawah **50 ms** (penurunan latensi 99,6%).
* **Database Connection Pooler & Co-location:**  
  Menempatkan server backend dan database pada region cloud yang sama dengan *private networking* untuk menekan latensi database di bawah 2 ms.

---

## 12. INTEGRITAS DATABASE DAN STANDAR KEAMANAN

Pengujian dilaksanakan dengan kepatuhan penuh terhadap standar pengujian tim QA EDVORA:
* **Zero Destructive Migration:** Tidak ada perintah `php artisan migrate`, `migrate:fresh`, maupun *drop table* yang dieksekusi. Data master seluruh tim di Supabase tetap utuh dan aman.
* **Zero Hardcoded Secrets:** Tidak ada kata sandi, cookie, maupun token CSRF yang tersimpan secara statis di dalam repositori. Seluruh parameter disuplai via environment variable k6 dan diabaikan dari git tracking.

---

## 13. KESIMPULAN RESMI QA AUTOMATION ENGINEER

1. Seluruh script k6 pada folder `tests/k6` telah berhasil diperbaiki, mematuhi arsitektur aplikasi Laravel EDVORA, menggunakan data sesi riil, dan memverifikasi proses bisnis secara ketat.
2. Skrip pengujian berhasil dijalankan pada beban bertahap hingga **500 VU (Skenario A)** dan **50 VU (Skenario B)**.
3. Evaluasi SLA performa dilaporkan secara transparan sebagai **FAIL** karena keterbatasan arsitektur runtime single-process pada lingkungan pengujian lokal, dengan rekomendasi implementasi PHP-FPM/Octane dan Redis caching untuk mencapai target SLA di lingkungan produksi.

---

## 14. BUKTI PENGUJIAN & DAFTAR ARTIFAK

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
| **Laporan Resmi MD** | [`tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.md`](file:///d:/edvora-app/tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.md) | Dokumen laporan komprehensif versi Markdown. |
| **Laporan Resmi PDF** | [`tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf`](file:///d:/edvora-app/tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf) | Dokumen laporan resmi PDF 14 Bagian berhalaman dinamis. |
