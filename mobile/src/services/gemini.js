import { reviewSpendingClaude, scanReceiptClaude } from "./claude";

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
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

const scanReceiptGemini = async (base64Image, mimeType = "image/jpeg") => {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key belum di-setup.");
  }

  const prompt = `Ini foto struk/bill belanja. Baca nama tempat/merchant, daftar item yang dipesan beserta harganya masing-masing (gabungin qty ke harga, misal "2 Es Teh 10.000" jadi satu baris item seharga 20.000), dan total tagihan akhir (paling bawah/final, udah termasuk pajak/service charge kalau ada). Balas HANYA JSON persis format ini, tanpa markdown atau teks lain:
{"title": "nama tempat", "items": [{"name": "nama item", "price": harga_angka}], "subtotal": angka_subtotal, "serviceCharge": angka_service_charge, "tax": angka_pajak, "totalAmount": angka_total}.
Kalau nama tempat nggak kebaca, isi title dengan "Struk Belanja". Kalau item nggak kebaca, isi items dengan array kosong []. Kalau subtotal/serviceCharge/tax/totalAmount nggak ketemu, isi 0. Semua angka tanpa titik atau koma pemisah ribuan.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Image } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("QUOTA_EXCEEDED");
    }
    throw new Error(data?.error?.message || `Gagal scan struk (${response.status}).`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Response AI kosong, coba lagi.");

  let parsed;
  try {
    parsed = JSON.parse(text);
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

// Coba Gemini dulu -- kalau kena limit kuota harian, otomatis lanjut ke
// Claude sebagai cadangan biar AI Review / scan struk tetep jalan.
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

export const scanReceipt = async (base64Image, mimeType = "image/jpeg") => {
  try {
    return await scanReceiptGemini(base64Image, mimeType);
  } catch (err) {
    if (err.message !== "QUOTA_EXCEEDED") throw err;
    try {
      return await scanReceiptClaude(base64Image, mimeType);
    } catch (fallbackErr) {
      console.error("Claude fallback (scanReceipt) gagal:", fallbackErr);
      throw new Error(
        `Gemini kuota penuh & Claude fallback gagal: ${fallbackErr.message}`
      );
    }
  }
};
