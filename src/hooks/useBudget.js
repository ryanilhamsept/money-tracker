import { useEffect, useState } from "react";
import { parseAmountInput } from "../utils/parser";
import {
    getBudget as getBudgetFromSupabase,
    saveBudget as saveBudgetToSupabase,
} from "../services/api";

export const useBudget = (userId) => {
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
        if (userId) {
            loadBudget();
        } else {
            setBudget(0);
        }
    }, [userId]);

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
