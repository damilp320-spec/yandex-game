// Джинглы на WebAudio: каждой цепочке — свой «голос» (тембр осциллятора),
// мелодии собираются из нот в реальном времени. Ноль аудио-ассетов (PLAN.md §6).
let ctx: AudioContext | undefined;

function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function note(freq: number, at: number, dur: number, type: OscillatorType = 'triangle', vol = 0.13) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

const st = (root: number, semi: number) => root * Math.pow(2, semi / 12);

/** Тембр-«голос» цепочки по её индексу (событийная получает свой). */
const VOICES: OscillatorType[] = ['triangle', 'square', 'sine', 'sawtooth', 'triangle', 'square', 'sine'];
const voice = (chain: number) => VOICES[chain % VOICES.length];

/** Слияние: арпеджио, тон растёт с уровнем; с 5-го уровня — мини-фанфара. */
export function jingleMerge(level: number, chain: number) {
  const root = 262 * Math.pow(2, level / 6), v = voice(chain);
  [0, 4, 7].forEach((s, i) => note(st(root, s), i * 0.07, 0.18, v));
  if (level >= 4) [12, 16, 19].forEach((s, i) => note(st(root, s), 0.24 + i * 0.08, 0.3, v, 0.16));
}

/** Заказ выполнен: «ка-чинг». */
export const jingleOrder = () => { note(988, 0, 0.08, 'square', 0.1); note(1319, 0.07, 0.22, 'square', 0.12); note(1976, 0.14, 0.3, 'sine', 0.08); };

/** Новое существо в Мемпедии: искристый пробег вверх. */
export const jingleDiscovery = () => [0, 3, 5, 7, 10, 12].forEach((s, i) => note(st(523, s), i * 0.055, 0.14, 'sine', 0.11));

/** Крупное достижение (новая локация, милстоун события): полная фанфара. */
export const jingleFanfare = () => {
  ([[0, 0], [4, 0.12], [7, 0.24], [12, 0.36]] as const).forEach(([s, t]) => note(st(392, s), t, 0.35, 'triangle', 0.15));
  ([[12, 0.55], [16, 0.62], [19, 0.7], [24, 0.8]] as const).forEach(([s, t]) => note(st(392, s), t, 0.45, 'square', 0.1));
};

export const coinSound = () => { note(880, 0, 0.07, 'square', 0.09); note(1320, 0.06, 0.1, 'square', 0.09); };
export const failSound = () => note(150, 0, 0.22, 'sawtooth', 0.07);
export const tada = () => [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.09, 0.18));
