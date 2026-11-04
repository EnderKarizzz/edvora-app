describe('Pengujian Halaman Login Edvora', () => {
  it('Berhasil membuka halaman login dan mengisi form', () => {
    // Membuka halaman login
    cy.visit('http://127.0.0.1:8000/login'); 

    // Mengisi form login menggunakan data akun simulasi siswa
    cy.get('input[type="email"]').type('sim001@simulasi.test');
    cy.get('input[type="password"]').type('SimulasiEdvora2026');
  });
});