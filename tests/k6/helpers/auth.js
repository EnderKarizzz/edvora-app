import http from 'k6/http';
import { check } from 'k6';
import { CONFIG } from '../config/environment.js';

/**
 * Mengambil CSRF token (XSRF-TOKEN) dari cookie jar k6
 * @param {string} url 
 * @returns {string|null} Decoded XSRF-TOKEN
 */
export function getXsrfToken(url = CONFIG.BASE_URL) {
    const jar = http.cookieJar();
    const cookies = jar.cookiesForURL(url);
    if (cookies && cookies['XSRF-TOKEN'] && cookies['XSRF-TOKEN'].length > 0) {
        return decodeURIComponent(cookies['XSRF-TOKEN'][0]);
    }
    return null;
}

/**
 * Autentikasi ketat untuk Siswa atau Editor
 * 
 * Verifikasi bertahap:
 * 1. GET /login -> Memastikan halaman login dapat diakses dan cookie session terinisialisasi.
 * 2. POST /login -> Mengirimkan kredensial dengan proteksi X-XSRF-TOKEN.
 * 3. Verifikasi respons:
 *    - Menolak HTTP 401, 410, 419 (CSRF mismatch), dan 422 (kredensial tidak cocok).
 *    - Menolak redirect yang mengarah kembali ke /login.
 * 4. Verifikasi sesi nyata:
 *    - Mengakses endpoint terproteksi (/dashboard untuk Siswa, /editor untuk Editor).
 *    - Hanya dinyatakan sukses bila endpoint terproteksi merespons HTTP 200 OK.
 * 
 * @param {string} email 
 * @param {string} password 
 * @param {'siswa'|'editor'} expectedRole 
 * @returns {{ success: boolean, statusCode: number, error: string|null, xsrfToken: string|null }}
 */
export function login(email, password, expectedRole = 'siswa') {
    const loginUrl = `${CONFIG.BASE_URL}/login`;

    if (!email || !password) {
        return {
            success: false,
            statusCode: 0,
            error: 'Kredensial email atau password belum ditentukan via Environment Variables k6.',
            xsrfToken: null,
        };
    }

    // 1. Akses halaman login untuk inisialisasi cookie session & XSRF token
    const getRes = http.get(loginUrl, {
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        tags: { name: 'AUTH_Get_Login_Page' },
    });

    const isGetOk = check(getRes, {
        '[Auth] Halaman login dapat diakses (200 OK)': (r) => r.status === 200,
    });

    if (!isGetOk) {
        return {
            success: false,
            statusCode: getRes.status,
            error: `Gagal mengakses halaman login (HTTP ${getRes.status})`,
            xsrfToken: null,
        };
    }

    let xsrfToken = getXsrfToken(CONFIG.BASE_URL);
    if (!xsrfToken && getRes.body) {
        const metaMatch = getRes.body.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
        if (metaMatch && metaMatch[1]) {
            xsrfToken = metaMatch[1];
        }
    }

    // 2. Kirim kredensial ke POST /login
    const payload = JSON.stringify({
        email: email,
        password: password,
        remember: false,
    });

    const postHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };
    if (xsrfToken) {
        postHeaders['X-XSRF-TOKEN'] = xsrfToken;
    }

    const postRes = http.post(loginUrl, payload, {
        headers: postHeaders,
        redirects: 0, // Jangan ikuti redirect otomatis agar kita menangkap status 302/422 Laravel
        tags: { name: 'AUTH_Post_Login' },
    });

    // 3. Verifikasi respons POST login
    const is302 = postRes.status === 302;
    const is200 = postRes.status === 200;
    const redirectLocation = postRes.headers['Location'] || '';
    const isRedirectToLogin = redirectLocation.includes('/login');

    const loginCredsAccepted = (is302 && !isRedirectToLogin) || (is200 && !postRes.body.includes('errors'));

    check(postRes, {
        '[Auth] Kredensial valid dan diterima (HTTP 302/200)': () => loginCredsAccepted,
        '[Auth] Tidak terjadi error validasi kredensial (Bukan 422)': (r) => r.status !== 422,
        '[Auth] Tidak terjadi error CSRF token (Bukan 419)': (r) => r.status !== 419,
    });

    if (!loginCredsAccepted) {
        let errDetail = `Login gagal dengan status HTTP ${postRes.status}`;
        try {
            const jsonBody = postRes.json();
            if (jsonBody && jsonBody.message) {
                errDetail = `${errDetail}: ${jsonBody.message}`;
            }
        } catch (_) {}
        return {
            success: false,
            statusCode: postRes.status,
            error: errDetail,
            xsrfToken: xsrfToken,
        };
    }

    // 4. Verifikasi sesi nyata ke endpoint terproteksi sesuai role
    const verifyUrl = expectedRole === 'editor' 
        ? `${CONFIG.BASE_URL}/editor` 
        : `${CONFIG.BASE_URL}/dashboard`;

    const verifyHeaders = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    const verifyRes = http.get(verifyUrl, {
        headers: verifyHeaders,
        tags: { name: 'AUTH_Verify_Protected_Endpoint' },
    });

    const isSessionValid = verifyRes.status === 200 && !verifyRes.body.includes('"message":"Unauthenticated."');

    check(verifyRes, {
        '[Auth] Session terautentikasi dapat mengakses endpoint terproteksi (200 OK)': () => isSessionValid,
        '[Auth] Bukan Unauthenticated (Bukan 401)': (r) => r.status !== 401,
    });

    const jar = http.cookieJar();
    const allCookies = jar.cookiesForURL(CONFIG.BASE_URL);
    const updatedToken = getXsrfToken(CONFIG.BASE_URL) || xsrfToken;

    return {
        success: isSessionValid,
        statusCode: verifyRes.status,
        error: isSessionValid ? null : `Sesi tidak valid saat mengakses ${verifyUrl} (HTTP ${verifyRes.status})`,
        xsrfToken: updatedToken,
        cookies: allCookies,
    };
}
