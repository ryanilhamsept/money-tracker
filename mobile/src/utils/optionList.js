// Mirror dari src/utils/optionList.js di app web -- dropdown di dua app
// wajib berperilaku sama, jadi aturannya cuma ada satu dan ditaruh di sini.
//
// File ini sengaja murni: tanpa import, tanpa React.
//
// Masalah yang diselesaikan: nilai yang tersimpan di satu baris belum tentu
// ada di daftar pilihan. Importir Gmail menulis "Perlu Dicek" waktu pengirim
// emailnya belum dikenal, dan daftar pilihan sendiri bisa berubah sesudah
// barisnya dibuat.
//
// Dropdown yang cuma merender daftar pilihan akan menyembunyikan nilai
// seperti itu: <select> HTML tampil KOSONG kalau value-nya tidak cocok dengan
// option mana pun, dan Dropdown mobile jatuh ke placeholder "Pilih". Dua-duanya
// bikin yang mengedit tidak bisa melihat isinya sekarang apa -- kelihatannya
// malah seperti belum diisi, padahal ada isinya.
//
// Jadi nilai yang sedang dipakai selalu ikut ditawarkan, ditaruh paling atas
// dan ditandai, memakai kalimat yang sama dengan rincian di laporan tahunan.

export const DI_LUAR_DAFTAR = "  ·  di luar daftar pilihan";

const normalize = (option) =>
  option && typeof option === "object"
    ? {
        value: String(option.value ?? ""),
        label: String(option.label ?? option.value ?? ""),
      }
    : { value: String(option ?? ""), label: String(option ?? "") };

/**
 * Daftar pilihan yang dijamin memuat nilai yang sedang dipakai.
 * Menerima daftar berupa string biasa (web) maupun {value,label} (mobile),
 * dan selalu mengembalikan {value,label}.
 */
export const withCurrentValue = (options = [], value) => {
  const list = options.map(normalize);
  const current = String(value ?? "").trim();

  if (!current) return list;
  if (list.some((o) => o.value === current)) return list;

  return [{ value: current, label: current + DI_LUAR_DAFTAR }, ...list];
};

/**
 * Daftar pilihan untuk FILTER: gabungan daftar resmi dengan nilai yang
 * benar-benar ada di data.
 *
 * Tanpa ini, nilai seperti "Perlu Dicek" tidak bisa difilter sama sekali --
 * barisnya ada di daftar transaksi tapi tidak ada cara mengumpulkannya, jadi
 * mencarinya harus dengan menggulir satu per satu.
 */
export const withUsedValues = (options = [], rows = [], key) => {
  const list = options.map(normalize);
  const seen = new Set(list.map((o) => o.value));
  const extra = [];

  rows.forEach((row) => {
    const value = String((row && row[key]) ?? "").trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    extra.push({ value, label: value + DI_LUAR_DAFTAR });
  });

  extra.sort((a, b) => a.value.localeCompare(b.value));
  return [...extra, ...list];
};
