import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Headphones,
  Mic,
  MicOff,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  Search,
  Shuffle,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { Accent, IeltsSpeakingItem } from '../types';
import { speakText, stopSpeaking } from '../utils/speech';

interface IeltsSpeakingViewProps {
  items: IeltsSpeakingItem[];
  accent: Accent;
}

type FilterMode = 'ALL' | 'Part 1 / 3' | 'Part 2 (Cue Card)' | 'unmastered' | 'mastered';
type ScriptVisibility = 'full' | 'keywords' | 'hidden';
type PlaybackMode = 'idle' | 'single' | 'loop-sentence' | 'auto-shadow' | 'full-continuous';
type ExamPhase = 'idle' | 'prep' | 'speaking' | 'done';

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: { transcript: string };
    };
  };
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

const MASTERED_STORAGE_KEY = 'vocabStudio:speakingMastered';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'i', 'me', 'my', 'mine', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'it', 'its', 'we', 'us', 'our', 'they', 'them', 'their', 'this', 'that',
  'these', 'those', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'as', 'and', 'or', 'but', 'so', 'if', 'when', 'while', 'about', 'into',
  'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could',
  'should', 'may', 'might', 'must', 'very', 'just', 'also', 'too', 'really',
  'there', 'here', 'not', 'no', 'yes', 'than', 'then',
]);

function loadMasteredSet(): Set<string> {
  try {
    const raw = localStorage.getItem(MASTERED_STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveMasteredSet(set: Set<string>): void {
  try {
    localStorage.setItem(MASTERED_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore storage errors
  }
}

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, '');
}

function renderKeywordMasked(sentence: string) {
  const tokens = sentence.split(/(\s+)/);
  let shownWordCount = 0;
  return tokens.map((tok, i) => {
    if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>;
    const norm = normalizeWord(tok);
    const keep = shownWordCount < 2 || (!STOP_WORDS.has(norm) && norm.length >= 4);
    if (norm) shownWordCount += 1;
    if (keep) {
      return (
        <span key={i} className="font-semibold text-slate-900 dark:text-white">
          {tok}
        </span>
      );
    }
    return (
      <span
        key={i}
        className="inline-block rounded bg-slate-200/80 px-1 text-transparent select-none dark:bg-slate-700/80"
        title="Từ đã che để luyện nhớ"
      >
        {tok}
      </span>
    );
  });
}

function computeSpeechMatch(targetText: string, spokenText: string) {
  const targetTokens = targetText
    .split(/\s+/)
    .map((raw) => ({ raw, norm: normalizeWord(raw) }))
    .filter((t) => t.norm.length > 0);
  const spokenSet = new Set(
    spokenText
      .split(/\s+/)
      .map(normalizeWord)
      .filter(Boolean)
  );
  const results = targetTokens.map((t) => ({
    raw: t.raw,
    matched: spokenSet.has(t.norm),
  }));
  const matchedCount = results.filter((r) => r.matched).length;
  const accuracy = targetTokens.length > 0 ? Math.round((matchedCount / targetTokens.length) * 100) : 0;
  return { results, matchedCount, total: targetTokens.length, accuracy };
}

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function IeltsSpeakingView({ items, accent }: IeltsSpeakingViewProps) {
  const [filter, setFilter] = useState<FilterMode>('ALL');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id || '');
  const [masteredIds, setMasteredIds] = useState<Set<string>>(() => loadMasteredSet());

  // Shadowing playback controls
  const [rate, setRate] = useState<number>(0.9);
  const [pauseSeconds, setPauseSeconds] = useState<number>(3);
  const [scriptMode, setScriptMode] = useState<ScriptVisibility>('full');
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number>(0);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('idle');
  const [isSpeakingNow, setIsSpeakingNow] = useState<boolean>(false);
  const [pauseCountdown, setPauseCountdown] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Voice recording (MediaRecorder)
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  // Speech-to-Text Shadowing Check
  const [isListeningStt, setIsListeningStt] = useState<boolean>(false);
  const [sttScope, setSttScope] = useState<'sentence' | 'full'>('sentence');
  const [sttTranscript, setSttTranscript] = useState<string>('');
  const [sttError, setSttError] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  // Exam Simulator Timer
  const [examPhase, setExamPhase] = useState<ExamPhase>('idle');
  const [examSecondsLeft, setExamSecondsLeft] = useState<number>(0);
  const examTimerRef = useRef<number | null>(null);

  // Shadowing async cancellation token
  const sessionTokenRef = useRef<number>(0);
  const pauseTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const speechRecognitionCtor = useMemo<SpeechRecognitionCtor | null>(() => {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }, []);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'Part 1 / 3' && item.part !== 'Part 1 / 3') return false;
      if (filter === 'Part 2 (Cue Card)' && item.part !== 'Part 2 (Cue Card)') return false;
      if (filter === 'mastered' && !masteredIds.has(item.id)) return false;
      if (filter === 'unmastered' && masteredIds.has(item.id)) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        (item.questionVi || '').toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
      );
    });
  }, [items, filter, search, masteredIds]);

  const activeItem = useMemo(() => {
    return (
      visibleItems.find((i) => i.id === selectedId) ||
      visibleItems[0] ||
      items[0] ||
      null
    );
  }, [visibleItems, items, selectedId]);

  const stopAllPlayback = useCallback(() => {
    sessionTokenRef.current += 1;
    stopSpeaking();
    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setPlaybackMode('idle');
    setIsSpeakingNow(false);
    setPauseCountdown(null);
  }, []);

  const stopRecording = useCallback(() => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const stopStt = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListeningStt(false);
  }, []);

  const stopExamTimer = useCallback(() => {
    if (examTimerRef.current !== null) {
      window.clearInterval(examTimerRef.current);
      examTimerRef.current = null;
    }
    setExamPhase('idle');
    setExamSecondsLeft(0);
  }, []);

  // Reset per-question transient state on question change
  useEffect(() => {
    stopAllPlayback();
    stopStt();
    stopExamTimer();
    setActiveSentenceIdx(0);
    setSttTranscript('');
    setSttError(null);
    setRecordError(null);
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }
  }, [activeItem?.id]);

  // Cleanup everything on unmount
  useEffect(() => {
    return () => {
      stopAllPlayback();
      stopRecording();
      stopStt();
      stopExamTimer();
    };
  }, [stopAllPlayback, stopRecording, stopStt, stopExamTimer]);

  const waitWithCountdown = useCallback((seconds: number, token: number, onDone: () => void) => {
    if (seconds <= 0) {
      if (sessionTokenRef.current === token) onDone();
      return;
    }
    let remaining = seconds;
    setPauseCountdown(remaining);
    countdownIntervalRef.current = window.setInterval(() => {
      if (sessionTokenRef.current !== token) {
        if (countdownIntervalRef.current !== null) {
          window.clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        return;
      }
      remaining = Math.max(0, Number((remaining - 0.5).toFixed(1)));
      setPauseCountdown(remaining);
    }, 500);

    pauseTimerRef.current = window.setTimeout(() => {
      if (countdownIntervalRef.current !== null) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setPauseCountdown(null);
      if (sessionTokenRef.current === token) {
        onDone();
      }
    }, seconds * 1000);
  }, []);

  // Play a single sentence once (for quick click-to-shadow)
  const playSingleSentence = useCallback(
    (idx: number) => {
      if (!activeItem || !activeItem.sentences[idx]) return;
      stopAllPlayback();
      const token = sessionTokenRef.current;
      setActiveSentenceIdx(idx);
      setPlaybackMode('single');
      setIsSpeakingNow(true);
      speakText(activeItem.sentences[idx], accent, rate, {
        onEnd: () => {
          if (sessionTokenRef.current !== token) return;
          setIsSpeakingNow(false);
          setPlaybackMode('idle');
        },
        onError: () => {
          if (sessionTokenRef.current !== token) return;
          setIsSpeakingNow(false);
          setPlaybackMode('idle');
        },
      });
    },
    [activeItem, accent, rate, stopAllPlayback]
  );

  // Loop a single sentence repeatedly with a shadowing pause gap
  const startLoopSentence = useCallback(
    (idx: number) => {
      if (!activeItem || !activeItem.sentences[idx]) return;
      stopAllPlayback();
      const token = sessionTokenRef.current;
      setActiveSentenceIdx(idx);
      setPlaybackMode('loop-sentence');

      const speakOnce = () => {
        if (sessionTokenRef.current !== token) return;
        setIsSpeakingNow(true);
        speakText(activeItem.sentences[idx], accent, rate, {
          onEnd: () => {
            if (sessionTokenRef.current !== token) return;
            setIsSpeakingNow(false);
            waitWithCountdown(pauseSeconds, token, speakOnce);
          },
          onError: () => {
            if (sessionTokenRef.current !== token) return;
            setIsSpeakingNow(false);
            setPlaybackMode('idle');
          },
        });
      };
      speakOnce();
    },
    [activeItem, accent, rate, pauseSeconds, stopAllPlayback, waitWithCountdown]
  );

  // Guided Auto-Shadowing across all sentences (sentence -> pause for user to repeat -> next)
  const startAutoShadowing = useCallback(
    (startIdx = 0, continuous = false) => {
      if (!activeItem || activeItem.sentences.length === 0) return;
      stopAllPlayback();
      const token = sessionTokenRef.current;
      setPlaybackMode(continuous ? 'full-continuous' : 'auto-shadow');

      const runIndex = (idx: number) => {
        if (sessionTokenRef.current !== token) return;
        if (idx >= activeItem.sentences.length) {
          setIsSpeakingNow(false);
          setPlaybackMode('idle');
          return;
        }
        setActiveSentenceIdx(idx);
        setIsSpeakingNow(true);
        speakText(activeItem.sentences[idx], accent, rate, {
          onEnd: () => {
            if (sessionTokenRef.current !== token) return;
            setIsSpeakingNow(false);
            if (continuous) {
              waitWithCountdown(0.35, token, () => runIndex(idx + 1));
            } else {
              waitWithCountdown(pauseSeconds, token, () => runIndex(idx + 1));
            }
          },
          onError: () => {
            if (sessionTokenRef.current !== token) return;
            setIsSpeakingNow(false);
            setPlaybackMode('idle');
          },
        });
      };

      runIndex(startIdx);
    },
    [activeItem, accent, rate, pauseSeconds, stopAllPlayback, waitWithCountdown]
  );

  // Keyboard shortcuts for effortless hands-free shadowing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (!activeItem || activeItem.sentences.length === 0) return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        playSingleSentence(activeSentenceIdx);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const next = Math.min(activeItem.sentences.length - 1, activeSentenceIdx + 1);
        playSingleSentence(next);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = Math.max(0, activeSentenceIdx - 1);
        playSingleSentence(prev);
      } else if (e.key === 'Escape') {
        stopAllPlayback();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeItem, activeSentenceIdx, playSingleSentence, stopAllPlayback]);

  // Start / Stop Self-Recording
  const startRecording = async () => {
    setRecordError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecordError('Trình duyệt hiện tại không hỗ trợ ghi âm micro.');
      return;
    }
    try {
      stopAllPlayback();
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
        setRecordingUrl(null);
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) mediaChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordingUrl(url);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setRecordError('Không thể truy cập micro. Hãy cấp quyền Microphone cho trình duyệt để ghi âm.');
    }
  };

  // Start / Stop Live Speech-to-Text Pronunciation Check
  const startSttCheck = (scope: 'sentence' | 'full') => {
    setSttError(null);
    if (!speechRecognitionCtor) {
      setSttError('Tính năng so khớp giọng nói cần trình duyệt Chrome hoặc Microsoft Edge.');
      return;
    }
    stopAllPlayback();
    stopStt();
    setSttScope(scope);
    setSttTranscript('');
    const rec = new speechRecognitionCtor();
    rec.lang = accent;
    rec.continuous = scope === 'full';
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let fullText = '';
      for (let i = 0; i < ev.results.length; i++) {
        fullText += ev.results[i][0].transcript + ' ';
      }
      setSttTranscript(fullText.trim());
    };
    rec.onerror = (ev) => {
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        setSttError(`Lỗi nhận diện giọng nói: ${ev.error}`);
      }
      setIsListeningStt(false);
    };
    rec.onend = () => {
      setIsListeningStt(false);
    };
    recognitionRef.current = rec;
    setIsListeningStt(true);
    rec.start();
  };

  // Start Examiner Practice Mode (Timer + Hidden Script + Auto Question Audio)
  const startExamMode = () => {
    if (!activeItem) return;
    stopAllPlayback();
    stopExamTimer();
    setScriptMode('hidden');

    const isPart2 = activeItem.part === 'Part 2 (Cue Card)';
    speakText(activeItem.question, accent, 0.95);

    if (isPart2) {
      setExamPhase('prep');
      setExamSecondsLeft(60);
      let left = 60;
      let phase: 'prep' | 'speaking' = 'prep';
      examTimerRef.current = window.setInterval(() => {
        left -= 1;
        if (left <= 0) {
          if (phase === 'prep') {
            phase = 'speaking';
            left = 120;
            setExamPhase('speaking');
            setExamSecondsLeft(120);
            speakText('Your preparation time is up. Please start speaking now.', accent, 0.95);
          } else {
            if (examTimerRef.current !== null) {
              window.clearInterval(examTimerRef.current);
              examTimerRef.current = null;
            }
            setExamPhase('done');
            setExamSecondsLeft(0);
            setScriptMode('full');
            speakText('Thank you. Your time is up.', accent, 0.95);
          }
        } else {
          setExamSecondsLeft(left);
        }
      }, 1000);
    } else {
      setExamPhase('speaking');
      setExamSecondsLeft(45);
      let left = 45;
      examTimerRef.current = window.setInterval(() => {
        left -= 1;
        if (left <= 0) {
          if (examTimerRef.current !== null) {
            window.clearInterval(examTimerRef.current);
            examTimerRef.current = null;
          }
          setExamPhase('done');
          setExamSecondsLeft(0);
          setScriptMode('full');
        } else {
          setExamSecondsLeft(left);
        }
      }, 1000);
    }
  };

  const toggleMastered = (id: string) => {
    setMasteredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveMasteredSet(next);
      return next;
    });
  };

  const pickRandomQuestion = () => {
    const pool = visibleItems.length > 1 ? visibleItems : items;
    if (pool.length <= 1) return;
    const candidates = pool.filter((x) => x.id !== activeItem?.id);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    if (chosen) setSelectedId(chosen.id);
  };

  const copyWithFeedback = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1400);
  };

  const part1Count = items.filter((i) => i.part === 'Part 1 / 3').length;
  const part2Count = items.filter((i) => i.part === 'Part 2 (Cue Card)').length;
  const masteredCount = items.filter((i) => masteredIds.has(i.id)).length;

  const sttTargetText =
    activeItem && sttScope === 'sentence'
      ? activeItem.sentences[activeSentenceIdx] || ''
      : activeItem?.answer || '';
  const sttComparison = useMemo(() => {
    if (!sttTranscript || !sttTargetText) return null;
    return computeSpeechMatch(sttTargetText, sttTranscript);
  }, [sttTargetText, sttTranscript]);

  if (items.length === 0 || !activeItem) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        Chưa có câu hỏi trong sheet <code>IELTS Speaking</code>.
      </div>
    );
  }

  const activeIdxInVisible = visibleItems.findIndex((i) => i.id === activeItem.id);
  const isMastered = masteredIds.has(activeItem.id);

  return (
    <div className="space-y-5">
      {/* Top Studio Header & Progress */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-xs">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                IELTS Speaking & Shadowing Studio
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tách câu trả lời theo từng câu kết thúc bằng dấu <code>.</code> để nghe lại & Shadowing, ghi âm đối chiếu, so khớp phát âm và luyện bấm giờ thi thử.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Đã luyện: {masteredCount}/{items.length} câu
            </span>
            <button
              onClick={pickRandomQuestion}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
            >
              <Shuffle className="h-3.5 w-3.5" /> Hỏi ngẫu nhiên
            </button>
          </div>
        </div>

        {/* Filter & Search Row */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `Tất cả (${items.length})` },
                { id: 'Part 1 / 3', label: `Part 1 & 3 (${part1Count})` },
                { id: 'Part 2 (Cue Card)', label: `Part 2 Cue Card (${part2Count})` },
                { id: 'unmastered', label: `Chưa luyện (${items.length - masteredCount})` },
                { id: 'mastered', label: `Đã luyện (${masteredCount})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  filter === f.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm câu hỏi hoặc từ trong bài nói..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Left Column: Question List */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs lg:sticky lg:top-20 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Danh sách câu hỏi ({visibleItems.length})
            </span>
          </div>
          <div className="max-h-[680px] space-y-1.5 overflow-y-auto pr-1">
            {visibleItems.map((item) => {
              const active = item.id === activeItem.id;
              const done = masteredIds.has(item.id);
              const origIndex = items.findIndex((x) => x.id === item.id) + 1;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`flex w-full flex-col rounded-xl border p-2.5 text-left transition ${
                    active
                      ? 'border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-500/15 dark:border-indigo-400 dark:bg-indigo-950/40'
                      : 'border-slate-200/80 bg-slate-50/40 hover:border-slate-300 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold text-slate-400">#{origIndex}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          item.part === 'Part 2 (Cue Card)'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                        }`}
                      >
                        {item.part === 'Part 2 (Cue Card)' ? 'Part 2' : 'Part 1/3'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-400">
                        {item.sentences.length} câu
                      </span>
                      {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-snug font-bold text-slate-900 dark:text-white">
                    {item.question}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Question + Sentence-by-Sentence Shadowing Studio */}
        <div className="space-y-4 lg:col-span-8">
          {/* Question Card + Examiner Timer */}
          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-rose-50/50 p-5 shadow-xs dark:border-indigo-900/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-rose-950/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                      activeItem.part === 'Part 2 (Cue Card)'
                        ? 'bg-amber-500 text-white'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {activeItem.part}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {activeItem.sentences.length} câu tách sẵn để Shadowing
                  </span>
                </div>
                <h3 className="text-base leading-relaxed font-extrabold text-slate-900 sm:text-lg dark:text-white">
                  {activeItem.question}
                </h3>
                {activeItem.questionVi && (
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {activeItem.questionVi}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => {
                    stopAllPlayback();
                    speakText(activeItem.question, accent, rate);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-indigo-600 shadow-xs hover:bg-indigo-50 dark:bg-slate-800 dark:text-indigo-300"
                >
                  <Volume2 className="h-4 w-4" /> Nghe câu hỏi
                </button>
                <button
                  onClick={() => toggleMastered(activeItem.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold shadow-xs transition ${
                    isMastered
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isMastered ? 'Đã luyện xong' : 'Đánh dấu đã luyện'}
                </button>
              </div>
            </div>

            {/* Examiner Simulation Timer Bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/85 px-3.5 py-2.5 dark:bg-slate-900/80">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-rose-500" />
                {examPhase === 'idle' && (
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Chế độ thi thử: tự ẩn đáp án, đọc câu hỏi & bấm giờ (
                    {activeItem.part === 'Part 2 (Cue Card)' ? '1 phút chuẩn bị → 2 phút nói' : '45 giây trả lời'})
                  </span>
                )}
                {examPhase === 'prep' && (
                  <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400">
                    ⏱ Chuẩn bị ý tưởng (Part 2): còn {formatTimer(examSecondsLeft)}
                  </span>
                )}
                {examPhase === 'speaking' && (
                  <span className="text-xs font-extrabold text-rose-600 dark:text-rose-400">
                    🎙 Đang nói (Speaking): còn {formatTimer(examSecondsLeft)}
                  </span>
                )}
                {examPhase === 'done' && (
                  <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                    ✓ Hết giờ! Đáp án mẫu đã được mở lại để bạn đối chiếu & Shadowing.
                  </span>
                )}
              </div>

              {examPhase === 'idle' || examPhase === 'done' ? (
                <button
                  onClick={startExamMode}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                >
                  <Play className="h-3.5 w-3.5" /> Bắt đầu thi thử
                </button>
              ) : (
                <button
                  onClick={() => {
                    stopExamTimer();
                    setScriptMode('full');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
                >
                  <Square className="h-3 w-3" /> Dừng & Hiện bài mẫu
                </button>
              )}
            </div>
          </div>

          {/* Shadowing Control Toolbar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {playbackMode === 'auto-shadow' ? (
                  <button
                    onClick={stopAllPlayback}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700"
                  >
                    <Square className="h-3.5 w-3.5" /> Dừng Shadowing
                  </button>
                ) : (
                  <button
                    onClick={() => startAutoShadowing(0, false)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
                  >
                    <Headphones className="h-3.5 w-3.5" /> Auto-Shadowing từng câu (nghỉ {pauseSeconds}s)
                  </button>
                )}

                {playbackMode === 'full-continuous' ? (
                  <button
                    onClick={stopAllPlayback}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700"
                  >
                    <Square className="h-3.5 w-3.5" /> Dừng đọc
                  </button>
                ) : (
                  <button
                    onClick={() => startAutoShadowing(0, true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Play className="h-3.5 w-3.5" /> Nghe liền mạch cả bài
                  </button>
                )}

                {playbackMode !== 'idle' && (
                  <button
                    onClick={stopAllPlayback}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                  >
                    <Square className="h-3 w-3" /> Dừng
                  </button>
                )}
              </div>

              <button
                onClick={() => copyWithFeedback('full-answer', activeItem.answer)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                {copiedKey === 'full-answer' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" /> Đã chép
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Chép đáp án
                  </>
                )}
              </button>
            </div>

            {/* Fine-tuning Row: Speed, Shadow Pause, Script Visibility */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
              {/* Speed */}
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500">Tốc độ:</span>
                {[0.75, 0.9, 1.0, 1.15].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRate(r)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                      rate === r
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {r}x
                  </button>
                ))}
              </div>

              {/* Pause Duration */}
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500">Nghỉ nhại theo:</span>
                {[1.5, 3, 5].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setPauseSeconds(sec)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                      pauseSeconds === sec
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>

              {/* Script Masking */}
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500">Hiển thị:</span>
                {(
                  [
                    { id: 'full', label: 'Đầy đủ', icon: Eye },
                    { id: 'keywords', label: 'Từ khóa', icon: Sparkles },
                    { id: 'hidden', label: 'Ẩn chữ', icon: EyeOff },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setScriptMode(m.id)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                        scriptMode === m.id
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="h-3 w-3" /> {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Shadowing Countdown Banner */}
            {pauseCountdown !== null && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-extrabold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                <span>
                  🎙 Đến lượt bạn nhại theo câu #{activeSentenceIdx + 1}! (Tự đọc tiếp sau{' '}
                  {pauseCountdown.toFixed(1)}s)
                </span>
                <button
                  onClick={stopAllPlayback}
                  className="rounded-lg bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold hover:bg-amber-300 dark:bg-amber-900"
                >
                  Dừng
                </button>
              </div>
            )}
          </div>

          {/* Sentence-by-Sentence Shadowing List */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-xs font-extrabold text-slate-600 dark:text-slate-300">
                Nhấn trực tiếp vào từng câu để nghe lại (Phím tắt: <code>R</code> nghe lại câu đang chọn · <code>↑</code>/<code>↓</code> chuyển câu)
              </p>
            </div>

            {activeItem.sentences.map((sentence, idx) => {
              const isSelected = activeSentenceIdx === idx;
              const isLoopingThis = playbackMode === 'loop-sentence' && isSelected;
              const isPlayingThis = isSpeakingNow && isSelected;

              return (
                <div
                  key={`${activeItem.id}-s-${idx}`}
                  onClick={() => playSingleSentence(idx)}
                  className={`group cursor-pointer rounded-2xl border p-3.5 transition ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/70 shadow-xs ring-2 ring-indigo-500/15 dark:border-indigo-400 dark:bg-indigo-950/35'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                          isPlayingThis
                            ? 'animate-pulse bg-indigo-600 text-white'
                            : isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {idx + 1}
                      </span>

                      <p className="text-sm leading-relaxed text-slate-800 sm:text-[15px] dark:text-slate-100">
                        {scriptMode === 'full' && sentence}
                        {scriptMode === 'keywords' && renderKeywordMasked(sentence)}
                        {scriptMode === 'hidden' && (
                          <span className="inline-block rounded-lg bg-slate-200/80 px-2 py-0.5 text-slate-400 select-none blur-[4px] transition group-hover:blur-none dark:bg-slate-800">
                            {sentence}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Per-Sentence Shadowing Controls */}
                    <div
                      className="flex shrink-0 items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => playSingleSentence(idx)}
                        title="Nghe lại câu này"
                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                          isPlayingThis
                            ? 'bg-indigo-600 text-white'
                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300'
                        }`}
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Nghe</span>
                      </button>

                      <button
                        onClick={() => {
                          if (isLoopingThis) stopAllPlayback();
                          else startLoopSentence(idx);
                        }}
                        title={
                          isLoopingThis
                            ? 'Dừng lặp câu này'
                            : `Lặp liên tục câu này (nghỉ ${pauseSeconds}s để Shadowing)`
                        }
                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                          isLoopingThis
                            ? 'bg-amber-500 text-white hover:bg-amber-600'
                            : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-800 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {isLoopingThis ? (
                          <>
                            <Repeat1 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Đang lặp</span>
                          </>
                        ) : (
                          <>
                            <Repeat className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Lặp</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setActiveSentenceIdx(idx);
                          startSttCheck('sentence');
                        }}
                        title="Nói câu này để kiểm tra độ khớp từng từ"
                        className="rounded-xl bg-slate-100 p-1.5 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <Mic className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Speaking Improvement Toolkit: Self-Recording + Live Pronunciation Match */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* 1. Voice Recorder (Record & Compare) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                    <Mic className="h-4 w-4 text-rose-500" />
                    Ghi âm giọng nói của bạn
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Tự ghi âm câu trả lời hoặc câu đang Shadowing rồi nghe lại để chỉnh ngữ điệu.
                  </p>
                </div>
                {isRecording && (
                  <span className="inline-flex animate-pulse items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-extrabold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                    ● {formatTimer(recordingSeconds)}
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700"
                  >
                    <Mic className="h-3.5 w-3.5" /> Bắt đầu ghi âm
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
                  >
                    <Square className="h-3.5 w-3.5" /> Dừng & Lưu bản thu
                  </button>
                )}

                {recordingUrl && !isRecording && (
                  <button
                    onClick={() => {
                      URL.revokeObjectURL(recordingUrl);
                      setRecordingUrl(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Xóa bản thu
                  </button>
                )}
              </div>

              {recordError && (
                <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                  {recordError}
                </p>
              )}

              {recordingUrl && (
                <div className="mt-3 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                  <p className="mb-1.5 text-[11px] font-bold text-slate-500">
                    Bản ghi âm của bạn ({formatTimer(recordingSeconds)}):
                  </p>
                  <audio controls src={recordingUrl} className="h-9 w-full" />
                </div>
              )}
            </div>

            {/* 2. Speech-to-Text Shadowing Match Checker */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                    <Sparkles className="h-4 w-4 text-emerald-500" />
                    So khớp phát âm (Shadowing Check)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Nói vào micro để kiểm tra từng từ bạn phát âm khớp bao nhiêu % với mẫu.
                  </p>
                </div>
                {sttComparison && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                      sttComparison.accuracy >= 80
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : sttComparison.accuracy >= 50
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    Khớp {sttComparison.accuracy}%
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!isListeningStt ? (
                  <>
                    <button
                      onClick={() => startSttCheck('sentence')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                    >
                      <Mic className="h-3.5 w-3.5" /> Nói câu #{activeSentenceIdx + 1}
                    </button>
                    <button
                      onClick={() => startSttCheck('full')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      <Mic className="h-3.5 w-3.5" /> Nói cả bài
                    </button>
                  </>
                ) : (
                  <button
                    onClick={stopStt}
                    className="inline-flex animate-pulse items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700"
                  >
                    <MicOff className="h-3.5 w-3.5" /> Đang nghe... (Bấm để dừng)
                  </button>
                )}

                {sttTranscript && !isListeningStt && (
                  <button
                    onClick={() => setSttTranscript('')}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Xóa
                  </button>
                )}
              </div>

              {sttError && (
                <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                  {sttError}
                </p>
              )}

              {sttTranscript && (
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                  <div>
                    <span className="font-bold text-slate-500">Máy nghe được: </span>
                    <span className="italic text-slate-700 dark:text-slate-200">
                      “{sttTranscript}”
                    </span>
                  </div>
                  {sttComparison && (
                    <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
                      <span className="mb-1 block text-[11px] font-bold text-slate-500">
                        Đối chiếu ({sttComparison.matchedCount}/{sttComparison.total} từ khớp):
                      </span>
                      <div className="flex flex-wrap gap-1 leading-relaxed">
                        {sttComparison.results.map((r, i) => (
                          <span
                            key={i}
                            className={`rounded px-1 py-0.5 text-[11px] font-semibold ${
                              r.matched
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-700 line-through decoration-rose-400/70 dark:bg-rose-950/70 dark:text-rose-300'
                            }`}
                          >
                            {r.raw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Prev / Next Question Navigation */}
          {visibleItems.length > 1 && (
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => {
                  const prevIdx =
                    activeIdxInVisible > 0 ? activeIdxInVisible - 1 : visibleItems.length - 1;
                  setSelectedId(visibleItems[prevIdx].id);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <ChevronLeft className="h-4 w-4" /> Câu hỏi trước
              </button>
              <span className="text-xs font-semibold text-slate-400">
                Câu {Math.max(1, activeIdxInVisible + 1)} / {visibleItems.length}
              </span>
              <button
                onClick={() => {
                  const nextIdx = (activeIdxInVisible + 1) % visibleItems.length;
                  setSelectedId(visibleItems[nextIdx].id);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Câu hỏi tiếp <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
