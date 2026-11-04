describe("Login siswa", () => {
  it("berhasil login", () => {
    cy.visit("/login");
    cy.get('input[type="email"]').type("sim001@simulasi.test");
    cy.get('input[type="password"]').type("SimulasiEdvora2026");
    cy.get('button[type="submit"]').click();
    cy.contains("Halo, Siswa Simulasi", { timeout: 30000 }).should("be.visible");
  });
});