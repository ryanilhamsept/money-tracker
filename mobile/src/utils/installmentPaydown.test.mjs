// Dijalankan juga terhadap salinan web lewat scratchpad.
import { planPaydowns } from "./installmentPaydown.js";

let pass = 0, fail = 0;
const check = (nama, dapat, harap) => {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (ok) pass++; else fail++;
  console.log((ok ? "  OK   " : "GAGAL  ") + nama + (ok ? "" : `\n         dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`));
};

const onCloud = { id: "p1", name: "On cloud", remainingBalance: 2884002, remainingTerm: 6, totalLoan: 2884002 };
const ayeDenim = { id: "p2", name: "Aye Denim", remainingBalance: 609334, remainingTerm: 2, totalLoan: 914000 };
const rencana = [onCloud, ayeDenim];
const angsuran = (title, amount) => ({ title, amount });

console.log("sisa cicilan berkurang waktu angsuran ditandai lunas");

check("satu angsuran mengurangi sisa dan jumlah termin",
  planPaydowns([angsuran("On cloud ke 1", 480667)], rencana),
  [{ id: "p1", name: "On cloud", from: 2884002, to: 2403335, fromTerm: 6, toTerm: 5 }]);

check("dua angsuran dari rencana yang sama digabung jadi satu perubahan",
  planPaydowns([angsuran("On cloud ke 1", 480667), angsuran("On cloud ke 2", 480667)], rencana),
  [{ id: "p1", name: "On cloud", from: 2884002, to: 1922668, fromTerm: 6, toTerm: 4 }]);

check("dua rencana berbeda jadi dua perubahan",
  planPaydowns([angsuran("On cloud ke 1", 480667), angsuran("Aye Denim ke 2", 304667)], rencana).map((p) => [p.id, p.to]),
  [["p1", 2403335], ["p2", 304667]]);

check("belanja lepas tidak menyentuh rencana mana pun",
  planPaydowns([angsuran("SHOPEE.CO.ID", 831820), angsuran("Subway", 80000)], rencana), []);

check("membatalkan status lunas mengembalikan sisanya",
  planPaydowns([angsuran("On cloud ke 1", 480667)], rencana, { paid: false }),
  [{ id: "p1", name: "On cloud", from: 2884002, to: 3364669, fromTerm: 6, toTerm: 7 }]);

check("sisa tidak pernah jadi negatif",
  planPaydowns([angsuran("Aye Denim ke 2", 9999999)], rencana).map((p) => [p.to, p.toTerm]),
  [[0, 1]]);

check("tanpa rencana cicilan hasilnya kosong",
  planPaydowns([angsuran("On cloud ke 1", 480667)], []), []);

// Skenario koreksi satu kali buat kartu CC BCA: tiga angsuran yang sudah
// kebayar di tagihan Oktober tapi belum pernah dikurangi dari rencananya.
check("koreksi CC BCA: tiga angsuran Oktober",
  planPaydowns(
    [angsuran("On cloud ke 1", 480667), angsuran("Aye Denim ke 2", 304667), angsuran("SHOPEE 0%3BLN ke 2", 205010)],
    [onCloud, ayeDenim, { id: "p3", name: "SHOPEE 0%3BLN", remainingBalance: 410020, remainingTerm: 2, totalLoan: 615028 }]
  ).reduce((sum, p) => sum + p.to, 0),
  2403335 + 304667 + 205010);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
