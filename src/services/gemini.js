import { reviewSpendingClaude, replyToReviewClaude } from "./claude";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = "gemini-3.6-flash";

const reviewSpendingGemini = async (summary) => {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key belum di-setup.");
    }

    const prompt = `Kamu adalah asisten keuangan pribadi yang santai tapi tajam. Berikut ringkasan pengeluaran bulan ${summary.monthLabel}:
- Total pengeluaran: Rp${summary.total}
- Budget manual: Rp${summary.budget}
- Sisa budget (Spend Bulanan): Rp${summary.leftBudget}
- Breakdown kategori (dari terbesar): ${summary.categoryBreakdown}
- Transaksi terbesar: ${summary.highestTransaction}
- Dibanding bulan lalu: ${summary.comparisonText}

Kasih review singkat (maksimal 4 kalimat, bahasa Indonesia santai kayak ngobrol, bukan formal) soal pola pengeluaran ini, plus 1 saran praktis yang bisa langsung dipakai bulan depan. Jangan pakai markdown, bullet, atau heading -- langsung satu paragraf ngalir aja.`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
            }),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        if (response.status === 429) {
            throw new Error("QUOTA_EXCEEDED");
        }
        throw new Error(data?.error?.message || `Gagal generate review (${response.status}).`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Response AI kosong, coba lagi.");

    return text.trim();
};

// Coba Gemini dulu -- kalau kena limit kuota harian, otomatis lanjut ke
// Claude sebagai cadangan. Catatan: di browser, Claude API kena CORS block
// (Anthropic sengaja nolak request langsung dari web), jadi fallback ini
// baru beneran jalan kalau nanti dipanggil lewat backend/proxy.
export const reviewSpending = async (summary) => {
    try {
        return await reviewSpendingGemini(summary);
    } catch (err) {
        if (err.message !== "QUOTA_EXCEEDED") throw err;
        try {
            return await reviewSpendingClaude(summary);
        } catch (fallbackErr) {
            console.error("Claude fallback (reviewSpending) gagal:", fallbackErr);
            throw new Error(
                `Gemini kuota penuh & Claude fallback gagal: ${fallbackErr.message}`
            );
        }
    }
};

const replyToReviewGemini = async (summary, previousReview, userComment) => {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key belum di-setup.");
    }

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

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
            }),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        if (response.status === 429) {
            throw new Error("QUOTA_EXCEEDED");
        }
        throw new Error(data?.error?.message || `Gagal kirim balasan (${response.status}).`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Response AI kosong, coba lagi.");

    return text.trim();
};

export const replyToReview = async (summary, previousReview, userComment) => {
    try {
        return await replyToReviewGemini(summary, previousReview, userComment);
    } catch (err) {
        if (err.message !== "QUOTA_EXCEEDED") throw err;
        try {
            return await replyToReviewClaude(summary, previousReview, userComment);
        } catch (fallbackErr) {
            console.error("Claude fallback (replyToReview) gagal:", fallbackErr);
            throw new Error(
                `Gemini kuota penuh & Claude fallback gagal: ${fallbackErr.message}`
            );
        }
    }
};
