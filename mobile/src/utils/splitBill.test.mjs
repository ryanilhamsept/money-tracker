import {
  distributeEvenly, calculateItemTotal, calculateParticipantTotals,
  calculateSimplifiedDebts, validateSplitTotal, calculateBillTotals, buildSplits,
} from "./splitBill.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  OK  " : "FAIL  "}${name}`);
  if (!ok) console.log(`        dapat : ${JSON.stringify(got)}\n        harus : ${JSON.stringify(want)}`);
};

// Pembagian tidak boleh menghilangkan rupiah
eq("100 dibagi 3 = 34+33+33", distributeEvenly(100, 3), [34, 33, 33]);
eq("jumlahnya tetap 100", distributeEvenly(100, 3).reduce((a, b) => a + b, 0), 100);
eq("dibagi 0 orang", distributeEvenly(100, 0), []);

// Pajak
eq("50.000 + PPN 10%", calculateItemTotal(50000, 1, 10, 0),
   { subtotal: 50000, tax: 5000, service: 0, total: 55000 });
eq("2 x 25.000 + 10% + 5%", calculateItemTotal(25000, 2, 10, 5),
   { subtotal: 50000, tax: 5000, service: 2500, total: 57500 });

// Lubang pembagian nol yang ditutup -- di repo asli ini menghasilkan NaN
const gratis = [{ id: "a", name: "A" }];
const hasilGratis = calculateParticipantTotals(gratis,
  [{ participantId: "a", amount: 0, item: { price: 0, quantity: 1, taxRate: 10, serviceRate: 0 } }]);
eq("item gratis tidak jadi NaN", hasilGratis[0].total, 0);

const qty0 = calculateParticipantTotals(gratis,
  [{ participantId: "a", amount: 0, item: { price: 1000, quantity: 0, taxRate: 10, serviceRate: 0 } }]);
eq("qty 0 tidak jadi NaN", qty0[0].total, 0);

// Penyederhanaan utang
eq("A nalangin, B & C bayar ke A", calculateSimplifiedDebts([
  { name: "A", total: 50000, paid: 150000 },
  { name: "B", total: 50000, paid: 0 },
  { name: "C", total: 50000, paid: 0 },
]), [{ from: "B", to: "A", amount: 50000 }, { from: "C", to: "A", amount: 50000 }]);

eq("semua pas, tidak ada transfer", calculateSimplifiedDebts([
  { name: "A", total: 50000, paid: 50000 },
  { name: "B", total: 50000, paid: 50000 },
]), []);

// Validasi
eq("split kurang 10.000", validateSplitTotal([{ amount: 40000 }], 50000, 1),
   { valid: false, assigned: 40000, expected: 50000, remaining: 10000 });

// --- Model porsi ---
import { portionsAssigned, takerCount, isAssigned, splitEvenly,
         describeParticipantItems, distributeByWeight } from "./splitBill.js";

const esteh = { id: "e", name: "esteh", price: 5000, quantity: 3, taxRate: 10, serviceRate: 0,
                splits: [{ participantId: "p1", portions: 1 }] };
eq("porsi terbagi 1 dari 3", portionsAssigned(esteh), 1);
eq("satu orang kebagian", takerCount(esteh), 1);
eq("sudah ada yang ambil", isAssigned(esteh), true);
eq("bagi rata = satu bobot per orang",
   splitEvenly({ quantity: 3 }, [{ id: "a" }, { id: "b" }]),
   [{ participantId: "a", portions: 1 }, { participantId: "b", portions: 1 }]);

// Inilah yang dulu rusak: 1 item untuk 3 orang. Membagi satuannya mentok
// (1 tidak bisa jadi 3), tapi harganya jelas bisa dibagi tiga.
const satuUntukBertiga = [{ id: "i", name: "Nasi Goreng", price: 100000, quantity: 1,
                            taxRate: 0, serviceRate: 0, splits: [] }];
const bertiga = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
const bagiTiga = calculateParticipantTotals(bertiga, buildSplits(satuUntukBertiga, bertiga));
eq("1 item ke 3 orang terbagi semua", bagiTiga.map((p) => p.total), [33334, 33333, 33333]);
eq("tidak ada rupiah yang hilang", bagiTiga.reduce((a, p) => a + p.total, 0), 100000);

eq("pembagian berbobot 2:1 dari 100", distributeByWeight(100, [2, 1]), [67, 33]);
eq("berbobot tetap utuh", distributeByWeight(100, [1, 1, 1]).reduce((a, b) => a + b, 0), 100);
eq("bobot semua nol", distributeByWeight(100, [0, 0]), [0, 0]);

// Skenario utuh: 3 orang, 2 item, satu item ditandai manual
const peserta = [{ id: "p1", name: "Ryan" }, { id: "p2", name: "Budi" }, { id: "p3", name: "Sari" }];
const item = [
  // belum dibagi -> jatuh ke bagi rata, 3 porsi untuk 3 orang
  { id: "i1", name: "Nasi Goreng", price: 30000, quantity: 3, taxRate: 10, serviceRate: 5, splits: [] },
  // 1 porsi, diambil Ryan sendiri
  { id: "i2", name: "Kopi", price: 25000, quantity: 1, taxRate: 10, serviceRate: 5,
    splits: [{ participantId: "p1", portions: 1 }] },
];
const total = calculateBillTotals(item);
eq("grand total bill", total, { subtotal: 115000, tax: 11500, service: 5750, total: 132250 });

const perOrang = calculateParticipantTotals(peserta, buildSplits(item, peserta));
console.log("\n  rincian per orang:");
perOrang.forEach(p => console.log(`    ${p.name.padEnd(6)} subtotal ${String(p.subtotal).padStart(6)}  pajak ${String(p.taxShare).padStart(5)}  service ${String(p.serviceShare).padStart(5)}  = ${p.total}`));
const jumlah = perOrang.reduce((a, p) => a + p.total, 0);
eq("jumlah semua orang = grand total", jumlah, total.total);

eq("rincian item Ryan", describeParticipantItems("p1", item, peserta), "1 Nasi Goreng + 1 Kopi");
eq("tidak ada NaN di mana pun", perOrang.every((p) => Number.isFinite(p.total)), true);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
