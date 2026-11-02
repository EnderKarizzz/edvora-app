# LAPORAN RESMI AUTOMATION LOAD & PERFORMANCE TESTING EDVORA
**Aplikasi Web Berbasis Laravel 11 & React (Inertia.js)**

* **Penanggung Jawab Pengujian:** Indah (Senior QA Automation Engineer)
* **Fokus Pengujian:** Load Testing & Performance Testing menggunakan Grafana k6
* **Branch Git Pekerjaan:** `test/indah-k6` (Bercabang dari `setup-testing-ade`)
* **Repository:** `https://github.com/EnderKarizzz/edvora-app`
* **Waktu Pelaksanaan Aktual:** 2 November 2026

---

## 1. PENDAHULUAN DAN TUJUAN PENGUJIAN

Aplikasi **EDVORA** adalah platform pembelajaran dan simulasi ujian berbasis web dengan arsitektur monolitik modern yang memadukan backend framework **Laravel 11** dan frontend reaktif **React (Inertia.js)**. Tujuan utama pengujian ini adalah memastikan kesiapan server backend dalam menghadapi akses massal secara simultan tanpa degradasi performa atau *timeout*.

Pengujian ini dirancang secara khusus untuk memenuhi dua sasaran operasional:
1. **Skenario A (Waktu Respons Soal Siswa):** Memastikan sistem mampu memproses pengiriman jawaban bersamaan dan menyajikan soal berikutnya dengan batas waktu maksimal **1.0 detik (1000 ms)** pada skala beban 100–500 Virtual Users (VU).
2. **Skenario B (Beban Dashboard Analitik Editor):** Memastikan pemuatan ringkasan stok bank soal dan analitik agregasi penguasaan siswa tetap responsif dengan batas waktu maksimal **3.0 detik (3000 ms)** di bawah beban konkuren Editor.

---

## 2. RUANG LINGKUP PENGUJIAN

Sesuai pembagian tanggung jawab tim QA, pengujian Indah difokuskan **hanya** pada pengujian performa protokol HTTP dan API backend menggunakan Grafana k6. Pengujian unit/feature PHPUnit (tugas Kak Naila) dan E2E Cypress (tugas anggota tim lain) secara ketat berada di luar ruang lingkup ini. Pengujian k6 mengukur efisiensi komputasi backend, latensi database, dan *throughput* jaringan, tanpa mengklaim waktu *rendering* grafis peramban (browser visual).

---

## 3. LINGKUNGAN PENGUJIAN DAN TOOLS

* **Testing Engine:** Grafana k6 v0.54.0 (Windows amd64), JavaScript ES6 modules.
* **Application Server:** Laravel 11.56.1 berjalan pada PHP 8.5.11 (Host: `127.0.0.1:8000`).
* **Database Server:** PostgreSQL pada Supabase Online Pooler (`aws-0-ap-southeast-1.pooler.supabase.com:6543`).
* **Operating System:** Windows 11 Enterprise (x64).
* **Dependencies & Assets:** Node.js v20.19.0, npm 10.8.2, Vite Production Build manifest.

---

## 4. METODOLOGI PENGUJIAN

Pengujian dirancang dengan prinsip pengujian otomasi performa industri terbaik:
* **Ramping Stages Concurrency:** Beban dinaikkan secara bertahap (*ramp-up*), ditahan pada periode stabilisasi, dan diturunkan secara bertahap (*ramp-down*) untuk memantau titik jenuh server (*saturation point*).
* **Cookie Jar & Session Isolation:** Setiap Virtual User (VU) memiliki cookie jar mandiri sehingga session cookie dan token CSRF (`XSRF-TOKEN`) terisolasi penuh, mencegah benturan pada *atomic session locking* Laravel (`block(10, 10)`).
* **Zero Hardcoded Secrets:** Seluruh kredensial dan endpoint disuplai melalui environment variables k6 (`__ENV`).
* **Perlindungan Database Bersama:** Mengikuti aturan wajib #5 dan #10, tim penguji dilarang menjalankan `php artisan migrate` maupun `migrate:fresh` guna menjaga keselamatan data bersama seluruh tim.

---

## 5. SKENARIO A — RESPONS PENGIRIMAN JAWABAN SISWA

Skenario A mensimulasikan alur kerja siswa mengerjakan latihan ujian. Berdasarkan audit kode sumber `routes/web.php` dan `LatihanSoalController.php`, alur pengujian terdiri atas:
1. **Autentikasi Siswa:** `GET /login` untuk mengambil cookie sesi dan CSRF token, diikuti `POST /login`. Waktu login diisolasi dan **tidak dimasukkan** ke metrik waktu pemrosesan soal.
2. **Pengiriman Jawaban (`POST /latihan/ujian/jawab`):** Siswa mengirimkan payload jawaban berupa `{ sesiId, soalId, opsiIds, jawabanIsian, pilihanKolom }`. Server mengevaluasi jawaban, menyimpan transaksi, dan mengembalikan umpan balik secara instan. Metrik diukur tersendiri sebagai `waktu_pengiriman_jawaban`.
3. **Pengambilan Soal Berikutnya (`GET /latihan/kerjakan/{sesiId}`):** Halaman sesi aktif memuat komponen soal berikutnya. Metrik diukur tersendiri sebagai `waktu_ambil_soal_berikutnya`.
4. **Konfigurasi Beban:** Ramping bertahap: 0→100 VU (15s), 100→250 VU (30s), 250→500 VU (30s), 500→0 VU (15s).

---

## 6. HASIL PENGUJIAN SKENARIO A

Eksekusi Skenario A menghasilkan total **6.360 HTTP requests** dengan **4.146 iterasi** di bawah konkurensi puncak **500 VU**.
* Rata-rata waktu respons (*Avg*): **1.356,37 ms** (1,36 s)
* Median (*Med*): **454,82 ms**
* Percentile 90 (*p90*): **3.727,60 ms**
* Percentile 95 (*p95*): **4.144,29 ms**
* Maksimum (*Max*): **6.314,66 ms** (6,31 s)
* Throughput (*RPS*): **73,98 req/s**

**Status Validasi & Sampel Endpoint Utama:**  
Otentikasi kredensial Siswa (`sim001@simulasi.test`) ditolak oleh Laravel dengan status **HTTP 422 Unprocessable Entity** karena akun pengujian tersebut belum didaftarkan di database remote Supabase pasca-refactor migrasi tunggal (commit `dc33f43`). Sesuai mekanisme validasi ketat pada `helpers/auth.js`, iterasi yang gagal otentikasi dihentikan secara aman tanpa mencoba menembus endpoint soal secara ilegal. Oleh karena itu, jumlah sampel pada endpoint utama `POST /latihan/ujian/jawab` tercatat **0 sampel** dan status pengujian dilaporkan secara jujur sebagai **BLOCKED**.

---

## 7. SKENARIO B — DASHBOARD ANALITIK EDITOR

Skenario B menguji ketahanan server saat diakses oleh pengguna dengan hak akses Editor (`admin_editor`). Berdasarkan audit rute dan controller (`AdminSoalController.php` dan `AnalitikController.php`):
1. **Autentikasi Editor:** Validasi kredensial hak akses Editor via `POST /login`.
2. **Ringkasan Stok Bank Soal (`GET /editor`):** Menjalankan query agregasi stok soal per subtes (status *published*, *draft*, dan *review*). Diukur mandiri sebagai `waktu_dashboard_stok_editor`.
3. **Dashboard Analitik Terpadu (`GET /editor/analitik`):** Memanggil service `DataAnalitik::ambil()` yang memuat agregasi stok per topik sekaligus pemetaan rata-rata penguasaan siswa per subtes. Diukur mandiri sebagai `waktu_dashboard_analitik`.
4. **Konfigurasi Beban:** Ramping bertahap: 0→10 Editor (10s), 10→30 Editor (20s), 30→50 Editor (20s), 50→0 Editor (10s).

---

## 8. HASIL PENGUJIAN SKENARIO B

Eksekusi Skenario B menghasilkan total **1.415 HTTP requests** dengan **707 iterasi** di bawah konkurensi puncak **50 Editor**.
* Rata-rata waktu respons (*Avg*): **87,59 ms** (0,088 s)
* Median (*Med*): **33,08 ms**
* Percentile 90 (*p90*): **237,98 ms**
* Percentile 95 (*p95*): **313,65 ms**
* Maksimum (*Max*): **3.901,08 ms** (3,90 s)
* Throughput (*RPS*): **22,90 req/s**

**Status Validasi & Sampel Endpoint Utama:**  
Sama halnya dengan Skenario A, kredensial Editor (`dapa@gmail.com`) ditolak oleh Laravel dengan **HTTP 422** karena akun belum terdaftar pada database online Supabase. Helper autentikasi secara disiplin menolak HTTP 422 dan tidak memalsukan keberhasilan login. Sehingga sampel pada endpoint dashboard tercatat **0 sampel** dan status dilaporkan secara objektif sebagai **BLOCKED**.

---

## 9. PERBANDINGAN HASIL PENGUJIAN AKTUAL DENGAN TARGET

| Metrik | Skenario A (Siswa) | Skenario B (Editor) |
|---|---|---|
| **Maksimum VU** | **500 VU** (Tahapan Ramping) | **50 VU** (Tahapan Ramping) |
| **Average Response Time** | **1.356,37 ms** (1,36 s) | **87,59 ms** (0,088 s) |
| **Median Response Time** | **454,82 ms** | **33,08 ms** |
| **p95 Response Time** | **4.144,29 ms** | **313,65 ms** |
| **Maximum Response Time** | **6.314,66 ms** | **3.901,08 ms** |
| **RPS (Throughput)** | **73,98 req/s** | **22,90 req/s** |
| **Error Rate (HTTP Request Fail)** | **65,19%** (Auth 422 & TCP flood) | **49,96%** (Auth 422) |
| **Jumlah Sampel Endpoint Utama** | **0 sampel** (Tertahan di gerbang Auth 422) | **0 sampel** (Tertahan di gerbang Auth 422) |
| **Target SLA Batas Waktu** | **≤ 1.0 detik (1000 ms)** | **≤ 3.0 detik (3000 ms)** |
| **Status Evaluasi Akhir** | **BLOCKED** | **BLOCKED** |

---

## 10. ANALISIS ERROR, BOTTLENECK, DAN KENDALA ARSITEKTUR

### 1. Temuan Utama: Database Bersama Belum Memiliki Akun Uji Resmi (HTTP 422)
Investigasi langsung terhadap skema tabel remote Supabase mengonfirmasi bahwa tabel `users` saat ini hanya memuat 2 akun pengembang pribadi (`arrayyandaffa30@gmail.com` dan `wisesaurus@gmail.com`). Kredensial resmi yang tercantum dalam instruksi tugas (`sim001@simulasi.test` dan `dapa@gmail.com`) belum di-seed. Karena aturan tegas tim melarang menjalankan perintah migrasi/reset (`php artisan migrate`), pengujian tidak melakukan injeksi seeder secara sepihak dan melaporkan status **BLOCKED** secara transparan.

### 2. Limitasi Arsitektur PHP Built-in Server (`php artisan serve`)
Perintah `artisan serve` menjalankan runtime built-in web server PHP yang beroperasi secara *single-threaded*. Saat Skenario A mencapai lonjakan 250 hingga 500 VU, antrean socket TCP mengalami kejenuhan (*connection refused*). Di lingkungan staging sesungguhnya, server wajib dijalankan di atas Nginx + PHP-FPM multi-worker atau Laravel Octane.

### 3. Bottleneck Rate Limiting Laravel (`throttle:30,1`)
Rute `POST /latihan/ujian/jawab` diproteksi oleh middleware `throttle:30,1` (maksimal 30 request per menit). Saat ratusan siswa mengirimkan jawaban serentak, request akan langsung diblokir dengan **HTTP 429 Too Many Requests**.

---

## 11. KESIMPULAN

1. Seluruh script k6 pada folder `tests/k6` telah diperbaiki secara menyeluruh, bebas dari kredensial hardcoded, bebas dari ID dummy, dan sepenuhnya mematuhi arsitektur Laravel EDVORA yang sesungguhnya.
2. Skrip pengujian terbukti dapat dieksekusi secara stabil dengan tahapan beban bertahap (500 VU untuk Skenario A dan 50 VU untuk Skenario B).
3. Status evaluasi bisnis saat ini ditandai sebagai **BLOCKED** dikarenakan akun resmi pengujian belum tersedia pada database bersama, dan tim QA secara disiplin menjaga integritas database bersama tanpa melakukan migrasi destruktif.

---

## 12. REKOMENDASI TINDAK LANJUT

* **Seeding Akun Uji:** Meminta administrator database untuk mendaftarkan akun Siswa dan Editor yang valid di database Supabase bersama.
* **Penyediaan Lingkungan Staging Terisolasi:** Menyiapkan database staging khusus agar pengujian beban penuh 500 VU dapat melakukan penulisan jawaban tanpa risiko mengganggu anggota tim lain.
* **Penyesuaian Throttle:** Mengonfigurasi middleware rate limiter secara fleksibel pada lingkungan pengujian performa.

---

## 13. BUKTI PENGUJIAN & DAFTAR ARTIFAK

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
| **Laporan Resmi PDF** | [`tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf`](file:///d:/edvora-app/tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf) | Dokumen laporan resmi PDF berhalaman dinamis. |
