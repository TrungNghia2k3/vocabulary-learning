import type { Accent } from '../types';

const KEYS = {
  learned: 'vocabStudio:learnedIds',
  legacyLearned: 'learnedWords',
  highScore: 'vocabStudio:highScore',
  accent: 'vocabStudio:accent',
  darkMode: 'vocabStudio:darkMode',
  streak: 'vocabStudio:streak',
  lastStudyDate: 'vocabStudio:lastStudyDate',
};

export function loadLearnedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(KEYS.learned);
    if (raw) return new Set(JSON.parse(raw) as string[]);
    const legacy = localStorage.getItem(KEYS.legacyLearned);
    if (legacy) return new Set(JSON.parse(legacy) as string[]);
  } catch {
    // ignore storage errors
  }
  return new Set();
}

export function saveLearnedSet(set: Set<string>): void {
  try {
    localStorage.setItem(KEYS.learned, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

export function loadHighScore(): number {
  const n = Number(localStorage.getItem(KEYS.highScore) || localStorage.getItem('highScore') || 0);
  return Number.isFinite(n) ? n : 0;
}

export function saveHighScore(score: number): number {
  const best = Math.max(loadHighScore(), score);
  localStorage.setItem(KEYS.highScore, String(best));
  return best;
}

export function loadAccent(): Accent {
  const v = localStorage.getItem(KEYS.accent) || localStorage.getItem('preferredAccent');
  return v === 'en-US' ? 'en-US' : 'en-GB';
}

export function saveAccent(accent: Accent): void {
  localStorage.setItem(KEYS.accent, accent);
}

export function loadDarkMode(): boolean {
  return localStorage.getItem(KEYS.darkMode) === 'true';
}

export function saveDarkMode(enabled: boolean): void {
  localStorage.setItem(KEYS.darkMode, String(enabled));
}

export function touchStudyStreak(): number {
  const today = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem(KEYS.lastStudyDate);
  let streak = Number(localStorage.getItem(KEYS.streak) || 0);
  if (last === today) return Math.max(streak, 1);

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  streak = last === yesterday ? streak + 1 : 1;
  localStorage.setItem(KEYS.streak, String(streak));
  localStorage.setItem(KEYS.lastStudyDate, today);
  return streak;
}

export function getStudyStreak(): number {
  return Number(localStorage.getItem(KEYS.streak) || 0);
}
