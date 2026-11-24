const SUPABASE_URL = 'https://jzwaajojwoqvrgzvyvyt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6d2Fham9qd29xdnJnenZ5dnl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMzU4MDgsImV4cCI6MjEwMDYxMTgwOH0.au6DtFhgjo1TBsGkJvBEqmwmnGvmWPVHxZLCFboTOUI';
const GMAIL_QUERY = 'label:transaction';

const IMPORT_USER_ID = 'd09a1edc-3042-4e9f-886d-d5136ff379cc';

const ADMIN_EMAIL = 'ryanilhamsept@gmail.com';

const OWNER_NAME = /ryan\s*ilham(?:\s*septiyanto)?/i;

const RECIPIENT_LABELS =
  'Beneficiary Name|Nama Penerima|Penerima|Nama Tujuan|Tujuan Pembayaran|' +
  'Pembayaran Ke|Kepada|Recipient|bluAccount';

function isTransferToSelf(body) {
  const re = new RegExp('(?:' + RECIPIENT_LABELS + ')\\s*:?\\s*\\n?\\s*([^\\n]{2,80})', 'gi');
  let m;
  while ((m = re.exec(body)) !== null) {
    if (OWNER_NAME.test(m[1])) return true;
  }
  return false;
}

const BANK_CONFIG = [

  { match: 'kartukreditbca@', source: 'Credit Card - BCA', dana: 'Spend CC' },
  { match: 'noreply.livin@bankmandiri.co.id', source: 'Mandiri', dana: 'Spend Bulanan' },
  { match: 'superbank.id', source: 'Superbank', dana: 'Spend Bulanan' },
  { match: 'wondr@bni.co.id', source: 'BNI', dana: 'Spend Bulanan', card: 'Credit Card - BNI' },

  { match: 'bnicreditcard@bni.co.id', source: 'Credit Card - BNI', dana: 'Spend CC' },
  { match: 'receipts@blubybcadigital.id', source: 'Blu', dana: 'Spend Bulanan' },
  { match: 'bca@bca.co.id', source: 'BCA', dana: 'Spend Bulanan', card: 'Credit Card - BCA' },
  { match: 'no-reply@grab.com', source: 'Superbank', dana: 'Spend Bulanan', defaultTitle: 'Grab', isGrab: true },
];

const GRAB_PAYMENT_SOURCES = {
  '9628': { source: 'Superbank', dana: 'Spend Bulanan' },
  '8818': { source: 'Blu', dana: 'Spend Bulanan', ownEmail: true },
  '4904': { source: 'Credit Card - BCA', dana: 'Spend CC', ownEmail: true },
  '7095': { source: 'BCA', dana: 'Spend Bulanan' },
};

const UNKNOWN_BANK = { source: 'Perlu Dicek', dana: 'Spend Bulanan' };

function setupAutoTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processTransactionEmails') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('processTransactionEmails')
    .timeBased()
    .everyMinutes(15)
    .create();
  Logger.log('Trigger terpasang: processTransactionEmails jalan otomatis tiap 15 menit.');
}

function removeAutoTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processTransactionEmails') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log('Trigger dicopot: ' + removed);
}

function isProcessed(messageId) {
  return PropertiesService.getScriptProperties().getProperty('msg_' + messageId) !== null;
}

function markProcessed(messageId) {
  PropertiesService.getScriptProperties().setProperty('msg_' + messageId, '1');
}

function resetAllTransactionMessages() {
  const list = Gmail.Users.Messages.list('me', { q: GMAIL_QUERY, maxResults: 100 });
  const messages = list.messages || [];

  let count = 0;
  messages.forEach(function (m) {
    PropertiesService.getScriptProperties().deleteProperty('msg_' + m.id);
    count++;
  });
  Logger.log('Reset ' + count + ' pesan (status processed dicopot).');
}

function debugCheckStatus() {
  const list = Gmail.Users.Messages.list('me', { q: GMAIL_QUERY, maxResults: 10 });
  const messages = list.messages || [];
  messages.forEach(function (m) {
    const full = Gmail.Users.Messages.get('me', m.id, { format: 'metadata', metadataHeaders: ['Subject', 'From'] });
    const subject = getHeader(full, 'Subject');
    const from = getHeader(full, 'From');
    Logger.log(subject + ' | ' + from + ' | processed=' + isProcessed(m.id));
  });
}

function debugDumpBodies() {
  const list = Gmail.Users.Messages.list('me', { q: GMAIL_QUERY, maxResults: 5 });
  const messages = list.messages || [];
  messages.forEach(function (m) {
    const full = Gmail.Users.Messages.get('me', m.id, { format: 'full' });
    const from = getHeader(full, 'From').toLowerCase();
    const subject = getHeader(full, 'Subject');
    const body = getEmailBody(full);
    const dateHeader = getHeader(full, 'Date');
    const bank = BANK_CONFIG.find(function (b) { return from.indexOf(b.match) !== -1; }) || UNKNOWN_BANK;

    Logger.log('=== ' + subject + ' | ' + from + ' ===');
    Logger.log(body.substring(0, 1500));
    Logger.log('Parse result: ' + JSON.stringify(parseTransactionEmail(body, subject, bank, dateHeader)));
    Logger.log('--- END ---');
  });
}

function processTransactionEmails() {
  const list = Gmail.Users.Messages.list('me', { q: GMAIL_QUERY, maxResults: 50 });
  const messages = list.messages || [];

  const fetched = [];
  messages.forEach(function (m) {
    if (isProcessed(m.id)) return;
    try {
      fetched.push(Gmail.Users.Messages.get('me', m.id, { format: 'full' }));
    } catch (e) {
      Logger.log('Error fetching message ' + m.id + ': ' + e);
    }
  });

  fetched.sort(function (a, b) {
    return Number(a.internalDate || 0) - Number(b.internalDate || 0);
  });

  fetched.forEach(function (full) {
    try {
      handleMessage(full);
    } catch (e) {
      Logger.log('Error processing message ' + full.id + ': ' + e);
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

function notifyAdminOfReviewNeeded(subject, from, reason) {
  if (!ADMIN_EMAIL) return;
  try {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: '[Money Tracker] Email transaksi perlu dicek: ' + subject,
      body:
        'Ada email transaksi yang ' + reason + ', jadi di-insert sebagai "Perlu Dicek" apa adanya.\n\n' +
        'Subject: ' + subject + '\n' +
        'From: ' + from + '\n\n' +
        'Kemungkinan perlu update BANK_CONFIG atau parser di gmail-import.gs.',
    });
  } catch (e) {
    Logger.log('Gagal kirim notifikasi admin: ' + e);
  }
}

function handleMessage(message) {
  const from = getHeader(message, 'From').toLowerCase();
  const subject = getHeader(message, 'Subject');
  const bank = BANK_CONFIG.find(function (b) { return from.indexOf(b.match) !== -1; }) || UNKNOWN_BANK;
  const isUnknownSender = bank === UNKNOWN_BANK;

  const body = getEmailBody(message);
  const dateHeader = getHeader(message, 'Date');
  const tx = parseTransactionEmail(body, subject, bank, dateHeader);

  if (tx === 'SKIP_MARK_READ') {
    markReadAPI(message.id);
    markProcessed(message.id);
    return;
  }

  const success = insertTransaction(tx);
  if (success) {
    markReadAPI(message.id);
    markProcessed(message.id);

    if (isUnknownSender) {
      notifyAdminOfReviewNeeded(subject, from, 'pengirimnya belum dikenal (belum ada di BANK_CONFIG)');
    } else if (tx.category === 'Perlu Dicek') {
      notifyAdminOfReviewNeeded(subject, from, 'gagal diekstrak lengkap (nominal/tanggal nggak ketemu)');
    }
  }
}

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

  if (typeof data !== 'string') {
    return Utilities.newBlob(data).getDataAsString();
  }

  var normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return Utilities.newBlob(Utilities.base64Decode(normalized)).getDataAsString();
}

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

function parseTransactionEmail(body, subject, bank, dateHeader) {

  if (/pengembalian dana|refund/i.test(body)) {
    return 'SKIP_MARK_READ';
  }

  const incoming = body.match(
    /(?:Dana Masuk dari|Transfer Masuk dari|Transaksi Masuk dari)\s*:?\s*\n?\s*([^\n|]{2,60})/i
  );
  if (incoming) {
    const senderName = incoming[1].trim();
    if (OWNER_NAME.test(senderName)) return 'SKIP_MARK_READ';

    const amount = extractAmount(body);
    const dateTime = extractDateTime(body, dateHeader);
    const needsReview = !amount || !dateTime.date;

    return {
      title: senderName,
      date: dateTime.date || headerDateFallback(dateHeader),
      time: dateTime.time,
      amount: amount || 0,
      category: needsReview ? 'Perlu Dicek' : 'Transfer Masuk',
      source: bank.source,
      dana_dipakai: '',
      type: 'income',
    };
  }

  if (/dana masuk|transaksi masuk|transfer masuk/i.test(body)) {
    return 'SKIP_MARK_READ';
  }

  if (/Status\s*\|?\s*:?\s*\|?\s*Gagal\b/i.test(body)) {
    return 'SKIP_MARK_READ';
  }

  if (isTransferToSelf(body)) return 'SKIP_MARK_READ';

  const ccBill = body.match(
    /Jenis Transaksi\s*\|?\s*:?\s*\|?\s*Kartu Kredit\s*&\s*Paylater\s*-\s*([A-Za-z]+)/i
  );
  if (ccBill) {
    const cardName = ccBill[1].toUpperCase();
    const paid = extractLabelledAmount(body, 'Total Bayar') || extractAmount(body);
    const when = extractDateTime(body, dateHeader);

    return {
      title: 'Bayar CC ' + cardName,
      date: when.date || headerDateFallback(dateHeader),
      time: when.time,
      amount: paid || 0,
      category: paid ? 'Account Transfer' : 'Perlu Dicek',
      source: bank.source,
      dana_dipakai: 'Gajian',
    };
  }

  if (bank.dana !== 'Spend CC' && /kartu kredit/i.test(body) && /tagihan/i.test(body) && /(?:bayar|pembayaran)/i.test(body)) {
    return 'SKIP_MARK_READ';
  }

  if (/Jenis Transaksi\s*\|?\s*:?\s*\|?\s*Transaksi Poket/i.test(body) ||
      /Status\s*\|?\s*:?\s*\|?\s*[^\n|]*Poket[^\n|]*Berhasil/i.test(body)) {
    return 'SKIP_MARK_READ';
  }

  const amount = extractAmount(body);
  const dateTime = extractDateTime(body, dateHeader);

  const title = extractTitle(body, subject, bank);
  if (OWNER_NAME.test(title)) return 'SKIP_MARK_READ';

  let source = bank.source;
  let dana = bank.dana;
  if (bank.card && paidByCreditCard(body)) {
    source = bank.card;
    dana = 'Spend CC';
  }

  if (/Pemegang\s+Kartu\s+Kredit\s+BCA|menggunakan\s+Kartu\s+Kredit\s+BCA/i.test(body)) {
    source = 'Credit Card - BCA';
    dana = 'Spend CC';
  }
  let grabSourceUnknown = false;
  if (bank.isGrab) {
    const payment = extractGrabPaymentSource(body);
    if (payment) {

      if (payment.ownEmail) return 'SKIP_MARK_READ';

      source = payment.source;
      dana = payment.dana;
    } else {

      source = UNKNOWN_BANK.source;
      dana = UNKNOWN_BANK.dana;
      grabSourceUnknown = true;
    }
  }

  const needsReview = !amount || !dateTime.date || grabSourceUnknown;

  return {
    title: title,
    date: dateTime.date || headerDateFallback(dateHeader),
    time: dateTime.time,
    amount: amount || 0,
    category: needsReview
      ? 'Perlu Dicek'
      : isAccountTransfer(body)
        ? 'Account Transfer'
        : guessCategory(title),
    source: source,
    dana_dipakai: dana,
  };
}

function headerDateFallback(dateHeader) {
  try {
    const d = dateHeader ? new Date(dateHeader) : new Date();
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd');
  } catch (e) {

  }
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
}

function extractLabelledAmount(body, label) {
  const re = new RegExp(
    label + '\\s*\\|?\\s*:?\\s*\\|?\\s*(?:IDR|Rp\\.?)\\s*([\\d.,]+)',
    'i'
  );
  const m = body.match(re);
  if (!m) return null;
  const raw = m[1];

  return /\.\d{2}$/.test(raw) ? parseIDR(raw) : parseRupiah(raw);
}

function extractAmount(body) {

  const trip = body.match(/Biaya\s+Perjalanan[\s\S]{0,40}?Rp\.?\s?([\d.,]{3,})/i);
  if (trip) {
    const tripVal = parseRupiah(trip[1]);
    if (tripVal > 0) return tripVal;
  }

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

function extractDateTime(body, dateHeader) {
  const dateRe = /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/g;
  let dm;
  let date = null;
  let matchIndex = -1;
  while ((dm = dateRe.exec(body)) !== null) {
    const parsed = parseIndoDate(dm[0]);
    if (parsed) {
      date = parsed;
      matchIndex = dm.index;
      break;
    }
  }

  if (!date) {
    const numDm = body.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (numDm) {
      date = numDm[3] + '-' + numDm[2].padStart(2, '0') + '-' + numDm[1].padStart(2, '0');
      matchIndex = numDm.index;
    }
  }

  if (!date) return { date: null, time: '' };

  const after = body.slice(matchIndex, matchIndex + 60);
  const tm = after.match(/(\d{1,2}):(\d{2})/);
  let time = tm ? String(tm[1]).padStart(2, '0') + ':' + tm[2] : '';

  if (!time && dateHeader) {
    try {
      const received = new Date(dateHeader);
      if (!isNaN(received.getTime())) {
        time = Utilities.formatDate(received, 'Asia/Jakarta', 'HH:mm');
      }
    } catch (e) {

    }
  }

  return { date: date, time: time };
}

function extractTitle(body, subject, bank) {

  if (bank.isGrab) {
    const order = body.match(/(?:Pesanan ID|Order ID)\s*:?\s*\n?\s*([A-Z0-9-]{6,40})/i);
    if (order) return 'Grab* ' + order[1].trim();
  }

  const labelRe = new RegExp(
    '(?:Merchant\\s*\\/\\s*ATM|Merchant|Order from|Pesanan dari|Nama Produk|' +
      RECIPIENT_LABELS +
      ')\\s*:?\\s*\\n?\\s*([^\\n]{2,60})',
    'i'
  );
  const m = body.match(labelRe);
  if (m) return remapKnownMerchant(m[1].trim());
  if (bank.defaultTitle) return bank.defaultTitle;
  return subject.trim();
}

function isAccountTransfer(body) {
  return (
    /Transfer\s+Type\s*\|?\s*:?\s*\|?\s*Transfer\s+to\b/i.test(body) ||
    /Tipe\s+Transaksi\s*\|?\s*:?\s*\|?\s*(?:BI\s*-?\s*FAST|SKN|RTGS|Transfer)/i.test(body) ||
    /Transfer\s+Method\s*\|?\s*:?\s*\|?\s*BI\s*-?\s*FAST\b/i.test(body)
  );
}

function remapKnownMerchant(name) {
  if (/yatim.*dhuafa/i.test(name)) return 'Parkir';
  return name;
}

function paidByCreditCard(body) {
  const m = body.match(/Sumber\s*dana\s*:?\s*\n?([\s\S]{0,160})/i);
  if (!m) return false;
  return /mastercard|visa|kartu\s*kredit|credit\s*card|\bjcc\b|\bkki\b/i.test(m[1]);
}

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

function transactionAlreadyExists(tx) {

  const GRAB_CODE = /\bA-[A-Z0-9]{6,}/i;
  if (/^grab\b/i.test(tx.title) && !GRAB_CODE.test(tx.title)) {
    const grabParams = [
      'user_id=eq.' + encodeURIComponent(IMPORT_USER_ID),
      'title=ilike.' + encodeURIComponent('grab%A-%'),
      'amount=eq.' + encodeURIComponent(tx.amount),
      'date=eq.' + encodeURIComponent(tx.date),
      'select=id',
      'limit=1',
    ].join('&');
    const grabResponse = supabaseRequest('/rest/v1/transactions?' + grabParams, 'get');
    if (grabResponse.getResponseCode() >= 200 && grabResponse.getResponseCode() < 300) {
      const grabRows = JSON.parse(grabResponse.getContentText());
      if (Array.isArray(grabRows) && grabRows.length > 0) return true;
    }
  }

  if (tx.time) {
    const momentParams = [
      'user_id=eq.' + encodeURIComponent(IMPORT_USER_ID),
      'source=eq.' + encodeURIComponent(tx.source),
      'amount=eq.' + encodeURIComponent(tx.amount),
      'date=eq.' + encodeURIComponent(tx.date),
      'time=eq.' + encodeURIComponent(tx.time),
      'select=id',
      'limit=1',
    ].join('&');
    const momentResponse = supabaseRequest('/rest/v1/transactions?' + momentParams, 'get');
    if (momentResponse.getResponseCode() >= 200 && momentResponse.getResponseCode() < 300) {
      const momentRows = JSON.parse(momentResponse.getContentText());
      if (Array.isArray(momentRows) && momentRows.length > 0) return true;
    }
  }

  const params = [
    'user_id=eq.' + encodeURIComponent(IMPORT_USER_ID),
    'title=eq.' + encodeURIComponent(tx.title),
    'amount=eq.' + encodeURIComponent(tx.amount),
    'date=eq.' + encodeURIComponent(tx.date),
    tx.time ? 'time=eq.' + encodeURIComponent(tx.time) : 'time=is.null',
    'select=id',
    'limit=1',
  ].join('&');
  const response = supabaseRequest('/rest/v1/transactions?' + params, 'get');
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    Logger.log('Gagal cek duplikat, lanjut insert seperti biasa: ' + response.getContentText());
    return false;
  }
  const rows = JSON.parse(response.getContentText());
  return Array.isArray(rows) && rows.length > 0;
}

function insertTransaction(tx) {
  if (transactionAlreadyExists(tx)) {
    Logger.log('Skip (udah ada, sama persis judul/nominal/tanggal/jam): ' + tx.title + ' Rp' + tx.amount);
    return true;
  }

  const payload = {
    id: Utilities.getUuid(),
    date: tx.date,
    time: tx.time || null,
    title: tx.title,
    category: tx.category,
    amount: tx.amount,
    source: tx.source,
    dana_dipakai: tx.dana_dipakai,
    type: tx.type || 'expense',
    user_id: IMPORT_USER_ID,
  };

  const response = supabaseRequest('/rest/v1/transactions', 'post', [payload]);

  const code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    Logger.log('Inserted: ' + tx.title + ' Rp' + tx.amount);
    const delta = tx.type === 'income'
      ? tx.amount
      : (tx.dana_dipakai === 'Spend CC' ? tx.amount : -tx.amount);
    applyAccountBalanceDelta(tx.source, delta);

    if (/^bayar cc/i.test(tx.title)) {
      applyAccountBalanceDelta(tx.title.replace(/^bayar\s+/i, '').trim(), delta);
    }

    return true;
  }

  if (code === 409) {
    Logger.log('Skip (ditolak indeks unik, sudah ada): ' + tx.title + ' Rp' + tx.amount);
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
