// Mirror dari src/constants/version.js di app web -- penanda build supaya
// bisa dibedakan APK/halaman mana yang sedang jalan.
//
// Kenapa perlu: APK dipasang manual, dan web di-cache service worker. Dua-duanya
// bisa diam-diam menyajikan build lama tanpa tanda apa pun. Angka di bawah ini
// yang bikin kelihatan.
//
// WAJIB naik bareng "version" + android.versionCode di mobile/app.json tiap
// kali build APK. Kalau versionCode tidak naik, Android tidak menganggapnya
// update dan app lama tetap terpasang.

export const APP_VERSION = "1.1.0";
export const BUILD_DATE = "2026-11-08";
