/**
 * Konfigurasi Lingkungan dan Target Metrik Load Testing EDVORA (k6)
 * Penanggung Jawab: Indah (Load & Performance Testing)
 * 
 * KEAMANAN:
 * Tidak ada kredensial atau password yang di-hardcode dalam script ini.
 * Seluruh kredensial dan URL wajib disuplai melalui Environment Variables k6:
 * - SISWA_EMAIL
 * - SISWA_PASSWORD
 * - EDITOR_EMAIL
 * - EDITOR_PASSWORD
 * - BASE_URL
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

    // Parameter Data Pengujian Spesifik (opsional dari env)
    SESI_ID: __ENV.SESI_ID || '',
    SUBTES_ID: __ENV.SUBTES_ID || '',
    SOAL_ID: __ENV.SOAL_ID || '',
    OPSI_ID: __ENV.OPSI_ID || '',

    // Target SLA Performa Berdasarkan Ketentuan Tugas:
    // A. Pengiriman jawaban & soal berikutnya: maksimal 1 detik (1000 ms)
    // B. Pemuatan dashboard analitik Editor: maksimal 3 detik (3000 ms)
    TARGETS: {
        SOAL_RESPONSE_TIME_MAX_MS: 1000,
        EDITOR_DASHBOARD_MAX_MS: 3000,
    },

    // Konfigurasi Beban Pengujian Bertahap (Ramping Stages)
    STAGES: {
        // Skenario A: Pengujian bertahap hingga 500 Virtual Users (VU)
        SKENARIO_A_500_VU: [
            { duration: '10s', target: 50 },   // Ramp-up ke 50 VU
            { duration: '20s', target: 100 },  // Beban 100 VU
            { duration: '20s', target: 250 },  // Beban 250 VU
            { duration: '20s', target: 500 },  // Puncak beban 500 VU
            { duration: '10s', target: 0 },    // Ramp-down pendinginan
        ],
        // Skenario B: Pengujian beban Editor (10 - 50 Editor konkuren)
        SKENARIO_B_EDITOR: [
            { duration: '10s', target: 10 },   // Ramp-up 10 editor
            { duration: '20s', target: 30 },   // Beban 30 editor
            { duration: '20s', target: 50 },   // Puncak 50 editor
            { duration: '10s', target: 0 },    // Ramp-down
        ],
        // Smoke Test Ringan (Validasi Fungsional Script)
        SMOKE_TEST: [
            { duration: '5s', target: 2 },
            { duration: '10s', target: 5 },
            { duration: '5s', target: 0 },
        ],
    },
};
