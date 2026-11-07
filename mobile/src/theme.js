import { Platform, StatusBar } from "react-native";

// Palet gelap. Warna dasarnya #053E62 -- biru laut gelap yang diminta.
// Aturannya: latar paling gelap, kartu selalu selangkah lebih terang dari
// latar, teks dibalik jadi terang. Kalau nambah warna baru, taruh di sini
// jangan hardcode di komponen.
export const colors = {
  // Latar app. Lebih gelap dari warna dasar supaya kartu bisa "naik".
  bgGradient: ["#02202f", "#04324c", "#021a28"],

  // Permukaan kartu -- satu tingkat di atas latar.
  surface: "rgba(8, 62, 94, 0.88)",
  surfaceSolid: "#083c5a",
  surfaceBorder: "rgba(125, 211, 252, 0.14)",
  surfaceMuted: "#06324c",

  // Aksen: tombol utama, tab aktif, FAB.
  accent: ["#0ea5e9", "#2563eb"],
  // Lencana kecil, avatar.
  accentSoft: ["#38bdf8", "#3b82f6"],
  // Kartu hero.
  hero: ["#0b4f78", "#1276ac"],

  text: "#e8f3fb",
  textMuted: "#9cbed4",
  textFaint: "#7aa0b8",
  divider: "#0b4467",
  border: "#0f5479",

  positive: "#34d399",
  positiveSoft: "#a7f3d0",
  negative: "#fb7185",
  negativeSoft: "#fecdd3",
};

export const radius = { xl: 32, lg: 28, md: 16, sm: 12, pill: 999 };

// Di latar gelap bayangan ungu nggak kelihatan -- pakai hitam yang lebih tegas.
export const shadow = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 4,
  },
  raised: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
};

// Android menggambar app-nya edge-to-edge, jadi konten paling atas nempel ke
// status bar kalau nggak dikasih jarak sendiri. SafeAreaView bawaan RN cuma
// jalan di iOS. Modal dirender di luar pohon SafeAreaView, jadi layar penuh
// yang muncul dari Modal perlu memasang jarak ini sendiri.
export const TOP_INSET =
  Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 6 : 0;
