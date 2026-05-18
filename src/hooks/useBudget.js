import { useEffect, useState } from "react";
import { parseAmountInput } from "../utils/parser";

const BUDGET_STORAGE_KEY = "pwa-money-tracker-budget-v1";

export const useBudget = () => {
    const [budget, setBudget] = useState(() => {
        try {
            return Number(localStorage.getItem(BUDGET_STORAGE_KEY)) || 0;
        } catch {
            return 0;
        }
    });

    const [budgetInput, setBudgetInput] = useState("");

    useEffect(() => {
        localStorage.setItem(BUDGET_STORAGE_KEY, String(budget));
    }, [budget]);

    const saveBudget = (event) => {
        event.preventDefault();

        const newBudget = parseAmountInput(budgetInput);
        if (!newBudget) return;

        setBudget(newBudget);
        setBudgetInput("");
    };

    return {
        budget,
        budgetInput,
        setBudgetInput,
        saveBudget,
    };
};