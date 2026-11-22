import { useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Eye,
  HelpCircle,
  Keyboard,
  Lightbulb,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  XCircle,
} from 'lucide-react';
import type { Accent, VocabItem } from '../types';
import { speakText } from '../utils/speech';

interface ImageQuizViewProps {
  /** Vocab items in current deck/topic filter */
  activeVocab: VocabItem[];
  /** Full library fallback if current deck has no images */
  allVocab: VocabItem[];
  accent: Accent;
  onScoreSaved: (score: number) => void;
  onMarkLearned: (id: string) => void;
}

type PlayStyle = 'typing' | 'multiple-choice';

interface QuizCard {
  item: VocabItem;
  primaryWord: string;
  aliases: string[];
  options: string[];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract all acceptable English answer aliases from a card title.
 * Examples:
 * - "Refrigerator (Fridge)" -> ["refrigerator", "fridge"]
 * - "Trash can / Litter bin" -> ["trash can", "litter bin"]
 * - "Double bed (Queen-size - King-size)" -> ["double bed", "queen-size", "king-size", "queen size", "king size"]
 * - "Air conditioner (AC)" -> ["air conditioner", "ac"]
 */
function extractAliases(rawWord: string): { primary: string; aliases: string[] } {
  const withoutIpa = rawWord.replace(/\/(?!\s)[^/]+?(?<!\s)\//g, '').trim();
  const aliasSet = new Set<string>();

  const addCandidate = (s: string) => {
    const norm = normalizeForCompare(s);
    if (norm.length >= 2) {
      aliasSet.add(norm);
      if (norm.includes('-')) aliasSet.add(norm.replace(/-/g, ' '));
    }
  };

  // Full cleaned string
  addCandidate(withoutIpa);

  // Extract parenthesized alternatives e.g. "(Twin bed)" or "(Queen-size - King-size)"
  const parenRegex = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = parenRegex.exec(withoutIpa)) !== null) {
    const inside = m[1];
    inside.split(/\s*(?:\/|\s-\s|,)\s*/).forEach(addCandidate);
  }

  // Outside parentheses, split on " / "
  const outside = withoutIpa.replace(/\([^)]*\)/g, '').trim();
  const mainParts = outside.split(/\s+\/\s+/).map((p) => p.trim()).filter(Boolean);
  mainParts.forEach(addCandidate);

  const primary = mainParts[0] || outside || withoutIpa;
  return { primary, aliases: Array.from(aliasSet) };
}

function makeLetterHint(word: string, revealLevel: number): string {
  return word
    .split(' ')
    .map((part) => {
      if (part.length <= 2) return part;
      const chars = part.split('');
      return chars
        .map((ch, idx) => {
          if (!/[a-zA-Z]/.test(ch)) return ch;
          if (idx === 0) return ch;
          if (revealLevel >= 2 && idx === chars.length - 1) return ch;
          if (revealLevel >= 2 && idx % 3 === 0) return ch;
          return '_';
        })
        .join(' ');
    })
    .join('   ');
}

export function ImageQuizView({
  activeVocab,
  allVocab,
  accent,
  onScoreSaved,
  onMarkLearned,
}: ImageQuizViewProps) {
  const baseImagePool = useMemo(() => {
    const activeWithImg = activeVocab.filter((v) => Boolean(v.imageUrl));
    if (activeWithImg.length > 0) return activeWithImg;
    return allVocab.filter((v) => Boolean(v.imageUrl));
  }, [activeVocab, allVocab]);

  const availableTopics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of baseImagePool) {
      const t = v.section || v.deck;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [baseImagePool]);

  const [playStyle, setPlayStyle] = useState<PlayStyle>('typing');
  const [topicFilter, setTopicFilter] = useState<string>('ALL');
  const [count, setCount] = useState<number>(10);
  const [hideTopicBadge, setHideTopicBadge] = useState<boolean>(false);
  const [autoPronounce, setAutoPronounce] = useState<boolean>(true);

  const [started, setStarted] = useState(false);
  const [cards, setCards] = useState<QuizCard[]>([]);
  const [current, setCurrent] = useState(0);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong' | 'skipped'>('idle');
  const [pickedOption, setPickedOption] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2 | 3>(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [missed, setMissed] = useState<QuizCard[]>([]);
  const [finished, setFinished] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const filteredPool = useMemo(() => {
    if (topicFilter === 'ALL') return baseImagePool;
    return baseImagePool.filter((v) => (v.section || v.deck) === topicFilter);
  }, [baseImagePool, topicFilter]);

  const buildCards = (sourceItems: VocabItem[], limit: number): QuizCard[] => {
    const chosen = shuffle(sourceItems).slice(0, Math.min(limit, sourceItems.length));
    return chosen.map((item) => {
      const { primary, aliases } = extractAliases(item.word);
      // Prefer distractors from same topic for multiple choice
      const sameTopic = baseImagePool.filter(
        (x) => x.id !== item.id && (x.section || x.deck) === (item.section || item.deck)
      );
      const distractorSource = sameTopic.length >= 3 ? sameTopic : baseImagePool.filter((x) => x.id !== item.id);
      const wrongOpts = shuffle(distractorSource)
        .map((d) => extractAliases(d.word).primary)
        .filter((w) => w.toLowerCase() !== primary.toLowerCase())
        .filter((w, i, arr) => arr.indexOf(w) === i)
        .slice(0, 3);

      return {
        item,
        primaryWord: primary,
        aliases,
        options: shuffle([primary, ...wrongOpts]),
      };
    });
  };

  const startRound = (customSource?: VocabItem[]) => {
    const src = customSource || filteredPool;
    const limit = customSource ? customSource.length : count === 0 ? src.length : count;
    const built = buildCards(src, limit);
    if (built.length === 0) return;

    setCards(built);
    setCurrent(0);
    setInput('');
    setStatus('idle');
    setPickedOption(null);
    setHintLevel(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setMissed([]);
    setFinished(false);
    setStarted(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const advanceCard = () => {
    if (current + 1 < cards.length) {
      setCurrent((c) => c + 1);
      setInput('');
      setStatus('idle');
      setPickedOption(null);
      setHintLevel(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      onScoreSaved(score);
      setFinished(true);
    }
  };

  const handleTypingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== 'idle') {
      advanceCard();
      return;
    }
    const card = cards[current];
    const guess = normalizeForCompare(input);
    if (!guess) return;

    const isCorrect = card.aliases.includes(guess);
    if (isCorrect) {
      const pts = hintLevel === 0 ? 10 : hintLevel === 1 ? 8 : 5;
      const nextStreak = streak + 1;
      setScore((s) => s + pts);
      setStreak(nextStreak);
      setBestStreak((b) => Math.max(b, nextStreak));
      setStatus('correct');
      onMarkLearned(card.item.id);
    } else {
      setStreak(0);
      setStatus('wrong');
      setMissed((m) => [...m, card]);
    }
    if (autoPronounce) speakText(card.primaryWord, accent);
  };

  const handleSkip = () => {
    if (status !== 'idle') return;
    const card = cards[current];
    setStreak(0);
    setStatus('skipped');
    setMissed((m) => [...m, card]);
    if (autoPronounce) speakText(card.primaryWord, accent);
  };

  const handleMultipleChoice = (opt: string) => {
    if (status !== 'idle') return;
    const card = cards[current];
    setPickedOption(opt);
    const isCorrect = opt === card.primaryWord;
    if (isCorrect) {
      const nextStreak = streak + 1;
      setScore((s) => s + 10);
      setStreak(nextStreak);
      setBestStreak((b) => Math.max(b, nextStreak));
      setStatus('correct');
      onMarkLearned(card.item.id);
    } else {
      setStreak(0);
      setStatus('wrong');
      setMissed((m) => [...m, card]);
    }
    if (autoPronounce) speakText(card.primaryWord, accent);
  };

  if (baseImagePool.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        Chưa có từ vựng nào có hình ảnh để chơi chế độ What is it?.
      </div>
    );
  }

  // SETUP SCREEN
  if (!started) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white shadow-sm">
            <Camera className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              What is it? — Đoán từ qua hình ảnh
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Chỉ hiển thị hình ảnh thực tế — tự nhớ và đoán từ tiếng Anh (<strong>{filteredPool.length}</strong> ảnh sẵn sàng).
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {/* Play style */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Kiểu chơi
            </label>
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                onClick={() => setPlayStyle('typing')}
                className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
                  playStyle === 'typing'
                    ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-950/40'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <Keyboard className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Tự gõ từ tiếng Anh</p>
                  <p className="text-xs text-slate-500">
                    Nhìn ảnh rồi gõ từ, chấp nhận cả từ đồng dạng (VD: Fridge / Refrigerator)
                  </p>
                </div>
              </button>

              <button
                onClick={() => setPlayStyle('multiple-choice')}
                className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
                  playStyle === 'multiple-choice'
                    ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-950/40'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-600 dark:text-fuchsia-400" />
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Trắc nghiệm 4 đáp án</p>
                  <p className="text-xs text-slate-500">
                    Nhìn ảnh và chọn nhanh 1 trong 4 từ tiếng Anh cùng chủ đề
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Topic picker */}
          {availableTopics.length > 1 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Chọn chủ đề ảnh ({availableTopics.length} chủ đề)
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setTopicFilter('ALL')}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    topicFilter === 'ALL'
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  Tất cả ({baseImagePool.length})
                </button>
                {availableTopics.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setTopicFilter(t.name)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      topicFilter === t.name
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {t.name} ({t.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question count */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Số hình ảnh mỗi lượt
            </label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[
                { val: 10, label: '10 ảnh' },
                { val: 20, label: '20 ảnh' },
                { val: 30, label: '30 ảnh' },
                { val: 0, label: `Tất cả (${filteredPool.length})` },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => setCount(opt.val)}
                  className={`rounded-xl border py-2 text-xs font-bold transition ${
                    count === opt.val
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={autoPronounce}
                onChange={(e) => setAutoPronounce(e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-600"
              />
              Tự phát âm khi hiện đáp án
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={hideTopicBadge}
                onChange={(e) => setHideTopicBadge(e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-600"
              />
              Ẩn nhãn chủ đề (khó hơn)
            </label>
          </div>

          <button
            onClick={() => startRound()}
            disabled={filteredPool.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 py-3.5 text-sm font-bold text-white shadow-md shadow-indigo-500/20 transition hover:opacity-95 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" /> Bắt đầu đoán ảnh — What is it?
          </button>
        </div>
      </div>
    );
  }

  // SUMMARY SCREEN
  if (finished) {
    const rightCount = cards.length - missed.length;
    const accuracy = cards.length > 0 ? Math.round((rightCount / cards.length) * 100) : 0;

    return (
      <div className="mx-auto max-w-3xl space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <Trophy className="h-8 w-8" />
          </div>
          <h2 className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">
            Kết quả What is it?
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Đoán đúng</p>
              <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">
                {rightCount}/{cards.length} ({accuracy}%)
              </p>
            </div>
            <div className="rounded-2xl bg-indigo-50 p-3 dark:bg-indigo-950/40">
              <p className="text-xs text-indigo-700 dark:text-indigo-300">Tổng điểm</p>
              <p className="text-xl font-extrabold text-indigo-700 dark:text-indigo-300">{score}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 dark:bg-amber-950/40">
              <p className="text-xs text-amber-700 dark:text-amber-300">Chuỗi đúng dài nhất</p>
              <p className="text-xl font-extrabold text-amber-700 dark:text-amber-300">{bestStreak}</p>
            </div>
          </div>
        </div>

        {missed.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">
              Các ảnh chưa đoán đúng ({missed.length})
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {missed.map((c, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-3 dark:border-rose-900 dark:bg-rose-950/20"
                >
                  <img
                    src={c.item.imageUrl}
                    alt={c.primaryWord}
                    className="h-16 w-16 shrink-0 rounded-xl bg-white object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                        {c.item.word}
                      </p>
                      <button
                        onClick={() => speakText(c.primaryWord, accent)}
                        className="shrink-0 rounded p-1 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-950"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {c.item.phoneticUk && (
                      <p className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                        {c.item.phoneticUk}
                      </p>
                    )}
                    <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                      {c.item.meaning}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2.5 pt-2">
          {missed.length > 0 && (
            <button
              onClick={() => startRound(missed.map((m) => m.item))}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700"
            >
              <RotateCcw className="h-4 w-4" /> Đoán lại {missed.length} ảnh sai
            </button>
          )}
          <button
            onClick={() => startRound()}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700"
          >
            <RefreshCw className="h-4 w-4" /> Chơi lượt mới
          </button>
          <button
            onClick={() => setStarted(false)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Đổi chủ đề
          </button>
        </div>
      </div>
    );
  }

  // ACTIVE QUIZ SCREEN
  const card = cards[current];
  const pct = Math.round(((current + 1) / cards.length) * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Top Progress */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold">
          <span className="text-slate-500">
            Ảnh <strong>{current + 1}</strong> / {cards.length}
          </span>
          <div className="flex items-center gap-3">
            {streak >= 2 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                🔥 Chuỗi {streak}
              </span>
            )}
            <span className="text-indigo-600 dark:text-indigo-400">Điểm: {score}</span>
            <button
              onClick={() => setStarted(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Thoát
            </button>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Main Image Card */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <span className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
            What is it? 🤔
          </span>
          {!hideTopicBadge && (card.item.section || card.item.subtopic) && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {card.item.section}
              {card.item.subtopic ? ` · ${card.item.subtopic}` : ''}
            </span>
          )}
        </div>

        {/* Pure Image Showcase */}
        <div className="relative flex h-72 w-full items-center justify-center bg-slate-100 p-3 sm:h-80 dark:bg-slate-950">
          <img
            key={card.item.id}
            src={card.item.imageUrl}
            alt="What is it?"
            className="max-h-full max-w-full rounded-2xl object-contain shadow-md"
          />
        </div>

        {/* Interaction Area */}
        <div className="p-5 sm:p-6">
          {playStyle === 'typing' ? (
            <form onSubmit={handleTypingSubmit} className="space-y-4">
              {/* Progressive Hints Row */}
              {status === 'idle' && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setHintLevel((h) => (h < 2 ? ((h + 1) as 1 | 2) : h))}
                      className="inline-flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {hintLevel === 0 ? 'Gợi ý chữ cái' : 'Mở thêm chữ cái'}
                    </button>
                    <button
                      type="button"
                      onClick={() => speakText(card.primaryWord, accent)}
                      className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300"
                    >
                      <Volume2 className="h-3.5 w-3.5" /> Nghe phát âm
                    </button>
                    <button
                      type="button"
                      onClick={() => setHintLevel(3)}
                      className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <Lightbulb className="h-3.5 w-3.5" /> Xem nghĩa Việt
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSkip}
                    className="text-xs font-semibold text-slate-400 hover:text-rose-500"
                  >
                    Bỏ qua / Xem đáp án
                  </button>
                </div>
              )}

              {/* Active Hint Display */}
              {status === 'idle' && hintLevel > 0 && (
                <div className="space-y-1.5 rounded-2xl bg-amber-50/70 p-3 text-center dark:bg-amber-950/30">
                  <p className="font-mono text-base font-bold tracking-widest text-amber-700 dark:text-amber-300">
                    {makeLetterHint(card.primaryWord, hintLevel)}
                  </p>
                  {hintLevel >= 3 && (
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Nghĩa: <strong>{card.item.meaning}</strong>
                    </p>
                  )}
                </div>
              )}

              <input
                ref={inputRef}
                type="text"
                autoFocus
                disabled={status !== 'idle'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Gõ từ tiếng Anh bạn đoán rồi nhấn Enter..."
                className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3.5 text-center text-lg font-bold outline-none transition focus:border-indigo-500 focus:bg-white disabled:opacity-75 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-indigo-400"
              />

              {status === 'idle' ? (
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-indigo-700"
                >
                  Kiểm tra (Enter)
                </button>
              ) : (
                <RevealPanel
                  card={card}
                  status={status}
                  accent={accent}
                  isLast={current + 1 >= cards.length}
                  onNext={advanceCard}
                />
              )}
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {card.options.map((opt, idx) => {
                  const isCorrect = opt === card.primaryWord;
                  const isPicked = pickedOption === opt;
                  let cls =
                    'border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-indigo-500';
                  if (status !== 'idle') {
                    if (isCorrect) {
                      cls =
                        'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200';
                    } else if (isPicked) {
                      cls =
                        'border-rose-500 bg-rose-50 text-rose-900 dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-200';
                    } else {
                      cls = 'border-slate-200 opacity-50 dark:border-slate-800';
                    }
                  }
                  return (
                    <button
                      key={idx}
                      disabled={status !== 'idle'}
                      onClick={() => handleMultipleChoice(opt)}
                      className={`flex items-center justify-between gap-2 rounded-2xl border p-3.5 text-left text-sm font-bold transition ${cls}`}
                    >
                      <span>
                        <span className="mr-2 text-slate-400">{String.fromCharCode(65 + idx)}.</span>
                        {opt}
                      </span>
                      {status !== 'idle' && isCorrect && (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                      )}
                      {status !== 'idle' && isPicked && !isCorrect && (
                        <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
                      )}
                    </button>
                  );
                })}
              </div>

              {status !== 'idle' && (
                <RevealPanel
                  card={card}
                  status={status}
                  accent={accent}
                  isLast={current + 1 >= cards.length}
                  onNext={advanceCard}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RevealPanel({
  card,
  status,
  accent,
  isLast,
  onNext,
}: {
  card: QuizCard;
  status: 'correct' | 'wrong' | 'skipped';
  accent: Accent;
  isLast: boolean;
  onNext: () => void;
}) {
  return (
    <div
      className={`space-y-3 rounded-2xl border p-4 ${
        status === 'correct'
          ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/40'
          : 'border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {status === 'correct' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-600" />
            )}
            <span className="text-lg font-extrabold text-slate-900 dark:text-white">
              {card.item.word}
            </span>
          </div>
          {card.item.phoneticUk && (
            <p className="mt-0.5 font-mono text-xs text-indigo-600 dark:text-indigo-400">
              {card.item.phoneticUk}
            </p>
          )}
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{card.item.meaning}</p>
        </div>

        <button
          type="button"
          onClick={() => speakText(card.primaryWord, accent)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-xs hover:bg-indigo-50 dark:bg-slate-800 dark:text-indigo-300"
          title="Nghe lại"
        >
          <Volume2 className="h-5 w-5" />
        </button>
      </div>

      {card.item.examples[0] && (
        <p className="border-l-2 border-indigo-300 pl-2.5 text-xs italic text-slate-600 dark:border-indigo-700 dark:text-slate-300">
          “{card.item.examples[0]}”
        </p>
      )}

      <button
        type="button"
        autoFocus
        onClick={onNext}
        className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
      >
        {isLast ? 'Xem kết quả →' : 'Ảnh tiếp theo (Enter) →'}
      </button>
    </div>
  );
}
