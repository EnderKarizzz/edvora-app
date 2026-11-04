describe("Proteksi Data Aktif - Bank Soal (Editor)", () => {
  beforeEach(() => {
    cy.session("editor", () => {
      cy.visit("/login");
      cy.get('input[type="email"]').type("dapa@gmail.com");
      cy.get('input[type="password"]').type("12345678");
      cy.get('button[type="submit"]').click();
      cy.url({ timeout: 60000 }).should("not.include", "/login");
    });

    // buka Bank Soal > Penalaran Umum lewat sidebar
    cy.visit("/editor/tryout");
    cy.contains("Bank Soal", { timeout: 60000 }).click();
    cy.contains("a", "Penalaran Umum", { timeout: 30000 }).click();
    cy.contains("PU-001", { timeout: 60000 }).should("be.visible");
  });

  it("soal Published menampilkan tombol Edit dan Kembalikan ke Draft", () => {
    cy.get('a[aria-label="Edit soal PU-001"]')
      .should("be.visible")
      .and("have.attr", "href")
      .and("include", "/editor/soal/PU-001/edit");

    cy.get('button[aria-label="Kembalikan soal PU-001 ke Draft"]')
      .should("be.visible")
      .and("have.attr", "title", "Kembalikan ke Draft");
  });
});