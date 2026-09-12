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
const XT7 = at(0, 6, 'W'); // ground

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
 * The astable multivibrator that manual devices 6, 8, 13, 27, 29 and 30 are all built around,
 * laid out so every element sits clear of its neighbours and the connections are made with
 * lead wire.
 *
 *   (1,3) RC1   (4,3) RC2    collector loads, vertical
 *   (1,4) Q1    (4,4) Q2     КТ315Б, collector up, emitter down
 *   (0,4) Cc2   (5,4) Cc1    timing capacitors, each already touching the base it drives
 *   (2,1) RB1   (4,1) RB2    base resistors
 */
interface MvParts {
  /** Timing capacitor driving Q2's base; must present contacts W and E. */
  cc1: string;
  cc1Rotation?: Rotation;
  /** Timing capacitor driving Q1's base; must present contacts N and E. */
  cc2: string;
  cc2Rotation?: Rotation;
  /** Base resistor for Q1; contacts W and E. */
  rb1: string;
  /** Base resistor for Q2; contacts N and E. */
  rb2: string;
  /** Cell for the output coupling capacitor. */
  out: { col: number; row: number };
}

function multivibrator(p: MvParts): { placements: CircuitPlacement[]; leads: Lead[] } {
  const placements: CircuitPlacement[] = [
    { col: 1, row: 3, moduleId: 'r2k2-o', rotation: 1 }, // RC1, contacts N/S
    { col: 4, row: 3, moduleId: 'r2k2-o', rotation: 1 }, // RC2, contacts N/S
    { col: 1, row: 4, moduleId: 'q315-a', rotation: 0 }, // Q1: B=W, C=N, E=S
    { col: 4, row: 4, moduleId: 'q315-b', rotation: 2 }, // Q2: B=E, C=N, E=S
    { col: 5, row: 4, moduleId: p.cc1, rotation: p.cc1Rotation ?? 0 }, // W touches Q2's base
    { col: 0, row: 4, moduleId: p.cc2, rotation: p.cc2Rotation ?? 0 }, // E touches Q1's base
    { col: 2, row: 1, moduleId: p.rb1, rotation: 0 },
    { col: 4, row: 1, moduleId: p.rb2, rotation: 0 },
    { col: p.out.col, row: p.out.row, moduleId: 'c3n3-o', rotation: 0 },
  ];

  const leads: Lead[] = [
    wire(XT2, at(1, 3, 'N')), // supply to RC1
    wire(XT2, at(4, 3, 'N')), // supply to RC2
    wire(XT3, at(2, 1, 'W')), // supply to RB1
    wire(XT3, at(4, 1, 'N')), // supply to RB2
    wire(at(2, 1, 'E'), at(1, 4, 'W')), // RB1 to Q1's base
    wire(at(4, 1, 'E'), at(4, 4, 'E')), // RB2 to Q2's base
    wire(at(1, 4, 'N'), at(5, 4, 'E')), // Q1 collector to the far side of Cc1
    wire(at(4, 4, 'N'), at(0, 4, 'N')), // Q2 collector to the far side of Cc2
    wire(XT1, at(1, 4, 'S')), // Q1 emitter to ground
    wire(XT7, at(4, 4, 'S')), // Q2 emitter to ground
    wire(at(1, 4, 'N'), at(p.out.col, p.out.row, 'E')), // Q1 collector to the output capacitor
  ];

  return { placements, leads };
}

const MV_NOTE =
  'В коробке всего два провода, а здесь их одиннадцать: заводская разводка идёт по самому ' +
  'полю, но её точный вид ещё не расшифрован. Модулей израсходовано ровно столько, сколько ' +
  'их в наборе.';

/** About a kilohertz, straight into the amplifier. */
export const MULTIVIBRATOR: Circuit = {
  id: 'multivibrator',
  title: 'Мультивибратор',
  description:
    'Два транзистора КТ315Б поочерёдно открываются и закрываются, перезаряжая конденсаторы ' +
    'через базовые резисторы. Частота задаётся произведением R и C — здесь около килогерца. ' +
    MV_NOTE,
  source: 'reconstruction (manual devices 6, 8, 13)',
  kitLegal: false,
  simulates: false,
  volume: 0.5,
  ...multivibrator({
    cc1: 'c10n-o',
    cc2: 'c10n-a',
    rb1: 'r68k-o',
    rb2: 'r68k-a',
    out: { col: 0, row: 3 },
  }),
  expect: { minRms: 0.15, freqHz: [400, 2600] },
};


/**
 * Device 6 «Мультивибратор» from page 15 of the manual, transcribed from its schematic —
 * see `assets/multivibrator-chart.png` for the factory mounting drawing of the same circuit.
 *
 * Unlike the generic multivibrator above this one is asymmetric (68 kΩ / 0,01 мкФ on one side,
 * 12 кОм / 3300 пФ on the other) and, most distinctively, **the кнопка sits in the common
 * emitter return to XT1**: the oscillator has no path to ground until you hold the button down.
 *
 *   (0,0) SB        button, its W contact already on XT1
 *   (1,3) (4,3) RC1 RC2 2,2 кОм collector loads, sitting on the collectors below them
 *   (1,4) (4,4) Q1  Q2  КТ315Б
 *   (5,4) Cc1       0,01 мкФ, W already on Q2's base
 *   (2,3) Cc2       3300 пФ
 *   (2,1) RB1       12 кОм      (4,1) RB2 68 кОм
 *   (0,3) Cout      0,01 мкФ, its W contact already on XT4
 */
export const DEVICE_6: Circuit = {
  id: 'device6',
  title: 'Мультивибратор (устройство 6)',
  description:
    'Заводская схема со страницы 15 руководства. Плечи намеренно неодинаковы: слева ' +
    '68 кОм и 0,01 мкФ, справа 12 кОм и 3300 пФ, поэтому импульс короткий, а пауза длинная. ' +
    'Кнопка включена в общий провод эмиттеров: пока она не нажата, цепь разомкнута и ' +
    'динамик молчит. Нажмите и удерживайте — появится тон около двух килогерц. ' + MV_NOTE,
  source: 'manual page 15, device 6',
  kitLegal: false,
  simulates: false,
  volume: 0.6,
  placements: [
    { col: 0, row: 0, moduleId: 'sb', rotation: 0 }, // W lands on XT1
    { col: 0, row: 3, moduleId: 'c10n-o2', rotation: 0 }, // W lands on XT4
    { col: 1, row: 3, moduleId: 'r2k2-o', rotation: 1 }, // RC1, contacts N/S
    { col: 4, row: 3, moduleId: 'r2k2-o', rotation: 1 }, // RC2, contacts N/S
    { col: 1, row: 4, moduleId: 'q315-a', rotation: 0 }, // Q1: B=W, C=N, E=S
    { col: 4, row: 4, moduleId: 'q315-b', rotation: 2 }, // Q2: B=E, C=N, E=S
    { col: 5, row: 4, moduleId: 'c10n-o', rotation: 0 }, // Cc1, W on Q2's base
    { col: 2, row: 3, moduleId: 'c3n3-o', rotation: 0 }, // Cc2
    { col: 2, row: 1, moduleId: 'r12k-a', rotation: 0 }, // RB1, contacts N/E
    { col: 4, row: 1, moduleId: 'r68k-o', rotation: 0 }, // RB2, contacts W/E
  ],
  leads: [
    wire(XT2, at(1, 3, 'N')), // supply to RC1
    wire(XT2, at(4, 3, 'N')), // supply to RC2
    wire(XT3, at(2, 1, 'N')), // supply to RB1 12k
    wire(XT3, at(4, 1, 'W')), // supply to RB2 68k
    wire(at(2, 1, 'E'), at(1, 4, 'W')), // RB1 to Q1's base
    wire(at(4, 1, 'E'), at(4, 4, 'E')), // RB2 to Q2's base
    wire(at(1, 4, 'N'), at(5, 4, 'E')), // Q1 collector to the far plate of Cc1
    wire(at(4, 4, 'N'), at(2, 3, 'W')), // Q2 collector to Cc2
    wire(at(2, 3, 'E'), at(1, 4, 'W')), // Cc2 to Q1's base
    wire(at(4, 4, 'N'), at(0, 3, 'E')), // Q2 collector to the output capacitor
    wire(at(0, 0, 'E'), at(1, 4, 'S')), // button to Q1's emitter
    wire(at(1, 4, 'S'), at(4, 4, 'S')), // emitters tied together
  ],
  expect: { gatedByButton: true, minRms: 0.15, freqHz: [1200, 3200] },
};

export const CIRCUITS: Circuit[] = [DETECTOR_RECEIVER, DEVICE_6, MULTIVIBRATOR];

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
