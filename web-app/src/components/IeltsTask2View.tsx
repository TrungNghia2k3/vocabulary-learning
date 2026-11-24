import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FilePenLine,
  Layers,
  PenLine,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { Accent, IeltsTask2Prompt } from '../types';
import { speakText } from '../utils/speech';

interface IeltsTask2ViewProps {
  prompts: IeltsTask2Prompt[];
  accent: Accent;
}

type Task2Tab = 'expressions' | 'writer' | 'drill';

const ESSAY_PARTS = [
  {
    id: 'intro',
    label: 'Introduction',
    hint: 'Paraphrase đề bài + Nêu rõ quan điểm (Thesis statement) (~40–50 từ)',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    rows: 3,
  },
  {
    id: 'body1',
    label: 'Body Paragraph 1',
    hint: 'Luận điểm chính 1 + Giải thích + Ví dụ cụ thể (~90–110 từ)',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    rows: 5,
  },
  {
    id: 'body2',
    label: 'Body Paragraph 2',
    hint: 'Luận điểm chính 2 / Phản biện + Giải thích + Ví dụ (~90–110 từ)',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    rows: 5,
  },
  {
    id: 'conclusion',
    label: 'Conclusion',
    hint: 'Tóm tắt lại 2 luận điểm + Khẳng định lại quan điểm (~30–40 từ)',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    rows: 3,
  },
] as const;

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function IeltsTask2View({ prompts, accent }: IeltsTask2ViewProps) {
  const [selectedId, setSelectedId] = useState<string>(prompts[0]?.id || '');
  const [tab, setTab] = useState<Task2Tab>('expressions');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedEssay, setCopiedEssay] = useState(false);

  // Writer state
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeField, setActiveField] = useState<string>('body1');

  // Mini flashcard drill state
  const [drillIdx, setDrillIdx] = useState(0);
  const [drillFlipped, setDrillFlipped] = useState(false);

  const activePrompt = useMemo(() => {
    return prompts.find((p) => p.id === selectedId) || prompts[0] || null;
  }, [prompts, selectedId]);

  useEffect(() => {
    if (!activePrompt) return;
    setSearch('');
    setDrillIdx(0);
    setDrillFlipped(false);
    try {
      const saved = localStorage.getItem(`vocabStudio:task2Draft:${activePrompt.id}`);
      setDrafts(saved ? (JSON.parse(saved) as Record<string, string>) : {});
    } catch {
      setDrafts({});
    }
  }, [activePrompt?.id]);

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

  if (prompts.length === 0 || !activePrompt) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        Chưa có đề bài trong sheet <code>IELTS Writing Task 2</code>.
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filteredExpressions = activePrompt.expressions.filter(
    (e) => !q || e.phrase.toLowerCase().includes(q) || e.meaning.toLowerCase().includes(q)
  );

  const drillCard = activePrompt.expressions[drillIdx % Math.max(1, activePrompt.expressions.length)];

  return (
    <div className="space-y-5">
      {/* Top Header & Prompt Selector */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-xs">
              <FilePenLine className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                IELTS Writing Task 2 Studio
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Học cụm từ học thuật theo từng đề luận, tự động chấm dấu cụm đã áp dụng & luyện viết chuẩn ≥ 250 từ.
              </p>
            </div>
          </div>

          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {prompts.length} đề bài · {prompts.reduce((s, p) => s + p.expressions.length, 0)} cụm từ
          </span>
        </div>

        {/* Prompt Cards */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {prompts.map((p, idx) => {
            const active = p.id === activePrompt.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`flex flex-col rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-950/40'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    Đề #{idx + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {p.expressions.length} cụm
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs font-bold text-slate-900 dark:text-white">
                  {p.title}
                </p>
                <span className="mt-auto pt-2 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                  {p.questionType}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Essay Prompt Banner */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/60 p-5 shadow-xs dark:border-indigo-900/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-violet-950/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white">
                {activePrompt.questionType}
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {activePrompt.expressions.length} cụm từ & ý tưởng học thuật
              </span>
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
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-white/80 p-1.5 dark:bg-slate-900/70">
          {[
            { id: 'expressions', label: 'Kho cụm từ & Ý tưởng', icon: BookOpen },
            { id: 'writer', label: 'Luyện viết bài luận', icon: PenLine },
            { id: 'drill', label: 'Ôn nhanh Flashcard', icon: Layers },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as Task2Tab)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
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
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm cụm từ tiếng Anh hoặc nghĩa tiếng Việt trong đề này..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-sm outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-900"
            />
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
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-400">#{idx + 1}</span>
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
                        onClick={() => {
                          navigator.clipboard?.writeText(ex.phrase);
                          setCopiedId(ex.id);
                          setTimeout(() => setCopiedId(null), 1400);
                        }}
                        title="Sao chép cụm từ"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                      >
                        {copiedId === ex.id ? (
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

      {/* TAB 2: Essay Writer + Live Phrase Tracker */}
      {tab === 'writer' && (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          {/* Left Sticky Phrase Bank */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:sticky lg:top-20 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
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
          </div>

          {/* Right 4-Paragraph Essay Editor */}
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
                  </strong>{' '}
                  · Cụm từ đã áp dụng:{' '}
                  <strong className="text-emerald-600">{usedExpressionIds.size}</strong>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!combinedEssayText) return;
                    navigator.clipboard?.writeText(combinedEssayText);
                    setCopiedEssay(true);
                    setTimeout(() => setCopiedEssay(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  {copiedEssay ? (
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

            {ESSAY_PARTS.map((part) => {
              const isFocused = activeField === part.id;
              return (
                <div key={part.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${part.badge}`}>
                        {part.label}
                      </span>
                      {isFocused && (
                        <span className="text-[10px] font-semibold text-indigo-500">
                          • Đang chọn để chèn cụm từ
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-400">
                      {countWords(drafts[part.id] || '')} từ
                    </span>
                  </div>
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

      {/* TAB 3: Quick Flashcard Drill for Prompt Expressions */}
      {tab === 'drill' && drillCard && (
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Ôn nhanh cụm từ cho đề đang chọn</span>
            <span className="rounded-lg bg-indigo-50 px-2.5 py-1 font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {(drillIdx % activePrompt.expressions.length) + 1} / {activePrompt.expressions.length}
            </span>
          </div>

          <div
            onClick={() => setDrillFlipped((f) => !f)}
            className="flex min-h-[260px] cursor-pointer flex-col justify-between rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-lg transition hover:opacity-95"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                {drillFlipped ? 'Tiếng Anh học thuật' : 'Nghĩa tiếng Việt — Hãy nhớ lại cụm tiếng Anh'}
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
    </div>
  );
}
