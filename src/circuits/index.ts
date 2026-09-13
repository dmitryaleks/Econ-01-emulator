/**
 * Ready-made circuits. Module ids are block names from `assets/blocks/block_spec.json`.
 * Two caveats are carried in the data rather than hidden:
 *
 * `kitLegal`  — the arrangement uses no more modules and no more leads than the box contains.
 *
 * `simulates` — whether the solver reproduces what the manual describes. Where it does not,
 *               the circuit is still transcribed and its netlist checked against the
 *               schematic in test/circuits.test.ts; the preset's comment says what is
 *               missing.
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
  /** Holding the кнопка must move the pitch, up or down, by at least this fraction. */
  buttonShiftsPitch?: number;
  /** Near silent until the кнопка is held, then audible. */
  gatedByButton?: boolean;
  /** Measured with the кнопка held; what it does released is left to the circuit's own tests. */
  whileHeld?: boolean;
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
 *
 * Held, it sounds near 2,4 кГц at 48 and 96 кГц alike: a 27 мкс pulse through 12 кОм and
 * 3300 пФ, then a long pause while 68 кОм recharges 0,01 мкФ from the −6,6 V the emitter-base
 * breakdown clamps its base at. Every edge needs substeps down to nanoseconds (sim/mna.ts,
 * `advance`), so it costs about twice real time in Node — more than a browser can keep up with.
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
  simulates: true,
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
  expect: { gatedByButton: true, minRms: 0.5, freqHz: [1900, 2800] },
};

/**
 * Device 8 «Мультивибратор с низкой частотой колебаний», page 17 of the manual: the factory
 * mounting drawing, transcribed cell by cell. All 30 cells are filled; no lead, no antenna.
 *
 * Device 6's circuit with 20 мкФ electrolytics for coupling capacitors: each collector has
 * 2,2 кОм, the left collector's 20 мкФ (+ on the collector) drives the right base, biased by
 * 12 кОм, and the right collector's 20 мкФ drives the left base, biased by 680 кОм and 68 кОм side
 * by side. Two 0,01 мкФ in parallel take the right collector to XT4. The emitters are grounded;
 * there is no кнопка.
 *
 * The loudspeaker clicks as the collectors switch: the right collector stays low for 0,94 с and
 * high for 0,12 с, a period of 1,06 с at 12 and 48 кГц alike. The manual speaks of intervals of
 * several seconds, which electrolytics at the top of their +80 % tolerance would stretch towards.
 *
 * Spares: a 0,01 мкФ with both ends on ground, a 680 пФ with one end on the right collector, and
 * two 1 МОм joined to each other and nothing else.
 */
export const DEVICE_8: Circuit = {
  id: 'device8',
  title: 'Медленный мультивибратор (устройство 8)',
  description:
    'Заводская схема со страницы 17 руководства: мультивибратор с низкой частотой колебаний. ' +
    'Он собран как симметричный мультивибратор, только в базовых цепях стоят конденсаторы ' +
    '20 мкФ, поэтому переключается он примерно раз в секунду, и громкоговоритель щёлкает. ' +
    'Регулятор громкости поставьте на максимум. Раскладка повторяет заводской рисунок: заняты ' +
    'все 30 гнёзд.',
  source: 'manual page 17, device 8: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: true,
  volume: 1,
  placements: [
    { col: 0, row: 0, moduleId: 'block_022', rotation: 1 }, // «Щель»
    { col: 1, row: 0, moduleId: 'block_009', rotation: 0 }, // 0,01 мкФ, spare: both ends on ground
    { col: 2, row: 0, moduleId: 'block_023', rotation: 0 }, // «Линия»: ground
    { col: 3, row: 0, moduleId: 'block_018', rotation: 2 }, // КТ315Б, left: base E, emitter N
    { col: 4, row: 0, moduleId: 'block_024', rotation: 0 }, // «Тройник»: left base
    { col: 5, row: 0, moduleId: 'block_004', rotation: 2 }, // 68 кОм left base bias; strip on XT1

    { col: 0, row: 1, moduleId: 'block_023', rotation: 1 }, // «Линия», dead end
    { col: 1, row: 1, moduleId: 'block_017', rotation: 2 }, // КТ315Б, right: base E, emitter N
    { col: 2, row: 1, moduleId: 'block_015', rotation: 2 }, // 20 мкФ left collector (+) to right base
    { col: 3, row: 1, moduleId: 'block_024', rotation: 1 }, // «Тройник»: left collector
    { col: 4, row: 1, moduleId: 'block_014', rotation: 3 }, // 20 мкФ right collector (+) to left base
    { col: 5, row: 1, moduleId: 'block_006', rotation: 1 }, // 680 кОм left base bias

    { col: 0, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 1, row: 2, moduleId: 'block_001', rotation: 2 }, // 2,2 кОм right collector load
    { col: 2, row: 2, moduleId: 'block_002', rotation: 2 }, // 12 кОм right base bias
    { col: 3, row: 2, moduleId: 'block_001', rotation: 1 }, // 2,2 кОм left collector load
    { col: 4, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 5, row: 2, moduleId: 'block_024', rotation: 2 }, // «Тройник»: supply from XT3

    { col: 0, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 1, row: 3, moduleId: 'block_020', rotation: 3 }, // «Угол»: right collector
    { col: 2, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»: right collector
    { col: 3, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»: right collector
    { col: 4, row: 3, moduleId: 'block_021', rotation: 0 }, // «Крест»: right collector
    { col: 5, row: 3, moduleId: 'block_013', rotation: 0 }, // 0,01 мкФ output: E on XT4

    { col: 0, row: 4, moduleId: 'block_007', rotation: 1 }, // 1 МОм, spare
    { col: 1, row: 4, moduleId: 'block_008', rotation: 2 }, // 1 МОм, spare
    { col: 2, row: 4, moduleId: 'block_022', rotation: 1 }, // «Щель»
    { col: 3, row: 4, moduleId: 'block_010', rotation: 2 }, // 680 пФ, spare: one end loose
    { col: 4, row: 4, moduleId: 'block_024', rotation: 2 }, // «Тройник»: right collector
    { col: 5, row: 4, moduleId: 'block_012', rotation: 0 }, // 0,01 мкФ output: E on XT5, wired to XT4
  ],
  expect: { seconds: 2.5, minRms: 0.05 },
};

/**
 * Device 9 «Пищалка», page 18 of the manual: the factory mounting drawing, transcribed cell by
 * cell like device 6. All 30 main-grid cells are filled; no lead, no antenna.
 *
 * Its netlist is the schematic. The left КТ315Б has 68 кОм from the supply to its collector, and
 * 680 кОм with 0,01 мкФ across from collector to base. Its emitter goes through 2,2 кОм and the
 * кнопка to ground, which reaches XT1 over the top strip and the electrolytic's wire, as in
 * device 24. Its collector drives the right КТ315Б's base through 680 пФ, biased by 1 МОм from
 * the supply. The right collector, on 2,2 кОм, returns to the left base through 0,01 мкФ and
 * feeds XT4 through 3300 пФ. 20 мкФ decouples the supply.
 *
 * Three modules touch the circuit at one end only: the 1 МОм at (1,0), the 12 кОм at (1,4) and
 * the 0,01 мкФ at (0,4).
 *
 * Unlike device 6 it is not a pair of cross-coupled switches but two amplifying stages in a
 * loop, so it starts from its operating point on its own. Its pitch carries backward Euler's
 * first-order error: about 2,1 кГц at 48 кГц and 2,0 кГц at 96 кГц, settling near 1,87 кГц as the
 * step shrinks.
 */
export const DEVICE_9: Circuit = {
  id: 'device9',
  title: 'Пищалка (устройство 9)',
  description:
    'Заводская схема со страницы 18 руководства. Тоже мультивибратор: с ним можно учить ' +
    'азбуку Морзе. Кнопка в цепи эмиттера левого транзистора работает как телеграфный ключ, ' +
    'а резистор 2,2 кОм там же уменьшает сигнал, идущий на усилитель. Громкость установите ' +
    'регулятором. Раскладка повторяет заводской рисунок: заняты все 30 гнёзд.',
  source: 'manual page 18, device 9: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: true,
  volume: 0.5,
  placements: [
    { col: 0, row: 0, moduleId: 'block_026', rotation: 0 }, // кнопка: E to ground, S to 2,2 кОм
    { col: 1, row: 0, moduleId: 'block_008', rotation: 3 }, // 1 МОм, spare: one end loose
    { col: 2, row: 0, moduleId: 'block_017', rotation: 2 }, // КТ315Б, right: E on the strip
    { col: 3, row: 0, moduleId: 'block_024', rotation: 0 }, // «Тройник»
    { col: 4, row: 0, moduleId: 'block_007', rotation: 2 }, // 1 МОм, right base bias
    { col: 5, row: 0, moduleId: 'block_014', rotation: 3 }, // 20 мкФ: − and the strip on XT1

    { col: 0, row: 1, moduleId: 'block_001', rotation: 1 }, // 2,2 кОм, left emitter
    { col: 1, row: 1, moduleId: 'block_020', rotation: 0 }, // «Угол»
    { col: 2, row: 1, moduleId: 'block_012', rotation: 0 }, // 0,01 мкФ, feedback to left base
    { col: 3, row: 1, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 4, row: 1, moduleId: 'block_022', rotation: 1 }, // «Щель»
    { col: 5, row: 1, moduleId: 'block_024', rotation: 1 }, // «Тройник»

    { col: 0, row: 2, moduleId: 'block_018', rotation: 2 }, // КТ315Б, left
    { col: 1, row: 2, moduleId: 'block_024', rotation: 1 }, // «Тройник»
    { col: 2, row: 2, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 3, row: 2, moduleId: 'block_023', rotation: 1 }, // «Линия»
    { col: 4, row: 2, moduleId: 'block_001', rotation: 2 }, // 2,2 кОм, right collector load
    { col: 5, row: 2, moduleId: 'block_021', rotation: 0 }, // «Крест»: E on XT3

    { col: 0, row: 3, moduleId: 'block_009', rotation: 2 }, // 0,01 мкФ, left collector to base
    { col: 1, row: 3, moduleId: 'block_024', rotation: 2 }, // «Тройник»
    { col: 2, row: 3, moduleId: 'block_022', rotation: 1 }, // «Щель»
    { col: 3, row: 3, moduleId: 'block_025', rotation: 1 }, // «Мостик»
    { col: 4, row: 3, moduleId: 'block_011', rotation: 1 }, // 3300 пФ output
    { col: 5, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»: E on XT4

    { col: 0, row: 4, moduleId: 'block_013', rotation: 3 }, // 0,01 мкФ, spare: one end loose
    { col: 1, row: 4, moduleId: 'block_002', rotation: 0 }, // 12 кОм, spare: one end loose
    { col: 2, row: 4, moduleId: 'block_006', rotation: 2 }, // 680 кОм, left collector to base
    { col: 3, row: 4, moduleId: 'block_010', rotation: 0 }, // 680 пФ, left collector to right base
    { col: 4, row: 4, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 5, row: 4, moduleId: 'block_004', rotation: 3 }, // 68 кОм, left collector load
  ],
  expect: { gatedByButton: true, minRms: 0.5, freqHz: [1700, 2300] },
};

/**
 * Device 12 «Сирена», page 21 of the manual: the factory mounting drawing, transcribed cell by
 * cell. All 30 cells are filled; no lead, no antenna.
 *
 * A classic multivibrator, like device 6, with different arms: the left КТ315Б has 68 кОм base
 * bias and 12 кОм collector load, the right 1 МОм and 2,2 кОм; 3300 пФ couples the left collector
 * to the right base and 0,01 мкФ the right collector back to the left base. The right collector
 * also feeds XT4 through 0,01 мкФ. The left emitter goes to ground through 20 мкФ, which the
 * кнопка shorts.
 *
 * Held, the emitter is grounded and it sounds near 410 Гц. Let go, the emitter current charges
 * the 20 мкФ: the pitch climbs to about 1,3 кГц in half a second, then falls as the emitter rises
 * towards the base, and the tone dies within a second and a half — the left transistor has no
 * path for DC left. Pressing again discharges the capacitor. The same happens once when the board
 * is built, since the capacitor starts empty. The manual: «Нажимая и отпуская кнопку, можно
 * приближенно имитировать сигнал сирены».
 *
 * Six modules carry only a wire or nothing: the 68 кОм at (0,0), the 1 МОм at (0,3) and the
 * 20 мкФ at (1,4) carry a wire on their other pair of contacts; the 680 кОм at (0,4) is loose,
 * and the 680 кОм at (5,4) joins XT5 to ground.
 */
export const DEVICE_12: Circuit = {
  id: 'device12',
  title: 'Сирена (устройство 12)',
  description:
    'Заводская схема со страницы 21 руководства. Мультивибратор, в цепь эмиттера левого ' +
    'транзистора которого включён конденсатор 20 мкФ. Пока кнопка нажата, звучит ровный тон. ' +
    'Отпустите её — конденсатор заряжается, частота растёт, потом падает, и звук затихает. ' +
    'Нажимая и отпуская кнопку, можно имитировать сигнал сирены. Громкость установите ' +
    'регулятором. Раскладка повторяет заводской рисунок: заняты все 30 гнёзд.',
  source: 'manual page 21, device 12: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: true,
  volume: 0.5,
  placements: [
    { col: 0, row: 0, moduleId: 'block_004', rotation: 3 }, // 68 кОм, spare; its wire carries C2
    { col: 1, row: 0, moduleId: 'block_023', rotation: 0 }, // «Линия»: right collector
    { col: 2, row: 0, moduleId: 'block_024', rotation: 0 }, // «Тройник»
    { col: 3, row: 0, moduleId: 'block_020', rotation: 1 }, // «Угол»
    { col: 4, row: 0, moduleId: 'block_023', rotation: 1 }, // «Линия»: ground down column 4
    { col: 5, row: 0, moduleId: 'block_022', rotation: 1 }, // «Щель»: top strip on XT1

    { col: 0, row: 1, moduleId: 'block_009', rotation: 1 }, // 0,01 мкФ right collector to left base
    { col: 1, row: 1, moduleId: 'block_003', rotation: 0 }, // 68 кОм left base bias
    { col: 2, row: 1, moduleId: 'block_001', rotation: 1 }, // 2,2 кОм right collector load
    { col: 3, row: 1, moduleId: 'block_025', rotation: 0 }, // «Мостик»: supply across
    { col: 4, row: 1, moduleId: 'block_025', rotation: 0 }, // «Мостик»: supply across, ground down
    { col: 5, row: 1, moduleId: 'block_021', rotation: 0 }, // «Крест»: supply from XT3

    { col: 0, row: 2, moduleId: 'block_023', rotation: 1 }, // «Линия»: left base
    { col: 1, row: 2, moduleId: 'block_002', rotation: 0 }, // 12 кОм left collector load
    { col: 2, row: 2, moduleId: 'block_008', rotation: 3 }, // 1 МОм right base bias
    { col: 3, row: 2, moduleId: 'block_024', rotation: 3 }, // «Тройник»: right collector
    { col: 4, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»: C2 across, ground down
    { col: 5, row: 2, moduleId: 'block_022', rotation: 1 }, // «Щель»: XT3 up, C2 down

    { col: 0, row: 3, moduleId: 'block_007', rotation: 2 }, // 1 МОм, spare; its wire: left base
    { col: 1, row: 3, moduleId: 'block_017', rotation: 0 }, // КТ315Б, left
    { col: 2, row: 3, moduleId: 'block_011', rotation: 0 }, // 3300 пФ left collector to right base
    { col: 3, row: 3, moduleId: 'block_018', rotation: 0 }, // КТ315Б, right
    { col: 4, row: 3, moduleId: 'block_024', rotation: 1 }, // «Тройник»: ground to right emitter
    { col: 5, row: 3, moduleId: 'block_013', rotation: 2 }, // 0,01 мкФ output: E on XT4

    { col: 0, row: 4, moduleId: 'block_006', rotation: 1 }, // 680 кОм, unconnected
    { col: 1, row: 4, moduleId: 'block_014', rotation: 3 }, // 20 мкФ, spare; its wire: left emitter
    { col: 2, row: 4, moduleId: 'block_024', rotation: 2 }, // «Тройник»: left emitter
    { col: 3, row: 4, moduleId: 'block_026', rotation: 2 }, // кнопка: left emitter to ground
    { col: 4, row: 4, moduleId: 'block_015', rotation: 0 }, // 20 мкФ in the left emitter
    { col: 5, row: 4, moduleId: 'block_005', rotation: 1 }, // 680 кОм, spare: XT5 to ground
  ],
  expect: { whileHeld: true, minRms: 0.5, freqHz: [370, 460] },
};

/**
 * Device 13 «Звуковой генератор», page 22 of the manual: the factory mounting drawing,
 * transcribed cell by cell. All 30 cells are filled; no antenna.
 *
 * The same two-stage loop as device 9 with other values and no кнопка. The left КТ315Б has
 * 68 кОм from the supply to its collector and 1 МОм from collector to base; its emitter goes to
 * ground through 2,2 кОм. The collector drives the right base through 680 пФ, biased by 1 МОм from
 * the supply; the right collector, on 12 кОм, returns to the left base through 3300 пФ and feeds
 * XT4 through 0,01 мкФ. 20 мкФ decouples the supply. It sounds near 400 Гц at every sample rate.
 *
 * The page draws three wires out of the panel, to the instrument being adjusted: «Выход 1», the
 * low-impedance output, through 0,01 мкФ from the left emitter, clipped to the left contact of
 * row 4; «Выход 2», the high-impedance one, through 0,01 мкФ from the right collector, clipped to
 * the bottom contact of (5,4); and the common wire from the top strip. Their far ends are loose,
 * so, like device 26's probe, they are described rather than placed. The loudspeaker plays the
 * tone meanwhile.
 *
 * Spares: the 20 мкФ at (4,0), the 68 кОм at (1,2), the 2,2 кОм at (0,4) and the 680 кОм at (1,4)
 * each touch the circuit at one end at most. The right collector also reaches XT5 through the
 * wire of the output capacitor at (5,4); C10 floats at XT6, so nothing flows.
 */
export const DEVICE_13: Circuit = {
  id: 'device13',
  title: 'Звуковой генератор (устройство 13)',
  description:
    'Заводская схема со страницы 22 руководства. Мультивибратор для настройки усилителей ' +
    'звуковой частоты. У генератора два выхода: 1 — низкоомный, 2 — высокоомный; провода к ' +
    'настраиваемому прибору эмулятор не моделирует, а тон слышен в громкоговорителе. ' +
    'Громкость установите регулятором. Раскладка повторяет заводской рисунок: заняты все 30 гнёзд.',
  source: 'manual page 22, device 13: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: true,
  volume: 0.5,
  placements: [
    { col: 0, row: 0, moduleId: 'block_023', rotation: 1 }, // «Линия»: ground down column 0
    { col: 1, row: 0, moduleId: 'block_024', rotation: 0 }, // «Тройник»: right base
    { col: 2, row: 0, moduleId: 'block_008', rotation: 2 }, // 1 МОм right base bias
    { col: 3, row: 0, moduleId: 'block_020', rotation: 1 }, // «Угол»: supply
    { col: 4, row: 0, moduleId: 'block_015', rotation: 3 }, // 20 мкФ, spare: + loose
    { col: 5, row: 0, moduleId: 'block_014', rotation: 3 }, // 20 мкФ: − and the strip on XT1

    { col: 0, row: 1, moduleId: 'block_001', rotation: 3 }, // 2,2 кОм left emitter to ground
    { col: 1, row: 1, moduleId: 'block_017', rotation: 1 }, // КТ315Б, right: base N, emitter W
    { col: 2, row: 1, moduleId: 'block_023', rotation: 1 }, // «Линия»: right base
    { col: 3, row: 1, moduleId: 'block_024', rotation: 3 }, // «Тройник»: supply
    { col: 4, row: 1, moduleId: 'block_024', rotation: 0 }, // «Тройник»: supply
    { col: 5, row: 1, moduleId: 'block_021', rotation: 0 }, // «Крест»: supply from XT3

    { col: 0, row: 2, moduleId: 'block_023', rotation: 1 }, // «Линия»: left emitter
    { col: 1, row: 2, moduleId: 'block_004', rotation: 2 }, // 68 кОм, spare; its wire: C2
    { col: 2, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 3, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 4, row: 2, moduleId: 'block_002', rotation: 2 }, // 12 кОм right collector load
    { col: 5, row: 2, moduleId: 'block_022', rotation: 1 }, // «Щель»: XT3 up, C2 down

    { col: 0, row: 3, moduleId: 'block_012', rotation: 0 }, // 0,01 мкФ to «Выход 1» (W clip)
    { col: 1, row: 3, moduleId: 'block_018', rotation: 2 }, // КТ315Б, left: base E, emitter N
    { col: 2, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 3, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 4, row: 3, moduleId: 'block_011', rotation: 2 }, // 3300 пФ right collector to left base
    { col: 5, row: 3, moduleId: 'block_009', rotation: 2 }, // 0,01 мкФ output: E on XT4

    { col: 0, row: 4, moduleId: 'block_001', rotation: 2 }, // 2,2 кОм, spare
    { col: 1, row: 4, moduleId: 'block_005', rotation: 1 }, // 680 кОм, spare
    { col: 2, row: 4, moduleId: 'block_010', rotation: 0 }, // 680 пФ left collector to right base
    { col: 3, row: 4, moduleId: 'block_003', rotation: 1 }, // 68 кОм left collector load
    { col: 4, row: 4, moduleId: 'block_007', rotation: 3 }, // 1 МОм left collector to base
    { col: 5, row: 4, moduleId: 'block_013', rotation: 3 }, // 0,01 мкФ to «Выход 2» (S contact)
  ],
  expect: { minRms: 0.5, freqHz: [340, 460] },
};

/**
 * Device 15, «Генератор для изучения азбуки Морзе с сигналом помех», page 24 of the manual: the
 * factory mounting drawing, transcribed cell by cell from a faint scan with its contrast raised.
 * All 30 cells are filled; no lead, no antenna.
 *
 * A classic multivibrator. The left КТ315Б has 680 кОм base bias and 2,2 кОм collector load, the
 * right 1 МОм and 2,2 кОм; 680 пФ couples the left collector to the right base, 0,01 мкФ the right
 * collector to the left base, and 3300 пФ takes the output to XT4. The кнопка puts a second
 * 0,01 мкФ beside the 680 пФ. There is no supply capacitor.
 *
 * Released it whistles near 1,6 кГц — the «помехи». The right transistor's 1 МОм cannot saturate
 * it, so it conducts only while the 680 пФ kicks it: an 18 мкс pulse per cycle, and the period is
 * set by the right base recovering through 1 МОм. Held, the extra 0,01 мкФ drops the tone to about
 * 570 Гц: the Morse signal, a dot for a short press and a dash for a long one. Both at 24, 48 and
 * 96 кГц; below 24 кГц the short pulse gets lost.
 *
 * Spares: the 0,01 мкФ at (0,1) from ground to a clip point; the 1 МОм at (0,4) and the 68 кОм at
 * (3,4), loose at both ends. The output capacitor sits on XT5, which a wire joins to XT4.
 */
export const DEVICE_15: Circuit = {
  id: 'device15',
  title: 'Азбука Морзе с помехами (устройство 15)',
  description:
    'Заводская схема со страницы 24 руководства: генератор для изучения азбуки Морзе с ' +
    'сигналом помех. Мультивибратор непрерывно свистит — это помехи. Кнопка подключает ' +
    'второй конденсатор, и тон становится ниже: короткое нажатие — точка, длинное — тире. ' +
    'Громкость установите регулятором. Раскладка повторяет заводской рисунок: заняты все 30 гнёзд.',
  source: 'manual page 24, device 15: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: true,
  volume: 0.5,
  placements: [
    { col: 0, row: 0, moduleId: 'block_022', rotation: 0 }, // «Щель»: ground to the left emitter
    { col: 1, row: 0, moduleId: 'block_021', rotation: 0 }, // «Крест»: ground from the strip
    { col: 2, row: 0, moduleId: 'block_023', rotation: 1 }, // «Линия», dead end
    { col: 3, row: 0, moduleId: 'block_017', rotation: 2 }, // КТ315Б, right: base E, emitter N
    { col: 4, row: 0, moduleId: 'block_008', rotation: 2 }, // 1 МОм right base bias
    { col: 5, row: 0, moduleId: 'block_022', rotation: 1 }, // «Щель»: strip on XT1, supply across

    { col: 0, row: 1, moduleId: 'block_012', rotation: 0 }, // 0,01 мкФ, spare
    { col: 1, row: 1, moduleId: 'block_018', rotation: 2 }, // КТ315Б, left: base E, emitter N
    { col: 2, row: 1, moduleId: 'block_024', rotation: 0 }, // «Тройник»: left base
    { col: 3, row: 1, moduleId: 'block_009', rotation: 0 }, // 0,01 мкФ right collector to left base
    { col: 4, row: 1, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 5, row: 1, moduleId: 'block_001', rotation: 0 }, // 2,2 кОм right collector load

    { col: 0, row: 2, moduleId: 'block_023', rotation: 1 }, // «Линия», unconnected
    { col: 1, row: 2, moduleId: 'block_001', rotation: 2 }, // 2,2 кОм left collector load
    { col: 2, row: 2, moduleId: 'block_006', rotation: 2 }, // 680 кОм left base bias
    { col: 3, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 4, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 5, row: 2, moduleId: 'block_024', rotation: 2 }, // «Тройник»: supply from XT3

    { col: 0, row: 3, moduleId: 'block_023', rotation: 1 }, // «Линия», unconnected
    { col: 1, row: 3, moduleId: 'block_010', rotation: 0 }, // 680 пФ left collector to right base
    { col: 2, row: 3, moduleId: 'block_024', rotation: 0 }, // «Тройник»: right base
    { col: 3, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 4, row: 3, moduleId: 'block_024', rotation: 1 }, // «Тройник»: right base up column 4
    { col: 5, row: 3, moduleId: 'block_020', rotation: 0 }, // «Угол»: XT4 down to XT5

    { col: 0, row: 4, moduleId: 'block_007', rotation: 2 }, // 1 МОм, unconnected
    { col: 1, row: 4, moduleId: 'block_013', rotation: 2 }, // 0,01 мкФ in series with the кнопка
    { col: 2, row: 4, moduleId: 'block_026', rotation: 1 }, // кнопка: N–S the right base, W switched
    { col: 3, row: 4, moduleId: 'block_004', rotation: 2 }, // 68 кОм, spare; its wire: C2
    { col: 4, row: 4, moduleId: 'block_023', rotation: 0 }, // «Линия»: right collector
    { col: 5, row: 4, moduleId: 'block_011', rotation: 0 }, // 3300 пФ output: E on XT5
  ],
  expect: { minRms: 0.5, freqHz: [1300, 1900], buttonShiftsPitch: 0.5 },
};

/**
 * Device 27 «Двухтональный генератор», page 36 of the manual: the factory mounting drawing,
 * transcribed cell by cell. All 30 cells are filled and the antenna sits in its slot.
 *
 * It is device 26's antenna oscillator with the moisture probe replaced by a two-tone switch.
 * 12 кОм from the supply feeds the top of L1, C10 is across the whole winding, the collector is
 * on the tap and L2 is in the emitter. The base is biased from the supply through 1 МОм, 1 МОм
 * and 680 кОм. L2's return, which also carries the 680 пФ from the base, goes to ground through
 * 68 кОм, 3300 пФ and the кнопка in parallel. 0,01 мкФ takes the signal from the top of L1 to
 * XT4, and 20 мкФ decouples the supply.
 *
 * The oscillator squegs, and the RC on its return sets how deep each burst pumps the base, so
 * the кнопка shorting it changes the tone. The 2,2 кОм at (4,1) and the 0,01 мкФ at (0,4) touch
 * nothing; the 68 кОм at (3,3) touches the base chain at one end only.
 */
export const DEVICE_27: Circuit = {
  id: 'device27',
  title: 'Двухтональный генератор (устройство 27)',
  description:
    'Заводская схема со страницы 36 руководства. Частота колебаний генератора зависит от ' +
    'положения кнопки: нажата — одна, отпущена — другая. В цепь питания генератора включена ' +
    'цепочка из параллельно соединённых резистора и конденсатора; кнопка её закорачивает. ' +
    'Громкость установите регулятором. Раскладка повторяет заводской рисунок: заняты все ' +
    '30 гнёзд.',
  source: 'manual page 36, device 27: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: true,
  volume: 0.5,
  placements: [
    { col: 0, row: 0, moduleId: 'block_023', rotation: 1 }, // «Линия»: to the top strip
    { col: 1, row: 0, moduleId: 'block_024', rotation: 1 }, // «Тройник»: кнопка to the strip
    { col: 2, row: 0, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 3, row: 0, moduleId: 'block_003', rotation: 3 }, // 68 кОм from L2's return
    { col: 4, row: 0, moduleId: 'block_022', rotation: 0 }, // «Щель»
    { col: 5, row: 0, moduleId: 'block_014', rotation: 3 }, // 20 мкФ: − and the strip on XT1

    { col: 0, row: 1, moduleId: 'block_011', rotation: 1 }, // 3300 пФ from L2's return
    { col: 1, row: 1, moduleId: 'block_026', rotation: 2 }, // кнопка: W–E joined, N switched
    { col: 2, row: 1, moduleId: 'block_024', rotation: 0 }, // «Тройник»
    { col: 3, row: 1, moduleId: 'block_024', rotation: 1 }, // «Тройник»
    { col: 4, row: 1, moduleId: 'block_001', rotation: 1 }, // 2,2 кОм, spare
    { col: 5, row: 1, moduleId: 'block_023', rotation: 1 }, // «Линия»

    { col: 0, row: 2, moduleId: 'block_020', rotation: 2 }, // «Угол»
    { col: 1, row: 2, moduleId: 'block_007', rotation: 1 }, // 1 МОм base bias
    { col: 2, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 3, row: 2, moduleId: 'block_008', rotation: 2 }, // 1 МОм base bias, from supply
    { col: 4, row: 2, moduleId: 'block_002', rotation: 0 }, // 12 кОм collector feed
    { col: 5, row: 2, moduleId: 'block_021', rotation: 0 }, // «Крест»: E on XT3

    { col: 0, row: 3, moduleId: 'block_025', rotation: 1 }, // «Мостик»
    { col: 1, row: 3, moduleId: 'block_025', rotation: 1 }, // «Мостик»
    { col: 2, row: 3, moduleId: 'block_023', rotation: 1 }, // «Линия»
    { col: 3, row: 3, moduleId: 'block_004', rotation: 3 }, // 68 кОм, spare: one end loose
    { col: 4, row: 3, moduleId: 'block_024', rotation: 3 }, // «Тройник»
    { col: 5, row: 3, moduleId: 'block_012', rotation: 2 }, // 0,01 мкФ output: E on XT4

    { col: 0, row: 4, moduleId: 'block_013', rotation: 1 }, // 0,01 мкФ, spare
    { col: 1, row: 4, moduleId: 'block_006', rotation: 2 }, // 680 кОм base bias, to the base
    { col: 2, row: 4, moduleId: 'block_010', rotation: 0 }, // 680 пФ base to L2's return
    { col: 3, row: 4, moduleId: 'block_017', rotation: 0 }, // КТ315Б
    { col: 4, row: 4, moduleId: 'block_025', rotation: 1 }, // «Мостик»
    { col: 5, row: 4, moduleId: 'block_022', rotation: 1 }, // «Щель»: E on XT5

    { col: 0, row: ANTENNA_ROW, moduleId: 'block_019' }, // антенна: E end on XT6
  ],
  expect: { minRms: 0.5, freqHz: [1100, 1450], buttonShiftsPitch: 0.08 },
};

/**
 * The other pair of tones page 36 offers: the 3300 пФ at (0,1), outlined on the drawing, gives way
 * to the 0,01 мкФ tee drawn beside the panel, turned 180° from how it is drawn. Turned that way its
 * joined corner meets the кнопка and a dead clip point, so the larger capacitor simply takes the
 * 3300 пФ's place. Fitted as drawn, the joined corner would reach the top strip and tie L2's
 * return straight to ground, as if the кнопка were always held.
 */
export const DEVICE_27_ALT: Circuit = {
  ...DEVICE_27,
  id: 'device27b',
  title: 'Двухтональный генератор, другие тона (устройство 27)',
  description:
    'Вариант со страницы 36 руководства: вместо выделенного на рисунке конденсатора 3300 пФ ' +
    'стоит модуль 0,01 мкФ, развёрнутый на 180° по отношению к изображённому справа. ' +
    'Тон при отпущенной кнопке становится ниже; нажатая кнопка по-прежнему закорачивает цепочку.',
  source: 'manual page 36, device 27: the replacement module drawn beside the panel',
  placements: DEVICE_27.placements.map((p) =>
    p.col === 0 && p.row === 1 ? { col: 0, row: 1, moduleId: 'block_009', rotation: 1 } : p,
  ),
  expect: { minRms: 0.5, freqHz: [1000, 1250], buttonShiftsPitch: 0.02 },
};

/**
 * Device 28 «Генератор сигналов», page 37 of the manual: the factory mounting drawing,
 * transcribed cell by cell. All 30 cells are filled and the antenna sits in its slot.
 *
 * Device 26's oscillator with nothing on L2's return: 12 кОм from the supply feeds the top of
 * L1, the collector sits on its tap, C10 is across the whole winding through XT5 and XT6, and L2
 * runs from the emitter straight to ground. The base is biased from the supply through
 * 1 МОм + 1 МОм + 680 кОм with 680 пФ to ground, and 0,01 мкФ takes the top of L1 to XT4. 20 мкФ
 * decouples the supply, and a second 20 мкФ sits beside it.
 *
 * The manual has a long-wave receiver placed in line with the antenna pick the signal up, and the
 * loudspeaker confirm that it works. What the loudspeaker gets is squegging: bursts of radio
 * frequency repeating about 1100 times a second, at 12 to 96 кГц alike.
 *
 * Spares: 3300 пФ with both ends on ground, two 2,2 кОм and two 0,01 мкФ joined to each other
 * and to nothing else.
 */
export const DEVICE_28: Circuit = {
  id: 'device28',
  title: 'Генератор сигналов (устройство 28)',
  description:
    'Заводская схема со страницы 37 руководства. Генератор на одном транзисторе с индуктивной ' +
    'обратной связью; колебательный контур — магнитная антенна с конденсатором настройки — ' +
    'включён в цепь коллектора. Его сигнал слышен на приёмнике длинных волн, если антенны ' +
    'лежат на одной прямой, а работу генератора подтверждает громкоговоритель. Раскладка ' +
    'повторяет заводской рисунок: заняты все 30 гнёзд.',
  source: 'manual page 37, device 28: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: true,
  volume: 0.5,
  placements: [
    { col: 0, row: 0, moduleId: 'block_020', rotation: 3 }, // «Угол»: ground
    { col: 1, row: 0, moduleId: 'block_011', rotation: 0 }, // 3300 пФ, spare: both ends on ground
    { col: 2, row: 0, moduleId: 'block_025', rotation: 0 }, // «Мостик»: ground down column 2
    { col: 3, row: 0, moduleId: 'block_015', rotation: 3 }, // 20 мкФ beside the other
    { col: 4, row: 0, moduleId: 'block_022', rotation: 0 }, // «Щель»
    { col: 5, row: 0, moduleId: 'block_014', rotation: 3 }, // 20 мкФ: − and the strip on XT1

    { col: 0, row: 1, moduleId: 'block_001', rotation: 2 }, // 2,2 кОм, spare
    { col: 1, row: 1, moduleId: 'block_001', rotation: 0 }, // 2,2 кОм, spare
    { col: 2, row: 1, moduleId: 'block_023', rotation: 1 }, // «Линия»: ground
    { col: 3, row: 1, moduleId: 'block_023', rotation: 1 }, // «Линия»: supply
    { col: 4, row: 1, moduleId: 'block_024', rotation: 2 }, // «Тройник»
    { col: 5, row: 1, moduleId: 'block_023', rotation: 1 }, // «Линия»: supply

    { col: 0, row: 2, moduleId: 'block_024', rotation: 1 }, // «Тройник»: supply
    { col: 1, row: 2, moduleId: 'block_007', rotation: 1 }, // 1 МОм base bias, from the supply
    { col: 2, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»: supply across, ground down
    { col: 3, row: 2, moduleId: 'block_024', rotation: 2 }, // «Тройник»: supply
    { col: 4, row: 2, moduleId: 'block_002', rotation: 0 }, // 12 кОм to the top of L1
    { col: 5, row: 2, moduleId: 'block_021', rotation: 0 }, // «Крест»: supply from XT3

    { col: 0, row: 3, moduleId: 'block_009', rotation: 0 }, // 0,01 мкФ, spare
    { col: 1, row: 3, moduleId: 'block_008', rotation: 1 }, // 1 МОм base bias
    { col: 2, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»: ground down
    { col: 3, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 4, row: 3, moduleId: 'block_024', rotation: 3 }, // «Тройник»: top of L1
    { col: 5, row: 3, moduleId: 'block_012', rotation: 2 }, // 0,01 мкФ output: E on XT4

    { col: 0, row: 4, moduleId: 'block_013', rotation: 1 }, // 0,01 мкФ, spare
    { col: 1, row: 4, moduleId: 'block_006', rotation: 2 }, // 680 кОм base bias, to the base
    { col: 2, row: 4, moduleId: 'block_010', rotation: 0 }, // 680 пФ base to ground
    { col: 3, row: 4, moduleId: 'block_017', rotation: 0 }, // КТ315Б: collector N, emitter S
    { col: 4, row: 4, moduleId: 'block_025', rotation: 0 }, // «Мостик»: collector across
    { col: 5, row: 4, moduleId: 'block_022', rotation: 1 }, // «Щель»: top of L1 on XT5

    { col: 0, row: ANTENNA_ROW, moduleId: 'block_019' }, // антенна: E end on XT6
  ],
  expect: { minRms: 0.5, freqHz: [900, 1300] },
};

/**
 * Device 29 «Метроном», page 38 of the manual: the factory mounting drawing, transcribed cell by
 * cell. All 30 cells are filled and the antenna sits in its slot.
 *
 * The antenna oscillator again, wound differently: 12 кОм from the supply feeds the short L1
 * section's far end, the collector sits on the tap, and C10 is across the long section only, from
 * the tap (XT5) to L1's end (XT6). L2 runs from the emitter to ground, and 0,01 мкФ takes the
 * short section's far end to XT4. The base is fed from the supply through 680 кОм and held by two
 * 20 мкФ in series to ground, both + towards the base.
 *
 * It squegs very slowly. A burst of radio frequency pumps the base about 0,09 V down in a
 * millisecond or two; the 680 кОм then needs some 80 мс to lift the 10 мкФ back to where the
 * oscillation restarts, so the loudspeaker ticks about twelve times a second. A brute-force
 * transient of the whole circuit gives bursts every 78–85 мс; the emulator's RF solver averages
 * 85–100 мс with more jitter from tick to tick, and needs 24 кГц or more (at 12 кГц a burst pumps
 * the base far too deep). The manual: the tick rate moves a little with C10.
 *
 * Spares: 3300 пФ with both ends on ground; the 0,01 мкФ at (0,0) and the 68 кОм at (5,1), loose;
 * 1 МОм with 0,01 мкФ in series, loose; and a 1 МОм from ground to a 680 кОм and a 2,2 кОм that
 * lead nowhere.
 */
export const DEVICE_29: Circuit = {
  id: 'device29',
  title: 'Метроном (устройство 29)',
  description:
    'Заводская схема со страницы 38 руководства. Генератор на одном транзисторе с магнитной ' +
    'антенной работает вспышками: каждая вспышка — щелчок в громкоговорителе, а пауза между ' +
    'ними задаётся зарядом конденсаторов 20 мкФ в цепи базы. Частоту щелчков можно немного ' +
    'менять ручкой настройки. Раскладка повторяет заводской рисунок: заняты все 30 гнёзд.',
  source: 'manual page 38, device 29: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: true,
  volume: 0.6,
  placements: [
    { col: 0, row: 0, moduleId: 'block_009', rotation: 2 }, // 0,01 мкФ, spare
    { col: 1, row: 0, moduleId: 'block_023', rotation: 1 }, // «Линия»: ground from the strip
    { col: 2, row: 0, moduleId: 'block_021', rotation: 0 }, // «Крест»: ground
    { col: 3, row: 0, moduleId: 'block_011', rotation: 0 }, // 3300 пФ, spare: both ends on ground
    { col: 4, row: 0, moduleId: 'block_022', rotation: 0 }, // «Щель»
    { col: 5, row: 0, moduleId: 'block_020', rotation: 3 }, // «Угол»: the strip on XT1

    { col: 0, row: 1, moduleId: 'block_008', rotation: 3 }, // 1 МОм, spare: ground to nowhere
    { col: 1, row: 1, moduleId: 'block_015', rotation: 3 }, // 20 мкФ, − on ground
    { col: 2, row: 1, moduleId: 'block_024', rotation: 1 }, // «Тройник»: ground
    { col: 3, row: 1, moduleId: 'block_013', rotation: 2 }, // 0,01 мкФ, spare
    { col: 4, row: 1, moduleId: 'block_007', rotation: 2 }, // 1 МОм, spare
    { col: 5, row: 1, moduleId: 'block_004', rotation: 2 }, // 68 кОм, spare

    { col: 0, row: 2, moduleId: 'block_006', rotation: 1 }, // 680 кОм, spare
    { col: 1, row: 2, moduleId: 'block_014', rotation: 2 }, // 20 мкФ, + on the base
    { col: 2, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»: base across, ground down
    { col: 3, row: 2, moduleId: 'block_005', rotation: 1 }, // 680 кОм base bias, from the supply
    { col: 4, row: 2, moduleId: 'block_024', rotation: 0 }, // «Тройник»: supply
    { col: 5, row: 2, moduleId: 'block_023', rotation: 0 }, // «Линия»: supply from XT3

    { col: 0, row: 3, moduleId: 'block_001', rotation: 2 }, // 2,2 кОм, spare
    { col: 1, row: 3, moduleId: 'block_022', rotation: 0 }, // «Щель»: L1's feed down to the bar
    { col: 2, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 3, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»: base down, L1's end across
    { col: 4, row: 3, moduleId: 'block_002', rotation: 2 }, // 12 кОм from the supply to L1's end
    { col: 5, row: 3, moduleId: 'block_012', rotation: 0 }, // 0,01 мкФ output: E on XT4

    { col: 0, row: 4, moduleId: 'block_025', rotation: 0 }, // «Мостик», unconnected
    { col: 1, row: 4, moduleId: 'block_023', rotation: 1 }, // «Линия»: onto L1's start
    { col: 2, row: 4, moduleId: 'block_024', rotation: 1 }, // «Тройник»: ground onto L2
    { col: 3, row: 4, moduleId: 'block_018', rotation: 1 }, // КТ315Б: base N, emitter W to L2
    { col: 4, row: 4, moduleId: 'block_023', rotation: 0 }, // «Линия»: collector
    { col: 5, row: 4, moduleId: 'block_024', rotation: 0 }, // «Тройник»: collector, tap, XT5

    { col: 0, row: ANTENNA_ROW, moduleId: 'block_019' }, // антенна: E end on XT6
  ],
  expect: { seconds: 0.5, minRms: 0.1 },
};

/**
 * Device 30 «Морзянка», page 39 of the manual: the factory mounting drawing, transcribed cell by
 * cell. All 30 cells are filled and the antenna sits in its slot.
 *
 * Device 28's oscillator keyed by the кнопка: L2 and the 680 пФ from the base return to a common
 * node, which the кнопка grounds. 12 кОм feeds the top of L1, the collector sits on its tap, C10
 * is across the whole winding, the base is biased through 1 МОм + 1 МОм + 680 кОм, 0,01 мкФ takes
 * the top of L1 to XT4 and 20 мкФ decouples the supply.
 *
 * The manual calls it a real, if tiny, transmitter: a long-wave receiver with a ferrite antenna
 * in line with the kit's, a metre or two away, picks up the Morse, and the kit's own volume
 * control goes to minimum. In the emulator the loudspeaker is what there is to hear: silent with
 * the кнопка up, and device 28's squegging, about 1100 Гц, while it is held.
 *
 * Spares: 20 мкФ (+ on ground) in series with 0,01 мкФ back to ground; a 2,2 кОм, a 68 кОм and a
 * 0,01 мкФ loose.
 */
export const DEVICE_30: Circuit = {
  id: 'device30',
  title: 'Морзянка (устройство 30)',
  description:
    'Заводская схема со страницы 39 руководства: маленький, но настоящий радиопередатчик. ' +
    'Кнопка включает генератор, и его сигнал слышен на приёмнике длинных волн с ферритовой ' +
    'антенной в метре-двух, если антенны лежат на одной прямой; по руководству громкость ' +
    'конструктора при этом убирают. В эмуляторе сигнал слышен в громкоговорителе, пока ' +
    'кнопка нажата. Раскладка повторяет заводской рисунок: заняты все 30 гнёзд.',
  source: 'manual page 39, device 30: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: true,
  volume: 0.5,
  placements: [
    { col: 0, row: 0, moduleId: 'block_015', rotation: 2 }, // 20 мкФ, spare: + on ground
    { col: 1, row: 0, moduleId: 'block_024', rotation: 1 }, // «Тройник»: ground
    { col: 2, row: 0, moduleId: 'block_023', rotation: 0 }, // «Линия»: ground
    { col: 3, row: 0, moduleId: 'block_024', rotation: 3 }, // «Тройник»: ground
    { col: 4, row: 0, moduleId: 'block_022', rotation: 0 }, // «Щель»
    { col: 5, row: 0, moduleId: 'block_014', rotation: 3 }, // 20 мкФ: − and the strip on XT1

    { col: 0, row: 1, moduleId: 'block_009', rotation: 1 }, // 0,01 мкФ, spare
    { col: 1, row: 1, moduleId: 'block_024', rotation: 2 }, // «Тройник»: ground to the кнопка
    { col: 2, row: 1, moduleId: 'block_026', rotation: 1 }, // кнопка: W to ground, N–S joined
    { col: 3, row: 1, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 4, row: 1, moduleId: 'block_001', rotation: 1 }, // 2,2 кОм, spare
    { col: 5, row: 1, moduleId: 'block_023', rotation: 1 }, // «Линия»: supply

    { col: 0, row: 2, moduleId: 'block_020', rotation: 2 }, // «Угол»
    { col: 1, row: 2, moduleId: 'block_007', rotation: 1 }, // 1 МОм base bias
    { col: 2, row: 2, moduleId: 'block_025', rotation: 0 }, // «Мостик»: the keyed return down
    { col: 3, row: 2, moduleId: 'block_008', rotation: 2 }, // 1 МОм base bias, from the supply
    { col: 4, row: 2, moduleId: 'block_002', rotation: 0 }, // 12 кОм to the top of L1
    { col: 5, row: 2, moduleId: 'block_021', rotation: 0 }, // «Крест»: supply from XT3

    { col: 0, row: 3, moduleId: 'block_023', rotation: 0 }, // «Линия»
    { col: 1, row: 3, moduleId: 'block_025', rotation: 0 }, // «Мостик»
    { col: 2, row: 3, moduleId: 'block_023', rotation: 1 }, // «Линия»: the keyed return
    { col: 3, row: 3, moduleId: 'block_004', rotation: 3 }, // 68 кОм, spare
    { col: 4, row: 3, moduleId: 'block_024', rotation: 3 }, // «Тройник»: top of L1
    { col: 5, row: 3, moduleId: 'block_012', rotation: 2 }, // 0,01 мкФ output: E on XT4

    { col: 0, row: 4, moduleId: 'block_013', rotation: 1 }, // 0,01 мкФ, spare
    { col: 1, row: 4, moduleId: 'block_006', rotation: 2 }, // 680 кОм base bias, to the base
    { col: 2, row: 4, moduleId: 'block_010', rotation: 0 }, // 680 пФ base to the keyed return, L2
    { col: 3, row: 4, moduleId: 'block_017', rotation: 0 }, // КТ315Б: collector N, emitter S
    { col: 4, row: 4, moduleId: 'block_025', rotation: 0 }, // «Мостик»: collector across
    { col: 5, row: 4, moduleId: 'block_022', rotation: 1 }, // «Щель»: top of L1 on XT5

    { col: 0, row: ANTENNA_ROW, moduleId: 'block_019' }, // антенна: E end on XT6
  ],
  expect: { gatedByButton: true, minRms: 0.5, freqHz: [900, 1300] },
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
 * The oscillator squegs: bursts of radio frequency repeating at an audio rate, which the RF
 * envelope and burst transient of sim/rf.ts and sim/burst.ts reproduce. Held from the operating
 * point, with the capacitor charged, the bursts come about 455 times a second at 48 and 96 кГц.
 */
export const DEVICE_24: Circuit = {
  id: 'device24',
  title: 'Реле времени (устройство 24)',
  description:
    'Заводская схема со страницы 33 руководства. Пока кнопка нажата, конденсатор 20 мкФ ' +
    'заряжается через 68 кОм и питает базу транзистора генератора; через некоторое время ' +
    'появляется звук, частота которого постепенно меняется. Отпустите кнопку — звук ' +
    'оборвётся не сразу, а когда конденсатор разрядится. Раскладка повторяет заводской ' +
    'рисунок: заняты все 30 гнёзд.',
  source: 'manual page 33, device 24: factory mounting drawing, transcribed cell by cell',
  kitLegal: true,
  simulates: true,
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
  expect: { gatedByButton: true, minRms: 0.5, freqHz: [400, 520] },
};

export const CIRCUITS: Circuit[] = [
  DETECTOR_RECEIVER, DEVICE_6, DEVICE_8, DEVICE_9, DEVICE_12, DEVICE_13, DEVICE_15, DEVICE_24,
  DEVICE_26, DEVICE_27, DEVICE_27_ALT, DEVICE_28, DEVICE_29, DEVICE_30,
];

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
