import http from 'k6/http';
import { check, fail } from 'k6';
import { Trend } from 'k6/metrics';
import { sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || '').replace(/\/$/, '');
const EDITOR_EMAIL = __ENV.EDITOR_EMAIL || '';
const EDITOR_PASSWORD = __ENV.EDITOR_PASSWORD || '';
const MAX_VUS = Number(__ENV.MAX_VUS || 500);
const dashboardTime = new Trend('editor_dashboard_ms', true);

if (!BASE_URL || !EDITOR_EMAIL || !EDITOR_PASSWORD) {
  throw new Error('Isi BASE_URL, EDITOR_EMAIL, dan EDITOR_PASSWORD saat menjalankan k6.');
}

export const options = {
  stages: [
    { duration: '1m', target: Math.min(100, MAX_VUS) },
    { duration: '3m', target: Math.min(100, MAX_VUS) },
    { duration: '1m', target: MAX_VUS },
    { duration: '3m', target: MAX_VUS },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    editor_dashboard_ms: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

function xsrfToken(jar) {
  const cookies = jar.cookiesForURL(`${BASE_URL}/`);
  const values = cookies['XSRF-TOKEN'];
  if (!values || !values.length) return null;
  return decodeURIComponent(values[0]);
}

export function setup() {
  const jar = http.cookieJar();
  const loginPage = http.get(`${BASE_URL}/login`, { redirects: 0, tags: { name: 'GET /login' } });
  if (loginPage.status !== 200) fail(`Halaman login gagal dibuka (HTTP ${loginPage.status}).`);

  const token = xsrfToken(jar);
  if (!token) fail('Cookie XSRF-TOKEN tidak ditemukan setelah membuka halaman login.');

  const login = http.post(`${BASE_URL}/login`, {
    email: EDITOR_EMAIL,
    password: EDITOR_PASSWORD,
  }, {
    redirects: 0,
    headers: {
      Accept: 'text/html',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': token,
    },
    tags: { name: 'POST /login' },
  });

  if (login.status !== 302 && login.status !== 303) {
    fail(`Login Editor gagal (HTTP ${login.status}); periksa akun, password, dan konfigurasi CSRF.`);
  }

  const cookies = jar.cookiesForURL(`${BASE_URL}/`);
  if (!Object.keys(cookies).length) fail('Cookie sesi tidak tersedia setelah login.');

  const checkAccess = http.get(`${BASE_URL}/editor/analitik`, {
    redirects: 0,
    headers: { Accept: 'text/html' },
    tags: { name: 'GET /editor/analitik setup' },
  });
  if (checkAccess.status !== 200) {
    fail(`Akun tidak dapat membuka analitik Editor (HTTP ${checkAccess.status}); pastikan role admin_editor.`);
  }

  return { cookies };
}

export default function (data) {
  const jar = http.cookieJar();
  for (const [name, values] of Object.entries(data.cookies)) {
    for (const value of values) jar.set(`${BASE_URL}/`, name, value);
  }

  const response = http.get(`${BASE_URL}/editor/analitik`, {
    headers: { Accept: 'text/html' },
    tags: { name: 'GET /editor/analitik' },
  });

  dashboardTime.add(response.timings.duration);
  check(response, {
    'analitik Editor berhasil dimuat': (r) => r.status === 200,
    'respons halaman analitik dikenali': (r) => (r.headers['Content-Type'] || '').includes('text/html'),
  });

  sleep(1);
}
