import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  Camera,
  FilePenLine,
  GitBranch,
  HelpCircle,
  Home,
  Keyboard,
  Layers,
  Link2,
  List,
  MessageSquareQuote,
  Mic,
  Music,
  Newspaper,
  Puzzle,
  Tv,
} from 'lucide-react';
import { buildLibrary } from './data/sheetParser';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { BrowseView } from './components/BrowseView';
import { FlashcardView } from './components/FlashcardView';
import { QuizView } from './components/QuizView';
import { ImageQuizView } from './components/ImageQuizView';
import { SpellingView } from './components/SpellingView';
import { TodayWordsView } from './components/TodayWordsView';
import { SpecialPracticeView } from './components/SpecialPracticeView';
import { IeltsTask1View } from './components/IeltsTask1View';
import { IeltsTask2View } from './components/IeltsTask2View';
import { IeltsSpeakingView } from './components/IeltsSpeakingView';
import { LyricsView } from './components/LyricsView';
import { NewsView } from './components/NewsView';
import { BookStudioView } from './components/BookStudioView';
import { VideoStudioView } from './components/VideoStudioView';
import type { Accent, AppMode } from './types';
import {
  getStudyStreak,
  loadAccent,
  loadDarkMode,
  loadHighScore,
  loadLearnedSet,
  saveAccent,
  saveDarkMode,
  saveHighScore,
  saveLearnedSet,
  touchStudyStreak,
} from './utils/storage';
import { getUrlParam, setUrlParams } from './utils/urlParams';

const NAV_TABS: Array<{ id: AppMode; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: 'Tổng quan', icon: Home },
  { id: 'browse', label: 'Duyệt từ', icon: List },
  { id: 'flashcard', label: 'Flashcard', icon: Layers },
  { id: 'image-quiz', label: 'What is it?', icon: Camera },
  { id: 'quiz', label: 'Quiz', icon: HelpCircle },
  { id: 'syn-ant-quiz', label: 'Đồng/Trái nghĩa', icon: Brain },
  { id: 'spelling', label: 'Chính tả', icon: Keyboard },
  { id: 'today', label: 'Hôm nay', icon: CalendarDays },
  { id: 'ielts-task1', label: 'IELTS Task 1', icon: BarChart3 },
  { id: 'ielts-task2', label: 'IELTS Task 2', icon: FilePenLine },
  { id: 'ielts-speaking', label: 'IELTS Speaking', icon: Mic },
  { id: 'lyrics', label: 'Lyrics', icon: Music },
  { id: 'news', label: 'Đọc báo', icon: Newspaper },
  { id: 'books', label: 'Đọc sách PDF', icon: BookOpen },
  { id: 'video', label: 'Xem YouTube', icon: Tv },
  { id: 'prepositions', label: 'Giới từ', icon: Link2 },
  { id: 'phrasal-verbs', label: 'Phrasal Verbs', icon: GitBranch },
  { id: 'idioms', label: 'Idioms', icon: MessageSquareQuote },
  { id: 'collocations', label: 'Collocations', icon: Puzzle },
];

const VALID_MODES = new Set<AppMode>(NAV_TABS.map((t) => t.id));
const TAB_LABEL_BY_ID = new Map<AppMode, string>(NAV_TABS.map((t) => [t.id, t.label]));
const DECK_AWARE_MODES = new Set<AppMode>([
  'dashboard',
  'browse',
  'flashcard',
  'image-quiz',
  'quiz',
  'syn-ant-quiz',
  'spelling',
  'today',
]);
const SESSION_DECK_KEY = 'vocab_studio_selected_deck';
const SESSION_TOPIC_KEY = 'vocab_studio_selected_topic';

function getPathForMode(mode: AppMode): string {
  return mode === 'dashboard' ? '/' : `/${mode}`;
}

function getModeFromLocation(): AppMode {
  if (typeof window === 'undefined') return 'dashboard';
  const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (rawPath && VALID_MODES.has(rawPath as AppMode)) {
    return rawPath as AppMode;
  }
  const rawHash = window.location.hash.replace(/^#\/?|\/+$/g, '').toLowerCase();
  if (rawHash && VALID_MODES.has(rawHash as AppMode)) {
    return rawHash as AppMode;
  }
  return 'dashboard';
}

export default function App() {
  const library = useMemo(() => buildLibrary(), []);
  const [mode, setMode] = useState<AppMode>(() => getModeFromLocation());
  const [selectedDeck, setSelectedDeck] = useState<string>(() => {
    const fromUrl = getUrlParam('deck');
    if (fromUrl) return fromUrl;
    try {
      return sessionStorage.getItem(SESSION_DECK_KEY) || 'ALL';
    } catch {
      return 'ALL';
    }
  });
  const [selectedTopic, setSelectedTopic] = useState<string>(() => {
    const fromUrl = getUrlParam('topic');
    if (fromUrl) return fromUrl;
    try {
      return sessionStorage.getItem(SESSION_TOPIC_KEY) || 'ALL';
    } catch {
      return 'ALL';
    }
  });
  const [accent, setAccent] = useState<Accent>(() => loadAccent());
  const [darkMode, setDarkMode] = useState<boolean>(() => loadDarkMode());
  const [learnedIds, setLearnedIds] = useState<Set<string>>(() => loadLearnedSet());
  const [highScore, setHighScore] = useState<number>(() => loadHighScore());
  const [streak, setStreak] = useState<number>(() => getStudyStreak());

  // Navigate between tabs while syncing browser URL so F5 / Back / Forward / New Tab all work
  const handleNavigate = useCallback(
    (nextMode: AppMode) => {
      setMode(nextMode);
      if (typeof window !== 'undefined') {
        const targetPath = getPathForMode(nextMode);
        const params = new URLSearchParams();
        if (DECK_AWARE_MODES.has(nextMode)) {
          if (selectedDeck && selectedDeck !== 'ALL') params.set('deck', selectedDeck);
          if (selectedTopic && selectedTopic !== 'ALL') params.set('topic', selectedTopic);
        }
        const qs = params.toString();
        const targetUrl = `${targetPath}${qs ? `?${qs}` : ''}`;
        const currentUrl = `${window.location.pathname.replace(/\/+$/, '') || '/'}${window.location.search}`;
        if (currentUrl !== targetUrl || window.location.hash) {
          window.history.pushState({ mode: nextMode }, '', targetUrl);
        }
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
    },
    [selectedDeck, selectedTopic]
  );

  // Preserve initial query params on mount (only normalize unknown/hash pathnames)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const expectedPath = getPathForMode(mode);
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    if (currentPath !== expectedPath || window.location.hash) {
      window.history.replaceState({ mode }, '', `${expectedPath}${window.location.search}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const nextMode = getModeFromLocation();
      setMode(nextMode);
      if (DECK_AWARE_MODES.has(nextMode)) {
        const urlDeck = getUrlParam('deck');
        const urlTopic = getUrlParam('topic');
        if (urlDeck !== null) setSelectedDeck(urlDeck);
        if (urlTopic !== null) setSelectedTopic(urlTopic);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Sync deck & topic into URL query params when on deck-aware study tabs
  useEffect(() => {
    if (!DECK_AWARE_MODES.has(mode)) return;
    setUrlParams({
      deck: selectedDeck !== 'ALL' ? selectedDeck : null,
      topic: selectedTopic !== 'ALL' ? selectedTopic : null,
    });
  }, [mode, selectedDeck, selectedTopic]);

  // Keep page title descriptive for each tab
  useEffect(() => {
    const label = TAB_LABEL_BY_ID.get(mode);
    document.title =
      mode === 'dashboard' || !label
        ? 'VocabStudio — Học Từ Vựng Tiếng Anh từ Google Sheets'
        : `${label} · VocabStudio`;
  }, [mode]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_DECK_KEY, selectedDeck);
      sessionStorage.setItem(SESSION_TOPIC_KEY, selectedTopic);
    } catch {
      // Ignore storage errors
    }
  }, [selectedDeck, selectedTopic]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    saveDarkMode(darkMode);
  }, [darkMode]);

  const handleSelectDeck = (deck: string) => {
    setSelectedDeck(deck);
    setSelectedTopic('ALL');
  };

  const deckVocab = useMemo(() => {
    if (selectedDeck === 'ALL') return library.vocab;
    return library.vocab.filter((v) => v.deck === selectedDeck);
  }, [library.vocab, selectedDeck]);

  const availableTopics = useMemo(() => {
    if (selectedDeck === 'ALL') return [];
    const map = new Map<string, { count: number; learned: number }>();
    for (const v of deckVocab) {
      if (!v.section) continue;
      const cur = map.get(v.section) || { count: 0, learned: 0 };
      cur.count += 1;
      if (learnedIds.has(v.id)) cur.learned += 1;
      map.set(v.section, cur);
    }
    return Array.from(map.entries()).map(([name, info]) => ({
      name,
      count: info.count,
      learned: info.learned,
    }));
  }, [deckVocab, selectedDeck, learnedIds]);

  const activeVocab = useMemo(() => {
    if (selectedTopic === 'ALL') return deckVocab;
    return deckVocab.filter((v) => v.section === selectedTopic);
  }, [deckVocab, selectedTopic]);

  const handleAccentChange = (next: Accent) => {
    setAccent(next);
    saveAccent(next);
  };

  const handleToggleLearned = (id: string) => {
    setLearnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveLearnedSet(next);
      return next;
    });
    setStreak(touchStudyStreak());
  };

  const handleMarkLearned = (id: string) => {
    setLearnedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveLearnedSet(next);
      return next;
    });
    setStreak(touchStudyStreak());
  };

  const handleScoreSaved = (score: number) => {
    setHighScore(saveHighScore(score));
    setStreak(touchStudyStreak());
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar
        mode={mode}
        onNavigate={handleNavigate}
        accent={accent}
        onAccentChange={handleAccentChange}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        selectedDeck={
          selectedDeck === 'ALL'
            ? 'ALL'
            : selectedTopic === 'ALL'
              ? selectedDeck
              : `${selectedDeck} · ${selectedTopic}`
        }
        streak={streak}
      />

      {/* Quick Mode Strip */}
      <div className="border-b border-slate-200/70 bg-white/70 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            const href = getPathForMode(tab.id);
            return (
              <a
                key={tab.id}
                href={href}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                    e.preventDefault();
                    handleNavigate(tab.id);
                  }
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </a>
            );
          })}
        </div>
      </div>

      {/* Topic Filter Ribbon when viewing a multi-topic deck in any study mode */}
      {mode !== 'dashboard' &&
        ![
          'prepositions',
          'phrasal-verbs',
          'idioms',
          'collocations',
          'ielts-task1',
          'ielts-task2',
          'ielts-speaking',
          'lyrics',
          'news',
          'books',
          'video',
        ].includes(mode) &&
        selectedDeck !== 'ALL' &&
        availableTopics.length > 1 && (
          <div className="border-b border-slate-200/60 bg-indigo-50/40 dark:border-slate-800 dark:bg-indigo-950/20">
            <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6">
              <span className="shrink-0 text-xs font-bold text-slate-500">Chủ đề:</span>
              <button
                onClick={() => setSelectedTopic('ALL')}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedTopic === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Tất cả ({deckVocab.length})
              </button>
              {availableTopics.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setSelectedTopic(t.name)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedTopic === t.name
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {t.name} ({t.count})
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {mode === 'dashboard' && (
          <Dashboard
            library={library}
            activeVocab={activeVocab}
            selectedDeck={selectedDeck}
            onSelectDeck={handleSelectDeck}
            selectedTopic={selectedTopic}
            onSelectTopic={setSelectedTopic}
            availableTopics={availableTopics}
            learnedIds={learnedIds}
            highScore={highScore}
            onNavigate={handleNavigate}
          />
        )}

        {mode === 'browse' && (
          <BrowseView
            items={activeVocab}
            decks={library.decks}
            selectedDeck={selectedDeck}
            onSelectDeck={handleSelectDeck}
            learnedIds={learnedIds}
            onToggleLearned={handleToggleLearned}
            accent={accent}
          />
        )}

        {mode === 'flashcard' && (
          <FlashcardView
            key={`fc-${selectedDeck}-${selectedTopic}`}
            items={activeVocab}
            learnedIds={learnedIds}
            onToggleLearned={handleToggleLearned}
            accent={accent}
          />
        )}

        {mode === 'image-quiz' && (
          <ImageQuizView
            key={`imgquiz-${selectedDeck}-${selectedTopic}`}
            activeVocab={activeVocab}
            allVocab={library.vocab}
            accent={accent}
            onScoreSaved={handleScoreSaved}
            onMarkLearned={handleMarkLearned}
          />
        )}

        {mode === 'quiz' && (
          <QuizView
            key={`quiz-${selectedDeck}-${selectedTopic}`}
            items={activeVocab}
            mode="standard"
            accent={accent}
            onScoreSaved={handleScoreSaved}
            onMarkLearned={handleMarkLearned}
          />
        )}

        {mode === 'syn-ant-quiz' && (
          <QuizView
            key={`synant-${selectedDeck}-${selectedTopic}`}
            items={activeVocab}
            mode="syn-ant"
            accent={accent}
            onScoreSaved={handleScoreSaved}
            onMarkLearned={handleMarkLearned}
          />
        )}

        {mode === 'spelling' && (
          <SpellingView
            key={`spell-${selectedDeck}-${selectedTopic}`}
            items={activeVocab}
            accent={accent}
            onMarkLearned={handleMarkLearned}
          />
        )}

        {mode === 'today' && (
          <TodayWordsView
            key={`today-${selectedDeck}-${selectedTopic}`}
            items={activeVocab}
            learnedIds={learnedIds}
            onMarkLearned={handleMarkLearned}
            accent={accent}
          />
        )}

        {mode === 'ielts-task1' && (
          <IeltsTask1View
            items={library.ieltsTask1}
            examples={library.ieltsTask1Examples}
            accent={accent}
          />
        )}

        {mode === 'ielts-task2' && (
          <IeltsTask2View
            prompts={library.ieltsTask2}
            formats={library.ieltsTask2Formats}
            accent={accent}
          />
        )}

        {mode === 'ielts-speaking' && (
          <IeltsSpeakingView items={library.ieltsSpeaking} accent={accent} />
        )}

        {mode === 'lyrics' && <LyricsView songs={library.lyrics} accent={accent} />}

        {mode === 'news' && (
          <NewsView articles={library.news} allVocab={library.vocab} accent={accent} />
        )}

        {mode === 'books' && <BookStudioView allVocab={library.vocab} accent={accent} />}

        {mode === 'video' && <VideoStudioView allVocab={library.vocab} accent={accent} />}

        {(mode === 'prepositions' ||
          mode === 'phrasal-verbs' ||
          mode === 'idioms' ||
          mode === 'collocations') && (
          <SpecialPracticeView
            key={mode}
            kind={mode}
            prepositions={library.prepositions}
            phrasalVerbs={library.phrasalVerbs}
            idioms={library.idioms}
            collocations={library.collocations}
            accent={accent}
          />
        )}
      </main>
    </div>
  );
}
