export const deduplicateTransactionsById = (rows) => {
    const seenIds = new Set();
    const uniqueRows = [];
    let duplicateCount = 0;

    for (const row of rows) {
        const id = String(row.id || "").trim();

        if (id && seenIds.has(id)) {
            duplicateCount += 1;
            continue;
        }

        if (id) {
            seenIds.add(id);
        }

        uniqueRows.push(row);
    }

    return { rows: uniqueRows, duplicateCount };
};

const normalizeTitle = (value) => String(value || "").trim().toLowerCase();

// Two transactions count as the same purchase when date, title and amount
// line up. Funding source is deliberately NOT compared: one purchase can
// land twice under different source labels (a Blu payment showing up as
// both "Blu" and "BCA" from two bank notifications), and that is exactly
// the double entry this exists to catch. Time is left out too: manual
// entries often have none. This is a warning, not a hard rule -- two
// identical Grab rides on one day are legitimate, so callers must let the
// user confirm and save anyway. Mirrors the SQL check in the backend's
// POST /api/transactions.
export const findDuplicateTransaction = (transactions, candidate) => {
    const title = normalizeTitle(candidate.title);
    const amount = Number(candidate.amount) || 0;

    return (
        transactions.find(
            (t) =>
                t.id !== candidate.id &&
                t.date === candidate.date &&
                normalizeTitle(t.title) === title &&
                (Number(t.amount) || 0) === amount
        ) || null
    );
};

const CATEGORY_ALIASES = {
    utility: "Utilities",
    utilities: "Utilities",
    shopping: "Shopping",
};

const SOURCE_ALIASES = {
    "credit card": "Credit Card - BCA",
    "credit card - bca": "Credit Card - BCA",
    blu: "Blu",
};

const FUND_ALIASES = {
    "basian thr": "Bagian THR",
    "bagian thr": "Bagian THR",
};

const normalizeAlias = (value, aliases, fallback) => {
    const raw = String(value || "").trim();
    return aliases[raw.toLowerCase()] || raw || fallback;
};

export const normalizeTransaction = (item) => ({
    rowNumber: Number(item.rowNumber) || 0,
    id: String(item.id || "").trim(),
    title: String(item.title || "").trim(),
    amount: Number(item.amount) || 0,
    category: normalizeAlias(item.category, CATEGORY_ALIASES, "Miscellaneous"),
    source: normalizeAlias(item.source, SOURCE_ALIASES, "Mandiri"),
    danaDipakai: normalizeAlias(
        item.danaDipakai,
        FUND_ALIASES,
        "Spend Bulanan"
    ),
    type: item.type === "income" ? "income" : "expense",
    date: item.date,
    time: item.time || "",
    createdAt: item.createdAt,
    installmentTotalLoan: item.installmentTotalLoan ?? null,
    paidAt: item.paidAt ?? null,
});
