import { useEffect, useState } from "react";
import { parseAmountInput } from "../utils/parser";
import {
    getBudgetFromGoogleSheet,
    saveBudgetToGoogleSheet,
} from "../services/googleSheets";

export const useBudget = () => {
    const [budget, setBudget] = useState(0);
    const [budgetInput, setBudgetInput] = useState("");

    const loadBudget = async () => {
        try {
            const data = await getBudgetFromGoogleSheet();

            setBudget(Number(data.budget) || 0);
        } catch {
            setBudget(0);
        }
    };

    useEffect(() => {
        loadBudget();
    }, []);

    const saveBudget = async (event) => {
        event.preventDefault();

        const newBudget = parseAmountInput(budgetInput);

        if (!newBudget) return;

        // langsung update UI
        setBudget(newBudget);

        setBudgetInput("");

        try {
            await saveBudgetToGoogleSheet(newBudget);
        } catch (err) {
            console.log(err);
        }
    };

    return {
        budget,
        budgetInput,
        setBudgetInput,
        saveBudget,
    };
};