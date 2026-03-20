/**
 * Xiangqi Sound Engine — Web Audio API (no speechSynthesis)
 *
 * ═══════════════════════════════════════════════════════════════
 * WHY "吃" AND "将军" DON'T PLAY ON MOBILE
 * ═══════════════════════════════════════════════════════════════
 *
 * The root cause is a strict browser security rule:
 *
 *   speechSynthesis.speak() MUST be called synchronously inside
 *   a user-gesture event handler (a tap / click / keydown).
 *
 * In this app, sounds are triggered in two async contexts:
 *   1. AI Worker onmessage callback  — the gesture was the click
 *      that submitted the move, but by the time the worker
 *      replies the call stack has completely unwound.  The browser
 *      no longer considers this a user gesture.
 *   2. React state-update cycles    — setState / useEffect always
 *      run asynchronously, even when initiated by a user click.
 *
 * Desktop Chrome/Firefox are lenient: after the first user
 * interaction they allow speak() at any time in the same tab.
 * Mobile Safari and Android Chrome are strict: they enforce the
 * synchronous-gesture rule on every single call, which is why
 * 落子音 (move sound) works on mobile — it fires synchronously
 * inside the onClick handler — but 吃 and 将军 do not.
 *
 * FIX: replace speechSynthesis entirely with the Web Audio API.
 * AudioBufferSourceNode.start() can be called at any time once
 * the AudioContext has been created and resumed in a user gesture.
 * We call unlockAudio() once on the first board interaction, which
 * primes the context; every subsequent sound then works regardless
 * of whether it is triggered synchronously or asynchronously.
 *
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

/**
 * Call this once inside any synchronous user-gesture handler
 * (e.g. onTouchStart / onClick on the board wrapper) to "unlock"
 * the AudioContext on iOS / Android.
 */
export function unlockAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  // Play a silent 1-sample buffer — this satisfies iOS's "first
  // audio must be in a gesture" requirement.
  const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
}

// ── Shared room-reverb impulse (built once) ──────────────────────
let _reverb: ConvolverNode | null = null;
function getReverb(ctx: AudioContext): ConvolverNode {
  if (_reverb) return _reverb;
  const sr  = ctx.sampleRate;
  const len = Math.floor(sr * 0.09); // ~90 ms decay
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  }
  _reverb = ctx.createConvolver();
  _reverb.buffer = buf;
  return _reverb;
}

/**
 * Route a source node → optional reverb → gain → destination.
 * dryMix: 0.0 = all wet, 1.0 = all dry
 */
function route(
  ctx: AudioContext,
  src: AudioNode,
  masterGain: number,
  withReverb = true,
  dryMix = 0.76,
) {
  const master = ctx.createGain();
  master.gain.value = masterGain;
  if (withReverb) {
    const dry = ctx.createGain(); dry.gain.value = dryMix;
    const wet = ctx.createGain(); wet.gain.value = 1 - dryMix;
    const rv  = getReverb(ctx);
    src.connect(dry);  dry.connect(master);
    src.connect(rv);   rv.connect(wet);  wet.connect(master);
  } else {
    src.connect(master);
  }
  master.connect(ctx.destination);
}

/** White-noise AudioBufferSourceNode of given duration. */
function noise(ctx: AudioContext, sec: number): AudioBufferSourceNode {
  const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  return s;
}

// ═══════════════════════════════════════════════════════════════
// MOVE SOUND — wooden piece placed on board
//
// Three layers:
//   1. Bandpass-filtered noise transient  → dry woody "tck"
//   2. Triangle-wave body resonance       → piece vibrating
//   3. Sine sub-thump                     → mass of piece hitting board
// ═══════════════════════════════════════════════════════════════
export function playMoveSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;

  // Layer 1 — click transient
  const click = noise(ctx, 0.055);
  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass'; bp1.frequency.value = 920; bp1.Q.value = 1.4;
  click.connect(bp1);
  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'bandpass'; bp2.frequency.value = 1380; bp2.Q.value = 2.0;
  click.connect(bp2);
  const cEnv = ctx.createGain();
  cEnv.gain.setValueAtTime(0,   t);
  cEnv.gain.linearRampToValueAtTime(1.6,   t + 0.0018);
  cEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.048);
  bp1.connect(cEnv); bp2.connect(cEnv);

  // Layer 2 — wood body resonance
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(445, t);
  body.frequency.exponentialRampToValueAtTime(255, t + 0.072);
  const bEnv = ctx.createGain();
  bEnv.gain.setValueAtTime(0,   t);
  bEnv.gain.linearRampToValueAtTime(0.52,  t + 0.003);
  bEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.082);
  body.connect(bEnv);

  // Layer 3 — low thump
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(128, t);
  thump.frequency.exponentialRampToValueAtTime(68, t + 0.060);
  const tEnv = ctx.createGain();
  tEnv.gain.setValueAtTime(0,   t);
  tEnv.gain.linearRampToValueAtTime(0.72,  t + 0.004);
  tEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.068);
  thump.connect(tEnv);

  const mix = ctx.createGain(); mix.gain.value = 1;
  cEnv.connect(mix); bEnv.connect(mix); tEnv.connect(mix);
  route(ctx, mix, 2.0, true, 0.78);

  click.start(t); click.stop(t + 0.06);
  body.start(t);  body.stop(t + 0.09);
  thump.start(t); thump.stop(t + 0.08);
}

// ═══════════════════════════════════════════════════════════════
// CAPTURE SOUND — heavier two-stage crack + resonant thud
//
// Four layers:
//   1. High-passed crack burst  → sharp wood-on-wood impact
//   2. Mid body resonance       → larger displaced piece
//   3. Sub sine thud            → weight of capture
//   4. Delayed slide noise      → captured piece sliding off board
// ═══════════════════════════════════════════════════════════════
export function playCaptureSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;

  // Layer 1 — crack
  const crk = noise(ctx, 0.06);
  const hp1 = ctx.createBiquadFilter();
  hp1.type = 'highpass'; hp1.frequency.value = 1600;
  crk.connect(hp1);
  const hp2 = ctx.createBiquadFilter();
  hp2.type = 'bandpass'; hp2.frequency.value = 3200; hp2.Q.value = 1.2;
  crk.connect(hp2);
  const crkEnv = ctx.createGain();
  crkEnv.gain.setValueAtTime(0,   t);
  crkEnv.gain.linearRampToValueAtTime(2.1,   t + 0.0015);
  crkEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.040);
  hp1.connect(crkEnv); hp2.connect(crkEnv);

  // Layer 2 — mid body
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(345, t);
  body.frequency.exponentialRampToValueAtTime(188, t + 0.090);
  const bEnv = ctx.createGain();
  bEnv.gain.setValueAtTime(0,   t);
  bEnv.gain.linearRampToValueAtTime(0.88,  t + 0.004);
  bEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.105);
  body.connect(bEnv);

  // Layer 3 — sub thud
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(90, t);
  sub.frequency.exponentialRampToValueAtTime(50, t + 0.075);
  const sEnv = ctx.createGain();
  sEnv.gain.setValueAtTime(0,   t);
  sEnv.gain.linearRampToValueAtTime(1.18,  t + 0.006);
  sEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.095);
  sub.connect(sEnv);

  // Layer 4 — slide noise (slight delay)
  const slide = noise(ctx, 0.10);
  const sBp = ctx.createBiquadFilter();
  sBp.type = 'bandpass'; sBp.frequency.value = 480; sBp.Q.value = 0.8;
  slide.connect(sBp);
  const slEnv = ctx.createGain();
  slEnv.gain.setValueAtTime(0,    t + 0.024);
  slEnv.gain.linearRampToValueAtTime(0.22, t + 0.040);
  slEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.115);
  sBp.connect(slEnv);

  const mix = ctx.createGain(); mix.gain.value = 1;
  crkEnv.connect(mix); bEnv.connect(mix);
  sEnv.connect(mix);   slEnv.connect(mix);
  route(ctx, mix, 2.25, true, 0.70);

  crk.start(t);   crk.stop(t + 0.065);
  body.start(t);  body.stop(t + 0.115);
  sub.start(t);   sub.stop(t + 0.100);
  slide.start(t); slide.stop(t + 0.120);
}

// ═══════════════════════════════════════════════════════════════
// CHECK SOUND — two bright bell tones (alert)
//
// Replaces speechSynthesis("将军") entirely.
// Three-component bell model per strike:
//   - Fundamental sine
//   - Inharmonic partial  (2.76× fundamental → bell "clang")
//   - Noise transient     (attack "ting")
// ═══════════════════════════════════════════════════════════════
export function playCheckSound(): void {
  const ctx = getCtx();
  if (!ctx) return;

  const strikes = [
    { delay: 0,    f0: 880,  f1: 2426 },
    { delay: 0.17, f0: 1108, f1: 3057 },
  ];

  strikes.forEach(({ delay, f0, f1 }) => {
    const t = ctx.currentTime + delay;

    // Fundamental
    const fund = ctx.createOscillator();
    fund.type = 'sine';
    fund.frequency.setValueAtTime(f0, t);
    fund.frequency.exponentialRampToValueAtTime(f0 * 0.88, t + 0.30);
    const fEnv = ctx.createGain();
    fEnv.gain.setValueAtTime(0,    t);
    fEnv.gain.linearRampToValueAtTime(0.92, t + 0.008);
    fEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    fund.connect(fEnv);

    // Inharmonic partial
    const part = ctx.createOscillator();
    part.type = 'sine';
    part.frequency.setValueAtTime(f1, t);
    part.frequency.exponentialRampToValueAtTime(f1 * 0.92, t + 0.18);
    const pEnv = ctx.createGain();
    pEnv.gain.setValueAtTime(0,    t);
    pEnv.gain.linearRampToValueAtTime(0.33, t + 0.008);
    pEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
    part.connect(pEnv);

    // Attack transient
    const atk = noise(ctx, 0.018);
    const aBp = ctx.createBiquadFilter();
    aBp.type = 'bandpass'; aBp.frequency.value = f0 * 1.5; aBp.Q.value = 3.0;
    atk.connect(aBp);
    const aEnv = ctx.createGain();
    aEnv.gain.setValueAtTime(0,    t);
    aEnv.gain.linearRampToValueAtTime(0.48, t + 0.003);
    aEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.021);
    aBp.connect(aEnv);

    const mix = ctx.createGain(); mix.gain.value = 1;
    fEnv.connect(mix); pEnv.connect(mix); aEnv.connect(mix);
    route(ctx, mix, 1.95, true, 0.58);

    fund.start(t); fund.stop(t + 0.34);
    part.start(t); part.stop(t + 0.22);
    atk.start(t);  atk.stop(t + 0.022);
  });
}
