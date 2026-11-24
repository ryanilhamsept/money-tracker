// Dicerminkan di mobile/src/utils/creditCardUsed.js -- angka kartu di dua app
// wajib sama persis, jadi hitungannya cuma ada satu dan ditaruh di sini.
//
// "Used" di kartu kredit itu penghitung TERSIMPAN: dia cuma bergerak waktu ada
// transaksi ditambah/diubah/dihapus lewat app atau importir. Sekali saja ada
// yang lewat jalur lain -- baris yang sumbernya nyasar ke rekening debit,
// baris yang dihapus langsung di database, saldo yang diketik manual, atau
// tombol Bayar Tagihan yang motong saldonya di server tanpa app ikut tahu --
// angkanya melenceng, dan tidak ada apa pun yang akan membetulkannya sendiri.
//
// Padahal daftar "Riwayat Transaksi" di bawah kartu justru dihitung ulang tiap
// kali dirender. Jadi dua angka di layar yang sama bisa cerita beda, dan yang
// salah selalu yang di atas.
//
// Fungsi ini menghitung ulang utang kartu dari barisnya sendiri, pakai aturan
// yang sama persis dengan accountBalance.js supaya hasilnya bukan tafsiran
// kedua: belanja kartu nambah, refund dan pembayaran ngurangi, angsuran yang
// sudah dilunasi tidak dihitung.

import { findCreditCardForSource } from "./accountBalance";
import { isCcBillPayment } from "./report";

export const recomputeCardUsed = (account, accounts = [], transactions = []) => {
  if (!account) return 0;

  let used = 0;

  transactions.forEach((transaction) => {
    if (!transaction) return;
    // Angsuran yang sudah ditandai lunas berhenti membebani kartu -- barisnya
    // tetap ada di riwayat, cuma efeknya yang dinolkan. Sama seperti di
    // accountBalance.js.
    if (transaction.paidAt) return;

    const amount = Number(transaction.amount) || 0;
    if (amount <= 0) return;

    const isIncome = transaction.type === "income";

    if (isCcBillPayment(transaction)) {
      // Dua jalur ini TIDAK boleh ditukar atau dijadikan cadangan satu sama
      // lain. Baris yang ditulis tangan menyebut kartunya di judul ("Bayar CC
      // BCA") sementara sumbernya rekening yang membayar -- dan sumber "BCA"
      // itu cocok ke kartu "CC BCA" kalau ikut dicoba, jadi "Bayar CC BNI"
      // yang dibayar dari BCA malah ngurangin utang kartu BCA. Sebaliknya
      // baris dari tombol Bayar Tagihan judulnya cuma "CC Payment", tidak
      // menyebut kartu sama sekali, dan justru sumbernya yang berisi nama
      // kartunya.
      const fromButton =
        String(transaction.category || "").trim().toLowerCase() === "pembayaran cc";
      const paidCard = fromButton
        ? findCreditCardForSource([account], transaction.source)
        : findCreditCardForSource([account], transaction.title);
      if (paidCard) used += isIncome ? amount : -amount;
      return;
    }

    const isCardSpend =
      transaction.danaDipakai === "Spend CC" ||
      String(transaction.source || "").toLowerCase().includes("credit card");
    if (!isCardSpend) return;

    const card = findCreditCardForSource(accounts, transaction.source);
    if (!card || card.id !== account.id) return;

    used += isIncome ? -amount : amount;
  });

  // Utang kartu tidak pernah negatif dan tidak bisa melewati limit -- batas
  // yang sama dipakai waktu saldo digeser per transaksi.
  const totalLimit = Number(account.totalLimit) || 0;
  let result = Math.max(0, Math.round(used));
  if (totalLimit > 0) result = Math.min(totalLimit, result);
  return result;
};
