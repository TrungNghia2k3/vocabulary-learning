export interface CachedBookMeta {
  id: string; // 'drive::<fileId>' or 'local::<slug>'
  source: 'drive' | 'local';
  driveFileId?: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  currentPage: number;
  totalPages: number;
  bookmarks: number[];
  lastReadAt: string;
  addedAt: string;
  webViewLink?: string;
  hasLocalPdf: boolean;
}

interface StoredBookRecord extends CachedBookMeta {
  pdfBuffer?: ArrayBuffer;
}

const DB_NAME = 'VocabStudioBooksDB';
const DB_VERSION = 1;
const STORE_NAME = 'books';

export const SHARED_WEBHOOK_URL_KEY = 'vocabStudio:newsWebhookUrl:v1';
export const SHARED_WEBHOOK_SECRET_KEY = 'vocabStudio:newsWebhookSecret:v1';
export const BOOKS_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1fgvQA13zN7k2Yh2PCvgzm7kuUlEHBno5';

export function loadSharedWebhookConfig(): { url: string; secret: string } {
  try {
    return {
      url: localStorage.getItem(SHARED_WEBHOOK_URL_KEY) || '',
      secret: localStorage.getItem(SHARED_WEBHOOK_SECRET_KEY) || '',
    };
  } catch {
    return { url: '', secret: '' };
  }
}

export function saveSharedWebhookConfig(url: string, secret: string): void {
  const cleanUrl = url.trim();
  const cleanSecret = secret.trim();
  try {
    if (cleanUrl) localStorage.setItem(SHARED_WEBHOOK_URL_KEY, cleanUrl);
    else localStorage.removeItem(SHARED_WEBHOOK_URL_KEY);
    if (cleanSecret) localStorage.setItem(SHARED_WEBHOOK_SECRET_KEY, cleanSecret);
    else localStorage.removeItem(SHARED_WEBHOOK_SECRET_KEY);
  } catch {
    // Ignore storage quota issues
  }
}

function openBooksDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Không mở được IndexedDB'));
  });
}

export async function listCachedBooks(): Promise<CachedBookMeta[]> {
  const db = await openBooksDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result || []) as StoredBookRecord[];
      const metas: CachedBookMeta[] = records.map(({ pdfBuffer, ...meta }) => ({
        ...meta,
        hasLocalPdf: Boolean(pdfBuffer && pdfBuffer.byteLength > 0),
      }));
      metas.sort((a, b) => new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime());
      resolve(metas);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveBookToCache(
  meta: Omit<CachedBookMeta, 'hasLocalPdf'>,
  pdfBuffer?: ArrayBuffer
): Promise<void> {
  const db = await openBooksDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(meta.id);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredBookRecord | undefined;
      const finalBuf = pdfBuffer ?? existing?.pdfBuffer;
      const record: StoredBookRecord = {
        ...existing,
        ...meta,
        hasLocalPdf: Boolean(finalBuf && finalBuf.byteLength > 0),
        pdfBuffer: finalBuf,
      };
      store.put(record);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBookPdfBytes(id: string): Promise<ArrayBuffer | null> {
  const db = await openBooksDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => {
      const rec = req.result as StoredBookRecord | undefined;
      resolve(rec?.pdfBuffer || null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updateCachedBookProgress(
  id: string,
  patch: Partial<Pick<CachedBookMeta, 'currentPage' | 'totalPages' | 'bookmarks' | 'lastReadAt' | 'title'>>
): Promise<void> {
  const db = await openBooksDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const existing = req.result as StoredBookRecord | undefined;
      if (!existing) return;
      store.put({
        ...existing,
        ...patch,
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCachedBook(id: string): Promise<void> {
  const db = await openBooksDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}
