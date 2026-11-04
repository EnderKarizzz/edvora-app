const PAKET_UJI = "test cypress, jgn dihpus"; 

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

  const barisPaket = () => 
    cy.contains('td', PAKET_UJI).closest('tr');

  it("paket berstatus Ditutup / Aktif tidak punya tombol hapus atau ubah status", () => {
    // Sesuaikan status dengan yang tampil di UI (pada gambar tertulis "Ditutup")
    barisPaket().should("contain.text", "Ditutup");
    barisPaket().find("button").should("not.exist");
    barisPaket().should("not.contain.text", "Hapus");
  });
});