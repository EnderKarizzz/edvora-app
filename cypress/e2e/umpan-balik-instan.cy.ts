// Sesi latihan yang sedang berjalan milik akun sim001 (dari alamat di Chrome-mu)
const URL_SESI = "/latihan/kerjakan/a323fdeb-e556-4777-a17a-4a287e33fe3a";

// Soal yang BELUM dijawab. Soal 1 dan 2 sudah dijawab; naikkan angka ini di tiap percobaan (3, 4, 5, ...)
const NOMOR_SOAL = 3;

describe("Umpan Balik Instan - Latihan Fleksibel", () => {
  beforeEach(() => {
    cy.session("siswa", () => {
      cy.visit("/login");
      cy.get('input[type="email"]').type("sim001@simulasi.test");
      cy.get('input[type="password"]').type("SimulasiEdvora2026");
      cy.get('button[type="submit"]').click();
      cy.contains("Halo, Siswa Simulasi", { timeout: 60000 }).should("be.visible");
    });

    cy.visit(URL_SESI);
    cy.contains(/Soal \d+ dari/, { timeout: 60000 }).should("be.visible");
  });

  it("status, kunci, dan pembahasan muncul seketika saat Simpan Jawaban ditekan", () => {
    // pindah ke soal yang belum dijawab lewat Navigasi Soal
    cy.contains("button", new RegExp(`^${NOMOR_SOAL}$`)).click();
    cy.contains(`Soal ${NOMOR_SOAL} dari`).should("be.visible");

    // sebelum disimpan, hasil belum tampil
    cy.contains("Kunci Jawaban").should("not.exist");

    // pilih jawaban A, lalu simpan
    cy.contains(/^A$/).click();
    cy.contains("button", "Simpan Jawaban").click();

    // setelah disimpan, ketiganya langsung tampil
    cy.contains(/Jawaban (Benar|Salah)/, { timeout: 30000 }).should("be.visible");
    cy.contains("Kunci Jawaban:", { timeout: 30000 }).should("be.visible");
    cy.contains("Pembahasan", { timeout: 30000 }).should("be.visible");
  });
});