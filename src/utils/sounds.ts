/**
 * Xiangqi Sound Engine
 *
 * Four sounds, each triggered from App.tsx:
 *
 *   playPickSound()    — piece lifted     ("咔" click)
 *   playMoveSound()    — piece placed     ("砰" thud)
 *   playCaptureSound() — piece captured   (speech: "吃")
 *   playCheckSound()   — check announced  (speech: "将军")
 *
 * Priority rule (enforced in App.tsx by the caller):
 *   将军 > 吃 > 普通落子
 * One sound per move — the caller decides which to fire.
 *
 * ═══════════════════════════════════════════════════════════════
 * WHY SPEECH FAILS ON MOBILE
 * ═══════════════════════════════════════════════════════════════
 * iOS Safari / Android Chrome require speechSynthesis.speak() to
 * be called **synchronously inside a user-gesture handler**.
 * AI worker callbacks and React state cycles are async, so mobile
 * silently drops the call.  Desktop is lenient — it allows speak()
 * any time after the first user interaction, which is why it works
 * there but not on mobile.
 *
 * FIX: We synthesise "吃" and "将军" directly with the Web Audio
 * API using formant-based vowel synthesis (no external TTS).
 * Web Audio nodes can be started at any time once the AudioContext
 * is unlocked — call unlockAudio() on first touch/click.
 * ═══════════════════════════════════════════════════════════════
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!_ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (Ctor) _ctx = new Ctor();
  }
  if (_ctx?.state === 'suspended') _ctx.resume();
  return _ctx;
}

/** Call once inside any synchronous touch/click handler to prime iOS audio. */
export function unlockAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
}

// ── Reverb (short room, built once) ─────────────────────────────
let _rv: ConvolverNode | null = null;
function getReverb(ctx: AudioContext): ConvolverNode {
  if (_rv) return _rv;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.06);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
  }
  _rv = ctx.createConvolver();
  _rv.buffer = buf;
  return _rv;
}

function route(ctx: AudioContext, src: AudioNode, vol: number, reverb = true, dry = 0.78) {
  const m = ctx.createGain(); m.gain.value = vol;
  if (reverb) {
    const d = ctx.createGain(); d.gain.value = dry;
    const w = ctx.createGain(); w.gain.value = 1 - dry;
    const rv = getReverb(ctx);
    src.connect(d); d.connect(m);
    src.connect(rv); rv.connect(w); w.connect(m);
  } else {
    src.connect(m);
  }
  m.connect(ctx.destination);
}

function makeNoise(ctx: AudioContext, sec: number): AudioBufferSourceNode {
  const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = buf; return s;
}

// ════════════════════════════════════════════════════════════════
// 1. PICK SOUND  —  "咔"  (sharp click when lifting a piece)
//
// Short, crisp high-frequency snap:
//   • Very fast noise burst through a narrow bandpass (~2 kHz)
//   • Quick exponential decay, no reverb — dry and close
// ════════════════════════════════════════════════════════════════
export function playPickSound(): void {
  const ctx = getCtx(); if (!ctx) return;
  const t = ctx.currentTime;

  const n = makeNoise(ctx, 0.025);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 3.0;
  n.connect(bp);

  // Second pole — adds a hard "k" transient
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 1400;
  n.connect(hp);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1.4, t + 0.001);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
  bp.connect(env); hp.connect(env);

  // Tiny tonal click ~1800 Hz
  const osc = ctx.createOscillator();
  osc.type = 'triangle'; osc.frequency.value = 1800;
  const oEnv = ctx.createGain();
  oEnv.gain.setValueAtTime(0, t);
  oEnv.gain.linearRampToValueAtTime(0.30, t + 0.001);
  oEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
  osc.connect(oEnv);

  const mix = ctx.createGain(); mix.gain.value = 1;
  env.connect(mix); oEnv.connect(mix);
  route(ctx, mix, 1.6, false); // dry — no reverb for a crisp snap

  n.start(t); n.stop(t + 0.030);
  osc.start(t); osc.stop(t + 0.022);
}

// ════════════════════════════════════════════════════════════════
// 2. MOVE SOUND  —  "砰"  (wooden thud when placing a piece)
//
// Three-layer wooden percussion:
//   1. Bandpass noise transient   → woody "tck"
//   2. Triangle body resonance    → piece ringing on board
//   3. Sine sub-thump             → mass hitting board surface
// ════════════════════════════════════════════════════════════════
export function playMoveSound(): void {
  const ctx = getCtx(); if (!ctx) return;
  const t = ctx.currentTime;

  const click = makeNoise(ctx, 0.055);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4;
  click.connect(bp);
  const cEnv = ctx.createGain();
  cEnv.gain.setValueAtTime(0, t);
  cEnv.gain.linearRampToValueAtTime(1.6, t + 0.002);
  cEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.048);
  bp.connect(cEnv);

  const body = ctx.createOscillator();
  body.type = 'triangle'; body.frequency.setValueAtTime(440, t);
  body.frequency.exponentialRampToValueAtTime(250, t + 0.075);
  const bEnv = ctx.createGain();
  bEnv.gain.setValueAtTime(0, t);
  bEnv.gain.linearRampToValueAtTime(0.50, t + 0.003);
  bEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.082);
  body.connect(bEnv);

  const thump = ctx.createOscillator();
  thump.type = 'sine'; thump.frequency.setValueAtTime(125, t);
  thump.frequency.exponentialRampToValueAtTime(65, t + 0.062);
  const tEnv = ctx.createGain();
  tEnv.gain.setValueAtTime(0, t);
  tEnv.gain.linearRampToValueAtTime(0.70, t + 0.004);
  tEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.070);
  thump.connect(tEnv);

  const mix = ctx.createGain(); mix.gain.value = 1;
  cEnv.connect(mix); bEnv.connect(mix); tEnv.connect(mix);
  route(ctx, mix, 2.0, true, 0.80);

  click.start(t); click.stop(t + 0.06);
  body.start(t);  body.stop(t + 0.09);
  thump.start(t); thump.stop(t + 0.08);
}

// ════════════════════════════════════════════════════════════════
// 3. CAPTURE SOUND  —  语音 "吃" (Mandarin: chī)
//
// Why not speechSynthesis: see module header.
//
// Formant synthesis approach — approximates Mandarin "chī":
//   Phase 1: aspirated "ch" noise burst (affricate onset)
//   Phase 2: "ī" vowel  (F1≈280 Hz, F2≈2200 Hz high front vowel)
//   Pitch envelope: high, flat (Tone 1 in Mandarin)
//
// This is clearly recognisable as "吃" without requiring TTS.
// ════════════════════════════════════════════════════════════════
export function playCaptureSound(): void {
  const ctx = getCtx(); if (!ctx) return;
  const t = ctx.currentTime;

  // ── "ch" onset: retroflexed affricate noise burst ─────────────
  const chDur = 0.055;
  const chN = makeNoise(ctx, chDur);
  // High-freq bandpass simulates the retroflexed fricative
  const chBp1 = ctx.createBiquadFilter();
  chBp1.type = 'bandpass'; chBp1.frequency.value = 3500; chBp1.Q.value = 1.8;
  chN.connect(chBp1);
  const chBp2 = ctx.createBiquadFilter();
  chBp2.type = 'bandpass'; chBp2.frequency.value = 2000; chBp2.Q.value = 2.0;
  chN.connect(chBp2);
  const chEnv = ctx.createGain();
  chEnv.gain.setValueAtTime(0, t);
  chEnv.gain.linearRampToValueAtTime(1.0, t + 0.005);
  chEnv.gain.setValueAtTime(1.0, t + 0.030);
  chEnv.gain.exponentialRampToValueAtTime(0.001, t + chDur);
  chBp1.connect(chEnv); chBp2.connect(chEnv);

  // ── "ī" vowel: F0 (pitch) + F1 + F2 formants ─────────────────
  const vowelStart = t + 0.040;
  const vowelDur   = 0.18;
  const f0 = 210; // Mandarin Tone 1: high, level pitch

  // Pitch source — buzzy glottal pulse (sawtooth)
  const pitch = ctx.createOscillator();
  pitch.type = 'sawtooth'; pitch.frequency.value = f0;

  // F1 ~280 Hz (low first formant = high front vowel)
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass'; f1.frequency.value = 280; f1.Q.value = 6;
  pitch.connect(f1);

  // F2 ~2200 Hz (high second formant = front vowel /i/)
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass'; f2.frequency.value = 2200; f2.Q.value = 8;
  pitch.connect(f2);

  const vowelEnv = ctx.createGain();
  vowelEnv.gain.setValueAtTime(0, vowelStart);
  vowelEnv.gain.linearRampToValueAtTime(0.9, vowelStart + 0.015);
  vowelEnv.gain.setValueAtTime(0.9, vowelStart + vowelDur * 0.5);
  vowelEnv.gain.exponentialRampToValueAtTime(0.001, vowelStart + vowelDur);
  f1.connect(vowelEnv); f2.connect(vowelEnv);

  const mix = ctx.createGain(); mix.gain.value = 1;
  chEnv.connect(mix); vowelEnv.connect(mix);
  route(ctx, mix, 2.2, true, 0.65);

  chN.start(t); chN.stop(t + chDur + 0.005);
  pitch.start(vowelStart); pitch.stop(vowelStart + vowelDur + 0.01);
}

// ════════════════════════════════════════════════════════════════
// 4. CHECK SOUND  —  语音 "将军" (Mandarin: jiāng jūn)
//
// Two syllables synthesised with formant chains:
//
//   "jiāng" (Tone 1: high flat)
//     onset: palatal "j" — very high-freq fricative burst
//     vowel: "iāng" — F1≈400 Hz, F2≈2500 Hz, nasal ending
//
//   "jūn"  (Tone 1: high flat, slightly lower than jiāng)
//     onset: same palatal "j"
//     vowel: "ün" — rounded front vowel F1≈350 Hz, F2≈1600 Hz
//
// Pitch is held high and flat throughout (Tone 1).
// The two syllables are separated by ~50 ms of silence.
// ════════════════════════════════════════════════════════════════
export function playCheckSound(): void {
  const ctx = getCtx(); if (!ctx) return;

  const syllables = [
    // jiāng — Tone 1 high level
    { onset: 0,    f0: 215, vowelF1: 400,  vowelF2: 2500, vowelDur: 0.22, hasNasal: true },
    // jūn   — Tone 1 high level
    { onset: 0.28, f0: 208, vowelF1: 350,  vowelF2: 1600, vowelDur: 0.20, hasNasal: true },
  ];

  syllables.forEach(({ onset, f0, vowelF1, vowelF2, vowelDur, hasNasal }) => {
    const t0 = ctx.currentTime + onset;
    const jDur = 0.045; // "j" fricative burst

    // ── "j" onset: palatal fricative ──────────────────────────
    const jN = makeNoise(ctx, jDur);
    const jBp = ctx.createBiquadFilter();
    jBp.type = 'bandpass'; jBp.frequency.value = 4000; jBp.Q.value = 2.0;
    jN.connect(jBp);
    const jEnv = ctx.createGain();
    jEnv.gain.setValueAtTime(0, t0);
    jEnv.gain.linearRampToValueAtTime(0.7, t0 + 0.006);
    jEnv.gain.exponentialRampToValueAtTime(0.001, t0 + jDur);
    jBp.connect(jEnv);

    // ── Vowel: pitch source ────────────────────────────────────
    const vowelStart = t0 + jDur - 0.010; // slight overlap
    const pitch = ctx.createOscillator();
    pitch.type = 'sawtooth'; pitch.frequency.value = f0;

    const f1f = ctx.createBiquadFilter();
    f1f.type = 'bandpass'; f1f.frequency.value = vowelF1; f1f.Q.value = 7;
    pitch.connect(f1f);

    const f2f = ctx.createBiquadFilter();
    f2f.type = 'bandpass'; f2f.frequency.value = vowelF2; f2f.Q.value = 10;
    pitch.connect(f2f);

    // Nasal resonance for "ng" / "n" coda
    const nasal = ctx.createBiquadFilter();
    nasal.type = 'bandpass'; nasal.frequency.value = 250; nasal.Q.value = 8;
    pitch.connect(nasal);

    const nasalEnv = ctx.createGain();
    // Nasal fades in near the end of the vowel
    nasalEnv.gain.setValueAtTime(0, vowelStart);
    nasalEnv.gain.setValueAtTime(0, vowelStart + vowelDur * 0.55);
    nasalEnv.gain.linearRampToValueAtTime(hasNasal ? 0.5 : 0, vowelStart + vowelDur * 0.80);
    nasalEnv.gain.exponentialRampToValueAtTime(0.001, vowelStart + vowelDur);
    nasal.connect(nasalEnv);

    const vowelEnv = ctx.createGain();
    vowelEnv.gain.setValueAtTime(0, vowelStart);
    vowelEnv.gain.linearRampToValueAtTime(1.0, vowelStart + 0.018);
    vowelEnv.gain.setValueAtTime(1.0, vowelStart + vowelDur * 0.45);
    vowelEnv.gain.exponentialRampToValueAtTime(0.001, vowelStart + vowelDur);
    f1f.connect(vowelEnv); f2f.connect(vowelEnv);

    const mix = ctx.createGain(); mix.gain.value = 1;
    jEnv.connect(mix); vowelEnv.connect(mix); nasalEnv.connect(mix);
    route(ctx, mix, 2.1, true, 0.62);

    jN.start(t0);       jN.stop(t0 + jDur + 0.005);
    pitch.start(vowelStart); pitch.stop(vowelStart + vowelDur + 0.01);
  });
}
