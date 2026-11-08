require("dotenv").config();

const express = require("express");
const cors = require("cors");
const compression = require("compression");
const { Pool, types } = require("pg");

// DATE columns (OID 1082) default to JS Date objects, which serialize to
// full ISO datetimes ("2026-08-26T00:00:00.000Z") and break the frontend's
// plain "YYYY-MM-DD" date parsing. Keep them as the raw string Postgres sends.
types.setTypeParser(1082, (val) => val);

const { authMiddleware } = require("./middleware/auth");
const transactionRoutes = require("./routes/transactions");
const accountRoutes = require("./routes/accounts");
const budgetRoutes = require("./routes/budgets");
const goalRoutes = require("./routes/goals");
const installmentRoutes = require("./routes/installments");
const aiRoutes = require("./routes/ai");

const app = express();

// --- Database ---
// Catatan region: database ini di Supabase ap-south-1 (Mumbai). vercel.json
// menyematkan function ke bom1 (Mumbai juga) supaya keduanya bertetangga.
// Tanpa itu Vercel menaruh function di iad1 (Washington DC) dan tiap query
// bolak-balik Amerika-India: terukur ~200 ms perjalanan untuk query yang
// eksekusinya cuma 2 ms. Penjelasan ini ada di sini karena vercel.json
// menolak key apa pun di luar skemanya -- termasuk key komentar.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: process.env.VERCEL ? 1 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
});

pool.query("SELECT 1")
    .then(() => console.log("✅ Connected to database"))
    .catch((err) => {
        console.error("⚠️ Database connection warning:", err.message);
    });

// --- Middleware ---
const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    // Preview app mobile lewat react-native-web. APK aslinya bukan browser,
    // jadi dia nggak kena CORS sama sekali -- ini murni buat pratinjau.
    "http://localhost:8092",
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []),
];

// Di luar produksi, localhost port berapa pun diterima.
//
// Daftar di atas mencantumkan port satu per satu, dan itu rapuh: Vite yang
// dijalankan di 5180 (atau 5174 karena 5173 lagi dipakai) langsung kena CORS,
// padahal yang berubah cuma nomor port di laptop sendiri. Tiap kali itu
// terjadi, yang kelihatan di layar bukan "port salah" tapi "Failed to load
// data from database" -- pesan yang menunjuk ke arah yang sama sekali keliru.
//
// Melonggarkan ini aman: localhost cuma bisa dipanggil dari mesin ini
// sendiri, dan setiap route tetap menuntut bearer token yang sah, jadi
// halaman asing tidak dapat apa-apa walau originnya lolos. Di Vercel
// NODE_ENV = "production", jadi di sana daftarnya tetap ketat.
const isDev = process.env.NODE_ENV !== "production";
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

app.use(
    cors({
        origin(origin, callback) {
            // Permintaan tanpa Origin (curl, app mobile, server-to-server)
            // bukan permintaan lintas asal, jadi tidak ada yang perlu dicegah.
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            if (isDev && LOCALHOST.test(origin)) return callback(null, true);
            return callback(null, false);
        },
        credentials: true,
    })
);

// Daftar transaksi penuh itu 411 KB JSON mentah dan 68 KB setelah gzip --
// 84% dari yang dikirim selama ini sebetulnya tidak perlu lewat kabel.
app.use(compression());

app.use(express.json());

// Express sudah memasang ETag di tiap response. Yang kurang cuma izin buat
// browser memakainya: tanpa Cache-Control, browser tidak mengirim
// If-None-Match, jadi 68 KB yang sama dikirim ulang terus walaupun tidak ada
// yang berubah. "no-cache" bukan berarti jangan di-cache -- artinya selalu
// tanya dulu, dan kalau ETag-nya masih sama server menjawab 304 tanpa badan
// response sama sekali. "private" wajib ada karena ini data per-pengguna:
// tanpa itu cache bersama (proxy, CDN) boleh menyimpan dan menyajikannya ke
// orang lain.
app.use((req, res, next) => {
    if (req.method === "GET") res.set("Cache-Control", "private, no-cache");
    next();
});

// --- Routes ---
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "money-tracker-api" });
});

// Protected routes
app.use("/api/transactions", authMiddleware, transactionRoutes(pool));
app.use("/api/accounts", authMiddleware, accountRoutes(pool));
app.use("/api/budgets", authMiddleware, budgetRoutes(pool));
app.use("/api/goals", authMiddleware, goalRoutes(pool));
app.use("/api/installments", authMiddleware, installmentRoutes(pool));
app.use("/api/ai", authMiddleware, aiRoutes());

// Exported without listening: `src/index.js` starts a real server for local
// dev, while `api/index.js` hands the same app to Vercel as a function.
module.exports = app;
