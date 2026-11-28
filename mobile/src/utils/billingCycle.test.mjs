// Dijalankan juga terhadap salinan web lewat scratchpad.
import { getFirstInstallmentMonthOffset, getStatementDay, DEFAULT_STATEMENT_DAY } from "./billingCycle.js";
import { addMonthsToDate } from "./date.js";

let pass = 0, fail = 0;
const check = (nama, dapat, harap) => {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (ok) pass++; else fail++;
  console.log((ok ? "  OK   " : "GAGAL  ") + nama + (ok ? "" : `\n         dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`));
};

// Jadwal angsuran seperti yang dibangun app: tanggal belanja digeser dulu
// kalau belanjanya jatuh pada/sesudah tanggal tutup buku.
const jadwal = (tglBelanja, tenor, statementDay) => {
  const hari = parseInt(tglBelanja.split("-")[2], 10);
  const offset = getFirstInstallmentMonthOffset(hari, statementDay);
  const pertama = addMonthsToDate(tglBelanja, offset);
  return Array.from({ length: tenor }, (_, i) => addMonthsToDate(pertama, i));
};

console.log("angsuran pertama ikut tanggal tutup buku kartu");

check("tutup buku 25, kartu tanpa dueDate pakai bawaan", getStatementDay(null), DEFAULT_STATEMENT_DAY);
check("tutup buku dibaca dari kartu", getStatementDay({ dueDate: 28 }), 28);

check("belanja SEBELUM tutup buku ditagih bulan itu juga",
  getFirstInstallmentMonthOffset(24, 25), 0);
check("belanja PERSIS di tanggal tutup buku geser sebulan",
  getFirstInstallmentMonthOffset(25, 25), 1);
check("belanja SESUDAH tutup buku geser sebulan",
  getFirstInstallmentMonthOffset(28, 25), 1);

// Kasus nyata: ERAFONE 28 Nov 2026, cicilan 12 bulan, tutup buku 25.
// Angsuran ke-1 harus Desember, bukan November.
const erafone = jadwal("2026-11-28", 12, 25);
check("ERAFONE 28 Nov: angsuran ke-1 jatuh Desember", erafone[0], "2026-12-28");
check("ERAFONE: angsuran ke-2 Januari", erafone[1], "2027-01-28");
check("ERAFONE: angsuran terakhir November 2027", erafone[11], "2027-11-28");
check("ERAFONE: tidak ada angsuran di bulan belanjanya",
  erafone.filter((d) => d.startsWith("2026-11")), []);

// Belanja sebelum tutup buku tidak boleh ikut digeser.
check("belanja 20 Nov: angsuran ke-1 tetap November",
  jadwal("2026-11-20", 3, 25), ["2026-11-20", "2026-12-20", "2027-01-20"]);

// Tanggal yang tidak ada di bulan berikutnya tidak bikin jadwalnya kacau
// (31 Jan + 1 bulan jatuh ke awal Maret, bukan error).
check("tanggal 31 tetap menghasilkan tanggal valid",
  jadwal("2027-01-31", 2, 25).every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), true);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
