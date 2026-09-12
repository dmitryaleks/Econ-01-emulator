import { describe, expect, it } from 'vitest';
import { CIRCUITS, DEVICE_6, loadCircuit, type Circuit } from '../src/circuits/index.js';
import { Board } from '../src/model/board.js';
import { MODULE_BY_ID } from '../src/model/catalogue.js';
import { buildNetlist } from '../src/netlist/build.js';
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
 * transcription stays correct regardless of whether the solver can currently run it. The
 * factory layout also carries spare parts that connect to nothing, so each check asks whether
 * the schematic's part is there, not how many of that value the board holds.
 */
describe('«Мультивибратор» device 6 matches the factory schematic', () => {
  const board = new Board();
  loadCircuit(board, DEVICE_6);
  const netlist = buildNetlist(board);
  const mine = netlist.elements.filter((e) => e.name.includes('@'));

  /** Is there a resistor or capacitor of this value between exactly these two nets? */
  const joins = (kind: 'R' | 'C', value: number, a: string, b: string): boolean =>
    mine.some(
      (e) =>
        e.kind === kind &&
        (e.kind === 'R' ? e.ohms === value : e.kind === 'C' && e.farads === value) &&
        [e.a, e.b].sort().join('|') === [a, b].sort().join('|'),
    );

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
