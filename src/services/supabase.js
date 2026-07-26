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

const mapAccountFromDB = (a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    startingBalance: Number(a.starting_balance),
});

const mapAccountToDB = (a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    starting_balance: Number(a.startingBalance),
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
