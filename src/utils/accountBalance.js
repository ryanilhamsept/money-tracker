const normalizeName = (value) => String(value || "").trim().toLowerCase();

const findAccountForSource = (accounts, source) => {
    const normalizedSource = normalizeName(source);

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

const tokenize = (str) =>
    String(str || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

const GENERIC_SOURCE_WORDS = new Set(["credit", "card", "kartu", "kredit", "cc", "bayar"]);

// "Spend CC" transactions (and "Bayar CC" titles) don't necessarily name the
// card exactly (e.g. source "Credit Card - BCA" / title "Bayar CC BCA" vs
// account name "CC BCA"), so match loosely by shared keyword (e.g. "bca")
// among the Kartu Kredit accounts.
export const findCreditCardForSource = (accounts, source) => {
    const creditCardAccounts = accounts.filter(
        (account) => normalizeName(account.type) === "kartu kredit"
    );

    const exactMatch = findAccountForSource(creditCardAccounts, source);
    if (exactMatch) return exactMatch;

    const sourceTokens = tokenize(source).filter(
        (token) => !GENERIC_SOURCE_WORDS.has(token)
    );
    if (sourceTokens.length === 0) return null;

    return (
        creditCardAccounts.find((account) => {
            const nameTokens = tokenize(account.name);
            return sourceTokens.some((token) => nameTokens.includes(token));
        }) || null
    );
};

// Returns a list of {account, amount} effects for a single transaction.
// Most transactions touch exactly one account; "Bayar CC" touches two (the
// paying account loses cash, the card's used balance goes down).
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

        // Cash leaves the paying account like a normal expense.
        const payingAccount = findAccountForSource(accounts, transaction.source);
        if (payingAccount) {
            const sign = isIncome ? -1 : 1;
            effects.push({ account: payingAccount, amount: amount * sign });
        }

        // Paying the bill reduces the card's used balance -- same sign as a
        // normal account expense (opposite direction of a Spend CC purchase).
        // Card is identified from the title (e.g. "Bayar CC BCA") since
        // danaDipakai alone doesn't say which card.
        const targetCard = findCreditCardForSource(accounts, transaction.title);
        if (targetCard) {
            const sign = isIncome ? -1 : 1;
            effects.push({ account: targetCard, amount: amount * sign });
        }

        return effects;
    }

    const isCreditCardSpend =
        transaction.danaDipakai === "Spend CC" ||
        String(transaction.source || "").toLowerCase().includes("credit card");

    // The parent cicilan transaction's own `amount` is its first month's
    // installment charge, same as any other child payment -- it must count
    // toward the card's used balance too. `installments.totalLoan` is only
    // ever used for the separate "Sisa Rp.../dari Rp..." display, so nothing
    // else applies the full loan amount to the balance; excluding the parent
    // here used to just silently drop its first payment from "Used".

    const account = isCreditCardSpend
        ? findCreditCardForSource(accounts, transaction.source)
        : findAccountForSource(accounts, transaction.source);

    if (!account || amount <= 0) return [];

    // Normal accounts: expense subtracts from balance, income adds.
    // Credit cards: expense adds to the used balance (debt owed), income/refund reduces it.
    const sign = isCreditCardSpend
        ? (isIncome ? 1 : -1)
        : (isIncome ? -1 : 1);

    return [{ account, amount: amount * sign }];
};

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
