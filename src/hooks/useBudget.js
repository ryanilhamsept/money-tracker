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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadBudget();
    }, []);

    const saveBudget = async (event) => {
        event.preventDefault();

        const newBudget = parseAmountInput(budgetInput);

        if (!newBudget) return;

        setBudget(newBudget);
        setBudgetInput("");

        saveBudgetToGoogleSheet(newBudget)
            .then(() => loadBudget())
            .catch((err) => console.error("SAVE BUDGET ERROR:", err));
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