// Dicerminkan di mobile/src/utils/creditCardUsed.js -- angka kartu di dua app
// wajib sama persis, jadi hitungannya cuma ada satu dan ditaruh di sini.
//
// "Used" di kartu kredit itu penghitung TERSIMPAN: dia cuma bergerak waktu ada
// transaksi ditambah/diubah/dihapus lewat app atau importir. Sekali saja ada
// yang lewat jalur lain -- baris dihapus langsung di database, saldo diketik
// manual, atau tombol Bayar Tagihan yang motong saldonya di server tanpa app
// ikut tahu -- angkanya melenceng, dan tidak ada apa pun yang akan
// membetulkannya sendiri.
//
// Yang dihitung di sini sama persis dengan yang ditampilkan daftar "Riwayat
// Transaksi" di bawah kartu: setiap baris belanja kartu yang belum dibayar
// sejak satu siklus tagihan ke belakang, angsuran cicilan termasuk. Jadwal
// cicilan memang sudah tersimpan utuh sebagai baris per bulan (termasuk yang
// jatuh temponya masih tahun depan), jadi menjumlahkan barisnya saja sudah
// mencakup seluruh sisa cicilan.
//
// Yang SENGAJA tidak dipakai: `installments.remainingBalance`. Angka itu cuma
// berubah kalau rencananya diedit, jadi dia gampang ketinggalan dari barisnya
// sendiri -- di kartu CC BCA dia kelebihan Rp 990.344 dari jumlah angsuran
// yang benar-benar masih ada. Barisnya yang dipercaya, bukan ringkasannya.
//
// Juga tidak dipakai: menjumlah seluruh riwayat kartu sejak awal. Tagihan
// bulan-bulan lalu yang sudah lunas di bank hampir tidak pernah punya baris
// pembayaran di app (bayarnya lewat myBCA), jadi itu bikin utang lama
// kehitung lagi.

import { getCurrentCycleStart, getOutstandingWindowStart, getStatementDay } from "./billingCycle";
import { findCreditCardForSource } from "./accountBalance";
import { isCcBillPayment } from "./report";

// Bayar tagihan dan refund mengurangi, belanja menambah. Baris dari tombol
// Bayar Tagihan ikut tersaring ke sini karena sumbernya nama kartunya sendiri
// dan dana dipakainya "Spend CC" -- tanpa tanda minus dia malah kehitung
// sebagai belanja baru.
const signedAmount = (transaction) => {
  const amount = Number(transaction && transaction.amount) || 0;
  if (amount <= 0) return 0;
  if (isCcBillPayment(transaction)) return -amount;
  return transaction.type === "income" ? -amount : amount;
};

// Baris kartu yang masih membebani tagihan: jendelanya sama dengan daftar di
// bawah kartu, mulai satu siklus ke belakang supaya tagihan yang jatuh tempo
// dan belanja sesudahnya sama-sama kelihatan.
export const outstandingCardRows = (account, accounts = [], transactions = []) => {
  if (!account) return [];
  const windowStart = getOutstandingWindowStart(getStatementDay(account));

  return transactions.filter(
    (t) =>
      t &&
      t.danaDipakai === "Spend CC" &&
      !t.paidAt &&
      t.date >= windowStart &&
      findCreditCardForSource(accounts, t.source)?.id === account.id
  );
};

// Utang kartu dipecah jadi dua: yang sudah masuk cetakan tagihan terakhir
// (tinggal dibayar), dan yang belum ditagih sama sekali.
//
// Pemisahnya tanggal tutup buku terakhir yang sudah lewat. Belanja sebelum
// tanggal itu sudah tercetak di tagihan dan jatuh tempo sebentar lagi;
// belanja pada atau sesudahnya baru nongol di cetakan berikutnya.
//
// Angsuran cicilan yang tanggalnya masih di depan ikut masuk "belum ditagih"
// -- memang belum ditagih, cuma sudah pasti datang.
//
// Khusus kartu kredit. Rekening biasa tidak punya siklus tagihan: uangnya
// keluar saat itu juga, jadi tidak ada yang perlu dipisah.
export const splitCardOutstanding = (account, accounts = [], transactions = []) => {
  const rows = outstandingCardRows(account, accounts, transactions);
  const cycleStart = getCurrentCycleStart(getStatementDay(account));

  const bucket = (keep) => {
    const isi = rows.filter((t) => keep(String(t.date || "")));
    return {
      rows: isi,
      total: Math.max(0, Math.round(isi.reduce((sum, t) => sum + signedAmount(t), 0))),
    };
  };

  return {
    cycleStart,
    ditagih: bucket((tanggal) => tanggal < cycleStart),
    belumDitagih: bucket((tanggal) => tanggal >= cycleStart),
  };
};

export const recomputeCardUsed = (account, accounts = [], transactions = []) => {
  if (!account) return 0;

  const used = outstandingCardRows(account, accounts, transactions).reduce(
    (sum, transaction) => sum + signedAmount(transaction),
    0
  );

  // Utang kartu tidak pernah negatif dan tidak bisa melewati limit -- batas
  // yang sama dipakai waktu saldo digeser per transaksi.
  const totalLimit = Number(account.totalLimit) || 0;
  let result = Math.max(0, Math.round(used));
  if (totalLimit > 0) result = Math.min(totalLimit, result);
  return result;
};
