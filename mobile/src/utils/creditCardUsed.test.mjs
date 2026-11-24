// Dijalankan juga terhadap salinan web lewat scratchpad. Sengaja tanpa
// node:test biar bisa jalan apa adanya.
import { recomputeCardUsed } from "./creditCardUsed.js";

let pass = 0;
let fail = 0;
const check = (nama, dapat, harap) => {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (ok) pass++; else fail++;
  console.log((ok ? "  OK   " : "GAGAL  ") + nama + (ok ? "" : `\n         dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`));
};

// Tanggalnya diturunkan dari hari ini supaya tes tidak basi: jendela kartu
// bergerak tiap bulan mengikuti tanggal tutup buku.
const hariIni = new Date().toISOString().slice(0, 10);
const LAMA = "2020-01-01";

const ccBca = { id: "cc-bca", name: "CC BCA", type: "Kartu Kredit", totalLimit: 10000000, dueDate: 25 };
const ccBni = { id: "cc-bni", name: "CC BNI", type: "Kartu Kredit", totalLimit: 5000000, dueDate: 25 };
const bca = { id: "bca", name: "BCA", type: "Bank" };
const akun = [ccBca, ccBni, bca];

const belanja = (amount, o = {}) => ({
  type: "expense", date: hariIni, danaDipakai: "Spend CC",
  source: "Credit Card - BCA", title: "Belanja", amount, ...o,
});
const hitung = (transactions, installments = []) =>
  recomputeCardUsed(ccBca, akun, transactions, installments);

console.log("hitung ulang utang kartu");

check("belanja lepas dijumlahkan",
  hitung([belanja(831820, { title: "SHOPEE.CO.ID" }), belanja(49500, { title: "Location" })]), 881320);

check("belanja di luar jendela tagihan tidak dihitung",
  hitung([belanja(831820), belanja(5000000, { date: LAMA })]), 831820);

check("belanja kartu lain tidak ikut",
  hitung([belanja(831820), belanja(500000, { source: "Credit Card - BNI" })]), 831820);

check("angsuran yang sudah ditandai lunas tidak membebani kartu",
  hitung([belanja(480667, { title: "On cloud ke 1" }), belanja(480667, { title: "On cloud ke 2", paidAt: "2026-11-01T00:00:00Z" })]), 480667);

// Inti perbaikannya: cicilan dihitung dari sisa jadwalnya, bukan dari angsuran
// yang kebetulan jatuh di jendela ini, dan bukan dari total pinjamannya.
check("cicilan dihitung dari sisa jadwal, bukan jumlah angsuran yang tampil",
  hitung(
    [belanja(216667, { title: "Chakolab ke 3" })],
    [{ accountId: "cc-bca", name: "Chakolab", remainingBalance: 216667, totalLoan: 650000 }]
  ), 216667);

check("cicilan dengan dua angsuran di jendela tetap dihitung sekali",
  hitung(
    [belanja(304667, { title: "Aye Denim ke 2" }), belanja(304667, { title: "Aye Denim ke 3" })],
    [{ accountId: "cc-bca", name: "Aye Denim", remainingBalance: 609334, totalLoan: 914000 }]
  ), 609334);

check("cicilan tanpa rencana tersimpan jatuh balik ke angsuran yang tampil",
  hitung([
    belanja(205010, { title: "SHOPEE 0%3BLN ke 2", installmentTotalLoan: 615028 }),
    belanja(205010, { title: "SHOPEE 0%3BLN ke 3" }),
  ]), 410020);

check("cicilan kartu lain tidak ikut",
  hitung(
    [belanja(216667, { title: "Chakolab ke 3" })],
    [
      { accountId: "cc-bca", name: "Chakolab", remainingBalance: 216667, totalLoan: 650000 },
      { accountId: "cc-bni", name: "Sofa", remainingBalance: 3000000, totalLoan: 6000000 },
    ]
  ), 216667);

check("baris dari tombol Bayar Tagihan mengurangi, bukan menambah",
  hitung([
    belanja(2000000),
    belanja(750000, { title: "CC Payment", category: "Pembayaran CC", source: "CC BCA" }),
  ]), 1250000);

check("refund mengurangi",
  hitung([belanja(831820), belanja(31820, { type: "income" })]), 800000);

check("tidak pernah negatif",
  hitung([belanja(100000), belanja(999999, { title: "CC Payment", category: "Pembayaran CC", source: "CC BCA" })]), 0);

check("tidak pernah melewati limit",
  hitung([belanja(99000000)]), 10000000);

check("tanpa transaksi hasilnya nol", hitung([]), 0);

// Skenario utuh sesuai kartu CC BCA di layar: empat cicilan plus belanja lepas.
check("skenario kartu CC BCA",
  hitung(
    [
      belanja(480667, { title: "On cloud ke 1" }),
      belanja(480667, { title: "On cloud ke 2" }),
      belanja(216667, { title: "Chakolab ke 3" }),
      belanja(304667, { title: "Aye Denim ke 2" }),
      belanja(205010, { title: "SHOPEE 0%3BLN ke 2" }),
      belanja(831820, { title: "SHOPEE.CO.ID" }),
      belanja(49500, { title: "Location" }),
      belanja(80000, { title: "Subway" }),
      belanja(173300, { title: "Mi Mie Dang" }),
      belanja(159500, { title: "Location" }),
      belanja(311900, { title: "Toys Kingdom" }),
    ],
    [
      { accountId: "cc-bca", name: "On cloud", remainingBalance: 2884002, totalLoan: 2884002 },
      { accountId: "cc-bca", name: "Chakolab", remainingBalance: 216667, totalLoan: 650000 },
      { accountId: "cc-bca", name: "Aye Denim", remainingBalance: 609334, totalLoan: 914000 },
      { accountId: "cc-bca", name: "SHOPEE 0%3BLN", remainingBalance: 410020, totalLoan: 615028 },
    ]
  ), 2884002 + 216667 + 609334 + 410020 + 831820 + 49500 + 80000 + 173300 + 159500 + 311900);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
