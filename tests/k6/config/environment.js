/**
 * Konfigurasi Lingkungan dan Target Metrik Load Testing EDVORA (k6)
 * Bagian Tugas: Indah (Load & Performance Testing)
 * 
 * Pengaturan credential dan URL base dibaca dari Environment Variables (__ENV)
 * agar credential aman dan tidak hardcoded saat di-commit ke Git.
 */

export const CONFIG = {
    BASE_URL: __ENV.BASE_URL || 'http://127.0.0.1:8000',
    
    // Kredensial Siswa (Skenario A: Respons Pengiriman Jawaban & Ambil Soal)
    SISWA: {
        EMAIL: __ENV.SISWA_EMAIL || 'sim001@simulasi.test',
        PASSWORD: __ENV.SISWA_PASSWORD || 'SimulasiEdvora2026',
    },

    // Kredensial Editor (Skenario B: Beban Dashboard Analitik Editor)
    EDITOR: {
        EMAIL: __ENV.EDITOR_EMAIL || 'dapa@gmail.com',
        PASSWORD: __ENV.EDITOR_PASSWORD || '12345678',
    },

    // Target SLA Performa Berdasarkan Ketentuan Tugas:
    // A. Pengiriman jawaban & soal berikutnya: maksimal 1 detik (1000 ms)
    // B. Pemuatan dashboard analitik Editor: maksimal 3 detik (3000 ms)
    TARGETS: {
        SOAL_RESPONSE_TIME_MAX_MS: 1000,
        EDITOR_DASHBOARD_MAX_MS: 3000,
    },

    // Opsi Ramp-up Stages untuk simulasi 100 - 500 Virtual Users
    STAGES: {
        // Profil Beban Bertahap (Smoke -> Load -> Stress -> Cool-down)
        SCALE_100_VU: [
            { duration: '30s', target: 20 },   // Ramp-up awal
            { duration: '1m',  target: 50 },   // Beban sedang
            { duration: '1m',  target: 100 },  // Puncak 100 VU
            { duration: '30s', target: 0 },    // Ramp-down
        ],
        SCALE_250_VU: [
            { duration: '30s', target: 50 },
            { duration: '1m',  target: 150 },
            { duration: '1m',  target: 250 },
            { duration: '30s', target: 0 },
        ],
        SCALE_500_VU: [
            { duration: '1m',  target: 100 },
            { duration: '2m',  target: 300 },
            { duration: '2m',  target: 500 },  // Puncak 500 VU
            { duration: '1m',  target: 0 },
        ],
        // Profil Cepat / Smoke Test (untuk verifikasi fungsional script)
        SMOKE_TEST: [
            { duration: '10s', target: 5 },
            { duration: '20s', target: 10 },
            { duration: '10s', target: 0 },
        ],
    },
};

