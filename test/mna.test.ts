import { describe, expect, it } from 'vitest';
import type { Netlist, NlElement } from '../src/netlist/build.js';
import { Circuit } from '../src/sim/mna.js';
import { VT } from '../src/sim/models.js';
import { Simulation, dominantFrequency, rms } from '../src/sim/transient.js';

/** Minimal netlist wrapper for hand-written test circuits. */
function nl(elements: NlElement[], speaker = { p: 'out', n: '0' }): Netlist {
  return {
    elements,
    nets: [],
    ground: '0',
    speaker,
    contactNet: new Map(),
    antenna: null,
  };
}

describe('linear circuits', () => {
  it('solves a resistive divider', () => {
    const c = new Circuit(
      nl([
        { kind: 'V', name: 'V1', p: 'in', n: '0', volts: 10 },
        { kind: 'R', name: 'R1', a: 'in', b: 'mid', ohms: 1000 },
        { kind: 'R', name: 'R2', a: 'mid', b: '0', ohms: 3000 },
      ]),
    );
    expect(c.dcOperatingPoint()).toBe(true);
    expect(c.voltageAt('mid')).toBeCloseTo(7.5, 6);
  });

  it('charges an RC to the analytic curve', () => {
    const R = 10_000;
    const C = 1e-6;
    const tau = R * C; // 10 ms
    const fs = 200_000;
    const circuit = new Circuit(
      nl([
        { kind: 'V', name: 'V1', p: 'in', n: '0', volts: 5 },
        { kind: 'R', name: 'R1', a: 'in', b: 'out', ohms: R },
        { kind: 'C', name: 'C1', a: 'out', b: '0', farads: C },
      ]),
    );
    circuit.setTimestep(1 / fs);
    // Start from a discharged capacitor rather than the DC steady state.
    circuit.dcOperatingPoint();

    // Re-run from zero: step through one time constant and compare.
    const fresh = new Circuit(
      nl([
        { kind: 'V', name: 'V1', p: 'in', n: '0', volts: 5 },
        { kind: 'R', name: 'R1', a: 'in', b: 'out', ohms: R },
        { kind: 'C', name: 'C1', a: 'out', b: '0', farads: C },
      ]),
    );
    fresh.setTimestep(1 / fs);
    for (let i = 0; i < fs * tau; i++) fresh.step();
    const expected = 5 * (1 - Math.exp(-1));
    expect(fresh.voltageAt('out')).toBeCloseTo(expected, 1);
    expect(Math.abs(fresh.voltageAt('out') - expected) / expected).toBeLessThan(0.01);
  });

  it('an LC tank rings at 1/(2*pi*sqrt(LC))', () => {
    const L = 1e-3;
    const C = 1e-6;
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C)); // ~5033 Hz
    const fs = 500_000;
    const sim = new Circuit(
      nl([
        { kind: 'L', name: 'L1', a: 'out', b: '0', henries: L, esr: 0.05 },
        { kind: 'C', name: 'C1', a: 'out', b: '0', farads: C },
        { kind: 'R', name: 'R1', a: 'out', b: '0', ohms: 1e5 },
      ]),
    );
    sim.setTimestep(1 / fs);
    // Kick the tank by pre-charging the capacitor.
    sim.injections.set('out', 0.2);
    for (let i = 0; i < 20; i++) sim.step();
    sim.injections.set('out', 0);

    const samples = new Float64Array(4096);
    for (let i = 0; i < samples.length; i++) {
      sim.step();
      samples[i] = sim.voltageAt('out');
    }
    const f = dominantFrequency(samples, fs);
    expect(f).toBeGreaterThan(f0 * 0.9);
    expect(f).toBeLessThan(f0 * 1.1);
  });
});

describe('nonlinear devices', () => {
  it('a diode follows the Shockley equation', () => {
    // Drive a known current and read back the junction voltage.
    const is = 1e-6;
    const n = 1.4;
    const targetV = 0.3;
    const expectedI = is * (Math.exp(targetV / (n * VT)) - 1);

    const c = new Circuit(
      nl([
        { kind: 'V', name: 'V1', p: 'a', n: '0', volts: targetV },
        { kind: 'D', name: 'D1', anode: 'a', cathode: '0', model: 'D9B' },
      ]),
    );
    expect(c.dcOperatingPoint()).toBe(true);
    // Current out of the source equals the diode current.
    const netlist = nl([
      { kind: 'V', name: 'V1', p: 'a', n: '0', volts: targetV },
      { kind: 'D', name: 'D1', anode: 'a', cathode: '0', model: 'D9B' },
    ]);
    const i = Math.abs(c.sourceCurrent('V1', netlist));
    expect(i).toBeGreaterThan(expectedI * 0.9);
    expect(i).toBeLessThan(expectedI * 1.1);
  });

  it('blocks reverse current', () => {
    const c = new Circuit(
      nl([
        { kind: 'V', name: 'V1', p: 'a', n: '0', volts: -5 },
        { kind: 'D', name: 'D1', anode: 'a', cathode: 'k', model: 'D9B' },
        { kind: 'R', name: 'R1', a: 'k', b: '0', ohms: 1000 },
      ]),
    );
    c.dcOperatingPoint();
    expect(Math.abs(c.voltageAt('k'))).toBeLessThan(1e-3);
  });

  it('biases a common-emitter stage into the active region', () => {
    // 8.7 V, 470k base resistor, 4.7k collector load, KT315B with BF = 80.
    const c = new Circuit(
      nl([
        { kind: 'V', name: 'V1', p: 'vcc', n: '0', volts: 8.7 },
        { kind: 'R', name: 'RB', a: 'vcc', b: 'b', ohms: 470e3 },
        { kind: 'R', name: 'RC', a: 'vcc', b: 'c', ohms: 4.7e3 },
        { kind: 'Q', name: 'Q1', base: 'b', collector: 'c', emitter: '0', model: 'KT315B' },
      ]),
    );
    expect(c.dcOperatingPoint()).toBe(true);
    const vbe = c.voltageAt('b');
    const vce = c.voltageAt('c');
    expect(vbe).toBeGreaterThan(0.55);
    expect(vbe).toBeLessThan(0.8);
    // Ib = (8.7 - Vbe)/470k ~ 17 uA, Ic ~ 1.36 mA, Vce ~ 8.7 - 6.4 = 2.3 V.
    const ib = (8.7 - vbe) / 470e3;
    const expectedVce = 8.7 - ib * 80 * 4.7e3;
    expect(vce).toBeGreaterThan(expectedVce - 1.2);
    expect(vce).toBeLessThan(expectedVce + 1.2);
  });

  it('a pnp stage biases with the opposite polarity', () => {
    const c = new Circuit(
      nl([
        { kind: 'V', name: 'V1', p: 'vcc', n: '0', volts: 8.7 },
        { kind: 'R', name: 'RB', a: 'b', b: '0', ohms: 470e3 },
        { kind: 'R', name: 'RC', a: 'c', b: '0', ohms: 4.7e3 },
        { kind: 'Q', name: 'Q1', base: 'b', collector: 'c', emitter: 'vcc', model: 'MP42B' },
      ]),
    );
    expect(c.dcOperatingPoint()).toBe(true);
    // Germanium pnp: emitter at 8.7 V, base about 0.25 V below it.
    expect(8.7 - c.voltageAt('b')).toBeGreaterThan(0.12);
    expect(8.7 - c.voltageAt('b')).toBeLessThan(0.45);
    expect(c.voltageAt('c')).toBeGreaterThan(0.5);
  });
});

describe('astable multivibrator', () => {
  it('oscillates near 1/(1.38 R C)', () => {
    const R = 68e3;
    const C = 0.01e-6;
    const expected = 1 / (1.38 * R * C); // ~1066 Hz
    const fs = 192_000;

    const sim = new Simulation(
      nl(
        [
          { kind: 'V', name: 'V1', p: 'vcc', n: '0', volts: 8.7 },
          { kind: 'R', name: 'RC1', a: 'vcc', b: 'c1', ohms: 2.2e3 },
          { kind: 'R', name: 'RC2', a: 'vcc', b: 'c2', ohms: 2.2e3 },
          { kind: 'R', name: 'RB1', a: 'vcc', b: 'b1', ohms: R },
          { kind: 'R', name: 'RB2', a: 'vcc', b: 'b2', ohms: R },
          { kind: 'C', name: 'C1', a: 'c1', b: 'b2', farads: C },
          { kind: 'C', name: 'C2', a: 'c2', b: 'b1', farads: C },
          { kind: 'Q', name: 'Q1', base: 'b1', collector: 'c1', emitter: '0', model: 'KT315B' },
          { kind: 'Q', name: 'Q2', base: 'b2', collector: 'c2', emitter: '0', model: 'KT315B' },
        ],
        { p: 'c1', n: '0' },
      ),
      fs,
    );

    // Nudge one side so the symmetric operating point breaks.
    sim.circuit.injections.set('b1', 5e-6);
    sim.run(200);
    sim.circuit.injections.set('b1', 0);

    const { samples } = sim.run(fs / 10);
    const amplitude = rms(samples);
    expect(amplitude).toBeGreaterThan(0.5);

    const f = dominantFrequency(samples, fs);
    expect(f).toBeGreaterThan(expected * 0.7);
    expect(f).toBeLessThan(expected * 1.4);
  });
});
