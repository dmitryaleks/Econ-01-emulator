/** Transient driver: wraps a Circuit, runs it at a sample rate and produces the audio signal. */

import type { Netlist } from '../netlist/build.js';
import { Circuit } from './mna.js';
import { RadioBlock, type RadioState } from './radio.js';

export interface RunResult {
  samples: Float64Array;
  /** Fraction of steps where Newton failed to converge. */
  failureRate: number;
}

export class Simulation {
  readonly circuit: Circuit;
  private netlist: Netlist;
  private readonly radio: RadioBlock;
  private failures = 0;
  private steps = 0;

  constructor(netlist: Netlist, sampleRate: number) {
    this.netlist = netlist;
    this.circuit = new Circuit(netlist);
    this.circuit.setTimestep(1 / sampleRate);
    this.radio = new RadioBlock(netlist, sampleRate);
    // Tune from the C10 value already baked into the netlist by the tuning knob.
    const c10 = netlist.elements.find((e) => e.name === 'C10');
    this.radio.retune(c10 && c10.kind === 'C' ? c10.farads : 0);
    this.circuit.dcOperatingPoint();
    this.circuit.dischargeModules(netlist);
  }

  /** Radio tuning state, for the UI dial. */
  get radioState(): RadioState {
    return this.radio.state;
  }

  /** Recompute the tuned frequency after the tuning knob moves. */
  retune(c10Farads: number): void {
    this.radio.retune(c10Farads);
  }

  /**
   * Carry on with new element values when only values changed (a button, the volume, the
   * tuning), keeping the circuit's state. False when the netlist's topology differs and a new
   * Simulation is needed.
   */
  update(netlist: Netlist): boolean {
    if (!this.circuit.updateValues(netlist)) return false;
    this.netlist = netlist;
    const c10 = netlist.elements.find((e) => e.name === 'C10');
    this.radio.retune(c10 && c10.kind === 'C' ? c10.farads : 0);
    return true;
  }

  /** One step; returns the loudspeaker voltage. */
  sample(): number {
    this.radio.inject(this.circuit);
    this.circuit.step();
    this.steps++;
    if (!this.circuit.converged) this.failures++;
    return (
      this.circuit.voltageAt(this.netlist.speaker.p) -
      this.circuit.voltageAt(this.netlist.speaker.n)
    );
  }

  /** Fill a buffer, for tests and for the audio worklet. */
  render(out: Float32Array): void {
    for (let i = 0; i < out.length; i++) out[i] = this.sample();
  }

  run(count: number): RunResult {
    const samples = new Float64Array(count);
    for (let i = 0; i < count; i++) samples[i] = this.sample();
    return { samples, failureRate: this.steps ? this.failures / this.steps : 0 };
  }
}

/** RMS of a signal, ignoring its DC component. */
export function rms(samples: ArrayLike<number>): number {
  let mean = 0;
  for (let i = 0; i < samples.length; i++) mean += samples[i]!;
  mean /= samples.length || 1;
  let acc = 0;
  for (let i = 0; i < samples.length; i++) {
    const d = samples[i]! - mean;
    acc += d * d;
  }
  return Math.sqrt(acc / (samples.length || 1));
}

/**
 * Dominant frequency by zero crossings of the mean-removed signal. Good enough for asserting
 * that a multivibrator runs at roughly the right pitch, and cheap.
 */
export function dominantFrequency(samples: ArrayLike<number>, sampleRate: number): number {
  let mean = 0;
  for (let i = 0; i < samples.length; i++) mean += samples[i]!;
  mean /= samples.length || 1;

  const amp = rms(samples);
  if (amp < 1e-6) return 0;
  const hysteresis = amp * 0.25;

  let crossings = 0;
  let first = -1;
  let last = -1;
  let above = samples[0]! - mean > 0;
  for (let i = 1; i < samples.length; i++) {
    const v = samples[i]! - mean;
    if (above && v < -hysteresis) {
      above = false;
      crossings++;
      if (first < 0) first = i;
      last = i;
    } else if (!above && v > hysteresis) {
      above = true;
      crossings++;
      if (first < 0) first = i;
      last = i;
    }
  }
  if (crossings < 2 || last <= first) return 0;
  const periods = (crossings - 1) / 2;
  return (periods * sampleRate) / (last - first);
}
