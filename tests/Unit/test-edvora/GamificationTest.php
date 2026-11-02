<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use App\Services\PenilaianLatihan; // Import class yang Anda temukan

class GamificationTest extends TestCase
{
    public function test_add_full_xp_and_point_based_on_difficulty()
    {
        // Simulasi: Soal tingkat 'sedang', dijawab 'benar' (true), 'tanpa hint' (false)
        $result = PenilaianLatihan::hadiah('sedang', true, false);

        // Pastikan hasilnya utuh sesuai konstanta di class (XP: 10, Poin: 5)
        $this->assertEquals(10, $result['xp']);
        $this->assertEquals(5, $result['poin']);
    }

    public function test_deduct_xp_and_point_by_50_percent_if_hint_is_used()
    {
        // Simulasi: Soal tingkat 'sedang', dijawab 'benar' (true), 'PAKAI hint' (true)
        $result = PenilaianLatihan::hadiah('sedang', true, true);

        // Pastikan dipotong 50% dan dibulatkan ke bawah (XP: 5, Poin: 2)
        $this->assertEquals(5, $result['xp']);
        $this->assertEquals(2, $result['poin']); // intdiv(5, 2) = 2
    }

    public function test_no_reward_for_wrong_answer()
    {
        // Simulasi tambahan: Dijawab 'salah' (false) pada tingkat 'sulit'
        $result = PenilaianLatihan::hadiah('sulit', false, false);

        // Pastikan dapat 0 jika jawaban salah
        $this->assertEquals(0, $result['xp']);
        $this->assertEquals(0, $result['poin']);
    }
}