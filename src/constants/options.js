export const categories = import.meta.env.VITE_CATEGORIES
    ? import.meta.env.VITE_CATEGORIES.split(",").map((s) => s.trim())
    : [
        "Account Transfer",
        "Food",
        "Transportation",
        "Groceries",
        "Utilities",
        "Entertainment",
        "Internet",
        "Shopping",
        "Health",
        "Education",
        "Miscellaneous",
    ];

// Pemasukan punya daftar kategori sendiri -- kategori belanja seperti "Food"
// atau "Groceries" nggak masuk akal buat uang yang datang. Cerminan dari
// mobile/src/constants/options.js supaya dua aplikasi menawarkan pilihan sama.
export const incomeCategories = import.meta.env.VITE_INCOME_CATEGORIES
    ? import.meta.env.VITE_INCOME_CATEGORIES.split(",").map((s) => s.trim())
    : [
        "Gaji",
        "Bonus",
        "Freelance",
        "Hasil Jual",
        "Transfer Masuk",
        "Refund",
        "Lainnya",
    ];

export const fundSources = import.meta.env.VITE_FUND_SOURCES
    ? import.meta.env.VITE_FUND_SOURCES.split(",").map((s) => s.trim())
    : [
        "Mandiri",
        "BCA",
        "BNI",
        "Credit Card - BCA",
        "Credit Card - BNI",
        "Blu",
        "Superbank",
    ];

export const danaDipakaiOptions = import.meta.env.VITE_DANA_DIPAKAI_OPTIONS
    ? import.meta.env.VITE_DANA_DIPAKAI_OPTIONS.split(",").map((s) => s.trim())
    : [
        "Spend Bulanan",
        "Ambil dari tabungan",
        "Bagian THR",
        "Spend CC",
        "Other",
        "Liburan",
        "Gajian",
    ];