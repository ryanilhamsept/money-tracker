export const today = () => {
    const now = new Date();

    const jakartaDate = new Date(
        now.toLocaleString("en-US", {
            timeZone: "Asia/Jakarta",
        })
    );

    const year = jakartaDate.getFullYear();
    const month = String(jakartaDate.getMonth() + 1).padStart(2, "0");
    const date = String(jakartaDate.getDate()).padStart(2, "0");

    return `${year}-${month}-${date}`;
};

export const currentMonth = () => today().slice(0, 7);

export const normalizeDate = (value) => {
    const raw = String(value || "").trim();

    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw)) {
        return raw;
    }

    const monthMap = {
        januari: "01",
        january: "01",

        februari: "02",
        february: "02",

        maret: "03",
        march: "03",

        april: "04",

        mei: "05",
        may: "05",

        juni: "06",
        june: "06",

        juli: "07",
        july: "07",

        agustus: "08",
        august: "08",

        september: "09",

        oktober: "10",
        october: "10",

        november: "11",

        desember: "12",
        december: "12",
    };

    const parts = raw.toLowerCase().split(" ");

    if (parts.length === 3) {
        const day = parts[0].padStart(2, "0");
        const month = monthMap[parts[1]];
        const year = parts[2];

        if (day && month && year) {
            return `${year}-${month}-${day}`;
        }
    }

    return today();
};

export const getTransactionMonth = (date) => {
    return normalizeDate(date).slice(0, 7);
};

export const formatDisplayDate = (value) => {
    const [year, month, day] = normalizeDate(value).split("-");

    const months = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember",
    ];

    return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
};