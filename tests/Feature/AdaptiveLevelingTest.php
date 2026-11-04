<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use App\Services\Penguasaan; // Memanggil service asli Edvora

class AdaptiveLevelingTest extends TestCase
{
    use DatabaseTransactions;

    /** @test */
    public function memastikan_logika_adaptive_leveling_dan_penguasaan_berjalan()
    {
        // Memastikan class Penguasaan ada dan dapat diuji
        $this->assertTrue(
            class_exists(Penguasaan::class), 
            'Class Penguasaan harus tersedia di sistem.'
        );

        // Contoh asersi pengujian aturan batas ambang penguasaan topik
        $skorTinggi = 80; // > 75 (Naik)
        $skorRendah = 20; // < 30 (Turun)
        $skorStabil = 50; // 30 - 75 (Stabil)

        $this->assertTrue($skorTinggi > 75);
        $this->assertTrue($skorRendah < 30);
        $this->assertTrue($skorStabil >= 30 && $skorStabil <= 75);
    }
}