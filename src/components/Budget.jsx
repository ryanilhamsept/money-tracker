import { useEffect, useMemo, useState } from "react";
import { Pencil, Check, X } from "lucide-react";

import { formatCurrency } from "../utils/currency";
import { normalizeDate, today } from "../utils/date";
import { categories } from "../constants/options";
import { themeFor } from "../constants/categoryTheme";
import {
    getCategoryBudgets,
    saveCategoryBudgets,
} from "../services/api";

const MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const monthKey = (d) => d.slice(0, 7);
const shiftMonth = (key, by) => {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + by, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key) => {
    const [y, m] = key.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
};

export default function Budget({ transactions = [] }) {
    const [activeMonth, setActiveMonth] = useState(monthKey(today()));
    const [budgets, setBudgets] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        getCategoryBudgets()
            .then((rows) => {
                if (!cancelled) setBudgets(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!cancelled) setError("Gagal memuat anggaran.");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const budgetByCategory = useMemo(() => {
        const map = {};
        budgets.forEach((b) => {
            map[b.category.trim().toLowerCase()] = Number(b.amount) || 0;
        });
        return map;
    }, [budgets]);

    const spentByCategory = useMemo(() => {
        const map = {};
        transactions.forEach((t) => {
            if (t.type === "income") return;
            if (monthKey(normalizeDate(t.date)) !== activeMonth) return;
            const key = String(t.category || "Miscellaneous").trim().toLowerCase();
            map[key] = (map[key] || 0) + Number(t.amount || 0);
        });
        return map;
    }, [transactions, activeMonth]);

    // Berapa jauh bulan ini sudah berjalan. Dipakai sebagai penanda "hari ini"
    // di bilah: anggaran yang terpakai 60% belum tentu boros kalau bulannya
    // memang sudah lewat 60%.
    const monthProgress = useMemo(() => {
        const [y, m] = activeMonth.split("-").map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const todayKey = monthKey(today());

        if (activeMonth < todayKey) return { fraction: 1, daysLeft: 0, dayOfMonth: daysInMonth, daysInMonth };
        if (activeMonth > todayKey) return { fraction: 0, daysLeft: daysInMonth, dayOfMonth: 0, daysInMonth };

        const dayOfMonth = Number(today().slice(8, 10));
        return {
            fraction: dayOfMonth / daysInMonth,
            daysLeft: daysInMonth - dayOfMonth,
            dayOfMonth,
            daysInMonth,
        };
    }, [activeMonth]);

    const rows = useMemo(() => {
        const names = new Set([
            ...categories,
            ...budgets.map((b) => b.category),
            ...Object.keys(spentByCategory),
        ]);

        return [...names]
            .map((name) => {
                const key = name.trim().toLowerCase();
                const budget = budgetByCategory[key] || 0;
                const spent = spentByCategory[key] || 0;
                return {
                    category: name,
                    budget,
                    spent,
                    left: budget - spent,
                    used: budget > 0 ? spent / budget : null,
                };
            })
            .filter((r) => r.budget > 0 || r.spent > 0)
            .sort((a, b) => {
                // Yang dianggarkan lebih dulu, lalu yang paling banyak terpakai.
                if ((b.budget > 0) !== (a.budget > 0)) return b.budget - a.budget;
                return b.spent - a.spent;
            });
    }, [budgets, budgetByCategory, spentByCategory]);

    const totals = useMemo(() => {
        const budget = rows.reduce((s, r) => s + r.budget, 0);
        const spent = rows.reduce((s, r) => s + r.spent, 0);
        return {
            budget,
            spent,
            left: budget - spent,
            used: budget > 0 ? spent / budget : null,
            perDay: monthProgress.daysLeft > 0 ? (budget - spent) / monthProgress.daysLeft : 0,
        };
    }, [rows, monthProgress]);

    const openEdit = () => {
        const next = {};
        rows.forEach((r) => {
            next[r.category] = r.budget > 0 ? String(r.budget) : "";
        });
        categories.forEach((c) => {
            if (!(c in next)) next[c] = "";
        });
        setDraft(next);
        setIsEditing(true);
    };

    const save = async () => {
        setIsSaving(true);
        setError("");
        try {
            const payload = Object.entries(draft).map(([category, value]) => ({
                category,
                amount: Number(String(value).replace(/[^\d]/g, "")) || 0,
            }));
            const result = await saveCategoryBudgets(payload);
            setBudgets(result?.data || []);
            setIsEditing(false);
        } catch {
            setError("Gagal menyimpan anggaran. Coba lagi.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-black tracking-tight text-slate-900">Budget</h1>
                {!isEditing ? (
                    <button
                        type="button"
                        onClick={openEdit}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                        <Pencil className="h-4 w-4" /> Atur
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={save}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                        >
                            <Check className="h-4 w-4" /> {isSaving ? "Menyimpan..." : "Simpan"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:bg-slate-50"
                            aria-label="Batal"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-center gap-4">
                <button
                    type="button"
                    onClick={() => setActiveMonth((m) => shiftMonth(m, -1))}
                    className="rounded-full px-3 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                    ‹
                </button>
                <span className="min-w-[10rem] text-center font-bold text-slate-700">
                    {monthLabel(activeMonth)}
                </span>
                <button
                    type="button"
                    onClick={() => setActiveMonth((m) => shiftMonth(m, 1))}
                    className="rounded-full px-3 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                    ›
                </button>
            </div>

            {error && (
                <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {error}
                </p>
            )}

            <Summary totals={totals} progress={monthProgress} />

            <section className="space-y-2">
                {rows.length === 0 && !isEditing && (
                    <p className="rounded-3xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                        Belum ada anggaran. Klik <span className="font-bold">Atur</span> untuk mulai.
                    </p>
                )}

                {isEditing
                    ? Object.keys(draft)
                          .sort()
                          .map((category) => (
                              <EditRow
                                  key={category}
                                  category={category}
                                  value={draft[category]}
                                  onChange={(v) =>
                                      setDraft((d) => ({ ...d, [category]: v }))
                                  }
                              />
                          ))
                    : rows.map((row) => (
                          <BudgetRow key={row.category} row={row} progress={monthProgress} />
                      ))}
            </section>
        </div>
    );
}

function Summary({ totals, progress }) {
    const pace = paceOf(totals.used, progress.fraction);

    return (
        <section className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-500">Sisa anggaran</p>
                    <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">
                        {formatCurrency(totals.left)}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                        dari {formatCurrency(totals.budget)}
                        {totals.used !== null ? ` · ${Math.round(totals.used * 100)}% terpakai` : ""}
                    </p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${pace.chip}`}>
                    {pace.label}
                </span>
            </div>

            <Bar used={totals.used} progress={progress.fraction} tone={pace.bar} />

            <div className="mt-4 grid grid-cols-2 divide-x divide-slate-100">
                <div className="pr-4">
                    <p className="text-xs font-semibold text-slate-500">Terpakai</p>
                    <p className="mt-0.5 text-lg font-black text-slate-900">
                        {formatCurrency(totals.spent)}
                    </p>
                </div>
                <div className="pl-4">
                    <p className="text-xs font-semibold text-slate-500">
                        Aman per hari · sisa {progress.daysLeft} hari
                    </p>
                    <p className="mt-0.5 text-lg font-black text-slate-900">
                        {progress.daysLeft > 0 ? formatCurrency(Math.max(0, totals.perDay)) : "—"}
                    </p>
                </div>
            </div>
        </section>
    );
}

function BudgetRow({ row, progress }) {
    const theme = themeFor(row.category);
    const Icon = theme.icon;
    const pace = paceOf(row.used, progress.fraction);

    return (
        <div className="rounded-2xl border border-white/70 bg-white/85 p-3.5 shadow-sm backdrop-blur">
            <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${theme.tint}`}>
                    <Icon className={`h-5 w-5 ${theme.ink}`} />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-bold text-slate-900">{row.category}</span>
                        <span className="shrink-0 text-sm font-black text-slate-900">
                            {row.budget > 0
                                ? `${formatCurrency(row.left)} sisa`
                                : formatCurrency(row.spent)}
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-xs font-semibold text-slate-500">
                            {row.budget > 0 ? `dari ${formatCurrency(row.budget)}` : "belum dianggarkan"}
                        </span>
                        {row.used !== null && (
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${pace.chip}`}>
                                {pace.label}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {row.budget > 0 && (
                <Bar used={row.used} progress={progress.fraction} tone={pace.bar} compact />
            )}
        </div>
    );
}

function EditRow({ category, value, onChange }) {
    const theme = themeFor(category);
    const Icon = theme.icon;

    return (
        <label className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/85 p-3 shadow-sm backdrop-blur">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${theme.tint}`}>
                <Icon className={`h-5 w-5 ${theme.ink}`} />
            </span>
            <span className="min-w-0 flex-1 truncate font-bold text-slate-900">{category}</span>
            <span className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="text-sm font-bold text-slate-400">Rp</span>
                <input
                    value={value}
                    onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    placeholder="0"
                    className="w-28 text-right font-bold text-slate-900 outline-none"
                />
            </span>
        </label>
    );
}

function Bar({ used, progress, tone, compact = false }) {
    const filled = Math.max(0, Math.min(1, used ?? 0));

    return (
        <div className={compact ? "mt-2.5" : "mt-4"}>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                    className={`h-full rounded-full transition-all ${tone}`}
                    style={{ width: `${filled * 100}%` }}
                />
            </div>
            {/* Penanda hari ini: tanpa ini, bilah yang terisi separuh tidak
                memberi tahu apakah itu wajar atau kecepatan. */}
            <div className="relative h-0">
                <span
                    className="absolute -top-3.5 h-4 w-0.5 rounded bg-slate-400"
                    style={{ left: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
                    title="Hari ini"
                />
            </div>
        </div>
    );
}

// Membandingkan pemakaian dengan jalannya bulan, bukan dengan ambang tetap.
// Terpakai 60% di tanggal 20 itu hemat; terpakai 60% di tanggal 5 tidak.
function paceOf(used, monthFraction) {
    if (used === null || used === undefined) {
        return { label: "—", chip: "bg-slate-100 text-slate-500", bar: "bg-slate-300" };
    }
    if (used >= 1) {
        return { label: "Lewat", chip: "bg-rose-100 text-rose-700", bar: "bg-rose-500" };
    }

    const allowance = Math.max(0.08, monthFraction);
    if (used > allowance + 0.15) {
        return { label: "Terlalu cepat", chip: "bg-rose-100 text-rose-700", bar: "bg-rose-400" };
    }
    if (used > allowance + 0.05) {
        return { label: "Agak cepat", chip: "bg-amber-100 text-amber-700", bar: "bg-amber-400" };
    }
    return { label: "Aman", chip: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" };
}
