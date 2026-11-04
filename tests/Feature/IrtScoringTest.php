<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Services\EstimasiIrt;
// PENGAMAN MUTLAK: Memastikan database tidak di-reset
use Illuminate\Foundation\Testing\DatabaseTransactions; 

class IrtScoringTest extends TestCase
{
    use DatabaseTransactions; 

    /** @test */
    public function estimasi_skor_tanpa_jawaban_mengembalikan_nol()
    {
        // Berdasarkan kode EstimasiIrt::skor, jika respons kosong, kembalikan SKOR_MIN (0)
        $skorAwal = EstimasiIrt::skor([]);
        $this->assertEquals(0.0, $skorAwal, 'Skor awal tanpa respons harus 0');
    }

    /** @test */
    public function estimasi_eap_menghasilkan_skor_skala_utbk_antara_0_hingga_1000()
    {
        // Format respons sesuai aturan EstimasiIrt: array{a: float, b: float, u: int}
        // u = 1 (jawaban benar), u = 0 (jawaban salah)
        $responsSiswa = [
            ['a' => 1.2, 'b' => -0.5, 'u' => 1],
            ['a' => 0.8, 'b' => 1.0,  'u' => 0],
            ['a' => 1.5, 'b' => 0.2,  'u' => 1],
        ];

        // Kalkulasi skor IRT ke skala UTBK
        $skorAkhir = EstimasiIrt::skor($responsSiswa);

        // Memastikan skor UTBK valid (di antara SKOR_MIN dan SKOR_MAKS)
        $this->assertGreaterThanOrEqual(EstimasiIrt::SKOR_MIN, $skorAkhir);
        $this->assertLessThanOrEqual(EstimasiIrt::SKOR_MAKS, $skorAkhir);
    }
}