# Pengujian k6 Edvora

Jalankan perintah dari folder utama `edvora-app`. Gunakan hanya URL staging dan akun/data uji yang sudah disiapkan tim. Jangan jalankan `php artisan migrate`.

## Analitik Editor

Script mengukur `GET /editor/analitik`, melakukan login Editor sekali di tahap setup, lalu memakai sesi itu untuk request baca paralel. Isi variabel login di terminal, jangan masukkan password ke source code:

```powershell
$env:BASE_URL = "https://STAGING-ANDA"
$env:EDITOR_EMAIL = "akun-editor-uji@example.test"
$env:EDITOR_PASSWORD = "PASSWORD-UJI"
$env:MAX_VUS = "100"
k6 run tests/load/editor-dashboard.js
```

Setelah smoke test 100 VU berhasil, ubah `MAX_VUS` menjadi `500` dan jalankan ulang. Ambang lulus: p95 `editor_dashboard_ms` di bawah 3000 ms, dengan tingkat request gagal di bawah 1%. Setup menggunakan satu sesi Editor bersama untuk semua VU agar tidak membanjiri endpoint login dan terkena rate limit.

## Pengiriman jawaban

Endpoint jawaban memakai sesi login siswa dan `sesiId` pengerjaan yang sudah ada. Siapkan satu baris unik per VU: akun siswa, sesi fleksibel yang masih berjalan milik akun itu, soal dalam sesi tersebut, dan jawaban valid. Jawaban disimpan ke database; siapkan data uji khusus dan jangan gunakan sesi/soal yang dibutuhkan orang lain. Setiap VU hanya mengirim satu jawaban supaya tidak mengulang request pada baris jawaban yang sama.

Salin `answer-users.example.json` menjadi `answer-users.json`, lalu lengkapi dengan data uji. File tersebut tidak boleh di-commit karena berisi kredensial:

```powershell
Copy-Item tests/load/answer-users.example.json tests/load/answer-users.json
$env:BASE_URL = "https://STAGING-ANDA"
$env:ANSWER_USERS_FILE = "tests/load/answer-users.json"
$env:MAX_VUS = "1"
k6 run tests/load/answer-flow.js
```

Mulai dengan `MAX_VUS=1`. Naikkan ke 100 setelah satu jawaban berhasil, lalu ke 500 hanya jika tersedia minimal 500 akun/sesi/soal unik yang disiapkan tim. Ambang lulus: p95 `answer_response_ms` di bawah 1000 ms dan request gagal di bawah 1%.

## Catatan pengukuran

Rute `POST /latihan/ujian/jawab` mengembalikan umpan balik jawaban. Aplikasi memindahkan siswa ke soal berikutnya di sisi antarmuka; endpoint ini sendiri tidak mengirim soal berikutnya. Karena itu script mengukur durasi request jawaban sampai respons server diterima.

Hasil dari laptop mengukur server sekaligus kemampuan laptop menjalankan k6. Untuk laporan kapasitas server yang representatif, jalankan dari mesin uji yang memadai dan catat spesifikasi serta lokasi jaringan penguji.
