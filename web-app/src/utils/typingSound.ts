// Web Audio API keyboard sound synthesizer with multiple switch profiles (zero external audio files).

export type TypingSoundKind = 'key' | 'space' | 'error' | 'complete';

export type TypingSoundProfile =
  | 'off'
  | 'thock'
  | 'blue'
  | 'typewriter'
  | 'bubble'
  | 'laptop';

export const TYPING_SOUND_PROFILES: Array<{
  id: TypingSoundProfile;
  label: string;
  desc: string;
}> = [
  { id: 'off', label: 'Tắt tiếng', desc: 'Im lặng hoàn toàn' },
  { id: 'thock', label: 'Creamy Thock', desc: 'Phím cơ trầm ấm, êm tai' },
  { id: 'blue', label: 'Clicky Blue', desc: 'Phím cơ xanh kêu tách giòn' },
  { id: 'typewriter', label: 'Máy đánh chữ', desc: 'Cơ học cổ điển, có tiếng chuông' },
  { id: 'bubble', label: 'Soft Pop', desc: 'Âm pop nhẹ nhàng, thư giãn' },
  { id: 'laptop', label: 'Phím Laptop', desc: 'Mỏng, gọn, sắc nét' },
];

let audioCtx: AudioContext | null = null;
let cachedNoiseBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedNoiseBuffer && cachedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return cachedNoiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.05); // 50ms decaying white noise
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const decay = Math.exp(-i / (ctx.sampleRate * 0.009));
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  cachedNoiseBuffer = buffer;
  return buffer;
}

function playNoiseBurst(
  ctx: AudioContext,
  now: number,
  freq: number,
  q: number,
  gainPeak: number,
  duration: number,
  filterType: BiquadFilterType = 'bandpass'
) {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(freq, now);
  filter.Q.setValueAtTime(q, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainPeak, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration + 0.008);
}

function playTone(
  ctx: AudioContext,
  startAt: number,
  startFreq: number,
  endFreq: number,
  gainPeak: number,
  duration: number,
  type: OscillatorType = 'triangle'
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, startAt);
  if (endFreq !== startFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startAt + duration * 0.85);
  }
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainPeak, startAt + Math.min(0.006, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.01);
}

export function playTypingSound(
  kind: TypingSoundKind = 'key',
  profile: TypingSoundProfile = 'thock'
): void {
  if (profile === 'off') return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const jitter = 0.94 + Math.random() * 0.12;
  const isSpace = kind === 'space';

  if (kind === 'complete') {
    if (profile === 'typewriter') {
      // Classic typewriter carriage-return bell "ding!"
      playTone(ctx, now, 1860, 1850, 0.09, 0.38, 'sine');
      playTone(ctx, now, 3720, 3700, 0.035, 0.22, 'sine');
    } else {
      // Pleasant 2-note soft completion chime
      playTone(ctx, now, 523.25, 523.25, 0.08, 0.19, 'sine');
      playTone(ctx, now + 0.075, 659.25, 659.25, 0.08, 0.21, 'sine');
    }
    return;
  }

  if (kind === 'error') {
    // Subtle muted low bump so typos stand out without being harsh
    playTone(ctx, now, 145, 92, 0.11, 0.075, 'triangle');
    return;
  }

  switch (profile) {
    case 'thock': {
      // Deep, creamy lubed mechanical switch
      playNoiseBurst(ctx, now, (isSpace ? 1250 : 2100) * jitter, 1.4, isSpace ? 0.14 : 0.11, isSpace ? 0.032 : 0.022);
      playTone(ctx, now, (isSpace ? 150 : 215) * jitter, (isSpace ? 68 : 95) * jitter, isSpace ? 0.14 : 0.095, isSpace ? 0.042 : 0.032, 'triangle');
      break;
    }

    case 'blue': {
      // Crisp, bright Cherry MX Blue tactile click jacket
      playNoiseBurst(ctx, now, (isSpace ? 3200 : 4800) * jitter, 2.2, isSpace ? 0.18 : 0.16, 0.016, 'highpass');
      playTone(ctx, now, (isSpace ? 900 : 1650) * jitter, (isSpace ? 420 : 760) * jitter, 0.075, 0.014, 'square');
      playTone(ctx, now + 0.005, (isSpace ? 165 : 230) * jitter, 95 * jitter, isSpace ? 0.11 : 0.065, 0.026, 'triangle');
      break;
    }

    case 'typewriter': {
      // Vintage mechanical typewriter hammer strike + metallic ring
      playNoiseBurst(ctx, now, (isSpace ? 1800 : 2800) * jitter, 1.1, isSpace ? 0.22 : 0.19, isSpace ? 0.045 : 0.034);
      playTone(ctx, now, (isSpace ? 260 : 520) * jitter, (isSpace ? 110 : 190) * jitter, 0.11, 0.032, 'sawtooth');
      playTone(ctx, now + 0.004, (isSpace ? 1200 : 2200) * jitter, 1400 * jitter, 0.035, 0.028, 'sine');
      break;
    }

    case 'bubble': {
      // Gentle, relaxing water-drop / soft pop sound
      const base = (isSpace ? 320 : 480) * jitter;
      playTone(ctx, now, base, base * 1.45, isSpace ? 0.095 : 0.075, 0.045, 'sine');
      break;
    }

    case 'laptop': {
      // Crisp, ultra-short low-travel scissor switch (MacBook style)
      playNoiseBurst(ctx, now, (isSpace ? 2400 : 3600) * jitter, 1.8, isSpace ? 0.11 : 0.085, 0.014);
      playTone(ctx, now, (isSpace ? 195 : 290) * jitter, 130 * jitter, isSpace ? 0.075 : 0.048, 0.018, 'sine');
      break;
    }
  }
}
