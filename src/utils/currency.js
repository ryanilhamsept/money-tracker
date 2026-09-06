export const formatCurrency = (amount) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(Number(amount) || 0);

export const formatThousands = (value, { allowNegative = false } = {}) => {
    const str = String(value || "");
    const isNegative = allowNegative && str.startsWith("-");
    const cleanNumber = str.replace(/[^\d]/g, "");

    if (cleanNumber === "") {
        return isNegative ? "-" : "";
    }

    const formatted = new Intl.NumberFormat("id-ID").format(Number(cleanNumber));
    return isNegative ? "-" + formatted : formatted;
};