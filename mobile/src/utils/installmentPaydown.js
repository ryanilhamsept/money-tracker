// Mirror dari src/utils/installmentPaydown.js di app web -- perilaku di dua app
// wajib sama persis, jadi hitungannya cuma ada satu dan ditaruh di sini.
//
// Sisa rencana cicilan (`remainingBalance`) selama ini cuma berubah kalau
// rencananya diedit -- dan di app nggak ada satu pun layar buat ngeditnya.
// Jadi menandai angsuran lunas nggak pernah ngurangi sisa cicilannya: tiap
// bulan angkanya makin ketinggalan dari tagihan asli di bank, dan utang kartu
// kelihatan lebih besar dari yang sebenarnya.
//
// Fungsi ini menerjemahkan "angsuran mana yang ditandai lunas" jadi "rencana
// mana yang sisanya berkurang berapa". Hasilnya sengaja dikembalikan sebagai
// daftar perubahan, bukan langsung ditulis, supaya layar konfirmasi bisa
// memperlihatkannya dulu ke yang makai -- sisa cicilan yang tersimpan sekarang
// sudah memuat sebagian pembayaran lama, jadi menandai angsuran yang memang
// sudah dihitung bakal motong dua kali. Lebih baik kelihatan sebelum ditekan.

import { getInstallmentBaseTitle } from "./installmentTitle";

export const planPaydowns = (
  selectedTransactions = [],
  installments = [],
  { paid = true } = {}
) => {
  const byBaseTitle = new Map();
  installments.forEach((plan) => {
    if (plan) byBaseTitle.set(getInstallmentBaseTitle(plan.name), plan);
  });

  const totals = new Map();
  selectedTransactions.forEach((transaction) => {
    if (!transaction) return;
    const plan = byBaseTitle.get(getInstallmentBaseTitle(transaction.title));
    if (!plan) return;

    const amount = Number(transaction.amount) || 0;
    if (amount <= 0) return;

    const current = totals.get(plan.id) || { plan, amount: 0, term: 0 };
    current.amount += amount;
    current.term += 1;
    totals.set(plan.id, current);
  });

  const sign = paid ? -1 : 1;

  return [...totals.values()].map(({ plan, amount, term }) => {
    const from = Number(plan.remainingBalance) || 0;
    const fromTerm = Number(plan.remainingTerm) || 0;
    return {
      id: plan.id,
      name: plan.name,
      from,
      to: Math.max(0, from + sign * amount),
      fromTerm,
      toTerm: Math.max(0, fromTerm + sign * term),
    };
  });
};
