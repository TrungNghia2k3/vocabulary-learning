// Keep in sync with apps-script/news-vocab-webhook.gs
export const APPS_SCRIPT_WEBHOOK_CODE = `/**
 * VocabStudio — Unified Google Apps Script Webhook (News Studio + Book Studio)
 */
const SECRET_TOKEN = ''; // Tùy chọn: đặt chuỗi bí mật nếu muốn
const BOOKS_FOLDER_ID = '1fgvQA13zN7k2Yh2PCvgzm7kuUlEHBno5'; // Thư mục "VocabStudio Books" trên Google Drive
const BOOKS_FOLDER_NAME = 'VocabStudio Books';

const NEWS_VOCAB_SHEET = 'News Vocab';
const BOOK_VOCAB_SHEET = 'Book Vocab';
const VIDEO_VOCAB_SHEET = 'Video Vocab';
const NEWS_SHEET = 'News';
const BOOKSHELF_SHEET = 'Bookshelf';

const NEWS_VOCAB_HEADERS = [
  'Word', 'Part of Speech', 'Phonetic', 'Meaning Vietnamese', 'Example', 'Topic', 'Cambridge', 'Source Article', 'Saved Date',
];
const BOOK_VOCAB_HEADERS = [
  'Word', 'Part of Speech', 'Phonetic', 'Meaning Vietnamese', 'Example', 'Topic', 'Page', 'Cambridge', 'Saved Date',
];
const VIDEO_VOCAB_HEADERS = [
  'Word', 'Part of Speech', 'Phonetic', 'Meaning Vietnamese', 'Example', 'Topic', 'Timestamp', 'Cambridge', 'Saved Date',
];
const BOOKSHELF_HEADERS = [
  'File ID', 'Title', 'Current Page', 'Total Pages', 'Bookmarks', 'Last Read', 'Source',
];

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers, bgHex) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground(bgHex || '#0F766E').setFontColor('#FFFFFF');
  }
  return sheet;
}

function getOrCreateBooksFolder() {
  if (BOOKS_FOLDER_ID) {
    try { return DriveApp.getFolderById(BOOKS_FOLDER_ID); } catch (e) {}
  }
  const it = DriveApp.getFoldersByName(BOOKS_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(BOOKS_FOLDER_NAME);
}

function doGet() {
  return jsonOut({ ok: true, service: 'VocabStudio Unified Webhook (News + Books)' });
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
      getOrCreateSheet(ss, NEWS_VOCAB_SHEET, NEWS_VOCAB_HEADERS, '#0F766E');
      getOrCreateSheet(ss, BOOK_VOCAB_SHEET, BOOK_VOCAB_HEADERS, '#1D4ED8');
      getOrCreateSheet(ss, BOOKSHELF_SHEET, BOOKSHELF_HEADERS, '#334155');
      let folderInfo = { id: BOOKS_FOLDER_ID, name: BOOKS_FOLDER_NAME, url: '' };
      try {
        const folder = getOrCreateBooksFolder();
        folderInfo = { id: folder.getId(), name: folder.getName(), url: folder.getUrl() };
      } catch (driveErr) {}
      return jsonOut({
        ok: true, status: 'connected', spreadsheetName: ss.getName(),
        sheetName: NEWS_VOCAB_SHEET, bookVocabSheet: BOOK_VOCAB_SHEET, booksFolder: folderInfo,
      });
    }

    if (action === 'list_drive_books') {
      const folder = getOrCreateBooksFolder();
      const shelfSheet = getOrCreateSheet(ss, BOOKSHELF_SHEET, BOOKSHELF_HEADERS, '#334155');
      const progressMap = {};
      const shelfLastRow = shelfSheet.getLastRow();
      if (shelfLastRow >= 2) {
        const rows = shelfSheet.getRange(2, 1, shelfLastRow - 1, BOOKSHELF_HEADERS.length).getValues();
        rows.forEach((r) => {
          const fid = String(r[0] || '').trim();
          if (!fid) return;
          const bms = String(r[4] || '').split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
          progressMap[fid] = {
            title: String(r[1] || '').trim(), currentPage: parseInt(r[2], 10) || 1,
            totalPages: parseInt(r[3], 10) || 0, bookmarks: bms, lastRead: String(r[5] || '').trim(),
          };
        });
      }
      const books = [];
      const files = folder.getFilesByType(MimeType.PDF);
      while (files.hasNext()) {
        const f = files.next();
        const fid = f.getId();
        const fileName = f.getName();
        const prog = progressMap[fid] || {};
        books.push({
          fileId: fid, fileName: fileName, title: prog.title || fileName.replace(/\\.pdf$/i, ''),
          sizeBytes: f.getSize(), updatedAt: f.getLastUpdated().toISOString(), webViewLink: f.getUrl(),
          currentPage: prog.currentPage || 1, totalPages: prog.totalPages || 0,
          bookmarks: prog.bookmarks || [], lastRead: prog.lastRead || '',
        });
      }
      books.sort((a, b) => {
        const ta = a.lastRead ? new Date(a.lastRead).getTime() : 0;
        const tb = b.lastRead ? new Date(b.lastRead).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      return jsonOut({ ok: true, folderId: folder.getId(), folderName: folder.getName(), folderUrl: folder.getUrl(), books: books });
    }

    if (action === 'get_pdf_chunk') {
      const fileId = String(payload.fileId || '').trim();
      if (!fileId) return jsonOut({ ok: false, error: 'Thiếu fileId của sách PDF.' });
      const file = DriveApp.getFileById(fileId);
      if (file.getSize() > 46 * 1024 * 1024) {
        return jsonOut({ ok: false, error: 'File PDF lớn hơn 46 MB vượt giới hạn Apps Script. Hãy mở trực tiếp từ máy hoặc nén nhẹ PDF trước.' });
      }
      const offset = Math.max(0, parseInt(payload.offset, 10) || 0);
      const chunkSize = Math.min(2000000, Math.max(256000, parseInt(payload.chunkSize, 10) || 1800000));
      const allBytes = file.getBlob().getBytes();
      const totalBytes = allBytes.length;
      const end = Math.min(totalBytes, offset + chunkSize);
      const slice = allBytes.slice(offset, end);
      return jsonOut({
        ok: true, fileId: fileId, fileName: file.getName(), totalBytes: totalBytes,
        offset: offset, length: slice.length, hasMore: end < totalBytes, base64: Utilities.base64Encode(slice),
      });
    }

    if (action === 'save_book_progress') {
      const fileId = String(payload.fileId || '').trim();
      if (!fileId) return jsonOut({ ok: false, error: 'Thiếu fileId.' });
      const shelfSheet = getOrCreateSheet(ss, BOOKSHELF_SHEET, BOOKSHELF_HEADERS, '#334155');
      const title = String(payload.title || '').trim();
      const currentPage = Math.max(1, parseInt(payload.currentPage, 10) || 1);
      const totalPages = Math.max(0, parseInt(payload.totalPages, 10) || 0);
      const bookmarks = Array.isArray(payload.bookmarks)
        ? payload.bookmarks.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n > 0).join(', ')
        : String(payload.bookmarks || '').trim();
      const lastRead = new Date().toISOString();
      const source = String(payload.source || 'drive').trim();
      const lastRow = shelfSheet.getLastRow();
      let foundRow = -1;
      if (lastRow >= 2) {
        const ids = shelfSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
        const idx = ids.findIndex((id) => String(id || '').trim() === fileId);
        if (idx !== -1) foundRow = idx + 2;
      }
      const rowVals = [fileId, title, currentPage, totalPages, bookmarks, lastRead, source];
      if (foundRow !== -1) shelfSheet.getRange(foundRow, 1, 1, BOOKSHELF_HEADERS.length).setValues([rowVals]);
      else shelfSheet.appendRow(rowVals);
      return jsonOut({ ok: true, status: 'saved', fileId: fileId, currentPage: currentPage });
    }

    if (action === 'add_news_url') {
      const url = String(payload.url || '').trim();
      if (!url) return jsonOut({ ok: false, error: 'Thiếu URL bài báo.' });
      let newsSheet = ss.getSheetByName(NEWS_SHEET);
      if (!newsSheet) newsSheet = ss.insertSheet(NEWS_SHEET);
      const lastRow = newsSheet.getLastRow();
      if (lastRow >= 2) {
        const existingUrls = newsSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
        const dupIdx = existingUrls.findIndex((u) => String(u || '').trim() === url);
        if (dupIdx !== -1) return jsonOut({ ok: true, status: 'duplicate', row: dupIdx + 2 });
      }
      newsSheet.appendRow([
        url, String(payload.title || '').trim(), String(payload.source || '').trim(),
        String(payload.category || '').trim(), 'Pending', String(payload.publishedDate || '').trim(),
        '', '', '', '', String(payload.imageUrl || '').trim(),
      ]);
      return jsonOut({ ok: true, status: 'added', row: newsSheet.getLastRow() });
    }

    const targetSheetName = payload.targetSheet === BOOK_VOCAB_SHEET ? BOOK_VOCAB_SHEET : payload.targetSheet === VIDEO_VOCAB_SHEET ? VIDEO_VOCAB_SHEET : NEWS_VOCAB_SHEET;
    const isBookVocab = targetSheetName === BOOK_VOCAB_SHEET;
    const isVideoVocab = targetSheetName === VIDEO_VOCAB_SHEET;
    const headers = isBookVocab ? BOOK_VOCAB_HEADERS : isVideoVocab ? VIDEO_VOCAB_HEADERS : NEWS_VOCAB_HEADERS;
    const sheet = getOrCreateSheet(ss, targetSheetName, headers, isBookVocab ? '#1D4ED8' : isVideoVocab ? '#DC2626' : '#0F766E');
    const entries = Array.isArray(payload.entries) ? payload.entries : payload.entry ? [payload.entry] : [];
    if (!entries.length) return jsonOut({ ok: false, error: 'Không có từ vựng nào để lưu.' });

    const lastRow = sheet.getLastRow();
    const existingSet = new Set();
    if (lastRow >= 2) {
      sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().forEach((v) => {
        const k = String(v || '').trim().toLowerCase();
        if (k) existingSet.add(k);
      });
    }

    let added = 0, skipped = 0;
    const rowsToAppend = [];
    const todayStr = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');

    for (const item of entries) {
      const word = String(item.word || '').trim();
      if (!word) continue;
      const key = word.toLowerCase();
      if (existingSet.has(key)) { skipped += 1; continue; }
      existingSet.add(key);
      const cambridge = String(item.cambridgeUrl || ('https://dictionary.cambridge.org/dictionary/english/' + encodeURIComponent(key)));
      if (isBookVocab) {
        rowsToAppend.push([
          word, String(item.partOfSpeech || '').trim(), String(item.phonetic || '').trim(),
          String(item.meaning || '').trim(), String(item.example || '').trim(),
          String(item.topic || item.bookTitle || 'Book').trim(), String(item.page || '').trim(),
          cambridge, String(item.savedDate || todayStr),
        ]);
      } else if (isVideoVocab) {
        rowsToAppend.push([
          word, String(item.partOfSpeech || '').trim(), String(item.phonetic || '').trim(),
          String(item.meaning || '').trim(), String(item.example || '').trim(),
          String(item.topic || item.videoTitle || 'YouTube').trim(), String(item.timestamp || '').trim(),
          cambridge, String(item.savedDate || todayStr),
        ]);
      } else {
        rowsToAppend.push([
          word, String(item.partOfSpeech || '').trim(), String(item.phonetic || '').trim(),
          String(item.meaning || '').trim(), String(item.example || '').trim(),
          String(item.topic || 'News').trim(), cambridge,
          String(item.sourceArticle || '').trim(), String(item.savedDate || todayStr),
        ]);
      }
      added += 1;
    }

    if (rowsToAppend.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }

    return jsonOut({
      ok: true, status: added > 0 ? 'added' : 'duplicate',
      sheetName: targetSheetName, added: added, skipped: skipped, totalRows: sheet.getLastRow(),
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}`;
