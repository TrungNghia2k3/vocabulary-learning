import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Keyboard,
  LayoutGrid,
  MessageSquareQuote,
  Music,
  Search,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { Accent, SongLyricItem } from '../types';
import { speakText } from '../utils/speech';
import { EssayTypingPractice, type EssayPracticeSentence } from './EssayTypingPractice';

interface LyricsViewProps {
  songs: SongLyricItem[];
  accent: Accent;
}

type LyricsTab = 'breakdown' | 'vocab' | 'typing';
type StatusFilter = 'ALL' | 'Done' | 'Pending';

function getRegisterBadge(register?: string): string {
  const low = (register || '').toLowerCase();
  if (/explicit|vulgar|profanity|18\+|nsfw|thô|tục/.test(low)) {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
  }
  if (/slang|aave|street|lóng/.test(low)) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  }
  if (/idiom|phrasal|thành ngữ/.test(low)) {
    return 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300';
  }
  if (/wordplay|metaphor|pun|double|ẩn dụ|chơi chữ/.test(low)) {
    return 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300';
  }
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
}

export function LyricsView({ songs, accent }: LyricsViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(songs[0]?.id || '');

  const [tab, setTab] = useState<LyricsTab>('breakdown');
  const [showTranslations, setShowTranslations] = useState(true);
  const [showNotes, setShowNotes] = useState(true);
  const [lyricSearch, setLyricSearch] = useState('');

  const filteredSongs = useMemo(() => {
    if (statusFilter === 'ALL') return songs;
    return songs.filter((s) => s.status === statusFilter);
  }, [songs, statusFilter]);

  const pickerFiltered = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return filteredSongs;
    return filteredSongs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.genreVibe || '').toLowerCase().includes(q)
    );
  }, [filteredSongs, pickerSearch]);

  const activeSong = useMemo(() => {
    return (
      filteredSongs.find((s) => s.id === selectedId) ||
      filteredSongs[0] ||
      songs[0] ||
      null
    );
  }, [filteredSongs, songs, selectedId]);

  useEffect(() => {
    setLyricSearch('');
  }, [activeSong?.id]);

  const typingSentences = useMemo<EssayPracticeSentence[]>(() => {
    if (!activeSong) return [];
    const out: EssayPracticeSentence[] = [];
    activeSong.sections.forEach((sec, sIdx) => {
      sec.lines.forEach((ln, lIdx) => {
        if (!ln.en.trim()) return;
        out.push({
          id: `${activeSong.id}::${sIdx}::${lIdx}`,
          part: sec.label.replace(/^\[|\]$/g, ''),
          text: ln.en,
          meaning: ln.vi,
        });
      });
    });
    return out;
  }, [activeSong]);

  const doneCount = songs.filter((s) => s.status === 'Done').length;
  const pendingCount = songs.filter((s) => s.status === 'Pending').length;

  // Empty state: Ready for user's first YouTube Music link!
  if (songs.length === 0 || !activeSong) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50/70 p-8 text-center shadow-xs dark:border-indigo-900/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-fuchsia-950/20">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white shadow-md">
            <Music className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-extrabold text-slate-900 dark:text-white">
            Lyrics Studio — Giải mã nhạc nước ngoài cùng AI Agent
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Sheet <code>Lyrics</code> trên Google Sheets đã được khởi tạo sẵn! Bạn chỉ cần dán link{' '}
            <strong>YouTube Music</strong> bài hát bạn thích để AI phân tích trọn vẹn nghĩa thật, slang,
            ẩn dụ, chơi chữ & văn hóa (giữ nguyên sắc thái gốc, không né tránh).
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-extrabold text-white">
                1
              </span>
              <h3 className="mt-2 text-xs font-extrabold text-slate-900 dark:text-white">
                Dán link vào Google Sheets
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Mở tab <code>Lyrics</code>, dán link YouTube Music vào cột <code>A (YouTube Link)</code>{' '}
                (có thể dán nhiều bài một lúc, các cột khác cứ để trống).
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fuchsia-600 text-xs font-extrabold text-white">
                2
              </span>
              <h3 className="mt-2 text-xs font-extrabold text-slate-900 dark:text-white">
                Nhắn “Kiểm tra thay đổi / status”
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Hoặc gửi thẳng danh sách link bài hát vào khung chat để AI lấy lyric, giải mã từng câu &
                trích kho Slang/Idiom.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-extrabold text-white">
                3
              </span>
              <h3 className="mt-2 text-xs font-extrabold text-slate-900 dark:text-white">
                Vừa nghe vừa học tại đây
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Nghe trực tiếp qua trình phát YouTube nhúng sẵn, đọc giải mã từng dòng, học Slang & luyện
                gõ lời bài hát.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeIdx = filteredSongs.findIndex((s) => s.id === activeSong.id);
  const goPrev = () => {
    if (filteredSongs.length <= 1) return;
    const prev = activeIdx > 0 ? activeIdx - 1 : filteredSongs.length - 1;
    setSelectedId(filteredSongs[prev].id);
  };
  const goNext = () => {
    if (filteredSongs.length <= 1) return;
    const next = (activeIdx + 1) % filteredSongs.length;
    setSelectedId(filteredSongs[next].id);
  };

  const q = lyricSearch.trim().toLowerCase();
  const filteredSections = activeSong.sections
    .map((sec) => ({
      ...sec,
      lines: sec.lines.filter(
        (ln) =>
          !q ||
          ln.en.toLowerCase().includes(q) ||
          (ln.vi || '').toLowerCase().includes(q) ||
          (ln.note || '').toLowerCase().includes(q)
      ),
    }))
    .filter((sec) => sec.lines.length > 0);

  const isExplicit = /explicit|18\+|raw|nsfw/i.test(activeSong.genreVibe || '');

  return (
    <div className="space-y-4">
      {/* Compact Top Header + Collapsible Song Picker */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-indigo-600 text-white shadow-xs">
              <Music className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Lyrics Studio — Giải mã nhạc nước ngoài
              </h2>
              <p className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">
                Dán link YouTube Music vào sheet <code>Lyrics</code> để AI giải mã trọn vẹn slang, ẩn ý & sắc thái gốc.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `Tất cả (${songs.length})` },
                { id: 'Done', label: `Đã giải mã (${doneCount})` },
                ...(pendingCount > 0
                  ? [{ id: 'Pending' as const, label: `Chờ AI (${pendingCount})` }]
                  : []),
              ] as Array<{ id: StatusFilter; label: string }>
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                  statusFilter === f.id
                    ? 'bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Compact 1-Row Active Song Selector Strip */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 text-left transition hover:border-fuchsia-400 hover:bg-fuchsia-50/30 dark:border-slate-700/80 dark:bg-slate-800/50 dark:hover:border-fuchsia-600"
          >
            {activeSong.videoId ? (
              <img
                src={`https://i.ytimg.com/vi/${activeSong.videoId}/mqdefault.jpg`}
                alt={activeSong.title}
                className="h-10 w-14 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
              />
            ) : (
              <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                <Music className="h-4 w-4" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-extrabold text-slate-500">
                  Bài {activeIdx + 1}/{filteredSongs.length}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    activeSong.status === 'Done'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {activeSong.status === 'Done' ? 'Đã giải mã' : 'Chờ AI phân tích'}
                </span>
                {isExplicit && (
                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                    E · Raw
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-900 dark:text-white">
                {activeSong.title}{' '}
                <span className="font-medium text-slate-500">— {activeSong.artist}</span>
              </p>
            </div>

            <span className="hidden shrink-0 items-center gap-1 text-[11px] font-bold text-fuchsia-600 sm:inline-flex dark:text-fuchsia-400">
              {pickerOpen ? 'Thu gọn' : 'Đổi bài'}
              {pickerOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={goPrev}
              disabled={filteredSongs.length <= 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={filteredSongs.length <= 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${
                pickerOpen
                  ? 'bg-fuchsia-600 text-white shadow-xs hover:bg-fuchsia-700'
                  : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Playlist ({filteredSongs.length})</span>
              {pickerOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Searchable Playlist Picker */}
        {pickerOpen && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Tìm bài hát theo tên, ca sĩ hoặc thể loại..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-8 pl-8 text-xs outline-none focus:border-fuchsia-500 dark:border-slate-700 dark:bg-slate-900"
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
            </div>

            <div className="grid max-h-[340px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {pickerFiltered.map((song) => {
                const active = song.id === activeSong.id;
                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(song.id);
                      setPickerOpen(false);
                    }}
                    className={`flex items-center gap-2.5 rounded-xl border p-2 text-left transition ${
                      active
                        ? 'border-fuchsia-500 bg-fuchsia-50/80 ring-2 ring-fuchsia-500/20 dark:border-fuchsia-400 dark:bg-fuchsia-950/40'
                        : 'border-slate-200 bg-white hover:border-fuchsia-300 dark:border-slate-700 dark:bg-slate-900'
                    }`}
                  >
                    {song.videoId ? (
                      <img
                        src={`https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg`}
                        alt={song.title}
                        loading="lazy"
                        className="h-12 w-16 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <Music className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {song.title}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">{song.artist}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            song.status === 'Done'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {song.status === 'Done' ? `${song.vocab.length} slang/từ` : 'Chờ AI'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Split-Screen Song Workspace */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* LEFT: Sticky YouTube Player + Context & Story */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:col-span-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {activeSong.videoId ? (
              <div className="aspect-video w-full bg-black">
                <iframe
                  key={activeSong.videoId}
                  src={`https://www.youtube.com/embed/${activeSong.videoId}`}
                  title={activeSong.title}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-slate-100 p-6 text-center text-xs text-slate-500 dark:bg-slate-800">
                <Music className="h-8 w-8 opacity-50" />
                <p>Chưa có Video ID hợp lệ từ link YouTube.</p>
              </div>
            )}

            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {activeSong.title}
                  </h3>
                  <p className="text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400">
                    {activeSong.artist}
                  </p>
                </div>
                {activeSong.youtubeUrl && (
                  <a
                    href={activeSong.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> YT Music
                  </a>
                )}
              </div>

              {activeSong.genreVibe && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <Flame className="h-3 w-3 text-orange-500" />
                    {activeSong.genreVibe}
                  </span>
                </div>
              )}

              {activeSong.contextStory && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs leading-relaxed text-slate-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-slate-200">
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                    <Sparkles className="h-3.5 w-3.5" /> Bối cảnh & Câu chuyện bài hát
                  </p>
                  <p className="whitespace-pre-line">{activeSong.contextStory}</p>
                </div>
              )}

              {activeSong.personalNote && (
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-3 text-xs text-slate-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-slate-300">
                  <span className="font-bold text-amber-800 dark:text-amber-300">Ghi chú của bạn: </span>
                  {activeSong.personalNote}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: 3-Tab Breakdown / Slang / Typing Studio */}
        <div className="space-y-4 lg:col-span-7">
          {activeSong.status === 'Pending' && activeSong.sections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-8 text-center dark:border-amber-800 dark:bg-amber-950/20">
              <Clock className="mx-auto h-8 w-8 text-amber-500" />
              <h3 className="mt-3 text-base font-extrabold text-slate-900 dark:text-white">
                Bài hát đang chờ AI Agent giải mã
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Link bài hát đã được lưu vào sheet <code>Lyrics</code>. Hãy nhắn{' '}
                <strong>“Kiểm tra thay đổi / status”</strong> hoặc bảo AI giải mã bài này để nhận bản
                phân tích từng câu, slang, ẩn ý và từ vựng chi tiết!
              </p>
            </div>
          ) : (
            <>
              {/* Tab Bar */}
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                {[
                  { id: 'breakdown', label: 'Giải mã Lyric', icon: BookOpen },
                  { id: 'vocab', label: `Slang & Từ (${activeSong.vocab.length})`, icon: MessageSquareQuote },
                  { id: 'typing', label: 'Luyện gõ Lyric', icon: Keyboard },
                ].map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id as LyricsTab)}
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

              {/* TAB 1: Line-by-Line Raw Lyrics Breakdown */}
              {tab === 'breakdown' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={lyricSearch}
                        onChange={(e) => setLyricSearch(e.target.value)}
                        placeholder="Tìm câu lời, nghĩa hoặc slang trong bài..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowTranslations((v) => !v)}
                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                          showTranslations
                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        }`}
                      >
                        {showTranslations ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        Nghĩa sát gốc
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNotes((v) => !v)}
                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                          showNotes
                            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Giải mã ẩn ý
                      </button>
                    </div>
                  </div>

                  {filteredSections.map((sec, sIdx) => (
                    <div
                      key={`${sec.label}-${sIdx}`}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="rounded-lg bg-fuchsia-100 px-2.5 py-1 text-xs font-extrabold text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300">
                          {sec.label}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">
                          {sec.lines.length} dòng
                        </span>
                      </div>

                      <div className="space-y-3">
                        {sec.lines.map((ln, lIdx) => (
                          <div
                            key={lIdx}
                            className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm leading-relaxed font-bold text-slate-900 dark:text-white">
                                {ln.en}
                              </p>
                              <button
                                type="button"
                                onClick={() => speakText(ln.en, accent, 0.9)}
                                title="Nghe phát âm câu này"
                                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950"
                              >
                                <Volume2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {showTranslations && ln.vi && (
                              <p className="mt-1 text-xs leading-relaxed font-medium text-indigo-700 dark:text-indigo-300">
                                → {ln.vi}
                              </p>
                            )}

                            {showNotes && ln.note && (
                              <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 text-xs leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                                <span className="font-extrabold">Giải mã: </span>
                                {ln.note}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 2: Key Slang, Idioms & Explicit/Colloquial Expressions */}
              {tab === 'vocab' && (
                <div className="space-y-3">
                  {activeSong.vocab.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                      Chưa có danh sách Slang & Từ vựng riêng cho bài này.
                    </div>
                  ) : (
                    activeSong.vocab.map((item, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-extrabold text-indigo-700 dark:text-indigo-300">
                              {item.phrase}
                            </span>
                            {item.register && (
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${getRegisterBadge(
                                  item.register
                                )}`}
                              >
                                {item.register}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => speakText(item.phrase, accent, 0.9)}
                            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950"
                          >
                            <Volume2 className="h-4 w-4" />
                          </button>
                        </div>

                        <p className="mt-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {item.meaning}
                        </p>

                        {item.usage && (
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                            <strong className="text-slate-700 dark:text-slate-200">Ngữ cảnh / Lưu ý: </strong>
                            {item.usage}
                          </p>
                        )}

                        {item.quote && (
                          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs italic text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                            “{item.quote}”
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: Typing Practice for Lyrics */}
              {tab === 'typing' && (
                <EssayTypingPractice
                  title={`Luyện gõ Lyric: ${activeSong.title}`}
                  subtitle="Gõ lại từng câu lời bài hát để nhớ sâu từ lóng, cấu trúc giao tiếp tự nhiên và cách nối từ."
                  sentences={typingSentences}
                  accent={accent}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
