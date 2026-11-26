import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Volume2,
  X,
} from 'lucide-react';
import type { Accent } from '../types';
import { speakText } from '../utils/speech';
import { getCambridgeUrl, type ReaderLookupResult } from '../utils/readerLookup';

interface ReaderLookupDrawerProps {
  lookup: ReaderLookupResult;
  accent: Accent;
  isSheetConnected: boolean;
  targetSheetLabel: string; // e.g. 'News Vocab' or 'Book Vocab'
  savedSyncStatus?: 'synced' | 'syncing' | 'local' | 'error';
  savedSyncError?: string;
  isAlreadySavedLocally: boolean;
  accentTone?: 'teal' | 'blue';
  onClose: () => void;
  onExpandRange?: (dir: 'left' | 'right') => void;
  onSave: (customMeaning: string) => void;
  onOpenSheetSetup?: () => void;
}

export function ReaderLookupDrawer({
  lookup,
  accent,
  isSheetConnected,
  targetSheetLabel,
  savedSyncStatus,
  savedSyncError,
  isAlreadySavedLocally,
  accentTone = 'teal',
  onClose,
  onExpandRange,
  onSave,
  onOpenSheetSetup,
}: ReaderLookupDrawerProps) {
  const [editedMeaning, setEditedMeaning] = useState<string>('');

  useEffect(() => {
    setEditedMeaning(
      lookup.viMeaning || lookup.sheetMatch?.meaning || lookup.definitions[0]?.def || ''
    );
  }, [lookup.cleaned, lookup.viMeaning, lookup.sheetMatch?.meaning, lookup.definitions]);

  const canExpandLeft =
    Boolean(onExpandRange) &&
    typeof lookup.wordStartIdx === 'number' &&
    lookup.wordStartIdx > 0;
  const canExpandRight =
    Boolean(onExpandRange) &&
    typeof lookup.wordEndIdx === 'number' &&
    Array.isArray(lookup.paragraphWords) &&
    lookup.wordEndIdx < lookup.paragraphWords.length - 1;

  const isBlue = accentTone === 'blue';
  const primaryBtnBg = isBlue ? 'bg-blue-600 hover:bg-blue-700' : 'bg-teal-600 hover:bg-teal-700';
  const audioPillCls = isBlue
    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300'
    : 'bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-950 dark:text-teal-300';

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl p-3 sm:p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl ring-1 ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900">
        {/* Top Row: Word / Phrase + Audio + Close */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="text-base font-extrabold leading-snug text-slate-900 sm:text-lg dark:text-white">
                {lookup.cleaned}
              </h4>
              {lookup.isPhrase ? (
                <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-extrabold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                  Cụm từ
                </span>
              ) : (
                <>
                  {lookup.phonetic && (
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {lookup.phonetic}
                    </span>
                  )}
                  {lookup.partOfSpeech && (
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {lookup.partOfSpeech}
                    </span>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => speakText(lookup.cleaned, accent, 0.9)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${audioPillCls}`}
              >
                <Volume2 className="h-3.5 w-3.5" /> Nghe
              </button>
            </div>

            {/* Expand left / right into a full phrase right from the drawer */}
            {(canExpandLeft || canExpandRight) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400">Mở rộng thành cụm:</span>
                <button
                  type="button"
                  disabled={!canExpandLeft}
                  onClick={() => onExpandRange?.('left')}
                  className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <ChevronLeft className="h-3 w-3" /> Thêm từ trái
                </button>
                <button
                  type="button"
                  disabled={!canExpandRight}
                  onClick={() => onExpandRange?.('right')}
                  className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Thêm từ phải <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}

            {lookup.sheetMatch && (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Đã có trong Sheet “{lookup.sheetMatch.deck}”: {lookup.sheetMatch.meaning}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: Meaning (Editable!) + English definitions */}
        {lookup.loading ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
            {lookup.isPhrase
              ? 'Đang dịch cả cụm từ theo ngữ cảnh...'
              : 'Đang tra từ điển & dịch tiếng Việt...'}
          </div>
        ) : (
          <div className="mt-2.5 space-y-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Nghĩa tiếng Việt (có thể sửa nhanh trước khi lưu)
              </label>
              <input
                type="text"
                value={editedMeaning}
                onChange={(e) => setEditedMeaning(e.target.value)}
                placeholder="Nhập hoặc chỉnh sửa nghĩa tiếng Việt..."
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {lookup.definitions.length > 0 && (
              <ul className="space-y-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {lookup.definitions.map((d, i) => (
                  <li key={i}>
                    • {d.def}
                    {d.example && (
                      <span className="block pl-3 italic text-slate-400">“{d.example}”</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {lookup.error && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{lookup.error}</p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <a
                href={getCambridgeUrl(lookup.cleaned)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Mở Cambridge <ExternalLink className="h-3 w-3" />
              </a>

              <div className="flex flex-wrap items-center gap-2">
                {!isSheetConnected && onOpenSheetSetup && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSheetSetup();
                    }}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  >
                    Bật lưu thẳng Sheet
                  </button>
                )}

                <button
                  type="button"
                  disabled={savedSyncStatus === 'syncing'}
                  onClick={() => onSave(editedMeaning.trim())}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-60 ${
                    savedSyncStatus === 'synced'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : savedSyncStatus === 'error'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : primaryBtnBg
                  }`}
                >
                  {savedSyncStatus === 'syncing' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang gửi lên {targetSheetLabel}...
                    </>
                  ) : savedSyncStatus === 'synced' ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Đã lên {targetSheetLabel} ✓
                    </>
                  ) : savedSyncStatus === 'error' ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" /> Lỗi gửi — Thử lại
                    </>
                  ) : isAlreadySavedLocally ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Đã lưu cục bộ
                    </>
                  ) : isSheetConnected ? (
                    <>
                      <Cloud className="h-3.5 w-3.5" />{' '}
                      {lookup.isPhrase ? `Lưu cụm vào ${targetSheetLabel}` : `Lưu vào ${targetSheetLabel}`}
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />{' '}
                      {lookup.isPhrase ? 'Lưu cụm từ' : 'Lưu vào sổ từ'}
                    </>
                  )}
                </button>
              </div>
            </div>

            {savedSyncStatus === 'error' && savedSyncError && (
              <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                {savedSyncError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
