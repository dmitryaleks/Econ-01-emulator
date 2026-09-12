import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board.js';
import { buildNetlist } from '../src/netlist/build.js';
import { Simulation } from '../src/sim/transient.js';

/** A board of roughly the size the 30 manual circuits reach. */
function busyBoard(): Board {
  const board = new Board();
  board.controls.volume = 0.7;
  board.place('q315-a', { col: 2, row: 2 });
  board.place('q315-b', { col: 3, row: 2 });
  board.place('r2k2-o', { col: 1, row: 2 });
  board.place('r2k2-o', { col: 4, row: 2 });
  board.place('c10n-o', { col: 1, row: 3 });
  board.place('c10n-a', { col: 4, row: 3 });
  board.place('r68k-o', { col: 2, row: 1 });
  board.place('r680k-o', { col: 3, row: 1 });
  board.place('j-liniya', { col: 0, row: 1 });
  board.place('j-troynik', { col: 0, row: 2 });
  board.place('ant', { col: 0, row: 5 });
  return board;
}

describe('real-time budget', () => {
  it('reports the achievable solver rate', () => {
    const netlist = buildNetlist(busyBoard());
    const sim = new Simulation(netlist, 48_000);
    sim.run(2_000); // warm up

    const n = 20_000;
    const t0 = performance.now();
    sim.run(n);
    const seconds = (performance.now() - t0) / 1000;
    const stepsPerSecond = n / seconds;

    console.log(
      `unknowns=${sim.circuit.unknowns} elements=${netlist.elements.length} ` +
        `steps/s=${Math.round(stepsPerSecond)} ` +
        `(realtime at 48k = ${(stepsPerSecond / 48_000).toFixed(2)}x)`,
    );
    // Enough headroom to run at least at 12 kHz with 4x interpolation.
    expect(stepsPerSecond).toBeGreaterThan(12_000);
  });
});
