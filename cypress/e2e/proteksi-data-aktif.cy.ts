const PAKET_UJI = "test cypress, jgn dihpus"; // paket uji milikmu, status Dibuka

describe("Proteksi Data Aktif - Paket Try Out (Editor)", () => {
  beforeEach(() => {
    cy.session("editor", () => {
      cy.visit("/login");
      cy.get('input[type="email"]').type("dapa@gmail.com");
      cy.get('input[type="password"]').type("12345678");
      cy.get('button[type="submit"]').click();
      cy.url({ timeout: 60000 }).should("not.include", "/login");
    });

    cy.visit("/editor/tryout");
    cy.contains(PAKET_UJI, { timeout: 60000 }).should("be.visible");
  });

  // Ambil baris paket uji: elemen terdekat yang memuat judul + status, tapi bukan baris lain
  const barisPaket = () =>
    cy
      .contains(PAKET_UJI)
      .parents()
      .filter((i, el) => el.textContent.includes("Dibuka") && !el.textContent.includes("Gelombang"))
      .first();

  it("paket berstatus Dibuka tidak punya tombol hapus atau ubah status", () => {
    barisPaket().should("contain.text", "Dibuka");
    barisPaket().find("button").should("not.exist");
    barisPaket().should("not.contain.text", "Hapus");
    barisPaket().should("not.contain.text", "Draft");
  });
});