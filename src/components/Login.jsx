import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Lock, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "../services/supabase";

const hashPassword = async (string) => {
    const utf8 = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export default function Login() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isSignUp, setIsSignUp] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");
        setIsLoading(true);

        const cleanUsername = username.trim().toLowerCase();
        
        // Validation: No spaces, alphanumeric + underscores only
        if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
            setErrorMessage("Username hanya boleh berisi huruf, angka, dan underscore (_), tanpa spasi.");
            setIsLoading(false);
            return;
        }

        const dummyEmail = `${cleanUsername}@moneytracker.com`;

        try {
            if (isSignUp) {
                // 1. Sign up user in Supabase Auth
                const { data, error } = await supabase.auth.signUp({
                    email: dummyEmail,
                    password,
                });

                if (error) throw error;

                if (data?.user) {
                    const hashedPassword = await hashPassword(password);
                    // 2. Save username and hashed password in public.users table
                    const { error: dbError } = await supabase
                        .from("users")
                        .insert([
                            {
                                id: data.user.id,
                                username: cleanUsername,
                                password: hashedPassword
                            }
                        ]);

                    if (dbError) throw dbError;

                    setSuccessMessage("Akun berhasil dibuat dan Anda telah masuk!");
                }
            } else {
                // Sign in using Supabase Auth
                const { error } = await supabase.auth.signInWithPassword({
                    email: dummyEmail,
                    password,
                });

                if (error) throw error;
            }
        } catch (error) {
            setErrorMessage(error.message || "Terjadi kesalahan autentikasi.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0a051b] px-4 py-12 font-sans">
            {/* Background Glow Orbs */}
            <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-purple-900/20 blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-pink-900/20 blur-[120px]" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl md:p-10"
            >
                <div className="mb-8 text-center">
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring" }}
                        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-pink-500 to-indigo-500 shadow-lg shadow-pink-500/20"
                    >
                        <span className="text-2xl font-black text-white">M</span>
                    </motion.div>
                    <h1 className="text-3xl font-black tracking-tight text-white">Money Tracker</h1>
                    <p className="mt-2 text-sm font-medium text-slate-400">
                        {isSignUp ? "Buat akun baru menggunakan username" : "Masuk menggunakan username dan password"}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <label className="block space-y-2">
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Username</span>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                required
                                placeholder="Masukkan username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/[0.05] py-3.5 pl-12 pr-4 text-white placeholder-slate-500 outline-none transition focus:border-pink-500/50 focus:ring-2 focus:ring-pink-500/10 focus:bg-white/[0.08]"
                            />
                        </div>
                    </label>

                    <label className="block space-y-2">
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Password</span>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                            <input
                                type="password"
                                required
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/[0.05] py-3.5 pl-12 pr-4 text-white placeholder-slate-500 outline-none transition focus:border-pink-500/50 focus:ring-2 focus:ring-pink-500/10 focus:bg-white/[0.08]"
                            />
                        </div>
                    </label>

                    <AnimatePresence mode="wait">
                        {errorMessage && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-medium text-rose-400"
                            >
                                {errorMessage}
                            </motion.div>
                        )}

                        {successMessage && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-400"
                            >
                                {successMessage}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-500 py-4 text-base font-bold text-white shadow-lg shadow-pink-500/25 transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 hover:opacity-95"
                    >
                        {isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <>
                                <span>{isSignUp ? "Daftar" : "Masuk"}</span>
                                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 border-t border-white/5 pt-6 text-center">
                    <p className="text-sm text-slate-400">
                        {isSignUp ? "Sudah memiliki akun?" : "Belum memiliki akun?"}{" "}
                        <button
                            type="button"
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setErrorMessage("");
                                setSuccessMessage("");
                            }}
                            className="font-bold text-pink-400 hover:text-pink-300 transition outline-none"
                        >
                            {isSignUp ? "Masuk" : "Buat Akun Baru"}
                        </button>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
