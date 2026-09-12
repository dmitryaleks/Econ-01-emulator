/**
 * Modified nodal analysis with backward-Euler companion models and a damped Newton-Raphson
 * loop. This is what decides whether a board you built oscillates, amplifies or sits there
 * doing nothing — no behaviour is scripted (SPEC.md §7.2).
 */

import type { Netlist } from '../netlist/build.js';
import { Matrix } from './matrix.js';
import { BJT_MODELS, DIODE_MODELS, VT, critVoltage, limitJunction } from './models.js';

export interface SolveOptions {
  /** Conductance from every node to ground, keeping floating sections solvable. */
  gmin: number;
  reltol: number;
  abstol: number;
  maxIterations: number;
}

export const DEFAULT_OPTIONS: SolveOptions = {
  gmin: 1e-12,
  reltol: 1e-3,
  abstol: 1e-7,
  maxIterations: 40,
};

interface ResState { a: number; b: number; g: number }
interface CapState { a: number; b: number; farads: number; vPrev: number }
interface IndState {
  a: number; b: number; henries: number; esr: number; branch: number; iPrev: number;
}
interface DiodeState {
  anode: number; cathode: number; is: number; nvt: number; vcrit: number; vPrev: number;
}
interface BjtState {
  base: number; collector: number; emitter: number;
  is: number; bf: number; br: number; sign: 1 | -1;
  vbePrev: number; vbcPrev: number; vcrit: number;
}
interface SrcState { name: string; p: number; n: number; volts: number; branch: number }

export class Circuit {
  readonly nodeIndex = new Map<string, number>();
  readonly nodeCount: number;
  readonly unknowns: number;

  private readonly res: ResState[] = [];
  private readonly caps: CapState[] = [];
  private readonly inds: IndState[] = [];
  private readonly diodes: DiodeState[] = [];
  private readonly bjts: BjtState[] = [];
  private readonly srcs: SrcState[] = [];

  private readonly m: Matrix;
  private readonly x: Float64Array;
  private readonly xPrev: Float64Array;
  private readonly opts: SolveOptions;
  private h = 1 / 48000;
  private gminNow: number;

  /** External currents injected into nets, used by the behavioural radio block. */
  readonly injections = new Map<string, number>();

  lastIterations = 0;
  converged = true;

  constructor(netlist: Netlist, options: Partial<SolveOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.gminNow = this.opts.gmin;

    // Ground is node -1 so its stamps fall away.
    let next = 0;
    const idx = (net: string): number => {
      if (net === netlist.ground) return -1;
      let i = this.nodeIndex.get(net);
      if (i === undefined) {
        i = next++;
        this.nodeIndex.set(net, i);
      }
      return i;
    };

    const needBranch: Array<(i: number) => void> = [];

    for (const el of netlist.elements) {
      switch (el.kind) {
        case 'R':
          this.res.push({ a: idx(el.a), b: idx(el.b), g: 1 / Math.max(el.ohms, 1e-9) });
          break;
        case 'C':
          this.caps.push({ a: idx(el.a), b: idx(el.b), farads: el.farads, vPrev: 0 });
          break;
        case 'L': {
          const st: IndState = {
            a: idx(el.a), b: idx(el.b), henries: el.henries, esr: el.esr, branch: 0, iPrev: 0,
          };
          this.inds.push(st);
          needBranch.push((i) => (st.branch = i));
          break;
        }
        case 'D': {
          const mdl = DIODE_MODELS[el.model] ?? DIODE_MODELS['D9B']!;
          const nvt = mdl.n * VT;
          this.diodes.push({
            anode: idx(el.anode),
            cathode: idx(el.cathode),
            is: mdl.is,
            nvt,
            vcrit: critVoltage(mdl.is, nvt),
            vPrev: 0,
          });
          break;
        }
        case 'Q': {
          const mdl = BJT_MODELS[el.model] ?? BJT_MODELS['KT315B']!;
          this.bjts.push({
            base: idx(el.base),
            collector: idx(el.collector),
            emitter: idx(el.emitter),
            is: mdl.is,
            bf: mdl.bf,
            br: mdl.br,
            sign: mdl.type === 'npn' ? 1 : -1,
            vbePrev: 0,
            vbcPrev: 0,
            vcrit: critVoltage(mdl.is, VT),
          });
          break;
        }
        case 'V': {
          const st: SrcState = {
            name: el.name, p: idx(el.p), n: idx(el.n), volts: el.volts, branch: 0,
          };
          this.srcs.push(st);
          needBranch.push((i) => (st.branch = i));
          break;
        }
      }
    }

    this.nodeCount = next;
    let branch = 0;
    for (const set of needBranch) set(next + branch++);
    this.unknowns = Math.max(next + branch, 1);
    this.m = new Matrix(this.unknowns);
    this.x = new Float64Array(this.unknowns);
    this.xPrev = new Float64Array(this.unknowns);
  }

  setTimestep(seconds: number): void {
    this.h = seconds;
  }

  timestep(): number {
    return this.h;
  }

  voltageAt(net: string): number {
    const i = this.nodeIndex.get(net);
    return i === undefined ? 0 : (this.x[i] ?? 0);
  }

  /** Current through a voltage source, positive flowing out of its + terminal. */
  sourceCurrent(name: string, _netlist?: Netlist): number {
    const src = this.srcs.find((s) => s.name === name);
    return src ? -(this.x[src.branch] ?? 0) : 0;
  }

  /** Drive a named voltage source, e.g. the antenna's induced EMF, between steps. */
  setSourceVoltage(name: string, volts: number): boolean {
    const src = this.srcs.find((s) => s.name === name);
    if (!src) return false;
    src.volts = volts;
    return true;
  }

  hasSource(name: string): boolean {
    return this.srcs.some((s) => s.name === name);
  }

  private v(i: number): number {
    return i < 0 ? 0 : (this.x[i] ?? 0);
  }

  /**
   * DC operating point: capacitors open, inductors shorted. gmin stepping lets a cold start
   * with five transistors find a solution.
   */
  dcOperatingPoint(): boolean {
    let ok = false;
    for (const g of [1e-3, 1e-5, 1e-7, 1e-9, this.opts.gmin]) {
      this.gminNow = Math.max(g, this.opts.gmin);
      ok = this.newton(true);
    }
    this.gminNow = this.opts.gmin;
    for (const c of this.caps) c.vPrev = this.v(c.a) - this.v(c.b);
    for (const l of this.inds) l.iPrev = this.x[l.branch] ?? 0;
    this.converged = ok;
    return ok;
  }

  /** Advance one timestep. */
  step(): void {
    this.converged = this.newton(false);
    for (const c of this.caps) c.vPrev = this.v(c.a) - this.v(c.b);
    for (const l of this.inds) l.iPrev = this.x[l.branch] ?? 0;
  }

  private newton(dc: boolean): boolean {
    const { reltol, abstol, maxIterations } = this.opts;

    for (let iter = 0; iter < maxIterations; iter++) {
      this.xPrev.set(this.x);
      this.stamp(dc);
      const sol = this.m.solve();
      this.lastIterations = iter + 1;
      if (!sol) return false;
      this.x.set(sol);

      if (iter === 0) continue;
      let done = true;
      for (let i = 0; i < this.unknowns; i++) {
        const a = this.x[i]!;
        const b = this.xPrev[i]!;
        if (Math.abs(a - b) > reltol * Math.abs(a) + abstol) {
          done = false;
          break;
        }
      }
      if (done) return true;
    }
    return false;
  }

  private stamp(dc: boolean): void {
    const m = this.m;
    m.clear();

    for (let i = 0; i < this.nodeCount; i++) m.add(i, i, this.gminNow);

    for (const r of this.res) conductance(m, r.a, r.b, r.g);

    if (!dc) {
      for (const c of this.caps) {
        const geq = c.farads / this.h;
        const ieq = geq * c.vPrev;
        conductance(m, c.a, c.b, geq);
        m.addRhs(c.a, ieq);
        m.addRhs(c.b, -ieq);
      }
    }

    for (const l of this.inds) {
      // v(a) − v(b) − (L/h + esr)·i = −(L/h)·i_prev, with L/h = 0 at DC (a short).
      const k = dc ? 0 : l.henries / this.h;
      const br = l.branch;
      m.add(l.a, br, 1);
      m.add(l.b, br, -1);
      m.add(br, l.a, 1);
      m.add(br, l.b, -1);
      m.add(br, br, -(k + l.esr));
      m.addRhs(br, -k * l.iPrev);
    }

    for (const s of this.srcs) {
      const br = s.branch;
      m.add(s.p, br, 1);
      m.add(s.n, br, -1);
      m.add(br, s.p, 1);
      m.add(br, s.n, -1);
      m.addRhs(br, s.volts);
    }

    for (const d of this.diodes) {
      let vd = this.v(d.anode) - this.v(d.cathode);
      vd = limitJunction(vd, d.vPrev, d.nvt, d.vcrit);
      d.vPrev = vd;
      const ex = Math.exp(Math.min(vd / d.nvt, 60));
      const id = d.is * (ex - 1);
      const gd = (d.is / d.nvt) * ex + this.gminNow;
      const ieq = id - gd * vd;
      conductance(m, d.anode, d.cathode, gd);
      m.addRhs(d.anode, -ieq);
      m.addRhs(d.cathode, ieq);
    }

    for (const q of this.bjts) this.stampBjt(m, q);

    for (const [net, amps] of this.injections) {
      const i = this.nodeIndex.get(net);
      if (i !== undefined) m.addRhs(i, amps);
    }
  }

  /**
   * Ebers-Moll transport model, linearised. For a pnp the junction voltages and the terminal
   * currents are both negated, which leaves the Jacobian identical to the npn case and only
   * flips the sign of the equivalent current sources.
   */
  private stampBjt(m: Matrix, q: BjtState): void {
    const s = q.sign;
    let vbe = s * (this.v(q.base) - this.v(q.emitter));
    let vbc = s * (this.v(q.base) - this.v(q.collector));
    vbe = limitJunction(vbe, q.vbePrev, VT, q.vcrit);
    vbc = limitJunction(vbc, q.vbcPrev, VT, q.vcrit);
    q.vbePrev = vbe;
    q.vbcPrev = vbc;

    const expBe = Math.exp(Math.min(vbe / VT, 60));
    const expBc = Math.exp(Math.min(vbc / VT, 60));
    const ifwd = q.is * (expBe - 1);
    const irev = q.is * (expBc - 1);

    const gpi = (q.is / (q.bf * VT)) * expBe + this.gminNow;
    const gmu = (q.is / (q.br * VT)) * expBc + this.gminNow;
    const gm = (q.is / VT) * expBe;
    const go = (q.is / VT) * expBc;

    const ib = ifwd / q.bf + irev / q.br;
    const ic = ifwd - irev - irev / q.br;

    const ieqB = ib - gpi * vbe - gmu * vbc;
    const ieqC = ic - gm * vbe + (go + gmu) * vbc;
    const ieqE = -(ieqB + ieqC);

    const B = q.base;
    const C = q.collector;
    const E = q.emitter;

    m.add(B, B, gpi + gmu);
    m.add(B, E, -gpi);
    m.add(B, C, -gmu);

    m.add(C, B, gm - go - gmu);
    m.add(C, E, -gm);
    m.add(C, C, go + gmu);

    m.add(E, B, -gpi - gm + go);
    m.add(E, E, gpi + gm);
    m.add(E, C, -go);

    m.addRhs(B, -s * ieqB);
    m.addRhs(C, -s * ieqC);
    m.addRhs(E, -s * ieqE);
  }
}

function conductance(m: Matrix, a: number, b: number, g: number): void {
  m.add(a, a, g);
  m.add(b, b, g);
  m.add(a, b, -g);
  m.add(b, a, -g);
}
