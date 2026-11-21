// Tes dropdown: `node src/utils/optionList.test.mjs`
import { withCurrentValue, withUsedValues, DI_LUAR_DAFTAR } from "./optionList.js";

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "OK " : "GAGAL"}  ${name}${ok ? "" : `\n        dapat ${JSON.stringify(actual)}\n        mau   ${JSON.stringify(expected)}`}`);
};

const SUMBER = ["BCA", "Blu"];
const v = (s) => ({ value: s, label: s });
const luar = (s) => ({ value: s, label: s + DI_LUAR_DAFTAR });

console.log("withCurrentValue");
check("nilai yang sudah terdaftar tidak digandakan",
  withCurrentValue(SUMBER, "BCA"), [v("BCA"), v("Blu")]);
check("nilai di luar daftar ikut ditawarkan, paling atas dan ditandai",
  withCurrentValue(SUMBER, "Perlu Dicek"), [luar("Perlu Dicek"), v("BCA"), v("Blu")]);
check("nilai kosong tidak menambah apa-apa",
  withCurrentValue(SUMBER, ""), [v("BCA"), v("Blu")]);
check("null/undefined aman",
  withCurrentValue(SUMBER, null), [v("BCA"), v("Blu")]);
check("spasi di ujung tidak bikin duplikat",
  withCurrentValue(SUMBER, "  BCA  "), [v("BCA"), v("Blu")]);
check("daftar berbentuk {value,label} juga diterima",
  withCurrentValue([{ value: "BCA", label: "Bank BCA" }], "Perlu Dicek"),
  [luar("Perlu Dicek"), { value: "BCA", label: "Bank BCA" }]);

console.log("withUsedValues");
const rows = [
  { source: "BCA" }, { source: "Perlu Dicek" }, { source: "Perlu Dicek" },
  { source: "Cash" }, { source: "" }, { source: null }, {},
];
check("nilai yang ada di data tapi bukan pilihan resmi ikut ditawarkan sekali",
  withUsedValues(SUMBER, rows, "source"),
  [luar("Cash"), luar("Perlu Dicek"), v("BCA"), v("Blu")]);
check("data kosong mengembalikan daftar resmi apa adanya",
  withUsedValues(SUMBER, [], "source"), [v("BCA"), v("Blu")]);
check("kolom yang tidak ada tidak bikin baris hantu",
  withUsedValues(SUMBER, rows, "danaDipakai"), [v("BCA"), v("Blu")]);

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
