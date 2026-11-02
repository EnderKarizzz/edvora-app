<?php

namespace App\Http\Controllers;

use App\Models\Subtes;
use App\Services\ImportSoalExcel;
use App\Services\PengunggahGambarSoal;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

/**
 * Upload Bank Soal (massal) di halaman Bank Soal, dengan importer yang sama seperti edvora:import-soal.
 *
 * Browser mengirim file ke periksa() untuk menampilkan hasil validasi, lalu mengirim file yang sama ke simpan(),
 * yang memeriksanya sekali lagi sebelum menyimpan. Server tidak menyimpan file sementara. Soal baru masuk sebagai
 * Draft; soal yang kodenya sudah ada diperbarui tanpa mengubah statusnya. Jawabannya JSON karena dipanggil dari
 * modal lewat axios, bukan navigasi halaman.
 */
class UploadSoalController extends Controller
{
    // Desain: "Template maks. 500 baris".
    public const MAKS_BARIS = 500;

    // Kelompok masalah yang dikirim ke browser; sisanya cukup disebut jumlahnya.
    private const MAKS_MASALAH = 50;

    // Batas waktu periksa() dan simpan() dalam detik. Validasi mengunduh semua link gambar dan memanggil database
    // Supabase yang jauh, jadi file besar (mis. 500 soal dengan ±100 gambar) bisa lebih dari 30 detik bawaan php.ini.
    private const BATAS_DETIK = 120;

    public function template(): BinaryFileResponse
    {
        abort_unless(is_file(self::pathTemplate()), 404, 'Template belum dipasang di server.');

        return response()->download(self::pathTemplate());
    }

    public static function pathTemplate(): string
    {
        return storage_path('app/template/TemplateSoalExcel.xlsx');
    }

    public function periksa(Request $request, Subtes $subtes, ImportSoalExcel $importer): JsonResponse
    {
        $hasil = $this->periksaFile($request, $subtes, $importer);

        if ($hasil === null) {
            return self::fileTidakTerbaca();
        }

        return response()->json(self::ringkasan($hasil, $subtes->kode_subtes));
    }

    /**
     * Langkah 3 modal upload: satu gambar yang disebut Excel tetapi belum ada di Storage, diunggah dengan nama persis
     * dari Excel. Browser memilih file dari folder yang dipilih editor dan mengirimnya satu per satu.
     */
    public function gambar(Request $request, Subtes $subtes, PengunggahGambarSoal $pengunggah): JsonResponse
    {
        $data = $request->validate([
            'path' => ['required', 'string', 'max:200'],
            'file' => ['required', 'file', 'max:1024'],
        ], [
            'path.required' => 'Nama gambar dari Excel tidak terkirim. Muat ulang halaman.',
            'file.required' => 'Pilih gambar dulu.',
            'file.uploaded' => 'Gagal diunggah. Ukuran maksimal 1 MB.',
            'file.file' => 'Gagal diunggah. Ukuran maksimal 1 MB.',
            'file.max' => 'Ukuran maksimal 1 MB. Kecilkan dulu, mis. dengan squoosh.app.',
        ]);

        if ($masalah = PengunggahGambarSoal::masalahPathExcel($data['path'], $subtes->kode_subtes)) {
            return response()->json(['pesan' => $masalah], 422);
        }

        try {
            $hasil = $pengunggah->unggahDenganNama($request->file('file')->get(), $data['path']);
        } catch (Throwable $e) {
            report($e);

            return response()->json(['pesan' => 'Gagal disimpan ke Storage. Coba lagi; bila terus gagal, hubungi tim BE.'], 502);
        }

        return $hasil['masalah']
            ? response()->json(['pesan' => $hasil['masalah']], 422)
            : response()->json(['url' => $hasil['url']]);
    }

    public function simpan(Request $request, Subtes $subtes, ImportSoalExcel $importer): JsonResponse
    {
        $hasil = $this->periksaFile($request, $subtes, $importer);

        if ($hasil === null) {
            return self::fileTidakTerbaca();
        }

        $ringkasan = self::ringkasan($hasil, $subtes->kode_subtes);

        if (! $ringkasan['valid']) {
            return response()->json($ringkasan, 422);
        }

        try {
            $jumlah = $importer->simpan($hasil['soal'], $hasil['topik'], editorId: Auth::id());
        } catch (QueryException $e) {
            report($e);

            return response()->json(['pesan' => 'Soal gagal disimpan karena masalah database. Tidak ada yang tersimpan; coba lagi.'], 500);
        } catch (RuntimeException $e) {
            // Mis. opsi yang dihapus sudah pernah dipilih siswa.
            return response()->json(['pesan' => "Tidak ada yang tersimpan: {$e->getMessage()}"], 422);
        }

        return response()->json([
            'baru' => $jumlah['baru'],
            'diperbarui' => $jumlah['diperbarui'],
            'topikBaru' => $jumlah['topik_baru'],
        ]);
    }

    /** @return array<string, mixed>|null hasil periksa(); null bila file tidak bisa dibaca sebagai .xlsx */
    private function periksaFile(Request $request, Subtes $subtes, ImportSoalExcel $importer): ?array
    {
        // Hitungan waktu mulai dari nol di sini, jadi simpan() juga mendapat waktu penuh untuk menyimpan.
        set_time_limit(self::BATAS_DETIK);

        $request->validate([
            'file' => ['required', 'file', 'extensions:xlsx', 'max:2048'],
        ], [
            'file.required' => 'Pilih file Excel (.xlsx) dulu.',
            'file.uploaded' => 'File gagal diunggah. Ukuran maksimal 2 MB.',
            'file.file' => 'File gagal diunggah. Ukuran maksimal 2 MB.',
            'file.extensions' => 'File harus berformat .xlsx. Simpan ulang dari Excel sebagai Excel Workbook (.xlsx).',
            'file.max' => 'Ukuran file maksimal 2 MB.',
        ]);

        try {
            $hasil = $importer->periksa($request->file('file')->getRealPath(), self::MAKS_BARIS);
        } catch (QueryException $e) {
            // Masalah database bukan masalah file.
            throw $e;
        } catch (Throwable) {
            // File rusak, bukan .xlsx, atau terkunci kata sandi: kesalahan pengguna, tidak perlu dicatat di log.
            return null;
        }

        return ImportSoalExcel::batasiSubtes($hasil, $subtes->kode_subtes);
    }

    /**
     * Hasil periksa() untuk modal upload: jumlah soal, masalah yang dikelompokkan, peringatan, dan gambar yang
     * disebut Excel tetapi belum ada di Storage (path relatif bucket, hanya folder subtes ini).
     *
     * @param  array<string, mixed>  $hasil
     * @return array<string, mixed>
     */
    private static function ringkasan(array $hasil, string $kodeSubtes): array
    {
        $dasar = rtrim((string) config('services.supabase.url_gambar_soal'), '/').'/';
        $gambarKurang = array_values(array_unique(array_filter(
            array_map(fn ($url) => str_starts_with($url, $dasar) ? substr($url, strlen($dasar)) : '', $hasil['gambar_belum_ada'] ?? []),
            fn ($path) => PengunggahGambarSoal::masalahPathExcel($path, $kodeSubtes) === null,
        )));
        sort($gambarKurang, SORT_NATURAL);

        $baru = array_values(array_filter($hasil['soal'], fn ($s) => ! $s['sudah_ada']));
        $diperbarui = array_values(array_filter($hasil['soal'], fn ($s) => $s['sudah_ada']));
        $masalah = ImportSoalExcel::kelompokkanMasalah($hasil['error']);
        $kosong = $hasil['soal'] === [] && $hasil['topik'] === [] && $hasil['error'] === [];

        return [
            'valid' => $hasil['error'] === [] && ! $kosong,
            'pesan' => $kosong ? 'Tidak ada soal di sheet Soal. Isi soal mulai baris 2, di bawah judul kolom.' : null,
            'jumlahSoal' => count($hasil['soal']),
            'baru' => count($baru),
            'diperbarui' => count($diperbarui),
            // Kode yang akan menimpa soal yang sudah ada, supaya editor sadar sebelum menyimpan.
            'kodeDiperbarui' => array_slice(array_column($diperbarui, 'kode_soal'), 0, 30),
            'jumlahTopik' => count($hasil['topik']),
            'barisError' => count(array_unique(array_filter(array_column($hasil['error'], 'baris')))),
            'jumlahMasalah' => count($masalah),
            'masalah' => array_slice($masalah, 0, self::MAKS_MASALAH),
            'gambarKurang' => $gambarKurang,
            'peringatan' => [
                ...$hasil['peringatan'],
                ...array_map(fn ($p) => "Baris {$p['baris']} ({$p['kolom']}): {$p['pesan']}", ImportSoalExcel::kelompokkanMasalah($hasil['peringatan_baris'])),
            ],
        ];
    }

    private static function fileTidakTerbaca(): JsonResponse
    {
        return response()->json(['pesan' => 'File tidak bisa dibaca sebagai Excel (.xlsx). Pastikan file tidak rusak dan tidak sedang dikunci kata sandi.'], 422);
    }
}
