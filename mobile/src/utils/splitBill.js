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

/**
 * Biaya tambahan disimpan di tiap item (tabelnya tidak punya kolom khusus),
 * tapi nilainya berlaku untuk seluruh bill. Diambil dari item pertama.
 *
 * Tiap biaya punya dua cara pakai. "percent" untuk struk yang menyebut
 * tarifnya, "amount" untuk struk yang cuma menulis nominalnya -- dan itu
 * yang lebih sering kejadian: orang lihat "PPN Rp 11.000" tanpa tahu
 * persennya berapa.
 */
/** Subtotal, pajak, dan service untuk satu item berdiri sendiri. */
export const calculateItemTotal = (price, quantity, taxRate = 0, serviceRate = 0) => {
  const subtotal = (Number(price) || 0) * (Number(quantity) || 0);
  const tax = Math.round(subtotal * ((Number(taxRate) || 0) / 100));
  const service = Math.round(subtotal * ((Number(serviceRate) || 0) / 100));
  return { subtotal, tax, service, total: subtotal + tax + service };
};

/** Total bobot yang sudah diberikan pada sebuah item. */
export const portionsAssigned = (item) =>
  (item?.splits || []).reduce((sum, s) => sum + (Number(s.portions) || 0), 0);

export const billCharges = (items = []) => {
  const first = items[0] || {};
  return {
    taxMode: first.taxMode === "amount" ? "amount" : "percent",
    taxRate: Number(first.taxRate) || 0,
    taxAmount: Number(first.taxAmount) || 0,
    serviceMode: first.serviceMode === "amount" ? "amount" : "percent",
    serviceRate: Number(first.serviceRate) || 0,
    serviceAmount: Number(first.serviceAmount) || 0,
  };
};

const subtotalOf = (items = []) =>
  items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);

/** Subtotal, pajak, service, dan total seluruh bill. */
export const calculateBillTotals = (items = []) => {
  const subtotal = subtotalOf(items);
  const c = billCharges(items);
  const tax =
    c.taxMode === "amount" ? Math.round(c.taxAmount) : Math.round(subtotal * (c.taxRate / 100));
  const service =
    c.serviceMode === "amount"
      ? Math.round(c.serviceAmount)
      : Math.round(subtotal * (c.serviceRate / 100));
  return { subtotal, tax, service, total: subtotal + tax + service };
};

/**
 * Bagian tiap orang dari harga barangnya saja, belum termasuk biaya.
 * Dihitung per item lalu dijumlahkan.
 */
const subtotalPerParticipant = (participants = [], items = []) => {
  const out = new Map(participants.map((p) => [p.id, 0]));

  items.forEach((item) => {
    const list = (item.splits || []).filter((s) => Number(s.portions) > 0);
    const effective = list.length ? list : splitEvenly(item, participants);
    if (!effective.length) return;

    const itemSubtotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
    const shares = distributeByWeight(
      itemSubtotal,
      effective.map((s) => Number(s.portions) || 0)
    );

    effective.forEach((s, i) => {
      if (!out.has(s.participantId)) return;
      out.set(s.participantId, out.get(s.participantId) + shares[i]);
    });
  });

  return out;
};

/**
 * Berapa yang harus dibayar tiap orang.
 *
 * Pajak dan service dibagikan sekali saja dari angka total bill, sebanding
 * dengan harga barang yang diambil masing-masing. Versi sebelumnya
 * membulatkan pajak tiap orang sendiri-sendiri, dan tiga orang berbagi PPN
 * 11.000 masing-masing jadi 3.667 -- berjumlah 11.001, satu rupiah lebih
 * banyak dari pajak yang sebenarnya. Dibagikan dari totalnya, selisih itu
 * tidak mungkin muncul.
 */
export const calculateParticipantTotals = (participants = [], items = []) => {
  const subtotals = subtotalPerParticipant(participants, items);
  const { tax, service } = calculateBillTotals(items);

  const weights = participants.map((p) => subtotals.get(p.id) || 0);
  const taxes = distributeByWeight(tax, weights);
  const services = distributeByWeight(service, weights);

  return participants.map((p, i) => {
    const subtotal = subtotals.get(p.id) || 0;
    return {
      participantId: p.id,
      name: p.name,
      subtotal,
      taxShare: taxes[i],
      serviceShare: services[i],
      total: subtotal + taxes[i] + services[i],
    };
  });
};

/** Berapa orang yang kebagian item ini. */
export const takerCount = (item) =>
  (item?.splits || []).filter((s) => Number(s.portions) > 0).length;

/** Sudah ada yang ambil bagian. */
export const isAssigned = (item) => portionsAssigned(item) > 0;

/**
 * Bagi sejumlah uang menurut bobot, tanpa ada rupiah yang hilang.
 *
 * Pembagian berbobot hampir selalu menyisakan pecahan. Di sini tiap orang
 * dapat bagian bulatnya dulu, lalu sisa rupiahnya diberikan ke yang
 * pecahannya paling besar -- jadi jumlah seluruh bagian selalu persis sama
 * dengan totalnya, bukan kurang satu-dua rupiah.
 */
export const distributeByWeight = (total, weights = []) => {
  const sum = weights.reduce((a, b) => a + (Number(b) || 0), 0);
  if (sum <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (total * (Number(w) || 0)) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);

  const byFraction = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < byFraction.length && left > 0; k += 1, left -= 1) {
    out[byFraction[k].i] += 1;
  }
  return out;
};

/**
 * Bagi rata sebuah item ke semua peserta: satu bobot untuk masing-masing.
 *
 * Sengaja TIDAK membagi jumlah satuannya. Satu nasi goreng untuk bertiga
 * tidak bisa dipecah jadi tiga satuan, tapi harganya jelas bisa dibagi
 * tiga -- dan itu yang orang maksud waktu bilang "bagi rata".
 */
export const splitEvenly = (item, participants = []) =>
  participants.map((p) => ({ participantId: p.id, portions: 1 }));

/** Bagian rupiah tiap orang untuk satu item, buat ditampilkan di barisnya. */
export const itemShares = (item, participants = []) => {
  const list = (item.splits || []).filter((s) => Number(s.portions) > 0);
  const effective = list.length ? list : splitEvenly(item, participants);
  const itemSubtotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
  const shares = distributeByWeight(
    itemSubtotal,
    effective.map((s) => Number(s.portions) || 0)
  );
  const out = new Map();
  effective.forEach((s, i) => out.set(s.participantId, shares[i]));
  return out;
};

/** Ringkasan "apa aja yang dia ambil", buat ditampilkan di struk. */
export const describeParticipantItems = (participantId, items = [], participants = []) =>
  items
    .map((item) => {
      const list = (item.splits || []).filter((s) => Number(s.portions) > 0);
      const effective = list.length ? list : splitEvenly(item, participants);
      const mine = effective.find((s) => s.participantId === participantId);
      return mine ? `${mine.portions} ${item.name}` : null;
    })
    .filter(Boolean)
    .join(" + ");

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
