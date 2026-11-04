/**
 * [DEPRECATED] Konfigurasi Lingkungan, Target SLA, dan Beban Pengujian k6 EDVORA (Legacy Runner)
 * Penanggung Jawab: Indah (Load & Performance Testing)
 *
 * CATATAN DEPRECATION & KEAMANAN (Stage 5O-AE):
 * Runner pada folder tests/k6/ adalah runner generasi awal yang telah digantikan oleh
 * runner resmi di folder tests/load/ (student.js dan editor.js).
 * Proteksi fail-closed diberlakukan ketat:
 * 1. Tidak ada default ke port 8000 demi melindungi database bersama Supabase.
 * 2. Wajib menetapkan TARGET_ENV=local_isolated dan BASE_URL=http://127.0.0.1:8001.
 * 3. Seluruh target selain port 8001 lokal ditolak seketika sebelum request dijalankan.
 *
 * Parameter dinamis via Environment Variables k6 (__ENV):
 * - TARGET_ENV (Wajib 'local_isolated')
 * - BASE_URL   (Wajib 'http://127.0.0.1:8001' atau 'http://localhost:8001')
 * - SISWA_EMAIL
 * - SISWA_PASSWORD
 * - EDITOR_EMAIL
 * - EDITOR_PASSWORD
 * - SESI_ID (Opsional jika ingin menargetkan sesi pengerjaan spesifik)
 * - SOAL_ID (Opsional jika ingin menargetkan ID soal spesifik)
 */

export const CONFIG = {
    // Target Environment Guard (Wajib 'local_isolated')
    TARGET_ENV: (__ENV.TARGET_ENV || '').trim(),

    // Base URL aplikasi EDVORA (TIDAK ADA DEFAULT KE PORT 8000 demi keamanan database bersama)
    BASE_URL: (__ENV.BASE_URL || '').trim(),

    // Kredensial Siswa (Skenario A)
    SISWA: {
        EMAIL: __ENV.SISWA_EMAIL || '',
        PASSWORD: __ENV.SISWA_PASSWORD || '',
    },

    // Kredensial Editor (Skenario B)
    EDITOR: {
        EMAIL: __ENV.EDITOR_EMAIL || '',
        PASSWORD: __ENV.EDITOR_PASSWORD || '',
    },

    // Parameter ID Spesifik (opsional dari environment variables k6)
    SESI_ID: __ENV.SESI_ID || '',
    SOAL_ID: __ENV.SOAL_ID || '',
    OPSI_ID: __ENV.OPSI_ID || '',

    // Target SLA Performa Tugas:
    // Skenario A: Waktu pengiriman jawaban & pengambilan soal berikutnya maksimal 1 detik (1000 ms)
    // Skenario B: Waktu respons dashboard analitik Editor maksimal 3 detik (3000 ms)
    TARGETS: {
        SOAL_RESPONSE_TIME_MAX_MS: 1000,
        SOAL_RESPONSE_TIME_P95_MS: 1000,
        EDITOR_DASHBOARD_MAX_MS: 3000,
        EDITOR_DASHBOARD_P95_MS: 3000,
    },

    // Konfigurasi Beban Pengujian Bertahap (Ramping Stages)
    STAGES: {
        // Skenario A: Pengujian bertahap hingga 500 Virtual Users (VU)
        SKENARIO_A_500_VU: [
            { duration: '15s', target: 100 },  // Tahap 1: Ramp-up ke 100 VU
            { duration: '30s', target: 250 },  // Tahap 2: Beban menengah 250 VU
            { duration: '30s', target: 500 },  // Tahap 3: Puncak beban 500 VU
            { duration: '15s', target: 0 },    // Tahap 4: Ramp-down pendinginan
        ],
        // Skenario B: Pengujian beban Editor konkuren (10 -> 30 -> 50 VU)
        SKENARIO_B_EDITOR: [
            { duration: '10s', target: 10 },   // Tahap 1: Ramp-up 10 editor
            { duration: '20s', target: 30 },   // Tahap 2: Beban menengah 30 editor
            { duration: '20s', target: 50 },   // Tahap 3: Puncak beban 50 editor
            { duration: '10s', target: 0 },    // Tahap 4: Ramp-down
        ],
        // Smoke Test: Verifikasi fungsional script cepat & aman
        SMOKE_TEST: [
            { duration: '5s', target: 2 },
            { duration: '10s', target: 5 },
            { duration: '5s', target: 0 },
        ],
    },
};

/**
 * Memvalidasi URL target dan lingkungan secara fail-closed sebelum HTTP request dikirim.
 * Hanya mengizinkan port 8001 lokal terisolasi.
 *
 * @param {string} url
 * @param {string} targetEnv
 * @returns {string} Clean normalized URL
 */
export function assertSafeUrl(url = CONFIG.BASE_URL, targetEnv = CONFIG.TARGET_ENV) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
        throw new Error('[FAIL-CLOSED GUARD] BASE_URL tidak didefinisikan. Wajib menyuplai __ENV.BASE_URL secara eksplisit via -e BASE_URL=http://127.0.0.1:8001.');
    }

    if (targetEnv !== 'local_isolated') {
        throw new Error(`[FAIL-CLOSED GUARD] TARGET_ENV bernilai "${targetEnv || '(kosong)'}", wajib "local_isolated". Eksekusi diblokir seketika demi melindungi database bersama Supabase.`);
    }

    const cleanUrl = url.trim().replace(/\/+$/, '');
    const match = cleanUrl.match(/^(https?):\/\/([^/:]+)(?::(\d+))?$/i);
    if (!match) {
        throw new Error(`[FAIL-CLOSED GUARD] Format BASE_URL "${url}" tidak valid atau memiliki path/query/fragment.`);
    }

    const protocol = match[1].toLowerCase();
    const hostname = match[2].toLowerCase();
    const port = match[3] || (protocol === 'https' ? '443' : '80');

    if (protocol !== 'http') {
        throw new Error(`[FAIL-CLOSED GUARD] Protokol "${protocol}" ditolak. Target local_isolated wajib menggunakan HTTP.`);
    }

    if (port !== '8001') {
        throw new Error(`[FAIL-CLOSED GUARD] Port "${port}" ditolak. Target local_isolated HANYA mengizinkan port eksak 8001 (Port 8000 ditolak keras karena terhubung ke database bersama via .env).`);
    }

    if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
        throw new Error(`[FAIL-CLOSED GUARD] Hostname "${hostname}" ditolak. Target local_isolated hanya mengizinkan 127.0.0.1 atau localhost.`);
    }

    return cleanUrl;
}

/**
 * Validasi keberadaan konfigurasi wajib sebelum eksekusi dimulai
 * @param {'siswa'|'editor'|'all'} requiredRole
 */
export function validateConfig(requiredRole = 'all') {
    // 1. Validasi fail-closed URL & target environment
    assertSafeUrl(CONFIG.BASE_URL, CONFIG.TARGET_ENV);

    // 2. Validasi kredensial
    const missing = [];
    if ((requiredRole === 'all' || requiredRole === 'siswa') && (!CONFIG.SISWA.EMAIL || !CONFIG.SISWA.PASSWORD)) {
        missing.push('SISWA_EMAIL dan SISWA_PASSWORD');
    }
    if ((requiredRole === 'all' || requiredRole === 'editor') && (!CONFIG.EDITOR.EMAIL || !CONFIG.EDITOR.PASSWORD)) {
        missing.push('EDITOR_EMAIL dan EDITOR_PASSWORD');
    }
    if (missing.length > 0) {
        throw new Error(`[CONFIG ERROR] Konfigurasi environment variables wajib belum diset: ${missing.join(', ')}. Harap jalankan dengan '-e VAR=value' atau set environment variable di terminal.`);
    }
}

