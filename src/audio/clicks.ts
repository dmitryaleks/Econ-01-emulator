/**
 * Mechanical sounds for handling modules: the snap of a cube seating in its socket and the tick of
 * a detent as it turns. They are synthesised, so there are no sound files, with a little random
 * variation so that a run of clicks does not sound mechanical in the wrong way. They play on their
 * own audio context, whether or not the constructor's own sound is switched on.
 */

export type ClickKind = 'seat' | 'turn';

/** Output level of the clicks. */
const LEVEL = 0.55;

export class ClickSounds {
  private ctx: AudioContext | null = null;

  /** Play a click. Must follow a user gesture the first time, which creates the context. */
  play(kind: ClickKind): void {
    try {
      const ctx = (this.ctx ??= new AudioContext({ latencyHint: 'interactive' }));
      if (ctx.state === 'suspended') void ctx.resume();
      const fs = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, Math.round(fs * (kind === 'seat' ? 0.14 : 0.07)), fs);
      const out = buffer.getChannelData(0);
      if (kind === 'seat') seat(out, fs);
      else turn(out, fs);
      // Soft-limit, and fade the last few milliseconds so the buffer never ends on a step.
      const fade = Math.round(fs * 0.01);
      for (let i = 0; i < out.length; i++) {
        const tail = Math.min(1, (out.length - 1 - i) / fade);
        out[i] = Math.tanh(out[i]!) * tail;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = LEVEL;
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch {
      // No audio available: handling modules stays silent.
    }
  }
}

/**
 * A cube going into its socket: its shoulders scrape past the frame, the sprung contact strips
 * snap onto its pads, and the body lands on the base.
 */
function seat(out: Float32Array, fs: number): void {
  noiseBand(out, fs, 0, 0.008, 2300 * vary(0.08), 1.5, 0.35);
  const snap = 0.016 + Math.random() * 0.006;
  tick(out, fs, snap, 0.0025, 1.1);
  ring(out, fs, snap, 2150 * vary(0.04), 0.02, 0.35);
  ring(out, fs, snap, 3480 * vary(0.04), 0.013, 0.22);
  ring(out, fs, snap, 6100 * vary(0.05), 0.006, 0.12);
  thock(out, fs, snap + 0.001, 175 * vary(0.06), 95, 0.018, 0.75);
}

/** A cube turning a quarter in place: a crisp detent tick through a smaller body. */
function turn(out: Float32Array, fs: number): void {
  tick(out, fs, 0, 0.0018, 0.8);
  ring(out, fs, 0, 2850 * vary(0.05), 0.011, 0.28);
  ring(out, fs, 0, 5300 * vary(0.05), 0.006, 0.14);
  thock(out, fs, 0.0005, 260 * vary(0.06), 170, 0.016, 0.3);
}

/** 1 ± up to `spread`, at random. */
function vary(spread: number): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

/** A sharp broadband click: differentiated white noise under a fast exponential decay. */
function tick(out: Float32Array, fs: number, at: number, decay: number, gain: number): void {
  const start = Math.round(at * fs);
  const n = Math.min(out.length - start, Math.round(decay * 8 * fs));
  let last = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    out[start + i]! += gain * (white - last) * Math.exp(-i / (decay * fs));
    last = white;
  }
}

/** A damped sine: the plastic and the contact springs ringing after the click. */
function ring(
  out: Float32Array, fs: number, at: number, hz: number, decay: number, gain: number,
): void {
  const start = Math.round(at * fs);
  const n = Math.min(out.length - start, Math.round(decay * 8 * fs));
  const w = (2 * Math.PI * hz) / fs;
  for (let i = 0; i < n; i++) {
    out[start + i]! += gain * Math.sin(w * i) * Math.exp(-i / (decay * fs));
  }
}

/** A low knock whose pitch falls as it dies: the body meeting the base. */
function thock(
  out: Float32Array, fs: number, at: number, fromHz: number, toHz: number, decay: number,
  gain: number,
): void {
  const start = Math.round(at * fs);
  const n = Math.min(out.length - start, Math.round(decay * 6 * fs));
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const env = Math.exp(-i / (decay * fs));
    const hz = toHz + (fromHz - toHz) * env;
    phase += (2 * Math.PI * hz) / fs;
    out[start + i]! += gain * Math.sin(phase) * env;
  }
}

/** A burst of noise through a two-pole resonator: a short scrape centred on `hz`. */
function noiseBand(
  out: Float32Array, fs: number, at: number, length: number, hz: number, q: number, gain: number,
): void {
  const start = Math.round(at * fs);
  const n = Math.min(out.length - start, Math.round(length * fs));
  const w = (2 * Math.PI * hz) / fs;
  const r = Math.exp(-w / (2 * q));
  const a1 = 2 * r * Math.cos(w);
  const a2 = -r * r;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    const env = Math.sin((Math.PI * i) / n);
    const y = (1 - r) * (Math.random() * 2 - 1) + a1 * y1 + a2 * y2;
    y2 = y1;
    y1 = y;
    out[start + i]! += gain * 4 * y * env;
  }
}
