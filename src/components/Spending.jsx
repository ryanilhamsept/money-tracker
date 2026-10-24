import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sigma } from "lucide-react";

import { formatCurrency } from "../utils/currency";
import { normalizeDate, today } from "../utils/date";
import { getDonutArcPath } from "../utils/chart";
import { themeFor } from "../constants/categoryTheme";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH_NAMES = [
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
    return `${MONTH_NAMES[m - 1]} ${y}`;
};

// Senin sebagai kolom pertama -- getDay() menaruh Minggu di 0, sedangkan
// kalender di sini (dan kebiasaan sehari-hari) mulai dari Senin.
const weekdayIndex = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return (new Date(y, m - 1, d).getDay() + 6) % 7;
};

export default function Spending({ transactions = [], onAdd }) {
    const [activeMonth, setActiveMonth] = useState(monthKey(today()));
    const [kind, setKind] = useState("expense");

    const inMonth = useMemo(
        () =>
            transactions.filter(
                (t) =>
                    monthKey(normalizeDate(t.date)) === activeMonth &&
                    (kind === "income" ? t.type === "income" : t.type !== "income")
            ),
        [transactions, activeMonth, kind]
    );

    const total = useMemo(
        () => inMonth.reduce((s, t) => s + Number(t.amount || 0), 0),
        [inMonth]
    );

    // --- donut per kategori ---
    const slices = useMemo(() => {
        const byCategory = {};
        inMonth.forEach((t) => {
            const c = t.category || "Miscellaneous";
            byCategory[c] = (byCategory[c] || 0) + Number(t.amount || 0);
        });

        const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
        const sum = entries.reduce((s, [, v]) => s + v, 0) || 1;

        let angle = 0;
        return entries.map(([category, value]) => {
            const sweep = (value / sum) * 360;
            const slice = {
                category,
                value,
                share: value / sum,
                start: angle,
                end: angle + sweep,
                hex: themeFor(category).hex,
            };
            angle += sweep;
            return slice;
        });
    }, [inMonth]);

    // --- angka ringkas ---
    const stats = useMemo(() => {
        const todayStr = today();
        const todayTotal = inMonth
            .filter((t) => normalizeDate(t.date) === todayStr)
            .reduce((s, t) => s + Number(t.amount || 0), 0);

        const days = new Set(inMonth.map((t) => normalizeDate(t.date))).size;
        const average = days > 0 ? total / days : 0;

        const prevKey = shiftMonth(activeMonth, -1);
        const prevTotal = transactions
            .filter(
                (t) =>
                    monthKey(normalizeDate(t.date)) === prevKey &&
                    (kind === "income" ? t.type === "income" : t.type !== "income")
            )
            .reduce((s, t) => s + Number(t.amount || 0), 0);

        // Tanpa pembanding, persentase perubahan tidak punya arti -- jangan
        // tampilkan "naik 100%" dari nol.
        const delta = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;

        return { todayTotal, average, delta };
    }, [inMonth, total, transactions, activeMonth, kind]);

    // --- kalender intensitas, tiga bulan terakhir ---
    const heatmap = useMemo(() => {
        const months = [shiftMonth(activeMonth, -2), shiftMonth(activeMonth, -1), activeMonth];

        const perDay = {};
        transactions.forEach((t) => {
            if (t.type === "income") return;
            const d = normalizeDate(t.date);
            perDay[d] = (perDay[d] || 0) + Number(t.amount || 0);
        });

        const peak = Math.max(1, ...Object.values(perDay));

        return months.map((key) => {
            const [y, m] = key.split("-").map(Number);
            const daysInMonth = new Date(y, m, 0).getDate();

            // Kolom = pekan, baris = hari. Hari pertama digeser ke kolomnya
            // sendiri supaya tiap baris benar-benar satu hari dalam sepekan.
            const cells = [];
            for (let day = 1; day <= daysInMonth; day++) {
                const date = `${key}-${String(day).padStart(2, "0")}`;
                cells.push({ date, row: weekdayIndex(date), amount: perDay[date] || 0 });
            }
            const offset = cells.length ? weekdayIndex(cells[0].date) : 0;
            const weeks = Math.ceil((offset + daysInMonth) / 7);

            return { key, label: MONTH_NAMES[m - 1].slice(0, 3).toUpperCase(), cells, offset, weeks, peak };
        });
    }, [transactions, activeMonth]);

    // --- transaksi dikelompokkan per tanggal ---
    const dayGroups = useMemo(() => {
        const groups = {};
        inMonth.forEach((t) => {
            const d = normalizeDate(t.date);
            (groups[d] ||= []).push(t);
        });

        return Object.entries(groups)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, items]) => ({
                date,
                items: items.sort((a, b) => String(b.time || "").localeCompare(String(a.time || ""))),
                total: items.reduce((s, t) => s + Number(t.amount || 0), 0),
            }));
    }, [inMonth]);

    const isIncome = kind === "income";

    return (
        <div className="min-h-screen bg-black pb-28 text-white">
            <div className="mx-auto max-w-lg px-4">
                <header className="flex items-center justify-between pt-6">
                    <h1 className="text-3xl font-black tracking-tight">
                        {isIncome ? "Pemasukan" : "Pengeluaran"}
                    </h1>
                    <button
                        type="button"
                        onClick={() => setKind(isIncome ? "expense" : "income")}
                        className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/15 transition"
                    >
                        {isIncome ? "Lihat pengeluaran" : "Lihat pemasukan"}
                    </button>
                </header>

                <nav className="mt-5 flex items-center justify-center gap-4">
                    <button
                        type="button"
                        aria-label="Bulan sebelumnya"
                        onClick={() => setActiveMonth((m) => shiftMonth(m, -1))}
                        className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white transition"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <span className="min-w-[11rem] text-center text-base font-bold">
                        {monthLabel(activeMonth)}
                    </span>
                    <button
                        type="button"
                        aria-label="Bulan berikutnya"
                        onClick={() => setActiveMonth((m) => shiftMonth(m, 1))}
                        className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white transition"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </nav>

                <Heatmap months={heatmap} />

                <Donut slices={slices} total={total} isIncome={isIncome} />

                <section className="mt-4 flex items-center justify-between rounded-2xl bg-white/[0.06] px-4 py-3.5">
                    <span className="flex items-center gap-2 text-sm font-semibold text-white/70">
                        <Sigma className="h-4 w-4 text-rose-400" />
                        Total {isIncome ? "pemasukan" : "pengeluaran"}
                    </span>
                    <span className="text-base font-black">{formatCurrency(total)}</span>
                </section>

                <section className="mt-3 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/[0.06] px-2 py-3.5">
                    <Stat label="Hari ini" value={formatCurrency(stats.todayTotal)} />
                    <Stat label="Rata-rata" value={formatCurrency(stats.average)} />
                    <Stat
                        label="vs bulan lalu"
                        value={
                            stats.delta === null
                                ? "—"
                                : `${stats.delta > 0 ? "↗" : "↘"} ${Math.abs(stats.delta).toFixed(1)}%`
                        }
                        tone={
                            stats.delta === null
                                ? "text-white/40"
                                : stats.delta > 0
                                  ? "text-rose-400"
                                  : "text-sky-400"
                        }
                    />
                </section>

                <section className="mt-6 space-y-5">
                    {dayGroups.length === 0 && (
                        <p className="rounded-2xl bg-white/[0.06] px-4 py-10 text-center text-sm text-white/40">
                            Belum ada transaksi di bulan ini.
                        </p>
                    )}

                    {dayGroups.map((group) => (
                        <div key={group.date}>
                            <div className="flex items-baseline justify-between px-1">
                                <h2 className="text-sm font-bold text-white/70">
                                    {dayHeading(group.date)}
                                </h2>
                                <span className={`text-sm font-bold ${isIncome ? "text-emerald-400" : "text-rose-400"}`}>
                                    {isIncome ? "+" : "-"}{formatCurrency(group.total)}
                                </span>
                            </div>

                            <ul className="mt-2 overflow-hidden rounded-2xl bg-white/[0.06]">
                                {group.items.map((t, i) => {
                                    const theme = themeFor(t.category);
                                    const Icon = theme.icon;
                                    return (
                                        <li
                                            key={t.id}
                                            className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}
                                        >
                                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${theme.tint}`}>
                                                <Icon className={`h-5 w-5 ${theme.ink}`} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-bold">{t.title}</span>
                                                <span className="block truncate text-xs text-white/45">
                                                    {t.category} · {t.source}
                                                    {t.time ? ` · ${t.time}` : ""}
                                                </span>
                                            </span>
                                            <span className={`shrink-0 font-bold ${isIncome ? "text-emerald-400" : "text-rose-400"}`}>
                                                {isIncome ? "+" : "-"}{formatCurrency(t.amount)}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </section>
            </div>

            {onAdd && (
                <button
                    type="button"
                    onClick={onAdd}
                    aria-label="Tambah transaksi"
                    className="fixed bottom-24 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-indigo-500 text-3xl font-light text-white shadow-xl transition active:scale-95"
                >
                    +
                </button>
            )}
        </div>
    );
}

function Stat({ label, value, tone = "text-white" }) {
    return (
        <div className="px-2 text-center">
            <p className="text-[11px] font-semibold text-white/45">{label}</p>
            <p className={`mt-0.5 truncate text-sm font-black ${tone}`}>{value}</p>
        </div>
    );
}

function Donut({ slices, total, isIncome }) {
    if (slices.length === 0) {
        return (
            <div className="mt-6 flex h-64 items-center justify-center rounded-3xl bg-white/[0.04] text-sm text-white/35">
                Belum ada data
            </div>
        );
    }

    // Hanya potongan yang cukup besar yang diberi label; di bawah itu tulisannya
    // saling tindih dan justru tidak terbaca.
    const labelled = slices.filter((s) => s.share >= 0.06).slice(0, 7);

    return (
        <div className="mt-5">
            <div className="relative mx-auto h-64 w-64">
                <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
                    {slices.map((s) => (
                        <path
                            key={s.category}
                            d={getDonutArcPath(100, 100, 92, 62, s.start, s.end)}
                            fill={s.hex}
                        />
                    ))}
                </svg>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm font-semibold text-white/50">Total</span>
                    <span className={`text-2xl font-black ${isIncome ? "text-emerald-400" : "text-white"}`}>
                        {formatCurrency(total)}
                    </span>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
                {labelled.map((s) => (
                    <span
                        key={s.category}
                        className="rounded-full px-3 py-1 text-xs font-bold"
                        style={{ backgroundColor: `${s.hex}22`, color: s.hex }}
                    >
                        {s.category} {Math.round(s.share * 100)}%
                    </span>
                ))}
            </div>
        </div>
    );
}

function Heatmap({ months }) {
    return (
        <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
            <div className="flex shrink-0 flex-col justify-end gap-[3px] pb-[18px] pr-1">
                {WEEKDAYS.map((d) => (
                    <span key={d} className="h-[13px] text-[9px] leading-[13px] text-white/35">
                        {d}
                    </span>
                ))}
            </div>

            {months.map((month) => (
                <div key={month.key} className="shrink-0">
                    <div
                        className="grid grid-flow-col gap-[3px]"
                        style={{ gridTemplateRows: "repeat(7, 13px)" }}
                    >
                        {Array.from({ length: month.offset }).map((_, i) => (
                            <span key={`pad-${i}`} className="h-[13px] w-[13px]" />
                        ))}
                        {month.cells.map((cell) => (
                            <span
                                key={cell.date}
                                title={`${cell.date} — ${formatCurrency(cell.amount)}`}
                                className="h-[13px] w-[13px] rounded-[3px]"
                                style={{
                                    backgroundColor:
                                        cell.amount === 0
                                            ? "rgba(255,255,255,0.06)"
                                            : `rgba(236,72,153,${0.25 + 0.75 * Math.min(1, cell.amount / month.peak)})`,
                                }}
                            />
                        ))}
                    </div>
                    <p className="mt-1.5 text-center text-[10px] font-bold text-white/45">
                        {month.label}
                    </p>
                </div>
            ))}
        </div>
    );
}

function dayHeading(date) {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dayName = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][dt.getDay()];
    return `${dayName}, ${d} ${MONTH_NAMES[m - 1]}`;
}
