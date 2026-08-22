// Mirror dari src/utils/date.js di app web.
export const today = () => {
  const now = new Date();
  const jakartaDate = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
  const year = jakartaDate.getFullYear();
  const month = String(jakartaDate.getMonth() + 1).padStart(2, "0");
  const date = String(jakartaDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
};

export const currentMonth = () => today().slice(0, 7);

const MONTH_MAP = {
  januari: "01", january: "01",
  februari: "02", february: "02",
  maret: "03", march: "03",
  april: "04",
  mei: "05", may: "05",
  juni: "06", june: "06",
  juli: "07", july: "07",
  agustus: "08", august: "08",
  september: "09",
  oktober: "10", october: "10",
  november: "11",
  desember: "12", december: "12",
};

export const normalizeDate = (value) => {
  const raw = String(value || "").trim();
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw)) return raw;

  const parts = raw.toLowerCase().split(" ");
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const month = MONTH_MAP[parts[1]];
    const year = parts[2];
    if (day && month && year) return `${year}-${month}-${day}`;
  }
  return today();
};

export const getTransactionMonth = (date) => normalizeDate(date).slice(0, 7);

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export const formatDisplayDate = (value) => {
  const [year, month, day] = normalizeDate(value).split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
};

export const formatMonthLabel = (yyyyMm) => {
  const [year, month] = String(yyyyMm || "").split("-");
  if (!year || !month) return yyyyMm;
  return `${MONTHS[Number(month) - 1]} ${year}`;
};

export const shiftMonth = (yyyyMm, delta) => {
  const [yearStr, monthStr] = String(yyyyMm).split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};
