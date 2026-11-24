// Dijalankan juga terhadap salinan web lewat scratchpad.
import { recomputeCardUsed } from "./creditCardUsed.js";

let pass = 0, fail = 0;
const check = (nama, dapat, harap) => {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (ok) pass++; else fail++;
  console.log((ok ? "  OK   " : "GAGAL  ") + nama + (ok ? "" : `\n         dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`));
};

const hariIni = new Date().toISOString().slice(0, 10);
const LAMA = "2020-01-01";
const NANTI = "2027-03-05";

const ccBca = { id: "cc-bca", name: "CC BCA", type: "Kartu Kredit", totalLimit: 10000000, dueDate: 25 };
const ccBni = { id: "cc-bni", name: "CC BNI", type: "Kartu Kredit", totalLimit: 5000000, dueDate: 25 };
const bca = { id: "bca", name: "BCA", type: "Bank" };
const akun = [ccBca, ccBni, bca];

const belanja = (amount, o = {}) => ({
  type: "expense", date: hariIni, danaDipakai: "Spend CC",
  source: "Credit Card - BCA", title: "Belanja", amount, ...o,
});
const hitung = (transactions) => recomputeCardUsed(ccBca, akun, transactions);

console.log("hitung ulang utang kartu");

check("belanja lepas dijumlahkan",
  hitung([belanja(831820, { title: "SHOPEE.CO.ID" }), belanja(49500, { title: "Location" })]), 881320);

check("belanja di luar jendela tagihan tidak dihitung",
  hitung([belanja(831820), belanja(5000000, { date: LAMA })]), 831820);

// Jadwal cicilan tersimpan utuh sebagai baris per bulan, termasuk yang jatuh
// temponya masih jauh. Semuanya tetap utang, jadi semuanya ikut dihitung.
check("angsuran yang jatuh temponya masih tahun depan tetap dihitung",
  hitung([belanja(480667, { title: "On cloud ke 6", date: NANTI })]), 480667);

check("seluruh sisa jadwal cicilan dijumlahkan dari barisnya",
  hitung([
    belanja(480667, { title: "On cloud ke 2" }),
    belanja(480667, { title: "On cloud ke 3", date: "2026-12-05" }),
    belanja(480667, { title: "On cloud ke 4", date: "2027-01-05" }),
    belanja(480667, { title: "On cloud ke 5", date: "2027-02-05" }),
    belanja(480667, { title: "On cloud ke 6", date: NANTI }),
  ]), 2403335);

check("angsuran yang sudah ditandai lunas tidak membebani kartu",
  hitung([belanja(480667, { title: "On cloud ke 2" }), belanja(480667, { title: "On cloud ke 1", paidAt: "2026-11-01T00:00:00Z" })]), 480667);

check("belanja kartu lain tidak ikut",
  hitung([belanja(831820), belanja(500000, { source: "Credit Card - BNI" })]), 831820);

check("belanja rekening debit tidak ikut",
  hitung([belanja(831820), { type: "expense", date: hariIni, amount: 70000, source: "BCA", danaDipakai: "Spend Bulanan", title: "Indomaret" }]), 831820);

check("baris dari tombol Bayar Tagihan mengurangi, bukan menambah",
  hitung([belanja(2000000), belanja(750000, { title: "CC Payment", category: "Pembayaran CC", source: "CC BCA" })]), 1250000);

check("refund mengurangi",
  hitung([belanja(831820), belanja(31820, { type: "income" })]), 800000);

check("tidak pernah negatif",
  hitung([belanja(100000), belanja(999999, { title: "CC Payment", category: "Pembayaran CC", source: "CC BCA" })]), 0);

check("tidak pernah melewati limit", hitung([belanja(99000000)]), 10000000);
check("tanpa transaksi hasilnya nol", hitung([]), 0);

// Kartu CC BCA persis seperti di layar: empat grup cicilan (yang tersisa cuma
// angsuran yang belum dibayar) plus enam belanja lepas. Hasilnya harus sama
// dengan tagihan di e-statement BCA.
check("skenario kartu CC BCA = Rp 4.735.699",
  hitung([
    belanja(480667, { title: "On cloud ke 2" }),
    belanja(480667, { title: "On cloud ke 3", date: "2026-12-05" }),
    belanja(480667, { title: "On cloud ke 4", date: "2027-01-05" }),
    belanja(480667, { title: "On cloud ke 5", date: "2027-02-05" }),
    belanja(480667, { title: "On cloud ke 6", date: NANTI }),
    belanja(216667, { title: "Chakolab ke 3", date: "2026-11-28" }),
    belanja(304667, { title: "Aye Denim ke 3" }),
    belanja(205010, { title: "SHOPEE.CO.ID 0%3BLN ke 3" }),
    belanja(831820, { title: "SHOPEE.CO.ID" }),
    belanja(49500, { title: "Location" }),
    belanja(80000, { title: "Subway" }),
    belanja(173300, { title: "Mi Mie Dang" }),
    belanja(159500, { title: "Location" }),
    belanja(311900, { title: "Toys Kingdom" }),
  ]), 4735699);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
