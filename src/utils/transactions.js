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
    date: item.date,
});
