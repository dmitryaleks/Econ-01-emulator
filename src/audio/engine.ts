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
}

/** Headroom factor: the machine must be this much faster than real time before we commit. */
const SAFETY = 3;

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
  };

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
   * Short benchmark of the real netlist. Costs a few milliseconds and saves the worklet from
   * ever missing a deadline, which would be audible as a click.
   */
  private chooseDivisor(netlist: Netlist, contextRate: number): number {
    const probe = new Simulation(netlist, contextRate);
    probe.run(1500); // let the JIT settle before timing anything
    const n = 3000;
    const t0 = performance.now();
    probe.run(n);
    const stepsPerSecond = (n / (performance.now() - t0)) * 1000;

    for (const d of [1, 2, 4, 8]) {
      if (contextRate / d <= stepsPerSecond / SAFETY) return d;
    }
    return 8;
  }

  private emit(): void {
    this.onStatus?.(this.status);
  }
}
