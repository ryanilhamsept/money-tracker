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
