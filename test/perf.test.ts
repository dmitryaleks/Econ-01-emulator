import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board.js';
import { buildNetlist } from '../src/netlist/build.js';
import { Simulation } from '../src/sim/transient.js';

/** A board of roughly the size the 30 manual circuits reach. */
function busyBoard(): Board {
  const board = new Board();
  board.controls.volume = 0.7;
  board.place('block_017', { col: 2, row: 2 });
  board.place('block_018', { col: 3, row: 2 });
  board.place('block_001', { col: 1, row: 2 });
  board.place('block_001', { col: 4, row: 2 });
  board.place('block_009', { col: 1, row: 3 });
  board.place('block_012', { col: 4, row: 3 });
  board.place('block_003', { col: 2, row: 1 });
  board.place('block_005', { col: 3, row: 1 });
  board.place('block_023', { col: 0, row: 1 });
  board.place('block_024', { col: 0, row: 2 });
  board.place('block_019', { col: 0, row: 5 });
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
