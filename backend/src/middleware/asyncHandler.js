// Wraps a route handler so its try/catch + error response doesn't need to be
// repeated in every route -- logs `${label} error:` and returns 500 on throw.
const asyncHandler = (label, fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        console.error(`${label} error:`, err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { asyncHandler };
