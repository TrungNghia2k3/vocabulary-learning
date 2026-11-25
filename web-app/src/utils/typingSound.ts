// Hybrid Web Audio API keyboard sound engine:
// - Real multi-sample Monkeytype switch recordings (Cherry MX Black ABS, Razer Green) via decoded AudioBuffers (zero latency)
// - Built-in synthesized switch profiles (Midnight Thock, Frost Click, Creamy Thock, Clicky Blue, Typewriter, Soft Pop, Laptop)

export type TypingSoundKind = 'key' | 'space' | 'error' | 'complete';

export type TypingSoundProfile =
  | 'off'
  | 'cherrymx-black-abs'
  | 'razer-green'
  | 'midnight'
  | 'frost'
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
  { id: 'cherrymx-black-abs', label: 'Cherry MX Black ABS (Thật)', desc: 'Âm thu thật từ Monkeytype — đầm, êm, chắc tay' },
  { id: 'razer-green', label: 'Razer Green (Thật)', desc: 'Âm thu thật từ Monkeytype — tách giòn, đã tai' },
  { id: 'midnight', label: 'Midnight Thock', desc: 'Siêu trầm, êm sâu kiểu gasket đêm khuya' },
  { id: 'frost', label: 'Frost Click', desc: 'Tách trong trẻo, sắc lạnh như pha lê' },
  { id: 'thock', label: 'Creamy Thock', desc: 'Phím cơ trầm ấm, êm tai' },
  { id: 'blue', label: 'Clicky Blue', desc: 'Phím cơ xanh kêu tách giòn' },
  { id: 'typewriter', label: 'Máy đánh chữ', desc: 'Cơ học cổ điển, có tiếng chuông' },
  { id: 'bubble', label: 'Soft Pop', desc: 'Âm pop nhẹ nhàng, thư giãn' },
  { id: 'laptop', label: 'Phím Laptop', desc: 'Mỏng, gọn, sắc nét' },
];

const SAMPLE_PACK_URLS: Partial<Record<TypingSoundProfile, string[]>> = {
  'cherrymx-black-abs': Array.from({ length: 10 }, (_, i) => `/sounds/cherrymx-black-abs/${i + 1}.wav`),
  'razer-green': Array.from({ length: 10 }, (_, i) => `/sounds/razer-green/${i + 1}.wav`),
};

let audioCtx: AudioContext | null = null;
let cachedNoiseBuffer: AudioBuffer | null = null;

// Decoded real AudioBuffer cache per sample pack
const sampleBuffers = new Map<TypingSoundProfile, AudioBuffer[]>();
const sampleLoadPromises = new Map<TypingSoundProfile, Promise<AudioBuffer[]>>();
const lastPlayedIndex = new Map<TypingSoundProfile, number>();

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

export function preloadTypingSoundProfile(profile: TypingSoundProfile): Promise<AudioBuffer[]> {
  const urls = SAMPLE_PACK_URLS[profile];
  if (!urls) return Promise.resolve([]);
  const existing = sampleBuffers.get(profile);
  if (existing && existing.length > 0) return Promise.resolve(existing);
  const inflight = sampleLoadPromises.get(profile);
  if (inflight) return inflight;

  const ctx = getAudioContext();
  if (!ctx) return Promise.resolve([]);

  const promise = Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        return await ctx.decodeAudioData(arr);
      } catch {
        return null;
      }
    })
  ).then((decoded) => {
    const valid = decoded.filter((b): b is AudioBuffer => b !== null);
    if (valid.length > 0) {
      sampleBuffers.set(profile, valid);
    }
    sampleLoadPromises.delete(profile);
    return valid;
  });

  sampleLoadPromises.set(profile, promise);
  return promise;
}

function playDecodedSample(
  ctx: AudioContext,
  profile: TypingSoundProfile,
  buffers: AudioBuffer[],
  isSpace: boolean
) {
  if (buffers.length === 0) return;
  const prevIdx = lastPlayedIndex.get(profile) ?? -1;
  let idx = Math.floor(Math.random() * buffers.length);
  if (buffers.length > 1 && idx === prevIdx) {
    idx = (idx + 1 + Math.floor(Math.random() * (buffers.length - 1))) % buffers.length;
  }
  lastPlayedIndex.set(profile, idx);

  const src = ctx.createBufferSource();
  src.buffer = buffers[idx];
  src.playbackRate.value = isSpace ? 0.91 + Math.random() * 0.04 : 0.98 + Math.random() * 0.04;

  const gain = ctx.createGain();
  gain.gain.value = isSpace ? 0.85 : 0.75;

  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(ctx.currentTime);
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedNoiseBuffer && cachedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return cachedNoiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.05);
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
  profile: TypingSoundProfile = 'cherrymx-black-abs'
): void {
  if (profile === 'off') return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const jitter = 0.94 + Math.random() * 0.12;
  const isSpace = kind === 'space';

  if (kind === 'complete') {
    if (profile === 'typewriter') {
      playTone(ctx, now, 1860, 1850, 0.09, 0.38, 'sine');
      playTone(ctx, now, 3720, 3700, 0.035, 0.22, 'sine');
    } else {
      playTone(ctx, now, 523.25, 523.25, 0.08, 0.19, 'sine');
      playTone(ctx, now + 0.075, 659.25, 659.25, 0.08, 0.21, 'sine');
    }
    return;
  }

  if (kind === 'error') {
    playTone(ctx, now, 145, 92, 0.11, 0.075, 'triangle');
    return;
  }

  // Real recorded sample packs (Monkeytype Cherry MX Black ABS / Razer Green)
  if (SAMPLE_PACK_URLS[profile]) {
    const cached = sampleBuffers.get(profile);
    if (cached && cached.length > 0) {
      playDecodedSample(ctx, profile, cached, isSpace);
    } else {
      preloadTypingSoundProfile(profile).then((loaded) => {
        if (loaded.length > 0) {
          playDecodedSample(ctx, profile, loaded, isSpace);
        }
      });
    }
    return;
  }

  switch (profile) {
    case 'thock': {
      playNoiseBurst(ctx, now, (isSpace ? 1250 : 2100) * jitter, 1.4, isSpace ? 0.14 : 0.11, isSpace ? 0.032 : 0.022);
      playTone(ctx, now, (isSpace ? 150 : 215) * jitter, (isSpace ? 68 : 95) * jitter, isSpace ? 0.14 : 0.095, isSpace ? 0.042 : 0.032, 'triangle');
      break;
    }

    case 'midnight': {
      playNoiseBurst(ctx, now, (isSpace ? 520 : 760) * jitter, 0.9, isSpace ? 0.15 : 0.11, isSpace ? 0.038 : 0.026, 'lowpass');
      playTone(ctx, now, (isSpace ? 112 : 148) * jitter, (isSpace ? 48 : 62) * jitter, isSpace ? 0.19 : 0.145, isSpace ? 0.055 : 0.044, 'sine');
      playTone(ctx, now + 0.004, (isSpace ? 190 : 260) * jitter, 95 * jitter, isSpace ? 0.065 : 0.045, 0.028, 'triangle');
      break;
    }

    case 'frost': {
      playNoiseBurst(ctx, now, (isSpace ? 3600 : 5400) * jitter, 2.8, isSpace ? 0.15 : 0.14, 0.015, 'bandpass');
      playTone(ctx, now, (isSpace ? 2100 : 3350) * jitter, (isSpace ? 1500 : 2450) * jitter, 0.055, 0.022, 'sine');
      playTone(ctx, now + 0.003, (isSpace ? 220 : 320) * jitter, (isSpace ? 115 : 165) * jitter, isSpace ? 0.12 : 0.08, isSpace ? 0.034 : 0.024, 'triangle');
      break;
    }

    case 'blue': {
      playNoiseBurst(ctx, now, (isSpace ? 3200 : 4800) * jitter, 2.2, isSpace ? 0.18 : 0.16, 0.016, 'highpass');
      playTone(ctx, now, (isSpace ? 900 : 1650) * jitter, (isSpace ? 420 : 760) * jitter, 0.075, 0.014, 'square');
      playTone(ctx, now + 0.005, (isSpace ? 165 : 230) * jitter, 95 * jitter, isSpace ? 0.11 : 0.065, 0.026, 'triangle');
      break;
    }

    case 'typewriter': {
      playNoiseBurst(ctx, now, (isSpace ? 1800 : 2800) * jitter, 1.1, isSpace ? 0.22 : 0.19, isSpace ? 0.045 : 0.034);
      playTone(ctx, now, (isSpace ? 260 : 520) * jitter, (isSpace ? 110 : 190) * jitter, 0.11, 0.032, 'sawtooth');
      playTone(ctx, now + 0.004, (isSpace ? 1200 : 2200) * jitter, 1400 * jitter, 0.035, 0.028, 'sine');
      break;
    }

    case 'bubble': {
      const base = (isSpace ? 320 : 480) * jitter;
      playTone(ctx, now, base, base * 1.45, isSpace ? 0.095 : 0.075, 0.045, 'sine');
      break;
    }

    case 'laptop': {
      playNoiseBurst(ctx, now, (isSpace ? 2400 : 3600) * jitter, 1.8, isSpace ? 0.11 : 0.085, 0.014);
      playTone(ctx, now, (isSpace ? 195 : 290) * jitter, 130 * jitter, isSpace ? 0.075 : 0.048, 0.018, 'sine');
      break;
    }
  }
}
