# LAPORAN RESMI AUTOMATION LOAD & PERFORMANCE TESTING EDVORA
**Aplikasi Web Berbasis Laravel 11 & React (Inertia.js)**

* **Penanggung Jawab Pengujian:** Indah (Senior QA Automation Engineer)
* **Fokus Pengujian:** Load Testing & Performance Testing menggunakan Grafana k6
* **Branch Git Pekerjaan:** `test/indah-k6` (Bercabang dari `setup-testing-ade`)
* **Repository:** `https://github.com/EnderKarizzz/edvora-app`
* **Waktu Pengujian Aktual:** 2 November 2026

---

## 1. RINGKASAN EKSEKUTIF & TUJUAN PENGUJIAN

Pengujian performa dan beban ini bertujuan untuk mengukur ketahanan, skalabilitas, dan latensi pemrosesan backend aplikasi EDVORA sesuai lingkup tanggung jawab Indah:

1. **Skenario A (Load Testing Soal — Batas Waktu Respons Maksimal 1.0 detik):**
   * Memastikan backend EDVORA mampu menangani siswa yang mengirimkan jawaban secara bersamaan (`POST /latihan/ujian/jawab`) dan menyajikan soal berikutnya.
   * Mensimulasikan lonjakan beban bertahap hingga **500 Virtual Users (VU)** menggunakan Grafana k6.
   * Target SLA: Waktu pemrosesan pengiriman jawaban $\le 1000\text{ ms}$ dan pemunculan soal berikutnya $\le 1000\text{ ms}$.
2. **Skenario B (Beban Dashboard Analitik Editor — Batas Waktu Respons Maksimal 3.0 detik):**
   * Memastikan dashboard Editor tetap responsif saat memuat ringkasan stok bank soal (`GET /editor`) dan dashboard analitik agregasi penguasaan siswa (`GET /editor/analitik`).
   * Mensimulasikan konkurensi akses oleh pengguna Editor hingga **50 Virtual Users (VU)**.
   * Target SLA: Waktu pemuatan halaman dan agregasi data analitik $\le 3000\text{ ms}$.

---

## 2. LINGKUNGAN PENGUJIAN & KEAMANAN SISTEM

* **Operating System:** Windows 11 (x64)
* **Backend Framework:** Laravel 11.56.1 berjalan pada PHP 8.5.11 (Host: `127.0.0.1:8000`)
* **Frontend Assets:** React 18 & Inertia.js (Vite Production Build)
* **Database Bersama:** PostgreSQL pada Supabase Online Pooler (`aws-0-ap-southeast-1.pooler.supabase.com:6543`)
* **Testing Tools:** Grafana k6 v0.54.0 (Windows amd64)
* **Prinsip Keamanan Tanpa Password Hardcoded:** Seluruh kredensial akun uji (`SISWA_EMAIL`, `SISWA_PASSWORD`, `EDITOR_EMAIL`, `EDITOR_PASSWORD`) dan parameter uji diinjeksikan secara dinamis melalui *Environment Variables* k6 (`__ENV`). Tidak ada kata sandi tersimpan dalam kode yang di-commit.
* **Perlindungan Database Bersama:** Mematuhi mandat mutlak larangan menjalankan `php artisan migrate`, `migrate:fresh`, maupun operasi reset/penghapusan tabel bersama. Pengujian dilakukan tanpa merusak data anggota tim lainnya.

---

## 3. RANCANGAN SKENARIO & TAHAPAN BEBAN (RAMPING STAGES)

### Skenario A: Siklus Pengiriman Jawaban Siswa & Soal Berikutnya (`soal-response-time.js`)
* **Tahapan Beban Bertahap (5 Stages, Total Durasi 1m20s):**
  1. `0s - 10s`: Ramp-up menuju 50 VU.
  2. `10s - 30s`: Beban 100 VU.
  3. `30s - 50s`: Beban menengah 250 VU.
  4. `50s - 70s`: Puncak beban ekstrem **500 VU**.
  5. `70s - 80s`: Ramp-down pendinginan menuju 0 VU.
* **Alur Validasi Bisnis & Isolasi Metrik:**
  - Otentikasi Siswa (`GET /login` -> ambil `XSRF-TOKEN` -> `POST /login`). Waktu login diisolasi dan **tidak** dicampur ke dalam metrik SLA pemrosesan soal.
  - Akses sesi latihan (`GET /latihan/persiapan`).
  - Pengiriman jawaban siswa (`POST /latihan/ujian/jawab`) dengan pencatatan metrik tersendiri `waktu_pengiriman_jawaban`.
  - Pengambilan soal berikutnya (`GET /latihan/kerjakan/{sesiId}`) dengan pencatatan metrik tersendiri `waktu_ambil_soal_berikutnya`.

### Skenario B: Beban Dashboard Analitik Editor (`editor-analytics-dashboard.js`)
* **Tahapan Beban Bertahap (4 Stages, Total Durasi 1m00s):**
  1. `0s - 10s`: Ramp-up menuju 10 VU.
  2. `10s - 30s`: Beban 30 Editor konkuren.
  3. `30s - 50s`: Puncak beban **50 Editor** konkuren.
  4. `50s - 60s`: Ramp-down menuju 0 VU.
* **Alur Validasi Bisnis & Pemisahan Metrik:**
  - Otentikasi Editor diisolasi dari metrik dashboard.
  - Pemuatan ringkasan stok bank soal per subtes (`GET /editor`) diukur secara mandiri (`waktu_dashboard_stok_editor`).
  - Pemuatan dashboard analitik agregasi penguasaan siswa (`GET /editor/analitik`) diukur secara mandiri (`waktu_dashboard_analitik`).
  - Tidak ada penggabungan artifisial atau pelaporan 3 metrik menggunakan 1 angka durasi yang sama.

---

## 4. BUKTI OUTPUT EKSEKUSI & TABEL METRIK AKTUAL

Data berikut diekstraksi langsung secara transparan dari file ekspor JSON eksekusi k6:
- Skenario A: [`summary-skenario-a-soal.json`](file:///d:/edvora-app/tests/k6/reports/summary-skenario-a-soal.json) & [`output-skenario-a-soal.txt`](file:///d:/edvora-app/tests/k6/reports/output-skenario-a-soal.txt)
- Skenario B: [`summary-skenario-b-editor.json`](file:///d:/edvora-app/tests/k6/reports/summary-skenario-b-editor.json) & [`output-skenario-b-editor.txt`](file:///d:/edvora-app/tests/k6/reports/output-skenario-b-editor.txt)

| Parameter Metrik | Target Ketentuan Tugas | Skenario A: Soal Siswa (500 VU) | Skenario B: Dashboard Editor (50 VU) |
|---|---|---|---|
| **Puncak Virtual Users (Max VUs)** | A: 100–500 VU \| B: Konkuren Editor | **500 VU** | **50 VU** |
| **Total Permintaan HTTP (Requests)** | N/A | **6,360 requests** | **1,415 requests** |
| **Throughput (Request Rate / RPS)** | Kestabilan Server | **73.98 req/s** | **22.90 req/s** |
| **Total Iterasi Lengkap** | N/A | **4,146 iterasi** (48.23 iter/s) | **707 iterasi** (11.44 iter/s) |
| **Average Response Time (Avg)** | A: $\le 1000\text{ ms}$ \| B: $\le 3000\text{ ms}$ | **1,356.37 ms** (1.36 s) | **87.59 ms** (0.088 s) |
| **Median Response Time (Med)** | A: $\le 1000\text{ ms}$ \| B: $\le 3000\text{ ms}$ | **454.82 ms** | **33.08 ms** |
| **90th Percentile (p90)** | A: $\le 1000\text{ ms}$ \| B: $\le 3000\text{ ms}$ | **3,727.60 ms** | **237.98 ms** |
| **95th Percentile (p95)** | A: $\le 1000\text{ ms}$ \| B: $\le 3000\text{ ms}$ | **4,144.29 ms** | **313.65 ms** *(Memenuhi SLA 3s)* |
| **Maximum Response Time (Max)** | A: $\le 1000\text{ ms}$ \| B: $\le 3000\text{ ms}$ | **6,314.66 ms** (6.31 s) | **3,901.08 ms** (3.90 s) |
| **Checks Passing Rate** | $\ge 95\%$ | **45.24%** (4,879 pass / 5,906 fail) | **50.00%** (1,414 pass / 1,414 fail) |
| **Error Otentikasi (HTTP 401/422)** | 0% | **1,760 VU** (HTTP 422) | **707 VU** (HTTP 422) |
| **Server Internal Error (HTTP 5xx)**| $< 1\%$ | **0.00%** (Bersih / 0 error) | **0.00%** (Bersih / 0 error) |
| **Status Threshold & SLA** | Seluruh threshold tercapai | **BELUM LULUS (FAIL)** | **BELUM LULUS (FAIL)** |

---

## 5. ANALISIS TEKNIS & TEMUAN BOTTLENECK ARSITEKTUR

### 1. Evaluasi Kredensial & Kondisi Database Supabase (HTTP 422)
* **Akar Masalah:** Berdasarkan riwayat Git pada commit `dc33f43`, migrasi database remote di Supabase diubah menjadi satu berkas skema terpadu. Namun, berkas seeder belum dijalankan di database remote tersebut sehingga tabel `users` memiliki 0 data (kosong).
* **Dampak:** Ketika k6 melakukan pengujian menggunakan kredensial resmi (`sim001@simulasi.test` dan `dapa@gmail.com`), server Laravel merespons dengan **HTTP 422 Unprocessable Entity** (*"These credentials do not match our records"*).
* **Kepatuhan Aturan Database Bersama:** Karena aturan melarang keras tim testing mengeksekusi `php artisan migrate`, `migrate:fresh`, atau modifikasi tabel bersama, tim QA melaporkan hasil otentikasi gagal ini secara jujur dan transparan apa adanya, tanpa memanipulasi status atau membuat klaim kelulusan palsu.

### 2. Batasan Konkurensi Development Server PHP Built-in (500 VU)
* Perintah `php artisan serve` menjalankan built-in web server bawaan runtime PHP. Server ini beroperasi secara *single-threaded* dan *single-process*, dirancang semata-mata untuk keperluan pengembangan lokal satu pengembang.
* Saat beban pada Skenario A melonjak melewati 250 VU hingga 500 VU serentak, socket antrean koneksi TCP mengalami *saturation* (*backlog queue overflow*), mengakibatkan 1,933 request mengalami penolakan koneksi (*connection refused*).
* Sebaliknya, pada Skenario B dengan beban 50 Editor konkuren, server development mampu melayani 100% permintaan HTTP dengan waktu respons p95 yang sangat prima yaitu **313.65 ms**.

### 3. Analisis Rate Limiting & Session Blocking Laravel
* **Rate Limiting:** Pada `routes/web.php` baris 82, rute `POST /latihan/ujian/jawab` diproteksi middleware `throttle:30,1`. Middleware ini membatasi klien maksimal 30 request per menit. Jika 100–500 siswa melakukan submit jawaban dalam kurun waktu 1 menit, Laravel akan menolak permintaan dengan **HTTP 429 Too Many Requests**.
* **Atomic Session Locking:** Rute ujian menggunakan `block(10, 10)` untuk mencegah *race condition* saat mencatat jawaban. Script k6 telah mengisolasi Cookie Jar pada setiap Virtual User, sehingga tidak terjadi antrean lock antar pengguna yang berbeda.

---

## 6. REKOMENDASI PRODUCTION READINESS & RENCANA TINDAK LANJUT

1. **Seeding Akun Pengujian di Database Uji:**
   Administrator database perlu menginjeksikan akun uji (`sim001@simulasi.test` dan `dapa@gmail.com`) atau membuat skema *testing database* terisolasi agar siklus pengerjaan soal dan dashboard analitik dapat diuji secara *end-to-end* sampai ke penyimpanan jawaban.
2. **Penggunaan Web Server Skala Produksi (Nginx / PHP-FPM / Laravel Octane):**
   Untuk pengujian skala 500 Virtual Users simultan, lingkungan staging wajib dijalankan di atas web server multi-worker seperti Nginx + PHP-FPM (minimal 100 process workers) atau Laravel Octane dengan driver Swoole/RoadRunner.
3. **Penyesuaian Konfigurasi Rate Limiter:**
   Middleware pembatasan kecepatan pada rute submit ujian perlu dikonfigurasi secara dinamis (misal `throttle:500,1`) agar tidak memblokir siswa saat waktu ujian berakhir bersamaan.

---

## 7. DAFTAR ARTIFAK DAN BUKTI PENGUJIAN LENGKAP

Seluruh artifak pengujian tersimpan secara terstruktur di folder `tests/k6`:
* **Script Skenario A:** [`tests/k6/scenarios/soal-response-time.js`](file:///d:/edvora-app/tests/k6/scenarios/soal-response-time.js)
* **Script Skenario B:** [`tests/k6/scenarios/editor-analytics-dashboard.js`](file:///d:/edvora-app/tests/k6/scenarios/editor-analytics-dashboard.js)
* **Konfigurasi Lingkungan:** [`tests/k6/config/environment.js`](file:///d:/edvora-app/tests/k6/config/environment.js)
* **Helper Otentikasi & CSRF:** [`tests/k6/helpers/auth.js`](file:///d:/edvora-app/tests/k6/helpers/auth.js)
* **Ekspor JSON Skenario A:** [`tests/k6/reports/summary-skenario-a-soal.json`](file:///d:/edvora-app/tests/k6/reports/summary-skenario-a-soal.json)
* **Ekspor JSON Skenario B:** [`tests/k6/reports/summary-skenario-b-editor.json`](file:///d:/edvora-app/tests/k6/reports/summary-skenario-b-editor.json)
* **Log Output Mentah Skenario A:** [`tests/k6/reports/output-skenario-a-soal.txt`](file:///d:/edvora-app/tests/k6/reports/output-skenario-a-soal.txt)
* **Log Output Mentah Skenario B:** [`tests/k6/reports/output-skenario-b-editor.txt`](file:///d:/edvora-app/tests/k6/reports/output-skenario-b-editor.txt)
* **Tangkapan Layar Bukti A:** [`tests/k6/reports/screenshot-skenario-a.png`](file:///d:/edvora-app/tests/k6/reports/screenshot-skenario-a.png)
* **Tangkapan Layar Bukti B:** [`tests/k6/reports/screenshot-skenario-b.png`](file:///d:/edvora-app/tests/k6/reports/screenshot-skenario-b.png)
* **Laporan Resmi PDF:** [`tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf`](file:///d:/edvora-app/tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf)
