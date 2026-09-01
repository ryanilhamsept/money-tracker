// ===== CONFIG =====
const SUPABASE_URL = 'https://jzwaajojwoqvrgzvyvyt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6d2Fham9qd29xdnJnenZ5dnl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMzU4MDgsImV4cCI6MjEwMDYxMTgwOH0.au6DtFhgjo1TBsGkJvBEqmwmnGvmWPVHxZLCFboTOUI';
const GMAIL_QUERY = 'label:transaction';
// Auto-imported transactions get attributed to this account (RLS now scopes
// data per-user; the anon key has no login session, so this must be explicit).
const IMPORT_USER_ID = 'd09a1edc-3042-4e9f-886d-d5136ff379cc';

// Nama pemilik akun -- dipakai buat skip transfer ke rekening/dompet sendiri
// (kalau nama penerima yang ke-extract cocok sama ini, berarti transfer ke diri
// sendiri, bukan pengeluaran).
const OWNER_NAME = /ryan\s*ilham(?:\s*septiyanto)?/i;

// Satu-satunya bagian yang "hardcode per pengirim" -- info sumber dana/akun
// emang cuma bisa didapat dari alamat pengirim, bukan dari isi email. Selain
// ini, SEMUA email diparse pakai satu logic generic yang sama (parseTransactionEmail),
// bukan parser custom per bank -- biar nggak gampang patah tiap kali salah satu
// bank ubah sedikit template emailnya.
const BANK_CONFIG = [
  { match: 'kartukreditbca@klikbca.com', source: 'Credit Card - BCA', dana: 'Spend CC' },
  { match: 'noreply.livin@bankmandiri.co.id', source: 'Mandiri', dana: 'Spend Bulanan' },
  { match: 'superbank.id', source: 'Superbank', dana: 'Spend Bulanan' },
  { match: 'wondr@bni.co.id', source: 'BNI', dana: 'Spend Bulanan' },
  { match: 'receipts@blubybcadigital.id', source: 'Blu', dana: 'Spend Bulanan' },
  { match: 'bca@bca.co.id', source: 'BCA', dana: 'Spend Bulanan' },
  { match: 'no-reply@grab.com', source: 'Superbank', dana: 'Spend Bulanan', defaultTitle: 'Grab', isGrab: true },
];

// Grab bisa dibayar dari beberapa sumber berbeda -- ini satu-satunya bagian
// selain BANK_CONFIG yang "spesifik", karena kalau di-generalisir jadi satu
// source tetap, saldo akun yang salah bakal jadi keliru tiap kali bayar Grab
// pake kartu/rekening yang berbeda.
const GRAB_PAYMENT_SOURCES = {
  '9628': { source: 'Superbank', dana: 'Spend Bulanan' },
  '4904': { source: 'Credit Card - BCA', dana: 'Spend CC' },
};

// ===== DEDUP =====
function isProcessed(messageId) {
  return PropertiesService.getScriptProperties().getProperty('msg_' + messageId) !== null;
}

// Email yang GAGAL di-parse sengaja nggak di-markProcessed supaya bisa
// di-retry setelah parser diperbaiki. Tapi kalau formatnya emang nggak pernah
// bisa ke-parse, dia bakal di-fetch ulang TIAP KALI trigger jalan -- selamanya
// -- dan itu yang bikin kuota Gmail harian jebol. MAX_PARSE_RETRIES batasin
// percobaan itu; setelah gagal berkali-kali, email di-skip permanen (dikasih
// label 'needs-review' biar bisa dicek manual) daripada terus nyedot kuota.
const MAX_PARSE_RETRIES = 5;

function getFailCount(messageId) {
  return Number(PropertiesService.getScriptProperties().getProperty('fail_' + messageId)) || 0;
}

function incrementFailCount(messageId) {
  const count = getFailCount(messageId) + 1;
  PropertiesService.getScriptProperties().setProperty('fail_' + messageId, String(count));
  return count;
}

function clearFailCount(messageId) {
  PropertiesService.getScriptProperties().deleteProperty('fail_' + messageId);
}

function markProcessed(messageId) {
  PropertiesService.getScriptProperties().setProperty('msg_' + messageId, '1');
}

// ===== UTILS (jalankan manual sekali kalau perlu) =====

/**
 * Reset status processed/fail-count SEMUA email yang match GMAIL_QUERY (bukan
 * cuma yang udah kena label needs-review). Jalankan ini SEKALI abis ganti
 * parser, biar email yang ke-skip diem-diem gara-gara nyangkut status lama
 * ke-proses ulang. Abis ini jalankan processTransactionEmails.
 */
function resetAllTransactionMessages() {
  const list = Gmail.Users.Messages.list('me', { q: GMAIL_QUERY, maxResults: 100 });
  const messages = list.messages || [];
  const labels = Gmail.Users.Labels.list('me').labels || [];
  const needsReviewLabel = labels.find(function (l) { return l.name === 'needs-review'; });

  let count = 0;
  messages.forEach(function (m) {
    PropertiesService.getScriptProperties().deleteProperty('msg_' + m.id);
    PropertiesService.getScriptProperties().deleteProperty('fail_' + m.id);
    if (needsReviewLabel) {
      try {
        Gmail.Users.Messages.modify({ removeLabelIds: [needsReviewLabel.id] }, 'me', m.id);
      } catch (e) {
        // pesan mungkin nggak punya label ini, aman diabaikan
      }
    }
    count++;
  });
  Logger.log('Reset ' + count + ' pesan (processed + fail count + label needs-review dicopot).');
}

/**
 * Debug: cek status dedup (processed/fail count) dari 10 email transaksi
 * terbaru, tanpa mroses apa-apa.
 */
function debugCheckStatus() {
  const list = Gmail.Users.Messages.list('me', { q: GMAIL_QUERY, maxResults: 10 });
  const messages = list.messages || [];
  messages.forEach(function (m) {
    const full = Gmail.Users.Messages.get('me', m.id, { format: 'metadata', metadataHeaders: ['Subject', 'From'] });
    const subject = getHeader(full, 'Subject');
    const from = getHeader(full, 'From');
    Logger.log(subject + ' | ' + from + ' | processed=' + isProcessed(m.id) + ' | failCount=' + getFailCount(m.id));
  });
}

/**
 * Reset pesan yang udah "menyerah" (label needs-review) supaya di-retry lagi
 * oleh processTransactionEmails setelah parser diperbaiki.
 */
function resetNeedsReviewMessages() {
  const list = Gmail.Users.Messages.list('me', { q: 'label:needs-review', maxResults: 100 });
  const messages = list.messages || [];
  const labels = Gmail.Users.Labels.list('me').labels || [];
  const label = labels.find(function (l) { return l.name === 'needs-review'; });

  let count = 0;
  messages.forEach(function (m) {
    PropertiesService.getScriptProperties().deleteProperty('msg_' + m.id);
    PropertiesService.getScriptProperties().deleteProperty('fail_' + m.id);
    if (label) {
      Gmail.Users.Messages.modify({ removeLabelIds: [label.id] }, 'me', m.id);
    }
    count++;
  });
  Logger.log('Reset ' + count + ' pesan needs-review, label dicopot.');
}

/**
 * Debug: log isi teks (getEmailBody) + hasil parse dari 5 email transaksi
 * terbaru, tanpa peduli status processed/read.
 */
function debugDumpBodies() {
  const list = Gmail.Users.Messages.list('me', { q: GMAIL_QUERY, maxResults: 5 });
  const messages = list.messages || [];
  messages.forEach(function (m) {
    const full = Gmail.Users.Messages.get('me', m.id, { format: 'full' });
    const from = getHeader(full, 'From').toLowerCase();
    const subject = getHeader(full, 'Subject');
    const body = getEmailBody(full);
    const bank = BANK_CONFIG.find(function (b) { return from.indexOf(b.match) !== -1; });

    Logger.log('=== ' + subject + ' | ' + from + ' ===');
    Logger.log(body.substring(0, 1500));
    if (bank) {
      Logger.log('Parse result: ' + JSON.stringify(parseTransactionEmail(body, subject, bank)));
    } else {
      Logger.log('(bank tidak dikenali dari alamat pengirim)');
    }
    Logger.log('--- END ---');
  });
}

// ===== MAIN ENTRY POINT =====
// Pakai Advanced Gmail Service (Gmail.Users.*) alih-alih GmailApp bawaan.
// GmailApp punya kuota harian sendiri yang ketat buat akun consumer ("Service
// invoked too many times for one day: gmail"); Advanced Gmail Service manggil
// Gmail API asli yang kuotanya jauh lebih besar. Ini butuh Gmail API
// diaktifkan sekali lewat Apps Script editor: Services (ikon +) → Gmail API → Add.
function processTransactionEmails() {
  const list = Gmail.Users.Messages.list('me', { q: GMAIL_QUERY, maxResults: 50 });
  const messages = list.messages || [];
  messages.forEach(function (m) {
    if (isProcessed(m.id)) return;
    try {
      const full = Gmail.Users.Messages.get('me', m.id, { format: 'full' });
      handleMessage(full);
    } catch (e) {
      Logger.log('Error processing message ' + m.id + ': ' + e);
    }
  });
}

function getHeader(message, name) {
  const headers = (message.payload && message.payload.headers) || [];
  const found = headers.find(function (h) { return h.name.toLowerCase() === name.toLowerCase(); });
  return found ? found.value : '';
}

function markReadAPI(messageId) {
  Gmail.Users.Messages.modify({ removeLabelIds: ['UNREAD'] }, 'me', messageId);
}

function getOrCreateLabelId(name) {
  const labels = (Gmail.Users.Labels.list('me').labels) || [];
  const existing = labels.find(function (l) { return l.name === name; });
  if (existing) return existing.id;
  const created = Gmail.Users.Labels.create(
    { name: name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
    'me'
  );
  return created.id;
}

function handleParseFailure(message, subject, from) {
  const failCount = incrementFailCount(message.id);
  Logger.log('Gagal parse (percobaan ' + failCount + '/' + MAX_PARSE_RETRIES + ') for: ' + subject + ' | from: ' + from);
  if (failCount >= MAX_PARSE_RETRIES) {
    Logger.log('Menyerah setelah ' + failCount + 'x gagal, di-skip permanen: ' + subject);
    markReadAPI(message.id);
    markProcessed(message.id);
    try {
      const labelId = getOrCreateLabelId('needs-review');
      Gmail.Users.Messages.modify({ addLabelIds: [labelId] }, 'me', message.id);
    } catch (e) {
      Logger.log('Gagal nempelin label needs-review: ' + e);
    }
  }
}

function handleMessage(message) {
  const from = getHeader(message, 'From').toLowerCase();
  const subject = getHeader(message, 'Subject');
  const bank = BANK_CONFIG.find(function (b) { return from.indexOf(b.match) !== -1; });
  if (!bank) return;

  const body = getEmailBody(message);
  const tx = parseTransactionEmail(body, subject, bank);

  if (tx === 'SKIP_MARK_READ') {
    markReadAPI(message.id);
    markProcessed(message.id);
    return;
  }
  if (!tx) {
    handleParseFailure(message, subject, from);
    return;
  }

  const success = insertTransaction(tx);
  if (success) {
    markReadAPI(message.id);
    markProcessed(message.id);
    clearFailCount(message.id);
  }
}

// ===== EMAIL BODY HELPER =====
// Beberapa bank kirim email HTML-only, jadi selalu coba text/plain dulu lalu
// fallback ke text/html yang di-strip jadi teks biasa. Body Gmail API
// dikirim base64url-encoded dan bisa nested di beberapa parts (multipart/alternative,
// multipart/mixed, dst) makanya perlu collectParts.
function collectParts(payload) {
  if (!payload) return [];
  var result = [];
  if (payload.body && payload.body.data && payload.mimeType) {
    result.push({ mimeType: payload.mimeType, data: payload.body.data });
  }
  if (payload.parts) {
    payload.parts.forEach(function (p) {
      result = result.concat(collectParts(p));
    });
  }
  return result;
}

function decodeBase64Url(data) {
  if (!data) return '';
  // Advanced Gmail Service quirk: "bytes"-typed fields like body.data are
  // sometimes handed back already decoded into a raw byte array instead of
  // the base64url string the REST API docs describe -- so only base64-decode
  // when we actually got a string.
  if (typeof data !== 'string') {
    return Utilities.newBlob(data).getDataAsString();
  }
  // Gmail API base64url data comes without "=" padding, which
  // base64DecodeWebSafe() sometimes chokes on ("Could not decode string").
  // Convert to standard base64 + pad, then use the regular decoder.
  var normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return Utilities.newBlob(Utilities.base64Decode(normalized)).getDataAsString();
}

// Sengaja dibikin simpel (strip tag + rapiin baris baru) tanpa akal-akalan
// nyisipin colon dsb di antara sel tabel -- parser generic di bawah udah
// toleran ke jarak/baris-kosong sembarang, jadi nggak perlu presisi.
function getEmailBody(message) {
  var parts = collectParts(message.payload);
  var plainPart = parts.find(function (p) { return p.mimeType === 'text/plain'; });
  var htmlPart = parts.find(function (p) { return p.mimeType === 'text/html'; });

  var plain = plainPart ? decodeBase64Url(plainPart.data) : '';
  if (plain && plain.replace(/[-\s]/g, '').length > 30) return plain;

  var html = htmlPart ? decodeBase64Url(htmlPart.data) : '';
  if (!html) return plain || '';

  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  html = html.replace(/<\/(td|tr|p|div|li)>/gi, '\n');
  html = html.replace(/<br\s*\/?>/gi, '\n');
  html = html.replace(/<[^>]+>/g, ' ');
  html = html.replace(/&nbsp;/g, ' ');
  html = html.replace(/&amp;/g, '&');
  html = html.replace(/&lt;/g, '<');
  html = html.replace(/&gt;/g, '>');
  html = html.replace(/&#39;/g, "'");
  html = html.replace(/&quot;/g, '"');
  html = html.replace(/[ \t]{2,}/g, ' ');
  html = html.replace(/\n{3,}/g, '\n\n');
  return html.trim();
}

// ===== GENERIC PARSER =====
// Satu fungsi buat SEMUA bank -- gantiin 7 parser custom (KartuKreditBCA,
// Livin, Superbank, wondr, blu, BCA, Grab) yang isinya puluhan regex spesifik
// per format email. Alih-alih cocokin struktur label persis, ini cuma nyari
// pola generic yang ada di hampir semua notifikasi transaksi: nominal (Rp/IDR),
// tanggal, dan nama merchant/penerima dari label yang umum dipakai. Lebih
// nggak presisi dibanding parser lama, tapi jauh lebih tahan banting kalau
// bank ubah sedikit tata letak emailnya.
function parseTransactionEmail(body, subject, bank) {
  // Skip: dana MASUK (refund/transfer masuk) -- bukan pengeluaran.
  if (/pengembalian dana|refund|dana masuk|transaksi masuk|transfer masuk/i.test(body)) {
    return 'SKIP_MARK_READ';
  }
  // Skip: pembayaran tagihan kartu kredit dari rekening biasa -- transaksinya
  // sendiri udah tercatat lewat email kartu kredit yang terpisah, jadi kalau
  // dicatat lagi di sini bakal double-count.
  if (bank.dana !== 'Spend CC' && /kartu kredit/i.test(body) && /tagihan/i.test(body) && /(?:bayar|pembayaran)/i.test(body)) {
    return 'SKIP_MARK_READ';
  }

  const amount = extractAmount(body);
  const dateTime = extractDateTime(body);
  if (!amount || !dateTime.date) return null;

  const title = extractTitle(body, subject, bank);
  if (OWNER_NAME.test(title)) return 'SKIP_MARK_READ'; // transfer ke diri sendiri

  let source = bank.source;
  let dana = bank.dana;
  if (bank.isGrab) {
    const payment = extractGrabPaymentSource(body);
    if (payment) {
      source = payment.source;
      dana = payment.dana;
    }
  }

  return {
    title: title,
    date: dateTime.date,
    time: dateTime.time,
    amount: amount,
    category: guessCategory(title),
    source: source,
    dana_dipakai: dana,
  };
}

// Ambil semua kemunculan "Rp ..."/"IDR ..." di body, lalu pilih yang paling
// deket sama kata kunci total-ish (total/nominal/jumlah/sejumlah) -- itu
// biasanya nominal transaksi utama, bukan breakdown/komponen lain (VAT,
// promo, dst). Kalau nggak ada kata kunci sama sekali, pakai angka pertama.
function extractAmount(body) {
  const candidates = [];
  const re = /Rp\.?\s?([\d.,]{3,})|IDR\s?([\d,]+\.\d{2})/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const val = m[1] ? parseRupiah(m[1]) : parseIDR(m[2]);
    if (val > 0) candidates.push({ val: val, index: m.index });
  }
  if (!candidates.length) return null;

  const totalIdx = body.search(/total|nominal|jumlah|sejumlah|amount paid|grand total/i);
  if (totalIdx !== -1) {
    const near = candidates
      .filter(function (c) { return c.index >= totalIdx && c.index - totalIdx < 200; })
      .sort(function (a, b) { return a.index - b.index; })[0];
    if (near) return near.val;
  }
  return candidates[0].val;
}

// Tanggal transaksi hampir selalu format "DD Bulan YYYY" (Indo atau Inggris),
// jadi cukup ambil kemunculan pertama pola itu di body -- biasanya muncul
// duluan di bagian atas email sebelum breakdown/rincian lain.
function extractDateTime(body) {
  const dm = body.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/);
  if (!dm) return { date: null, time: '' };
  const date = parseIndoDate(dm[0]);
  if (!date) return { date: null, time: '' };
  const after = body.slice(dm.index, dm.index + 60);
  const tm = after.match(/(\d{1,2}):(\d{2})/);
  const time = tm ? String(tm[1]).padStart(2, '0') + ':' + tm[2] : '';
  return { date: date, time: time };
}

// Nama merchant/penerima biasanya ada di baris/sel abis salah satu label
// umum ini. Kalau nggak ketemu, pakai default per-bank (mis. "Grab" buat
// notifikasi ride-hailing yang emang nggak punya field nama merchant), atau
// terakhir fallback ke subject email.
function extractTitle(body, subject, bank) {
  const labelRe = /(?:Merchant|Pembayaran Ke|Kepada|Penerima|Nama Penerima|Nama Tujuan|Tujuan Pembayaran|Recipient|Order from|Pesanan dari|Nama Produk|bluAccount)\s*:?\s*\n?\s*([^\n]{2,60})/i;
  const m = body.match(labelRe);
  if (m) return remapKnownMerchant(m[1].trim());
  if (bank.defaultTitle) return bank.defaultTitle;
  return subject.trim();
}

function remapKnownMerchant(name) {
  if (/yatim.*dhuafa/i.test(name)) return 'Parkir';
  return name;
}

// Grab bisa dibayar dari beberapa sumber -- cari 4 digit terakhir kartu/rekening
// di deket label "Paid by"/"Dibayar dengan", atau deteksi cash.
function extractGrabPaymentSource(body) {
  if (/(?:paid by|dibayar dengan)\s*:?\s*\n?\s*cash/i.test(body)) {
    return { source: 'Cash', dana: 'Spend Bulanan' };
  }
  const m = body.match(/(?:paid by|dibayar dengan)[\s\S]{0,80}?(\d{4})\b/i);
  if (m && GRAB_PAYMENT_SOURCES[m[1]]) return GRAB_PAYMENT_SOURCES[m[1]];
  return null;
}

function parseRupiah(str) {
  const cleaned = str.replace(/\./g, '').replace(/,/g, '.');
  return Math.round(parseFloat(cleaned));
}

function parseIDR(str) {
  return Math.round(parseFloat(str.replace(/,/g, '')));
}

const INDO_MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', may: '05', jun: '06',
  jul: '07', agu: '08', agt: '08', aug: '08', sep: '09',
  okt: '10', oct: '10', nov: '11', des: '12', dec: '12',
};

function parseIndoDate(str) {
  const m = str.match(/(\d{1,2})\s+(\w+)\s+(\d{2,4})/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const monthKey = m[2].toLowerCase().substring(0, 3);
  const month = INDO_MONTHS[monthKey];
  if (!month) return null;
  let year = m[3];
  if (year.length === 2) year = '20' + year;
  return year + '-' + month + '-' + day;
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/\b(amal|donasi|masjid|panti|baznas|zakat|infaq|amil|baitul\s*mal)\b/.test(n)) return 'Miscellaneous';
  if (/\b(pln|listrik|pdam|token|pulsa|indihome|wifi|bpjs)\b/.test(n)) return 'Utilities';
  if (/\b(bubur|ayam|kopi|coffee|makan|resto|warung|takoyaki|food|cafe|bakery|nasi|bowl|chicken|donuts|pizza)\b/.test(n)) return 'Food';
  if (/\b(lrt|mrt|krl|trans|grab|gojek|parkir|toll|tol)\b/.test(n)) return 'Transportation';
  if (/\b(mart|indomaret|alfamart|superindo|supermarket)\b/.test(n)) return 'Groceries';
  if (/\b(tiket|ticket|konser|concert|event|nonton|bioskop)\b/.test(n)) return 'Entertainment';
  return 'Shopping';
}

// ===== SUPABASE =====
function supabaseRequest(path, method, payload) {
  const options = {
    method: method,
    contentType: 'application/json',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      Prefer: 'return=minimal',
    },
    muteHttpExceptions: true,
  };
  if (payload !== undefined) options.payload = JSON.stringify(payload);
  return UrlFetchApp.fetch(SUPABASE_URL + path, options);
}

function insertTransaction(tx) {
  const payload = {
    id: Utilities.getUuid(),
    date: tx.date,
    time: tx.time || null,
    title: tx.title,
    category: tx.category,
    amount: tx.amount,
    source: tx.source,
    dana_dipakai: tx.dana_dipakai,
    user_id: IMPORT_USER_ID,
  };

  const response = supabaseRequest('/rest/v1/transactions', 'post', [payload]);

  const code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    Logger.log('Inserted: ' + tx.title + ' Rp' + tx.amount);
    const delta = tx.dana_dipakai === 'Spend CC' ? tx.amount : -tx.amount;
    applyAccountBalanceDelta(tx.source, delta);
    return true;
  }
  Logger.log('Insert failed (' + code + '): ' + response.getContentText());
  return false;
}

function applyAccountBalanceDelta(source, delta) {
  const listResp = supabaseRequest('/rest/v1/accounts?select=id,name', 'get');
  if (listResp.getResponseCode() < 200 || listResp.getResponseCode() >= 300) {
    Logger.log('Failed to fetch accounts: ' + listResp.getContentText());
    return;
  }
  const accounts = JSON.parse(listResp.getContentText());
  const normSource = String(source || '').trim().toLowerCase();

  let account = accounts.find(function (a) {
    return String(a.name || '').trim().toLowerCase() === normSource;
  });
  if (!account && normSource === 'blu') {
    account = accounts.find(function (a) {
      return String(a.name || '').trim().toLowerCase().indexOf('blu') !== -1;
    });
  }
  if (!account) {
    Logger.log('No matching account for source="' + source + '", balance not adjusted');
    return;
  }

  // Atomic increment via a Postgres RPC (increment_account_balance) instead of
  // read-then-write -- the old GET-then-PATCH here raced with the web/mobile
  // app's own read-then-write and could clobber each other's updates, which is
  // how CC balances used to drift (even go negative) over time.
  const updateResp = supabaseRequest('/rest/v1/rpc/increment_account_balance', 'post', {
    p_account_id: account.id,
    p_delta: delta,
  });
  if (updateResp.getResponseCode() >= 200 && updateResp.getResponseCode() < 300) {
    Logger.log('Balance updated (atomic): ' + account.name + ' delta=' + delta);
  } else {
    Logger.log('Balance update failed: ' + updateResp.getContentText());
  }
}
