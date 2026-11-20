import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  RotateCw,
  Shuffle,
  Volume2,
} from 'lucide-react';
import type { Accent, VocabItem } from '../types';
import { speakText } from '../utils/speech';

interface FlashcardViewProps {
  items: VocabItem[];
  learnedIds: Set<string>;
  onToggleLearned: (id: string) => void;
  accent: Accent;
}

export function FlashcardView({
  items,
  learnedIds,
  onToggleLearned,
  accent,
}: FlashcardViewProps) {
  const [filter, setFilter] = useState<'all' | 'unlearned' | 'learned'>('all');
  const [seed, setSeed] = useState(0);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const deck = useMemo(() => {
    const base = items.filter((item) => {
      if (filter === 'unlearned') return !learnedIds.has(item.id);
      if (filter === 'learned') return learnedIds.has(item.id);
      return true;
    });
    if (seed === 0) return base;
    const arr = [...base];
    let s = seed;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) % 4294967296;
      const j = s % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [items, filter, seed, learnedIds]);

  const safeIndex = Math.min(index, Math.max(0, deck.length - 1));
  const card = deck[safeIndex];

  const goPrev = useCallback(() => {
    setFlipped(false);
    setIndex((i) => (i > 0 ? i - 1 : Math.max(0, deck.length - 1)));
  }, [deck.length]);

  const goNext = useCallback(() => {
    setFlipped(false);
    setIndex((i) => (i + 1 < deck.length ? i + 1 : 0));
  }, [deck.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key.toLowerCase() === 'p' && card) {
        speakText(card.word, accent);
      } else if (e.key.toLowerCase() === 'l' && card) {
        onToggleLearned(card.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, card, accent, onToggleLearned]);

  if (!card) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
        <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
          Không có thẻ nào trong bộ lọc này.
        </p>
        <button
          onClick={() => setFilter('all')}
          className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Hiển thị tất cả thẻ
        </button>
      </div>
    );
  }

  const learned = learnedIds.has(card.id);
  const phonetic = accent === 'en-US' ? card.phoneticUs || card.phoneticUk : card.phoneticUk || card.phoneticUs;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          {(['all', 'unlearned', 'learned'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setIndex(0);
                setFlipped(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {f === 'all' ? 'Tất cả' : f === 'unlearned' ? 'Chưa học' : 'Đã thuộc'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSeed((s) => s + 1);
              setIndex(0);
              setFlipped(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Shuffle className="h-3.5 w-3.5" /> Trộn thẻ
          </button>
          <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {safeIndex + 1} / {deck.length}
          </span>
        </div>
      </div>

      {/* 3D Flip Card */}
      <div className="perspective-1000">
        <div
          onClick={() => setFlipped((f) => !f)}
          className={`transform-style-3d relative min-h-[420px] w-full cursor-pointer transition-transform duration-500 ${
            flipped ? 'rotate-y-180' : ''
          }`}
        >
          {/* FRONT */}
          <div className="backface-hidden absolute inset-0 flex flex-col justify-between rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 text-white shadow-xl">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-xs">
                {card.deck}
                {card.section ? ` · ${card.section}` : ''}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  speakText(card.word, accent);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-xs transition hover:bg-white/30"
                title="Phát âm (phím P)"
              >
                <Volume2 className="h-5 w-5" />
              </button>
            </div>

            <div className="my-auto flex flex-col items-center text-center">
              {card.imageUrl && (
                <img
                  src={card.imageUrl}
                  alt={card.word}
                  className="mb-4 h-44 w-64 rounded-2xl border-2 border-white/30 bg-white/10 object-cover shadow-lg"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{card.word}</h2>
              {phonetic && <p className="mt-2 font-mono text-base text-indigo-100">{phonetic}</p>}
              {card.partOfSpeech && (
                <span className="mt-2 rounded-full bg-white/15 px-3 py-0.5 text-xs font-medium">
                  {card.partOfSpeech}
                </span>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-indigo-100/90">
              <RotateCw className="h-3.5 w-3.5" />
              Nhấn vào thẻ hoặc phím <kbd className="rounded bg-white/20 px-1.5 py-0.5">Space</kbd> để xem nghĩa
            </div>
          </div>

          {/* BACK */}
          <div className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col justify-between overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                    {card.word} {phonetic ? `· ${phonetic}` : ''}
                  </p>
                  <h3 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                    {card.meaning || 'Chưa có nghĩa tiếng Việt'}
                  </h3>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    speakText(card.examples[0] || card.word, accent);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                >
                  <Volume2 className="h-3.5 w-3.5" /> Đọc ví dụ
                </button>
              </div>

              {card.examples.length > 0 && (
                <div className="rounded-xl bg-slate-50 p-3.5 text-sm dark:bg-slate-800/70">
                  <p className="text-xs font-bold uppercase text-slate-400">Ví dụ</p>
                  <ul className="mt-1 space-y-1.5 italic text-slate-700 dark:text-slate-300">
                    {card.examples.slice(0, 3).map((ex, idx) => (
                      <li key={idx}>• “{ex}”</li>
                    ))}
                  </ul>
                </div>
              )}

              {card.collocations.length > 0 && (
                <div className="text-xs">
                  <p className="font-bold uppercase text-slate-400">Collocations</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {card.collocations.map((c, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg bg-violet-50 px-2.5 py-1 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {card.memoryTip && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>{card.memoryTip}</span>
                </div>
              )}

              {(card.synonyms.length > 0 || card.antonyms.length > 0) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {card.synonyms.slice(0, 4).map((s, idx) => (
                    <span
                      key={`s-${idx}`}
                      className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                    >
                      ≈ {s.word}
                    </span>
                  ))}
                  {card.antonyms.slice(0, 4).map((a, idx) => (
                    <span
                      key={`a-${idx}`}
                      className="rounded-full bg-rose-50 px-2.5 py-0.5 font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                    >
                      ≠ {a.word}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <p className="pt-3 text-center text-xs text-slate-400">Nhấn lại vào thẻ để quay về mặt trước</p>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={goPrev}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <ChevronLeft className="h-4 w-4" /> Trước
        </button>

        <button
          onClick={() => onToggleLearned(card.id)}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shadow-xs transition ${
            learned
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'border border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          {learned ? 'Đã thuộc ✓' : 'Đánh dấu đã thuộc (L)'}
        </button>

        <button
          onClick={goNext}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700"
        >
          Tiếp <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
