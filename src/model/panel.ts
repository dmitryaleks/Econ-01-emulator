/**
 * Geometry of the ЭКОН-01 assembly field and the fixed nets it connects to.
 * See SPEC.md §3 and §5.1.
 *
 * The field has seven rows of cell positions:
 *   rows 0..4  main grid, 6 columns  = 30 cells
 *   row  5     antenna slot, 6 columns wide, holds one 6-cell module
 *   row  6     bottom row, 6 columns =  6 cells
 * 36 cube cells in total, matching the 36 modules in the kit.
 *
 * Seven larger, outset contacts run down the left edge, one per row: XT1..XT7.
 */

import type { Pin } from './types.js';

export const COLS = 6;
export const ROWS = 7;
export const ANTENNA_ROW = 5;
export const MAIN_ROWS = 5;
export const BOTTOM_ROW = 6;

export interface Cell {
  col: number;
  row: number;
}

export type CellId = `${number},${number}`;

export function cellId(col: number, row: number): CellId {
  return `${col},${row}`;
}

export function parseCell(id: CellId): Cell {
  const [c, r] = id.split(',');
  return { col: Number(c), row: Number(r) };
}

export function isCell(col: number, row: number): boolean {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

/** Every cell position that can hold a module, in reading order. */
export function allCells(): Cell[] {
  const out: Cell[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) out.push({ col, row });
  }
  return out;
}

/** Unit step for each face direction, in (col, row). */
export const STEP: Record<Pin, readonly [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

/** The face of the neighbouring cell that touches `edge` of this one. */
export const FACING: Record<Pin, Pin> = { N: 'S', E: 'W', S: 'N', W: 'E' };

export function neighbour(cell: Cell, edge: Pin): Cell | null {
  const [dc, dr] = STEP[edge];
  const col = cell.col + dc;
  const row = cell.row + dr;
  return isCell(col, row) ? { col, row } : null;
}

// ---------------------------------------------------------------------------
// Fixed nets
// ---------------------------------------------------------------------------

/** Nets that exist whether or not any module is placed. */
export const FIXED_NETS = {
  /** Battery negative, chassis. XT1 and XT7. */
  GND: 'GND',
  /** Battery positive after the power switch. XT2 and XT3. */
  VCC: 'VCC',
  /** Low-frequency amplifier input. XT4. */
  AMP_IN: 'AMP_IN',
  /** Tuning capacitor C10 terminals. XT5 and XT6. */
  C10_A: 'C10_A',
  C10_B: 'C10_B',
  /** Battery positive before the switch, for the switch element itself. */
  BATT_P: 'BATT_P',
} as const;

export type FixedNet = (typeof FIXED_NETS)[keyof typeof FIXED_NETS];

/**
 * The seven left-edge terminals, top to bottom, and the fixed net each is wired to.
 * Index i is the terminal beside field row i.
 */
export const XT_NETS: readonly FixedNet[] = [
  FIXED_NETS.GND, // XT1  row 0
  FIXED_NETS.VCC, // XT2  row 1
  FIXED_NETS.VCC, // XT3  row 2
  FIXED_NETS.AMP_IN, // XT4  row 3
  FIXED_NETS.C10_A, // XT5  row 4
  FIXED_NETS.C10_B, // XT6  row 5 (antenna slot)
  FIXED_NETS.GND, // XT7  row 6 (bottom row)
];

export const XT_LABELS = ['XT1', 'XT2', 'XT3', 'XT4', 'XT5', 'XT6', 'XT7'] as const;

/** Which fixed net, if any, a contact on the given cell face reaches through the panel frame. */
export function panelNetAt(cell: Cell, edge: Pin): FixedNet | null {
  if (edge === 'W' && cell.col === 0) return XT_NETS[cell.row] ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// Drawing geometry, in millimetres on the real panel (SPEC.md §3)
// ---------------------------------------------------------------------------

/** Case outline. */
export const CASE_MM = { w: 206, h: 190 };

/** Cell pitch and the field origin, measured off Рис. 1 and the retropc photographs. */
export const FIELD_MM = {
  x: 14,
  y: 46,
  pitch: 19,
  /** Gap between the main grid and the antenna slot, and between that and the bottom row. */
  gap: 2.5,
};

export function cellRectMm(cell: Cell): { x: number; y: number; w: number; h: number } {
  const { x, y, pitch, gap } = FIELD_MM;
  const gapsAbove = (cell.row >= ANTENNA_ROW ? 1 : 0) + (cell.row >= BOTTOM_ROW ? 1 : 0);
  return {
    x: x + cell.col * pitch,
    y: y + cell.row * pitch + gapsAbove * gap,
    w: pitch,
    h: pitch,
  };
}

/** Right-hand panel furniture. */
export const CONTROLS_MM = {
  speaker: { cx: 156, cy: 74, r: 27 },
  volume: { x: 133, y: 112, w: 44, h: 13 },
  tuning: { cx: 160, cy: 150, r: 22 },
  badge: { x: 128, y: 34 },
};
