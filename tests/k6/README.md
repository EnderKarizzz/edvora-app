# Panduan Load & Performance Testing EDVORA (Grafana k6)

**Bagian Tugas:** Indah (Senior QA Automation Engineer — Load & Performance Testing)  
**Branch Pekerjaan:** `test/indah-k6`  
**Target Repository:** `https://github.com/EnderKarizzz/edvora-app`  

---

## 1. Ruang Lingkup Pengujian

Pengujian beban dan performa dilakukan secara terpisah untuk dua skenario utama aplikasi EDVORA sesuai ketentuan spesifikasi tugas:

| Skenario | Deskripsi | Target Virtual Users | Target SLA (Batas Waktu) | File Script k6 |
|---|---|---|---|---|
| **Skenario A** | **Batas Waktu Respons Soal**<br>Simulasi pengiriman jawaban bersamaan oleh siswa & pemunculan soal berikutnya. | 100 – 500 VU | **Maksimal 1 detik** (1000 ms) | `tests/k6/scenarios/soal-response-time.js` |
| **Skenario B** | **Beban Dashboard Analitik Editor**<br>Pemuatan ringkasan stok bank soal & pemetaan rata-rata penguasaan siswa. | 10 – 100 VU | **Maksimal 3 detik** (3000 ms) | `tests/k6/scenarios/editor-analytics-dashboard.js` |
| **Master Runner** | Eksekusi terpadu multi-skenario (A & B). | Skalabilitas gabungan | SLA spesifik per skenario | `tests/k6/run-all.js` |

---

## 2. Struktur Direktori

```text
tests/k6/
├── config/
│   └── environment.js                 # URL base, credentials, stages ramp-up, target SLA
├── helpers/
│   └── auth.js                        # Helper login, cookie jar handler, CSRF/XSRF token extraction
├── scenarios/
│   ├── soal-response-time.js          # Script Skenario A (Siswa: Jawab Soal & Soal Berikutnya)
│   └── editor-analytics-dashboard.js  # Script Skenario B (Editor: Dashboard Analitik)
├── run-all.js                         # Runner gabungan kedua skenario
└── README.md                          # Dokumentasi lengkap petunjuk eksekusi & analisis
```

---

## 3. Konfigurasi Lingkungan & Keamanan Kredensial

Demi menjaga keamanan kredensial dan mematuhi aturan repository, **tidak ada kata sandi yang di-hardcode** dalam kode script. Seluruh kredensial dibaca melalui environment variables k6 (`-e` atau `__ENV`).

### Kredensial Default yang Disediakan:
- **Siswa (Skenario A):**
  - Email: `sim001@simulasi.test`
  - Password: `SimulasiEdvora2026`
- **Editor (Skenario B):**
  - Email: `dapa@gmail.com`
  - Password: `12345678`

---

## 4. Cara Menjalankan Pengujian

Jalankan perintah pengujian dari **root direktori proyek** (`d:\edvora-app`):

### A. Menjalankan Skenario A (Batas Waktu Respons Soal)
```bash
# Menjalankan dengan beban bertahap (Ramping VUs hingga 500 VU)
.\tools\k6\k6.exe run tests/k6/scenarios/soal-response-time.js

# Menjalankan dengan target URL kustom atau kredensial env:
.\tools\k6\k6.exe run -e BASE_URL=http://127.0.0.1:8000 -e SISWA_EMAIL=sim001@simulasi.test tests/k6/scenarios/soal-response-time.js

# Menjalankan smoke test singkat (verifikasi cepat 5-10 VU):
.\tools\k6\k6.exe run --vus 10 --duration 30s tests/k6/scenarios/soal-response-time.js
```

### B. Menjalankan Skenario B (Beban Dashboard Analitik Editor)
```bash
# Menjalankan skenario Dashboard Analitik Editor (Ramping VUs hingga 100 VU)
.\tools\k6\k6.exe run tests/k6/scenarios/editor-analytics-dashboard.js

# Menjalankan smoke test singkat (10 VU, 30 detik):
.\tools\k6\k6.exe run --vus 10 --duration 30s tests/k6/scenarios/editor-analytics-dashboard.js
```

### C. Menjalankan Master Runner (Seluruh Skenario Sekaligus)
```bash
.\tools\k6\k6.exe run tests/k6/run-all.js
```

---

## 5. Metrik yang Diukur dan Kriteria Ambang Batas (Thresholds)

| Metrik k6 | Deskripsi | Ambang Batas / SLA |
|---|---|---|
| `http_req_duration (Skenario A)` | Total waktu respons HTTP untuk siklus soal siswa | `p(95) < 1000ms`, `max < 1000ms` |
| `waktu_proses_jawaban` | Waktu pemrosesan pengiriman jawaban oleh backend | `p(95) < 1000ms` |
| `waktu_ambil_soal_berikutnya` | Waktu pemunculan soal berikutnya setelah jawaban dikirim | `p(95) < 1000ms` |
| `http_req_duration (Skenario B)` | Total waktu pemuatan dashboard analitik editor | `p(95) < 3000ms`, `max < 3000ms` |
| `editor_analitik_duration` | Waktu respons endpoint `/editor/analitik` | `p(95) < 3000ms` |
| `stok_bank_soal_duration` | Waktu pemrosesan ringkasan stok bank soal | `p(95) < 3000ms` |
| `penguasaan_siswa_duration` | Waktu pemrosesan agregasi pemetaan penguasaan siswa | `p(95) < 3000ms` |
| `http_req_failed` | Tingkat kegagalan request HTTP (error rate) | `< 1%` |

> **Catatan Kriteria Evaluasi (p95 vs Max):**  
> Sesuai standar industri Performance Engineering, metrik **p95 (95th percentile)** diusulkan sebagai indikator penerimaan utama performa sistem terhadap fluktuasi jaringan, sedangkan metrik **Maximum Response Time** dievaluasi untuk mendeteksi outlier ekstrem.

---

## 6. Temuan Teknis & Catatan Database Bersama

1. **Kepatuhan Aturan Database Bersama:**  
   - Tidak ada perintah `php artisan migrate`, `migrate:fresh`, atau reset database yang dijalankan.
   - Script pengujian k6 hanya melakukan interaksi melalui antarmuka HTTP/API resmi.
2. **Middleware Rate Limiting (`throttle:30,1`):**  
   - Pada `routes/web.php` rute `POST /latihan/ujian/jawab` terpasang middleware `throttle:30,1` (maksimal 30 request per menit per akun/IP). Pada pengujian skala 100–500 VU, server akan mengembalikan respons `429 Too Many Requests` apabila rate limiter tidak disesuaikan pada environment staging/testing.
3. **Session Blocking (`block(10, 10)`):**  
   - Controller menggunakan session locking Laravel (`block(10, 10)`). Setiap Virtual User di k6 harus menggunakan instance cookie jar terpisah agar request tidak saling menunggu lock sesi yang sama.

