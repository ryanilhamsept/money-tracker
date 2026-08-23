import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Tabel "goals" ini udah ada sebelumnya (dipakai app lain juga), jadi kita
// ikutin skema yang udah ada (name/required/collected) -- bukan bikin tabel baru.
const mapGoalFromDB = (g) => ({
  id: g.id,
  title: g.name,
  icon: g.icon || "🎯",
  color: g.color || "#8b5cf6",
  targetAmount: Number(g.required),
  savedAmount: Number(g.collected),
  deadline: g.deadline,
  note: g.note,
  createdAt: g.created_at,
});

const mapGoalToDB = (g) => ({
  id: g.id,
  name: g.title,
  icon: g.icon || null,
  color: g.color || null,
  required: Number(g.targetAmount) || 0,
  collected: Number(g.savedAmount) || 0,
  deadline: g.deadline || null,
  note: g.note || null,
});

const mapAccountFromDB = (a) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  startingBalance: Number(a.starting_balance),
});

const mapTransactionFromDB = (t) => ({
  id: t.id,
  date: t.date,
  title: t.title,
  category: t.category,
  amount: Number(t.amount),
  source: t.source,
  danaDipakai: t.dana_dipakai,
  type: t.type === "income" ? "income" : "expense",
  createdAt: t.created_at,
});

const mapTransactionToDB = (t) => ({
  id: t.id,
  date: t.date,
  title: t.title,
  category: t.category,
  amount: Number(t.amount),
  source: t.source,
  dana_dipakai: t.danaDipakai,
  type: t.type === "income" ? "income" : "expense",
});

export const addTransaction = async (transaction) => {
  const { error } = await supabase
    .from("transactions")
    .insert([mapTransactionToDB(transaction)]);

  if (error) throw error;
};

export const updateTransaction = async (transaction) => {
  const { error } = await supabase
    .from("transactions")
    .update(mapTransactionToDB(transaction))
    .eq("id", transaction.id);

  if (error) throw error;
};

export const deleteTransaction = async (id) => {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
};

export const getBudget = async (userId) => {
  if (!userId) return 0;

  const { data, error } = await supabase
    .from("budgets")
    .select("amount")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching budget:", error);
  }

  return Number(data?.amount || 0);
};

export const saveBudget = async (userId, amount) => {
  if (!userId) throw new Error("User ID is required");

  const { error } = await supabase.from("budgets").upsert({
    id: userId,
    user_id: userId,
    amount: Number(amount),
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
};

export const updateAccountBalance = async (accountId, newBalance) => {
  const { error } = await supabase
    .from("accounts")
    .update({ starting_balance: newBalance })
    .eq("id", accountId);

  if (error) throw error;
};

export const addAccount = async (account) => {
  const { error } = await supabase.from("accounts").insert([
    {
      id: account.id,
      name: account.name,
      type: account.type,
      starting_balance: Number(account.startingBalance) || 0,
    },
  ]);

  if (error) throw error;
};

export const deleteAccount = async (id) => {
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
};

export const getAccounts = async () => {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data.map(mapAccountFromDB);
};

export const getGoals = async () => {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    // Tabel goals mungkin belum dimigrasikan -- jangan sampai
    // gagal ngambil goals bikin seluruh dashboard (transaksi, akun) ikut gagal.
    console.error("Error fetching goals:", error);
    return [];
  }
  return data.map(mapGoalFromDB);
};

export const addGoal = async (goal, userId) => {
  const { error } = await supabase.from("goals").insert([
    { ...mapGoalToDB(goal), user_id: userId, updated_at: new Date().toISOString() },
  ]);
  if (error) throw error;
};

export const updateGoal = async (goal) => {
  const { error } = await supabase
    .from("goals")
    .update({ ...mapGoalToDB(goal), updated_at: new Date().toISOString() })
    .eq("id", goal.id);

  if (error) throw error;
};

export const deleteGoal = async (id) => {
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) throw error;
};

const mapSplitBillFromDB = (b) => ({
  id: b.id,
  title: b.title,
  totalAmount: Number(b.total_amount),
  date: b.date,
  participants: Array.isArray(b.participants) ? b.participants : [],
  items: Array.isArray(b.items) ? b.items : [],
  createdAt: b.created_at,
});

const mapSplitBillToDB = (b) => ({
  id: b.id,
  title: b.title,
  total_amount: Number(b.totalAmount) || 0,
  date: b.date,
  participants: b.participants || [],
  items: b.items || [],
});

export const getSplitBills = async () => {
  const { data, error } = await supabase
    .from("split_bills")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching split bills:", error);
    return [];
  }
  return data.map(mapSplitBillFromDB);
};

export const addSplitBill = async (bill) => {
  const { error } = await supabase.from("split_bills").insert([mapSplitBillToDB(bill)]);
  if (error) throw error;
};

export const updateSplitBill = async (bill) => {
  const { error } = await supabase
    .from("split_bills")
    .update(mapSplitBillToDB(bill))
    .eq("id", bill.id);

  if (error) throw error;
};

export const deleteSplitBill = async (id) => {
  const { error } = await supabase.from("split_bills").delete().eq("id", id);
  if (error) throw error;
};

export const getTransactions = async () => {
  // Supabase default limit = 1000 baris. Paginate biar dapet semuanya,
  // sama kayak getTransactionsFromSupabase di app web.
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    allData = allData.concat(data);

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData.map(mapTransactionFromDB);
};
