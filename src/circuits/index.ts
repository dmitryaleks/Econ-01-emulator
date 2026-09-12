/**
 * Ready-made circuits. Two caveats are carried in the data rather than hidden:
 *
 * `kitLegal`  — the kit ships two leads. Layouts needing more still respect the module counts,
 *               but the factory routes those connections through the field itself using module
 *               pin variants we have not confirmed (SPEC.md §8 question 1).
 *
 * `simulates` — whether the solver actually runs it. The multivibrator family currently does
 *               not. An astable's DC operating point is an unstable equilibrium; the solver
 *               starts every transient from exactly that point, so the circuit balances there
 *               and stays silent. See DEVPLAN, "Known defect: astable start-up". The circuits
 *               are transcribed correctly and test/circuits.test.ts checks their netlists
 *               against the schematics, so they come alive when the solver is fixed.
 */

import type { Board, Lead } from '../model/board.js';
import { ANTENNA_ROW } from '../model/panel.js';
import type { Pin, Rotation } from '../model/types.js';

export interface CircuitPlacement {
  col: number;
  row: number;
  moduleId: string;
  rotation?: Rotation;
}

export interface CircuitExpectation {
  silent?: boolean;
  minRms?: number;
  freqHz?: [number, number];
  /** For receivers: with the dial moved off the station, output must drop below this. */
  offTuneBelow?: number;
  /** Seconds to simulate before measuring; slow circuits need more. */
  seconds?: number;
  /** Holding the кнопка must raise the pitch by at least this factor. */
  buttonRaisesPitch?: number;
  /** Near silent until the кнопка is held, then audible. */
  gatedByButton?: boolean;
}

export interface Circuit {
  id: string;
  title: string;
  description: string;
  /** Where this came from: a manual page number, or a reconstruction. */
  source: string;
  /**
   * True when the arrangement uses no more modules and no more leads than the box contains.
   * False means it stays within the module counts but needs extra wire.
   */
  kitLegal: boolean;
  /** Whether the solver currently reproduces this circuit's behaviour. See the file header. */
  simulates: boolean;
  sandbox?: boolean;
  volume?: number;
  tuning?: number;
  placements: CircuitPlacement[];
  leads?: Lead[];
  expect: CircuitExpectation;
}

const at = (col: number, row: number, edge: Pin): Lead['from'] => ({ cell: { col, row }, edge });
const wire = (a: Lead['from'], b: Lead['to']): Lead => ({ from: a, to: b });

// Panel terminals, reached by clipping a lead lug to the left-edge contact of that row.
const XT1 = at(0, 0, 'W'); // ground
const XT2 = at(0, 1, 'W'); // +8,7 V
const XT3 = at(0, 2, 'W'); // +8,7 V

/**
 * Detector receiver. The magnetic antenna's 100-turn section is put across the tuning
 * capacitor C10 through XT5/XT6, the 25-turn coupling winding feeds one of the Д9Б diodes,
 * and the rectified audio goes to the amplifier input at XT4.
 *
 * Three «Тройник», three «Линия», one «Угол», the twin-diode module, the antenna and one of
 * the two supplied leads — all within what the box contains.
 */
export const DETECTOR_RECEIVER: Circuit = {
  id: 'detector',
  title: 'Детекторный приёмник',
  description:
    'Магнитная антенна и конденсатор переменной ёмкости образуют колебательный контур; ' +
    'катушка связи через диод Д9Б подаёт продетектированный сигнал на вход усилителя. ' +
    'Крутите ручку настройки, чтобы найти станцию.',
  source: 'reconstruction',
  kitLegal: true,
  simulates: true,
  volume: 0.7,
  tuning: 0.354,
  placements: [
    { col: 0, row: ANTENNA_ROW, moduleId: 'ant' },
    { col: 0, row: 4, moduleId: 'j-troynik', rotation: 0 },
    { col: 1, row: 4, moduleId: 'j-ugol', rotation: 2 },
    { col: 4, row: 4, moduleId: 'dd9b', rotation: 1 },
    { col: 3, row: 4, moduleId: 'j-liniya', rotation: 0 },
    { col: 2, row: 4, moduleId: 'j-troynik', rotation: 2 },
    { col: 2, row: 3, moduleId: 'j-troynik', rotation: 1 },
    { col: 1, row: 3, moduleId: 'j-liniya', rotation: 0 },
    { col: 0, row: 3, moduleId: 'j-liniya', rotation: 0 },
  ],
  leads: [wire(at(5, ANTENNA_ROW, 'E'), XT1)],
  expect: { minRms: 0.25, offTuneBelow: 0.25 },
};

/**
 * Device 6 «Мультивибратор» from page 15 of the manual. The topology (which resistor and
 * capacitor value sits where) is transcribed from `assets/multivibrator-schematics-raw.png`,
 * the manual's clean redrawn schematic. The physical layout below follows the same general
 * scheme visible in the factory mounting drawing `assets/multivibrator-chart.png` — the button
 * and both transistors' emitters tied along the top row, collector loads reached from below —
 * built with real link cubes rather than the loose leads used in the first transcription.
 *
 * Every «Тройник», «Линия», the one «Угол» and the one «Крест» the box contains are used here
 * (4 + 4 + 1 + 1 — the whole link inventory), which is what it takes to keep the two
 * transistors' collectors, bases and the button's emitter return all separately wired using
 * only genuine cube-to-cube contact. Six connections still need lead wire: the box supplies
 * two, so this stays `kitLegal: false`, but every one of those six is a long jump between
 * far corners of the field (a base bias resistor or a cross-coupling capacitor reaching back
 * to the supply rail or to the opposite transistor) — not a substitute for adjacency the way
 * the original transcription's twelve leads were.
 *
 *   (0,0) SB              button: W on XT1, E starts the emitter bus
 *   (1,0) Тройник         bus continues, drops to Q1's emitter
 *   (2,0) (3,0) Линия      bus straight through
 *   (4,0) Угол             bus ends, drops to Q2's emitter
 *   (1,1) Q1  (4,1) Q2     КТ315Б, both emitter=N (into the bus), collector=S
 *   (2,1) (3,1) Тройник    Q1's / Q2's base, dropped one row down
 *   (0,2) RC1  (5,2) RC2   2,2 кОм collector loads, against VCC
 *   (1,2) Тройник          Q1's collector corner, into RC1
 *   (2,2) (3,2) Линия      Q1's / Q2's base, dropped one more row
 *   (4,2) Крест            Q2's collector: up to Q2, out to RC2 and to Cout
 *   (1,3) Ccross_A 0,01 мкФ   Q1's collector, lead to Q2's base
 *   (2,3) RB1 12 кОм          Q1's base, lead to VCC (joined with RB2's far side)
 *   (3,3) RB2 68 кОм          Q2's base, joined to RB1's far side, lead to VCC
 *   (4,3) Cout 0,01 мкФ       Q2's collector, lead to XT4
 *   (5,3) Ccross_B 3300 пФ    lead from Q2's collector, lead to Q1's base
 */
export const DEVICE_6: Circuit = {
  id: 'device6',
  title: 'Мультивибратор (устройство 6)',
  description:
    'Заводская схема со страницы 15 руководства. Плечи намеренно неодинаковы: слева ' +
    '12 кОм и 0,01 мкФ, справа 68 кОм и 3300 пФ, поэтому импульс короткий, а пауза длинная. ' +
    'Кнопка включена в общий провод эмиттеров: пока она не нажата, цепь разомкнута и ' +
    'динамик молчит. Нажмите и удерживайте — появится тон около двух килогерц. ' +
    'Оба транзистора, оба резистора нагрузки коллектора и обе перекрёстные ёмкости стоят ' +
    'настоящими кубиками на своих местах; шесть длинных перемычек — от коллектора к базе ' +
    'напротив и от базовых резисторов к шине питания — сделаны проводом, потому что в ' +
    'коробке всего один «Уголок» и один «Крест» на всё поле.',
  source: 'manual page 15, device 6, cross-checked against multivibrator-schematics-raw.png',
  kitLegal: false,
  simulates: false,
  volume: 0.6,
  placements: [
    { col: 0, row: 0, moduleId: 'sb', rotation: 0 }, // W on XT1
    { col: 1, row: 0, moduleId: 'j-troynik', rotation: 0 }, // W,E,S
    { col: 2, row: 0, moduleId: 'j-liniya', rotation: 0 },
    { col: 3, row: 0, moduleId: 'j-liniya', rotation: 0 },
    { col: 4, row: 0, moduleId: 'j-ugol', rotation: 2 }, // S,W

    { col: 1, row: 1, moduleId: 'q315-a', rotation: 2 }, // N=emitter,E=base,S=collector
    { col: 2, row: 1, moduleId: 'j-troynik', rotation: 1 }, // N,S,W: W=Q1 base
    { col: 3, row: 1, moduleId: 'j-troynik', rotation: 3 }, // N,E,S: E=Q2 base
    { col: 4, row: 1, moduleId: 'q315-b', rotation: 0 }, // N=emitter,W=base,S=collector

    { col: 0, row: 2, moduleId: 'r2k2-o', rotation: 0 }, // RC1: W=VCC
    { col: 1, row: 2, moduleId: 'j-troynik', rotation: 1 }, // N,S,W: N=Q1 collector, W=RC1
    { col: 2, row: 2, moduleId: 'j-liniya', rotation: 1 }, // N,S: relays Q1's base down
    { col: 3, row: 2, moduleId: 'j-liniya', rotation: 1 }, // N,S: relays Q2's base down
    { col: 4, row: 2, moduleId: 'j-krest', rotation: 0 }, // N=Q2 collector
    { col: 5, row: 2, moduleId: 'r2k2-o', rotation: 0 }, // RC2: W=Q2 collector

    { col: 1, row: 3, moduleId: 'c10n-o', rotation: 1 }, // Ccross_A 0,01 мкФ, N=Q1 collector
    { col: 2, row: 3, moduleId: 'r12k-a', rotation: 0 }, // RB1, N=Q1 base
    { col: 3, row: 3, moduleId: 'r68k-a', rotation: 3 }, // RB2, N=Q2 base, W joins RB1
    { col: 4, row: 3, moduleId: 'c10n-o2', rotation: 1 }, // Cout 0,01 мкФ, N=Q2 collector
    { col: 5, row: 3, moduleId: 'c3n3-o', rotation: 0 }, // Ccross_B 3300 пФ
  ],
  leads: [
    wire(at(2, 3, 'E'), XT2), // RB1+RB2's joined far side to VCC
    wire(at(5, 2, 'E'), XT3), // RC2 to VCC
    wire(at(4, 3, 'S'), at(0, 3, 'W')), // Cout to XT4
    wire(at(1, 3, 'S'), at(4, 1, 'W')), // Ccross_A to Q2's base
    wire(at(4, 1, 'S'), at(5, 3, 'W')), // Q2's collector to Ccross_B
    wire(at(5, 3, 'E'), at(2, 1, 'W')), // Ccross_B to Q1's base
  ],
  expect: { gatedByButton: true, minRms: 0.15, freqHz: [1200, 3200] },
};

export const CIRCUITS: Circuit[] = [DETECTOR_RECEIVER, DEVICE_6];

export function loadCircuit(board: Board, circuit: Circuit): void {
  board.clear();
  board.sandbox = circuit.sandbox ?? false;
  for (const p of circuit.placements) {
    board.place(p.moduleId, { col: p.col, row: p.row }, p.rotation ?? 0);
  }
  for (const lead of circuit.leads ?? []) board.leads.push(lead);
  if (circuit.volume !== undefined) board.controls.volume = circuit.volume;
  if (circuit.tuning !== undefined) board.controls.tuning = circuit.tuning;
}
