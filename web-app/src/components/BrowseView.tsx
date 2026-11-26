import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Lightbulb,
  Search,
  Volume2,
  X,
} from 'lucide-react';
import type { Accent, DeckInfo, VocabItem } from '../types';
import { speakText } from '../utils/speech';
import { getUrlIntParam, getUrlParam, syncUrlParams } from '../utils/urlParams';

interface BrowseViewProps {
  items: VocabItem[];
  decks: DeckInfo[];
  selectedDeck: string;
  onSelectDeck: (deck: string) => void;
  learnedIds: Set<string>;
  onToggleLearned: (id: string) => void;
  accent: Accent;
}

export function BrowseView({
  items,
  decks,
  selectedDeck,
  onSelectDeck,
  learnedIds,
  onToggleLearned,
  accent,
}: BrowseViewProps) {
  const [query, setQuery] = useState(() => getUrlParam('q') || '');
  const [statusFilter, setStatusFilter] = useState<'all' | 'learned' | 'unlearned' | 'with-image'>(() => {
    const f = getUrlParam('filter');
    return f === 'learned' || f === 'unlearned' || f === 'with-image' ? f : 'all';
  });
  const [page, setPage] = useState(() => Math.max(1, getUrlIntParam('page') || 1));
  const [activeItem, setActiveItem] = useState<VocabItem | null>(() => {
    const wordParam = getUrlParam('word');
    if (!wordParam) return null;
    const lower = wordParam.toLowerCase();
    return items.find((it) => it.id === wordParam || it.word.toLowerCase() === lower) || null;
  });
  const pageSize = 24;

  useEffect(() => {
    syncUrlParams(
      {
        q: query.trim() || null,
        filter: statusFilter !== 'all' ? statusFilter : null,
        page: page > 1 ? page : null,
        word: activeItem ? activeItem.word : null,
      },
      { preserveKeys: ['deck', 'topic'] }
    );
  }, [query, statusFilter, page, activeItem]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter === 'learned' && !learnedIds.has(item.id)) return false;
      if (statusFilter === 'unlearned' && learnedIds.has(item.id)) return false;
      if (statusFilter === 'with-image' && !item.imageUrl) return false;
      if (!q) return true;
      return (
        item.word.toLowerCase().includes(q) ||
        item.meaning.toLowerCase().includes(q) ||
        (item.section || '').toLowerCase().includes(q) ||
        (item.subtopic || '').toLowerCase().includes(q) ||
        item.synonyms.some((s) => s.word.toLowerCase().includes(q)) ||
        item.examples.some((e) => e.toLowerCase().includes(q))
      );
    });
  }, [items, query, statusFilter, learnedIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm từ tiếng Anh, nghĩa tiếng Việt, đồng nghĩa, ví dụ..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm outline-none focus:border-indigo-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:focus:border-indigo-400"
          />
        </div>

        <select
          value={selectedDeck}
          onChange={(e) => {
            onSelectDeck(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="ALL">Tất cả bộ từ ({decks.reduce((s, d) => s + (d.kind === 'vocab' ? d.count : 0), 0)})</option>
          {decks
            .filter((d) => d.kind === 'vocab')
            .map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.count})
              </option>
            ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="unlearned">Chưa học</option>
          <option value="learned">Đã thuộc</option>
          <option value="with-image">Có hình ảnh</option>
        </select>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          Hiển thị <strong>{paged.length}</strong> / {filtered.length} từ
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-40 dark:border-slate-700"
            >
              Trước
            </button>
            <span>
              Trang {safePage} / {totalPages}
            </span>
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-40 dark:border-slate-700"
            >
              Sau
            </button>
          </div>
        )}
      </div>

      {/* Cards Grid */}
      {paged.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-14 text-center text-sm text-slate-500 dark:border-slate-700">
          Không tìm thấy từ vựng phù hợp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paged.map((item) => {
            const learned = learnedIds.has(item.id);
            const phonetic = accent === 'en-US' ? item.phoneticUs || item.phoneticUk : item.phoneticUk || item.phoneticUs;
            return (
              <div
                key={item.id}
                onClick={() => setActiveItem(item)}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
              >
                {item.imageUrl && (
                  <div className="relative h-40 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img
                      src={item.imageUrl}
                      alt={item.word}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      onError={(e) => {
                        (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {item.word}
                      </h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {phonetic && <span className="font-mono text-indigo-600 dark:text-indigo-400">{phonetic}</span>}
                        {item.partOfSpeech && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">
                            {item.partOfSpeech}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        title="Phát âm"
                        onClick={(e) => {
                          e.stopPropagation();
                          speakText(item.word, accent);
                        }}
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                      <button
                        title={learned ? 'Bỏ đánh dấu đã học' : 'Đánh dấu đã thuộc'}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLearned(item.id);
                        }}
                        className={`rounded-lg p-1.5 transition ${
                          learned
                            ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400'
                            : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {learned ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
                    {item.meaning || <span className="italic text-slate-400">Chưa có nghĩa</span>}
                  </p>

                  {item.examples[0] && (
                    <p className="mt-2 line-clamp-2 border-l-2 border-indigo-200 pl-2 text-xs italic text-slate-500 dark:border-indigo-800 dark:text-slate-400">
                      “{item.examples[0]}”
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-1 pt-3 text-[11px] text-slate-400">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <span className="truncate rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {item.section || item.deck}
                      </span>
                      {item.subtopic && (
                        <span className="truncate rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                          {item.subtopic}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-medium text-indigo-600 dark:text-indigo-400">
                      Xem chi tiết →
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Word Detail Modal */}
      {activeItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onClick={() => setActiveItem(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    {activeItem.word}
                  </h2>
                  <button
                    onClick={() => speakText(activeItem.word, accent)}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                  >
                    <Volume2 className="h-3.5 w-3.5" /> Nghe
                  </button>
                  {activeItem.cambridgeUrl && (
                    <a
                      href={activeItem.cambridgeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Cambridge <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                  {activeItem.phoneticUk && <span>UK: {activeItem.phoneticUk}</span>}
                  {activeItem.phoneticUs && activeItem.phoneticUs !== activeItem.phoneticUk && (
                    <span>US: {activeItem.phoneticUs}</span>
                  )}
                  {activeItem.partOfSpeech && <span className="font-medium">({activeItem.partOfSpeech})</span>}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                    {activeItem.deck}
                    {activeItem.section ? ` · ${activeItem.section}` : ''}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveItem(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {activeItem.imageUrl && (
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                <img
                  src={activeItem.imageUrl}
                  alt={activeItem.word}
                  className="max-h-64 w-full object-contain"
                />
              </div>
            )}

            <div className="mt-4 space-y-4 text-sm">
              <div className="rounded-xl bg-indigo-50/70 p-3.5 dark:bg-indigo-950/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  Nghĩa tiếng Việt
                </p>
                <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                  {activeItem.meaning || 'Chưa cập nhật'}
                </p>
              </div>

              {activeItem.memoryTip && (
                <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3.5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-xs font-bold uppercase">Mẹo nhớ / Phát âm</p>
                    <p className="mt-0.5">{activeItem.memoryTip}</p>
                  </div>
                </div>
              )}

              {activeItem.collocations.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Collocations</h4>
                  <ul className="mt-1.5 space-y-1">
                    {activeItem.collocations.map((c, idx) => (
                      <li key={idx} className="rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800/70">
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeItem.examples.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Ví dụ thực tế</h4>
                  <ul className="mt-1.5 space-y-2">
                    {activeItem.examples.map((ex, idx) => (
                      <li
                        key={idx}
                        className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/70"
                      >
                        <span className="italic text-slate-700 dark:text-slate-300">“{ex}”</span>
                        <button
                          onClick={() => speakText(ex, accent)}
                          className="shrink-0 rounded p-1 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-950"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeItem.definitions.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Định nghĩa tiếng Anh</h4>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
                    {activeItem.definitions.map((d, idx) => (
                      <li key={idx}>
                        {d.partOfSpeech && <span className="font-semibold">[{d.partOfSpeech}] </span>}
                        {d.definition}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(activeItem.synonyms.length > 0 || activeItem.antonyms.length > 0) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {activeItem.synonyms.length > 0 && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                      <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400">
                        Đồng nghĩa (Synonyms)
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {activeItem.synonyms.map((s, idx) => (
                          <span
                            key={idx}
                            className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-emerald-800 shadow-2xs dark:bg-slate-800 dark:text-emerald-300"
                          >
                            {s.word}
                            {s.meaning ? ` (${s.meaning})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeItem.antonyms.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900 dark:bg-rose-950/30">
                      <p className="text-xs font-bold uppercase text-rose-700 dark:text-rose-400">
                        Trái nghĩa (Antonyms)
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {activeItem.antonyms.map((a, idx) => (
                          <span
                            key={idx}
                            className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-rose-800 shadow-2xs dark:bg-slate-800 dark:text-rose-300"
                          >
                            {a.word}
                            {a.meaning ? ` (${a.meaning})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {Object.keys(activeItem.wordFamily).length > 0 && (
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs font-bold uppercase text-slate-500">Gia đình từ (Word Family)</p>
                  <div className="mt-2 space-y-1.5">
                    {Object.entries(activeItem.wordFamily).map(([pos, list]) => (
                      <div key={pos} className="text-xs">
                        <span className="font-semibold capitalize text-indigo-600 dark:text-indigo-400">
                          {pos}:{' '}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {list.map((w) => (w.meaning ? `${w.word} (${w.meaning})` : w.word)).join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => onToggleLearned(activeItem.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  learnedIds.has(activeItem.id)
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                {learnedIds.has(activeItem.id) ? 'Đã thuộc (nhấn để bỏ)' : 'Đánh dấu đã thuộc'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
