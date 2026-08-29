// Diagnostic endpoint with zero requires. If /api/ping answers but
// /api/health does not, the deployment is fine and the Express app is
// failing to load; if neither answers, the project itself is misrouted.
module.exports = (req, res) => {
    res.status(200).json({
        ok: true,
        node: process.version,
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
        allowedOrigins: process.env.ALLOWED_ORIGINS || null,
    });
};
