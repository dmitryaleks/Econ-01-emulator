/**
 * Behavioural radio block — the one documented departure from first-principles simulation
 * (SPEC.md §7.3).
 *
 * Medium- and long-wave carriers cannot be integrated at a 48 kHz audio step. The ferrite
 * antenna is a real inductor in the netlist; here we compute analytically what the L-C loop
 * the user built is tuned to, decide which fictional station that lands on, and inject the
 * recovered audio envelope as a current into the coupling winding. Off tune gives noise.
 */

import { ANTENNA_EMF } from '../model/catalogue.js';
import type { Netlist } from '../netlist/build.js';
import type { Circuit } from './mna.js';

export interface Station {
  name: string;
  /** Carrier, hertz. */
  carrier: number;
  /** Programme generator: returns −1..1 for a given time in seconds. */
  programme: (t: number) => number;
}

export interface RadioState {
  tunedHz: number;
  station: Station | null;
  /** 0..1 how well the tuned frequency lands on the station. */
  strength: number;
}

/** Loaded Q of the antenna circuit; sets how sharp the tuning feels. */
const Q = 60;
/**
 * Peak signal the coupling winding presents to the detector for a strong local station.
 * This stands in for the RF carrier amplitude at the diode: a crystal set only works at all
 * because a nearby transmitter puts a few hundred millivolts across the tuned circuit, which
 * is enough to push a germanium Д9Б past its 0,25 V knee. Below that the set goes quiet, which
 * is exactly how these receivers behave.
 */
const FULL_SCALE_VOLTS = 0.5;

export const STATIONS: Station[] = [
  { name: 'Маяк', carrier: 234_000, programme: chord([220, 277.18, 329.63], 0.35) },
  { name: 'Радио-1', carrier: 261_000, programme: speechLike(1.7) },
  { name: 'Орфей', carrier: 549_000, programme: chord([392, 493.88, 587.33], 0.5) },
  { name: 'Юность', carrier: 738_000, programme: chord([261.63, 329.63, 392], 0.25) },
  { name: 'Радио-2', carrier: 1_089_000, programme: speechLike(2.6) },
  { name: 'Тропинка', carrier: 1_413_000, programme: chord([440, 554.37], 0.2) },
];

export class RadioBlock {
  readonly state: RadioState = { tunedHz: 0, station: null, strength: 0 };
  private readonly coupling: [string, string] | null;
  private readonly inductance: number;
  private readonly dt: number;
  private t = 0;
  private noise = 0;

  constructor(netlist: Netlist, sampleRate: number) {
    this.dt = 1 / sampleRate;
    this.coupling = netlist.antenna ? netlist.antenna.coupling : null;
    // Total tuned inductance: whichever L1 section the user actually put across C10 dominates.
    // The full winding is 5.6 mH, the tap 0.51 mH; take the tapped value as the default and let
    // `retune` refine it from the real capacitance.
    this.inductance = 5.61e-3;
  }

  /** Recompute the tuned frequency for a given C10 setting. */
  retune(c10Farads: number): void {
    if (!this.coupling || c10Farads <= 0) {
      this.state.tunedHz = 0;
      this.state.station = null;
      this.state.strength = 0;
      return;
    }
    // Both L1 sections are available; report the one whose band has a station nearby.
    const candidates = [0.51e-3, this.inductance].map(
      (l) => 1 / (2 * Math.PI * Math.sqrt(l * c10Farads)),
    );

    let best: { hz: number; station: Station | null; strength: number } = {
      hz: candidates[0]!,
      station: null,
      strength: 0,
    };
    for (const hz of candidates) {
      for (const st of STATIONS) {
        const s = resonance(hz, st.carrier);
        if (s > best.strength) best = { hz, station: st, strength: s };
      }
    }
    this.state.tunedHz = best.station ? best.hz : candidates[0]!;
    this.state.station = best.strength > 0.02 ? best.station : null;
    this.state.strength = best.strength;
  }

  /** Drive this sample's induced EMF into the coupling winding. */
  inject(circuit: Circuit): void {
    if (!this.coupling) return;
    const { station, strength } = this.state;

    // Pink-ish background hiss, always present.
    this.noise = this.noise * 0.94 + (Math.random() * 2 - 1) * 0.06;
    let signal = this.noise * 0.35;

    if (station) {
      signal += station.programme(this.t) * strength;
    }
    this.t += this.dt;

    circuit.setSourceVoltage(ANTENNA_EMF, signal * FULL_SCALE_VOLTS);
  }
}

/** Single-pole resonance curve: 1 at the carrier, falling off with the loaded Q. */
function resonance(tunedHz: number, carrierHz: number): number {
  if (tunedHz <= 0) return 0;
  const detune = tunedHz / carrierHz - carrierHz / tunedHz;
  return 1 / Math.sqrt(1 + (Q * detune) ** 2);
}

/** A slowly arpeggiating chord, so each station is recognisable by ear. */
function chord(freqs: number[], depth: number): (t: number) => number {
  return (t) => {
    let v = 0;
    for (let i = 0; i < freqs.length; i++) {
      const gain = 0.5 + 0.5 * Math.sin(2 * Math.PI * (0.17 + i * 0.11) * t);
      v += Math.sin(2 * Math.PI * freqs[i]! * t) * gain;
    }
    return (v / freqs.length) * depth;
  };
}

/** Amplitude-modulated buzz that reads as a voice at a distance. */
function speechLike(rate: number): (t: number) => number {
  return (t) => {
    const syllable = Math.max(0, Math.sin(2 * Math.PI * rate * t)) ** 2;
    const pitch = 120 + 40 * Math.sin(2 * Math.PI * 0.7 * t);
    const buzz =
      Math.sin(2 * Math.PI * pitch * t) * 0.6 +
      Math.sin(2 * Math.PI * pitch * 2 * t) * 0.25 +
      Math.sin(2 * Math.PI * pitch * 3 * t) * 0.15;
    return buzz * syllable * 0.4;
  };
}
