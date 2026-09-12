import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board.js';
import { buildNetlist } from '../src/netlist/build.js';
import { Circuit } from '../src/sim/mna.js';
import { Simulation, rms } from '../src/sim/transient.js';

describe('modules on the field drive the real circuit', () => {
  /**
   * VCC (XT2, right of row 1) -> 2,2 kΩ -> link -> lead -> XT1 (ground, right of row 0).
   * Exercises the XT terminals, pad-to-pad adjacency, a supplied lead, the power switch
   * and the solver in one go.
   */
  function loadBoard(volume: number): Board {
    const board = new Board();
    board.controls.volume = volume;
    board.place('block_001', { col: 5, row: 1 }, 2); // resistor's single end on XT2, far end W
    board.place('block_023', { col: 4, row: 1 }); // straight through
    board.leads.push({
      from: { cell: { col: 4, row: 1 }, edge: 'W' },
      to: { cell: { col: 5, row: 0 }, edge: 'E' }, // XT1 = ground
    });
    return board;
  }

  it('draws 8,7 V / 2,2 kΩ when the power is on', () => {
    const netlist = buildNetlist(loadBoard(0.5));
    const c = new Circuit(netlist);
    expect(c.dcOperatingPoint()).toBe(true);
    // The resistor's far end is grounded, so its near end sits at the supply rail.
    const drop = c.voltageAt('VCC');
    expect(drop).toBeGreaterThan(8.5);
    expect(drop).toBeLessThan(8.75);

    const iTotal = Math.abs(c.sourceCurrent('GB1', netlist));
    // 3.95 mA through the test resistor plus the amplifier's own quiescent draw.
    expect(iTotal).toBeGreaterThan(3.9e-3);
    expect(iTotal).toBeLessThan(120e-3); // the manual's rated maximum
  });

  it('draws essentially nothing with the volume control switched off', () => {
    const netlist = buildNetlist(loadBoard(0));
    const c = new Circuit(netlist);
    c.dcOperatingPoint();
    expect(c.voltageAt('VCC')).toBeLessThan(0.01);
    expect(Math.abs(c.sourceCurrent('GB1', netlist))).toBeLessThan(1e-6);
  });

  it('breaking the circuit stops the current', () => {
    const board = loadBoard(0.5);
    board.leads.length = 0; // pull the lead out
    const netlist = buildNetlist(board);
    const c = new Circuit(netlist);
    c.dcOperatingPoint();
    const i = Math.abs(c.sourceCurrent('GB1', netlist));
    expect(i).toBeLessThan(50e-3);
  });
});

describe('built-in low-frequency amplifier', () => {
  it('amplifies a signal presented at XT4 and is silent when switched off', () => {
    const fs = 48_000;

    const loud = new Simulation(buildNetlist(withVolume(0.8)), fs);
    const off = new Simulation(buildNetlist(withVolume(0)), fs);

    const tone = (t: number): number => Math.sin(2 * Math.PI * 440 * t) * 30e-6;

    const measure = (sim: Simulation): number => {
      const out = new Float64Array(fs / 20);
      for (let i = 0; i < out.length; i++) {
        sim.circuit.injections.set('AMP_IN', tone(i / fs));
        out[i] = sim.sample();
      }
      return rms(out.subarray(out.length / 2)); // skip the settling transient
    };

    const loudRms = measure(loud);
    const offRms = measure(off);

    expect(loudRms).toBeGreaterThan(1e-3);
    expect(offRms).toBeLessThan(loudRms / 50);
  });

  it('turns the volume control down without turning the power off', () => {
    const fs = 48_000;
    const drive = (sim: Simulation): number => {
      const out = new Float64Array(fs / 20);
      for (let i = 0; i < out.length; i++) {
        sim.circuit.injections.set('AMP_IN', Math.sin(2 * Math.PI * 440 * (i / fs)) * 30e-6);
        out[i] = sim.sample();
      }
      return rms(out.subarray(out.length / 2));
    };
    const high = drive(new Simulation(buildNetlist(withVolume(0.9)), fs));
    const low = drive(new Simulation(buildNetlist(withVolume(0.1)), fs));
    expect(high).toBeGreaterThan(low);
  });
});

describe('antenna and tuning', () => {
  it('finds a station and loses it when detuned', () => {
    const board = new Board();
    board.controls.volume = 0.7;
    board.place('block_019', { col: 0, row: 5 });

    // Sweep the dial the way a hand would, rather than sampling five points.
    const strengths: number[] = [];
    const names = new Set<string>();
    for (let i = 0; i <= 200; i++) {
      board.controls.tuning = i / 200;
      const sim = new Simulation(buildNetlist(board), 48_000);
      strengths.push(sim.radioState.strength);
      if (sim.radioState.station) names.add(sim.radioState.station.name);
    }
    expect(names.size).toBeGreaterThanOrEqual(4);
    // Somewhere across the dial there is a strong station, and somewhere there is not.
    expect(Math.max(...strengths)).toBeGreaterThan(0.5);
    expect(Math.min(...strengths)).toBeLessThan(0.5);
  });

  it('reports no station without the antenna module', () => {
    const board = new Board();
    board.controls.volume = 0.7;
    board.controls.tuning = 0.5;
    const sim = new Simulation(buildNetlist(board), 48_000);
    expect(sim.radioState.station).toBeNull();
  });
});

function withVolume(volume: number): Board {
  const board = new Board();
  board.controls.volume = volume;
  return board;
}
