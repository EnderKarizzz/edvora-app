import http from 'k6/http';
import { check } from 'k6';
import { CONFIG } from '../config/environment.js';

/**
 * Mengambil CSRF token dari cookie Jar k6
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
 * Melakukan autentikasi (Login) ke sistem EDVORA
 * @param {string} email 
 * @param {string} password 
 * @returns {object} { success: boolean, res: Response, xsrfToken: string }
 */
export function login(email, password) {
    const loginPageUrl = `${CONFIG.BASE_URL}/login`;

    // 1. Ambil halaman login untuk memicu pembuatan session awal & XSRF cookie
    const getRes = http.get(loginPageUrl, {
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        tags: { name: 'GET_Login_Page' },
    });

    check(getRes, {
        'GET /login status 200': (r) => r.status === 200,
    });

    let xsrfToken = getXsrfToken(CONFIG.BASE_URL);

    // Fallback: coba ekstrak csrf token dari HTML jika tidak ada di cookie jar
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
        'Accept': 'text/html, application/xhtml+xml, application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };

    if (xsrfToken) {
        postHeaders['X-XSRF-TOKEN'] = xsrfToken;
    }

    // Hindari redirect otomatis agar kita dapat memverifikasi respons 302/200 dari Laravel
    const postRes = http.post(loginPageUrl, payload, {
        headers: postHeaders,
        redirects: 0,
        tags: { name: 'POST_Login' },
    });

    const isSuccess = postRes.status === 302 || postRes.status === 200 || postRes.status === 409;
    
    check(postRes, {
        'POST /login berhasil (status 200/302)': () => isSuccess,
    });

    // Perbarui token setelah login jika session berubah
    const updatedToken = getXsrfToken(CONFIG.BASE_URL) || xsrfToken;

    return {
        success: isSuccess,
        res: postRes,
        xsrfToken: updatedToken,
    };
}

