# LAPORAN RESMI HASIL AUTOMATION TESTING EDVORA
**Pengujian Performa & Kapasitas Beban Puncak: Evaluasi 500 Virtual Users (VU)**

* **Aplikasi:** Sistem Ujian & Simulasi UTBK EDVORA (Laravel 11 + React Inertia.js)
* **Penanggung Jawab:** Indah
* **Branch Git:** `test/indah-k6`
* **Target Environment:** `http://127.0.0.1:8001` (Nginx 1.26.2 + 48 FastCGI Workers PHP 8.5.11)
* **Database Target:** PostgreSQL 17.11 Terisolasi (`127.0.0.1:5433`, `edvora_loadtest_isolated`)
* **Waktu Pelaksanaan:** 4 November 2026
* **Status Evaluasi:** **100% FUNGSIONAL RELIABEL (0 ERROR) | TIDAK MEMENUHI SLA THRESHOLD (FAIL SLA)**

---

## 1. Executive Summary

Rangkaian automation load testing pada aplikasi EDVORA telah diselesaikan secara komprehensif mulai dari **Stage 1 (Smoke 5 VU)**, **Stage 2 (Checkpoint 250 VU)**, hingga **Stage 3 (Target Load 500 VU)** selama 180 detik (3 menit).

Tujuan pengujian adalah untuk **menguji, mengukur, dan mendokumentasikan batas kapasitas aktual arsitektur EDVORA** saat melayani hingga 500 siswa bersamaan tanpa melakukan optimasi atau modifikasi aturan bisnis aplikasi.

### Ringkasan Temuan Utama:
1. **Keandalan Arsitektur & Fungsionalitas (100% Lulus):**
   * Total request tercatat pada Stage 3: **13.382 HTTP request**.
   * HTTP failure rate: **0,00%** (0 request gagal, tidak ada error 500, 502, 504, maupun 429).
   * Seluruh **48 worker PHP-CGI aktif stabil** tanpa crash (uptime 100%).
   * Dropped iterations tercatat **0**. Sebanyak **5.941 iterasi pengerjaan siswa** diselesaikan penuh.
   * Sebanyak **2.975 butir jawaban siswa baru** berhasil divalidasi dan tersimpan konsisten ke database PostgreSQL tanpa bentrok konkurensi (`jawaban_pengerjaan` naik dari 4.815 menjadi 7.790).
   * Seluruh 501 sesi pengerjaan tetap berstatus `berjalan` (100% patuh aturan keselamatan: tidak ada panggilan ke endpoint finalisasi `/latihan/simpan`).
2. **Kepatuhan Waktu Respons terhadap SLA (Gagal SLA):**
   * Target SLA: Waktu respons p95 $\le 1.000\text{ ms}$.
   * Hasil Aktual 500 VU: **Global p95 = 13.077,04 ms (13,08 detik)**, Median (p50) = 3.775,74 ms.
   * Checks success rate tercatat **76,63%** (36.419 passed / 11.109 failed). Seluruh kegagalan check (11.109) murni berasal dari check latensi response time ($> 1.000\text{ ms}$), sedangkan seluruh check fungsionalitas bisnis lulus 100%.
   * Grafana k6 menghasilkan **Exit Code 99** (*Threshold Breach*), sementara PowerShell runner menyelesaikan proses secara graceful dengan **Exit Code 0**.

---

## 2. Tabel Komparasi Hasil Pengujian Bertahap

| Metrik Evaluasi | Stage 1 (Smoke 5 VU) | Stage 2 (Checkpoint 250 VU) | Stage 3 (Target 500 VU) | Standar SLA | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Beban Simultan (VU)** | **5 VU** | **250 VU** | **500 VU** | 500 Siswa | **TERCAPAI** |
| **Durasi Pengujian** | 30 detik | 90 detik | 180 detik (3 menit) | 180s | **LENGKAP** |
| **Total HTTP Requests** | 115 req | 5.908 req | **13.382 req** | - | - |
| **Throughput HTTP** | 3,75 req/s | 61,68 req/s | **69,98 req/s** | - | - |
| **HTTP Failure Rate** | **0,00%** | **0,00%** | **0,00%** | $< 1,00\%$ | **PASS** |
| **Dropped Iterations** | 0 | 0 | **0** | 0 | **PASS** |
| **Checks Success Rate** | 100% | 93,73% | **76,63%** | $> 90,0\%$ | **FAIL SLA** |
| **Duration p50 (Median)**| 185,20 ms | 495,43 ms | **3.775,74 ms** | - | - |
| **Duration p90** | 208,12 ms | 1.764,40 ms | **10.453,44 ms** | - | - |
| **Duration p95 (Global)**| **215,00 ms** | **2.383,97 ms** | **13.077,04 ms** | $\le 1.000\text{ ms}$ | **FAIL SLA** |
| **Duration Max** | 288,50 ms | 7.001,49 ms | **26.851,08 ms** | - | - |
| **Ambil Soal p95** | **188,39 ms** | **2.355,89 ms** | **12.950,10 ms** | $\le 1.000\text{ ms}$ | **FAIL SLA** |
| **Kirim Jawaban p95** | **179,58 ms** | **2.186,39 ms** | **12.324,72 ms** | $\le 1.000\text{ ms}$ | **FAIL SLA** |
| **POST Login p95** | 210,15 ms | 3.912,94 ms | **16.859,16 ms** | - | - |
| **Active PHP-CGI Workers** | 36 / 36 | 48 / 48 | **48 / 48 (0 crash)** | 100% Uptime | **PASS** |
| **Peak DB Connections** | 4 koneksi | 29 koneksi | **42 koneksi** | $\le 200$ | **PASS** |
| **Peak Cluster RAM** | 1.150 MB | 2.220 MB | **2.228,5 MB** | Stabil | **PASS** |
| **Jawaban Baru Tersimpan** | +50 | +1.357 | **+2.975** | Konsisten | **PASS** |
| **Exit Code k6 / Runner**| 0 / 0 | 99 / 0 | **99 / 0** | Code 0 | **FAIL SLA** |

---

## 3. Isolasi Database & Keamanan Lingkungan Uji

Pengujian sepenuhnya mematuhi prinsip *fail-closed runtime isolation*:
* **Host Database:** `127.0.0.1` port `5433` (PostgreSQL 17.11).
* **Database & User:** `edvora_loadtest_isolated` / `edvora_loadtest_app`.
* **Koneksi Remote / Production:** **0 koneksi** (port 6543, port 5432, dan host Supabase tidak pernah disentuh).
* **Konfigurasi Cache:** File `bootstrap/cache/config.php` dipastikan tidak ada (*absent*) untuk mencegah kebocoran koneksi ke database default.
* **Integritas Dataset:** 500 akun siswa unik (`siswa_002@simulasi.test` s.d. `siswa_501@simulasi.test`) dengan UUID sesi ujian unik (`D:\pgsql-loadtest\datasets\students-500vu.json`).

---

## 4. Analisis Bottleneck & Akar Masalah Performa

Meskipun sistem terbukti **100% stabil tanpa crash atau error**, response time membengkak hingga p95 13,08 detik akibat 3 kendala arsitektural:

1. **Antrean Konkurensi FastCGI Worker (Queueing Delay):**
   * Metrik `http_req_waiting` (TTFB) menyumbang $\sim 98\%$ dari durasi request.
   * Dengan 48 worker PHP-CGI single-threaded melayani 500 pengguna aktif, 452 request harus mengantre di buffer Nginx menunggu giliran worker bebas.
2. **Overhead Bcrypt Password Hashing pada Autentikasi:**
   * Konfigurasi `.env.loadtest` menggunakan `BCRYPT_ROUNDS=12`.
   * Komputasi Bcrypt memakan waktu CPU $\sim 200-250\text{ ms}$ per akun. Saat 500 VU login bersamaan, CPU host melonjak ke $\sim 48\%$ dan menciptakan antrean awal yang memperlambat p95 login hingga 16,8 detik.
3. **Volume Payload I/O Sangat Besar pada Pengambilan Soal:**
   * Endpoint `GET /latihan/kerjakan/{id}` merender seluruh komponen Inertia React beserta 20 butir soal lengkap dan opsinya.
   * Dalam 180 detik, pengujian mentransfer total **656,38 MB data**. Transfer data sebesar ini membebani throughput I/O Nginx dan PHP.

---

## 5. Rekomendasi Tindak Lanjut untuk Tim Developer

Hasil pengujian ini diserahkan kepada tim developer untuk ditindaklanjuti dengan rekomendasi arsitektur berikut:

1. **Peningkatan Kapasitas Worker (Multi-Instance / Container):**
   * Di lingkungan production, gunakan cluster PHP-FPM terdistribusi (multi-server atau auto-scaling container pod di Kubernetes/Docker) dengan minimum 100-200 worker prosesor di balik load balancer untuk menyerap konkurensi 500 siswa.
2. **Pemisahan API Soal dari Inertia Full-Page Reload:**
   * Ubah mekanisme pengambilan soal ujian menjadi API JSON ringan (`/api/ujian/{id}/soal`) daripada merender ulang seluruh komponen halaman Inertia.
   * Terapkan caching in-memory (Redis / Memcached) untuk paket soal ujian agar tidak membaca database relasional secara berulang untuk setiap siswa.
3. **Optimasi Login & Session Token:**
   * Gunakan session token atau caching token pengerjaan ujian untuk mengurangi beban re-autentikasi berat.
4. **Connection Pooling Database:**
   * Pertahankan connection pool (seperti PgBouncer) saat scaling di production untuk menjaga utilisasi koneksi PostgreSQL tetap efisien.

---

## 6. Indeks Berkas Bukti Mentah (Evidence Files)

Seluruh bukti mentah (*raw evidence*) tersimpan lengkap dan dapat divalidasi pada direktori `tests/load/reports/500-vu/`:
* `target-500vu-output.txt` (Raw log stdout lengkap 500 VU)
* `target-500vu-summary.json` (Ringkasan metrik machine-readable standar k6)
* `target-500vu-telemetry.json` (121 rekaman sampel time-series telemetri CPU, RAM, DB & Worker)
* `checkpoint-250vu-*` & `smoke-5vu-*` (Bukti tahap 250 VU dan 5 VU)

*Catatan: Seluruh hasil di atas merupakan pengukuran empiris pada lingkungan load testing terisolasi, bukan klaim kapasitas infrastruktur production.*

