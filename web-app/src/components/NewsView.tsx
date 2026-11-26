import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Cloud,
  CloudOff,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  HelpCircle,
  Highlighter,
  Languages,
  LayoutGrid,
  Loader2,
  Newspaper,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Square,
  TextSelect,
  Trash2,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import type { Accent, NewsArticleItem, VocabItem } from '../types';
import { speakParagraphQueue, speakText, stopSpeaking } from '../utils/speech';
import { APPS_SCRIPT_WEBHOOK_CODE } from '../utils/appsScriptTemplate';
import {
  cleanPhraseText,
  getCambridgeUrl,
  getSelectedPhraseFromWindow,
  lookupTermOnline,
  type ReaderLookupResult,
} from '../utils/readerLookup';
import { ReaderLookupDrawer } from './ReaderLookupDrawer';

interface NewsViewProps {
  articles: NewsArticleItem[];
  allVocab: VocabItem[];
  accent: Accent;
}

type StudioMode = 'live' | 'deep';
type DeepSubTab = 'bilingual' | 'vocab' | 'quiz';

interface LiveFeedItem {
  id: string;
  title: string;
  url: string;
  source: string;
  category: string;
  publishedAt: string;
  summary: string;
  imageUrl?: string;
}

interface SavedNewsWord {
  word: string;
  partOfSpeech?: string;
  phonetic?: string;
  meaning: string;
  context: string;
  topic?: string;
  articleTitle: string;
  savedAt: string;
  syncStatus?: 'synced' | 'syncing' | 'local' | 'error';
  syncError?: string;
}

const SAVED_WORDS_KEY = 'vocabStudio:newsSavedWords:v1';
const WEBHOOK_URL_KEY = 'vocabStudio:newsWebhookUrl:v1';
const WEBHOOK_SECRET_KEY = 'vocabStudio:newsWebhookSecret:v1';

const LIVE_CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'world', label: 'World' },
  { id: 'technology', label: 'Technology' },
  { id: 'science', label: 'Science' },
  { id: 'business', label: 'Business' },
  { id: 'environment', label: 'Environment' },
] as const;

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

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return 'Vừa xong';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(1, mins)} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

function loadSavedNewsWords(): SavedNewsWord[] {
  try {
    const raw = localStorage.getItem(SAVED_WORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedNewsWords(words: SavedNewsWord[]): void {
  try {
    localStorage.setItem(SAVED_WORDS_KEY, JSON.stringify(words));
  } catch {
    // Ignore storage quota issues
  }
}

function getLevelBadgeClass(level?: string): string {
  const low = (level || '').toLowerCase();
  if (/c2|8\.5|9\.0/.test(low)) return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
  if (/c1|7\.5|8\.0/.test(low)) return 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300';
  if (/collocation|idiom|phrasal/.test(low)) return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
}

export function NewsView({ articles, allVocab, accent }: NewsViewProps) {
  const [studioMode, setStudioMode] = useState<StudioMode>('live');

  // --- Shared Vocabulary Lookup Index (matches user's Google Sheets vocab & phrases!) ---
  const { vocabIndex, phraseVocabIndex } = useMemo(() => {
    const words = new Map<string, VocabItem>();
    const phrases = new Map<string, VocabItem>();
    for (const item of allVocab) {
      const cleaned = item.word
        .replace(/\([^)]*\)/g, '')
        .split(/[\/,;]/)[0]
        .trim()
        .toLowerCase();
      if (!cleaned) continue;
      if (cleaned.includes(' ')) {
        if (!phrases.has(cleaned)) phrases.set(cleaned, item);
        continue;
      }
      if (cleaned.length < 4 || COMMON_STOPWORDS.has(cleaned)) continue;
      if (!words.has(cleaned)) {
        words.set(cleaned, item);
      }
    }
    return { vocabIndex: words, phraseVocabIndex: phrases };
  }, [allVocab]);

  const findSheetMatch = useCallback(
    (token: string): VocabItem | undefined => {
      const lower = cleanPhraseText(token).toLowerCase();
      if (!lower) return undefined;
      if (lower.includes(' ')) {
        return phraseVocabIndex.get(lower);
      }
      for (const candidate of getCandidateLemmas(lower)) {
        if (candidate.length < 4 || COMMON_STOPWORDS.has(candidate)) continue;
        const found = vocabIndex.get(candidate);
        if (found) return found;
      }
      return undefined;
    },
    [vocabIndex, phraseVocabIndex]
  );

  // --- Shared Reading Tools State ---
  const [highlightKnown, setHighlightKnown] = useState(true);
  const [phraseMode, setPhraseMode] = useState(false);
  const [phraseAnchor, setPhraseAnchor] = useState<{
    paraKey: string;
    wordIdx: number;
    word: string;
  } | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(0.95);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [speakingWord, setSpeakingWord] = useState<{ paraKey: string; wordIdx: number } | null>(null);
  const [lookup, setLookup] = useState<ReaderLookupResult | null>(null);
  const [savedWords, setSavedWords] = useState<SavedNewsWord[]>(() => loadSavedNewsWords());
  const [savedDrawerOpen, setSavedDrawerOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // --- Direct Google Sheets Apps Script Webhook State ---
  const [webhookUrl, setWebhookUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(WEBHOOK_URL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [webhookSecret, setWebhookSecret] = useState<string>(() => {
    try {
      return localStorage.getItem(WEBHOOK_SECRET_KEY) || '';
    } catch {
      return '';
    }
  });
  const [serverWebhookConfigured, setServerWebhookConfigured] = useState<boolean>(false);
  const [sheetSetupOpen, setSheetSetupOpen] = useState<boolean>(false);
  const [sheetTestState, setSheetTestState] = useState<{
    status: 'idle' | 'testing' | 'ok' | 'error';
    message?: string;
  }>({ status: 'idle' });
  const [batchSyncing, setBatchSyncing] = useState<boolean>(false);
  const [sendArticleState, setSendArticleState] = useState<
    'idle' | 'sending' | 'sent' | 'duplicate' | 'error'
  >('idle');
  const [sendArticleMsg, setSendArticleMsg] = useState<string>('');

  const isSheetConnected = serverWebhookConfigured || Boolean(webhookUrl.trim());

  // Check if server-side NEWS_SHEET_WEBHOOK_URL is configured (Vercel / Netlify env var)
  useEffect(() => {
    fetch('/api/save-vocab')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.serverConfigured) {
          setServerWebhookConfigured(true);
        }
      })
      .catch(() => {});
  }, []);

  // --- Live News Mode State ---
  const [liveCategory, setLiveCategory] = useState<string>('all');
  const [liveArticles, setLiveArticles] = useState<LiveFeedItem[]>([]);
  const [liveLoading, setLiveLoading] = useState<boolean>(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveSearch, setLiveSearch] = useState<string>('');
  const [selectedLive, setSelectedLive] = useState<LiveFeedItem | null>(null);
  const [liveParagraphs, setLiveParagraphs] = useState<string[]>([]);
  const [liveWordCount, setLiveWordCount] = useState<number>(0);
  const [liveArticleLoading, setLiveArticleLoading] = useState<boolean>(false);
  const [liveArticleError, setLiveArticleError] = useState<string | null>(null);
  const [paraTranslations, setParaTranslations] = useState<Record<number, string>>({});
  const [translatingIdx, setTranslatingIdx] = useState<number | null>(null);

  // --- Deep Analyzed Sheet Mode State ---
  const [deepCategory, setDeepCategory] = useState<string>('ALL');
  const [deepPickerOpen, setDeepPickerOpen] = useState<boolean>(false);
  const [deepPickerSearch, setDeepPickerSearch] = useState<string>('');
  const [selectedDeepId, setSelectedDeepId] = useState<string>(articles[0]?.id || '');
  const [deepTab, setDeepTab] = useState<DeepSubTab>('bilingual');
  const [showVi, setShowVi] = useState<boolean>(true);
  const [showNotes, setShowNotes] = useState<boolean>(true);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);

  // Stop speech on unmount
  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  // Fetch live feed when category changes or when entering live mode
  const loadLiveFeed = useCallback(async (category: string) => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const res = await fetch(`/api/news?category=${encodeURIComponent(category)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setLiveArticles(Array.isArray(data.articles) ? data.articles : []);
    } catch (err) {
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Không tải được bảng tin lúc này. Hãy thử làm mới lại.'
      );
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (studioMode === 'live') {
      loadLiveFeed(liveCategory);
    }
  }, [studioMode, liveCategory, loadLiveFeed]);

  // Open a live article and fetch its full prose
  const openLiveArticle = async (item: LiveFeedItem) => {
    stopSpeaking();
    setSpeakingKey(null);
    setSpeakingWord(null);
    setSelectedLive(item);
    setLiveParagraphs([]);
    setLiveWordCount(0);
    setLiveArticleError(null);
    setParaTranslations({});
    setLookup(null);
    setSendArticleState('idle');
    setSendArticleMsg('');
    setLiveArticleLoading(true);
    try {
      const res = await fetch(`/api/news?articleUrl=${encodeURIComponent(item.url)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const paras = Array.isArray(data.paragraphs) ? data.paragraphs : [];
      setLiveParagraphs(paras);
      setLiveWordCount(typeof data.wordCount === 'number' ? data.wordCount : 0);
    } catch (err) {
      setLiveArticleError(
        err instanceof Error ? err.message : 'Không trích xuất được toàn văn bài báo này.'
      );
    } finally {
      setLiveArticleLoading(false);
    }
  };

  const clearSpeech = () => {
    stopSpeaking();
    setSpeakingKey(null);
    setSpeakingWord(null);
  };

  const handleSpeak = (paraKey: string, text: string) => {
    if (speakingKey === paraKey) {
      clearSpeech();
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

  const handleSpeakQueue = (queueKey: string, items: Array<{ key: string; text: string }>) => {
    if (speakingKey === queueKey) {
      clearSpeech();
      return;
    }
    if (!items.length) return;
    setSpeakingKey(queueKey);
    speakParagraphQueue(items, accent, speechRate, {
      onItemStart: (paraKey) => {
        setSpeakingWord({ paraKey, wordIdx: 0 });
        const el = document.querySelector(`[data-news-para="${paraKey}"]`);
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
    });
  };

  // Instant word OR phrase lookup (Google Sheets vocab + Dictionary API + MyMemory EN->VI)
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

  // On-demand paragraph EN -> VI translation via MyMemory
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
      const translated = json?.responseData?.translatedText || 'Không dịch được đoạn này.';
      setParaTranslations((prev) => ({ ...prev, [idx]: translated }));
    } catch {
      setParaTranslations((prev) => ({
        ...prev,
        [idx]: 'Lỗi kết nối dịch nhanh. Hãy thử lại sau.',
      }));
    } finally {
      setTranslatingIdx(null);
    }
  };

  const saveWebhookConfig = (nextUrl: string, nextSecret: string) => {
    const cleanUrl = nextUrl.trim();
    const cleanSecret = nextSecret.trim();
    setWebhookUrl(cleanUrl);
    setWebhookSecret(cleanSecret);
    try {
      if (cleanUrl) localStorage.setItem(WEBHOOK_URL_KEY, cleanUrl);
      else localStorage.removeItem(WEBHOOK_URL_KEY);
      if (cleanSecret) localStorage.setItem(WEBHOOK_SECRET_KEY, cleanSecret);
      else localStorage.removeItem(WEBHOOK_SECRET_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const handleTestSheetConnection = async () => {
    saveWebhookConfig(webhookUrl, webhookSecret);
    setSheetTestState({ status: 'testing', message: 'Đang kiểm tra kết nối tới Google Sheets...' });
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
      setSheetTestState({
        status: 'ok',
        message: `Kết nối thành công tới file “${data.spreadsheetName || 'Vocabulary'}” → tab “${data.sheetName || 'News Vocab'}”!`,
      });
    } catch (err) {
      setSheetTestState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Không kết nối được tới Apps Script.',
      });
    }
  };

  const pushEntriesToGoogleSheet = async (entries: SavedNewsWord[]) => {
    const res = await fetch('/api/save-vocab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_vocab',
        webhookUrl: webhookUrl.trim() || undefined,
        secret: webhookSecret.trim() || undefined,
        entries: entries.map((e) => ({
          word: e.word,
          partOfSpeech: e.partOfSpeech || '',
          phonetic: e.phonetic || '',
          meaning: e.meaning || '',
          example: e.context || '',
          topic: e.topic || 'News',
          cambridgeUrl: getCambridgeUrl(e.word),
          sourceArticle: e.articleTitle || '',
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

  const handleSaveWord = async (
    titleContext: string,
    topicContext: string,
    customMeaning?: string
  ) => {
    if (!lookup) return;
    const entry: SavedNewsWord = {
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
      topic: topicContext || 'News',
      articleTitle: titleContext,
      savedAt: new Date().toISOString(),
      syncStatus: isSheetConnected ? 'syncing' : 'local',
      syncError: undefined,
    };

    setSavedWords((prev) => {
      const exists = prev.some((w) => w.word.toLowerCase() === entry.word.toLowerCase());
      const next = exists
        ? prev.map((w) => (w.word.toLowerCase() === entry.word.toLowerCase() ? entry : w))
        : [entry, ...prev];
      persistSavedNewsWords(next);
      return next;
    });

    if (!isSheetConnected) return;

    try {
      await pushEntriesToGoogleSheet([entry]);
      setSavedWords((prev) => {
        const next = prev.map((w) =>
          w.word.toLowerCase() === entry.word.toLowerCase()
            ? { ...w, syncStatus: 'synced' as const, syncError: undefined }
            : w
        );
        persistSavedNewsWords(next);
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
        persistSavedNewsWords(next);
        return next;
      });
    }
  };

  const handleSyncAllLocalWords = async () => {
    const unsynced = savedWords.filter((w) => w.syncStatus !== 'synced');
    if (unsynced.length === 0 || !isSheetConnected) return;
    setBatchSyncing(true);
    try {
      await pushEntriesToGoogleSheet(unsynced);
      const syncedSet = new Set(unsynced.map((u) => u.word.toLowerCase()));
      setSavedWords((prev) => {
        const next = prev.map((w) =>
          syncedSet.has(w.word.toLowerCase())
            ? { ...w, syncStatus: 'synced' as const, syncError: undefined }
            : w
        );
        persistSavedNewsWords(next);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không đẩy được lên Google Sheets.';
      setSheetTestState({ status: 'error', message: msg });
      setSheetSetupOpen(true);
    } finally {
      setBatchSyncing(false);
    }
  };

  const handleSendArticleToNewsSheet = async (article: LiveFeedItem) => {
    if (!isSheetConnected) {
      setSheetSetupOpen(true);
      return;
    }
    setSendArticleState('sending');
    setSendArticleMsg('');
    try {
      const res = await fetch('/api/save-vocab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_news_url',
          webhookUrl: webhookUrl.trim() || undefined,
          secret: webhookSecret.trim() || undefined,
          url: article.url,
          title: article.title,
          source: article.source,
          category: article.category,
          publishedDate: article.publishedAt.slice(0, 10),
          imageUrl: article.imageUrl || '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      if (data.status === 'duplicate') {
        setSendArticleState('duplicate');
        setSendArticleMsg('Bài này đã có sẵn trong sheet News.');
      } else {
        setSendArticleState('sent');
        setSendArticleMsg(`Đã thêm vào sheet News (dòng ${data.row}) với Status = Pending!`);
      }
    } catch (err) {
      setSendArticleState('error');
      setSendArticleMsg(err instanceof Error ? err.message : 'Không gửi được bài lên sheet News.');
    }
  };

  const handleDeleteSavedWord = (word: string) => {
    setSavedWords((prev) => {
      const next = prev.filter((w) => w.word !== word);
      persistSavedNewsWords(next);
      return next;
    });
  };

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleCopySavedTsv = () => {
    const lines = savedWords.map(
      (w) => `${w.word}${w.phonetic ? ` ${w.phonetic}` : ''}\t${w.meaning}\t${w.context}`
    );
    handleCopyText('saved-tsv', lines.join('\n'));
  };

  // Render an English paragraph with single-word tap, 2-tap phrase selection, and native drag-highlight
  const renderInteractiveParagraph = (text: string, paraKey: string) => {
    const tokens = text.split(/(\s+)/);
    const paragraphWords = tokens.filter((t) => !/^\s+$/.test(t) && t.length > 0);
    let runningWordIdx = -1;

    const handleWordClick = (tok: string, wordIdx: number) => {
      // If the user just dragged to highlight a phrase, let onMouseUp handle it
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
            'cursor-pointer rounded px-0.5 transition-colors duration-75 hover:bg-indigo-100/80 hover:text-indigo-800 dark:hover:bg-indigo-950/70 dark:hover:text-indigo-200';
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
                    : 'Chạm tra 1 từ (hoặc bôi đen kéo chuột để tra cả cụm)'
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

  // Count how many distinct personal Google Sheets words appear in current text
  const countMatchedVocab = useCallback(
    (paragraphs: string[]) => {
      const found = new Set<string>();
      for (const p of paragraphs) {
        for (const tok of p.split(/\s+/)) {
          const m = findSheetMatch(tok);
          if (m) found.add(m.word.toLowerCase());
        }
      }
      return found.size;
    },
    [findSheetMatch]
  );

  // Filtered live list
  const filteredLiveArticles = useMemo(() => {
    const q = liveSearch.trim().toLowerCase();
    if (!q) return liveArticles;
    return liveArticles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [liveArticles, liveSearch]);

  // Deep mode filters & active article
  const deepCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of articles) {
      map.set(a.category, (map.get(a.category) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [articles]);

  const filteredDeepArticles = useMemo(() => {
    if (deepCategory === 'ALL') return articles;
    return articles.filter((a) => a.category === deepCategory);
  }, [articles, deepCategory]);

  const pickerFilteredDeep = useMemo(() => {
    const q = deepPickerSearch.trim().toLowerCase();
    if (!q) return filteredDeepArticles;
    return filteredDeepArticles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [filteredDeepArticles, deepPickerSearch]);

  const activeDeep = useMemo(() => {
    return (
      filteredDeepArticles.find((a) => a.id === selectedDeepId) ||
      filteredDeepArticles[0] ||
      articles[0] ||
      null
    );
  }, [filteredDeepArticles, articles, selectedDeepId]);

  useEffect(() => {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setLookup(null);
  }, [activeDeep?.id]);

  const activeDeepIdx = activeDeep
    ? filteredDeepArticles.findIndex((a) => a.id === activeDeep.id)
    : -1;

  const goPrevDeep = () => {
    if (filteredDeepArticles.length <= 1) return;
    const prev = activeDeepIdx > 0 ? activeDeepIdx - 1 : filteredDeepArticles.length - 1;
    setSelectedDeepId(filteredDeepArticles[prev].id);
  };
  const goNextDeep = () => {
    if (filteredDeepArticles.length <= 1) return;
    const next = (activeDeepIdx + 1) % filteredDeepArticles.length;
    setSelectedDeepId(filteredDeepArticles[next].id);
  };

  const liveMatchedCount = useMemo(
    () => (selectedLive ? countMatchedVocab(liveParagraphs) : 0),
    [selectedLive, liveParagraphs, countMatchedVocab]
  );

  const deepMatchedCount = useMemo(
    () => (activeDeep ? countMatchedVocab(activeDeep.paragraphs.map((p) => p.en)) : 0),
    [activeDeep, countMatchedVocab]
  );

  const currentArticleTitle =
    studioMode === 'live' ? selectedLive?.title || 'Tin mới' : activeDeep?.title || 'Sheet News';
  const currentArticleTopic =
    studioMode === 'live' ? selectedLive?.category || 'News' : activeDeep?.category || 'News';
  const unsyncedCount = savedWords.filter((w) => w.syncStatus !== 'synced').length;
  const activeSavedEntry = lookup
    ? savedWords.find((w) => w.word.toLowerCase() === lookup.cleaned.toLowerCase())
    : undefined;

  return (
    <div className="space-y-4">
      {/* Compact Mobile-First 3-Tier Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-3.5 dark:border-slate-800 dark:bg-slate-900">
        {/* Tier 1: Brand + Mode Switcher */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-xs">
                <Newspaper className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-extrabold text-slate-900 dark:text-white">
                  News Studio
                </h2>
                <p className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">
                  Đọc tin mới The Guardian & NPR — chạm bất kỳ từ nào để tra, tô sáng từ đã học & luyện đọc hiểu IELTS.
                </p>
              </div>
            </div>

            {/* Mobile top-right buttons: Sheet Sync + Saved Words */}
            <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
              <button
                type="button"
                onClick={() => setSheetSetupOpen((o) => !o)}
                className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1.5 text-xs font-bold transition ${
                  isSheetConnected
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
                title="Kết nối Google Sheets lưu từ 1-click"
              >
                {isSheetConnected ? (
                  <Cloud className="h-3.5 w-3.5" />
                ) : (
                  <CloudOff className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setSavedDrawerOpen((o) => !o)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
                  savedDrawerOpen
                    ? 'border-teal-500 bg-teal-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <BookMarked className="h-3.5 w-3.5" />
                <span>{savedWords.length}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  clearSpeech();
                  setStudioMode('live');
                }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  studioMode === 'live'
                    ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-900 dark:text-teal-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                <span>Tin mới (Live)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  clearSpeech();
                  setStudioMode('deep');
                }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  studioMode === 'deep'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Phân tích sâu ({articles.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSheetSetupOpen((o) => !o)}
              className={`hidden shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition sm:inline-flex ${
                isSheetConnected
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
              }`}
            >
              {isSheetConnected ? (
                <>
                  <Cloud className="h-3.5 w-3.5" />
                  <span>Đã kết nối Sheet</span>
                </>
              ) : (
                <>
                  <Settings2 className="h-3.5 w-3.5" />
                  <span>Kết nối Sheet</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSavedDrawerOpen((o) => !o)}
              className={`hidden shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition sm:inline-flex ${
                savedDrawerOpen
                  ? 'border-teal-500 bg-teal-600 text-white shadow-xs'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <BookMarked className="h-3.5 w-3.5" />
              <span>Sổ từ ({savedWords.length})</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Live Mode Category Swipe Rail */}
        {studioMode === 'live' && !selectedLive && (
          <div className="mt-2.5 flex flex-col gap-2 border-t border-slate-100 pt-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {LIVE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setLiveCategory(cat.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap transition ${
                    liveCategory === cat.id
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-52">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={liveSearch}
                  onChange={(e) => setLiveSearch(e.target.value)}
                  placeholder="Lọc tiêu đề..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={() => loadLiveFeed(liveCategory)}
                disabled={liveLoading}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                title="Làm mới bảng tin"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${liveLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Làm mới</span>
              </button>
            </div>
          </div>
        )}

        {/* Tier 2 & 3: Deep Analyzed Sheet Mode Active Picker */}
        {studioMode === 'deep' && activeDeep && (
          <>
            {deepCategories.length > 1 && (
              <div className="no-scrollbar mt-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2.5 pb-0.5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeepCategory('ALL')}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap transition ${
                    deepCategory === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Tất cả ({articles.length})
                </button>
                {deepCategories.map(([cat, count]) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setDeepCategory(cat)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap transition ${
                      deepCategory === cat
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2.5 flex flex-col gap-2 border-t border-slate-100 pt-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-extrabold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                  {activeDeepIdx + 1}/{filteredDeepArticles.length}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-extrabold text-slate-900 sm:text-sm dark:text-white">
                    {activeDeep.title}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {activeDeep.source} · {activeDeep.category}
                    {activeDeep.publishedDate ? ` · ${activeDeep.publishedDate}` : ''}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5 sm:flex sm:shrink-0">
                <button
                  type="button"
                  onClick={goPrevDeep}
                  disabled={filteredDeepArticles.length <= 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  title="Bài trước"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeepPickerOpen((o) => !o)}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Danh sách bài</span>
                  {deepPickerOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={goNextDeep}
                  disabled={filteredDeepArticles.length <= 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  title="Bài tiếp theo"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Collapsible Searchable Deep Picker */}
            {deepPickerOpen && (
              <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={deepPickerSearch}
                    onChange={(e) => setDeepPickerSearch(e.target.value)}
                    placeholder="Tìm bài báo phân tích theo tiêu đề, nguồn, chủ đề..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                  {pickerFilteredDeep.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => {
                        setSelectedDeepId(art.id);
                        setDeepPickerOpen(false);
                      }}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        art.id === activeDeep.id
                          ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-400 dark:bg-indigo-950/40'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                        <span className="text-indigo-600 dark:text-indigo-300">
                          {art.source} · {art.category}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 ${
                            art.status === 'Done'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {art.status === 'Done' ? 'Đã phân tích' : 'Chờ AI'}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs font-bold text-slate-900 dark:text-white">
                        {art.title}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                        {art.paragraphs.length} đoạn song ngữ · {art.vocab.length} từ vựng · {art.quiz.length} câu quiz
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Collapsible Google Sheets 1-Click Webhook Setup Panel */}
      {sheetSetupOpen && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-emerald-900 dark:text-emerald-200">
                <Cloud className="h-4 w-4 text-emerald-600" />
                Lưu thẳng vào Google Sheets (1-Click qua Apps Script)
              </h3>
              <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-300/80">
                Khi đã kết nối, mỗi lần bấm <strong>+ Lưu vào Google Sheets</strong> từ sẽ nhảy thẳng vào tab{' '}
                <code>News Vocab</code> (kèm phiên âm, nghĩa, câu ví dụ & link Cambridge) — không cần copy-paste!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetSetupOpen(false)}
              className="rounded-lg p-1 text-slate-500 hover:bg-white/60 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {serverWebhookConfigured && !webhookUrl.trim() && (
            <div className="mt-3 rounded-xl border border-emerald-300 bg-white/90 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300">
              ✓ Đã cấu hình sẵn trên máy chủ (<code>NEWS_SHEET_WEBHOOK_URL</code>) — mọi thiết bị của bạn đều tự động lưu thẳng lên Google Sheets!
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-emerald-200/80 bg-white p-3.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <div className="flex items-center justify-between gap-2">
                <p className="font-extrabold text-slate-900 dark:text-white">
                  Cài đặt 1 lần duy nhất (~1 phút):
                </p>
                <button
                  type="button"
                  onClick={() => handleCopyText('apps-script', APPS_SCRIPT_WEBHOOK_CODE)}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-700 dark:bg-emerald-600"
                >
                  {copiedKey === 'apps-script' ? (
                    <>
                      <Check className="h-3 w-3" /> Đã chép code!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Sao chép mã Apps Script
                    </>
                  )}
                </button>
              </div>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>
                  Mở Google Sheets <strong>Vocabulary</strong> → chọn{' '}
                  <strong>Tiện ích mở rộng (Extensions) → Apps Script</strong>.
                </li>
                <li>Xóa code mặc định, dán mã vừa sao chép vào rồi bấm Lưu (<code>Ctrl+S</code>).</li>
                <li>
                  Bấm <strong>Triển khai (Deploy) → Tùy chọn triển khai mới → Ứng dụng web (Web app)</strong>:
                  chọn thực thi là <strong>Tôi (Me)</strong> và quyền truy cập là{' '}
                  <strong>Bất kỳ ai (Anyone)</strong> → bấm <strong>Triển khai</strong> & cấp quyền.
                </li>
                <li>
                  Sao chép <strong>URL Ứng dụng web</strong> (kết thúc bằng <code>/exec</code>) dán sang ô bên cạnh.
                  *(Mẹo: dán thêm URL này vào biến <code>NEWS_SHEET_WEBHOOK_URL</code> trên Vercel/Netlify để điện thoại cũng tự kết nối sẵn!)*
                </li>
              </ol>
            </div>

            <div className="space-y-2.5 rounded-xl border border-emerald-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Google Apps Script Web App URL (/exec)
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Mã bảo mật Secret (tùy chọn — khớp với SECRET_TOKEN trong script)
                </label>
                <input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="Để trống nếu không đặt SECRET_TOKEN"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTestSheetConnection}
                  disabled={sheetTestState.status === 'testing'}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  {sheetTestState.status === 'testing' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span>Kiểm tra & Lưu kết nối</span>
                </button>
                {webhookUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      saveWebhookConfig('', '');
                      setSheetTestState({ status: 'idle' });
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    Ngắt kết nối
                  </button>
                )}
              </div>

              {sheetTestState.message && (
                <p
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    sheetTestState.status === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : sheetTestState.status === 'error'
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {sheetTestState.message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Saved Words Drawer (Sổ từ báo chí) */}
      {savedDrawerOpen && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 shadow-xs dark:border-teal-900/60 dark:bg-teal-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-teal-900 dark:text-teal-200">
                <BookMarked className="h-4 w-4 text-teal-600" />
                Sổ từ báo chí ({savedWords.length} từ đã lưu)
              </h3>
              <p className="text-xs text-teal-700/80 dark:text-teal-300/80">
                {isSheetConnected
                  ? 'Đã bật đồng bộ 1-click lên tab News Vocab trên Google Sheets.'
                  : 'Kết nối Google Sheets để lưu thẳng 1-click, hoặc dùng nút Sao chép dán vào Sheet.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isSheetConnected && unsyncedCount > 0 && (
                <button
                  type="button"
                  onClick={handleSyncAllLocalWords}
                  disabled={batchSyncing}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  {batchSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5" />
                  )}
                  <span>Đẩy {unsyncedCount} từ lên Sheet</span>
                </button>
              )}
              {!isSheetConnected && (
                <button
                  type="button"
                  onClick={() => setSheetSetupOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-600"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Bật lưu thẳng Sheet
                </button>
              )}
              {savedWords.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopySavedTsv}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700"
                >
                  {copiedKey === 'saved-tsv' ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Đã sao chép!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Sao chép TSV
                    </>
                  )}
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
              Chưa có từ nào được lưu. Khi đọc báo, hãy chạm vào bất kỳ từ tiếng Anh nào rồi bấm{' '}
              <strong>{isSheetConnected ? '+ Lưu lên Google Sheets' : '+ Lưu vào Sổ từ báo chí'}</strong>.
            </p>
          ) : (
            <div className="mt-3 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {savedWords.map((sw) => (
                <div
                  key={sw.word}
                  className="flex flex-col justify-between rounded-xl border border-teal-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
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
                        {sw.syncStatus === 'syncing' && (
                          <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700">
                            Đang gửi...
                          </span>
                        )}
                        {sw.syncStatus === 'error' && (
                          <span
                            title={sw.syncError}
                            className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700"
                          >
                            Lỗi gửi
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => speakText(sw.word, accent, 0.9)}
                          className="rounded-lg p-1 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950"
                          title="Nghe phát âm"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedWord(sw.word)}
                          className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"
                          title="Xóa khỏi sổ"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-teal-700 dark:text-teal-300">
                      {sw.meaning}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] italic text-slate-500 dark:text-slate-400">
                      “{sw.context}”
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== MODE 1: LIVE NEWS ==================== */}
      {studioMode === 'live' && !selectedLive && (
        <div>
          {liveLoading ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Đang tải tin tức mới nhất từ The Guardian & NPR...
              </p>
            </div>
          ) : liveError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/30">
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">{liveError}</p>
              <button
                type="button"
                onClick={() => loadLiveFeed(liveCategory)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Thử tải lại
              </button>
            </div>
          ) : filteredLiveArticles.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              Không có bài báo nào khớp từ khóa lọc.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredLiveArticles.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openLiveArticle(item)}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-xs transition hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-600"
                >
                  {item.imageUrl ? (
                    <div className="relative h-40 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <span className="absolute top-2.5 left-2.5 rounded-lg bg-slate-900/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                        {item.source}
                      </span>
                      <span className="absolute top-2.5 right-2.5 rounded-lg bg-teal-600/90 px-2 py-0.5 text-[10px] font-bold text-white">
                        {item.category}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                      <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                        {item.source}
                      </span>
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                        {item.category}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      <span>{formatRelativeTime(item.publishedAt)}</span>
                    </div>
                    <h3 className="mt-1.5 line-clamp-2 text-sm font-extrabold leading-snug text-slate-900 group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-300">
                      {item.title}
                    </h3>
                    {item.summary && (
                      <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {item.summary}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] font-bold text-teal-600 dark:border-slate-800 dark:text-teal-400">
                      <span>Đọc & chạm tra từ</span>
                      <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LIVE ARTICLE READER */}
      {studioMode === 'live' && selectedLive && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  clearSpeech();
                  setSelectedLive(null);
                  setLookup(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Danh sách tin
              </button>

              <div className="flex flex-wrap items-center gap-1.5">
                {isSheetConnected && (
                  <button
                    type="button"
                    disabled={sendArticleState === 'sending'}
                    onClick={() => handleSendArticleToNewsSheet(selectedLive)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                    title="Gửi thẳng bài báo này vào tab News (Status = Pending) để AI phân tích sâu"
                  >
                    {sendArticleState === 'sending' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : sendArticleState === 'sent' || sendArticleState === 'duplicate' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {sendArticleState === 'sent'
                        ? 'Đã gửi lên sheet News!'
                        : sendArticleState === 'duplicate'
                          ? 'Đã có trong sheet News'
                          : 'Gửi vào sheet News'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopyText('article-url', selectedLive.url)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300"
                  title="Chép đường link bài báo"
                >
                  {copiedKey === 'article-url' ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Đã chép link!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Chép link
                    </>
                  )}
                </button>
                <a
                  href={selectedLive.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Bài gốc
                </a>
              </div>
            </div>
            {sendArticleMsg && (
              <p
                className={`mt-2 rounded-xl px-3 py-1.5 text-xs font-semibold ${
                  sendArticleState === 'error'
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                }`}
              >
                {sendArticleMsg}
              </p>
            )}

            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-lg bg-slate-900 px-2 py-0.5 font-bold text-white dark:bg-slate-700">
                  {selectedLive.source}
                </span>
                <span className="rounded-lg bg-teal-100 px-2 py-0.5 font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  {selectedLive.category}
                </span>
                <span className="text-slate-400">{formatRelativeTime(selectedLive.publishedAt)}</span>
                {liveWordCount > 0 && (
                  <span className="text-slate-400">
                    · {liveWordCount} từ (~{Math.max(1, Math.round(liveWordCount / 180))} phút đọc)
                  </span>
                )}
              </div>

              <h1 className="mt-2.5 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl dark:text-white">
                {selectedLive.title}
              </h1>

              {selectedLive.imageUrl && (
                <img
                  src={selectedLive.imageUrl}
                  alt={selectedLive.title}
                  className="mt-4 max-h-80 w-full rounded-2xl object-cover"
                />
              )}
            </div>

            {/* Reader Controls */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhraseMode((m) => !m);
                    setPhraseAnchor(null);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    phraseMode
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-violet-50 hover:text-violet-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                  title="Bật để chạm từ đầu → chạm từ cuối gom cả cụm từ"
                >
                  <TextSelect className="h-3.5 w-3.5" />
                  <span>{phraseMode ? 'Đang chọn cụm (2 chạm)' : 'Chọn cụm từ'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHighlightKnown((h) => !h)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    highlightKnown
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <Highlighter className="h-3.5 w-3.5" />
                  <span>
                    Từ đã học ({liveMatchedCount})
                  </span>
                </button>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {phraseMode
                    ? phraseAnchor
                      ? `Bắt đầu từ “${phraseAnchor.word}” → chạm từ cuối cụm!`
                      : 'Chạm từ đầu rồi chạm từ cuối để lưu cả cụm'
                    : 'Chạm 1 từ hoặc bôi đen nhiều từ để tra & lưu'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {[0.8, 0.95, 1.1].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setSpeechRate(spd)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                      speechRate === spd
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
                {liveParagraphs.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      handleSpeakQueue(
                        'live-all',
                        liveParagraphs.map((text, idx) => ({ key: `live-${idx}`, text }))
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-teal-700"
                  >
                    {speakingKey === 'live-all' ? (
                      <>
                        <Square className="h-3 w-3 fill-current" /> Dừng
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-3.5 w-3.5" /> Nghe bài
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Article Prose */}
            <div className="mt-5 space-y-4">
              {liveArticleLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                  Đang trích xuất nội dung bài báo...
                </div>
              ) : liveArticleError || liveParagraphs.length === 0 ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                    {renderInteractiveParagraph(selectedLive.summary || selectedLive.title, 'live-summary')}
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    {liveArticleError ||
                      'Bài này là bản tin âm thanh hoặc bài ngắn. Bạn có thể mở bài gốc để nghe/xem đầy đủ.'}
                  </p>
                </div>
              ) : (
                liveParagraphs.map((para, idx) => {
                  const pKey = `live-${idx}`;
                  const isReadingThis = speakingWord?.paraKey === pKey;
                  return (
                  <div
                    key={idx}
                    data-news-para={pKey}
                    className={`rounded-xl border p-3.5 transition ${
                      isReadingThis
                        ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-300/60 dark:border-amber-500/70 dark:bg-amber-950/20'
                        : 'border-slate-100 bg-slate-50/40 dark:border-slate-800/80 dark:bg-slate-800/20'
                    }`}
                  >
                    <p className="text-[15px] leading-relaxed text-slate-800 sm:text-base sm:leading-7 dark:text-slate-100">
                      {renderInteractiveParagraph(para, pKey)}
                    </p>

                    {paraTranslations[idx] && (
                      <div className="mt-2.5 rounded-lg border-l-2 border-teal-500 bg-white/80 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
                        {paraTranslations[idx]}
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSpeak(pKey, para)}
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-2xs hover:text-teal-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {speakingKey === pKey ? (
                          <>
                            <Square className="h-3 w-3 fill-current text-teal-600" /> Dừng
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
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODE 2: DEEP ANALYZED SHEET NEWS ==================== */}
      {studioMode === 'deep' && !activeDeep && (
        <div className="mx-auto max-w-3xl rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-teal-50/70 p-8 text-center shadow-xs dark:border-indigo-900/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-teal-950/20">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-indigo-600 text-white shadow-md">
            <Newspaper className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-extrabold text-slate-900 dark:text-white">
            Chưa có bài phân tích sâu nào trong sheet News
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Hãy chuyển sang tab <strong>Tin mới (Live)</strong>, bấm{' '}
            <strong>Chép link cho sheet News</strong> rồi dán vào cột <code>A (Article URL)</code> trên
            Google Sheets tab <code>News</code> và nhắn “Kiểm tra thay đổi / status” để AI phân tích trọn
            bộ Song ngữ + Từ vựng Band 7–8+ + Quiz IELTS Reading!
          </p>
        </div>
      )}

      {studioMode === 'deep' && activeDeep && (
        <div className="space-y-4">
          {/* Article Hero + Summary */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row">
              {activeDeep.imageUrl && (
                <img
                  src={activeDeep.imageUrl}
                  alt={activeDeep.title}
                  className="h-44 w-full shrink-0 rounded-2xl object-cover lg:h-40 lg:w-64"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-lg bg-slate-900 px-2 py-0.5 font-bold text-white dark:bg-slate-700">
                    {activeDeep.source}
                  </span>
                  <span className="rounded-lg bg-indigo-100 px-2 py-0.5 font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {activeDeep.category}
                  </span>
                  {activeDeep.publishedDate && (
                    <span className="text-slate-400">{activeDeep.publishedDate}</span>
                  )}
                  {activeDeep.url && (
                    <a
                      href={activeDeep.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-teal-600 hover:underline dark:text-teal-400"
                    >
                      Đọc bài gốc <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <h1 className="mt-2 text-lg font-extrabold leading-snug text-slate-900 sm:text-xl dark:text-white">
                  {activeDeep.title}
                </h1>

                {activeDeep.summaryPoints.length > 0 && (
                  <div className="mt-3 rounded-xl border border-teal-100 bg-teal-50/50 p-3 dark:border-teal-900/50 dark:bg-teal-950/20">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-teal-800 dark:text-teal-300">
                      Tóm tắt nhanh (Key Takeaways)
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {activeDeep.summaryPoints.map((pt, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="no-scrollbar mt-4 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-3 dark:border-slate-800">
              {(
                [
                  {
                    id: 'bilingual',
                    label: `Đọc Song ngữ (${activeDeep.paragraphs.length})`,
                    icon: BookOpen,
                  },
                  {
                    id: 'vocab',
                    label: `Từ vựng Band 7–8+ (${activeDeep.vocab.length})`,
                    icon: Sparkles,
                  },
                  {
                    id: 'quiz',
                    label: `Quiz IELTS Reading (${activeDeep.quiz.length})`,
                    icon: HelpCircle,
                  },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDeepTab(t.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold whitespace-nowrap transition ${
                      deepTab === t.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-tab 1: Bilingual Reader */}
          {deepTab === 'bilingual' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowVi((s) => !s)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold ${
                      showVi
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {showVi ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    <span>Dịch Việt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNotes((s) => !s)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold ${
                      showNotes
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Ghi chú IELTS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhraseMode((m) => !m);
                      setPhraseAnchor(null);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold ${
                      phraseMode
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <TextSelect className="h-3.5 w-3.5" />
                    <span>{phraseMode ? 'Chọn cụm: Bật' : 'Chọn cụm từ'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHighlightKnown((h) => !h)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold ${
                      highlightKnown
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <Highlighter className="h-3.5 w-3.5" />
                    <span>Từ đã học ({deepMatchedCount})</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  {[0.8, 0.95, 1.1].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setSpeechRate(spd)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                        speechRate === spd
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                  {activeDeep.paragraphs.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        handleSpeakQueue(
                          'deep-all',
                          activeDeep.paragraphs.map((p, idx) => ({ key: `deep-${idx}`, text: p.en }))
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700"
                    >
                      {speakingKey === 'deep-all' ? (
                        <>
                          <Square className="h-3 w-3 fill-current" /> Dừng
                        </>
                      ) : (
                        <>
                          <Volume2 className="h-3.5 w-3.5" /> Nghe bài
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {activeDeep.paragraphs.map((p, idx) => {
                const pKey = `deep-${idx}`;
                const isReadingThis = speakingWord?.paraKey === pKey;
                return (
                <div
                  key={idx}
                  data-news-para={pKey}
                  className={`rounded-2xl border bg-white p-4 shadow-xs transition dark:bg-slate-900 ${
                    isReadingThis
                      ? 'border-amber-400 bg-amber-50/30 ring-1 ring-amber-300/60 dark:border-amber-500/70 dark:bg-amber-950/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Đoạn {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSpeak(pKey, p.en)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {speakingKey === pKey ? (
                        <>
                          <Square className="h-3 w-3 fill-current text-indigo-600" /> Dừng
                        </>
                      ) : (
                        <>
                          <Volume2 className="h-3.5 w-3.5" /> Nghe
                        </>
                      )}
                    </button>
                  </div>

                  <p className="mt-2.5 text-[15px] leading-relaxed text-slate-900 sm:text-base sm:leading-7 dark:text-slate-100">
                    {renderInteractiveParagraph(p.en, pKey)}
                  </p>

                  {showVi && p.vi && (
                    <p className="mt-2.5 border-l-2 border-indigo-400 pl-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {p.vi}
                    </p>
                  )}

                  {showNotes && p.note && (
                    <div className="mt-2.5 rounded-xl bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      <strong className="font-bold">Góc học IELTS:</strong> {p.note}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {/* Sub-tab 2: High-Band Vocab & Collocations */}
          {deepTab === 'vocab' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activeDeep.vocab.map((v, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                        {v.word}
                      </h4>
                      {v.level && (
                        <span
                          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${getLevelBadgeClass(v.level)}`}
                        >
                          {v.level}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => speakText(v.word, accent, 0.9)}
                      className="rounded-xl bg-indigo-50 p-2 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300"
                      title="Nghe phát âm"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mt-2.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    {v.meaning}
                  </p>

                  {v.usage && (
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      <strong className="text-slate-700 dark:text-slate-200">Áp dụng IELTS:</strong>{' '}
                      {v.usage}
                    </p>
                  )}

                  {v.quote && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs italic text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                      “{v.quote}”
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Sub-tab 3: Interactive IELTS Reading Quiz */}
          {deepTab === 'quiz' && (
            <div className="space-y-3">
              {quizSubmitted && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                  <div>
                    <p className="text-sm font-extrabold text-indigo-900 dark:text-indigo-200">
                      Kết quả IELTS Reading:{' '}
                      {
                        activeDeep.quiz.filter(
                          (q, i) =>
                            (quizAnswers[i] || '').trim().toUpperCase() ===
                            q.answer.trim().toUpperCase()
                        ).length
                      }
                      /{activeDeep.quiz.length} câu đúng
                    </p>
                    <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80">
                      Xem phần giải thích chi tiết bên dưới mỗi câu để nắm rõ bẫy paraphrase.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setQuizAnswers({});
                      setQuizSubmitted(false);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Làm lại
                  </button>
                </div>
              )}

              {activeDeep.quiz.map((q, idx) => {
                const chosen = quizAnswers[idx] || '';
                const isCorrect =
                  chosen.trim().toUpperCase() === q.answer.trim().toUpperCase();
                return (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold ${
                          q.type === 'TFNG'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                        }`}
                      >
                        {q.type === 'TFNG' ? 'TRUE / FALSE / NOT GIVEN' : 'MULTIPLE CHOICE'}
                      </span>
                      <span className="text-xs font-bold text-slate-400">Câu {idx + 1}</span>
                    </div>

                    <p className="mt-2 text-sm font-bold leading-relaxed text-slate-900 dark:text-white">
                      {q.question}
                    </p>

                    <div
                      className={`mt-3 grid gap-2 ${
                        q.type === 'TFNG' ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
                      }`}
                    >
                      {(q.options || []).map((opt) => {
                        const selected = chosen === opt;
                        const optIsAnswer =
                          opt.trim().toUpperCase() === q.answer.trim().toUpperCase();
                        let style =
                          'border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
                        if (quizSubmitted) {
                          if (optIsAnswer) {
                            style =
                              'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200';
                          } else if (selected && !optIsAnswer) {
                            style =
                              'border-rose-500 bg-rose-50 text-rose-800 dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-200';
                          }
                        } else if (selected) {
                          style =
                            'border-indigo-600 bg-indigo-600 text-white shadow-xs';
                        }

                        return (
                          <button
                            key={opt}
                            type="button"
                            disabled={quizSubmitted}
                            onClick={() =>
                              setQuizAnswers((prev) => ({ ...prev, [idx]: opt }))
                            }
                            className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${style}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    {quizSubmitted && (
                      <div
                        className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-xs leading-relaxed ${
                          isCorrect
                            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                        }`}
                      >
                        {isCorrect ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                        )}
                        <div>
                          <p className="font-bold">
                            {isCorrect ? 'Chính xác!' : `Đáp án đúng: ${q.answer}`}
                          </p>
                          {q.explanation && <p className="mt-0.5">{q.explanation}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {!quizSubmitted && activeDeep.quiz.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuizSubmitted(true)}
                  className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-indigo-700"
                >
                  Chấm điểm IELTS Reading ({Object.keys(quizAnswers).length}/{activeDeep.quiz.length} câu đã chọn)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== INTERACTIVE WORD & PHRASE LOOKUP DRAWER ==================== */}
      {lookup && (
        <ReaderLookupDrawer
          lookup={lookup}
          accent={accent}
          isSheetConnected={isSheetConnected}
          targetSheetLabel="News Vocab"
          savedSyncStatus={activeSavedEntry?.syncStatus}
          savedSyncError={activeSavedEntry?.syncError}
          isAlreadySavedLocally={Boolean(activeSavedEntry)}
          accentTone="teal"
          onClose={() => {
            setLookup(null);
            setPhraseAnchor(null);
          }}
          onExpandRange={handleExpandLookup}
          onSave={(customMeaning) =>
            handleSaveWord(currentArticleTitle, currentArticleTopic, customMeaning)
          }
          onOpenSheetSetup={() => setSheetSetupOpen(true)}
        />
      )}
    </div>
  );
}
