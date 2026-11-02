<?php

namespace Tests\Unit;

use App\Services\RekomendasiTopik;
use PHPUnit\Framework\TestCase;

class RekomendasiTopikTest extends TestCase
{
    // ===== Rekomendasi Topik =====

    public function test_urut_skor_sementara_lalu_proporsi_lalu_urutan(): void
    {
        $urut = RekomendasiTopik::urutkan([
            $this->topik('A', skor: 40.0, proporsi: 0.25, urutan: 1),
            $this->topik('B', skor: 40.0, proporsi: 0.30, urutan: 2),
            $this->topik('C', skor: 20.0, proporsi: 0.20, urutan: 3),
            $this->topik('D', skor: 40.0, proporsi: 0.30, urutan: 0),
        ]);

        $this->assertSame(
            ['C', 'D', 'B', 'A'],
            array_column($urut, 'id')
        );
    }

    public function test_topik_tanpa_jawaban_tanpa_soal_atau_dikuasai_dibuang(): void
    {
        $urut = RekomendasiTopik::urutkan([
            $this->topik('A', skor: null),
            $this->topik('B', skor: 50.0, adaSoal: false),
            $this->topik('C', skor: 90.0, label: 'dikuasai'),
            $this->topik('D', skor: 60.0),
        ]);

        $this->assertSame(
            ['D'],
            array_column($urut, 'id')
        );
    }

    public function test_per_subtes_maksimal_tiga(): void
    {
        $topik = array_map(
            fn ($i) => $this->topik(
                "T{$i}",
                skor: $i * 10.0,
                urutan: $i
            ),
            range(1, 5)
        );

        $this->assertSame(
            ['T1', 'T2', 'T3'],
            array_column(
                RekomendasiTopik::untukSubtes($topik),
                'id'
            )
        );
    }

    public function test_beranda_tiga_teratas_lintas_subtes_dengan_kode_subtes(): void
    {
        $subtes = collect([
            (object) ['id' => 's1', 'kode_subtes' => 'PU'],
            (object) ['id' => 's2', 'kode_subtes' => 'PK'],
        ]);

        $perSubtes = [
            's1' => [
                $this->topik('A', skor: 50.0),
                $this->topik('B', skor: 10.0),
            ],
            's2' => [
                $this->topik('C', skor: 30.0),
                $this->topik('D', skor: 70.0),
            ],
        ];

        $hasil = (new RekomendasiTopik)->teratas(
            $subtes,
            $perSubtes
        );

        $this->assertSame(
            ['B', 'C', 'A'],
            array_column($hasil, 'id')
        );

        $this->assertSame(
            ['PU', 'PK', 'PU'],
            array_column($hasil, 'kodeSubtes')
        );
    }

    private function topik(
        string $id,
        ?float $skor,
        float $proporsi = 0.0,
        int $urutan = 1,
        bool $adaSoal = true,
        string $label = 'belum_dikuasai'
    ): array {
        return [
            'id' => $id,
            'adaSoal' => $adaSoal,
            'skorSementara' => $skor,
            'proporsi' => $proporsi,
            'urutan' => $urutan,
            'label' => $label,
        ];
    }
}
