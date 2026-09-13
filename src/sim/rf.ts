/**
 * The radio-frequency half of the solver. Every oscillator and receiver the kit builds around the
 * magnetic antenna works at a few hundred kilohertz, far above the audio step; what you hear is
 * the audio-rate consequence — how an oscillator starts, chokes and restarts, or a detector's
 * rectified envelope. So the board is solved on two time scales together.
 *
 * The antenna's tank is treated as one resonant mode. At its resonance ω0 an AC solve of the
 * passive network (junctions left out) gives the mode's shape — the RF voltage at every node
 * per volt across the tank — its stored energy W = w·A² and its losses P = ½·G·A², for a tank
 * amplitude A (volts peak). The tank then obeys the energy balance
 *
 *     dW/dt = −P_losses − P_junctions,   i.e.   d(ln A)/dt = σ = −(p + G/2) / (2w),
 *
 * with p the junctions' absorbed RF power per volt². Each junction's contribution comes from
 * describing functions, exact for an exponential junction under a sinusoid:
 * exp((V0 + a·Vt·cos θ)/Vt) = exp(V0/Vt)·(I0(a) + 2·I1(a)·cos θ + …). A transistor with positive
 * feedback absorbs negative power and the mode grows; as it grows its junctions rectify (I0),
 * which drags the audio-rate bias, and its collector saturates, which absorbs power — together
 * they limit or quench the oscillation.
 *
 * The junction currents depend on A through I0(a), and σ on the junction bias, so each audio step
 * searches for the ln A whose circuit solve agrees with it (see mna.ts).
 *
 * A station induces an EMF in the coupling winding L2; the network's own transfer function to
 * the tank at the station's carrier sets how much of it the tank holds, which is what tuning
 * does. That forced amplitude adds to the junctions' swing, so a detector rectifies its
 * modulation. Higher harmonics, and beats between a station and a self-oscillation, are left out.
 */

import { CORE_Q } from '../model/antenna.js';
import type { Netlist, NlElement } from '../netlist/build.js';
import { besselGain, besselI0e } from './bessel.js';
import { ComplexMatrix } from './complex-matrix.js';
import type { BjtState, CapState, DiodeState, IndState, ResState } from './mna.js';
import { VT } from './models.js';

/** ln of the amplitude floor, about the tank's thermal noise: an oscillator grows from here. */
export const LOG_FLOOR = Math.log(1e-6);
/** ln of the largest tank amplitude the solver allows, above anything the kit's 8,7 V reaches. */
export const LOG_CEIL = Math.log(60);
/** Largest exponent a junction evaluates: just short of double-precision overflow. */
const EXP_CAP = 700;

export type RfItem =
  | { el: NlElement & { kind: 'R' }; st: ResState }
  | { el: NlElement & { kind: 'C' }; st: CapState }
  | { el: NlElement & { kind: 'L' }; st: IndState }
  | { el: NlElement & { kind: 'D' }; st: DiodeState }
  | { el: NlElement & { kind: 'Q' }; st: BjtState }
  | { el: NlElement & { kind: 'V' }; st: null };

export interface Complex { re: number; im: number }
const ZERO: Complex = { re: 0, im: 0 };

interface RfBjt { b: number; c: number; e: number; st: BjtState; ub: Complex; uc: Complex; ue: Complex }
interface RfDiode { a: number; k: number; st: DiodeState; ua: Complex; uk: Complex }

/**
 * The board's RF piece laid out for a transient solve (sim/burst.ts). Terminal indices below
 * `nets.length` are nets solved for; from there on come the quiet rails in `held`, which the
 * transient holds at the audio half's voltages; -1 is ground. `mode` indexes the element's
 * current in the mode shape (`RfNetwork.mode`).
 */
export interface RfTopology {
  nets: string[];
  held: string[];
  res: Array<{ a: number; b: number; st: ResState }>;
  caps: Array<{ a: number; b: number; st: CapState }>;
  inds: Array<{ a: number; b: number; st: IndState; mode: number }>;
  srcs: Array<{ p: number; n: number; name: string; mode: number }>;
  bjts: Array<{ b: number; c: number; e: number; st: BjtState }>;
  diodes: Array<{ a: number; k: number; st: DiodeState }>;
  /** The two ends of the tuned winding; -1 for ground. */
  tank: [number, number];
}

export class RfNetwork {
  /** False without the antenna's tank: the board then has no RF at all. */
  readonly enabled: boolean;
  /** The tank's resonance, radians per second; 0 when there is no tank. */
  omega = 0;
  readonly topology: RfTopology;

  private readonly nodes: number;
  private readonly res: Array<{ a: number; b: number; st: ResState }> = [];
  private readonly caps: Array<{ a: number; b: number; st: CapState }> = [];
  private readonly inds: Array<{ a: number; b: number; branch: number; st: IndState }> = [];
  private readonly srcs: Array<{ p: number; n: number; branch: number; name: string }> = [];
  private readonly bjts: RfBjt[] = [];
  private readonly diodes: RfDiode[] = [];
  private readonly branchOf = new Map<IndState, number>();
  private readonly tank: number;
  private readonly tankOther: number;
  private readonly m: ComplexMatrix;

  /** Energy per volt² of tank amplitude, and loss conductance, of the passive mode. */
  private w = 1;
  private g = 0;
  /** Every net's voltage and every branch's current per volt across the tank, at resonance. */
  private shapeRe = new Float64Array(0);
  private shapeIm = new Float64Array(0);
  /** Forced amplitude from the antenna's induced EMF, volts peak across the tank. */
  private drive = 0;

  constructor(netlist: Netlist, items: RfItem[]) {
    const exclude = new Set(netlist.rf?.exclude ?? []);
    const ground = new Set([netlist.ground, ...(netlist.rf?.ground ?? [])]);
    const used = items.filter((it) => !exclude.has(it.el.name));

    const terminals = (el: NlElement): string[] => {
      switch (el.kind) {
        case 'R': case 'C': case 'L': return [el.a, el.b];
        case 'D': return [el.anode, el.cathode];
        case 'Q': return [el.base, el.collector, el.emitter];
        case 'V': return [el.p, el.n];
        default: return [];
      }
    };

    // Keep the connected piece of the board that holds the antenna's windings.
    const parent = new Map<string, string>();
    const find = (n: string): string => {
      let r = n;
      while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
      return r;
    };
    for (const it of used) {
      const ts = terminals(it.el).filter((t) => !ground.has(t));
      for (let i = 1; i < ts.length; i++) {
        const [a, b] = [find(ts[0]!), find(ts[i]!)];
        if (a !== b) parent.set(b, a);
      }
    }
    const live = new Set<string>();
    for (const it of used) {
      if (it.el.kind !== 'L') continue;
      for (const t of terminals(it.el)) if (!ground.has(t)) live.add(find(t));
    }

    const index = new Map<string, number>();
    const at = (net: string): number => {
      if (ground.has(net) || !live.has(find(net))) return -1;
      let i = index.get(net);
      if (i === undefined) {
        i = index.size;
        index.set(net, i);
      }
      return i;
    };
    const kept = used.filter((it) => terminals(it.el).some((t) => at(t) >= 0));
    for (const it of kept) for (const t of terminals(it.el)) at(t);
    this.nodes = index.size;

    // For a transient, the quiet rails the piece touches are held rather than grounded.
    const held = new Map<string, number>();
    const hold = (net: string): number => {
      if (net === netlist.ground) return -1;
      const i = index.get(net);
      if (i !== undefined) return i;
      let k = held.get(net);
      if (k === undefined) {
        k = held.size;
        held.set(net, k);
      }
      return this.nodes + k;
    };
    const topo: RfTopology = {
      nets: [...index.keys()], held: [], res: [], caps: [], inds: [], srcs: [], bjts: [],
      diodes: [], tank: [-1, -1],
    };

    let branch = this.nodes;
    for (const it of kept) {
      switch (it.el.kind) {
        case 'R': {
          const st = it.st as ResState;
          this.res.push({ a: at(it.el.a), b: at(it.el.b), st });
          topo.res.push({ a: hold(it.el.a), b: hold(it.el.b), st });
          break;
        }
        case 'C': {
          const st = it.st as CapState;
          this.caps.push({ a: at(it.el.a), b: at(it.el.b), st });
          topo.caps.push({ a: hold(it.el.a), b: hold(it.el.b), st });
          break;
        }
        case 'L': {
          const st = it.st as IndState;
          this.inds.push({ a: at(it.el.a), b: at(it.el.b), branch, st });
          topo.inds.push({ a: hold(it.el.a), b: hold(it.el.b), st, mode: branch });
          this.branchOf.set(st, branch++);
          break;
        }
        case 'V':
          this.srcs.push({ p: at(it.el.p), n: at(it.el.n), branch, name: it.el.name });
          topo.srcs.push({ p: hold(it.el.p), n: hold(it.el.n), name: it.el.name, mode: branch++ });
          break;
        case 'D': {
          const st = it.st as DiodeState;
          st.burst = topo.diodes.length;
          this.diodes.push({ a: at(it.el.anode), k: at(it.el.cathode), st, ua: ZERO, uk: ZERO });
          topo.diodes.push({ a: hold(it.el.anode), k: hold(it.el.cathode), st });
          break;
        }
        case 'Q': {
          const st = it.st as BjtState;
          st.burst = topo.bjts.length;
          this.bjts.push({
            b: at(it.el.base), c: at(it.el.collector), e: at(it.el.emitter), st,
            ub: ZERO, uc: ZERO, ue: ZERO,
          });
          topo.bjts.push({
            b: hold(it.el.base), c: hold(it.el.collector), e: hold(it.el.emitter), st,
          });
          break;
        }
      }
    }
    topo.held = [...held.keys()];
    const ends = (netlist.antenna?.tuned ?? []).map((n) => index.get(n) ?? -1);
    topo.tank = [ends[0] ?? -1, ends[1] ?? -1];
    this.topology = topo;

    const tuned = (netlist.antenna?.tuned ?? []).map(at);
    this.tank = tuned.find((i) => i >= 0) ?? -1;
    this.tankOther = tuned.find((i) => i >= 0 && i !== this.tank) ?? -1;
    this.enabled = this.inds.length > 0 && this.tank >= 0;
    this.m = new ComplexMatrix(Math.max(branch, 1));

    if (this.enabled) this.retune();
  }

  /** Find the tank's resonance and mode again, after a capacitance changed. */
  retune(): void {
    if (!this.enabled) return;
    const lo = Math.log(2 * Math.PI * 20e3);
    const hi = Math.log(2 * Math.PI * 5e6);
    const n = 240;
    let best = 0;
    let bestAt = lo;
    for (let i = 0; i <= n; i++) {
      const lw = lo + ((hi - lo) * i) / n;
      const r = this.tankImpedance(Math.exp(lw));
      if (r > best) {
        best = r;
        bestAt = lw;
      }
    }
    let a = bestAt - (hi - lo) / n;
    let b = bestAt + (hi - lo) / n;
    const gold = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 40; i++) {
      const c = b - gold * (b - a);
      const d = a + gold * (b - a);
      if (this.tankImpedance(Math.exp(c)) > this.tankImpedance(Math.exp(d))) b = d;
      else a = c;
    }
    this.omega = Math.exp((a + b) / 2);
    this.captureMode();
  }

  /**
   * Tank volts per volt of EMF in the named source (the antenna's coupling winding) at a carrier
   * frequency: the passive network's own selectivity.
   */
  transfer(source: string, hz: number): number {
    const src = this.srcs.find((s) => s.name === source);
    if (!this.enabled || !src) return 0;
    this.stampPassive(2 * Math.PI * hz, src.branch);
    if (!this.m.solve()) return 0;
    return this.tankVoltsIn();
  }

  /** The forced tank amplitude the antenna's pickup produces this sample, volts peak. */
  setDrive(volts: number): void {
    this.drive = Math.max(0, volts);
  }

  /** The mode shape at a net or branch index of `topology` (a net's volts, a branch's amps). */
  mode(i: number): Complex {
    if (i < 0 || i >= this.shapeRe.length) return ZERO;
    return { re: this.shapeRe[i]!, im: this.shapeIm[i]! };
  }

  /** How fast ln A falls with the junctions quiet, per second (negative). */
  passiveRate(): number {
    return -this.g / (4 * this.w);
  }

  /** The largest junction swing in thermal voltages for ln A = y. */
  junctionSwing(y: number): number {
    let k = 0;
    for (const q of this.bjts) k = Math.max(k, q.st.kF, q.st.kR);
    for (const d of this.diodes) k = Math.max(k, d.st.kD);
    return k * this.swing(y);
  }

  /** Total RF swing across the tank for ln A = y. */
  swing(y: number): number {
    return Math.hypot(Math.exp(y), this.drive);
  }

  /**
   * The power the junctions feed the tank at this bias and swing, as a fraction of the tank's own
   * losses: negative when they absorb, 1 at an oscillator's threshold, 0 when they are quiet.
   */
  activity(x: Float64Array, swing: number): number {
    if (!this.enabled) return 0;
    const passive = this.passiveRate();
    return (this.sigma(x, swing) - passive) / -passive;
  }

  /** Growth rate of ln A for the audio half's node voltages x and a total tank swing. */
  sigma(x: Float64Array, swing: number): number {
    if (!this.enabled) return 0;
    const v = (i: number): number => (i < 0 ? 0 : (x[i] ?? 0));
    let p = 0;
    for (const q of this.bjts) {
      const st = q.st;
      const s = st.sign;
      const vbe = s * (v(st.base) - v(st.emitter));
      const vbc = s * (v(st.base) - v(st.collector));
      const aF = st.kF * swing;
      const aR = st.kR * swing;
      const gm = (st.is / VT) * Math.exp(Math.min(vbe / VT + aF, EXP_CAP)) * besselGain(aF);
      const go = (st.is / VT) * Math.exp(Math.min(vbc / VT + aR, EXP_CAP)) * besselGain(aR);
      p += transistorPower(q.ub, q.uc, q.ue, gm / st.bf, go / st.br, gm, go);
      const gbd =
        (st.isBd / VT) * Math.exp(Math.min((-vbe - st.bv) / VT + aF, EXP_CAP)) * besselGain(aF);
      p += 0.5 * gbd * (st.kF * VT) ** 2;
    }
    for (const d of this.diodes) {
      const st = d.st;
      const a = st.kD * swing;
      const gd =
        (st.is / st.nvt) *
        Math.exp(Math.min((v(st.anode) - v(st.cathode)) / st.nvt + a, EXP_CAP)) *
        besselGain(a);
      p += 0.5 * gd * (st.kD * st.nvt) ** 2;
    }
    return -(p + 0.5 * this.g) / (2 * this.w);
  }

  private tankVoltsIn(): number {
    const o = this.tankOther;
    return Math.hypot(
      this.m.bRe[this.tank]! - (o < 0 ? 0 : this.m.bRe[o]!),
      this.m.bIm[this.tank]! - (o < 0 ? 0 : this.m.bIm[o]!),
    );
  }

  private tankImpedance(w: number): number {
    this.stampPassive(w, -1);
    this.m.addRhs(this.tank, 1);
    this.m.addRhs(this.tankOther, -1);
    return this.m.solve() ? this.tankVoltsIn() : 0;
  }

  /** The mode at resonance: node shape per tank volt, stored energy and losses. */
  private captureMode(): void {
    this.stampPassive(this.omega, -1);
    this.m.addRhs(this.tank, 1);
    this.m.addRhs(this.tankOther, -1);
    if (!this.m.solve()) return;
    const o = this.tankOther;
    const zr = this.m.bRe[this.tank]! - (o < 0 ? 0 : this.m.bRe[o]!);
    const zi = this.m.bIm[this.tank]! - (o < 0 ? 0 : this.m.bIm[o]!);
    const zz = zr * zr + zi * zi;
    // Divide the solution by Z so the tank carries exactly 1 V.
    const unit = (i: number): Complex =>
      i < 0
        ? ZERO
        : {
            re: (this.m.bRe[i]! * zr + this.m.bIm[i]! * zi) / zz,
            im: (this.m.bIm[i]! * zr - this.m.bRe[i]! * zi) / zz,
          };

    this.g = zr / zz; // Re{1/Z}
    const size = this.m.n;
    this.shapeRe = new Float64Array(size);
    this.shapeIm = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const u = unit(i);
      this.shapeRe[i] = u.re;
      this.shapeIm[i] = u.im;
    }
    let energy = 0;
    for (const c of this.caps) energy += 0.25 * c.st.farads * mag(unit(c.a), unit(c.b)) ** 2;
    for (const l of this.inds) {
      const i = unit(l.branch);
      energy += 0.25 * l.st.henries * (i.re * i.re + i.im * i.im);
      for (const { other, henries } of l.st.mutual) {
        const ob = this.branchOf.get(other);
        if (ob === undefined || ob < l.branch) continue;
        const j = unit(ob);
        energy += 0.5 * henries * (i.re * j.re + i.im * j.im);
      }
    }
    this.w = Math.max(energy, 1e-30);
    for (const q of this.bjts) {
      q.ub = unit(q.b);
      q.uc = unit(q.c);
      q.ue = unit(q.e);
      q.st.kF = mag(q.ub, q.ue) / VT;
      q.st.kR = mag(q.ub, q.uc) / VT;
    }
    for (const d of this.diodes) {
      d.ua = unit(d.a);
      d.uk = unit(d.k);
      d.st.kD = mag(d.ua, d.uk) / d.st.nvt;
    }
  }

  /** The network in sinusoidal steady state at ω, junctions left out. */
  private stampPassive(w: number, excite: number): void {
    const m = this.m;
    m.clear();
    for (let i = 0; i < this.nodes; i++) m.add(i, i, 1e-12);
    for (const r of this.res) admittance(m, r.a, r.b, r.st.g, 0);
    for (const c of this.caps) admittance(m, c.a, c.b, 0, w * c.st.farads);
    for (const l of this.inds) {
      const br = l.branch;
      const L = l.st.henries;
      m.add(l.a, br, 1);
      m.add(l.b, br, -1);
      m.add(br, l.a, 1);
      m.add(br, l.b, -1);
      m.add(br, br, -(l.st.esr + (w * L) / CORE_Q), -w * L);
      for (const { other, henries } of l.st.mutual) {
        const ob = this.branchOf.get(other);
        if (ob !== undefined) m.add(br, ob, 0, -w * henries);
      }
    }
    for (const s of this.srcs) {
      m.add(s.p, s.branch, 1);
      m.add(s.n, s.branch, -1);
      m.add(s.branch, s.p, 1);
      m.add(s.branch, s.n, -1);
      if (s.branch === excite) m.addRhs(s.branch, 1);
    }
  }
}

/** ln I0(a), finite for any swing. */
export function logI0(a: number): number {
  return a + Math.log(besselI0e(a));
}

function mag(a: Complex, b: Complex): number {
  return Math.hypot(a.re - b.re, a.im - b.im);
}

function admittance(m: ComplexMatrix, a: number, b: number, re: number, im: number): void {
  m.add(a, a, re, im);
  m.add(b, b, re, im);
  m.add(a, b, -re, -im);
  m.add(b, a, -re, -im);
}

/**
 * Average power a transistor absorbs from the mode, per volt² of tank amplitude: ½·Re{V^H·Y·V}
 * with the linearised transport model's admittances (the same pattern the audio half stamps).
 */
function transistorPower(
  B: Complex, C: Complex, E: Complex, gpi: number, gmu: number, gm: number, go: number,
): number {
  const ib = lin([gpi + gmu, B], [-gpi, E], [-gmu, C]);
  const ic = lin([gm - go - gmu, B], [-gm, E], [go + gmu, C]);
  const ie = lin([-gpi - gm + go, B], [gpi + gm, E], [-go, C]);
  return 0.5 * (dot(B, ib) + dot(C, ic) + dot(E, ie));
}

function lin(...terms: Array<[number, Complex]>): Complex {
  let re = 0;
  let im = 0;
  for (const [k, z] of terms) {
    re += k * z.re;
    im += k * z.im;
  }
  return { re, im };
}

/** Re{v·conj(i)}. */
function dot(v: Complex, i: Complex): number {
  return v.re * i.re + v.im * i.im;
}
