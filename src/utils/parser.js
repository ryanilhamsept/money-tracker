export const parseAmountInput = (value) => {
    const cleaned = String(value || "").replace(/[^0-9]/g, "");
    return Number(cleaned) || 0;
};