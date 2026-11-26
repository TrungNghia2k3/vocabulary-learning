import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import {
  ArrowLeft,
  BookMarked,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudDownload,
  CloudOff,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  HardDrive,
  Highlighter,
  Languages,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Square,
  TextSelect,
  Trash2,
  Upload,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Accent, VocabItem } from '../types';
import { speakParagraphQueue, speakText, stopSpeaking } from '../utils/speech';
import { getUrlIntParam, getUrlParam, syncUrlParams } from '../utils/urlParams';
import { APPS_SCRIPT_WEBHOOK_CODE } from '../utils/appsScriptTemplate';
import {
  cleanPhraseText,
  getCambridgeUrl,
  getSelectedPhraseFromWindow,
  lookupTermOnline,
  type ReaderLookupResult,
} from '../utils/readerLookup';
import { ReaderLookupDrawer } from './ReaderLookupDrawer';
import {
  BOOKS_DRIVE_FOLDER_URL,
  base64ToUint8Array,
  deleteCachedBook,
  getBookPdfBytes,
  listCachedBooks,
  loadSharedWebhookConfig,
  saveBookToCache,
  saveSharedWebhookConfig,
  updateCachedBookProgress,
  type CachedBookMeta,
} from '../utils/bookStorage';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface BookStudioViewProps {
  allVocab: VocabItem[];
  accent: Accent;
}

type ReaderMode = 'smart' | 'pdf';

interface SavedBookWord {
  word: string;
  partOfSpeech?: string;
  phonetic?: string;
  meaning: string;
  context: string;
  bookTitle: string;
  page: number;
  savedAt: string;
  syncStatus?: 'synced' | 'syncing' | 'local' | 'error';
  syncError?: string;
}

interface DriveBookApiItem {
  fileId: string;
  fileName: string;
  title: string;
  sizeBytes: number;
  updatedAt: string;
  webViewLink?: string;
  currentPage: number;
  totalPages: number;
  bookmarks: number[];
  lastRead: string;
}

const SAVED_BOOK_WORDS_KEY = 'vocabStudio:bookSavedWords:v1';

const COMMON_STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'almost', 'alone', 'along', 'already', 'also',
  'although', 'always', 'among', 'another', 'around', 'because', 'become', 'been', 'before',
  'being', 'below', 'between', 'both', 'bring', 'built', 'called', 'cannot', 'come', 'could',
  'does', 'doing', 'done', 'down', 'during', 'each', 'early', 'either', 'else', 'even', 'ever',
  'every', 'first', 'found', 'from', 'give', 'given', 'going', 'good', 'great', 'have', 'having',
  'here', 'high', 'however', 'into', 'just', 'keep', 'know', 'known', 'large', 'last', 'later',
  'least', 'less', 'like', 'likely', 'little', 'long', 'look', 'made', 'make', 'making', 'many',
  'might', 'more', 'most', 'much', 'must', 'near', 'need', 'never', 'next', 'none', 'nothing',
  'often', 'once', 'only', 'open', 'other', 'others', 'over', 'part', 'people', 'place', 'point',
  'public', 'quite', 'rather', 'really', 'right', 'said', 'same', 'says', 'second', 'seem',
  'seen', 'several', 'shall', 'should', 'show', 'shown', 'since', 'small', 'some', 'someone',
  'something', 'soon', 'still', 'such', 'take', 'taken', 'taking', 'tell', 'than', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things', 'think', 'this', 'those',
  'though', 'three', 'through', 'time', 'today', 'together', 'told', 'took', 'toward', 'towards',
  'turn', 'under', 'until', 'upon', 'used', 'using', 'very', 'want', 'water', 'well', 'went',
  'were', 'what', 'when', 'where', 'whether', 'which', 'while', 'white', 'whole', 'whom', 'whose',
  'will', 'with', 'within', 'without', 'word', 'work', 'world', 'would', 'year', 'years', 'your',
]);

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, '')
    .trim();
}

function getCandidateLemmas(word: string): string[] {
  const w = normalizeToken(word);
  if (!w) return [];
  const out = [w];
  if (w.endsWith('ies') && w.length > 4) out.push(w.slice(0, -3) + 'y');
  if (w.endsWith('ied') && w.length > 4) out.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es') && w.length > 4) out.push(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 4) out.push(w.slice(0, -1));
  if (w.endsWith('ed') && w.length > 4) {
    out.push(w.slice(0, -2));
    out.push(w.slice(0, -1));
  }
  if (w.endsWith('ing') && w.length > 5) {
    out.push(w.slice(0, -3));
    out.push(w.slice(0, -3) + 'e');
  }
  if (w.endsWith('ly') && w.length > 5) out.push(w.slice(0, -2));
  return out;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadSavedBookWords(): SavedBookWord[] {
  try {
    const raw = localStorage.getItem(SAVED_BOOK_WORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedBookWords(words: SavedBookWord[]): void {
  try {
    localStorage.setItem(SAVED_BOOK_WORDS_KEY, JSON.stringify(words));
  } catch {
    // Ignore quota issues
  }
}

/**
 * Reconstruct clean readable paragraphs from PDF.js text items on a single page.
 * Handles line-break hyphenation and detects vertical paragraph spacing.
 */
async function extractParagraphsFromPage(page: PDFPageProxy): Promise<string[]> {
  const textContent = await page.getTextContent();
  interface TextChunk {
    str: string;
    x: number;
    y: number;
    h: number;
  }

  const items: TextChunk[] = [];
  for (const raw of textContent.items) {
    if (!('str' in raw)) continue;
    const str = raw.str;
    if (!str || !str.trim()) continue;
    const tx = raw.transform || [1, 0, 0, 1, 0, 0];
    const x = Number(tx[4]) || 0;
    const y = Number(tx[5]) || 0;
    const h = Math.max(8, Math.abs(Number(raw.height) || Number(tx[0]) || 12));
    items.push({ str, x, y, h });
  }

  if (items.length === 0) return [];

  // Group into visual lines (top-to-bottom: higher Y first in PDF coordinates)
  items.sort((a, b) => {
    if (Math.abs(b.y - a.y) > Math.min(a.h, b.h) * 0.55) return b.y - a.y;
    return a.x - b.x;
  });

  interface VisualLine {
    y: number;
    h: number;
    text: string;
  }

  const lines: VisualLine[] = [];
  let curLineItems: TextChunk[] = [];
  let curY = items[0].y;
  let curH = items[0].h;

  const flushLine = () => {
    if (!curLineItems.length) return;
    curLineItems.sort((a, b) => a.x - b.x);
    let lineText = '';
    for (let i = 0; i < curLineItems.length; i++) {
      const part = curLineItems[i].str;
      if (i === 0) {
        lineText = part;
      } else {
        const needsSpace =
          !lineText.endsWith(' ') &&
          !lineText.endsWith('-') &&
          !part.startsWith(' ') &&
          !/^[.,;:!?)'"”’\]}]/.test(part);
        lineText += (needsSpace ? ' ' : '') + part;
      }
    }
    const cleaned = lineText.replace(/\s+/g, ' ').trim();
    if (cleaned) {
      lines.push({ y: curY, h: curH, text: cleaned });
    }
  };

  for (const item of items) {
    if (Math.abs(item.y - curY) <= Math.max(curH, item.h) * 0.55) {
      curLineItems.push(item);
      curH = Math.max(curH, item.h);
    } else {
      flushLine();
      curLineItems = [item];
      curY = item.y;
      curH = item.h;
    }
  }
  flushLine();

  if (lines.length === 0) return [];

  // Compute typical line spacing to detect paragraph breaks
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const g = lines[i - 1].y - lines[i].y;
    if (g > 4 && g < lines[i].h * 3.5) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 14;

  const paragraphs: string[] = [];
  let curPara = '';

  const appendToPara = (existing: string, nextLine: string): string => {
    if (!existing) return nextLine;
    // De-hyphenate wrapped English words like "inter-" + "esting"
    if (/[a-zA-Z]-$/.test(existing) && /^[a-z]/.test(nextLine)) {
      return existing.slice(0, -1) + nextLine;
    }
    return `${existing} ${nextLine}`;
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    // Skip standalone page number at top/bottom edge
    if ((i === 0 || i === lines.length - 1) && /^\d{1,4}$/.test(ln.text)) {
      continue;
    }
    if (i > 0) {
      const prev = lines[i - 1];
      const gap = prev.y - ln.y;
      const isHeadingJump = Math.abs(ln.h - prev.h) > 3;
      const isParaGap = gap > medianGap * 1.42;
      const prevLooksShortEnd = /[.!?"”’]$/.test(prev.text) && prev.text.length < 48;
      if ((isParaGap || isHeadingJump || prevLooksShortEnd) && curPara.trim()) {
        paragraphs.push(curPara.trim());
        curPara = '';
      }
    }
    curPara = appendToPara(curPara, ln.text);
  }
  if (curPara.trim()) paragraphs.push(curPara.trim());

  return paragraphs;
}

export function BookStudioView({ allVocab, accent }: BookStudioViewProps) {
  // --- Personal Vocab Index from Google Sheets (words + phrases!) ---
  const { vocabIndex, phraseVocabIndex } = useMemo(() => {
    const words = new Map<string, VocabItem>();
    const phrases = new Map<string, VocabItem>();
    for (const item of allVocab) {
      const cleaned = item.word
        .replace(/\([^)]*\)/g, '')
        .split(/[/,;]/)[0]
        .trim()
        .toLowerCase();
      if (!cleaned) continue;
      if (cleaned.includes(' ')) {
        if (!phrases.has(cleaned)) phrases.set(cleaned, item);
        continue;
      }
      if (cleaned.length < 4 || COMMON_STOPWORDS.has(cleaned)) continue;
      if (!words.has(cleaned)) words.set(cleaned, item);
    }
    return { vocabIndex: words, phraseVocabIndex: phrases };
  }, [allVocab]);

  const findSheetMatch = useCallback(
    (token: string): VocabItem | undefined => {
      const lower = cleanPhraseText(token).toLowerCase();
      if (!lower) return undefined;
      if (lower.includes(' ')) return phraseVocabIndex.get(lower);
      for (const candidate of getCandidateLemmas(lower)) {
        if (candidate.length < 4 || COMMON_STOPWORDS.has(candidate)) continue;
        const found = vocabIndex.get(candidate);
        if (found) return found;
      }
      return undefined;
    },
    [vocabIndex, phraseVocabIndex]
  );

  // --- Shared Apps Script Webhook (Google Drive + Sheets) ---
  const initialCfg = useMemo(() => loadSharedWebhookConfig(), []);
  const [webhookUrl, setWebhookUrl] = useState(initialCfg.url);
  const [webhookSecret, setWebhookSecret] = useState(initialCfg.secret);
  const [serverConfigured, setServerConfigured] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [testState, setTestState] = useState<{
    status: 'idle' | 'testing' | 'ok' | 'error';
    message?: string;
  }>({ status: 'idle' });
  const [driveFolderUrl, setDriveFolderUrl] = useState(BOOKS_DRIVE_FOLDER_URL);

  const isConnected = serverConfigured || Boolean(webhookUrl.trim());

  // --- Bookshelf State (Local IndexedDB + Google Drive) ---
  const [books, setBooks] = useState<CachedBookMeta[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [shelfSearch, setShelfSearch] = useState('');
  const [downloadingBookId, setDownloadingBookId] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number>(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // --- Active Reader State ---
  const [activeBook, setActiveBook] = useState<CachedBookMeta | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [pageInput, setPageInput] = useState<string>('1');
  const [readerMode, setReaderMode] = useState<ReaderMode>(() =>
    getUrlParam('view') === 'pdf' ? 'pdf' : 'smart'
  );
  const pendingUrlBookRef = useRef<{ bookId: string; page: number | null } | null>(
    (() => {
      const bookId = getUrlParam('book');
      if (!bookId) return null;
      return { bookId, page: getUrlIntParam('page') };
    })()
  );
  const [pageParagraphs, setPageParagraphs] = useState<string[]>([]);
  const [pageLoading, setPageLoading] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(17);
  const [pdfZoom, setPdfZoom] = useState<number>(1.2);
  const [highlightKnown, setHighlightKnown] = useState<boolean>(true);
  const [phraseMode, setPhraseMode] = useState<boolean>(false);
  const [phraseAnchor, setPhraseAnchor] = useState<{
    paraKey: string;
    wordIdx: number;
    word: string;
  } | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [speakingWord, setSpeakingWord] = useState<{ paraKey: string; wordIdx: number } | null>(null);
  const [paraTranslations, setParaTranslations] = useState<Record<number, string>>({});
  const [translatingIdx, setTranslatingIdx] = useState<number | null>(null);
  const [progressSyncStatus, setProgressSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const [manualWordInput, setManualWordInput] = useState<string>('');

  // --- Word & Phrase Lookup & Saved Book Words ---
  const [lookup, setLookup] = useState<ReaderLookupResult | null>(null);
  const [savedWords, setSavedWords] = useState<SavedBookWord[]>(() => loadSavedBookWords());
  const [savedDrawerOpen, setSavedDrawerOpen] = useState<boolean>(false);
  const [batchSyncing, setBatchSyncing] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop speech & clean up on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (progressTimerRef.current) window.clearTimeout(progressTimerRef.current);
    };
  }, []);

  // Check server-side env webhook + load IndexedDB cache on mount
  const refreshLocalAndDriveBooks = useCallback(
    async (canFetchDrive: boolean, overrideUrl?: string, overrideSecret?: string) => {
      let cached: CachedBookMeta[] = [];
      try {
        cached = await listCachedBooks();
      } catch {
        cached = [];
      }
      setBooks(cached);

      if (!canFetchDrive) return;

      setDriveLoading(true);
      setDriveError(null);
      try {
        const res = await fetch('/api/save-vocab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'list_drive_books',
            webhookUrl: (overrideUrl ?? webhookUrl).trim() || undefined,
            secret: (overrideSecret ?? webhookSecret).trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        if (data.folderUrl) setDriveFolderUrl(data.folderUrl);

        const driveItems = (Array.isArray(data.books) ? data.books : []) as DriveBookApiItem[];
        const cachedById = new Map(cached.map((c) => [c.id, c]));
        const merged: CachedBookMeta[] = [];
        const seenIds = new Set<string>();

        for (const item of driveItems) {
          const id = `drive::${item.fileId}`;
          seenIds.add(id);
          const local = cachedById.get(id);
          // Pick whichever progress was updated more recently between Drive Bookshelf and local cache
          const remoteTs = item.lastRead ? new Date(item.lastRead).getTime() : 0;
          const localTs = local?.lastReadAt ? new Date(local.lastReadAt).getTime() : 0;
          const useRemote = remoteTs >= localTs;

          const entry: CachedBookMeta = {
            id,
            source: 'drive',
            driveFileId: item.fileId,
            title: item.title || item.fileName.replace(/\.pdf$/i, ''),
            fileName: item.fileName,
            sizeBytes: item.sizeBytes,
            currentPage: useRemote ? item.currentPage || 1 : local?.currentPage || 1,
            totalPages: item.totalPages || local?.totalPages || 0,
            bookmarks: useRemote ? item.bookmarks || [] : local?.bookmarks || [],
            lastReadAt: useRemote
              ? item.lastRead || item.updatedAt
              : local?.lastReadAt || item.updatedAt,
            addedAt: local?.addedAt || item.updatedAt,
            webViewLink: item.webViewLink,
            hasLocalPdf: Boolean(local?.hasLocalPdf),
          };
          merged.push(entry);
          // Sync merged metadata into IndexedDB (keeps existing pdfBuffer if any)
          saveBookToCache(entry).catch(() => {});
        }

        // Keep local-only books too
        for (const c of cached) {
          if (!seenIds.has(c.id)) {
            merged.push(c);
          }
        }

        merged.sort((a, b) => new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime());
        setBooks(merged);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Không tải được danh sách sách Google Drive.';
        setDriveError(msg);
      } finally {
        setDriveLoading(false);
      }
    },
    [webhookUrl, webhookSecret]
  );

  useEffect(() => {
    let active = true;
    fetch('/api/save-vocab')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        const srv = Boolean(d && d.serverConfigured);
        setServerConfigured(srv);
        refreshLocalAndDriveBooks(srv || Boolean(webhookUrl.trim()));
      })
      .catch(() => {
        if (!active) return;
        refreshLocalAndDriveBooks(Boolean(webhookUrl.trim()));
      });
    return () => {
      active = false;
    };
  }, [refreshLocalAndDriveBooks, webhookUrl]);

  // --- Copy helper ---
  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  // --- Test & Save Apps Script Webhook ---
  const handleTestAndSaveWebhook = async () => {
    saveSharedWebhookConfig(webhookUrl, webhookSecret);
    setTestState({ status: 'testing', message: 'Đang kiểm tra kết nối Sheets & Google Drive...' });
    try {
      const res = await fetch('/api/save-vocab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ping',
          webhookUrl: webhookUrl.trim() || undefined,
          secret: webhookSecret.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      if (data.booksFolder?.url) setDriveFolderUrl(data.booksFolder.url);
      setTestState({
        status: 'ok',
        message: `Kết nối thành công! File “${data.spreadsheetName || 'Vocabulary'}” · Tab “Book Vocab” · Thư mục Drive “${data.booksFolder?.name || 'VocabStudio Books'}”.`,
      });
      refreshLocalAndDriveBooks(true, webhookUrl, webhookSecret);
    } catch (err) {
      setTestState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Không kết nối được tới Apps Script.',
      });
    }
  };

  // --- Add a Local PDF file directly from user's device ---
  const handleLocalFilePicked = async (file: File | null) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setDownloadError('Vui lòng chọn đúng định dạng file .pdf');
      return;
    }
    setDownloadError(null);
    try {
      const buf = await file.arrayBuffer();
      const slug = `${file.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${file.size}`;
      const id = `local::${slug}`;
      const now = new Date().toISOString();
      const meta: Omit<CachedBookMeta, 'hasLocalPdf'> = {
        id,
        source: 'local',
        title: file.name.replace(/\.pdf$/i, ''),
        fileName: file.name,
        sizeBytes: file.size,
        currentPage: 1,
        totalPages: 0,
        bookmarks: [],
        lastReadAt: now,
        addedAt: now,
      };
      await saveBookToCache(meta, buf);
      const updated = await listCachedBooks();
      setBooks(updated);
      const created = updated.find((b) => b.id === id) || { ...meta, hasLocalPdf: true };
      await openPdfWithBuffer(created, buf);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Không đọc được file PDF này.');
    }
  };

  // --- Load PDF bytes into PDF.js and open reader ---
  const openPdfWithBuffer = async (
    book: CachedBookMeta,
    arrayBuffer: ArrayBuffer,
    overridePage?: number | null
  ) => {
    stopSpeaking();
    setSpeakingKey(null);
    setSpeakingWord(null);
    setLookup(null);
    setParaTranslations({});
    setDownloadError(null);

    // Clone buffer because PDF.js transfers the Uint8Array to its worker
    const copy = new Uint8Array(arrayBuffer.slice(0));
    const loadingTask = pdfjsLib.getDocument({ data: copy });
    const doc = await loadingTask.promise;

    const requestedPage = overridePage && overridePage > 0 ? overridePage : book.currentPage || 1;
    const safePage = Math.min(Math.max(1, requestedPage), doc.numPages);
    const updatedBook: CachedBookMeta = {
      ...book,
      totalPages: doc.numPages,
      currentPage: safePage,
      lastReadAt: new Date().toISOString(),
      hasLocalPdf: true,
    };

    setPdfDoc(doc);
    setActiveBook(updatedBook);
    setTotalPages(doc.numPages);
    setCurrentPage(safePage);
    setPageInput(String(safePage));

    await updateCachedBookProgress(book.id, {
      totalPages: doc.numPages,
      currentPage: safePage,
      lastReadAt: updatedBook.lastReadAt,
    });
    setBooks((prev) => prev.map((b) => (b.id === book.id ? updatedBook : b)));
  };

  // --- Open Book (from IndexedDB cache or chunked download from Google Drive!) ---
  const handleOpenBook = async (book: CachedBookMeta, overridePage?: number | null) => {
    setDownloadError(null);
    const cachedBuf = await getBookPdfBytes(book.id);
    if (cachedBuf && cachedBuf.byteLength > 0) {
      try {
        await openPdfWithBuffer(book, cachedBuf, overridePage);
        return;
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : 'Không mở được file PDF đã lưu.');
        return;
      }
    }

    if (book.source !== 'drive' || !book.driveFileId) {
      setDownloadError('File PDF này chưa có dữ liệu trên máy. Hãy chọn lại file từ máy tính/điện thoại.');
      return;
    }

    if (!isConnected) {
      setSetupOpen(true);
      setDownloadError('Hãy kết nối Google Apps Script để tải sách từ Google Drive.');
      return;
    }

    // Download chunk-by-chunk (1.8 MB/chunk) so it works for large private PDFs under Vercel/Netlify limits
    setDownloadingBookId(book.id);
    setDownloadPercent(3);
    try {
      const chunks: Uint8Array[] = [];
      let offset = 0;
      let totalBytes = book.sizeBytes || 0;
      let hasMore = true;

      while (hasMore) {
        const res = await fetch('/api/save-vocab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_pdf_chunk',
            webhookUrl: webhookUrl.trim() || undefined,
            secret: webhookSecret.trim() || undefined,
            fileId: book.driveFileId,
            offset,
            chunkSize: 1800000,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        const bytes = base64ToUint8Array(data.base64 || '');
        chunks.push(bytes);
        offset += bytes.length;
        totalBytes = data.totalBytes || totalBytes || offset;
        hasMore = Boolean(data.hasMore) && bytes.length > 0;
        const pct = totalBytes > 0 ? Math.min(99, Math.round((offset / totalBytes) * 100)) : 50;
        setDownloadPercent(pct);
      }

      const full = new Uint8Array(offset);
      let cursor = 0;
      for (const c of chunks) {
        full.set(c, cursor);
        cursor += c.length;
      }

      const fullBuffer = full.buffer;
      await saveBookToCache(
        {
          ...book,
          sizeBytes: fullBuffer.byteLength,
          lastReadAt: new Date().toISOString(),
        },
        fullBuffer
      );
      setDownloadPercent(100);
      await openPdfWithBuffer(
        { ...book, sizeBytes: fullBuffer.byteLength, hasLocalPdf: true },
        fullBuffer,
        overridePage
      );
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : 'Không tải được file PDF từ Google Drive.'
      );
    } finally {
      setDownloadingBookId(null);
      setDownloadPercent(0);
    }
  };

  // Auto-open book & page from URL on F5 / shared link once books load
  useEffect(() => {
    const pending = pendingUrlBookRef.current;
    if (!pending || activeBook || downloadingBookId || !books.length) return;
    const found = books.find(
      (b) =>
        b.id === pending.bookId ||
        (b.driveFileId && b.driveFileId === pending.bookId) ||
        b.title.toLowerCase() === pending.bookId.toLowerCase()
    );
    if (found) {
      pendingUrlBookRef.current = null;
      handleOpenBook(found, pending.page);
    } else if (!driveLoading) {
      pendingUrlBookRef.current = null;
    }
  }, [books, driveLoading, activeBook, downloadingBookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep active book, current page & reader view synced into URL
  useEffect(() => {
    if (pendingUrlBookRef.current) return;
    if (activeBook) {
      syncUrlParams({
        book: activeBook.id,
        page: currentPage,
        view: readerMode !== 'smart' ? readerMode : null,
      });
    } else {
      syncUrlParams({});
    }
  }, [activeBook, currentPage, readerMode]);

  // --- Sync reading progress & bookmarks to IndexedDB + Google Sheets Bookshelf ---
  const persistBookProgress = useCallback(
    (book: CachedBookMeta, nextPage: number, nextTotal: number, nextBookmarks: number[]) => {
      const now = new Date().toISOString();
      updateCachedBookProgress(book.id, {
        currentPage: nextPage,
        totalPages: nextTotal,
        bookmarks: nextBookmarks,
        lastReadAt: now,
      }).catch(() => {});

      setBooks((prev) =>
        prev.map((b) =>
          b.id === book.id
            ? {
                ...b,
                currentPage: nextPage,
                totalPages: nextTotal,
                bookmarks: nextBookmarks,
                lastReadAt: now,
              }
            : b
        )
      );

      if (!isConnected) return;
      if (progressTimerRef.current) window.clearTimeout(progressTimerRef.current);

      setProgressSyncStatus('syncing');
      progressTimerRef.current = window.setTimeout(async () => {
        try {
          const res = await fetch('/api/save-vocab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save_book_progress',
              webhookUrl: webhookUrl.trim() || undefined,
              secret: webhookSecret.trim() || undefined,
              fileId: book.driveFileId || book.id,
              title: book.title,
              currentPage: nextPage,
              totalPages: nextTotal,
              bookmarks: nextBookmarks,
              source: book.source,
            }),
          });
          if (res.ok) setProgressSyncStatus('synced');
          else setProgressSyncStatus('idle');
        } catch {
          setProgressSyncStatus('idle');
        }
      }, 1200);
    },
    [isConnected, webhookUrl, webhookSecret]
  );

  // --- Extract text & optionally render PDF canvas whenever page or mode changes ---
  useEffect(() => {
    if (!pdfDoc || !activeBook) return;
    let cancelled = false;
    setPageLoading(true);
    setParaTranslations({});
    setPhraseAnchor(null);
    stopSpeaking();
    setSpeakingKey(null);
    setSpeakingWord(null);

    (async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        // Always extract text paragraphs so Smart Reader & word stats stay in sync
        const paras = await extractParagraphsFromPage(page);
        if (cancelled) return;
        setPageParagraphs(paras);

        // Render canvas if in Original PDF mode
        if (readerMode === 'pdf' && canvasRef.current) {
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
            } catch {
              // ignore
            }
          }
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const viewport = page.getViewport({ scale: pdfZoom * dpr });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
            canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
            const task = page.render({ canvasContext: ctx, viewport, canvas });
            renderTaskRef.current = task;
            await task.promise;
          }
        }
      } catch {
        // Ignore cancelled render tasks
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, activeBook?.id, currentPage, readerMode, pdfZoom]);

  const goToPage = useCallback(
    (target: number) => {
      if (!activeBook || totalPages <= 0) return;
      const clamped = Math.min(Math.max(1, target), totalPages);
      setCurrentPage(clamped);
      setPageInput(String(clamped));
      const updated = { ...activeBook, currentPage: clamped };
      setActiveBook(updated);
      persistBookProgress(updated, clamped, totalPages, updated.bookmarks);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [activeBook, totalPages, persistBookProgress]
  );

  // Keyboard arrow navigation in reader
  useEffect(() => {
    if (!activeBook) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') goToPage(currentPage + 1);
      if (e.key === 'ArrowLeft') goToPage(currentPage - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeBook, currentPage, goToPage]);

  const toggleBookmark = () => {
    if (!activeBook) return;
    const exists = activeBook.bookmarks.includes(currentPage);
    const nextBms = exists
      ? activeBook.bookmarks.filter((p) => p !== currentPage)
      : [...activeBook.bookmarks, currentPage].sort((a, b) => a - b);
    const updated = { ...activeBook, bookmarks: nextBms };
    setActiveBook(updated);
    persistBookProgress(updated, currentPage, totalPages, nextBms);
  };

  // --- Speech & Translation (with live word-by-word read-along highlight!) ---
  const clearSpeechState = () => {
    stopSpeaking();
    setSpeakingKey(null);
    setSpeakingWord(null);
  };

  const handleSpeakParagraph = (paraKey: string, text: string) => {
    if (speakingKey === paraKey) {
      clearSpeechState();
      return;
    }
    setSpeakingKey(paraKey);
    setSpeakingWord({ paraKey, wordIdx: 0 });
    speakText(text, accent, speechRate, {
      onWordChange: (wordIdx) => setSpeakingWord({ paraKey, wordIdx }),
      onEnd: () => {
        setSpeakingKey(null);
        setSpeakingWord(null);
      },
      onError: () => {
        setSpeakingKey(null);
        setSpeakingWord(null);
      },
    });
  };

  const handleSpeakPage = () => {
    if (speakingKey === 'book-page') {
      clearSpeechState();
      return;
    }
    if (!pageParagraphs.length) return;
    setSpeakingKey('book-page');
    speakParagraphQueue(
      pageParagraphs.map((text, idx) => ({ key: `book-${currentPage}-${idx}`, text })),
      accent,
      speechRate,
      {
        onItemStart: (paraKey) => {
          setSpeakingWord({ paraKey, wordIdx: 0 });
          const el = document.querySelector(`[data-book-para="${paraKey}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },
        onWordChange: (paraKey, wordIdx) => setSpeakingWord({ paraKey, wordIdx }),
        onComplete: () => {
          setSpeakingKey(null);
          setSpeakingWord(null);
        },
        onError: () => {
          setSpeakingKey(null);
          setSpeakingWord(null);
        },
      }
    );
  };

  const handleTranslateParagraph = async (idx: number, text: string) => {
    if (paraTranslations[idx]) {
      setParaTranslations((prev) => {
        const next = { ...prev };
        delete next[idx];
        return next;
      });
      return;
    }
    setTranslatingIdx(idx);
    try {
      const clipped = text.length > 480 ? text.slice(0, 480) : text;
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clipped)}&langpair=en|vi`
      );
      const json = await res.json();
      setParaTranslations((prev) => ({
        ...prev,
        [idx]: json?.responseData?.translatedText || 'Không dịch được đoạn này.',
      }));
    } catch {
      setParaTranslations((prev) => ({ ...prev, [idx]: 'Lỗi kết nối dịch nhanh.' }));
    } finally {
      setTranslatingIdx(null);
    }
  };

  // --- Tap-Any-Word OR Phrase Lookup ---
  const handleLookupTerm = async (
    rawTerm: string,
    contextSentence: string,
    rangeMeta?: {
      paraKey: string;
      wordStartIdx: number;
      wordEndIdx: number;
      paragraphWords: string[];
    }
  ) => {
    const cleaned = cleanPhraseText(rawTerm);
    if (!cleaned || cleaned.length < 2) return;

    const isPhrase = cleaned.includes(' ');
    const sheetMatch = findSheetMatch(cleaned);
    setLookup({
      raw: rawTerm,
      cleaned,
      isPhrase,
      contextSentence,
      paraKey: rangeMeta?.paraKey,
      wordStartIdx: rangeMeta?.wordStartIdx,
      wordEndIdx: rangeMeta?.wordEndIdx,
      paragraphWords: rangeMeta?.paragraphWords,
      loading: true,
      partOfSpeech: isPhrase ? 'phrase' : undefined,
      definitions: [],
      sheetMatch,
    });

    const result = await lookupTermOnline(cleaned);
    setLookup((prev) =>
      prev && prev.cleaned === cleaned
        ? {
            ...prev,
            loading: false,
            phonetic:
              result.phonetic || prev.sheetMatch?.phoneticUk || prev.sheetMatch?.phoneticUs,
            partOfSpeech: result.partOfSpeech || prev.sheetMatch?.partOfSpeech,
            definitions: result.definitions,
            viMeaning: result.viMeaning || prev.sheetMatch?.meaning,
            error: result.error,
          }
        : prev
    );
  };

  const handleExpandLookup = (dir: 'left' | 'right') => {
    if (
      !lookup ||
      !lookup.paragraphWords ||
      typeof lookup.wordStartIdx !== 'number' ||
      typeof lookup.wordEndIdx !== 'number' ||
      !lookup.paraKey
    ) {
      return;
    }
    const nextStart = dir === 'left' ? Math.max(0, lookup.wordStartIdx - 1) : lookup.wordStartIdx;
    const nextEnd =
      dir === 'right'
        ? Math.min(lookup.paragraphWords.length - 1, lookup.wordEndIdx + 1)
        : lookup.wordEndIdx;
    if (nextStart === lookup.wordStartIdx && nextEnd === lookup.wordEndIdx) return;
    const phrase = lookup.paragraphWords.slice(nextStart, nextEnd + 1).join(' ');
    handleLookupTerm(phrase, lookup.contextSentence, {
      paraKey: lookup.paraKey,
      wordStartIdx: nextStart,
      wordEndIdx: nextEnd,
      paragraphWords: lookup.paragraphWords,
    });
  };

  // --- Save Word / Phrase 1-Click Straight to "Book Vocab" Tab on Google Sheets ---
  const pushBookWordsToSheet = async (entries: SavedBookWord[]) => {
    const res = await fetch('/api/save-vocab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_vocab',
        targetSheet: 'Book Vocab',
        webhookUrl: webhookUrl.trim() || undefined,
        secret: webhookSecret.trim() || undefined,
        entries: entries.map((e) => ({
          word: e.word,
          partOfSpeech: e.partOfSpeech || '',
          phonetic: e.phonetic || '',
          meaning: e.meaning || '',
          example: e.context || '',
          topic: e.bookTitle || 'Book',
          page: e.page ? `p.${e.page}` : '',
          cambridgeUrl: getCambridgeUrl(e.word),
          savedDate: e.savedAt.slice(0, 10),
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  };

  const handleSaveWord = async (customMeaning?: string) => {
    if (!lookup) return;
    const entry: SavedBookWord = {
      word: lookup.cleaned,
      partOfSpeech: lookup.partOfSpeech || (lookup.isPhrase ? 'phrase' : undefined),
      phonetic: lookup.phonetic,
      meaning:
        (customMeaning && customMeaning.trim()) ||
        lookup.viMeaning ||
        lookup.sheetMatch?.meaning ||
        lookup.definitions[0]?.def ||
        '',
      context: lookup.contextSentence.slice(0, 220),
      bookTitle: activeBook?.title || 'Book',
      page: currentPage,
      savedAt: new Date().toISOString(),
      syncStatus: isConnected ? 'syncing' : 'local',
      syncError: undefined,
    };

    setSavedWords((prev) => {
      const exists = prev.some((w) => w.word.toLowerCase() === entry.word.toLowerCase());
      const next = exists
        ? prev.map((w) => (w.word.toLowerCase() === entry.word.toLowerCase() ? entry : w))
        : [entry, ...prev];
      persistSavedBookWords(next);
      return next;
    });

    if (!isConnected) return;

    try {
      await pushBookWordsToSheet([entry]);
      setSavedWords((prev) => {
        const next = prev.map((w) =>
          w.word.toLowerCase() === entry.word.toLowerCase()
            ? { ...w, syncStatus: 'synced' as const, syncError: undefined }
            : w
        );
        persistSavedBookWords(next);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi gửi lên Google Sheets';
      setSavedWords((prev) => {
        const next = prev.map((w) =>
          w.word.toLowerCase() === entry.word.toLowerCase()
            ? { ...w, syncStatus: 'error' as const, syncError: msg }
            : w
        );
        persistSavedBookWords(next);
        return next;
      });
    }
  };

  const handleBatchSyncWords = async () => {
    const unsynced = savedWords.filter((w) => w.syncStatus !== 'synced');
    if (!unsynced.length || !isConnected) return;
    setBatchSyncing(true);
    try {
      await pushBookWordsToSheet(unsynced);
      const set = new Set(unsynced.map((u) => u.word.toLowerCase()));
      setSavedWords((prev) => {
        const next = prev.map((w) =>
          set.has(w.word.toLowerCase())
            ? { ...w, syncStatus: 'synced' as const, syncError: undefined }
            : w
        );
        persistSavedBookWords(next);
        return next;
      });
    } catch (err) {
      setTestState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Không đẩy được từ lên Google Sheets.',
      });
      setSetupOpen(true);
    } finally {
      setBatchSyncing(false);
    }
  };

  const handleDeleteSavedWord = (word: string) => {
    setSavedWords((prev) => {
      const next = prev.filter((w) => w.word !== word);
      persistSavedBookWords(next);
      return next;
    });
  };

  const handleDeleteCachedBook = async (book: CachedBookMeta) => {
    await deleteCachedBook(book.id);
    if (book.source === 'drive') {
      // Keep book metadata on Drive list, just mark hasLocalPdf=false
      setBooks((prev) =>
        prev.map((b) => (b.id === book.id ? { ...b, hasLocalPdf: false } : b))
      );
    } else {
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
    }
  };

  // --- Interactive Paragraph Renderer (1-tap word, 2-tap phrase, or mouse drag-select) ---
  const renderInteractiveParagraph = (text: string, paraKey: string) => {
    const tokens = text.split(/(\s+)/);
    const paragraphWords = tokens.filter((t) => !/^\s+$/.test(t) && t.length > 0);
    let runningWordIdx = -1;

    const handleWordClick = (tok: string, wordIdx: number) => {
      if (getSelectedPhraseFromWindow()) return;

      if (phraseMode) {
        if (!phraseAnchor || phraseAnchor.paraKey !== paraKey) {
          setPhraseAnchor({ paraKey, wordIdx, word: cleanPhraseText(tok) || tok });
          return;
        }
        const start = Math.min(phraseAnchor.wordIdx, wordIdx);
        const end = Math.max(phraseAnchor.wordIdx, wordIdx);
        setPhraseAnchor(null);
        const phrase = paragraphWords.slice(start, end + 1).join(' ');
        handleLookupTerm(phrase, text, {
          paraKey,
          wordStartIdx: start,
          wordEndIdx: end,
          paragraphWords,
        });
        return;
      }

      handleLookupTerm(tok, text, {
        paraKey,
        wordStartIdx: wordIdx,
        wordEndIdx: wordIdx,
        paragraphWords,
      });
    };

    return (
      <span
        onMouseUp={() => {
          const selected = getSelectedPhraseFromWindow();
          if (selected) {
            setPhraseAnchor(null);
            handleLookupTerm(selected, text);
          }
        }}
      >
        {tokens.map((tok, idx) => {
          if (/^\s+$/.test(tok) || tok.length === 0) return <span key={idx}>{tok}</span>;
          runningWordIdx += 1;
          const myWordIdx = runningWordIdx;
          const cleaned = normalizeToken(tok);
          const isAnchor =
            phraseAnchor?.paraKey === paraKey && phraseAnchor.wordIdx === myWordIdx;
          const isSpokenWord =
            speakingWord?.paraKey === paraKey && speakingWord.wordIdx === myWordIdx;
          const isInActiveLookup =
            lookup?.paraKey === paraKey &&
            typeof lookup.wordStartIdx === 'number' &&
            typeof lookup.wordEndIdx === 'number' &&
            myWordIdx >= lookup.wordStartIdx &&
            myWordIdx <= lookup.wordEndIdx;

          if (cleaned.length < 1 && !phraseMode) {
            return (
              <span
                key={idx}
                className={
                  isSpokenWord
                    ? 'rounded-[3px] bg-amber-300 text-slate-950 ring-2 ring-amber-300/90 transition-colors duration-75 dark:bg-amber-400 dark:text-slate-950 dark:ring-amber-400/90'
                    : undefined
                }
              >
                {tok}
              </span>
            );
          }
          const matched = highlightKnown ? findSheetMatch(cleaned) : undefined;

          let cls =
            'cursor-pointer rounded px-0.5 transition-colors duration-75 hover:bg-blue-100/80 hover:text-blue-800 dark:hover:bg-blue-950/70 dark:hover:text-blue-200';
          if (isSpokenWord) {
            const weightCls = isInActiveLookup ? 'font-bold' : matched ? 'font-semibold' : '';
            cls = `cursor-pointer rounded bg-amber-300 px-0.5 ${weightCls} text-slate-950 ring-2 ring-amber-300/90 transition-colors duration-75 dark:bg-amber-400 dark:text-slate-950 dark:ring-amber-400/90`;
          } else if (isAnchor) {
            cls =
              'cursor-pointer rounded bg-violet-600 px-0.5 font-bold text-white ring-2 ring-violet-300 transition-colors';
          } else if (isInActiveLookup) {
            cls =
              'cursor-pointer rounded bg-violet-100 px-0.5 font-bold text-violet-900 underline decoration-violet-400 underline-offset-4 dark:bg-violet-900/70 dark:text-violet-100';
          } else if (matched) {
            cls =
              'cursor-pointer rounded bg-emerald-100/80 px-0.5 font-semibold text-emerald-900 underline decoration-emerald-400/80 decoration-dotted underline-offset-4 hover:bg-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-200 dark:hover:bg-emerald-900';
          }

          return (
            <span
              key={idx}
              role="button"
              tabIndex={0}
              onClick={() => handleWordClick(tok, myWordIdx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleWordClick(tok, myWordIdx);
                }
              }}
              title={
                phraseMode
                  ? phraseAnchor?.paraKey === paraKey
                    ? 'Chạm để kết thúc cụm từ tại đây'
                    : 'Chạm để chọn từ đầu tiên của cụm'
                  : matched
                    ? `Từ đã có trong Sheet "${matched.deck}": ${matched.meaning}`
                    : 'Chạm tra 1 từ (hoặc bôi đen nhiều từ để tra cả cụm)'
              }
              className={cls}
            >
              {tok}
            </span>
          );
        })}
      </span>
    );
  };

  const pageMatchedCount = useMemo(() => {
    const found = new Set<string>();
    for (const p of pageParagraphs) {
      for (const tok of p.split(/\s+/)) {
        const m = findSheetMatch(tok);
        if (m) found.add(m.word.toLowerCase());
      }
    }
    return found.size;
  }, [pageParagraphs, findSheetMatch]);

  const filteredBooks = useMemo(() => {
    const q = shelfSearch.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) => b.title.toLowerCase().includes(q) || b.fileName.toLowerCase().includes(q)
    );
  }, [books, shelfSearch]);

  const unsyncedWordCount = savedWords.filter((w) => w.syncStatus !== 'synced').length;
  const activeSavedEntry = lookup
    ? savedWords.find((w) => w.word.toLowerCase() === lookup.cleaned.toLowerCase())
    : undefined;

  return (
    <div className="space-y-4">
      {/* Hidden local PDF file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          handleLocalFilePicked(e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />

      {/* Top Mobile-First Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs">
                <BookOpen className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-extrabold text-slate-900 dark:text-white">
                  Book Studio (Đọc sách PDF)
                </h2>
                <p className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">
                  Đồng bộ PDF từ Google Drive “VocabStudio Books” · Chạm tra từ · Tự nhớ trang giữa Máy tính & Điện thoại.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
              <button
                type="button"
                onClick={() => setSetupOpen((o) => !o)}
                className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1.5 text-xs font-bold ${
                  isConnected
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
              >
                {isConnected ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setSavedDrawerOpen((o) => !o)}
                className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold ${
                  savedDrawerOpen
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <BookMarked className="h-3.5 w-3.5" />
                <span>{savedWords.length}</span>
              </button>
            </div>
          </div>

          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:overflow-visible">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-white shadow-xs hover:bg-blue-700"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Mở PDF từ máy</span>
            </button>

            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="Mở thư mục VocabStudio Books trên Google Drive để thả file PDF vào"
            >
              <FolderOpen className="h-3.5 w-3.5 text-blue-600" />
              <span>Thư mục Drive</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>

            <button
              type="button"
              onClick={() => setSetupOpen((o) => !o)}
              className={`hidden shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold whitespace-nowrap sm:inline-flex ${
                isConnected
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
              }`}
            >
              {isConnected ? (
                <>
                  <Cloud className="h-3.5 w-3.5" />
                  <span>Drive & Sheet</span>
                </>
              ) : (
                <>
                  <Settings2 className="h-3.5 w-3.5" />
                  <span>Kết nối Drive & Sheet</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSavedDrawerOpen((o) => !o)}
              className={`hidden shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold whitespace-nowrap sm:inline-flex ${
                savedDrawerOpen
                  ? 'border-blue-500 bg-blue-600 text-white shadow-xs'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <BookMarked className="h-3.5 w-3.5" />
              <span>Sổ từ sách ({savedWords.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Google Drive & Sheets Setup Panel */}
      {setupOpen && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-xs dark:border-blue-900/60 dark:bg-blue-950/20">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-blue-900 dark:text-blue-200">
                <Cloud className="h-4 w-4 text-blue-600" />
                Kết nối Google Drive (“VocabStudio Books”) & Google Sheets (“Book Vocab”)
              </h3>
              <p className="mt-0.5 text-xs text-blue-800/80 dark:text-blue-300/80">
                Dùng chung 1 Google Apps Script duy nhất cho cả <strong>News Studio</strong> và{' '}
                <strong>Book Studio</strong>. Nếu bạn đã cài bản cũ cho News Studio, chỉ cần dán đè bản mới này rồi tạo bản triển khai mới để cấp thêm quyền đọc Google Drive!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSetupOpen(false)}
              className="rounded-lg p-1 text-slate-500 hover:bg-white/60 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-blue-200/80 bg-white p-3.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <div className="flex items-center justify-between gap-2">
                <p className="font-extrabold text-slate-900 dark:text-white">
                  Cập nhật / Cài đặt Apps Script (gồm Drive + Sheets):
                </p>
                <button
                  type="button"
                  onClick={() => handleCopyText('book-apps-script', APPS_SCRIPT_WEBHOOK_CODE)}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-700 dark:bg-blue-600"
                >
                  {copiedKey === 'book-apps-script' ? (
                    <>
                      <Check className="h-3 w-3" /> Đã chép code!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Sao chép mã mới
                    </>
                  )}
                </button>
              </div>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>
                  Thả các file PDF sách tiếng Anh vào thư mục Drive{' '}
                  <a
                    href={driveFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-blue-600 underline"
                  >
                    VocabStudio Books
                  </a>
                  .
                </li>
                <li>
                  Mở Google Sheets <strong>Vocabulary</strong> → <strong>Extensions → Apps Script</strong> → dán đè mã vừa chép → <strong>Lưu</strong>.
                </li>
                <li>
                  Bấm <strong>Deploy → Manage deployments → Edit (icon bút chì) → Version: New version → Deploy</strong> (cấp thêm quyền Google Drive nếu Google hỏi) — URL <code>/exec</code> giữ nguyên!
                </li>
                <li>Dán URL <code>/exec</code> vào ô bên cạnh (hoặc biến môi trường <code>NEWS_SHEET_WEBHOOK_URL</code> trên Vercel/Netlify).</li>
              </ol>
            </div>

            <div className="space-y-2.5 rounded-xl border border-blue-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Google Apps Script Web App URL (/exec)
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Mã bảo mật Secret (tùy chọn)
                </label>
                <input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="Để trống nếu không đặt SECRET_TOKEN"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTestAndSaveWebhook}
                  disabled={testState.status === 'testing'}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {testState.status === 'testing' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span>Kiểm tra & Lưu kết nối</span>
                </button>
              </div>
              {testState.message && (
                <p
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    testState.status === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : testState.status === 'error'
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {testState.message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Saved Book Words Drawer */}
      {savedDrawerOpen && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-xs dark:border-blue-900/60 dark:bg-blue-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-blue-900 dark:text-blue-200">
                <BookMarked className="h-4 w-4 text-blue-600" />
                Sổ từ sách ({savedWords.length} từ)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tự động đồng bộ vào tab <code>Book Vocab</code> trên Google Sheets (nhóm theo tên từng cuốn sách).
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isConnected && unsyncedWordCount > 0 && (
                <button
                  type="button"
                  onClick={handleBatchSyncWords}
                  disabled={batchSyncing}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {batchSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5" />
                  )}
                  <span>Đẩy {unsyncedWordCount} từ lên Sheet</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSavedDrawerOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-white/60 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {savedWords.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Chưa có từ nào. Khi đọc sách, hãy chạm vào bất kỳ từ nào rồi bấm{' '}
              <strong>Lưu thẳng Book Vocab</strong>.
            </p>
          ) : (
            <div className="mt-3 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {savedWords.map((sw) => (
                <div
                  key={sw.word}
                  className="rounded-xl border border-blue-200/70 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {sw.word}
                      </span>
                      {sw.phonetic && (
                        <span className="text-[11px] text-slate-400">{sw.phonetic}</span>
                      )}
                      {sw.syncStatus === 'synced' && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          Đã lên Sheet ✓
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => speakText(sw.word, accent, 0.9)}
                        className="rounded-lg p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedWord(sw.word)}
                        className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    {sw.meaning}
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                    {sw.bookTitle} · trang {sw.page}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] italic text-slate-500 dark:text-slate-400">
                    “{sw.context}”
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== VIEW 1: BOOKSHELF ==================== */}
      {!activeBook && (
        <div className="space-y-4">
          {/* Shelf Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={shelfSearch}
                onChange={(e) => setShelfSearch(e.target.value)}
                placeholder="Tìm tên sách trên kệ..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center gap-2">
              {isConnected && (
                <button
                  type="button"
                  onClick={() => refreshLocalAndDriveBooks(true)}
                  disabled={driveLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${driveLoading ? 'animate-spin' : ''}`} />
                  <span>Làm mới Drive</span>
                </button>
              )}
            </div>
          </div>

          {driveError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>Lưu ý Google Drive:</strong> {driveError}. Nếu bạn mới chỉ cài Apps Script bản cũ cho News Studio, hãy bấm{' '}
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="font-extrabold underline"
              >
                Kết nối Drive & Sheet
              </button>{' '}
              để dán mã Apps Script mới nhất (có hỗ trợ đọc thư mục <code>VocabStudio Books</code>).
            </div>
          )}

          {downloadError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              {downloadError}
            </div>
          )}

          {/* Downloading Progress Banner */}
          {downloadingBookId && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/40">
              <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-200">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  Đang tải sách PDF từ Google Drive về bộ nhớ đệm trình duyệt (chỉ tải 1 lần)...
                </span>
                <span>{downloadPercent}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${downloadPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Empty Shelf Onboarding */}
          {filteredBooks.length === 0 && !driveLoading ? (
            <div className="mx-auto max-w-3xl rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50/70 p-7 text-center shadow-xs dark:border-blue-900/60 dark:from-blue-950/40 dark:via-slate-900 dark:to-indigo-950/20">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md">
                <BookOpen className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-extrabold text-slate-900 dark:text-white">
                Kệ sách PDF của bạn đã sẵn sàng!
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Bạn có 2 cách siêu tiện để thêm sách PDF tiếng Anh vào đọc & học từ vựng:
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-blue-700 dark:text-blue-300">
                    <Cloud className="h-4 w-4" /> Cách 1: Đồng bộ Google Drive (Máy tính ↔ Điện thoại)
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Thả file PDF vào thư mục <strong>VocabStudio Books</strong> trên Google Drive, rồi bấm{' '}
                    <strong>Làm mới Drive</strong>. Sách & trang đang đọc tự đồng bộ giữa mọi thiết bị!
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      <FolderOpen className="h-3.5 w-3.5" /> Mở thư mục Drive
                    </a>
                    <button
                      type="button"
                      onClick={() => setSetupOpen(true)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                    >
                      <Settings2 className="h-3.5 w-3.5" /> Cập nhật Apps Script
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                    <HardDrive className="h-4 w-4" /> Cách 2: Mở file PDF trực tiếp ngay bây giờ
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Chọn file <code>.pdf</code> có sẵn trên máy tính hoặc điện thoại để đọc ngay — lưu offline trong trình duyệt, vẫn chạm tra từ & lưu thẳng lên Google Sheets!
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    <Upload className="h-3.5 w-3.5" /> Chọn file PDF từ máy
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBooks.map((book) => {
                const pct =
                  book.totalPages > 0
                    ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100))
                    : 0;
                const isDownloading = downloadingBookId === book.id;

                return (
                  <div
                    key={book.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                          {book.source === 'drive' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              <Cloud className="h-3 w-3" /> Google Drive
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              <HardDrive className="h-3 w-3" /> Trên máy
                            </span>
                          )}
                          {book.hasLocalPdf && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Sẵn sàng Offline
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteCachedBook(book)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                          title={
                            book.source === 'drive'
                              ? 'Xóa bản nhớ đệm offline trên thiết bị này (file trên Drive vẫn giữ nguyên)'
                              : 'Xóa sách khỏi trình duyệt'
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <h3 className="mt-2.5 line-clamp-2 text-sm font-extrabold leading-snug text-slate-900 dark:text-white">
                        {book.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatFileSize(book.sizeBytes)}
                        {book.totalPages > 0
                          ? ` · Trang ${book.currentPage}/${book.totalPages}`
                          : book.currentPage > 1
                            ? ` · Đang đọc trang ${book.currentPage}`
                            : ' · Chưa đọc'}
                        {book.bookmarks.length > 0 ? ` · ${book.bookmarks.length} bookmark` : ''}
                      </p>

                      {book.totalPages > 0 && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-slate-500">{pct}%</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={Boolean(downloadingBookId)}
                      onClick={() => handleOpenBook(book)}
                      className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải ({downloadPercent}%)
                        </>
                      ) : book.hasLocalPdf ? (
                        <>
                          <BookOpen className="h-3.5 w-3.5" />{' '}
                          {book.currentPage > 1 ? `Đọc tiếp trang ${book.currentPage}` : 'Mở đọc ngay'}
                        </>
                      ) : (
                        <>
                          <CloudDownload className="h-3.5 w-3.5" /> Tải từ Drive & Đọc
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== VIEW 2: INTERACTIVE BOOK READER ==================== */}
      {activeBook && (
        <div className="space-y-4">
          {/* Reader Sticky Navigation & Mode Bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4 dark:border-slate-800 dark:bg-slate-900">
            {/* Tier 1: Back + Book Title + Mode Switch */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    clearSpeechState();
                    setActiveBook(null);
                    setPdfDoc(null);
                    setLookup(null);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Kệ sách
                </button>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                    {activeBook.title}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>
                      Trang {currentPage}/{totalPages} (
                      {totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0}%)
                    </span>
                    {progressSyncStatus === 'syncing' && (
                      <span className="text-blue-500">· Đang đồng bộ tiến độ...</span>
                    )}
                    {progressSyncStatus === 'synced' && (
                      <span className="text-emerald-600 dark:text-emerald-400">· Đã lưu tiến độ ✓</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setReaderMode('smart')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    readerMode === 'smart'
                      ? 'bg-white text-blue-700 shadow-xs dark:bg-slate-900 dark:text-blue-300'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Chế độ Học (Text)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReaderMode('pdf')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    readerMode === 'pdf'
                      ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Trang PDF gốc</span>
                </button>
              </div>
            </div>

            {/* Tier 2: Page Turn + Jump + Bookmark + Typography/Audio Controls */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              {/* Page Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => goToPage(currentPage - 1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  title="Trang trước (←)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = parseInt(pageInput, 10);
                    if (!Number.isNaN(n)) goToPage(n);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    type="number"
                    min={1}
                    max={totalPages || 1}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    className="h-8 w-14 rounded-xl border border-slate-200 bg-slate-50 px-2 text-center text-xs font-bold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="text-xs font-semibold text-slate-400">/ {totalPages}</span>
                </form>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => goToPage(currentPage + 1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  title="Trang sau (→)"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleBookmark}
                  className={`inline-flex h-8 items-center gap-1 rounded-xl border px-2.5 text-xs font-bold transition ${
                    activeBook.bookmarks.includes(currentPage)
                      ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                  title="Đánh dấu trang này"
                >
                  <Bookmark
                    className={`h-3.5 w-3.5 ${
                      activeBook.bookmarks.includes(currentPage) ? 'fill-current' : ''
                    }`}
                  />
                  <span className="hidden sm:inline">Đánh dấu</span>
                </button>
              </div>

              {/* Study Controls */}
              <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
                {readerMode === 'smart' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setPhraseMode((m) => !m);
                        setPhraseAnchor(null);
                      }}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                        phraseMode
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-violet-50 hover:text-violet-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                      title="Bật để chạm từ đầu → chạm từ cuối gom cả cụm từ"
                    >
                      <TextSelect className="h-3.5 w-3.5" />
                      <span>{phraseMode ? 'Đang chọn cụm (2 chạm)' : 'Chọn cụm từ'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setHighlightKnown((h) => !h)}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold ${
                        highlightKnown
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <Highlighter className="h-3.5 w-3.5" />
                      <span>Từ đã học ({pageMatchedCount})</span>
                    </button>

                    <div className="flex shrink-0 items-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => setFontSize((s) => Math.max(13, s - 1))}
                        className="px-2 py-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300"
                        title="Thu nhỏ chữ"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="px-1 text-[11px] font-bold text-slate-500">{fontSize}px</span>
                      <button
                        type="button"
                        onClick={() => setFontSize((s) => Math.min(26, s + 1))}
                        className="px-2 py-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300"
                        title="Phóng to chữ"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {[0.8, 1.0, 1.2].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setSpeechRate(spd)}
                        className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold ${
                          speechRate === spd
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {spd.toFixed(1)}x
                      </button>
                    ))}

                    {pageParagraphs.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSpeakPage}
                        className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        {speakingKey === 'book-page' ? (
                          <>
                            <Square className="h-3 w-3 fill-current" /> Dừng
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5" /> Nghe trang
                          </>
                        )}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setPdfZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))))}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-xs font-bold text-slate-500">
                      {Math.round(pdfZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setPdfZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Phrase Mode Hint Banner */}
            {readerMode === 'smart' && phraseMode && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-1.5 text-xs text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200">
                <span>
                  {phraseAnchor
                    ? `Đang chọn từ “${phraseAnchor.word}” → chạm vào từ cuối cùng của cụm trong cùng đoạn!`
                    : 'Chế độ Chọn cụm từ: chạm từ đầu tiên rồi chạm từ cuối cùng của cụm để dịch & lưu thẳng lên Book Vocab.'}
                </span>
                {phraseAnchor && (
                  <button
                    type="button"
                    onClick={() => setPhraseAnchor(null)}
                    className="rounded-lg bg-white px-2 py-0.5 text-[11px] font-bold text-violet-700 shadow-2xs dark:bg-slate-900 dark:text-violet-300"
                  >
                    Hủy chọn
                  </button>
                )}
              </div>
            )}

            {/* Bookmarks quick-jump strip */}
            {activeBook.bookmarks.length > 0 && (
              <div className="no-scrollbar mt-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2.5 dark:border-slate-800">
                <span className="shrink-0 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  Trang đã đánh dấu:
                </span>
                {activeBook.bookmarks.map((bm) => (
                  <button
                    key={bm}
                    type="button"
                    onClick={() => goToPage(bm)}
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                      bm === currentPage
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    Trang {bm}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reader Main Body */}
          {readerMode === 'smart' ? (
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-7 dark:border-slate-800 dark:bg-slate-900">
              {pageLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  Đang tách chữ trang {currentPage}...
                </div>
              ) : pageParagraphs.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    Trang {currentPage} là trang bìa, hình ảnh hoặc không có chữ.
                  </p>
                  <button
                    type="button"
                    onClick={() => setReaderMode('pdf')}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    <FileText className="h-3.5 w-3.5" /> Xem trang PDF gốc
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {pageParagraphs.map((para, idx) => {
                    const pKey = `book-${currentPage}-${idx}`;
                    const isReadingThisPara = speakingWord?.paraKey === pKey;
                    return (
                    <div
                      key={idx}
                      data-book-para={pKey}
                      className={`rounded-xl border p-3.5 transition ${
                        isReadingThisPara
                          ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-300/60 dark:border-amber-500/70 dark:bg-amber-950/20'
                          : 'border-slate-100 bg-slate-50/30 dark:border-slate-800/80 dark:bg-slate-800/20'
                      }`}
                    >
                      <p
                        style={{ fontSize: `${fontSize}px`, lineHeight: 1.72 }}
                        className="text-slate-800 dark:text-slate-100"
                      >
                        {renderInteractiveParagraph(para, pKey)}
                      </p>

                      {paraTranslations[idx] && (
                        <div className="mt-2.5 rounded-lg border-l-2 border-blue-500 bg-white/90 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
                          {paraTranslations[idx]}
                        </div>
                      )}

                      <div className="mt-2.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSpeakParagraph(pKey, para)}
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-2xs hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {speakingKey === pKey ? (
                            <>
                              <Square className="h-3 w-3 fill-current text-blue-600" /> Dừng
                            </>
                          ) : (
                            <>
                              <Volume2 className="h-3 w-3" /> Nghe đoạn
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTranslateParagraph(idx, para)}
                          disabled={translatingIdx === idx}
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-2xs hover:text-indigo-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {translatingIdx === idx ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Languages className="h-3 w-3" />
                          )}
                          <span>{paraTranslations[idx] ? 'Ẩn dịch' : 'Dịch đoạn này'}</span>
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Quick word lookup input while inspecting original PDF charts/diagrams */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualWordInput.trim()) {
                    handleLookupTerm(manualWordInput.trim(), pageParagraphs[0] || activeBook.title);
                  }
                }}
                className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <Search className="ml-1.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={manualWordInput}
                  onChange={(e) => setManualWordInput(e.target.value)}
                  placeholder="Gõ nhanh 1 từ hoặc cả cụm từ gặp trên trang PDF gốc để tra & lưu vào Book Vocab..."
                  className="flex-1 bg-transparent text-xs text-slate-800 focus:outline-none dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Tra từ
                </button>
              </form>

              <div className="flex justify-center overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950">
                <canvas
                  ref={canvasRef}
                  className="max-w-full rounded-lg bg-white shadow-lg"
                />
              </div>
            </div>
          )}

          {/* Bottom Page Turn Bar */}
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ChevronLeft className="h-4 w-4" /> Trang trước
            </button>
            <span className="text-xs font-extrabold text-slate-500">
              Trang {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-40"
            >
              Trang tiếp <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== INTERACTIVE WORD & PHRASE LOOKUP DRAWER ==================== */}
      {lookup && (
        <ReaderLookupDrawer
          lookup={lookup}
          accent={accent}
          isSheetConnected={isConnected}
          targetSheetLabel="Book Vocab"
          savedSyncStatus={activeSavedEntry?.syncStatus}
          savedSyncError={activeSavedEntry?.syncError}
          isAlreadySavedLocally={Boolean(activeSavedEntry)}
          accentTone="blue"
          onClose={() => {
            setLookup(null);
            setPhraseAnchor(null);
          }}
          onExpandRange={handleExpandLookup}
          onSave={(customMeaning) => handleSaveWord(customMeaning)}
          onOpenSheetSetup={() => setSetupOpen(true)}
        />
      )}
    </div>
  );
}
