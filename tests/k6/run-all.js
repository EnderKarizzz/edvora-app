import http from 'k6/http';
import { CONFIG } from './config/environment.js';
import scenarioA from './scenarios/soal-response-time.js';
import scenarioB from './scenarios/editor-analytics-dashboard.js';

/**
 * Master Runner Load Testing EDVORA (k6)
 * Menjalankan Skenario A (Siswa) dan Skenario B (Editor) dalam satu orkestrasi pengujian k6.
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
    },
};

export function setup() {
    const res = http.get(`${CONFIG.BASE_URL}/login`);
    return { 
        status: res.status, 
        url: CONFIG.BASE_URL,
        sesiId: CONFIG.SESI_ID,
        soalId: CONFIG.SOAL_ID,
        opsiId: CONFIG.OPSI_ID,
        timestamp: new Date().toISOString() 
    };
}

export function runScenarioA(data) {
    scenarioA(data);
}

export function runScenarioB(data) {
    scenarioB(data);
}

export default function () {
    runScenarioA();
    runScenarioB();
}
