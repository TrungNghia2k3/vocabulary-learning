import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Keyboard,
  RotateCcw,
  Trophy,
  Volume2,
} from 'lucide-react';
import type { Accent, VocabItem } from '../types';
import { speakText } from '../utils/speech';

interface TodayWordsViewProps {
  items: VocabItem[];
  learnedIds: Set<string>;
  onMarkLearned: (id: string) => void;
  accent: Accent;
}

type Stage = 'setup' | 'learn' | 'quiz' | 'write' | 'summary';

export function TodayWordsView({
  items,
  learnedIds,
  onMarkLearned,
  accent,
}: TodayWordsViewProps) {
  const [selectMode, setSelectMode] = useState<'count' | 'range'>('count');
  const [count, setCount] = useState(10);
  const [unlearnedOnly, setUnlearnedOnly] = useState(true);
  const [startIdx, setStartIdx] = useState(1);
  const [endIdx, setEndIdx] = useState(10);

  const [stage, setStage] = useState<Stage>('setup');
  const [sessionWords, setSessionWords] = useState<VocabItem[]>([]);
  const [stepIdx, setStepIdx] = useState(0);

  // Quiz state
  const [quizPicked, setQuizPicked] = useState<string | null>(null);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [quizRight, setQuizRight] = useState(0);

  // Writing state
  const [writeInput, setWriteInput] = useState('');
  const [writeResult, setWriteResult] = useState<'idle' | 'ok' | 'wrong'>('idle');
  const [writeWrongItems, setWriteWrongItems] = useState<VocabItem[]>([]);
  const [writeRight, setWriteRight] = useState(0);

  const validItems = items.filter((v) => v.word && v.meaning);

  const buildOptionsFor = (target: VocabItem, pool: VocabItem[]) => {
    const others = pool
      .filter((x) => x.id !== target.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((x) => x.meaning);
    return [target.meaning, ...others].sort(() => Math.random() - 0.5);
  };

  const startSession = () => {
    let picked: VocabItem[] = [];
    if (selectMode === 'count') {
      const source = unlearnedOnly
        ? validItems.filter((v) => !learnedIds.has(v.id))
        : validItems;
      picked = [...source].sort(() => Math.random() - 0.5).slice(0, Math.min(count, source.length));
    } else {
      const s = Math.max(1, startIdx) - 1;
      const e = Math.min(validItems.length, Math.max(startIdx, endIdx));
      picked = validItems.slice(s, e);
    }
    if (picked.length === 0) return;

    setSessionWords(picked);
    setStepIdx(0);
    setQuizRight(0);
    setWriteRight(0);
    setWriteWrongItems([]);
    setStage('learn');
  };

  const enterQuizStage = () => {
    setStepIdx(0);
    setQuizPicked(null);
    setQuizRight(0);
    setQuizOptions(buildOptionsFor(sessionWords[0], validItems));
    setStage('quiz');
  };

  const enterWriteStage = (wordsToWrite = sessionWords) => {
    setSessionWords(wordsToWrite);
    setStepIdx(0);
    setWriteInput('');
    setWriteResult('idle');
    setWriteRight(0);
    setWriteWrongItems([]);
    setStage('write');
  };

  if (stage === 'setup') {
    const unlearnedCount = validItems.filter((v) => !learnedIds.has(v.id)).length;
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
          Học từ mới hôm nay (3 bước)
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Lộ trình: <strong>1. Xem thẻ</strong> → <strong>2. Quiz trắc nghiệm</strong> →{' '}
          <strong>3. Luyện gõ chính tả</strong>.
        </p>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectMode('count')}
              className={`rounded-xl border py-2.5 text-sm font-semibold ${
                selectMode === 'count'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              Chọn theo số lượng
            </button>
            <button
              onClick={() => setSelectMode('range')}
              className={`rounded-xl border py-2.5 text-sm font-semibold ${
                selectMode === 'range'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              Chọn theo khoảng (STT)
            </button>
          </div>

          {selectMode === 'count' ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                {[5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`flex-1 rounded-xl border py-2 text-sm font-bold ${
                      count === n
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {n} từ
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={unlearnedOnly}
                  onChange={(e) => setUnlearnedOnly(e.target.checked)}
                  className="h-4 w-4 rounded accent-indigo-600"
                />
                Chỉ chọn từ chưa thuộc ({unlearnedCount} từ khả dụng)
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500">Từ số</label>
                <input
                  type="number"
                  min={1}
                  max={validItems.length}
                  value={startIdx}
                  onChange={(e) => setStartIdx(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500">Đến số (tối đa {validItems.length})</label>
                <input
                  type="number"
                  min={1}
                  max={validItems.length}
                  value={endIdx}
                  onChange={(e) => setEndIdx(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
          )}

          <button
            onClick={startSession}
            disabled={validItems.length === 0}
            className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-40"
          >
            Bắt đầu buổi học hôm nay
          </button>
        </div>
      </div>
    );
  }

  const currentItem = sessionWords[stepIdx];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Stepper */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {[
          { id: 'learn', label: '1. Học thẻ', icon: BookOpen },
          { id: 'quiz', label: '2. Trắc nghiệm', icon: HelpCircle },
          { id: 'write', label: '3. Luyện viết', icon: Keyboard },
        ].map((st) => {
          const Icon = st.icon;
          const active = stage === st.id;
          return (
            <div
              key={st.id}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 ${
                active
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {st.label}
            </div>
          );
        })}
      </div>

      {/* Stage 1: Learn */}
      {stage === 'learn' && currentItem && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Từ {stepIdx + 1} / {sessionWords.length}
            </span>
            <button
              onClick={() => speakText(currentItem.word, accent)}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
            >
              <Volume2 className="h-3.5 w-3.5" /> Phát âm
            </button>
          </div>

          {currentItem.imageUrl && (
            <img
              src={currentItem.imageUrl}
              alt={currentItem.word}
              className="mt-4 h-44 w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-800"
            />
          )}

          <div className="mt-4 text-center">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {currentItem.word}
            </h2>
            {(currentItem.phoneticUk || currentItem.phoneticUs) && (
              <p className="mt-1 font-mono text-sm text-indigo-600 dark:text-indigo-400">
                {accent === 'en-US'
                  ? currentItem.phoneticUs || currentItem.phoneticUk
                  : currentItem.phoneticUk || currentItem.phoneticUs}
              </p>
            )}
            <p className="mt-3 text-lg font-semibold text-slate-700 dark:text-slate-200">
              {currentItem.meaning}
            </p>
            {currentItem.examples[0] && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm italic text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                “{currentItem.examples[0]}”
              </p>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => {
                if (stepIdx + 1 < sessionWords.length) {
                  setStepIdx((i) => i + 1);
                } else {
                  enterQuizStage();
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              {stepIdx + 1 < sessionWords.length ? 'Từ tiếp theo' : 'Sang Bước 2: Quiz'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Stage 2: Quiz */}
      {stage === 'quiz' && currentItem && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold text-slate-400">
            Câu {stepIdx + 1} / {sessionWords.length}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {currentItem.word}
            </h3>
            <button
              onClick={() => speakText(currentItem.word, accent)}
              className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-2.5">
            {quizOptions.map((opt, idx) => {
              const isCorrect = opt === currentItem.meaning;
              const isPicked = quizPicked === opt;
              let cls =
                'border-slate-200 hover:border-indigo-400 dark:border-slate-700 dark:hover:border-indigo-500';
              if (quizPicked !== null) {
                if (isCorrect) cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60';
                else if (isPicked) cls = 'border-rose-500 bg-rose-50 dark:bg-rose-950/60';
              }
              return (
                <button
                  key={idx}
                  disabled={quizPicked !== null}
                  onClick={() => {
                    setQuizPicked(opt);
                    if (isCorrect) setQuizRight((r) => r + 1);
                  }}
                  className={`w-full rounded-xl border p-3 text-left text-sm font-medium ${cls}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {quizPicked !== null && (
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => {
                  if (stepIdx + 1 < sessionWords.length) {
                    const next = stepIdx + 1;
                    setStepIdx(next);
                    setQuizPicked(null);
                    setQuizOptions(buildOptionsFor(sessionWords[next], validItems));
                  } else {
                    enterWriteStage(sessionWords);
                  }
                }}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
              >
                {stepIdx + 1 < sessionWords.length ? 'Câu tiếp →' : 'Sang Bước 3: Luyện viết →'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stage 3: Writing */}
      {stage === 'write' && currentItem && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold text-slate-400">
            Viết từ {stepIdx + 1} / {sessionWords.length}
          </p>
          <h3 className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">
            {currentItem.meaning}
          </h3>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (writeResult !== 'idle') {
                if (stepIdx + 1 < sessionWords.length) {
                  setStepIdx((i) => i + 1);
                  setWriteInput('');
                  setWriteResult('idle');
                } else {
                  setStage('summary');
                }
                return;
              }
              const cleanTarget = currentItem.word.replace(/\([^)]*\)/g, '').trim().toLowerCase();
              const cleanInput = writeInput.trim().toLowerCase();
              const ok = cleanInput === cleanTarget || cleanInput === currentItem.word.trim().toLowerCase();
              setWriteResult(ok ? 'ok' : 'wrong');
              if (ok) {
                setWriteRight((r) => r + 1);
                onMarkLearned(currentItem.id);
              } else {
                setWriteWrongItems((arr) => [...arr, currentItem]);
              }
            }}
            className="mt-4 space-y-3"
          >
            <input
              type="text"
              autoFocus
              value={writeInput}
              onChange={(e) => setWriteInput(e.target.value)}
              placeholder="Gõ lại từ tiếng Anh..."
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-base font-semibold outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
            />
            {writeResult !== 'idle' && (
              <div
                className={`rounded-xl p-3 text-sm font-semibold ${
                  writeResult === 'ok'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                }`}
              >
                {writeResult === 'ok' ? 'Chuẩn xác! Đã đánh dấu thuộc.' : `Đáp án đúng: ${currentItem.word}`}
              </div>
            )}
            <button
              type="submit"
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              {writeResult === 'idle'
                ? 'Kiểm tra'
                : stepIdx + 1 < sessionWords.length
                  ? 'Từ tiếp theo →'
                  : 'Xem tổng kết'}
            </button>
          </form>
        </div>
      )}

      {/* Summary */}
      {stage === 'summary' && (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950">
            <Trophy className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Xuất sắc! Hoàn thành buổi học hôm nay
          </h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-500">Tổng từ</p>
              <p className="text-lg font-extrabold">{sessionWords.length}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
              <p className="text-xs text-emerald-600">Quiz đúng</p>
              <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                {quizRight}/{sessionWords.length}
              </p>
            </div>
            <div className="rounded-xl bg-indigo-50 p-3 dark:bg-indigo-950/40">
              <p className="text-xs text-indigo-600">Viết đúng</p>
              <p className="text-lg font-extrabold text-indigo-700 dark:text-indigo-300">
                {writeRight}/{sessionWords.length}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {writeWrongItems.length > 0 && (
              <button
                onClick={() => enterWriteStage(writeWrongItems)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700"
              >
                <RotateCcw className="h-4 w-4" /> Luyện lại {writeWrongItems.length} từ viết sai
              </button>
            )}
            <button
              onClick={() => setStage('setup')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              <CheckCircle2 className="h-4 w-4" /> Học bộ từ mới
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
