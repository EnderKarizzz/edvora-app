import http from 'k6/http';
import { CONFIG, validateConfig } from './config/environment.js';
import scenarioA, { setup as setupA } from './scenarios/soal-response-time.js';
import scenarioB, { setup as setupB } from './scenarios/editor-analytics-dashboard.js';

/**
 * Master Runner Load Testing EDVORA (k6)
 * Menjalankan Skenario A (Siswa) dan Skenario B (Editor) secara berurutan dalam satu orkestrasi pengujian k6.
 * Mencegah konflik nama custom metrics dan bentrok konkurensi antar skenario.
 */

export const options = {
    scenarios: {
        skenario_a_soal: {
            executor: 'ramping-vus',
            exec: 'runScenarioA',
            startVUs: 1,
            stages: CONFIG.STAGES.SKENARIO_A_500_VU,
            gracefulRampDown: '15s',
        },
        skenario_b_editor: {
            executor: 'ramping-vus',
            exec: 'runScenarioB',
            startTime: '1m45s', // Eksekusi berurutan setelah Skenario A selesai dan socket stabil
            startVUs: 1,
            stages: CONFIG.STAGES.SKENARIO_B_EDITOR,
            gracefulRampDown: '15s',
        },
    },
    thresholds: {
        'waktu_pengiriman_jawaban': ['p(95)<1000', 'max<1000'],
        'waktu_ambil_soal_berikutnya': ['p(95)<1000', 'max<1000'],
        'waktu_dashboard_stok_editor': ['p(95)<3000', 'max<3000'],
        'waktu_dashboard_analitik': ['p(95)<3000', 'max<3000'],
        'http_req_failed': ['rate<0.01'],
        'success_rate_jawaban': ['rate>0.95'],
        'total_jawaban_terkirim': ['count>0'],
        'success_rate_editor': ['rate>0.95'],
        'total_kunjungan_editor': ['count>0'],
        'error_server_5xx_soal': ['rate<0.01'],
        'error_server_5xx_editor': ['rate<0.01'],
    },
};

export function setup() {
    validateConfig('all');

    let dataA = null;
    let dataB = null;

    try {
        dataA = setupA();
    } catch (e) {
        console.error(`[SETUP ERROR Skenario A] ${e.message}`);
    }

    try {
        dataB = setupB();
    } catch (e) {
        console.error(`[SETUP ERROR Skenario B] ${e.message}`);
    }

    return { 
        scenarioA: dataA,
        scenarioB: dataB,
        url: CONFIG.BASE_URL,
        timestamp: new Date().toISOString() 
    };
}

export function runScenarioA(data) {
    scenarioA(data ? data.scenarioA : null);
}

export function runScenarioB(data) {
    scenarioB(data ? data.scenarioB : null);
}

export default function (data) {
    runScenarioA(data);
    runScenarioB(data);
}
