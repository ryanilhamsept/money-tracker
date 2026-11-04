// Palet ini dicocokkan ke app web (Tailwind), supaya dua app kelihatan satu
// keluarga. Nilainya diambil langsung dari kelas yang dipakai di
// src/app/App.jsx -- kalau web berubah, ubah di sini juga.
export const colors = {
  // bg-gradient-to-br from-pink-100 via-[#f8f6ff] to-indigo-100
  bgGradient: ["#fce7f3", "#f8f6ff", "#e0e7ff"],

  // Kartu: border-white/70 bg-white/85 -- di RN alpha-nya ditulis eksplisit.
  surface: "rgba(255,255,255,0.85)",
  surfaceSolid: "#ffffff",
  surfaceBorder: "rgba(255,255,255,0.7)",
  surfaceMuted: "#f8fafc",

  // from-pink-500 to-indigo-500 (tombol utama, tab aktif)
  accent: ["#ec4899", "#6366f1"],
  // from-pink-400 to-indigo-500 (lencana kecil, avatar)
  accentSoft: ["#f472b6", "#6366f1"],
  // from-indigo-500 to-pink-400 (kartu hero)
  hero: ["#6366f1", "#f472b6"],

  text: "#0f172a",        // slate-900
  textMuted: "#64748b",   // slate-500
  textFaint: "#94a3b8",   // slate-400
  divider: "#f1f5f9",     // slate-100
  border: "#e2e8f0",      // slate-200

  positive: "#10b981",
  positiveSoft: "#a7f3d0",
  negative: "#e11d48",
  negativeSoft: "#fecdd3",
};

// rounded-[2rem] / rounded-[1.75rem] / rounded-2xl / rounded-xl
export const radius = { xl: 32, lg: 28, md: 16, sm: 12, pill: 999 };

// shadow-xl, diterjemahkan ke shadow RN.
export const shadow = {
  card: {
    shadowColor: "#4c1d95",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  raised: {
    shadowColor: "#4c1d95",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
};
