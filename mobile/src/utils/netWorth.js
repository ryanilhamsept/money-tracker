// Mirror dari src/utils/netWorth.js (web).
import { getAccountBalanceDeltas } from "./accountBalance";
import { getTransactionMonth, currentMonth as currentMonthKey } from "./date";

const normalize = (value) => String(value || "").trim().toLowerCase();

// Akun piutang ("Utang bang bi", "Utang nopan", ...) dicatat sebagai saldo
// positif di akun biasa, padahal itu duit yang lagi di tangan orang. Sengaja
// tidak dihitung sebagai kekayaan di sini.
export const isExcludedAccount = (account) =>
  /^utang\b/.test(normalize(account?.name));

export const GROUP_WALLET = "wallet";
export const GROUP_CASH = "cash";
export const GROUP_INVESTMENT = "investment";
export const GROUP_DEBT = "debt";

export const getAccountGroup = (account) => {
  const type = normalize(account?.type);
  if (type === "kartu kredit") return GROUP_DEBT;
  if (type === "tabungan") return GROUP_INVESTMENT;
  if (type === "bank" || type === "tunai") return GROUP_CASH;
  return GROUP_WALLET;
};

// Saldo kartu kredit disimpan sebagai jumlah yang KEPAKAI, jadi dia mengurangi
// kekayaan -- bukan menambah.
const signFor = (group) => (group === GROUP_DEBT ? -1 : 1);

export const summariseNetWorth = (accounts = []) => {
  const totals = {
    [GROUP_WALLET]: 0,
    [GROUP_CASH]: 0,
    [GROUP_INVESTMENT]: 0,
    [GROUP_DEBT]: 0,
  };
  const members = {
    [GROUP_WALLET]: [],
    [GROUP_CASH]: [],
    [GROUP_INVESTMENT]: [],
    [GROUP_DEBT]: [],
  };

  accounts.filter((a) => !isExcludedAccount(a)).forEach((account) => {
    const group = getAccountGroup(account);
    totals[group] += Number(account.startingBalance) || 0;
    members[group].push(account);
  });

  const net = Object.keys(totals).reduce(
    (sum, group) => sum + totals[group] * signFor(group),
    0
  );

  return { totals, members, net };
};

// Delta tiap transaksi terhadap saldo akun, dikelompokkan per bulan. Dipakai
// buat menggulung saldo mundur.
const buildMonthlyDeltas = (accounts, transactions) => {
  const byMonth = new Map();

  transactions.forEach((transaction) => {
    const month = getTransactionMonth(transaction.date);
    if (!byMonth.has(month)) byMonth.set(month, new Map());
    const bucket = byMonth.get(month);

    getAccountBalanceDeltas(accounts, null, transaction).forEach(
      ({ account, amount }) => {
        bucket.set(account.id, (bucket.get(account.id) || 0) + amount);
      }
    );
  });

  return byMonth;
};

const shiftMonthKey = (monthKey, delta) => {
  const [year, month] = String(monthKey).split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

// Bulan pertama yang catatannya layak dipercaya. Sebelum pemasukan mulai
// dicatat, menggulung saldo mundur cuma mengembalikan pengeluaran tanpa ada
// pemasukan yang mengimbangi -- saldo masa lalu jadi menggelembung dan
// grafiknya menurun padahal kekayaannya tidak. Lebih baik grafiknya pendek
// tapi benar; jendelanya memanjang sendiri seiring bulan berjalan.
export const getFirstTrustedMonth = (transactions = []) => {
  let earliest = "";
  transactions.forEach((transaction) => {
    if (transaction.type !== "income") return;
    const month = getTransactionMonth(transaction.date);
    if (!earliest || month < earliest) earliest = month;
  });
  return earliest;
};

export const getNetWorthHistory = (
  accounts = [],
  transactions = [],
  { maxMonths = 12, today = currentMonthKey() } = {}
) => {
  const kept = accounts.filter((a) => !isExcludedAccount(a));
  if (kept.length === 0) return [];

  const firstTrusted = getFirstTrustedMonth(transactions);
  const windowStart = shiftMonthKey(today, -(maxMonths - 1));
  const start = firstTrusted && firstTrusted > windowStart ? firstTrusted : windowStart;

  const months = [];
  for (let month = start; month <= today; month = shiftMonthKey(month, 1)) {
    months.push(month);
  }
  if (months.length === 0) return [];

  const deltas = buildMonthlyDeltas(accounts, transactions);

  return months.map((month) => {
    // Saldo akhir bulan ini = saldo sekarang dikurangi transaksi yang
    // terjadi sesudahnya. Transaksi bertanggal setelah bulan berjalan
    // (angsuran yang belum jatuh tempo) sengaja dibiarkan: saldo yang
    // tersimpan sudah memuatnya, jadi batang terakhir sama persis dengan
    // angka besar di atas kartu.
    const balances = new Map(
      kept.map((a) => [a.id, Number(a.startingBalance) || 0])
    );

    deltas.forEach((bucket, deltaMonth) => {
      if (deltaMonth <= month || deltaMonth > today) return;
      bucket.forEach((amount, accountId) => {
        if (!balances.has(accountId)) return;
        balances.set(accountId, balances.get(accountId) - amount);
      });
    });

    const totals = {
      [GROUP_WALLET]: 0,
      [GROUP_CASH]: 0,
      [GROUP_INVESTMENT]: 0,
      [GROUP_DEBT]: 0,
    };
    kept.forEach((account) => {
      totals[getAccountGroup(account)] += balances.get(account.id) || 0;
    });

    const net = Object.keys(totals).reduce(
      (sum, group) => sum + totals[group] * signFor(group),
      0
    );

    return { month, totals, net };
  });
};
