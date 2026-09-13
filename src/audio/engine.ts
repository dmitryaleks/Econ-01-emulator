/**
 * Main-thread side of the audio path: owns the AudioContext, benchmarks the netlist to pick a
 * solver rate the machine can actually sustain, and ships it to the worklet.
 */

import type { Netlist } from '../netlist/build.js';
import { topologyOf } from '../sim/mna.js';
import { Simulation } from '../sim/transient.js';
import workletUrl from './solver-worklet.ts?worker&url';
import type { FromWorklet } from './solver-worklet.js';

export interface EngineStatus {
  running: boolean;
  solverRate: number;
  /** True when the solver had to run below the context rate to keep up. */
  reduced: boolean;
  peak: number;
  station: string | null;
  tunedHz: number;
  strength: number;
  converged: boolean;
  /**
   * How fast the solver renders against the clock, smoothed: 1 when it keeps up. Below that the
   * audio device is starved and the sound breaks up.
   */
  pace: number;
}

/** Headroom factor: the machine must be this much faster than real time before we commit. */
const SAFETY = 3;
/** Share of each new pace reading taken into the smoothed pace. */
const PACE_SMOOTHING = 0.15;
/** Circuit time each benchmark runs before it starts timing, and then times. */
const WARMUP_SECONDS = 0.02;
const BENCH_SECONDS = 0.04;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;

  /** Master output level, separate from the emulated volume control. */
  setOutputLevel(v: number): void {
    if (this.gain) this.gain.gain.value = Math.min(Math.max(v, 0), 1);
  }
  private pending: Netlist | null = null;
  private divisor = 2;
  /** Topology the current divisor was benchmarked for. */
  private topology = '';

  readonly status: EngineStatus = {
    running: false,
    solverRate: 0,
    reduced: false,
    peak: 0,
    station: null,
    tunedHz: 0,
    strength: 0,
    converged: true,
    pace: 1,
  };
  private lastReport = 0;

  onStatus: ((s: EngineStatus) => void) | null = null;

  get contextState(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none';
  }

  /** Must be called from a user gesture. */
  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.status.running = true;
      this.emit();
      return;
    }

    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule(workletUrl);

    const node = new AudioWorkletNode(ctx, 'econ01-solver', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node.port.onmessage = (ev: MessageEvent<FromWorklet>) => {
      const m = ev.data;
      if (m.type !== 'status') return;
      const now = performance.now();
      if (this.lastReport > 0) {
        const pace = Math.min(1, (m.rendered * 1000) / Math.max(now - this.lastReport, 1e-3));
        this.status.pace += PACE_SMOOTHING * (pace - this.status.pace);
      }
      this.lastReport = now;
      this.status.solverRate = m.solverRate;
      this.status.reduced = m.solverRate < ctx.sampleRate;
      this.status.peak = m.peak;
      this.status.station = m.station;
      this.status.tunedHz = m.tunedHz;
      this.status.strength = m.strength;
      this.status.converged = m.converged;
      this.emit();
    };

    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    node.connect(gain).connect(ctx.destination);

    this.ctx = ctx;
    this.node = node;
    this.gain = gain;
    this.status.running = true;

    if (this.pending) this.setNetlist(this.pending);
    this.emit();
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
    this.status.running = false;
    this.emit();
  }

  /** Hand a fresh netlist to the solver, picking a rate this machine can sustain. */
  setNetlist(netlist: Netlist): void {
    this.pending = netlist;
    if (!this.node || !this.ctx) return;
    // Only benchmark when the circuit itself changed; a button press or a knob keeps the rate.
    const topology = topologyOf(netlist);
    if (topology !== this.topology) {
      this.divisor = this.chooseDivisor(netlist, this.ctx.sampleRate);
      this.topology = topology;
    }
    // `contactNet` is a UI concern and does not need to cross the thread boundary.
    const lean: Netlist = { ...netlist, contactNet: new Map() };
    this.node.port.postMessage({ type: 'netlist', netlist: lean, divisor: this.divisor });
  }

  /**
   * Short benchmark of the real netlist at each solver rate in turn until one keeps up with
   * SAFETY to spare, timed with the кнопка up and, if there is one, held, whichever costs more.
   * Costs some tens of milliseconds and saves the worklet from missing deadlines, which would be
   * audible as clicks. Each rate is timed on its own: a multivibrator's switching edges cost the
   * same however slowly the solver runs between them. When none keeps up, the cheapest is taken,
   * and the search stops once halving the rate no longer pays.
   */
  private chooseDivisor(netlist: Netlist, contextRate: number): number {
    const key = (e: Netlist['elements'][number]): boolean =>
      e.kind === 'R' && e.name.startsWith('block_026@');
    const states = [netlist];
    if (netlist.elements.some(key)) {
      const up = (ohms: number): Netlist => ({
        ...netlist,
        elements: netlist.elements.map((e) => (key(e) ? { ...e, ohms } : e)),
      });
      states.splice(0, 1, up(1e12), up(0.01));
    }
    let cheapest = 8;
    let lowest = Infinity;
    for (const d of [1, 2, 4, 8]) {
      const rate = contextRate / d;
      let cost = 0;
      for (const state of states) {
        const probe = new Simulation(state, rate);
        probe.run(Math.round(rate * WARMUP_SECONDS)); // past the start and the JIT's first passes
        const t0 = performance.now();
        probe.run(Math.round(rate * BENCH_SECONDS));
        cost = Math.max(cost, (performance.now() - t0) / 1000 / BENCH_SECONDS);
      }
      if (cost * SAFETY <= 1) return d;
      // Halving the rate saved little: the edges dominate, and lower rates only lose accuracy.
      if (cost > 0.8 * lowest) break;
      if (cost < lowest) {
        lowest = cost;
        cheapest = d;
      }
    }
    return cheapest;
  }

  private emit(): void {
    this.onStatus?.(this.status);
  }
}
