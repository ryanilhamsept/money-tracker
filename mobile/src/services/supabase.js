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
  issuer: a.issuer || "",
  productName: a.product_name || "",
  sharesLimit: Boolean(a.shares_limit),
  totalLimit: a.total_limit != null ? Number(a.total_limit) : null,
  dueDate: a.due_date != null ? Number(a.due_date) : null,
  color: a.color || "",
});

const mapTransactionFromDB = (t) => ({
  id: t.id,
  date: t.date,
  time: t.time || "",
  title: t.title,
  category: t.category,
  amount: Number(t.amount),
  source: t.source,
  danaDipakai: t.dana_dipakai,
  type: t.type === "income" ? "income" : "expense",
  installmentTotalLoan: t.installment_total_loan,
  createdAt: t.created_at,
});

const mapTransactionToDB = (t) => ({
  id: t.id,
  date: t.date,
  time: t.time || null,
  title: t.title,
  category: t.category,
  amount: Number(t.amount),
  source: t.source,
  dana_dipakai: t.danaDipakai,
  type: t.type === "income" ? "income" : "expense",
  installment_total_loan: t.installmentTotalLoan != null ? Number(t.installmentTotalLoan) : null,
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

// --- Installments ---

const mapInstallmentFromDB = (i) => ({
  id: i.id,
  accountId: i.account_id,
  transactionId: i.transaction_id,
  name: i.name,
  provider: i.provider,
  totalLoan: Number(i.total_loan),
  remainingBalance: Number(i.remaining_balance),
  monthlyInstallment: Number(i.monthly_installment),
  remainingTerm: i.remaining_term,
  dueDate: i.due_date,
  createdAt: i.created_at,
});

const mapInstallmentToDB = (i) => ({
  id: i.id,
  account_id: i.accountId,
  transaction_id: i.transactionId || null,
  name: i.name,
  provider: i.provider || "",
  total_loan: Number(i.totalLoan) || 0,
  remaining_balance: Number(i.remainingBalance) || 0,
  monthly_installment: Number(i.monthlyInstallment) || 0,
  remaining_term: i.remainingTerm || null,
  due_date: i.dueDate || null,
});

export const getInstallments = async () => {
  const { data, error } = await supabase
    .from("installments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching installments:", error);
    return [];
  }
  return data.map(mapInstallmentFromDB);
};

export const addInstallment = async (installment) => {
  const { error } = await supabase
    .from("installments")
    .insert([mapInstallmentToDB(installment)]);

  if (error) throw error;
};

export const updateInstallment = async (installment) => {
  const { error } = await supabase
    .from("installments")
    .update(mapInstallmentToDB(installment))
    .eq("id", installment.id);

  if (error) throw error;
};

export const deleteInstallment = async (id) => {
  const { error } = await supabase.from("installments").delete().eq("id", id);
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

// Atomically add `delta` to an account's starting balance via a Postgres
// function, instead of overwriting with a client-computed value -- avoids
// clobbering concurrent writes from the Gmail auto-import script or the web app.
export const adjustAccountBalance = async (accountId, delta) => {
  const { data, error } = await supabase.rpc("increment_account_balance", {
    p_account_id: accountId,
    p_delta: delta,
  });
  if (error) throw error;
  return Number(data);
};

export const updateAccountFields = async (id, fields) => {
  const dbPayload = {};
  if (fields.startingBalance !== undefined) dbPayload.starting_balance = Number(fields.startingBalance);
  if (fields.totalLimit !== undefined) dbPayload.total_limit = fields.totalLimit;
  if (fields.dueDate !== undefined) dbPayload.due_date = fields.dueDate;
  if (fields.issuer !== undefined) dbPayload.issuer = fields.issuer;
  if (fields.productName !== undefined) dbPayload.product_name = fields.productName;
  if (fields.sharesLimit !== undefined) dbPayload.shares_limit = fields.sharesLimit;
  if (fields.color !== undefined) dbPayload.color = fields.color;

  const { error } = await supabase
    .from("accounts")
    .update(dbPayload)
    .eq("id", id);

  if (error) throw error;
};

export const addAccount = async (account) => {
  const { error } = await supabase.from("accounts").insert([
    {
      id: account.id,
      name: account.name,
      type: account.type,
      starting_balance: Number(account.startingBalance) || 0,
      issuer: account.issuer || null,
      product_name: account.productName || null,
      shares_limit: Boolean(account.sharesLimit),
      total_limit: account.totalLimit != null && account.totalLimit !== "" ? Number(account.totalLimit) : null,
      due_date: account.dueDate != null && account.dueDate !== "" ? Number(account.dueDate) : null,
      color: account.color || null,
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
