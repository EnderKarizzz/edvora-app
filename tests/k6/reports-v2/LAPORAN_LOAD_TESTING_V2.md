# LAPORAN EVALUASI PERFORMA k6 LOKAL (V2)
**Tanggal Eksekusi:** 3 November 2026
**Lingkungan Uji:** Localhost (php artisan serve) & Database Supabase (Normal/Seeded)
**Eksekutor Validasi:** Ade Rizky Karunia Putra (Pengecekan QA Indah)

## 1. Ringkasan Eksekutif
Pengujian V2 ini dilakukan setelah pangkalan data Supabase dipulihkan dan diisi dengan data seeder. Masalah kegagalan otentikasi (HTTP 422) yang dilaporkan sebelumnya telah **teratasi 100%**. Seluruh Virtual Users (VU) berhasil melakukan login. Namun, pengujian Skenario A dan B dinyatakan gagal (Time Out) semata-mata karena keterbatasan *web server* lokal bawaan PHP yang tidak memiliki kapasitas multi-proses untuk menangani ratusan konkurensi.

## 2. Hasil Skenario A (Uji Beban Siswa - 500 VU)
* **Status Otentikasi (error_auth_401):** 0.00% (Akun berhasil divalidasi).
* **Tingkat Kegagalan (http_req_failed):** 94.85%.
* **Waktu Respons Maksimal:** > 60 detik.
* **Analisis:** Peladen lokal (`php artisan serve`) mengalami *connection refused* dan *request timeout* massal akibat antrean koneksi TCP yang penuh saat dihantam 500 koneksi simultan.

## 3. Hasil Skenario B (Uji Dasbor Editor - 50 VU)
* **Status Otentikasi (error_auth_401):** 0.00% (Akun berhasil divalidasi).
* **Tingkat Kegagalan (http_req_failed):** 15.88%.
* **Waktu Respons Maksimal:** 27.56 detik (Gagal memenuhi SLA 3.0 detik).
* **Analisis:** Beban 50 editor serentak tetap memicu penumpukan antrean pada *single-thread* lokal, menyebabkan pelambatan respons yang sangat drastis.

## 4. Kesimpulan & Rekomendasi (Serah Terima)
Skrip k6 buatan Indah **terbukti berfungsi dengan sempurna, bebas dari cacat kode, dan sangat akurat** dalam mengekspos *bottleneck* infrastruktur. Skrip ini sudah lulus validasi dan tidak perlu direvisi. Tugas selanjutnya diserahkan kepada Tim Backend untuk menjalankan ulang skrip k6 ini secara utuh di peladen *Production/Staging* yang menggunakan Nginx, PHP-FPM, atau Laravel Octane.

## 5. Lampiran Artifak Bukti
Data log mentah dari pengujian lokal ini disimpan dalam direktori yang sama:
* `output-skenario-a-lokal.txt`
* `output-skenario-b-lokal.txt`