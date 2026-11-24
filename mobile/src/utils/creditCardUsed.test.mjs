// Dijalankan juga terhadap salinan web lewat scratchpad (lihat catatan di
// report.test.mjs). Sengaja tanpa node:test biar bisa jalan apa adanya.
import { recomputeCardUsed } from "./creditCardUsed.js";

let pass = 0;
let fail = 0;
const check = (nama, dapat, harap) => {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (ok) pass++; else fail++;
  console.log((ok ? "  OK   " : "GAGAL  ") + nama + (ok ? "" : `\n         dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`));
};

const ccBca = { id: "cc-bca", name: "CC BCA", type: "Kartu Kredit", totalLimit: 10000000 };
const ccBni = { id: "cc-bni", name: "CC BNI", type: "Kartu Kredit", totalLimit: 5000000 };
const bca = { id: "bca", name: "BCA", type: "Bank" };
const akun = [ccBca, ccBni, bca];

const tx = (o) => ({ type: "expense", amount: 0, ...o });
const belanjaCc = (amount, o = {}) =>
  tx({ amount, danaDipakai: "Spend CC", source: "Credit Card - BCA", ...o });

console.log("hitung ulang utang kartu");

check("belanja kartu dijumlahkan",
  recomputeCardUsed(ccBca, akun, [belanjaCc(831820), belanjaCc(49500)]), 881320);

check("belanja kartu lain tidak ikut",
  recomputeCardUsed(ccBca, akun, [belanjaCc(831820), belanjaCc(500000, { source: "Credit Card - BNI" })]), 831820);

check("belanja rekening debit tidak ikut",
  recomputeCardUsed(ccBca, akun, [belanjaCc(831820), tx({ amount: 70000, source: "BCA", danaDipakai: "Spend Bulanan" })]), 831820);

check("angsuran yang sudah lunas tidak membebani kartu",
  recomputeCardUsed(ccBca, akun, [belanjaCc(480667), belanjaCc(480667, { paidAt: "2026-11-01T00:00:00Z" })]), 480667);

check("refund mengurangi utang",
  recomputeCardUsed(ccBca, akun, [belanjaCc(831820), belanjaCc(31820, { type: "income" })]), 800000);

check("bayar tagihan manual mengurangi utang",
  recomputeCardUsed(ccBca, akun, [
    belanjaCc(2000000),
    tx({ amount: 500000, title: "Bayar CC BCA", source: "BCA", danaDipakai: "Gajian" }),
  ]), 1500000);

check("bayar tagihan kartu lain tidak mengurangi kartu ini",
  recomputeCardUsed(ccBca, akun, [
    belanjaCc(2000000),
    tx({ amount: 500000, title: "Bayar CC BNI", source: "BCA", danaDipakai: "Gajian" }),
  ]), 2000000);

check("baris dari tombol Bayar Tagihan juga mengurangi utang",
  recomputeCardUsed(ccBca, akun, [
    belanjaCc(2000000),
    tx({ amount: 750000, title: "CC Payment", category: "Pembayaran CC", source: "CC BCA", danaDipakai: "Spend CC" }),
  ]), 1250000);

check("tidak pernah negatif",
  recomputeCardUsed(ccBca, akun, [tx({ amount: 999999, title: "Bayar CC BCA", source: "BCA" })]), 0);

check("tidak pernah melewati limit",
  recomputeCardUsed(ccBca, akun, [belanjaCc(99000000)]), 10000000);

check("tanpa transaksi hasilnya nol",
  recomputeCardUsed(ccBca, akun, []), 0);

check("source 'Credit Card - BCA' tetap kebaca walau dana dipakai kosong",
  recomputeCardUsed(ccBca, akun, [tx({ amount: 311900, source: "Credit Card - BCA", danaDipakai: "" })]), 311900);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
