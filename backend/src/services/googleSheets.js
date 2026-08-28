/**
 * Google Sheets mirroring service.
 * Fire-and-forget — errors are logged but never block the caller.
 */
const mirrorToGoogleSheet = (payload) => {
    const apiUrl = process.env.GOOGLE_SHEET_API_URL;
    if (!apiUrl) return;

    const token = process.env.GOOGLE_SHEET_API_TOKEN;

    fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
    }).catch((err) => {
        console.error("[google-sheets] mirror error:", err.message);
    });
};

module.exports = { mirrorToGoogleSheet };
