const MIN = 10;
const MAKS = 20; // batas maksimum sesuai aplikasi

describe("Latihan Fleksibel - batas jumlah soal", () => {
  const tombolMinus = () =>
    cy.get('button[aria-label$="jumlah soal"]', { timeout: 30000 }).first();
  const tombolPlus = () =>
    cy.get('button[aria-label="Tambah jumlah soal"]', { timeout: 30000 });

  // Kotak pengatur: elemen terdekat yang membungkus kedua tombol (berisi angkanya)
  const kotakPengatur = () =>
    tombolPlus()
      .parents()
      .filter((i, el) => el.querySelectorAll("button").length >= 2)
      .first();

  // Klik plus selama masih aktif (maksimal 30 kali sebagai pengaman)
  const klikPlusSampaiTerkunci = (n = 0) => {
    tombolPlus().then(($btn) => {
      if (!$btn.prop("disabled") && n < 30) {
        cy.wrap($btn).click();
        klikPlusSampaiTerkunci(n + 1);
      }
    });
  };

  beforeEach(() => {
    // Bersihkan cookies dan storage agar setiap tes benar-benar fresh
    cy.clearCookies();
    cy.clearLocalStorage();

    // Lakukan login segar di setiap awal test
    cy.visit("/login");
    cy.get('input[type="email"]').type("sim001@simulasi.test");
    cy.get('input[type="password"]').type("SimulasiEdvora2026");
    cy.get('button[type="submit"]').click();
    cy.contains("Halo, Siswa Simulasi", { timeout: 30000 }).should("be.visible");

    // Kunjungi halaman subtes
    cy.visit("/latihan/subtes/LBI");
    cy.contains("Jumlah Soal", { timeout: 30000 }).should("be.visible");
  });

  it(`tombol minus terkunci di batas minimum ${MIN}`, () => {
    kotakPengatur().should("contain.text", String(MIN));
    tombolMinus().should("be.disabled");
    tombolPlus().should("not.be.disabled");
  });

  it(`tombol plus terkunci di batas maksimum ${MAKS}`, () => {
    klikPlusSampaiTerkunci();

    tombolPlus().should("be.disabled");
    kotakPengatur().should("contain.text", String(MAKS));
    tombolMinus().should("not.be.disabled");
  });
});