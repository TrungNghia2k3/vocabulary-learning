import type { Accent } from '../types';

export interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
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
  const clean = text.replace(/\/[^/]+\//g, '').trim();
  if (!clean) {
    options?.onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = accent;
  utter.rate = rate;

  const voices = window.speechSynthesis.getVoices();
  const exact = voices.find((v) => v.lang.toLowerCase() === accent.toLowerCase());
  const prefix = voices.find((v) =>
    v.lang.toLowerCase().startsWith(accent.slice(0, 2).toLowerCase())
  );
  if (exact) utter.voice = exact;
  else if (prefix) utter.voice = prefix;

  if (options?.onStart) utter.onstart = options.onStart;
  if (options?.onEnd) utter.onend = options.onEnd;
  if (options?.onError) utter.onerror = options.onError;

  window.speechSynthesis.speak(utter);
}
