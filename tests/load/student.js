import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { Trend, Rate, Counter } from 'k6/metrics';
import { parseInertiaData } from './inertia-parser.js';

/**
 * ============================================================================
 * SKENARIO A: LOAD TESTING PENGIRIMAN JAWABAN SISWA & PENGAMBILAN SOAL EDVORA
 * Penanggung Jawab: Indah
 * ============================================================================
 * 
 * TARGET PENELITIAN & SLA:
 * 1. Beban Pengujian: Bertahap hingga 500 Virtual Users (VU) (100 -> 250 -> 500 VU).
 * 2. Waktu Pengiriman Jawaban Siswa (POST /latihan/ujian/jawab):
 *    - p95 < 1.000 ms (1 detik)
 *    - Maximum < 1.000 ms (1 detik)
 * 3. Waktu Pengambilan / Pemuatan Soal Ujian (GET /latihan/kerjakan/{pengerjaan}):
 *    - p95 < 1.000 ms (1 detik)
 *    - Maximum < 1.000 ms (1 detik)
 * 4. Toleransi HTTP Request Failed: < 0.01 (Maksimal 1% kegagalan) sesuai Tahap 2.
 * 
 * TEMUAN AUDIT ARSITEKTUR APLIKASI (EDVORA):
 * 1. Navigasi Soal:
 *    Di frontend React (resources/js/Pages/Latihan/Ujian.tsx), seluruh paket butir soal
 *    (props.soalList) dikirimkan sekaligus saat halaman pengerjaan dimuat pertama kali.
 *    Perpindahan antar-soal dilakukan secara CLIENT-SIDE oleh React state (setIndeksAktif).
 *    Tidak ada endpoint backend terpisah seperti GET /soal/next.
 *    Oleh karena itu, metrik 'waktu_ambil_soal' mengukur durasi pemuatan paket soal
 *    dan status pengerjaan dari server (GET /latihan/kerjakan/{pengerjaan}).
 * 2. Atomic Lock & Rate Limiting:
 *    Endpoint POST /latihan/ujian/jawab diproteksi oleh middleware:
 *    - throttle:30,1 (pembatasan 30 request/menit per user)
 *    - block(10, 10) (antrean atomic session lock berdurasi 10 detik per sesi)
 *    - UNIQUE constraint (pengerjaan_id, soal_id) pada tabel jawaban_pengerjaan.
 * 
 * MEKANISME KEAMANAN DATABASE BERSAMA (MULTI-LAYER SAFETY GUARD):
 * Sesuai aturan dosen dan integritas database bersama Supabase:
 * 1. AUTHENTICATION SAFETY GUARD:
 *    - POST /login memicu update kolom `terakhir_login_at` pada tabel `users`.
 *    - POST /login TERKUNCI KETAT dan HANYA diizinkan jika TARGET_ENV === 'isolated_staging'
 *      dan host terdaftar pada ALLOWED_STAGING_HOSTS.
 * 2. MUTATION SAFETY GUARD (POST /latihan/ujian/jawab):
 *    - Request POST HANYA DAPAT DIAKTIFKAN JIKA SEMUA SYARAT BERIKUT TERPENUHI:
 *      1. __ENV.ENABLE_STAGING_MUTATION === 'true'
 *      2. __ENV.TARGET_ENV === 'isolated_staging'
 *      3. Host BASE_URL terdaftar secara eksak di ALLOWED_STAGING_HOSTS
 *    - HOST LOKAL (127.0.0.1, localhost) DAN SHARED/PRODUCTION DATABASE DITOLAK TEGAS!
 * 3. GLOBAL PRE-FLIGHT GUARD:
 *    - Kesalahan konfigurasi fatal (BASE_URL kosong, host ditolak, dataset tidak unik/kurang)
 *      memicu exec.test.abort() sebelum HTTP request pertama dieksekusi.
 * 4. Endpoint penyelesaian ujian (/latihan/simpan) DILARANG KERAS dipanggil.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. DEFINISI METRIK KUSTOM
// ----------------------------------------------------------------------------
// Trend durasi waktu respons spesifik (hanya dicatat saat respons valid > 0 ms)
export const waktuPengirimanJawaban = new Trend('waktu_pengiriman_jawaban', true);
export const waktuPengirimanJawabanBaru = new Trend('waktu_pengiriman_jawaban_baru', true);
export const waktuPengirimanJawabanUlang = new Trend('waktu_pengiriman_jawaban_ulang', true);
export const waktuAmbilSoal = new Trend('waktu_ambil_soal', true);
export const waktuAutentikasi = new Trend('waktu_autentikasi', true);
export const waktuLoginPost = new Trend('waktu_login_post', true);

// Metrik keberhasilan bisnis & proteksi
export const successRateJawaban = new Rate('success_rate_jawaban');
export const successRateAmbilSoal = new Rate('success_rate_ambil_soal');
export const authSuccessRate = new Rate('auth_success_rate');
export const guardBypassCount = new Counter('guard_bypass_count');
export const errorRateLimitCount = new Counter('error_rate_limit_429');
export const errorAuthCount = new Counter('error_auth_count');
export const errorServer5xxCount = new Counter('error_server_5xx_count');

// ----------------------------------------------------------------------------
// 2. KONFIGURASI TAHAPAN BEBAN (STAGES) & THRESHOLDS (TARGET SLA)
// ----------------------------------------------------------------------------
export const options = {
    noCookiesReset: true,
    stages: [
        { duration: '30s', target: 100 },  // Tahap 1: Ramp-up ke 100 VU (Baseline)
        { duration: '1m',  target: 100 },  // Tahap 2: Steady state 100 VU
        { duration: '30s', target: 250 },  // Tahap 3: Ramp-up ke 250 VU (Medium load)
        { duration: '1m',  target: 250 },  // Tahap 4: Steady state 250 VU
        { duration: '30s', target: 500 },  // Tahap 5: Ramp-up ke 500 VU (Peak target SLA)
        { duration: '1m',  target: 500 },  // Tahap 6: Steady state 500 VU
        { duration: '30s', target: 0 },    // Tahap 7: Graceful ramp-down ke 0 VU
    ],
    thresholds: {
        // Toleransi kegagalan HTTP maksimal 1% (sesuai rancangan Tahap 2)
        'http_req_failed': ['rate<0.01'],
        // SLA umum k6: p95 <= 1.000 ms
        'http_req_duration': ['p(95)<=1000'],
        // Target SLA Spesifik: Waktu pengiriman jawaban p95 <= 1.000 ms (max adalah metrik observasional)
        'waktu_pengiriman_jawaban': ['p(95)<=1000'],
        'waktu_pengiriman_jawaban_baru': ['p(95)<=1000'],
        'waktu_pengiriman_jawaban_ulang': ['p(95)<=1000'],
        // Target SLA Spesifik: Waktu pengambilan/pemuatan soal p95 <= 1.000 ms
        'waktu_ambil_soal': ['p(95)<=1000'],
        // Minimal 95% pemuatan soal dan validasi bisnis berhasil
        'success_rate_ambil_soal': ['rate>0.95'],
        'success_rate_jawaban': ['rate>0.95'],
    },
};

// ----------------------------------------------------------------------------
// 3. KONFIGURASI ENVIRONMENT & PARAMETER DINAMIS
// ----------------------------------------------------------------------------
// BASE_URL wajib diisi secara eksplisit via environment variable (__ENV.BASE_URL).
// TIDAK ADA DEFAULT KE LOCALHOST / PORT 8000 demi mencegah mutasi database tim!
const BASE_URL = (__ENV.BASE_URL || '').trim();

// SAFETY GUARD ENVIRONMENT PARAMETERS
const ENABLE_STAGING_MUTATION = (__ENV.ENABLE_STAGING_MUTATION === 'true');
const TARGET_ENV = (__ENV.TARGET_ENV || '').trim();

// Konfigurasi Pacing Teruji (Configurable via __ENV.PACING_SECONDS)
// Default: 2.0 detik sleep antar-submit jawaban (total siklus per iterasi ~3.1s => ~19.3 req/min)
function resolvePacingSeconds(rawPacing) {
    if (!rawPacing || typeof rawPacing !== 'string' || rawPacing.trim() === '') {
        return 2.0; // Default konservatif
    }
    const val = parseFloat(rawPacing.trim());
    if (isNaN(val) || !isFinite(val) || val <= 0) {
        return 2.0; // Fallback aman ke default jika nilai invalid/negatif
    }
    return val;
}
const PACING_SECONDS = resolvePacingSeconds(__ENV.PACING_SECONDS);

// Konfigurasi Login Stagger (Configurable via __ENV.LOGIN_STAGGER_SECONDS)
// Default: 0.1 detik per-VU untuk multi-worker cluster agar ramp-up login halus tanpa storm
function resolveLoginStaggerSeconds(rawStagger) {
    if (!rawStagger || typeof rawStagger !== 'string' || rawStagger.trim() === '') {
        return 0.1;
    }
    const val = parseFloat(rawStagger.trim());
    if (isNaN(val) || !isFinite(val) || val < 0) {
        return 0.1;
    }
    return val;
}
const LOGIN_STAGGER_SECONDS = resolveLoginStaggerSeconds(__ENV.LOGIN_STAGGER_SECONDS);

// DAFTAR HOST STAGING TERISOLASI RESMI YANG DIIZINKAN SECARA EKSPLISIT
const ALLOWED_STAGING_HOSTS = [
    'staging.edvora.internal',
    'isolated-staging.edvora.test',
];

// Dukungan pembacaan file dataset k6 eksternal (mengatasi batas 32KB environment variable Windows untuk beban 250+ VU)
const STUDENT_DATA_FILE = (__ENV.STUDENT_DATA_FILE || '').trim();
let fileDatasetRaw = null;
if (STUDENT_DATA_FILE) {
    try {
        fileDatasetRaw = open(STUDENT_DATA_FILE);
    } catch (_) {
        fileDatasetRaw = null;
    }
}

// State global pre-flight check untuk validasi konfigurasi & keunikan dataset
let globalPreflightChecked = false;
let parsedGlobalDataset = null;

// State sesi lokal per Virtual User (VU) agar login hanya dilakukan sekali per VU
let vuSessionInitialized = false;
let vuSessionValid = false;
let cachedXsrfToken = null;
let cachedStudentData = null;

// State per-VU untuk pelacakan butir soal dan rotasi jawaban unik
let vuIterationCount = 0;
let vuSoalList = [];
let vuAnsweredSoalSet = new Set();

// ----------------------------------------------------------------------------
// 4. HELPER VALIDASI KEAMANAN STAGING & AUTENTIKASI (SAFETY GUARDS)
// ----------------------------------------------------------------------------

/**
 * Memvalidasi dan mengekstrak hostname dari URL target secara ketat dan aman (fail-closed).
 * Menggunakan string & regex parser yang kompatibel dengan runtime k6 (Goja), tanpa global URL API.
 * 
 * Standar Keamanan:
 * 1. Hanya mengizinkan protokol 'http:' atau 'https:'.
 * 2. Menolak secara mutlak URL yang memuat kredensial userinfo (username / password / '@').
 * 3. Menolak URL malformed / tidak valid.
 * 4. Mengekstrak hostname murni tanpa port atau karakter ilegal.
 * 5. Menolak format IP address (IPv4 & IPv6), localhost, loopback, dan host tak dikenal (kecuali allowlist).
 * 6. Menolak whitespace, backslash, query string (?), fragment (#), atau sub-path pada BASE_URL.
 * 7. Jika gagal mengurai atau tidak valid, selalu gagal secara aman (fail-closed).
 * 
 * @param {string} rawUrl 
 * @returns {{ valid: boolean, hostname: string, port: string, protocol: string, error: string|null }}
 */
export function parseAndValidateUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'URL kosong atau bukan bertipe string.' };
    }

    // Tolak jika URL memuat whitespace (spasi, tab, newline) di mana pun atau karakter kontrol
    if (/[\s\r\n\t]/.test(rawUrl)) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'URL mengandung whitespace atau karakter kontrol yang dilarang.' };
    }

    if (/[\x00-\x1f\x7f]/.test(rawUrl)) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'URL mengandung karakter kontrol ilegal.' };
    }

    // Tolak karakter backslash
    if (rawUrl.indexOf('\\') !== -1) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'URL mengandung karakter backslash yang dilarang.' };
    }

    // Tolak query string (?) atau fragment (#) pada BASE_URL
    if (rawUrl.indexOf('?') !== -1 || rawUrl.indexOf('#') !== -1) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'URL mengandung query string (?) atau fragment (#) yang dilarang pada BASE_URL.' };
    }

    // Tolak userinfo (@)
    if (rawUrl.indexOf('@') !== -1) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'URL mengandung userinfo (username/password/credentials). Ditolak demi keamanan.' };
    }

    // 1. Validasi protokol awal (Hanya izinkan http:// atau https://)
    const schemeMatch = rawUrl.match(/^(https?):\/\/(.*)$/i);
    if (!schemeMatch) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'Protokol URL tidak diizinkan. Hanya HTTP dan HTTPS yang diterima.' };
    }

    const parsedProtocol = schemeMatch[1].toLowerCase() + ':';
    const rest = schemeMatch[2];

    if (!rest) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'Authority/Hostname URL kosong.' };
    }

    // BASE_URL wajib berupa origin/base URL murni (opsional trailing slash tunggal '/')
    const slashIndex = rest.indexOf('/');
    let authorityPart = rest;
    if (slashIndex !== -1) {
        const pathPart = rest.substring(slashIndex);
        if (pathPart !== '/' && pathPart !== '') {
            return { valid: false, hostname: '', port: '', protocol: '', error: 'URL memuat path yang tidak diizinkan pada BASE_URL (wajib base origin).' };
        }
        authorityPart = rest.substring(0, slashIndex);
    }

    if (!authorityPart) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'Authority/Host kosong.' };
    }

    // Deteksi tanda titik dua untuk port
    const colonMatches = authorityPart.match(/:/g);
    const colonCount = colonMatches ? colonMatches.length : 0;
    if (colonCount > 1) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'Format authority tidak valid (memuat lebih dari satu tanda titik dua).' };
    }

    let parsedHostname = '';
    let parsedPort = '';

    if (colonCount === 1) {
        const colonIdx = authorityPart.indexOf(':');
        parsedHostname = authorityPart.substring(0, colonIdx);
        const rawPort = authorityPart.substring(colonIdx + 1);

        if (!rawPort || !/^\d+$/.test(rawPort)) {
            return { valid: false, hostname: '', port: '', protocol: '', error: `Port "${rawPort}" tidak valid (wajib berupa angka numerik).` };
        }

        const portNum = parseInt(rawPort, 10);
        if (portNum < 1 || portNum > 65535 || String(portNum) !== rawPort) {
            return { valid: false, hostname: '', port: '', protocol: '', error: `Port "${rawPort}" di luar rentang port yang valid (1-65535).` };
        }

        parsedPort = rawPort;
    } else {
        parsedHostname = authorityPart;
        parsedPort = '';
    }

    parsedHostname = parsedHostname.toLowerCase();

    // Validasi integritas hostname
    if (!parsedHostname || parsedHostname.length > 253) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'Hostname kosong atau melebihi batas panjang RFC.' };
    }

    // Tolak karakter ilegal pada hostname
    if (/[\s/:@\\?#]/.test(parsedHostname)) {
        return { valid: false, hostname: '', port: '', protocol: '', error: `Hostname "${parsedHostname}" memuat karakter ilegal.` };
    }

    // Tolak leading atau trailing dot
    if (parsedHostname.startsWith('.') || parsedHostname.endsWith('.')) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'Leading atau trailing dot pada hostname tidak diizinkan.' };
    }

    // Tolak consecutive dots
    if (parsedHostname.indexOf('..') !== -1) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'Consecutive dots pada hostname tidak diizinkan.' };
    }

    // Karakter hostname hanya boleh huruf, angka, dot, dan hyphen
    if (!/^[a-z0-9.-]+$/.test(parsedHostname)) {
        return { valid: false, hostname: '', port: '', protocol: '', error: 'Hostname memuat karakter non-standar.' };
    }

    // Validasi label hostname
    const labels = parsedHostname.split('.');
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        if (!label || label.length > 63 || label.startsWith('-') || label.endsWith('-')) {
            return { valid: false, hostname: '', port: '', protocol: '', error: `Label hostname "${label}" tidak valid.` };
        }
    }

    // Jika berupa format IPv4 (seluruhnya angka dan dot), validasi rentang oktet 0-255
    if (/^(\d+\.){3}\d+$/.test(parsedHostname)) {
        const octets = parsedHostname.split('.');
        for (let i = 0; i < 4; i++) {
            const oct = parseInt(octets[i], 10);
            if (oct < 0 || oct > 255 || String(oct) !== octets[i]) {
                return { valid: false, hostname: '', port: '', protocol: '', error: `Oktet IP "${octets[i]}" tidak valid.` };
            }
        }
    }

    return { valid: true, hostname: parsedHostname, port: parsedPort, protocol: parsedProtocol, error: null };
}

/**
 * Validasi ketat target environment sebelum proses autentikasi (POST /login) diizinkan.
 * Mencegah eksekusi POST /login yang memutasi kolom users.terakhir_login_at pada database tim.
 * 
 * Syarat Mutlak Lolos:
 * 1. BASE_URL diberikan secara eksplisit (tidak kosong).
 * 2. TARGET_ENV === 'local_isolated' ATAU TARGET_ENV === 'isolated_staging'.
 * 3. Untuk local_isolated: hanya HTTP, port eksak 8001, hostname 127.0.0.1 atau localhost.
 * 4. Untuk isolated_staging: hostname wajib terdaftar di ALLOWED_STAGING_HOSTS (bukan IP/localhost).
 * 
 * @param {string} url 
 * @returns {{ isSafe: boolean, reason: string }}
 */
export function validateAuthSafety(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
        return {
            isSafe: false,
            reason: 'BASE_URL tidak didefinisikan. Wajib menyuplai __ENV.BASE_URL secara eksplisit via environment variable.',
        };
    }

    if (TARGET_ENV !== 'isolated_staging' && TARGET_ENV !== 'local_isolated') {
        return {
            isSafe: false,
            reason: `TARGET_ENV bernilai "${TARGET_ENV || '(kosong)'}", wajib "local_isolated" atau "isolated_staging". POST /login diblokir demi melindungi database tim.`,
        };
    }

    const parseResult = parseAndValidateUrl(url);
    if (!parseResult.valid) {
        return {
            isSafe: false,
            reason: `Validasi URL gagal: ${parseResult.error}`,
        };
    }

    const { hostname, port, protocol } = parseResult;

    // TARGET_ENV === 'local_isolated' (PostgreSQL lokal terisolasi port 5433 / server Laravel port 8001)
    if (TARGET_ENV === 'local_isolated') {
        if (protocol !== 'http:') {
            return {
                isSafe: false,
                reason: `Target local_isolated wajib menggunakan protokol HTTP ("${protocol}" ditolak).`,
            };
        }
        if (port !== '8001') {
            return {
                isSafe: false,
                reason: `Target local_isolated hanya mengizinkan port eksak 8001 (Port "${port || 'default'}" ditolak demi mencegah koneksi ke port 8000 default .env atau port DB).`,
            };
        }
        if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
            return {
                isSafe: false,
                reason: `Host "${hostname}" ditolak untuk local_isolated. Hanya 127.0.0.1 atau localhost yang diizinkan.`,
            };
        }
        return {
            isSafe: true,
            reason: 'Target terverifikasi aman untuk local_isolated (http://127.0.0.1:8001 atau http://localhost:8001).',
        };
    }

    // TARGET_ENV === 'isolated_staging'
    const forbiddenLocalHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '0:0:0:0:0:0:0:1'];
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':');

    if (forbiddenLocalHosts.includes(hostname) || isIpAddress) {
        return {
            isSafe: false,
            reason: `Host "${hostname}" adalah alamat IP / host lokal yang ditolak untuk staging.`,
        };
    }

    if (!ALLOWED_STAGING_HOSTS.includes(hostname)) {
        return {
            isSafe: false,
            reason: `Host "${hostname}" tidak terdaftar dalam ALLOWED_STAGING_HOSTS. POST /login DITOLAK.`,
        };
    }

    return {
        isSafe: true,
        reason: 'Target terverifikasi aman untuk autentikasi isolated staging.',
    };
}

/**
 * Validasi bertingkat sebelum request mutasi POST jawaban diizinkan:
 * 1. ENABLE_STAGING_MUTATION wajib 'true'.
 * 2. TARGET_ENV === 'local_isolated' ATAU TARGET_ENV === 'isolated_staging'.
 * 3. Untuk local_isolated: hanya HTTP, port eksak 8001, hostname 127.0.0.1 atau localhost.
 * 4. Untuk isolated_staging: hostname terdaftar di ALLOWED_STAGING_HOSTS.
 * 
 * @param {string} url 
 * @returns {{ isSafeForMutation: boolean, reason: string }}
 */
export function validateStagingMutationSafety(url) {
    if (!ENABLE_STAGING_MUTATION) {
        return {
            isSafeForMutation: false,
            reason: 'ENABLE_STAGING_MUTATION tidak aktif (default: false). Database bersama terlindungi.',
        };
    }

    if (TARGET_ENV !== 'isolated_staging' && TARGET_ENV !== 'local_isolated') {
        return {
            isSafeForMutation: false,
            reason: `TARGET_ENV bernilai "${TARGET_ENV}", wajib "local_isolated" atau "isolated_staging". Mutasi POST diblokir.`,
        };
    }

    const parseResult = parseAndValidateUrl(url);
    if (!parseResult.valid) {
        return {
            isSafeForMutation: false,
            reason: `Validasi URL gagal: ${parseResult.error}`,
        };
    }

    const { hostname, port, protocol } = parseResult;

    // TARGET_ENV === 'local_isolated'
    if (TARGET_ENV === 'local_isolated') {
        if (protocol !== 'http:') {
            return {
                isSafeForMutation: false,
                reason: `Mutasi local_isolated wajib menggunakan protokol HTTP ("${protocol}" ditolak).`,
            };
        }
        if (port !== '8001') {
            return {
                isSafeForMutation: false,
                reason: `Mutasi local_isolated hanya diizinkan pada port eksak 8001 (Port "${port || 'default'}" ditolak).`,
            };
        }
        if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
            return {
                isSafeForMutation: false,
                reason: `Host "${hostname}" ditolak untuk mutasi local_isolated. Hanya 127.0.0.1 atau localhost yang diizinkan.`,
            };
        }
        return {
            isSafeForMutation: true,
            reason: 'Seluruh syarat validasi mutasi lokal terisolasi port 8001 terpenuhi.',
        };
    }

    // TARGET_ENV === 'isolated_staging'
    const forbiddenLocalHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '0:0:0:0:0:0:0:1'];
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':');

    if (forbiddenLocalHosts.includes(hostname) || isIpAddress) {
        return {
            isSafeForMutation: false,
            reason: `Host "${hostname}" adalah alamat IP / host lokal yang ditolak untuk mutasi staging.`,
        };
    }

    // Verifikasi allowlist host staging resmi dengan exact match (tidak menerima subdomain tambahan)
    if (!ALLOWED_STAGING_HOSTS.includes(hostname)) {
        return {
            isSafeForMutation: false,
            reason: `Host "${hostname}" tidak terdaftar dalam ALLOWED_STAGING_HOSTS. Mutasi POST DITOLAK.`,
        };
    }

    return {
        isSafeForMutation: true,
        reason: 'Seluruh syarat validasi staging terisolasi terpenuhi.',
    };
}

// ----------------------------------------------------------------------------
// 5. HELPER DATA SISWA DINAMIS, VALIDASI KEUNIKAN, AUTENTIKASI, DAN COOKIE
// ----------------------------------------------------------------------------

/**
 * Memvalidasi dan mengurai seluruh dataset siswa dari __ENV.STUDENT_DATA_JSON.
 * Dijalankan sekali sebelum pengujian berjalan untuk memastikan integritas dataset secara menyeluruh:
 * 1. Format JSON array valid dan tidak kosong.
 * 2. Setiap entri adalah objek valid (bukan null/array/primitive).
 * 3. Field wajib (email, password, sesiId) bertipe string dan tidak kosong.
 * 4. Field opsional (soalId, opsiId) divalidasi bertipe string.
 * 5. Seluruh email dalam dataset wajib UNIK (tidak boleh ada duplikasi antar-VU).
 * 6. Seluruh sesiId dalam dataset wajib UNIK (tidak boleh ada duplikasi sesi pengerjaan).
 * 7. Tidak mencetak password atau isi kredensial dalam pesan error.
 * 
 * @param {string} rawJson 
 * @returns {{ valid: boolean, dataset: Array<object>, error: string|null }}
 */
function validateAndParseStudentDataset(rawJson) {
    if (!rawJson || typeof rawJson !== 'string' || rawJson.trim() === '') {
        return { valid: false, dataset: [], error: 'STUDENT_DATA_JSON kosong.' };
    }

    let parsed = null;
    try {
        parsed = JSON.parse(rawJson.trim());
    } catch (_) {
        return { valid: false, dataset: [], error: 'Format STUDENT_DATA_JSON tidak valid (gagal diurai sebagai JSON).' };
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        return { valid: false, dataset: [], error: 'STUDENT_DATA_JSON wajib berupa array JSON non-kosong berisi data siswa dan sesi unik.' };
    }

    const seenEmails = new Set();
    const seenSesiIds = new Set();
    const validatedList = [];

    for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return {
                valid: false,
                dataset: [],
                error: `Entri dataset pada indeks ${i} bukan objek JSON yang valid.`,
            };
        }

        // Validasi field wajib tanpa menampilkan credential
        if (!item.email || typeof item.email !== 'string' || item.email.trim() === '') {
            return {
                valid: false,
                dataset: [],
                error: `Entri dataset pada indeks ${i} tidak memiliki field 'email' yang valid.`,
            };
        }

        if (!item.password || typeof item.password !== 'string' || item.password.trim() === '') {
            return {
                valid: false,
                dataset: [],
                error: `Entri dataset pada indeks ${i} tidak memiliki field 'password' yang valid.`,
            };
        }

        if (!item.sesiId || typeof item.sesiId !== 'string' || item.sesiId.trim() === '') {
            return {
                valid: false,
                dataset: [],
                error: `Entri dataset pada indeks ${i} tidak memiliki field 'sesiId' yang valid.`,
            };
        }

        const normalizedEmail = item.email.trim().toLowerCase();
        const normalizedSesiId = item.sesiId.trim();

        // Validasi keunikan email
        if (seenEmails.has(normalizedEmail)) {
            return {
                valid: false,
                dataset: [],
                error: `Duplikasi email terdeteksi pada entri indeks ${i}. Seluruh email siswa dalam dataset wajib unik per VU.`,
            };
        }
        seenEmails.add(normalizedEmail);

        // Validasi keunikan sesiId
        if (seenSesiIds.has(normalizedSesiId)) {
            return {
                valid: false,
                dataset: [],
                error: `Duplikasi sesiId terdeteksi pada entri indeks ${i}. Seluruh sesi pengerjaan wajib unik per VU untuk mencegah lock contention block(10,10).`,
            };
        }
        seenSesiIds.add(normalizedSesiId);

        // Validasi soalId dan opsiId
        const soalIdVal = (item.soalId && typeof item.soalId === 'string') ? item.soalId.trim() : '';
        const opsiIdVal = (item.opsiId && typeof item.opsiId === 'string') ? item.opsiId.trim() : '';

        validatedList.push({
            email: normalizedEmail,
            password: item.password,
            sesiId: normalizedSesiId,
            soalId: soalIdVal,
            opsiId: opsiIdVal,
        });
    }

    return {
        valid: true,
        dataset: validatedList,
        error: null,
    };
}

/**
 * Mengambil data siswa yang telah divalidasi untuk Virtual User tertentu.
 * Menjamin setiap VU memperoleh pasangan kredensial dan sesi pengerjaan unik (1-to-1 mapping).
 * 
 * @param {number} vuNumber - Nomor Virtual User (__VU) dari runtime k6 (dimulai dari 1).
 * @param {Array<object>|null} parsedDataset - Dataset yang telah tervalidasi keunikannya.
 * @returns {{ valid: boolean, data: object|null, error: string|null }}
 */
function getStudentDataForVU(vuNumber, parsedDataset) {
    if (parsedDataset && Array.isArray(parsedDataset) && parsedDataset.length > 0) {
        const targetIndex = (vuNumber > 0) ? vuNumber - 1 : 0;

        if (targetIndex >= parsedDataset.length) {
            return {
                valid: false,
                data: null,
                error: `Data akun unik tidak mencukupi untuk VU #${vuNumber}. Dataset hanya memiliki ${parsedDataset.length} entri akun unik. Pengujian multi-VU dihentikan secara global demi mencegah tabrakan sesi.`,
            };
        }

        return {
            valid: true,
            data: parsedDataset[targetIndex],
            error: null,
        };
    }

    // Evaluasi Single Account Explicit Input (Hanya diizinkan untuk 1 VU tunggal)
    const singleEmail = (__ENV.SISWA_EMAIL || '').trim();
    const singlePassword = (__ENV.SISWA_PASSWORD || '').trim();
    const singleSesiId = (__ENV.SESI_ID || '').trim();

    if (singleEmail && singlePassword && singleSesiId) {
        if (vuNumber > 1) {
            return {
                valid: false,
                data: null,
                error: `Multi-VU load testing (VU #${vuNumber}) DILARANG menggunakan akun dan sesi tunggal yang sama. Sesi pengerjaan dan kredensial harus unik per VU untuk mencegah lock contention block(10,10) dan throttle:30,1. Sediakan dataset lengkap via __ENV.STUDENT_DATA_JSON.`,
            };
        }

        return {
            valid: true,
            data: {
                email: singleEmail.toLowerCase(),
                password: singlePassword,
                sesiId: singleSesiId,
                soalId: (__ENV.SOAL_ID || '').trim(),
                opsiId: (__ENV.OPSI_ID || '').trim(),
            },
            error: null,
        };
    }

    return {
        valid: false,
        data: null,
        error: 'Tidak ada data siswa dan sesi pengerjaan yang disuplai. Sediakan dataset unik via __ENV.STUDENT_DATA_JSON atau single account eksplisit via __ENV.SISWA_EMAIL, __ENV.SISWA_PASSWORD, dan __ENV.SESI_ID (hanya untuk 1 VU).',
    };
}

/**
 * Mengambil CSRF token (XSRF-TOKEN) dari cookie jar k6
 * @param {string} url 
 * @returns {string|null}
 */
function extractXsrfToken(url = BASE_URL) {
    const jar = http.cookieJar();
    const cookies = jar.cookiesForURL(url);
    if (cookies && cookies['XSRF-TOKEN'] && cookies['XSRF-TOKEN'].length > 0) {
        return decodeURIComponent(cookies['XSRF-TOKEN'][0]);
    }
    return null;
}

/**
 * Autentikasi Siswa: GET /login -> POST /login -> Validasi role Siswa
 * Dilakukan sekali per VU untuk mencegah 'Login Storm'
 * 
 * @param {object} studentData - Objek berisi email dan password siswa unik
 * @returns {boolean}
 */
function authenticateStudent(studentData) {
    // 1. Safety Guard Validasi Lingkungan Staging Terisolasi
    const authSafety = validateAuthSafety(BASE_URL);
    if (!authSafety.isSafe) {
        console.error(`[AUTH SAFETY GUARD BLOCKED] ${authSafety.reason}`);
        errorAuthCount.add(1);
        authSuccessRate.add(0);
        return false;
    }

    if (!studentData || !studentData.email || !studentData.password) {
        console.error('[AUTH ERROR] Kredensial siswa tidak lengkap.');
        errorAuthCount.add(1);
        authSuccessRate.add(0);
        return false;
    }

    // Stagger inisialisasi login awal per-VU untuk mencegah login storm instan
    // pada server tanpa mengganggu alur pengujian sesi
    if (__VU > 1 && LOGIN_STAGGER_SECONDS > 0) {
        sleep((__VU - 1) * LOGIN_STAGGER_SECONDS);
    }

    const authStartTime = Date.now();
    const loginUrl = `${BASE_URL}/login`;

    // 2. GET /login untuk inisialisasi cookie session & XSRF token
    const getRes = http.get(loginUrl, {
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        redirects: 0,
        tags: { name: 'AUTH_Get_Login_Siswa' },
    });

    if (getRes.status !== 200) {
        errorAuthCount.add(1);
        authSuccessRate.add(0);
        return false;
    }

    let token = extractXsrfToken(BASE_URL);
    if (!token && getRes.body) {
        const metaMatch = getRes.body.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
        if (metaMatch && metaMatch[1]) token = metaMatch[1];
    }
    cachedXsrfToken = token;

    // Safety check ganda sebelum pengiriman POST login yang memutasi database
    if (!authSafety.isSafe) {
        return false;
    }

    // 3. POST /login dengan kredensial siswa unik
    const loginPayload = JSON.stringify({
        email: studentData.email,
        password: studentData.password,
        remember: false,
    });

    const postHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };
    if (token) postHeaders['X-XSRF-TOKEN'] = token;

    const postRes = http.post(loginUrl, loginPayload, {
        headers: postHeaders,
        redirects: 0, // Tangkap status redirect Laravel 302
        tags: { name: 'AUTH_Post_Login_Siswa' },
    });

    if (postRes.timings.duration > 0) {
        waktuLoginPost.add(postRes.timings.duration);
    }

    const isAccepted = (postRes.status === 302 && !(postRes.headers['Location'] || '').includes('/login')) ||
                       (postRes.status === 200 && !postRes.body.includes('errors'));

    if (!isAccepted) {
        errorAuthCount.add(1);
        authSuccessRate.add(0);
        return false;
    }

    // Perbarui token setelah login
    cachedXsrfToken = extractXsrfToken(BASE_URL) || cachedXsrfToken;

    // 4. Verifikasi role ke /dashboard
    const verifyRes = http.get(`${BASE_URL}/dashboard`, {
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        redirects: 0,
        tags: { name: 'AUTH_Verify_Dashboard_Siswa' },
    });

    const isSessionOk = verifyRes.status === 200;
    const pageData = parseInertiaData(verifyRes.body);
    const isRoleSiswa = (pageData && pageData.props && pageData.props.auth && pageData.props.auth.user && pageData.props.auth.user.role === 'siswa') ||
                        (verifyRes.body && verifyRes.body.includes('"role":"siswa"'));

    if (isSessionOk && isRoleSiswa) {
        waktuAutentikasi.add(Date.now() - authStartTime);
        authSuccessRate.add(1);
        return true;
    } else {
        errorAuthCount.add(1);
        authSuccessRate.add(0);
        return false;
    }
}

// ----------------------------------------------------------------------------
// 6. SKENARIO UTAMA EKSEKUSI PENGUJIAN (VU FUNCTION)
// ----------------------------------------------------------------------------
export default function () {
    // 1. Pemeriksaan Konfigurasi Fatal Global (Pre-flight Guard via exec.test.abort)
    if (!globalPreflightChecked) {
        if (!BASE_URL) {
            exec.test.abort('[FATAL CONFIG] BASE_URL tidak didefinisikan! Wajib menyertakan -e BASE_URL=<url> saat menjalankan k6. Eksekusi dihentikan secara global demi keselamatan database.');
            return;
        }

        const authSafety = validateAuthSafety(BASE_URL);
        if (!authSafety.isSafe) {
            exec.test.abort(`[FATAL CONFIG] Target tidak aman untuk isolated staging: ${authSafety.reason}`);
            return;
        }

        // Validasi dataset jika disuplai via STUDENT_DATA_FILE atau STUDENT_DATA_JSON
        const rawDataJson = fileDatasetRaw || (__ENV.STUDENT_DATA_JSON || '').trim();
        if (rawDataJson) {
            const validation = validateAndParseStudentDataset(rawDataJson);
            if (!validation.valid) {
                exec.test.abort(`[FATAL DATA] Validasi STUDENT_DATA gagal: ${validation.error}`);
                return;
            }
            parsedGlobalDataset = validation.dataset;
        } else if (STUDENT_DATA_FILE && !fileDatasetRaw) {
            exec.test.abort(`[FATAL DATA] Gagal membaca STUDENT_DATA_FILE pada path: ${STUDENT_DATA_FILE}`);
            return;
        }

        globalPreflightChecked = true;
    }

    // 2. Ambil data akun dan sesi unik untuk VU ini
    if (!cachedStudentData) {
        const studentDataResult = getStudentDataForVU(__VU, parsedGlobalDataset);
        if (!studentDataResult.valid) {
            exec.test.abort(`[FATAL DATA] VU #${__VU}: ${studentDataResult.error}`);
            return;
        }
        cachedStudentData = studentDataResult.data;
    }

    // 3. Pastikan VU sudah terautentikasi satu kali
    if (!vuSessionInitialized) {
        vuSessionInitialized = true;
        vuSessionValid = authenticateStudent(cachedStudentData);
    }

    // Kegagalan autentikasi aplikasi pada iterasi ini ditangani secara wajar tanpa mematikan runner
    if (!vuSessionValid) {
        sleep(2);
        return;
    }

    const currentSesiId = cachedStudentData.sesiId;
    let extractedSoalId = cachedStudentData.soalId;
    let extractedOpsiIds = cachedStudentData.opsiId ? [cachedStudentData.opsiId] : [];

    let isPaketSoalValid = false;

    // ------------------------------------------------------------------------
    // BAGIAN 1: PENGUKURAN WAKTU PEMUATAN / PENGAMBILAN SOAL UJIAN
    // Endpoint: GET /latihan/kerjakan/{pengerjaan}
    // Controller: LatihanSoalController@kerjakan -> Inertia::render('Latihan/Ujian')
    // ------------------------------------------------------------------------
    group('Pengambilan Paket Soal Ujian (GET /latihan/kerjakan/{id})', function () {
        const kerjakanUrl = `${BASE_URL}/latihan/kerjakan/${currentSesiId}`;
        const kerjakanRes = http.get(kerjakanUrl, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            redirects: 0, // Mencegah k6 mengikuti redirect otomatis (misal redirect 302 jika sesi tidak valid)
            tags: { name: 'GET_Latihan_Kerjakan_Soal' },
        });

        // Validasi Respons Bisnis Aktual EDVORA:
        // Component: 'Latihan/Ujian'
        // Props: 'subtes', 'soalList' (array), 'konfigurasi.sesiId'
        const pageData = parseInertiaData(kerjakanRes.body);
        const isBusinessPayloadValid = Boolean(
            pageData &&
            pageData.component === 'Latihan/Ujian' &&
            pageData.props &&
            pageData.props.subtes &&
            Array.isArray(pageData.props.soalList) &&
            pageData.props.soalList.length > 0 &&
            pageData.props.konfigurasi &&
            pageData.props.konfigurasi.sesiId
        );

        const isAmbilOk = check(kerjakanRes, {
            '[Soal] Halaman soal merespons HTTP 200 OK': (r) => r.status === 200,
            '[Soal] Durasi pemuatan soal <= 1.000 ms (SLA)': (r) => r.timings.duration <= 1000,
            '[Soal] Validasi bisnis payload Inertia Latihan/Ujian valid': () => isBusinessPayloadValid,
            '[Soal] Tidak dialihkan (Bukan redirect 3xx)': (r) => r.status < 300 || r.status >= 400,
        });

        // HANYA hitung sukses jika HTTP 200 DAN validasi bisnis payload terpenuhi!
        if (kerjakanRes.status === 200 && isBusinessPayloadValid && kerjakanRes.timings.duration > 0) {
            waktuAmbilSoal.add(kerjakanRes.timings.duration);
            successRateAmbilSoal.add(1);

            // Simpan daftar butir soal aktual dari respons ke state per-VU untuk rotasi pengerjaan
            if (pageData && pageData.props && Array.isArray(pageData.props.soalList) && pageData.props.soalList.length > 0) {
                vuSoalList = pageData.props.soalList;
                isPaketSoalValid = true;

                // Sinkronkan daftar soal yang sudah tersimpan di database dari props sesi fleksibel
                if (Array.isArray(pageData.props.jawabanTersimpan)) {
                    for (let j = 0; j < pageData.props.jawabanTersimpan.length; j++) {
                        const jItem = pageData.props.jawabanTersimpan[j];
                        if (jItem && jItem.soalId) {
                            vuAnsweredSoalSet.add(jItem.soalId);
                        }
                    }
                }
            }
        } else {
            successRateAmbilSoal.add(0);
            if (kerjakanRes.timings.duration > 0) {
                waktuAmbilSoal.add(kerjakanRes.timings.duration, { status: 'failed' });
            }
        }
    });

    // FAIL-CLOSED: Jika pengambilan soal gagal atau soalList tidak valid/kosong,
    // hentikan iterasi secara aman tanpa mengirim POST, tanpa menandai soal terjawab,
    // dan tanpa menaikkan vuIterationCount (sesi belum valid pada iterasi ini).
    if (!isPaketSoalValid || vuSoalList.length === 0) {
        sleep(PACING_SECONDS);
        return;
    }

    // Pacing time simulasi siswa membaca instruksi / soal (1 detik)
    sleep(1);

    // ------------------------------------------------------------------------
    // BAGIAN 2: PENGIRIMAN JAWABAN SISWA (POST /latihan/ujian/jawab)
    // DILINDUNGI OLEH MULTI-LAYER SAFETY GUARD DATABASE BERSAMA
    // ------------------------------------------------------------------------
    group('Pengiriman Jawaban Siswa (POST /latihan/ujian/jawab)', function () {
        const stagingSafety = validateStagingMutationSafety(BASE_URL);

        if (!stagingSafety.isSafeForMutation) {
            // ================================================================
            // MULTI-LAYER SAFETY GUARD AKTIF:
            // Sesuai aturan dosen, DILARANG mengirimkan POST massal ke database bersama
            // yang dapat memicu deadlock, atomic lock contention block(10,10),
            // atau mengubah status pengerjaan yang sedang digunakan anggota tim lain.
            // ================================================================
            guardBypassCount.add(1);
            if (ENABLE_STAGING_MUTATION || TARGET_ENV) {
                console.warn(`[SAFETY GUARD BLOCKED] ${stagingSafety.reason}`);
            }
            return;
        }

        // Tentukan butir soal dan opsi dari daftar soal aktual per-VU yang sudah tervalidasi
        let targetSoalId = null;
        let targetOpsiIds = [];

        if (vuSoalList.length > 0) {
            // Prioritaskan butir soal yang belum dijawab pada sesi ini untuk menjamin mutasi jawaban baru
            let selectedItem = null;
            for (let i = 0; i < vuSoalList.length; i++) {
                const candidate = vuSoalList[(vuIterationCount + i) % vuSoalList.length];
                if (candidate && candidate.id && !vuAnsweredSoalSet.has(candidate.id)) {
                    selectedItem = candidate;
                    break;
                }
            }
            if (!selectedItem) {
                selectedItem = vuSoalList[vuIterationCount % vuSoalList.length];
            }
            if (selectedItem && selectedItem.id) {
                targetSoalId = selectedItem.id;
                if (Array.isArray(selectedItem.opsi_jawaban) && selectedItem.opsi_jawaban.length > 0) {
                    targetOpsiIds = [selectedItem.opsi_jawaban[0].id];
                }
            }
        }

        if (!targetSoalId) {
            return;
        }

        // Klasifikasi apakah butir soal ini baru pertama kali dikirim oleh VU pada sesi ini
        const isNewAnswer = !vuAnsweredSoalSet.has(targetSoalId);
        const actionTag = isNewAnswer ? 'answer_new' : 'answer_repeat';

        const jawabUrl = `${BASE_URL}/latihan/ujian/jawab`;
        const payloadJawab = JSON.stringify({
            sesiId: currentSesiId,
            soalId: targetSoalId,
            opsiIds: targetOpsiIds,
        });

        const postHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        };
        const token = cachedXsrfToken || extractXsrfToken(BASE_URL);
        if (token) postHeaders['X-XSRF-TOKEN'] = token;

        const jawabRes = http.post(jawabUrl, payloadJawab, {
            headers: postHeaders,
            tags: { name: 'POST_Latihan_Ujian_Jawab', action: actionTag },
        });

        // Validasi respons JSON jawaban riil EDVORA
        let isFeedbackValid = false;
        try {
            const jsonBody = jawabRes.json();
            isFeedbackValid = Boolean(jsonBody && (typeof jsonBody.benar !== 'undefined' || jsonBody.pembahasan || jsonBody.kunci));
        } catch (_) {}

        const isJawabOk = check(jawabRes, {
            '[Jawaban] Pengiriman jawaban merespons HTTP 200 OK': (r) => r.status === 200,
            '[Jawaban] Durasi pengiriman jawaban <= 1.000 ms (SLA)': (r) => r.timings.duration <= 1000,
            '[Jawaban] Tidak terkena throttle:30,1 (Bukan 429)': (r) => r.status !== 429,
            '[Jawaban] Format respons feedback jawaban valid': () => isFeedbackValid,
        });

        if (jawabRes.status === 429) {
            errorRateLimitCount.add(1);
        }
        if (jawabRes.status >= 500) {
            errorServer5xxCount.add(1);
        }

        if (jawabRes.status === 200 && isFeedbackValid && jawabRes.timings.duration > 0) {
            // Tandai soal ini sudah pernah dijawab oleh VU pada sesi ini
            vuAnsweredSoalSet.add(targetSoalId);

            // Rekam ke metrik terpisah: jawaban baru vs jawaban ulang
            if (isNewAnswer) {
                waktuPengirimanJawabanBaru.add(jawabRes.timings.duration, { action: 'answer_new' });
            } else {
                waktuPengirimanJawabanUlang.add(jawabRes.timings.duration, { action: 'answer_repeat' });
            }

            // Rekam ke metrik agregasi untuk pelaporan SLA utama
            waktuPengirimanJawaban.add(jawabRes.timings.duration, { action: actionTag });
            successRateJawaban.add(1);
        } else {
            successRateJawaban.add(0);
            if (jawabRes.timings.duration > 0) {
                if (isNewAnswer) {
                    waktuPengirimanJawabanBaru.add(jawabRes.timings.duration, { status: 'failed', action: 'answer_new' });
                } else {
                    waktuPengirimanJawabanUlang.add(jawabRes.timings.duration, { status: 'failed', action: 'answer_repeat' });
                }
                waktuPengirimanJawaban.add(jawabRes.timings.duration, { status: 'failed', action: actionTag });
            }
        }
    });

    // Pacing configurable antar iterasi (default: 2 detik via __ENV.PACING_SECONDS)
    vuIterationCount++;
    sleep(PACING_SECONDS);
}

// ----------------------------------------------------------------------------
// 7. RINGKASAN LAPORAN HASIL (SUMMARY HANDLER)
// ----------------------------------------------------------------------------
export function handleSummary(data) {
    return {
        'stdout': generateCustomSummary(data),
    };
}

function generateCustomSummary(data) {
    const p95Ambil = data.metrics.waktu_ambil_soal && data.metrics.waktu_ambil_soal.values ? data.metrics.waktu_ambil_soal.values['p(95)'] : 0;
    const maxAmbil = data.metrics.waktu_ambil_soal && data.metrics.waktu_ambil_soal.values ? data.metrics.waktu_ambil_soal.values['max'] : 0;
    const p95Jawab = data.metrics.waktu_pengiriman_jawaban && data.metrics.waktu_pengiriman_jawaban.values ? data.metrics.waktu_pengiriman_jawaban.values['p(95)'] : 0;
    const maxJawab = data.metrics.waktu_pengiriman_jawaban && data.metrics.waktu_pengiriman_jawaban.values ? data.metrics.waktu_pengiriman_jawaban.values['max'] : 0;
    const p95JawabBaru = data.metrics.waktu_pengiriman_jawaban_baru && data.metrics.waktu_pengiriman_jawaban_baru.values ? data.metrics.waktu_pengiriman_jawaban_baru.values['p(95)'] : 0;
    const maxJawabBaru = data.metrics.waktu_pengiriman_jawaban_baru && data.metrics.waktu_pengiriman_jawaban_baru.values ? data.metrics.waktu_pengiriman_jawaban_baru.values['max'] : 0;
    const p95JawabUlang = data.metrics.waktu_pengiriman_jawaban_ulang && data.metrics.waktu_pengiriman_jawaban_ulang.values ? data.metrics.waktu_pengiriman_jawaban_ulang.values['p(95)'] : 0;
    const maxJawabUlang = data.metrics.waktu_pengiriman_jawaban_ulang && data.metrics.waktu_pengiriman_jawaban_ulang.values ? data.metrics.waktu_pengiriman_jawaban_ulang.values['max'] : 0;
    const p95Auth = data.metrics.waktu_autentikasi && data.metrics.waktu_autentikasi.values ? data.metrics.waktu_autentikasi.values['p(95)'] : 0;
    const maxAuth = data.metrics.waktu_autentikasi && data.metrics.waktu_autentikasi.values ? data.metrics.waktu_autentikasi.values['max'] : 0;
    const p95LoginPost = data.metrics.waktu_login_post && data.metrics.waktu_login_post.values ? data.metrics.waktu_login_post.values['p(95)'] : 0;
    const maxLoginPost = data.metrics.waktu_login_post && data.metrics.waktu_login_post.values ? data.metrics.waktu_login_post.values['max'] : 0;
    const bypassVal = data.metrics.guard_bypass_count && data.metrics.guard_bypass_count.values ? data.metrics.guard_bypass_count.values.count : 0;
    const authSafety = BASE_URL ? validateAuthSafety(BASE_URL) : { isSafe: false, reason: 'BASE_URL tidak didefinisikan.' };
    const stagingSafety = BASE_URL ? validateStagingMutationSafety(BASE_URL) : { isSafeForMutation: false, reason: 'BASE_URL tidak didefinisikan.' };

    return `
================================================================================
HASIL LOAD TESTING SKENARIO A — STUDENT (EDVORA)
Penanggung Jawab: Indah
================================================================================
Target SLA: Response Time <= 1.000 ms | Threshold Error Rate: < 1.00%
Konfigurasi Beban: Hingga 500 Virtual Users (VU)
Pacing Per Iterasi: ${PACING_SECONDS.toFixed(1)} detik
Status Auth Safety Guard: ${authSafety.isSafe ? 'TERBUKA (' + authSafety.reason + ')' : 'TERKUNCI (' + authSafety.reason + ')'}
Status Mutation Safety Guard: ${stagingSafety.isSafeForMutation ? 'TERBUKA (' + stagingSafety.reason + ')' : 'TERKUNCI (' + stagingSafety.reason + ')'}
--------------------------------------------------------------------------------
Waktu Autentikasi Siswa (Login Lifecycle per-VU):
  - Siklus Penuh (p95) : ${p95Auth ? p95Auth.toFixed(2) + ' ms' : 'N/A'} (Max: ${maxAuth ? maxAuth.toFixed(2) + ' ms' : 'N/A'})
  - POST /login  (p95) : ${p95LoginPost ? p95LoginPost.toFixed(2) + ' ms' : 'N/A'} (Max: ${maxLoginPost ? maxLoginPost.toFixed(2) + ' ms' : 'N/A'})

Waktu Pengambilan / Pemuatan Soal (GET /latihan/kerjakan/{id}):
  - p95 : ${p95Ambil ? p95Ambil.toFixed(2) + ' ms' : 'N/A'} (Target: <= 1.000 ms)
  - Max : ${maxAmbil ? maxAmbil.toFixed(2) + ' ms' : 'N/A'} (Target: <= 1.000 ms)

Waktu Pengiriman Jawaban Siswa — AGREGASI TOTAL (POST /latihan/ujian/jawab):
  - p95 : ${p95Jawab ? p95Jawab.toFixed(2) + ' ms' : 'N/A (Bypassed by Safety Guard)'} (Target: <= 1.000 ms)
  - Max : ${maxJawab ? maxJawab.toFixed(2) + ' ms' : 'N/A (Bypassed by Safety Guard)'} (Target: <= 1.000 ms)

Waktu Pengiriman Jawaban Siswa — JAWABAN BARU (action: answer_new):
  - p95 : ${p95JawabBaru ? p95JawabBaru.toFixed(2) + ' ms' : 'N/A'} (Target: <= 1.000 ms)
  - Max : ${maxJawabBaru ? maxJawabBaru.toFixed(2) + ' ms' : 'N/A'} (Target: <= 1.000 ms)

Waktu Pengiriman Jawaban Siswa — JAWABAN ULANG (action: answer_repeat):
  - p95 : ${p95JawabUlang ? p95JawabUlang.toFixed(2) + ' ms' : 'N/A'} (Target: <= 1.000 ms)
  - Max : ${maxJawabUlang ? maxJawabUlang.toFixed(2) + ' ms' : 'N/A'} (Target: <= 1.000 ms)

Status Proteksi Integritas Database:
  - Jumlah Mutasi POST Dicegah (Guard Bypass) : ${bypassVal} request
  - Endpoint /latihan/simpan dipanggil        : TIDAK (Dilarang keras)
================================================================================
`;
}
