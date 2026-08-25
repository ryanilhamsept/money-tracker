const normalizeName = (value) => String(value || "").trim().toLowerCase();

const GENERIC_SOURCE_WORDS = new Set(["credit", "card", "kartu", "kredit", "cc"]);

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

// Transaksi "Spend CC" belum tentu nyebut nama kartu persis (mis. source
// "Credit Card - BCA" vs nama akun "CC BCA"), jadi dicocokin longgar lewat
// kata kunci yang sama (mis. "bca") di antara akun bertipe Kartu Kredit.
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

const getTransactionAccountEffect = (accounts, transaction) => {
  if (!transaction) return null;

  const amount = Number(transaction.amount) || 0;
  if (amount <= 0) return null;

  const isCreditCardSpend = transaction.danaDipakai === "Spend CC";
  const account = isCreditCardSpend
    ? findCreditCardForSource(accounts, transaction.source)
    : findAccountForSource(accounts, transaction.source);

  if (!account) return null;

  // Akun biasa: expense ngurangin saldo, income nambah.
  // Kartu kredit: expense nambah saldo terpakai (utang), income/refund ngurangin.
  const sign = isCreditCardSpend
    ? (transaction.type === "income" ? 1 : -1)
    : (transaction.type === "income" ? -1 : 1);

  return { account, amount: amount * sign };
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

  const previousEffect = getTransactionAccountEffect(
    accounts,
    previousTransaction
  );
  const nextEffect = getTransactionAccountEffect(accounts, nextTransaction);

  addDelta(previousEffect, previousEffect?.amount || 0);
  addDelta(nextEffect, -(nextEffect?.amount || 0));

  return [...deltas.values()].filter((delta) => delta.amount !== 0);
};
