const SUPABASE_URL = process.env.SUPABASE_URL;

// Refuse to boot in production without SUPABASE_URL -- otherwise a missing
// env var silently disables auth and every request runs as "dev-user".
if (!SUPABASE_URL && process.env.NODE_ENV === "production") {
    throw new Error(
        "SUPABASE_URL is required when NODE_ENV=production (auth bypass is only allowed in dev)."
    );
}

// `jose` v6 is ESM-only. Node 22+ lets CommonJS require() an ES module, but
// Vercel's runtime does not, so it is pulled in with a dynamic import()
// instead -- the one form that works in both. Loaded once and reused.
let josePromise = null;
const loadJose = () => (josePromise ||= import("jose"));

let jwksPromise = null;
const loadJwks = () => {
    jwksPromise ||= loadJose().then(({ createRemoteJWKSet }) =>
        createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
    );
    return jwksPromise;
};

/**
 * JWT auth middleware — verifies Supabase-issued JWTs against the project's
 * public JWKS (ES256 signing keys). If SUPABASE_URL is empty, auth is
 * skipped (dev mode only; production boot fails above instead).
 */
const authMiddleware = async (req, res, next) => {
    if (!SUPABASE_URL) {
        console.warn("⚠️ SUPABASE_URL not set — auth bypassed (dev mode)");
        req.userId = "dev-user";
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing authorization header" });
    }

    const token = authHeader.slice(7);

    try {
        const [{ jwtVerify }, JWKS] = await Promise.all([loadJose(), loadJwks()]);

        const { payload } = await jwtVerify(token, JWKS, {
            issuer: `${SUPABASE_URL}/auth/v1`,
        });

        if (!payload.sub) throw new Error("Missing sub claim");

        req.userId = payload.sub;
        next();
    } catch (err) {
        return res.status(401).json({ error: err.message });
    }
};

module.exports = { authMiddleware };
