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
// Drawing geometry, in millimetres on the real panel
// ---------------------------------------------------------------------------

/**
 * Case outline. The manual gives 206 × 190 × 38 mm; the orthogonal photograph in
 * `assets/the-original-econ-01-body.jpg` measures 1.09 taller than wide, so that is
 * height × width × depth — the case is portrait, not landscape.
 */
export const CASE_MM = { w: 190, h: 206, radius: 3.4 };

/** Carry rail across the top: finger dimples above a through-slot. */
export const HANDLE_MM = {
  top: 0,
  height: 47,
  dimpleRow: { y: 9.3, r: 7.9, count: 11, from: 9, to: 181 },
  slot: { x: 9, y: 19, w: 172, h: 23, radius: 3 },
  /** Bevel band where the rail steps down to the front face. */
  shoulder: { y: 47, h: 17 },
};

/**
 * Assembly field. Cell pitch and origin measured off the photograph:
 * six columns spanning 100.7 mm, five main rows, the antenna slot, then the bottom row.
 */
export const FIELD_MM = {
  x: 8.2,
  y: 86.5,
  pitch: 16.2,
  /** The antenna slot is a little taller than a cube row. */
  antennaScale: 1.22,
  /** Gap above the antenna slot and below it. */
  gapAbove: 3.4,
  gapBelow: 1.2,
  /** Moulded frame around the field. */
  pad: 5.4,
};

export function cellRectMm(cell: Cell): { x: number; y: number; w: number; h: number } {
  const { x, y, pitch, antennaScale, gapAbove, gapBelow } = FIELD_MM;
  let top = y;
  for (let r = 0; r < cell.row; r++) {
    top += r === ANTENNA_ROW ? pitch * antennaScale : pitch;
    if (r === ANTENNA_ROW - 1) top += gapAbove;
    if (r === ANTENNA_ROW) top += gapBelow;
  }
  return {
    x: x + cell.col * pitch,
    y: top,
    w: pitch,
    h: cell.row === ANTENNA_ROW ? pitch * antennaScale : pitch,
  };
}

/** Bounding box of the whole field, frame included. */
export function fieldRectMm(): { x: number; y: number; w: number; h: number } {
  const first = cellRectMm({ col: 0, row: 0 });
  const last = cellRectMm({ col: COLS - 1, row: ROWS - 1 });
  const pad = FIELD_MM.pad;
  return {
    x: first.x - pad,
    y: first.y - pad,
    w: last.x + last.w - first.x + pad * 2,
    h: last.y + last.h - first.y + pad * 2,
  };
}

/** Right-hand panel furniture, measured off the same photograph. */
export const CONTROLS_MM = {
  speaker: { cx: 152, cy: 119, r: 29.8 },
  volume: { x: 138.5, y: 151.5, w: 29, h: 11.5 },
  tuning: { cx: 152, cy: 181, r: 19.7 },
  badge: { x: 127, y: 68.5, w: 58, h: 12 },
  silk: { x: 10.5, y: 66 },
};
