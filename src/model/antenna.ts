/**
 * The magnetic antenna's windings as coupled inductors on one ferrite rod (SPEC.md §4).
 *
 * Every section is wound in the same sense from its registry `from` face to its `to` face, so
 * two sections couple with a positive mutual inductance M = k·√(L1·L2) in that orientation.
 */

/** Inductance per turn squared on the 400НН 8 × 80 mm rod, from 0,51 мГн for 100 turns. [G] */
const HENRIES_PER_TURN2 = 0.51e-3 / 100 ** 2;

/** Coupling between two sections of L1, wound continuously side by side. [G] */
const K_WITHIN_WINDING = 0.9;
/** Coupling between L2 and L1, separate coils on the same rod. [G] */
const K_BETWEEN_WINDINGS = 0.8;

/** Unloaded quality factor of the rod at radio frequency: ferrite and wire losses. [G] */
export const CORE_Q = 150;

/** Series resistance of the wire, about 22 мОм a turn of ПЭВ-2 0,16 on the rod. */
const OHMS_PER_TURN = 0.022;

export function windingSection(turns: number): { henries: number; esr: number } {
  return { henries: HENRIES_PER_TURN2 * turns ** 2, esr: OHMS_PER_TURN * turns };
}

export function coreCoupling(windingA: string, windingB: string): number {
  return windingA === windingB ? K_WITHIN_WINDING : K_BETWEEN_WINDINGS;
}

/**
 * The two inductances the tuning capacitor can be put across: the 100-turn section alone
 * (medium wave) and the whole of L1, both sections aiding (long wave).
 */
export function tuningHenries(): [number, number] {
  const a = windingSection(100).henries;
  const b = windingSection(230).henries;
  return [a, a + b + 2 * K_WITHIN_WINDING * Math.sqrt(a * b)];
}
