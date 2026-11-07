/**
 * Klien API ke backend Express, cerminan dari `src/services/api.js` di web.
 *
 * Dipakai buat hal-hal yang kuncinya nggak boleh ada di HP. Variabel
 * `EXPO_PUBLIC_*` itu ditanam mentah ke dalam bundle waktu build, jadi siapa
 * pun yang nge-unzip APK bisa baca isinya -- itu sebabnya kunci Gemini dan
 * Claude sekarang tinggal di server, dan app cuma manggil endpoint-nya.
 *
 * Data biasa (transaksi, akun, dll) masih lewat Supabase langsung dan
 * dijaga RLS; yang pindah ke sini baru yang memang butuh kunci rahasia.
 */

import { supabase } from "./supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const getToken = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || "";
};

const apiFetch = async (path, options = {}) => {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_API_URL belum di-setup.");
  }

  const token = await getToken();
  if (!token) {
    throw new Error("Sesi kamu sudah habis, coba login ulang.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Body bukan JSON -- pakai pesan generik di bawah.
  }

  if (!response.ok) {
    const error = new Error(body?.error || `Request gagal (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  return body;
};

/**
 * AI review pengeluaran bulanan. Pemilihan model dan fallback Gemini -> Claude
 * dikerjakan di server (`backend/src/services/ai.js`), sama persis seperti web.
 */
export const reviewSpending = async (summary) => {
  const { review } = await apiFetch("/api/ai/review", {
    method: "POST",
    body: JSON.stringify(summary),
  });

  if (!review) throw new Error("Response AI kosong, coba lagi.");
  return review.trim();
};
