// Синтезированный звук без ассетов: «сочность» фидбека — половина дофамина merge (PLAN.md §7).
let ctx: AudioContext | undefined;

function beep(freq: number, dur = 0.12, type: OscillatorType = 'triangle', vol = 0.15) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch { /* звук не критичен */ }
}

/** Слияние: тон растёт с уровнем — выше уровень, «вкуснее» звук. */
export const popSound = (level: number) => beep(320 + level * 90, 0.14);
export const coinSound = () => { beep(880, 0.07, 'square', 0.1); setTimeout(() => beep(1320, 0.09, 'square', 0.1), 60); };
export const failSound = () => beep(160, 0.2, 'sawtooth', 0.08);
export const tada = () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16), i * 90));
