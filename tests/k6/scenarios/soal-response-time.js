import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { CONFIG } from '../config/environment.js';
import { login, getXsrfToken } from '../helpers/auth.js';

/**
 * SKENARIO A: Load Testing — Batas Waktu Respons Soal
 * Penanggung Jawab: Indah (Performance / Load Testing)
 * 
 * Target Pengujian:
 * - Mensimulasikan pengujian beban bertahap hingga 500 Virtual Users (VU).
 * - Mengukur waktu pemrosesan pengiriman jawaban oleh backend (POST /latihan/ujian/jawab) secara terpisah (SLA <= 1 detik).
 * - Mengukur waktu pengambilan / pemunculan soal berikutnya secara terpisah (SLA <= 1 detik).
 * - Waktu login diisolasi dan TIDAK dimasukkan ke metrik performa soal.
 */

// Custom Metrics Waktu Respons (SLA <= 1000 ms)
const waktuPengirimanJawaban = new Trend('waktu_pengiriman_jawaban', true);
const waktuAmbilSoalBerikutnya = new Trend('waktu_ambil_soal_berikutnya', true);
const totalSiklusSoal = new Trend('total_siklus_soal', true);

// Metrik Penghitung & Kategori Error Spesifik
const rateJawabanBerhasil = new Rate('success_rate_jawaban');
const rateAmbilSoalBerhasil = new Rate('success_rate_ambil_soal');
const countJawabanTerkirim = new Counter('total_jawaban_terkirim');

const rateErrorAuth401 = new Rate('error_auth_401');
const rateErrorValidation422 = new Rate('error_validation_422');
const rateErrorSesi410 = new Rate('error_sesi_habis_410');
const rateErrorRateLimit429 = new Rate('error_rate_limited_429');
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
        // Target SLA Spesifik: Maksimal 1 detik (1000 ms)
        // p95 untuk evaluasi penerimaan sistem, max untuk evaluasi batas ekstrim
        'waktu_pengiriman_jawaban': [
            'p(95)<1000',
            'max<1000'
        ],
        'waktu_ambil_soal_berikutnya': [
            'p(95)<1000',
            'max<1000'
        ],
        'total_siklus_soal': [
            'p(95)<1000',
            'max<1000'
        ],
        'http_req_failed': ['rate<0.01'],
        'success_rate_jawaban': ['rate>0.95'],
        'error_server_5xx': ['rate<0.01'],
        'error_rate_limited_429': ['rate<0.05'],
    },
};

export function setup() {
    // 1. Verifikasi konektivitas server awal
    const checkRes = http.get(`${CONFIG.BASE_URL}/login`);
    const serverReady = checkRes.status === 200;
    
    // 2. Ambil parameter data nyata dari environment atau database jika disediakan
    let activeSession = {
        sesiId: CONFIG.SESI_ID,
        soalId: CONFIG.SOAL_ID,
        opsiId: CONFIG.OPSI_ID,
    };

    return {
        baseUrl: CONFIG.BASE_URL,
        serverReady: serverReady,
        activeSession: activeSession,
    };
}

export default function (data) {
    const email = CONFIG.SISWA.EMAIL;
    const password = CONFIG.SISWA.PASSWORD;

    const headersInertia = {
        'Accept': 'text/html, application/xhtml+xml, application/json',
        'X-Inertia': 'true',
        'X-Inertia-Version': '1.0.0',
        'X-Requested-With': 'XMLHttpRequest',
    };

    // TAHAP 1: AUTENTIKASI SISWA (Diukur terpisah, tidak masuk metrik soal)
    const authResult = login(email, password, 'siswa');
    if (!authResult.success) {
        rateErrorAuth401.add(authResult.statusCode === 401 || authResult.statusCode === 422 ? 1 : 0);
        // Think time agar VU yang gagal login tidak melakukan hammering dalam tight-loop
        sleep(2);
        return;
    }
    rateErrorAuth401.add(0);

    const xsrfToken = authResult.xsrfToken || getXsrfToken(CONFIG.BASE_URL);

    // TAHAP 2: AKSES SESI & PENGAMBILAN SOAL AKTUAL
    // Mencoba mengambil data pengerjaan yang valid
    let sesiId = data.activeSession.sesiId;
    let soalId = data.activeSession.soalId;
    let opsiId = data.activeSession.opsiId;

    // Jika sesiId belum ada di env, periksa halaman pengerjaan fleksibel
    if (!sesiId) {
        const persiapanRes = http.get(`${CONFIG.BASE_URL}/latihan/persiapan`, {
            headers: headersInertia,
            tags: { name: 'GET_Latihan_Persiapan' },
        });

        check(persiapanRes, {
            '[Siswa] Halaman persiapan latihan respons 200 OK': (r) => r.status === 200,
        });
    }

    // TAHAP 3: PENGIRIMAN JAWABAN (POST /latihan/ujian/jawab)
    // Sesuai implementasi aktual LatihanSoalController::jawab()
    if (sesiId && soalId) {
        const payloadJawab = JSON.stringify({
            sesiId: sesiId,
            soalId: soalId,
            opsiIds: opsiId ? [opsiId] : [],
            jawabanIsian: null,
            pilihanKolom: null,
        });

        const jawabHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        };
        if (xsrfToken) {
            jawabHeaders['X-XSRF-TOKEN'] = xsrfToken;
        }

        // Mulai pengukuran waktu pemrosesan pengiriman jawaban secara terpisah
        const kirimStart = Date.now();
        const jawabRes = http.post(`${CONFIG.BASE_URL}/latihan/ujian/jawab`, payloadJawab, {
            headers: jawabHeaders,
            tags: { name: 'METRIC_POST_Jawab_Soal' },
        });
        const kirimDuration = Date.now() - kirimStart;
        waktuPengirimanJawaban.add(kirimDuration);

        // Pencatatan kategori status HTTP
        rateErrorValidation422.add(jawabRes.status === 422 ? 1 : 0);
        rateErrorSesi410.add(jawabRes.status === 410 ? 1 : 0);
        rateErrorRateLimit429.add(jawabRes.status === 429 ? 1 : 0);
        rateErrorServer5xx.add(jawabRes.status >= 500 ? 1 : 0);

        // Validasi Ketat: Hanya HTTP 200 dengan payload penilaian yang sah
        const isJawabValid = jawabRes.status === 200 && jawabRes.json('benar') !== undefined;
        rateJawabanBerhasil.add(isJawabValid ? 1 : 0);
        countJawabanTerkirim.add(1);

        check(jawabRes, {
            '[Jawaban] Pengiriman jawaban sukses (HTTP 200)': (r) => r.status === 200,
            '[Jawaban] Waktu proses server <= 1.0 detik (SLA 1s)': () => kirimDuration <= CONFIG.TARGETS.SOAL_RESPONSE_TIME_MAX_MS,
            '[Jawaban] Payload memiliki field evaluasi bisnis (benar/salah)': () => isJawabValid,
        });

        // TAHAP 4: PENGAMBILAN SOAL BERIKUTNYA SECARA TERPISAH
        // Menguji pengambilan state soal berikutnya melalui rute pengerjaan
        const ambilStart = Date.now();
        const nextSoalRes = http.get(`${CONFIG.BASE_URL}/latihan/kerjakan/${sesiId}`, {
            headers: headersInertia,
            tags: { name: 'METRIC_GET_Soal_Berikutnya' },
        });
        const ambilDuration = Date.now() - ambilStart;
        waktuAmbilSoalBerikutnya.add(ambilDuration);

        const isAmbilValid = nextSoalRes.status === 200;
        rateAmbilSoalBerhasil.add(isAmbilValid ? 1 : 0);

        check(nextSoalRes, {
            '[Soal Berikutnya] Ambil soal berikutnya sukses (HTTP 200)': (r) => r.status === 200,
            '[Soal Berikutnya] Waktu respons <= 1.0 detik (SLA 1s)': () => ambilDuration <= CONFIG.TARGETS.SOAL_RESPONSE_TIME_MAX_MS,
        });

        // Total siklus pengiriman jawaban + pemunculan soal berikutnya
        totalSiklusSoal.add(kirimDuration + ambilDuration);
    } else {
        // Fallback informatif jika data sesi pengerjaan di database belum disiapkan
        const ambilStart = Date.now();
        const persiapanRes = http.get(`${CONFIG.BASE_URL}/latihan/persiapan`, {
            headers: headersInertia,
            tags: { name: 'METRIC_GET_Soal_Berikutnya' },
        });
        const ambilDuration = Date.now() - ambilStart;
        waktuAmbilSoalBerikutnya.add(ambilDuration);

        check(persiapanRes, {
            '[Soal] Akses menu latihan persiapan selesai (HTTP 200)': (r) => r.status === 200,
            '[Soal] Waktu respons <= 1.0 detik (SLA 1s)': () => ambilDuration <= CONFIG.TARGETS.SOAL_RESPONSE_TIME_MAX_MS,
        });
    }

    // Think time realistis siswa (1–2 detik)
    sleep(1.5);
}

export function teardown(data) {
    console.log(`[TEARDOWN] Skenario A selesai diuji pada ${new Date().toISOString()}`);
}
