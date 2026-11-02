import http from 'k6/http';
import { group, sleep } from 'k6';
import { CONFIG } from './config/environment.js';
import scenarioA from './scenarios/soal-response-time.js';
import scenarioB from './scenarios/editor-analytics-dashboard.js';

/**
 * Runner Gabungan Load Testing EDVORA (k6)
 * Menjalankan Skenario A (Siswa - Batas Waktu Respons Soal) dan
 * Skenario B (Editor - Dashboard Analitik) secara terorkestrasi.
 */

export const options = {
    scenarios: {
        skenario_a_soal: {
            executor: 'ramping-vus',
            exec: 'runScenarioA',
            startVUs: 1,
            stages: [
                { duration: '20s', target: 20 },
                { duration: '40s', target: 100 },
                { duration: '20s', target: 0 },
            ],
            gracefulRampDown: '10s',
        },
        skenario_b_editor: {
            executor: 'ramping-vus',
            exec: 'runScenarioB',
            startVUs: 1,
            stages: [
                { duration: '20s', target: 10 },
                { duration: '40s', target: 50 },
                { duration: '20s', target: 0 },
            ],
            gracefulRampDown: '10s',
        },
    },
    thresholds: {
        'http_req_duration{scenario:skenario_a_soal}': ['p(95)<1000', 'max<1000'],
        'http_req_duration{scenario:skenario_b_editor}': ['p(95)<3000', 'max<3000'],
        'http_req_failed': ['rate<0.01'],
    },
};

export function setup() {
    const res = http.get(`${CONFIG.BASE_URL}/login`);
    return { status: res.status, url: CONFIG.BASE_URL };
}

export function runScenarioA() {
    scenarioA();
}

export function runScenarioB() {
    scenarioB();
}

export default function () {
    // Default fallback jika dijalankan tanpa parameter exec
    runScenarioA();
    sleep(1);
    runScenarioB();
}

