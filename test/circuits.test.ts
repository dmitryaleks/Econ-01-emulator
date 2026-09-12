import { describe, expect, it } from 'vitest';
import { CIRCUITS, DEVICE_6, loadCircuit, type Circuit } from '../src/circuits/index.js';
import { Board } from '../src/model/board.js';
import { MODULE_BY_ID } from '../src/model/catalogue.js';
import { buildNetlist, type NlElement } from '../src/netlist/build.js';
import { Simulation, dominantFrequency, rms } from '../src/sim/transient.js';

const FS = 96_000;

function measure(
  circuit: Circuit,
  opts: { button?: boolean; tuning?: number } = {},
): { level: number; freq: number } {
  const board = new Board();
  loadCircuit(board, circuit);
  if (opts.button !== undefined) board.controls.buttonDown = opts.button;
  if (opts.tuning !== undefined) board.controls.tuning = opts.tuning;

  const sim = new Simulation(buildNetlist(board), FS);
  sim.run(Math.round(FS * 0.05)); // let the operating point settle
  const { samples } = sim.run(Math.round(FS * (circuit.expect.seconds ?? 0.2)));
  return { level: rms(samples), freq: dominantFrequency(samples, FS) };
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
 * transcription stays correct regardless of whether the solver can currently run it.
 */
describe('«Мультивибратор» device 6 matches the factory schematic', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_6);
  const netlist = buildNetlist(board);
  const mine = netlist.elements.filter((e) => e.name.includes('@'));

  const node = (kind: NlElement['kind'], value: number): string[] => {
    const el = mine.find(
      (e) =>
        e.kind === kind &&
        ((e.kind === 'R' && e.ohms === value) || (e.kind === 'C' && e.farads === value)),
    );
    expect(el, `no ${kind} of ${value}`).toBeDefined();
    return el!.kind === 'R' || el!.kind === 'C' ? [el!.a, el!.b] : [];
  };

  const q1 = mine.find((e) => e.kind === 'Q' && e.name.startsWith('q315-a'));
  const q2 = mine.find((e) => e.kind === 'Q' && e.name.startsWith('q315-b'));

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
    const sb = netlist.elements.find((e) => e.name.startsWith('sb@'));
    expect(sb?.kind).toBe('R');
    if (sb?.kind !== 'R') return;
    expect([sb.a, sb.b].sort()).toEqual([netlist.ground, q1.emitter].sort());
    // Released, it is an open circuit.
    expect(sb.ohms).toBeGreaterThan(1e9);
  });

  it('closes the кнопка when held', () => {
    const held = new Board();
    loadCircuit(held, DEVICE_6);
    held.controls.buttonDown = true;
    const sb = buildNetlist(held).elements.find((e) => e.name.startsWith('sb@'));
    expect(sb?.kind === 'R' && sb.ohms < 1).toBe(true);
  });

  it('loads each collector with 2,2 кОм from the supply', () => {
    if (q1?.kind !== 'Q' || q2?.kind !== 'Q') return;
    const loads = mine.filter((e) => e.kind === 'R' && e.ohms === 2200);
    expect(loads).toHaveLength(2);
    const collectors = new Set([q1.collector, q2.collector]);
    for (const l of loads) {
      if (l.kind !== 'R') continue;
      expect([l.a, l.b]).toContain('VCC');
      expect(collectors.has(l.a) || collectors.has(l.b)).toBe(true);
    }
  });

  it('biases the bases with 12 кОм and 68 кОм from the supply', () => {
    if (q1?.kind !== 'Q' || q2?.kind !== 'Q') return;
    expect(node('R', 12_000).sort()).toEqual(['VCC', q1.base].sort());
    expect(node('R', 68_000).sort()).toEqual(['VCC', q2.base].sort());
  });

  it('cross-couples with 0,01 мкФ and 3300 пФ', () => {
    if (q1?.kind !== 'Q' || q2?.kind !== 'Q') return;
    // 3300 pF from Q2's collector to Q1's base.
    expect(node('C', 3300e-12).sort()).toEqual([q2.collector, q1.base].sort());
    // One of the two 0,01 мкФ caps runs from Q1's collector to Q2's base.
    const tens = mine.filter((e) => e.kind === 'C' && e.farads === 0.01e-6);
    expect(tens).toHaveLength(2);
    const wanted = [q1.collector, q2.base].sort().join('|');
    expect(tens.some((c) => c.kind === 'C' && [c.a, c.b].sort().join('|') === wanted)).toBe(true);
  });

  it('couples the output to the amplifier input through 0,01 мкФ', () => {
    if (q2?.kind !== 'Q') return;
    const tens = mine.filter((e) => e.kind === 'C' && e.farads === 0.01e-6);
    const wanted = ['AMP_IN', q2.collector].sort().join('|');
    expect(tens.some((c) => c.kind === 'C' && [c.a, c.b].sort().join('|') === wanted)).toBe(true);
  });
});

describe('presets the solver can run', () => {
  for (const circuit of CIRCUITS.filter((c) => c.simulates)) {
    it(`«${circuit.title}» behaves as documented`, () => {
      const e = circuit.expect;
      const base = measure(circuit);

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
    });
  }

  /** Guard rail: if the solver starts running these, the flag is stale and must be updated. */
  for (const circuit of CIRCUITS.filter((c) => !c.simulates)) {
    it(`«${circuit.title}» is still silent, as flagged`, () => {
      expect(measure(circuit, { button: true }).level).toBeLessThan(0.02);
    });
  }
});
