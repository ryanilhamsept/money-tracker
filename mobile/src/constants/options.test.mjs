// Daftar pilihan di mobile ditulis tangan, sedangkan web membacanya dari .env
// (yang mengalahkan daftar bawaan di src/constants/options.js). Tiga tempat,
// gampang melenceng -- dan kalau melenceng, satu app menawarkan pilihan yang
// tidak ada di satunya. "Gajian" pernah hilang dari mobile persis karena ini.
import { readFileSync } from "node:fs";
import { fundSources, danaDipakaiOptions, categories } from "./options.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
// .env tidak ikut repo (gitignore), dan yang menentukan di produksi justru
// env di Vercel. Jadi kalau filenya tidak ada, bagian itu dilewati saja --
// perbandingan ke daftar bawaan di kode tetap jalan.
let env = "";
try {
  env = readFileSync(ROOT + ".env", "utf8");
} catch {
  console.log("  (.env tidak ada, perbandingan ke .env dilewati)");
}
const web = readFileSync(ROOT + "src/constants/options.js", "utf8");

const dariEnv = (key) => {
  const m = env.match(new RegExp("^" + key + '="([^"]*)"', "m"));
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim());
};
const bawaanWeb = (name) => {
  const m = web.match(new RegExp("export const " + name + " =[\\s\\S]*?\\[([\\s\\S]*?)\\];"));
  return m[1].match(/"([^"]*)"/g).map((s) => s.slice(1, -1));
};

let pass = 0, fail = 0;
const check = (nama, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) pass++; else fail++;
  console.log((ok ? "  OK   " : "GAGAL  ") + nama);
  if (!ok) console.log("         mobile  " + JSON.stringify(a) + "\n         web     " + JSON.stringify(b));
};

console.log("daftar pilihan web dan mobile sama");
if (env) {
  check("sumber dana (mobile vs .env)", fundSources, dariEnv("VITE_FUND_SOURCES"));
  check("dana dipakai (mobile vs .env)", danaDipakaiOptions, dariEnv("VITE_DANA_DIPAKAI_OPTIONS"));
}
check("sumber dana (mobile vs bawaan web)", fundSources, bawaanWeb("fundSources"));
check("dana dipakai (mobile vs bawaan web)", danaDipakaiOptions, bawaanWeb("danaDipakaiOptions"));
check("kategori (mobile vs bawaan web)", categories, bawaanWeb("categories"));

// Nilai yang ditulis importir Gmail harus ada di daftar, kalau nggak barisnya
// muncul ditandai "di luar daftar pilihan" tiap kali diedit.
const importir = readFileSync(ROOT + "scripts/gmail-import.gs", "utf8");
const dipakaiImportir = (re) => [...new Set([...importir.matchAll(re)].map((m) => m[1]))].sort();
check("sumber dana yang ditulis importir ada di daftar",
  dipakaiImportir(/source: '([^']+)'/g).filter((v) => v !== "Perlu Dicek" && !fundSources.includes(v)), []);
check("dana dipakai yang ditulis importir ada di daftar",
  dipakaiImportir(/dana(?:_dipakai)?: '([^']+)'/g).filter((v) => v && !danaDipakaiOptions.includes(v)), []);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
