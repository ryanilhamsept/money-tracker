/**
 * Logika hitung split bill.
 *
 * Diadaptasi dari github.com/0xRafie/splitbill (MIT License,
 * Copyright (c) 2026 Danish Rafie Ekaputra) -- `lib/calculator.ts` di sana.
 * Anotasi TypeScript dilepas, dan dua lubang pembagian-nol ditutup.
 * Salinan lisensi aslinya ada di LICENSES/splitbill-MIT.txt.
 *
 * File ini sengaja murni: tanpa import, tanpa React, tanpa akses jaringan.
 * Dengan begitu isinya sama persis antara web dan mobile, dan bisa diuji
 * tanpa menjalankan app.
 */

/**
 * Bagi `total` ke `count` orang tanpa ada rupiah yang hilang atau lebih.
 * Pembagian biasa menyisakan pecahan; sisanya di sini dibagikan satu-satu
 * ke orang pertama, jadi jumlah seluruh bagian selalu persis sama dengan
 * totalnya.
 */
export const distributeEvenly = (total, count) => {
  if (!count || count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
};

/** Subtotal, pajak, dan service charge untuk satu item. */
export const calculateItemTotal = (price, quantity, taxRate = 0, serviceRate = 0) => {
  const subtotal = (Number(price) || 0) * (Number(quantity) || 0);
  const tax = Math.round(subtotal * ((Number(taxRate) || 0) / 100));
  const service = Math.round(subtotal * ((Number(serviceRate) || 0) / 100));
  return { subtotal, tax, service, total: subtotal + tax + service };
};

/**
 * Porsi satu split terhadap itemnya.
 *
 * Aslinya `split.amount / itemSubtotal` tanpa penjagaan apa pun. Item gratis
 * atau qty 0 bikin pembaginya nol, hasilnya NaN, dan NaN itu menjalar sampai
 * ke total yang ditampilkan ke pengguna. Item tanpa harga tidak punya pajak
 * untuk dibagi, jadi 0 adalah jawaban yang benar.
 */
const splitRatio = (amount, itemSubtotal) =>
  itemSubtotal > 0 ? amount / itemSubtotal : 0;

/**
 * Berapa yang harus dibayar tiap orang: porsi item yang dia ambil, plus
 * pajak dan service sebanding dengan porsi itu.
 */
export const calculateParticipantTotals = (participants = [], splits = []) => {
  const byId = new Map(
    participants.map((p) => [
      p.id,
      { participantId: p.id, name: p.name, subtotal: 0, taxShare: 0, serviceShare: 0, total: 0 },
    ])
  );

  splits.forEach((split) => {
    const person = byId.get(split.participantId);
    if (!person || !split.item) return;

    const { price, quantity, taxRate, serviceRate } = split.item;
    const calc = calculateItemTotal(price, quantity, taxRate, serviceRate);
    const ratio = splitRatio(Number(split.amount) || 0, calc.subtotal);

    person.subtotal += Number(split.amount) || 0;
    person.taxShare += Math.round(calc.tax * ratio);
    person.serviceShare += Math.round(calc.service * ratio);
  });

  byId.forEach((p) => {
    p.total = p.subtotal + p.taxShare + p.serviceShare;
  });

  return Array.from(byId.values());
};

/**
 * Sederhanakan siapa bayar ke siapa.
 *
 * Tanpa ini tiap orang harus transfer ke tiap orang lain. Caranya: hitung
 * saldo bersih tiap orang (sudah bayar dikurangi tanggungan), lalu pasangkan
 * yang nombok paling besar dengan yang kurang bayar paling besar sampai
 * semuanya nol. Hasilnya jumlah transfer paling sedikit.
 */
export const calculateSimplifiedDebts = (people = []) => {
  const balances = people.map((p) => ({
    name: p.name,
    balance: Math.round((Number(p.paid) || 0) - (Number(p.total) || 0)),
  }));

  const debtors = balances.filter((b) => b.balance < 0).sort((a, b) => a.balance - b.balance);
  const creditors = balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);

  const debts = [];
  let i = 0;
  let j = 0;

  // Tiap putaran menuntaskan minimal satu sisi, jadi perulangannya pasti
  // berhenti. Pembulatan di atas menjaga saldonya bilangan bulat supaya
  // perbandingan dengan nol tidak pernah meleset karena pecahan.
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(Math.abs(debtor.balance), creditor.balance);

    if (amount > 0) debts.push({ from: debtor.name, to: creditor.name, amount });

    debtor.balance += amount;
    creditor.balance -= amount;
    if (debtor.balance === 0) i += 1;
    if (creditor.balance === 0) j += 1;
  }

  return debts;
};

/** Apakah seluruh harga item sudah dibagi habis ke peserta. */
export const validateSplitTotal = (splits = [], price = 0, quantity = 1) => {
  const expected = (Number(price) || 0) * (Number(quantity) || 0);
  const assigned = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  return { valid: assigned === expected, assigned, expected, remaining: expected - assigned };
};

/** Ringkasan seluruh bill: subtotal, pajak, service, dan grand total. */
export const calculateBillTotals = (items = []) =>
  items.reduce(
    (acc, item) => {
      const c = calculateItemTotal(item.price, item.quantity, item.taxRate, item.serviceRate);
      return {
        subtotal: acc.subtotal + c.subtotal,
        tax: acc.tax + c.tax,
        service: acc.service + c.service,
        total: acc.total + c.total,
      };
    },
    { subtotal: 0, tax: 0, service: 0, total: 0 }
  );

/**
 * Ratakan item menjadi daftar split, supaya `calculateParticipantTotals`
 * bisa membacanya. Item yang tidak ditandai siapa pun dianggap dibagi rata
 * ke semua peserta -- itu perilaku yang paling tidak mengagetkan ketika
 * seseorang lupa menandai.
 */
export const buildSplits = (items = [], participants = []) => {
  const splits = [];

  items.forEach((item) => {
    const assigned = (item.splits || []).filter((s) => Number(s.amount) > 0);

    if (assigned.length > 0) {
      assigned.forEach((s) => splits.push({ participantId: s.participantId, amount: Number(s.amount), item }));
      return;
    }

    const subtotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
    const shares = distributeEvenly(subtotal, participants.length);
    participants.forEach((p, idx) => {
      splits.push({ participantId: p.id, amount: shares[idx] || 0, item });
    });
  });

  return splits;
};
