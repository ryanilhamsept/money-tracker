// ===== CONFIG =====
const SUPABASE_URL = 'https://jzwaajojwoqvrgzvyvyt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6d2Fham9qd29xdnJnenZ5dnl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMzU4MDgsImV4cCI6MjEwMDYxMTgwOH0.au6DtFhgjo1TBsGkJvBEqmwmnGvmWPVHxZLCFboTOUI';
const GMAIL_QUERY = 'label:transaction';
// Auto-imported transactions get attributed to this account (RLS now scopes
// data per-user; the anon key has no login session, so this must be explicit).
const IMPORT_USER_ID = 'd09a1edc-3042-4e9f-886d-d5136ff379cc';

const GRAB_PAYMENT_SOURCES = {
  '9628': { source: 'Superbank', dana_dipakai: 'Spend Bulanan' },
  '4904': { source: 'Credit Card - BCA', dana_dipakai: 'Spend CC' },
};

// ===== DEDUP =====
function isProcessed(messageId) {
  return PropertiesService.getScriptProperties().getProperty('msg_' + messageId) !== null;
}

// Email yang GAGAL di-parse sengaja nggak di-markProcessed supaya bisa
// di-retry setelah parser-nya diperbaiki. Tapi kalau formatnya emang nggak
// pernah bisa ke-parse, dia bakal di-fetch ulang TIAP KALI trigger jalan --
// selamanya -- dan itu yang bikin kuota Gmail harian jebol. MAX_PARSE_RETRIES
// batasin percobaan itu; setelah gagal berkali-kali, email di-skip permanen
// (dikasih label 'needs-review' biar bisa dicek manual) daripada terus nyedot kuota.
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

// ===== UTILS (jalankan manual sekali, lalu hapus) =====

/**
 * Hapus semua msg yang berasal dari KartuKreditBCA agar bisa di-reprocess.
 * Gunakan ini untuk recover email yang terlanjur di-SKIP_MARK_READ oleh script lama.
 * Jalankan SEKALI via Apps Script editor → Run → clearKartuKreditBCAProcessed, lalu hapus fungsi ini.
 */
function clearKartuKreditBCAProcessed() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var count = 0;
  Object.keys(props).forEach(function(key) {
    if (key.startsWith('msg_')) {
      var msgId = key.replace('msg_', '');
      try {
        var msg = GmailApp.getMessageById(msgId);
        if (msg && msg.getFrom().toLowerCase().indexOf('kartukreditbca@klikbca.com') !== -1) {
          PropertiesService.getScriptProperties().deleteProperty(key);
          msg.markUnread(); // biar ketrigger lagi
          count++;
          Logger.log('Cleared: ' + msgId + ' | ' + msg.getSubject());
        }
      } catch(e) {
        // message not found, skip
      }
    }
  });
  Logger.log('Done. Cleared ' + count + ' KartuKreditBCA message(s).');
}

/**
 * Reset pesan yang udah "menyerah" (label needs-review) supaya di-retry lagi
 * oleh processTransactionEmails setelah parser/getEmailBody diperbaiki.
 * Jalankan manual sekali tiap kali abis fix parser, lalu jalankan
 * processTransactionEmails lagi buat coba ulang.
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
 * Debug: log isi teks hasil decode (getEmailBody) dari 5 email transaksi
 * terbaru, tanpa peduli status processed/read. Pakai ini kalau parser gagal
 * dan mau lihat persis teks yang dicocokkan ke regex.
 */
function debugDumpBodies() {
  const list = Gmail.Users.Messages.list('me', { q: GMAIL_QUERY, maxResults: 5 });
  const messages = list.messages || [];
  messages.forEach(function (m) {
    const full = Gmail.Users.Messages.get('me', m.id, { format: 'full' });
    const subject = getHeader(full, 'Subject');
    const from = getHeader(full, 'From');
    const body = getEmailBody(full);
    Logger.log('=== ' + subject + ' | ' + from + ' ===');
    Logger.log(body.substring(0, 1500));
    Logger.log('--- END ---');
  });
}

// ===== MAIN ENTRY POINT =====
// Pakai Advanced Gmail Service (Gmail.Users.*) alih-alih GmailApp bawaan.
// GmailApp punya kuota harian sendiri yang ketat buat akun consumer ("Service
// invoked too many times for one day: gmail"); Advanced Gmail Service manggil
// Gmail API asli yang kuotanya jauh lebih besar, jadi nggak gampang jebol
// meski backlog email-nya banyak. Ini butuh Gmail API diaktifkan sekali lewat
// Apps Script editor: Services (ikon +) → Gmail API → Add.
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

function handleMessage(message) {
  const from = getHeader(message, 'From').toLowerCase();
  const subject = getHeader(message, 'Subject');
  const body = getEmailBody(message);

  let tx = null;

  if (from.indexOf('kartukreditbca@klikbca.com') !== -1) {
    tx = parseKartuKreditBCA(subject, body);
  } else if (from.indexOf('noreply.livin@bankmandiri.co.id') !== -1) {
    tx = parseLivin(body);
  } else if (from.indexOf('superbank.id') !== -1) {
    tx = parseSuperbank(body);
  } else if (from.indexOf('wondr@bni.co.id') !== -1) {
    tx = parseWondr(body);
  } else if (from.indexOf('receipts@blubybcadigital.id') !== -1) {
    tx = parseBlu(body);
  } else if (from.indexOf('bca@bca.co.id') !== -1) {
    tx = parseBCA(body);
  } else if (from.indexOf('no-reply@grab.com') !== -1) {
    tx = parseGrab(body);
  } else {
    return;
  }

  if (tx === 'SKIP_MARK_READ') {
    markReadAPI(message.id);
    markProcessed(message.id);
    return;
  }
  if (!tx) {
    // null = parse gagal, JANGAN mark processed supaya bisa di-retry setelah fix
    // (tapi dibatasi MAX_PARSE_RETRIES -- lihat catatan di getFailCount/dst).
    const failCount = incrementFailCount(message.id);
    Logger.log('Parser returned null (percobaan ' + failCount + '/' + MAX_PARSE_RETRIES + ') for: ' + subject + ' | from: ' + from);

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
    return;
  }

  const success = insertTransaction(tx);
  if (success) {
    markReadAPI(message.id);
    markProcessed(message.id);
    clearFailCount(message.id);
  }
}

// ===== PARSERS =====

// ===== EMAIL BODY HELPER =====
// Beberapa bank (KartuKreditBCA, dll) kirim email HTML-only, jadi selalu coba
// text/plain dulu lalu fallback ke text/html yang di-strip jadi teks biasa.
// Body Gmail API dikirim base64url-encoded dan bisa nested di beberapa parts
// (multipart/alternative, multipart/mixed, dst) makanya perlu collectParts.
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

function getEmailBody(message) {
  var parts = collectParts(message.payload);
  var plainPart = parts.find(function (p) { return p.mimeType === 'text/plain'; });
  var htmlPart = parts.find(function (p) { return p.mimeType === 'text/html'; });

  var plain = plainPart ? decodeBase64Url(plainPart.data) : '';
  if (plain && plain.replace(/[-\s]/g, '').length > 30) return plain;

  var html = htmlPart ? decodeBase64Url(htmlPart.data) : '';
  if (!html) return plain || '';

  // PENTING: strip <style>, <script>, <head> DULU sebelum proses lainnya
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

  // Ubah struktur tabel jadi teks yang bisa di-parse
  html = html.replace(/<\/td>\s*<td[^>]*>/gi, ' : ');   // </td><td> → " : "
  html = html.replace(/<td[^>]*>/gi, '');                  // buka <td>
  html = html.replace(/<\/td>/gi, '\n');                  // tutup </td> → newline
  html = html.replace(/<br\s*\/?>/gi, '\n');              // <br> → newline
  html = html.replace(/<\/tr>/gi, '\n');                  // </tr> → newline
  html = html.replace(/<\/p>/gi, '\n');                   // </p> → newline
  html = html.replace(/<\/div>/gi, '\n');                 // </div> → newline
  html = html.replace(/<[^>]+>/g, '');                     // strip semua tag sisanya
  // Decode HTML entities
  html = html.replace(/&nbsp;/g, ' ');
  html = html.replace(/&amp;/g, '&');
  html = html.replace(/&lt;/g, '<');
  html = html.replace(/&gt;/g, '>');
  html = html.replace(/&#39;/g, "'");
  html = html.replace(/&quot;/g, '"');
  // Bersihkan multiple spaces/newlines
  html = html.replace(/[ \t]{2,}/g, ' ');
  html = html.replace(/\n{3,}/g, '\n\n');
  // Beberapa bank (blu format Recurring/Autopay, dll) taruh value di baris
  // <tr> yang TERPISAH dari labelnya, jadi hasil strip jadi "Label\n\n: Value"
  // bukan "Label Value". Parser (misalnya parseBlu) nungguin label & value
  // nyambung langsung tanpa colon -- gabungkan jadi satu baris & buang
  // colon-nya.
  html = html.replace(/\n+[ \t]*:[ \t]*/g, ' ');
  // Beberapa tabel HTML BCA (myBCA, dst) punya kolom kosong (spacer <td>)
  // antara label & nilai. GmailApp.getBody() dulu otomatis menormalkannya,
  // tapi Gmail API kasih HTML mentah asli, jadi hasil strip di atas bisa jadi
  // " : : VALUE" bukan " : VALUE" -- collapse jadi satu colon biar regex
  // parser (yang cuma nerima satu colon opsional) tetap match.
  html = html.replace(/(?::[ \t]*){2,}/g, ': ');
  return html.trim();
}


function parseKartuKreditBCA(subject, body) {
  // FIX: HTML table punya kolom kosong antara label & nilai, jadi setelah strip
  // hasilnya " : : : VALUE" bukan " : VALUE".
  // Pakai (?::\s*)+ untuk skip semua colon.
  const amountMatch = body.match(/Sejumlah\s*(?::\s*)+Rp\s?([\d.,]+)/i);
  const merchantMatch = body.match(/Merchant\s*\/\s*ATM\s*(?::\s*)+([^:\n][^\n]*)/i);
  const dateMatch = body.match(/Pada Tanggal\s*(?::\s*)+(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/i);

  if (!amountMatch || !merchantMatch || !dateMatch) {
    if (/tagihan|statement|e-statement|promo|penawaran|cicilan|partner|ekstra|dapatkan/i.test(subject)) {
      return 'SKIP_MARK_READ';
    }
    Logger.log('KartuKreditBCA parse failed. subject=' + subject);
    Logger.log('  amountMatch=' + !!amountMatch + ' merchantMatch=' + !!merchantMatch + ' dateMatch=' + !!dateMatch);
    Logger.log('  body(0-600): ' + body.substring(0, 600).replace(/\n/g, ' | '));
    return null;
  }

  const title = remapKnownMerchant(merchantMatch[1].trim());
  const date = dateMatch[3] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[1].padStart(2, '0');
  const time = dateMatch[4] ? dateMatch[4] + ':' + dateMatch[5] : '';
  const amount = parseRupiah(amountMatch[1]);
  return {
    title: title,
    date: date,
    time: time,
    amount: amount,
    category: guessCategory(title),
    source: 'Credit Card - BCA',
    dana_dipakai: 'Spend CC',
  };
}


function parseLivin(body) {
  const recipientMatch = body.match(/Recipient\s*#*\s*([^\n#]+)/i);
  if (!recipientMatch) {
    Logger.log('Livin: Recipient not found. body: ' + body.substring(0, 200).replace(/\n/g, ' | '));
    return null;
  }

  // FIX: Livin taruh Date dan Time di baris TERPISAH
  // Format: "Date 29 Aug 2026 | Time 15:34:25 WIB"
  let date, time;
  const combinedDT = body.match(/Date\s*\|?\s*(\d{1,2}\s+\w+\s+\d{2,4})\s+(\d{1,2}):(\d{2})/i);
  if (combinedDT) {
    date = parseIndoDate(combinedDT[1]);
    time = formatTime(combinedDT[2], combinedDT[3]);
  } else {
    const dateOnly = body.match(/Date\s+(\d{1,2}\s+\w+\s+\d{2,4})/i);
    const timeOnly = body.match(/Time\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:WIB|WITA|WIT)?/i);
    if (!dateOnly) {
      Logger.log('Livin: no date field. recipient=' + recipientMatch[1]);
      return null;
    }
    date = parseIndoDate(dateOnly[1]);
    time = formatTime(timeOnly && timeOnly[1], timeOnly && timeOnly[2]);
  }
  if (!date) return null;

  const tripFareMatch = body.match(/Trip Fare\s*\|?\s*Rp\s?([\d.,]+)/i);
  const holdMatch = body.match(/Hold Amount\s*\|?\s*Rp\s?([\d.,]+)/i);
  const refundMatch = body.match(/Refund Amount\s*\|?\s*Rp\s?([\d.,]+)/i);
  const txAmountMatch = body.match(/Transaction Amount\s*\|?\s*Rp\s?([\d.,]+)/i);

  // FIX: tambah pattern untuk pembayaran umum (ticket, merchant, dll)
  const nominalMatch = body.match(/Nominal(?:\s+Transfer|\s+Transaksi)?\s*\|?:?\s*Rp\s?([\d.,]+)/i);
  const totalMatch = body.match(/Total(?:\s+Bayar|\s+Pembayaran)?\s*\|?:?\s*Rp\s?([\d.,]+)/i);
  const jumlahMatch = body.match(/(?:Jumlah|Amount)\s*\|?:?\s*Rp\s?([\d.,]+)/i);

  let amount;
  if (tripFareMatch) amount = parseRupiah(tripFareMatch[1]);
  else if (holdMatch && refundMatch) amount = parseRupiah(holdMatch[1]) - parseRupiah(refundMatch[1]);
  else if (holdMatch) amount = parseRupiah(holdMatch[1]);
  else if (txAmountMatch) amount = parseRupiah(txAmountMatch[1]);
  else if (nominalMatch) amount = parseRupiah(nominalMatch[1]);
  else if (totalMatch) amount = parseRupiah(totalMatch[1]);
  else if (jumlahMatch) amount = parseRupiah(jumlahMatch[1]);
  else {
    Logger.log('Livin: no amount field found. recipient=' + recipientMatch[1]);
    return null;
  }

  if (!amount || amount <= 0) return null;

  const title = remapKnownMerchant(recipientMatch[1].trim());

  return {
    title: title,
    date: date,
    time: time,
    amount: amount,
    category: guessCategory(title),
    source: 'Mandiri',
    dana_dipakai: 'Spend Bulanan',
  };
}

function parseSuperbank(body) {
  const amountMatch = body.match(/Nominal Bayar\s*\n?\s*Rp\s?([\d.,]+)/i);
  const dateTimeMatch = body.match(/Tanggal\s*&\s*waktu\s*\n?\s*(\d{1,2}\s+\w+\s+\d{2,4})\s+(\d{1,2}):(\d{2})/i);
  if (!amountMatch || !dateTimeMatch) return null;

  const merchant = extractAfterLabel(body, 'Penerima');
  if (!merchant) return null;
  const title = remapKnownMerchant(merchant);

  const date = parseIndoDate(dateTimeMatch[1]);
  const time = formatTime(dateTimeMatch[2], dateTimeMatch[3]);
  if (!date) return null;
  const amount = parseRupiah(amountMatch[1]);

  return {
    title: title,
    date: date,
    time: time,
    amount: amount,
    category: guessCategory(title),
    source: 'Superbank',
    dana_dipakai: 'Spend Bulanan',
  };
}

function parseWondr(body) {
  const penerima = extractAfterLabel(body, 'Penerima');
  if (!penerima) return null;

  // FIX: handle "Nominal Transaksi", "Nominal:", dll
  const amountMatch =
    body.match(/Nominal(?:\s+Transaksi|\s+Transfer|\s+Pembayaran)?\s*\n?\s*:?\s*Rp\s?([\d.,]+)/i) ||
    body.match(/Jumlah\s*\n?\s*:?\s*Rp\s?([\d.,]+)/i) ||
    body.match(/Total\s*\n?\s*:?\s*Rp\s?([\d.,]+)/i);

  // FIX: wondr taruh Tanggal dan Waktu/Jam di baris TERPISAH dengan label masing-masing
  let date, time;
  const combinedMatch =
    body.match(/Tanggal\s*\|?\s*(\d{1,2}\s+\w+\s+\d{2,4})\s+(\d{1,2}):(\d{2})/i) ||
    body.match(/Tanggal\s*\|?\s*(\d{1,2}\s+\w+\s+\d{2,4})\s*\n+\s*(\d{1,2}):(\d{2})/i);

  if (combinedMatch) {
    date = parseIndoDate(combinedMatch[1]);
    time = formatTime(combinedMatch[2], combinedMatch[3]);
  } else {
    // Tanggal dan Waktu label terpisah
    const dateOnlyMatch = body.match(/Tanggal(?:\s+Transaksi)?\s*[:|]?\s*\n?\s*(\d{1,2}\s+\w+\s+\d{2,4})/i);
    const timeOnlyMatch = body.match(/(?:Waktu|Jam)\s*[:|]?\s*\n?\s*(\d{1,2}):(\d{2})/i);
    if (!dateOnlyMatch) {
      Logger.log('wondr parse failed. penerima=' + penerima);
      Logger.log('  amountMatch=' + !!amountMatch + ' dateTimeMatch=false (no date label found)');
      Logger.log('  body snippet: ' + body.substring(0, 500).replace(/\n/g, ' | '));
      return null;
    }
    date = parseIndoDate(dateOnlyMatch[1]);
    time = formatTime(timeOnlyMatch && timeOnlyMatch[1], timeOnlyMatch && timeOnlyMatch[2]);
  }

  if (!amountMatch) {
    Logger.log('wondr: amount not found. penerima=' + penerima);
    return null;
  }

  const sumberSection = (body.match(/Sumber dana[\s\S]{0,150}/i) || [''])[0];
  let source = 'BNI';
  let dana = 'Spend Bulanan';
  if (/mastercard|kartu kredit/i.test(sumberSection)) {
    source = 'Credit Card - BNI';
    dana = 'Spend CC';
  }

  const title = remapKnownMerchant(penerima);
  if (!date) return null;
  const amount = parseRupiah(amountMatch[1]);

  return {
    title: title,
    date: date,
    time: time,
    amount: amount,
    category: guessCategory(title),
    source: source,
    dana_dipakai: dana,
  };
}

function parseBlu(body) {
  const dateTimeMatch = body.match(/Tgl\s*&\s*Jam Transaksi\s*\n?\s*(\d{1,2}\s+\w+\s+\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
  if (!dateTimeMatch) return null;

  const date = parseIndoDate(dateTimeMatch[1]);
  if (!date) return null;

  const time = formatTime(dateTimeMatch[2], dateTimeMatch[3], dateTimeMatch[4]);

  const tipeMatch = body.match(/Tipe Transaksi\s*\n?\s*([^\n]+)/i);
  const tipe = tipeMatch ? tipeMatch[1].trim() : '';
  const isTransfer = /BI-FAST|SKN|RTGS|Transfer/i.test(tipe);

  const amountMatch =
    body.match(/Total(?:\s+Bayar)?\s*\n?\s*Rp\s?([\d.,]+)/i) ||
    body.match(/Nominal Tagihan\s*\n?\s*Rp\s?([\d.,]+)/i);
  if (!amountMatch) return null;
  const amount = parseRupiah(amountMatch[1]);

  if (isTransfer) {
    const nama = extractAfterLabel(body, 'bluAccount');
    if (!nama) return null;
    if (/ryan ilham/i.test(nama)) return null;

    return {
      title: remapKnownMerchant(nama),
      date: date,
      time: time,
      amount: amount,
      category: 'Account Transfer',
      source: 'Blu',
      dana_dipakai: 'Spend Bulanan',
    };
  }

  let title = extractAfterLabel(body, 'bluAccount');
  if (!title) return null;
  title = title.replace(/\s*blu(?:Debit)?\s*Card[\s\S]*$/i, '').trim();
  if (!title) return null;
  title = remapKnownMerchant(title);

  return {
    title: title,
    date: date,
    time: time,
    amount: amount,
    category: guessCategory(title),
    source: 'Blu',
    dana_dipakai: 'Spend Bulanan',
  };
}

function parseBCA(body) {
  // Skip: transfer antar Poket (bukan pengeluaran nyata)
  if (/Jenis Transaksi\s*:\s*Transaksi Poket/i.test(body)) return 'SKIP_MARK_READ';

  // Skip: pembayaran tagihan Kartu Kredit BCA (sudah tercatat via email KartuKreditBCA)
  if (/Jenis Transaksi\s*:.*Kartu Kredit.*Paylater/i.test(body)) return 'SKIP_MARK_READ';

  // Skip: Pindahkan Poket
  if (/Pindahkan Poket/i.test(body)) return 'SKIP_MARK_READ';

  // --- Jalur 0: Top Up Flazz ---
  if (/Jenis Transaksi\s*:\s*Top Up Flazz/i.test(body)) {
    const dtMatch = body.match(/Tanggal Transaksi\s*:\s*(\d{1,2}\s+\w+\s+\d{4})\s+(\d{2}):(\d{2})/i);
    const amtMatch = body.match(/Nominal Top Up\s*:\s*IDR\s?([\d,]+\.\d{2})/i);
    if (!dtMatch || !amtMatch) return null;
    return {
      title: 'Top Up Flazz BCA',
      date: parseIndoDate(dtMatch[1]),
      time: dtMatch[2] + ':' + dtMatch[3],
      amount: parseIDR(amtMatch[1]),
      category: 'Transportation',
      source: 'BCA',
      dana_dipakai: 'Spend Bulanan',
    };
  }

  // --- Jalur 1: myBCA PEMBELIAN (PLN, BPJS, token listrik, dll) ---
  if (/fasilitas myBCA/i.test(body) && /Type Transaksi\s*:?\s*PEMBELIAN/i.test(body)) {
    const dateTimeMatch = body.match(/Tgl\/Jam\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::\d{2})?/i);
    const produkMatch = body.match(/Produk\s*:?\s*([^\n]+)/i);
    const amountMatch = body.match(/Total Bayar\s*:?\s*RP\s+([\d.,]+)/i);
    if (!dateTimeMatch || !produkMatch || !amountMatch) return null;

    const date = dateTimeMatch[3] + '-' + dateTimeMatch[2] + '-' + dateTimeMatch[1];
    const time = dateTimeMatch[4] + ':' + dateTimeMatch[5];
    const title = formatProdukTitle(produkMatch[1].trim());
    const amount = parseRupiah(amountMatch[1]);

    return {
      title: title,
      date: date,
      time: time,
      amount: amount,
      category: guessCategory(title),
      source: 'BCA',
      dana_dipakai: 'Spend Bulanan',
    };
  }

  // --- Jalur 2: myBCA TRANSFER/PEMBAYARAN (Internet Transaction Journal) ---
  // FIX: tambah handler untuk tipe transfer via myBCA
  if (/fasilitas myBCA/i.test(body) && /Type Transaksi\s*:?\s*(?:TRANSFER|PEMBAYARAN)/i.test(body)) {
    const dateTimeMatch = body.match(/Tgl\/Jam\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2})(?::\d{2})?/i);
    const penerimaMatcher = body.match(/(?:Nama Penerima|Tujuan|Nama Tujuan)\s*:?\s*([^\n]+)/i);
    const amountMatch =
      body.match(/(?:Nominal|Jumlah)\s*:?\s*Rp\s?([\d.,]+)/i) ||
      body.match(/Total Bayar\s*:?\s*Rp\s?([\d.,]+)/i) ||
      body.match(/Nominal\s*:?\s*IDR\s?([\d,]+\.\d{2})/i);

    if (dateTimeMatch && penerimaMatcher && amountMatch) {
      const penerima = penerimaMatcher[1].trim();
      if (/ryan ilham/i.test(penerima)) return null;

      const date = dateTimeMatch[3] + '-' + dateTimeMatch[2].padStart(2, '0') + '-' + dateTimeMatch[1].padStart(2, '0');
      const time = dateTimeMatch[4] + ':' + dateTimeMatch[5];
      const amount = parseAmountAuto(amountMatch[1]);

      return {
        title: remapKnownMerchant(penerima),
        date: date,
        time: time,
        amount: amount,
        category: 'Account Transfer',
        source: 'BCA',
        dana_dipakai: 'Spend Bulanan',
      };
    }
  }

  // --- Jalur 3: BCA Internet Banking — QRIS & Transfer biasa ---
  const dateMatch = body.match(/Tanggal Transaksi\s*\|?\s*:?\s*\|?\s*(\d{1,2}\s+\w+\s+\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/i);
  if (!dateMatch) return null;
  const date = parseIndoDate(dateMatch[1]);
  if (!date) return null;
  // myBCA kadang nempelin jam langsung di "Tanggal Transaksi" (bukan field
  // "Waktu" terpisah) -- pakai sebagai fallback kalau "Waktu" nggak ketemu.
  const embeddedTime = formatTime(dateMatch[2], dateMatch[3]);

  // QRIS
  if (/Pembayaran QRIS/i.test(body)) {
    const merchantMatch = body.match(/Pembayaran Ke\s*\|?\s*:?\s*\|?\s*([^\n|]+)/i);
    const timeMatch = body.match(/Waktu\s*\|?\s*:?\s*\|?\s*(\d{1,2}):(\d{2})/i);
    const amountMatch = body.match(/Total Bayar\s*\|?\s*:?\s*\|?\s*IDR\s?([\d,]+\.\d{2})/i);
    if (!merchantMatch || !amountMatch) return null;

    const title = remapKnownMerchant(merchantMatch[1].trim());
    const time = timeMatch ? formatTime(timeMatch[1], timeMatch[2]) : embeddedTime;
    const amount = parseIDR(amountMatch[1]);

    return {
      title: title,
      date: date,
      time: time,
      amount: amount,
      category: guessCategory(title),
      source: 'BCA',
      dana_dipakai: 'Spend Bulanan',
    };
  }

  // Transfer ke rekening orang lain
  const namaMatch = body.match(/Nama Penerima\s*\|?\s*:?\s*\|?\s*([^\n|]+)/i);
  if (namaMatch) {
    const nama = namaMatch[1].trim();
    if (/ryan ilham/i.test(nama)) return null;

    const timeMatch = body.match(/Waktu\s*\|?\s*:?\s*\|?\s*(\d{1,2}):(\d{2})/i);
    const amountMatch = body.match(/Nominal(?:\s+Tujuan)?\s*\|?\s*:?\s*\|?\s*IDR\s?([\d,]+\.\d{2})/i);
    if (!amountMatch) return null;
    const amount = parseIDR(amountMatch[1]);
    const time = timeMatch ? formatTime(timeMatch[1], timeMatch[2]) : embeddedTime;

    return {
      title: nama,
      date: date,
      time: time,
      amount: amount,
      category: 'Account Transfer',
      source: 'BCA',
      dana_dipakai: 'Spend Bulanan',
    };
  }

  // FIX: BCA bill payment tanpa Nama Penerima (e.g. kartu kredit, asuransi)
  const tujuanMatch = body.match(/(?:Nama Tagihan|Tujuan Pembayaran|Nama Produk)\s*\|?\s*:?\s*\|?\s*([^\n|]+)/i);
  const billAmountMatch =
    body.match(/(?:Nominal|Total Bayar|Jumlah)\s*\|?\s*:?\s*\|?\s*IDR\s?([\d,]+\.\d{2})/i) ||
    body.match(/(?:Nominal|Total Bayar|Jumlah)\s*\|?\s*:?\s*\|?\s*Rp\s?([\d.,]+)/i);

  if (tujuanMatch && billAmountMatch) {
    const timeMatch = body.match(/Waktu\s*\|?\s*:?\s*\|?\s*(\d{1,2}):(\d{2})/i);
    const title = remapKnownMerchant(tujuanMatch[1].trim());
    const amount = parseAmountAuto(billAmountMatch[1]);
    const time = timeMatch ? formatTime(timeMatch[1], timeMatch[2]) : embeddedTime;

    return {
      title: title,
      date: date,
      time: time,
      amount: amount,
      category: guessCategory(title),
      source: 'BCA',
      dana_dipakai: 'Spend Bulanan',
    };
  }

  // DEBUG: print 800 chars pertama body supaya bisa lihat format emailnya
  Logger.log('BCA: tidak ada field yang cocok. date=' + date);
  Logger.log('BCA body snippet (0-400): ' + body.substring(0, 400).replace(/\n/g, ' | '));
  Logger.log('BCA body snippet (400-800): ' + body.substring(400, 800).replace(/\n/g, ' | '));
  return null;
}

function parseGrab(body) {
  // FIX: "Your Grab E-Receipt" — format baru Grab (English receipt)
  if (/E-Receipt/i.test(body) || /receipt/i.test(body)) {
    // GrabFood E-Receipt
    const foodNameMatch = body.match(/(?:Order from|Pesanan dari):?\s*([^\n]+)/i);
    const grabFoodTotal =
      body.match(/(?:Total|Grand Total|Amount paid)\s*:?\s*Rp\s?([\d.,]+)/i) ||
      body.match(/(?:Total|Grand Total|Amount paid)\s*:?\s*IDR\s?([\d.,]+)/i);
    const grabFoodDate =
      body.match(/(?:Date|Order date|Trip date|Tanggal)\s*:?\s*(\d{1,2}\s+\w+\s+\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/i) ||
      body.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Mei|Agu|Agt|Okt|Des)\w*\s+\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i);

    if (grabFoodDate) {
      const date = parseIndoDate(grabFoodDate[1]);
      if (date && grabFoodTotal) {
        const payment = grabPaymentFromBody(body);
        const amount = parseRupiah(grabFoodTotal[1]);
        const title = foodNameMatch ? foodNameMatch[1].trim() : 'Grab';
        const isFood = foodNameMatch || /GrabFood|food/i.test(body);
        const time = formatTime(grabFoodDate[2], grabFoodDate[3]);
        return {
          title: remapKnownMerchant(title),
          date: date,
          time: time,
          amount: amount,
          category: isFood ? 'Food' : 'Transportation',
          source: payment ? payment.source : 'BCA',
          dana_dipakai: payment ? payment.dana_dipakai : 'Spend Bulanan',
        };
      }
    }
    // Kalau masih gagal, lanjut ke fallback di bawah
    Logger.log('Grab E-Receipt: gagal parse. body: ' + body.substring(0, 400).replace(/\n/g, ' | '));
  }

  if (/Tip darimu sudah disalurkan/i.test(body)) {
    const amountMatch = body.match(/Total\s*\|?\s*RP\s?([\d.,]+)/i);
    const dateMatch = body.match(/Dijemput Pada:\s*(\d{1,2}\s+\w+\s+\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/i);
    if (!amountMatch || !dateMatch) return null;
    const date = parseIndoDate(dateMatch[1]);
    if (!date) return null;
    const payment = grabPaymentFromBody(body);
    if (!payment) return null;
    const time = formatTime(dateMatch[2], dateMatch[3]);
    return {
      title: 'Tip Driver Grab',
      date: date,
      time: time,
      amount: parseRupiah(amountMatch[1]),
      category: 'Food',
      source: payment.source,
      dana_dipakai: payment.dana_dipakai,
    };
  }

  if (/Pesanan Dari:/i.test(body)) {
    const restoName = extractAfterLabel(body, 'Pesanan Dari:');
    const amountMatch = body.match(/TOTAL\s*Rp\s?([\d.,]+)/i);
    // FIX: sebelumnya cuma nangkep tanggal, jam di label WAKTU nggak pernah di-capture
    const dateMatch = body.match(/TANGGAL\s*\|?\s*WAKTU\s*(\d{1,2}\s+\w+\s+\d{2,4})\s+(\d{1,2}):(\d{2})/i)
      || body.match(/TANGGAL\s*\|?\s*WAKTU\s*(\d{1,2}\s+\w+\s+\d{2,4})/i);
    if (!restoName || !amountMatch || !dateMatch) return null;
    const date = parseIndoDate(dateMatch[1]);
    if (!date) return null;
    const payment = grabPaymentFromBody(body);
    if (!payment) return null;
    const time = formatTime(dateMatch[2], dateMatch[3]);
    return {
      title: restoName,
      date: date,
      time: time,
      amount: parseRupiah(amountMatch[1]),
      category: 'Food',
      source: payment.source,
      dana_dipakai: payment.dana_dipakai,
    };
  }

  const amountMatch = body.match(/Total Paid\s*\|?\s*Rp\s?([\d.,]+)/i);
  const dateMatch = body.match(/Picked up on\s*(\d{1,2}\s+\w+\s+\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/i);
  if (!amountMatch || !dateMatch) return null;
  const date = parseIndoDate(dateMatch[1]);
  if (!date) return null;
  const payment = grabPaymentFromBody(body);
  if (!payment) return null;
  const time = formatTime(dateMatch[2], dateMatch[3]);

  return {
    title: 'Grab',
    date: date,
    time: time,
    amount: parseRupiah(amountMatch[1]),
    category: 'Transportation',
    source: payment.source,
    dana_dipakai: payment.dana_dipakai,
  };
}

function grabPaymentFromBody(body) {
  if (/superbank/i.test(body)) return GRAB_PAYMENT_SOURCES['9628'];

  // FIX: handle Grab bayar Cash
  if (/\[image:\s*Cash\]\s*Cash|Paid by\s+Cash|Dibayar dengan\s+Cash/i.test(body)) {
    return { source: 'Cash', dana_dipakai: 'Spend Bulanan' };
  }

  const digitMatch = body.match(/\b(\d{4})\b\s*\|?\s*[\d.,]+\s*$/m) || body.match(/(?:Paid by|Dibayar dengan)[\s\S]{0,40}?(\d{4})\b/i);
  if (!digitMatch) return null;
  return GRAB_PAYMENT_SOURCES[digitMatch[1]] || null;
}

// ===== HELPERS =====

function extractAfterLabel(body, label) {
  const idx = body.search(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  if (idx === -1) return null;
  const rest = body.slice(idx + label.length);
  const lines = rest.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && /[a-zA-Z0-9]/.test(line)) {
      return line;
    }
  }
  return null;
}

function remapKnownMerchant(name) {
  if (/yatim.*dhuafa/i.test(name)) return 'Parkir';
  return name;
}

const KNOWN_ACRONYMS = { PLN: 'PLN', BPJS: 'BPJS', PDAM: 'PDAM' };
function formatProdukTitle(produk) {
  return produk
    .split(/\s+/)
    .map(function (word) {
      const upper = word.toUpperCase();
      if (KNOWN_ACRONYMS[upper]) return KNOWN_ACRONYMS[upper];
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function formatTime(h, m, s) {
  if (h == null || m == null) return '';
  var t = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  return s != null ? t + ':' + String(s).padStart(2, '0') : t;
}

function parseRupiah(str) {
  const cleaned = str.replace(/\./g, '').replace(/,/g, '.');
  return Math.round(parseFloat(cleaned));
}

function parseIDR(str) {
  return Math.round(parseFloat(str.replace(/,/g, '')));
}

// Rp uses "." as thousands separator (e.g. "81.679"); IDR uses "," (e.g. "81,679.00")
function parseAmountAuto(str) {
  return str.indexOf('.') !== -1 && str.indexOf(',') === -1 ? parseIDR(str) : parseRupiah(str);
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
  if (/\b(bubur|ayam|kopi|coffee|makan|resto|warung|takoyaki|food|cafe|bakery|nasi|bowl|chicken)\b/.test(n)) return 'Food';
  if (/\b(lrt|mrt|krl|trans|grab|gojek|parkir|toll|tol)\b/.test(n)) return 'Transportation';
  if (/\b(mart|indomaret|alfamart|superindo|supermarket)\b/.test(n)) return 'Groceries';
  if (/\b(tiket|ticket|konser|concert|event|nonton|bioskop)\b/.test(n)) return 'Entertainment'; // FIX: added
  return 'Shopping';
}

// Satu helper buat semua request ke Supabase REST/RPC -- gantiin 3 blok
// UrlFetchApp.fetch dengan headers apikey/Authorization/Prefer yang identik.
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
