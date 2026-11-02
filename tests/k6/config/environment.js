/**
 * Konfigurasi Lingkungan, Target SLA, dan Beban Pengujian k6 EDVORA
 * Penanggung Jawab: Indah (Load & Performance Testing)
 * 
 * PRINSIP KEAMANAN:
 * Tidak ada kredensial, email, kata sandi, cookie, atau token yang di-hardcode.
 * Seluruh parameter dinamis disuplai saat eksekusi via Environment Variables k6 (__ENV):
 * - BASE_URL
 * - SISWA_EMAIL
 * - SISWA_PASSWORD
 * - EDITOR_EMAIL
 * - EDITOR_PASSWORD
 * - SESI_ID (Opsional jika ingin menargetkan sesi pengerjaan spesifik)
 * - SOAL_ID (Opsional jika ingin menargetkan ID soal spesifik)
 */

export const CONFIG = {
    // Base URL aplikasi EDVORA (Default: server lokal port 8000)
    BASE_URL: __ENV.BASE_URL || 'http://127.0.0.1:8000',
    
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

    // Parameter ID Spesifik (opsional dari env, default ke data seed yang valid)
    SESI_ID: __ENV.SESI_ID || 'a32178a6-1de2-4d00-9200-5b9b5518eff9',
    SOAL_ID: __ENV.SOAL_ID || '440894ab-6f1a-407a-83ca-01696baee3a2',
    OPSI_ID: __ENV.OPSI_ID || '44c043e6-b41f-49bf-97ca-0acdfb0ff5b6',

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
