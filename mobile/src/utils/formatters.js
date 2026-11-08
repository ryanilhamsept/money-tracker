export const formatCurrency = (value) => {
  const amount = Number(value) || 0;

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (date) => {
  if (!date) return "";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
};

// Mirror dari src/utils/currency.js di app web -- kolom nominal di web dan di
// mobile harus berperilaku sama persis.
//
// Dipanggil tiap ketikan, jadi hasilnya wajib menerima angka yang belum selesai:
// "10." dan "10," itu keadaan sah waktu orang masih ngetik, bukan error. Titik
// dibuang lalu dipasang ulang setiap kali -- jadi letaknya tetap benar walau
// angka disisipkan di tengah -- sementara koma dipertahankan sebagai pemisah sen.
//
// Pengelompokannya dikerjakan sendiri, bukan lewat Intl, supaya tidak perlu
// melewati Number: angka 17 digit ke atas kehilangan ketelitian di sana, dan
// yang diketik orang tidak boleh berubah sendiri.
const groupThousands = (digits) =>
  digits.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const splitAmount = (value, allowNegative) => {
  const raw = String(value ?? "");
  const negative = allowNegative && raw.trim().startsWith("-");
  const body = raw.replace(/-/g, "");
  const comma = body.indexOf(",");

  return {
    negative,
    hasComma: comma !== -1,
    int: (comma === -1 ? body : body.slice(0, comma)).replace(/\D/g, ""),
    dec: comma === -1 ? "" : body.slice(comma + 1).replace(/\D/g, ""),
  };
};

export const formatThousands = (value, { allowNegative = false } = {}) => {
  const { negative, hasComma, int, dec } = splitAmount(value, allowNegative);
  const sign = negative ? "-" : "";
  const intPart = int ? groupThousands(int) : "";

  // Koma dibiarkan menggantung ("10.000,") supaya digit sen berikutnya masih
  // bisa diketik -- kalau komanya dipotong di sini, kolomnya tidak akan pernah
  // mau menerima sen.
  if (!hasComma) return intPart ? sign + intPart : sign;
  return `${sign}${intPart || "0"},${dec.slice(0, 2)}`;
};

// Nilai yang benar-benar disimpan. Sen dibulatkan ke atas, bukan dibuang:
// pecahan Rupiah tidak beredar, dan menaikkan lebih aman daripada mencatat
// pengeluaran lebih kecil dari yang sebenarnya.
export const parseAmount = (value) => {
  const { negative, int, dec } = splitAmount(value, true);
  if (!int && !dec) return 0;

  const magnitude = Math.ceil(Number(`${int || "0"}.${dec || "0"}`));
  return negative ? -magnitude : magnitude;
};
