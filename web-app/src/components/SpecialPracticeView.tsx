import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Search,
  Volume2,
  XCircle,
} from 'lucide-react';
import type {
  Accent,
  CollocationItem,
  IdiomItem,
  PhrasalVerbItem,
  PrepositionItem,
} from '../types';
import { speakText } from '../utils/speech';

interface SpecialPracticeViewProps {
  kind: 'prepositions' | 'phrasal-verbs' | 'idioms' | 'collocations';
  prepositions: PrepositionItem[];
  phrasalVerbs: PhrasalVerbItem[];
  idioms: IdiomItem[];
  collocations: CollocationItem[];
  accent: Accent;
}

export function SpecialPracticeView({
  kind,
  prepositions,
  phrasalVerbs,
  idioms,
  collocations,
  accent,
}: SpecialPracticeViewProps) {
  const [tab, setTab] = useState<'learn' | 'quiz'>('learn');
  const [search, setSearch] = useState('');
  const [selectedColTopic, setSelectedColTopic] = useState<string>('ALL');
  const [selectedColSubtopic, setSelectedColSubtopic] = useState<string>('ALL');
  const [quizIdx, setQuizIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const colTopics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of collocations) {
      counts.set(c.topic, (counts.get(c.topic) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [collocations]);

  const colSubtopics = useMemo(() => {
    if (selectedColTopic === 'ALL') return [];
    const counts = new Map<string, number>();
    for (const c of collocations) {
      if (c.topic !== selectedColTopic || !c.subtopic) continue;
      counts.set(c.subtopic, (counts.get(c.subtopic) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [collocations, selectedColTopic]);

  const scopedCollocations = useMemo(() => {
    return collocations.filter((c) => {
      if (selectedColTopic !== 'ALL' && c.topic !== selectedColTopic) return false;
      if (selectedColSubtopic !== 'ALL' && c.subtopic !== selectedColSubtopic) return false;
      return true;
    });
  }, [collocations, selectedColTopic, selectedColSubtopic]);

  const titleMap = {
    prepositions: 'Giới từ (Prepositions)',
    'phrasal-verbs': 'Cụm động từ (Phrasal Verbs)',
    idioms: 'Thành ngữ (Idioms)',
    collocations: 'Collocations',
  };

  const quizData = useMemo(() => {
    const pairs: Array<{ prompt: string; answer: string; sub?: string }> = [];
    if (kind === 'prepositions') {
      prepositions.forEach((p) => {
        p.uses.forEach((u) => {
          u.examples.forEach((ex) => {
            const blanked = ex.sentence.replace(new RegExp(`\\b${p.preposition}\\b`, 'i'), '_____');
            if (blanked !== ex.sentence) {
              pairs.push({ prompt: blanked, answer: p.preposition, sub: ex.translation });
            }
          });
        });
      });
      const allPreps = Array.from(new Set([...prepositions.map((p) => p.preposition), 'in', 'on', 'at', 'by', 'for', 'to']));
      return pairs.map((q) => {
        const wrong = allPreps.filter((x) => x !== q.answer).sort(() => Math.random() - 0.5).slice(0, 3);
        return { ...q, options: [q.answer, ...wrong].sort(() => Math.random() - 0.5) };
      });
    }

    if (kind === 'phrasal-verbs') {
      const valid = phrasalVerbs.filter((p) => p.meaningsVi.length > 0);
      return valid.map((p) => {
        const answer = p.meaningsVi[0];
        const wrong = valid
          .filter((x) => x.id !== p.id)
          .map((x) => x.meaningsVi[0])
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
        return {
          prompt: p.verb,
          sub: p.examples[0]?.sentence,
          answer,
          options: [answer, ...wrong].sort(() => Math.random() - 0.5),
        };
      });
    }

    if (kind === 'idioms') {
      return idioms.map((it) => {
        const wrong = idioms
          .filter((x) => x.id !== it.id)
          .map((x) => x.vietnamese);
        return {
          prompt: it.idiom,
          sub: it.examples[0]?.sentence,
          answer: it.vietnamese,
          options: [it.vietnamese, ...wrong].sort(() => Math.random() - 0.5),
        };
      });
    }

    // Collocations (scoped to selected Topic / Subtopic)
    const validCols = scopedCollocations.filter((c) => c.phrase && c.meaning);
    const distractorPool = validCols.length >= 4 ? validCols : collocations.filter((c) => c.phrase && c.meaning);
    return [...validCols]
      .sort(() => Math.random() - 0.5)
      .slice(0, 20)
      .map((c) => {
        const wrong = distractorPool
          .filter((x) => x.id !== c.id)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map((x) => x.meaning);
        return {
          prompt: c.phrase,
          sub: c.example,
          answer: c.meaning,
          options: [c.meaning, ...wrong].sort(() => Math.random() - 0.5),
        };
      });
  }, [kind, prepositions, phrasalVerbs, idioms, collocations, scopedCollocations]);

  const q = queryLower(search);

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {titleMap[kind]}
          </h2>
          <p className="text-xs text-slate-500">
            Dữ liệu đồng bộ trực tiếp từ Google Sheets — sửa trên Sheet là ứng dụng tự cập nhật.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setTab('learn')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold ${
              tab === 'learn'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" /> Học & Tra cứu
          </button>
          <button
            onClick={() => {
              setTab('quiz');
              setQuizIdx(0);
              setPicked(null);
              setScore(0);
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold ${
              tab === 'quiz'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" /> Quiz ({quizData.length} câu)
          </button>
        </div>
      </div>

      {/* Collocations Topic & Subtopic Selector (applies to both Learn & Quiz) */}
      {kind === 'collocations' && colTopics.length > 0 && (
        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Chủ đề:
            </span>
            <button
              onClick={() => {
                setSelectedColTopic('ALL');
                setSelectedColSubtopic('ALL');
                setQuizIdx(0);
                setPicked(null);
                setScore(0);
              }}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                selectedColTopic === 'ALL'
                  ? 'border-indigo-500 bg-indigo-600 text-white shadow-xs'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              Tất cả ({collocations.length})
            </button>
            {colTopics.map((t) => (
              <button
                key={t.name}
                onClick={() => {
                  setSelectedColTopic(t.name);
                  setSelectedColSubtopic('ALL');
                  setQuizIdx(0);
                  setPicked(null);
                  setScore(0);
                }}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  selectedColTopic === t.name
                    ? 'border-indigo-500 bg-indigo-600 text-white shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {t.name} ({t.count})
              </button>
            ))}
          </div>

          {colSubtopics.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-400">Nhóm con:</span>
              <button
                onClick={() => {
                  setSelectedColSubtopic('ALL');
                  setQuizIdx(0);
                  setPicked(null);
                  setScore(0);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  selectedColSubtopic === 'ALL'
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Tất cả nhóm con
              </button>
              {colSubtopics.map((st) => (
                <button
                  key={st.name}
                  onClick={() => {
                    setSelectedColSubtopic(st.name);
                    setQuizIdx(0);
                    setPicked(null);
                    setScore(0);
                  }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    selectedColSubtopic === st.name
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {st.name} ({st.count})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'learn' && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Lọc nhanh..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-4 pl-10 text-sm outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          {kind === 'prepositions' && (
            <div className="space-y-4">
              {prepositions
                .filter((p) => !q || p.preposition.toLowerCase().includes(q) || p.meaning.toLowerCase().includes(q))
                .map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="rounded-xl bg-indigo-600 px-3.5 py-1 text-lg font-extrabold text-white">
                          {p.preposition}
                        </span>
                        <span className="text-base font-bold text-slate-800 dark:text-slate-100">
                          {p.meaning}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {p.category}
                        </span>
                      </div>
                      <button
                        onClick={() => speakText(p.preposition, accent)}
                        className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      {p.uses.map((u, idx) => (
                        <div key={idx} className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                          <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                            {u.usage}
                          </p>
                          <p className="text-xs text-slate-500">{u.description}</p>
                          <ul className="mt-2 space-y-1.5 text-xs">
                            {u.examples.map((ex, i) => (
                              <li key={i}>
                                <p className="font-medium text-slate-800 dark:text-slate-200">
                                  • {ex.sentence}
                                </p>
                                {ex.translation && (
                                  <p className="pl-2.5 text-slate-500">{ex.translation}</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>

                    {p.commonMistakes.length > 0 && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900 dark:bg-amber-950/30">
                        <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5" /> Lỗi sai thường gặp
                        </p>
                        <div className="mt-2 space-y-1.5 text-xs">
                          {p.commonMistakes.map((m, idx) => (
                            <div key={idx} className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-rose-100 px-2 py-0.5 font-semibold text-rose-700 line-through dark:bg-rose-950 dark:text-rose-300">
                                {m.incorrect}
                              </span>
                              <span>→</span>
                              <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                {m.correct}
                              </span>
                              <span className="text-slate-600 dark:text-slate-400">
                                ({m.explanation})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {kind === 'phrasal-verbs' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {phrasalVerbs
                .filter(
                  (p) =>
                    !q ||
                    p.verb.toLowerCase().includes(q) ||
                    p.meaningsVi.some((m) => m.toLowerCase().includes(q))
                )
                .map((pv) => (
                  <div
                    key={pv.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-lg font-extrabold text-indigo-700 dark:text-indigo-400">
                          {pv.verb}
                        </h3>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium dark:bg-slate-800">
                            {pv.type}
                          </span>
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                            {pv.difficulty}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => speakText(pv.verb, accent)}
                        className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    </div>

                    {pv.meaningsVi.length > 0 && (
                      <ul className="mt-3 space-y-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {pv.meaningsVi.map((m, i) => (
                          <li key={i}>• {m}</li>
                        ))}
                      </ul>
                    )}

                    {pv.examples.length > 0 && (
                      <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                        {pv.examples.slice(0, 3).map((ex, i) => (
                          <div key={i}>
                            <p className="italic text-slate-700 dark:text-slate-200">“{ex.sentence}”</p>
                            {ex.translation && <p className="text-slate-500">{ex.translation}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {pv.usage && (
                      <p className="mt-2.5 text-xs text-amber-700 dark:text-amber-300">
                        <strong>Lưu ý:</strong> {pv.usage}
                      </p>
                    )}

                    {pv.synonyms.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {pv.synonyms.map((s, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          >
                            ≈ {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {kind === 'idioms' && (
            <div className="space-y-4">
              {idioms
                .filter(
                  (it) =>
                    !q ||
                    it.idiom.toLowerCase().includes(q) ||
                    it.vietnamese.toLowerCase().includes(q)
                )
                .map((it) => (
                  <div
                    key={it.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                          “{it.idiom}”
                        </h3>
                        <p className="mt-1 text-base font-semibold text-indigo-600 dark:text-indigo-400">
                          {it.vietnamese}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{it.meaning}</p>
                      </div>
                      <button
                        onClick={() => speakText(it.idiom, accent)}
                        className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    </div>

                    {it.origin && (
                      <p className="mt-3 rounded-xl bg-amber-50/70 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        <strong>Nguồn gốc:</strong> {it.origin}
                      </p>
                    )}

                    {it.examples.length > 0 && (
                      <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                        {it.examples.map((ex, i) => (
                          <div key={i}>
                            <p className="font-medium italic text-slate-800 dark:text-slate-200">
                              • “{ex.sentence}”
                            </p>
                            {ex.translation && <p className="pl-2.5 text-slate-500">{ex.translation}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {kind === 'collocations' && (() => {
            const filteredCols = scopedCollocations.filter(
              (c) =>
                !q ||
                c.phrase.toLowerCase().includes(q) ||
                c.meaning.toLowerCase().includes(q) ||
                (c.relatedWord || '').toLowerCase().includes(q) ||
                c.topic.toLowerCase().includes(q) ||
                (c.subtopic || '').toLowerCase().includes(q)
            );
            const grouped = new Map<string, CollocationItem[]>();
            for (const c of filteredCols) {
              const groupKey =
                selectedColTopic === 'ALL'
                  ? c.topic
                  : c.subtopic || c.topic;
              const list = grouped.get(groupKey) || [];
              list.push(c);
              grouped.set(groupKey, list);
            }
            if (filteredCols.length === 0) {
              return (
                <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
                  Không tìm thấy collocation phù hợp.
                </div>
              );
            }
            return (
              <div className="space-y-6">
                {Array.from(grouped.entries()).map(([groupTitle, list]) => (
                  <div key={groupTitle} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                      <h3 className="text-sm font-extrabold uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
                        {groupTitle}
                      </h3>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                        {list.length} cụm từ
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((c) => (
                        <div
                          key={c.id}
                          className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-base font-bold text-indigo-700 dark:text-indigo-400">
                              {c.phrase}
                            </h4>
                            <button
                              onClick={() => speakText(c.phrase, accent)}
                              className="rounded-lg p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950"
                            >
                              <Volume2 className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {c.meaning}
                          </p>
                          {c.example && (
                            <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">
                              “{c.example}”
                            </p>
                          )}
                          {c.exampleTranslation && (
                            <p className="mt-0.5 text-xs text-slate-400">{c.exampleTranslation}</p>
                          )}
                          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-[11px]">
                            {c.relatedWord && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                Từ gốc: {c.relatedWord}
                              </span>
                            )}
                            {c.subtopic && selectedColTopic === 'ALL' && (
                              <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                                {c.subtopic}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}

      {tab === 'quiz' && (
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {quizData.length === 0 ? (
            <p className="text-center text-sm text-slate-500">Chưa đủ dữ liệu để tạo quiz.</p>
          ) : quizIdx >= quizData.length ? (
            <div className="text-center">
              <h3 className="text-2xl font-extrabold">Hoàn thành!</h3>
              <p className="mt-1 text-sm text-slate-500">
                Bạn trả lời đúng <strong>{score}/{quizData.length}</strong> câu.
              </p>
              <button
                onClick={() => {
                  setQuizIdx(0);
                  setPicked(null);
                  setScore(0);
                }}
                className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white"
              >
                Làm lại
              </button>
            </div>
          ) : (
            (() => {
              const cur = quizData[quizIdx];
              return (
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-500">
                    <span>
                      Câu {quizIdx + 1} / {quizData.length}
                    </span>
                    <span className="text-emerald-600">Đúng: {score}</span>
                  </div>
                  <h3 className="mt-3 text-xl font-extrabold text-slate-900 dark:text-white">
                    {cur.prompt}
                  </h3>
                  {cur.sub && <p className="mt-1 text-xs italic text-slate-500">{cur.sub}</p>}

                  <div className="mt-4 space-y-2">
                    {cur.options.map((opt, i) => {
                      const isCorrect = opt === cur.answer;
                      const isPicked = picked === opt;
                      let cls =
                        'border-slate-200 hover:border-indigo-400 dark:border-slate-700';
                      if (picked !== null) {
                        if (isCorrect) cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60';
                        else if (isPicked) cls = 'border-rose-500 bg-rose-50 dark:bg-rose-950/60';
                      }
                      return (
                        <button
                          key={i}
                          disabled={picked !== null}
                          onClick={() => {
                            setPicked(opt);
                            if (isCorrect) setScore((s) => s + 1);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm font-medium ${cls}`}
                        >
                          <span>{opt}</span>
                          {picked !== null && isCorrect && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          )}
                          {picked !== null && isPicked && !isCorrect && (
                            <XCircle className="h-4 w-4 text-rose-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {picked !== null && (
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => {
                          setQuizIdx((i) => i + 1);
                          setPicked(null);
                        }}
                        className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white"
                      >
                        Tiếp theo →
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}

function queryLower(s: string) {
  return s.trim().toLowerCase();
}
