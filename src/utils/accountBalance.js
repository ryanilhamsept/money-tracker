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

const getTransactionAccountEffect = (accounts, transaction) => {
    if (!transaction || transaction.danaDipakai === "Spend CC") {
        return null;
    }

    const amount = Number(transaction.amount) || 0;
    const account = findAccountForSource(accounts, transaction.source);

    if (!account || amount <= 0) {
        return null;
    }

    return { account, amount };
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

    // Revert the previous transaction, then apply the next transaction.
    addDelta(previousEffect, previousEffect?.amount || 0);
    addDelta(nextEffect, -(nextEffect?.amount || 0));

    return [...deltas.values()].filter((delta) => delta.amount !== 0);
};
