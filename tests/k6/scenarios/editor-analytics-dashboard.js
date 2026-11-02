import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { CONFIG } from '../config/environment.js';
import { login, getXsrfToken } from '../helpers/auth.js';

/**
 * SKENARIO B: Load Testing — Beban Dashboard Analitik Editor
 * Penanggung Jawab: Indah (Load & Performance Testing)
 * 
 * Target Pengujian:
 * - Menguji pemuatan ringkasan stok bank soal per subtes (GET /editor) secara mandiri.
 * - Menguji pemuatan dashboard analitik agregasi stok & rata-rata penguasaan siswa (GET /editor/analitik) secara mandiri.
 * - Mengukur waktu respons masing-masing endpoint dengan target SLA maksimal 3 detik (3000 ms).
 * - Mensimulasikan konkurensi akses oleh pengguna Editor (10 -> 30 -> 50 VU).
 */

// Custom Metrics Waktu Respons Terpisah (SLA <= 3000 ms)
const waktuDashboardStokEditor = new Trend('waktu_dashboard_stok_editor', true);
const waktuDashboardAnalitik = new Trend('waktu_dashboard_analitik', true);

// Metrik Tingkat Keberhasilan Bisnis & Error Terisolasi
const rateSuccessEditor = new Rate('success_rate_editor');
const countEditorVisits = new Counter('total_kunjungan_editor');
const rateErrorAuth = new Rate('error_auth_401');
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
        // Target SLA: Maksimal 3000 ms (3 detik)
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

    // TAHAP 1: AUTENTIKASI EDITOR
    // Waktu login diukur tersendiri dan TIDAK dicampur ke dalam metrik dashboard
    const authResult = login(email, password, 'editor');
    if (!authResult.success) {
        if (authResult.statusCode === 401 || authResult.statusCode === 422) {
            rateErrorAuth.add(1);
        } else {
            rateErrorAuth.add(0);
        }
        // Jeda waktu agar VU yang gagal login tidak melakukan tight-loop hammering
        sleep(2);
        return;
    }
    rateErrorAuth.add(0);

    // TAHAP 2: AKSES RINGKASAN STOK BANK SOAL EDITOR (GET /editor)
    // AdminSoalController::dashboard -> Memuat stok subtes, published, draft, review
    const stokStart = Date.now();
    const stokRes = http.get(`${CONFIG.BASE_URL}/editor`, {
        headers: headersInertia,
        tags: { name: 'METRIC_GET_Editor_Stok_Bank_Soal' },
    });
    const stokDuration = Date.now() - stokStart;
    waktuDashboardStokEditor.add(stokDuration);

    rateErrorServer5xx.add(stokRes.status >= 500 ? 1 : 0);

    const isStokValid = stokRes.status === 200 && (stokRes.body.includes('Editor/Dashboard') || stokRes.body.includes('stokSubtes'));

    check(stokRes, {
        '[Dashboard Stok] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Dashboard Stok] Waktu respons <= 3.0 detik (SLA 3s)': () => stokDuration <= CONFIG.TARGETS.EDITOR_DASHBOARD_MAX_MS,
        '[Dashboard Stok] Komponen Editor/Dashboard berhasil dimuat': () => isStokValid,
        '[Dashboard Stok] Bukan 403 Forbidden Hak Akses': (r) => r.status !== 403,
    });

    // Pacing time singkat antar perpindahan tab dashboard
    sleep(1);

    // TAHAP 3: AKSES DASHBOARD ANALITIK TERPADU (GET /editor/analitik)
    // AnalitikController::index -> Memuat ringkasan stok topik dan pemetaan rata-rata penguasaan siswa
    // Catatan: Karena kedua metrik ini berasal dari satu endpoint controller, dicatat sebagai satu metrik analitik terpadu
    const analitikStart = Date.now();
    const analitikRes = http.get(`${CONFIG.BASE_URL}/editor/analitik`, {
        headers: headersInertia,
        tags: { name: 'METRIC_GET_Editor_Analitik_Terpadu' },
    });
    const analitikDuration = Date.now() - analitikStart;
    waktuDashboardAnalitik.add(analitikDuration);

    rateErrorServer5xx.add(analitikRes.status >= 500 ? 1 : 0);

    const isAnalitikValid = analitikRes.status === 200 && (analitikRes.body.includes('Editor/Analitik') || analitikRes.body.includes('analitik'));

    const isAllPassed = isStokValid && isAnalitikValid;
    rateSuccessEditor.add(isAllPassed ? 1 : 0);

    check(analitikRes, {
        '[Dashboard Analitik] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Dashboard Analitik] Waktu respons <= 3.0 detik (SLA 3s)': () => analitikDuration <= CONFIG.TARGETS.EDITOR_DASHBOARD_MAX_MS,
        '[Dashboard Analitik] Data analitik penguasaan siswa & stok termuat': () => isAnalitikValid,
        '[Dashboard Analitik] Bukan 500 Internal Server Error': (r) => r.status < 500,
    });

    if (isAllPassed) {
        countEditorVisits.add(1);
    }

    // Pacing time sebelum iterasi berikutnya
    sleep(2);
}

export function teardown() {
    console.log(`[TEARDOWN] Skenario B selesai diuji pada ${new Date().toISOString()}`);
}
