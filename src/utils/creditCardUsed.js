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
// Yang dihitung di sini SAMA PERSIS dengan yang ditampilkan daftar "Riwayat
// Transaksi" di bawah kartu: belanja yang belum dibayar sejak satu siklus
// tagihan ke belakang, plus sisa tiap cicilan. Itu yang bikin angka ini
// berguna -- dua angka di layar yang sama akhirnya cerita hal yang sama.
//
// Yang SENGAJA tidak dipakai: menjumlah seluruh riwayat kartu sejak awal.
// Tagihan bulan-bulan lalu yang sudah lunas di bank sering tidak punya baris
// pembayaran di app (bayarnya lewat myBCA, bukan lewat app), jadi
// menjumlahkan semuanya bikin utang lama kehitung lagi dan hasilnya jauh
// lebih besar dari tagihan yang sebenarnya.

import { getOutstandingWindowStart, getStatementDay } from "./billingCycle";
import { findCreditCardForSource } from "./accountBalance";
import { getInstallmentBaseTitle } from "./installmentTitle";
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

export const recomputeCardUsed = (
  account,
  accounts = [],
  transactions = [],
  installments = []
) => {
  if (!account) return 0;

  // Jendela yang sama dengan daftar di bawah kartu: mulai satu siklus ke
  // belakang, supaya tagihan yang jatuh tempo dan belanja sesudahnya sama-sama
  // kelihatan.
  const windowStart = getOutstandingWindowStart(getStatementDay(account));

  const cardTransactions = transactions.filter(
    (t) =>
      t &&
      t.danaDipakai === "Spend CC" &&
      !t.paidAt &&
      t.date >= windowStart &&
      findCreditCardForSource(accounts, t.source)?.id === account.id
  );

  if (cardTransactions.length === 0) return 0;

  const cardInstallments = installments.filter(
    (i) => i && i.accountId === account.id
  );

  const parentByBaseTitle = new Map();
  cardTransactions.forEach((t) => {
    if (Number(t.installmentTotalLoan) > 0) {
      parentByBaseTitle.set(getInstallmentBaseTitle(t.title), t);
    }
  });

  const installmentByBaseTitle = new Map();
  cardInstallments.forEach((i) => {
    installmentByBaseTitle.set(getInstallmentBaseTitle(i.name), i);
  });

  const groups = new Map();
  let used = 0;

  cardTransactions.forEach((t) => {
    const baseTitle = getInstallmentBaseTitle(t.title);
    const parent = parentByBaseTitle.get(baseTitle);
    const installment = installmentByBaseTitle.get(baseTitle);

    // Baris lepas: langsung dijumlah.
    if (!parent && !installment) {
      used += signedAmount(t);
      return;
    }

    if (groups.has(baseTitle)) return;
    groups.set(baseTitle, true);

    // Cicilan dihitung dari sisa jadwalnya, bukan dari angsuran yang kebetulan
    // jatuh di jendela ini -- persis angka "Sisa Rp..." yang ditampilkan.
    // Kalau rencana cicilannya tidak ketemu, jatuh balik ke menjumlahkan
    // angsuran yang memang tampil.
    if (installment) {
      used += Number(installment.remainingBalance) || 0;
      return;
    }

    used += cardTransactions
      .filter((x) => getInstallmentBaseTitle(x.title) === baseTitle)
      .reduce((sum, x) => sum + signedAmount(x), 0);
  });

  // Utang kartu tidak pernah negatif dan tidak bisa melewati limit -- batas
  // yang sama dipakai waktu saldo digeser per transaksi.
  const totalLimit = Number(account.totalLimit) || 0;
  let result = Math.max(0, Math.round(used));
  if (totalLimit > 0) result = Math.min(totalLimit, result);
  return result;
};
