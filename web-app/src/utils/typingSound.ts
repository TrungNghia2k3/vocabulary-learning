// Lightweight Web Audio API mechanical keyboard sound synthesizer (zero external audio files).

export type TypingSoundKind = 'key' | 'space' | 'error' | 'complete';

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
  const length = Math.floor(ctx.sampleRate * 0.04); // 40ms short noise burst
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // Exponentially decaying white noise for crisp switch transient
    const decay = Math.exp(-i / (ctx.sampleRate * 0.008));
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  cachedNoiseBuffer = buffer;
  return buffer;
}

export function playTypingSound(kind: TypingSoundKind = 'key'): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (kind === 'complete') {
    // Crisp, pleasant 2-note chime for completing a sentence
    const notes = [523.25, 659.25]; // C5 -> E5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.075);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.075);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.075 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.075 + 0.19);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.075);
      osc.stop(now + idx * 0.075 + 0.21);
    });
    return;
  }

  if (kind === 'error') {
    // Subtle muted low bump so typos are noticeable without being harsh
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.065);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
    return;
  }

  // Mechanical key switch: filtered click transient + subtle tactile "thock" body
  const jitter = 0.94 + Math.random() * 0.12; // Natural per-key pitch variation
  const isSpace = kind === 'space';

  // 1. Crisp switch click (bandpass-filtered noise)
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime((isSpace ? 1400 : 2400) * jitter, now);
  filter.Q.setValueAtTime(1.4, now);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(isSpace ? 0.16 : 0.13, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (isSpace ? 0.032 : 0.022));
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.038);

  // 2. Keycap bottom-out "thock" body (short sine/triangle thump)
  const osc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime((isSpace ? 155 : 220) * jitter, now);
  osc.frequency.exponentialRampToValueAtTime((isSpace ? 72 : 98) * jitter, now + 0.028);
  bodyGain.gain.setValueAtTime(0.0001, now);
  bodyGain.gain.exponentialRampToValueAtTime(isSpace ? 0.13 : 0.085, now + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + (isSpace ? 0.04 : 0.03));
  osc.connect(bodyGain);
  bodyGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.045);
}
