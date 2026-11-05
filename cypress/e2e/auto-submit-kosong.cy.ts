// Menggunakan URL sesi simulasi yang aktif
const URL_SESI = "/latihan/ujian?mode=simulasi&subtesId=90023983-17de-448d-a08d-f8304965cf48"; 

describe("Auto-Submit Kosong - Timer Ujian", () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();

    // Login sebagai siswa
    cy.visit("/login");
    cy.get('input[type="email"]').type("sim001@simulasi.test");
    cy.get('input[type="password"]').type("SimulasiEdvora2026");
    cy.get('button[type="submit"]').click();
    cy.contains("Halo, Siswa Simulasi", { timeout: 60000 }).should("be.visible");
  });

  it("sistem otomatis submit dan melabeli sisa soal sebagai Kosong saat timer habis", () => {
    // Membekukan waktu browser SEBELUM mengunjungi halaman pengerjaan
    cy.clock();

    // Kunjungi halaman pengerjaan soal (Simulasi/Try Out)
    cy.visit(URL_SESI);
    
    // Memastikan halaman pengerjaan berhasil dimuat
    cy.url().should("include", "/latihan/ujian");
    cy.contains(/Soal \d+ dari/, { timeout: 60000 }).should("be.visible");

    // Siswa membiarkan soal (tidak menjawab apapun)

    // Mempercepat waktu browser sebanyak 2 jam (7.200.000 ms) 
    cy.tick(7200000);

    // Memulihkan waktu browser dengan benar agar Cypress bisa melanjutkan proses
    cy.clock().invoke('restore');

    // Setelah waktu habis, sistem seharusnya me-redirect ke halaman hasil secara otomatis
    cy.url({ timeout: 15000 }).should("include", "/hasil");
    
    // Memastikan ada keterangan Jawaban Kosong di halaman hasil pengerjaan (sesuai UI Edvora)
    cy.contains("Jawaban Kosong", { timeout: 10000 })
      .parent()
      .invoke('text')
      .should('match', /[1-9]\d*\s*Jawaban Kosong/); 
  });
});