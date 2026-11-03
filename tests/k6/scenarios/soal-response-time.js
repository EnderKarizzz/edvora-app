import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { CONFIG, validateConfig } from '../config/environment.js';
import { login, getXsrfToken, extractInertiaPageData } from '../helpers/auth.js';

/**
 * SKENARIO A: Load Testing — Batas Waktu Respons Soal
 * Penanggung Jawab: Indah (Senior QA Automation Engineer)
 * 
 * Target Pengujian:
 * - Mengukur waktu pemrosesan pengiriman jawaban oleh server (POST /latihan/ujian/jawab) secara terpisah.
 * - Mengukur waktu pengambilan atau pemunculan soal berikutnya (GET /latihan/kerjakan/{sesiId}) secara terpisah.
 * - Target SLA Waktu Respons: Maksimal 1 detik (1000 ms) untuk masing-masing aksi (p95 < 1000 ms dan max < 1000 ms).
 * - Konfigurasi beban bertahap (ramping stages) hingga 500 Virtual Users (VU).
 * 
 * KENDALA DATA & ARSITEKTUR BACKEND:
 * 1. Aplikasi EDVORA memberlakukan unique constraint database PostgreSQL (pengerjaan_fleksibel_berjalan_satu)
 *    yang membatasi 1 sesi latihan aktif per siswa per subtes.
 * 2. Laravel Route memberlakukan throttle:30,1 dan atomic session locking block(10,10).
 * 3. Sesuai instruksi keamanan database bersama, dilarang membuat akun atau sesi massal di database bersama
 *    tanpa izin koordinator. Bila 500 VU mengakses sesi bersamaan, antrean lock dan rate limit adalah karakteristik
 *    arsitektur aktual yang diuji secara transparan.
 */

// Custom Metrics Waktu Respons Terpisah (Hanya dicatat bila menerima respons HTTP > 0)
const waktuPengirimanJawaban = new Trend('waktu_pengiriman_jawaban', true);
const waktuAmbilSoalBerikutnya = new Trend('waktu_ambil_soal_berikutnya', true);
const waktuSiklusPenuhSoal = new Trend('total_siklus_soal', true);

// Metrik Keberhasilan Bisnis & Error Terisolasi (Nama spesifik untuk mencegah konflik pada runner)
const rateSuccessJawaban = new Rate('success_rate_jawaban');
const countJawabanTerkirim = new Counter('total_jawaban_terkirim');
const rateErrorConnection = new Rate('error_koneksi_soal');
const rateErrorAuth = new Rate('error_auth_siswa');
const rateErrorValidation = new Rate('error_validation_422');
const rateErrorSesiHabis = new Rate('error_sesi_habis_410');
const rateErrorRateLimit = new Rate('error_rate_limited_429');
const rateErrorServer5xx = new Rate('error_server_5xx_soal');

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
            'max<1000',
        ],
        'waktu_ambil_soal_berikutnya': [
            'p(95)<1000',
            'max<1000',
        ],
        'http_req_failed': ['rate<0.01'],
        'success_rate_jawaban': ['rate>0.95'],
        'total_jawaban_terkirim': ['count>0'],
        'error_server_5xx_soal': ['rate<0.01'],
    },
};

/**
 * Setup: Menyiapkan data sesi aktif dan butir soal riil melalui inspeksi data Inertia
 */
export function setup() {
    validateConfig('siswa');

    const res = http.get(`${CONFIG.BASE_URL}/login`);
    let sesiId = CONFIG.SESI_ID;
    let soalItems = [];

    const auth = login(CONFIG.SISWA.EMAIL, CONFIG.SISWA.PASSWORD, 'siswa');
    if (!auth.success) {
        throw new Error(`[SETUP ERROR] Gagal melakukan autentikasi siswa: ${auth.error}`);
    }

    // 1. Ambil riwayat sesi dan cari sesi berjalan yang valid
    const riwayatRes = http.get(`${CONFIG.BASE_URL}/riwayat`);
    if (riwayatRes.status === 200 && riwayatRes.body) {
        const pageData = extractInertiaPageData(riwayatRes.body);
        let candidateSesiList = [];

        if (pageData && pageData.props) {
            // Evaluasi daftar pengerjaan dari props riwayat
            const listPengerjaan = pageData.props.pengerjaan || pageData.props.riwayat || [];
            if (Array.isArray(listPengerjaan)) {
                candidateSesiList = listPengerjaan
                    .filter(p => p && p.status === 'berjalan')
                    .map(p => p.id);
            }
        }

        // Fallback regex jika payload riwayat dikompresi
        if (candidateSesiList.length === 0) {
            const cleanBody = riwayatRes.body.replace(/&quot;/g, '"');
            const regexSesi = /"id":"([0-9a-f-]{36})"[^}]*"status":"berjalan"/gi;
            let match;
            while ((match = regexSesi.exec(cleanBody)) !== null) {
                candidateSesiList.push(match[1]);
            }
        }

        if (sesiId && !candidateSesiList.includes(sesiId)) {
            candidateSesiList.unshift(sesiId);
        }

        // 2. Periksa kandidat sesi untuk mengekstrak seluruh butir soal riil beserta opsinya
        for (const candidateId of candidateSesiList) {
            const kerjakanRes = http.get(`${CONFIG.BASE_URL}/latihan/kerjakan/${candidateId}`);
            if (kerjakanRes.status === 200 && kerjakanRes.body) {
                const kerjakanData = extractInertiaPageData(kerjakanRes.body);
                if (kerjakanData && kerjakanData.props && Array.isArray(kerjakanData.props.soalList)) {
                    const parsedItems = kerjakanData.props.soalList.map(soal => ({
                        soalId: soal.id,
                        tipe: soal.tipe || 'pilihan_ganda',
                        opsiIds: Array.isArray(soal.opsi_jawaban) ? soal.opsi_jawaban.map(o => o.id) : [],
                        kolomTabel: soal.kolom_tabel || null,
                    }));

                    if (parsedItems.length > 0) {
                        sesiId = candidateId;
                        soalItems = parsedItems;
                        break;
                    }
                } else {
                    // Fallback ekstraksi regex jika objek props tidak terurai langsung
                    const cleanKerjakan = kerjakanRes.body.replace(/&quot;/g, '"');
                    const soalRegex = /"id":"([0-9a-f-]{36})"[^}]*?"tipe":"([^"]+)"[^}]*?"opsi_jawaban":\s*\[\s*\{\s*"id":"([0-9a-f-]{36})"/gi;
                    let soalMatch;
                    const parsedItems = [];
                    while ((soalMatch = soalRegex.exec(cleanKerjakan)) !== null) {
                        parsedItems.push({
                            soalId: soalMatch[1],
                            tipe: soalMatch[2],
                            opsiIds: [soalMatch[3]],
                            kolomTabel: null,
                        });
                    }
                    if (parsedItems.length > 0) {
                        sesiId = candidateId;
                        soalItems = parsedItems;
                        break;
                    }
                }
            }
        }
    }

    if (!sesiId || soalItems.length === 0) {
        console.warn('[SETUP WARNING] Tidak ditemukan sesi berjalan dengan butir soal valid. Harap pastikan ada sesi latihan aktif pada database.');
    }

    return {
        baseUrl: CONFIG.BASE_URL,
        serverReady: res.status === 200,
        sesiId: sesiId || '',
        soalItems: soalItems,
        valid: Boolean(sesiId && soalItems.length > 0),
    };
}

// State per-VU untuk menghindari login berulang di setiap iterasi
let authAttempted = false;
let isVuLoggedIn = false;
let vuCookies = null;
let vuXsrfToken = null;

export default function (setupData) {
    if (!setupData || !setupData.valid) {
        rateErrorValidation.add(1);
        sleep(5);
        return;
    }

    const email = CONFIG.SISWA.EMAIL;
    const password = CONFIG.SISWA.PASSWORD;

    const headersPage = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    // TAHAP 1: AUTENTIKASI SISWA (Hanya sekali per Virtual User)
    // Jika gagal sekali, tandai VU gagal dan hindari retry storm
    const jar = http.cookieJar();
    if (!authAttempted) {
        authAttempted = true;
        const authResult = login(email, password, 'siswa');
        if (authResult.success) {
            isVuLoggedIn = true;
            vuCookies = authResult.cookies;
            vuXsrfToken = authResult.xsrfToken;
            rateErrorAuth.add(0);
        } else {
            isVuLoggedIn = false;
            rateErrorAuth.add(1);
            sleep(2);
            return;
        }
    }

    if (!isVuLoggedIn) {
        rateErrorAuth.add(1);
        sleep(5);
        return;
    }

    // Pulihkan cookie sesi ke cookie jar VU jika direset antar-iterasi oleh runtime k6
    if (vuCookies) {
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

    // TAHAP 2: PEMILIHAN BUTIR SOAL SECARA TERDISTRIBUSI ANTAR VU
    const sesiId = setupData.sesiId;
    const items = setupData.soalItems;
    const itemIndex = (__VU + __ITER) % items.length;
    const currentItem = items[itemIndex];
    const soalId = currentItem.soalId;

    // Format payload jawaban sesuai tipe soal backend Laravel
    let opsiIds = [];
    let jawabanIsian = null;
    let pilihanKolom = null;

    if (currentItem.tipe === 'isian_singkat') {
        jawabanIsian = '10';
    } else if (currentItem.tipe === 'majemuk_tabel') {
        pilihanKolom = {};
        if (currentItem.opsiIds && currentItem.opsiIds.length > 0) {
            currentItem.opsiIds.forEach(id => {
                pilihanKolom[id] = 1;
            });
        }
    } else if (currentItem.tipe === 'pilihan_ganda_kompleks') {
        opsiIds = currentItem.opsiIds.length > 1 
            ? currentItem.opsiIds.slice(0, 2) 
            : currentItem.opsiIds;
    } else {
        // pilihan_ganda atau benar_salah
        opsiIds = currentItem.opsiIds.length > 0 
            ? [currentItem.opsiIds[0]] 
            : [];
    }

    // TAHAP 3: PENGIRIMAN JAWABAN SISWA (POST /latihan/ujian/jawab)
    // Diukur terpisah menggunakan response.timings.duration (SLA <= 1000 ms)
    const payloadJawab = JSON.stringify({
        sesiId: sesiId,
        soalId: soalId,
        opsiIds: opsiIds,
        jawabanIsian: jawabanIsian,
        pilihanKolom: pilihanKolom,
    });

    const jawabRes = http.post(`${CONFIG.BASE_URL}/latihan/ujian/jawab`, payloadJawab, {
        headers: headersPost,
        tags: { name: 'METRIC_POST_Ujian_Jawab' },
    });

    const durasiJawab = jawabRes.timings.duration;

    // Catat ke response time HANYA jika server mengembalikan respons HTTP nyata (bukan timeout 0 ms)
    if (jawabRes.status > 0) {
        waktuPengirimanJawaban.add(durasiJawab);
        rateErrorConnection.add(0);
    } else {
        rateErrorConnection.add(1);
    }

    // Pencatatan Error Kategoris
    rateErrorRateLimit.add(jawabRes.status === 429 ? 1 : 0);
    rateErrorSesiHabis.add(jawabRes.status === 410 ? 1 : 0);
    rateErrorValidation.add(jawabRes.status === 422 ? 1 : 0);
    rateErrorServer5xx.add(jawabRes.status >= 500 ? 1 : 0);

    // Verifikasi Kontrak Bisnis Berdasarkan SesiFleksibel::jawab (PembahasanPengerjaan::umpanBalikSoal)
    let isJawabSukses = false;
    if (jawabRes.status === 200 && jawabRes.body) {
        try {
            const data = jawabRes.json();
            if (data && typeof data.benar === 'boolean' && Array.isArray(data.kunciOpsiIds) && typeof data.kunci === 'string') {
                isJawabSukses = true;
            }
        } catch (_) {
            isJawabSukses = false;
        }
    }
    rateSuccessJawaban.add(isJawabSukses ? 1 : 0);

    check(jawabRes, {
        '[Submit Jawaban] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Submit Jawaban] Waktu respons <= 1.0 detik (SLA 1s)': () => jawabRes.status > 0 && durasiJawab <= CONFIG.TARGETS.SOAL_RESPONSE_TIME_MAX_MS,
        '[Submit Jawaban] Kontrak JSON umpan balik sah': () => isJawabSukses,
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

    if (ambilRes.status > 0) {
        waktuAmbilSoalBerikutnya.add(durasiAmbil);
        rateErrorConnection.add(0);
    } else {
        rateErrorConnection.add(1);
    }

    if (jawabRes.status > 0 && ambilRes.status > 0) {
        waktuSiklusPenuhSoal.add(durasiJawab + durasiAmbil);
    }

    const isAmbilSukses = ambilRes.status === 200 && (ambilRes.body.includes('Latihan/Ujian') || ambilRes.body.includes('soalList'));

    check(ambilRes, {
        '[Ambil Soal] Respons HTTP 200 OK': (r) => r.status === 200,
        '[Ambil Soal] Waktu respons <= 1.0 detik (SLA 1s)': () => ambilRes.status > 0 && durasiAmbil <= CONFIG.TARGETS.SOAL_RESPONSE_TIME_MAX_MS,
        '[Ambil Soal] Komponen soal berhasil dimuat': () => isAmbilSukses,
        '[Ambil Soal] Bukan 404 Tidak Ditemukan': (r) => r.status !== 404,
    });

    // Pacing time wajar simulasi siswa membaca soal
    sleep(1.5);
}

export function teardown() {
    console.log(`[TEARDOWN] Skenario A selesai diuji pada ${new Date().toISOString()}`);
}
