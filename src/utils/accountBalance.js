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

const GENERIC_SOURCE_WORDS = new Set(["credit", "card", "kartu", "kredit", "cc"]);

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

const getTransactionAccountEffect = (accounts, transaction) => {
    if (!transaction) {
        return null;
    }

    const isCreditCardSpend = transaction.danaDipakai === "Spend CC" || String(transaction.source || "").toLowerCase().includes("credit card");
    
    const hasInstallmentTotal = transaction.installmentTotalLoan !== undefined && transaction.installmentTotalLoan !== null;
    const effectAmount = isCreditCardSpend && hasInstallmentTotal
        ? Number(transaction.installmentTotalLoan) || 0
        : Number(transaction.amount) || 0;
        
    const account = isCreditCardSpend
        ? findCreditCardForSource(accounts, transaction.source)
        : findAccountForSource(accounts, transaction.source);

    if (!account || effectAmount <= 0) {
        return null;
    }

    // Normal accounts: expense subtracts from balance, income adds.
    // Credit cards: expense adds to the used balance (debt owed), income/refund reduces it.
    // (Note: The sign logic is dependent on addDelta which uses -(nextEffect) so returning 1 for expense is correct)
    const sign = transaction.type === "income" ? -1 : 1;
    return { account, amount: effectAmount * sign };
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

    const previousEffect = getTransactionAccountEffect(
        accounts,
        previousTransaction
    );
    const nextEffect = getTransactionAccountEffect(accounts, nextTransaction);

    addDelta(previousEffect, previousEffect?.amount || 0);
    addDelta(nextEffect, -(nextEffect?.amount || 0));

    return [...deltas.values()].filter((delta) => delta.amount !== 0);
};

