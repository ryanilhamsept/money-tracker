// Cicilan disimpan sebagai baris transaksi terpisah per bulan (Chakolab ke 1,
// ke 2, ke 3, dst) supaya gampang dibedain di list. Tapi buat matching/grouping
// (nyari semua baris yang berasal dari pembelian cicilan yang sama), suffix
// " ke N" ini harus di-strip dulu biar "Chakolab ke 1" dan "Chakolab ke 2"
// ketauan satu grup.
export function getInstallmentBaseTitle(title) {
    return String(title || "").replace(/\s+ke\s+\d+\s*$/i, "").trim();
}

export function formatInstallmentTitle(baseTitle, index) {
    return `${String(baseTitle || "").trim()} ke ${index}`;
}
