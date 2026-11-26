import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Keyboard,
  Layers,
  LayoutGrid,
  ListChecks,
  PenLine,
  RotateCcw,
  Search,
  Square,
  Volume2,
  X,
  ZoomIn,
} from 'lucide-react';
import type {
  Accent,
  IeltsTask1Example,
  IeltsTask1Item,
  IeltsTask1Section,
} from '../types';
import { speakParagraphQueue, speakText, stopSpeaking } from '../utils/speech';
import {
  EssayTypingPractice,
  splitIntoPracticeSentences,
  type EssayPracticeSentence,
} from './EssayTypingPractice';

interface IeltsTask1ViewProps {
  items: IeltsTask1Item[];
  examples: IeltsTask1Example[];
  accent: Accent;
}

type StudyTab = 'breakdown' | 'essay' | 'typing' | 'practice';
type TopSection = 'tasks' | 'examples';

const PART_STYLES: Record<
  string,
  { badge: string; border: string; bg: string; labelVi: string }
> = {
  Introduction: {
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-900/70',
    bg: 'bg-blue-50/40 dark:bg-blue-950/20',
    labelVi: 'Mở bài (Paraphrase đề bài)',
  },
  Overview: {
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-900/70',
    bg: 'bg-amber-50/40 dark:bg-amber-950/20',
    labelVi: 'Tổng quan (Xu hướng nổi bật nhất)',
  },
  'Body 1': {
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-900/70',
    bg: 'bg-emerald-50/40 dark:bg-emerald-950/20',
    labelVi: 'Thân bài 1 (Chi tiết nhóm số liệu 1)',
  },
  'Body 2': {
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    border: 'border-violet-200 dark:border-violet-900/70',
    bg: 'bg-violet-50/40 dark:bg-violet-950/20',
    labelVi: 'Thân bài 2 (Chi tiết nhóm số liệu 2)',
  },
};

function getPartStyle(part: string) {
  return (
    PART_STYLES[part] || {
      badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      border: 'border-slate-200 dark:border-slate-800',
      bg: 'bg-slate-50/50 dark:bg-slate-800/30',
      labelVi: part,
    }
  );
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

const TASK1_REQUIRED_PARTS = ['introduction', 'overview', 'body 1', 'body 2'] as const;

function isFullTask1Sections(sections: IeltsTask1Section[]): boolean {
  const present = new Set(
    sections
      .filter((s) => s.sentences.some((sent) => sent.text.trim().length > 0))
      .map((s) => s.part.trim().toLowerCase())
  );
  return TASK1_REQUIRED_PARTS.every((p) => present.has(p));
}

function getCompleteEssayCount(task: IeltsTask1Item): number {
  const list = task.essays && task.essays.length > 0 ? task.essays : [{ id: 'default', label: 'Bài mẫu 1', sections: task.sections }];
  return list.filter((e) => isFullTask1Sections(e.sections)).length;
}

function getTask1ModelBadge(task: IeltsTask1Item): string | null {
  const count = getCompleteEssayCount(task);
  if (count >= 2) return `${count} bài mẫu`;
  if (count === 1) return 'Bài mẫu';
  return null;
}

function assembleEssayParagraphs(
  sections: IeltsTask1Section[],
  introIdx: number,
  overviewIdx: number
): string[] {
  const paragraphs: string[] = [];
  for (const sec of sections) {
    if (sec.part === 'Introduction' && sec.sentences.length > 1) {
      paragraphs.push(sec.sentences[Math.min(introIdx, sec.sentences.length - 1)].text);
    } else if (sec.part === 'Overview' && sec.sentences.length > 1) {
      paragraphs.push(sec.sentences[Math.min(overviewIdx, sec.sentences.length - 1)].text);
    } else {
      paragraphs.push(sec.sentences.map((s) => s.text).join(' '));
    }
  }
  return paragraphs.filter(Boolean);
}

/** Highlights [template slots] like [the lake side] or [9] inside Map/Chart Example sentences, with zero-layout-shift live TTS word highlight. */
function renderHighlightedTemplate(text: string, activeWordIdx?: number | null) {
  const parts = text.split(/(\[[^\]]+\])/g);
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
      // If a bracketed chunk touches an adjacent non-space char (e.g. `([9]),`), it belongs to the same whitespace word
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

export function IeltsTask1View({ items, examples, accent }: IeltsTask1ViewProps) {
  const [topSection, setTopSection] = useState<TopSection>('tasks');
  const [typeFilter, setTypeFilter] = useState<'all' | 'chart' | 'map' | 'process'>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [onlyMultiEssay, setOnlyMultiEssay] = useState(false);

  const [examplePartFilter, setExamplePartFilter] = useState<string>('ALL');
  const [exampleSearch, setExampleSearch] = useState('');
  const [exampleTypingMode, setExampleTypingMode] = useState(false);
  const [copiedExId, setCopiedExId] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>(items[0]?.id || '');
  const [essayIdx, setEssayIdx] = useState<number>(0);
  const [studyTab, setStudyTab] = useState<StudyTab>('breakdown');
  const [zoomOpen, setZoomOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Selected variant index when Introduction or Overview has multiple paraphrases inside 1 essay
  const [introIdx, setIntroIdx] = useState(0);
  const [overviewIdx, setOverviewIdx] = useState(0);

  // Practice drafts saved per task id in localStorage
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealedParts, setRevealedParts] = useState<Record<string, boolean>>({});

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
  }, [selectedId, essayIdx, studyTab, topSection]);

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

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return items;
    return items.filter((it) => it.taskType === typeFilter);
  }, [items, typeFilter]);

  const pickerFiltered = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return filtered.filter((t) => {
      if (onlyMultiEssay && t.essays.length < 2) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.chartType.toLowerCase().includes(q) ||
        t.sourceSheet.toLowerCase().includes(q)
      );
    });
  }, [filtered, pickerSearch, onlyMultiEssay]);

  const multiEssayCount = useMemo(
    () => filtered.filter((t) => t.essays.length >= 2).length,
    [filtered]
  );

  const examplesByType = useMemo(() => {
    if (typeFilter === 'all') return examples;
    return examples.filter((e) => e.taskType === typeFilter);
  }, [examples, typeFilter]);

  const exampleParts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ex of examplesByType) {
      counts.set(ex.part, (counts.get(ex.part) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [examplesByType]);

  const filteredExamples = useMemo(() => {
    const q = exampleSearch.trim().toLowerCase();
    return examplesByType.filter((ex) => {
      if (examplePartFilter !== 'ALL' && ex.part !== examplePartFilter) return false;
      if (!q) return true;
      return (
        ex.text.toLowerCase().includes(q) ||
        ex.part.toLowerCase().includes(q) ||
        (ex.meaning || '').toLowerCase().includes(q)
      );
    });
  }, [examplesByType, examplePartFilter, exampleSearch]);

  const activeTask = useMemo(() => {
    return filtered.find((it) => it.id === selectedId) || filtered[0] || null;
  }, [filtered, selectedId]);

  const activeEssays = useMemo(() => {
    if (!activeTask) return [];
    return activeTask.essays && activeTask.essays.length > 0
      ? activeTask.essays
      : [{ id: `${activeTask.id}::essay-1`, label: 'Bài mẫu 1', sections: activeTask.sections }];
  }, [activeTask]);

  const safeEssayIdx = Math.min(essayIdx, Math.max(0, activeEssays.length - 1));
  const activeEssay = activeEssays[safeEssayIdx] || null;
  const activeSections = activeEssay ? activeEssay.sections : activeTask?.sections || [];

  useEffect(() => {
    if (!activeTask) return;
    setEssayIdx(0);
    setIntroIdx(0);
    setOverviewIdx(0);
    setRevealedParts({});
    try {
      const saved = localStorage.getItem(`vocabStudio:task1Draft:${activeTask.id}`);
      setDrafts(saved ? (JSON.parse(saved) as Record<string, string>) : {});
    } catch {
      setDrafts({});
    }
  }, [activeTask?.id]);

  // Reset intro/overview variant indexes when switching between Essay 1 and Essay 2
  useEffect(() => {
    setIntroIdx(0);
    setOverviewIdx(0);
  }, [safeEssayIdx]);

  const updateDraft = (part: string, val: string) => {
    if (!activeTask) return;
    setDrafts((prev) => {
      const next = { ...prev, [part]: val };
      try {
        localStorage.setItem(`vocabStudio:task1Draft:${activeTask.id}`, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  const task1TypingSentences = useMemo<EssayPracticeSentence[]>(() => {
    if (!activeTask) return [];
    const out: EssayPracticeSentence[] = [];
    for (const sec of activeSections) {
      const chosenRows =
        sec.part === 'Introduction' && sec.sentences.length > 1
          ? [sec.sentences[Math.min(introIdx, sec.sentences.length - 1)]]
          : sec.part === 'Overview' && sec.sentences.length > 1
            ? [sec.sentences[Math.min(overviewIdx, sec.sentences.length - 1)]]
            : sec.sentences;

      chosenRows.forEach((row, rIdx) => {
        const split = splitIntoPracticeSentences(row.text);
        split.forEach((s, sIdx) => {
          out.push({
            id: `${activeTask.id}::e${safeEssayIdx}::${sec.part}::${rIdx}::${sIdx}`,
            part: sec.part,
            text: s,
            meaning: sIdx === 0 ? row.meaning : undefined,
          });
        });
      });
    }
    return out;
  }, [activeTask, activeSections, safeEssayIdx, introIdx, overviewIdx]);

  const exampleTypingSentences = useMemo<EssayPracticeSentence[]>(() => {
    return filteredExamples.map((ex) => ({
      id: ex.id,
      part: `${ex.sourceSheet.replace(/^IELTS\s+/i, '')} · ${ex.part}`,
      text: ex.text,
      meaning: ex.meaning,
    }));
  }, [filteredExamples]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        Chưa có dữ liệu IELTS Writing Task 1. Hãy thêm bài mẫu vào sheet <code>IELTS Chart</code>,{' '}
        <code>IELTS Map</code> hoặc <code>IELTS Process</code> rồi đồng bộ.
      </div>
    );
  }

  const fullParagraphs = assembleEssayParagraphs(activeSections, introIdx, overviewIdx);
  const fullEssayText = fullParagraphs.join('\n\n');
  const fullEssayWordCount = countWords(fullEssayText);

  const practiceParts =
    activeSections.length > 0
      ? Array.from(
          new Set(['Introduction', 'Overview', 'Body 1', 'Body 2', ...activeSections.map((s) => s.part)])
        ).filter(
          (p) =>
            ['Introduction', 'Overview', 'Body 1', 'Body 2'].includes(p) ||
            activeSections.some((s) => s.part === p)
        )
      : ['Introduction', 'Overview', 'Body 1', 'Body 2'];
  const draftWordCount = practiceParts.reduce((sum, p) => sum + countWords(drafts[p] || ''), 0);

  const activeFilteredIdx = activeTask ? filtered.findIndex((t) => t.id === activeTask.id) : 0;
  const activeModelBadge = activeTask ? getTask1ModelBadge(activeTask) : null;

  const goPrevTask = () => {
    if (filtered.length <= 1) return;
    const prev = activeFilteredIdx > 0 ? activeFilteredIdx - 1 : filtered.length - 1;
    setSelectedId(filtered[prev].id);
  };

  const goNextTask = () => {
    if (filtered.length <= 1) return;
    const next = (activeFilteredIdx + 1) % filtered.length;
    setSelectedId(filtered[next].id);
  };

  const handleCopyEssay = () => {
    if (!fullEssayText) return;
    navigator.clipboard?.writeText(fullEssayText.replace(/[[\]]/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-4">
      {/* Compact Top Header & Collapsible Task Picker */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-3.5 dark:border-slate-800 dark:bg-slate-900">
        {/* Tier 1: Title + Mode Switch (50/50 full width on mobile) */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs">
              <BarChart3 className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-extrabold text-slate-900 dark:text-white">
                IELTS Writing Task 1 Studio
              </h2>
              <p className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">
                Biểu đồ, bản đồ & quy trình kèm bài mẫu, luyện gõ thuộc format và đối chiếu.
              </p>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 sm:flex sm:w-auto dark:bg-slate-800">
            <button
              onClick={() => setTopSection('tasks')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold whitespace-nowrap transition ${
                topSection === 'tasks'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5 shrink-0" /> Đề bài ({items.length})
            </button>
            <button
              onClick={() => {
                setTopSection('examples');
                setPickerOpen(false);
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold whitespace-nowrap transition ${
                topSection === 'examples'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <ListChecks className="h-3.5 w-3.5 shrink-0" /> Mẫu Example ({examples.length})
            </button>
          </div>
        </div>

        {/* Tier 2: Horizontal 1-Row Swipeable Type Filter Chips */}
        <div className="no-scrollbar mt-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2.5 pb-0.5 sm:flex-wrap dark:border-slate-800">
          {(
            [
              {
                id: 'all',
                label: `Tất cả (${topSection === 'tasks' ? items.length : examples.length})`,
              },
              {
                id: 'chart',
                label: `Charts (${(topSection === 'tasks' ? items : examples).filter((i) => i.taskType === 'chart').length})`,
              },
              {
                id: 'map',
                label: `Maps (${(topSection === 'tasks' ? items : examples).filter((i) => i.taskType === 'map').length})`,
              },
              {
                id: 'process',
                label: `Process (${(topSection === 'tasks' ? items : examples).filter((i) => i.taskType === 'process').length})`,
              },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setTypeFilter(f.id);
                setExamplePartFilter('ALL');
                setOnlyMultiEssay(false);
              }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap transition ${
                typeFilter === f.id
                  ? 'bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tier 3: Active Prompt Card (Full width on mobile) + Balanced Prev / List / Next Bar */}
        {topSection === 'tasks' && activeTask && (
          <div className="mt-2.5 flex flex-col gap-2 border-t border-slate-100 pt-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="group flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 text-left transition hover:border-emerald-400 hover:bg-emerald-50/40 sm:flex-1 dark:border-slate-700/80 dark:bg-slate-800/50 dark:hover:border-emerald-600"
            >
              {activeTask.imageUrl ? (
                <img
                  src={activeTask.imageUrl}
                  alt={activeTask.title}
                  className="h-10 w-14 shrink-0 rounded-lg border border-slate-200 bg-white object-cover dark:border-slate-700"
                />
              ) : (
                <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900">
                  <ImageIcon className="h-4 w-4" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span className="shrink-0 text-[11px] font-extrabold text-slate-500">
                    Đề {activeFilteredIdx + 1}/{filtered.length}
                  </span>
                  <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {activeTask.chartType}
                  </span>
                  {activeModelBadge && (
                    <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {activeModelBadge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs font-bold text-slate-900 dark:text-white">
                  {activeTask.title}
                </p>
              </div>

              <span className="hidden shrink-0 items-center gap-1 text-[11px] font-bold text-emerald-700 sm:inline-flex dark:text-emerald-400">
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
                onClick={goPrevTask}
                disabled={filtered.length <= 1}
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
                    ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                <span>Danh sách ({filtered.length})</span>
                {pickerOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                )}
              </button>
              <button
                type="button"
                onClick={goNextTask}
                disabled={filtered.length <= 1}
                title="Đề tiếp theo"
                className="order-3 inline-flex h-9 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 sm:order-2 sm:w-9 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Collapsible Searchable Prompt Picker Panel (Bounded height, auto-closes on select) */}
        {topSection === 'tasks' && pickerOpen && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Tìm nhanh đề bài theo tiêu đề hoặc dạng biểu đồ..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-8 pl-8 text-xs outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900"
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

              {multiEssayCount > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyMultiEssay((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    onlyMultiEssay
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Đề có 2+ bài mẫu ({multiEssayCount})
                </button>
              )}

              <span className="text-[11px] font-semibold text-slate-500">
                Hiện {pickerFiltered.length}/{filtered.length} đề
              </span>
            </div>

            {pickerFiltered.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Không tìm thấy đề bài phù hợp với từ khóa “{pickerSearch}”.
              </div>
            ) : (
              <div className="grid max-h-[360px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pickerFiltered.map((task) => {
                  const isSelected = activeTask?.id === task.id;
                  const origIdx = filtered.findIndex((t) => t.id === task.id);
                  const modelBadge = getTask1ModelBadge(task);
                  const totalSentences = task.essays[0]?.sections.reduce(
                    (s, sec) => s + sec.sentences.length,
                    0
                  ) ?? 0;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(task.id);
                        setPickerOpen(false);
                      }}
                      className={`group flex items-center gap-2.5 rounded-xl border p-2 text-left transition ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/90 ring-2 ring-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-950/50'
                          : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-700'
                      }`}
                    >
                      {task.imageUrl ? (
                        <img
                          src={task.imageUrl}
                          alt={task.title}
                          loading="lazy"
                          className="h-12 w-14 shrink-0 rounded-lg border border-slate-200 bg-white object-cover dark:border-slate-700"
                        />
                      ) : (
                        <div className="flex h-12 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              {task.chartType}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400">
                              #{origIdx + 1}
                            </span>
                          </div>
                          {modelBadge && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              {modelBadge}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug font-bold text-slate-800 dark:text-slate-100">
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {task.essays.length > 1
                            ? `${task.essays.length} phiên bản bài mẫu`
                            : `${totalSentences} câu mẫu`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DEDICATED VIEW: "... Example" Sentence Templates List */}
      {topSection === 'examples' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold uppercase text-slate-400">Phần:</span>
              <button
                onClick={() => setExamplePartFilter('ALL')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  examplePartFilter === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Tất cả ({examplesByType.length})
              </button>
              {exampleParts.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setExamplePartFilter(p.name)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    examplePartFilter === p.name
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {p.name} ({p.count})
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setExampleTypingMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  exampleTypingMode
                    ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300'
                }`}
              >
                <Keyboard className="h-3.5 w-3.5" />
                {exampleTypingMode ? 'Quay lại danh sách mẫu' : 'Luyện gõ bộ Example này'}
              </button>

              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={exampleSearch}
                  onChange={(e) => setExampleSearch(e.target.value)}
                  placeholder="Tìm mẫu câu Example..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-xs outline-none focus:border-indigo-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
          </div>

          {exampleTypingMode ? (
            <EssayTypingPractice
              title={`Luyện gõ mẫu câu Task 1 Example (${exampleTypingSentences.length} câu)`}
              subtitle="Gõ lại chính xác từng câu mẫu Introduction / Overview để thuộc khung câu học thuật."
              sentences={exampleTypingSentences}
              accent={accent}
            />
          ) : filteredExamples.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              Không tìm thấy mẫu câu Example phù hợp.
            </div>
          ) : (
            (() => {
              const groups = new Map<string, IeltsTask1Example[]>();
              for (const ex of filteredExamples) {
                const key = `${ex.sourceSheet} — ${ex.part}`;
                const arr = groups.get(key) || [];
                arr.push(ex);
                groups.set(key, arr);
              }
              return (
                <div className="space-y-5">
                  {Array.from(groups.entries()).map(([groupLabel, list]) => {
                    const st = getPartStyle(list[0].basePart);
                    return (
                      <div
                        key={groupLabel}
                        className={`rounded-2xl border p-4 shadow-xs ${st.border} ${st.bg}`}
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold ${st.badge}`}>
                              {list[0].part}
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              {list[0].sourceSheet}
                            </span>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-slate-600 shadow-2xs dark:bg-slate-900 dark:text-slate-300">
                            {list.length} mẫu câu
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {list.map((ex, idx) => (
                            <div
                              key={ex.id}
                              className="flex items-start justify-between gap-3 rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start gap-2">
                                  <span className="mt-0.5 shrink-0 text-xs font-bold text-slate-400">
                                    {idx + 1}.
                                  </span>
                                  <p className="text-sm leading-relaxed font-medium text-slate-800 dark:text-slate-100">
                                    {renderHighlightedTemplate(ex.text)}
                                  </p>
                                </div>
                                {ex.meaning && (
                                  <p className="mt-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
                                    → {ex.meaning}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  onClick={() =>
                                    speakText(ex.text.replace(/[[\]]/g, ''), accent, 0.92)
                                  }
                                  title="Phát âm"
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950"
                                >
                                  <Volume2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    navigator.clipboard?.writeText(ex.text);
                                    setCopiedExId(ex.id);
                                    setTimeout(() => setCopiedExId(null), 1400);
                                  }}
                                  title="Sao chép mẫu câu"
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                                >
                                  {copiedExId === ex.id ? (
                                    <Check className="h-4 w-4 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Main Split-Screen Workspace (only in 'tasks' view) */}
      {topSection === 'tasks' && activeTask && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* LEFT: Sticky Task Prompt Image */}
          <div className="lg:sticky lg:top-20 lg:col-span-5">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {activeTask.chartType}
                  </span>
                  {activeModelBadge && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {activeModelBadge}
                    </span>
                  )}
                  <span className="text-xs font-medium text-slate-400">
                    {activeTask.sourceSheet}
                  </span>
                </div>
                {activeTask.imageUrl && (
                  <button
                    onClick={() => setZoomOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <ZoomIn className="h-3.5 w-3.5" /> Phóng to
                  </button>
                )}
              </div>

              {activeTask.imageUrl ? (
                <div
                  onClick={() => setZoomOpen(true)}
                  className="group relative cursor-zoom-in bg-white p-3"
                >
                  <img
                    src={activeTask.imageUrl}
                    alt={activeTask.title}
                    className="max-h-[460px] w-full rounded-xl object-contain transition group-hover:scale-[1.01]"
                  />
                  <div className="pointer-events-none absolute right-5 bottom-5 rounded-lg bg-slate-900/75 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                    Nhấn để phóng to biểu đồ
                  </div>
                </div>
              ) : (
                <div className="flex h-56 flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center text-xs text-slate-400 dark:bg-slate-800/40">
                  <ImageIcon className="h-8 w-8 opacity-50" />
                  <p className="font-semibold text-slate-500">Chưa có hình ảnh đề bài</p>
                  <p>
                    Dán ảnh trực tiếp vào cột <code>Image</code> trên Google Sheet rồi chạy{' '}
                    <code>python sync.py sync</code> để hiển thị tại đây.
                  </p>
                </div>
              )}

              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {activeTask.title}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                    {activeSections.length} phần dàn ý
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                    ~{fullEssayWordCount} từ ({activeEssay?.label || 'Bài mẫu 1'})
                  </span>
                  {activeEssays.length > 1 && (
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {activeEssays.length} bài mẫu cho đề này
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Interactive 4-Tab Study Panel + Multi-Essay Switcher */}
          <div className="space-y-4 lg:col-span-7">
            {/* Multi-Essay Switcher Bar (when 1 prompt has 2+ complete model essays) */}
            {activeEssays.length > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 dark:border-emerald-900/70 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                  <Layers className="h-4 w-4" />
                  <span>Đề này có {activeEssays.length} bài mẫu:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeEssays.map((ev, idx) => {
                    const active = idx === safeEssayIdx;
                    const wc = countWords(assembleEssayParagraphs(ev.sections, 0, 0).join(' '));
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setEssayIdx(idx)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                          active
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 hover:bg-emerald-100/70 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-emerald-950'
                        }`}
                      >
                        <span>{ev.label}</span>
                        <span
                          className={`text-[10px] ${
                            active ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          ({wc} từ)
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900">
              {[
                { id: 'breakdown', label: 'Phân tích cấu trúc', icon: BookOpen },
                { id: 'essay', label: 'Bài mẫu hoàn chỉnh', icon: FileText },
                { id: 'typing', label: 'Luyện gõ Essay', icon: Keyboard },
                { id: 'practice', label: 'Tự viết theo ảnh', icon: PenLine },
              ].map((t) => {
                const Icon = t.icon;
                const active = studyTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setStudyTab(t.id as StudyTab)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition ${
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

            {/* TAB 1: Structured Breakdown */}
            {studyTab === 'breakdown' && (
              <div className="space-y-4">
                {activeSections.map((sec: IeltsTask1Section, secIdx) => {
                  const st = getPartStyle(sec.part);
                  const isAlternatives =
                    (sec.part === 'Introduction' || sec.part === 'Overview') &&
                    sec.sentences.length > 1;
                  return (
                    <div
                      key={`${sec.part}-${secIdx}`}
                      className={`rounded-2xl border p-4 shadow-xs ${st.border} ${st.bg}`}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold ${st.badge}`}>
                            {sec.part}
                          </span>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {st.labelVi}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            handleSpeakQueue(
                              `t1-sec-${secIdx}`,
                              sec.sentences.map((s, sIdx) => ({
                                key: `t1-sec-${secIdx}-sent-${sIdx}`,
                                text: s.text,
                              })),
                              1.0
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-indigo-600 shadow-2xs hover:bg-white dark:bg-slate-900 dark:text-indigo-300"
                        >
                          {speakingKey === `t1-sec-${secIdx}` ? (
                            <>
                              <Square className="h-3 w-3 fill-current" /> Dừng
                            </>
                          ) : (
                            <>
                              <Volume2 className="h-3.5 w-3.5" /> Nghe phần này
                            </>
                          )}
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {sec.sentences.map((sent, idx) => {
                          const sentKey = `t1-sec-${secIdx}-sent-${idx}`;
                          const isReadingSent = speakingWord?.key === sentKey;
                          return (
                          <div
                            key={idx}
                            className={`flex items-start justify-between gap-3 rounded-xl p-3.5 shadow-2xs transition ${
                              isReadingSent
                                ? 'bg-amber-50/70 ring-1 ring-amber-400/70 dark:bg-amber-950/25'
                                : 'bg-white dark:bg-slate-900'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              {isAlternatives && (
                                <span className="mb-1 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                                  Cách viết {idx + 1}
                                </span>
                              )}
                              <p className="text-sm leading-relaxed font-medium text-slate-800 dark:text-slate-100">
                                {renderHighlightedTemplate(
                                  sent.text,
                                  isReadingSent ? speakingWord.wordIdx : null
                                )}
                              </p>
                              {sent.meaning && (
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  → {sent.meaning}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleSpeakSingle(sentKey, sent.text, 1.0)}
                              title={speakingKey === sentKey ? 'Dừng phát' : 'Phát âm câu này'}
                              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950"
                            >
                              {speakingKey === sentKey ? (
                                <Square className="h-3.5 w-3.5 fill-current text-indigo-600" />
                              ) : (
                                <Volume2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 2: Full Model Essay */}
            {studyTab === 'essay' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                      {activeEssays.length > 1
                        ? `${activeEssay?.label || 'Bài mẫu'} hoàn chỉnh`
                        : 'Bài mẫu hoàn chỉnh'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Độ dài:{' '}
                      <strong
                        className={
                          fullEssayWordCount >= 150 ? 'text-emerald-600' : 'text-amber-600'
                        }
                      >
                        {fullEssayWordCount} từ
                      </strong>{' '}
                      (chuẩn IELTS Task 1 ≥ 150 từ)
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        handleSpeakQueue(
                          't1-full-essay',
                          fullParagraphs.map((para, idx) => ({
                            key: `t1-essay-p-${idx}`,
                            text: para,
                          })),
                          1.0
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                    >
                      {speakingKey === 't1-full-essay' ? (
                        <>
                          <Square className="h-3 w-3 fill-current" /> Dừng đọc
                        </>
                      ) : (
                        <>
                          <Volume2 className="h-3.5 w-3.5" /> Đọc cả bài
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCopyEssay}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" /> Đã chép
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Sao chép
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Variant switchers if multiple Intro or Overview options exist */}
                {activeSections.some(
                  (s) => (s.part === 'Introduction' || s.part === 'Overview') && s.sentences.length > 1
                ) && (
                  <div className="mt-4 flex flex-wrap gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                    {activeSections
                      .filter((s) => s.part === 'Introduction' && s.sentences.length > 1)
                      .map((s) => (
                        <div key="intro-pick" className="flex items-center gap-1.5">
                          <span className="font-bold text-blue-700 dark:text-blue-300">
                            Introduction:
                          </span>
                          {s.sentences.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setIntroIdx(i)}
                              className={`rounded-lg px-2 py-0.5 font-bold ${
                                introIdx === i
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                              }`}
                            >
                              Cách {i + 1}
                            </button>
                          ))}
                        </div>
                      ))}
                    {activeSections
                      .filter((s) => s.part === 'Overview' && s.sentences.length > 1)
                      .map((s) => (
                        <div key="ov-pick" className="flex items-center gap-1.5">
                          <span className="font-bold text-amber-700 dark:text-amber-300">
                            Overview:
                          </span>
                          {s.sentences.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setOverviewIdx(i)}
                              className={`rounded-lg px-2 py-0.5 font-bold ${
                                overviewIdx === i
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                              }`}
                            >
                              Cách {i + 1}
                            </button>
                          ))}
                        </div>
                      ))}
                  </div>
                )}

                <div className="mt-5 space-y-3 text-[15px] leading-7 text-slate-800 dark:text-slate-100">
                  {fullParagraphs.map((para, idx) => {
                    const pKey = `t1-essay-p-${idx}`;
                    const isReading = speakingWord?.key === pKey;
                    return (
                      <p
                        key={idx}
                        className={`rounded-xl px-2.5 py-2 transition ${
                          isReading
                            ? 'bg-amber-50/70 ring-1 ring-amber-400/60 dark:bg-amber-950/25'
                            : ''
                        }`}
                      >
                        {renderHighlightedTemplate(para, isReading ? speakingWord.wordIdx : null)}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: Essay Typing Practice (Memorize Format Sentence by Sentence) */}
            {studyTab === 'typing' && (
              <EssayTypingPractice
                title={`Luyện gõ thuộc ${activeEssays.length > 1 ? activeEssay?.label : 'bài mẫu'} Task 1 (${activeTask.chartType})`}
                subtitle="Gõ lại chính xác từng câu của bài Essay (Introduction → Overview → Body 1 → Body 2) để ghi nhớ cấu trúc học thuật."
                sentences={task1TypingSentences}
                accent={accent}
              />
            )}

            {/* TAB 4: Write & Compare Practice */}
            {studyTab === 'practice' && (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Tự viết bài theo biểu đồ bên trái
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tổng số từ bạn đã viết:{' '}
                      <strong
                        className={
                          draftWordCount >= 150 ? 'text-emerald-600' : 'text-indigo-600'
                        }
                      >
                        {draftWordCount} / 150+ từ
                      </strong>{' '}
                      (tự động lưu nháp)
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setDrafts({});
                      localStorage.removeItem(`vocabStudio:task1Draft:${activeTask.id}`);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Xóa nháp
                  </button>
                </div>

                {practiceParts.map((part) => {
                  const st = getPartStyle(part);
                  const modelSection = activeSections.find((s) => s.part === part);
                  const isRevealed = Boolean(revealedParts[part]);
                  return (
                    <div key={part} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${st.badge}`}>
                            {part}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {countWords(drafts[part] || '')} từ
                          </span>
                        </div>
                        {modelSection && (
                          <button
                            onClick={() =>
                              setRevealedParts((p) => ({ ...p, [part]: !p[part] }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            {isRevealed ? (
                              <>
                                <EyeOff className="h-3.5 w-3.5" /> Ẩn bài mẫu
                              </>
                            ) : (
                              <>
                                <Eye className="h-3.5 w-3.5" /> So sánh {activeEssays.length > 1 ? activeEssay?.label : 'bài mẫu'}
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      <textarea
                        rows={part === 'Introduction' ? 2 : 4}
                        value={drafts[part] || ''}
                        onChange={(e) => updateDraft(part, e.target.value)}
                        placeholder={`Viết phần ${part} dựa trên hình ảnh đề bài...`}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed outline-none focus:border-indigo-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:focus:border-indigo-400"
                      />

                      {isRevealed && modelSection && (
                        <div className={`rounded-xl border p-3 text-xs leading-relaxed ${st.border} ${st.bg}`}>
                          <p className="mb-1 font-bold uppercase text-slate-500">
                            Gợi ý {activeEssays.length > 1 ? activeEssay?.label : 'bài mẫu'} ({part}):
                          </p>
                          <div className="space-y-1.5 text-slate-800 dark:text-slate-100">
                            {modelSection.sentences.map((s, i) => (
                              <p key={i}>• {renderHighlightedTemplate(s.text)}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox */}
      {zoomOpen && activeTask?.imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
          onClick={() => setZoomOpen(false)}
        >
          <div
            className="relative max-h-[92vh] max-w-5xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomOpen(false)}
              className="absolute top-3 right-3 rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-900"
              aria-label="Đóng phóng to"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={activeTask.imageUrl}
              alt={activeTask.title}
              className="max-h-[82vh] w-auto object-contain"
            />
            <p className="mt-2 text-center text-xs font-semibold text-slate-600">
              {activeTask.title}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
