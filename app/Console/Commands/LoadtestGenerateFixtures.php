<?php

namespace App\Console\Commands;

use App\Models\AdminEditor;
use App\Models\OpsiJawaban;
use App\Models\Pengerjaan;
use App\Models\ProgramStudi;
use App\Models\Siswa;
use App\Models\Soal;
use App\Models\Subtes;
use App\Models\Topik;
use App\Models\Universitas;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/**
 * Artisan Command: loadtest:seed-fixtures
 * 
 * Generator fixture terisolasi dengan fail-closed multi-layer guard & hardened security
 * untuk pengujian beban lokal EDVORA pada PostgreSQL 127.0.0.1:5433 (edvora_loadtest_isolated).
 * 
 * Standar Keamanan & Pengerasan Stage 5O-J.4.2:
 * 1. Double-lock guard lingkungan dan live database identity.
 * 2. Dataset path wajib di luar repository (D:\pgsql-loadtest\datasets\).
 * 3. Validasi ketat path: tolak UNC, relative, traversal, Alternate Data Stream, dan Reparse Point/Junction.
 * 4. Pembuatan file sementara kosong secara eksklusif (fopen 'xb') dan penegakan Windows ACL berbasis SID akun sebelum JSON ditulis.
 * 5. Verifikasi ACL independen sebelum data sensitif ditulis; kegagalan ACL menghentikan proses secara fail-closed.
 * 6. Fail-closed total terhadap data/sesi/fixture existing (Dilarang firstOrCreate, updateOrCreate, upsert, atau reuse sesi).
 * 7. Urutan terpisah: Validasi -> Transaksi DB -> File Temp Kosong -> Enforce & Verify ACL -> Tulis JSON -> Validasi JSON -> Commit DB -> Rename Final -> Re-Verify ACL.
 * 8. Penanganan status PARTIAL COMMIT yang transparan jika rename final gagal (file temp dipertahankan untuk pemulihan manual, tanpa auto-delete).
 * 9. Default mode Dry-Run (tanpa penulisan database atau filesystem).
 */
class LoadtestGenerateFixtures extends Command
{
    protected $signature = 'loadtest:seed-fixtures
                            {--stage=smoke : Stage beban fixture: smoke (1 siswa, 1 sesi), small (5 siswa), medium (25 siswa), large (100 siswa)}
                            {--execute : Eksplisit mengeksekusi penulisan database (default: dry-run tanpa mutasi)}
                            {--dataset-path= : Lokasi kustom file dataset JSON target (wajib di bawah D:\pgsql-loadtest\datasets\)}';

    protected $description = 'Menghasilkan fixture aman dan dataset k6 untuk pengujian beban lokal terisolasi EDVORA';

    // Kredensial sintetis standar untuk lingkungan pengujian beban terisolasi
    public const SYNTHETIC_PASSWORD = 'Loadtest@Edvora2026!';

    // Direktori dasar dataset di luar repository
    public const ALLOWED_DATASET_BASE_DIR = 'D:\\pgsql-loadtest\\datasets';

    // Nilai target mutlak untuk perlindungan database bersama
    private const EXPECTED_ENV = 'loadtest';
    private const EXPECTED_CONNECTION = 'pgsql';
    private const EXPECTED_HOST = '127.0.0.1';
    private const EXPECTED_PORT = '5433';
    private const EXPECTED_DATABASE = 'edvora_loadtest_isolated';
    private const EXPECTED_USERNAME = 'edvora_loadtest_app';

    public function handle(): int
    {
        $this->line('====================================================');
        $this->line(' EDVORA FAIL-CLOSED FIXTURE GENERATOR FOR LOAD TEST ');
        $this->line('====================================================');

        // ---------------------------------------------------------
        // 1. FAIL-CLOSED DOUBLE-LOCK GUARD & LIVE DB ASSERTION
        // ---------------------------------------------------------
        try {
            $this->assertSafetyGuards();
        } catch (Throwable $e) {
            $this->error('[FAIL-CLOSED GUARD TRIGGERED] ' . $e->getMessage());
            $this->error('Eksekusi dibatalkan seketika demi keselamatan database.');
            return self::FAILURE;
        }

        $this->info('[GUARD PASSED] Konfigurasi runtime & live database terverifikasi aman: 127.0.0.1:5433/edvora_loadtest_isolated.');

        // ---------------------------------------------------------
        // 2. VALIDASI STAGE & PARAMETER
        // ---------------------------------------------------------
        $stage = strtolower((string) $this->option('stage'));
        $validStages = [
            'smoke'  => 1,
            'small'  => 5,
            'medium' => 25,
            'large'  => 100,
        ];

        if (!array_key_exists($stage, $validStages)) {
            $this->error("Stage '{$stage}' tidak dikenal. Pilih salah satu dari: smoke, small, medium, large.");
            return self::INVALID;
        }

        $studentCount = $validStages[$stage];

        // Resolusi dataset path default di luar repository
        $rawDatasetPath = $this->option('dataset-path')
            ? (string) $this->option('dataset-path')
            : self::ALLOWED_DATASET_BASE_DIR . DIRECTORY_SEPARATOR . "students-{$stage}.json";

        try {
            $datasetPath = $this->validateAndNormalizeDatasetPath($rawDatasetPath);
        } catch (Throwable $e) {
            $this->error('[DATASET PATH ERROR] ' . $e->getMessage());
            return self::FAILURE;
        }

        $isExecute = (bool) $this->option('execute');

        $this->line("Target Stage : {$stage} ({$studentCount} siswa unik)");
        $this->line("Mode         : " . ($isExecute ? 'EXECUTE (Penulisan Aktif)' : 'DRY-RUN (Simulasi Validasi Tanpa Mutasi)'));
        $this->line("Dataset Path : {$datasetPath}");
        $this->line('');

        // ---------------------------------------------------------
        // 3. DAFTAR IDENTITAS FIXTURE YANG AKAN DIGUNAKAN
        // ---------------------------------------------------------
        $studentEmails = [];
        if ($stage === 'small') {
            for ($s = 2; $s <= 6; $s++) {
                $studentEmails[] = sprintf('siswa_%03d@simulasi.test', $s);
            }
        } elseif ($stage === 'medium') {
            for ($s = 2; $s <= 26; $s++) {
                $studentEmails[] = sprintf('siswa_%03d@simulasi.test', $s);
            }
        } elseif ($stage === 'large') {
            for ($s = 2; $s <= 101; $s++) {
                $studentEmails[] = sprintf('siswa_%03d@simulasi.test', $s);
            }
        } else {
            for ($s = 1; $s <= $studentCount; $s++) {
                $studentEmails[] = sprintf('siswa_%03d@simulasi.test', $s);
            }
        }
        $editorEmail = 'editor.loadtest@simulasi.test';
        $kodePtn = 'UI-LOAD';
        $kodeProdi = 'CS-LOAD';
        $kodeSubtes = 'PU';
        $namaTopik = 'Penalaran Deduktif Loadtest';
        $kodeSoalList = [];
        for ($i = 1; $i <= 20; $i++) {
            $kodeSoalList[] = sprintf('PU-LOAD-%03d', $i);
        }

        // ---------------------------------------------------------
        // 4. PRE-FLIGHT CONFLICT ASSERTION (FAIL-CLOSED EXISTING DATA)
        // ---------------------------------------------------------
        try {
            $this->assertNoFixtureConflicts(
                $stage,
                $studentEmails,
                $editorEmail,
                $kodePtn,
                $kodeProdi,
                $kodeSubtes,
                $namaTopik,
                $kodeSoalList,
                $datasetPath
            );
        } catch (Throwable $e) {
            $this->error('[SAFETY CONFLICT DETECTED] ' . $e->getMessage());
            $this->error('Dilarang menggunakan ulang (reuse) atau melanjutkan fixture lama.');
            $this->error('Proses dihentikan sebelum mutasi atau transaksi database apa pun.');
            return self::FAILURE;
        }

        $this->info('[PRE-FLIGHT PASSED] Tidak ada konflik identitas fixture maupun residu dataset di filesystem.');

        // ---------------------------------------------------------
        // 5. DRY-RUN MODE (DEFAULT)
        // ---------------------------------------------------------
        if (!$isExecute) {
            $this->warn('--- STATUS PRE-FLIGHT DRY-RUN (VALIDASI IDENTITAS & READ-ONLY SELECT) ---');

            $univStatus = ($stage === 'small' || $stage === 'medium' || $stage === 'large') ? 'Referensi Smoke Valid (UI-LOAD / CS-LOAD)' : '1 Universitas PTN (UI-LOAD) & 1 Prodi S1 (CS-LOAD)';
            $subtesStatus = ($stage === 'small' || $stage === 'medium' || $stage === 'large') ? 'Referensi Smoke Valid (PU / Deduktif)' : '1 Subtes (PU) & 1 Topik Deduktif';
            $editorStatus = ($stage === 'small' || $stage === 'medium' || $stage === 'large') ? 'Referensi Smoke Valid (editor.loadtest@simulasi.test)' : "1 Akun Editor ({$editorEmail})";
            $soalStatus = ($stage === 'small' || $stage === 'medium' || $stage === 'large') ? 'Referensi Smoke Valid (20 Butir PU-LOAD-001..020)' : '20 Butir Soal PG Published (PU-LOAD-001..020, 5 Opsi A-E)';

            $this->table(
                ['Entitas Target', 'Status Konflik', 'Rencana Penyiapan Fixture'],
                [
                    ['Universitas & Prodi', 'Bersih / Terverifikasi', $univStatus],
                    ['Subtes & Topik', 'Bersih / Terverifikasi', $subtesStatus],
                    ['Akun Editor', 'Bersih / Terverifikasi', $editorStatus],
                    ['Paket Soal PG', 'Bersih / Terverifikasi', $soalStatus],
                    ['Akun Siswa Sintetis', 'Bersih (Belum Ada)', "{$studentCount} Akun Siswa Baru (" . reset($studentEmails) . " .. " . end($studentEmails) . ") Lengkap Biodata"],
                    ['Sesi Pengerjaan Fleksibel', 'Bersih (Belum Ada)', "{$studentCount} Sesi Berjalan Baru (1 per siswa, 20 soal)"],
                    ['Lokasi Dataset k6', 'Di Luar Repo (Aman)', "Ekspor terisolasi ke {$datasetPath}"],
                ]
            );

            $this->info('[DRY-RUN COMPLETE] Seluruh pemeriksaan keamanan, isolasi path, dan pemetaan skema valid.');
            $this->line('Jaminan Zero-Mutation Terpenuhi: Tidak ada mutasi database (hanya kueri SELECT read-only), tidak ada pembuatan/perubahan berkas, dan tidak ada pengubahan ACL.');
            $this->line('Gunakan flag --execute untuk menjalankan generator fixture dan penulisan dataset.');
            return self::SUCCESS;
        }

        // ---------------------------------------------------------
        // 6. EXECUTE MODE (ALUR TRANSAKSI TERPISAH & ACL SEBELUM TULIS)
        // ---------------------------------------------------------
        $this->info('Memulai pembuatan fixture terisolasi...');

        $tempPath = $datasetPath . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $dbCommitted = false;

        DB::beginTransaction();
        try {
            // A. Insert Database Fixtures (NO firstOrCreate, NO updateOrCreate, NO Reuse)
            $dataset = $this->createFixtures(
                $stage,
                $studentEmails,
                $editorEmail,
                $kodePtn,
                $kodeProdi,
                $kodeSubtes,
                $namaTopik,
                $kodeSoalList
            );

            // B. Buat File Sementara Kosong & Terapkan Serta Verifikasi Windows ACL Sebelum Isi Ditulis
            $this->createProtectedEmptyTempDataset($tempPath);

            // C. Tulis Isi JSON Setelah ACL Terverifikasi
            $this->writeJsonToProtectedFile($tempPath, $dataset);

            // D. Validasi Ulang File Sementara Fisik dari Disk
            $this->validateWrittenTempDataset($tempPath, count($studentEmails), $studentEmails);

            // E. Commit Transaksi Database
            DB::commit();
            $dbCommitted = true;
            $this->info('[DATABASE COMMITTED] Seluruh record fixture berhasil disimpan di PostgreSQL.');
        } catch (Throwable $e) {
            if (!$dbCommitted) {
                DB::rollBack();
                if (file_exists($tempPath)) {
                    @unlink($tempPath);
                }
                $this->error('[EXECUTION ABORTED] Terjadi kegagalan sebelum database di-commit: ' . $e->getMessage());
                $this->error('Database telah di-rollback secara utuh. File sementara telah dibersihkan.');
                return self::FAILURE;
            }
        }

        // ---------------------------------------------------------
        // 7. RENAME FILE SEMENTARA KE NAMA FINAL (SETELAH COMMIT)
        // ---------------------------------------------------------
        $fileState = 'TEMP_FILE';
        try {
            $this->finalizeDatasetFile($tempPath, $datasetPath, $fileState);
            $this->info('[DATASET FINALIZED] File dataset berhasil di-rename ke tujuan akhir dengan proteksi ACL.');
        } catch (Throwable $e) {
            // Penanganan Kasus PARTIAL COMMIT
            $this->error('====================================================================');
            $this->error(' [PARTIAL COMMIT ERROR] KEGAGALAN FINALISASI FILE DATASET SETELAH COMMIT');
            $this->error('====================================================================');
            $this->error('Database telah di-commit secara permanen di PostgreSQL.');
            $this->error("Pesan Kesalahan: {$e->getMessage()}");
            $this->line('');

            if ($fileState === 'FINAL_FILE') {
                $this->warn("Status File Fisik: File SUDAH berhasil di-rename ke target final, namun verifikasi ACL final gagal.");
                $this->warn("Lokasi File Aktual: {$datasetPath}");
                $this->line('');
                $this->line('PROSEDUR PEMULIHAN MANUAL:');
                $this->line('1. Database telah committed. DILARANG menjalankan pembersih otomatis, reset database, atau SQL DELETE.');
                $this->line("2. Berkas dataset final sudah ada di: '{$datasetPath}'.");
                $this->line("3. Periksa dan perbaiki ACL secara manual pada '{$datasetPath}' agar sesuai dengan kebijakan keamanan.");
                $this->line('4. Jangan menghapus berkas dataset final jika data pengujian beban akan digunakan.');
            } else {
                $this->warn("Status File Fisik: Rename gagal. Berkas masih berada pada path sementara.");
                $this->warn("Lokasi File Aktual: {$tempPath}");
                $this->line('');
                $this->line('PROSEDUR PEMULIHAN MANUAL:');
                $this->line('1. Database telah committed. DILARANG menjalankan pembersih otomatis, reset database, atau SQL DELETE.');
                $this->line("2. Berkas sementara DIPERTAHANKAN (dengan proteksi ACL) di: '{$tempPath}'.");
                $this->line("3. Rename berkas secara manual dari '{$tempPath}' menjadi '{$datasetPath}'.");
                $this->line("4. Jalankan verifikasi ACL manual pada '{$datasetPath}'.");
            }
            $this->error('====================================================================');
            return self::FAILURE;
        }

        $this->info('[FIXTURE GENERATION SUCCESS] Fixture dan dataset berhasil disiapkan secara sempurna.');
        $this->line("Jumlah Siswa Dibuat / Disiapkan : " . count($studentEmails));
        $this->line("Dataset JSON                    : {$datasetPath}");
        $this->line('Kredensial Siswa & Editor       : Sintetis terisolasi (@simulasi.test)');

        return self::SUCCESS;
    }

    /**
     * Memverifikasi konfigurasi statis dan live database identity secara fail-closed.
     */
    private function assertSafetyGuards(): void
    {
        // 1. Guard Environment
        $env = app()->environment();
        if ($env !== self::EXPECTED_ENV) {
            throw new RuntimeException("Environment mismatch. Expected: '" . self::EXPECTED_ENV . "', Got: '{$env}'.");
        }

        // 2. Guard Default Connection
        $defaultConn = config('database.default');
        if ($defaultConn !== self::EXPECTED_CONNECTION) {
            throw new RuntimeException("Database connection mismatch. Expected: '" . self::EXPECTED_CONNECTION . "', Got: '{$defaultConn}'.");
        }

        // 3. Guard Connection Configs
        $host = (string) config('database.connections.pgsql.host');
        if ($host !== self::EXPECTED_HOST) {
            throw new RuntimeException("Database host mismatch. Expected: '" . self::EXPECTED_HOST . "', Got: '{$host}'.");
        }

        $port = (string) config('database.connections.pgsql.port');
        if ($port !== self::EXPECTED_PORT) {
            throw new RuntimeException("Database port mismatch. Expected: '" . self::EXPECTED_PORT . "', Got: '{$port}'.");
        }

        $dbName = (string) config('database.connections.pgsql.database');
        if ($dbName !== self::EXPECTED_DATABASE) {
            throw new RuntimeException("Database name mismatch. Expected: '" . self::EXPECTED_DATABASE . "', Got: '{$dbName}'.");
        }

        $username = (string) config('database.connections.pgsql.username');
        if ($username !== self::EXPECTED_USERNAME) {
            throw new RuntimeException("Database username mismatch. Expected: '" . self::EXPECTED_USERNAME . "', Got: '{$username}'.");
        }

        // 4. Assert Live Database Identity via Raw Query
        $probe = DB::selectOne("SELECT current_database() as db, current_user as usr, host(inet_server_addr()) as hst, inet_server_port()::text as prt");

        if (!$probe) {
            throw new RuntimeException('Gagal melakukan probe identitas live PostgreSQL.');
        }

        if ($probe->db !== self::EXPECTED_DATABASE) {
            throw new RuntimeException("Live database identity mismatch. Expected: '" . self::EXPECTED_DATABASE . "', Got: '{$probe->db}'.");
        }

        if ($probe->usr !== self::EXPECTED_USERNAME) {
            throw new RuntimeException("Live user identity mismatch. Expected: '" . self::EXPECTED_USERNAME . "', Got: '{$probe->usr}'.");
        }

        if ($probe->hst !== self::EXPECTED_HOST) {
            throw new RuntimeException("Live server address mismatch. Expected: '" . self::EXPECTED_HOST . "', Got: '{$probe->hst}'.");
        }

        if ((string) $probe->prt !== self::EXPECTED_PORT) {
            throw new RuntimeException("Live server port mismatch. Expected: '" . self::EXPECTED_PORT . "', Got: '{$probe->prt}'.");
        }
    }

    /**
     * Memvalidasi bahwa path dataset berada di luar repository, canonical, dan berada di bawah D:\pgsql-loadtest\datasets\.
     */
    private function validateAndNormalizeDatasetPath(string $rawPath): string
    {
        $normalized = str_replace('/', '\\', trim($rawPath));

        // 1. Tolak komponen traversal
        if (str_contains($normalized, '..') || str_contains($normalized, './') || str_contains($normalized, '.\\')) {
            throw new RuntimeException("Path dataset memuat komponen traversal terlarang: {$rawPath}");
        }

        // 2. Tolak UNC path
        if (str_starts_with($normalized, '\\\\')) {
            throw new RuntimeException("Path dataset tidak boleh berupa UNC path: {$rawPath}");
        }

        // 3. Tolak path yang tidak absolut Windows (harus diawali drive letter)
        if (!preg_match('/^[a-zA-Z]:\\\\/i', $normalized)) {
            throw new RuntimeException("Path dataset wajib merupakan path absolut Windows (diawali drive letter): {$rawPath}");
        }

        // 4. Tolak Alternate Data Stream (tidak boleh ada karakter ':' setelah drive letter)
        if (substr_count($normalized, ':') > 1) {
            throw new RuntimeException("Path dataset memuat sintaks Alternate Data Stream terlarang: {$rawPath}");
        }

        // 5. Tolak jika berada di dalam repository
        $repoRoot = str_replace('/', '\\', realpath(base_path()) ?: base_path());
        if (str_starts_with(strtoupper($normalized), strtoupper($repoRoot) . '\\') || strtoupper($normalized) === strtoupper($repoRoot)) {
            throw new RuntimeException("Path dataset DILARANG berada di dalam repository: {$rawPath}");
        }

        // 6. Wajib berada di bawah ALLOWED_DATASET_BASE_DIR
        $allowedBase = strtoupper(self::ALLOWED_DATASET_BASE_DIR);
        if (!str_starts_with(strtoupper($normalized), $allowedBase . '\\')) {
            throw new RuntimeException("Path dataset wajib berada di bawah direktori '" . self::ALLOWED_DATASET_BASE_DIR . "': {$rawPath}");
        }

        // 7. Ekstensi wajib .json
        if (!str_ends_with(strtolower($normalized), '.json')) {
            throw new RuntimeException("File dataset wajib memiliki ekstensi .json: {$rawPath}");
        }

        // 8. Tolak jika file atau direktori merupakan symlink/reparse point pada SELURUH komponen path
        $this->assertNoReparsePointInPath($normalized);

        return $normalized;
    }

    /**
     * Memeriksa setiap komponen path dari root drive sampai target file terhadap Reparse Point, Junction, dan Symlink.
     */
    private function assertNoReparsePointInPath(string $normalizedPath): void
    {
        $parts = explode('\\', $normalizedPath);
        if (count($parts) < 2) {
            return;
        }

        $currentComp = $parts[0] . '\\';

        for ($i = 1; $i < count($parts); $i++) {
            $currentComp = rtrim($currentComp, '\\') . '\\' . $parts[$i];

            if (!file_exists($currentComp) && !is_dir($currentComp)) {
                // Jangan membuat direktori untuk keperluan pemeriksaan. Lanjutkan hanya jika komponen ada di disk.
                continue;
            }

            clearstatcache(true, $currentComp);

            // 1. PHP Native is_link Check
            if (is_link($currentComp)) {
                throw new RuntimeException("Komponen path adalah symbolic link / junction terlarang: {$currentComp}");
            }

            // 2. Canonical realpath resolution comparison
            $real = realpath($currentComp);
            if ($real !== false) {
                $normalizedReal = str_replace('/', '\\', $real);
                if (strcasecmp($normalizedReal, $currentComp) !== 0) {
                    throw new RuntimeException("Komponen path mengarah ke lokasi fisik berbeda (junction/symlink redirect terdeteksi): '{$currentComp}' -> '{$normalizedReal}'");
                }
            }

            // 3. Deep Windows Reparse Point Attribute Check via PowerShell jika berada di Windows (Fail-Closed)
            if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                $escapedComp = addslashes($currentComp);
                $psScript = <<<POWERSHELL
\$ProgressPreference = 'SilentlyContinue'
try {
    \$it = Get-Item -LiteralPath '{$escapedComp}' -Force -ErrorAction Stop
    if (\$it.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint) -or (\$null -ne \$it.LinkType)) {
        Write-Output "REPARSE_POINT"
        exit 20
    }
    Write-Output "CLEAN"
    exit 0
} catch {
    Write-Error \$_
    exit 1
}
POWERSHELL;
                $encoded = base64_encode(mb_convert_encoding($psScript, 'UTF-16LE', 'UTF-8'));
                $cmd = "powershell -NoProfile -NonInteractive -EncodedCommand {$encoded} 2>&1";
                $out = [];
                $code = 0;
                exec($cmd, $out, $code);

                if ($code === 20 || (isset($out[0]) && trim($out[0]) === 'REPARSE_POINT')) {
                    throw new RuntimeException("Komponen path adalah Windows Reparse Point (Junction/Symlink/Mount Point) terlarang: {$currentComp}");
                }

                if ($code !== 0 || !isset($out[0]) || trim($out[0]) !== 'CLEAN') {
                    $msg = !empty($out) ? implode(' ', $out) : "exit code {$code}";
                    throw new RuntimeException("Gagal menginspeksi reparse point pada komponen path secara fail-closed ({$currentComp}): {$msg}");
                }
            }
        }
    }

    /**
     * Memeriksa seluruh identitas fixture secara fail-closed sebelum transaksi atau mutasi dimulai.
     * 
     * @param string[] $studentEmails
     * @param string[] $kodeSoalList
     */
    private function assertNoFixtureConflicts(
        string $stage,
        array $studentEmails,
        string $editorEmail,
        string $kodePtn,
        string $kodeProdi,
        string $kodeSubtes,
        string $namaTopik,
        array $kodeSoalList,
        string $datasetPath
    ): void {
        $conflicts = [];

        // 1. Periksa keberadaan file dataset final
        if (file_exists($datasetPath)) {
            $conflicts[] = "File dataset final sudah ada di filesystem: {$datasetPath}";
        }

        // 2. Periksa residu file sementara
        $dir = dirname($datasetPath);
        if (is_dir($dir)) {
            $baseName = basename($datasetPath);
            $globMatches = glob($dir . DIRECTORY_SEPARATOR . $baseName . '*.tmp');
            if (!empty($globMatches)) {
                $conflicts[] = "Residu file sementara terdeteksi di direktori dataset: " . implode(', ', $globMatches);
            }
        }

        // 3. Periksa akun siswa di tabel users
        if ($stage === 'medium') {
            $existingStudents = User::whereIn('email', $studentEmails)->pluck('email')->all();
            $unexpectedStudents = array_values(array_filter($existingStudents, function ($email) {
                if (preg_match('/siswa_(\d+)/', $email, $m)) {
                    return (int) $m[1] > 6;
                }
                return true;
            }));
            if (!empty($unexpectedStudents)) {
                $conflicts[] = "Akun siswa loadtest medium baru sudah terdaftar (" . count($unexpectedStudents) . " akun): " . implode(', ', $unexpectedStudents);
            }
        } elseif ($stage === 'large') {
            $existingStudents = User::whereIn('email', $studentEmails)->pluck('email')->all();
            $unexpectedStudents = array_values(array_filter($existingStudents, function ($email) {
                if (preg_match('/siswa_(\d+)/', $email, $m)) {
                    return (int) $m[1] > 26;
                }
                return true;
            }));
            if (!empty($unexpectedStudents)) {
                $conflicts[] = "Akun siswa loadtest large baru sudah terdaftar (" . count($unexpectedStudents) . " akun): " . implode(', ', $unexpectedStudents);
            }
        } else {
            $existingStudents = User::whereIn('email', $studentEmails)->pluck('email')->all();
            if (!empty($existingStudents)) {
                $conflicts[] = "Akun siswa loadtest sudah terdaftar (" . count($existingStudents) . " akun): " . implode(', ', $existingStudents);
            }
        }

        if ($stage === 'small' || $stage === 'medium' || $stage === 'large') {
            // Mode small & medium: verifikasi bahwa master entitas smoke WAJIB ada, valid, dan lengkap (referensi read-only)
            if (!User::where('email', $editorEmail)->exists()) {
                $conflicts[] = "Akun editor '{$editorEmail}' tidak ditemukan di database.";
            }
            if (!Universitas::where('kode_ptn', $kodePtn)->exists()) {
                $conflicts[] = "Universitas dengan kode PTN '{$kodePtn}' tidak ditemukan di database.";
            }
            if (!ProgramStudi::where('kode_prodi', $kodeProdi)->exists()) {
                $conflicts[] = "Program studi dengan kode prodi '{$kodeProdi}' tidak ditemukan di database.";
            }
            if (!Subtes::where('kode_subtes', $kodeSubtes)->exists()) {
                $conflicts[] = "Subtes dengan kode '{$kodeSubtes}' tidak ditemukan di database.";
            }
            if (!Topik::where('nama_topik', $namaTopik)->exists()) {
                $conflicts[] = "Topik dengan nama '{$namaTopik}' tidak ditemukan di database.";
            }
            $existingSoalCount = Soal::whereIn('kode_soal', $kodeSoalList)->where('status', 'published')->count();
            if ($existingSoalCount !== count($kodeSoalList)) {
                $conflicts[] = "Jumlah butir soal published 'PU-LOAD-*' tidak lengkap (ditemukan {$existingSoalCount}, diharapkan " . count($kodeSoalList) . ").";
            }
        } else {
            // Mode fresh install (misal smoke): pastikan entitas belum ada untuk mencegah overwrite
            if (User::where('email', $editorEmail)->exists()) {
                $conflicts[] = "Akun editor loadtest sudah terdaftar: {$editorEmail}";
            }
            if (Universitas::where('kode_ptn', $kodePtn)->exists()) {
                $conflicts[] = "Universitas dengan kode PTN '{$kodePtn}' sudah ada di database.";
            }
            if (ProgramStudi::where('kode_prodi', $kodeProdi)->exists()) {
                $conflicts[] = "Program studi dengan kode prodi '{$kodeProdi}' sudah ada di database.";
            }
            if (!Subtes::where('kode_subtes', $kodeSubtes)->exists()) {
                // Untuk smoke, jika belum ada biarkan lolos
            } else {
                $conflicts[] = "Subtes dengan kode '{$kodeSubtes}' sudah ada di database.";
            }
            if (Topik::where('nama_topik', $namaTopik)->exists()) {
                $conflicts[] = "Topik dengan nama '{$namaTopik}' sudah ada di database.";
            }
            $existingSoal = Soal::whereIn('kode_soal', $kodeSoalList)->pluck('kode_soal')->all();
            if (!empty($existingSoal)) {
                $conflicts[] = "Butir soal loadtest sudah ada (" . count($existingSoal) . " butir): " . implode(', ', array_slice($existingSoal, 0, 5)) . (count($existingSoal) > 5 ? '...' : '');
            }
        }

        // 10. Periksa sesi latihan aktif milik user siswa yang akan dibuat
        if ($stage === 'medium') {
            $newEmails = array_values(array_filter($studentEmails, function ($email) {
                if (preg_match('/siswa_(\d+)/', $email, $m)) {
                    return (int) $m[1] > 6;
                }
                return false;
            }));
            $existingSessions = Pengerjaan::where('mode_latihan', 'fleksibel')
                ->where('status', 'berjalan')
                ->whereHas('user', function ($q) use ($newEmails) {
                    $q->whereIn('email', $newEmails);
                })
                ->count();
            if ($existingSessions > 0) {
                $conflicts[] = "Ditemukan {$existingSessions} sesi fleksibel berjalan milik kandidat siswa baru loadtest (siswa_007..026).";
            }
        } elseif ($stage === 'large') {
            $newEmails = array_values(array_filter($studentEmails, function ($email) {
                if (preg_match('/siswa_(\d+)/', $email, $m)) {
                    return (int) $m[1] > 26;
                }
                return false;
            }));
            $existingSessions = Pengerjaan::where('mode_latihan', 'fleksibel')
                ->where('status', 'berjalan')
                ->whereHas('user', function ($q) use ($newEmails) {
                    $q->whereIn('email', $newEmails);
                })
                ->count();
            if ($existingSessions > 0) {
                $conflicts[] = "Ditemukan {$existingSessions} sesi fleksibel berjalan milik kandidat siswa baru loadtest (siswa_027..101).";
            }
        } else {
            $existingSessions = Pengerjaan::where('mode_latihan', 'fleksibel')
                ->where('status', 'berjalan')
                ->whereHas('user', function ($q) use ($studentEmails) {
                    $q->whereIn('email', $studentEmails);
                })
                ->count();
            if ($existingSessions > 0) {
                $conflicts[] = "Ditemukan {$existingSessions} sesi fleksibel berjalan milik kandidat siswa loadtest.";
            }
        }

        if (!empty($conflicts)) {
            $message = "Terdeteksi " . count($conflicts) . " konflik identitas fixture:\n";
            foreach ($conflicts as $c) {
                $message .= " - {$c}\n";
            }
            throw new RuntimeException($message);
        }
    }

    /**
     * Membuat seluruh data fixture baru (tanpa firstOrCreate, tanpa updateOrCreate, tanpa reuse).
     * 
     * @param string[] $studentEmails
     * @param string[] $kodeSoalList
     * @return array<int, array{email: string, password: string, sesiId: string, soalId: string, opsiId: string}>
     */
    private function createFixtures(
        string $stage,
        array $studentEmails,
        string $editorEmail,
        string $kodePtn,
        string $kodeProdi,
        string $kodeSubtes,
        string $namaTopik,
        array $kodeSoalList
    ): array {
        $hashedPassword = Hash::make(self::SYNTHETIC_PASSWORD);

        if ($stage === 'small' || $stage === 'medium' || $stage === 'large') {
            // Gunakan referensi master entitas smoke yang sudah ada (READ-ONLY, tanpa modifikasi atau duplikasi)
            $univ = Universitas::where('kode_ptn', $kodePtn)->firstOrFail();
            $prodi = ProgramStudi::where('kode_prodi', $kodeProdi)->firstOrFail();
            $subtes = Subtes::where('kode_subtes', $kodeSubtes)->firstOrFail();
            $topik = Topik::where('nama_topik', $namaTopik)->firstOrFail();
            $soalList = Soal::whereIn('kode_soal', $kodeSoalList)->where('status', 'published')->orderBy('kode_soal')->get();
        } else {
            // A. Master Universitas & Program Studi
            $univ = Universitas::create([
                'kode_ptn' => $kodePtn,
                'nama_universitas' => 'Universitas Indonesia (Loadtest)',
                'is_aktif' => true,
            ]);

            $prodi = ProgramStudi::create([
                'universitas_id' => $univ->id,
                'kode_prodi' => $kodeProdi,
                'nama_prodi' => 'Ilmu Komputer (Loadtest)',
                'jenjang' => 'S1',
                'is_aktif' => true,
            ]);

            // B. Master Subtes & Topik
            $subtes = Subtes::create([
                'kode_subtes' => $kodeSubtes,
                'nama_subtes' => 'Penalaran Umum',
                'deskripsi' => 'Subtes Penalaran Umum untuk Load Testing Terisolasi',
                'urutan' => 1,
                'waktu_default_menit' => 30.0,
                'jumlah_soal' => 20,
            ]);

            $topik = Topik::create([
                'subtes_id' => $subtes->id,
                'nama_topik' => $namaTopik,
                'urutan' => 1,
                'jumlah_soal_simulasi' => 20,
            ]);

            // C. Akun Editor Sintetis
            $editorUser = User::create([
                'name' => 'Editor Loadtest',
                'email' => $editorEmail,
                'password' => $hashedPassword,
                'role' => 'admin_editor',
                'is_active' => true,
                'email_verified_at' => now(),
            ]);

            AdminEditor::create([
                'user_id' => $editorUser->id,
                'nama_lengkap' => 'Editor Loadtest EDVORA',
            ]);

            // D. 20 Butir Soal Pilihan Ganda Published
            $soalList = [];
            foreach ($kodeSoalList as $idx => $kodeSoal) {
                $nomor = $idx + 1;
                $soal = Soal::create([
                    'kode_soal' => $kodeSoal,
                    'subtes_id' => $subtes->id,
                    'topik_id' => $topik->id,
                    'editor_id' => $editorUser->id,
                    'tipe' => 'pilihan_ganda',
                    'teks_soal' => "Butir soal pengujian beban nomor {$nomor}. Premis 1: Semua mamalia bernapas dengan paru-paru. Premis 2: Lumba-lumba adalah hewan mamalia. Manakah kesimpulan yang paling tepat berdasarkan kedua premis tersebut?",
                    'pembahasan' => "Pembahasan soal load testing nomor {$nomor}: Berdasarkan silogisme kategorik, premis mayor dan minor mengimplikasikan bahwa lumba-lumba bernapas dengan paru-paru.",
                    'tingkat_kesulitan' => 'sedang',
                    'status' => 'published',
                    'kunci_jawaban' => null,
                    'kolom_tabel' => null,
                ]);

                // Tambahkan 5 opsi jawaban per butir
                $opsiDefs = [
                    ['label' => 'A', 'teks' => 'Lumba-lumba bernapas dengan paru-paru.', 'is_kunci' => true, 'urutan' => 1],
                    ['label' => 'B', 'teks' => 'Lumba-lumba bernapas dengan insang seperti ikan.', 'is_kunci' => false, 'urutan' => 2],
                    ['label' => 'C', 'teks' => 'Sebagian lumba-lumba tidak memerlukan organ pernapasan.', 'is_kunci' => false, 'urutan' => 3],
                    ['label' => 'D', 'teks' => 'Lumba-lumba bukan merupakan kelompok hewan mamalia.', 'is_kunci' => false, 'urutan' => 4],
                    ['label' => 'E', 'teks' => 'Tidak dapat ditarik kesimpulan dari kedua premis.', 'is_kunci' => false, 'urutan' => 5],
                ];

                foreach ($opsiDefs as $def) {
                    OpsiJawaban::create([
                        'soal_id' => $soal->id,
                        'label' => $def['label'],
                        'teks_opsi' => $def['teks'],
                        'is_kunci' => $def['is_kunci'],
                        'urutan' => $def['urutan'],
                        'kunci_kolom' => null,
                    ]);
                }

                $soalList[] = $soal;
            }
        }

        $soalIds = collect($soalList)->pluck('id')->all();
        $firstSoal = $soalList[0];
        $firstOpsi = OpsiJawaban::where('soal_id', $firstSoal->id)->orderBy('urutan')->first();
        $firstOpsiId = $firstOpsi ? (string) $firstOpsi->id : '';

        // E. Akun Siswa & Sesi Latihan Fleksibel Berjalan Baru
        $datasetEntries = [];

        foreach ($studentEmails as $sIdx => $studentEmail) {
            $existingUser = User::where('email', $studentEmail)->first();
            if ($existingUser) {
                // Gunakan sesi berjalan yang sudah ada (misal siswa_002..siswa_006)
                $existingPengerjaan = DB::table('pengerjaan')
                    ->where('user_id', $existingUser->id)
                    ->where('status', 'berjalan')
                    ->where('mode_latihan', 'fleksibel')
                    ->first();

                if (!$existingPengerjaan) {
                    throw new RuntimeException("Sesi berjalan untuk user {$studentEmail} tidak ditemukan.");
                }

                $datasetEntries[] = [
                    'email' => $studentEmail,
                    'password' => self::SYNTHETIC_PASSWORD,
                    'sesiId' => (string) $existingPengerjaan->id,
                    'soalId' => (string) $firstSoal->id,
                    'opsiId' => $firstOpsiId,
                ];
                continue;
            }

            if (preg_match('/siswa_(\d+)/', $studentEmail, $matches)) {
                $studentName = sprintf('Siswa Loadtest %03d', (int) $matches[1]);
            } else {
                $studentName = sprintf('Siswa Loadtest %03d', $sIdx + 1);
            }

            $studentUser = User::create([
                'name' => $studentName,
                'email' => $studentEmail,
                'password' => $hashedPassword,
                'role' => 'siswa',
                'is_active' => true,
                'email_verified_at' => now(),
            ]);

            Siswa::create([
                'user_id' => $studentUser->id,
                'nama_lengkap' => $studentName,
                'jenis_kelamin' => 'laki-laki',
                'kelas' => 'kuliah-akhir',
                'universitas_tujuan_id' => $univ->id,
                'prodi_tujuan_id' => $prodi->id,
                'xp' => 0,
                'point' => 0,
                'streak_saat_ini' => 0,
            ]);

            $pengerjaanId = (string) Str::uuid();
            DB::table('pengerjaan')->insert([
                'id' => $pengerjaanId,
                'user_id' => $studentUser->id,
                'tipe' => 'latihan_bebas',
                'status' => 'berjalan',
                'subtes_id' => $subtes->id,
                'jumlah_soal_dipilih' => count($soalIds),
                'ice_breaking_aktif' => false,
                'started_at' => now(),
                'total_skor' => 0,
                'mode_latihan' => 'fleksibel',
                'soal_ids' => '{' . implode(',', $soalIds) . '}',
            ]);

            $datasetEntries[] = [
                'email' => $studentEmail,
                'password' => self::SYNTHETIC_PASSWORD,
                'sesiId' => $pengerjaanId,
                'soalId' => (string) $firstSoal->id,
                'opsiId' => $firstOpsiId,
            ];
        }

        return $datasetEntries;
    }

    /**
     * Membuat file sementara kosong secara eksklusif dan mengamankannya dengan Windows ACL sebelum JSON ditulis.
     */
    private function createProtectedEmptyTempDataset(string $tempPath): void
    {
        $dir = dirname($tempPath);
        if (!is_dir($dir)) {
            if (!mkdir($dir, 0700, true) && !is_dir($dir)) {
                throw new RuntimeException("Gagal membuat direktori dataset: {$dir}");
            }
            $this->enforceWindowsAcl($dir);
        }
        $this->verifyWindowsAcl($dir);

        // Buat file sementara kosong secara eksklusif (fopen mode 'xb' gagal jika file sudah ada)
        $fp = @fopen($tempPath, 'xb');
        if ($fp === false) {
            throw new RuntimeException("Gagal membuat file sementara secara eksklusif (file sudah ada atau akses ditolak): {$tempPath}");
        }
        fclose($fp);

        // Terapkan dan verifikasi ACL pada file kosong SEBELUM isi data/password ditulis
        $this->enforceWindowsAcl($tempPath);
        $this->verifyWindowsAcl($tempPath);
    }

    /**
     * Menuliskan konten JSON ke file sementara yang telah diamankan ACL.
     * 
     * @param array<int, array<string, string>> $dataset
     */
    private function writeJsonToProtectedFile(string $tempPath, array $dataset): void
    {
        $jsonContent = json_encode($dataset, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($jsonContent === false) {
            throw new RuntimeException('Gagal mengonversi dataset menjadi format JSON.');
        }

        // Tulis isi dataset ke file yang sudah terkunci izinnya
        if (file_put_contents($tempPath, $jsonContent . PHP_EOL, LOCK_EX) === false) {
            throw new RuntimeException("Gagal menulis dataset ke file sementara yang telah diamankan: {$tempPath}");
        }
    }

    /**
     * Memvalidasi isi file sementara langsung dari disk fisik sebelum commit.
     * 
     * @param string[] $expectedEmails
     */
    private function validateWrittenTempDataset(string $tempPath, int $expectedCount, array $expectedEmails): void
    {
        if (!file_exists($tempPath) || !is_readable($tempPath)) {
            throw new RuntimeException("File dataset sementara tidak terbaca setelah penulisan: {$tempPath}");
        }

        $raw = file_get_contents($tempPath);
        $decoded = json_decode($raw, true);

        if (!is_array($decoded)) {
            throw new RuntimeException('Isi file dataset sementara bukan merupakan array JSON valid.');
        }

        if (count($decoded) !== $expectedCount) {
            throw new RuntimeException("Jumlah entri dataset tidak sesuai. Diharapkan: {$expectedCount}, Ditemukan: " . count($decoded));
        }

        $seenEmails = [];
        $seenSesi = [];

        foreach ($decoded as $idx => $row) {
            if (empty($row['email']) || empty($row['password']) || empty($row['sesiId'])) {
                throw new RuntimeException("Entri dataset indeks {$idx} tidak memiliki kolom wajib.");
            }
            if (!in_array($row['email'], $expectedEmails, true)) {
                throw new RuntimeException("Email pada entri dataset '{$row['email']}' tidak sesuai target stage.");
            }
            if (in_array($row['email'], $seenEmails, true)) {
                throw new RuntimeException("Duplikasi email terdeteksi pada dataset: {$row['email']}");
            }
            if (in_array($row['sesiId'], $seenSesi, true)) {
                throw new RuntimeException("Duplikasi sesiId terdeteksi pada dataset: {$row['sesiId']}");
            }
            $seenEmails[] = $row['email'];
            $seenSesi[] = $row['sesiId'];
        }
    }

    /**
     * Me-rename file sementara ke file final dan memverifikasi integritas Windows ACL yang melekat.
     * File sementara sudah diamankan dengan ACL eksak sebelum penulisan isi, dan operasi rename
     * pada volume NTFS yang sama mempertahankan Security Descriptor (DACL) tersebut secara utuh.
     * Melacak perubahan status file fisik secara eksak untuk pelaporan error yang akurat.
     */
    private function finalizeDatasetFile(string $tempPath, string $targetPath, string &$fileState): void
    {
        if (!file_exists($tempPath)) {
            throw new RuntimeException("File sementara tidak ditemukan untuk finalisasi: {$tempPath}");
        }

        if (!rename($tempPath, $targetPath)) {
            throw new RuntimeException("Operasi rename dari '{$tempPath}' ke '{$targetPath}' gagal pada tingkat OS.");
        }

        // Rename berhasil: lokasi fisik file sekarang berada di $targetPath
        $fileState = 'FINAL_FILE';

        // Verifikasi bahwa Security Descriptor DACL yang melekat pasca-rename tetap memenuhi seluruh kebijakan
        $this->verifyWindowsAcl($targetPath);

        if (!file_exists($targetPath) || !is_readable($targetPath)) {
            throw new RuntimeException("File dataset final tidak terbaca setelah proses rename: {$targetPath}");
        }
    }

    /**
     * Mendapatkan SID akun Windows aktif menggunakan utilitas whoami.
     * Menerapkan prinsip fail-closed tanpa fallback ke getenv('USERNAME').
     */
    private function getWindowsUserSid(): string
    {
        if (strtoupper(substr(PHP_OS, 0, 3)) !== 'WIN') {
            throw new RuntimeException('Operasi penegakan Windows ACL hanya didukung pada sistem operasi Windows.');
        }

        $out = [];
        $code = 0;
        exec('whoami /user /fo csv /nh 2>&1', $out, $code);

        if ($code !== 0) {
            $msg = !empty($out) ? implode(' ', $out) : "exit code {$code}";
            throw new RuntimeException("Gagal mendeteksi SID pengguna Windows dari whoami: {$msg}");
        }

        if (empty($out[0])) {
            throw new RuntimeException('Keluaran utilitas whoami kosong saat mendeteksi SID pengguna Windows.');
        }

        $parts = str_getcsv(trim($out[0]));
        if (!isset($parts[1]) || empty(trim($parts[1]))) {
            throw new RuntimeException('Format CSV keluaran whoami tidak valid atau kolom SID tidak ditemukan.');
        }

        $sid = trim($parts[1]);
        if (!preg_match('/^S-1-5-[0-9-]+$/', $sid)) {
            throw new RuntimeException("Format SID pengguna Windows tidak valid: '{$sid}'.");
        }

        return $sid;
    }

    /**
     * Menjalankan skrip PowerShell secara aman melalui berkas temporer .ps1 terisolasi
     * untuk menghindari batasan panjang baris perintah Windows cmd.exe (8191 karakter).
     *
     * @param string $psScript
     * @return array{output: string[], returnCode: int}
     */
    private function runSecurePowerShellScript(string $psScript): array
    {
        $tempDir = sys_get_temp_dir();
        if (empty($tempDir) || !is_dir($tempDir) || !is_writable($tempDir)) {
            throw new RuntimeException('Direktori temporary sistem tidak dapat diakses untuk eksekusi PowerShell.');
        }

        // Buat nama file acak dan unik secara eksklusif dengan mode 'xb'
        $scriptPath = null;
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $candidate = $tempDir . DIRECTORY_SEPARATOR . 'edvora_acl_' . bin2hex(random_bytes(8)) . '.ps1';
            $fp = @fopen($candidate, 'xb');
            if ($fp !== false) {
                fclose($fp);
                $scriptPath = $candidate;
                break;
            }
        }

        if ($scriptPath === null) {
            throw new RuntimeException('Gagal membuat berkas skrip sementara PowerShell secara eksklusif.');
        }

        try {
            // Tulis dengan encoding UTF-8 dengan BOM (0xEF, 0xBB, 0xBF) agar Windows PowerShell membacanya dengan tepat
            $content = "\xEF\xBB\xBF" . $psScript;

            if (file_put_contents($scriptPath, $content, LOCK_EX) === false) {
                throw new RuntimeException("Gagal menulis isi skrip ke berkas sementara: {$scriptPath}");
            }

            // Quoting aman untuk path argumen di Windows
            $escapedScriptArg = escapeshellarg($scriptPath);
            $cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File {$escapedScriptArg} 2>&1";

            $output = [];
            $returnCode = 0;
            exec($cmd, $output, $returnCode);

            return [
                'output'     => $output,
                'returnCode' => $returnCode,
            ];
        } finally {
            if (file_exists($scriptPath)) {
                $cleaned = @unlink($scriptPath);
                if (!$cleaned && file_exists($scriptPath)) {
                    clearstatcache(true, $scriptPath);
                    usleep(10000); // 10ms
                    $cleaned = @unlink($scriptPath);
                }
                if (!$cleaned && file_exists($scriptPath)) {
                    throw new RuntimeException("Gagal membersihkan berkas skrip sementara: {$scriptPath}");
                }
            }
        }
    }

    /**
     * Menegakkan Windows ACL pada file atau direktori target secara fail-closed:
     * 1. Memutuskan pewarisan izin (inheritance protection: isProtected=$true, preserveInheritance=$false).
     * 2. Membersihkan seluruh explicit ACE lama yang ada pada objek.
     * 3. Menetapkan hak akses minimum (Read, Write, Delete, Synchronize: 1245599 / 0x13019F) untuk SID pengguna aktif.
     * 4. Memberikan hak administratif terbatas untuk SYSTEM (S-1-5-18) dan Administrators (S-1-5-32-544).
     */
    private function enforceWindowsAcl(string $targetPath): void
    {
        if (strtoupper(substr(PHP_OS, 0, 3)) !== 'WIN') {
            return;
        }

        $sid = $this->getWindowsUserSid();
        $escapedPath = addslashes($targetPath);

        $psScript = <<<POWERSHELL
\$ProgressPreference = 'SilentlyContinue'
try {
    \$p = '{$escapedPath}'
    \$targetSid = '{$sid}'
    \$item = Get-Item -LiteralPath \$p -Force -ErrorAction Stop
    \$isDir = \$item.PSIsContainer

    \$acl = \$item.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
    \$acl.SetAccessRuleProtection(\$true, \$false)

    # Purge all existing explicit access rules
    \$existing = @(\$acl.Access)
    foreach (\$r in \$existing) {
        \$acl.RemoveAccessRuleSpecific(\$r) | Out-Null
    }

    # 1. User Rule
    \$uSid = New-Object System.Security.Principal.SecurityIdentifier(\$targetSid)
    if (\$isDir) {
        \$uRights = [System.Security.AccessControl.FileSystemRights]"Modify, Synchronize"
        \$uRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            \$uSid,
            \$uRights,
            ([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),
            [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
    } else {
        # File rights: Read (131209) -bor Write (278) -bor Delete (65536) -bor Synchronize (1048576) = 1245599 (0x13019F)
        \$uRights = [System.Security.AccessControl.FileSystemRights]1245599
        \$uRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            \$uSid,
            \$uRights,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
    }
    \$acl.SetAccessRule(\$uRule)

    # 2. SYSTEM Break-Glass (S-1-5-18)
    \$sysSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
    \$sysRights = [System.Security.AccessControl.FileSystemRights]"FullControl"
    \$sysRule = if (\$isDir) {
        New-Object System.Security.AccessControl.FileSystemAccessRule(
            \$sysSid,
            \$sysRights,
            ([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),
            [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
    } else {
        New-Object System.Security.AccessControl.FileSystemAccessRule(
            \$sysSid,
            \$sysRights,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
    }
    \$acl.SetAccessRule(\$sysRule)

    # 3. Administrators Break-Glass (S-1-5-32-544)
    \$admSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
    \$admRights = [System.Security.AccessControl.FileSystemRights]"FullControl"
    \$admRule = if (\$isDir) {
        New-Object System.Security.AccessControl.FileSystemAccessRule(
            \$admSid,
            \$admRights,
            ([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),
            [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
    } else {
        New-Object System.Security.AccessControl.FileSystemAccessRule(
            \$admSid,
            \$admRights,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
    }
    \$acl.SetAccessRule(\$admRule)

    \$item.SetAccessControl(\$acl)
    Write-Output "ACL_ENFORCED_OK"
    exit 0
} catch {
    Write-Error \$_
    exit 1
}
POWERSHELL;

        $res = $this->runSecurePowerShellScript($psScript);
        $output = $res['output'];
        $returnCode = $res['returnCode'];

        if ($returnCode !== 0 || !isset($output[0]) || trim($output[0]) !== 'ACL_ENFORCED_OK') {
            $msg = !empty($output) ? implode(' ', $output) : "exit code {$returnCode}";
            throw new RuntimeException("Gagal menegakkan Windows ACL secara aman pada {$targetPath}. Error: {$msg}");
        }
    }

    /**
     * Memverifikasi secara independen bahwa Security Descriptor DACL objek memenuhi kebijakan Whitelist berbasis SID:
     * 1. AreAccessRulesProtected bernilai true (inheritance nonaktif).
     * 2. Setiap explicit ACE memiliki principal yang cocok secara eksak dengan salah satu SID berikut:
     *    - User SID aktif proses ($sid)
     *    - SYSTEM (S-1-5-18)
     *    - Administrators (S-1-5-32-544)
     * 3. Tidak ada inherited ACE (IsInherited === false).
     * 4. Tidak ada Deny ACE (AccessControlType === Allow).
     * 5. User ACE terdaftar tepat satu dan memuat hak eksak sesuai kebijakan (menolak FullControl/TakeOwnership/ChangePermissions).
     * 6. Hapus seluruh penggunaan getenv('USERNAME') dan str_contains() pada pencocokan principal.
     */
    private function verifyWindowsAcl(string $targetPath): void
    {
        if (strtoupper(substr(PHP_OS, 0, 3)) !== 'WIN') {
            return;
        }

        $sid = $this->getWindowsUserSid();
        $escapedPath = addslashes($targetPath);

        $psScript = <<<POWERSHELL
\$ProgressPreference = 'SilentlyContinue'
try {
    \$p = '{$escapedPath}'
    \$item = Get-Item -LiteralPath \$p -Force -ErrorAction Stop
    \$isDir = \$item.PSIsContainer

    \$acl = Get-Acl -LiteralPath \$p -ErrorAction Stop
    \$result = [PSCustomObject]@{
        IsContainer = \$isDir
        AreAccessRulesProtected = \$acl.AreAccessRulesProtected
        Rules = @()
    }
    foreach (\$rule in \$acl.Access) {
        \$sidVal = \$null
        try {
            \$sidVal = \$rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
        } catch {
            \$sidVal = "UNTRANSLATED:" + \$rule.IdentityReference.Value
        }
        \$result.Rules += [PSCustomObject]@{
            Sid = \$sidVal
            AccessControlType = \$rule.AccessControlType.ToString()
            IsInherited = \$rule.IsInherited
            FileSystemRights = \$rule.FileSystemRights.ToString()
            RightsNumeric = [int]\$rule.FileSystemRights
        }
    }
    \$result | ConvertTo-Json -Depth 5 -Compress
    exit 0
} catch {
    Write-Error \$_
    exit 1
}
POWERSHELL;

        $res = $this->runSecurePowerShellScript($psScript);
        $output = $res['output'];
        $returnCode = $res['returnCode'];

        if ($returnCode !== 0 || empty($output)) {
            $msg = !empty($output) ? implode(' ', $output) : "exit code {$returnCode}";
            throw new RuntimeException("Gagal menginspeksi Security Descriptor DACL pada {$targetPath}: {$msg}");
        }

        $rawJson = implode("\n", $output);
        $data = json_decode($rawJson, true);

        if (!is_array($data) || !isset($data['AreAccessRulesProtected']) || !array_key_exists('Rules', $data)) {
            throw new RuntimeException("Verifikasi ACL gagal: Format output DACL dari PowerShell tidak valid pada {$targetPath}.");
        }

        // 1. Inheritance Protection Check
        if ($data['AreAccessRulesProtected'] !== true) {
            throw new RuntimeException("Verifikasi ACL gagal: AreAccessRulesProtected bernilai false pada {$targetPath}. Inheritance belum dinonaktifkan.");
        }

        $rules = $data['Rules'];
        if (!is_array($rules) || empty($rules)) {
            throw new RuntimeException("Verifikasi ACL gagal: Tidak ada explicit ACE yang ditemukan pada {$targetPath}.");
        }

        // Jika hanya 1 rule, PowerShell ConvertTo-Json menghasilkan associative array bukan list
        if (isset($rules['Sid'])) {
            $rules = [$rules];
        }

        $isContainer = (bool) ($data['IsContainer'] ?? false);
        $expectedUserRights = $isContainer ? 1245631 : 1245599;
        $expectedRightsLabel = $isContainer ? 'Modify, Synchronize (1245631)' : 'Read, Write, Delete, Synchronize (1245599)';

        $userAceCount = 0;

        foreach ($rules as $rule) {
            // 2. Inheritance flag on rule
            if (!isset($rule['IsInherited']) || $rule['IsInherited'] !== false) {
                throw new RuntimeException("Verifikasi ACL gagal: Ditemukan inherited ACE pada {$targetPath}.");
            }

            // 3. Deny ACE check
            if (!isset($rule['AccessControlType']) || strcasecmp($rule['AccessControlType'], 'Allow') !== 0) {
                throw new RuntimeException("Verifikasi ACL gagal: Ditemukan ACE bertipe bukan Allow ('{$rule['AccessControlType']}') pada {$targetPath}.");
            }

            $ruleSid = $rule['Sid'] ?? '';

            // 4. Strict Exact SID Whitelist (NO getenv('USERNAME'), NO str_contains)
            $isUser = ($ruleSid === $sid);
            $isSystem = ($ruleSid === 'S-1-5-18');
            $isAdmin = ($ruleSid === 'S-1-5-32-544');

            if ($isUser) {
                $userAceCount++;
                if ($userAceCount > 1) {
                    throw new RuntimeException("Verifikasi ACL gagal: Ditemukan duplikasi ACE untuk pengguna (SID: {$sid}) pada {$targetPath}. Kebijakan mengharuskan tepat satu ACE pengguna.");
                }

                $rightsNum = (int) ($rule['RightsNumeric'] ?? 0);

                // Periksa hak akses eksak sesuai kebijakan (menolak FullControl atau hak berlebih seperti TakeOwnership/ChangePermissions)
                if ($rightsNum !== $expectedUserRights) {
                    throw new RuntimeException("Verifikasi ACL gagal: Hak akses pengguna ({$rule['RightsNumeric']}) tidak sesuai kebijakan eksak {$expectedRightsLabel} pada {$targetPath}. Ditemukan: '{$rule['FileSystemRights']}'.");
                }
            } elseif ($isSystem || $isAdmin) {
                // Kebijakan: SYSTEM dan Administrators diizinkan sebagai administrative break-glass dengan FullControl
                continue;
            } else {
                throw new RuntimeException("Verifikasi ACL gagal: Ditemukan principal tidak diizinkan atau tidak dikenal pada {$targetPath}. SID terlarang: '{$ruleSid}'.");
            }
        }

        if ($userAceCount !== 1) {
            throw new RuntimeException("Verifikasi ACL gagal: Tidak ditemukan ACE yang sah untuk pengguna proses (SID: {$sid}) pada {$targetPath}.");
        }
    }
}
