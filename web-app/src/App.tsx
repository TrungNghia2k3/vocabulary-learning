import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  CalendarDays,
  Camera,
  GitBranch,
  HelpCircle,
  Home,
  Keyboard,
  Layers,
  Link2,
  List,
  MessageSquareQuote,
  Puzzle,
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

const NAV_TABS: Array<{ id: AppMode; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: 'Tổng quan', icon: Home },
  { id: 'browse', label: 'Duyệt từ', icon: List },
  { id: 'flashcard', label: 'Flashcard', icon: Layers },
  { id: 'image-quiz', label: 'What is it?', icon: Camera },
  { id: 'quiz', label: 'Quiz', icon: HelpCircle },
  { id: 'syn-ant-quiz', label: 'Đồng/Trái nghĩa', icon: Brain },
  { id: 'spelling', label: 'Chính tả', icon: Keyboard },
  { id: 'today', label: 'Hôm nay', icon: CalendarDays },
  { id: 'prepositions', label: 'Giới từ', icon: Link2 },
  { id: 'phrasal-verbs', label: 'Phrasal Verbs', icon: GitBranch },
  { id: 'idioms', label: 'Idioms', icon: MessageSquareQuote },
  { id: 'collocations', label: 'Collocations', icon: Puzzle },
];

export default function App() {
  const library = useMemo(() => buildLibrary(), []);
  const [mode, setMode] = useState<AppMode>('dashboard');
  const [selectedDeck, setSelectedDeck] = useState<string>('ALL');
  const [selectedTopic, setSelectedTopic] = useState<string>('ALL');
  const [accent, setAccent] = useState<Accent>(() => loadAccent());
  const [darkMode, setDarkMode] = useState<boolean>(() => loadDarkMode());
  const [learnedIds, setLearnedIds] = useState<Set<string>>(() => loadLearnedSet());
  const [highScore, setHighScore] = useState<number>(() => loadHighScore());
  const [streak, setStreak] = useState<number>(() => getStudyStreak());

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
        onNavigate={setMode}
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
            return (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Topic Filter Ribbon when viewing a multi-topic deck in any study mode */}
      {mode !== 'dashboard' &&
        !['prepositions', 'phrasal-verbs', 'idioms', 'collocations'].includes(mode) &&
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
            onNavigate={setMode}
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
