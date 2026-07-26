import { useEffect, useState } from "react";
import { parseAmountInput } from "../utils/parser";
import {
    getBudgetFromSupabase,
    saveBudgetToSupabase,
} from "../services/supabase";

export const useBudget = () => {
    const [budget, setBudget] = useState(0);
    const [budgetInput, setBudgetInput] = useState("");

    const loadBudget = async () => {
        try {
            const data = await getBudgetFromSupabase();

            setBudget(Number(data.budget) || 0);
            return true;
        } catch (error) {
            console.error("LOAD BUDGET ERROR:", error);
            setBudget(0);
            return false;
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadBudget();
    }, []);

    const saveBudget = async (event) => {
        event.preventDefault();

        const newBudget = parseAmountInput(budgetInput);

        if (!newBudget) return;

        setBudget(newBudget);
        setBudgetInput("");

        try {
            await saveBudgetToSupabase(newBudget);
            await loadBudget();
        } catch (err) {
            console.error("SAVE BUDGET ERROR:", err);
        }
    };

    return {
        budget,
        budgetInput,
        setBudgetInput,
        saveBudget,
        reloadBudget: loadBudget,
    };
};
