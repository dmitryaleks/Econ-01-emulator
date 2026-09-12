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
