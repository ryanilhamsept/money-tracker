const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY;
const CLAUDE_MODEL = "claude-sonnet-5";

const callClaude = async (contentBlocks) => {
    if (!CLAUDE_API_KEY) {
        throw new Error("Claude API key belum di-setup.");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": CLAUDE_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            messages: [{ role: "user", content: contentBlocks }],
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data?.error?.message || `Gagal panggil Claude (${response.status}).`);
    }

    const text = data?.content?.[0]?.text;
    if (!text) throw new Error("Response Claude kosong, coba lagi.");
    return text.trim();
};

export const reviewSpendingClaude = async (summary) => {
    const prompt = `Kamu adalah asisten keuangan pribadi yang santai tapi tajam. Berikut ringkasan pengeluaran bulan ${summary.monthLabel}:
- Total pengeluaran: Rp${summary.total}
- Budget manual: Rp${summary.budget}
- Sisa budget (Spend Bulanan): Rp${summary.leftBudget}
- Breakdown kategori (dari terbesar): ${summary.categoryBreakdown}
- Transaksi terbesar: ${summary.highestTransaction}
- Dibanding bulan lalu: ${summary.comparisonText}

Kasih review singkat (maksimal 4 kalimat, bahasa Indonesia santai kayak ngobrol, bukan formal) soal pola pengeluaran ini, plus 1 saran praktis yang bisa langsung dipakai bulan depan. Jangan pakai markdown, bullet, atau heading -- langsung satu paragraf ngalir aja.`;

    return callClaude([{ type: "text", text: prompt }]);
};

export const replyToReviewClaude = async (summary, previousReview, userComment) => {
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

    return callClaude([{ type: "text", text: prompt }]);
};
