const SUBTES = "PPU"; // subtes yang antrean remedialnya terisi

// Pilih satu opsi jawaban, apa pun bentuknya (huruf A-E, lingkaran, atau teks)
const pilihJawabanPertama = () => {
  cy.get("body").then(($b) => {
    const $input = $b.find(
      'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"]'
    );
    if ($input.length) {
      cy.wrap($input.first()).click({ force: true });
      return;
    }

    // kalau opsi berupa tombol: ambil tombol yang bukan tombol navigasi/aksi
    const $opsi = $b.find("button").filter((i, el) => {
      const t = el.textContent.trim();
      return (
        t.length > 3 &&
        !/Sebelumnya|Lanjutkan|Keluar Halaman|Hint|Simpan Jawaban/.test(t)
      );
    });
    if ($opsi.length) {
      cy.wrap($opsi.first()).click();
      return;
    }

    throw new Error(
      "Opsi jawaban tidak ditemukan. Inspect satu opsi jawaban dan kirim kodenya."
    );
  });
};

describe("Umpan Balik Instan - Remedial", () => {
  beforeEach(() => {
    cy.session("siswa", () => {
      cy.visit("/login");
      cy.get('input[type="email"]').type("sim001@simulasi.test");
      cy.get('input[type="password"]').type("SimulasiEdvora2026");
      cy.get('button[type="submit"]').click();
      cy.contains("Halo, Siswa Simulasi", { timeout: 60000 }).should("be.visible");
    });

    cy.visit(`/latihan/subtes/${SUBTES}`);
    cy.contains(/^Remedial$/, { timeout: 60000 }).click();

    cy.contains(/Mode Remedial|Remedial Belum Tersedia/, { timeout: 30000 });
    cy.get("body").then(($b) => {
      if ($b.text().includes("Remedial Belum Tersedia")) {
        throw new Error(
          `Antrean remedial subtes ${SUBTES} kosong. Jawab salah beberapa soal di Mode Fleksibel subtes ini, lalu ulangi.`
        );
      }
    });

    cy.contains("button, a", /Mulai Mengerjakan/).click();
    cy.contains("Simpan Jawaban", { timeout: 120000 }).should("be.visible");
  });

  it("status, kunci, dan pembahasan muncul seketika saat Simpan Jawaban ditekan di Remedial", () => {
    // sebelum disimpan, hasil belum tampil
    cy.contains("Kunci Jawaban").should("not.exist");

    // pilih satu jawaban, lalu simpan (tombol aktif setelah ada pilihan)
    pilihJawabanPertama();
    cy.contains("button", "Simpan Jawaban").should("not.be.disabled").click();

    // setelah disimpan, ketiganya langsung tampil
    cy.contains(/Jawaban (Benar|Salah)/, { timeout: 30000 }).should("be.visible");
    cy.contains("Kunci Jawaban:", { timeout: 30000 }).should("be.visible");
    cy.contains("Pembahasan", { timeout: 30000 }).should("be.visible");
  });
});