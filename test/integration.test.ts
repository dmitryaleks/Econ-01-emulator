import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board.js';
import { buildNetlist } from '../src/netlist/build.js';
import { Circuit } from '../src/sim/mna.js';
import { Simulation, rms } from '../src/sim/transient.js';

describe('modules on the field drive the real circuit', () => {
  /**
   * XT3 (right of row 2) -> 2,2 kΩ -> link -> lead -> XT1 (ground, right of row 0).
   * Exercises the XT terminals, pad-to-pad adjacency, a supplied lead, the power switch, R3
   * behind XT3 and the solver in one go.
   */
  function loadBoard(volume: number, lead = true): Board {
    const board = new Board();
    board.controls.volume = volume;
    board.place('block_001', { col: 5, row: 2 }, 2); // resistor's single end on XT3, far end W
    board.place('block_023', { col: 4, row: 2 }); // straight through
    if (lead) {
      board.leads.push({
        from: { cell: { col: 4, row: 2 }, edge: 'W' },
        to: { cell: { col: 5, row: 0 }, edge: 'E' }, // XT1 = ground
      });
    }
    return board;
  }

  function operatingPoint(board: Board): { amps: number; xt3: number } {
    const netlist = buildNetlist(board);
    const c = new Circuit(netlist);
    expect(c.dcOperatingPoint()).toBe(true);
    return { amps: Math.abs(c.sourceCurrent('GB1', netlist)), xt3: c.voltageAt('VCC') };
  }

  it('draws 8,7 V / (820 Ω + 2,2 kΩ) through XT3, on top of the amplifier', () => {
    const loaded = operatingPoint(loadBoard(0.5));
    const idle = operatingPoint(loadBoard(0.5, false));
    const expected = 8.7 / (820 + 2200);
    expect(loaded.amps - idle.amps).toBeGreaterThan(expected * 0.97);
    expect(loaded.amps - idle.amps).toBeLessThan(expected * 1.03);
    // R3 drops the rest, so XT3 sags to what the 2,2 kΩ leaves it.
    expect(loaded.xt3).toBeGreaterThan(2200 * expected * 0.97);
    expect(loaded.xt3).toBeLessThan(2200 * expected * 1.03);
    expect(loaded.amps).toBeLessThan(120e-3); // the manual's rated maximum
  });

  it('idles at a few milliamps with nothing on the field', () => {
    const { amps } = operatingPoint(withVolume(0.5));
    expect(amps).toBeGreaterThan(2e-3);
    expect(amps).toBeLessThan(20e-3);
  });

  it('draws essentially nothing with the volume control switched off', () => {
    const off = operatingPoint(loadBoard(0));
    expect(off.xt3).toBeLessThan(0.01);
    expect(off.amps).toBeLessThan(1e-6);
  });

  it('breaking the circuit stops the current through it', () => {
    const idle = operatingPoint(loadBoard(0.5, false));
    const bare = operatingPoint(withVolume(0.5));
    expect(Math.abs(idle.amps - bare.amps)).toBeLessThan(1e-6);
    expect(idle.xt3).toBeGreaterThan(8.6);
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
