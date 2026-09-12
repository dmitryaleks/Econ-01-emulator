import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board.js';
import { loadCircuit } from '../src/circuits/index.js';
import { CIRCUITS } from '../src/circuits/index.js';
import { buildNetlist } from '../src/netlist/build.js';
import { Simulation, dominantFrequency, rms } from '../src/sim/transient.js';

describe('shipped circuits', () => {
  for (const circuit of CIRCUITS) {
    it(`«${circuit.title}» behaves as documented`, () => {
      const board = new Board();
      loadCircuit(board, circuit);
      const netlist = buildNetlist(board);
      const fs = 96_000;
      const sim = new Simulation(netlist, fs);

      // Let the operating point settle, then measure.
      sim.run(fs / 20);
      const { samples } = sim.run(fs / 5);
      const level = rms(samples);
      const freq = dominantFrequency(samples, fs);

      const e = circuit.expect;
      if (e.silent) {
        expect(level).toBeLessThan(0.02);
        return;
      }
      expect(level).toBeGreaterThan(e.minRms ?? 0.05);
      if (e.freqHz) {
        expect(freq).toBeGreaterThan(e.freqHz[0]);
        expect(freq).toBeLessThan(e.freqHz[1]);
      }
      if (e.offTuneBelow !== undefined) {
        const off = new Board();
        loadCircuit(off, circuit);
        off.controls.tuning = 0.5; // between stations
        const offSim = new Simulation(buildNetlist(off), fs);
        offSim.run(fs / 20);
        expect(rms(offSim.run(fs / 5).samples)).toBeLessThan(e.offTuneBelow);
      }
    });
  }
});
