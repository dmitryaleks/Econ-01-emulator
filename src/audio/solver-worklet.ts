/// <reference lib="webworker" />
/**
 * The circuit solver *is* the audio source. This processor owns a Simulation and produces one
 * sample per solver step, interpolated up to the context sample rate when the solver runs
 * slower (SPEC.md §7.2, DEVPLAN phase 6).
 *
 * The solver rate is chosen by the main thread, which benchmarks the actual netlist before
 * handing it over — an AudioWorkletGlobalScope has no dependable clock of its own.
 */

import type { Netlist } from '../netlist/build.js';
import { Simulation } from '../sim/transient.js';

declare const sampleRate: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

export interface ToWorklet {
  type: 'netlist' | 'reset';
  netlist?: Netlist;
  /** Context rate divided by this is the solver rate. Power of two. */
  divisor?: number;
}

export interface FromWorklet {
  type: 'status';
  solverRate: number;
  peak: number;
  station: string | null;
  tunedHz: number;
  strength: number;
  converged: boolean;
}

const REPORT_EVERY = 16; // render quanta, ~43 ms at 48 kHz

class SolverProcessor extends AudioWorkletProcessor {
  private sim: Simulation | null = null;
  private netlist: Netlist | null = null;
  private divisor = 2;
  private phase = 0;
  private prev = 0;
  private next = 0;
  private peak = 0;
  private blocks = 0;

  constructor() {
    super();
    this.port.onmessage = (ev: MessageEvent<ToWorklet>) => {
      const msg = ev.data;
      const divisorChanged = msg.divisor !== undefined && msg.divisor !== this.divisor;
      if (msg.divisor) this.divisor = msg.divisor;
      if (msg.type === 'netlist' && msg.netlist) {
        this.netlist = msg.netlist;
        // A button, the volume or the tuning only change values: keep the running circuit,
        // so capacitors stay charged across a press.
        if (!divisorChanged && this.sim?.update(msg.netlist)) return;
      }
      this.rebuild();
    };
  }

  private rebuild(): void {
    if (!this.netlist) return;
    this.sim = new Simulation(this.netlist, sampleRate / this.divisor);
    this.phase = 0;
    this.prev = 0;
    this.next = 0;
    this.peak = 0;
  }

  override process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]?.[0];
    if (!out) return true;

    const sim = this.sim;
    if (!sim) {
      out.fill(0);
      return true;
    }

    const inv = 1 / this.divisor;
    for (let i = 0; i < out.length; i++) {
      if (this.phase <= 0) {
        this.prev = this.next;
        this.next = sim.sample();
        this.phase = this.divisor;
      }
      const t = 1 - this.phase * inv;
      this.phase--;

      const s = softClip((this.prev + (this.next - this.prev) * t) * 0.25);
      out[i] = s;
      const a = s < 0 ? -s : s;
      if (a > this.peak) this.peak = a;
    }

    if (++this.blocks % REPORT_EVERY === 0) {
      const st = sim.radioState;
      const msg: FromWorklet = {
        type: 'status',
        solverRate: sampleRate / this.divisor,
        peak: this.peak,
        station: st.station ? st.station.name : null,
        tunedHz: st.tunedHz,
        strength: st.strength,
        converged: sim.circuit.converged,
      };
      this.port.postMessage(msg);
      this.peak = 0;
    }
    return true;
  }
}

/** Gentle limiting, the way a 0,5 W paper cone would refuse to go louder. */
function softClip(x: number): number {
  return Math.tanh(x);
}

registerProcessor('econ01-solver', SolverProcessor);
