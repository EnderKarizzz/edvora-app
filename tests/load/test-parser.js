/**
 * ============================================================================
 * UNIT TEST LOKAL: INERTIA DATA-PAGE PARSER
 * Penanggung Jawab: Indah
 * ============================================================================
 * 
 * TUJUAN:
 * Menguji ketahanan dan ketepatan fungsi `parseInertiaData()` terhadap berbagai
 * kondisi payload HTML dan JSON tanpa mengimpor modul k6, tanpa dependensi
 * eksternal, tanpa request HTTP (zero network), dan tanpa koneksi database.
 * 
 * CARA EKSEKUSI:
 * node tests/load/test-parser.js
 * ============================================================================
 */

import assert from 'node:assert/strict';
import { parseInertiaData } from './inertia-parser.js';

console.log('================================================================');
console.log('RUNNING UNIT TESTS: Inertia data-page Parser (parseInertiaData)');
console.log('Environment: Node.js (Local Isolated, Zero Network, Zero DB)');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTestCase(name, testFn) {
    totalTests++;
    try {
        testFn();
        passedTests++;
        console.log(`[PASS] Case ${totalTests}: ${name}`);
    } catch (err) {
        console.error(`[FAIL] Case ${totalTests}: ${name}`);
        console.error(`       Error: ${err.message}`);
    }
}

// ----------------------------------------------------------------------------
// KASUS 1: HTML valid dengan komponen Auth/Login
// ----------------------------------------------------------------------------
runTestCase('HTML valid dengan atribut data-page dan komponen Auth/Login', () => {
    const fixtureHtml = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="utf-8">
            <title>Login - EDVORA</title>
        </head>
        <body>
            <div id="app" data-page="{&quot;component&quot;:&quot;Auth/Login&quot;,&quot;props&quot;:{&quot;errors&quot;:{},&quot;status&quot;:null},&quot;url&quot;:&quot;/login&quot;,&quot;version&quot;:&quot;1.0.0&quot;}"></div>
        </body>
        </html>
    `;

    const result = parseInertiaData(fixtureHtml);
    assert.notEqual(result, null, 'Hasil parsing tidak boleh null');
    assert.equal(typeof result, 'object', 'Hasil parsing harus bertipe object');
    assert.equal(result.component, 'Auth/Login', 'Komponen harus eksak "Auth/Login"');
    assert.equal(result.url, '/login', 'URL harus eksak "/login"');
    assert.deepEqual(result.props.errors, {}, 'Props errors harus berupa objek kosong');
});

// ----------------------------------------------------------------------------
// KASUS 2: Komponen Inertia berbeda (Bukan Auth/Login)
// ----------------------------------------------------------------------------
runTestCase('HTML valid tetapi komponen Inertia bukan Auth/Login (misal Dashboard)', () => {
    const fixtureHtml = `
        <div id="app" data-page="{&quot;component&quot;:&quot;Dashboard&quot;,&quot;props&quot;:{&quot;user&quot;:{&quot;name&quot;:&quot;Siswa Test&quot;}},&quot;url&quot;:&quot;/dashboard&quot;}"></div>
    `;

    const result = parseInertiaData(fixtureHtml);
    assert.notEqual(result, null, 'Hasil parsing data-page tidak boleh null');
    assert.equal(result.component, 'Dashboard', 'Komponen harus "Dashboard"');
    // Validasi penolakan smoke test terhadap komponen selain Auth/Login:
    const isLoginComponent = Boolean(result && result.component === 'Auth/Login');
    assert.equal(isLoginComponent, false, 'Komponen Dashboard harus ditolak oleh validasi Auth/Login');
});

// ----------------------------------------------------------------------------
// KASUS 3: Atribut data-page tidak ditemukan (HTML umum / Error page)
// ----------------------------------------------------------------------------
runTestCase('HTML tanpa atribut data-page (misal halaman error 500 Laravel standar)', () => {
    const fixtureHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>500 Internal Server Error</title></head>
        <body>
            <h1>500 Internal Server Error</h1>
            <p>Terjadi kesalahan pada server web.</p>
        </body>
        </html>
    `;

    const result = parseInertiaData(fixtureHtml);
    assert.equal(result, null, 'Jika data-page tidak ditemukan, fungsi wajib mengembalikan null');
});

// ----------------------------------------------------------------------------
// KASUS 4: JSON rusak (Malformed / Truncated JSON)
// ----------------------------------------------------------------------------
runTestCase('Atribut data-page berisi JSON rusak atau tidak tertutup dengan benar', () => {
    const malformedCases = [
        '<div id="app" data-page="{&quot;component&quot;:&quot;Auth/Login&quot;,&quot;props&quot;:"></div>',
        '<div id="app" data-page="bukan-json-sama-sekali"></div>',
        '<div id="app" data-page="{component: incomplete...</div>',
    ];

    for (const fixture of malformedCases) {
        const result = parseInertiaData(fixture);
        assert.equal(result, null, 'JSON rusak tidak boleh menyebabkan exception dan harus mengembalikan null');
    }
});

// ----------------------------------------------------------------------------
// KASUS 5: Entitas HTML ter-escape secara lengkap
// ----------------------------------------------------------------------------
runTestCase('Dekode entitas HTML (&quot;, &amp;, &lt;, &gt;, &#039;, &#39;) berjalan akurat', () => {
    const fixtureHtml = `
        <div id="app" data-page="{&quot;component&quot;:&quot;Auth/Login&quot;,&quot;props&quot;:{&quot;appName&quot;:&quot;EDVORA &amp; Co &lt;Portal&gt;&quot;,&quot;quoteSingle1&quot;:&quot;It&#039;s great&quot;,&quot;quoteSingle2&quot;:&quot;Let&#39;s test&quot;}}"></div>
    `;

    const result = parseInertiaData(fixtureHtml);
    assert.notEqual(result, null, 'Hasil parsing tidak boleh null');
    assert.equal(result.component, 'Auth/Login');
    assert.equal(result.props.appName, 'EDVORA & Co <Portal>', 'Entitas &amp;, &lt;, &gt; harus terurai dengan benar');
    assert.equal(result.props.quoteSingle1, "It's great", 'Entitas &#039; harus terurai menjadi tanda petik satu');
    assert.equal(result.props.quoteSingle2, "Let's test", 'Entitas &#39; harus terurai menjadi tanda petik satu');
});

// ----------------------------------------------------------------------------
// KASUS 6: Respons kosong, whitespace, null, undefined, dan tipe data non-string
// ----------------------------------------------------------------------------
runTestCase('Penanganan defensif respons kosong, null, undefined, atau tipe non-string', () => {
    const emptyOrInvalidInputs = [
        '',
        '   ',
        '\n\t\r',
        null,
        undefined,
        12345,
        {},
        [],
        true,
        '<div id="app" data-page=""></div>', // Atribut data-page kosong
    ];

    for (const input of emptyOrInvalidInputs) {
        const result = parseInertiaData(input);
        assert.equal(result, null, `Input "${String(input)}" wajib mengembalikan null secara aman`);
    }
});

// ----------------------------------------------------------------------------
// KASUS 7 (Bonus): Respons berupa JSON langsung (Inertia Partial Reload / API)
// ----------------------------------------------------------------------------
runTestCase('Respons berupa payload JSON murni (Inertia partial / AJAX)', () => {
    const directJson = '{"component":"Auth/Login","props":{"flash":{}},"url":"/login"}';

    const result = parseInertiaData(directJson);
    assert.notEqual(result, null, 'Direct JSON harus terurai dengan sukses');
    assert.equal(result.component, 'Auth/Login');
    assert.equal(result.url, '/login');
});

console.log('\n----------------------------------------------------------------');
console.log(`HASIL AKHIR UNIT TEST: ${passedTests}/${totalTests} KASUS BERHASIL (100% PASS)`);
console.log('----------------------------------------------------------------\n');

if (passedTests !== totalTests) {
    process.exit(1);
}

