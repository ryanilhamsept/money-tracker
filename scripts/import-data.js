import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');

if (!fs.existsSync(envPath)) {
    console.error("No .env file found at root!");
    process.exit(1);
}

// Simple env file parser
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.substring(1, value.length - 1);
        }
        env[match[1]] = value.trim();
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
const googleSheetUrl = env.VITE_GOOGLE_SHEET_API_URL;

if (!supabaseUrl || !supabaseAnonKey || !googleSheetUrl) {
    console.error("Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, or VITE_GOOGLE_SHEET_API_URL in .env!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const isValidUUID = (str) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

const runMigration = async () => {
    try {
        console.log("=== STARTING MIGRATION (SORTED DESCENDING IN DATABASE) ===");

        // 1. Clear existing rows in Supabase
        console.log("\n[1/4] Clearing existing tables in Supabase...");
        
        const { error: delTransErr } = await supabase.from('transactions').delete().neq('title', 'XYZ_NON_EXISTENT_ROW_DELETE_ALL');
        if (delTransErr) throw delTransErr;
        console.log("✓ Cleared 'transactions' table.");

        const { error: delAccErr } = await supabase.from('accounts').delete().neq('name', 'XYZ_NON_EXISTENT_ROW_DELETE_ALL');
        if (delAccErr) throw delAccErr;
        console.log("✓ Cleared 'accounts' table.");

        const { error: delBudErr } = await supabase.from('budgets').delete().neq('id', 'XYZ_NON_EXISTENT_ROW_DELETE_ALL');
        if (delBudErr) throw delBudErr;
        console.log("✓ Cleared 'budgets' table.");

        // 2. Fetch and insert Accounts
        console.log("\n[2/4] Fetching Accounts from Google Sheets...");
        const accountsRes = await fetch(googleSheetUrl + '?type=accounts');
        if (!accountsRes.ok) throw new Error(`HTTP ${accountsRes.status} fetching accounts`);
        const accounts = await accountsRes.json();
        console.log(`✓ Fetched ${accounts.length} accounts.`);

        const mappedAccounts = accounts.map(a => ({
            id: a.id,
            name: a.name,
            type: a.type,
            starting_balance: Number(a.startingBalance || 0)
        }));

        console.log("Inserting Accounts into Supabase...");
        const { error: accInsertErr } = await supabase.from('accounts').insert(mappedAccounts);
        if (accInsertErr) throw accInsertErr;
        console.log("✓ Accounts inserted successfully.");

        // 3. Fetch and insert Budget
        console.log("\n[3/4] Fetching Budget from Google Sheets...");
        const budgetRes = await fetch(googleSheetUrl + '?type=budget');
        if (!budgetRes.ok) throw new Error(`HTTP ${budgetRes.status} fetching budget`);
        const budgetData = await budgetRes.json();
        console.log(`✓ Fetched budget limit: Rp ${Number(budgetData.budget).toLocaleString('id-ID')}`);

        console.log("Inserting Budget into Supabase...");
        const { error: budgetInsertErr } = await supabase.from('budgets').insert([
            { id: 'current', amount: Number(budgetData.budget || 0) }
        ]);
        if (budgetInsertErr) throw budgetInsertErr;
        console.log("✓ Budget limit inserted successfully.");

        // 4. Fetch and insert Transactions
        console.log("\n[4/4] Fetching Transactions from Google Sheets...");
        const transRes = await fetch(googleSheetUrl);
        if (!transRes.ok) throw new Error(`HTTP ${transRes.status} fetching transactions`);
        const transData = await transRes.json();
        const rows = transData.rows || [];
        console.log(`✓ Fetched ${rows.length} transactions.`);

        const mappedTransactions = rows.map(r => {
            const t = {
                date: r.date,
                title: r.title,
                category: r.category,
                amount: Number(r.amount || 0),
                source: r.source,
                dana_dipakai: r.danaDipakai
            };
            
            if (r.id && r.id.trim() !== '' && isValidUUID(r.id)) {
                t.id = r.id;
            } else {
                t.id = crypto.randomUUID();
            }

            if (r.rowNumber) {
                t.row_number = Number(r.rowNumber);
            }
            return t;
        });

        // SORT DESCENDING: Newest dates first, highest row_numbers first.
        // This ensures they are physically written in descending order in PostgreSQL.
        console.log("Sorting transactions descending (newest first)...");
        mappedTransactions.sort((a, b) => {
            const dateCompare = b.date.localeCompare(a.date);
            if (dateCompare !== 0) return dateCompare;
            return (b.row_number || 0) - (a.row_number || 0);
        });

        console.log("Inserting Transactions into Supabase in descending order (batches of 100)...");
        const batchSize = 100;
        for (let i = 0; i < mappedTransactions.length; i += batchSize) {
            const batch = mappedTransactions.slice(i, i + batchSize);
            const { error: transInsertErr } = await supabase.from('transactions').insert(batch);
            if (transInsertErr) {
                console.error(`Error in batch starting at index ${i}:`, transInsertErr);
                throw transInsertErr;
            }
            console.log(`  ✓ Inserted batch index ${i} to ${i + batch.length - 1}`);
        }

        console.log("\n=== MIGRATION COMPLETE! ALL DATA IMPORTED IN DESCENDING ORDER ===");
    } catch (err) {
        console.error("\n❌ Migration failed with error:", err.message || err);
        process.exit(1);
    }
};

runMigration();
