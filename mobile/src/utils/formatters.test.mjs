// Tes kolom nominal: `node src/utils/formatters.test.mjs`
//
// Yang dijaga di sini bukan cuma "titiknya muncul", tapi dua hal yang gampang
// rusak tanpa kelihatan: angka yang masih setengah diketik tidak boleh ditolak,
// dan nilai yang disimpan harus sama dengan yang dibaca orang di layar.

import { formatThousands, parseAmount } from "./formatters.js";

let pass = 0;
let fail = 0;

const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? "OK " : "GAGAL"}  ${name}${ok ? "" : `  (dapat ${JSON.stringify(actual)}, mau ${JSON.stringify(expected)})`}`);
};

console.log("formatThousands");
check("kosong tetap kosong", formatThousands(""), "");
check("satuan tanpa titik", formatThousands("500"), "500");
check("ribuan", formatThousands("1000"), "1.000");
check("puluhan ribu", formatThousands("10000"), "10.000");
check("ratusan ribu", formatThousands("100000"), "100.000");
check("juta", formatThousands("1000000"), "1.000.000");
check("sudah bertitik tidak dobel", formatThousands("10.000"), "10.000");
check("titik salah tempat dirapikan", formatThousands("1.0.0.00"), "10.000");
check("huruf dibuang", formatThousands("Rp 25rb000"), "25.000");
check("nol di depan dibuang", formatThousands("007"), "7");
check("nol tunggal tetap nol", formatThousands("0"), "0");
check("minus ditolak kalau tidak diizinkan", formatThousands("-5000"), "5.000");
check("minus diterima kalau diizinkan", formatThousands("-5000", { allowNegative: true }), "-5.000");
check("minus sendirian boleh menggantung", formatThousands("-", { allowNegative: true }), "-");

console.log("sen");
check("koma menggantung dipertahankan", formatThousands("10000,"), "10.000,");
check("satu digit sen", formatThousands("10000,5"), "10.000,5");
check("dua digit sen", formatThousands("10000,50"), "10.000,50");
check("digit sen ketiga dipotong", formatThousands("10000,567"), "10.000,56");
check("koma tanpa bagian bulat", formatThousands(",5"), "0,5");

console.log("ketikan bertahap -- tiap keadaan harus sah");
let typed = "";
const steps = [];
for (const ch of "1234567") {
  typed = formatThousands(typed + ch);
  steps.push(typed);
}
check("1 -> 1.234.567", steps, ["1", "12", "123", "1.234", "12.345", "123.456", "1.234.567"]);

console.log("parseAmount");
check("kosong jadi nol", parseAmount(""), 0);
check("titik ribuan dibaca", parseAmount("10.000"), 10000);
check("juta", parseAmount("1.234.567"), 1234567);
check("sen dibulatkan ke atas", parseAmount("10.000,01"), 10001);
check("sen bulat tidak naik", parseAmount("10.000,00"), 10000);
check("setengah naik", parseAmount("12,5"), 13);
check("minus dipertahankan", parseAmount("-5.000"), -5000);
check("minus dibulatkan pada besarannya", parseAmount("-5.000,5"), -5001);
check("minus sendirian jadi nol", parseAmount("-"), 0);
check("teks jadi nol", parseAmount("abcd"), 0);

console.log("bolak-balik: yang tersimpan = yang terbaca di layar");
const samples = ["", "0", "7", "1000", "10.000", "999.999", "1.000.000", "12,5", "12,99", "-5000", "Rp 450.000"];
const roundTrip = samples.every(
  (v) => parseAmount(formatThousands(v, { allowNegative: true })) === parseAmount(v)
);
check("format tidak mengubah nilai", roundTrip, true);

const reformat = samples.every((v) => {
  const once = formatThousands(v, { allowNegative: true });
  return formatThousands(once, { allowNegative: true }) === once;
});
check("format dua kali hasilnya sama", reformat, true);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
