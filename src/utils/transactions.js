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
