// Tiny synthesized sound effects (Web Audio) so the prototype has feedback without audio files.
// Swap these for real recordings later by loading audio in BootScene and calling scene.sound.play().

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.3;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user gesture (tap / key press) so browsers allow sound. */
export function unlockAudio(): void {
  audio();
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.3;
}

export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'square', vol = 0.25, slideTo?: number) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(at: number, dur: number, vol = 0.2, cutoff = 2000) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

export const sfx = {
  click: () => tone(660, 0, 0.06, 'square', 0.15),
  scrapTick: () => noise(0, 0.05, 0.08, 3500),
  scrapDone: () => {
    noise(0, 0.12, 0.25, 1800);
    tone(220, 0, 0.12, 'triangle', 0.25, 140);
    tone(880, 0.06, 0.1, 'square', 0.12);
  },
  sell: () => {
    tone(988, 0, 0.09, 'square', 0.18);
    tone(1319, 0.09, 0.22, 'square', 0.18);
  },
  denied: () => tone(160, 0, 0.18, 'sawtooth', 0.18, 110),
  unlock: () => {
    tone(1200, 0, 0.04, 'square', 0.15);
    tone(700, 0.06, 0.06, 'square', 0.15);
  },
  ability: () => tone(400, 0, 0.25, 'triangle', 0.22, 900),
  spotted: () => {
    tone(700, 0, 0.08, 'square', 0.2);
    tone(1050, 0.08, 0.14, 'square', 0.2);
  },
  warning: () => {
    tone(300, 0, 0.25, 'sawtooth', 0.25);
    tone(300, 0.3, 0.35, 'sawtooth', 0.25);
  },
  /** A student gasps and yells for Mr. Gravy. */
  tattle: () => {
    tone(880, 0, 0.1, 'triangle', 0.22, 1320);
    tone(1175, 0.13, 0.12, 'square', 0.14);
    tone(988, 0.27, 0.2, 'square', 0.14);
  },
  /** Mr. Gravy hears the report and takes off. */
  report: () => {
    tone(392, 0, 0.09, 'sawtooth', 0.18);
    tone(523, 0.09, 0.09, 'sawtooth', 0.18);
    tone(784, 0.18, 0.18, 'sawtooth', 0.18, 1046);
  },
  coffee: () => tone(500, 0, 0.4, 'triangle', 0.2, 250),
  fired: () => [523, 415, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.22, 'sawtooth', 0.22)),
  shiftOver: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.18, 'square', 0.18)),
};
