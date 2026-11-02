import { router } from '@inertiajs/react';

interface Kunjungan {
    method: string;
    url: URL;
    data: unknown;
}

// Isi ikut dibandingkan supaya dua aksi berbeda ke rute yang sama tetap terkirim.
function kunciKunjungan({ method, url, data }: Kunjungan): string {
    const isi =
        data instanceof FormData
            ? [...data.entries()].map(([nama, nilai]) => [nama, nilai instanceof File ? `${nilai.name}:${nilai.size}` : nilai])
            : data;

    return `${method} ${url.href} ${JSON.stringify(isi)}`;
}

// Inertia::location: Inertia menulis penanda ini sebelum browser pindah halaman, dan menghapusnya di halaman berikutnya.
function sedangPindahHalaman(): boolean {
    try {
        return window.sessionStorage.getItem('inertiaLocationVisit') !== null;
    } catch {
        return false;
    }
}

/**
 * Tahan kunjungan non-GET yang identik selama yang pertama masih berjalan, termasuk dari Link method="post".
 * Tanpa ini, klik kedua memutus request pertama hanya di browser: server tetap memprosesnya, balasannya dibuang,
 * dan yang tampil malah balasan klik kedua (mis. logout dua kali menghasilkan Page Expired).
 * GET tidak ditahan karena aman diulang.
 */
export function pasangCegahKirimGanda(): void {
    const berjalan = new Set<string>();

    router.on('before', (event) => {
        const { visit } = event.detail;

        if (visit.method !== 'get' && berjalan.has(kunciKunjungan(visit))) {
            event.preventDefault();
        }
    });

    router.on('start', (event) => {
        const { visit } = event.detail;

        if (visit.method !== 'get') {
            berjalan.add(kunciKunjungan(visit));
        }
    });

    // Finish juga terpanggil saat kunjungan gagal atau diputus kunjungan lain, jadi aksi bisa dicoba lagi.
    // Saat browser sedang pindah halaman, kuncinya dibiarkan: klik di sela itu masih terkirim kalau dilepas.
    router.on('finish', (event) => {
        if (!sedangPindahHalaman()) {
            berjalan.delete(kunciKunjungan(event.detail.visit));
        }
    });
}
