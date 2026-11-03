import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { CONFIG } from '../config/environment.js';
import { login, getXsrfToken } from '../helpers/auth.js';

/**
 * SKENARIO A: Load Testing — Batas Waktu Respons Soal
 * Penanggung Jawab: Indah (Senior QA Automation Engineer)
 * 
 * Target Pengujian:
 * - Mengukur waktu pemrosesan pengiriman jawaban oleh server (POST /latihan/ujian/jawab) secara terpisah.
 * - Mengukur waktu pengambilan atau pemunculan soal berikutnya (GET /latihan/kerjakan/{sesiId}) secara terpisah.
 * - Target SLA Waktu Respons: Maksimal 1 detik (1000 ms) untuk masing-masing aksi.
 * - Konfigurasi beban bertahap (ramping stages) hingga 500 Virtual Users (VU).
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
 * Setup: Menyiapkan data sesi aktif dan soal riil dari database
 */
export function setup() {
    const res = http.get(`${CONFIG.BASE_URL}/login`);
    let sesiId = CONFIG.SESI_ID;
    let soalId = CONFIG.SOAL_ID;
    let opsiId = CONFIG.OPSI_ID;

    if (CONFIG.SISWA.EMAIL && CONFIG.SISWA.PASSWORD) {
        const auth = login(CONFIG.SISWA.EMAIL, CONFIG.SISWA.PASSWORD, 'siswa');
        if (auth.success) {
            // Ambil riwayat sesi dan cari sesi berjalan yang memiliki daftar soal valid
            const riwayatRes = http.get(`${CONFIG.BASE_URL}/riwayat`);
            if (riwayatRes.status === 200 && riwayatRes.body) {
                const cleanBody = riwayatRes.body.replace(/&quot;/g, '"');
                const regexSesi = /"id":"([0-9a-f-]{36})"[^}]*"status":"berjalan"/gi;
                let match;
                while ((match = regexSesi.exec(cleanBody)) !== null) {
                    const candidateSesiId = match[1];
                    const kerjakanRes = http.get(`${CONFIG.BASE_URL}/latihan/kerjakan/${candidateSesiId}`);
                    if (kerjakanRes.status === 200 && kerjakanRes.body && kerjakanRes.body.includes('soalList')) {
                        const cleanKerjakan = kerjakanRes.body.replace(/&quot;/g, '"');
                        const matchSoal = cleanKerjakan.match(/"soalList":\s*\[\s*\{\s*"id":\s*"([0-9a-f-]{36})"/i);
                        const matchOpsi = cleanKerjakan.match(/"opsi_jawaban":\s*\[\s*\{\s*"id":\s*"([0-9a-f-]{36})"/i);
                        if (matchSoal && matchSoal[1]) {
                            sesiId = candidateSesiId;
                            soalId = matchSoal[1];
                            opsiId = matchOpsi ? matchOpsi[1] : '';
                            break;
                        }
                    }
                }
            }
        }
    }

    return {
        baseUrl: CONFIG.BASE_URL,
        serverReady: res.status === 200,
        sesiId: sesiId || '',
        soalId: soalId || '',
        opsiId: opsiId || '',
    };
}

// State per-VU untuk menghindari login berulang di setiap iterasi
let isVuLoggedIn = false;
let vuCookies = null;
let vuXsrfToken = null;

export default function (setupData) {
    const email = CONFIG.SISWA.EMAIL;
    const password = CONFIG.SISWA.PASSWORD;

    const headersPage = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    // TAHAP 1: AUTENTIKASI SISWA (Hanya sekali per Virtual User)
    // Cookie jar k6 dipertahankan per-VU untuk seluruh iterasi berikutnya
    const jar = http.cookieJar();
    if (!isVuLoggedIn) {
        const authResult = login(email, password, 'siswa');
        if (!authResult.success) {
            if (authResult.statusCode === 401 || authResult.statusCode === 422) {
                rateErrorAuth.add(1);
            } else {
                rateErrorAuth.add(0);
            }
            sleep(2);
            return;
        }
        isVuLoggedIn = true;
        vuCookies = authResult.cookies;
        vuXsrfToken = authResult.xsrfToken;
        rateErrorAuth.add(0);
    } else if (vuCookies) {
        // Pulihkan session cookie ke cookie jar VU jika direset antar-iterasi oleh k6
        for (const cName in vuCookies) {
            if (vuCookies[cName] && vuCookies[cName].length > 0) {
                jar.set(CONFIG.BASE_URL, cName, vuCookies[cName][0]);
            }
        }
    }

    const xsrfToken = getXsrfToken(CONFIG.BASE_URL) || vuXsrfToken;
    const headersPost = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };
    if (xsrfToken) {
        headersPost['X-XSRF-TOKEN'] = xsrfToken;
    }

    // TAHAP 2: MENGGUNAKAN SESI PENGERJAAN AKTIF
    const sesiId = (setupData && setupData.sesiId) || CONFIG.SESI_ID || '';
    const soalId = (setupData && setupData.soalId) || CONFIG.SOAL_ID || '';
    const opsiId = (setupData && setupData.opsiId) || CONFIG.OPSI_ID || '';

    if (!sesiId || !soalId) {
        sleep(2);
        return;
    }

    // TAHAP 3: PENGIRIMAN JAWABAN SISWA (POST /latihan/ujian/jawab)
    // Diukur terpisah menggunakan response.timings.duration (SLA <= 1000 ms)
    const payloadJawab = JSON.stringify({
        sesiId: sesiId,
        soalId: soalId,
        opsiIds: opsiId ? [opsiId] : [],
        jawabanIsian: null,
        pilihanKolom: null,
    });

    const jawabRes = http.post(`${CONFIG.BASE_URL}/latihan/ujian/jawab`, payloadJawab, {
        headers: headersPost,
        tags: { name: 'METRIC_POST_Ujian_Jawab' },
    });
    const durasiJawab = jawabRes.timings.duration;
    waktuPengirimanJawaban.add(durasiJawab);

    // Jika server merespons unauthenticated (401), tandai VU perlu re-login
    if (jawabRes.status === 401) {
        isVuLoggedIn = false;
        rateErrorAuth.add(1);
    }

    // Pencatatan Error Kategoris
    rateErrorRateLimit.add(jawabRes.status === 429 ? 1 : 0);
    rateErrorSesiHabis.add(jawabRes.status === 410 ? 1 : 0);
    rateErrorValidation.add(jawabRes.status === 422 ? 1 : 0);
    rateErrorServer5xx.add(jawabRes.status >= 500 ? 1 : 0);

    const isJawabSukses = jawabRes.status === 200 && (jawabRes.body.includes('benar') || jawabRes.body.includes('kunci'));
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
    // Diukur terpisah menggunakan response.timings.duration (SLA <= 1000 ms)
    const nextUrl = `${CONFIG.BASE_URL}/latihan/kerjakan/${sesiId}`;
    const ambilRes = http.get(nextUrl, {
        headers: headersPage,
        tags: { name: 'METRIC_GET_Soal_Berikutnya' },
    });
    const durasiAmbil = ambilRes.timings.duration;
    waktuAmbilSoalBerikutnya.add(durasiAmbil);

    waktuSiklusPenuhSoal.add(durasiJawab + durasiAmbil);

    const isAmbilSukses = ambilRes.status === 200 && (ambilRes.body.includes('Latihan/Ujian') || ambilRes.body.includes('soalList'));

    check(ambilRes, {
        '[Ambil Soal] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Ambil Soal] Waktu respons <= 1.0 detik (SLA 1s)': () => durasiAmbil <= CONFIG.TARGETS.SOAL_RESPONSE_TIME_MAX_MS,
        '[Ambil Soal] Komponen soal berhasil dimuat': () => isAmbilSukses,
        '[Ambil Soal] Bukan 404 Tidak Ditemukan': (r) => r.status !== 404,
    });

    // Pacing time singkat antar siklus
    sleep(1);
}

export function teardown() {
    console.log(`[TEARDOWN] Skenario A selesai diuji pada ${new Date().toISOString()}`);
}
