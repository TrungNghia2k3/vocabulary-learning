import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Lightbulb,
  RefreshCw,
  Trophy,
  Volume2,
  XCircle,
} from 'lucide-react';
import type { Accent, VocabItem } from '../types';
import { speakText } from '../utils/speech';

interface QuizViewProps {
  items: VocabItem[];
  mode: 'standard' | 'syn-ant';
  accent: Accent;
  onScoreSaved: (score: number) => void;
  onMarkLearned: (id: string) => void;
}

interface Question {
  item: VocabItem;
  prompt: string;
  subPrompt?: string;
  hint?: string;
  audioText?: string;
  imageUrl?: string;
  options: string[];
  answer: string;
  badge?: string;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function QuizView({
  items,
  mode,
  accent,
  onScoreSaved,
  onMarkLearned,
}: QuizViewProps) {
  const [direction, setDirection] = useState<'en-vi' | 'vi-en' | 'listen'>('en-vi');
  const [synType, setSynType] = useState<'mixed' | 'synonym' | 'antonym'>('mixed');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [started, setStarted] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [mistakes, setMistakes] = useState<Array<{ q: Question; picked: string }>>([]);
  const [finished, setFinished] = useState(false);

  const eligibleItems = useMemo(() => {
    if (mode === 'standard') {
      return items.filter((v) => v.word && v.meaning);
    }
    return items.filter((v) => {
      if (synType === 'synonym') return v.synonyms.length > 0;
      if (synType === 'antonym') return v.antonyms.length > 0;
      return v.synonyms.length > 0 || v.antonyms.length > 0;
    });
  }, [items, mode, synType]);

  const startQuiz = () => {
    const pool = shuffle(eligibleItems);
    const chosen = pool.slice(0, Math.min(questionCount, pool.length));
    const built: Question[] = [];

    if (mode === 'standard') {
      for (const item of chosen) {
        const distractors = shuffle(
          eligibleItems.filter((x) => x.id !== item.id)
        ).slice(0, 3);

        if (direction === 'en-vi') {
          const opts = shuffle([item.meaning, ...distractors.map((d) => d.meaning)]);
          built.push({
            item,
            prompt: item.word,
            subPrompt: item.phoneticUk || item.phoneticUs,
            audioText: item.word,
            imageUrl: item.imageUrl,
            options: opts,
            answer: item.meaning,
            badge: item.deck,
          });
        } else if (direction === 'vi-en') {
          const opts = shuffle([item.word, ...distractors.map((d) => d.word)]);
          built.push({
            item,
            prompt: item.meaning,
            imageUrl: item.imageUrl,
            options: opts,
            answer: item.word,
            badge: item.deck,
          });
        } else {
          const opts = shuffle([item.word, ...distractors.map((d) => d.word)]);
          built.push({
            item,
            prompt: 'Nghe phát âm và chọn từ đúng',
            subPrompt: item.meaning,
            audioText: item.word,
            imageUrl: item.imageUrl,
            options: opts,
            answer: item.word,
            badge: item.deck,
          });
        }
      }
    } else {
      const allWords = Array.from(
        new Set([
          ...items.map((x) => x.word),
          ...items.flatMap((x) => x.synonyms.map((s) => s.word)),
          ...items.flatMap((x) => x.antonyms.map((a) => a.word)),
        ])
      ).filter(Boolean);

      for (const item of chosen) {
        const canSyn = item.synonyms.length > 0;
        const canAnt = item.antonyms.length > 0;
        const askSyn =
          synType === 'synonym' || (synType === 'mixed' && canSyn && (!canAnt || Math.random() > 0.45));
        const targetList = askSyn ? item.synonyms : item.antonyms;
        if (!targetList.length) continue;

        const target = targetList[Math.floor(Math.random() * targetList.length)];
        const forbidden = new Set([
          item.word.toLowerCase(),
          ...item.synonyms.map((s) => s.word.toLowerCase()),
          ...item.antonyms.map((a) => a.word.toLowerCase()),
        ]);
        const wrong = shuffle(allWords.filter((w) => !forbidden.has(w.toLowerCase()))).slice(0, 3);
        const opts = shuffle([target.word, ...wrong]);

        built.push({
          item,
          prompt: `Tìm từ ${askSyn ? 'ĐỒNG NGHĨA' : 'TRÁI NGHĨA'} của: "${item.word}"`,
          subPrompt: item.phoneticUk || item.phoneticUs,
          hint: `Nghĩa của "${item.word}": ${item.meaning}${target.meaning ? ` | Gợi ý đáp án: ${target.meaning}` : ''}`,
          audioText: item.word,
          options: opts,
          answer: target.word,
          badge: askSyn ? 'Synonym' : 'Antonym',
        });
      }
    }

    setQuestions(built);
    setCurrent(0);
    setSelected(null);
    setScore(0);
    setShowHint(false);
    setMistakes([]);
    setFinished(false);
    setStarted(true);

    if (built[0]?.audioText && direction === 'listen') {
      speakText(built[0].audioText, accent);
    }
  };

  const handleSelect = (opt: string) => {
    if (selected !== null) return;
    const q = questions[current];
    setSelected(opt);
    if (opt === q.answer) {
      setScore((s) => s + 10);
      onMarkLearned(q.item.id);
    } else {
      setMistakes((m) => [...m, { q, picked: opt }]);
    }
  };

  const handleNext = () => {
    if (current + 1 < questions.length) {
      const nextIdx = current + 1;
      setCurrent(nextIdx);
      setSelected(null);
      setShowHint(false);
      if (questions[nextIdx]?.audioText && direction === 'listen') {
        speakText(questions[nextIdx].audioText!, accent);
      }
    } else {
      onScoreSaved(score);
      setFinished(true);
    }
  };

  if (eligibleItems.length < 4) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
        <p className="text-base font-bold text-slate-800 dark:text-slate-100">
          Bộ từ hiện tại cần ít nhất 4 từ có đủ dữ liệu để tạo Quiz.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {mode === 'syn-ant'
            ? 'Hãy chọn bộ từ "Tất cả bộ từ", "Core Vocabulary", "Adjective" hoặc "Books" ở màn hình Tổng quan.'
            : 'Hãy chọn một bộ từ khác có nhiều mục hơn.'}
        </p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
          {mode === 'standard' ? 'Cài đặt Quiz Trắc nghiệm' : 'Cài đặt Quiz Đồng / Trái nghĩa'}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Có <strong>{eligibleItems.length}</strong> từ sẵn sàng trong bộ từ hiện tại.
        </p>

        <div className="mt-5 space-y-4">
          {mode === 'standard' ? (
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500">Chiều hỏi</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { id: 'en-vi', label: 'Anh → Việt' },
                  { id: 'vi-en', label: 'Việt → Anh' },
                  { id: 'listen', label: 'Nghe → Chọn từ' },
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDirection(d.id as typeof direction)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      direction === d.id
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500">Loại câu hỏi</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { id: 'mixed', label: 'Trộn cả hai' },
                  { id: 'synonym', label: 'Chỉ Đồng nghĩa' },
                  { id: 'antonym', label: 'Chỉ Trái nghĩa' },
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSynType(d.id as typeof synType)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      synType === d.id
                        ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500">Số câu hỏi</label>
            <div className="mt-2 flex gap-2">
              {[5, 10, 20, 30].map((n) => (
                <button
                  key={n}
                  onClick={() => setQuestionCount(n)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    questionCount === n
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startQuiz}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700"
          >
            Bắt đầu làm bài
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    const correctCount = questions.length - mistakes.length;
    const accuracy = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
    return (
      <div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <Trophy className="h-8 w-8" />
          </div>
          <h2 className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">
            Hoàn thành bài Quiz!
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Đúng <strong>{correctCount}/{questions.length}</strong> câu ({accuracy}%) · Tổng điểm:{' '}
            <strong className="text-indigo-600 dark:text-indigo-400">{score}</strong>
          </p>
        </div>

        {mistakes.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">
              Ôn lại các câu làm sai ({mistakes.length})
            </h3>
            {mistakes.map((m, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-sm dark:border-rose-900 dark:bg-rose-950/30"
              >
                <p className="font-bold text-slate-900 dark:text-white">{m.q.prompt}</p>
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">Bạn chọn: {m.picked}</p>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Đáp án đúng: {m.q.answer}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={startQuiz}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
          >
            <RefreshCw className="h-4 w-4" /> Làm lượt mới
          </button>
          <button
            onClick={() => setStarted(false)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Đổi cài đặt
          </button>
        </div>
      </div>
    );
  }

  const q = questions[current];
  const progressPct = Math.round(((current + 1) / questions.length) * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Progress */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold">
          <span className="text-slate-500">
            Câu {current + 1} / {questions.length}
          </span>
          <span className="text-indigo-600 dark:text-indigo-400">Điểm: {score}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            {q.badge && (
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {q.badge}
              </span>
            )}
            <h3 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
              {q.prompt}
            </h3>
            {q.subPrompt && <p className="mt-1 text-sm text-slate-500">{q.subPrompt}</p>}
          </div>

          <div className="flex gap-1.5">
            {q.audioText && (
              <button
                onClick={() => speakText(q.audioText!, accent)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                title="Phát âm"
              >
                <Volume2 className="h-5 w-5" />
              </button>
            )}
            {q.hint && (
              <button
                onClick={() => setShowHint((h) => !h)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300"
                title="Xem gợi ý"
              >
                <Lightbulb className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {q.imageUrl && (
          <img
            src={q.imageUrl}
            alt="Minh họa"
            className="mt-4 h-44 w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-800"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}

        {showHint && q.hint && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            {q.hint}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-2.5">
          {q.options.map((opt, idx) => {
            const isPicked = selected === opt;
            const isCorrect = opt === q.answer;
            let style =
              'border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-indigo-500';
            if (selected !== null) {
              if (isCorrect) {
                style =
                  'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200';
              } else if (isPicked) {
                style =
                  'border-rose-500 bg-rose-50 text-rose-900 dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-200';
              } else {
                style = 'border-slate-200 opacity-50 dark:border-slate-800';
              }
            }

            return (
              <button
                key={idx}
                disabled={selected !== null}
                onClick={() => handleSelect(opt)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left text-sm font-medium transition ${style}`}
              >
                <span>
                  <span className="mr-2 inline-block font-bold text-slate-400">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  {opt}
                </span>
                {selected !== null && isCorrect && (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                )}
                {selected !== null && isPicked && !isCorrect && (
                  <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
                )}
              </button>
            );
          })}
        </div>

        {selected !== null && (
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
            <span
              className={`text-sm font-bold ${
                selected === q.answer ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {selected === q.answer ? 'Chính xác! +10 điểm' : `Chưa đúng — Đáp án: ${q.answer}`}
            </span>
            <button
              onClick={handleNext}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
            >
              {current + 1 < questions.length ? 'Câu tiếp theo →' : 'Xem kết quả'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
