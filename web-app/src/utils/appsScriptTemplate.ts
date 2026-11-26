export const APPS_SCRIPT_WEBHOOK_CODE = `/**
 * VocabStudio — Google Apps Script Webhook (1-Click Save from News Studio)
 */
const SECRET_TOKEN = ''; // Tùy chọn: đặt chuỗi bí mật nếu muốn
const VOCAB_SHEET_NAME = 'News Vocab';
const NEWS_SHEET_NAME = 'News';

const VOCAB_HEADERS = [
  'Word',
  'Part of Speech',
  'Phonetic',
  'Meaning Vietnamese',
  'Example',
  'Topic',
  'Cambridge',
  'Source Article',
  'Saved Date',
];

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateVocabSheet(ss) {
  let sheet = ss.getSheetByName(VOCAB_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(VOCAB_SHEET_NAME);
    sheet.getRange(1, 1, 1, VOCAB_HEADERS.length).setValues([VOCAB_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, VOCAB_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#0F766E')
      .setFontColor('#FFFFFF');
  }
  return sheet;
}

function doGet() {
  return jsonOut({ ok: true, service: 'VocabStudio News Webhook' });
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const payload = JSON.parse(raw);

    if (SECRET_TOKEN && String(payload.secret || '') !== SECRET_TOKEN) {
      return jsonOut({ ok: false, error: 'Sai mã bảo mật (Secret token).' });
    }

    const action = payload.action || 'save_vocab';
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'ping') {
      getOrCreateVocabSheet(ss);
      return jsonOut({
        ok: true,
        status: 'connected',
        spreadsheetName: ss.getName(),
        sheetName: VOCAB_SHEET_NAME,
      });
    }

    if (action === 'add_news_url') {
      const url = String(payload.url || '').trim();
      const title = String(payload.title || '').trim();
      const source = String(payload.source || '').trim();
      const category = String(payload.category || '').trim();
      const publishedDate = String(payload.publishedDate || '').trim();
      const imageUrl = String(payload.imageUrl || '').trim();

      if (!url) return jsonOut({ ok: false, error: 'Thiếu URL bài báo.' });

      let newsSheet = ss.getSheetByName(NEWS_SHEET_NAME);
      if (!newsSheet) {
        newsSheet = ss.insertSheet(NEWS_SHEET_NAME);
      }
      const lastRow = newsSheet.getLastRow();
      if (lastRow >= 2) {
        const existingUrls = newsSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
        const dupIdx = existingUrls.findIndex((u) => String(u || '').trim() === url);
        if (dupIdx !== -1) {
          return jsonOut({ ok: true, status: 'duplicate', row: dupIdx + 2 });
        }
      }

      newsSheet.appendRow([
        url, title, source, category, 'Pending', publishedDate, '', '', '', '', imageUrl,
      ]);
      return jsonOut({ ok: true, status: 'added', row: newsSheet.getLastRow() });
    }

    const entries = Array.isArray(payload.entries)
      ? payload.entries
      : payload.entry
        ? [payload.entry]
        : [];

    if (!entries.length) {
      return jsonOut({ ok: false, error: 'Không có từ vựng nào để lưu.' });
    }

    const sheet = getOrCreateVocabSheet(ss);
    const lastRow = sheet.getLastRow();
    const existingSet = new Set();
    if (lastRow >= 2) {
      const vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
      vals.forEach((v) => {
        const k = String(v || '').trim().toLowerCase();
        if (k) existingSet.add(k);
      });
    }

    let added = 0;
    let skipped = 0;
    const rowsToAppend = [];

    for (const item of entries) {
      const word = String(item.word || '').trim();
      if (!word) continue;
      const key = word.toLowerCase();
      if (existingSet.has(key)) {
        skipped += 1;
        continue;
      }
      existingSet.add(key);
      rowsToAppend.push([
        word,
        String(item.partOfSpeech || '').trim(),
        String(item.phonetic || '').trim(),
        String(item.meaning || '').trim(),
        String(item.example || '').trim(),
        String(item.topic || 'News').trim(),
        String(
          item.cambridgeUrl ||
            ('https://dictionary.cambridge.org/dictionary/english/' + encodeURIComponent(key))
        ),
        String(item.sourceArticle || '').trim(),
        String(item.savedDate || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')),
      ]);
      added += 1;
    }

    if (rowsToAppend.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToAppend.length, VOCAB_HEADERS.length).setValues(rowsToAppend);
    }

    return jsonOut({
      ok: true,
      status: added > 0 ? 'added' : 'duplicate',
      added,
      skipped,
      totalRows: sheet.getLastRow(),
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}`;
