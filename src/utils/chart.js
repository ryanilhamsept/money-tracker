// Geometri busur untuk donut chart. Dipakai bareng oleh Spending dan
// MonthlyReport supaya dua grafik yang menggambarkan hal sama tidak punya
// dua implementasi yang bisa menyimpang satu sama lain.

const polarToCartesian = (cx, cy, radius, angleInDegrees) => {
    const rad = ((angleInDegrees - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
};

// Busur bercincin (donut), bukan potongan pai: tebalnya ditentukan `inner`
// sehingga bagian tengahnya kosong tanpa perlu menimpanya dengan lingkaran
// berwarna latar -- cara lama itu pecah begitu latarnya bukan putih polos.
export const getDonutArcPath = (cx, cy, outer, inner, startAngle, endAngle) => {
    let sweep = endAngle - startAngle;
    if (sweep >= 360) sweep = 359.99;
    const end = startAngle + sweep;

    const oStart = polarToCartesian(cx, cy, outer, startAngle);
    const oEnd = polarToCartesian(cx, cy, outer, end);
    const iStart = polarToCartesian(cx, cy, inner, end);
    const iEnd = polarToCartesian(cx, cy, inner, startAngle);
    const large = sweep <= 180 ? "0" : "1";

    return [
        "M", oStart.x, oStart.y,
        "A", outer, outer, 0, large, 1, oEnd.x, oEnd.y,
        "L", iStart.x, iStart.y,
        "A", inner, inner, 0, large, 0, iEnd.x, iEnd.y,
        "Z",
    ].join(" ");
};

// Busur terbuka untuk pengukur setengah lingkaran (gauge "76% Spent").
export const getGaugeArc = (cx, cy, radius, fraction) => {
    const clamped = Math.max(0, Math.min(1, fraction));
    const start = polarToCartesian(cx, cy, radius, -90);
    const end = polarToCartesian(cx, cy, radius, -90 + clamped * 180);
    const large = clamped > 0.5 ? "1" : "0";
    return ["M", start.x, start.y, "A", radius, radius, 0, large, 1, end.x, end.y].join(" ");
};
