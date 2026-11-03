<?php

namespace Tests\Feature;

use App\Models\Avatar;
use App\Models\AvatarSiswa;
use App\Models\Siswa;
use App\Models\TransaksiPoin;
use App\Models\User;
use App\Services\TokoAvatar;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Test Transaksi Database Terpusat: pembelian avatar (TokoAvatar::beli).
 * Memakai DatabaseTransactions (BUKAN RefreshDatabase) karena database dipakai bersama satu tim.
 * Jangan jalankan php artisan migrate.
 */
class TokoAvatarBeliTest extends TestCase

{
    use DatabaseTransactions;

    private TokoAvatar $toko;

    protected function setUp(): void
    {
        parent::setUp();
        $this->toko = app(TokoAvatar::class);
    }

    private function buatSiswa(int $point, int $xp = 0): Siswa
    {
        $user = User::factory()->create();

        return Siswa::create([
            'user_id'       => $user->id,
            'nama_lengkap'  => 'Siswa Test',
            'kelas'         => '12',
            'jenis_kelamin' => 'laki-laki',
            'xp'            => $xp,
            'point'         => $point,
        ]);
    }

    private function buatAvatar(int $harga, int $levelMinimal = 1): Avatar
    {
        return Avatar::create([
            'nama'             => 'Avatar Test ' . Str::random(6),
            'gambar_perempuan' => '/images/avatar/test-p.webp',
            'gambar_laki_laki' => '/images/avatar/test-l.webp',
            'harga_point'      => $harga,
            'level_minimal'    => $levelMinimal,
        ]);
    }

    private function jumlahTransaksi(string $userId): int
    {
        return TransaksiPoin::where('user_id', $userId)->count();
    }

    public function test_beli_berhasil_jika_point_cukup(): void
    {
        $siswa  = $this->buatSiswa(500);
        $avatar = $this->buatAvatar(200);

        $hasil = $this->toko->beli($siswa->user_id, $avatar->id);

        $this->assertNull($hasil);
        $this->assertEquals(300, $siswa->fresh()->point);
        $this->assertDatabaseHas('siswa_avatar', [
            'user_id'   => $siswa->user_id,
            'avatar_id' => $avatar->id,
        ]);
        $this->assertDatabaseHas('point_transactions', [
            'user_id'     => $siswa->user_id,
            'jumlah'      => -200,
            'sumber_tipe' => 'avatar',
            'avatar_id'   => $avatar->id,
        ]);
    }

    public function test_beli_gagal_dan_dibatalkan_jika_point_tidak_cukup(): void
    {
        $siswa  = $this->buatSiswa(100);
        $avatar = $this->buatAvatar(200);

        $hasil = $this->toko->beli($siswa->user_id, $avatar->id);

        $this->assertEquals('Point tidak mencukupi', $hasil);
        $this->assertEquals(100, $siswa->fresh()->point);
        $this->assertDatabaseMissing('siswa_avatar', [
            'user_id'   => $siswa->user_id,
            'avatar_id' => $avatar->id,
        ]);
        $this->assertEquals(0, $this->jumlahTransaksi($siswa->user_id));
    }

    public function test_beli_berhasil_jika_point_pas_dengan_harga(): void
    {
        $siswa  = $this->buatSiswa(200);
        $avatar = $this->buatAvatar(200);

        $hasil = $this->toko->beli($siswa->user_id, $avatar->id);

        $this->assertNull($hasil);
        $this->assertEquals(0, $siswa->fresh()->point);
    }

    public function test_beli_gagal_jika_point_kurang_satu(): void
    {
        $siswa  = $this->buatSiswa(199);
        $avatar = $this->buatAvatar(200);

        $hasil = $this->toko->beli($siswa->user_id, $avatar->id);

        $this->assertEquals('Point tidak mencukupi', $hasil);
        $this->assertEquals(199, $siswa->fresh()->point);
        $this->assertEquals(0, $this->jumlahTransaksi($siswa->user_id));
    }

    public function test_beli_gagal_jika_level_xp_tidak_mencukupi(): void
    {
        $siswa  = $this->buatSiswa(10000, xp: 0);
        $avatar = $this->buatAvatar(100, levelMinimal: 2);

        $hasil = $this->toko->beli($siswa->user_id, $avatar->id);

        $this->assertEquals('Level XP tidak mencukupi', $hasil);
        $this->assertEquals(10000, $siswa->fresh()->point);
        $this->assertEquals(0, $this->jumlahTransaksi($siswa->user_id));
    }

    public function test_rollback_jika_avatar_sudah_dimiliki(): void
    {
        $siswa  = $this->buatSiswa(500);
        $avatar = $this->buatAvatar(200);

        // Siswa sudah punya avatar ini, sehingga INSERT di dalam beli() melanggar UNIQUE
        // setelah point sempat terpotong di dalam transaksi.
        AvatarSiswa::create([
            'user_id'   => $siswa->user_id,
            'avatar_id' => $avatar->id,
            'dibeli_at' => now(),
        ]);

        $melemparError = false;
        try {
            $this->toko->beli($siswa->user_id, $avatar->id);
        } catch (\Throwable $e) {
            $melemparError = true;
        }

        $this->assertTrue($melemparError, 'Beli ulang seharusnya melempar exception.');
        $this->assertEquals(500, $siswa->fresh()->point, 'Point harus kembali (rollback).');
        $this->assertEquals(0, $this->jumlahTransaksi($siswa->user_id));
        $this->assertEquals(1, AvatarSiswa::where('user_id', $siswa->user_id)->count());
    }

    public function test_avatar_tidak_ada_melempar_exception_dan_point_utuh(): void
    {
        $siswa = $this->buatSiswa(500);

        try {
            $this->toko->beli($siswa->user_id, (string) Str::uuid());
            $this->fail('Seharusnya melempar ModelNotFoundException.');
        } catch (ModelNotFoundException $e) {
            $this->assertTrue(true);
        }

        $this->assertEquals(500, $siswa->fresh()->point);
        $this->assertEquals(0, $this->jumlahTransaksi($siswa->user_id));
    }
}
