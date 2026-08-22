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
