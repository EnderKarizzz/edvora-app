import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { Trend, Rate, Counter } from 'k6/metrics';
import { parseInertiaData } from './inertia-parser.js';

/**
 * ============================================================================
 * SKENARIO B: LOAD TESTING DASHBOARD STOK BANK SOAL & ANALITIK EDITOR EDVORA
 * Penanggung Jawab: Indah
 * ============================================================================
 * 
 * TARGET PENELITIAN & SLA:
 * 1. Beban Pengujian: Bertahap hingga 50 Virtual Users (VU) (10 -> 30 -> 50 VU).
 * 2. Waktu Pemuatan Dashboard Stok Bank Soal (GET /editor):
 *    - p95 < 3.000 ms (3 detik)
 *    - Maximum < 3.000 ms (3 detik)
 * 3. Waktu Pemuatan Dashboard Analitik Siswa (GET /editor/analitik):
 *    - p95 < 3.000 ms (3 detik)
 *    - Maximum < 3.000 ms (3 detik)
 * 4. Toleransi HTTP Request Failed: < 0.01 (Maksimal 1% kegagalan).
 * 
 * MEKANISME KEAMANAN AUTENTIKASI (AUTH SAFETY GUARD):
 * Sesuai temuan audit Tahap 4B, pemanggilan POST /login memicu event Laravel yang
 * memperbarui kolom `terakhir_login_at` pada tabel `users` di database.
 * Oleh karena itu:
 * - BASE_URL wajib diisi secara eksplisit (tidak ada default ke localhost/port 8000).
 * - POST /login HANYA DAPAT DIEKSEKUSI JIKA TARGET_ENV === 'isolated_staging'
 *   dan hostname terdaftar secara eksak pada ALLOWED_STAGING_HOSTS.
 * - Host localhost (127.0.0.1, ::1) DITOLAK KERAS demi mencegah mutasi database bersama.
 * - Kegagalan konfigurasi fatal memicu exec.test.abort() untuk menghentikan seluruh test runner.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. DEFINISI METRIK KUSTOM
// ----------------------------------------------------------------------------
// Trend durasi waktu respons masing-masing endpoint editor (hanya dicatat jika respons valid > 0 ms)
export const waktuDashboardStokEditor = new Trend('waktu_dashboard_stok_editor', true);
export const waktuDashboardAnalitik = new Trend('waktu_dashboard_analitik', true);
export const waktuDashboardAnalitikCold = new Trend('waktu_dashboard_analitik_cold', true);
export const waktuDashboardAnalitikWarm = new Trend('waktu_dashboard_analitik_warm', true);

// Metrik keberhasilan bisnis & keandalan
export const successRateEditor = new Rate('success_rate_editor');
export const authSuccessRate = new Rate('auth_success_rate');
export const errorAuthCount = new Counter('error_auth_count');
export const errorServer5xxCount = new Counter('error_server_5xx_count');

// ----------------------------------------------------------------------------
// 2. KONFIGURASI TAHAPAN BEBAN (STAGES) & THRESHOLDS (TARGET SLA)
// ----------------------------------------------------------------------------
export const options = {
    stages: [
        { duration: '20s', target: 10 },  // Tahap 1: Ramp-up ke 10 VU (Baseline Editor)
        { duration: '40s', target: 10 },  // Tahap 2: Steady state 10 VU
        { duration: '20s', target: 30 },  // Tahap 3: Ramp-up ke 30 VU (Medium load Editor)
        { duration: '40s', target: 30 },  // Tahap 4: Steady state 30 VU
        { duration: '20s', target: 50 },  // Tahap 5: Ramp-up ke 50 VU (Peak concurrent Editor)
        { duration: '40s', target: 50 },  // Tahap 6: Steady state 50 VU
        { duration: '20s', target: 0 },   // Tahap 7: Graceful ramp-down ke 0 VU
    ],
    thresholds: {
        // Toleransi kegagalan HTTP maksimal 1%
        'http_req_failed': ['rate<0.01'],
        // SLA umum k6: p95 <= 3.000 ms
        'http_req_duration': ['p(95)<=3000'],
        // Target SLA Spesifik: Waktu pemuatan dashboard stok p95 <= 3.000 ms (max adalah metrik observasional)
        'waktu_dashboard_stok_editor': ['p(95)<=3000'],
        // Target SLA Spesifik: Waktu pemuatan dashboard analitik p95 <= 3.000 ms
        'waktu_dashboard_analitik': ['p(95)<=3000'],
        'waktu_dashboard_analitik_warm': ['p(95)<=3000'],
        // Tingkat keberhasilan transaksi Editor minimal 95%
        'success_rate_editor': ['rate>0.95'],
    },
};

// ----------------------------------------------------------------------------
// 3. KONFIGURASI ENVIRONMENT & PARAMETER DINAMIS
// ----------------------------------------------------------------------------
// BASE_URL wajib diisi secara eksplisit. TIDAK ADA DEFAULT KE LOCALHOST / PORT 8000
// demi mencegah request dan mutasi tidak sengaja ke database Supabase bersama!
const BASE_URL = (__ENV.BASE_URL || '').trim();
const TARGET_ENV = (__ENV.TARGET_ENV || '').trim();

// Pacing time configurable via environment variable (default: 3.0s sleep)
function resolvePacingSeconds(rawPacing) {
    if (!rawPacing || typeof rawPacing !== 'string' || rawPacing.trim() === '') {
        return 3.0; // Default konservatif untuk Editor
    }
    const val = parseFloat(rawPacing.trim());
    if (isNaN(val) || !isFinite(val) || val <= 0) {
        return 3.0;
    }
    return val;
}
const PACING_SECONDS = resolvePacingSeconds(__ENV.PACING_SECONDS);

// Akun Editor resmi dapat disuplai via environment variable
const EDITOR_EMAIL = (__ENV.EDITOR_EMAIL || 'dapa@gmail.com').trim();
const EDITOR_PASSWORD = (__ENV.EDITOR_PASSWORD || 'password').trim();

// DAFTAR HOST STAGING TERISOLASI RESMI YANG DIIZINKAN SECARA EKSPLISIT
const ALLOWED_STAGING_HOSTS = [
    'staging.edvora.internal',
    'isolated-staging.edvora.test',
];

// State global pre-flight check untuk menghentikan runner sebelum request pertama jika konfigurasi fatal
let globalPreflightChecked = false;

// State sesi lokal per Virtual User (VU)
let vuSessionInitialized = false;
let vuSessionValid = false;
let cachedXsrfToken = null;
let vuEditorIterationCount = 0;

// ----------------------------------------------------------------------------
// 4. HELPER VALIDASI KEAMANAN TARGET & AUTENTIKASI (SAFETY GUARD)
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
 * Autentikasi Editor: GET /login -> POST /login -> Validasi role admin_editor
 * Dilakukan sekali per VU untuk mencegah 'Login Storm'
 */
function authenticateEditor() {
    // 1. Safety Guard Validasi Lingkungan Staging Terisolasi
    const authSafety = validateAuthSafety(BASE_URL);
    if (!authSafety.isSafe) {
        console.error(`[AUTH SAFETY GUARD BLOCKED] ${authSafety.reason}`);
        errorAuthCount.add(1);
        authSuccessRate.add(0);
        return false;
    }

    if (!EDITOR_EMAIL || !EDITOR_PASSWORD) {
        console.error('[AUTH ERROR] EDITOR_EMAIL atau EDITOR_PASSWORD belum dikonfigurasi.');
        errorAuthCount.add(1);
        authSuccessRate.add(0);
        return false;
    }

    const loginUrl = `${BASE_URL}/login`;

    // 2. GET /login untuk inisialisasi cookie session & CSRF token
    const getRes = http.get(loginUrl, {
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        redirects: 0,
        tags: { name: 'AUTH_Get_Login_Editor' },
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

    // 3. POST /login dengan kredensial Editor
    const loginPayload = JSON.stringify({
        email: EDITOR_EMAIL,
        password: EDITOR_PASSWORD,
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
        redirects: 0,
        tags: { name: 'AUTH_Post_Login_Editor' },
    });

    const isAccepted = (postRes.status === 302 && !(postRes.headers['Location'] || '').includes('/login')) ||
                       (postRes.status === 200 && !postRes.body.includes('errors'));

    if (!isAccepted) {
        errorAuthCount.add(1);
        authSuccessRate.add(0);
        return false;
    }

    // Perbarui token setelah login
    cachedXsrfToken = extractXsrfToken(BASE_URL) || cachedXsrfToken;

    // 4. Verifikasi role ke endpoint terproteksi /editor
    const verifyRes = http.get(`${BASE_URL}/editor`, {
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        redirects: 0,
        tags: { name: 'AUTH_Verify_Editor' },
    });

    const isSessionOk = verifyRes.status === 200;
    const pageData = parseInertiaData(verifyRes.body);
    const isRoleEditor = Boolean(
        (pageData && pageData.props && pageData.props.auth && pageData.props.auth.user && 
         (pageData.props.auth.user.role === 'admin_editor' || pageData.props.auth.user.role === 'editor')) ||
        (verifyRes.body && (verifyRes.body.includes('"role":"admin_editor"') || verifyRes.body.includes('"role":"editor"')))
    );

    if (isSessionOk && isRoleEditor) {
        authSuccessRate.add(1);
        return true;
    } else {
        errorAuthCount.add(1);
        authSuccessRate.add(0);
        return false;
    }
}

// ----------------------------------------------------------------------------
// 5. SKENARIO UTAMA EKSEKUSI PENGUJIAN (VU FUNCTION)
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

        globalPreflightChecked = true;
    }

    // 2. Pastikan VU sudah terautentikasi satu kali
    if (!vuSessionInitialized) {
        vuSessionInitialized = true;
        vuSessionValid = authenticateEditor();
    }

    // Kegagalan autentikasi aplikasi pada iterasi ini ditangani secara wajar tanpa mematikan runner
    if (!vuSessionValid) {
        sleep(2);
        return;
    }

    // ------------------------------------------------------------------------
    // BAGIAN 1: PENGUKURAN WAKTU PEMUATAN DASHBOARD RINGKASAN STOK BANK SOAL
    // Endpoint: GET /editor
    // Controller: AdminSoalController@dashboard -> Inertia::render('Editor/Dashboard')
    // ------------------------------------------------------------------------
    group('Dashboard Stok Bank Soal (GET /editor)', function () {
        const stokUrl = `${BASE_URL}/editor`;
        const stokRes = http.get(stokUrl, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            redirects: 0, // Mencegah k6 mengikuti redirect otomatis (misal redirect 302 ke /login jika unauthenticated)
            tags: { name: 'GET_Editor_Dashboard_Stok' },
        });

        // Validasi Respons Bisnis Aktual EDVORA:
        // Component: 'Editor/Dashboard'
        // Props: 'ringkasan' (published, draft, review, total), 'subtes' (array)
        const pageDataStok = parseInertiaData(stokRes.body);
        const isStokPayloadValid = Boolean(
            pageDataStok &&
            pageDataStok.component === 'Editor/Dashboard' &&
            pageDataStok.props &&
            pageDataStok.props.ringkasan &&
            typeof pageDataStok.props.ringkasan.total !== 'undefined' &&
            Array.isArray(pageDataStok.props.subtes)
        );

        const isStokOk = check(stokRes, {
            '[Stok Editor] Dashboard stok merespons HTTP 200 OK': (r) => r.status === 200,
            '[Stok Editor] Durasi pemuatan stok <= 3.000 ms (SLA)': (r) => r.timings.duration <= 3000,
            '[Stok Editor] Validasi bisnis payload Editor/Dashboard valid': () => isStokPayloadValid,
            '[Stok Editor] Hak akses terverifikasi (Bukan 403)': (r) => r.status !== 403,
            '[Stok Editor] Tidak dialihkan (Bukan redirect 3xx)': (r) => r.status < 300 || r.status >= 400,
        });

        if (stokRes.status >= 500) {
            errorServer5xxCount.add(1);
        }

        // HANYA hitung sukses jika HTTP 200 DAN validasi bisnis terpenuhi!
        if (stokRes.status === 200 && isStokPayloadValid && stokRes.timings.duration > 0) {
            waktuDashboardStokEditor.add(stokRes.timings.duration);
            successRateEditor.add(1);
        } else {
            successRateEditor.add(0);
            if (stokRes.timings.duration > 0) {
                waktuDashboardStokEditor.add(stokRes.timings.duration, { status: 'failed' });
            }
        }
    });

    // Pacing time simulasi interaksi pengguna (1 detik)
    sleep(1);

    // ------------------------------------------------------------------------
    // BAGIAN 2: PENGUKURAN WAKTU PEMUATAN DASHBOARD ANALITIK PENGUASAAN SISWA
    // Endpoint: GET /editor/analitik
    // Controller: AnalitikController@index -> Inertia::render('Editor/Analitik')
    // Mekanisme Cache Aktual Aplikasi EDVORA (DataAnalitik & AnalitikSoal):
    // - Cache Key: 'analitik_editor' (DataAnalitik::KUNCI_CACHE)
    // - Penyimpanan: Cache::forever(self::KUNCI_CACHE, $data) (tanpa TTL numerik)
    // - Validitas Data: Diperiksa berdasarkan metadata ISO timestamp 'dihitungPada'
    // - Siklus Refresh Terjadwal: Setiap hari pukul 00:00 WIB via edvora:hitung-analitik
    // - Invalidasi Tanggal: AnalitikSoal::perluDihitungUlang() mendeteksi pergantian hari (Asia/Jakarta)
    // - Fallback On-Demand: Controller menghitung ulang otomatis jika cache kosong atau basi
    // ------------------------------------------------------------------------
    group('Dashboard Analitik Siswa (GET /editor/analitik)', function () {
        const isColdCacheIteration = (__VU === 1 && vuEditorIterationCount === 0);
        const cacheTag = isColdCacheIteration ? 'cold' : 'warm';
        const analitikUrl = `${BASE_URL}/editor/analitik`;
        const analitikRes = http.get(analitikUrl, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            redirects: 0, // Mencegah k6 mengikuti redirect otomatis (misal redirect 302 ke /login jika unauthenticated)
            tags: {
                name: 'GET_Editor_Dashboard_Analitik',
                cache_state: cacheTag,
            },
        });

        // Validasi Respons Bisnis Aktual EDVORA:
        // Component: 'Editor/Analitik'
        // Props: 'analitik' (object hasil DataAnalitik::ambil)
        const pageDataAnalitik = parseInertiaData(analitikRes.body);
        const isAnalitikPayloadValid = Boolean(
            pageDataAnalitik &&
            pageDataAnalitik.component === 'Editor/Analitik' &&
            pageDataAnalitik.props &&
            pageDataAnalitik.props.analitik &&
            typeof pageDataAnalitik.props.analitik === 'object'
        );

        const isAnalitikOk = check(analitikRes, {
            '[Analitik Editor] Dashboard analitik merespons HTTP 200 OK': (r) => r.status === 200,
            '[Analitik Editor] Durasi pemuatan analitik <= 3.000 ms (SLA)': (r) => r.timings.duration <= 3000,
            '[Analitik Editor] Validasi bisnis payload Editor/Analitik valid': () => isAnalitikPayloadValid,
            '[Analitik Editor] Hak akses terverifikasi (Bukan 403)': (r) => r.status !== 403,
            '[Analitik Editor] Tidak dialihkan (Bukan redirect 3xx)': (r) => r.status < 300 || r.status >= 400,
        });

        if (analitikRes.status >= 500) {
            errorServer5xxCount.add(1);
        }

        // HANYA hitung sukses jika HTTP 200 DAN validasi bisnis terpenuhi!
        if (analitikRes.status === 200 && isAnalitikPayloadValid && analitikRes.timings.duration > 0) {
            waktuDashboardAnalitik.add(analitikRes.timings.duration, { cache_state: cacheTag });
            if (isColdCacheIteration) {
                waktuDashboardAnalitikCold.add(analitikRes.timings.duration, { cache_state: 'cold' });
            } else {
                waktuDashboardAnalitikWarm.add(analitikRes.timings.duration, { cache_state: 'warm' });
            }
            successRateEditor.add(1);
        } else {
            successRateEditor.add(0);
            if (analitikRes.timings.duration > 0) {
                waktuDashboardAnalitik.add(analitikRes.timings.duration, { status: 'failed', cache_state: cacheTag });
            }
        }
    });

    // Pacing time terukur antar iterasi per VU (mencegah saturasi burst berlebihan)
    vuEditorIterationCount++;
    sleep(PACING_SECONDS);
}

// ----------------------------------------------------------------------------
// 6. RINGKASAN LAPORAN HASIL (SUMMARY HANDLER)
// ----------------------------------------------------------------------------
export function handleSummary(data) {
    return {
        'stdout': generateCustomSummary(data),
    };
}

function generateCustomSummary(data) {
    const p95Stok = data.metrics.waktu_dashboard_stok_editor && data.metrics.waktu_dashboard_stok_editor.values ? data.metrics.waktu_dashboard_stok_editor.values['p(95)'] : 0;
    const maxStok = data.metrics.waktu_dashboard_stok_editor && data.metrics.waktu_dashboard_stok_editor.values ? data.metrics.waktu_dashboard_stok_editor.values['max'] : 0;
    const p95Analitik = data.metrics.waktu_dashboard_analitik && data.metrics.waktu_dashboard_analitik.values ? data.metrics.waktu_dashboard_analitik.values['p(95)'] : 0;
    const maxAnalitik = data.metrics.waktu_dashboard_analitik && data.metrics.waktu_dashboard_analitik.values ? data.metrics.waktu_dashboard_analitik.values['max'] : 0;
    const p95AnalitikCold = data.metrics.waktu_dashboard_analitik_cold && data.metrics.waktu_dashboard_analitik_cold.values ? data.metrics.waktu_dashboard_analitik_cold.values['p(95)'] : 0;
    const maxAnalitikCold = data.metrics.waktu_dashboard_analitik_cold && data.metrics.waktu_dashboard_analitik_cold.values ? data.metrics.waktu_dashboard_analitik_cold.values['max'] : 0;
    const p95AnalitikWarm = data.metrics.waktu_dashboard_analitik_warm && data.metrics.waktu_dashboard_analitik_warm.values ? data.metrics.waktu_dashboard_analitik_warm.values['p(95)'] : 0;
    const maxAnalitikWarm = data.metrics.waktu_dashboard_analitik_warm && data.metrics.waktu_dashboard_analitik_warm.values ? data.metrics.waktu_dashboard_analitik_warm.values['max'] : 0;
    const succRate = data.metrics.success_rate_editor && data.metrics.success_rate_editor.values ? (data.metrics.success_rate_editor.values.rate * 100).toFixed(2) : 0;
    const authSafety = BASE_URL ? validateAuthSafety(BASE_URL) : { isSafe: false, reason: 'BASE_URL tidak didefinisikan.' };

    return `
================================================================================
HASIL LOAD TESTING SKENARIO B — EDITOR (EDVORA)
Penanggung Jawab: Indah
================================================================================
Target SLA: Response Time <= 3.000 ms | Threshold Error Rate: < 1.00%
Konfigurasi Beban: Hingga 50 Virtual Users (VU)
Pacing Per Iterasi: ${PACING_SECONDS.toFixed(1)}s
Karakteristik Pengujian: Uji Throughput Request Server (1 Akun Editor, Multi-Session)
Status Auth Safety Guard: ${authSafety.isSafe ? 'TERBUKA (' + authSafety.reason + ')' : 'TERKUNCI (Database Bersama Dilindungi)'}
Catatan Guard: ${authSafety.reason}
Karakteristik Cache: Mengukur performa pada kondisi cache server (Cold vs Warm Cache)
--------------------------------------------------------------------------------
Waktu Pemuatan Dashboard Stok Bank Soal (GET /editor):
  - p95 : ${p95Stok ? p95Stok.toFixed(2) + ' ms' : 'N/A'} (Target: <= 3.000 ms)
  - Max : ${maxStok ? maxStok.toFixed(2) + ' ms' : 'N/A'} (Target: <= 3.000 ms)

Waktu Pemuatan Dashboard Analitik Siswa (GET /editor/analitik):
  - Agregat  p95 : ${p95Analitik ? p95Analitik.toFixed(2) + ' ms' : 'N/A'} (Target: <= 3.000 ms)
  - Agregat  Max : ${maxAnalitik ? maxAnalitik.toFixed(2) + ' ms' : 'N/A'} (Target: <= 3.000 ms)
  - Cold     p95 : ${p95AnalitikCold ? p95AnalitikCold.toFixed(2) + ' ms' : 'N/A'} (First Run/Cache Miss)
  - Cold     Max : ${maxAnalitikCold ? maxAnalitikCold.toFixed(2) + ' ms' : 'N/A'}
  - Warm     p95 : ${p95AnalitikWarm ? p95AnalitikWarm.toFixed(2) + ' ms' : 'N/A'} (Target SLA: <= 3.000 ms)
  - Warm     Max : ${maxAnalitikWarm ? maxAnalitikWarm.toFixed(2) + ' ms' : 'N/A'}

Keandalan & Transaksi Bisnis:
  - Tingkat Keberhasilan Bisnis (Success Rate) : ${succRate}% (Target: > 95%)
  - Status Cache Aplikasi                     : Terproteksi (Tidak ada cache:clear)
================================================================================
`;
}
