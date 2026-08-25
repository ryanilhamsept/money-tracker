import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, X } from "lucide-react";

import { Card, CardContent } from "./ui/card";
import { formatCurrency } from "../utils/currency";
import { formatDisplayDate } from "../utils/date";
import {
    getGoalsFromSupabase,
    addGoalToSupabase,
    updateGoalInSupabase,
    deleteGoalFromSupabase,
} from "../services/supabase";

const GOAL_ICONS = ["✈️", "🚨", "🏠", "🚗", "📚", "📈", "💳", "🎯", "🎁", "💍", "🛍️", "🏥"];
const GOAL_COLORS = ["#8b5cf6", "#f97316", "#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6"];

const generateId = () => `goal-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const SORT_OPTIONS = [
    { key: "newest", label: "Terbaru" },
    { key: "target", label: "Target Terbesar" },
    { key: "progress", label: "Progress Tertinggi" },
];
const FILTER_OPTIONS = [
    { key: "all", label: "Semua" },
    { key: "ongoing", label: "Berjalan" },
    { key: "done", label: "Selesai" },
];

const emptyForm = { title: "", icon: GOAL_ICONS[0], targetAmount: "", savedAmount: "", deadline: "", note: "" };

const formatThousands = (value) => {
    const raw = String(value || "").replace(/[^\d]/g, "");
    return raw ? new Intl.NumberFormat("id-ID").format(Number(raw)) : "";
};
const parseAmount = (value) => Number(String(value || "").replace(/[^\d]/g, "")) || 0;

export default function Plan({ userId }) {
    const [goals, setGoals] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [isSaving, setIsSaving] = useState(false);
    const [sortIndex, setSortIndex] = useState(0);
    const [filterIndex, setFilterIndex] = useState(0);

    const loadGoals = async () => {
        setIsLoading(true);
        const data = await getGoalsFromSupabase();
        setGoals(data);
        setIsLoading(false);
    };

    useEffect(() => {
        loadGoals();
    }, []);

    const sortedGoals = useMemo(() => {
        const sortKey = SORT_OPTIONS[sortIndex].key;
        const filterKey = FILTER_OPTIONS[filterIndex].key;

        const filtered = goals.filter((g) => {
            const progress = g.targetAmount > 0 ? g.savedAmount / g.targetAmount : 0;
            if (filterKey === "ongoing") return progress < 1;
            if (filterKey === "done") return progress >= 1;
            return true;
        });

        return [...filtered].sort((a, b) => {
            if (sortKey === "target") return b.targetAmount - a.targetAmount;
            if (sortKey === "progress") {
                const pa = a.targetAmount > 0 ? a.savedAmount / a.targetAmount : 0;
                const pb = b.targetAmount > 0 ? b.savedAmount / b.targetAmount : 0;
                return pb - pa;
            }
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
    }, [goals, sortIndex, filterIndex]);

    const openAddForm = () => {
        setEditingGoal(null);
        setForm(emptyForm);
        setFormOpen(true);
    };

    const openEditForm = (goal) => {
        setEditingGoal(goal);
        setForm({
            title: goal.title,
            icon: goal.icon,
            targetAmount: formatThousands(goal.targetAmount),
            savedAmount: formatThousands(goal.savedAmount),
            deadline: goal.deadline || "",
            note: goal.note || "",
        });
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditingGoal(null);
        setForm(emptyForm);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const targetAmount = parseAmount(form.targetAmount);
        if (!form.title.trim() || !targetAmount) return;

        setIsSaving(true);
        try {
            if (editingGoal) {
                await updateGoalInSupabase({
                    ...editingGoal,
                    title: form.title.trim(),
                    icon: form.icon,
                    targetAmount,
                    savedAmount: parseAmount(form.savedAmount),
                    deadline: form.deadline || null,
                    note: form.note.trim() || null,
                });
            } else {
                await addGoalToSupabase(
                    {
                        id: generateId(),
                        title: form.title.trim(),
                        icon: form.icon,
                        color: GOAL_COLORS[goals.length % GOAL_COLORS.length],
                        targetAmount,
                        savedAmount: parseAmount(form.savedAmount),
                        deadline: form.deadline || null,
                        note: form.note.trim() || null,
                    },
                    userId
                );
            }
            closeForm();
            await loadGoals();
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        await deleteGoalFromSupabase(id);
        await loadGoals();
    };

    return (
        <section className="space-y-6 overflow-hidden">
            <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-xl">
                <CardContent className="p-6">
                    <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div className="min-w-0">
                            <h2 className="text-2xl font-black text-slate-900">Plan</h2>
                            <p className="text-sm font-medium text-slate-500">
                                Target nabung & rencana keuanganmu.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={formOpen ? closeForm : openAddForm}
                            className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90"
                        >
                            {formOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            {formOpen ? "Tutup" : "Tambah Rencana"}
                        </button>
                    </div>

                    <div className="mt-4 flex gap-2">
                        <button
                            type="button"
                            onClick={() => setSortIndex((i) => (i + 1) % SORT_OPTIONS.length)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                        >
                            ↕ {SORT_OPTIONS[sortIndex].label}
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterIndex((i) => (i + 1) % FILTER_OPTIONS.length)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                        >
                            ☰ {FILTER_OPTIONS[filterIndex].label}
                        </button>
                    </div>
                </CardContent>
            </Card>

            {formOpen && (
                <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-xl">
                    <CardContent className="p-6">
                        <h3 className="mb-4 text-lg font-black text-slate-900">
                            {editingGoal ? "Edit Rencana" : "Rencana Baru"}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <span className="mb-2 block text-sm font-semibold text-slate-600">Ikon</span>
                                <div className="flex flex-wrap gap-2">
                                    {GOAL_ICONS.map((icon) => (
                                        <button
                                            key={icon}
                                            type="button"
                                            onClick={() => setForm((f) => ({ ...f, icon }))}
                                            className={`flex h-11 w-11 items-center justify-center rounded-2xl border-2 text-lg transition ${
                                                form.icon === icon
                                                    ? "border-slate-900 bg-slate-100"
                                                    : "border-slate-100 bg-slate-50"
                                            }`}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-slate-600">Nama Rencana</span>
                                <input
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                    placeholder="e.g. Liburan, Dana Darurat"
                                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 outline-none focus:border-pink-400"
                                />
                            </label>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-slate-600">Target (Rp)</span>
                                    <input
                                        value={form.targetAmount}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, targetAmount: formatThousands(e.target.value) }))
                                        }
                                        placeholder="25000000"
                                        className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 outline-none focus:border-pink-400"
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-slate-600">Sudah Terkumpul (Rp)</span>
                                    <input
                                        value={form.savedAmount}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, savedAmount: formatThousands(e.target.value) }))
                                        }
                                        placeholder="0"
                                        className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 outline-none focus:border-pink-400"
                                    />
                                </label>
                            </div>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-slate-600">Target Bulan (Opsional)</span>
                                <input
                                    type="date"
                                    value={form.deadline}
                                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 outline-none focus:border-pink-400"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-slate-600">Catatan (Opsional)</span>
                                <input
                                    value={form.note}
                                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                                    placeholder="Catatan tambahan..."
                                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 outline-none focus:border-pink-400"
                                />
                            </label>

                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-60"
                                >
                                    {isSaving ? "Menyimpan..." : editingGoal ? "Simpan Perubahan" : "Simpan Rencana"}
                                </button>
                                {editingGoal && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            await handleDelete(editingGoal.id);
                                            closeForm();
                                        }}
                                        className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-100"
                                    >
                                        Hapus
                                    </button>
                                )}
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-xl">
                <CardContent className="p-6">
                    {isLoading ? (
                        <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">Memuat...</div>
                    ) : sortedGoals.length === 0 ? (
                        <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">
                            Belum ada rencana. Klik "Tambah Rencana" buat mulai.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sortedGoals.map((goal) => {
                                const progress = goal.targetAmount > 0 ? goal.savedAmount / goal.targetAmount : 0;
                                const percent = Math.min(100, Math.round(progress * 100));
                                const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);

                                return (
                                    <motion.div
                                        key={goal.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="rounded-3xl bg-slate-50 p-4"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg"
                                                style={{ backgroundColor: `${goal.color}22` }}
                                            >
                                                {goal.icon}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-black text-slate-900">{goal.title}</p>
                                                {goal.deadline ? (
                                                    <p className="text-xs font-medium text-slate-400">
                                                        Target {formatDisplayDate(goal.deadline)}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <p className="shrink-0 font-black text-slate-900">
                                                {formatCurrency(goal.targetAmount)}
                                            </p>
                                        </div>

                                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{ width: `${percent}%`, backgroundColor: goal.color }}
                                            />
                                        </div>

                                        <div className="mt-2 flex items-center justify-between">
                                            <p className="text-sm font-bold text-slate-900">
                                                {formatCurrency(goal.savedAmount)}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs font-semibold text-slate-400">
                                                    {formatCurrency(remaining)}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => openEditForm(goal)}
                                                    className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-100"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(goal.id)}
                                                    className="rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-500 transition hover:bg-rose-100"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    );
}
