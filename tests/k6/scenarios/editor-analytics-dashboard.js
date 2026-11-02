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
 * - Menguji pemuatan ringkasan stok bank soal
 * - Menguji pemetaan rata-rata penguasaan siswa
 * - Mengukur stabilitas respons ketika diakses secara bersamaan
 * - Target SLA maksimal: 3 detik (3000 ms)
 */

// Custom Metrics untuk Pelaporan Detail
const waktuPemuatanAnalitik = new Trend('editor_analitik_duration', true);
const waktuPemuatanDashboardUtama = new Trend('editor_dashboard_duration', true);
const waktuStokBankSoal = new Trend('stok_bank_soal_duration', true);
const waktuPenguasaanSiswa = new Trend('penguasaan_siswa_duration', true);
const tingkatKeberhasilanEditor = new Rate('editor_dashboard_success');
const totalKunjunganEditor = new Counter('editor_visits_count');

export const options = {
    scenarios: {
        // Beban konkuren editor mengakses dashboard analitik
        editor_dashboard_load: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
                { duration: '30s', target: 20 },   // Ramp-up 20 Editor
                { duration: '1m',  target: 50 },   // Stabil di 50 Editor
                { duration: '1m',  target: 100 },  // Puncak 100 Editor konkuren
                { duration: '30s', target: 0 },    // Ramp-down
            ],
            gracefulRampDown: '15s',
        },
    },
    thresholds: {
        // Target SLA: Maksimal 3 detik (3000 ms)
        // p95 untuk acuan penerimaan performa, max untuk pengamatan batas waktu ekstrim
        'http_req_duration': [
            'p(95)<3000', // 95% request harus selesai di bawah 3 detik
            'max<3000',   // Batas waktu pemuatan maksimal 3 detik
        ],
        'editor_analitik_duration': ['p(95)<3000'],
        'stok_bank_soal_duration': ['p(95)<3000'],
        'penguasaan_siswa_duration': ['p(95)<3000'],
        'http_req_failed': ['rate<0.01'], // Error rate < 1%
        'editor_dashboard_success': ['rate>0.95'],
    },
};

export function setup() {
    const res = http.get(`${CONFIG.BASE_URL}/login`);
    if (res.status !== 200) {
        console.warn(`[PERINGATAN SETUP] Server tidak merespons 200 di ${CONFIG.BASE_URL}/login. Status: ${res.status}`);
    }
    return {
        baseUrl: CONFIG.BASE_URL,
        timestamp: new Date().toISOString(),
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

    // 1. TAHAP AUTENTIKASI EDITOR
    group('1. Autentikasi Editor', function () {
        const auth = login(email, password);
        tingkatKeberhasilanEditor.add(auth.success);
    });

    let xsrfToken = getXsrfToken(CONFIG.BASE_URL);

    // 2. TAHAP AKSES DASHBOARD STOK SOAL EDITOR (/editor)
    group('2. Akses Dashboard Editor (Ringkasan Subtes)', function () {
        const dashMulai = Date.now();
        const dashRes = http.get(`${CONFIG.BASE_URL}/editor`, {
            headers: headersInertia,
            tags: { name: 'GET_Editor_Dashboard' },
        });
        const dashDuration = Date.now() - dashMulai;
        waktuPemuatanDashboardUtama.add(dashDuration);

        check(dashRes, {
            'Akses /editor berhasil (200/302)': (r) => r.status === 200 || r.status === 302,
            'Dashboard editor selesai <= 3 detik': () => dashDuration <= CONFIG.TARGETS.EDITOR_DASHBOARD_MAX_MS,
        });
    });

    // 3. TAHAP AKSES DASHBOARD ANALITIK (/editor/analitik)
    // Menguji pemuatan ringkasan stok bank soal dan pemetaan rata-rata penguasaan siswa
    group('3. Akses Dashboard Analitik (/editor/analitik)', function () {
        const analitikMulai = Date.now();
        const analitikRes = http.get(`${CONFIG.BASE_URL}/editor/analitik`, {
            headers: headersInertia,
            tags: { name: 'GET_Editor_Analitik' },
        });
        const analitikDuration = Date.now() - analitikMulai;
        waktuPemuatanAnalitik.add(analitikDuration);
        waktuStokBankSoal.add(analitikDuration);
        waktuPenguasaanSiswa.add(analitikDuration);

        totalKunjunganEditor.add(1);

        const isSuccess = analitikRes.status === 200 || analitikRes.status === 302;
        tingkatKeberhasilanEditor.add(isSuccess);

        check(analitikRes, {
            'Akses /editor/analitik status 200/302': () => isSuccess,
            'Pemuatan analitik selesai <= 3 detik (Target 3s)': () => analitikDuration <= CONFIG.TARGETS.EDITOR_DASHBOARD_MAX_MS,
            'Status respons bukan 500 server error': (r) => r.status < 500,
        });

        // Verifikasi payload analitik (Ringkasan Stok & Penguasaan Siswa)
        if (analitikRes.status === 200 && analitikRes.body) {
            check(analitikRes, {
                'Payload memuat komponen Editor/Analitik': (r) => r.body.includes('Editor/Analitik') || r.body.includes('analitik'),
            });
        }
    });

    // Simulasi aktivitas Editor membaca data visual / diagram (2 detik)
    sleep(2);
}

export function teardown(data) {
    console.log(`[TEARDOWN] Skenario B selesai diuji pada ${new Date().toISOString()}`);
}

