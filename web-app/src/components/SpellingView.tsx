import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, RefreshCw, Volume2, XCircle } from 'lucide-react';
import type { Accent, VocabItem } from '../types';
import { speakText } from '../utils/speech';

interface SpellingViewProps {
  items: VocabItem[];
  accent: Accent;
  onMarkLearned: (id: string) => void;
}

function normalizeAnswer(s: string): string {
  return s
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function SpellingView({ items, accent, onMarkLearned }: SpellingViewProps) {
  const pool = useMemo(() => {
    const valid = items.filter((v) => v.word && v.meaning && v.word.length <= 45);
    return [...valid].sort(() => Math.random() - 0.5);
  }, [items]);

  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [showHint, setShowHint] = useState(false);
  const [stats, setStats] = useState({ right: 0, total: 0 });

  const item = pool[idx % Math.max(1, pool.length)];

  if (!item) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        Không có từ phù hợp để luyện viết chính tả trong bộ từ hiện tại.
      </div>
    );
  }

  const targetClean = normalizeAnswer(item.word);
  const hintMasked = item.word
    .split(' ')
    .map((w) => (w.length <= 2 ? w : `${w[0]}${'_'.repeat(Math.max(1, w.length - 2))}${w[w.length - 1]}`))
    .join(' ');

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (checked !== 'idle') {
      nextWord();
      return;
    }
    const userAns = normalizeAnswer(input);
    const isOk = userAns === targetClean || userAns === item.word.trim().toLowerCase();
    setChecked(isOk ? 'correct' : 'wrong');
    setStats((s) => ({ right: s.right + (isOk ? 1 : 0), total: s.total + 1 }));
    if (isOk) onMarkLearned(item.id);
  };

  const nextWord = () => {
    setIdx((i) => i + 1);
    setInput('');
    setChecked('idle');
    setShowHint(false);
  };

  const acc = stats.total ? Math.round((stats.right / stats.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <span className="text-slate-500">
          Đã luyện: <strong>{stats.total}</strong> từ
        </span>
        <span className="text-emerald-600 dark:text-emerald-400">
          Chính xác: {stats.right}/{stats.total} ({acc}%)
        </span>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            {item.deck}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => speakText(item.word, accent)}
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
            >
              <Volume2 className="h-4 w-4" /> Nghe phát âm
            </button>
            <button
              type="button"
              onClick={() => setShowHint((h) => !h)}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300"
            >
              <Eye className="h-4 w-4" /> Gợi ý
            </button>
          </div>
        </div>

        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt="Minh họa"
            className="mt-4 h-44 w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-800"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}

        <div className="mt-5 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Nghĩa tiếng Việt</p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">
            {item.meaning}
          </h2>
          {item.partOfSpeech && (
            <p className="mt-1 text-xs font-medium text-slate-500">({item.partOfSpeech})</p>
          )}
          {showHint && (
            <p className="mt-3 font-mono text-sm tracking-widest text-amber-600 dark:text-amber-400">
              {hintMasked}
            </p>
          )}
        </div>

        <form onSubmit={handleCheck} className="mt-6 space-y-3">
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập từ tiếng Anh rồi nhấn Enter..."
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-center text-lg font-semibold outline-none focus:border-indigo-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800"
          />

          {checked !== 'idle' && (
            <div
              className={`flex items-center justify-between rounded-xl p-3.5 text-sm font-semibold ${
                checked === 'correct'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {checked === 'correct' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-600" />
                )}
                <span>
                  {checked === 'correct' ? 'Chính xác!' : `Đáp án đúng: ${item.word}`}
                </span>
              </div>
              {item.phoneticUk && <span className="font-mono text-xs">{item.phoneticUk}</span>}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700"
            >
              {checked === 'idle' ? 'Kiểm tra (Enter)' : 'Từ tiếp theo →'}
            </button>
            <button
              type="button"
              onClick={nextWord}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" /> Bỏ qua
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
