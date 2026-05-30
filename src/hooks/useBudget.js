import { useEffect, useState } from "react";
import { parseAmountInput } from "../utils/parser";
import {
    getBudgetFromGoogleSheet,
    saveBudgetToGoogleSheet,
} from "../services/googleSheets";

export const useBudget = () => {
    const [budget, setBudget] = useState(0);
    const [leftBudget, setLeftBudget] = useState(0);
    const [budgetInput, setBudgetInput] = useState("");

    const loadBudget = async () => {
        try {
            const data = await getBudgetFromGoogleSheet();

            setBudget(Number(data.budget) || 0);
            setLeftBudget(Number(data.leftBudget) || 0);
        } catch {
            setBudget(0);
            setLeftBudget(0);
        }
    };

    useEffect(() => {
        loadBudget();
    }, []);

    const saveBudget = async (event) => {
        event.preventDefault();

        const newBudget = parseAmountInput(budgetInput);

        if (!newBudget) return;

        setBudget(newBudget);
        setBudgetInput("");

        try {
            await saveBudgetToGoogleSheet(newBudget);
            await loadBudget();
        } catch (err) {
            console.log(err);
        }
    };

    return {
        budget,
        leftBudget,
        budgetInput,
        setBudgetInput,
        saveBudget,
        reloadBudget: loadBudget,
    };
};