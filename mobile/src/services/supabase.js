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

export const getAccounts = async () => {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data.map(mapAccountFromDB);
};

export const getTransactions = async () => {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data.map(mapTransactionFromDB);
};
