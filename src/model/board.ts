/** Mutable board state: what is placed where, plus the panel controls. */

import { ALL_MODULES, CATALOGUE, MODULE_BY_ID } from './catalogue.js';
import { ANTENNA_ROW, cellId, type Cell, type CellId } from './panel.js';
import type { ModuleDef, Rotation } from './types.js';

export interface Placement {
  moduleId: string;
  rotation: Rotation;
}

export interface Controls {
  /** Volume pot wiper, 0..1. Below `POWER_THRESHOLD` the switch is open. */
  volume: number;
  /** Tuning capacitor position, 0..1, mapping to C10 = 10..100 pF. */
  tuning: number;
  /** True while the кнопка module is held down. */
  buttonDown: boolean;
}

export const POWER_THRESHOLD = 0.02;
export const C10_MIN = 10e-12;
export const C10_MAX = 100e-12;

export function c10Farads(tuning: number): number {
  // The knob turns the trimmer's plates; capacitance is close to linear with angle.
  return C10_MIN + (C10_MAX - C10_MIN) * clamp01(tuning);
}

export function powerOn(controls: Controls): boolean {
  return controls.volume > POWER_THRESHOLD;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** A user lead: the two panel/module contacts its ends are clamped between. */
export interface Lead {
  from: { cell: Cell; edge: 'N' | 'E' | 'S' | 'W' };
  to: { cell: Cell; edge: 'N' | 'E' | 'S' | 'W' };
}

export class Board {
  readonly placements = new Map<CellId, Placement>();
  readonly leads: Lead[] = [];
  controls: Controls = { volume: 0, tuning: 0.5, buttonDown: false };

  /**
   * Free-play mode. The real kit ships a fixed count of every module and the 30 factory
   * layouts are routed to that exact budget; sandbox lifts the counts so you can experiment
   * beyond what the box allows.
   */
  sandbox = false;

  /** Cell that actually owns the module occupying `cell`, accounting for wide modules. */
  ownerOf(cell: Cell): CellId | null {
    for (const [id, p] of this.placements) {
      const def = MODULE_BY_ID.get(p.moduleId);
      if (!def) continue;
      const [c, r] = id.split(',').map(Number) as [number, number];
      if (r === cell.row && cell.col >= c && cell.col < c + def.width) return id;
    }
    return null;
  }

  defAt(cell: Cell): ModuleDef | null {
    const owner = this.ownerOf(cell);
    if (!owner) return null;
    const p = this.placements.get(owner);
    return p ? (MODULE_BY_ID.get(p.moduleId) ?? null) : null;
  }

  canPlace(moduleId: string, cell: Cell): boolean {
    const def = MODULE_BY_ID.get(moduleId);
    if (!def) return false;
    if (def.width > 1 && (cell.row !== ANTENNA_ROW || cell.col !== 0)) return false;
    if (def.width === 1 && cell.row === ANTENNA_ROW) return false;
    if (cell.col + def.width > 6) return false;
    for (let i = 0; i < def.width; i++) {
      if (this.ownerOf({ col: cell.col + i, row: cell.row })) return false;
    }
    return this.sandbox || this.remaining(moduleId) > 0;
  }

  place(moduleId: string, cell: Cell, rotation: Rotation = 0): boolean {
    if (!this.canPlace(moduleId, cell)) return false;
    this.placements.set(cellId(cell.col, cell.row), { moduleId, rotation });
    return true;
  }

  remove(cell: Cell): string | null {
    const owner = this.ownerOf(cell);
    if (!owner) return null;
    const p = this.placements.get(owner)!;
    this.placements.delete(owner);
    return p.moduleId;
  }

  rotate(cell: Cell, by: 1 | -1 = 1): void {
    const owner = this.ownerOf(cell);
    if (!owner) return;
    const p = this.placements.get(owner)!;
    const def = MODULE_BY_ID.get(p.moduleId);
    if (def?.rotatable === false) return;
    p.rotation = (((p.rotation + by) % 4) + 4) as Rotation;
  }

  /** How many of this module type are still in the parts bin. */
  remaining(moduleId: string): number {
    const def = MODULE_BY_ID.get(moduleId);
    if (!def) return 0;
    if (this.sandbox) return Infinity;
    let used = 0;
    for (const p of this.placements.values()) if (p.moduleId === moduleId) used++;
    return def.qty - used;
  }

  clear(): void {
    this.placements.clear();
    this.leads.length = 0;
  }

  /** Compact, URL-safe serialisation: `col,row,moduleId,rotation` groups. */
  serialise(): string {
    const parts = [...this.placements.entries()].map(
      ([id, p]) => `${id},${p.moduleId},${p.rotation}`,
    );
    const { volume, tuning } = this.controls;
    return `v1|${volume.toFixed(2)}|${tuning.toFixed(2)}|${parts.join(';')}`;
  }

  static deserialise(text: string): Board {
    const board = new Board();
    const [version, vol, tun, body] = text.split('|');
    if (version !== 'v1') return board;
    board.controls.volume = Number(vol) || 0;
    board.controls.tuning = Number(tun) || 0.5;
    for (const group of (body ?? '').split(';').filter(Boolean)) {
      const [col, row, moduleId, rot] = group.split(',');
      if (!moduleId) continue;
      board.place(moduleId, { col: Number(col), row: Number(row) }, (Number(rot) || 0) as Rotation);
    }
    return board;
  }
}

/** Fresh parts-bin counts, for the UI. */
export function binCounts(): Map<string, number> {
  return new Map(CATALOGUE.map((m) => [m.id, m.qty]));
}

export { ALL_MODULES, CATALOGUE, MODULE_BY_ID };
