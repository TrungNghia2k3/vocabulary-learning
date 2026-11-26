/**
 * VocabStudio — Unified Google Apps Script Webhook
 * Hỗ trợ cả News Studio (News Vocab + News) VÀ Book Studio (Book Vocab + Google Drive PDF + Bookshelf Progress)
 *
 * Cách cài đặt / cập nhật (mất ~1 phút):
 * 1. Mở Google Sheets "Vocabulary" -> Tiện ích mở rộng (Extensions) -> Apps Script.
 * 2. Xóa code cũ, dán toàn bộ file này vào -> Lưu (Ctrl+S).
 * 3. Bấm Triển khai (Deploy) -> Tùy chọn triển khai mới (New deployment):
 *    - Loại: Ứng dụng web (Web app)
 *    - Thực thi với tư cách: Tôi (Me)
 *    - Người có quyền truy cập: Bất kỳ ai (Anyone)
 *    - Cấp quyền Google Sheets & Google Drive -> Copy URL (/exec).
 * 4. Dán URL (/exec) vào mục "Kết nối Sheet" trong News Studio hoặc Book Studio
 *    (hoặc đặt biến môi trường NEWS_SHEET_WEBHOOK_URL trên Vercel/Netlify để mọi thiết bị tự dùng).
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

const BOOK_VOCAB_HEADERS = [
  'Word',
  'Part of Speech',
  'Phonetic',
  'Meaning Vietnamese',
  'Example',
  'Topic',
  'Page',
  'Cambridge',
  'Saved Date',
];

const VIDEO_VOCAB_HEADERS = [
  'Word',
  'Part of Speech',
  'Phonetic',
  'Meaning Vietnamese',
  'Example',
  'Topic',
  'Timestamp',
  'Cambridge',
  'Saved Date',
];

const BOOKSHELF_HEADERS = [
  'File ID',
  'Title',
  'Current Page',
  'Total Pages',
  'Bookmarks',
  'Last Read',
  'Source',
];

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers, bgHex) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground(bgHex || '#0F766E')
      .setFontColor('#FFFFFF');
  }
  return sheet;
}

function getOrCreateBooksFolder() {
  if (BOOKS_FOLDER_ID) {
    try {
      return DriveApp.getFolderById(BOOKS_FOLDER_ID);
    } catch (e) {
      // Fallback search by name
    }
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

    // 1. Ping & kiểm tra kết nối cả Sheets lẫn Drive Books folder
    if (action === 'ping') {
      getOrCreateSheet(ss, NEWS_VOCAB_SHEET, NEWS_VOCAB_HEADERS, '#0F766E');
      getOrCreateSheet(ss, BOOK_VOCAB_SHEET, BOOK_VOCAB_HEADERS, '#1D4ED8');
      getOrCreateSheet(ss, BOOKSHELF_SHEET, BOOKSHELF_HEADERS, '#334155');
      let folderInfo = { id: BOOKS_FOLDER_ID, name: BOOKS_FOLDER_NAME, url: '' };
      try {
        const folder = getOrCreateBooksFolder();
        folderInfo = { id: folder.getId(), name: folder.getName(), url: folder.getUrl() };
      } catch (driveErr) {
        // Drive scope not yet authorized
      }
      return jsonOut({
        ok: true,
        status: 'connected',
        spreadsheetName: ss.getName(),
        sheetName: NEWS_VOCAB_SHEET,
        bookVocabSheet: BOOK_VOCAB_SHEET,
        booksFolder: folderInfo,
      });
    }

    // 2. Lấy danh sách sách PDF từ Google Drive + ghép tiến độ đọc từ tab Bookshelf
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
          const bms = String(r[4] || '')
            .split(',')
            .map((x) => parseInt(x.trim(), 10))
            .filter((n) => !isNaN(n) && n > 0);
          progressMap[fid] = {
            title: String(r[1] || '').trim(),
            currentPage: parseInt(r[2], 10) || 1,
            totalPages: parseInt(r[3], 10) || 0,
            bookmarks: bms,
            lastRead: String(r[5] || '').trim(),
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
          fileId: fid,
          fileName: fileName,
          title: prog.title || fileName.replace(/\.pdf$/i, ''),
          sizeBytes: f.getSize(),
          updatedAt: f.getLastUpdated().toISOString(),
          webViewLink: f.getUrl(),
          currentPage: prog.currentPage || 1,
          totalPages: prog.totalPages || 0,
          bookmarks: prog.bookmarks || [],
          lastRead: prog.lastRead || '',
        });
      }

      books.sort((a, b) => {
        const ta = a.lastRead ? new Date(a.lastRead).getTime() : 0;
        const tb = b.lastRead ? new Date(b.lastRead).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

      return jsonOut({
        ok: true,
        folderId: folder.getId(),
        folderName: folder.getName(),
        folderUrl: folder.getUrl(),
        books: books,
      });
    }

    // 3. Tải từng mảnh (chunk 1.8MB) file PDF từ Google Drive (an toàn giới hạn Serverless, hỗ trợ file riêng tư)
    if (action === 'get_pdf_chunk') {
      const fileId = String(payload.fileId || '').trim();
      if (!fileId) return jsonOut({ ok: false, error: 'Thiếu fileId của sách PDF.' });
      const file = DriveApp.getFileById(fileId);
      const size = file.getSize();
      if (size > 46 * 1024 * 1024) {
        return jsonOut({
          ok: false,
          error: 'File PDF lớn hơn 46 MB vượt giới hạn Apps Script. Hãy mở trực tiếp từ máy hoặc nén nhẹ PDF trước.',
        });
      }
      const offset = Math.max(0, parseInt(payload.offset, 10) || 0);
      const chunkSize = Math.min(2000000, Math.max(256000, parseInt(payload.chunkSize, 10) || 1800000));
      const allBytes = file.getBlob().getBytes();
      const totalBytes = allBytes.length;
      const end = Math.min(totalBytes, offset + chunkSize);
      const slice = allBytes.slice(offset, end);
      const b64 = Utilities.base64Encode(slice);

      return jsonOut({
        ok: true,
        fileId: fileId,
        fileName: file.getName(),
        totalBytes: totalBytes,
        offset: offset,
        length: slice.length,
        hasMore: end < totalBytes,
        base64: b64,
      });
    }

    // 4. Lưu tiến độ đọc & Bookmark xuyên thiết bị vào tab Bookshelf
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
      if (foundRow !== -1) {
        shelfSheet.getRange(foundRow, 1, 1, BOOKSHELF_HEADERS.length).setValues([rowVals]);
      } else {
        shelfSheet.appendRow(rowVals);
      }

      return jsonOut({ ok: true, status: 'saved', fileId: fileId, currentPage: currentPage });
    }

    // 4b. Dự phòng lấy phụ đề YouTube qua Google Apps Script (khi Vercel/Netlify bị YouTube chặn IP)
    if (action === 'fetch_yt_transcript') {
      const videoId = String(payload.videoId || '').trim();
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        return jsonOut({ ok: false, error: 'Video ID không hợp lệ.' });
      }
      const watchResp = UrlFetchApp.fetch('https://www.youtube.com/watch?v=' + videoId + '&hl=en', {
        muteHttpExceptions: true,
        headers: { 'Accept-Language': 'en-US,en;q=0.9' },
      });
      const html = watchResp.getContentText() || '';
      const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      if (!keyMatch) {
        return jsonOut({ ok: true, hasTranscript: false, cues: [] });
      }
      const apiKey = keyMatch[1];
      const iosUa = 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)';
      const playerResp = UrlFetchApp.fetch(
        'https://www.youtube.com/youtubei/v1/player?key=' + encodeURIComponent(apiKey) + '&prettyPrint=false',
        {
          method: 'post',
          contentType: 'application/json',
          muteHttpExceptions: true,
          headers: { 'User-Agent': iosUa },
          payload: JSON.stringify({
            videoId: videoId,
            context: { client: { clientName: 'IOS', clientVersion: '20.10.4', hl: 'en', gl: 'US' } },
          }),
        }
      );
      const pJson = JSON.parse(playerResp.getContentText() || '{}');
      const tracks = (pJson.captions && pJson.captions.playerCaptionsTracklistRenderer && pJson.captions.playerCaptionsTracklistRenderer.captionTracks) || [];
      let enTrack = null;
      for (let i = 0; i < tracks.length; i++) {
        if (/^en(-[A-Za-z]+)?$/i.test(tracks[i].languageCode) && tracks[i].kind !== 'asr') { enTrack = tracks[i]; break; }
      }
      if (!enTrack) {
        for (let i = 0; i < tracks.length; i++) {
          if (/^en/i.test(tracks[i].languageCode)) { enTrack = tracks[i]; break; }
        }
      }
      if (!enTrack || !enTrack.baseUrl) {
        return jsonOut({ ok: true, hasTranscript: false, cues: [] });
      }
      const xmlResp = UrlFetchApp.fetch(enTrack.baseUrl, { muteHttpExceptions: true, headers: { 'User-Agent': iosUa } });
      const xml = xmlResp.getContentText() || '';
      const cues = [];
      const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
      let m;
      while ((m = re.exec(xml)) !== null) {
        const attrs = m[1] || '';
        const sm = attrs.match(/start=["']([\d.]+)["']/i);
        const dm = attrs.match(/dur=["']([\d.]+)["']/i);
        const txt = (m[2] || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
        if (txt) {
          cues.push({
            start: sm ? parseFloat(sm[1]) : 0,
            dur: dm ? parseFloat(dm[1]) : 3,
            text: txt,
          });
        }
      }
      return jsonOut({
        ok: true,
        hasTranscript: cues.length > 0,
        isAutoGenerated: enTrack.kind === 'asr',
        cues: cues,
      });
    }

    // 5. Thêm link bài báo mới vào tab News (Status = Pending)
    if (action === 'add_news_url') {
      const url = String(payload.url || '').trim();
      const title = String(payload.title || '').trim();
      const source = String(payload.source || '').trim();
      const category = String(payload.category || '').trim();
      const publishedDate = String(payload.publishedDate || '').trim();
      const imageUrl = String(payload.imageUrl || '').trim();

      if (!url) return jsonOut({ ok: false, error: 'Thiếu URL bài báo.' });

      let newsSheet = ss.getSheetByName(NEWS_SHEET);
      if (!newsSheet) newsSheet = ss.insertSheet(NEWS_SHEET);
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

    // 6. Lưu từ vựng 1-click vào tab News Vocab, Book Vocab hoặc Video Vocab
    const targetSheetName =
      payload.targetSheet === BOOK_VOCAB_SHEET
        ? BOOK_VOCAB_SHEET
        : payload.targetSheet === VIDEO_VOCAB_SHEET
          ? VIDEO_VOCAB_SHEET
          : NEWS_VOCAB_SHEET;
    const isBookVocab = targetSheetName === BOOK_VOCAB_SHEET;
    const isVideoVocab = targetSheetName === VIDEO_VOCAB_SHEET;
    const headers = isBookVocab
      ? BOOK_VOCAB_HEADERS
      : isVideoVocab
        ? VIDEO_VOCAB_HEADERS
        : NEWS_VOCAB_HEADERS;
    const headerBg = isBookVocab ? '#1D4ED8' : isVideoVocab ? '#DC2626' : '#0F766E';
    const sheet = getOrCreateSheet(ss, targetSheetName, headers, headerBg);

    const entries = Array.isArray(payload.entries)
      ? payload.entries
      : payload.entry
        ? [payload.entry]
        : [];

    if (!entries.length) {
      return jsonOut({ ok: false, error: 'Không có từ vựng nào để lưu.' });
    }

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
    const todayStr = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');

    for (const item of entries) {
      const word = String(item.word || '').trim();
      if (!word) continue;
      const key = word.toLowerCase();
      if (existingSet.has(key)) {
        skipped += 1;
        continue;
      }
      existingSet.add(key);

      const cambridge = String(
        item.cambridgeUrl ||
          ('https://dictionary.cambridge.org/dictionary/english/' + encodeURIComponent(key))
      );

      if (isBookVocab) {
        rowsToAppend.push([
          word,
          String(item.partOfSpeech || '').trim(),
          String(item.phonetic || '').trim(),
          String(item.meaning || '').trim(),
          String(item.example || '').trim(),
          String(item.topic || item.bookTitle || 'Book').trim(),
          String(item.page || '').trim(),
          cambridge,
          String(item.savedDate || todayStr),
        ]);
      } else if (isVideoVocab) {
        rowsToAppend.push([
          word,
          String(item.partOfSpeech || '').trim(),
          String(item.phonetic || '').trim(),
          String(item.meaning || '').trim(),
          String(item.example || '').trim(),
          String(item.topic || item.videoTitle || 'YouTube').trim(),
          String(item.timestamp || '').trim(),
          cambridge,
          String(item.savedDate || todayStr),
        ]);
      } else {
        rowsToAppend.push([
          word,
          String(item.partOfSpeech || '').trim(),
          String(item.phonetic || '').trim(),
          String(item.meaning || '').trim(),
          String(item.example || '').trim(),
          String(item.topic || 'News').trim(),
          cambridge,
          String(item.sourceArticle || '').trim(),
          String(item.savedDate || todayStr),
        ]);
      }
      added += 1;
    }

    if (rowsToAppend.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }

    return jsonOut({
      ok: true,
      status: added > 0 ? 'added' : 'duplicate',
      sheetName: targetSheetName,
      added: added,
      skipped: skipped,
      totalRows: sheet.getLastRow(),
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
