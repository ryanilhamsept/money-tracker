import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Card, CardContent } from "./ui/card";
import { categories, danaDipakaiOptions, fundSources } from "../constants/options";
import { formatCurrency } from "../utils/currency";
import { formatDisplayDate, today } from "../utils/date";
import { availableYears, belongsTo, yearSummary } from "../utils/report";
import { sortTimestamp } from "../utils/transactions";
import { categoryIcons } from "./MonthlyReport";

// Rincian yang dibuka bisa ratusan baris kalau rentangnya setahun. Dibatasi,
// dengan sisanya disebut terus terang -- daftar 400 baris di dalam kartu
// bukan "lengkap", cuma nggak kebaca.
const MAX_DETAIL = 30;

export default function YearlyReport({ transactions = [] }) {
    const years = useMemo(() => availableYears(transactions), [transactions]);
    const todayStr = today();
    const thisYear = todayStr.slice(0, 4);

    const [selectedYear, setSelectedYear] = useState(() =>
        years.includes(thisYear) ? thisYear : years[0] || thisYear
    );
    const [openCategory, setOpenCategory] = useState("");
    const [openSource, setOpenSource] = useState("");
    const [openDana, setOpenDana] = useState("");

    const summary = useMemo(
        () =>
            yearSummary(transactions, selectedYear, {
                categories,
                fundSources,
                danaDipakaiOptions,
                todayStr,
            }),
        [transactions, selectedYear, todayStr]
    );

    const expenses = useMemo(
        () =>
            transactions
                .filter(
                    (t) => t.type !== "income" && String(t.date).slice(0, 4) === selectedYear
                )
                .filter(
                    (t) =>
                        selectedYear !== thisYear ||
                        t.paidAt ||
                        String(t.date).slice(0, 10) <= todayStr
                )
                // Diurutkan dari nominal TERBESAR, bukan terbaru. Rentangnya
                // setahun: yang dicari waktu membuka "Shopping Rp 2,1 juta"
                // itu belanja apa yang bikin angkanya segitu, bukan yang
                // kebetulan paling baru. Ini juga yang bikin batas 30 baris
                // masuk akal -- 30 terbesar menjelaskan totalnya, 30 terbaru
                // tidak.
                .sort(
                    (a, b) =>
                        (Number(b.amount) || 0) - (Number(a.amount) || 0) ||
                        sortTimestamp(b) - sortTimestamp(a)
                ),
        [transactions, selectedYear, thisYear, todayStr]
    );

    const index = years.indexOf(selectedYear);
    const canOlder = index >= 0 && index < years.length - 1;
    const canNewer = index > 0;

    // Batang per bulan diukur terhadap bulan paling boros, bukan terhadap
    // total setahun. Diukur dari total, dua belas batangnya mentok pendek
    // semua dan bentuk tahunnya justru hilang.
    const peak = summary.byMonth.reduce((max, m) => Math.max(max, m.total), 0);
    const monthsWithData = summary.byMonth.filter((m) => m.total > 0);
    const isCurrentYear = selectedYear === thisYear;
    const emptyText = `Belum ada pengeluaran di ${selectedYear}.`;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-3xl font-black tracking-tight text-slate-900">
                    Laporan Tahunan
                </h2>

                {years.length > 1 && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={!canOlder}
                            onClick={() => canOlder && setSelectedYear(years[index + 1])}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-surface text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="min-w-16 text-center text-lg font-black text-slate-900">
                            {selectedYear}
                        </span>
                        <button
                            type="button"
                            disabled={!canNewer}
                            onClick={() => canNewer && setSelectedYear(years[index - 1])}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-surface text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>

            <div className="rounded-[1.75rem] bg-gradient-to-br from-blue-600 to-sky-400 p-5 text-white shadow-xl">
                <p className="text-sm font-semibold text-white/80">Uang yang sudah keluar</p>
                <p className="mt-1 text-xs font-medium text-white/70">
                    {isCurrentYear
                        ? `Januari ${selectedYear} - Sekarang`
                        : `Sepanjang ${selectedYear}`}
                </p>
                <p className="mt-5 text-3xl font-black tracking-tight md:text-4xl xl:text-5xl">
                    {formatCurrency(summary.total)}
                </p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/25">
                    <div className="h-full w-full rounded-full bg-surface" />
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <StatBox label="Transaksi" value={`${summary.count}`} meta="pengeluaran" />
                <StatBox
                    label="Rata-rata / bulan"
                    value={formatCurrency(summary.monthlyAverage)}
                    meta={`dari ${monthsWithData.length} bulan`}
                />
                <StatBox
                    label="Paling boros"
                    value={summary.busiestMonth ? summary.busiestMonth.label : "-"}
                    meta={
                        summary.busiestMonth ? formatCurrency(summary.busiestMonth.total) : ""
                    }
                />
            </div>

            <Card className="overflow-hidden rounded-3xl border-0 bg-surface shadow-xl">
                <CardContent className="p-6">
                    <h3 className="mb-5 text-2xl font-black text-slate-900">Per Bulan</h3>
                    {monthsWithData.length === 0 ? (
                        <Empty text={emptyText} />
                    ) : (
                        <div className="space-y-1">
                            {summary.byMonth.map((m) => (
                                <div key={m.month} className="flex items-center gap-3 py-1.5">
                                    <span className="w-20 shrink-0 text-sm font-bold text-slate-500">
                                        {m.label}
                                    </span>
                                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-50">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500"
                                            style={{ width: peak ? `${(m.total / peak) * 100}%` : "0%" }}
                                        />
                                    </div>
                                    <span
                                        className={`w-32 shrink-0 text-right text-sm font-black ${
                                            m.total ? "text-slate-900" : "text-slate-400"
                                        }`}
                                    >
                                        {m.total ? formatCurrency(m.total) : "-"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Breakdown
                title="Spending by Category"
                rows={summary.byCategory}
                emptyText={emptyText}
                openKey={openCategory}
                setOpenKey={setOpenCategory}
                withIcon
                detailFor={(bucket) =>
                    expenses.filter((t) => belongsTo(bucket, t.category))
                }
            />

            <Breakdown
                title="Spending by Sumber Dana"
                rows={summary.bySource}
                emptyText={emptyText}
                openKey={openSource}
                setOpenKey={setOpenSource}
                detailFor={(bucket) => expenses.filter((t) => belongsTo(bucket, t.source))}
            />

            <Breakdown
                title="Ambil Dari Mana"
                rows={summary.byDana}
                emptyText={emptyText}
                openKey={openDana}
                setOpenKey={setOpenDana}
                detailFor={(bucket) =>
                    expenses.filter((t) => belongsTo(bucket, t.danaDipakai))
                }
            />
        </div>
    );
}

function StatBox({ label, value, meta }) {
    return (
        <div className="rounded-3xl bg-surface p-5 shadow-xl">
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-1 truncate text-2xl font-black text-slate-900">{value}</p>
            {meta ? <p className="text-xs font-medium text-slate-500">{meta}</p> : null}
        </div>
    );
}

function Empty({ text }) {
    return (
        <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">{text}</div>
    );
}

function Breakdown({ title, rows, emptyText, openKey, setOpenKey, detailFor, withIcon }) {
    return (
        <Card className="overflow-hidden rounded-3xl border-0 bg-surface shadow-xl">
            <CardContent className="p-6">
                <h3 className="mb-5 text-2xl font-black text-slate-900">{title}</h3>
                {rows.length === 0 ? (
                    <Empty text={emptyText} />
                ) : (
                    <div className="space-y-4">
                        {rows.map((item) => {
                            const expanded = openKey === item.value;
                            const detail = expanded ? detailFor(item.value) : [];
                            const iconData =
                                categoryIcons[item.value] || categoryIcons["Miscellaneous"];
                            const Icon = iconData.icon;

                            return (
                                <div
                                    key={item.value}
                                    className="space-y-3 rounded-3xl bg-slate-50 p-4"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setOpenKey(expanded ? "" : item.value)}
                                        className="w-full min-w-0 text-left"
                                    >
                                        <div className="flex min-w-0 items-center justify-between gap-4">
                                            <div className="flex min-w-0 items-center gap-3">
                                                {withIcon && (
                                                    <div className={`shrink-0 rounded-2xl p-3 ${iconData.bg}`}>
                                                        <Icon className={`h-5 w-5 ${iconData.color}`} />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="truncate font-black text-slate-900">
                                                        {item.label}
                                                    </p>
                                                    <p className="text-sm font-medium text-slate-500">
                                                        {item.percentage}% dari total setahun
                                                        {item.unlisted && (
                                                            <span className="ml-2 font-bold text-amber-400">
                                                                · di luar daftar pilihan
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <p className="font-black text-slate-900">
                                                    {formatCurrency(item.total)}
                                                </p>
                                                <ChevronDown
                                                    className={`h-4 w-4 text-slate-500 transition ${
                                                        expanded ? "rotate-180" : ""
                                                    }`}
                                                />
                                            </div>
                                        </div>
                                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500"
                                                style={{ width: `${item.percentage}%` }}
                                            />
                                        </div>
                                    </button>

                                    {expanded && (
                                        <div className="space-y-2 border-t border-slate-200 pt-3">
                                            {detail.slice(0, MAX_DETAIL).map((t) => (
                                                <div
                                                    key={t.id}
                                                    className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-surface p-3 shadow-sm"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate font-bold text-slate-900">
                                                            {t.title}
                                                        </p>
                                                        <p className="text-xs font-medium text-slate-500">
                                                            {formatDisplayDate(t.date)}
                                                            {t.time ? ` ${t.time}` : ""} • {t.source}
                                                            {t.danaDipakai ? ` • ${t.danaDipakai}` : ""}
                                                        </p>
                                                    </div>
                                                    <p className="shrink-0 font-black text-rose-400">
                                                        -{formatCurrency(t.amount)}
                                                    </p>
                                                </div>
                                            ))}
                                            {detail.length > MAX_DETAIL && (
                                                <p className="px-1 pt-1 text-xs font-medium text-slate-500">
                                                    +{detail.length - MAX_DETAIL} transaksi lagi — buka
                                                    tab Home kalau mau lihat semuanya
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
