/**
 * ============================================================================
 * HELPER PARSER INERTIA PAGE DATA (EDVORA LOAD TESTING)
 * Penanggung Jawab: Indah (Senior QA Automation Engineer)
 * ============================================================================
 * 
 * Modul ini berfungsi untuk mengurai atribut data-page dari tag HTML Inertia Blade
 * atau langsung dari respons JSON.
 * 
 * Karakteristik:
 * - Pure ECMAScript (Kompatibel dengan Node.js dan runtime Grafana k6).
 * - Tidak memiliki dependensi pada modul k6 (bebas dari import 'k6', 'k6/http').
 * - Tidak melakukan panggilan jaringan (zero network) dan tidak mengakses database.
 * - Bersifat defensif (fail-safe): mengembalikan null jika input tidak valid.
 * ============================================================================
 */

/**
 * Mengurai payload Inertia data-page dari HTML Blade dengan aman (safe parsing).
 * Menangani entitas HTML (&quot;, &amp;, &lt;, &gt;, &#039;, &#39;) secara ketat.
 * 
 * @param {string} body - HTML body string atau JSON string respons.
 * @returns {object|null} Objek data Inertia yang terurai, atau null jika gagal/tidak valid.
 */
export function parseInertiaData(body) {
    if (!body || typeof body !== 'string') return null;

    const trimmed = body.trim();
    // 1. Jika respons berupa JSON langsung (misal endpoint API atau Inertia JSON partial reload)
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) {}
    }

    // 2. Ekstraksi atribut data-page="..." atau data-page='...' dari tag HTML root Inertia
    const match = body.match(/data-page\s*=\s*(["'])([\s\S]*?)\1/);
    if (match && match[2]) {
        try {
            const unescaped = match[2]
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#039;/g, "'")
                .replace(/&#39;/g, "'");
            const parsed = JSON.parse(unescaped);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) {}
    }

    return null;
}

