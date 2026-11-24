import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  PenLine,
  RotateCcw,
  Volume2,
  X,
  ZoomIn,
} from 'lucide-react';
import type { Accent, IeltsTask1Item, IeltsTask1Section } from '../types';
import { speakText } from '../utils/speech';

interface IeltsTask1ViewProps {
  items: IeltsTask1Item[];
  accent: Accent;
}

type StudyTab = 'breakdown' | 'essay' | 'practice';

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

export function IeltsTask1View({ items, accent }: IeltsTask1ViewProps) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'chart' | 'map' | 'process'>('all');
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id || '');
  const [studyTab, setStudyTab] = useState<StudyTab>('breakdown');
  const [zoomOpen, setZoomOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Selected variant index when Introduction or Overview has multiple paraphrases
  const [introIdx, setIntroIdx] = useState(0);
  const [overviewIdx, setOverviewIdx] = useState(0);

  // Practice drafts saved per task id in localStorage
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealedParts, setRevealedParts] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return items;
    return items.filter((it) => it.taskType === typeFilter);
  }, [items, typeFilter]);

  const activeTask = useMemo(() => {
    return filtered.find((it) => it.id === selectedId) || filtered[0] || null;
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!activeTask) return;
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

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        Chưa có dữ liệu IELTS Writing Task 1. Hãy thêm bài mẫu vào sheet <code>IELTS Chart</code>,{' '}
        <code>IELTS Map</code> hoặc <code>IELTS Process</code> rồi đồng bộ.
      </div>
    );
  }

  const assembleFullEssay = (task: IeltsTask1Item): string[] => {
    const paragraphs: string[] = [];
    for (const sec of task.sections) {
      if (sec.part === 'Introduction' && sec.sentences.length > 1) {
        paragraphs.push(sec.sentences[Math.min(introIdx, sec.sentences.length - 1)].text);
      } else if (sec.part === 'Overview' && sec.sentences.length > 1) {
        paragraphs.push(sec.sentences[Math.min(overviewIdx, sec.sentences.length - 1)].text);
      } else {
        paragraphs.push(sec.sentences.map((s) => s.text).join(' '));
      }
    }
    return paragraphs.filter(Boolean);
  };

  const fullParagraphs = activeTask ? assembleFullEssay(activeTask) : [];
  const fullEssayText = fullParagraphs.join('\n\n');
  const fullEssayWordCount = countWords(fullEssayText);

  const practiceParts =
    activeTask && activeTask.taskType === 'chart'
      ? ['Introduction', 'Overview', 'Body 1', 'Body 2']
      : activeTask?.sections.map((s) => s.part) || ['Introduction', 'Overview', 'Body 1', 'Body 2'];
  const draftWordCount = practiceParts.reduce((sum, p) => sum + countWords(drafts[p] || ''), 0);

  const handleCopyEssay = () => {
    if (!fullEssayText) return;
    navigator.clipboard?.writeText(fullEssayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Task Picker */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                IELTS Writing Task 1 Studio
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Xem trực tiếp hình ảnh biểu đồ đề bài, phân tích dàn ý 4 phần & luyện viết đối chiếu bài mẫu.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: `Tất cả (${items.length})` },
                { id: 'chart', label: `Charts (${items.filter((i) => i.taskType === 'chart').length})` },
                { id: 'map', label: `Maps (${items.filter((i) => i.taskType === 'map').length})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setTypeFilter(f.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  typeFilter === f.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Horizontal Task Prompt Cards */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((task, idx) => {
            const isSelected = activeTask?.id === task.id;
            const totalSentences = task.sections.reduce((s, sec) => s + sec.sentences.length, 0);
            return (
              <button
                key={task.id}
                onClick={() => setSelectedId(task.id)}
                className={`group flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-950/40'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-800/40'
                }`}
              >
                {task.imageUrl ? (
                  <img
                    src={task.imageUrl}
                    alt={task.title}
                    className="h-14 w-16 shrink-0 rounded-lg border border-slate-200 bg-white object-cover dark:border-slate-700"
                  />
                ) : (
                  <div className="flex h-14 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {task.chartType}
                    </span>
                    <span className="text-[10px] text-slate-400">#{idx + 1}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                    {task.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{totalSentences} câu mẫu</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split-Screen Workspace */}
      {activeTask && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* LEFT: Sticky Task Prompt Image */}
          <div className="lg:sticky lg:top-20 lg:col-span-5">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    {activeTask.chartType}
                  </span>
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
                    {activeTask.sections.length} phần dàn ý
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                    ~{fullEssayWordCount} từ bài mẫu
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Interactive 3-Tab Study Panel */}
          <div className="space-y-4 lg:col-span-7">
            {/* Mode Switcher */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              {[
                { id: 'breakdown', label: 'Phân tích cấu trúc', icon: BookOpen },
                { id: 'essay', label: 'Bài mẫu hoàn chỉnh', icon: FileText },
                { id: 'practice', label: 'Luyện viết theo ảnh', icon: PenLine },
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
                {activeTask.sections.map((sec: IeltsTask1Section, secIdx) => {
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
                            speakText(sec.sentences.map((s) => s.text).join(' '), accent, 0.92)
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-indigo-600 shadow-2xs hover:bg-white dark:bg-slate-900 dark:text-indigo-300"
                        >
                          <Volume2 className="h-3.5 w-3.5" /> Nghe phần này
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {sec.sentences.map((sent, idx) => (
                          <div
                            key={idx}
                            className="flex items-start justify-between gap-3 rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900"
                          >
                            <div className="min-w-0 flex-1">
                              {isAlternatives && (
                                <span className="mb-1 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                                  Cách viết {idx + 1}
                                </span>
                              )}
                              <p className="text-sm leading-relaxed font-medium text-slate-800 dark:text-slate-100">
                                {sent.text}
                              </p>
                              {sent.meaning && (
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  → {sent.meaning}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => speakText(sent.text, accent, 0.92)}
                              title="Phát âm câu này"
                              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950"
                            >
                              <Volume2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
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
                      Bài mẫu hoàn chỉnh
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
                      onClick={() => speakText(fullEssayText, accent, 0.9)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                    >
                      <Volume2 className="h-3.5 w-3.5" /> Đọc cả bài
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
                {activeTask.sections.some(
                  (s) => (s.part === 'Introduction' || s.part === 'Overview') && s.sentences.length > 1
                ) && (
                  <div className="mt-4 flex flex-wrap gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                    {activeTask.sections
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
                    {activeTask.sections
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

                <div className="mt-5 space-y-4 text-[15px] leading-7 text-slate-800 dark:text-slate-100">
                  {fullParagraphs.map((para, idx) => (
                    <p key={idx}>{para}</p>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: Write & Compare Practice */}
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
                  const modelSection = activeTask.sections.find((s) => s.part === part);
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
                                <Eye className="h-3.5 w-3.5" /> So sánh bài mẫu
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
                          <p className="mb-1 font-bold uppercase text-slate-500">Gợi ý bài mẫu ({part}):</p>
                          <div className="space-y-1.5 text-slate-800 dark:text-slate-100">
                            {modelSection.sentences.map((s, i) => (
                              <p key={i}>• {s.text}</p>
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
