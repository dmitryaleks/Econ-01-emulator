import { describe, expect, it } from 'vitest';
import {
  CIRCUITS, DEVICE_12, DEVICE_13, DEVICE_15, DEVICE_24, DEVICE_26, DEVICE_27, DEVICE_27_ALT,
  DEVICE_28, DEVICE_29, DEVICE_30, DEVICE_6, DEVICE_8, DEVICE_9, loadCircuit, type Circuit,
} from '../src/circuits/index.js';
import { windingSection } from '../src/model/antenna.js';
import { Board } from '../src/model/board.js';
import { MODULE_BY_ID } from '../src/model/catalogue.js';
import { ANTENNA_ROW, FIXED_NETS } from '../src/model/panel.js';
import { buildNetlist, contactKey, type Netlist } from '../src/netlist/build.js';
import { Simulation, dominantFrequency, rms } from '../src/sim/transient.js';
import { matchSchematic } from './schematic.js';

const FS = 96_000;

function measure(
  circuit: Circuit,
  opts: { button?: boolean; tuning?: number; fs?: number } = {},
): { level: number; freq: number } {
  const board = new Board();
  loadCircuit(board, circuit);
  if (opts.button !== undefined) board.controls.buttonDown = opts.button;
  if (opts.tuning !== undefined) board.controls.tuning = opts.tuning;

  const fs = opts.fs ?? FS;
  const sim = new Simulation(buildNetlist(board), fs);
  sim.run(Math.round(fs * 0.05)); // let the operating point settle
  const { samples } = sim.run(Math.round(fs * (circuit.expect.seconds ?? 0.2)));
  return { level: rms(samples), freq: dominantFrequency(samples, fs) };
}

describe('every preset', () => {
  it('stays within the module counts the box contains', () => {
    for (const circuit of CIRCUITS) {
      const used = new Map<string, number>();
      for (const p of circuit.placements) used.set(p.moduleId, (used.get(p.moduleId) ?? 0) + 1);
      for (const [id, count] of used) {
        const def = MODULE_BY_ID.get(id);
        expect(def, `${circuit.id}: unknown module ${id}`).toBeDefined();
        expect(count, `${circuit.id}: ${count}x ${id}, kit has ${def!.qty}`).toBeLessThanOrEqual(
          def!.qty,
        );
      }
    }
  });

  it('places every module successfully', () => {
    for (const circuit of CIRCUITS) {
      const board = new Board();
      loadCircuit(board, circuit);
      expect(board.placements.size, circuit.id).toBe(circuit.placements.length);
    }
  });

  it('declares kitLegal honestly against the two leads the box ships', () => {
    for (const circuit of CIRCUITS) {
      expect(circuit.kitLegal, `${circuit.id}`).toBe((circuit.leads?.length ?? 0) <= 2);
    }
  });
});

/**
 * Device 6's netlist checked component by component against the schematic on page 15, so the
 * transcription stays correct regardless of whether the solver can currently run it. The
 * factory layout also carries spare parts that connect to nothing, so each check asks whether
 * the schematic's part is there, not how many of that value the board holds.
 */
describe('«Мультивибратор» device 6 matches the factory schematic', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_6);
  const netlist = buildNetlist(board);
  const mine = netlist.elements.filter((e) => e.name.includes('@'));

  const joins = joinsIn(netlist);

  // Q1 is the left-hand arm of the schematic (12 кОм base bias), Q2 the right-hand one.
  const q1 = mine.find((e) => e.kind === 'Q' && e.name.startsWith('block_017'));
  const q2 = mine.find((e) => e.kind === 'Q' && e.name.startsWith('block_018'));
  const buttons = (n = netlist) =>
    n.elements.filter((e) => e.kind === 'R' && e.name.startsWith('block_026@'));

  it('has two КТ315Б with a common emitter rail', () => {
    expect(q1?.kind).toBe('Q');
    expect(q2?.kind).toBe('Q');
    if (q1?.kind !== 'Q' || q2?.kind !== 'Q') return;
    expect(q1.emitter).toBe(q2.emitter);
    // The emitter rail is not ground: the button is in the way.
    expect(q1.emitter).not.toBe(netlist.ground);
  });

  it('puts the кнопка between that emitter rail and XT1', () => {
    if (q1?.kind !== 'Q') return;
    const sb = buttons();
    expect(sb.length).toBeGreaterThan(0);
    const nets = new Set(sb.flatMap((e) => (e.kind === 'R' ? [e.a, e.b] : [])));
    expect(nets.has(netlist.ground)).toBe(true);
    expect(nets.has(q1.emitter)).toBe(true);
    // Released, it is an open circuit.
    for (const e of sb) expect(e.kind === 'R' && e.ohms > 1e9).toBe(true);
  });

  it('closes the кнопка when held', () => {
    const held = new Board();
    loadCircuit(held, DEVICE_6);
    held.controls.buttonDown = true;
    const sb = buttons(buildNetlist(held));
    expect(sb.length).toBeGreaterThan(0);
    for (const e of sb) expect(e.kind === 'R' && e.ohms < 1).toBe(true);
  });

  it('loads each collector with 2,2 кОм from the supply', () => {
    if (q1?.kind !== 'Q' || q2?.kind !== 'Q') return;
    expect(joins('R', 2200, 'VCC', q1.collector)).toBe(true);
    expect(joins('R', 2200, 'VCC', q2.collector)).toBe(true);
  });

  it('biases the bases with 12 кОм and 68 кОм from the supply', () => {
    if (q1?.kind !== 'Q' || q2?.kind !== 'Q') return;
    expect(joins('R', 12_000, 'VCC', q1.base)).toBe(true);
    expect(joins('R', 68_000, 'VCC', q2.base)).toBe(true);
  });

  it('cross-couples with 3300 пФ and 0,01 мкФ', () => {
    if (q1?.kind !== 'Q' || q2?.kind !== 'Q') return;
    expect(joins('C', 3300e-12, q2.collector, q1.base)).toBe(true);
    expect(joins('C', 0.01e-6, q1.collector, q2.base)).toBe(true);
  });

  it('couples the output to the amplifier input through 0,01 мкФ', () => {
    if (q2?.kind !== 'Q') return;
    expect(joins('C', 0.01e-6, q2.collector, 'AMP_IN')).toBe(true);
  });

  it('needs no lead and stays within the box', () => {
    expect(DEVICE_6.leads ?? []).toHaveLength(0);
    expect(board.placements.size).toBe(30);
  });
});

/** Is there a resistor or capacitor of this value, on a module, between exactly these nets? */
function joinsIn(netlist: Netlist) {
  const mine = netlist.elements.filter((e) => e.name.includes('@'));
  return (kind: 'R' | 'C', value: number, a: string, b: string): boolean =>
    mine.some(
      (e) =>
        e.kind === kind &&
        (e.kind === 'R' ? e.ohms === value : e.kind === 'C' && e.farads === value) &&
        [e.a, e.b].sort().join('|') === [a, b].sort().join('|'),
    );
}

/** Device 26's netlist checked part by part against the schematic on page 35. */
describe('«Электронная няня» device 26 matches the factory schematic', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_26);
  const netlist = buildNetlist(board);
  const joins = joinsIn(netlist);
  const q = netlist.elements.find((e) => e.kind === 'Q' && e.name.startsWith('block_017'));
  const coils = netlist.elements.filter((e) => e.kind === 'L');
  const l1Start = coils.find((e) => e.kind === 'L' && e.henries === windingSection(100).henries);
  const l1End = coils.find((e) => e.kind === 'L' && e.henries === windingSection(230).henries);
  const ant = netlist.antenna!;
  const clip = (row: number) => netlist.contactNet.get(contactKey({ col: 0, row }, 'W'));

  /** The input node: 680 пФ's far side, the start of L2, and the row-4 clip point. */
  const input = ant.coupling[0];

  it('fills all 30 cells, with the antenna in its slot', () => {
    expect(board.placements.size).toBe(31);
    expect(board.placements.get(`0,${ANTENNA_ROW}`)?.moduleId).toBe('block_019');
    expect(q?.kind).toBe('Q');
  });

  it('puts C10 across the whole of L1, through XT5 and XT6', () => {
    expect(ant.tuned).toEqual([FIXED_NETS.C10_A, FIXED_NETS.C10_B]);
  });

  it('feeds the top of L1 from the supply through 12 кОм and takes the output from it', () => {
    expect(joins('R', 12_000, 'VCC', FIXED_NETS.C10_A)).toBe(true);
    expect(joins('C', 0.01e-6, FIXED_NETS.C10_A, 'AMP_IN')).toBe(true);
  });

  it('puts the collector on the tap of L1 and L2 in the emitter', () => {
    expect(l1Start?.kind).toBe('L');
    expect(l1End?.kind).toBe('L');
    if (q?.kind !== 'Q' || l1Start?.kind !== 'L' || l1End?.kind !== 'L') return;
    expect(l1Start.b).toBe(q.collector);
    expect(l1End.a).toBe(q.collector);
    expect(ant.coupling[1]).toBe(q.emitter);
  });

  it('biases the base from the supply through 680 кОм, 1 МОм and 680 кОм', () => {
    expect(q?.kind).toBe('Q');
    if (q?.kind !== 'Q') return;
    const r = netlist.elements.filter((e) => e.kind === 'R' && e.name.includes('@'));
    const between = (ohms: number, a: string) =>
      r.find((e) => e.kind === 'R' && e.ohms === ohms && (e.a === a || e.b === a));
    const top = between(680_000, 'VCC');
    expect(top?.kind).toBe('R');
    if (top?.kind !== 'R') return;
    const y = top.a === 'VCC' ? top.b : top.a;
    const mid = between(1_000_000, y);
    expect(mid?.kind).toBe('R');
    if (mid?.kind !== 'R') return;
    const z = mid.a === y ? mid.b : mid.a;
    expect(joins('R', 680_000, z, q.base)).toBe(true);
  });

  it('couples the base to the input through 680 пФ', () => {
    expect(q?.kind).toBe('Q');
    if (q?.kind !== 'Q') return;
    expect(joins('C', 680e-12, q.base, input)).toBe(true);
  });

  it('decouples the supply with 20 мкФ, + on the supply', () => {
    const el = netlist.elements.find(
      (e) => e.kind === 'C' && e.farads === 20e-6 && e.name.startsWith('block_014'),
    );
    expect(el?.kind === 'C' && el.a === 'VCC' && el.b === netlist.ground).toBe(true);
  });

  it('brings the probe wires to the left contacts of rows 1 and 4', () => {
    expect(clip(0)).toBe(netlist.ground);
    expect(clip(3)).toBe(input);
  });
});

/** Device 9's netlist checked part by part against the schematic on page 18. */
describe('«Пищалка» device 9 matches the factory schematic', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_9);
  const netlist = buildNetlist(board);
  const joins = joinsIn(netlist);
  const transistor = (block: string) =>
    netlist.elements.find((e) => e.kind === 'Q' && e.name.startsWith(block));
  const left = transistor('block_018');
  const right = transistor('block_017');

  it('fills all 30 cells with no antenna and no lead', () => {
    expect(board.placements.size).toBe(30);
    expect(DEVICE_9.leads ?? []).toHaveLength(0);
    expect(left?.kind).toBe('Q');
    expect(right?.kind).toBe('Q');
  });

  it('builds the left stage: 68 кОм load, 680 кОм and 0,01 мкФ from collector to base', () => {
    if (left?.kind !== 'Q') return;
    expect(joins('R', 68_000, 'VCC', left.collector)).toBe(true);
    expect(joins('R', 680_000, left.collector, left.base)).toBe(true);
    expect(joins('C', 0.01e-6, left.collector, left.base)).toBe(true);
  });

  it('keys the left emitter through 2,2 кОм and the кнопка to ground', () => {
    if (left?.kind !== 'Q') return;
    const r = netlist.elements.find(
      (e) => e.kind === 'R' && e.ohms === 2_200 && [e.a, e.b].includes(left.emitter),
    );
    expect(r?.kind).toBe('R');
    if (r?.kind !== 'R') return;
    const far = r.a === left.emitter ? r.b : r.a;
    const key = netlist.elements.find((e) => e.kind === 'R' && e.name.startsWith('block_026@'));
    expect(key?.kind === 'R' && [key.a, key.b].sort()).toEqual([far, netlist.ground].sort());
  });

  it('builds the right stage and closes the loop', () => {
    if (left?.kind !== 'Q' || right?.kind !== 'Q') return;
    expect(joins('C', 680e-12, left.collector, right.base)).toBe(true);
    expect(joins('R', 1_000_000, 'VCC', right.base)).toBe(true);
    expect(joins('R', 2_200, 'VCC', right.collector)).toBe(true);
    expect(right.emitter).toBe(netlist.ground);
    expect(joins('C', 0.01e-6, right.collector, left.base)).toBe(true);
  });

  it('feeds XT4 through 3300 пФ and decouples the supply with 20 мкФ, + on the supply', () => {
    if (right?.kind !== 'Q') return;
    expect(joins('C', 3300e-12, right.collector, FIXED_NETS.AMP_IN)).toBe(true);
    const el = netlist.elements.find((e) => e.kind === 'C' && e.farads === 20e-6);
    expect(el?.kind === 'C' && el.a === 'VCC' && el.b === netlist.ground).toBe(true);
  });

  it('leaves the 1 МОм at (1,0), 12 кОм at (1,4) and 0,01 мкФ at (0,4) loose at one end', () => {
    for (const where of ['block_008@1,0', 'block_002@1,4', 'block_013@0,4']) {
      const el = netlist.elements.find((e) => e.name.startsWith(where));
      expect(el?.kind === 'R' || el?.kind === 'C', where).toBe(true);
      if (el?.kind !== 'R' && el?.kind !== 'C') continue;
      const loose = [el.a, el.b].filter(
        (net) => netlist.elements.filter((e) => elementTouches(e, net)).length === 1,
      );
      expect(loose, where).toHaveLength(1);
    }
  });
});

function elementTouches(e: Netlist['elements'][number], net: string): boolean {
  switch (e.kind) {
    case 'R': case 'C': case 'L': return e.a === net || e.b === net;
    case 'D': return e.anode === net || e.cathode === net;
    case 'Q': return e.base === net || e.collector === net || e.emitter === net;
    case 'V': return e.p === net || e.n === net;
    default: return false;
  }
}

/** Device 27's netlist checked part by part against the schematic on page 36, and its variant. */
describe('slow multivibrator, device 8', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_8);
  const netlist = buildNetlist(board);

  it('fills all 30 cells with no lead', () => {
    expect(board.placements.size).toBe(30);
    expect(DEVICE_8.leads ?? []).toHaveLength(0);
  });

  it('is the schematic on page 17, spares aside', () => {
    expect(
      matchSchematic(netlist, {
        fixed: { GND: netlist.ground, VCC: 'VCC', OUT: 'AMP_IN' },
        parts: [
          { kind: 'Q', b: 'B1', c: 'C1', e: 'GND' },
          { kind: 'Q', b: 'B2', c: 'C2', e: 'GND' },
          { kind: 'R', ohms: 2.2e3, a: 'VCC', b: 'C1' },
          { kind: 'R', ohms: 12e3, a: 'VCC', b: 'B2' },
          { kind: 'R', ohms: 680e3, a: 'VCC', b: 'B1' },
          { kind: 'R', ohms: 68e3, a: 'VCC', b: 'B1' },
          { kind: 'R', ohms: 2.2e3, a: 'VCC', b: 'C2' },
          { kind: 'C', farads: 20e-6, a: 'C1', b: 'B2', polar: true },
          { kind: 'C', farads: 20e-6, a: 'C2', b: 'B1', polar: true },
          { kind: 'C', farads: 0.01e-6, a: 'C2', b: 'OUT' },
          { kind: 'C', farads: 0.01e-6, a: 'C2', b: 'OUT' },
        ],
      }),
    ).toEqual([]);
  });

  it('switches about once a second, the same at 12 and 48 кГц', () => {
    const out = netlist.elements.find(
      (e) => e.kind === 'C' && e.farads === 0.01e-6 && (e.a === 'AMP_IN' || e.b === 'AMP_IN'),
    );
    const c2 = out?.kind === 'C' ? (out.a === 'AMP_IN' ? out.b : out.a) : '';
    const periods = [12_000, 48_000].map((fs) => {
      const sim = new Simulation(netlist, fs);
      const rising: number[] = [];
      let was = sim.circuit.voltageAt(c2);
      for (let i = 0; i < fs * 4; i++) {
        sim.sample();
        const v = sim.circuit.voltageAt(c2);
        if (was < 4 && v >= 4) rising.push(i / fs);
        was = v;
      }
      expect(rising.length, `${fs}: edges`).toBeGreaterThanOrEqual(3);
      return (rising.at(-1)! - rising[0]!) / (rising.length - 1);
    });
    expect(periods[0]).toBeGreaterThan(0.8);
    expect(periods[0]).toBeLessThan(1.4);
    expect(Math.abs(periods[1]! - periods[0]!) / periods[0]!).toBeLessThan(0.02);
  });
});

describe('«Сирена» device 12', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_12);
  const netlist = buildNetlist(board);

  it('fills all 30 cells with no lead', () => {
    expect(board.placements.size).toBe(30);
    expect(DEVICE_12.leads ?? []).toHaveLength(0);
  });

  it('is the schematic on page 21, spares aside', () => {
    expect(
      matchSchematic(netlist, {
        fixed: { GND: netlist.ground, VCC: 'VCC', OUT: 'AMP_IN' },
        parts: [
          { kind: 'Q', b: 'B1', c: 'C1', e: 'E1' },
          { kind: 'Q', b: 'B2', c: 'C2', e: 'GND' },
          { kind: 'R', ohms: 68e3, a: 'VCC', b: 'B1' },
          { kind: 'R', ohms: 12e3, a: 'VCC', b: 'C1' },
          { kind: 'R', ohms: 1e6, a: 'VCC', b: 'B2' },
          { kind: 'R', ohms: 2.2e3, a: 'VCC', b: 'C2' },
          { kind: 'C', farads: 3300e-12, a: 'C1', b: 'B2' },
          { kind: 'C', farads: 0.01e-6, a: 'C2', b: 'B1' },
          { kind: 'C', farads: 0.01e-6, a: 'C2', b: 'OUT' },
          { kind: 'C', farads: 20e-6, a: 'E1', b: 'GND', polar: true },
          { kind: 'key', a: 'E1', b: 'GND' },
        ],
      }),
    ).toEqual([]);
  });

  /** Hold the кнопка for `held` seconds from the start, then let go; windows are after release. */
  const run = (fs: number, held: number, windows: Array<[number, number]>) => {
    const b = new Board();
    loadCircuit(b, DEVICE_12);
    b.controls.buttonDown = true;
    const sim = new Simulation(buildNetlist(b), fs);
    sim.run(Math.round(fs * held));
    b.controls.buttonDown = false;
    expect(sim.update(buildNetlist(b))).toBe(true);
    const out: Array<{ level: number; freq: number }> = [];
    let t = 0;
    for (const [from, to] of windows) {
      sim.run(Math.round(fs * (from - t)));
      const { samples } = sim.run(Math.round(fs * (to - from)));
      out.push({ level: rms(samples), freq: dominantFrequency(samples, fs) });
      t = to;
    }
    return out;
  };

  it('let go, climbs in pitch, then dies away; the same at 24 and 48 кГц', () => {
    for (const fs of [24_000, 48_000]) {
      const [start, top, end] = run(fs, 0.3, [[0, 0.1], [0.35, 0.5], [2.2, 2.4]]);
      expect(start!.level, `${fs}: sounding at release`).toBeGreaterThan(0.5);
      expect(start!.freq, `${fs}: starts low`).toBeLessThan(700);
      expect(top!.freq, `${fs}: climbs`).toBeGreaterThan(1.8 * start!.freq);
      expect(end!.level, `${fs}: silent once charged`).toBeLessThan(0.02);
    }
  });
});

describe('«Звуковой генератор» device 13', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_13);
  const netlist = buildNetlist(board);

  it('fills all 30 cells; its output wires have loose ends and are not placed', () => {
    expect(board.placements.size).toBe(30);
    expect(DEVICE_13.leads ?? []).toHaveLength(0);
  });

  it('is the schematic on page 22, spares aside', () => {
    expect(
      matchSchematic(netlist, {
        fixed: { GND: netlist.ground, VCC: 'VCC', OUT: 'AMP_IN' },
        parts: [
          { kind: 'Q', b: 'B1', c: 'P', e: 'E1' },
          { kind: 'Q', b: 'B2', c: 'C2', e: 'GND' },
          { kind: 'R', ohms: 68e3, a: 'VCC', b: 'P' },
          { kind: 'R', ohms: 1e6, a: 'P', b: 'B1' },
          { kind: 'R', ohms: 2.2e3, a: 'E1', b: 'GND' },
          { kind: 'C', farads: 680e-12, a: 'P', b: 'B2' },
          { kind: 'R', ohms: 1e6, a: 'VCC', b: 'B2' },
          { kind: 'R', ohms: 12e3, a: 'VCC', b: 'C2' },
          { kind: 'C', farads: 3300e-12, a: 'C2', b: 'B1' },
          { kind: 'C', farads: 0.01e-6, a: 'C2', b: 'OUT' },
          // «Выход 2» and «Выход 1», whose wires leave the panel.
          { kind: 'C', farads: 0.01e-6, a: 'C2', b: 'OUT2' },
          { kind: 'C', farads: 0.01e-6, a: 'E1', b: 'OUT1' },
          { kind: 'C', farads: 20e-6, a: 'VCC', b: 'GND', polar: true },
        ],
      }),
    ).toEqual([]);
  });

  it('brings «Выход 1» to the left contact of row 4 and «Выход 2» to the bottom of (5,4)', () => {
    const caps = netlist.elements.filter((e) => e.kind === 'C' && e.farads === 0.01e-6);
    const touches = (net: string | undefined) =>
      caps.some((e) => e.kind === 'C' && (e.a === net || e.b === net));
    expect(touches(netlist.contactNet.get(contactKey({ col: 0, row: 3 }, 'W')))).toBe(true);
    expect(touches(netlist.contactNet.get(contactKey({ col: 5, row: 4 }, 'S')))).toBe(true);
  });
});

describe('Morse generator with interference, device 15', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_15);
  const netlist = buildNetlist(board);

  it('fills all 30 cells with no lead', () => {
    expect(board.placements.size).toBe(30);
    expect(DEVICE_15.leads ?? []).toHaveLength(0);
  });

  it('is the schematic on page 24, spares aside', () => {
    expect(
      matchSchematic(netlist, {
        fixed: { GND: netlist.ground, VCC: 'VCC', OUT: 'AMP_IN' },
        parts: [
          { kind: 'Q', b: 'B1', c: 'C1', e: 'GND' },
          { kind: 'Q', b: 'B2', c: 'C2', e: 'GND' },
          { kind: 'R', ohms: 2.2e3, a: 'VCC', b: 'C1' },
          { kind: 'R', ohms: 680e3, a: 'VCC', b: 'B1' },
          { kind: 'R', ohms: 1e6, a: 'VCC', b: 'B2' },
          { kind: 'R', ohms: 2.2e3, a: 'VCC', b: 'C2' },
          { kind: 'C', farads: 680e-12, a: 'C1', b: 'B2' },
          { kind: 'C', farads: 0.01e-6, a: 'C2', b: 'B1' },
          { kind: 'C', farads: 3300e-12, a: 'C2', b: 'OUT' },
          { kind: 'C', farads: 0.01e-6, a: 'C1', b: 'K' },
          { kind: 'key', a: 'K', b: 'B2' },
        ],
      }),
    ).toEqual([]);
  });

  it('keeps its pitch, released and held, from 24 to 96 кГц', () => {
    const at = (fs: number, button: boolean) => measure(DEVICE_15, { fs, button });
    for (const button of [false, true]) {
      const ref = at(96_000, button).freq;
      for (const fs of [24_000, 48_000]) {
        expect(Math.abs(at(fs, button).freq - ref) / ref, `${fs}, held ${button}`).toBeLessThan(0.08);
      }
    }
  });
});

describe('«Двухтональный генератор» device 27 matches the factory schematic', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_27);
  const netlist = buildNetlist(board);
  const joins = joinsIn(netlist);
  const q = netlist.elements.find((e) => e.kind === 'Q' && e.name.startsWith('block_017'));
  const ant = netlist.antenna!;
  const coils = netlist.elements.filter((e) => e.kind === 'L');
  const l1Start = coils.find((e) => e.kind === 'L' && e.henries === windingSection(100).henries);
  const l1End = coils.find((e) => e.kind === 'L' && e.henries === windingSection(230).henries);
  /** L2's return: the far end of the coupling winding from the emitter. */
  const ret = ant.coupling[0];
  const keyOf = (n: Netlist) =>
    n.elements.find((e) => e.kind === 'R' && e.name.startsWith('block_026@'));

  it('fills all 30 cells, with the antenna in its slot', () => {
    expect(board.placements.size).toBe(31);
    expect(board.placements.get(`0,${ANTENNA_ROW}`)?.moduleId).toBe('block_019');
    expect(DEVICE_27.leads ?? []).toHaveLength(0);
  });

  it('builds the same antenna oscillator as device 26', () => {
    expect(q?.kind).toBe('Q');
    if (q?.kind !== 'Q' || l1Start?.kind !== 'L' || l1End?.kind !== 'L') return;
    expect(ant.tuned).toEqual([FIXED_NETS.C10_A, FIXED_NETS.C10_B]);
    expect(joins('R', 12_000, 'VCC', FIXED_NETS.C10_A)).toBe(true);
    expect(joins('C', 0.01e-6, FIXED_NETS.C10_A, 'AMP_IN')).toBe(true);
    expect(l1Start.b).toBe(q.collector);
    expect(l1End.a).toBe(q.collector);
    expect(ant.coupling[1]).toBe(q.emitter);
  });

  it('biases the base from the supply through 1 МОм, 1 МОм and 680 кОм', () => {
    if (q?.kind !== 'Q') return;
    const r = netlist.elements.filter((e) => e.kind === 'R' && e.name.includes('@'));
    const from = (ohms: number, at: string) =>
      r.find((e) => e.kind === 'R' && e.ohms === ohms && (e.a === at || e.b === at));
    const top = from(1_000_000, 'VCC');
    expect(top?.kind).toBe('R');
    if (top?.kind !== 'R') return;
    const y = top.a === 'VCC' ? top.b : top.a;
    const mid = r.find(
      (e) => e !== top && e.kind === 'R' && e.ohms === 1_000_000 && [e.a, e.b].includes(y),
    );
    expect(mid?.kind).toBe('R');
    if (mid?.kind !== 'R') return;
    const z = mid.a === y ? mid.b : mid.a;
    expect(joins('R', 680_000, z, q.base)).toBe(true);
  });

  it('returns L2 and the 680 пФ from the base through 68 кОм, 3300 пФ and the кнопка', () => {
    if (q?.kind !== 'Q') return;
    expect(joins('C', 680e-12, q.base, ret)).toBe(true);
    expect(joins('R', 68_000, ret, netlist.ground)).toBe(true);
    expect(joins('C', 3300e-12, ret, netlist.ground)).toBe(true);
    const key = keyOf(netlist);
    expect(key?.kind === 'R' && [key.a, key.b].sort()).toEqual([ret, netlist.ground].sort());
  });

  it('decouples the supply with 20 мкФ, + on the supply', () => {
    const el = netlist.elements.find((e) => e.kind === 'C' && e.farads === 20e-6);
    expect(el?.kind === 'C' && el.a === 'VCC' && el.b === netlist.ground).toBe(true);
  });

  it('swaps in 0,01 мкФ for the other tones, which only works turned 180° from the drawing', () => {
    const variant = new Board();
    loadCircuit(variant, DEVICE_27_ALT);
    const turned = buildNetlist(variant);
    expect(joinsIn(turned)('C', 0.01e-6, turned.antenna!.coupling[0], turned.ground)).toBe(true);
    expect(joinsIn(turned)('C', 3300e-12, turned.antenna!.coupling[0], turned.ground)).toBe(false);

    // As drawn beside the panel, the tee's joined corner reaches the top strip: L2's return is
    // tied to ground for good.
    const asDrawn = new Board();
    loadCircuit(asDrawn, DEVICE_27_ALT);
    asDrawn.remove({ col: 0, row: 1 });
    asDrawn.place('block_009', { col: 0, row: 1 }, 3);
    const shorted = buildNetlist(asDrawn);
    expect(shorted.antenna!.coupling[0]).toBe(shorted.ground);
  });
});

/** Device 24's netlist checked part by part against the schematic on page 33, and its timing. */
describe('«Генератор сигналов» device 28', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_28);
  const netlist = buildNetlist(board);

  it('fills all 30 cells, with the antenna in its slot', () => {
    expect(board.placements.size).toBe(31);
    expect(board.placements.get(`0,${ANTENNA_ROW}`)?.moduleId).toBe('block_019');
    expect(DEVICE_28.leads ?? []).toHaveLength(0);
  });

  it('is the schematic on page 37, spares aside', () => {
    expect(
      matchSchematic(netlist, {
        fixed: { GND: netlist.ground, VCC: 'VCC', OUT: 'AMP_IN' },
        parts: [
          { kind: 'antenna', top: 'T', tap: 'X', end: 'Y', l2a: 'GND', l2b: 'E' },
          { kind: 'Q', b: 'B', c: 'X', e: 'E' },
          { kind: 'R', ohms: 12e3, a: 'VCC', b: 'T' },
          { kind: 'C', farads: 0.01e-6, a: 'T', b: 'OUT' },
          { kind: 'R', ohms: 1e6, a: 'VCC', b: 'N1' },
          { kind: 'R', ohms: 1e6, a: 'N1', b: 'N2' },
          { kind: 'R', ohms: 680e3, a: 'N2', b: 'B' },
          { kind: 'C', farads: 680e-12, a: 'B', b: 'GND' },
          { kind: 'C', farads: 20e-6, a: 'VCC', b: 'GND', polar: true },
          // Not on the schematic: a second 20 мкФ beside the first.
          { kind: 'C', farads: 20e-6, a: 'VCC', b: 'GND', polar: true },
        ],
      }),
    ).toEqual([]);
  });

  it('squegs at the same rate at 24 and 48 кГц', () => {
    const at24 = measure(DEVICE_28, { fs: 24_000 });
    const at48 = measure(DEVICE_28, { fs: 48_000 });
    expect(at24.level).toBeGreaterThan(0.5);
    expect(Math.abs(at24.freq - at48.freq) / at48.freq).toBeLessThan(0.03);
  });
});

describe('«Метроном» device 29', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_29);
  const netlist = buildNetlist(board);

  it('fills all 30 cells, with the antenna in its slot', () => {
    expect(board.placements.size).toBe(31);
    expect(board.placements.get(`0,${ANTENNA_ROW}`)?.moduleId).toBe('block_019');
  });

  it('is the schematic on page 38, spares aside: C10 across the long section only', () => {
    expect(
      matchSchematic(netlist, {
        fixed: { GND: netlist.ground, VCC: 'VCC', OUT: 'AMP_IN', TAP: FIXED_NETS.C10_A },
        parts: [
          { kind: 'antenna', top: 'T', tap: 'TAP', end: 'Y', l2a: 'GND', l2b: 'E' },
          { kind: 'Q', b: 'B', c: 'TAP', e: 'E' },
          { kind: 'R', ohms: 12e3, a: 'VCC', b: 'T' },
          { kind: 'C', farads: 0.01e-6, a: 'T', b: 'OUT' },
          { kind: 'R', ohms: 680e3, a: 'VCC', b: 'B' },
          { kind: 'C', farads: 20e-6, a: 'B', b: 'M', polar: true },
          { kind: 'C', farads: 20e-6, a: 'M', b: 'GND', polar: true },
        ],
      }),
    ).toEqual([]);
    expect(netlist.antenna!.tuned[1]).toBe(FIXED_NETS.C10_B);
  });

  it('ticks roughly twelve times a second', () => {
    const fs = 24_000;
    const sim = new Simulation(netlist, fs);
    const ticks: number[] = [];
    for (let i = 0; i < fs * 1.5; i++) {
      const s = sim.sample();
      if (Math.abs(s) > 1 && (ticks.length === 0 || i / fs - ticks.at(-1)! > 0.03)) ticks.push(i / fs);
    }
    expect(ticks.length).toBeGreaterThan(10);
    expect(ticks.length).toBeLessThan(25);
  });
});

describe('«Морзянка» device 30', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_30);
  const netlist = buildNetlist(board);

  it('fills all 30 cells, with the antenna in its slot', () => {
    expect(board.placements.size).toBe(31);
    expect(board.placements.get(`0,${ANTENNA_ROW}`)?.moduleId).toBe('block_019');
  });

  it('is the schematic on page 39, spares aside', () => {
    expect(
      matchSchematic(netlist, {
        fixed: { GND: netlist.ground, VCC: 'VCC', OUT: 'AMP_IN' },
        parts: [
          { kind: 'antenna', top: 'T', tap: 'X', end: 'Y', l2a: 'K', l2b: 'E' },
          { kind: 'Q', b: 'B', c: 'X', e: 'E' },
          { kind: 'R', ohms: 12e3, a: 'VCC', b: 'T' },
          { kind: 'C', farads: 0.01e-6, a: 'T', b: 'OUT' },
          { kind: 'R', ohms: 1e6, a: 'VCC', b: 'N1' },
          { kind: 'R', ohms: 1e6, a: 'N1', b: 'N2' },
          { kind: 'R', ohms: 680e3, a: 'N2', b: 'B' },
          { kind: 'C', farads: 680e-12, a: 'B', b: 'K' },
          { kind: 'key', a: 'K', b: 'GND' },
          { kind: 'C', farads: 20e-6, a: 'VCC', b: 'GND', polar: true },
        ],
      }),
    ).toEqual([]);
  });
});

describe('«Реле времени» device 24 matches the factory schematic', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_24);
  const released = buildNetlist(board);
  const heldBoard = new Board();
  loadCircuit(heldBoard, DEVICE_24);
  heldBoard.controls.buttonDown = true;
  const held = buildNetlist(heldBoard);
  const joins = joinsIn(released);
  const q = released.elements.find((e) => e.kind === 'Q');
  const timing = released.elements.find((e) => e.kind === 'C' && e.name.startsWith('block_015'));
  const ant = released.antenna!;

  /** The timing node: the + side of the 20 мкФ that is not on the supply. */
  const z = timing?.kind === 'C' ? timing.a : '';

  it('fills all 30 cells, with the antenna in its slot', () => {
    expect(board.placements.size).toBe(31);
    expect(DEVICE_24.leads ?? []).toHaveLength(0);
    expect(q?.kind).toBe('Q');
  });

  it('builds the same antenna oscillator as device 26', () => {
    if (q?.kind !== 'Q') return;
    expect(ant.tuned).toEqual([FIXED_NETS.C10_A, FIXED_NETS.C10_B]);
    expect(joins('R', 12_000, 'VCC', FIXED_NETS.C10_A)).toBe(true);
    expect(joins('C', 0.01e-6, FIXED_NETS.C10_A, 'AMP_IN')).toBe(true);
    expect(ant.coupling).toEqual([released.ground, q.emitter]);
  });

  it('feeds the base from the timing capacitor through 680 кОм + 680 кОм', () => {
    if (q?.kind !== 'Q' || timing?.kind !== 'C') return;
    expect(timing.farads).toBe(20e-6);
    expect(timing.b).toBe(released.ground);
    const r680 = released.elements.filter((e) => e.kind === 'R' && e.ohms === 680_000);
    const first = r680.find((e) => e.kind === 'R' && [e.a, e.b].includes(z));
    expect(first?.kind).toBe('R');
    if (first?.kind !== 'R') return;
    const mid = first.a === z ? first.b : first.a;
    expect(joins('R', 680_000, mid, q.base)).toBe(true);
    expect(joins('C', 3300e-12, q.base, released.ground)).toBe(true);
    expect(joins('C', 680e-12, q.base, released.ground)).toBe(true);
  });

  it('switches 68 кОм from the supply onto the timing capacitor with the кнопка', () => {
    const r68 = released.elements.find(
      (e) => e.kind === 'R' && e.ohms === 68_000 && [e.a, e.b].includes('VCC'),
    );
    expect(r68?.kind).toBe('R');
    if (r68?.kind !== 'R') return;
    const far = r68.a === 'VCC' ? r68.b : r68.a;
    const sb = (n: Netlist) =>
      n.elements.find(
        (e) =>
          e.kind === 'R' &&
          e.name.startsWith('block_026@') &&
          [e.a, e.b].sort().join('|') === [far, z].sort().join('|'),
      );
    const off = sb(released);
    const on = sb(held);
    expect(off?.kind === 'R' && off.ohms > 1e9).toBe(true);
    expect(on?.kind === 'R' && on.ohms < 1).toBe(true);
  });

  it('decouples the supply with the other 20 мкФ', () => {
    const el = released.elements.find((e) => e.kind === 'C' && e.name.startsWith('block_014'));
    expect(el?.kind === 'C' && el.a === 'VCC' && el.b === released.ground).toBe(true);
  });

  it('charges while the кнопка is held and holds the charge after it is let go', () => {
    const fs = 8_000;
    const sim = new Simulation(released, fs);
    sim.run(fs * 0.2);
    expect(sim.circuit.voltageAt(z)).toBeLessThan(1);

    expect(sim.update(held)).toBe(true);
    sim.run(fs * 1.5); // about one 68 кОм × 20 мкФ time constant
    const charged = sim.circuit.voltageAt(z);
    expect(charged).toBeGreaterThan(4);

    expect(sim.update(released)).toBe(true);
    sim.run(fs * 2);
    // It runs down only through the 1,36 МОм base chain, over tens of seconds.
    const later = sim.circuit.voltageAt(z);
    expect(later).toBeLessThan(charged);
    expect(later).toBeGreaterThan(charged * 0.85);
  });
});

describe('presets the solver can run', () => {
  for (const circuit of CIRCUITS.filter((c) => c.simulates)) {
    it(`«${circuit.title}» behaves as documented`, () => {
      const e = circuit.expect;
      if (e.gatedByButton) {
        expect(measure(circuit, { button: false }).level, 'with the кнопка up').toBeLessThan(0.02);
      }
      const base = measure(circuit, e.gatedByButton || e.whileHeld ? { button: true } : {});

      if (e.silent) {
        expect(base.level).toBeLessThan(0.02);
        return;
      }
      expect(base.level, 'output level').toBeGreaterThan(e.minRms ?? 0.05);

      if (e.freqHz) {
        expect(base.freq, 'frequency').toBeGreaterThan(e.freqHz[0]);
        expect(base.freq, 'frequency').toBeLessThan(e.freqHz[1]);
      }
      if (e.offTuneBelow !== undefined) {
        expect(measure(circuit, { tuning: 0.5 }).level, 'off tune').toBeLessThan(e.offTuneBelow);
      }
      if (e.buttonShiftsPitch !== undefined) {
        const held = measure(circuit, { button: true });
        expect(held.level, 'with the кнопка held').toBeGreaterThan(e.minRms ?? 0.05);
        const shift = Math.abs(held.freq - base.freq) / base.freq;
        expect(shift, 'pitch shift with the кнопка held').toBeGreaterThan(e.buttonShiftsPitch);
      }
    });
  }

  /**
   * Guard rail: if the solver starts running these, the flag is stale and must be updated. Not
   * running means silent, or a sound whose pitch moves with the sample rate — an oscillation too
   * fast for the step, which is a numerical artefact rather than the circuit.
   */
  for (const circuit of CIRCUITS.filter((c) => !c.simulates)) {
    it(`«${circuit.title}» is still not reproduced, as flagged`, () => {
      const at48 = measure(circuit, { button: true, fs: 48_000 });
      const at96 = measure(circuit, { button: true, fs: 96_000 });
      if (at96.level < 0.02) return;
      expect(Math.abs(at96.freq - at48.freq) / at96.freq).toBeGreaterThan(0.1);
    });
  }
});
