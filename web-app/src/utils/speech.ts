import type { Accent } from '../types';

export function speakText(text: string, accent: Accent = 'en-GB', rate = 0.95): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const clean = text.replace(/\/[^/]+\//g, '').trim();
  if (!clean) return;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = accent;
  utter.rate = rate;

  const voices = window.speechSynthesis.getVoices();
  const exact = voices.find((v) => v.lang.toLowerCase() === accent.toLowerCase());
  const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(accent.slice(0, 2).toLowerCase()));
  if (exact) utter.voice = exact;
  else if (prefix) utter.voice = prefix;

  window.speechSynthesis.speak(utter);
}
