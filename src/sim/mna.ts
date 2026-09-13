/**
 * Modified nodal analysis with backward-Euler companion models and a damped Newton-Raphson
 * loop. This is what decides whether a board you built oscillates, amplifies or sits there
 * doing nothing — no behaviour is scripted (SPEC.md §7.2).
 *
 * On a board with the antenna's tank, each step also finds the tank's RF amplitude A (sim/rf.ts):
 * the circuit is solved with ln A held, and ln A is searched for outside that solve. While an
 * oscillator's transistor drives the tank hard, the RF piece is instead run as a transient cycle
 * by cycle (sim/burst.ts) and this solve takes its junction currents.
 */

import type { Netlist } from '../netlist/build.js';
import { RfBurst } from './burst.js';
import { Matrix } from './matrix.js';
import { BJT_MODELS, DIODE_MODELS, VT, critVoltage, limitJunction } from './models.js';
import { LOG_CEIL, LOG_FLOOR, RfNetwork, logI0, type RfItem } from './rf.js';

export interface SolveOptions {
  /** Conductance from every node to ground, keeping floating sections solvable. */
  gmin: number;
  reltol: number;
  abstol: number;
  maxIterations: number;
}

/** Saturation current of the emitter-base breakdown junction: a sharp knee at bv. [G] */
const BREAKDOWN_IS = 1e-12;
/** A step whose ln A would move further than this is run as a burst instead. */
const MAX_LOG_STEP = 1.5;
/**
 * So is a step that leaves a driven oscillator's junctions swinging by more than this many thermal
 * voltages: past it the swing is too strongly non-linear for the envelope to follow.
 */
const IMPLICIT_SWING = 1;
/**
 * A driven oscillator climbing a cycle at a time hands over to the RF transient once its
 * junctions swing by more than this many thermal voltages, or its swing grows by more than
 * MAX_CYCLE_GROWTH (in ln A) in a cycle.
 */
const BURST_SWING = 10;
const MAX_CYCLE_GROWTH = 1;
/**
 * After the RF transient has found an oscillator steady, the envelope is trusted with it, and the
 * transient looks ahead LOOKAHEAD_CYCLES every LOOKAHEAD_SECONDS in case it has begun to squeg.
 */
const LOOKAHEAD_SECONDS = 0.05;
const LOOKAHEAD_CYCLES = 24;
/** Junctions feeding the tank more than this fraction of its losses drive it. */
const DRIVEN_ACTIVITY = 0.5;
/** Junctions feeding or taking less than this fraction leave the tank to ring on its own. */
const QUIET_ACTIVITY = 0.1;
/** The amplitude search stops once ln A, or its residual, is this close. */
const LOG_TOL = 1e-4;
/** First stride of the search away from the previous ln A, doubling while it finds no root. */
const FIRST_STRIDE = 0.25;
const MAX_SEARCH = 60;

export const DEFAULT_OPTIONS: SolveOptions = {
  gmin: 1e-12,
  reltol: 1e-3,
  abstol: 1e-7,
  maxIterations: 40,
};

export interface ResState { a: number; b: number; g: number }
export interface CapState { a: number; b: number; farads: number; vPrev: number }
export interface IndState {
  a: number; b: number; henries: number; esr: number; branch: number; iPrev: number;
  /** Mutual inductances to other windings on the same core. */
  mutual: Array<{ other: IndState; henries: number }>;
}
/**
 * `k` fields give the RF swing across a junction per volt of tank amplitude, in units of the
 * junction's thermal voltage (sim/rf.ts); zero for junctions away from the antenna.
 */
export interface DiodeState {
  anode: number; cathode: number; is: number; nvt: number; vcrit: number; vPrev: number;
  kD: number;
  /** Index among the RF transient's diodes (sim/burst.ts), or -1 away from the antenna. */
  burst: number;
}
export interface BjtState {
  base: number; collector: number; emitter: number;
  is: number; bf: number; br: number; sign: 1 | -1;
  vbePrev: number; vbcPrev: number; vcrit: number;
  kF: number; kR: number;
  /** Emitter-base breakdown: voltage, saturation current and last limited voltage. */
  bv: number; isBd: number; vbdPrev: number; vcritBd: number;
  /** Index among the RF transient's transistors (sim/burst.ts), or -1 away from the antenna. */
  burst: number;
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

  /** The antenna tank's RF mode, for boards that have one. */
  readonly rf: RfNetwork;
  /** ln A held for the solve in hand, and at the end of the last step. */
  private y = LOG_FLOOR;
  private yPrev = LOG_FLOOR;
  /** Saved solver states: the step's start, and the amplitude search's last good solve. */
  private readonly saved: Float64Array;
  private readonly good: Float64Array;
  /** The RF piece's transient, and whether it is running this step. */
  private burst: RfBurst | null = null;
  private bursting = false;
  /** The transient found the oscillation steady: the envelope follows it, checked now and then. */
  private steady = false;
  private steadyFor = 0;

  private readonly m: Matrix;
  private readonly x: Float64Array;
  private readonly xPrev: Float64Array;
  private readonly opts: SolveOptions;
  private h = 1 / 48000;
  private gminNow: number;

  /** External currents injected into nets, used by tests to nudge a circuit. */
  readonly injections = new Map<string, number>();

  /** Set by `limit` while stamping. */
  private limited = false;

  lastIterations = 0;
  converged = true;

  /** Which elements sit between which nets, ignoring their values. See `updateValues`. */
  readonly topology: string;

  constructor(netlist: Netlist, options: Partial<SolveOptions> = {}) {
    this.topology = topologyOf(netlist);
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
    const items: RfItem[] = [];
    const inductorByName = new Map<string, IndState>();

    for (const el of netlist.elements) {
      switch (el.kind) {
        case 'R': {
          const st: ResState = { a: idx(el.a), b: idx(el.b), g: 1 / Math.max(el.ohms, 1e-9) };
          this.res.push(st);
          items.push({ el, st });
          break;
        }
        case 'C': {
          const st: CapState = { a: idx(el.a), b: idx(el.b), farads: el.farads, vPrev: 0 };
          this.caps.push(st);
          items.push({ el, st });
          break;
        }
        case 'L': {
          const st: IndState = {
            a: idx(el.a), b: idx(el.b), henries: el.henries, esr: el.esr, branch: 0, iPrev: 0,
            mutual: [],
          };
          this.inds.push(st);
          inductorByName.set(el.name, st);
          needBranch.push((i) => (st.branch = i));
          items.push({ el, st });
          break;
        }
        case 'D': {
          const mdl = DIODE_MODELS[el.model] ?? DIODE_MODELS['D9B']!;
          const nvt = mdl.n * VT;
          const st: DiodeState = {
            anode: idx(el.anode),
            cathode: idx(el.cathode),
            is: mdl.is,
            nvt,
            vcrit: critVoltage(mdl.is, nvt),
            vPrev: 0,
            kD: 0,
            burst: -1,
          };
          this.diodes.push(st);
          items.push({ el, st });
          break;
        }
        case 'Q': {
          const mdl = BJT_MODELS[el.model] ?? BJT_MODELS['KT315B']!;
          const st: BjtState = {
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
            kF: 0,
            kR: 0,
            bv: mdl.bvEbo,
            isBd: BREAKDOWN_IS,
            vbdPrev: 0,
            vcritBd: critVoltage(BREAKDOWN_IS, VT),
            burst: -1,
          };
          this.bjts.push(st);
          items.push({ el, st });
          break;
        }
        case 'V': {
          const st: SrcState = {
            name: el.name, p: idx(el.p), n: idx(el.n), volts: el.volts, branch: 0,
          };
          this.srcs.push(st);
          needBranch.push((i) => (st.branch = i));
          items.push({ el, st: null });
          break;
        }
      }
    }

    for (const el of netlist.elements) {
      if (el.kind !== 'K') continue;
      const a = inductorByName.get(el.l1);
      const b = inductorByName.get(el.l2);
      if (!a || !b) continue;
      const henries = el.k * Math.sqrt(a.henries * b.henries);
      a.mutual.push({ other: b, henries });
      b.mutual.push({ other: a, henries });
    }

    this.nodeCount = next;
    let branch = 0;
    for (const set of needBranch) set(next + branch++);
    this.rf = new RfNetwork(netlist, items);
    this.unknowns = Math.max(next + branch, 1);
    this.m = new Matrix(this.unknowns);
    this.x = new Float64Array(this.unknowns);
    this.xPrev = new Float64Array(this.unknowns);
    this.saved = this.newSave();

    this.good = this.newSave();
  }

  setTimestep(seconds: number): void {
    this.h = seconds;
  }

  /**
   * Take new element values from a netlist with the same topology — a button pressed, the
   * volume or tuning moved — without restarting. Node voltages, capacitor charge and inductor
   * current carry on, which a fresh Circuit would throw away by starting from its DC operating
   * point. Returns false, changing nothing, when the topology differs.
   */
  updateValues(netlist: Netlist): boolean {
    if (topologyOf(netlist) !== this.topology) return false;
    let r = 0;
    let c = 0;
    let v = 0;
    for (const el of netlist.elements) {
      if (el.kind === 'R') this.res[r++]!.g = 1 / Math.max(el.ohms, 1e-9);
      else if (el.kind === 'C') this.caps[c++]!.farads = el.farads;
      else if (el.kind === 'V') this.srcs[v++]!.volts = el.volts;
    }
    this.rf.retune();
    return true;
  }

  timestep(): number {
    return this.h;
  }

  voltageAt(net: string): number {
    const i = this.nodeIndex.get(net);
    return i === undefined ? 0 : (this.x[i] ?? 0);
  }

  /** The antenna tank's RF amplitude, volts peak; 0 without a tank. */
  tankVolts(): number {
    return this.rf.enabled ? Math.exp(this.y) : 0;
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
   * DC operating point: capacitors open, inductors shorted, no RF. gmin stepping lets a cold
   * start with five transistors find a solution.
   */
  dcOperatingPoint(): boolean {
    let ok = false;
    this.y = LOG_FLOOR;
    this.bursting = false;
    this.steady = false;
    for (const g of [1e-3, 1e-5, 1e-7, 1e-9, this.opts.gmin]) {
      this.gminNow = Math.max(g, this.opts.gmin);
      ok = this.newton(true);
    }
    this.gminNow = this.opts.gmin;
    this.commit();
    this.converged = ok;
    return ok;
  }

  /**
   * Advance one timestep. While the RF amplitude holds steady, drifts or rings down, an implicit
   * step with the amplitude searched for does; while an oscillator's transistor drives the tank
   * into a burst, the RF piece runs as a transient until the tank rings down on its own again.
   */
  step(): void {
    const h = this.h;
    if (!this.rf.enabled) {
      this.converged = this.newton(false);
      this.commit();
      return;
    }
    if (!this.bursting) {
      const activity = this.rf.activity(this.x, this.rf.swing(this.yPrev));
      this.saveInto(this.saved);
      if (Math.abs(activity) < QUIET_ACTIVITY) {
        // The tank rings down or sits at its noise on its own: ln A falls at the rate the
        // junctions leave it, and one solve carries the circuit along.
        const rate = this.rf.sigma(this.x, this.rf.swing(this.yPrev));
        this.y = Math.max(LOG_FLOOR, Math.min(LOG_CEIL, this.yPrev + this.h * rate));
        if (this.newton(false)) {
          this.commit();
          this.converged = true;
          return;
        }
        this.load(this.saved);
      }
      if (this.steady) this.checkSteady(h);
      const driven = activity > DRIVEN_ACTIVITY && !this.steady;
      const result = this.solveAmplitude(MAX_LOG_STEP);
      if (result === 'ok' && !(driven && this.rf.junctionSwing(this.y) > IMPLICIT_SWING)) {
        this.commit();
        this.converged = true;
        if (this.y <= LOG_FLOOR) this.steady = false;
        return;
      }
      this.steady = false;
      this.load(this.saved);
      this.y = this.yPrev;
      if (this.climb(h)) {
        this.h = h;
        return;
      }
    }
    this.converged = this.burstStep();
    this.h = h;
  }

  /** Every LOOKAHEAD_SECONDS, let the RF transient confirm the oscillation is still steady. */
  private checkSteady(h: number): void {
    this.steadyFor += h;
    if (this.steadyFor < LOOKAHEAD_SECONDS) return;
    this.steadyFor = 0;
    const burst = (this.burst ??= new RfBurst(this.rf));
    const sourceVolts = (name: string): number => this.srcs.find((s) => s.name === name)?.volts ?? 0;
    const unsteady = burst.looksUnsteady(
      (net) => this.voltageAt(net), this.branchCurrent, sourceVolts, Math.exp(this.yPrev),
      LOOKAHEAD_CYCLES,
    );
    if (unsteady) this.steady = false;
  }

  /** An inductor's or a named source's current. */
  private readonly branchCurrent = (element: IndState | string): number => {
    if (typeof element !== 'string') return this.x[element.branch] ?? 0;
    const src = this.srcs.find((s) => s.name === element);
    return src ? (this.x[src.branch] ?? 0) : 0;
  };

  /**
   * Cover the step a cycle at a time while a driven oscillator's swing is still small: ln A
   * advanced from the last cycle's bias, the circuit solved over the cycle. Hands over to the
   * RF transient — returning false with `h` left at the time still to cover — once the
   * junctions swing hard, the growth turns explosive or a solve fails.
   */
  private climb(h: number): boolean {
    const n = Math.max(1, Math.round((h * this.rf.omega) / (2 * Math.PI)));
    const dt = h / n;
    for (let i = 0; i < n; i++) {
      const rate = this.rf.sigma(this.x, this.rf.swing(this.yPrev));
      if (this.rf.junctionSwing(this.yPrev) > BURST_SWING || dt * rate > MAX_CYCLE_GROWTH) {
        this.h = (n - i) * dt;
        this.beginBurst();
        return false;
      }
      this.h = dt;
      this.y = Math.max(LOG_FLOOR, Math.min(LOG_CEIL, this.yPrev + dt * rate));
      this.saveInto(this.saved);
      if (!this.newton(false)) {
        this.load(this.saved);
        this.y = this.yPrev;
        this.h = (n - i) * dt;
        this.beginBurst();
        return false;
      }
      this.commit();
    }
    this.converged = true;
    return true;
  }

  /** Start the RF transient from this state, the mode ringing at the present amplitude. */
  private beginBurst(): void {
    const burst = (this.burst ??= new RfBurst(this.rf));
    const sourceVolts = (name: string): number => this.srcs.find((s) => s.name === name)?.volts ?? 0;
    burst.start((net) => this.voltageAt(net), this.branchCurrent, sourceVolts, Math.exp(this.yPrev));
    this.bursting = true;
  }

  /** One step with the RF piece's junctions replaced by the transient's average currents. */
  private burstStep(): boolean {
    const burst = this.burst!;
    const ran = burst.run(this.h, (net) => this.voltageAt(net));
    const solved = this.newton(false);
    const a = Math.max(burst.amplitude, Number.MIN_VALUE);
    this.y = Math.max(LOG_FLOOR, Math.min(LOG_CEIL, Math.log(a)));
    this.commit();
    if (!burst.settled && burst.steady) {
      this.steady = true;
      this.steadyFor = 0;
    }
    if (burst.settled || this.steady) {
      this.bursting = false;
      // The junction limiters pick up from the bias the burst left.
      const swing = this.rf.swing(this.y);
      for (const q of this.bjts) {
        if (q.burst < 0) continue;
        q.vbePrev = q.sign * (this.v(q.base) - this.v(q.emitter)) + VT * logI0(q.kF * swing);
        q.vbcPrev = q.sign * (this.v(q.base) - this.v(q.collector)) + VT * logI0(q.kR * swing);
        q.vbdPrev = q.sign * (this.v(q.emitter) - this.v(q.base)) - q.bv + VT * logI0(q.kF * swing);
      }
      for (const d of this.diodes) {
        if (d.burst < 0) continue;
        d.vPrev = this.v(d.anode) - this.v(d.cathode) + d.nvt * logI0(d.kD * swing);
      }
    }
    return ran && solved;
  }

  /**
   * Backward Euler on ln A: find y with y − y_prev − h·σ(x(y), y) = 0, where x(y) is the circuit
   * solved with the amplitude held at y. With y held, each solve is an ordinary circuit whose
   * junctions are shifted by their RF rectification; the residual is walked for a sign change and
   * then bracketed, so the search cannot run away. (One Newton over x and y together has to
   * follow the base voltage and the amplitude down a narrow valley at once as a burst drives its
   * transistor into cutoff, and diverges there.)
   *
   * Returns 'split' when the root lies further than maxJump from y_prev, leaving the step to be
   * halved; after 'fail' the state is the last solve that converged.
   */
  private solveAmplitude(maxJump: number): 'ok' | 'split' | 'fail' {
    const good = this.good;
    this.saveInto(good);
    let goodY = this.yPrev;
    const residual = (y: number): number | null => {
      this.load(good);
      this.y = y;
      if (!this.newton(false)) return null;
      this.saveInto(good);
      goodY = y;
      return y - this.yPrev - this.h * this.rf.sigma(this.x, this.rf.swing(y));
    };
    const fail = (): 'fail' => {
      this.load(good);
      this.y = goodY;
      return 'fail';
    };

    const y0 = this.yPrev;
    let fa = residual(y0);
    if (fa === null) return fail();
    if (Math.abs(fa) < LOG_TOL || (fa > 0 && y0 <= LOG_FLOOR) || (fa < 0 && y0 >= LOG_CEIL)) {
      return 'ok';
    }

    // Walk away from y_prev, the way the residual points, until it changes sign.
    const up = fa < 0;
    const reach = up ? y0 + maxJump : y0 - maxJump;
    const limit = up ? Math.min(reach, LOG_CEIL) : Math.max(reach, LOG_FLOOR);
    const pinned = up ? reach >= LOG_CEIL : reach <= LOG_FLOOR;
    let a = y0;
    let b = y0;
    let fb = fa;
    let stride = FIRST_STRIDE;
    for (let i = 0; ; i++) {
      if (i === MAX_SEARCH) return fail();
      const next = up ? Math.min(limit, a + stride) : Math.max(limit, a - stride);
      const f = residual(next);
      if (f === null) {
        stride /= 4;
        if (stride < LOG_TOL) return fail();
        continue;
      }
      b = next;
      fb = f;
      if (Math.abs(fb) < LOG_TOL) return 'ok';
      if (fb > 0 === up) break;
      if (b === limit) return pinned ? 'ok' : 'split';
      a = b;
      fa = fb;
      stride *= 2;
    }

    // Illinois regula falsi inside [a, b]; b is always the latest solve.
    for (let i = 0; i < MAX_SEARCH; i++) {
      if (Math.abs(fb) < LOG_TOL || Math.abs(b - a) < LOG_TOL) return 'ok';
      let c = b - (fb * (b - a)) / (fb - fa);
      if (!(c > Math.min(a, b) && c < Math.max(a, b))) c = 0.5 * (a + b);
      let fc = residual(c);
      if (fc === null) {
        c = 0.5 * (a + b);
        fc = residual(c);
        if (fc === null) return fail();
      }
      if (fc > 0 === fb > 0) fa /= 2;
      else {
        a = b;
        fa = fb;
      }
      b = c;
      fb = fc;
    }
    return 'ok';
  }

  private commit(): void {
    for (const c of this.caps) c.vPrev = this.v(c.a) - this.v(c.b);
    for (const l of this.inds) l.iPrev = this.x[l.branch] ?? 0;
    this.yPrev = this.y;
  }

  private newSave(): Float64Array {
    return new Float64Array(this.unknowns + this.bjts.length * 3 + this.diodes.length);
  }

  /** Node voltages, branch currents and the junction limiters' memory. */
  private saveInto(buf: Float64Array): void {
    buf.set(this.x);
    let k = this.unknowns;
    for (const q of this.bjts) {
      buf[k++] = q.vbePrev;
      buf[k++] = q.vbcPrev;
      buf[k++] = q.vbdPrev;
    }
    for (const d of this.diodes) buf[k++] = d.vPrev;
  }

  private load(buf: Float64Array): void {
    this.x.set(buf.subarray(0, this.unknowns));
    let k = this.unknowns;
    for (const q of this.bjts) {
      q.vbePrev = buf[k++]!;
      q.vbcPrev = buf[k++]!;
      q.vbdPrev = buf[k++]!;
    }
    for (const d of this.diodes) d.vPrev = buf[k++]!;
  }

  private newton(dc: boolean): boolean {
    const { reltol, abstol, maxIterations } = this.opts;

    for (let iter = 0; iter < maxIterations; iter++) {
      this.xPrev.set(this.x);
      this.limited = false;
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
    const v = limitJunction(vnew, vold, vt, vcrit);
    if (v !== vnew) this.limited = true;
    return v;
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
      // v(a) − v(b) − (L/h + esr)·i − Σ(M/h)·i_other = −(L/h)·i_prev − Σ(M/h)·i_other,prev,
      // with 1/h = 0 at DC (a short).
      const k = dc ? 0 : 1 / this.h;
      const br = l.branch;
      m.add(l.a, br, 1);
      m.add(l.b, br, -1);
      m.add(br, l.a, 1);
      m.add(br, l.b, -1);
      m.add(br, br, -(k * l.henries + l.esr));
      m.addRhs(br, -k * l.henries * l.iPrev);
      for (const { other, henries } of l.mutual) {
        m.add(br, other.branch, -k * henries);
        m.addRhs(br, -k * henries * other.iPrev);
      }
    }

    for (const s of this.srcs) {
      const br = s.branch;
      m.add(s.p, br, 1);
      m.add(s.n, br, -1);
      m.add(br, s.p, 1);
      m.add(br, s.n, -1);
      m.addRhs(br, s.volts);
    }

    // The RF swing the junctions see, held through this solve.
    const swing = dc || !this.rf.enabled ? 0 : this.rf.swing(this.y);

    for (const d of this.diodes) {
      if (this.bursting && d.burst >= 0) {
        const i = this.burst!.anode[d.burst]!;
        m.addRhs(d.anode, -i);
        m.addRhs(d.cathode, i);
        continue;
      }
      // An RF swing a raises the junction's average current by I0(a); limit the shifted voltage.
      const shift = d.nvt * logI0(d.kD * swing);
      const peak = this.limit(
        this.v(d.anode) - this.v(d.cathode) + shift, d.vPrev, d.nvt, d.vcrit,
      );
      d.vPrev = peak;
      const vd = peak - shift;
      const ex = Math.exp(Math.min(peak / d.nvt, 60));
      const id = d.is * (ex - 1);
      const gd = (d.is / d.nvt) * ex + this.gminNow;
      const ieq = id - gd * vd;
      conductance(m, d.anode, d.cathode, gd);
      m.addRhs(d.anode, -ieq);
      m.addRhs(d.cathode, ieq);
    }

    for (const q of this.bjts) this.stampBjt(m, q, swing);

    for (const [net, amps] of this.injections) {
      const i = this.nodeIndex.get(net);
      if (i !== undefined) m.addRhs(i, amps);
    }
  }

  /**
   * Ebers-Moll transport model, linearised. For a pnp the junction voltages and the terminal
   * currents are both negated, which leaves the Jacobian identical to the npn case and only
   * flips the sign of the equivalent current sources. An RF swing across a junction raises its
   * average current by I0(a).
   */
  private stampBjt(m: Matrix, q: BjtState, swing: number): void {
    const s = q.sign;
    const B = q.base;
    const C = q.collector;
    const E = q.emitter;

    if (this.bursting && q.burst >= 0) {
      const ib = this.burst!.base[q.burst]!;
      const ic = this.burst!.collector[q.burst]!;
      m.addRhs(B, -ib);
      m.addRhs(C, -ic);
      m.addRhs(E, ib + ic);
      return;
    }

    const shiftF = VT * logI0(q.kF * swing);
    const shiftR = VT * logI0(q.kR * swing);
    const pkBe = this.limit(s * (this.v(B) - this.v(E)) + shiftF, q.vbePrev, VT, q.vcrit);
    const pkBc = this.limit(s * (this.v(B) - this.v(C)) + shiftR, q.vbcPrev, VT, q.vcrit);
    q.vbePrev = pkBe;
    q.vbcPrev = pkBc;
    const vbe = pkBe - shiftF;
    const vbc = pkBc - shiftR;

    const expBe = Math.exp(Math.min(pkBe / VT, 60));
    const expBc = Math.exp(Math.min(pkBc / VT, 60));
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

    // Emitter-base breakdown: a junction from emitter to base that conducts once the base is
    // driven more than bv below the emitter. It shares the emitter junction's RF swing.
    const pkBd = this.limit(
      s * (this.v(E) - this.v(B)) - q.bv + shiftF, q.vbdPrev, VT, q.vcritBd,
    );
    q.vbdPrev = pkBd;
    const vr = pkBd - shiftF;
    const exBd = Math.exp(Math.min(pkBd / VT, 60));
    const ibd = q.isBd * exBd;
    const gbd = (q.isBd / VT) * exBd;
    const ieqBd = ibd - gbd * (vr + q.bv);
    m.add(E, E, gbd);
    m.add(B, B, gbd);
    m.add(E, B, -gbd);
    m.add(B, E, -gbd);
    m.addRhs(E, -s * ieqBd);
    m.addRhs(B, s * ieqBd);
  }
}

function conductance(m: Matrix, a: number, b: number, g: number): void {
  m.add(a, a, g);
  m.add(b, b, g);
  m.add(a, b, -g);
  m.add(b, a, -g);
}

/** A netlist's elements and the nets between them, without their values. */
export function topologyOf(netlist: Netlist): string {
  const parts: string[] = [netlist.ground];
  for (const el of netlist.elements) {
    switch (el.kind) {
      case 'R':
      case 'C':
        parts.push(`${el.kind}:${el.name}:${el.a}:${el.b}`);
        break;
      case 'L':
        parts.push(`L:${el.name}:${el.a}:${el.b}:${el.henries}:${el.esr}`);
        break;
      case 'D':
        parts.push(`D:${el.name}:${el.anode}:${el.cathode}:${el.model}`);
        break;
      case 'Q':
        parts.push(`Q:${el.name}:${el.base}:${el.collector}:${el.emitter}:${el.model}`);
        break;
      case 'V':
        parts.push(`V:${el.name}:${el.p}:${el.n}`);
        break;
      case 'K':
        parts.push(`K:${el.name}:${el.l1}:${el.l2}:${el.k}`);
        break;
    }
  }
  return parts.join('|');
}
