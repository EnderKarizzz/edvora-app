// Sesi latihan aktif yang baru sesuai gambar
const URL_SESI = "/latihan/kerjakan/a3247b60-44f4-4d3b-bbd6-a9a1f5938192";

// Soal yang BELUM dijawab (berdasarkan navigasi: soal 1 dan 2 sudah dijawab, jadi kita pilih soal 3)
const NOMOR_SOAL = 4;

describe("Umpan Balik Instan - Latihan Fleksibel", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();

    cy.visit("/login");
    cy.get('input[type="email"]').type("sim001@simulasi.test");
    cy.get('input[type="password"]').type("SimulasiEdvora2026");
    cy.get('button[type="submit"]').click();
    cy.contains("Halo, Siswa Simulasi", { timeout: 60000 }).should("be.visible");

    cy.visit(URL_SESI);
    cy.url().should("include", "/latihan/kerjakan/");
    cy.contains(/Soal \d+ dari/, { timeout: 60000 }).should("be.visible");
  });

  it("status, kunci, dan pembahasan muncul seketika saat Simpan Jawaban ditekan", () => {
    // Pindah ke soal yang belum dijawab lewat Navigasi Soal
    cy.contains("button", new RegExp(`^${NOMOR_SOAL}$`)).click();
    cy.contains(`Soal ${NOMOR_SOAL} dari`).should("be.visible");

    // Sebelum disimpan, hasil belum tampil
    cy.contains("Kunci Jawaban").should("not.exist");

    // Pilih jawaban A, lalu simpan
    cy.contains(/^A$/).click();
    cy.contains("button", "Simpan Jawaban").click();

    // Setelah disimpan, ketiganya langsung tampil
    cy.contains(/Jawaban (Benar|Salah)/, { timeout: 30000 }).should("be.visible");
    cy.contains("Kunci Jawaban:", { timeout: 30000 }).should("be.visible");
    cy.contains("Pembahasan", { timeout: 30000 }).should("be.visible");
  });
});