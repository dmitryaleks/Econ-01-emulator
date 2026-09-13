/**
 * A true transient of the board's RF piece, for the few cycles of an oscillator's burst.
 *
 * The envelope model (sim/rf.ts) holds while an antenna oscillator's transistor is cut off or
 * barely conducting: the tank rings down, the base recovers, a small swing grows. It cannot
 * follow the burst itself. A squegging oscillator's tank grows many-fold within a cycle or two,
 * its collector-base junction then clips the swing and dumps the tank's energy into the base
 * capacitor within a cycle, and the base ends up pumped far below where a steady oscillation
 * would sit. Averaged over a cycle, that race settles into a steady oscillation the real circuit
 * never holds. So while the transistor drives the tank, the piece is solved cycle by cycle, at
 * STEPS_PER_CYCLE steps a cycle, with second-order backward differences: backward Euler would
 * damp the tank by itself.
 *
 * The rest of the board stays with the audio half. The quiet rails the piece touches are held at
 * the audio half's voltages, and the audio half takes the junctions' currents averaged over its
 * step, so the charge the burst moves reaches it. The currents pass through a moving average one
 * RF cycle long first, which keeps every coulomb but none of the carrier: summed over an audio
 * step that is not a whole number of cycles, the carrier would otherwise beat into the audio.
 *
 * An oscillator that settles into a steady swing instead of squegging is not run for ever: once
 * the swing has held for STEADY_CYCLES the envelope takes over again, which is exact for a steady
 * oscillation, and looks ahead with the transient now and then in case it starts to squeg
 * (see mna.ts).
 */

import { CORE_Q } from '../model/antenna.js';
import { Matrix } from './matrix.js';
import { VT, limitJunction } from './models.js';
import type { IndState } from './mna.js';
import type { RfNetwork, RfTopology } from './rf.js';

const STEPS_PER_CYCLE = 32;
/** Conductance holding a quiet rail at its voltage. */
const HOLD = 1e4;
const RELTOL = 1e-5;
const ABSTOL = 1e-8;
const MAX_ITERATIONS = 50;
/**
 * A junction is linearised no further than this many thermal voltages above its critical voltage,
 * where it already carries amps. A burst starts from the envelope's swing laid over the circuit,
 * which can leave a junction forward-biased by volts; Newton would walk that back down a thermal
 * voltage an iteration and run out of iterations first.
 */
const JUNCTION_HEADROOM = 12;
/** Swing a burst starts from at the least, volts peak: the tank's noise, and above the solve's. */
const SEED_VOLTS = 1e-3;
/**
 * A swing that stays within this fraction of itself for STEADY_CYCLES running is steady; the
 * cycle's sampled peak alone wanders by half a percent as the carrier slides past the steps.
 */
const STEADY_SPREAD = 0.02;
const STEADY_CYCLES = 64;

export class RfBurst {
  private readonly t: RfTopology;
  private readonly nets: number;
  private readonly size: number;
  private readonly m: Matrix;
  private readonly x: Float64Array;
  private readonly xPrev: Float64Array;
  private readonly held: Float64Array;
  private readonly capV1: Float64Array;
  private readonly capV2: Float64Array;
  private readonly indI1: Float64Array;
  private readonly indI2: Float64Array;
  private readonly indBranch: Int32Array;
  private readonly indSeries: Float64Array;
  private readonly indMutual: Array<Array<{ j: number; henries: number }>>;
  private readonly srcBranch: Int32Array;
  private readonly srcVolts: Float64Array;
  private readonly limits: Float64Array;
  /** The linear elements' matrix for this burst's step, and their right-hand side this step. */
  private readonly linear: Float64Array;
  private readonly linearRhs: Float64Array;

  private h = 0;
  /** Set by `limit` while stamping. */
  private limited = false;
  private debt = 0;
  private quietRatio = 1;
  private inCycle = 0;
  private cycleMax = -Infinity;
  private cycleMin = Infinity;
  private lastCycle = 0;
  private quietCycles = 0;
  private steadyCycles = 0;
  private steadyLow = 0;
  private steadyHigh = 0;
  /** The last cycle of junction currents, one channel per BJT base, BJT collector and diode. */
  private readonly window: Float64Array;
  private readonly windowSum: Float64Array;
  private windowAt = 0;

  /** Tank amplitude over the last whole cycle, volts peak. */
  amplitude = 0;
  /** Whether every step of the last `run` converged. */
  converged = true;
  /** Junction currents averaged over the last `run`: into each BJT's base and collector, and
   * into each diode's anode. */
  readonly base: Float64Array;
  readonly collector: Float64Array;
  readonly anode: Float64Array;

  constructor(private readonly rf: RfNetwork) {
    const t = rf.topology;
    this.t = t;
    this.nets = t.nets.length;
    let next = this.nets + t.held.length;
    this.indBranch = Int32Array.from(t.inds, () => next++);
    this.srcBranch = Int32Array.from(t.srcs, () => next++);
    this.size = Math.max(next, 1);
    this.m = new Matrix(this.size);
    this.x = new Float64Array(this.size);
    this.xPrev = new Float64Array(this.size);
    this.held = new Float64Array(t.held.length);
    this.capV1 = new Float64Array(t.caps.length);
    this.capV2 = new Float64Array(t.caps.length);
    this.indI1 = new Float64Array(t.inds.length);
    this.indI2 = new Float64Array(t.inds.length);
    this.indSeries = new Float64Array(t.inds.length);
    const slot = new Map(t.inds.map((l, k) => [l.st, k]));
    this.indMutual = t.inds.map((l) =>
      l.st.mutual.flatMap(({ other, henries }) => {
        const j = slot.get(other);
        return j === undefined ? [] : [{ j, henries }];
      }),
    );
    this.srcVolts = new Float64Array(t.srcs.length);
    this.limits = new Float64Array(t.bjts.length * 3 + t.diodes.length);
    this.linear = new Float64Array(this.size * this.size);
    this.linearRhs = new Float64Array(this.size);
    this.base = new Float64Array(t.bjts.length);
    this.collector = new Float64Array(t.bjts.length);
    this.anode = new Float64Array(t.diodes.length);
    const channels = 2 * t.bjts.length + t.diodes.length;
    this.window = new Float64Array(channels * STEPS_PER_CYCLE);
    this.windowSum = new Float64Array(channels);
  }

  /** The transient has seen the tank fall at least half as fast as it would unaided. */
  get settled(): boolean {
    return this.quietCycles >= 2;
  }

  /** The swing has held steady for STEADY_CYCLES. */
  get steady(): boolean {
    return this.steadyCycles >= STEADY_CYCLES;
  }

  /**
   * Run the transient ahead from the audio half's state for a number of cycles without feeding
   * anything back, and report whether the swing collapsed or ran away: an oscillator the envelope
   * takes for steady that has in fact begun to squeg.
   */
  looksUnsteady(
    volts: (net: string) => number,
    amps: (element: IndState | string) => number,
    sourceVolts: (name: string) => number,
    amplitude: number,
    cycles: number,
  ): boolean {
    this.start(volts, amps, sourceVolts, amplitude);
    const from = this.amplitude;
    const period = STEPS_PER_CYCLE * this.h;
    for (let i = 0; i < cycles; i++) {
      this.run(period, volts);
      if (this.settled || this.amplitude > 2 * from) return true;
    }
    return false;
  }

  /**
   * Start from the audio half's state with the mode ringing at `amplitude` volts peak: node
   * voltages and branch currents are their audio-half values plus the mode's, at the phase where
   * the tank voltage peaks.
   *
   * @param volts a net's voltage in the audio half
   * @param amps an inductor's or a source's current in the audio half
   */
  start(
    volts: (net: string) => number,
    amps: (element: IndState | string) => number,
    sourceVolts: (name: string) => number,
    amplitude: number,
  ): void {
    const t = this.t;
    const w = this.rf.omega;
    this.h = (2 * Math.PI) / w / STEPS_PER_CYCLE;
    const c = Math.cos(w * this.h);
    const s = Math.sin(w * this.h);
    const a = Math.max(amplitude, SEED_VOLTS);
    /** A quantity's value now and one step earlier. */
    const ring = (dc: number, i: number): [number, number] => {
      const u = this.rf.mode(i);
      return [dc + a * u.re, dc + a * (u.re * c + u.im * s)];
    };

    const now = new Float64Array(this.size);
    const before = new Float64Array(this.size);
    for (let i = 0; i < this.nets; i++) [now[i], before[i]] = ring(volts(t.nets[i]!), i);
    for (let k = 0; k < t.held.length; k++) {
      this.held[k] = volts(t.held[k]!);
      now[this.nets + k] = before[this.nets + k] = this.held[k]!;
    }
    const v = (arr: Float64Array, i: number): number => (i < 0 ? 0 : arr[i]!);
    t.caps.forEach((cap, k) => {
      this.capV1[k] = v(now, cap.a) - v(now, cap.b);
      this.capV2[k] = v(before, cap.a) - v(before, cap.b);
    });
    t.inds.forEach((l, k) => {
      [this.indI1[k], this.indI2[k]] = ring(amps(l.st), l.mode);
      this.indSeries[k] = l.st.esr + (w * l.st.henries) / CORE_Q;
      now[this.indBranch[k]!] = this.indI1[k]!;
    });
    t.srcs.forEach((src, k) => {
      this.srcVolts[k] = sourceVolts(src.name);
      now[this.srcBranch[k]!] = ring(amps(src.name), src.mode)[0];
    });
    this.x.set(now);

    let j = 0;
    for (const q of t.bjts) {
      const sg = q.st.sign;
      this.limits[j++] = sg * (v(now, q.b) - v(now, q.e));
      this.limits[j++] = sg * (v(now, q.b) - v(now, q.c));
      this.limits[j++] = sg * (v(now, q.e) - v(now, q.b)) - q.st.bv;
    }
    for (const d of t.diodes) this.limits[j++] = v(now, d.a) - v(now, d.k);

    this.stampLinear();
    this.debt = 0;
    this.quietRatio = Math.exp(0.5 * this.rf.passiveRate() * (2 * Math.PI) / w);
    this.inCycle = 0;
    this.cycleMax = -Infinity;
    this.cycleMin = Infinity;
    this.lastCycle = a;
    this.amplitude = a;
    this.quietCycles = 0;
    this.steadyCycles = 0;
    this.window.fill(0);
    this.windowSum.fill(0);
    this.windowAt = 0;
  }

  /**
   * Advance by `duration` seconds with the quiet rails at the audio half's voltages, or until the
   * tank has settled if that comes first, leaving the junction currents averaged over the time
   * covered. Returns that time; `converged` says whether every step converged.
   */
  run(duration: number, volts: (net: string) => number): number {
    const t = this.t;
    for (let k = 0; k < t.held.length; k++) this.held[k] = volts(t.held[k]!);
    this.base.fill(0);
    this.collector.fill(0);
    this.anode.fill(0);

    this.converged = true;
    let steps = 0;
    this.debt += duration;
    while (this.debt > 0.5 * this.h) {
      this.stampHistory();
      if (!this.newton()) this.converged = false;
      this.commit();
      this.accumulate();
      this.track();
      this.debt -= this.h;
      steps++;
      // A burst is a few cycles; a slow audio step can hold dozens. Stop where it ends.
      if (this.settled) {
        this.debt = 0;
        break;
      }
    }
    const elapsed = this.settled ? steps * this.h : duration;
    // Charge per second of what was covered, whatever whole number of steps covered it.
    const scale = steps > 0 ? this.h / elapsed : 0;
    for (let k = 0; k < t.bjts.length; k++) {
      this.base[k]! *= scale;
      this.collector[k]! *= scale;
    }
    for (let k = 0; k < t.diodes.length; k++) this.anode[k]! *= scale;
    return elapsed;
  }

  private v(i: number): number {
    return i < 0 ? 0 : this.x[i]!;
  }

  private newton(): boolean {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      this.xPrev.set(this.x);
      this.limited = false;
      this.stamp();
      const sol = this.m.solve();
      if (!sol) return false;
      this.x.set(sol);
      if (iter === 0) continue;
      let done = true;
      for (let i = 0; i < this.size; i++) {
        if (Math.abs(this.x[i]! - this.xPrev[i]!) > RELTOL * Math.abs(this.x[i]!) + ABSTOL) {
          done = false;
          break;
        }
      }
      if (done && !this.limited) return true;
    }
    return false;
  }

  /**
   * Limit a junction voltage between iterations, noting when it bit: an iteration whose junctions
   * were held back has not converged, however little the node voltages moved — a junction nothing
   * else leans on can otherwise be left far from its linearisation, carrying a current the
   * solution never had.
   */
  private limit(vnew: number, vold: number, vt: number, vcrit: number): number {
    const v = Math.min(limitJunction(vnew, vold, vt, vcrit), vcrit + JUNCTION_HEADROOM * vt);
    if (v !== vnew) this.limited = true;
    return v;
  }

  /** Resistors, capacitors, windings and held rails: the same matrix every step of a burst. */
  private stampLinear(): void {
    const { m, t, h } = this;
    m.clear();
    for (let i = 0; i < this.nets; i++) m.add(i, i, 1e-12);
    for (let k = 0; k < t.held.length; k++) m.add(this.nets + k, this.nets + k, HOLD);
    for (const r of t.res) conductance(m, r.a, r.b, r.st.g);
    // Second-order backward differences: i = C·(3v − 4v₁ + v₂)/2h.
    for (const cap of t.caps) conductance(m, cap.a, cap.b, (1.5 * cap.st.farads) / h);
    for (let k = 0; k < t.inds.length; k++) {
      const l = t.inds[k]!;
      const br = this.indBranch[k]!;
      m.add(l.a, br, 1);
      m.add(l.b, br, -1);
      m.add(br, l.a, 1);
      m.add(br, l.b, -1);
      m.add(br, br, -((1.5 * l.st.henries) / h + this.indSeries[k]!));
      for (const { j, henries } of this.indMutual[k]!) {
        m.add(br, this.indBranch[j]!, (-1.5 * henries) / h);
      }
    }
    for (let k = 0; k < t.srcs.length; k++) {
      const src = t.srcs[k]!;
      const br = this.srcBranch[k]!;
      m.add(src.p, br, 1);
      m.add(src.n, br, -1);
      m.add(br, src.p, 1);
      m.add(br, src.n, -1);
    }
    this.linear.set(m.a);
  }

  /** The linear elements' right-hand side for the coming step: their history, rails, sources. */
  private stampHistory(): void {
    const { t, h } = this;
    const rhs = this.linearRhs;
    rhs.fill(0);
    for (let k = 0; k < t.held.length; k++) rhs[this.nets + k] = HOLD * this.held[k]!;
    for (let k = 0; k < t.caps.length; k++) {
      const cap = t.caps[k]!;
      const ieq = (cap.st.farads / h) * (2 * this.capV1[k]! - 0.5 * this.capV2[k]!);
      if (cap.a >= 0) rhs[cap.a]! += ieq;
      if (cap.b >= 0) rhs[cap.b]! -= ieq;
    }
    const { indI1, indI2 } = this;
    for (let k = 0; k < t.inds.length; k++) {
      let value = (-t.inds[k]!.st.henries * (2 * indI1[k]! - 0.5 * indI2[k]!)) / h;
      const mutual = this.indMutual[k]!;
      for (let m = 0; m < mutual.length; m++) {
        const { j, henries } = mutual[m]!;
        value -= (henries * (2 * indI1[j]! - 0.5 * indI2[j]!)) / h;
      }
      rhs[this.indBranch[k]!] = value;
    }
    for (let k = 0; k < t.srcs.length; k++) rhs[this.srcBranch[k]!] = this.srcVolts[k]!;
  }

  /** The junctions, linearised about the present iterate, over the linear part. */
  private stamp(): void {
    const { m, t } = this;
    m.a.set(this.linear);
    m.b.set(this.linearRhs);

    let j = 0;
    for (const q of t.bjts) {
      const st = q.st;
      const s = st.sign;
      const vbe = this.limit(s * (this.v(q.b) - this.v(q.e)), this.limits[j]!, VT, st.vcrit);
      const vbc = this.limit(s * (this.v(q.b) - this.v(q.c)), this.limits[j + 1]!, VT, st.vcrit);
      const vbd = this.limit(
        s * (this.v(q.e) - this.v(q.b)) - st.bv, this.limits[j + 2]!, VT, st.vcritBd,
      );
      this.limits[j++] = vbe;
      this.limits[j++] = vbc;
      this.limits[j++] = vbd;

      const eb = Math.exp(Math.min(vbe / VT, 60));
      const ec = Math.exp(Math.min(vbc / VT, 60));
      const gpi = (st.is / (st.bf * VT)) * eb + 1e-12;
      const gmu = (st.is / (st.br * VT)) * ec + 1e-12;
      const gm = (st.is / VT) * eb;
      const go = (st.is / VT) * ec;
      const ib = (st.is * (eb - 1)) / st.bf + (st.is * (ec - 1)) / st.br;
      const ic = st.is * (eb - 1) - st.is * (ec - 1) * (1 + 1 / st.br);
      const ieqB = ib - gpi * vbe - gmu * vbc;
      const ieqC = ic - gm * vbe + (go + gmu) * vbc;
      m.add(q.b, q.b, gpi + gmu);
      m.add(q.b, q.e, -gpi);
      m.add(q.b, q.c, -gmu);
      m.add(q.c, q.b, gm - go - gmu);
      m.add(q.c, q.e, -gm);
      m.add(q.c, q.c, go + gmu);
      m.add(q.e, q.b, -gpi - gm + go);
      m.add(q.e, q.e, gpi + gm);
      m.add(q.e, q.c, -go);
      m.addRhs(q.b, -s * ieqB);
      m.addRhs(q.c, -s * ieqC);
      m.addRhs(q.e, s * (ieqB + ieqC));

      const ex = Math.exp(Math.min(vbd / VT, 60));
      const gbd = (st.isBd / VT) * ex;
      const ieqBd = st.isBd * ex - gbd * (vbd + st.bv);
      conductance(m, q.e, q.b, gbd);
      m.addRhs(q.e, -s * ieqBd);
      m.addRhs(q.b, s * ieqBd);
    }
    for (const d of t.diodes) {
      const st = d.st;
      const vd = this.limit(this.v(d.a) - this.v(d.k), this.limits[j]!, st.nvt, st.vcrit);
      this.limits[j++] = vd;
      const ex = Math.exp(Math.min(vd / st.nvt, 60));
      const gd = (st.is / st.nvt) * ex + 1e-12;
      const ieq = st.is * (ex - 1) - gd * vd;
      conductance(m, d.a, d.k, gd);
      m.addRhs(d.a, -ieq);
      m.addRhs(d.k, ieq);
    }
  }

  private commit(): void {
    const t = this.t;

    for (let k = 0; k < t.caps.length; k++) {
      const cap = t.caps[k]!;
      this.capV2[k] = this.capV1[k]!;
      this.capV1[k] = this.v(cap.a) - this.v(cap.b);
    }
    for (let k = 0; k < t.inds.length; k++) {
      this.indI2[k] = this.indI1[k]!;
      this.indI1[k] = this.x[this.indBranch[k]!]!;
    }
  }

  /** Add this step's junction currents, evaluated at the solution and averaged over a cycle. */
  private accumulate(): void {
    const t = this.t;
    const at = this.windowAt * this.windowSum.length;
    let channel = 0;
    for (let k = 0; k < t.bjts.length; k++) {
      const q = t.bjts[k]!;
      const st = q.st;
      const s = st.sign;
      const eb = Math.exp(Math.min((s * (this.v(q.b) - this.v(q.e))) / VT, 60));
      const ec = Math.exp(Math.min((s * (this.v(q.b) - this.v(q.c))) / VT, 60));
      const bd = st.isBd * Math.exp(Math.min((s * (this.v(q.e) - this.v(q.b)) - st.bv) / VT, 60));
      const ib = s * ((st.is * (eb - 1)) / st.bf + (st.is * (ec - 1)) / st.br - bd);
      const ic = s * (st.is * (eb - 1) - st.is * (ec - 1) * (1 + 1 / st.br));
      this.base[k]! += this.smooth(at + channel, channel++, ib);
      this.collector[k]! += this.smooth(at + channel, channel++, ic);
    }
    for (let k = 0; k < t.diodes.length; k++) {
      const d = t.diodes[k]!;
      const st = d.st;
      const id = st.is * (Math.exp(Math.min((this.v(d.a) - this.v(d.k)) / st.nvt, 60)) - 1);
      this.anode[k]! += this.smooth(at + channel, channel++, id);
    }
    this.windowAt = (this.windowAt + 1) % STEPS_PER_CYCLE;
  }

  /** Put a current into its channel's window and return the window's mean. */
  private smooth(slot: number, channel: number, value: number): number {
    const old = this.window[slot]!;
    this.window[slot] = value;
    this.windowSum[channel]! += value - old;
    return this.windowSum[channel]! / STEPS_PER_CYCLE;
  }

  /** Measure the tank's swing cycle by cycle, and count cycles that fall at least half as fast as
   * the tank alone would. */
  private track(): void {
    const [a, b] = this.t.tank;
    const tank = this.v(a) - this.v(b);
    this.cycleMax = Math.max(this.cycleMax, tank);
    this.cycleMin = Math.min(this.cycleMin, tank);
    if (++this.inCycle < STEPS_PER_CYCLE) return;
    const swing = 0.5 * (this.cycleMax - this.cycleMin);
    this.quietCycles = swing <= this.lastCycle * this.quietRatio ? this.quietCycles + 1 : 0;
    this.steadyLow = Math.min(this.steadyLow, swing);
    this.steadyHigh = Math.max(this.steadyHigh, swing);
    if (this.steadyHigh - this.steadyLow > STEADY_SPREAD * this.steadyHigh) {
      this.steadyLow = this.steadyHigh = swing;
      this.steadyCycles = 0;
    }
    this.steadyCycles++;
    this.lastCycle = swing;
    this.amplitude = swing;
    this.inCycle = 0;
    this.cycleMax = -Infinity;
    this.cycleMin = Infinity;
  }
}

function conductance(m: Matrix, a: number, b: number, g: number): void {
  m.add(a, a, g);
  m.add(b, b, g);
  m.add(a, b, -g);
  m.add(b, a, -g);
}
