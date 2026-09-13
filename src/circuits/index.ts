/**
 * Ready-made circuits. Module ids are block names from `assets/blocks/block_spec.json`.
 * Two caveats are carried in the data rather than hidden:
 *
 * `kitLegal`  — the arrangement uses no more modules and no more leads than the box contains.
 *
 * `simulates` — whether the solver actually runs it. The multivibrator family currently does
 *               not. An astable's DC operating point is an unstable equilibrium; the solver
 *               starts every transient from exactly that point, so the circuit balances there
 *               and stays silent. See DEVPLAN, "Known defect: astable start-up". The circuits
 *               are transcribed correctly and test/circuits.test.ts checks their netlists
 *               against the schematics, so they come alive when the solver is fixed.
 *               Radio-frequency oscillators such as device 26 cannot run at an audio step at
 *               all; like the radio block, they would need a behavioural model.
 */

import type { Board, Lead } from '../model/board.js';
import { ANTENNA_ROW } from '../model/panel.js';
import type { Rotation } from '../model/types.js';

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

/**
 * Detector receiver — a reconstruction, not one of the manual's layouts. The antenna's L1 runs
 * from its N5 contact to its east end, which sits on XT6; a «Угол» and a «Линия» carry N5 over
 * to XT5, so the tuning capacitor C10 is across the whole of L1. The coupling winding L2 sits
 * on N3 and N4: N4 feeds one of the Д9Б diodes, whose other side runs along row 3 to the
 * amplifier input at XT4, and N3 climbs column 2 on four «Мостик» to the top strip, which a
 * «Щель» in the corner ties to XT1.
 *
 * Everything touches by contact alone; no lead is needed.
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
    { col: 0, row: ANTENNA_ROW, moduleId: 'block_019' }, // антенна
    { col: 4, row: 4, moduleId: 'block_020', rotation: 0 }, // «Угол» E-S: N5 to XT5
    { col: 5, row: 4, moduleId: 'block_023', rotation: 0 }, // «Линия»: E on XT5
    { col: 3, row: 4, moduleId: 'block_016', rotation: 0 }, // Д9Б ×2: S on N4, N up to row 3
    { col: 3, row: 3, moduleId: 'block_024', rotation: 0 }, // «Тройник» W,E,S
    { col: 4, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 5, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»: E on XT4
    { col: 2, row: 4, moduleId: 'block_023', rotation: 1 }, // «Линия» N-S: S on N3
    { col: 2, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»: N-S carries N3 up
    { col: 2, row: 2, moduleId: 'block_025', rotation: 0 },
    { col: 2, row: 1, moduleId: 'block_025', rotation: 0 },
    { col: 2, row: 0, moduleId: 'block_025', rotation: 0 }, // N on the top strip
    { col: 5, row: 0, moduleId: 'block_022', rotation: 1 }, // «Щель»: top strip to XT1
  ],
  expect: { minRms: 0.25, offTuneBelow: 0.25 },
};

/**
 * Device 6 «Мультивибратор», page 15 of the manual: the factory mounting drawing, transcribed
 * cell by cell against the confirmed module pinouts. Every one of the 30 main-grid cells is
 * filled and no lead is used. Several modules are there only for the wires they carry, or sit
 * unconnected, which is how the factory fits a circuit to exactly what the box contains.
 *
 * Its netlist, traced from contact alone, is the schematic: both emitters join at the кнопка,
 * whose other side reaches ground through the top strip and the «Щель» in the corner onto XT1;
 * all four resistors meet on the supply at XT3; the output 0,01 мкФ reaches XT4.
 */
export const DEVICE_6: Circuit = {
  id: 'device6',
  title: 'Мультивибратор (устройство 6)',
  description:
    'Заводская схема со страницы 15 руководства. Плечи намеренно неодинаковы: слева ' +
    '12 кОм и 3300 пФ, справа 68 кОм и 0,01 мкФ, поэтому импульс короткий, а пауза длинная. ' +
    'Кнопка включена в общий провод эмиттеров: пока она не нажата, цепь разомкнута и ' +
    'динамик молчит. Нажмите и удерживайте — появится тон. Раскладка кубиков повторяет ' +
    'заводской рисунок: заняты все 30 гнёзд, провода не нужны.',
  source: 'manual page 15, device 6: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: false,
  volume: 0.6,
  placements: [
    { col: 0, row: 0, moduleId: 'block_026', rotation: 3 }, // кнопка: N top strip, E emitters
    { col: 1, row: 0, moduleId: 'block_024', rotation: 0 }, // «Тройник»
    { col: 2, row: 0, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 3, row: 0, moduleId: 'block_020', rotation: 1 }, // «Угол»
    { col: 4, row: 0, moduleId: 'block_002', rotation: 0 }, // 12 кОм
    { col: 5, row: 0, moduleId: 'block_022', rotation: 1 }, // «Щель»: top strip to XT1

    { col: 0, row: 1, moduleId: 'block_023', rotation: 1 }, // «Линия»
    { col: 1, row: 1, moduleId: 'block_018', rotation: 2 }, // КТ315Б, right-hand arm
    { col: 2, row: 1, moduleId: 'block_012', rotation: 2 }, // 0,01 мкФ cross-coupling
    { col: 3, row: 1, moduleId: 'block_017', rotation: 2 }, // КТ315Б, left-hand arm
    { col: 4, row: 1, moduleId: 'block_011', rotation: 3 }, // 3300 пФ cross-coupling
    { col: 5, row: 1, moduleId: 'block_006', rotation: 3 }, // 680 кОм, used as a wire

    { col: 0, row: 2, moduleId: 'block_025', rotation: 1 }, // «Мостик»
    { col: 1, row: 2, moduleId: 'block_001', rotation: 2 }, // 2,2 кОм collector load
    { col: 2, row: 2, moduleId: 'block_003', rotation: 1 }, // 68 кОм base bias
    { col: 3, row: 2, moduleId: 'block_001', rotation: 1 }, // 2,2 кОм collector load
    { col: 4, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 5, row: 2, moduleId: 'block_024', rotation: 2 }, // «Тройник»: E on XT3

    { col: 0, row: 3, moduleId: 'block_025', rotation: 1 }, // «Мостик»
    { col: 1, row: 3, moduleId: 'block_022', rotation: 1 }, // «Щель»
    { col: 2, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 3, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 4, row: 3, moduleId: 'block_024', rotation: 2 }, // «Тройник»
    { col: 5, row: 3, moduleId: 'block_013', rotation: 0 }, // 0,01 мкФ output: E on XT4

    { col: 0, row: 4, moduleId: 'block_007', rotation: 1 }, // 1 МОм, unconnected
    { col: 1, row: 4, moduleId: 'block_005', rotation: 0 }, // 680 кОм, unconnected
    { col: 2, row: 4, moduleId: 'block_009', rotation: 1 }, // 0,01 мкФ, unconnected
    { col: 3, row: 4, moduleId: 'block_010', rotation: 2 }, // 680 пФ, unconnected
    { col: 4, row: 4, moduleId: 'block_004', rotation: 1 }, // 68 кОм, unconnected
    { col: 5, row: 4, moduleId: 'block_025', rotation: 0 }, // «Мостик»
  ],
  expect: { gatedByButton: true, minRms: 0.15, freqHz: [1200, 3200] },
};

/**
 * Device 26 «Электронная няня», page 35 of the manual: the factory mounting drawing, transcribed
 * cell by cell like device 6. All 30 cells are filled and the antenna sits in its slot.
 *
 * A КТ315Б oscillates on the antenna: 12 кОм from the supply feeds L1, whose tap is the
 * collector, with C10 across the whole winding through XT5 and XT6; L2 is in the emitter. The
 * base is biased from the supply through 680 кОм, 1 МОм and 680 кОм, and 680 пФ runs from the
 * base to the input. 0,01 мкФ takes the signal from the top of L1 to XT4, and 20 мкФ decouples
 * the supply.
 *
 * The two supplied wires are the moisture probe: one clips to the left contact of row 4, which
 * is the input node, and one to the left contact of row 1, which reaches ground through the top
 * strip and the electrolytic in the top-right cell. Their free ends lie loose under the baby, so
 * they are not leads between two contacts and are left out here. The oscillator runs at radio
 * frequency, which an audio-rate solver cannot integrate, hence `simulates: false`.
 */
export const DEVICE_26: Circuit = {
  id: 'device26',
  title: 'Электронная няня (устройство 26)',
  description:
    'Заводская схема со страницы 35 руководства. Транзистор с магнитной антенной работает ' +
    'как генератор. Два провода, прижатые к левым контактам первого и четвёртого рядов, ' +
    'служат датчиком влаги: их свободные концы кладут под пелёнку, и когда между ними ' +
    'появляется влага, раздаётся предупреждающий сигнал; его слышно и на приёмнике ' +
    'длинных волн рядом. Раскладка повторяет заводской рисунок: заняты все 30 гнёзд. ' +
    'Провода-датчик эмулятор пока не моделирует, а генератор работает на радиочастоте.',
  source: 'manual page 35, device 26: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: false,
  volume: 0.6,
  placements: [
    { col: 0, row: 0, moduleId: 'block_024', rotation: 2 }, // «Тройник»: N on the top strip
    { col: 1, row: 0, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 2, row: 0, moduleId: 'block_009', rotation: 3 }, // 0,01 мкФ, spare
    { col: 3, row: 0, moduleId: 'block_015', rotation: 3 }, // 20 мкФ, spare
    { col: 4, row: 0, moduleId: 'block_022', rotation: 0 }, // «Щель»
    { col: 5, row: 0, moduleId: 'block_014', rotation: 3 }, // 20 мкФ decoupling: − on XT1

    { col: 0, row: 1, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 1, row: 1, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 2, row: 1, moduleId: 'block_024', rotation: 1 }, // «Тройник»
    { col: 3, row: 1, moduleId: 'block_024', rotation: 2 }, // «Тройник»
    { col: 4, row: 1, moduleId: 'block_001', rotation: 3 }, // 2,2 кОм, spare
    { col: 5, row: 1, moduleId: 'block_023', rotation: 1 }, // «Линия»

    { col: 0, row: 2, moduleId: 'block_001', rotation: 0 }, // 2,2 кОм, spare
    { col: 1, row: 2, moduleId: 'block_007', rotation: 3 }, // 1 МОм, spare
    { col: 2, row: 2, moduleId: 'block_008', rotation: 2 }, // 1 МОм base bias
    { col: 3, row: 2, moduleId: 'block_005', rotation: 1 }, // 680 кОм base bias, from supply
    { col: 4, row: 2, moduleId: 'block_002', rotation: 0 }, // 12 кОм collector feed
    { col: 5, row: 2, moduleId: 'block_021', rotation: 0 }, // «Крест»: E on XT3

    { col: 0, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»: W is the input clip point
    { col: 1, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 2, row: 3, moduleId: 'block_020', rotation: 1 }, // «Угол»
    { col: 3, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 4, row: 3, moduleId: 'block_024', rotation: 3 }, // «Тройник»
    { col: 5, row: 3, moduleId: 'block_012', rotation: 2 }, // 0,01 мкФ output: E on XT4

    { col: 0, row: 4, moduleId: 'block_013', rotation: 1 }, // 0,01 мкФ, spare
    { col: 1, row: 4, moduleId: 'block_006', rotation: 2 }, // 680 кОм base bias, to the base
    { col: 2, row: 4, moduleId: 'block_010', rotation: 0 }, // 680 пФ base to input
    { col: 3, row: 4, moduleId: 'block_017', rotation: 0 }, // КТ315Б
    { col: 4, row: 4, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 5, row: 4, moduleId: 'block_022', rotation: 1 }, // «Щель»: E on XT5

    { col: 0, row: ANTENNA_ROW, moduleId: 'block_019' }, // антенна: E end on XT6
  ],
  expect: {},
};

/**
 * Device 24 «Реле времени», page 33 of the manual: the factory mounting drawing, transcribed
 * cell by cell like devices 6 and 26, antenna included.
 *
 * The same antenna oscillator as device 26 (12 кОм feeding the top of L1, the collector on its
 * tap, L2 in the emitter, C10 across the whole winding, 0,01 мкФ out to XT4), but its base is
 * fed from a timing capacitor. Holding the кнопка charges 20 мкФ from the supply through 68 кОм;
 * the capacitor feeds the base through 680 кОм + 680 кОм, with 3300 пФ and 680 пФ from the base
 * to ground. Released, the capacitor keeps the base fed until it runs down, so the tone stops
 * some time after the button is let go. A second 20 мкФ decouples the supply.
 *
 * The oscillator runs at radio frequency, which an audio-rate solver cannot integrate, so the
 * tone itself is not heard (`simulates: false`); the timing — the capacitor charging while the
 * button is held and running down after — is solved exactly.
 */
export const DEVICE_24: Circuit = {
  id: 'device24',
  title: 'Реле времени (устройство 24)',
  description:
    'Заводская схема со страницы 33 руководства. Пока кнопка нажата, конденсатор 20 мкФ ' +
    'заряжается через 68 кОм и питает базу транзистора генератора; через некоторое время ' +
    'появляется звук, частота которого постепенно меняется. Отпустите кнопку — звук ' +
    'оборвётся не сразу, а когда конденсатор разрядится. Раскладка повторяет заводской ' +
    'рисунок: заняты все 30 гнёзд. Генератор работает на радиочастоте, поэтому сам звук ' +
    'эмулятор пока не воспроизводит; заряд и разряд конденсатора считаются.',
  source: 'manual page 33, device 24: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: false,
  volume: 0.6,
  placements: [
    { col: 0, row: 0, moduleId: 'block_001', rotation: 2 }, // 2,2 кОм, shorted spare
    { col: 1, row: 0, moduleId: 'block_015', rotation: 3 }, // 20 мкФ timing: − on the top strip
    { col: 2, row: 0, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 3, row: 0, moduleId: 'block_024', rotation: 2 }, // «Тройник»
    { col: 4, row: 0, moduleId: 'block_024', rotation: 2 }, // «Тройник»
    { col: 5, row: 0, moduleId: 'block_014', rotation: 3 }, // 20 мкФ decoupling: − on XT1

    { col: 0, row: 1, moduleId: 'block_001', rotation: 2 }, // 2,2 кОм, spare
    { col: 1, row: 1, moduleId: 'block_026', rotation: 3 }, // кнопка: N, S joined; E switched
    { col: 2, row: 1, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 3, row: 1, moduleId: 'block_003', rotation: 3 }, // 68 кОм from the supply
    { col: 4, row: 1, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 5, row: 1, moduleId: 'block_023', rotation: 1 }, // «Линия»

    { col: 0, row: 2, moduleId: 'block_023', rotation: 1 }, // «Линия»
    { col: 1, row: 2, moduleId: 'block_005', rotation: 1 }, // 680 кОм, first of the base chain
    { col: 2, row: 2, moduleId: 'block_020', rotation: 3 }, // «Угол»
    { col: 3, row: 2, moduleId: 'block_007', rotation: 2 }, // 1 МОм, spare
    { col: 4, row: 2, moduleId: 'block_002', rotation: 0 }, // 12 кОм collector feed
    { col: 5, row: 2, moduleId: 'block_021', rotation: 0 }, // «Крест»: E on XT3

    { col: 0, row: 3, moduleId: 'block_024', rotation: 3 }, // «Тройник»
    { col: 1, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 2, row: 3, moduleId: 'block_004', rotation: 0 }, // 68 кОм, spare
    { col: 3, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 4, row: 3, moduleId: 'block_024', rotation: 3 }, // «Тройник»
    { col: 5, row: 3, moduleId: 'block_012', rotation: 2 }, // 0,01 мкФ output: E on XT4

    { col: 0, row: 4, moduleId: 'block_011', rotation: 1 }, // 3300 пФ base to ground
    { col: 1, row: 4, moduleId: 'block_006', rotation: 2 }, // 680 кОм, second of the base chain
    { col: 2, row: 4, moduleId: 'block_010', rotation: 0 }, // 680 пФ base to ground
    { col: 3, row: 4, moduleId: 'block_017', rotation: 0 }, // КТ315Б
    { col: 4, row: 4, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 5, row: 4, moduleId: 'block_022', rotation: 1 }, // «Щель»: E on XT5

    { col: 0, row: ANTENNA_ROW, moduleId: 'block_019' }, // антенна: E end on XT6
  ],
  expect: {},
};

export const CIRCUITS: Circuit[] = [DETECTOR_RECEIVER, DEVICE_6, DEVICE_24, DEVICE_26];

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
