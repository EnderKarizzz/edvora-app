# Skenario Testing PHPUnit: Import Excel Soal Editor

**Test otomatis:** `tests/Feature/EditorQuestionImportTest.php`  
**Endpoint:** `POST /editor/bank-soal/{kode_subtes}/upload`  
**Autentikasi:** akun berperan `admin_editor` yang dibuat sementara oleh test.

## Prasyarat

- Dependensi PHP proyek sudah tersedia (`vendor/`).
- Konfigurasi database pengujian dapat diakses.
- Jangan jalankan `php artisan migrate` atau `migrate:fresh` untuk test ini.
- Test menggunakan `DatabaseTransactions`, sehingga perubahan transaksi di-rollback setelah test selesai.
- File `.xlsx` dibuat otomatis oleh PHPUnit; tidak perlu menyiapkan file atau akun Editor manual.

## Skenario

### 1. Tepat 500 soal valid berhasil disimpan sebagai Draft

1. Test membuat akun Editor, subtes, dan topik sementara.
2. Test membentuk workbook dengan 500 baris soal valid.
3. Workbook diunggah ke endpoint melalui request fitur Laravel.
4. Pastikan server merespons sukses dan melaporkan 500 soal baru.
5. Pastikan terdapat 500 soal untuk subtes uji dan seluruhnya berstatus `draft`.

**Ekspektasi:** unggahan diterima; 500 soal tersimpan dengan status awal `draft`.

### 2. Kunci jawaban salah membatalkan seluruh unggahan

1. Test membuat workbook berisi dua soal.
2. Satu baris menggunakan kunci `Z`, sementara opsi yang diisi hanya A dan B.
3. Workbook dikirim ke endpoint unggah.
4. Pastikan server merespons `422 Unprocessable Entity` dan menandai file tidak valid.
5. Pastikan tidak ada soal dari workbook tersebut yang tersimpan.

**Ekspektasi:** seluruh file ditolak; tidak terjadi penyimpanan sebagian.

### 3. Melebihi batas 500 soal ditolak

1. Test membuat workbook berisi 501 soal valid.
2. Workbook dikirim ke endpoint unggah.
3. Pastikan server merespons `422 Unprocessable Entity` dan menandai file tidak valid.
4. Pastikan tidak ada soal dari workbook tersebut yang tersimpan.

**Ekspektasi:** unggahan 501 soal ditolak; tidak ada data soal yang tersimpan.

## Menjalankan test

```powershell
vendor\bin\phpunit tests\Feature\EditorQuestionImportTest.php
```

Hasil yang diharapkan jika semua skenario lulus: `OK (3 tests, ... assertions)`.
