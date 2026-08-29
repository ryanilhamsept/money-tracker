// Temporary diagnostic: loads the Express app inside a try/catch so the
// real module-load failure is visible, instead of Vercel's opaque
// FUNCTION_INVOCATION_FAILED. Delete once the cause is fixed.
module.exports = (req, res) => {
    try {
        require("../src/app");
        res.status(200).json({ ok: true, message: "app loaded fine" });
    } catch (err) {
        res.status(200).json({
            ok: false,
            name: err.name,
            code: err.code,
            message: err.message,
            requireStack: err.requireStack || null,
            stack: String(err.stack || "").split("\n").slice(0, 20),
        });
    }
};
