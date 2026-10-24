import {
    ArrowLeftRight, Utensils, Car, ShoppingCart, Zap, Clapperboard,
    Wifi, ShoppingBag, HeartPulse, GraduationCap, Package,
} from "lucide-react";

// Satu sumber warna per kategori: ikonnya, warna latar pil gelap, dan `hex`
// untuk grafik. Sebelumnya warna hanya ada sebagai kelas Tailwind terang
// (bg-orange-100) yang tidak terbaca di latar gelap dan tidak bisa dipakai
// SVG sama sekali.
export const CATEGORY_THEME = {
    "Account Transfer": { icon: ArrowLeftRight, hex: "#34d399", tint: "bg-emerald-500/15", ink: "text-emerald-400" },
    Food:               { icon: Utensils,       hex: "#fbbf24", tint: "bg-amber-500/15",   ink: "text-amber-400"   },
    Transportation:     { icon: Car,            hex: "#22c55e", tint: "bg-green-500/15",   ink: "text-green-400"   },
    Groceries:          { icon: ShoppingCart,   hex: "#f97316", tint: "bg-orange-500/15",  ink: "text-orange-400"  },
    Utilities:          { icon: Zap,            hex: "#eab308", tint: "bg-yellow-500/15",  ink: "text-yellow-400"  },
    Entertainment:      { icon: Clapperboard,   hex: "#ec4899", tint: "bg-pink-500/15",    ink: "text-pink-400"    },
    Internet:           { icon: Wifi,           hex: "#38bdf8", tint: "bg-sky-500/15",     ink: "text-sky-400"     },
    Shopping:           { icon: ShoppingBag,    hex: "#a78bfa", tint: "bg-violet-500/15",  ink: "text-violet-400"  },
    Health:             { icon: HeartPulse,     hex: "#f43f5e", tint: "bg-rose-500/15",    ink: "text-rose-400"    },
    Education:          { icon: GraduationCap,  hex: "#60a5fa", tint: "bg-blue-500/15",    ink: "text-blue-400"    },
    Miscellaneous:      { icon: Package,        hex: "#94a3b8", tint: "bg-slate-500/15",   ink: "text-slate-400"   },
};

export const FALLBACK_THEME = CATEGORY_THEME.Miscellaneous;

export const themeFor = (category) => CATEGORY_THEME[category] || FALLBACK_THEME;
