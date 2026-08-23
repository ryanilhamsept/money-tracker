const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
const CLAUDE_MODEL = "claude-sonnet-5";

const extractJson = (text) => {
  const cleaned = text
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned);
};

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

export const scanReceiptClaude = async (base64Image, mimeType = "image/jpeg") => {
  const prompt = `Ini foto struk/bill belanja. Baca nama tempat/merchant, daftar item yang dipesan beserta harganya masing-masing (gabungin qty ke harga, misal "2 Es Teh 10.000" jadi satu baris item seharga 20.000), dan total tagihan akhir (paling bawah/final, udah termasuk pajak/service charge kalau ada). Balas HANYA JSON persis format ini, tanpa markdown atau teks lain:
{"title": "nama tempat", "items": [{"name": "nama item", "price": harga_angka}], "subtotal": angka_subtotal, "serviceCharge": angka_service_charge, "tax": angka_pajak, "totalAmount": angka_total}.
Kalau nama tempat nggak kebaca, isi title dengan "Struk Belanja". Kalau item nggak kebaca, isi items dengan array kosong []. Kalau subtotal/serviceCharge/tax/totalAmount nggak ketemu, isi 0. Semua angka tanpa titik atau koma pemisah ribuan.`;

  const text = await callClaude([
    { type: "text", text: prompt },
    { type: "image", source: { type: "base64", media_type: mimeType, data: base64Image } },
  ]);

  let parsed;
  try {
    parsed = extractJson(text);
  } catch (err) {
    throw new Error("Gagal baca hasil scan, coba foto yang lebih jelas.");
  }

  return {
    title: String(parsed.title || "Struk Belanja"),
    items: Array.isArray(parsed.items)
      ? parsed.items
          .filter((it) => it && it.name)
          .map((it) => ({ name: String(it.name), price: Number(it.price) || 0 }))
      : [],
    subtotal: Number(parsed.subtotal) || 0,
    serviceCharge: Number(parsed.serviceCharge) || 0,
    tax: Number(parsed.tax) || 0,
    totalAmount: Number(parsed.totalAmount) || 0,
  };
};
