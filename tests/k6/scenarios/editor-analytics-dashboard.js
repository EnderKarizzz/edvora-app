import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { CONFIG } from '../config/environment.js';
import { login, getXsrfToken } from '../helpers/auth.js';

/**
 * SKENARIO B: Load Testing — Beban Dashboard Analitik Editor
 * Penanggung Jawab: Indah (Performance / Load Testing)
 * 
 * Target Pengujian:
 * - Menguji pemuatan ringkasan stok bank soal per subtes (/editor) secara terpisah.
 * - Menguji pemuatan dashboard analitik agregasi stok & penguasaan siswa (/editor/analitik) secara terpisah.
 * - Menilai kestabilan respons server ketika diakses konkuren oleh Editor.
 * - Target SLA Waktu Respons: Maksimal 3 detik (3000 ms).
 */

// Custom Metrics Waktu Respons Terpisah (SLA <= 3000 ms)
const waktuDashboardStokEditor = new Trend('waktu_dashboard_stok_editor', true);
const waktuDashboardAnalitik = new Trend('waktu_dashboard_analitik', true);

// Metrik Tingkat Keberhasilan & Error
const rateSuccessEditor = new Rate('success_rate_editor');
const countEditorVisits = new Counter('total_kunjungan_editor');
const rateErrorAuth401 = new Rate('error_auth_401');
const rateErrorServer5xx = new Rate('error_server_5xx');

export const options = {
    scenarios: {
        editor_dashboard_load: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: CONFIG.STAGES.SKENARIO_B_EDITOR,
            gracefulRampDown: '15s',
        },
    },
    thresholds: {
        // Target SLA: Maksimal 3 detik (3000 ms)
        'waktu_dashboard_stok_editor': [
            'p(95)<3000',
            'max<3000'
        ],
        'waktu_dashboard_analitik': [
            'p(95)<3000',
            'max<3000'
        ],
        'http_req_failed': ['rate<0.01'],
        'success_rate_editor': ['rate>0.95'],
        'error_server_5xx': ['rate<0.01'],
    },
};

export function setup() {
    const checkRes = http.get(`${CONFIG.BASE_URL}/login`);
    return {
        baseUrl: CONFIG.BASE_URL,
        serverReady: checkRes.status === 200,
    };
}

export default function () {
    const email = CONFIG.EDITOR.EMAIL;
    const password = CONFIG.EDITOR.PASSWORD;

    const headersInertia = {
        'Accept': 'text/html, application/xhtml+xml, application/json',
        'X-Inertia': 'true',
        'X-Inertia-Version': '1.0.0',
        'X-Requested-With': 'XMLHttpRequest',
    };

    // TAHAP 1: AUTENTIKASI EDITOR (Diukur terpisah, tidak masuk metrik dashboard)
    const authResult = login(email, password, 'editor');
    if (!authResult.success) {
        rateErrorAuth401.add(authResult.statusCode === 401 || authResult.statusCode === 422 ? 1 : 0);
        // Think time agar VU yang gagal login tidak melakukan hammering dalam tight-loop
        sleep(2);
        return;
    }
    rateErrorAuth401.add(0);

    // TAHAP 2: AKSES DASHBOARD STOK SOAL EDITOR (GET /editor)
    // Menguji pemuatan ringkasan stok bank soal per subtes (AdminSoalController::dashboard)
    const stokStart = Date.now();
    const stokRes = http.get(`${CONFIG.BASE_URL}/editor`, {
        headers: headersInertia,
        tags: { name: 'METRIC_GET_Editor_Stok_Dashboard' },
    });
    const stokDuration = Date.now() - stokStart;
    waktuDashboardStokEditor.add(stokDuration);

    rateErrorServer5xx.add(stokRes.status >= 500 ? 1 : 0);

    const isStokValid = stokRes.status === 200 && (stokRes.body.includes('Editor/Dashboard') || stokRes.body.includes('stokSubtes'));

    check(stokRes, {
        '[Dashboard Stok] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Dashboard Stok] Waktu respons <= 3.0 detik (SLA 3s)': () => stokDuration <= CONFIG.TARGETS.EDITOR_DASHBOARD_MAX_MS,
        '[Dashboard Stok] Memuat komponen Editor/Dashboard': () => isStokValid,
    });

    // TAHAP 3: AKSES DASHBOARD ANALITIK (GET /editor/analitik)
    // Menguji agregasi stok topik, kekurangan bank soal, & rata-rata penguasaan siswa (AnalitikController::index)
    const analitikStart = Date.now();
    const analitikRes = http.get(`${CONFIG.BASE_URL}/editor/analitik`, {
        headers: headersInertia,
        tags: { name: 'METRIC_GET_Editor_Analitik' },
    });
    const analitikDuration = Date.now() - analitikStart;
    waktuDashboardAnalitik.add(analitikDuration);

    rateErrorServer5xx.add(analitikRes.status >= 500 ? 1 : 0);

    const isAnalitikValid = analitikRes.status === 200 && (analitikRes.body.includes('Editor/Analitik') || analitikRes.body.includes('analitik'));

    check(analitikRes, {
        '[Analitik Editor] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Analitik Editor] Waktu respons <= 3.0 detik (SLA 3s)': () => analitikDuration <= CONFIG.TARGETS.EDITOR_DASHBOARD_MAX_MS,
        '[Analitik Editor] Memuat komponen Editor/Analitik': () => isAnalitikValid,
    });

    const isAllPassed = isStokValid && isAnalitikValid;
    rateSuccessEditor.add(isAllPassed ? 1 : 0);
    countEditorVisits.add(1);

    // Think time Editor membaca diagram/analitik (2 detik)
    sleep(2);
}

export function teardown(data) {
    console.log(`[TEARDOWN] Skenario B selesai diuji pada ${new Date().toISOString()}`);
}
