import http from 'k6/http';
import { check, fail } from 'k6';
import { Trend } from 'k6/metrics';
import { sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || '').replace(/\/$/, '');
const USERS_FILE = __ENV.ANSWER_USERS_FILE || 'tests/load/answer-users.json';
const MAX_VUS = Number(__ENV.MAX_VUS || 100);
const answerTime = new Trend('answer_response_ms', true);
const users = JSON.parse(open(USERS_FILE));

if (!BASE_URL) throw new Error('Isi BASE_URL saat menjalankan k6.');
if (!Array.isArray(users) || users.length < MAX_VUS) {
  throw new Error(`File ${USERS_FILE} harus berisi minimal ${MAX_VUS} baris pengguna/sesi unik.`);
}

for (let i = 0; i < MAX_VUS; i++) {
  const row = users[i];
  if (!row.email || !row.password || !row.sesiId || !row.soalId || !row.jawaban) {
    throw new Error(`Data pengguna ke-${i + 1} tidak lengkap.`);
  }
}

export const options = {
  stages: [
    { duration: '1m', target: Math.min(100, MAX_VUS) },
    { duration: '30s', target: Math.min(100, MAX_VUS) },
    { duration: '1m', target: MAX_VUS },
    { duration: '30s', target: MAX_VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    answer_response_ms: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

function xsrfToken(jar) {
  const values = jar.cookiesForURL(`${BASE_URL}/`)['XSRF-TOKEN'];
  if (!values || !values.length) return null;
  return decodeURIComponent(values[0]);
}

function login(user, jar) {
  const page = http.get(`${BASE_URL}/login`, { redirects: 0, tags: { name: 'GET /login' } });
  if (page.status !== 200) fail(`Halaman login gagal (HTTP ${page.status}).`);

  const token = xsrfToken(jar);
  if (!token) fail('Cookie XSRF-TOKEN tidak ditemukan.');

  const response = http.post(`${BASE_URL}/login`, {
    email: user.email,
    password: user.password,
  }, {
    redirects: 0,
    headers: {
      Accept: 'text/html',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': token,
    },
    tags: { name: 'POST /login' },
  });

  if (response.status !== 302 && response.status !== 303) {
    fail(`Login ${user.email} gagal (HTTP ${response.status}); cek akun uji dan CSRF.`);
  }
}

export default function () {
  // Setiap VU mengirim tepat satu jawaban. Ini menghindari pengiriman ulang jawaban
  // yang sama dan menjaga setiap jawaban terhubung ke sesi serta akun yang berbeda.
  if (__ITER > 0) {
    sleep(3600);
    return;
  }

  const user = users[__VU - 1];
  const jar = http.cookieJar();
  login(user, jar);

  const payload = {
    sesiId: user.sesiId,
    soalId: user.soalId,
    opsiIds: user.jawaban.opsiIds || [],
    jawabanIsian: user.jawaban.jawabanIsian ?? null,
    pilihanKolom: user.jawaban.pilihanKolom ?? null,
  };

  const token = xsrfToken(jar);
  const response = http.post(`${BASE_URL}/latihan/ujian/jawab`, JSON.stringify(payload), {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': token,
    },
    tags: { name: 'POST /latihan/ujian/jawab' },
  });

  answerTime.add(response.timings.duration);
  check(response, {
    'jawaban berhasil diproses': (r) => r.status === 200,
    'server mengembalikan JSON': (r) => (r.headers['Content-Type'] || '').includes('application/json'),
  });

  sleep(3600);
}
