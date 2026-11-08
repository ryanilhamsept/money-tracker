// Mirror dari src/utils/report.js di app web -- angka laporan di dua app
// wajib sama persis, jadi hitungannya cuma ada satu dan ditaruh di sini.
//
// File ini sengaja murni: tanpa import, tanpa React, tanpa akses jaringan,
// dan daftar kategori/sumber dana dioper dari luar. Jadi isinya bisa sama
// baris per baris di web dan mobile, dan bisa diuji tanpa menjalankan app.

// Label buat transaksi yang kolomnya memang kosong. Bukan kategori, cuma
// cara menyebut "tidak diisi" tanpa menampilkan baris tanpa nama.
export const TANPA_ISI = "(Tanpa isi)";

export const yearOf = (date) => String(date || "").slice(0, 4);
export const monthOf = (date) => String(date || "").slice(0, 7);

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Tahun yang benar-benar punya pengeluaran, terbaru dulu. */
export const availableYears = (transactions = []) => {
  const years = new Set();
  transactions.forEach((t) => {
    if (t && t.type !== "income" && yearOf(t.date).length === 4) years.add(yearOf(t.date));
  });
  return [...years].sort().reverse();
};

/**
 * Pengeluaran di satu tahun.
 *
 * Aturannya disamakan dengan laporan bulanan: di tahun BERJALAN, angsuran
 * yang tanggalnya masih di depan belum benar-benar keluar duitnya, jadi
 * belum dihitung. Kartunya berjudul "uang yang sudah keluar" -- kalau
 * jadwal bulan depan ikut dijumlahkan, judulnya bohong.
 *
 * Tahun yang sudah lewat semua tanggalnya di belakang, jadi penyaringan itu
 * tidak mengubah apa pun di sana. Tahun yang belum datang justru memang
 * isinya jadwal, jadi ditampilkan apa adanya -- sama seperti bulan depan di
 * laporan bulanan.
 */
export const expensesInYear = (transactions = [], year, todayStr) => {
  const inYear = transactions.filter(
    (t) => t && t.type !== "income" && yearOf(t.date) === String(year)
  );

  if (String(year) !== yearOf(todayStr)) return inYear;
  return inYear.filter((t) => t.paidAt || String(t.date).slice(0, 10) <= todayStr);
};

/** Nilai sebuah kolom, dirapikan jadi satu bentuk baku. */
const valueOf = (row, key) => {
  const raw = row ? row[key] : "";
  return raw === undefined || raw === null ? "" : String(raw).trim();
};

/**
 * Jumlahkan per nilai sebuah kolom, dikelompokkan menurut isi datanya.
 *
 * Yang jadi baris adalah nilai yang BENAR-BENAR ada di transaksi, bukan
 * daftar pilihan di app. Dua versi sebelumnya sama-sama keliru:
 *
 *   - Laporan bulanan memetakan daftar pilihan lalu membuang yang nol,
 *     sehingga nilai yang tidak terdaftar hilang diam-diam dari rincian
 *     walaupun tetap ikut dijumlahkan ke total.
 *   - Laporan tahunan versi pertama mengumpulkan semuanya jadi satu baris
 *     "Tidak Terdaftar". Uangnya memang tidak hilang lagi, tapi beberapa
 *     nilai berbeda tertumpuk jadi satu angka besar tanpa nama -- dan baris
 *     berisi Rp 33 juta tanpa keterangan apa pun justru lebih membingungkan
 *     daripada tidak ditampilkan sama sekali.
 *
 * Sekarang tiap nilai tampil dengan namanya sendiri. `knownValues` tinggal
 * dipakai untuk MENANDAI mana yang di luar daftar pilihan (`unlisted`),
 * bukan untuk menentukan baris mana yang ada.
 */
export const totalsByKey = (expenses = [], key, knownValues = []) => {
  const sums = new Map();

  expenses.forEach((t) => {
    const value = valueOf(t, key);
    sums.set(value, (sums.get(value) || 0) + (Number(t.amount) || 0));
  });

  return [...sums.entries()]
    .filter(([, total]) => total > 0)
    .map(([value, total]) => ({
      value,
      label: value === "" ? TANPA_ISI : value,
      unlisted: !knownValues.includes(value),
      total,
    }))
    .sort((a, b) => b.total - a.total);
};

/**
 * Apakah transaksi ini isi dari baris rincian tersebut?
 *
 * Barisnya sekarang bernilai sama persis dengan isi datanya, jadi tinggal
 * dibandingkan -- lewat valueOf, supaya nilai yang kelebihan spasi di ujung
 * ("BCA ") tetap ketemu barisnya, sama seperti waktu dijumlahkan di atas.
 */
export const belongsTo = (bucket, value) =>
  valueOf({ v: value }, "v") === bucket;

/** Dua belas bulan, lengkap dengan yang kosong, supaya bentuk setahunnya kelihatan. */
export const totalsByMonth = (expenses = [], year) => {
  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);

  expenses.forEach((t) => {
    const index = Number(String(t.date).slice(5, 7)) - 1;
    if (index < 0 || index > 11) return;
    sums[index] += Number(t.amount) || 0;
    counts[index] += 1;
  });

  return sums.map((total, i) => ({
    month: `${year}-${String(i + 1).padStart(2, "0")}`,
    label: BULAN[i],
    total,
    count: counts[i],
  }));
};

/**
 * Seluruh isi laporan tahunan dalam satu panggilan.
 *
 * Persentase dihitung dari total yang sama dengan yang ditampilkan di atas,
 * bukan dari jumlah ulang rinciannya -- jadi angka besar di kartu dan
 * persentase di bawahnya tidak mungkin bercerita beda.
 */
export const yearSummary = (
  transactions = [],
  year,
  { categories = [], fundSources = [], danaDipakaiOptions = [], todayStr = "" } = {}
) => {
  const expenses = expensesInYear(transactions, year, todayStr);
  const total = expenses.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const withPercent = (rows) =>
    rows.map((r) => ({ ...r, percentage: total ? Math.round((r.total / total) * 100) : 0 }));

  const months = totalsByMonth(expenses, year);
  const monthsWithSpending = months.filter((m) => m.total > 0);

  return {
    year: String(year),
    total,
    count: expenses.length,
    byCategory: withPercent(totalsByKey(expenses, "category", categories)),
    bySource: withPercent(totalsByKey(expenses, "source", fundSources)),
    byDana: withPercent(totalsByKey(expenses, "danaDipakai", danaDipakaiOptions)),
    byMonth: months,
    // Rata-rata dibagi bulan yang ADA belanjanya, bukan 12. Tahun berjalan
    // baru sampai November; membaginya dengan 12 bikin rata-ratanya terlihat
    // lebih hemat dari kenyataan.
    monthlyAverage: monthsWithSpending.length
      ? Math.round(total / monthsWithSpending.length)
      : 0,
    busiestMonth: monthsWithSpending.length
      ? monthsWithSpending.reduce((a, b) => (b.total > a.total ? b : a))
      : null,
  };
};

/**
 * Total "uang yang sudah keluar" buat kartu di Home.
 *
 * Batas 2026-01-01 dipertahankan apa adanya: itu awal data yang dipakai
 * kartunya sejak dulu, dan menurunkannya bisa menarik masuk baris lama yang
 * memang sengaja tidak dihitung.
 *
 * Yang ditambahkan cuma satu: angsuran yang tanggalnya masih di depan dan
 * belum dibayar tidak ikut dijumlahkan. Sebelumnya ikut, sehingga kartu yang
 * berjudul "uang yang sudah KELUAR" menghitung uang yang belum keluar -- dan
 * angkanya jadi beda dengan laporan bulanan maupun tahunan, yang dari dulu
 * menyaringnya. Satu kalimat tidak boleh punya dua angka.
 */
export const totalSpentSinceStart = (transactions = [], todayStr = "") =>
  transactions
    .filter(
      (t) =>
        t &&
        t.type !== "income" &&
        String(t.date) >= "2026-01-01" &&
        (t.paidAt || String(t.date).slice(0, 10) <= todayStr)
    )
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
