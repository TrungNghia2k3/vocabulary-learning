import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Keyboard,
  RotateCcw,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Accent } from '../types';
import { speakText } from '../utils/speech';
import { playTypingSound } from '../utils/typingSound';

export interface EssayPracticeSentence {
  id: string;
  part: string;
  text: string;
  meaning?: string;
}

interface EssayTypingPracticeProps {
  title: string;
  subtitle?: string;
  sentences: EssayPracticeSentence[];
  accent: Accent;
  storageKey?: string;
}

type MemoryLevel = 'visible' | 'initials' | 'hidden';

const PART_BADGE_MAP: Record<string, string> = {
  Introduction: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Overview: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  'Body 1': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'Body 2': 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  Conclusion: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

function getPartBadge(part: string): string {
  for (const [k, cls] of Object.entries(PART_BADGE_MAP)) {
    if (part.toLowerCase().startsWith(k.toLowerCase())) return cls;
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

/** Splits a paragraph cleanly into individual sentences for sentence-by-sentence typing drill. */
export function splitIntoPracticeSentences(
  text: string
): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .trim();
  if (!normalized) return [];

  const out: string[] = [];
  for (const line of normalized.split(/\n+/)) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;
    const protectedLine = cleanLine.replace(
      /\b(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e)\./gi,
      '$1__DOT__'
    );
    const parts = protectedLine.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [protectedLine];
    for (const p of parts) {
      const s = p.replace(/__DOT__/g, '.').replace(/\s+/g, ' ').trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/** Normalizes typography so users never get stuck on smart quotes, brackets, or double spaces. */
function cleanTargetForTyping(raw: string): string {
  return raw
    .replace(/[[\]]/g, '')
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForCompare(str: string, ignoreCaseAndPunct: boolean): string {
  const base = str
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!ignoreCaseAndPunct) return base;
  return base
    .toLowerCase()
    .replace(/[.,!?;:"()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Builds a character-level mask showing whether each char in cleaned target originally sat inside [...] */
function buildBracketMask(raw: string): { clean: string; inBracket: boolean[] } {
  const normalized = raw
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .trim();

  let clean = '';
  const inBracket: boolean[] = [];
  let inside = false;
  let lastWasSpace = true;

  for (const ch of normalized) {
    if (ch === '[') {
      inside = true;
      continue;
    }
    if (ch === ']') {
      inside = false;
      continue;
    }
    const isSpace = /\s/.test(ch);
    if (isSpace) {
      if (lastWasSpace) continue;
      clean += ' ';
      inBracket.push(inside);
      lastWasSpace = true;
    } else {
      clean += ch;
      inBracket.push(inside);
      lastWasSpace = false;
    }
  }
  while (clean.endsWith(' ')) {
    clean = clean.slice(0, -1);
    inBracket.pop();
  }
  return { clean, inBracket };
}

/** Computes which characters are the first letter of a word (for 'initials' memory mode). */
function buildWordStartSet(clean: string): Set<number> {
  const starts = new Set<number>();
  let prevIsWord = false;
  for (let i = 0; i < clean.length; i++) {
    const isWord = /[A-Za-z0-9]/.test(clean[i]);
    if (isWord && !prevIsWord) starts.add(i);
    prevIsWord = isWord;
  }
  return starts;
}

export function EssayTypingPractice({
  title,
  subtitle,
  sentences,
  accent,
}: EssayTypingPracticeProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [memoryLevel, setMemoryLevel] = useState<MemoryLevel>('visible');
  const [peekHidden, setPeekHidden] = useState(false);
  const [ignoreCaseAndPunct, setIgnoreCaseAndPunct] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('vocabStudio:typingSound');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('vocabStudio:typingSound', String(next));
      } catch {
        // ignore storage errors
      }
      if (next) playTypingSound('key');
      return next;
    });
  };

  // Typing metrics
  const [sessionStartMs, setSessionStartMs] = useState<number | null>(null);
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [mistakeKeystrokes, setMistakeKeystrokes] = useState(0);
  const [completedWords, setCompletedWords] = useState(0);
  const [finishedAtMs, setFinishedAtMs] = useState<number | null>(null);
  const [justPassed, setJustPassed] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset cleanly whenever the sentence list (essay / format) changes
  const listKey = useMemo(() => sentences.map((s) => s.id).join('|'), [sentences]);
  useEffect(() => {
    setCurrentIdx(0);
    setTyped('');
    setCompletedIds(new Set());
    setPeekHidden(false);
    setSessionStartMs(null);
    setTotalKeystrokes(0);
    setMistakeKeystrokes(0);
    setCompletedWords(0);
    setFinishedAtMs(null);
    setJustPassed(false);
  }, [listKey]);

  const safeIdx = Math.min(currentIdx, Math.max(0, sentences.length - 1));
  const current = sentences[safeIdx] || null;

  const { clean: targetClean, inBracket } = useMemo(
    () => (current ? buildBracketMask(current.text) : { clean: '', inBracket: [] }),
    [current]
  );
  const wordStarts = useMemo(() => buildWordStartSet(targetClean), [targetClean]);

  useEffect(() => {
    if (autoSpeak && current && !finishedAtMs) {
      speakText(cleanTargetForTyping(current.text), accent, 0.92);
    }
  }, [safeIdx, autoSpeak, current?.id, accent, finishedAtMs]);

  if (sentences.length === 0 || !current) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        Chưa có câu mẫu nào để luyện gõ trong mục này.
      </div>
    );
  }

  const normalizedTyped = typed
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\n/g, ' ');

  const isExactMatch =
    normalizeForCompare(normalizedTyped, ignoreCaseAndPunct) ===
      normalizeForCompare(targetClean, ignoreCaseAndPunct) && targetClean.length > 0;

  const allCompleted = completedIds.size >= sentences.length;

  // Count matched prefix & live mismatch count
  let liveErrors = 0;
  for (let i = 0; i < normalizedTyped.length && i < targetClean.length; i++) {
    const a = ignoreCaseAndPunct ? normalizedTyped[i].toLowerCase() : normalizedTyped[i];
    const b = ignoreCaseAndPunct ? targetClean[i].toLowerCase() : targetClean[i];
    if (a !== b) liveErrors += 1;
  }
  if (normalizedTyped.length > targetClean.length) {
    liveErrors += normalizedTyped.length - targetClean.length;
  }

  const accuracy =
    totalKeystrokes > 0
      ? Math.max(0, Math.round(((totalKeystrokes - mistakeKeystrokes) / totalKeystrokes) * 100))
      : 100;

  const elapsedMinutes =
    sessionStartMs !== null
      ? Math.max(((finishedAtMs ?? Date.now()) - sessionStartMs) / 60000, 0.05)
      : 0;
  const typedWordsNow = normalizedTyped.trim() ? normalizedTyped.trim().split(/\s+/).length : 0;
  const wpm =
    sessionStartMs !== null ? Math.round((completedWords + typedWordsNow) / elapsedMinutes) : 0;

  const advanceToSentence = (nextIdx: number) => {
    setCurrentIdx(nextIdx);
    setTyped('');
    setPeekHidden(false);
    setJustPassed(false);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const completeCurrentSentence = (nextTypedVal: string) => {
    const nextCompleted = new Set(completedIds);
    nextCompleted.add(current.id);
    setCompletedIds(nextCompleted);
    setCompletedWords((w) => w + (targetClean.trim() ? targetClean.trim().split(/\s+/).length : 0));
    setJustPassed(true);

    if (nextCompleted.size >= sentences.length) {
      setFinishedAtMs(Date.now());
      return;
    }

    // Find next uncompleted sentence (preferring currentIdx + 1)
    let nextIdx = -1;
    for (let offset = 1; offset <= sentences.length; offset++) {
      const candidate = (safeIdx + offset) % sentences.length;
      if (!nextCompleted.has(sentences[candidate].id)) {
        nextIdx = candidate;
        break;
      }
    }
    if (nextIdx >= 0 && nextTypedVal) {
      setTimeout(() => {
        advanceToSentence(nextIdx);
      }, 360);
    }
  };

  const handleTypingChange = (val: string) => {
    if (justPassed) return;
    if (sessionStartMs === null && val.length > 0) {
      setSessionStartMs(Date.now());
    }

    // Track newly typed character for accuracy metric & mechanical typing sound
    let lastAddedWasSpace = false;
    let newMistakes = 0;
    if (val.length > typed.length) {
      const addedLen = val.length - typed.length;
      setTotalKeystrokes((k) => k + addedLen);
      for (let i = typed.length; i < val.length; i++) {
        const rawCh = val[i]
          .replace(/\u2019|\u2018/g, "'")
          .replace(/\u201C|\u201D/g, '"')
          .replace(/\u2013|\u2014/g, '-');
        if (i === val.length - 1 && /\s/.test(rawCh)) {
          lastAddedWasSpace = true;
        }
        const expected = targetClean[i];
        if (!expected) {
          newMistakes += 1;
        } else {
          const a = ignoreCaseAndPunct ? rawCh.toLowerCase() : rawCh;
          const b = ignoreCaseAndPunct ? expected.toLowerCase() : expected;
          if (a !== b) newMistakes += 1;
        }
      }
      if (newMistakes > 0) setMistakeKeystrokes((m) => m + newMistakes);
    }

    setTyped(val);

    const matched =
      normalizeForCompare(val.replace(/\n/g, ' '), ignoreCaseAndPunct) ===
      normalizeForCompare(targetClean, ignoreCaseAndPunct);

    if (soundEnabled) {
      if (matched) {
        playTypingSound('complete');
      } else if (val.length < typed.length) {
        playTypingSound('space');
      } else if (newMistakes > 0) {
        playTypingSound('error');
      } else if (lastAddedWasSpace) {
        playTypingSound('space');
      } else if (val.length > typed.length) {
        playTypingSound('key');
      }
    }

    if (matched) {
      completeCurrentSentence(val);
    }
  };

  const resetAll = (nextLevel?: MemoryLevel) => {
    if (nextLevel) setMemoryLevel(nextLevel);
    setCurrentIdx(0);
    setTyped('');
    setCompletedIds(new Set());
    setPeekHidden(false);
    setSessionStartMs(null);
    setTotalKeystrokes(0);
    setMistakeKeystrokes(0);
    setCompletedWords(0);
    setFinishedAtMs(null);
    setJustPassed(false);
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const progressPct = Math.round((completedIds.size / sentences.length) * 100);

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-600 text-white shadow-xs">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{title}</h3>
              {subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg bg-indigo-50 px-2.5 py-1 font-extrabold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {completedIds.size}/{sentences.length} câu
            </span>
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Chính xác {accuracy}%
            </span>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {wpm} WPM
            </span>
            <button
              onClick={() => resetAll()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              title="Làm lại từ câu đầu tiên"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Làm lại
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Practice Mode Toggles */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-slate-500">Chế độ nhớ:</span>
            {(
              [
                { id: 'visible', label: 'Nhìn mẫu gõ theo' },
                { id: 'initials', label: 'Gợi ý chữ đầu' },
                { id: 'hidden', label: 'Ẩn chữ tự nhớ' },
              ] as const
            ).map((lvl) => (
              <button
                key={lvl.id}
                onClick={() => {
                  setMemoryLevel(lvl.id);
                  setPeekHidden(false);
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  memoryLevel === lvl.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {lvl.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleSound}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                soundEnabled
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
              }`}
              title="Bật hoặc tắt tiếng gõ bàn phím"
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="h-3.5 w-3.5" /> Tiếng gõ phím: Bật
                </>
              ) : (
                <>
                  <VolumeX className="h-3.5 w-3.5" /> Tiếng gõ phím: Tắt
                </>
              )}
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={ignoreCaseAndPunct}
                onChange={(e) => setIgnoreCaseAndPunct(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Bỏ qua viết hoa & dấu câu
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Tự đọc câu mới
            </label>
          </div>
        </div>
      </div>

      {/* Completion Celebration Card */}
      {allCompleted ? (
        <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-indigo-50 p-6 text-center shadow-xs dark:border-emerald-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-indigo-950/30">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
            <Award className="h-6 w-6" />
          </div>
          <h4 className="mt-3 text-lg font-extrabold text-slate-900 dark:text-white">
            Xuất sắc! Bạn đã gõ hoàn chỉnh toàn bộ {sentences.length} câu!
          </h4>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Độ chính xác <strong className="text-emerald-600">{accuracy}%</strong> · Tốc độ{' '}
            <strong className="text-indigo-600">{wpm} WPM</strong> · Tổng{' '}
            <strong>{completedWords} từ</strong> học thuật.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {memoryLevel === 'visible' && (
              <button
                onClick={() => resetAll('initials')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
              >
                <Sparkles className="h-3.5 w-3.5" /> Thử sức lại với “Gợi ý chữ đầu”
              </button>
            )}
            {memoryLevel === 'initials' && (
              <button
                onClick={() => resetAll('hidden')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
              >
                <Sparkles className="h-3.5 w-3.5" /> Thử sức lại với “Ẩn chữ tự nhớ”
              </button>
            )}
            <button
              onClick={() => resetAll()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Luyện gõ lại từ đầu
            </button>
          </div>
        </div>
      ) : (
        /* Active Sentence Typing Card */
        <div
          className={`rounded-2xl border p-5 shadow-xs transition ${
            justPassed || isExactMatch
              ? 'border-emerald-400 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-950/20'
              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          {/* Sentence Meta Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${getPartBadge(current.part)}`}>
                {current.part}
              </span>
              <span className="text-xs font-bold text-slate-500">
                Câu {safeIdx + 1} / {sentences.length}
              </span>
              {completedIds.has(current.id) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" /> Đã hoàn thành
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {memoryLevel !== 'visible' && (
                <button
                  type="button"
                  onClick={() => setPeekHidden((p) => !p)}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-200"
                >
                  {peekHidden ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" /> Che lại
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" /> Xem gợi ý
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => speakText(targetClean, accent, 0.9)}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
              >
                <Volume2 className="h-3.5 w-3.5" /> Nghe câu này
              </button>
            </div>
          </div>

          {/* Live Character-by-Character Target Display */}
          <div className="mt-4 rounded-xl border border-slate-200/90 bg-slate-50/90 p-4 font-mono text-[15px] leading-8 tracking-normal select-none dark:border-slate-700 dark:bg-slate-800/70">
            {targetClean.split('').map((ch, idx) => {
              const isTyped = idx < normalizedTyped.length;
              const isCursor = idx === normalizedTyped.length;
              const typedCh = normalizedTyped[idx];
              const isCharCorrect =
                isTyped &&
                (ignoreCaseAndPunct
                  ? typedCh.toLowerCase() === ch.toLowerCase()
                  : typedCh === ch);

              const isSlot = inBracket[idx];

              // Determine what character to show when untyped depending on MemoryLevel
              let displayChar = ch;
              let masked = false;
              if (!isTyped && !peekHidden) {
                if (memoryLevel === 'hidden' && ch !== ' ') {
                  displayChar = '•';
                  masked = true;
                } else if (
                  memoryLevel === 'initials' &&
                  /[A-Za-z0-9]/.test(ch) &&
                  !wordStarts.has(idx)
                ) {
                  displayChar = '_';
                  masked = true;
                }
              }

              if (isTyped) {
                return (
                  <span
                    key={idx}
                    className={
                      isCharCorrect
                        ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                        : 'rounded-xs bg-rose-200 font-bold text-rose-800 underline decoration-rose-500 dark:bg-rose-900/80 dark:text-rose-200'
                    }
                  >
                    {ch === ' ' && !isCharCorrect ? '␣' : ch}
                  </span>
                );
              }

              if (isCursor) {
                return (
                  <span
                    key={idx}
                    className="rounded-xs border-b-2 border-indigo-600 bg-indigo-100 font-bold text-indigo-900 dark:border-indigo-400 dark:bg-indigo-900/70 dark:text-indigo-100"
                  >
                    {displayChar}
                  </span>
                );
              }

              return (
                <span
                  key={idx}
                  className={
                    masked
                      ? 'text-slate-400 dark:text-slate-500'
                      : isSlot
                        ? 'bg-amber-100/80 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                        : 'text-slate-600 dark:text-slate-300'
                  }
                >
                  {displayChar}
                </span>
              );
            })}

            {normalizedTyped.length > targetClean.length && (
              <span className="rounded-xs bg-rose-200 font-bold text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                {normalizedTyped.slice(targetClean.length)}
              </span>
            )}
          </div>

          {current.meaning && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Nghĩa: {current.meaning}
            </p>
          )}

          {/* Typing Input Box */}
          <div className="mt-3">
            <textarea
              ref={inputRef}
              rows={Math.max(2, Math.min(5, Math.ceil(targetClean.length / 72)))}
              value={typed}
              onChange={(e) => handleTypingChange(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              placeholder="Gõ lại chính xác câu mẫu phía trên (đã tắt dán Copy/Paste để luyện nhớ thật)..."
              className={`w-full rounded-xl border p-3.5 font-mono text-sm leading-relaxed outline-none transition ${
                justPassed || isExactMatch
                  ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-950/30'
                  : liveErrors > 0
                    ? 'border-rose-400 bg-white ring-2 ring-rose-500/15 dark:border-rose-600 dark:bg-slate-800'
                    : 'border-indigo-300 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800'
              }`}
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                {justPassed ? (
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    ✓ Chuẩn xác! Đang chuyển sang câu tiếp theo...
                  </span>
                ) : liveErrors > 0 ? (
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    Có {liveErrors} ký tự chưa khớp — kiểm tra vị trí tô đỏ ở câu mẫu phía trên.
                  </span>
                ) : (
                  <span className="text-slate-400">
                    {normalizedTyped.length}/{targetClean.length} ký tự · Phần tô vàng nhẹ là phần thay ý theo đề
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => advanceToSentence(Math.max(0, safeIdx - 1))}
                  disabled={safeIdx === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Trước
                </button>
                <button
                  type="button"
                  onClick={() => setTyped('')}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700"
                >
                  Xóa ô gõ
                </button>
                <button
                  type="button"
                  onClick={() => advanceToSentence((safeIdx + 1) % sentences.length)}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                >
                  <SkipForward className="h-3.5 w-3.5" /> Câu tiếp
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Essay Sentence Roadmap (Click any sentence to jump) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            Tiến độ từng câu trong bài Essay (Nhấn vào câu bất kỳ để nhảy tới)
          </span>
          <span className="text-xs font-bold text-emerald-600">{progressPct}%</span>
        </div>

        <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
          {sentences.map((s, idx) => {
            const done = completedIds.has(s.id);
            const active = idx === safeIdx && !allCompleted;
            const preview = cleanTargetForTyping(s.text);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setFinishedAtMs(null);
                  advanceToSentence(idx);
                }}
                className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-xs transition ${
                  active
                    ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-950/40'
                    : done
                      ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                      : 'border-slate-200/70 bg-slate-50/40 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/30'
                }`}
              >
                <span className="mt-0.5 shrink-0 font-extrabold text-slate-400">#{idx + 1}</span>
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${getPartBadge(
                    s.part
                  )}`}
                >
                  {s.part}
                </span>
                <span
                  className={`min-w-0 flex-1 line-clamp-1 leading-relaxed ${
                    done
                      ? 'font-medium text-emerald-800 dark:text-emerald-300'
                      : active
                        ? 'font-bold text-indigo-900 dark:text-indigo-100'
                        : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {memoryLevel === 'hidden' && !done && !active
                    ? '••••••••••••••••••••••••'
                    : preview}
                </span>
                {done && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
