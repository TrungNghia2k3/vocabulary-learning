import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FilePenLine,
  FileText,
  Keyboard,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  PenLine,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Sparkles,
  Square,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import type { Accent, IeltsTask2Format, IeltsTask2Prompt, IeltsTask2Section } from '../types';
import { speakParagraphQueue, speakText, stopSpeaking } from '../utils/speech';
import { getUrlIntParam, getUrlParam, syncUrlParams } from '../utils/urlParams';
import {
  EssayTypingPractice,
  splitIntoPracticeSentences,
  type EssayPracticeSentence,
} from './EssayTypingPractice';

interface IeltsTask2ViewProps {
  prompts: IeltsTask2Prompt[];
  formats: IeltsTask2Format[];
  accent: Accent;
}

type TopMode = 'prompts' | 'formats';
type Task2Tab = 'expressions' | 'sample' | 'typing' | 'writer' | 'drill';

const ESSAY_PARTS = [
  {
    id: 'intro',
    partKey: 'Introduction',
    label: 'Introduction',
    hint: 'Paraphrase đề bài + Nêu rõ quan điểm (Thesis statement) (~40–50 từ)',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-900/70',
    bg: 'bg-blue-50/40 dark:bg-blue-950/20',
    rows: 4,
  },
  {
    id: 'body1',
    partKey: 'Body 1',
    label: 'Body 1',
    hint: 'Luận điểm chính 1 + Giải thích + Ví dụ cụ thể (~90–110 từ)',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-900/70',
    bg: 'bg-emerald-50/40 dark:bg-emerald-950/20',
    rows: 6,
  },
  {
    id: 'body2',
    partKey: 'Body 2',
    label: 'Body 2',
    hint: 'Luận điểm chính 2 / Phản biện + Giải thích + Ví dụ (~90–110 từ)',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    border: 'border-violet-200 dark:border-violet-900/70',
    bg: 'bg-violet-50/40 dark:bg-violet-950/20',
    rows: 6,
  },
  {
    id: 'conclusion',
    partKey: 'Conclusion',
    label: 'Conclusion',
    hint: 'Tóm tắt lại 2 luận điểm + Khẳng định lại quan điểm (~30–40 từ)',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-900/70',
    bg: 'bg-amber-50/40 dark:bg-amber-950/20',
    rows: 4,
  },
] as const;

const PART_STYLE_MAP: Record<string, { badge: string; border: string; bg: string }> = {
  Introduction: {
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-900/70',
    bg: 'bg-blue-50/40 dark:bg-blue-950/20',
  },
  'Body 1': {
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-900/70',
    bg: 'bg-emerald-50/40 dark:bg-emerald-950/20',
  },
  'Body 2': {
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    border: 'border-violet-200 dark:border-violet-900/70',
    bg: 'bg-violet-50/40 dark:bg-violet-950/20',
  },
  Conclusion: {
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-900/70',
    bg: 'bg-amber-50/40 dark:bg-amber-950/20',
  },
};

function getPartStyle(part: string) {
  return (
    PART_STYLE_MAP[part] || {
      badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      border: 'border-slate-200 dark:border-slate-800',
      bg: 'bg-slate-50/50 dark:bg-slate-800/30',
    }
  );
}

function getQuestionTypeBadge(qType: string): string {
  const low = qType.toLowerCase();
  if (low.includes('opinion')) {
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300';
  }
  if (low.includes('discussion')) {
    return 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300';
  }
  if (low.includes('advantage')) {
    return 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300';
  }
  if (low.includes('positive')) {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function normalizeTypeKey(qType: string): string {
  return qType.trim().toLowerCase().replace(/\s+/g, ' ');
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

const TASK2_REQUIRED_PARTS = ['introduction', 'body 1', 'body 2', 'conclusion'] as const;

function isFullTask2Sections(sections: IeltsTask2Section[]): boolean {
  const present = new Set(
    sections
      .filter((s) => s.text.trim().length > 0)
      .map((s) => s.part.trim().toLowerCase())
  );
  return TASK2_REQUIRED_PARTS.every((p) => present.has(p));
}

function getTask2CompleteEssayCount(prompt: IeltsTask2Prompt): number {
  const list =
    prompt.sampleEssays && prompt.sampleEssays.length > 0
      ? prompt.sampleEssays
      : prompt.sampleSections.length > 0
        ? [{ id: 'default', label: 'Bài mẫu 1', sections: prompt.sampleSections }]
        : [];
  return list.filter((e) => isFullTask2Sections(e.sections)).length;
}

function getTask2ModelBadge(prompt: IeltsTask2Prompt): string | null {
  const count = getTask2CompleteEssayCount(prompt);
  if (count >= 2) return `${count} bài mẫu`;
  if (count === 1) return 'Bài mẫu';
  return null;
}

/** Highlights [template slots] like [Topic] or [Argument 1] inline while wrapping cleanly, with zero-layout-shift live TTS word highlight. */
function renderHighlightedTemplate(text: string, activeWordIdx?: number | null) {
  const parts = text.split(/(\[[^\]]*\])/g);
  if (activeWordIdx === null || activeWordIdx === undefined) {
    return parts.map((chunk, i) => {
      if (chunk.startsWith('[') && chunk.endsWith(']')) {
        return (
          <span
            key={i}
            className="mx-0.5 inline rounded-md bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900 box-decoration-clone dark:bg-amber-950/80 dark:text-amber-200"
          >
            {chunk}
          </span>
        );
      }
      return <span key={i}>{chunk}</span>;
    });
  }

  // Keep the exact same DOM structure & padding/weight as idle so active word highlight causes 0px reflow
  let wordIdx = 0;
  let prevEndedWithNonSpace = false;

  const renderWordsInChunk = (chunk: string, isBracketed: boolean) => {
    const tokens = chunk.split(/(\s+)/);
    return tokens.map((tok, j) => {
      if (!tok) return null;
      if (/^\s+$/.test(tok)) {
        prevEndedWithNonSpace = false;
        return <span key={j}>{tok}</span>;
      }
      const clean = tok.replace(/[[\]]/g, '');
      let myIdx = -1;
      if (clean.length > 0) {
        myIdx = prevEndedWithNonSpace ? Math.max(0, wordIdx - 1) : wordIdx++;
      }
      prevEndedWithNonSpace = true;
      const isActive = myIdx === activeWordIdx;
      return (
        <span
          key={j}
          className={`rounded-[3px] transition-colors duration-75 ${
            isActive
              ? isBracketed
                ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-400/90 dark:bg-amber-400 dark:text-slate-950'
                : 'bg-amber-300 text-slate-950 ring-2 ring-amber-300/90 dark:bg-amber-400 dark:text-slate-950 dark:ring-amber-400/90'
              : ''
          }`}
        >
          {tok}
        </span>
      );
    });
  };

  return parts.map((chunk, i) => {
    if (!chunk) return null;
    if (chunk.startsWith('[') && chunk.endsWith(']')) {
      return (
        <span
          key={i}
          className="mx-0.5 inline rounded-md bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900 box-decoration-clone dark:bg-amber-950/80 dark:text-amber-200"
        >
          {renderWordsInChunk(chunk, true)}
        </span>
      );
    }
    return <span key={i}>{renderWordsInChunk(chunk, false)}</span>;
  });
}

function findSectionTextForPart(format: IeltsTask2Format | null, partKey: string, idx: number): string {
  if (!format) return '';
  const exact = format.sections.find(
    (s) => s.part.toLowerCase() === partKey.toLowerCase()
  );
  if (exact) return exact.text;
  return format.sections[idx]?.text || '';
}

export function IeltsTask2View({ prompts, formats, accent }: IeltsTask2ViewProps) {
  const [topMode, setTopMode] = useState<TopMode>(() =>
    getUrlParam('mode') === 'formats' ? 'formats' : 'prompts'
  );
  const [promptTypeFilter, setPromptTypeFilter] = useState<string>(() =>
    getUrlParam('mode') !== 'formats' ? getUrlParam('type') || 'ALL' : 'ALL'
  );
  const [promptThemeFilter, setPromptThemeFilter] = useState<string>(
    () => getUrlParam('theme') || 'ALL'
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [formatTypeFilter, setFormatTypeFilter] = useState<string>(() =>
    getUrlParam('mode') === 'formats' ? getUrlParam('type') || 'ALL' : 'ALL'
  );
  const [formatSearch, setFormatSearch] = useState(() =>
    getUrlParam('mode') === 'formats' ? getUrlParam('q') || '' : ''
  );
  const [typingFormatIdInLibrary, setTypingFormatIdInLibrary] = useState<string | null>(null);
  const [promptTypingSource, setPromptTypingSource] = useState<'sample' | 'format'>(() =>
    getUrlParam('source') === 'format' ? 'format' : 'sample'
  );

  const [selectedId, setSelectedId] = useState<string>(() => {
    const fromUrl = getUrlParam('id');
    if (fromUrl && prompts.some((p) => p.id === fromUrl)) return fromUrl;
    return prompts[0]?.id || '';
  });
  const [sampleEssayIdx, setSampleEssayIdx] = useState<number>(() =>
    Math.max(0, getUrlIntParam('essay') || 0)
  );
  const [tab, setTab] = useState<Task2Tab>(() => {
    const t = getUrlParam('tab');
    return t === 'sample' || t === 'typing' || t === 'writer' || t === 'drill'
      ? t
      : 'expressions';
  });
  const [exprPartFilter, setExprPartFilter] = useState<string>(
    () => getUrlParam('part') || 'ALL'
  );
  const [search, setSearch] = useState(() =>
    getUrlParam('mode') !== 'formats' ? getUrlParam('q') || '' : ''
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Writer state
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeField, setActiveField] = useState<string>('intro');
  const [selectedFormatId, setSelectedFormatId] = useState<string>('');
  const [showFormatHints, setShowFormatHints] = useState<boolean>(true);
  const [writerSidebarMode, setWriterSidebarMode] = useState<'expressions' | 'sample'>('expressions');
  const [hideSampleInWriter, setHideSampleInWriter] = useState<boolean>(true);

  // Mini flashcard drill state
  const [drillIdx, setDrillIdx] = useState(0);
  const [drillFlipped, setDrillFlipped] = useState(false);

  // Live TTS word-by-word read-along state
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [speakingWord, setSpeakingWord] = useState<{ key: string; wordIdx: number } | null>(null);

  const stopReadAloud = () => {
    stopSpeaking();
    setSpeakingKey(null);
    setSpeakingWord(null);
  };

  useEffect(() => {
    stopReadAloud();
  }, [selectedId, sampleEssayIdx, tab, topMode]);

  useEffect(() => {
    if (topMode === 'formats') {
      syncUrlParams({
        mode: 'formats',
        type: formatTypeFilter !== 'ALL' ? formatTypeFilter : null,
        q: formatSearch.trim() || null,
      });
    } else {
      syncUrlParams({
        theme: promptThemeFilter !== 'ALL' ? promptThemeFilter : null,
        type: promptTypeFilter !== 'ALL' ? promptTypeFilter : null,
        id: selectedId || null,
        essay: sampleEssayIdx > 0 ? sampleEssayIdx : null,
        tab: tab !== 'expressions' ? tab : null,
        part: tab === 'expressions' && exprPartFilter !== 'ALL' ? exprPartFilter : null,
        source: tab === 'typing' && promptTypingSource !== 'sample' ? promptTypingSource : null,
        q: search.trim() || null,
      });
    }
  }, [
    topMode,
    formatTypeFilter,
    formatSearch,
    promptThemeFilter,
    promptTypeFilter,
    selectedId,
    sampleEssayIdx,
    tab,
    exprPartFilter,
    promptTypingSource,
    search,
  ]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const handleSpeakSingle = (key: string, rawText: string, rate = 1.0) => {
    if (speakingKey === key) {
      stopReadAloud();
      return;
    }
    const cleanText = rawText.replace(/[[\]]/g, '');
    setSpeakingKey(key);
    setSpeakingWord({ key, wordIdx: 0 });
    speakText(cleanText, accent, rate, {
      onWordChange: (wordIdx) => setSpeakingWord({ key, wordIdx }),
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

  const handleSpeakQueue = (
    queueKey: string,
    queueItems: Array<{ key: string; text: string }>,
    rate = 1.0
  ) => {
    if (speakingKey === queueKey) {
      stopReadAloud();
      return;
    }
    if (!queueItems.length) return;
    setSpeakingKey(queueKey);
    speakParagraphQueue(
      queueItems.map((it) => ({ key: it.key, text: it.text.replace(/[[\]]/g, '') })),
      accent,
      rate,
      {
        onItemStart: (key) => setSpeakingWord({ key, wordIdx: 0 }),
        onWordChange: (key, wordIdx) => setSpeakingWord({ key, wordIdx }),
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

  const copyWithFeedback = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500);
  };

  // Distinct Question Types & Themes for prompts
  const promptQuestionTypes = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of prompts) {
      map.set(p.questionType, (map.get(p.questionType) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [prompts]);

  const promptThemes = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of prompts) {
      if (!p.theme) continue;
      map.set(p.theme, (map.get(p.theme) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const na = parseInt(a[0].match(/Topic\s*(\d+)/i)?.[1] || '999', 10);
      const nb = parseInt(b[0].match(/Topic\s*(\d+)/i)?.[1] || '999', 10);
      if (na !== nb) return na - nb;
      return a[0].localeCompare(b[0]);
    });
  }, [prompts]);

  const formatQuestionTypes = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of formats) {
      map.set(f.questionType, (map.get(f.questionType) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [formats]);

  const visiblePrompts = useMemo(() => {
    return prompts.filter((p) => {
      if (promptTypeFilter !== 'ALL' && p.questionType !== promptTypeFilter) return false;
      if (promptThemeFilter !== 'ALL' && p.theme !== promptThemeFilter) return false;
      return true;
    });
  }, [prompts, promptTypeFilter, promptThemeFilter]);

  const pickerFilteredPrompts = useMemo(() => {
    const pq = pickerSearch.trim().toLowerCase();
    if (!pq) return visiblePrompts;
    return visiblePrompts.filter(
      (p) =>
        p.title.toLowerCase().includes(pq) ||
        p.prompt.toLowerCase().includes(pq) ||
        p.questionType.toLowerCase().includes(pq) ||
        (p.theme || '').toLowerCase().includes(pq)
    );
  }, [visiblePrompts, pickerSearch]);

  const activePrompt = useMemo(() => {
    return (
      visiblePrompts.find((p) => p.id === selectedId) ||
      visiblePrompts[0] ||
      prompts[0] ||
      null
    );
  }, [visiblePrompts, prompts, selectedId]);

  const activeSampleEssays = useMemo(() => {
    if (!activePrompt) return [];
    if (activePrompt.sampleEssays && activePrompt.sampleEssays.length > 0) {
      return activePrompt.sampleEssays;
    }
    if (activePrompt.sampleSections.length > 0) {
      return [{ id: `${activePrompt.id}::essay-1`, label: 'Bài mẫu 1', sections: activePrompt.sampleSections }];
    }
    return [];
  }, [activePrompt]);

  const safeSampleEssayIdx = Math.min(sampleEssayIdx, Math.max(0, activeSampleEssays.length - 1));
  const activeSampleEssay = activeSampleEssays[safeSampleEssayIdx] || null;
  const activeSampleSections = activeSampleEssay ? activeSampleEssay.sections : [];

  // Formats matching the active prompt's Question Type
  const matchingFormats = useMemo(() => {
    if (!activePrompt) return formats;
    const key = normalizeTypeKey(activePrompt.questionType);
    const exact = formats.filter((f) => normalizeTypeKey(f.questionType) === key);
    return exact.length > 0 ? exact : formats;
  }, [activePrompt, formats]);

  const activeWriterFormat = useMemo(() => {
    if (formats.length === 0) return null;
    const byId = formats.find((f) => f.id === selectedFormatId);
    if (byId) return byId;
    return matchingFormats[0] || formats[0] || null;
  }, [formats, selectedFormatId, matchingFormats]);

  // Sync state when switching prompts
  useEffect(() => {
    if (!activePrompt) return;
    setSearch('');
    setExprPartFilter('ALL');
    setSampleEssayIdx(0);
    setDrillIdx(0);
    setDrillFlipped(false);

    // Choose sensible default tab for this prompt
    if (activePrompt.expressions.length === 0 && activePrompt.sampleSections.length > 0) {
      setTab((prev) => (prev === 'writer' || prev === 'typing' ? prev : 'sample'));
      setWriterSidebarMode('sample');
    } else {
      setTab((prev) => (prev === 'sample' && activePrompt.sampleSections.length === 0 ? 'expressions' : prev));
      setWriterSidebarMode('expressions');
    }
    setPromptTypingSource(activePrompt.sampleSections.length > 0 ? 'sample' : 'format');

    // Auto-select matching format for the prompt's Question Type if current selection doesn't match
    const key = normalizeTypeKey(activePrompt.questionType);
    const matched = formats.find((f) => normalizeTypeKey(f.questionType) === key);
    if (matched) {
      setSelectedFormatId((cur) => {
        const curFmt = formats.find((f) => f.id === cur);
        if (curFmt && normalizeTypeKey(curFmt.questionType) === key) return cur;
        return matched.id;
      });
    }

    try {
      const saved = localStorage.getItem(`vocabStudio:task2Draft:${activePrompt.id}`);
      setDrafts(saved ? (JSON.parse(saved) as Record<string, string>) : {});
    } catch {
      setDrafts({});
    }
  }, [activePrompt?.id, formats]);

  const updateDraft = (partId: string, value: string) => {
    if (!activePrompt) return;
    setDrafts((prev) => {
      const next = { ...prev, [partId]: value };
      try {
        localStorage.setItem(`vocabStudio:task2Draft:${activePrompt.id}`, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  const applyFullFormatToWriter = (format: IeltsTask2Format) => {
    if (!activePrompt) return;
    const next: Record<string, string> = {};
    ESSAY_PARTS.forEach((p, idx) => {
      next[p.id] = findSectionTextForPart(format, p.partKey, idx);
    });
    setDrafts(next);
    try {
      localStorage.setItem(`vocabStudio:task2Draft:${activePrompt.id}`, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };

  const useFormatInWriterFromLibrary = (format: IeltsTask2Format) => {
    const key = normalizeTypeKey(format.questionType);
    const matchingPrompt = prompts.find((p) => normalizeTypeKey(p.questionType) === key);
    if (matchingPrompt) {
      setPromptTypeFilter('ALL');
      setPromptThemeFilter('ALL');
      setSelectedId(matchingPrompt.id);
    }
    setSelectedFormatId(format.id);
    setShowFormatHints(true);
    setTopMode('prompts');
    setTab('writer');
  };

  const insertPhraseIntoActive = (phrase: string) => {
    const cur = drafts[activeField] || '';
    const sep = cur && !cur.endsWith(' ') && !cur.endsWith('\n') ? ' ' : '';
    updateDraft(activeField, `${cur}${sep}${phrase}`);
  };

  const combinedEssayText = ESSAY_PARTS.map((p) => (drafts[p.id] || '').trim())
    .filter(Boolean)
    .join('\n\n');
  const combinedLower = combinedEssayText.toLowerCase();
  const totalWords = countWords(combinedEssayText);

  const usedExpressionIds = useMemo(() => {
    if (!activePrompt) return new Set<string>();
    const set = new Set<string>();
    for (const ex of activePrompt.expressions) {
      const target = ex.phrase.trim().toLowerCase();
      if (target.length >= 3 && combinedLower.includes(target)) {
        set.add(ex.id);
      }
    }
    return set;
  }, [activePrompt, combinedLower]);

  const expressionParts = useMemo(() => {
    if (!activePrompt) return [];
    const set = new Set<string>();
    for (const ex of activePrompt.expressions) {
      if (ex.part) set.add(ex.part);
    }
    return Array.from(set);
  }, [activePrompt]);

  const filteredFormats = useMemo(() => {
    const fq = formatSearch.trim().toLowerCase();
    return formats.filter((f) => {
      if (formatTypeFilter !== 'ALL' && f.questionType !== formatTypeFilter) return false;
      if (!fq) return true;
      return (
        f.questionType.toLowerCase().includes(fq) ||
        f.variantLabel.toLowerCase().includes(fq) ||
        f.sections.some((s) => s.text.toLowerCase().includes(fq) || s.part.toLowerCase().includes(fq))
      );
    });
  }, [formats, formatTypeFilter, formatSearch]);

  const buildSentencesFromSections = (
    prefix: string,
    sections: Array<{ part: string; text: string }>
  ): EssayPracticeSentence[] => {
    const out: EssayPracticeSentence[] = [];
    sections.forEach((sec, pIdx) => {
      const split = splitIntoPracticeSentences(sec.text);
      split.forEach((s, sIdx) => {
        out.push({
          id: `${prefix}::${pIdx}::${sIdx}`,
          part: sec.part,
          text: s,
        });
      });
    });
    return out;
  };

  const libraryTypingFormat = useMemo(() => {
    if (!typingFormatIdInLibrary) return null;
    return formats.find((f) => f.id === typingFormatIdInLibrary) || null;
  }, [formats, typingFormatIdInLibrary]);

  const libraryFormatTypingSentences = useMemo(() => {
    if (!libraryTypingFormat) return [];
    return buildSentencesFromSections(libraryTypingFormat.id, libraryTypingFormat.sections);
  }, [libraryTypingFormat]);

  const promptTypingSentences = useMemo(() => {
    if (!activePrompt) return [];
    if (promptTypingSource === 'sample' && activeSampleSections.length > 0) {
      return buildSentencesFromSections(
        `${activePrompt.id}::sample-e${safeSampleEssayIdx}`,
        activeSampleSections
      );
    }
    if (activeWriterFormat) {
      return buildSentencesFromSections(
        `${activePrompt.id}::${activeWriterFormat.id}`,
        activeWriterFormat.sections
      );
    }
    return [];
  }, [activePrompt, promptTypingSource, activeSampleSections, safeSampleEssayIdx, activeWriterFormat]);

  if (prompts.length === 0 && formats.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        Chưa có dữ liệu trong sheet <code>IELTS Writing Task 2</code>.
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filteredExpressions = (activePrompt?.expressions || []).filter((e) => {
    if (exprPartFilter !== 'ALL' && e.part !== exprPartFilter) return false;
    if (!q) return true;
    return (
      e.phrase.toLowerCase().includes(q) ||
      e.meaning.toLowerCase().includes(q) ||
      (e.part || '').toLowerCase().includes(q)
    );
  });

  const drillCard =
    activePrompt && activePrompt.expressions.length > 0
      ? activePrompt.expressions[drillIdx % activePrompt.expressions.length]
      : null;

  const fullSampleText = activeSampleSections.map((s) => s.text).join('\n\n');
  const activePromptIdxInVisible = activePrompt
    ? visiblePrompts.findIndex((p) => p.id === activePrompt.id)
    : 0;
  const activePromptModelBadge = activePrompt ? getTask2ModelBadge(activePrompt) : null;

  const goPrevPrompt = () => {
    if (visiblePrompts.length <= 1) return;
    const prev = activePromptIdxInVisible > 0 ? activePromptIdxInVisible - 1 : visiblePrompts.length - 1;
    setSelectedId(visiblePrompts[prev].id);
  };

  const goNextPrompt = () => {
    if (visiblePrompts.length <= 1) return;
    const next = (activePromptIdxInVisible + 1) % visiblePrompts.length;
    setSelectedId(visiblePrompts[next].id);
  };

  return (
    <div className="space-y-4">
      {/* Compact Top Header + Collapsible Prompt Picker */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-3.5 dark:border-slate-800 dark:bg-slate-900">
        {/* Tier 1: Title + 50/50 Mode Switch */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-xs">
              <FilePenLine className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-extrabold text-slate-900 dark:text-white">
                IELTS Writing Task 2 Studio
              </h2>
              <p className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">
                Đề bài phân theo dạng đề, khung bài mẫu chuẩn 4 đoạn & luyện gõ thuộc format.
              </p>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 sm:inline-flex sm:w-auto dark:bg-slate-800">
            <button
              onClick={() => setTopMode('prompts')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold whitespace-nowrap transition ${
                topMode === 'prompts'
                  ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              Đề bài ({prompts.length})
            </button>
            <button
              onClick={() => {
                setTopMode('formats');
                setPickerOpen(false);
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold whitespace-nowrap transition ${
                topMode === 'formats'
                  ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <LayoutTemplate className="h-3.5 w-3.5 shrink-0" />
              Khung bài mẫu ({formats.length})
            </button>
          </div>
        </div>

        {/* Tier 2 + Tier 3: Horizontal Swipeable Filter + Active Prompt Card & Balanced Controls */}
        {topMode === 'prompts' && activePrompt && (
          <>
            {promptQuestionTypes.length > 1 && (
              <div className="no-scrollbar mt-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2.5 pb-0.5 sm:flex-wrap dark:border-slate-800">
                <span className="shrink-0 text-[11px] font-bold whitespace-nowrap text-slate-500">
                  Dạng đề:
                </span>
                <button
                  onClick={() => setPromptTypeFilter('ALL')}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap transition ${
                    promptTypeFilter === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Tất cả ({prompts.length})
                </button>
                {promptQuestionTypes.map(([qt, count]) => (
                  <button
                    key={qt}
                    onClick={() => setPromptTypeFilter(qt)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap transition ${
                      promptTypeFilter === qt
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {qt} ({count})
                  </button>
                ))}
              </div>
            )}

            {promptThemes.length > 0 && (
              <div className="no-scrollbar mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap">
                <span className="shrink-0 text-[11px] font-bold whitespace-nowrap text-slate-500">
                  Theme:
                </span>
                <button
                  onClick={() => setPromptThemeFilter('ALL')}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap transition ${
                    promptThemeFilter === 'ALL'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Tất cả
                </button>
                {promptThemes.map(([th, count]) => (
                  <button
                    key={th}
                    onClick={() => setPromptThemeFilter(th)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap transition ${
                      promptThemeFilter === th
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {th.replace(/^Topic\s*\d+:\s*/i, '')} ({count})
                  </button>
                ))}
              </div>
            )}

            {/* Tier 3: Full-Width Active Prompt Card + Balanced Mobile Controls */}
            <div className="mt-2.5 flex flex-col gap-2 border-t border-slate-100 pt-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="group flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40 sm:flex-1 dark:border-slate-700/80 dark:bg-slate-800/50 dark:hover:border-indigo-600"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="shrink-0 text-[11px] font-extrabold text-slate-500">
                      Đề {activePromptIdxInVisible + 1}/{visiblePrompts.length}
                    </span>
                    <span
                      className={`truncate rounded px-1.5 py-0.5 text-[10px] font-bold ${getQuestionTypeBadge(
                        activePrompt.questionType
                      )}`}
                    >
                      {activePrompt.questionType}
                    </span>
                    {activePrompt.theme && (
                      <span className="truncate rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                        {activePrompt.theme.replace(/^Topic\s*\d+:\s*/i, '')}
                      </span>
                    )}
                    {activePromptModelBadge && (
                      <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        {activePromptModelBadge}
                      </span>
                    )}
                    {activePrompt.expressions.length > 0 && (
                      <span className="hidden shrink-0 text-[10px] font-semibold text-slate-400 sm:inline">
                        · {activePrompt.expressions.length} cụm từ
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs font-bold text-slate-900 dark:text-white">
                    {activePrompt.title}
                  </p>
                </div>
                <span className="hidden shrink-0 items-center gap-1 text-[11px] font-bold text-indigo-600 sm:inline-flex dark:text-indigo-400">
                  {pickerOpen ? 'Thu gọn' : 'Đổi đề'}
                  {pickerOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>

              <div className="grid grid-cols-[40px_1fr_40px] items-center gap-1.5 sm:flex sm:shrink-0">
                <button
                  type="button"
                  onClick={goPrevPrompt}
                  disabled={visiblePrompts.length <= 1}
                  title="Đề trước"
                  className="order-1 inline-flex h-9 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 sm:w-9 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  className={`order-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold whitespace-nowrap transition sm:order-3 ${
                    pickerOpen
                      ? 'bg-indigo-600 text-white shadow-xs hover:bg-indigo-700'
                      : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                  <span>Danh sách ({visiblePrompts.length})</span>
                  {pickerOpen ? (
                    <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={goNextPrompt}
                  disabled={visiblePrompts.length <= 1}
                  title="Đề tiếp theo"
                  className="order-3 inline-flex h-9 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 sm:order-2 sm:w-9 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Collapsible Searchable Prompt Picker Panel (Bounded height, auto-closes on select) */}
            {pickerOpen && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Tìm đề Task 2 theo chủ đề hoặc dạng đề..."
                      className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-8 pl-8 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                    />
                    {pickerSearch && (
                      <button
                        type="button"
                        onClick={() => setPickerSearch('')}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Hiện {pickerFilteredPrompts.length}/{visiblePrompts.length} đề
                  </span>
                </div>

                {pickerFilteredPrompts.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    Không tìm thấy đề bài phù hợp với từ khóa “{pickerSearch}”.
                  </div>
                ) : (
                  <div className="grid max-h-[360px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {pickerFilteredPrompts.map((p) => {
                      const active = p.id === activePrompt.id;
                      const origIdx = prompts.findIndex((x) => x.id === p.id);
                      const badge = getTask2ModelBadge(p);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(p.id);
                            setPickerOpen(false);
                          }}
                          className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                            active
                              ? 'border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-950/50'
                              : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-700'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              Đề #{origIdx + 1}
                            </span>
                            {p.theme && (
                              <span className="truncate rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950/70 dark:text-teal-300">
                                {p.theme.replace(/^Topic\s*\d+:\s*/i, '')}
                              </span>
                            )}
                            <div className="flex items-center gap-1">
                              {p.expressions.length > 0 && (
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {p.expressions.length} cụm
                                </span>
                              )}
                              {badge && (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                  {badge}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-xs font-bold text-slate-900 dark:text-white">
                            {p.title}
                          </p>
                          <div className="mt-auto pt-2">
                            <span
                              className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${getQuestionTypeBadge(
                                p.questionType
                              )}`}
                            >
                              {p.questionType}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODE A: KHUNG BÀI MẪU (FORMAT TEMPLATES LIBRARY)                      */}
      {/* ===================================================================== */}
      {topMode === 'formats' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-bold text-slate-500">Lọc theo dạng đề:</span>
                <button
                  onClick={() => setFormatTypeFilter('ALL')}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    formatTypeFilter === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Tất cả ({formats.length})
                </button>
                {formatQuestionTypes.map(([qt, count]) => (
                  <button
                    key={qt}
                    onClick={() => setFormatTypeFilter(qt)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                      formatTypeFilter === qt
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {qt} ({count})
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={formatSearch}
                  onChange={(e) => setFormatSearch(e.target.value)}
                  placeholder="Tìm mẫu câu, từ nối trong khung..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
            <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
              Phần chữ thường là <strong>khung cố định</strong> dùng cho mọi đề; phần tô vàng{' '}
              <span className="rounded bg-amber-100 px-1 py-0.5 font-bold text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
                [placeholder]
              </span>{' '}
              là vị trí cần thay ý theo đề bài cụ thể.
            </p>
          </div>

          {libraryTypingFormat ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/30">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${getQuestionTypeBadge(
                      libraryTypingFormat.questionType
                    )}`}
                  >
                    {libraryTypingFormat.questionType}
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {libraryTypingFormat.variantLabel}
                  </span>
                </div>
                <button
                  onClick={() => setTypingFormatIdInLibrary(null)}
                  className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Quay lại danh sách khung
                </button>
              </div>
              <EssayTypingPractice
                title={`Luyện gõ thuộc khung: ${libraryTypingFormat.questionType}`}
                subtitle={`${libraryTypingFormat.variantLabel} — Gõ lại từng câu trong 4 đoạn để thuộc nằm lòng cấu trúc bài luận.`}
                sentences={libraryFormatTypingSentences}
                accent={accent}
              />
            </div>
          ) : filteredFormats.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              Không tìm thấy khung bài mẫu nào phù hợp.
            </div>
          ) : (
            <div className="space-y-5">
              {filteredFormats.map((fmt, idx) => {
                const fullFmtText = fmt.sections.map((s) => s.text).join('\n\n');
                return (
                  <div
                    key={fmt.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
                  >
                    {/* Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50/70 via-white to-violet-50/50 px-5 py-3.5 dark:border-slate-800 dark:from-indigo-950/30 dark:via-slate-900 dark:to-violet-950/20">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-slate-900 px-2 py-0.5 text-[11px] font-extrabold text-white dark:bg-slate-700">
                          Format #{idx + 1}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${getQuestionTypeBadge(
                            fmt.questionType
                          )}`}
                        >
                          {fmt.questionType}
                        </span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {fmt.variantLabel}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => copyWithFeedback(`fmt-all-${fmt.id}`, fullFmtText)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {copiedKey === `fmt-all-${fmt.id}` ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" /> Đã chép khung
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" /> Sao chép cả khung
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setTypingFormatIdInLibrary(fmt.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                        >
                          <Keyboard className="h-3.5 w-3.5" /> Luyện gõ khung này
                        </button>
                        <button
                          onClick={() => useFormatInWriterFromLibrary(fmt)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
                        >
                          <Wand2 className="h-3.5 w-3.5" /> Dùng khung này luyện viết
                        </button>
                      </div>
                    </div>

                    {/* 4-Part Format Sections */}
                    <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
                      {fmt.sections.map((sec, sIdx) => {
                        const style = getPartStyle(sec.part);
                        const copyId = `fmt-sec-${fmt.id}-${sIdx}`;
                        const isReadingFmt = speakingWord?.key === copyId;
                        return (
                          <div
                            key={`${fmt.id}-${sIdx}`}
                            className={`flex flex-col justify-between rounded-xl border p-3.5 transition ${
                              isReadingFmt
                                ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-300/60 dark:border-amber-500/70 dark:bg-amber-950/20'
                                : `${style.border} ${style.bg}`
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${style.badge}`}
                                >
                                  {sec.part}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleSpeakSingle(copyId, sec.text, 1.0)}
                                    title={speakingKey === copyId ? 'Dừng phát' : 'Nghe mẫu đoạn này'}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/80 hover:text-indigo-600 dark:hover:bg-slate-800"
                                  >
                                    {speakingKey === copyId ? (
                                      <Square className="h-3 w-3 fill-current text-indigo-600" />
                                    ) : (
                                      <Volume2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => copyWithFeedback(copyId, sec.text)}
                                    title="Sao chép đoạn khung"
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/80 hover:text-slate-700 dark:hover:bg-slate-800"
                                  >
                                    {copiedKey === copyId ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <p className="mt-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                                {renderHighlightedTemplate(
                                  sec.text,
                                  isReadingFmt ? speakingWord.wordIdx : null
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODE B: ĐỀ BÀI & LUYỆN VIẾT                                           */}
      {/* ===================================================================== */}
      {topMode === 'prompts' && activePrompt && (
        <>
          {/* Selected Essay Prompt Banner */}
          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/60 p-5 shadow-xs dark:border-indigo-900/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-violet-950/30">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white">
                    {activePrompt.questionType}
                  </span>
                  {activePrompt.expressions.length > 0 && (
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {activePrompt.expressions.length} cụm từ & ý tưởng
                    </span>
                  )}
                  {activePromptModelBadge && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {activePromptModelBadge} (đủ 4 phần)
                    </span>
                  )}
                  {matchingFormats.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      {matchingFormats.length} khung bài mẫu khớp dạng đề
                    </span>
                  )}
                </div>
                <p className="text-base leading-relaxed font-bold text-slate-900 sm:text-lg dark:text-white">
                  “{activePrompt.prompt}”
                </p>
              </div>
              <button
                onClick={() => speakText(activePrompt.prompt, accent, 0.92)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-indigo-600 shadow-xs hover:bg-indigo-50 dark:bg-slate-800 dark:text-indigo-300"
              >
                <Volume2 className="h-4 w-4" /> Đọc đề bài
              </button>
            </div>

            {/* Sub-Tabs */}
            <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-white/80 p-1.5 dark:bg-slate-900/70">
              {[
                ...(activePrompt.expressions.length > 0
                  ? [
                      {
                        id: 'expressions' as Task2Tab,
                        label: `Kho cụm từ (${activePrompt.expressions.length})`,
                        icon: BookOpen,
                      },
                    ]
                  : []),
                ...(activePrompt.sampleSections.length > 0
                  ? [
                      {
                        id: 'sample' as Task2Tab,
                        label: `Bài mẫu ${activePrompt.sampleSections.length} phần`,
                        icon: FileText,
                      },
                    ]
                  : []),
                {
                  id: 'typing' as Task2Tab,
                  label:
                    activePrompt.sampleSections.length > 0
                      ? 'Luyện gõ Essay'
                      : 'Luyện gõ Format',
                  icon: Keyboard,
                },
                {
                  id: 'writer' as Task2Tab,
                  label: 'Luyện viết (kèm khung mẫu)',
                  icon: PenLine,
                },
                ...(activePrompt.expressions.length > 0
                  ? [
                      {
                        id: 'drill' as Task2Tab,
                        label: 'Ôn nhanh Flashcard',
                        icon: Layers,
                      },
                    ]
                  : []),
              ].map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`inline-flex flex-1 min-w-[140px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      active
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TAB 1: Expressions & Ideas Bank */}
          {tab === 'expressions' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm cụm từ tiếng Anh hoặc nghĩa tiếng Việt trong đề này..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-sm outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-900"
                  />
                </div>

                {expressionParts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setExprPartFilter('ALL')}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                        exprPartFilter === 'ALL'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      Tất cả phần
                    </button>
                    {expressionParts.map((pt) => (
                      <button
                        key={pt}
                        onClick={() => setExprPartFilter(pt)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                          exprPartFilter === pt
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredExpressions.map((ex, idx) => {
                  const isUsed = usedExpressionIds.has(ex.id);
                  return (
                    <div
                      key={ex.id}
                      className={`flex flex-col justify-between rounded-2xl border p-4 shadow-xs transition ${
                        isUsed
                          ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20'
                          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-slate-400">#{idx + 1}</span>
                            {ex.part && (
                              <span
                                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                  getPartStyle(ex.part).badge
                                }`}
                              >
                                {ex.part}
                              </span>
                            )}
                            {isUsed && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" /> Đã dùng trong bài viết
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm leading-snug font-bold text-indigo-700 dark:text-indigo-300">
                            {ex.phrase}
                          </p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {ex.meaning}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => speakText(ex.phrase, accent, 0.92)}
                            title="Phát âm"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950"
                          >
                            <Volume2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => copyWithFeedback(ex.id, ex.phrase)}
                            title="Sao chép cụm từ"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                          >
                            {copiedKey === ex.id ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Structured 4-Part Model Essay (supports 1 or multiple sample essays) */}
          {tab === 'sample' && activeSampleSections.length > 0 && (
            <div className="space-y-4">
              {activeSampleEssays.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 dark:border-emerald-900/70 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                    <Layers className="h-4 w-4" />
                    <span>Đề này có {activeSampleEssays.length} bài mẫu:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeSampleEssays.map((ev, idx) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setSampleEssayIdx(idx)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                          idx === safeSampleEssayIdx
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 hover:bg-emerald-100/70 dark:bg-slate-900 dark:text-slate-200'
                        }`}
                      >
                        {ev.label} ({countWords(ev.sections.map((s) => s.text).join(' '))} từ)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {activeSampleEssays.length > 1
                      ? `${activeSampleEssay?.label || 'Bài mẫu'} — bố cục 4 phần`
                      : 'Bài luận mẫu theo bố cục 4 phần'}{' '}
                    ({countWords(fullSampleText)} từ)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Phần tô vàng là nội dung triển khai theo đề; phần chữ thường là khung cố định từ bảng Format.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      handleSpeakQueue(
                        't2-sample-full',
                        activeSampleSections.map((sec, idx) => ({
                          key: `sample-sec-${idx}`,
                          text: sec.text,
                        })),
                        1.0
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-300"
                  >
                    {speakingKey === 't2-sample-full' ? (
                      <>
                        <Square className="h-3 w-3 fill-current" /> Dừng đọc
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-3.5 w-3.5" /> Nghe toàn bài
                      </>
                    )}
                  </button>
                  <button
                    onClick={() =>
                      copyWithFeedback('sample-full', fullSampleText.replace(/[[\]]/g, ''))
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    {copiedKey === 'sample-full' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" /> Đã sao chép
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Sao chép cả bài (bỏ dấu [])
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setTab('writer')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    <PenLine className="h-3.5 w-3.5" /> Luyện viết đề này
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {activeSampleSections.map((sec, idx) => {
                  const style = getPartStyle(sec.part);
                  const copyId = `sample-sec-${idx}`;
                  const isReadingSec = speakingWord?.key === copyId;
                  return (
                    <div
                      key={`${sec.part}-${idx}`}
                      className={`rounded-2xl border p-4 shadow-xs transition ${
                        isReadingSec
                          ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-300/60 dark:border-amber-500/70 dark:bg-amber-950/20'
                          : `${style.border} ${style.bg}`
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${style.badge}`}
                          >
                            {sec.part}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {countWords(sec.text)} từ
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSpeakSingle(copyId, sec.text, 1.0)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/80 hover:text-indigo-600 dark:hover:bg-slate-800"
                            title={speakingKey === copyId ? 'Dừng phát' : 'Nghe đoạn này'}
                          >
                            {speakingKey === copyId ? (
                              <Square className="h-3.5 w-3.5 fill-current text-indigo-600" />
                            ) : (
                              <Volume2 className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => copyWithFeedback(copyId, sec.text.replace(/[[\]]/g, ''))}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/80 hover:text-slate-700 dark:hover:bg-slate-800"
                            title="Sao chép đoạn"
                          >
                            {copiedKey === copyId ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <p className="mt-2.5 text-sm leading-relaxed text-slate-800 sm:text-[15px] dark:text-slate-100">
                        {renderHighlightedTemplate(
                          sec.text,
                          isReadingSec ? speakingWord.wordIdx : null
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2.5: Essay / Format Typing Practice */}
          {tab === 'typing' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Nguồn câu luyện gõ:</span>
                  {activePrompt.sampleSections.length > 0 && (
                    <button
                      onClick={() => setPromptTypingSource('sample')}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        promptTypingSource === 'sample'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      Bài mẫu 4 phần của đề này
                    </button>
                  )}
                  {promptTypingSource === 'sample' && activeSampleEssays.length > 1 && (
                    <div className="flex gap-1">
                      {activeSampleEssays.map((ev, idx) => (
                        <button
                          key={ev.id}
                          onClick={() => setSampleEssayIdx(idx)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                            idx === safeSampleEssayIdx
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {ev.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {formats.length > 0 && (
                    <button
                      onClick={() => setPromptTypingSource('format')}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        promptTypingSource === 'format' || activePrompt.sampleSections.length === 0
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      Khung bài mẫu (Format)
                    </button>
                  )}
                </div>

                {(promptTypingSource === 'format' || activePrompt.sampleSections.length === 0) &&
                  formats.length > 0 &&
                  activeWriterFormat && (
                    <select
                      value={activeWriterFormat.id}
                      onChange={(e) => setSelectedFormatId(e.target.value)}
                      className="min-w-[220px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {formats.map((f) => {
                        const isMatch =
                          normalizeTypeKey(f.questionType) ===
                          normalizeTypeKey(activePrompt.questionType);
                        return (
                          <option key={f.id} value={f.id}>
                            {isMatch ? '★ ' : ''}
                            {f.questionType} — {f.variantLabel}
                          </option>
                        );
                      })}
                    </select>
                  )}
              </div>

              <EssayTypingPractice
                title={
                  promptTypingSource === 'sample' && activePrompt.sampleSections.length > 0
                    ? `Luyện gõ thuộc bài mẫu Task 2 (${activePrompt.questionType})`
                    : `Luyện gõ thuộc khung Format: ${activeWriterFormat?.questionType || activePrompt.questionType}`
                }
                subtitle={
                  promptTypingSource === 'sample' && activePrompt.sampleSections.length > 0
                    ? 'Gõ lại chính xác từng câu của bài luận mẫu 4 phần để ghi nhớ cấu trúc học thuật.'
                    : `${activeWriterFormat?.variantLabel || ''} — Gõ lại từng câu của khung mẫu 4 đoạn để thuộc nằm lòng bố cục.`
                }
                sentences={promptTypingSentences}
                accent={accent}
              />
            </div>
          )}

          {/* TAB 3: Essay Writer + Integrated Format Skeleton + Live Phrase Tracker */}
          {tab === 'writer' && (
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
              {/* Left Sticky Assistant Panel (Expressions Tracker or Model Essay Peek) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:sticky lg:top-20 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                {activePrompt.expressions.length > 0 && activePrompt.sampleSections.length > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    <button
                      onClick={() => setWriterSidebarMode('expressions')}
                      className={`rounded-lg py-1.5 text-xs font-bold transition ${
                        writerSidebarMode === 'expressions'
                          ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                          : 'text-slate-500'
                      }`}
                    >
                      Cụm từ ({usedExpressionIds.size}/{activePrompt.expressions.length})
                    </button>
                    <button
                      onClick={() => setWriterSidebarMode('sample')}
                      className={`rounded-lg py-1.5 text-xs font-bold transition ${
                        writerSidebarMode === 'sample'
                          ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-300'
                          : 'text-slate-500'
                      }`}
                    >
                      Bài mẫu tham khảo
                    </button>
                  </div>
                )}

                {writerSidebarMode === 'sample' && activePrompt.sampleSections.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                      <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                        <FileText className="h-4 w-4 text-emerald-500" />
                        Bài mẫu đối chiếu
                      </h3>
                      <button
                        onClick={() => setHideSampleInWriter((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {hideSampleInWriter ? (
                          <>
                            <Eye className="h-3.5 w-3.5" /> Hiện bài mẫu
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3.5 w-3.5" /> Ẩn để tự viết
                          </>
                        )}
                      </button>
                    </div>
                    <div
                      className={`mt-3 max-h-[540px] space-y-3 overflow-y-auto pr-1 transition ${
                        hideSampleInWriter ? 'select-none blur-sm opacity-60' : ''
                      }`}
                    >
                      {activeSampleSections.map((sec, i) => {
                        const style = getPartStyle(sec.part);
                        return (
                          <div
                            key={i}
                            className={`rounded-xl border p-3 text-xs ${style.border} ${style.bg}`}
                          >
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[10px] font-extrabold ${style.badge}`}
                            >
                              {sec.part}
                            </span>
                            <p className="mt-1.5 leading-relaxed text-slate-800 dark:text-slate-200">
                              {renderHighlightedTemplate(sec.text)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : activePrompt.expressions.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div>
                        <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                          <Sparkles className="h-4 w-4 text-indigo-500" />
                          Cụm từ mục tiêu ({usedExpressionIds.size}/{activePrompt.expressions.length})
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Bấm <strong>+ Chèn</strong> để đưa vào đoạn đang chọn, hoặc gõ tự nhiên để tự tích xanh.
                        </p>
                      </div>
                    </div>

                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Lọc cụm từ nhanh..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>

                    <div className="mt-3 max-h-[540px] space-y-2 overflow-y-auto pr-1">
                      {filteredExpressions.map((ex) => {
                        const used = usedExpressionIds.has(ex.id);
                        return (
                          <div
                            key={ex.id}
                            className={`rounded-xl border p-2.5 text-xs transition ${
                              used
                                ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/40'
                                : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p
                                  className={`font-bold ${
                                    used
                                      ? 'text-emerald-800 dark:text-emerald-300'
                                      : 'text-slate-800 dark:text-slate-100'
                                  }`}
                                >
                                  {used ? '✓ ' : ''}
                                  {ex.phrase}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  {ex.meaning}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => insertPhraseIntoActive(ex.phrase)}
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                              >
                                <Plus className="h-3 w-3" /> Chèn
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500">
                    Đề này chưa có danh sách cụm từ riêng. Hãy dùng <strong>Khung bài mẫu</strong> bên phải để luyện viết chuẩn bố cục 4 đoạn!
                  </div>
                )}
              </div>

              {/* Right 4-Paragraph Essay Editor + Integrated Format Skeleton Bar */}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Trình soạn bài luận IELTS Task 2
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tổng độ dài:{' '}
                      <strong className={totalWords >= 250 ? 'text-emerald-600' : 'text-indigo-600'}>
                        {totalWords} / 250+ từ
                      </strong>
                      {activePrompt.expressions.length > 0 && (
                        <>
                          {' '}
                          · Cụm từ đã áp dụng:{' '}
                          <strong className="text-emerald-600">{usedExpressionIds.size}</strong>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => copyWithFeedback('essay-full', combinedEssayText)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                    >
                      {copiedKey === 'essay-full' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" /> Đã chép
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Sao chép bài
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setDrafts({});
                        localStorage.removeItem(`vocabStudio:task2Draft:${activePrompt.id}`);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Xóa nháp
                    </button>
                  </div>
                </div>

                {/* Integrated Format Template Toolbar */}
                {formats.length > 0 && activeWriterFormat && (
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <LayoutTemplate className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
                          Khung bài mẫu gợi ý
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getQuestionTypeBadge(
                            activeWriterFormat.questionType
                          )}`}
                        >
                          {activeWriterFormat.questionType}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowFormatHints((v) => !v)}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
                        >
                          {showFormatHints ? (
                            <>
                              <EyeOff className="h-3 w-3" /> Ẩn gợi ý khung
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3" /> Hiện gợi ý khung
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFullFormatToWriter(activeWriterFormat)}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-amber-700"
                        >
                          <Wand2 className="h-3 w-3" /> Điền cả khung 4 đoạn
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                        Chọn khung:
                      </label>
                      <select
                        value={activeWriterFormat.id}
                        onChange={(e) => setSelectedFormatId(e.target.value)}
                        className="flex-1 min-w-[200px] rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {formats.map((f) => {
                          const isMatch =
                            normalizeTypeKey(f.questionType) ===
                            normalizeTypeKey(activePrompt.questionType);
                          return (
                            <option key={f.id} value={f.id}>
                              {isMatch ? '★ ' : ''}
                              {f.questionType} — {f.variantLabel}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                )}

                {/* 4 Paragraph Editors with Inline Format Skeleton Reference */}
                {ESSAY_PARTS.map((part, partIdx) => {
                  const isFocused = activeField === part.id;
                  const partTemplateText = findSectionTextForPart(
                    activeWriterFormat,
                    part.partKey,
                    partIdx
                  );
                  return (
                    <div key={part.id} className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${part.badge}`}
                          >
                            {part.label}
                          </span>
                          {isFocused && (
                            <span className="text-[10px] font-semibold text-indigo-500">
                              • Đang chọn để chèn cụm từ
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {partTemplateText && (
                            <button
                              type="button"
                              onClick={() => updateDraft(part.id, partTemplateText)}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-amber-100 hover:text-amber-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-amber-950 dark:hover:text-amber-200"
                              title="Chèn khung mẫu của đoạn này vào ô nhập"
                            >
                              <Wand2 className="h-3 w-3" /> Điền khung đoạn này
                            </button>
                          )}
                          <span className="text-[11px] font-medium text-slate-400">
                            {countWords(drafts[part.id] || '')} từ
                          </span>
                        </div>
                      </div>

                      {showFormatHints && partTemplateText && (
                        <div
                          className={`rounded-xl border px-3 py-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200 ${part.border} ${part.bg}`}
                        >
                          <span className="mr-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                            Khung mẫu:
                          </span>
                          {renderHighlightedTemplate(partTemplateText)}
                        </div>
                      )}

                      <textarea
                        rows={part.rows}
                        value={drafts[part.id] || ''}
                        onFocus={() => setActiveField(part.id)}
                        onChange={(e) => updateDraft(part.id, e.target.value)}
                        placeholder={part.hint}
                        className={`w-full rounded-xl border p-3 text-sm leading-relaxed outline-none transition ${
                          isFocused
                            ? 'border-indigo-500 bg-white ring-2 ring-indigo-500/15 dark:border-indigo-400 dark:bg-slate-800'
                            : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: Quick Flashcard Drill for Prompt Expressions */}
          {tab === 'drill' && drillCard && (
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Ôn nhanh cụm từ cho đề đang chọn</span>
                <span className="rounded-lg bg-indigo-50 px-2.5 py-1 font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {(drillIdx % activePrompt.expressions.length) + 1} /{' '}
                  {activePrompt.expressions.length}
                </span>
              </div>

              <div
                onClick={() => setDrillFlipped((f) => !f)}
                className="flex min-h-[260px] cursor-pointer flex-col justify-between rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-lg transition hover:opacity-95"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                    {drillFlipped
                      ? 'Tiếng Anh học thuật'
                      : 'Nghĩa tiếng Việt — Hãy nhớ lại cụm tiếng Anh'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      speakText(drillCard.phrase, accent, 0.92);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 hover:bg-white/30"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="my-auto py-6 text-center">
                  <p className="text-xl leading-relaxed font-extrabold sm:text-2xl">
                    {drillFlipped ? drillCard.phrase : drillCard.meaning}
                  </p>
                  {drillFlipped && (
                    <p className="mt-3 text-sm text-indigo-100">{drillCard.meaning}</p>
                  )}
                </div>

                <div className="flex items-center justify-center gap-1.5 text-xs text-indigo-100">
                  <RotateCw className="h-3.5 w-3.5" /> Nhấn vào thẻ để lật
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setDrillFlipped(false);
                    setDrillIdx((i) =>
                      i > 0 ? i - 1 : Math.max(0, activePrompt.expressions.length - 1)
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-900"
                >
                  <ChevronLeft className="h-4 w-4" /> Trước
                </button>
                <button
                  onClick={() => {
                    setDrillFlipped(false);
                    setDrillIdx((i) => (i + 1) % activePrompt.expressions.length);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
                >
                  Tiếp <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
