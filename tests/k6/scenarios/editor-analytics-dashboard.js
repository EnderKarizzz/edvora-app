import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { CONFIG, validateConfig } from '../config/environment.js';
import { login, getXsrfToken, extractInertiaPageData } from '../helpers/auth.js';

/**
 * SKENARIO B: Load Testing — Beban Dashboard Analitik Editor
 * Penanggung Jawab: Indah (Senior QA Automation Engineer)
 * 
 * Target Pengujian:
 * - Menguji pemuatan ringkasan stok bank soal per subtes (GET /editor) secara mandiri.
 * - Menguji pemuatan dashboard analitik agregasi stok & rata-rata penguasaan siswa (GET /editor/analitik) secara mandiri.
 * - Mengukur waktu respons masing-masing endpoint dengan target SLA maksimal 3 detik (3000 ms).
 * - Mensimulasikan konkurensi akses oleh pengguna Editor (10 -> 30 -> 50 VU).
 */

// Custom Metrics Waktu Respons Terpisah (Hanya dicatat bila menerima respons HTTP > 0)
const waktuDashboardStokEditor = new Trend('waktu_dashboard_stok_editor', true);
const waktuDashboardAnalitik = new Trend('waktu_dashboard_analitik', true);

// Metrik Tingkat Keberhasilan Bisnis & Error Terisolasi (Nama spesifik untuk mencegah konflik pada runner)
const rateSuccessEditor = new Rate('success_rate_editor');
const countEditorVisits = new Counter('total_kunjungan_editor');
const rateErrorConnection = new Rate('error_koneksi_editor');
const rateErrorAuth = new Rate('error_auth_editor');
const rateErrorServer5xx = new Rate('error_server_5xx_editor');

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
            'max<3000',
        ],
        'waktu_dashboard_analitik': [
            'p(95)<3000',
            'max<3000',
        ],
        'http_req_failed': ['rate<0.01'],
        'success_rate_editor': ['rate>0.95'],
        'total_kunjungan_editor': ['count>0'],
        'error_server_5xx_editor': ['rate<0.01'],
    },
};

export function setup() {
    validateConfig('editor');

    const checkRes = http.get(`${CONFIG.BASE_URL}/login`);
    const auth = login(CONFIG.EDITOR.EMAIL, CONFIG.EDITOR.PASSWORD, 'editor');
    if (!auth.success) {
        throw new Error(`[SETUP ERROR] Gagal melakukan autentikasi Editor: ${auth.error}`);
    }

    return {
        baseUrl: CONFIG.BASE_URL,
        serverReady: checkRes.status === 200,
        valid: auth.success,
    };
}

// State per-VU untuk menghindari login berulang di setiap iterasi
let authAttempted = false;
let isEditorLoggedIn = false;
let vuCookies = null;

export default function (setupData) {
    if (setupData && !setupData.valid) {
        rateErrorAuth.add(1);
        sleep(5);
        return;
    }

    const email = CONFIG.EDITOR.EMAIL;
    const password = CONFIG.EDITOR.PASSWORD;

    const headersInertia = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    // TAHAP 1: AUTENTIKASI EDITOR (Hanya sekali per Virtual User)
    // Cookie jar k6 dipertahankan per-VU untuk seluruh iterasi berikutnya
    const jar = http.cookieJar();
    if (!authAttempted) {
        authAttempted = true;
        const authResult = login(email, password, 'editor');
        if (authResult.success) {
            isEditorLoggedIn = true;
            vuCookies = authResult.cookies;
            rateErrorAuth.add(0);
        } else {
            isEditorLoggedIn = false;
            rateErrorAuth.add(1);
            sleep(2);
            return;
        }
    }

    if (!isEditorLoggedIn) {
        rateErrorAuth.add(1);
        sleep(5);
        return;
    }

    if (vuCookies) {
        // Pulihkan session cookie ke cookie jar VU jika direset antar-iterasi oleh k6
        for (const cName in vuCookies) {
            if (vuCookies[cName] && vuCookies[cName].length > 0) {
                jar.set(CONFIG.BASE_URL, cName, vuCookies[cName][0]);
            }
        }
    }

    // TAHAP 2: AKSES RINGKASAN STOK BANK SOAL EDITOR (GET /editor)
    // Diukur terpisah menggunakan response.timings.duration (SLA <= 3000 ms)
    const stokRes = http.get(`${CONFIG.BASE_URL}/editor`, {
        headers: headersInertia,
        tags: { name: 'METRIC_GET_Editor_Stok_Bank_Soal' },
    });
    const stokDuration = stokRes.timings.duration;

    if (stokRes.status > 0) {
        waktuDashboardStokEditor.add(stokDuration);
        rateErrorConnection.add(0);
    } else {
        rateErrorConnection.add(1);
    }

    if (stokRes.status === 401 || stokRes.status === 403) {
        isEditorLoggedIn = false;
        rateErrorAuth.add(1);
    }

    rateErrorServer5xx.add(stokRes.status >= 500 ? 1 : 0);

    const stokData = extractInertiaPageData(stokRes.body);
    const isStokValid = stokRes.status === 200 && (
        (stokData && stokData.component === 'Editor/Dashboard') ||
        (stokRes.body && (stokRes.body.includes('Editor/Dashboard') || stokRes.body.includes('stokSubtes')))
    );

    check(stokRes, {
        '[Dashboard Stok] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Dashboard Stok] Waktu respons <= 3.0 detik (SLA 3s)': () => stokRes.status > 0 && stokDuration <= CONFIG.TARGETS.EDITOR_DASHBOARD_MAX_MS,
        '[Dashboard Stok] Komponen Editor/Dashboard berhasil dimuat': () => isStokValid,
        '[Dashboard Stok] Bukan 403 Forbidden Hak Akses': (r) => r.status !== 403,
    });

    // Pacing time singkat antar perpindahan tab dashboard
    sleep(1);

    // TAHAP 3: AKSES DASHBOARD ANALITIK TERPADU (GET /editor/analitik)
    // Diukur terpisah menggunakan response.timings.duration (SLA <= 3000 ms)
    const analitikRes = http.get(`${CONFIG.BASE_URL}/editor/analitik`, {
        headers: headersInertia,
        tags: { name: 'METRIC_GET_Editor_Analitik_Terpadu' },
    });
    const analitikDuration = analitikRes.timings.duration;

    if (analitikRes.status > 0) {
        waktuDashboardAnalitik.add(analitikDuration);
        rateErrorConnection.add(0);
    } else {
        rateErrorConnection.add(1);
    }

    if (analitikRes.status === 401 || analitikRes.status === 403) {
        isEditorLoggedIn = false;
        rateErrorAuth.add(1);
    }

    rateErrorServer5xx.add(analitikRes.status >= 500 ? 1 : 0);

    const analitikData = extractInertiaPageData(analitikRes.body);
    const isAnalitikValid = analitikRes.status === 200 && (
        (analitikData && analitikData.component === 'Editor/Analitik') ||
        (analitikRes.body && (analitikRes.body.includes('Editor/Analitik') || analitikRes.body.includes('analitik')))
    );

    const isAllPassed = isStokValid && isAnalitikValid;
    rateSuccessEditor.add(isAllPassed ? 1 : 0);

    check(analitikRes, {
        '[Dashboard Analitik] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Dashboard Analitik] Waktu respons <= 3.0 detik (SLA 3s)': () => analitikRes.status > 0 && analitikDuration <= CONFIG.TARGETS.EDITOR_DASHBOARD_MAX_MS,
        '[Dashboard Analitik] Data analitik penguasaan siswa & stok termuat': () => isAnalitikValid,
        '[Dashboard Analitik] Bukan 5xx Server Error': (r) => r.status < 500,
    });

    if (isAllPassed) {
        countEditorVisits.add(1);
    }

    // Pacing time wajar sebelum iterasi berikutnya
    sleep(2);
}

export function teardown() {
    console.log(`[TEARDOWN] Skenario B selesai diuji pada ${new Date().toISOString()}`);
}
