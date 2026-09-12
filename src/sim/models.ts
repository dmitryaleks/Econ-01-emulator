/**
 * Semiconductor parameter sets. Silicon КТ315Б for the module transistors, germanium
 * МП26А / МП38 / МП42Б for the built-in amplifier, Д9Б for the twin-diode module.
 * Values are engineering estimates for these part families — see SPEC.md §4 and §5.2.
 */

export const VT = 0.025852; // kT/q at 300 K

export interface DiodeModel {
  is: number;
  /** Emission coefficient. */
  n: number;
}

export interface BjtModel {
  /** npn or pnp. */
  type: 'npn' | 'pnp';
  /** Transport saturation current. */
  is: number;
  /** Forward and reverse current gain. */
  bf: number;
  br: number;
  /** Forward Early voltage; Infinity disables the effect. */
  vaf: number;
}

export const DIODE_MODELS: Record<string, DiodeModel> = {
  // Germanium point-contact detector diode.
  D9B: { is: 1e-6, n: 1.4 },
};

export const BJT_MODELS: Record<string, BjtModel> = {
  // Silicon npn, the only transistor supplied as a module.
  KT315B: { type: 'npn', is: 1e-14, bf: 80, br: 3, vaf: 100 },
  // Germanium types in the built-in amplifier.
  MP26A: { type: 'pnp', is: 2e-7, bf: 40, br: 2, vaf: 60 },
  MP38: { type: 'npn', is: 2e-7, bf: 30, br: 2, vaf: 60 },
  MP42B: { type: 'pnp', is: 2e-7, bf: 40, br: 2, vaf: 60 },
};

/**
 * Limit the step of a junction voltage between Newton iterations. Without this the exponential
 * overflows on the first iteration of almost any circuit.
 */
export function limitJunction(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    }
    return vt * Math.log(vnew / vt);
  }
  if (vnew < -5) return Math.max(vnew, vold - 1);
  return vnew;
}

export function critVoltage(is: number, vt: number): number {
  return vt * Math.log(vt / (Math.SQRT2 * is));
}
