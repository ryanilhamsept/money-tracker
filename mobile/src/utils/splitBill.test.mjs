import {
  distributeEvenly, distributeByWeight, calculateItemTotal, calculateBillTotals,
  calculateParticipantTotals, calculateSimplifiedDebts, splitEvenly, itemShares,
  portionsAssigned, takerCount, isAssigned, canAddPortion, describeParticipantItems, billCharges,
} from "./splitBill.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  OK  " : "FAIL  "}${name}`);
  if (!ok) console.log(`        dapat : ${JSON.stringify(got)}\n        harus : ${JSON.stringify(want)}`);
};

// --- pembagian dasar ---
eq("100 dibagi 3", distributeEvenly(100, 3), [34, 33, 33]);
eq("jumlahnya tetap 100", distributeEvenly(100, 3).reduce((a, b) => a + b, 0), 100);
eq("dibagi 0 orang", distributeEvenly(100, 0), []);
eq("berbobot 2:1 dari 100", distributeByWeight(100, [2, 1]), [67, 33]);
eq("berbobot tetap utuh", distributeByWeight(100, [1, 1, 1]).reduce((a, b) => a + b, 0), 100);
eq("bobot semua nol", distributeByWeight(100, [0, 0]), [0, 0]);

// --- item ---
eq("50.000 + PPN 10%", calculateItemTotal(50000, 1, 10, 0),
   { subtotal: 50000, tax: 5000, service: 0, total: 55000 });

const tiga = [{ id: "a", name: "a" }, { id: "b", name: "b" }, { id: "v", name: "v" }];
const mk = (over = {}) => [{ id: "i", name: "NASGORR", price: 100000, quantity: 1,
                             taxMode: "percent", taxRate: 11, serviceMode: "percent",
                             serviceRate: 9, splits: [], ...over }];

// --- mode persen: kasus yang dilaporkan melenceng 1 rupiah ---
const persen = mk();
eq("total mode persen", calculateBillTotals(persen),
   { subtotal: 100000, tax: 11000, service: 9000, total: 120000 });
const pp = calculateParticipantTotals(tiga, persen);
eq("per orang berjumlah pas", pp.reduce((a, p) => a + p.total, 0), 120000);
eq("pajak berjumlah pas", pp.reduce((a, p) => a + p.taxShare, 0), 11000);
eq("service berjumlah pas", pp.reduce((a, p) => a + p.serviceShare, 0), 9000);

// --- mode nominal: struk cuma menyebut rupiahnya ---
const nominal = mk({ taxMode: "amount", taxAmount: 11000,
                     serviceMode: "amount", serviceAmount: 9000 });
eq("nominal dibaca apa adanya", calculateBillTotals(nominal),
   { subtotal: 100000, tax: 11000, service: 9000, total: 120000 });
eq("mode terbaca", billCharges(nominal).taxMode, "amount");
const pn = calculateParticipantTotals(tiga, nominal);
eq("nominal pun tidak melenceng", pn.reduce((a, p) => a + p.total, 0), 120000);
eq("persen dan nominal hasilnya sama", pn.map(p => p.total), pp.map(p => p.total));

// --- bagi rata & bobot ---
eq("bagi rata = satu bobot per orang",
   splitEvenly({ quantity: 3 }, [{ id: "a" }, { id: "b" }]),
   [{ participantId: "a", portions: 1 }, { participantId: "b", portions: 1 }]);
eq("1 item ke 3 orang", pp.map(p => p.subtotal), [33334, 33333, 33333]);

const berat = mk({ splits: [{ participantId: "a", portions: 2 },
                            { participantId: "b", portions: 1 }] });
const pb = calculateParticipantTotals(tiga, berat);
eq("bobot 2:1, v tidak kebagian", pb.map(p => p.subtotal), [66667, 33333, 0]);
eq("bobot pun berjumlah pas", pb.reduce((a, p) => a + p.total, 0), 120000);
eq("yang tidak ambil tidak kena pajak", pb[2].total, 0);

// --- pembagian nol & kasus kosong ---
const gratis = mk({ price: 0, taxMode: "percent", taxRate: 10 });
eq("item gratis tidak jadi NaN",
   calculateParticipantTotals(tiga, gratis).every(p => Number.isFinite(p.total)), true);
eq("tanpa item", calculateBillTotals([]), { subtotal: 0, tax: 0, service: 0, total: 0 });
eq("tanpa peserta", calculateParticipantTotals([], persen), []);

// --- penanda item ---
const esteh = { id: "e", name: "esteh", price: 5000, quantity: 3,
                splits: [{ participantId: "a", portions: 1 }] };
eq("porsi terhitung", portionsAssigned(esteh), 1);
eq("satu orang kebagian", takerCount(esteh), 1);
eq("sudah ada yang ambil", isAssigned(esteh), true);
eq("bagian rupiah per item", [...itemShares(persen[0], tiga).values()], [33334, 33333, 33333]);
eq("rincian item", describeParticipantItems("a", persen, tiga), "1 NASGORR");

// --- utang disederhanakan ---
eq("B & C bayar ke A", calculateSimplifiedDebts([
  { name: "A", total: 50000, paid: 150000 },
  { name: "B", total: 50000, paid: 0 },
  { name: "C", total: 50000, paid: 0 },
]), [{ from: "B", to: "A", amount: 50000 }, { from: "C", to: "A", amount: 50000 }]);

// --- sapuan: selisih satu rupiah hanya muncul di kombinasi tertentu ---
let melenceng = 0, kombinasi = 0;
for (const harga of [100000, 33333, 7, 999999]) {
  for (const qty of [1, 2, 3, 7]) {
    for (const mode of ["percent", "amount"]) {
      for (const pajak of [0, 10, 11, 12.5]) {
        for (const orang of [1, 2, 3, 4, 7]) {
          const items = [{ id: "x", name: "x", price: harga, quantity: qty,
                           taxMode: mode, taxRate: pajak, taxAmount: pajak * 137,
                           serviceMode: mode, serviceRate: 5, serviceAmount: 999,
                           splits: [] }];
          const ps = Array.from({ length: orang }, (_, i) => ({ id: "p" + i, name: "p" + i }));
          const per = calculateParticipantTotals(ps, items);
          kombinasi += 1;
          if (per.reduce((a, p) => a + p.total, 0) !== calculateBillTotals(items).total) melenceng += 1;
        }
      }
    }
  }
}
eq(`sapuan ${kombinasi} kombinasi, semua pas`, melenceng, 0);

// --- batas penambahan bobot ---
const satu = { quantity: 1, splits: [{ participantId: "a", portions: 1 },
                                      { participantId: "b", portions: 1 },
                                      { participantId: "c", portions: 1 }] };
eq("qty 1 sudah dibagi rata, tidak bisa nambah", canAddPortion(satu, "a"), false);
eq("orang baru tetap boleh ikut", canAddPortion(satu, "d"), true);

const kosong = { quantity: 1, splits: [] };
eq("belum ada yang ambil, boleh", canAddPortion(kosong, "a"), true);

const empat = { quantity: 3, splits: [{ participantId: "a", portions: 1 }] };
eq("qty 3 baru terpakai 1, boleh nambah", canAddPortion(empat, "a"), true);

const penuh = { quantity: 3, splits: [{ participantId: "a", portions: 2 },
                                      { participantId: "b", portions: 1 }] };
eq("qty 3 sudah habis, tidak bisa nambah", canAddPortion(penuh, "a"), false);
eq("qty 3 habis, orang baru masih boleh ikut", canAddPortion(penuh, "c"), true);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
