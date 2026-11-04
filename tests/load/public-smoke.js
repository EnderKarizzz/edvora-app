import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { parseInertiaData } from './inertia-parser.js';

/**
 * ============================================================================
 * [DEPRECATED & DISABLED] PUBLIC GET SMOKE TEST K6 — EDVORA
 * Penanggung Jawab: Indah
 * ============================================================================
 *
 * STATUS KEAMANAN (Stage 5O-AF):
 * Script ini telah DINONAKTIFKAN SECARA AMAN (DISABLED).
 * Alasan:
 * 1. Request GET /login berpotensi memicu mutasi penulisan session baru ke tabel
 *    'sessions' pada database jika driver session bernilai 'database' (config/session.php).
 * 2. Klien HTTP k6 eksternal tidak dapat memverifikasi identitas database runtime
 *    yang aktif di backend PHP-CGI secara objektif sebelum request dikirim.
 *    Parameter TARGET_ENV=local_isolated bukan bukti fisik bahwa PHP-CGI memuat .env.loadtest.
 * 3. Seluruh pengujian beban resmi wajib diorkestrasi melalui scripts/loadtest/
 *    yang memverifikasi database port 5433 secara lokal sebelum server di-spawn.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. DEFINISI METRIK KUSTOM
// ----------------------------------------------------------------------------
// Catatan Metrik:
// - waktuResponsLoginPublik (Trend): HANYA mencatat nilai durasi jika respons HTTP
//   memiliki timings.duration yang valid (> 0 ms). Request yang gagal di level socket
//   tanpa durasi tidak akan dicatat ke Trend guna mencegah distorsi nilai rata-rata/persentil.
// - successRatePublik (Rate): Mencatat seluruh upaya request (1 untuk sukses komprehensif,
//   0 untuk kegagalan apa pun termasuk kegagalan level socket/koneksi).
export const waktuResponsLoginPublik = new Trend('waktu_respons_login_publik', true);
export const successRatePublik = new Rate('success_rate_publik');

// ----------------------------------------------------------------------------
// 2. KONFIGURASI BEBAN SMOKE TEST & THRESHOLD
// ----------------------------------------------------------------------------
export const options = {
    // Dibatasi ketat hanya 1 VU dan 1 iterasi (Smoke test fungsional)
    vus: 1,
    iterations: 1,

    // Timeout wajar untuk menghindari hanging request
    setupTimeout: '10s',
    teardownTimeout: '10s',

    thresholds: {
        // Toleransi kegagalan koneksi maksimal 1%
        'http_req_failed': ['rate<0.01'],
        // Threshold durasi untuk smoke test (bukan patokan SLA benchmark beban tinggi)
        'http_req_duration': ['p(95)<3000'],
        'waktu_respons_login_publik': ['p(95)<3000', 'max<3000'],
        'success_rate_publik': ['rate>0.95'],
    },
};

// ----------------------------------------------------------------------------
// 3. KONFIGURASI TARGET ENDPOINT & FAIL-CLOSED SAFETY GUARD
// ----------------------------------------------------------------------------
// PENTING (Stage 5O-AE): Meskipun request hanya GET /login, pada arsitektur Laravel
// dengan konfigurasi default SESSION_DRIVER=database (config/session.php), request GET
// dapat memicu mutasi penulisan session baru ke tabel 'sessions' pada database target.
// Oleh karena itu, target DIKUNCI KETAT hanya ke port 8001 (PostgreSQL lokal terisolasi port 5433)
// dan DILARANG KERAS diarahkan ke port 8000 (database bersama via .env default).

const TARGET_ENV = (__ENV.TARGET_ENV || '').trim();
const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:8001').trim();

export function assertPublicSmokeSafety(url, targetEnv) {
    if (targetEnv !== 'local_isolated') {
        throw new Error(`[FAIL-CLOSED GUARD] TARGET_ENV bernilai "${targetEnv || '(kosong)'}", wajib "local_isolated". Eksekusi smoke test dibatalkan demi mencegah request ke server yang terhubung ke database bersama.`);
    }

    const cleanUrl = url.trim().replace(/\/+$/, '');
    const match = cleanUrl.match(/^http:\/\/(127\.0\.0\.1|localhost):8001$/i);
    if (!match) {
        throw new Error(`[FAIL-CLOSED GUARD] Target URL "${url}" ditolak. Smoke test HANYA mengizinkan http://127.0.0.1:8001 atau http://localhost:8001 (Port 8000 ditolak keras karena terhubung ke database bersama).`);
    }

    // Stage 5O-AF: public-smoke.js dinonaktifkan secara aman (DEPRECATED & DISABLED)
    // Klien HTTP k6 eksternal tidak dapat memverifikasi database runtime backend secara objektif.
    throw new Error('[DEPRECATED & DISABLED] public-smoke.js dinonaktifkan secara aman (Stage 5O-AF). Klien HTTP k6 eksternal tidak dapat memverifikasi identitas database runtime backend secara mandiri sebelum request dikirim. Gunakan runner resmi terorkestrasi (scripts/loadtest/) yang memverifikasi database port 5433 sebelum server dijalankan.');
}

const TARGET_URL = `${BASE_URL.replace(/\/+$/, '')}/login`;

// ----------------------------------------------------------------------------
// 4. SKENARIO UTAMA (1 VU, 1 ITERASI, MURNI GET TERISOLASI)
// ----------------------------------------------------------------------------
export default function () {
    // Validasi fail-closed safety guard sebelum request HTTP pertama dieksekusi
    const validatedTargetUrl = assertPublicSmokeSafety(BASE_URL, TARGET_ENV);

    const params = {
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: '10s',
        redirects: 0, // Mencegah k6 mengikuti redirect otomatis ke URL lain
        tags: { name: 'GET_Public_Login_Page' },
    };

    // Eksekusi request tunggal HTTP GET ke endpoint publik yang terverifikasi aman
    let response = null;
    try {
        response = http.get(validatedTargetUrl, params);
    } catch (_) {
        // Penanganan jika terjadi exception fatal pada socket level (koneksi ditolak/timeout)
        successRatePublik.add(0);
        return;
    }

    // Evaluasi status dan respons secara defensif
    const isHttp200 = Boolean(response && response.status === 200);
    const bodyString = (response && typeof response.body === 'string') ? response.body : '';
    const hasValidDuration = Boolean(response && response.timings && response.timings.duration > 0);

    // Validasi ketat komponen Inertia via helper murni parseInertiaData
    // HANYA valid jika atribut data-page terurai dan properti component secara eksak 'Auth/Login'.
    const pageData = isHttp200 && bodyString ? parseInertiaData(bodyString) : null;
    const isInertiaComponentValid = Boolean(pageData && pageData.component === 'Auth/Login');
    const isDurationUnderSla = Boolean(hasValidDuration && response.timings.duration < 3000);

    // Evaluasi seluruh check k6
    const isAllChecksPassed = check(response, {
        '[Smoke] HTTP Status adalah 200 OK (Tanpa Redirect)': () => isHttp200,
        '[Smoke] Komponen Inertia secara eksak adalah Auth/Login': () => isInertiaComponentValid,
        '[Smoke] Durasi respons di bawah 3.000 ms': () => isDurationUnderSla,
    });

    // ATURAN INTEGRITAS METRIK:
    // successRatePublik bernilai 1 HANYA JIKA seluruh check k6 berhasil DAN durasi respons valid (> 0 ms).
    // Bernilai 0 jika ada satu saja check yang gagal atau durasi tidak tersedia.
    const isAllValid = Boolean(isAllChecksPassed && hasValidDuration);

    if (isAllValid) {
        waktuResponsLoginPublik.add(response.timings.duration);
        successRatePublik.add(1);
    } else {
        successRatePublik.add(0);
        // Trend hanya mencatat durasi respons jika durasi faktual tersedia (> 0 ms).
        // Kegagalan tanpa durasi (misal error socket/koneksi) tidak dicatat ke Trend untuk mencegah distorsi data.
        if (hasValidDuration) {
            waktuResponsLoginPublik.add(response.timings.duration, { status: 'failed' });
        }
    }
}

// ----------------------------------------------------------------------------
// 5. RINGKASAN LAPORAN HASIL (SUMMARY HANDLER)
// ----------------------------------------------------------------------------
export function handleSummary(data) {
    return {
        'stdout': generateCustomSummary(data),
    };
}

function generateCustomSummary(data) {
    const durasi = data.metrics.waktu_respons_login_publik && data.metrics.waktu_respons_login_publik.values
        ? data.metrics.waktu_respons_login_publik.values.avg
        : 0;
    const reqFailed = data.metrics.http_req_failed && data.metrics.http_req_failed.values
        ? data.metrics.http_req_failed.values.rate
        : 0;
    const succRate = data.metrics.success_rate_publik && data.metrics.success_rate_publik.values
        ? (data.metrics.success_rate_publik.values.rate * 100).toFixed(2)
        : 0;
    const checksPasses = data.metrics.checks && data.metrics.checks.values
        ? data.metrics.checks.values.passes
        : 0;
    const checksFails = data.metrics.checks && data.metrics.checks.values
        ? data.metrics.checks.values.fails
        : 0;

    return `
================================================================================
HASIL PUBLIC GET SMOKE TEST k6 — EDVORA
Penanggung Jawab: Indah
================================================================================
Target URL         : ${TARGET_URL}
Metode HTTP        : Murni HTTP GET (Hanya 1 request GET /login)
Beban Uji          : 1 Virtual User (VU), 1 Iterasi (Verifikasi Fungsional Awal)
Konfigurasi Klien  : redirects: 0 (Anti-Redirect), timeout: 10s
Autentikasi        : Tidak ada (Tanpa kredensial, tanpa session cookie)
Request Mutasi     : Tidak ada (Nol request POST, PUT, PATCH, DELETE)
--------------------------------------------------------------------------------
Hasil Verifikasi:
  - Durasi Respons HTTP   : ${durasi ? durasi.toFixed(2) + ' ms' : 'N/A'} (1 Request Smoke Test)
  - HTTP Request Failed   : ${(reqFailed * 100).toFixed(2)}%
  - Total Checks Lolos    : ${checksPasses} lolos, ${checksFails} gagal
  - Validasi Sukses Publik: ${succRate}% (Wajib HTTP 200 OK & Komponen Auth/Login)
  - Desain Keselamatan    : Tidak mendefinisikan request yang memutasi database.
================================================================================
`;
}
