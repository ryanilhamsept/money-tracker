// Dijalankan juga terhadap salinan web lewat scratchpad.
import { getAccountBalanceDeltas } from "./accountBalance.js";

let pass = 0, fail = 0;
const check = (nama, dapat, harap) => {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (ok) pass++; else fail++;
  console.log((ok ? "  OK   " : "GAGAL  ") + nama + (ok ? "" : `\n         dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`));
};

const ccBca = { id: "cc", name: "CC BCA", type: "Kartu Kredit", totalLimit: 10000000 };
const bca = { id: "bca", name: "BCA", type: "Bank" };
const akun = [ccBca, bca];

const ringkas = (deltas) =>
  deltas.map((d) => [d.account.name, d.amount]).sort((a, b) => a[0].localeCompare(b[0]));

// source = nama kartunya sendiri (ditulis tombol "Bayar Tagihan")
const dariTombol = {
  id: "x", title: "Bayar CC BCA", category: "Account Transfer",
  source: "CC BCA", danaDipakai: "Spend CC", type: "expense", amount: 1000000,
};
// source = rekening pembayar (ditulis tangan / importir dari email myBCA)
const ditulisTangan = {
  id: "y", title: "Bayar CC BCA", category: "Account Transfer",
  source: "BCA", danaDipakai: "Gajian", type: "expense", amount: 1000000,
};

console.log("bayar tagihan kartu");

check("hapus baris dari tombol: utang kartu balik SEKALI, bukan dua kali",
  ringkas(getAccountBalanceDeltas(akun, dariTombol, null)), [["CC BCA", 1000000]]);

check("hapus baris tulis tangan: rekening balik, utang kartu balik",
  ringkas(getAccountBalanceDeltas(akun, ditulisTangan, null)),
  [["BCA", 1000000], ["CC BCA", 1000000]]);

check("tambah baris tulis tangan: rekening kepotong, utang kartu turun",
  ringkas(getAccountBalanceDeltas(akun, null, ditulisTangan)),
  [["BCA", -1000000], ["CC BCA", -1000000]]);

check("tambah baris dari tombol: utang kartu turun sekali",
  ringkas(getAccountBalanceDeltas(akun, null, dariTombol)), [["CC BCA", -1000000]]);

check("bayar kartu lain tidak menyentuh kartu ini",
  ringkas(getAccountBalanceDeltas(akun, { ...ditulisTangan, title: "Bayar CC BNI" }, null)),
  [["BCA", 1000000]]);

// Belanja kartu biasa tidak ikut berubah.
check("belanja kartu nambah utang",
  ringkas(getAccountBalanceDeltas(akun, null, {
    id: "z", title: "SHOPEE.CO.ID", source: "Credit Card - BCA",
    danaDipakai: "Spend CC", type: "expense", amount: 831820,
  })), [["CC BCA", 831820]]);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
