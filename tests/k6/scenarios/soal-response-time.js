import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { CONFIG } from '../config/environment.js';
import { login, getXsrfToken } from '../helpers/auth.js';

/**
 * SKENARIO A: Load Testing — Batas Waktu Respons Soal
 * Penanggung Jawab: Indah (Load & Performance Testing)
 * 
 * Target Pengujian:
 * - Mengukur waktu pemrosesan pengiriman jawaban oleh server (POST /latihan/ujian/jawab) secara terpisah.
 * - Mengukur waktu pengambilan atau pemunculan soal berikutnya (GET /latihan/kerjakan/{sesiId}) secara terpisah.
 * - Simulasi beban bertahap hingga 500 Virtual Users (VU).
 * - Target SLA Waktu Respons: Maksimal 1 detik (1000 ms) untuk masing-masing aksi.
 */

// Custom Metrics Waktu Respons Terpisah (SLA <= 1000 ms)
const waktuPengirimanJawaban = new Trend('waktu_pengiriman_jawaban', true);
const waktuAmbilSoalBerikutnya = new Trend('waktu_ambil_soal_berikutnya', true);
const waktuSiklusPenuhSoal = new Trend('total_siklus_soal', true);

// Metrik Keberhasilan Bisnis & Error Terisolasi
const rateSuccessJawaban = new Rate('success_rate_jawaban');
const countJawabanTerkirim = new Counter('total_jawaban_terkirim');
const rateErrorAuth = new Rate('error_auth_401');
const rateErrorValidation = new Rate('error_validation_422');
const rateErrorSesiHabis = new Rate('error_sesi_habis_410');
const rateErrorRateLimit = new Rate('error_rate_limited_429');
const rateErrorServer5xx = new Rate('error_server_5xx');

export const options = {
    scenarios: {
        load_test_soal: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: CONFIG.STAGES.SKENARIO_A_500_VU,
            gracefulRampDown: '15s',
        },
    },
    thresholds: {
        // Target SLA: Maksimal 1000 ms (1 detik)
        'waktu_pengiriman_jawaban': [
            'p(95)<1000',
            'max<1000'
        ],
        'waktu_ambil_soal_berikutnya': [
            'p(95)<1000',
            'max<1000'
        ],
        'http_req_failed': ['rate<0.01'],
        'success_rate_jawaban': ['rate>0.95'],
        'error_server_5xx': ['rate<0.01'],
    },
};

/**
 * Setup function: Memverifikasi kesiapan server dan mengambil data sesi aktif bila ada
 */
export function setup() {
    const res = http.get(`${CONFIG.BASE_URL}/login`);
    return {
        baseUrl: CONFIG.BASE_URL,
        serverReady: res.status === 200,
        activeSession: {
            sesiId: CONFIG.SESI_ID || '',
            soalId: CONFIG.SOAL_ID || '',
        },
    };
}

export default function (data) {
    const email = CONFIG.SISWA.EMAIL;
    const password = CONFIG.SISWA.PASSWORD;

    // Headers standar untuk request API dan Inertia
    const headersInertia = {
        'Accept': 'text/html, application/xhtml+xml, application/json',
        'X-Inertia': 'true',
        'X-Inertia-Version': '1.0.0',
        'X-Requested-With': 'XMLHttpRequest',
    };

    // TAHAP 1: AUTENTIKASI SISWA
    // Waktu login diukur tersendiri dan TIDAK dicampur ke dalam metrik SLA pemrosesan soal
    const authResult = login(email, password, 'siswa');
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

    const xsrfToken = authResult.xsrfToken || getXsrfToken(CONFIG.BASE_URL);
    const headersPost = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };
    if (xsrfToken) {
        headersPost['X-XSRF-TOKEN'] = xsrfToken;
    }

    // TAHAP 2: MENENTUKAN ATAU MENGAMBIL SESI PENGERJAAN AKTIF
    // Berdasarkan LatihanSoalController:
    // Sesi fleksibel dimuat di GET /latihan/kerjakan/{pengerjaanId}
    let sesiId = CONFIG.SESI_ID;
    let soalId = CONFIG.SOAL_ID;

    // Jika parameter sesiId tidak disuplai dari luar, coba temukan sesi aktif dari riwayat
    if (!sesiId) {
        const riwayatRes = http.get(`${CONFIG.BASE_URL}/riwayat`, {
            headers: headersInertia,
            tags: { name: 'GET_Riwayat_Pengerjaan' },
        });

        if (riwayatRes.status === 200 && riwayatRes.body) {
            // Ekstrak ID pengerjaan berjalan dari props Inertia jika ada
            const match = riwayatRes.body.match(/"id":"([0-9a-f-]{36})"[^}]*"status":"berjalan"/i);
            if (match && match[1]) {
                sesiId = match[1];
            }
        }
    }

    // Jika tidak ada sesi latihan yang aktif atau kredensial database belum menyediakan soal:
    if (!sesiId) {
        // Catat bahwa proses pengujian membutuhkan sesi aktif dari database
        sleep(2);
        return;
    }

    // TAHAP 3: PENGIRIMAN JAWABAN SISWA (POST /latihan/ujian/jawab)
    // Diukur terpisah sebagai metrik waktu_pengiriman_jawaban (SLA <= 1000 ms)
    const payloadJawab = JSON.stringify({
        sesiId: sesiId,
        soalId: soalId || 'default-soal-uuid',
        opsiIds: [],
        jawabanIsian: '1',
        pilihanKolom: null,
    });

    const startJawab = Date.now();
    const jawabRes = http.post(`${CONFIG.BASE_URL}/latihan/ujian/jawab`, payloadJawab, {
        headers: headersPost,
        tags: { name: 'METRIC_POST_Ujian_Jawab' },
    });
    const durasiJawab = Date.now() - startJawab;
    waktuPengirimanJawaban.add(durasiJawab);

    // Pencatatan Error Kategoris
    rateErrorRateLimit.add(jawabRes.status === 429 ? 1 : 0);
    rateErrorSesiHabis.add(jawabRes.status === 410 ? 1 : 0);
    rateErrorValidation.add(jawabRes.status === 422 ? 1 : 0);
    rateErrorServer5xx.add(jawabRes.status >= 500 ? 1 : 0);

    const isJawabSukses = jawabRes.status === 200 && jawabRes.body.includes('benar');
    rateSuccessJawaban.add(isJawabSukses ? 1 : 0);

    check(jawabRes, {
        '[Submit Jawaban] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Submit Jawaban] Waktu respons <= 1.0 detik (SLA 1s)': () => durasiJawab <= CONFIG.TARGETS.SOAL_RESPONSE_TIME_MAX_MS,
        '[Submit Jawaban] Server memvalidasi proses bisnis jawaban': () => isJawabSukses,
        '[Submit Jawaban] Tidak terkena Rate Limiter (Bukan 429)': (r) => r.status !== 429,
        '[Submit Jawaban] Bukan Sesi Habis (Bukan 410)': (r) => r.status !== 410,
        '[Submit Jawaban] Bukan Error Validasi (Bukan 422)': (r) => r.status !== 422,
    });

    if (isJawabSukses) {
        countJawabanTerkirim.add(1);
    }

    // TAHAP 4: PENGAMBILAN / PEMUNCULAN SOAL BERIKUTNYA (GET /latihan/kerjakan/{sesiId})
    // Diukur terpisah sebagai metrik waktu_ambil_soal_berikutnya (SLA <= 1000 ms)
    // Sesuai alur implementasi EDVORA: Halaman kerjakan memuat soal-soal sesi ujian
    const nextUrl = `${CONFIG.BASE_URL}/latihan/kerjakan/${sesiId}`;
    const startAmbil = Date.now();
    const ambilRes = http.get(nextUrl, {
        headers: headersInertia,
        tags: { name: 'METRIC_GET_Soal_Berikutnya' },
    });
    const durasiAmbil = Date.now() - startAmbil;
    waktuAmbilSoalBerikutnya.add(durasiAmbil);

    waktuSiklusPenuhSoal.add(durasiJawab + durasiAmbil);

    const isAmbilSukses = ambilRes.status === 200 && (ambilRes.body.includes('Latihan/Ujian') || ambilRes.body.includes('soalList'));

    check(ambilRes, {
        '[Ambil Soal] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Ambil Soal] Waktu respons <= 1.0 detik (SLA 1s)': () => durasiAmbil <= CONFIG.TARGETS.SOAL_RESPONSE_TIME_MAX_MS,
        '[Ambil Soal] Komponen soal berhasil dimuat': () => isAmbilSukses,
        '[Ambil Soal] Bukan 404 Tidak Ditemukan': (r) => r.status !== 404,
    });

    // Pacing time singkat antar siklus pengerjaan soal berikutnya
    sleep(1);
}

export function teardown() {
    console.log(`[TEARDOWN] Skenario A selesai diuji pada ${new Date().toISOString()}`);
}
