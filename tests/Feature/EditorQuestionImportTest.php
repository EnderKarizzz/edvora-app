<?php

namespace Tests\Feature;

use App\Models\AdminEditor;
use App\Models\Soal;
use App\Models\Subtes;
use App\Models\Topik;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

class EditorQuestionImportTest extends TestCase
{
    use DatabaseTransactions;

    public function test_editor_imports_500_valid_questions_as_draft(): void
    {
        [$editor, $subtes, $topik] = $this->buatKonteks();
        $file = $this->buatFileExcel($subtes->kode_subtes, $topik, 500);

        $response = $this->actingAs($editor)->post(route('editor.soal.upload', $subtes->kode_subtes), [
            'file' => $file,
        ]);

        $response->assertOk()
            ->assertJsonPath('baru', 500)
            ->assertJsonPath('diperbarui', 0);

        $this->assertSame(500, Soal::where('subtes_id', $subtes->id)->count());
        $this->assertSame(500, Soal::where('subtes_id', $subtes->id)->where('status', 'draft')->count());
    }

    public function test_invalid_answer_key_rejects_entire_file_without_saving_questions(): void
    {
        [$editor, $subtes, $topik] = $this->buatKonteks();
        $file = $this->buatFileExcel($subtes->kode_subtes, $topik, 2, invalidKeyOnRow: 2);

        $response = $this->actingAs($editor)->post(route('editor.soal.upload', $subtes->kode_subtes), [
            'file' => $file,
        ]);

        $response->assertUnprocessable()
            ->assertJsonPath('valid', false)
            ->assertJsonPath('barisError', 1);

        $this->assertSame(0, Soal::where('subtes_id', $subtes->id)->count());
    }

    /** @return array{User, Subtes, string} */
    private function buatKonteks(): array
    {
        $editor = User::create([
            'name' => 'Editor PHPUnit',
            'email' => 'phpunit-'.str()->uuid().'@example.test',
            'password' => str()->random(32),
            'role' => 'admin_editor',
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        AdminEditor::create(['user_id' => $editor->id, 'nama_lengkap' => 'Editor PHPUnit']);

        // kode_subtes dan awalan kode_soal hanya boleh berisi huruf kapital.
        $hurufAcak = implode('', array_map(fn () => chr(random_int(65, 90)), range(1, 5)));
        $kode = 'T'.$hurufAcak;
        $subtes = Subtes::create([
            'nama_subtes' => 'Subtes PHPUnit '.$kode,
            'deskripsi' => 'Data sementara untuk pengujian upload.',
            'urutan' => ((int) Subtes::max('urutan')) + 1,
            'waktu_default_menit' => 30,
            'kode_subtes' => $kode,
            'jumlah_soal' => 500,
        ]);
        $namaTopik = 'Topik PHPUnit '.str()->uuid();
        Topik::create([
            'subtes_id' => $subtes->id,
            'nama_topik' => $namaTopik,
            'urutan' => 1,
        ]);

        return [$editor, $subtes, $namaTopik];
    }

    private function buatFileExcel(string $kodeSubtes, string $namaTopik, int $jumlah, ?int $invalidKeyOnRow = null): UploadedFile
    {
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Soal');
        $headers = [
            'Nama Subtes', 'Topik', 'Kode Soal', 'Tipe Soal', 'Teks Soal', 'Gambar Soal',
            'Opsi A - Teks', 'Opsi A - Gambar', 'Opsi B - Teks', 'Opsi B - Gambar',
            'Opsi C - Teks', 'Opsi C - Gambar', 'Opsi D - Teks', 'Opsi D - Gambar',
            'Opsi E - Teks', 'Opsi E - Gambar', 'Kolom Tabel', 'Kunci Jawaban', 'Hint',
            'Pembahasan', 'Gambar Pembahasan', 'Tingkat Kesulitan',
        ];
        $sheet->fromArray($headers, null, 'A1');

        for ($i = 1; $i <= $jumlah; $i++) {
            $row = [
                $kodeSubtes, $namaTopik, sprintf('%s-%04d', $kodeSubtes, $i), 'pilihan_ganda',
                'Teks soal '.$i, null, 'Opsi benar', null, 'Opsi salah', null,
                null, null, null, null, null, null, null,
                $i === $invalidKeyOnRow ? 'Z' : 'A', null, 'Pembahasan '.$i, null, 'Mudah',
            ];
            $sheet->fromArray($row, null, 'A'.($i + 1));
        }

        $topicSheet = $spreadsheet->createSheet();
        $topicSheet->setTitle('Topik');
        $topicSheet->fromArray(['Nama Subtes', 'Nama Topik', 'Urutan'], null, 'A1');
        $topicSheet->fromArray([$kodeSubtes, $namaTopik, 1], null, 'A2');

        $path = tempnam(sys_get_temp_dir(), 'edvora-upload-');
        if ($path === false) {
            $spreadsheet->disconnectWorksheets();
            throw new \RuntimeException('Tidak dapat membuat file sementara untuk Excel.');
        }

        try {
            (new Xlsx($spreadsheet))->save($path);
            $content = file_get_contents($path);
            if ($content === false) {
                throw new \RuntimeException('Tidak dapat membaca file Excel sementara.');
            }

            return UploadedFile::fake()->createWithContent('soal.xlsx', $content);
        } finally {
            @unlink($path);
            $spreadsheet->disconnectWorksheets();
        }
    }
}
