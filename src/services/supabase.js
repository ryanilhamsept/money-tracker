import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const googleSheetApiUrl = import.meta.env.VITE_GOOGLE_SHEET_API_URL;
const googleSheetApiToken = import.meta.env.VITE_API_TOKEN;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Google Sheets Mirroring Helper ---
const mirrorToGoogleSheet = async (payload) => {
    if (!googleSheetApiUrl) return;
    try {
        await fetch(googleSheetApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${googleSheetApiToken || ""}`,
            },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error("Failed to mirror change to Google Sheets:", err);
    }
};

// --- Mappers ---

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
    createdAt: t.created_at,
    installmentTotalLoan: t.installment_total_loan != null ? Number(t.installment_total_loan) : null,
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
    installment_total_loan: t.installmentTotalLoan != null && t.installmentTotalLoan !== "" ? Number(t.installmentTotalLoan) : null,
});

const mapInstallmentFromDB = (i) => ({
    id: i.id,
    accountId: i.account_id,
    transactionId: i.transaction_id,
    name: i.name,
    provider: i.provider || "",
    totalLoan: Number(i.total_loan) || 0,
    remainingBalance: Number(i.remaining_balance) || 0,
    monthlyInstallment: Number(i.monthly_installment) || 0,
    remainingTerm: i.remaining_term != null ? Number(i.remaining_term) : null,
    dueDate: i.due_date != null ? Number(i.due_date) : null,
    createdAt: i.created_at,
});

const mapInstallmentToDB = (i) => ({
    id: i.id,
    account_id: i.accountId,
    transaction_id: i.transactionId || null,
    name: i.name,
    provider: i.provider || null,
    total_loan: Number(i.totalLoan) || 0,
    remaining_balance: Number(i.remainingBalance) || 0,
    monthly_installment: Number(i.monthlyInstallment) || 0,
    remaining_term: i.remainingTerm != null && i.remainingTerm !== "" ? Number(i.remainingTerm) : null,
    due_date: i.dueDate != null && i.dueDate !== "" ? Number(i.dueDate) : null,
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

const mapAccountToDB = (a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    starting_balance: Number(a.startingBalance),
    issuer: a.issuer || null,
    product_name: a.productName || null,
    shares_limit: Boolean(a.sharesLimit),
    total_limit: a.totalLimit != null && a.totalLimit !== "" ? Number(a.totalLimit) : null,
    due_date: a.dueDate != null && a.dueDate !== "" ? Number(a.dueDate) : null,
    color: a.color || null,
});

// --- Transactions API ---

export const getTransactionsFromSupabase = async () => {
    // Supabase default limit = 1000 rows. Paginate to get everything.
    const PAGE_SIZE = 1000;
    let allData = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from("transactions")
            .select("*")
            .order("date", { ascending: false })
            .order("time", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        allData = allData.concat(data);

        if (data.length < PAGE_SIZE) {
            hasMore = false;
        } else {
            from += PAGE_SIZE;
        }
    }

    return allData.map(mapTransactionFromDB);
};

export const syncTransactionToSupabase = async (transaction) => {
    const dbPayload = mapTransactionToDB(transaction);
    const { data, error } = await supabase
        .from("transactions")
        .insert([dbPayload])
        .select()
        .single();

    if (error) throw error;

    // Mirror to Google Sheets
    void mirrorToGoogleSheet({
        action: "add",
        id: transaction.id,
        date: transaction.date,
        notes: transaction.title,
        category: transaction.category,
        nominal: String(transaction.amount),
        ambil: transaction.danaDipakai,
        sof: transaction.source,
    });

    return { success: true, data: mapTransactionFromDB(data) };
};

export const updateTransactionToSupabase = async (transaction) => {
    const dbPayload = mapTransactionToDB(transaction);
    const { data, error } = await supabase
        .from("transactions")
        .update(dbPayload)
        .eq("id", transaction.id)
        .select()
        .single();

    if (error) throw error;

    // Mirror to Google Sheets
    void mirrorToGoogleSheet({
        action: "update",
        id: transaction.id,
        date: transaction.date,
        notes: transaction.title,
        category: transaction.category,
        nominal: String(transaction.amount),
        ambil: transaction.danaDipakai,
        sof: transaction.source,
    });

    return { success: true, data: mapTransactionFromDB(data) };
};

export const deleteTransactionFromSupabase = async (id) => {
    const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);

    if (error) throw error;

    // Mirror to Google Sheets
    void mirrorToGoogleSheet({ action: "delete", id });

    return { success: true };
};

// --- Budget API ---

export const getBudgetFromSupabase = async (userId) => {
    if (!userId) return { budget: 0 };
    
    const { data, error } = await supabase
        .from("budgets")
        .select("amount")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.error("Error fetching budget:", error);
    }

    return { budget: Number(data?.amount || 0) };
};

export const saveBudgetToSupabase = async (userId, amount) => {
    if (!userId) throw new Error("User ID is required");

    const { data, error } = await supabase
        .from("budgets")
        .upsert({ 
            id: userId, // Gunakan userId sebagai id agar unik tiap user
            user_id: userId, 
            amount: Number(amount), 
            updated_at: new Date().toISOString() 
        })
        .select()
        .single();

    if (error) throw error;

    // Mirror to Google Sheets
    void mirrorToGoogleSheet({ action: "saveBudget", budget: Number(amount) });

    return data;
};

// --- Accounts API ---

export const getAccountsFromSupabase = async () => {
    const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("name", { ascending: true });

    if (error) throw error;
    return data.map(mapAccountFromDB);
};

export const addAccountToSupabase = async (account) => {
    const dbPayload = mapAccountToDB(account);
    const { data, error } = await supabase
        .from("accounts")
        .insert([dbPayload])
        .select()
        .single();

    if (error) throw error;

    // Mirror to Google Sheets
    void mirrorToGoogleSheet({
        action: "addAccount",
        id: account.id,
        name: account.name,
        type: account.type,
        startingBalance: String(account.startingBalance),
    });

    return { success: true, data: mapAccountFromDB(data) };
};

export const deleteAccountFromSupabase = async (id) => {
    const { error } = await supabase
        .from("accounts")
        .delete()
        .eq("id", id);

    if (error) throw error;

    // Mirror to Google Sheets
    void mirrorToGoogleSheet({ action: "deleteAccount", id });

    return { success: true };
};

export const updateStartingBalanceInSupabase = async (id, balance) => {
    const { data, error } = await supabase
        .from("accounts")
        .update({ starting_balance: Number(balance) })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;

    // Mirror to Google Sheets
    void mirrorToGoogleSheet({ action: "updateStartingBalance", id, balance: Number(balance) });

    return { success: true, data: mapAccountFromDB(data) };
};

export const updateAccountFieldsInSupabase = async (id, fields) => {
    const dbPayload = {};
    if (fields.startingBalance !== undefined) dbPayload.starting_balance = Number(fields.startingBalance);
    if (fields.totalLimit !== undefined) dbPayload.total_limit = fields.totalLimit;
    if (fields.dueDate !== undefined) dbPayload.due_date = fields.dueDate;
    if (fields.issuer !== undefined) dbPayload.issuer = fields.issuer;
    if (fields.productName !== undefined) dbPayload.product_name = fields.productName;
    if (fields.sharesLimit !== undefined) dbPayload.shares_limit = fields.sharesLimit;
    if (fields.color !== undefined) dbPayload.color = fields.color;

    const { data, error } = await supabase
        .from("accounts")
        .update(dbPayload)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;

    // Mirror to Google Sheets
    void mirrorToGoogleSheet({ action: "updateAccountFields", id, ...fields });

    return { success: true, data: mapAccountFromDB(data) };
};

// --- Goals (Plan) API ---
// Tabel "goals" dipakai bareng sama app lain (skema name/required/collected,
// bukan title/targetAmount/savedAmount) -- mapper di bawah nyesuain ke itu.

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

export const getGoalsFromSupabase = async () => {
    const { data, error } = await supabase
        .from("goals")
        .select("*")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Error fetching goals:", error);
        return [];
    }
    return data.map(mapGoalFromDB);
};

export const addGoalToSupabase = async (goal, userId) => {
    const { error } = await supabase.from("goals").insert([
        { ...mapGoalToDB(goal), user_id: userId, updated_at: new Date().toISOString() },
    ]);
    if (error) throw error;
};

export const updateGoalInSupabase = async (goal) => {
    const { error } = await supabase
        .from("goals")
        .update({ ...mapGoalToDB(goal), updated_at: new Date().toISOString() })
        .eq("id", goal.id);

    if (error) throw error;
};

export const deleteGoalFromSupabase = async (id) => {
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) throw error;
};

// --- Installments API ---

export const getInstallmentsFromSupabase = async () => {
    const { data, error } = await supabase
        .from("installments")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data.map(mapInstallmentFromDB);
};

export const addInstallmentToSupabase = async (installment) => {
    const { error } = await supabase
        .from("installments")
        .insert([mapInstallmentToDB(installment)]);

    if (error) throw error;
};

export const updateInstallmentInSupabase = async (id, fields) => {
    const dbPayload = {};
    if (fields.remainingBalance !== undefined) dbPayload.remaining_balance = Number(fields.remainingBalance);
    if (fields.remainingTerm !== undefined) dbPayload.remaining_term = fields.remainingTerm;
    if (fields.dueDate !== undefined) dbPayload.due_date = fields.dueDate;

    const { error } = await supabase
        .from("installments")
        .update(dbPayload)
        .eq("id", id);

    if (error) throw error;
};

export const deleteInstallmentFromSupabase = async (id) => {
    const { error } = await supabase.from("installments").delete().eq("id", id);
    if (error) throw error;
};
