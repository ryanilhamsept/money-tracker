const normalizeName = (value) => String(value || "").trim().toLowerCase();

const GENERIC_SOURCE_WORDS = new Set(["credit", "card", "kartu", "kredit", "cc", "bayar"]);

const tokenize = (value) =>
  normalizeName(value)
    .split(/[\s-]+/)
    .filter((token) => token && !GENERIC_SOURCE_WORDS.has(token));

const findAccountForSource = (accounts, source) => {
  const normalizedSource = normalizeName(source);
  if (!normalizedSource) return null;

  const exactMatch = accounts.find(
    (account) => normalizeName(account.name) === normalizedSource
  );

  if (exactMatch) return exactMatch;

  if (normalizedSource === "blu") {
    return accounts.find((account) =>
      normalizeName(account.name).includes("blu")
    );
  }

  return null;
};

// Transaksi "Spend CC" (dan judul "Bayar CC ...") belum tentu nyebut nama
// kartu persis (mis. source "Credit Card - BCA" vs nama akun "CC BCA"), jadi
// dicocokin longgar lewat kata kunci yang sama (mis. "bca") di antara akun
// bertipe Kartu Kredit.
const findCreditCardForSource = (accounts, source) => {
  const creditCardAccounts = accounts.filter(
    (account) => normalizeName(account.type) === "kartu kredit"
  );

  const exactMatch = findAccountForSource(creditCardAccounts, source);
  if (exactMatch) return exactMatch;

  const sourceTokens = tokenize(source);
  if (sourceTokens.length === 0) return null;

  return (
    creditCardAccounts.find((account) => {
      const nameTokens = tokenize(account.name);
      return sourceTokens.some((token) => nameTokens.includes(token));
    }) || null
  );
};

// Balikin daftar {account, amount} buat satu transaksi. Kebanyakan transaksi
// cuma nyentuh 1 akun; "Bayar CC ..." nyentuh 2 (akun pembayar kepotong,
// limit kartu ke-lunasin).
const getTransactionAccountEffects = (accounts, transaction) => {
  if (!transaction) return [];

  const amount = Number(transaction.amount) || 0;
  if (amount <= 0) return [];

  const isIncome = transaction.type === "income";

  const isCcBillPayment = String(transaction.title || "")
    .trim()
    .toLowerCase()
    .startsWith("bayar cc");

  if (isCcBillPayment) {
    const effects = [];

    // Uang keluar dari akun pembayar kayak expense biasa.
    const payingAccount = findAccountForSource(accounts, transaction.source);
    if (payingAccount) {
      const sign = isIncome ? -1 : 1;
      effects.push({ account: payingAccount, amount: amount * sign });
    }

    // Bayar tagihan ngurangin saldo terpakai kartu -- tanda sama kayak
    // expense di akun biasa (kebalikan dari transaksi Spend CC). Kartunya
    // dikenali dari judul (mis. "Bayar CC BCA") karena danaDipakai aja
    // gak nyebut kartu mana.
    const targetCard = findCreditCardForSource(accounts, transaction.title);
    if (targetCard) {
      const sign = isIncome ? -1 : 1;
      effects.push({ account: targetCard, amount: amount * sign });
    }

    return effects;
  }

  const isCreditCardSpend = transaction.danaDipakai === "Spend CC";

  // Buat cicilan, amount transaksi = cicilan bulanan (kecatet sebagai
  // spending bulan ini), tapi limit kartu kepotong sebesar harga barang
  // penuh (installmentTotalLoan) sejak awal.
  const hasInstallmentTotal =
    transaction.installmentTotalLoan !== undefined &&
    transaction.installmentTotalLoan !== null;
  const effectAmount =
    isCreditCardSpend && hasInstallmentTotal
      ? Number(transaction.installmentTotalLoan) || 0
      : amount;

  const account = isCreditCardSpend
    ? findCreditCardForSource(accounts, transaction.source)
    : findAccountForSource(accounts, transaction.source);

  if (!account || effectAmount <= 0) return [];

  // Akun biasa: expense ngurangin saldo, income nambah.
  // Kartu kredit: expense nambah saldo terpakai (utang), income/refund ngurangin.
  const sign = isCreditCardSpend
    ? (isIncome ? 1 : -1)
    : (isIncome ? -1 : 1);

  return [{ account, amount: effectAmount * sign }];
};

// Sama persis logic-nya sama src/utils/accountBalance.js di app web,
// biar saldo akun konsisten di kedua platform.
export const getAccountBalanceDeltas = (
  accounts,
  previousTransaction,
  nextTransaction
) => {
  const deltas = new Map();

  const addDelta = (effect, amount) => {
    if (!effect) return;

    const current = deltas.get(effect.account.id) || {
      account: effect.account,
      amount: 0,
    };

    current.amount += amount;
    deltas.set(effect.account.id, current);
  };

  const previousEffects = getTransactionAccountEffects(
    accounts,
    previousTransaction
  );
  const nextEffects = getTransactionAccountEffects(accounts, nextTransaction);

  previousEffects.forEach((effect) => addDelta(effect, effect.amount));
  nextEffects.forEach((effect) => addDelta(effect, -effect.amount));

  return [...deltas.values()].filter((delta) => delta.amount !== 0);
};
