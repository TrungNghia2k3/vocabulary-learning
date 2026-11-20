import { BookOpen, Flame, Moon, Sun, Volume2 } from 'lucide-react';
import type { Accent, AppMode } from '../types';

interface NavbarProps {
  mode: AppMode;
  onNavigate: (mode: AppMode) => void;
  accent: Accent;
  onAccentChange: (accent: Accent) => void;
  darkMode: boolean;
  onToggleDark: () => void;
  selectedDeck: string;
  streak: number;
}

export function Navbar({
  mode,
  onNavigate,
  accent,
  onAccentChange,
  darkMode,
  onToggleDark,
  selectedDeck,
  streak,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/85">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2.5 text-left transition hover:opacity-85"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-500/30">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                VocabStudio
              </span>
              <span className="hidden rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 sm:inline-block dark:bg-emerald-950 dark:text-emerald-300">
                Google Sheets Live
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bộ từ đang chọn:{' '}
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                {selectedDeck === 'ALL' ? 'Tất cả bộ từ' : selectedDeck}
              </span>
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          {mode !== 'dashboard' && (
            <button
              onClick={() => onNavigate('dashboard')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Tổng quan
            </button>
          )}

          <div
            className="hidden items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 sm:flex dark:bg-amber-950/60 dark:text-amber-300"
            title="Chuỗi ngày học liên tiếp"
          >
            <Flame className="h-3.5 w-3.5 text-amber-500" />
            <span>{streak} ngày</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
            <Volume2 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <select
              aria-label="Chọn giọng phát âm"
              value={accent}
              onChange={(e) => onAccentChange(e.target.value as Accent)}
              className="bg-transparent text-xs font-medium text-slate-700 outline-none dark:text-slate-200"
            >
              <option value="en-GB" className="dark:bg-slate-800">
                🇬🇧 Anh (UK)
              </option>
              <option value="en-US" className="dark:bg-slate-800">
                🇺🇸 Mỹ (US)
              </option>
            </select>
          </div>

          <button
            onClick={onToggleDark}
            aria-label="Đổi giao diện sáng/tối"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
