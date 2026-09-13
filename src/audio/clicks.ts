/**
 * Mechanical sounds for handling modules: a cube seating in its socket, turning a quarter in
 * place, and being pulled out. They are synthesised, so there are no sound files, with a little
 * random variation so a run of clicks does not repeat itself. They play on their own audio
 * context, whether or not the constructor's own sound is switched on.
 *
 * The cubes are hollow plastic, so the clicks are dull: noise through low, heavily damped
 * resonances rather than long, high rings, which would sound like metal.
 */

export type ClickKind = 'seat' | 'turn' | 'pull';

/** Output level of the clicks, and the gain into their soft limiter, kept out of distortion. */
const LEVEL = 0.75;
const DRIVE = 0.4;

const LENGTH: Record<ClickKind, number> = { seat: 0.12, turn: 0.06, pull: 0.06 };

export class ClickSounds {
  private ctx: AudioContext | null = null;

  /** Play a click. Must follow a user gesture the first time, which creates the context. */
  play(kind: ClickKind): void {
    try {
      const ctx = (this.ctx ??= new AudioContext({ latencyHint: 'interactive' }));
      if (ctx.state === 'suspended') void ctx.resume();
      const fs = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, Math.round(fs * LENGTH[kind]), fs);
      const out = buffer.getChannelData(0);
      if (kind === 'seat') seat(out, fs);
      else if (kind === 'turn') turn(out, fs);
      else pull(out, fs);
      // Soft-limit, and fade the last few milliseconds so the buffer never ends on a step.
      const fade = Math.round(fs * 0.01);
      for (let i = 0; i < out.length; i++) {
        const tail = Math.min(1, (out.length - 1 - i) / fade);
        out[i] = Math.tanh(DRIVE * out[i]!) * tail;
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
 * A cube going into its socket: its shoulders rub past the frame, then it snaps home against the
 * contact strips and its hollow body knocks on the base.
 */
function seat(out: Float32Array, fs: number): void {
  noise(out, fs, { at: 0, length: 0.012, hz: 1500 * vary(0.1), q: 1, gain: 0.12, shape: 'swell' });
  const snap = 0.017 + Math.random() * 0.006;
  noise(out, fs, {
    at: snap, length: 0.02, hz: 2100 * vary(0.06), q: 1.4, gain: 0.45, shape: 'decay', decay: 0.003,
  });
  ring(out, fs, snap, 1050 * vary(0.05), 0.007, 0.16);
  ring(out, fs, snap, 1600 * vary(0.05), 0.004, 0.08);
  thock(out, fs, snap + 0.001, 165 * vary(0.06), 95, 0.016, 0.25);
}

/** A cube turning a quarter in place: a short, dull tick over its detent. */
function turn(out: Float32Array, fs: number): void {
  noise(out, fs, {
    at: 0, length: 0.012, hz: 2400 * vary(0.06), q: 1.4, gain: 1.1, shape: 'decay', decay: 0.0018,
  });
  ring(out, fs, 0, 1250 * vary(0.05), 0.005, 0.35);
  thock(out, fs, 0.0005, 240 * vary(0.06), 170, 0.009, 0.3);
}

/**
 * A cube pulled out of its socket: the contact strips slide along its pads, rising as it comes
 * free, then let go with a crisp tick. Nothing lands, so there is no knock.
 */
function pull(out: Float32Array, fs: number): void {
  noise(out, fs, {
    at: 0, length: 0.022, hz: 2000 * vary(0.08), toHz: 3800 * vary(0.08), q: 3, gain: 0.25,
    shape: 'swell',
  });
  const release = 0.02 + Math.random() * 0.004;
  noise(out, fs, {
    at: release, length: 0.012, hz: 3000 * vary(0.06), q: 1.6, gain: 0.6,
    shape: 'decay', decay: 0.0015,
  });
  ring(out, fs, release, 1800 * vary(0.05), 0.003, 0.14);
}

/** 1 ± up to `spread`, at random. */
function vary(spread: number): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

/** A damped sine: the hollow body resonating for a moment after a click. */
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

/** A knock whose pitch glides from `fromHz` to `toHz` as it dies. */
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

interface NoiseBurst {
  at: number;
  length: number;
  /** Centre of the band, gliding to `toHz` over the burst if given. */
  hz: number;
  toHz?: number;
  q: number;
  gain: number;
  /** 'swell' rises and falls over the burst, a rub; 'decay' starts at once and dies, a click. */
  shape: 'swell' | 'decay';
  /** Time constant of the 'decay' shape, seconds. */
  decay?: number;
}

/** Noise through a two-pole resonator. */
function noise(out: Float32Array, fs: number, b: NoiseBurst): void {
  const start = Math.round(b.at * fs);
  const n = Math.min(out.length - start, Math.round(b.length * fs));
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    const hz = b.toHz === undefined ? b.hz : b.hz + ((b.toHz - b.hz) * i) / n;
    const w = (2 * Math.PI * hz) / fs;
    const r = Math.exp(-w / (2 * b.q));
    const y = (1 - r) * (Math.random() * 2 - 1) + 2 * r * Math.cos(w) * y1 - r * r * y2;
    y2 = y1;
    y1 = y;
    const env =
      b.shape === 'swell' ? Math.sin((Math.PI * i) / n) : Math.exp(-i / ((b.decay ?? 0.002) * fs));
    out[start + i]! += b.gain * 4 * y * env;
  }
}
