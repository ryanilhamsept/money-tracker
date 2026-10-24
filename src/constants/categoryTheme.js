import {
    ArrowLeftRight, Utensils, Car, ShoppingCart, Zap, Clapperboard,
    Wifi, ShoppingBag, HeartPulse, GraduationCap, Package,
} from "lucide-react";

// Satu sumber warna per kategori: ikon, latar pil, dan `hex` untuk elemen SVG
// yang tidak bisa memakai kelas Tailwind.
export const CATEGORY_THEME = {
    "Account Transfer": { icon: ArrowLeftRight, hex: "#10b981", tint: "bg-emerald-50", ink: "text-emerald-600" },
    Food:               { icon: Utensils,       hex: "#f59e0b", tint: "bg-amber-50",   ink: "text-amber-600"   },
    Transportation:     { icon: Car,            hex: "#22c55e", tint: "bg-green-50",   ink: "text-green-600"   },
    Groceries:          { icon: ShoppingCart,   hex: "#f97316", tint: "bg-orange-50",  ink: "text-orange-600"  },
    Utilities:          { icon: Zap,            hex: "#eab308", tint: "bg-yellow-50",  ink: "text-yellow-600"  },
    Entertainment:      { icon: Clapperboard,   hex: "#ec4899", tint: "bg-pink-50",    ink: "text-pink-600"    },
    Internet:           { icon: Wifi,           hex: "#0ea5e9", tint: "bg-sky-50",     ink: "text-sky-600"     },
    Shopping:           { icon: ShoppingBag,    hex: "#8b5cf6", tint: "bg-violet-50",  ink: "text-violet-600"  },
    Health:             { icon: HeartPulse,     hex: "#f43f5e", tint: "bg-rose-50",    ink: "text-rose-600"    },
    Education:          { icon: GraduationCap,  hex: "#3b82f6", tint: "bg-blue-50",    ink: "text-blue-600"    },
    Miscellaneous:      { icon: Package,        hex: "#64748b", tint: "bg-slate-100",  ink: "text-slate-600"   },
};

export const themeFor = (category) =>
    CATEGORY_THEME[category] || CATEGORY_THEME.Miscellaneous;
