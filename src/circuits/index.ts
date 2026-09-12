/**
 * Ready-made circuits.
 *
 * The 30 factory circuits of the manual (pp. 9–39) are transcribed in DEVPLAN phase 8; what is
 * here now is a kit-legal reconstruction used as the worked example and as an end-to-end test.
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

export interface Circuit {
  id: string;
  /** Russian title, as the manual would style it. */
  title: string;
  description: string;
  /** Where this came from: a manual page number, or 'reconstruction'. */
  source: string;
  sandbox?: boolean;
  volume?: number;
  tuning?: number;
  placements: CircuitPlacement[];
  leads?: Lead[];
  expect: {
    silent?: boolean;
    minRms?: number;
    freqHz?: [number, number];
    /** For receivers: with the dial moved off the station, output must drop below this. */
    offTuneBelow?: number;
  };
}

/**
 * Detector receiver. The magnetic antenna's 100-turn section is put across the tuning
 * capacitor C10 through XT5/XT6, the 25-turn coupling winding feeds one of the Д9Б diodes,
 * and the rectified audio goes to the amplifier input at XT4.
 *
 * Uses 3 «Тройник», 3 «Линия», 1 «Угол», the twin-diode module, the antenna and one of the two
 * supplied leads — all within what the box contains.
 */
export const DETECTOR_RECEIVER: Circuit = {
  id: 'detector',
  title: 'Детекторный приёмник',
  description:
    'Магнитная антенна и конденсатор переменной ёмкости образуют колебательный контур; ' +
    'катушка связи через диод Д9Б подаёт продетектированный сигнал на вход усилителя. ' +
    'Крутите ручку настройки, чтобы найти станцию.',
  source: 'reconstruction',
  volume: 0.7,
  tuning: 0.354,
  placements: [
    { col: 0, row: ANTENNA_ROW, moduleId: 'ant' },
    // Tuned circuit: XT5 -> tee -> corner -> antenna tap; XT6 is the west end of the bar.
    { col: 0, row: 4, moduleId: 'j-troynik', rotation: 0 },
    { col: 1, row: 4, moduleId: 'j-ugol', rotation: 2 },
    // Detector: coupling winding -> Д9Б -> westward run -> XT4.
    { col: 4, row: 4, moduleId: 'dd9b', rotation: 1 },
    { col: 3, row: 4, moduleId: 'j-liniya', rotation: 0 },
    { col: 2, row: 4, moduleId: 'j-troynik', rotation: 2 },
    { col: 2, row: 3, moduleId: 'j-troynik', rotation: 1 },
    { col: 1, row: 3, moduleId: 'j-liniya', rotation: 0 },
    { col: 0, row: 3, moduleId: 'j-liniya', rotation: 0 },
  ],
  leads: [
    // Cold end of the windings to XT1.
    {
      from: { cell: { col: 5, row: ANTENNA_ROW }, edge: 'E' },
      to: { cell: { col: 0, row: 0 }, edge: 'W' },
    },
  ],
  expect: { minRms: 0.25, offTuneBelow: 0.25 },
};

export const CIRCUITS: Circuit[] = [DETECTOR_RECEIVER];

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
