import type { Accent } from '../types';

export interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
  /** Fires as each word is spoken (0-based non-whitespace word index in the original text). */
  onWordChange?: (wordIndex: number) => void;
}

export interface SpeechQueueItem {
  key: string;
  text: string;
}

export interface SpeechQueueCallbacks {
  onItemStart?: (key: string) => void;
  onWordChange?: (key: string, wordIndex: number) => void;
  onComplete?: () => void;
  onError?: () => void;
}

interface WordSpan {
  index: number;
  start: number;
  end: number;
  length: number;
}

let activeSessionId = 0;
let activeFallbackTimer: number | null = null;

function clearFallbackTimer(): void {
  if (activeFallbackTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(activeFallbackTimer);
    activeFallbackTimer = null;
  }
}

function buildWordSpans(text: string): WordSpan[] {
  const spans: WordSpan[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = re.exec(text)) !== null) {
    spans.push({
      index: idx++,
      start: match.index,
      end: match.index + match[0].length,
      length: match[0].length,
    });
  }
  return spans;
}

function findWordIndexAtChar(spans: WordSpan[], charIndex: number): number {
  if (spans.length === 0) return -1;
  for (let i = 0; i < spans.length; i++) {
    if (charIndex < spans[i].end) return spans[i].index;
  }
  return spans[spans.length - 1].index;
}

function pickBestVoice(accent: Accent): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.find((v) => v.lang.toLowerCase() === accent.toLowerCase());
  if (exact) return exact;
  return voices.find((v) =>
    v.lang.toLowerCase().startsWith(accent.slice(0, 2).toLowerCase())
  );
}

export function stopSpeaking(): void {
  activeSessionId += 1;
  clearFallbackTimer();
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}

/**
 * Speak a single text block with real-time word-by-word highlighting.
 * Uses native SpeechSynthesis `onboundary` when the browser/voice emits it,
 * and seamlessly falls back to a rate-calibrated word pacer for cloud/mobile voices
 * that do not fire boundary events.
 */
function speakSingleInternal(
  text: string,
  accent: Accent,
  rate: number,
  sessionId: number,
  options?: SpeakOptions
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options?.onError?.();
    return;
  }

  // Keep character positions aligned with tokens when no IPA slashes exist
  const clean = text.replace(/\/[^/]+\//g, (m) => ' '.repeat(m.length));
  if (!clean.trim()) {
    options?.onEnd?.();
    return;
  }

  const spans = buildWordSpans(clean);
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = accent;
  utter.rate = rate;

  const voice = pickBestVoice(accent);
  if (voice) utter.voice = voice;

  let nativeBoundarySeen = false;
  let lastReportedIdx = -1;

  const reportWord = (idx: number) => {
    if (sessionId !== activeSessionId) return;
    if (idx >= 0 && idx < spans.length && idx !== lastReportedIdx) {
      lastReportedIdx = idx;
      options?.onWordChange?.(idx);
    }
  };

  // Fallback word pacer: only steps forward if native `onboundary` hasn't fired
  const scheduleFallbackWord = (wordIdx: number) => {
    clearFallbackTimer();
    if (sessionId !== activeSessionId || nativeBoundarySeen || wordIdx >= spans.length) return;
    reportWord(wordIdx);
    const wordLen = spans[wordIdx]?.length || 5;
    const baseMs = Math.max(150, Math.min(620, (130 + wordLen * 36) / Math.max(0.5, rate)));
    activeFallbackTimer = window.setTimeout(() => {
      scheduleFallbackWord(wordIdx + 1);
    }, baseMs);
  };

  utter.onstart = () => {
    if (sessionId !== activeSessionId) return;
    options?.onStart?.();
    if (spans.length > 0) {
      reportWord(0);
      // Give native `onboundary` 420ms to take over; otherwise smoothly advance via fallback pacer
      clearFallbackTimer();
      activeFallbackTimer = window.setTimeout(() => {
        if (!nativeBoundarySeen && sessionId === activeSessionId) {
          scheduleFallbackWord(1);
        }
      }, 420);
    }
  };

  utter.onboundary = (event: SpeechSynthesisEvent) => {
    if (sessionId !== activeSessionId) return;
    if (event.name && event.name !== 'word') return;
    nativeBoundarySeen = true;
    clearFallbackTimer();
    const idx = findWordIndexAtChar(spans, event.charIndex);
    reportWord(idx);
  };

  utter.onend = () => {
    clearFallbackTimer();
    if (sessionId !== activeSessionId) return;
    options?.onEnd?.();
  };

  utter.onerror = () => {
    clearFallbackTimer();
    if (sessionId !== activeSessionId) return;
    options?.onError?.();
  };

  window.speechSynthesis.speak(utter);
}

export function speakText(
  text: string,
  accent: Accent = 'en-GB',
  rate = 0.95,
  options?: SpeakOptions
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options?.onError?.();
    return;
  }
  stopSpeaking();
  const sessionId = activeSessionId;
  speakSingleInternal(text, accent, rate, sessionId, options);
}

/**
 * Speak a list of paragraphs sequentially, reporting both the active paragraph key
 * and the active 0-based word index inside that paragraph in real time.
 */
export function speakParagraphQueue(
  items: SpeechQueueItem[],
  accent: Accent = 'en-GB',
  rate = 0.95,
  callbacks?: SpeechQueueCallbacks
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    callbacks?.onError?.();
    return;
  }
  const nonEmpty = items.filter((it) => it.text && it.text.trim().length > 0);
  if (nonEmpty.length === 0) {
    callbacks?.onComplete?.();
    return;
  }

  stopSpeaking();
  const sessionId = activeSessionId;

  const runAt = (i: number) => {
    if (sessionId !== activeSessionId) return;
    if (i >= nonEmpty.length) {
      callbacks?.onComplete?.();
      return;
    }
    const cur = nonEmpty[i];
    callbacks?.onItemStart?.(cur.key);
    speakSingleInternal(cur.text, accent, rate, sessionId, {
      onWordChange: (wIdx) => callbacks?.onWordChange?.(cur.key, wIdx),
      onEnd: () => runAt(i + 1),
      onError: () => callbacks?.onError?.(),
    });
  };

  runAt(0);
}
