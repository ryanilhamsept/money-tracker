const { createRemoteJWKSet, jwtVerify } = require("jose");

const SUPABASE_URL = process.env.SUPABASE_URL;

const JWKS = SUPABASE_URL
    ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
    : null;

/**
 * JWT auth middleware — verifies Supabase-issued JWTs against the project's
 * public JWKS (ES256 signing keys). If SUPABASE_URL is empty, auth is
 * skipped (dev mode).
 */
const authMiddleware = async (req, res, next) => {
    if (!JWKS) {
        req.userId = "dev-user";
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing authorization header" });
    }

    const token = authHeader.slice(7);

    try {
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
