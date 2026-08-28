/**
 * AI service — Gemini primary + Claude fallback.
 * Same prompt logic as the original frontend code.
 */

const GEMINI_API_KEY = () => process.env.GEMINI_API_KEY;
const CLAUDE_API_KEY = () => process.env.CLAUDE_API_KEY;

// --- Gemini ---
async function callGemini(prompt) {
    const key = GEMINI_API_KEY();
    if (!key) throw new Error("Gemini API key not configured");

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
            }),
        }
    );

    if (res.status === 429) throw new Error("QUOTA_EXCEEDED");

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data?.error?.message || `Gemini error (${res.status})`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini response kosong");

    return text.trim();
}

// --- Claude ---
async function callClaude(prompt) {
    const key = CLAUDE_API_KEY();
    if (!key) throw new Error("Claude API key not configured");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: "claude-sonnet-5",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
        }),
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data?.error?.message || `Claude error (${res.status})`);
    }

    const text = data?.content?.[0]?.text;
    if (!text) throw new Error("Claude response kosong");

    return text.trim();
}

// --- Public API ---

async function callAI(prompt) {
    // Try Gemini first
    if (GEMINI_API_KEY()) {
        try {
            return await callGemini(prompt);
        } catch (err) {
            if (err.message !== "QUOTA_EXCEEDED") throw err;
            // Fall through to Claude
        }
    }

    // Fallback to Claude
    if (CLAUDE_API_KEY()) {
        return await callClaude(prompt);
    }

    throw new Error("No AI API key configured");
}

async function reviewSpending(summary) {
    const prompt = `Kamu adalah asisten keuangan pribadi yang santai tapi tajam. Berikut ringkasan pengeluaran bulan ${summary.monthLabel}:
- Total pengeluaran: Rp${summary.total}
- Budget manual: Rp${summary.budget}
- Sisa budget (Spend Bulanan): Rp${summary.leftBudget}
- Breakdown kategori (dari terbesar): ${summary.categoryBreakdown}
- Transaksi terbesar: ${summary.highestTransaction}
- Dibanding bulan lalu: ${summary.comparisonText}

Kasih review singkat (maksimal 4 kalimat, bahasa Indonesia santai kayak ngobrol, bukan formal) soal pola pengeluaran ini, plus 1 saran praktis yang bisa langsung dipakai bulan depan. Jangan pakai markdown, bullet, atau heading -- langsung satu paragraf ngalir aja.`;

    return callAI(prompt);
}

async function replyToReview(summary, previousReview, userComment) {
    const prompt = `Kamu adalah asisten keuangan pribadi yang santai tapi tajam. Sebelumnya kamu kasih review soal pengeluaran bulan ${summary.monthLabel} ke user:
"${previousReview}"

Konteks data pengeluaran:
- Total pengeluaran: Rp${summary.total}
- Budget manual: Rp${summary.budget}
- Sisa budget (Spend Bulanan): Rp${summary.leftBudget}
- Breakdown kategori (dari terbesar): ${summary.categoryBreakdown}
- Transaksi terbesar: ${summary.highestTransaction}
- Dibanding bulan lalu: ${summary.comparisonText}

User membalas/menanggapi review kamu tadi dengan komentar ini:
"${userComment}"

Tanggapi komentar user tersebut secara singkat (maksimal 3 kalimat, bahasa Indonesia santai kayak ngobrol). Kalau user mengoreksi konteks yang kamu lewatkan, akui itu dan sesuaikan pendapatmu. Kalau user cuma nanya, jawab langsung. Jangan pakai markdown, bullet, atau heading -- langsung satu paragraf ngalir aja.`;

    return callAI(prompt);
}

module.exports = { reviewSpending, replyToReview };
