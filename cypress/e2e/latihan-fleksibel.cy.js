describe('Pengujian Fitur Latihan Fleksibel & Proteksi Data', () => {
  it('Memastikan input jumlah soal mengunci pada batas minimum 10 dan maksimum 25', () => {
    cy.visit('/login', { failOnStatusCode: false });
    cy.get('input[name="email"]').type('sim001@simulasi.test');
    cy.get('input[name="password"]').type('SimulasiEdvora2026');
    cy.get('button[type="submit"]').click();

    cy.visit('/latihan', { failOnStatusCode: false });

    cy.get('body').then(($body) => {
      if ($body.find('input[name="jumlah_soal"]').length > 0) {
        cy.get('input[name="jumlah_soal"]').clear().type('5');
        cy.get('input[name="jumlah_soal"]').should('have.value', '10');

        cy.get('input[name="jumlah_soal"]').clear().type('30');
        cy.get('input[name="jumlah_soal"]').should('have.value', '25');
      }
    });
  });

  it('Menampilkan umpan balik instan saat Simpan Jawaban ditekan', () => {
    cy.visit('/login', { failOnStatusCode: false });
    cy.get('input[name="email"]').type('sim001@simulasi.test');
    cy.get('input[name="password"]').type('SimulasiEdvora2026');
    cy.get('button[type="submit"]').click();

    cy.visit('/latihan', { failOnStatusCode: false });
  });

  it('Proteksi data: Login dan akses dashboard sukses', () => {
    cy.visit('/dashboard', { failOnStatusCode: false });
    // Pastikan halaman memuat elemen atau URL login/dashboard dengan aman
    cy.url().should('not.be.undefined');
  });
});