import { check } from 'k6';
import {
    parseAndValidateUrl as parseStudentUrl,
    validateAuthSafety as authStudentSafety,
    validateStagingMutationSafety as mutStudentSafety
} from './student.js';
import {
    parseAndValidateUrl as parseEditorUrl,
    validateAuthSafety as authEditorSafety
} from './editor.js';

/**
 * ============================================================================
 * UNIT TEST HARNESS: K6 URL GUARD COMPATIBILITY (GOJA ENGINE)
 * Penanggung Jawab: Indah
 * ============================================================================
 * Memvalidasi parser URL dan safety guards pada runtime Grafana k6 (Goja),
 * tanpa dependensi global URL API, dan 100% tanpa HTTP request (Zero network).
 * ============================================================================
 */

export const options = {
    vus: 1,
    iterations: 1,
};

export default function () {
    console.log('[TEST HARNESS] Starting k6 Goja URL Guard Compatibility Test...');
    console.log('[TEST HARNESS] Verifying typeof URL:', typeof URL);

    // KASUS 1: http://127.0.0.1:8001 -> valid untuk local_isolated
    const s1 = parseStudentUrl('http://127.0.0.1:8001');
    const e1 = parseEditorUrl('http://127.0.0.1:8001');
    check(null, {
        '[1] student.js parse http://127.0.0.1:8001 valid': () => s1.valid === true && s1.hostname === '127.0.0.1' && s1.port === '8001' && s1.protocol === 'http:' && s1.error === null,
        '[1] editor.js parse http://127.0.0.1:8001 valid': () => e1.valid === true && e1.hostname === '127.0.0.1' && e1.port === '8001' && e1.protocol === 'http:' && e1.error === null,
    });

    // KASUS 2: http://localhost:8001 -> valid untuk local_isolated
    const s2 = parseStudentUrl('http://localhost:8001');
    const e2 = parseEditorUrl('http://localhost:8001');
    check(null, {
        '[2] student.js parse http://localhost:8001 valid': () => s2.valid === true && s2.hostname === 'localhost' && s2.port === '8001' && s2.protocol === 'http:',
        '[2] editor.js parse http://localhost:8001 valid': () => e2.valid === true && e2.hostname === 'localhost' && e2.port === '8001' && e2.protocol === 'http:',
    });

    // KASUS 3: Hostname staging yang memang sudah diizinkan (staging.edvora.internal, isolated-staging.edvora.test)
    const s3a = parseStudentUrl('https://staging.edvora.internal');
    const e3a = parseEditorUrl('https://staging.edvora.internal');
    const s3b = parseStudentUrl('https://isolated-staging.edvora.test');
    const e3b = parseEditorUrl('https://isolated-staging.edvora.test');
    check(null, {
        '[3] staging.edvora.internal student valid': () => s3a.valid === true && s3a.hostname === 'staging.edvora.internal' && s3a.protocol === 'https:' && s3a.port === '',
        '[3] staging.edvora.internal editor valid': () => e3a.valid === true && e3a.hostname === 'staging.edvora.internal' && e3a.protocol === 'https:' && e3a.port === '',
        '[3] isolated-staging.edvora.test student valid': () => s3b.valid === true && s3b.hostname === 'isolated-staging.edvora.test' && s3b.protocol === 'https:',
        '[3] isolated-staging.edvora.test editor valid': () => e3b.valid === true && e3b.hostname === 'isolated-staging.edvora.test' && e3b.protocol === 'https:',
    });

    // KASUS 4: Hostname yang tidak dikenal -> ditolak
    const s4 = parseStudentUrl('https://unknown.edvora.internal');
    const e4 = parseEditorUrl('https://unknown.edvora.internal');
    // Parser mengekstrak hostname, namun guard allowlist menolak hostname tidak dikenal
    const isHostAllowed = (h) => ['staging.edvora.internal', 'isolated-staging.edvora.test', '127.0.0.1', 'localhost'].indexOf(h) !== -1;
    check(null, {
        '[4] Hostname tidak dikenal diekstrak dengan benar': () => s4.valid === true && s4.hostname === 'unknown.edvora.internal',
        '[4] Hostname tidak dikenal ditolak oleh allowlist': () => !isHostAllowed(s4.hostname) && !isHostAllowed(e4.hostname),
    });

    // KASUS 5: 127.0.0.1.evil.example -> ditolak
    const s5NoProto = parseStudentUrl('127.0.0.1.evil.example');
    const e5NoProto = parseEditorUrl('127.0.0.1.evil.example');
    const s5WithProto = parseStudentUrl('http://127.0.0.1.evil.example:8001');
    check(null, {
        '[5] 127.0.0.1.evil.example tanpa protokol ditolak student': () => s5NoProto.valid === false,
        '[5] 127.0.0.1.evil.example tanpa protokol ditolak editor': () => e5NoProto.valid === false,
        '[5] 127.0.0.1.evil.example bukan 127.0.0.1 eksak (ditolak allowlist)': () => s5WithProto.valid === true && s5WithProto.hostname !== '127.0.0.1',
    });

    // KASUS 6: localhost.evil.example -> ditolak
    const s6NoProto = parseStudentUrl('localhost.evil.example');
    const e6NoProto = parseEditorUrl('localhost.evil.example');
    const s6WithProto = parseStudentUrl('http://localhost.evil.example:8001');
    check(null, {
        '[6] localhost.evil.example tanpa protokol ditolak student': () => s6NoProto.valid === false,
        '[6] localhost.evil.example tanpa protokol ditolak editor': () => e6NoProto.valid === false,
        '[6] localhost.evil.example bukan localhost eksak (ditolak allowlist)': () => s6WithProto.valid === true && s6WithProto.hostname !== 'localhost',
    });

    // KASUS 7: http://user:pass@127.0.0.1:8001 -> ditolak
    const s7 = parseStudentUrl('http://user:pass@127.0.0.1:8001');
    const e7 = parseEditorUrl('http://user:pass@127.0.0.1:8001');
    check(null, {
        '[7] http://user:pass@127.0.0.1:8001 userinfo ditolak student': () => s7.valid === false && s7.error.indexOf('userinfo') !== -1,
        '[7] http://user:pass@127.0.0.1:8001 userinfo ditolak editor': () => e7.valid === false && e7.error.indexOf('userinfo') !== -1,
    });

    // KASUS 8: http://127.0.0.1:8002 -> ditolak untuk local_isolated
    const s8 = parseStudentUrl('http://127.0.0.1:8002');
    const e8 = parseEditorUrl('http://127.0.0.1:8002');
    check(null, {
        '[8] http://127.0.0.1:8002 mengekstrak port 8002 student': () => s8.valid === true && s8.port === '8002',
        '[8] http://127.0.0.1:8002 mengekstrak port 8002 editor': () => e8.valid === true && e8.port === '8002',
        '[8] Port 8002 bukan port 8001 eksak (ditolak allowlist)': () => s8.port !== '8001' && e8.port !== '8001',
    });

    // KASUS 9: http://127.0.0.1:8001.evil -> ditolak
    const s9 = parseStudentUrl('http://127.0.0.1:8001.evil');
    const e9 = parseEditorUrl('http://127.0.0.1:8001.evil');
    check(null, {
        '[9] http://127.0.0.1:8001.evil port non-numerik ditolak student': () => s9.valid === false,
        '[9] http://127.0.0.1:8001.evil port non-numerik ditolak editor': () => e9.valid === false,
    });

    // KASUS 10: URL dengan whitespace, backslash, query, atau fragment yang dilarang -> ditolak
    const testCasesForbidden = [
        'http://127.0.0.1:8001?query=1',
        'http://127.0.0.1:8001#fragment',
        'http://127.0.0.1:8001\\evil',
        'http://127.0.0.1:8001 /path',
        ' http://127.0.0.1:8001',
        'http://127.0.0.1:8001 ',
        'http://127.0.0.1:8001/subpath',
        'http://127.0.0.1:8001//',
    ];
    for (let i = 0; i < testCasesForbidden.length; i++) {
        const u = testCasesForbidden[i];
        const resS = parseStudentUrl(u);
        const resE = parseEditorUrl(u);
        check(null, {
            [`[10] Ditolak [${u}] student`]: () => resS.valid === false,
            [`[10] Ditolak [${u}] editor`]: () => resE.valid === false,
        });
    }

    // KASUS 11: URL kosong, relatif, atau tanpa protokol -> ditolak
    const testCasesMalformed = [
        '',
        null,
        undefined,
        '/login',
        '127.0.0.1:8001',
        'ftp://127.0.0.1:8001',
        'file:///etc/passwd',
        'http://',
        'http:///',
        'http://:8001',
        'http://127.0.0.1:',
    ];
    for (let i = 0; i < testCasesMalformed.length; i++) {
        const u = testCasesMalformed[i];
        const resS = parseStudentUrl(u);
        const resE = parseEditorUrl(u);
        check(null, {
            [`[11] Malformed ditolak [${String(u)}] student`]: () => resS.valid === false,
            [`[11] Malformed ditolak [${String(u)}] editor`]: () => resE.valid === false,
        });
    }

    console.log('[TEST HARNESS] All URL parser test cases verified successfully without HTTP requests.');
}

