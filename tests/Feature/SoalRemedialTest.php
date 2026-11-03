<?php

namespace Tests\Feature;

use App\Models\Siswa;
use App\Models\User;
use App\Services\SoalRemedial;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Test Algoritma Remedial (App\Services\SoalRemedial).
 *
 * Di kode, remedial TIDAK memakai tabel antrean. Daftarnya dihitung dari log jawaban
 * (pengerjaan + jawaban_pengerjaan). Batas 25 hanya berlaku per sesi lewat ambil(),
 * dan soal yang diambil adalah 25 soal yang paling lama menunggu (FIFO menurut waktu salah terakhir).
 *
 * Memakai DatabaseTransactions (BUKAN RefreshDatabase) karena database dipakai bersama satu tim.
 * Jangan jalankan php artisan migrate.
 */
class SoalRemedialTest extends TestCase
{
    use DatabaseTransactions;

    private SoalRemedial $remedial;

    protected function setUp(): void
    {
        parent::setUp();
        $this->remedial = app(SoalRemedial::class);
    }

    // ---------------------------------------------------------------------
    // Helper data test (semua dibuat baru, jadi tidak menyentuh data tim)
    // ---------------------------------------------------------------------

    private function buatSiswa(): string
    {
        $user = User::factory()->create();

        Siswa::create([
            'user_id'       => $user->id,
            'nama_lengkap'  => 'Siswa Test',
            'kelas'         => '12',
            'jenis_kelamin' => 'laki-laki',
            'xp'            => 0,
            'point'         => 0,
        ]);

        return $user->id;
    }

    /** @return array{0: string, 1: string} [subtesId, topikId] */
    private function buatSubtesTopik(): array
    {
        $subtesId = (string) Str::uuid();
        $topikId  = (string) Str::uuid();

        DB::table('subtes')->insert([
            'id'                  => $subtesId,
            'nama_subtes'         => 'Subtes Test ' . Str::random(6),
            'urutan'              => 1,
            'waktu_default_menit' => 30,
            'kode_subtes'         => 'T' . Str::random(8),
            'jumlah_soal'         => 10,
        ]);

        DB::table('topik')->insert([
            'id'        => $topikId,
            'subtes_id' => $subtesId,
            'nama_topik' => 'Topik Test ' . Str::random(6),
            'urutan'    => 1,
        ]);

        return [$subtesId, $topikId];
    }

    /** @return string[] id soal, urut sesuai pembuatan */
    private function buatSoal(string $subtesId, string $topikId, int $jumlah = 1, string $status = 'published'): array
    {
        $ids  = [];
        $baris = [];

        for ($i = 0; $i < $jumlah; $i++) {
            $id    = (string) Str::uuid();
            $ids[] = $id;

            $baris[] = [
                'id'                => $id,
                'kode_soal'         => 'T-' . Str::random(12),
                'subtes_id'         => $subtesId,
                'topik_id'          => $topikId,
                'tipe'              => 'isian_singkat', // butuh kunci_jawaban, dan tanpa opsi
                'teks_soal'         => 'Soal test',
                'kunci_jawaban'     => 'a',
                'pembahasan'        => 'Pembahasan test',
                'tingkat_kesulitan' => 'mudah',
                'status'            => $status,
            ];
        }

        DB::table('soal')->insert($baris);

        return $ids;
    }

    /**
     * Satu pengerjaan + satu jawaban per soal. Waktu selesai soal ke-i = $mulai + i menit,
     * supaya urutan FIFO-nya pasti.
     *
     * @param  string[]  $soalIds
     * @param  string|null  $mode  'fleksibel' | 'simulasi' | 'remedial' | null (null = bukan latihan, mis. Try Out)
     */
    private function catatJawaban(
        string $userId,
        string $subtesId,
        array $soalIds,
        ?string $mode,
        bool $benar,
        ?Carbon $mulai = null,
        string $status = 'selesai',
    ): void {
        $mulai ??= Carbon::parse('2026-01-01 08:00:00');

        $pengerjaan = [];
        $jawaban    = [];

        foreach ($soalIds as $i => $soalId) {
            $pengerjaanId = (string) Str::uuid();

            $pengerjaan[] = [
                'id'                  => $pengerjaanId,
                'user_id'             => $userId,
                'tipe'                => 'latihan_bebas',
                'status'              => $status,
                'subtes_id'           => $subtesId,
                'jumlah_soal_dipilih' => 1,
                'started_at'          => $mulai->copy()->addMinutes($i)->toDateTimeString(),
                'finished_at'         => $status === 'selesai' ? $mulai->copy()->addMinutes($i)->toDateTimeString() : null,
                'mode_latihan'        => $mode,
                'total_skor'          => 0,
            ];

            $jawaban[] = [
                'id'           => (string) Str::uuid(),
                'pengerjaan_id' => $pengerjaanId,
                'soal_id'      => $soalId,
                'is_correct'   => $benar,
            ];
        }

        DB::table('pengerjaan')->insert($pengerjaan);
        DB::table('jawaban_pengerjaan')->insert($jawaban);
    }

    /** @return string[] id soal dari ambil(), sudah diurutkan supaya bisa dibandingkan (urutan tampil diacak) */
    private function ambilUrut(string $userId, string $subtesId): array
    {
        $ids = $this->remedial->ambil($userId, $subtesId);
        sort($ids);

        return $ids;
    }

    // ---------------------------------------------------------------------
    // Soal masuk daftar remedial
    // ---------------------------------------------------------------------

    public function test_jawaban_salah_mode_fleksibel_masuk_remedial(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId, $topikId] = $this->buatSubtesTopik();
        [$soalId] = $this->buatSoal($subtesId, $topikId);

        $this->catatJawaban($userId, $subtesId, [$soalId], 'fleksibel', false);

        $this->assertEquals(1, $this->remedial->jumlah($userId, $subtesId));
        $this->assertEquals([$soalId], $this->remedial->ambil($userId, $subtesId));
    }

    public function test_jawaban_salah_mode_simulasi_masuk_remedial(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId, $topikId] = $this->buatSubtesTopik();
        [$soalId] = $this->buatSoal($subtesId, $topikId);

        $this->catatJawaban($userId, $subtesId, [$soalId], 'simulasi', false);

        $this->assertEquals(1, $this->remedial->jumlah($userId, $subtesId));
        $this->assertEquals([$soalId], $this->remedial->ambil($userId, $subtesId));
    }

    public function test_jawaban_benar_tidak_masuk_remedial(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId, $topikId] = $this->buatSubtesTopik();
        [$soalId] = $this->buatSoal($subtesId, $topikId);

        $this->catatJawaban($userId, $subtesId, [$soalId], 'fleksibel', true);

        $this->assertEquals(0, $this->remedial->jumlah($userId, $subtesId));
        $this->assertEquals([], $this->remedial->ambil($userId, $subtesId));
    }

    public function test_tanpa_jawaban_salah_daftar_kosong(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId] = $this->buatSubtesTopik();

        $this->assertEquals(0, $this->remedial->jumlah($userId, $subtesId));
        $this->assertEquals([], $this->remedial->ambil($userId, $subtesId));
        $this->assertEquals([], $this->remedial->jumlahPerSubtes($userId));
    }

    // ---------------------------------------------------------------------
    // Soal keluar atau tidak ikut daftar remedial
    // ---------------------------------------------------------------------

    public function test_soal_keluar_dari_remedial_setelah_dijawab_benar(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId, $topikId] = $this->buatSubtesTopik();
        [$soalId] = $this->buatSoal($subtesId, $topikId);

        $this->catatJawaban($userId, $subtesId, [$soalId], 'fleksibel', false);
        $this->assertEquals(1, $this->remedial->jumlah($userId, $subtesId));

        // Dikerjakan ulang di sesi remedial dan kali ini benar.
        $this->catatJawaban($userId, $subtesId, [$soalId], 'remedial', true, Carbon::parse('2026-02-01 08:00:00'));

        $this->assertEquals(0, $this->remedial->jumlah($userId, $subtesId));
    }

    public function test_jawaban_salah_di_try_out_tidak_masuk_remedial(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId, $topikId] = $this->buatSubtesTopik();
        [$soalId] = $this->buatSoal($subtesId, $topikId);

        // mode_latihan null = bukan latihan (Try Out).
        $this->catatJawaban($userId, $subtesId, [$soalId], null, false);

        $this->assertEquals(0, $this->remedial->jumlah($userId, $subtesId));
    }

    public function test_pengerjaan_yang_masih_berjalan_tidak_dihitung(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId, $topikId] = $this->buatSubtesTopik();
        [$soalId] = $this->buatSoal($subtesId, $topikId);

        $this->catatJawaban($userId, $subtesId, [$soalId], 'fleksibel', false, null, 'berjalan');

        $this->assertEquals(0, $this->remedial->jumlah($userId, $subtesId));
    }

    public function test_soal_draft_tidak_masuk_remedial(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId, $topikId] = $this->buatSubtesTopik();
        [$soalId] = $this->buatSoal($subtesId, $topikId, 1, 'draft');

        $this->catatJawaban($userId, $subtesId, [$soalId], 'fleksibel', false);

        $this->assertEquals(0, $this->remedial->jumlah($userId, $subtesId));
    }

    // ---------------------------------------------------------------------
    // Batas 25 soal per sesi dan urutan FIFO
    // ---------------------------------------------------------------------

    public function test_25_soal_semuanya_diambil_tidak_ada_yang_dibuang(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId, $topikId] = $this->buatSubtesTopik();
        $soalIds = $this->buatSoal($subtesId, $topikId, 25);

        $this->catatJawaban($userId, $subtesId, $soalIds, 'fleksibel', false);

        $diambil = $this->ambilUrut($userId, $subtesId);
        sort($soalIds);

        $this->assertEquals(25, $this->remedial->jumlah($userId, $subtesId));
        $this->assertEquals($soalIds, $diambil);
    }

    public function test_lebih_dari_25_soal_diambil_25_yang_paling_lama(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId, $topikId] = $this->buatSubtesTopik();
        $soalIds = $this->buatSoal($subtesId, $topikId, 30);

        // Soal ke-0 paling lama salah, soal ke-29 paling baru.
        $this->catatJawaban($userId, $subtesId, $soalIds, 'fleksibel', false);

        // Daftar remedial tidak dibatasi, hanya satu sesi yang dibatasi 25.
        $this->assertEquals(30, $this->remedial->jumlah($userId, $subtesId));

        $diambil  = $this->ambilUrut($userId, $subtesId);
        $diharapkan = array_slice($soalIds, 0, 25);
        sort($diharapkan);

        $this->assertCount(25, $diambil);
        $this->assertEquals($diharapkan, $diambil);

        // 5 soal terbaru menunggu sesi berikutnya.
        foreach (array_slice($soalIds, 25) as $soalBaru) {
            $this->assertNotContains($soalBaru, $diambil);
        }
    }

    public function test_soal_yang_salah_lagi_di_remedial_pindah_ke_belakang_antrean(): void
    {
        $userId = $this->buatSiswa();
        [$subtesId, $topikId] = $this->buatSubtesTopik();
        $soalIds = $this->buatSoal($subtesId, $topikId, 26);

        $this->catatJawaban($userId, $subtesId, $soalIds, 'fleksibel', false);

        // Tanpa perubahan, 25 teratas adalah soal ke-0 sampai ke-24 (soal ke-25 tersisih).
        // Soal ke-0 salah lagi di remedial dengan waktu paling baru, jadi pindah ke belakang.
        $this->catatJawaban($userId, $subtesId, [$soalIds[0]], 'remedial', false, Carbon::parse('2026-02-01 08:00:00'));

        $diambil = $this->ambilUrut($userId, $subtesId);

        $this->assertCount(25, $diambil);
        $this->assertNotContains($soalIds[0], $diambil, 'Soal yang salah lagi harus pindah ke belakang.');
        $this->assertContains($soalIds[25], $diambil, 'Soal terbaru kini masuk 25 teratas.');
    }

    // ---------------------------------------------------------------------
    // Isolasi per siswa dan per subtes
    // ---------------------------------------------------------------------

    public function test_jumlah_per_subtes_tidak_mencampur_siswa_dan_subtes_lain(): void
    {
        $userA = $this->buatSiswa();
        $userB = $this->buatSiswa();

        [$subtes1, $topik1] = $this->buatSubtesTopik();
        [$subtes2, $topik2] = $this->buatSubtesTopik();

        $soal1 = $this->buatSoal($subtes1, $topik1, 3);
        $soal2 = $this->buatSoal($subtes2, $topik2, 1);

        // Siswa A: 2 salah di subtes 1, 1 salah di subtes 2.
        $this->catatJawaban($userA, $subtes1, [$soal1[0], $soal1[1]], 'fleksibel', false);
        $this->catatJawaban($userA, $subtes2, [$soal2[0]], 'simulasi', false);

        // Siswa B: salah di soal ke-2 subtes 1 (tidak boleh ikut terhitung untuk A).
        $this->catatJawaban($userB, $subtes1, [$soal1[2]], 'fleksibel', false);

        $this->assertEquals([$subtes1 => 2, $subtes2 => 1], $this->remedial->jumlahPerSubtes($userA));
        $this->assertEquals(2, $this->remedial->jumlah($userA, $subtes1));
        $this->assertEquals(1, $this->remedial->jumlah($userB, $subtes1));
        $this->assertEquals(0, $this->remedial->jumlah($userB, $subtes2));
    }
}
