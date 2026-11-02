
<?php

namespace Tests\Unit;

use App\Services\Penguasaan;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class PenguasaanTest extends TestCase
{
    private int $nomorSoal = 0;

    public function test_contoh_bagian_8_dokumen_konsep(): void
    {
        $jendela = [
            ...$this->jawaban('mudah', 3, benar: 3),
            ...$this->jawaban('mudah', 1, benar: 1, hint: 1),
            ...$this->jawaban('mudah', 1, benar: 1),
            ...$this->jawaban('mudah', 1, benar: 0),
            ...$this->jawaban('mudah', 2, benar: 2),
            ...$this->jawaban('sedang', 2, benar: 2),
            ...$this->jawaban('sedang', 1, benar: 0),
            ...$this->jawaban('sedang', 1, benar: 1, hint: 1),
            ...$this->jawaban('sedang', 2, benar: 2),
            ...$this->jawaban('sedang', 1, benar: 0),
            ...$this->jawaban('sulit', 1, benar: 1),
            ...$this->jawaban('sulit', 1, benar: 0),
            ...$this->jawaban('sulit', 1, benar: 1),
            ...$this->jawaban('sulit', 1, benar: 1, hint: 1),
            ...$this->jawaban('sulit', 1, benar: 0),
        ];

        // Bobot 1/2/3: 100 × 23 / 37
        $this->assertSame(62.16, Penguasaan::skorJendela($jendela));
    }

    public function test_semua_benar_bernilai_100_di_tingkat_apa_pun(): void
    {
        $this->assertSame(100.0, Penguasaan::skorJendela(
            $this->jawaban('mudah', 20, benar: 20)
        ));

        $this->assertSame(100.0, Penguasaan::skorJendela(
            $this->jawaban('sedang', 20, benar: 20)
        ));

        $this->assertSame(100.0, Penguasaan::skorJendela(
            $this->jawaban('sulit', 20, benar: 20)
        ));
    }

    public function test_rumus_memberi_bobot_lebih_pada_soal_sulit(): void
    {
        // Sulit benar, mudah benar dengan hint, sedang salah.
        // 100 × 3,5 / 6 = 58,33.

        $jawaban = [
            ...$this->jawaban('sulit', 1, benar: 1),
            ...$this->jawaban('mudah', 1, benar: 1, hint: 1),
            ...$this->jawaban('sedang', 1, benar: 0),
        ];

        $this->assertSame(58.33, Penguasaan::skor($jawaban));
    }

    public function test_nilai_jawaban(): void
    {
        $this->assertSame(1.0, Penguasaan::nilai(true, false));
        $this->assertSame(0.5, Penguasaan::nilai(true, true));
        $this->assertSame(0.0, Penguasaan::nilai(false, true));
    }

    public function test_tingkat_tidak_dikenal_ditolak(): void
    {
        $this->expectException(InvalidArgumentException::class);

        Penguasaan::skor([
            [
                'soal' => 'PM-001',
                'tingkat' => 'esai',
                'benar' => true,
            ],
        ]);
    }

    public function test_belum_dinilai_sebelum_jendela_berisi_20_jawaban(): void
    {
        $jendela = $this->jawaban('mudah', 19, benar: 19);

        $skor = Penguasaan::skorJendela($jendela);

        $this->assertNull($skor);
        $this->assertNull(Penguasaan::isiLingkaran($skor));
        $this->assertSame('belum_cukup_data', Penguasaan::label(1, $skor));
        $this->assertSame(1, Penguasaan::tahapBerikutnya(1, $skor));
    }

    public function test_naik_bila_skor_di_atas_75(): void
    {
        $this->assertSame(
            2,
            Penguasaan::tahapBerikutnya(
                1,
                $this->skor('mudah', 20, benar: 16)
            )
        );

        // Tepat 75 belum naik.
        $this->assertSame(
            1,
            Penguasaan::tahapBerikutnya(
                1,
                $this->skor('mudah', 20, benar: 15)
            )
        );
    }

    public function test_turun_bila_skor_di_bawah_30(): void
    {
        // 5 dari 20 sedang = 25, turun.
        // 6 dari 20 sedang = 30, tetap.

        $this->assertSame(
            1,
            Penguasaan::tahapBerikutnya(
                2,
                $this->skor('sedang', 20, benar: 5)
            )
        );

        $this->assertSame(
            2,
            Penguasaan::tahapBerikutnya(
                2,
                $this->skor('sedang', 20, benar: 6)
            )
        );
    }

    public function test_tahap_1_tidak_bisa_turun(): void
    {
        $this->assertSame(
            1,
            Penguasaan::tahapBerikutnya(
                1,
                $this->skor('mudah', 20, benar: 0)
            )
        );
    }

    public function test_tahap_3_dikuasai_bila_skor_di_atas_75(): void
    {
        $skor = $this->skor('sulit', 20, benar: 16);

        $this->assertSame(3, Penguasaan::tahapBerikutnya(3, $skor));
        $this->assertTrue(Penguasaan::dikuasai(3, $skor));
        $this->assertSame('dikuasai', Penguasaan::label(3, $skor));
    }

    public function test_skor_tepat_75_mengisi_lingkaran_tetapi_belum_dikuasai(): void
    {
        $skor = $this->skor('sulit', 20, benar: 15);

        $this->assertFalse(Penguasaan::dikuasai(3, $skor));
        $this->assertSame('berkembang', Penguasaan::label(3, $skor));
        $this->assertSame(1.0, Penguasaan::isiLingkaran($skor));
    }

    public function test_label_dibaca_dari_tahap(): void
    {
        $skor = $this->skor('mudah', 20, benar: 20);

        $this->assertSame('belum_dikuasai', Penguasaan::label(1, $skor));
        $this->assertSame('berkembang', Penguasaan::label(2, $skor));

        $this->assertSame(
            'berkembang',
            Penguasaan::label(3, $this->skor('sulit', 20, benar: 10))
        );
    }

    public function test_isi_lingkaran_menuju_batas_naik(): void
    {
        $this->assertSame(
            0.8,
            Penguasaan::isiLingkaran(
                $this->skor('mudah', 20, benar: 12)
            )
        );
    }

    public function test_jawaban_yang_tergeser_keluar_tidak_dihitung_lagi(): void
    {
        $sesi1 = $this->jawaban('mudah', 10, benar: 0);
        $sesi2 = $this->jawaban('mudah', 10, benar: 10);
        $sesi3 = $this->jawaban('mudah', 10, benar: 10);

        $jendela = [];

        foreach ([$sesi1, $sesi2, $sesi3] as $sesi) {
            $jendela = Penguasaan::geserJendela($jendela, $sesi);
        }

        $this->assertSame(
            [
                ...array_column($sesi2, 'soal'),
                ...array_column($sesi3, 'soal'),
            ],
            array_column($jendela, 'soal')
        );

        $this->assertSame(100.0, Penguasaan::skorJendela($jendela));
    }

    /**
     * TAMBAHAN 1:
     * Memastikan hanya 20 jawaban terakhir yang dihitung,
     * meskipun input berisi lebih dari 20 jawaban.
     */
    public function test_hanya_20_jawaban_terakhir_yang_dihitung(): void
    {
        $jendela = [
            ...$this->jawaban('mudah', 1, benar: 0),
            ...$this->jawaban('mudah', 20, benar: 20),
        ];

        $this->assertCount(21, $jendela);

        // Jawaban pertama salah harus dikeluarkan.
        $this->assertSame(
            100.0,
            Penguasaan::skorJendela($jendela)
        );
    }

    /**
     * TAMBAHAN 2:
     * Memastikan pembobotan tetap akurat setelah
     * jawaban lama dikeluarkan dari jendela.
     */
    public function test_pembobotan_diterapkan_pada_20_jawaban_terakhir(): void
    {
        $jendela = [
            ...$this->jawaban('mudah', 1, benar: 0),
            ...$this->jawaban('mudah', 10, benar: 10),
            ...$this->jawaban('sedang', 5, benar: 0),
            ...$this->jawaban('sulit', 5, benar: 5),
        ];

        // Jawaban pertama (mudah dan salah) dikeluarkan.
        //
        // Mudah  : 10 × 1 = 10
        // Sedang :  5 × 2 = 10
        // Sulit  :  5 × 3 = 15
        //
        // Pembilang = 10 + 0 + 15 = 25
        // Penyebut  = 10 + 10 + 15 = 35
        //
        // Skor = (25 / 35) × 100 = 71,43

        $this->assertSame(
            71.43,
            Penguasaan::skorJendela($jendela)
        );
    }

    public function test_di_dalam_sesi_jawaban_masuk_mudah_sedang_sulit_lalu_kode_soal(): void
    {
        $sesi = [
            ['soal' => 'PM-003', 'tingkat' => 'sulit', 'benar' => true],
            ['soal' => 'PM-005', 'tingkat' => 'mudah', 'benar' => true],
            ['soal' => 'PM-001', 'tingkat' => 'sedang', 'benar' => false],
            ['soal' => 'PM-004', 'tingkat' => 'mudah', 'benar' => false],
            ['soal' => 'PM-002', 'tingkat' => 'sedang', 'benar' => true],
        ];

        $jendela = Penguasaan::geserJendela(
            $this->jawaban('mudah', 18, benar: 18),
            $sesi
        );

        $this->assertCount(20, $jendela);

        $this->assertSame(
            ['PM-004', 'PM-005', 'PM-001', 'PM-002', 'PM-003'],
            array_column(array_slice($jendela, -5), 'soal')
        );
    }

    public function test_soal_yang_dijawab_ulang_memakai_jawaban_terbaru(): void
    {
        $lama = $this->jawaban('mudah', 20, benar: 0);

        $ulang = [[
            'soal' => $lama[0]['soal'],
            'tingkat' => 'mudah',
            'benar' => true,
            'hint' => false,
        ]];

        $jendela = Penguasaan::geserJendela($lama, $ulang);

        $this->assertCount(20, $jendela);
        $this->assertSame($lama[0]['soal'], end($jendela)['soal']);
        $this->assertSame(5.0, Penguasaan::skorJendela($jendela));
    }

    /**
     * Jejak lima sesi dengan jendela yang tidak dikosongkan.
     */
    public function test_jejak_lima_sesi(): void
    {
        $sesiList = [
            $this->jawaban('mudah', 10, benar: 8),
            $this->jawaban('mudah', 10, benar: 8),
            [
                ...$this->jawaban('mudah', 4, benar: 4),
                ...$this->jawaban('sedang', 6, benar: 5),
            ],
            [
                ...$this->jawaban('mudah', 2, benar: 2),
                ...$this->jawaban('sedang', 3, benar: 1),
                ...$this->jawaban('sulit', 5, benar: 1),
            ],
            [
                ...$this->jawaban('mudah', 2, benar: 1),
                ...$this->jawaban('sedang', 3, benar: 0),
                ...$this->jawaban('sulit', 5, benar: 0),
            ],
        ];

        $tahap = 1;
        $nDiTahap = 0;
        $jendela = [];
        $jejak = [];

        foreach ($sesiList as $sesi) {
            $jendela = Penguasaan::geserJendela($jendela, $sesi);

            $hasil = Penguasaan::setelahSesi(
                $tahap,
                $jendela,
                $nDiTahap + count($sesi)
            );

            [
                'tahap' => $tahap,
                'n_di_tahap' => $nDiTahap,
            ] = $hasil;

            $jejak[] = [
                $hasil['skor'],
                $tahap,
                $nDiTahap,
            ];
        }

        $this->assertSame([
            [null, 1, 10],
            [80.0, 2, 0],
            [84.62, 3, 0],
            [53.85, 3, 10],
            [17.39, 2, 0],
        ], $jejak);
    }

    public function test_jatah_soal_mengikuti_porsi_tahap(): void
    {
        $this->assertSame(
            ['mudah' => 10],
            Penguasaan::jatahSoal(1, 10)
        );

        $this->assertSame(
            ['mudah' => 4, 'sedang' => 6],
            Penguasaan::jatahSoal(2, 10)
        );

        $this->assertSame(
            ['mudah' => 3, 'sedang' => 4, 'sulit' => 3],
            Penguasaan::jatahSoal(3, 10)
        );
    }

    public function test_sisa_pembulatan_jatah_ke_pecahan_terbesar_lalu_tingkat_tersulit(): void
    {
        $this->assertSame(
            ['mudah' => 3, 'sedang' => 5, 'sulit' => 3],
            Penguasaan::jatahSoal(3, 11)
        );

        $this->assertSame(
            ['mudah' => 5, 'sedang' => 7],
            Penguasaan::jatahSoal(2, 12)
        );

        $this->assertSame(
            ['mudah' => 4, 'sedang' => 6, 'sulit' => 5],
            Penguasaan::jatahSoal(3, 15)
        );
    }

    public function test_jumlah_jatah_selalu_sama_dengan_jumlah_soal(): void
    {
        foreach ([1, 2, 3] as $tahap) {
            for ($jumlah = 10; $jumlah <= 25; $jumlah++) {
                $this->assertSame(
                    $jumlah,
                    array_sum(Penguasaan::jatahSoal($tahap, $jumlah)),
                    "tahap {$tahap}, {$jumlah} soal"
                );
            }
        }
    }

    public function test_soal_di_tahap_bertambah_tiap_sesi_dan_kembali_nol_saat_tahap_berubah(): void
    {
        $sesi1 = Penguasaan::setelahSesi(
            1,
            $this->jawaban('mudah', 10, benar: 10),
            10
        );

        $this->assertSame([
            'tahap' => 1,
            'skor' => null,
            'skor_sementara' => 100.0,
            'n_jendela' => 10,
            'n_di_tahap' => 10,
            'berubah' => false,
        ], $sesi1);

        $sesi2 = Penguasaan::setelahSesi(
            1,
            $this->jawaban('mudah', 20, benar: 20),
            20
        );

        $this->assertSame([
            'tahap' => 2,
            'skor' => 100.0,
            'skor_sementara' => 100.0,
            'n_jendela' => 20,
            'n_di_tahap' => 0,
            'berubah' => true,
        ], $sesi2);
    }

    public function test_skor_sementara_dihitung_sebelum_jendela_penuh(): void
    {
        $jendela = [
            ...$this->jawaban('mudah', 3, benar: 3),
            ...$this->jawaban('sedang', 2, benar: 0),
        ];

        $hasil = Penguasaan::setelahSesi(1, $jendela, 5);

        $this->assertNull($hasil['skor']);
        $this->assertSame(42.86, $hasil['skor_sementara']);
        $this->assertSame(1, $hasil['tahap']);
    }

    public function test_skor_sementara_kosong_bila_jendela_kosong(): void
    {
        $this->assertNull(
            Penguasaan::setelahSesi(1, [], 0)['skor_sementara']
        );
    }

    public function test_persen_subtes_rata_rata_topik_yang_punya_soal(): void
    {
        $topikList = [
            ['adaSoal' => true, 'tahap' => 3, 'skor' => 90.0],
            ['adaSoal' => true, 'tahap' => 1, 'skor' => null],
            ['adaSoal' => true, 'tahap' => 1, 'skor' => null],
            ['adaSoal' => false, 'tahap' => 3, 'skor' => 90.0],
        ];

        $this->assertSame(
            ['persen' => 33.3, 'adaData' => true],
            Penguasaan::persenSubtes($topikList)
        );
    }

    public function test_persen_subtes_nol_tanpa_topik_bersoal(): void
    {
        $this->assertSame(
            ['persen' => 0.0, 'adaData' => false],
            Penguasaan::persenSubtes([])
        );

        $this->assertSame(
            ['persen' => 0.0, 'adaData' => false],
            Penguasaan::persenSubtes([
                ['adaSoal' => false, 'tahap' => 2, 'skor' => 50.0],
            ])
        );
    }

    public function test_persen_subtes_belum_ada_data_bila_semua_topik_belum_cukup_data(): void
    {
        $this->assertSame(
            ['persen' => 0.0, 'adaData' => false],
            Penguasaan::persenSubtes([
                ['adaSoal' => true, 'tahap' => 1, 'skor' => null],
                ['adaSoal' => true, 'tahap' => 1, 'skor' => null],
            ])
        );
    }

    private function skor(
        string $tingkat,
        int $jumlah,
        int $benar
    ): ?float {
        return Penguasaan::skorJendela(
            $this->jawaban($tingkat, $jumlah, $benar)
        );
    }

    /**
     * Membuat jawaban dengan kode soal unik.
     *
     * $benar = jumlah jawaban benar pertama.
     * $hint = jumlah jawaban pertama yang menggunakan hint.
     */
    private function jawaban(
        string $tingkat,
        int $jumlah,
        int $benar,
        int $hint = 0
    ): array {
        $hasil = [];

        for ($i = 0; $i < $jumlah; $i++) {
            $hasil[] = [
                'soal' => sprintf('PK-%03d', ++$this->nomorSoal),
                'tingkat' => $tingkat,
                'benar' => $i < $benar,
                'hint' => $i < $hint,
            ];
        }

        return $hasil;
    }
}
