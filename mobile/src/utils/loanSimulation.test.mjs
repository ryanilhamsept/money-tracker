// Angka harapnya diambil dari simulator acuan (Skorlife), bukan dikarang --
// kalau hitungannya melenceng, tes ini yang ketahuan duluan.
import { simulateLoan, TUNAI, KPR, LEASING, FIXED_LALU_FLOATING } from "./loanSimulation.js";

let pass = 0, fail = 0;
const check = (nama, dapat, harap) => {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (ok) pass++; else fail++;
  console.log((ok ? "  OK   " : "GAGAL  ") + nama + (ok ? "" : `\n         dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`));
};
const bulat = (n) => Math.round(n);
const persen1 = (n) => Math.round(n * 10) / 10;

console.log("leasing kendaraan (acuan: cicilan Rp375.000)");
const leasing = simulateLoan(LEASING, {
  harga: 10000000, uangMuka: 1000000, tenorBulan: 25, bungaPersen: 2,
  biayaProvisiPersen: 1, biayaAdministrasi: 1500000,
  pendaftaranFidusia: 300000, asuransiPersenPerTahun: 2,
});
check("pokok pinjaman", leasing.pokok, 9000000);
check("cicilan per bulan", bulat(leasing.cicilanPerBulan), 375000);
check("total bunga", bulat(leasing.totalBunga), 375000);
check("biaya dan beban", leasing.biaya.total, 2265000);
check("total yang dibayar", bulat(leasing.totalDibayar), 12640000);
check("dibayar di awal", bulat(leasing.dibayarDiAwal), 3640000);
check("porsi pokok / bunga / biaya",
  [persen1(leasing.porsi.pokok), persen1(leasing.porsi.bunga), persen1(leasing.porsi.biaya)],
  [77.3, 3.2, 19.5]);
check("biaya utang dibanding pinjaman", Math.round(leasing.biayaUtangPersen), 29);
check("pokok dan bunga tiap cicilan", [bulat(leasing.pokokPerBulan), bulat(leasing.bungaPerBulan)], [360000, 15000]);
check("rincian biaya", leasing.biaya.rincian.map((b) => [b.label, b.nilai]),
  [["Biaya provisi", 90000], ["Biaya administrasi", 1500000],
   ["Pendaftaran fidusia", 300000], ["Asuransi kendaraan", 375000]]);

console.log("\npinjaman tunai (acuan: cicilan Rp200.000)");
const tunai = simulateLoan(TUNAI, {
  pokok: 10000000, tenorBulan: 100, bungaPersen: 1,
  biayaProvisiPersen: 2, biayaAdministrasi: 25000,
});
check("cicilan per bulan", bulat(tunai.cicilanPerBulan), 200000);
check("total bunga", bulat(tunai.totalBunga), 10000000);
check("biaya dan beban", tunai.biaya.total, 225000);
check("total yang dibayar", bulat(tunai.totalDibayar), 20225000);
check("tidak ada yang dibayar di awal", tunai.dibayarDiAwal, 0);
check("porsi pokok / bunga / biaya",
  [persen1(tunai.porsi.pokok), persen1(tunai.porsi.bunga), persen1(tunai.porsi.biaya)],
  [49.4, 49.4, 1.1]);
check("biaya utang dibanding pinjaman", Math.round(tunai.biayaUtangPersen), 102);

console.log("\nKPR bunga tetap");
const kpr = simulateLoan(KPR, {
  harga: 1000000000, uangMuka: 250000000, tenorTahun: 10, bungaPersen: 6,
  biayaProvisiPersen: 1, biayaAdministrasi: 500000, biayaAppraisal: 1000000,
  biayaNotarisPersen: 1, asuransiPersenPerTahun: 0.25,
});
check("tenor tahun jadi bulan", kpr.months, 120);
check("pokok pinjaman", kpr.pokok, 750000000);
// bunga flat: 750jt x 6%/12 x 120 = 450jt
check("total bunga", bulat(kpr.totalBunga), 450000000);
check("cicilan per bulan", bulat(kpr.cicilanPerBulan), 10000000);
// provisi 7,5jt + admin 0,5jt + appraisal 1jt + notaris 7,5jt + asuransi 0,25% x 750jt x 10thn = 18,75jt
check("biaya dan beban", kpr.biaya.total, 35250000);
check("uang muka masuk total dibayar, bukan total utang",
  [bulat(kpr.totalUtang), bulat(kpr.totalDibayar)], [1235250000, 1485250000]);

console.log("\nhal-hal yang gampang kelewat");
check("tanpa tenor hasilnya kosong", simulateLoan(TUNAI, { pokok: 1000000, tenorBulan: 0 }), null);
check("uang muka melebihi harga tidak bikin pokok negatif",
  simulateLoan(LEASING, { harga: 5000000, uangMuka: 9000000, tenorBulan: 12, bungaPersen: 5 }), null);
check("bunga 0% tetap jalan",
  bulat(simulateLoan(TUNAI, { pokok: 1200000, tenorBulan: 12, bungaPersen: 0 }).cicilanPerBulan), 100000);

const campur = simulateLoan(KPR, {
  harga: 1000000000, uangMuka: 200000000, tenorTahun: 10,
  strukturBunga: FIXED_LALU_FLOATING, bungaPersen: 5, periodeFixedTahun: 3, bungaFloatingPersen: 11,
});
// 3 tahun @5% lalu 7 tahun @11%, dua-duanya flat dari pokok 800jt.
check("fixed lalu floating: bunga dihitung per potongan",
  bulat(campur.totalBunga), bulat(800000000 * 0.05 / 12 * 36 + 800000000 * 0.11 / 12 * 84));
check("fixed lalu floating: cicilannya tidak seragam", campur.cicilanSeragam, false);
check("fixed lalu floating: jumlah angsuran tetap sesuai tenor", campur.jadwal.length, 120);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
