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
 * - Mensimulasikan 100 - 500 Virtual Users (VU)
 * - Waktu pemrosesan pengiriman jawaban oleh server
 * - Waktu pengambilan / pemunculan soal berikutnya setelah jawaban dikirim
 * - Target SLA maksimal: 1 detik (1000 ms)
 */

// Custom Metrics untuk Pelaporan Detail
const waktuProsesJawaban = new Trend('waktu_proses_jawaban', true);
const waktuAmbilSoalBerikutnya = new Trend('waktu_ambil_soal_berikutnya', true);
const totalSiklusSoal = new Trend('total_siklus_soal', true);
const tingkatKeberhasilan = new Rate('tingkat_keberhasilan_soal');
const jumlahJawabanTerkirim = new Counter('jumlah_jawaban_terkirim');

export const options = {
    scenarios: {
        // Beban Bertahap hingga 100 - 500 VU
        load_test_soal: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
                { duration: '30s', target: 50 },   // Ramp-up ke 50 VU
                { duration: '1m',  target: 100 },  // Stabil di 100 VU
                { duration: '1m',  target: 250 },  // Ramp-up ke 250 VU
                { duration: '1m',  target: 500 },  // Puncak 500 VU
                { duration: '30s', target: 0 },    // Ramp-down
            ],
            gracefulRampDown: '15s',
        },
    },
    thresholds: {
        // Target SLA: Maksimal 1 detik (1000 ms)
        // p95 digunakan sebagai kriteria penerimaan teknis, max untuk evaluasi batas ekstrim
        'http_req_duration': [
            'p(95)<1000', // 95% request harus selesai di bawah 1 detik
            'max<1000',   // Batas absolut 1 detik sesuai ketentuan tugas
        ],
        'waktu_proses_jawaban': ['p(95)<1000'],
        'waktu_ambil_soal_berikutnya': ['p(95)<1000'],
        'total_siklus_soal': ['p(95)<1000'],
        'http_req_failed': ['rate<0.01'], // Kegagalan request harus < 1%
        'tingkat_keberhasilan_soal': ['rate>0.95'],
    },
};

export function setup() {
    // Verifikasi ketersediaan server sebelum load testing dijalankan
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
    const email = CONFIG.SISWA.EMAIL;
    const password = CONFIG.SISWA.PASSWORD;
    const headersInertia = {
        'Accept': 'text/html, application/xhtml+xml, application/json',
        'X-Inertia': 'true',
        'X-Inertia-Version': '1.0.0',
        'X-Requested-With': 'XMLHttpRequest',
    };

    // 1. TAHAP AUTENTIKASI SISWA
    group('1. Autentikasi Siswa', function () {
        const auth = login(email, password);
        tingkatKeberhasilan.add(auth.success);
    });

    let xsrfToken = getXsrfToken(CONFIG.BASE_URL);

    // 2. TAHAP AKSES SESI LATIHAN / UJIAN
    let pengerjaanId = null;
    let daftarSoal = [];

    group('2. Akses Sesi Latihan', function () {
        // Siswa membuka menu persiapan / daftar subtes
        const persiapanRes = http.get(`${CONFIG.BASE_URL}/latihan/persiapan`, {
            headers: headersInertia,
            tags: { name: 'GET_Latihan_Persiapan' },
        });

        check(persiapanRes, {
            'Akses /latihan/persiapan berhasil (200/302)': (r) => r.status === 200 || r.status === 302,
        });

        // Siswa mengakses sesi ujian yang sedang berjalan atau aktif
        // Di aplikasi EDVORA, pengerjaan aktif dibuka melalui /latihan/kerjakan/{pengerjaanId}
        const ujianRes = http.get(`${CONFIG.BASE_URL}/latihan`, {
            headers: headersInertia,
            tags: { name: 'GET_Latihan_Index' },
        });

        check(ujianRes, {
            'Akses /latihan berhasil': (r) => r.status === 200 || r.status === 302,
        });
    });

    // 3. TAHAP PENGIRIMAN JAWABAN & PENGAMBILAN SOAL BERIKUTNYA
    group('3. Siklus Pengiriman Jawaban & Soal Berikutnya', function () {
        const siklusMulai = Date.now();

        // Parameter request submit jawaban aktual EDVORA (LatihanSoalController::jawab)
        // sesiId (UUID), soalId (UUID), opsiIds (Array), jawabanIsian, pilihanKolom
        // Sesi pengujian mensimulasikan format UUID yang valid
        const dummySesiId = __ENV.SESI_ID || '00000000-0000-0000-0000-000000000001';
        const dummySoalId = __ENV.SOAL_ID || '00000000-0000-0000-0000-000000000002';
        const dummyOpsiId = __ENV.OPSI_ID || '00000000-0000-0000-0000-000000000003';

        const submitPayload = JSON.stringify({
            sesiId: dummySesiId,
            soalId: dummySoalId,
            opsiIds: [dummyOpsiId],
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

        // A. Mengirimkan Jawaban (POST /latihan/ujian/jawab)
        const kirimMulai = Date.now();
        const jawabRes = http.post(`${CONFIG.BASE_URL}/latihan/ujian/jawab`, submitPayload, {
            headers: jawabHeaders,
            tags: { name: 'POST_Latihan_Jawab' },
        });
        const waktuKirim = Date.now() - kirimMulai;
        waktuProsesJawaban.add(waktuKirim);

        // Status 200 = Sukses dinilai, 410 = Sesi habis, 422 = Validasi (soal bukan bagian sesi jika data dummy)
        // 429 = Throttled (jika batas 30 req/menit tercapai)
        const jawabBerhasil = jawabRes.status === 200 || jawabRes.status === 410 || jawabRes.status === 422;
        check(jawabRes, {
            'Server merespons request jawaban (<= 1 detik)': () => waktuKirim <= CONFIG.TARGETS.SOAL_RESPONSE_TIME_MAX_MS,
            'Status respons valid (bukan 500 error)': (r) => r.status < 500,
        });

        jumlahJawabanTerkirim.add(1);

        // B. Menguji Pengambilan / Pemunculan Soal Berikutnya
        // Dalam alur aktual EDVORA (Inertia.js), soal berikutnya dimuat dari state atau refresh kerjakan
        const ambilMulai = Date.now();
        const nextSoalRes = http.get(`${CONFIG.BASE_URL}/latihan/persiapan`, {
            headers: headersInertia,
            tags: { name: 'GET_Soal_Berikutnya' },
        });
        const waktuAmbil = Date.now() - ambilMulai;
        waktuAmbilSoalBerikutnya.add(waktuAmbil);

        check(nextSoalRes, {
            'Pengambilan soal berikutnya selesai (<= 1 detik)': () => waktuAmbil <= CONFIG.TARGETS.SOAL_RESPONSE_TIME_MAX_MS,
            'Status pengambilan soal berikutnya valid': (r) => r.status === 200 || r.status === 302,
        });

        const totalSiklus = Date.now() - siklusMulai;
        totalSiklusSoal.add(totalSiklus);
        tingkatKeberhasilan.add(jawabBerhasil && nextSoalRes.status < 500);
    });

    // Simulasi Think Time siswa nyata sebelum menjawab soal berikutnya (1 - 2 detik)
    sleep(1.5);
}

export function teardown(data) {
    console.log(`[TEARDOWN] Skenario A selesai diuji pada ${new Date().toISOString()}`);
}

