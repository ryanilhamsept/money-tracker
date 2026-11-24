// Tes laporan tahunan: `node src/utils/report.test.mjs`

import {
  availableYears, belongsTo, expensesInYear, totalsByKey, totalsByMonth,
  TANPA_ISI, totalSpentSinceStart, yearSummary, isCcBillPayment, isExpense,
} from "./report.js";

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "OK " : "GAGAL"}  ${name}${ok ? "" : `\n        dapat ${JSON.stringify(actual)}\n        mau   ${JSON.stringify(expected)}`}`);
};

const KATEGORI = ["Food", "Shopping", "Transportation"];
const SUMBER = ["BCA", "Blu"];
const DANA = ["Spend Bulanan", "Gajian"];
const DANA_TANPA_GAJIAN = ["Spend Bulanan"];
const HARI_INI = "2026-11-08";

const tx = (date, amount, extra = {}) => ({
  date, amount, type: "expense", category: "Food", source: "BCA",
  danaDipakai: "Spend Bulanan", ...extra,
});

console.log("availableYears");
check("tahun diurut terbaru dulu",
  availableYears([tx("2025-03-01", 1), tx("2026-01-01", 1), tx("2025-09-01", 1)]),
  ["2026", "2025"]);
check("pemasukan tidak bikin tahun muncul",
  availableYears([{ date: "2024-01-01", amount: 1, type: "income" }]), []);

console.log("expensesInYear");
const campur = [
  tx("2026-01-05", 100), tx("2025-12-31", 999), tx("2026-11-08", 50),
  tx("2026-12-20", 777),                      // angsuran yang belum jatuh tempo
  tx("2026-12-25", 333, { paidAt: "2026-11-01" }), // dibayar di muka
  { date: "2026-02-01", amount: 500, type: "income" },
];
check("tahun berjalan: yang belum keluar tidak dihitung",
  expensesInYear(campur, "2026", HARI_INI).map((t) => t.amount), [100, 50, 333]);
check("tahun lalu: semuanya dihitung",
  expensesInYear(campur, "2025", HARI_INI).map((t) => t.amount), [999]);
check("tahun depan: jadwal ditampilkan apa adanya",
  expensesInYear([tx("2027-03-01", 42)], "2027", HARI_INI).map((t) => t.amount), [42]);

console.log("totalsByKey -- rincian tidak boleh kehilangan uang");
const aneh = [
  tx("2026-01-01", 1000, { source: "BCA" }),
  tx("2026-01-02", 500, { source: "Blu" }),
  tx("2026-01-03", 250, { source: "Bank Yang Sudah Dihapus" }),
  tx("2026-01-04", 125, { source: "" }),
];
check("tiap nilai tampil dengan namanya sendiri, tidak ditumpuk",
  totalsByKey(aneh, "source", SUMBER).map((r) => [r.label, r.total, r.unlisted]),
  [["BCA", 1000, false], ["Blu", 500, false],
   ["Bank Yang Sudah Dihapus", 250, true], [TANPA_ISI, 125, true]]);
check("spasi di ujung tidak bikin baris kembar",
  totalsByKey([tx("2026-01-01", 10, { source: "BCA " }), tx("2026-01-02", 5, { source: "BCA" })],
    "source", SUMBER),
  [{ value: "BCA", label: "BCA", unlisted: false, total: 15 }]);
check("jumlah rincian = jumlah transaksi",
  totalsByKey(aneh, "source", SUMBER).reduce((s, r) => s + r.total, 0),
  aneh.reduce((s, t) => s + t.amount, 0));
check("nilai nol tidak ditampilkan",
  totalsByKey([tx("2026-01-01", 10, { category: "Food" })], "category", KATEGORI),
  [{ value: "Food", label: "Food", unlisted: false, total: 10 }]);

console.log("totalsByMonth");
const duaBulan = [tx("2026-03-10", 300), tx("2026-03-20", 200), tx("2026-07-01", 700)];
const bulanan = totalsByMonth(duaBulan, "2026");
check("selalu 12 bulan", bulanan.length, 12);
check("Maret = 500", bulanan[2], { month: "2026-03", label: "Maret", total: 500, count: 2 });
check("Juli = 700", bulanan[6].total, 700);
check("bulan kosong = 0", bulanan[0].total, 0);

console.log("yearSummary");
const setahun = [
  tx("2026-01-10", 1000, { category: "Food", source: "BCA", danaDipakai: "Spend Bulanan" }),
  tx("2026-02-10", 3000, { category: "Shopping", source: "Blu", danaDipakai: "Gajian" }),
  tx("2026-02-15", 1000, { category: "Food", source: "BCA", danaDipakai: "Spend Bulanan" }),
  tx("2026-12-31", 9999), // belum keluar
];
const s = yearSummary(setahun, "2026", {
  categories: KATEGORI, fundSources: SUMBER, danaDipakaiOptions: DANA, todayStr: HARI_INI,
});
check("total tidak ikut menghitung jadwal", s.total, 5000);
check("jumlah transaksi", s.count, 3);
check("kategori terbesar duluan", s.byCategory.map((r) => [r.value, r.total, r.percentage]),
  [["Shopping", 3000, 60], ["Food", 2000, 40]]);
check("sumber dana", s.bySource.map((r) => r.value), ["Blu", "BCA"]);
check("ambil dari mana", s.byDana.map((r) => r.value), ["Gajian", "Spend Bulanan"]);
check("nilai di luar daftar ditandai, bukan disembunyikan",
  yearSummary([tx("2026-01-01", 10, { danaDipakai: "Gajian" })], "2026",
    { danaDipakaiOptions: DANA_TANPA_GAJIAN, todayStr: HARI_INI }).byDana,
  [{ value: "Gajian", label: "Gajian", unlisted: true, total: 10, percentage: 100 }]);
check("rata-rata dibagi bulan yang ada isinya", s.monthlyAverage, 2500);
check("bulan paling boros", s.busiestMonth.label, "Februari");

console.log("rincian selalu berjumlah sama dengan total yang ditampilkan");
const tiga = ["byCategory", "bySource", "byDana"].every(
  (k) => s[k].reduce((sum, r) => sum + r.total, 0) === s.total
);
check("tiga rincian cocok dengan total", tiga, true);
check("12 bulan dijumlah = total", s.byMonth.reduce((a, m) => a + m.total, 0), s.total);

console.log("tahun kosong tidak bikin app pecah");
const kosong = yearSummary([], "2026", { todayStr: HARI_INI });
check("total nol", kosong.total, 0);
check("rata-rata nol, bukan NaN", kosong.monthlyAverage, 0);
check("bulan terboros null", kosong.busiestMonth, null);
check("persentase tidak NaN", yearSummary([tx("2026-01-01", 0)], "2026", { categories: KATEGORI, todayStr: HARI_INI }).byCategory, []);

console.log("belongsTo -- isi baris yang dibuka");
check("baris cocok dengan nilainya", belongsTo("Food", "Food"), true);
check("baris tidak kecolongan", belongsTo("Food", "Shopping"), false);
check("nilai di luar daftar tetap ketemu barisnya", belongsTo("Gajian", "Gajian"), true);
check("spasi di ujung tetap ketemu", belongsTo("BCA", "BCA "), true);
check("kolom kosong ketemu baris kosong", belongsTo("", null), true);

console.log("totalSpentSinceStart -- kartu di Home");
const home = [
  tx("2026-01-05", 100), tx("2025-12-31", 999),
  tx("2026-12-20", 777), tx("2026-12-25", 333, { paidAt: "2026-11-01" }),
  { date: "2026-03-01", amount: 500, type: "income" },
];
check("jadwal yang belum jatuh tempo tidak ikut", totalSpentSinceStart(home, HARI_INI), 433);
check("batas 2026 dipertahankan", totalSpentSinceStart([tx("2025-06-01", 50)], HARI_INI), 0);

console.log("kartu Home dan laporan tahunan tidak boleh beda angka");
const satuTahun = [tx("2026-01-05", 100), tx("2026-12-20", 777), tx("2026-06-01", 200)];
check("total 2026 = total kartu Home",
  yearSummary(satuTahun, "2026", { todayStr: HARI_INI }).total,
  totalSpentSinceStart(satuTahun, HARI_INI));


// Bayar tagihan CC bukan pengeluaran baru: belanjanya sudah tercatat satu per
// satu waktu kartunya dipakai. Kalau bayar tagihannya ikut dijumlahkan,
// belanja yang sama kehitung dua kali.
console.log("isCcBillPayment / isExpense");
check("judul 'Bayar CC' dikenali, apa pun besar-kecil hurufnya",
  [{ title: "Bayar CC BCA" }, { title: "bayar cc bni" }, { title: "  Bayar CC BCA  " }]
    .map(isCcBillPayment),
  [true, true, true]);
check("belanja biasa tidak kena",
  [{ title: "Bayar Listrik" }, { title: "Tagihan CC BCA" }, { title: "" }, {}]
    .map(isCcBillPayment),
  [false, false, false, false]);
check("isExpense membuang pemasukan dan bayar tagihan CC",
  [
    { type: "expense", title: "Kopi" },
    { title: "Kopi" },
    { type: "income", title: "Gaji" },
    { type: "expense", title: "Bayar CC BCA" },
    null,
  ].map(isExpense),
  [true, true, false, false, false]);

console.log("bayar tagihan CC tidak dobel-hitung");
const belanjaCc = [
  tx("2026-03-02", 2000000, { title: "Laptop", danaDipakai: "Spend CC", source: "Credit Card - BCA" }),
  tx("2026-03-09", 500000, { title: "Sepatu", danaDipakai: "Spend CC", source: "Credit Card - BCA" }),
];
const bayarTagihan = tx("2026-04-10", 2500000, {
  title: "Bayar CC BCA", category: "Account Transfer", source: "BCA", danaDipakai: "Gajian",
});
const jumlah = (rows) => rows.reduce((s, t) => s + t.amount, 0);

check("total tahunan tidak berubah saat baris bayar tagihan ditambahkan",
  [jumlah(expensesInYear(belanjaCc, 2026, "2026-12-31")),
   jumlah(expensesInYear([...belanjaCc, bayarTagihan], 2026, "2026-12-31"))],
  [2500000, 2500000]);
check("barisnya tidak ikut masuk daftar pengeluaran",
  expensesInYear([...belanjaCc, bayarTagihan], 2026, "2026-12-31").length, 2);
check("totalSpentSinceStart juga mengabaikannya",
  totalSpentSinceStart([...belanjaCc, bayarTagihan], "2026-12-31"), 2500000);
check("tahun yang isinya cuma bayar tagihan tidak dianggap punya pengeluaran",
  availableYears([tx("2025-05-01", 100, { title: "Bayar CC BNI" })]), []);
check("rincian per sumber dana tidak kebagian baris bayar tagihan",
  totalsByKey(expensesInYear([...belanjaCc, bayarTagihan], 2026, "2026-12-31"), "source", SUMBER)
    .map((r) => r.value),
  ["Credit Card - BCA"]);

// Baris yang ditulis tombol "Bayar" di halaman Akun: judulnya bukan
// "Bayar CC ...", jadi dulu dia lolos dari saringan dan kehitung sebagai
// uang keluar -- padahal maksudnya sama persis.
const bayarDariTombol = tx("2026-04-10", 2500000, {
  title: "CC Payment", category: "Pembayaran CC",
  source: "CC BCA", danaDipakai: "Spend CC",
});
check("baris dari tombol Bayar juga tidak dihitung sebagai uang keluar",
  totalSpentSinceStart([...belanjaCc, bayarDariTombol], "2026-12-31"), 2500000);
check("baris dari tombol Bayar tidak muncul di daftar pengeluaran",
  expensesInYear([...belanjaCc, bayarDariTombol], 2026, "2026-12-31").length, 2);
check("belanja biasa berkategori lain tetap dihitung",
  totalSpentSinceStart([tx("2026-05-01", 70000, { category: "Makanan" })], "2026-12-31"), 70000);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
