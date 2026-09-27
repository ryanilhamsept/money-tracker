// Wraps a route handler so its try/catch + error response doesn't need to be
// repeated in every route -- logs `${label} error:` and returns 500 on throw.
const asyncHandler = (label, fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        // 23505 = pelanggaran indeks unik. Untuk transaksi itu berarti baris
        // yang sama persis sudah tersimpan -- bukan kegagalan yang perlu
        // dicoba ulang. Dijawab 409 supaya klien membuangnya dari antrian,
        // bukan 500 yang bikin dia mengulang selamanya.
        if (err.code === "23505") {
            console.warn(`${label}: duplikat ditolak indeks unik`);
            return res.status(409).json({
                success: false,
                code: "DUPLICATE_TRANSACTION",
                error: "Transaksi yang sama persis sudah ada.",
            });
        }

        console.error(`${label} error:`, err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { asyncHandler };
