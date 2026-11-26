// Mirror dari src/utils/loanSimulation.js di app web -- hitungannya cuma ada
// satu dan ditaruh di sini, supaya angkanya tidak pernah beda antar app.
//
// Modelnya BUNGA FLAT: bunga dihitung dari pokok pinjaman awal, bukan dari
// sisa pokok. Jadi tiap cicilan porsinya sama persis -- itu yang dipakai
// hampir semua KTA, leasing kendaraan, dan KPR bunga tetap di Indonesia.
//
// Angka-angka di sini dikalibrasi ke simulator Skorlife, dan tesnya memakai
// contoh asli dari sana supaya ketahuan kalau hitungannya melenceng.

const num = (value) => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export const TUNAI = "tunai";
export const KPR = "kpr";
export const LEASING = "leasing";

// Struktur bunga KPR.
export const BUNGA_TETAP = "tetap";
export const FIXED_LALU_FLOATING = "fixed-floating";
export const BUNGA_BERJENJANG = "berjenjang";

export const STRUKTUR_BUNGA = [
  { value: BUNGA_TETAP, label: "Bunga tetap" },
  { value: FIXED_LALU_FLOATING, label: "Fixed lalu floating" },
  { value: BUNGA_BERJENJANG, label: "Bunga berjenjang" },
];

// Batas yang dipakai buat pesan validasi, mengikuti simulator acuan.
export const BATAS = {
  [TUNAI]: { pokok: [100000, 2000000000], tenorBulan: [1, 120] },
  [KPR]: { harga: [50000000, 30000000000], tenorTahun: [1, 30], dpPersen: [0, 70] },
  [LEASING]: { harga: [10000000, 5000000000], tenorBulan: [1, 96], dpPersen: [0, 70] },
};

// Potongan tenor dengan suku bunga masing-masing. Bunga tetap cuma punya satu
// potongan; fixed-lalu-floating punya dua; berjenjang punya tiga.
const segmenBunga = (input, months) => {
  const struktur = input.strukturBunga || BUNGA_TETAP;
  const tahunan = (persen) => num(persen) / 100 / 12;

  if (struktur === BUNGA_TETAP) {
    return [{ months, monthlyRate: tahunan(input.bungaPersen) }];
  }

  const fixedBulan = Math.min(months, Math.max(0, Math.round(num(input.periodeFixedTahun) * 12)));

  if (struktur === FIXED_LALU_FLOATING) {
    const sisa = months - fixedBulan;
    return [
      { months: fixedBulan, monthlyRate: tahunan(input.bungaPersen) },
      { months: sisa, monthlyRate: tahunan(input.bungaFloatingPersen) },
    ].filter((s) => s.months > 0);
  }

  // Berjenjang: tahap 1 (periodeFixedTahun), tahap 2 (periodeJenjangTahun),
  // sisanya floating.
  const jenjangBulan = Math.min(
    months - fixedBulan,
    Math.max(0, Math.round(num(input.periodeJenjangTahun) * 12))
  );
  const sisa = months - fixedBulan - jenjangBulan;
  return [
    { months: fixedBulan, monthlyRate: tahunan(input.bungaPersen) },
    { months: jenjangBulan, monthlyRate: tahunan(input.bungaJenjangPersen) },
    { months: sisa, monthlyRate: tahunan(input.bungaFloatingPersen) },
  ].filter((s) => s.months > 0);
};

// Biaya di muka. Yang berbasis persen SELALU dihitung dari pokok pinjaman
// (bukan dari harga barangnya) -- itu yang cocok dengan angka acuan.
const hitungBiaya = (jenis, input, pokok, months) => {
  const tahun = months / 12;
  const persen = (p) => (num(p) / 100) * pokok;
  const rincian = [];

  const tambah = (label, nilai) => {
    if (nilai > 0) rincian.push({ label, nilai: Math.round(nilai) });
  };

  tambah("Biaya provisi", persen(input.biayaProvisiPersen));
  tambah("Biaya administrasi", num(input.biayaAdministrasi));

  if (jenis === KPR) {
    tambah("Biaya appraisal", num(input.biayaAppraisal));
    tambah("Biaya notaris dan akta", persen(input.biayaNotarisPersen));
    tambah("Asuransi jiwa dan properti", persen(input.asuransiPersenPerTahun) * tahun);
  }

  if (jenis === LEASING) {
    tambah("Pendaftaran fidusia", num(input.pendaftaranFidusia));
    tambah("Asuransi kendaraan", persen(input.asuransiPersenPerTahun) * tahun);
  }

  const total = rincian.reduce((sum, b) => sum + b.nilai, 0);
  return { rincian, total };
};

export const simulateLoan = (jenis, input = {}) => {
  const months =
    jenis === KPR
      ? Math.round(num(input.tenorTahun) * 12)
      : Math.round(num(input.tenorBulan));

  const harga = num(input.harga);
  const uangMuka = jenis === TUNAI ? 0 : Math.min(harga, Math.max(0, num(input.uangMuka)));
  const pokok = jenis === TUNAI ? num(input.pokok) : Math.max(0, harga - uangMuka);

  if (pokok <= 0 || months <= 0) return null;

  // Tunai memakai suku bunga per BULAN, KPR dan leasing per TAHUN.
  const segmen =
    jenis === TUNAI
      ? [{ months, monthlyRate: num(input.bungaPersen) / 100 }]
      : segmenBunga(input, months);

  const pokokPerBulan = pokok / months;
  const jadwal = [];
  let totalBunga = 0;

  segmen.forEach((s) => {
    const bungaPerBulan = pokok * s.monthlyRate;
    for (let i = 0; i < s.months; i++) {
      jadwal.push({
        bulan: jadwal.length + 1,
        pokok: pokokPerBulan,
        bunga: bungaPerBulan,
        cicilan: pokokPerBulan + bungaPerBulan,
      });
      totalBunga += bungaPerBulan;
    }
  });

  const biaya = hitungBiaya(jenis, input, pokok, months);
  const cicilanPertama = jadwal[0] ? jadwal[0].cicilan : 0;
  const cicilanSeragam = jadwal.every((j) => Math.abs(j.cicilan - cicilanPertama) < 0.5);

  // "Total utang" = yang masih harus dibayar ke pemberi pinjaman. Uang muka
  // tidak masuk ke sini karena itu uang sendiri, bukan utang -- tapi ikut di
  // "total yang dibayar" karena tetap keluar dari kantong.
  const totalUtang = pokok + totalBunga + biaya.total;

  return {
    jenis,
    months,
    harga,
    uangMuka,
    pokok,
    cicilanPerBulan: cicilanPertama,
    cicilanSeragam,
    pokokPerBulan,
    bungaPerBulan: jadwal[0] ? jadwal[0].bunga : 0,
    totalBunga,
    biaya,
    totalUtang,
    totalDibayar: totalUtang + uangMuka,
    // Leasing dan KPR menagih uang muka, cicilan pertama, dan seluruh biaya
    // di awal akad.
    dibayarDiAwal: jenis === TUNAI ? 0 : uangMuka + cicilanPertama + biaya.total,
    porsi: {
      pokok: totalUtang > 0 ? (pokok / totalUtang) * 100 : 0,
      bunga: totalUtang > 0 ? (totalBunga / totalUtang) * 100 : 0,
      biaya: totalUtang > 0 ? (biaya.total / totalUtang) * 100 : 0,
    },
    // Berapa mahal utangnya dibanding yang dipinjam.
    biayaUtangPersen: pokok > 0 ? ((totalBunga + biaya.total) / pokok) * 100 : 0,
    jadwal,
  };
};
