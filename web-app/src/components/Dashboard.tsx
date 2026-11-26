import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  Camera,
  CheckCircle2,
  FilePenLine,
  GitBranch,
  HelpCircle,
  Image as ImageIcon,
  Keyboard,
  Layers,
  Link2,
  List,
  MessageSquareQuote,
  Mic,
  Music,
  Newspaper,
  Puzzle,
  Sparkles,
  TrendingUp,
  Trophy,
  Tv,
} from 'lucide-react';
import type { AppMode, DeckInfo, ParsedLibrary, VocabItem } from '../types';

interface DashboardProps {
  library: ParsedLibrary;
  activeVocab: VocabItem[];
  selectedDeck: string;
  onSelectDeck: (deck: string) => void;
  selectedTopic: string;
  onSelectTopic: (topic: string) => void;
  availableTopics: Array<{ name: string; count: number; learned: number }>;
  learnedIds: Set<string>;
  highScore: number;
  onNavigate: (mode: AppMode) => void;
}

export function Dashboard({
  library,
  activeVocab,
  selectedDeck,
  onSelectDeck,
  selectedTopic,
  onSelectTopic,
  availableTopics,
  learnedIds,
  highScore,
  onNavigate,
}: DashboardProps) {
  const totalCount = activeVocab.length;
  const learnedCount = activeVocab.filter((v) => learnedIds.has(v.id)).length;
  const progress = totalCount > 0 ? Math.round((learnedCount / totalCount) * 100) : 0;
  const synAntCount = activeVocab.filter((v) => v.synonyms.length > 0 || v.antonyms.length > 0).length;
  const imageVocabCount =
    activeVocab.filter((v) => Boolean(v.imageUrl)).length ||
    library.vocab.filter((v) => Boolean(v.imageUrl)).length;

  const vocabDecks = library.decks.filter((d) => d.kind === 'vocab');
  const emptyDecks = library.decks.filter((d) => d.kind === 'empty');

  const deckLearnedCount = (deckName: string) =>
    library.vocab.filter((v) => v.deck === deckName && learnedIds.has(v.id)).length;

  const mainModes: Array<{
    mode: AppMode;
    title: string;
    desc: string;
    icon: typeof Layers;
    color: string;
    badge?: string;
  }> = [
    {
      mode: 'flashcard',
      title: 'Flashcard 3D',
      desc: 'Lật thẻ ghi nhớ có ảnh minh họa, phiên âm, ví dụ & mẹo nhớ',
      icon: Layers,
      color: 'from-indigo-500 to-blue-600',
      badge: `${totalCount} thẻ`,
    },
    {
      mode: 'image-quiz',
      title: 'What is it? (Đoán ảnh)',
      desc: 'Chỉ hiện hình ảnh thực tế — tự gõ hoặc chọn từ tiếng Anh tương ứng',
      icon: Camera,
      color: 'from-fuchsia-500 to-indigo-600',
      badge: `${imageVocabCount} ảnh`,
    },
    {
      mode: 'quiz',
      title: 'Quiz Trắc nghiệm',
      desc: 'Chọn nghĩa Anh–Việt, Việt–Anh hoặc nghe phát âm chọn từ',
      icon: HelpCircle,
      color: 'from-emerald-500 to-teal-600',
    },
    {
      mode: 'syn-ant-quiz',
      title: 'Quiz Đồng / Trái nghĩa',
      desc: 'Luyện mở rộng vốn từ với Synonym, Antonym & Paraphrase',
      icon: Brain,
      color: 'from-amber-500 to-orange-600',
      badge: `${synAntCount} từ có dữ liệu`,
    },
    {
      mode: 'browse',
      title: 'Duyệt & Tra từ vựng',
      desc: 'Tìm kiếm nhanh, xem ảnh thực tế, mở Cambridge & đánh dấu đã học',
      icon: List,
      color: 'from-sky-500 to-cyan-600',
    },
    {
      mode: 'spelling',
      title: 'Luyện gõ chính tả',
      desc: 'Nghe phát âm + nhìn nghĩa tiếng Việt và gõ chính xác từ tiếng Anh',
      icon: Keyboard,
      color: 'from-violet-500 to-purple-600',
    },
    {
      mode: 'today',
      title: 'Từ mới hôm nay',
      desc: 'Chọn số lượng hoặc khoảng từ → Học thẻ → Quiz → Luyện viết',
      icon: CalendarDays,
      color: 'from-rose-500 to-pink-600',
    },
  ];

  const specialModes: Array<{
    mode: AppMode;
    title: string;
    count: number;
    icon: typeof Link2;
    subtitle: string;
  }> = [
    {
      mode: 'ielts-task1',
      title: 'IELTS Writing Task 1',
      count: library.ieltsTask1.length,
      icon: BarChart3,
      subtitle: 'Charts, Maps & Process kèm ảnh đề bài, phân tích 4 phần & luyện viết',
    },
    {
      mode: 'ielts-task2',
      title: 'IELTS Writing Task 2',
      count: library.ieltsTask2.length,
      icon: FilePenLine,
      subtitle: 'Đề bài luận, khung bài mẫu (Format), kho cụm từ Band 7–8+ & luyện viết',
    },
    {
      mode: 'ielts-speaking',
      title: 'IELTS Speaking',
      count: library.ieltsSpeaking.length,
      icon: Mic,
      subtitle: 'Nghe lại từng câu để Shadowing, ghi âm đối chiếu, so khớp phát âm & thi thử',
    },
    {
      mode: 'lyrics',
      title: 'Lyrics Studio',
      count: library.lyrics.length,
      icon: Music,
      subtitle: 'Nghe YouTube Music, giải mã từng câu lời, slang, ẩn ý & văn hóa gốc',
    },
    {
      mode: 'news',
      title: 'News Studio (Đọc báo)',
      count: library.news.length,
      icon: Newspaper,
      subtitle: 'Tin mới The Guardian & NPR chạm tra từ tại chỗ + bài phân tích sâu IELTS',
    },
    {
      mode: 'books',
      title: 'Book Studio (Đọc sách PDF)',
      count: library.vocab.filter((v) => v.deck === 'Book Vocab').length,
      icon: BookOpen,
      subtitle: 'Đọc sách PDF đồng bộ Google Drive, chạm tra từ, nghe đọc & lưu thẳng Sheet',
    },
    {
      mode: 'video',
      title: 'Video Studio (YouTube)',
      count: library.vocab.filter((v) => v.deck === 'Video Vocab').length,
      icon: Tv,
      subtitle: 'TED-Ed, BBC, Vox, NatGeo — phụ đề đồng bộ thời gian thực, lặp Shadowing & lưu cụm từ',
    },
    {
      mode: 'prepositions',
      title: 'Giới từ (Prepositions)',
      count: library.prepositions.length,
      icon: Link2,
      subtitle: 'Cách dùng, lỗi sai phổ biến & bài tập',
    },
    {
      mode: 'phrasal-verbs',
      title: 'Cụm động từ (Phrasal Verbs)',
      count: library.phrasalVerbs.length,
      icon: GitBranch,
      subtitle: 'Tách/không tách, chia thì & quiz',
    },
    {
      mode: 'idioms',
      title: 'Thành ngữ (Idioms)',
      count: library.idioms.length,
      icon: MessageSquareQuote,
      subtitle: 'Nguồn gốc, ngữ cảnh & ví dụ thực tế',
    },
    {
      mode: 'collocations',
      title: 'Collocations',
      count: library.collocations.length,
      icon: Puzzle,
      subtitle: 'Cụm từ tự nhiên từ Collocations & Comprehensible Input',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Tổng từ trong bộ"
          value={totalCount.toLocaleString()}
          sub={selectedDeck === 'ALL' ? `${vocabDecks.length} sheets đang hoạt động` : selectedDeck}
          icon={<BookOpen className="h-5 w-5" />}
          accent="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
        />
        <StatCard
          label="Đã thuộc"
          value={learnedCount.toLocaleString()}
          sub={`${Math.max(0, totalCount - learnedCount)} từ chưa học`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
        />
        <StatCard
          label="Tiến độ hoàn thành"
          value={`${progress}%`}
          sub="Lưu tự động trên trình duyệt"
          icon={<TrendingUp className="h-5 w-5" />}
          accent="bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400"
        />
        <StatCard
          label="Điểm Quiz cao nhất"
          value={highScore.toLocaleString()}
          sub="Chinh phục mốc mới mỗi ngày"
          icon={<Trophy className="h-5 w-5" />}
          accent="bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
        />
      </section>

      {/* Deck Selector (From Google Sheets) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Chọn bộ từ vựng từ Google Sheets
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dữ liệu đọc trực tiếp từ thư mục <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">sheets/*.csv</code> — tự động cập nhật khi bạn sync.
            </p>
          </div>
          {emptyDecks.length > 0 && (
            <span className="text-xs text-slate-400">
              Sheet đang trống: {emptyDecks.map((d) => d.name).join(', ')}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <DeckChip
            active={selectedDeck === 'ALL'}
            name="Tất cả bộ từ"
            count={library.vocab.length}
            learned={library.vocab.filter((v) => learnedIds.has(v.id)).length}
            hasImages
            onClick={() => onSelectDeck('ALL')}
          />
          {vocabDecks.map((d: DeckInfo) => (
            <DeckChip
              key={d.name}
              active={selectedDeck === d.name}
              name={d.name}
              count={d.count}
              learned={deckLearnedCount(d.name)}
              hasImages={d.hasImages}
              onClick={() => onSelectDeck(d.name)}
            />
          ))}
        </div>

        {/* Dynamic Topics inside selected deck */}
        {selectedDeck !== 'ALL' && availableTopics.length > 1 && (
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Chủ đề trong “{selectedDeck}” ({availableTopics.length} nhóm)
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onSelectTopic('ALL')}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  selectedTopic === 'ALL'
                    ? 'border-indigo-500 bg-indigo-600 text-white shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                Tất cả chủ đề
              </button>
              {availableTopics.map((t) => (
                <button
                  key={t.name}
                  onClick={() => onSelectTopic(t.name)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    selectedTopic === t.name
                      ? 'border-indigo-500 bg-indigo-600 text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span>{t.name}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                      selectedTopic === t.name
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400'
                    }`}
                  >
                    {t.learned}/{t.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Main Study Modes */}
      <section>
        <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-white">Chế độ học chính</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mainModes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.mode}
                onClick={() => onNavigate(item.mode)}
                className="group relative flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
              >
                <div className="mb-3 flex w-full items-center justify-between">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} text-white shadow-sm`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  {item.badge && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {item.badge}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Special Practice Modes */}
      <section>
        <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-white">
          Chế độ luyện tập chuyên sâu
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {specialModes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.mode}
                onClick={() => onNavigate(item.mode)}
                className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-violet-700"
              >
                <div className="mb-2.5 flex w-full items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition group-hover:bg-violet-600 group-hover:text-white dark:bg-slate-800 dark:text-slate-200">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-950/70 dark:text-violet-300">
                    {item.count} mục
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {value}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
          {icon}
        </div>
      </div>
      <p className="mt-2 truncate text-xs text-slate-400 dark:text-slate-500">{sub}</p>
    </div>
  );
}

function DeckChip({
  active,
  name,
  count,
  learned,
  hasImages,
  onClick,
}: {
  active: boolean;
  name: string;
  count: number;
  learned: number;
  hasImages: boolean;
  onClick: () => void;
}) {
  const pct = count > 0 ? Math.round((learned / count) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className={`flex flex-col rounded-xl border p-3 text-left transition ${
        active
          ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-950/40'
          : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{name}</span>
        <div className="flex items-center gap-1">
          {hasImages && (
            <span title="Có ảnh minh họa">
              <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
            </span>
          )}
          <span className="rounded-md bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-600 shadow-2xs dark:bg-slate-900 dark:text-slate-300">
            {count}
          </span>
        </div>
      </div>
      <div className="mt-2.5 flex w-full items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{pct}%</span>
      </div>
    </button>
  );
}
