/**
 * Draws the whole ЭКОН-01 panel on one canvas and does the hit testing.
 * Geometry comes from model/panel.ts in millimetres; this scales it to the widget.
 * Everything visual is driven by the active skin (see ui/skins/skin.ts).
 */

import type { Board } from '../model/board.js';
import { MODULE_BY_ID } from '../model/catalogue.js';
import {
  ANTENNA_ROW,
  CASE_MM,
  COLS,
  CONTROLS_MM,
  FIELD_MM,
  HANDLE_MM,
  ROWS,
  XT_LABELS,
  cellRectMm,
  fieldRectMm,
  type Cell,
} from '../model/panel.js';
import { rotatePin, sitesOf, type ModuleDef, type Pin } from '../model/types.js';
import { drawModuleSymbol } from './symbols.js';
import type { Skin } from './skins/skin.js';

export interface HitCell { kind: 'cell'; cell: Cell }
export interface HitContact { kind: 'contact'; cell: Cell; edge: Pin }
export interface HitControl { kind: 'volume' | 'tuning' | 'speaker' }
export type Hit = HitCell | HitContact | HitControl | null;

export interface ViewState {
  skin: Skin;
  dragging: string | null;
  dragPos: { x: number; y: number } | null;
  hover: Cell | null;
  probes: Array<{ cell: Cell; edge: Pin }>;
  /** 0..1, drives the speaker cone animation. */
  level: number;
  contactNet: Map<string, string>;
  litNet: string | null;
  station: string | null;
  tunedHz: number;
}

const MARGIN = 6;

/** Module body inset from its cell, the dome's radius, and the кнопка's push cap within it. */
const BODY_INSET_MM = 0.12;
const DOME_RATIO = 0.455;
const CAP_RATIO = 0.74;

export class PanelCanvas {
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private originX = 0;
  private originY = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.scale = Math.min((w - MARGIN * 2) / CASE_MM.w, (h - MARGIN * 2) / CASE_MM.h);
    this.originX = (w - CASE_MM.w * this.scale) / 2;
    this.originY = (h - CASE_MM.h * this.scale) / 2;
  }

  private px(mm: number): number {
    return mm * this.scale;
  }

  private toScreen(xMm: number, yMm: number): [number, number] {
    return [this.originX + xMm * this.scale, this.originY + yMm * this.scale];
  }

  private toMm(x: number, y: number): [number, number] {
    return [(x - this.originX) / this.scale, (y - this.originY) / this.scale];
  }

  hitTest(x: number, y: number): Hit {
    const [mx, my] = this.toMm(x, y);
    const { speaker, volume, tuning } = CONTROLS_MM;
    if (Math.hypot(mx - tuning.cx, my - tuning.cy) <= tuning.r) return { kind: 'tuning' };
    if (mx >= volume.x && mx <= volume.x + volume.w && my >= volume.y && my <= volume.y + volume.h) {
      return { kind: 'volume' };
    }
    if (Math.hypot(mx - speaker.cx, my - speaker.cy) <= speaker.r) return { kind: 'speaker' };

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const r = cellRectMm({ col, row });
        if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
        const cell = { col, row };
        const edge = nearEdge(mx - r.x, my - r.y, r.w, r.h);
        return edge ? { kind: 'contact', cell, edge } : { kind: 'cell', cell };
      }
    }
    return null;
  }

  /** The cell whose кнопка push cap is under this point, if any. */
  buttonCapAt(x: number, y: number, board: Board): Cell | null {
    const hit = this.hitTest(x, y);
    if (!hit || (hit.kind !== 'cell' && hit.kind !== 'contact')) return null;
    if (board.defAt(hit.cell)?.shape !== 'button') return null;
    const [mx, my] = this.toMm(x, y);
    const r = cellRectMm(hit.cell);
    const capMm = (Math.min(r.w, r.h) - BODY_INSET_MM * 2) * DOME_RATIO * CAP_RATIO;
    return Math.hypot(mx - (r.x + r.w / 2), my - (r.y + r.h / 2)) <= capMm ? hit.cell : null;
  }

  render(board: Board, view: ViewState): void {
    const c = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    c.clearRect(0, 0, rect.width, rect.height);

    this.drawCase(view.skin);
    this.drawHandle(view.skin);
    this.drawSilkscreen(view.skin);
    this.drawBadge(view.skin);
    this.drawFieldWell(view.skin);
    this.drawTerminals(view.skin);
    this.drawEmptyCells(board, view);
    this.drawModules(board, view);
    this.drawLeads(board, view);
    this.drawSpeaker(view.skin, view.level);
    this.drawVolume(board, view.skin);
    this.drawTuning(board, view);
    this.drawProbes(view);
    this.drawDragGhost(view);
  }

  // -- case -----------------------------------------------------------------

  private drawCase(s: Skin): void {
    const c = this.ctx;
    const [x, y] = this.toScreen(0, 0);
    const w = this.px(CASE_MM.w);
    const h = this.px(CASE_MM.h);
    const r = this.px(CASE_MM.radius);

    c.save();
    roundRect(c, x, y, w, h, r);
    if (s.style.texture) {
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, s.case.light);
      g.addColorStop(0.05, s.case.base);
      g.addColorStop(0.82, s.case.base);
      g.addColorStop(1, s.case.dark);
      c.fillStyle = g;
      c.fill();
      // A little cross-light so the mouldings do not read as flat.
      const gx = c.createLinearGradient(x, y, x + w, y);
      gx.addColorStop(0, 'rgba(255,255,255,0.05)');
      gx.addColorStop(0.5, 'rgba(255,255,255,0)');
      gx.addColorStop(1, 'rgba(0,0,0,0.10)');
      c.fillStyle = gx;
      c.fill();
    } else {
      c.fillStyle = s.case.base;
      c.fill();
    }
    c.lineWidth = Math.max(1, this.px(0.5));
    c.strokeStyle = s.case.edge;
    c.stroke();
    c.restore();

    // Bright bevel band where the carry rail steps down to the front face.
    if (s.style.texture) {
      const [bx, by] = this.toScreen(1.5, HANDLE_MM.shoulder.y);
      const bw = this.px(CASE_MM.w - 3);
      const bh = this.px(HANDLE_MM.shoulder.h);
      const g = c.createLinearGradient(bx, by, bx, by + bh);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0.06)');
      c.save();
      roundRect(c, bx, by, bw, bh, this.px(2));
      c.fillStyle = g;
      c.fill();
      c.restore();
    }
  }

  /** Carry rail: a row of finger dimples above a rectangular through-slot. */
  private drawHandle(s: Skin): void {
    const c = this.ctx;
    const { dimpleRow, slot } = HANDLE_MM;

    if (s.style.handle === 'dimpled') {
      const step = (dimpleRow.to - dimpleRow.from) / (dimpleRow.count - 1);
      for (let i = 0; i < dimpleRow.count; i++) {
        const [cx, cy] = this.toScreen(dimpleRow.from + i * step, dimpleRow.y);
        const r = this.px(dimpleRow.r);
        c.save();
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        if (s.style.texture) {
          // Shallow dish: shaded at the top lip, catching light at the bottom.
          const g = c.createLinearGradient(cx, cy - r, cx, cy + r);
          g.addColorStop(0, 'rgba(0,0,0,0.30)');
          g.addColorStop(0.5, 'rgba(0,0,0,0.06)');
          g.addColorStop(0.86, 'rgba(255,255,255,0.30)');
          g.addColorStop(1, 'rgba(255,255,255,0.10)');
          c.fillStyle = g;
        } else {
          c.fillStyle = 'rgba(0,0,0,0.10)';
        }
        c.fill();
        c.globalAlpha = 0.45;
        c.strokeStyle = s.case.edge;
        c.lineWidth = Math.max(0.6, this.px(0.24));
        c.stroke();
        c.restore();
      }
    }

    // The slot goes right through the case.
    const [sx, sy] = this.toScreen(slot.x, slot.y);
    const sw = this.px(slot.w);
    const sh = this.px(slot.h);
    c.save();
    roundRect(c, sx, sy, sw, sh, this.px(slot.radius));
    if (s.style.texture) {
      const g = c.createLinearGradient(sx, sy, sx, sy + sh);
      g.addColorStop(0, '#111315');
      g.addColorStop(0.55, '#2A2E30');
      g.addColorStop(1, s.case.dark);
      c.fillStyle = g;
    } else {
      c.fillStyle = s.case.dark;
    }
    c.fill();
    c.strokeStyle = s.case.edge;
    c.lineWidth = Math.max(1, this.px(0.45));
    c.stroke();
    // Lit lower lip of the through-slot.
    c.beginPath();
    c.moveTo(sx + this.px(slot.radius), sy + sh);
    c.lineTo(sx + sw - this.px(slot.radius), sy + sh);
    c.strokeStyle = s.case.bevel;
    c.globalAlpha = 0.75;
    c.lineWidth = Math.max(1, this.px(0.55));
    c.stroke();
    c.restore();
  }

  private drawSilkscreen(s: Skin): void {
    const c = this.ctx;
    const { silk } = CONTROLS_MM;
    const [x, y] = this.toScreen(silk.x, silk.y);
    c.save();
    c.fillStyle = s.silkscreen;
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';

    // A big "30" with two stacked lines set tight against it, as printed.
    const big = Math.max(11, this.px(9.4));
    c.font = `700 ${big}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    c.save();
    c.translate(x, y + big * 0.8);
    c.scale(1.1, 1);
    c.fillText('30', 0, 0);
    const numW = c.measureText('30').width * 1.1;
    c.restore();

    const small = Math.max(6, this.px(4.5));
    c.font = `700 ${small}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    c.save();
    c.translate(x + numW + this.px(0.6), y);
    c.scale(1.02, 1);
    c.fillText('ЭЛЕКТРОННЫХ', 0, small * 0.9);
    c.fillText('УСТРОЙСТВ', 0, small * 2.0);
    c.restore();
    c.restore();
  }

  private drawBadge(s: Skin): void {
    const c = this.ctx;
    const b = CONTROLS_MM.badge;
    const [x, y] = this.toScreen(b.x, b.y);
    const w = this.px(b.w);
    const h = this.px(b.h);

    c.save();
    if (s.style.badge === 'boxed') {
      roundRect(c, x, y, w, h, h * 0.34);
      c.strokeStyle = s.silkscreen;
      c.lineWidth = Math.max(1.4, this.px(0.62));
      c.stroke();
    }
    c.fillStyle = s.silkscreen;
    const size = h * 0.6;
    c.font = `700 ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.save();
    c.translate(x + w / 2, y + h / 2 + size * 0.05);
    c.scale(1.16, 1);
    c.fillText('ЭКОН·01', 0, 0);
    c.restore();
    c.restore();
  }

  // -- field ----------------------------------------------------------------

  private drawFieldWell(s: Skin): void {
    const c = this.ctx;
    const f = fieldRectMm();
    const [x, y] = this.toScreen(f.x, f.y);
    const w = this.px(f.w);
    const h = this.px(f.h);

    c.save();
    roundRect(c, x, y, w, h, this.px(2));
    c.fillStyle = s.field.frame;
    c.fill();
    c.strokeStyle = s.field.wellEdge;
    c.lineWidth = Math.max(1, this.px(0.5));
    c.stroke();
    c.restore();

    const inset = this.px(FIELD_MM.pad * 0.5);
    c.save();
    roundRect(c, x + inset, y + inset, w - inset * 2, h - inset * 2, this.px(1.2));
    c.fillStyle = s.field.well;
    c.fill();
    if (s.style.texture) {
      c.strokeStyle = 'rgba(0,0,0,0.4)';
      c.lineWidth = Math.max(1, this.px(0.4));
      c.stroke();
    }
    c.restore();
  }

  private drawTerminals(s: Skin): void {
    const c = this.ctx;
    // The outset left-edge contacts are where the supplied leads clip on; they reach nothing.
    for (let row = 0; row < ROWS; row++) {
      const r = cellRectMm({ col: 0, row });
      const hMm = Math.min(6.2, r.h * 0.5);
      const [x, y] = this.toScreen(r.x - 3.0, r.y + r.h / 2 - hMm / 2);
      this.metalTab(x, y, this.px(2.9), this.px(hMm), s, true);
    }

    // The top-edge contacts are joined by one strip.
    const first = cellRectMm({ col: 0, row: 0 });
    const last = cellRectMm({ col: COLS - 1, row: 0 });
    const [sx, sy] = this.toScreen(first.x + first.w / 2, first.y - 1.25);
    const [ex] = this.toScreen(last.x + last.w / 2, last.y);
    c.save();
    c.fillStyle = s.contact.edge;
    c.globalAlpha = 0.8;
    c.fillRect(sx, sy, ex - sx, this.px(0.6));
    c.restore();

    for (let col = 0; col < COLS; col++) {
      const top = cellRectMm({ col, row: 0 });
      const bot = cellRectMm({ col, row: ROWS - 1 });
      const [tx, ty] = this.toScreen(top.x + top.w / 2 - 2.3, top.y - 2.2);
      this.metalTab(tx, ty, this.px(4.6), this.px(1.9), s, false);
      const [bx, by] = this.toScreen(bot.x + bot.w / 2 - 2.3, bot.y + bot.h + 0.3);
      this.metalTab(bx, by, this.px(4.6), this.px(1.9), s, false);
    }
    // XT1..XT7, down the right edge. The real panel prints nothing beside them, so the textured
    // skins keep to a digit; the schematic skin has room for the full label.
    for (let row = 0; row < ROWS; row++) {
      const r = cellRectMm({ col: COLS - 1, row });
      const hMm = Math.min(5.0, r.h * 0.42);
      const [x, y] = this.toScreen(r.x + r.w + 0.4, r.y + r.h / 2 - hMm / 2);
      this.metalTab(x, y, this.px(1.9), this.px(hMm), s, false);

      c.save();
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillStyle = s.textOnCase;
      const [lx, ly] = this.toScreen(r.x + r.w + 2.9, r.y + r.h / 2);
      if (s.style.texture) {
        c.globalAlpha = 0.75;
        c.font = `700 ${Math.max(6, this.px(2.0))}px ui-monospace, monospace`;
        c.fillText(String(row + 1), lx, ly);
      } else {
        c.font = `${Math.max(5, this.px(2.3))}px ui-monospace, monospace`;
        c.fillText(XT_LABELS[row] ?? '', lx, ly);
      }
      c.restore();
    }
  }

  /** A bronze or nickel contact tab sitting in its moulded recess. */
  private metalTab(x: number, y: number, w: number, h: number, s: Skin, outset: boolean): void {
    const c = this.ctx;
    c.save();
    if (outset) {
      c.fillStyle = 'rgba(0,0,0,0.32)';
      c.fillRect(x - this.px(0.35), y - this.px(0.35), w + this.px(0.7), h + this.px(0.7));
    }
    if (s.style.texture) {
      const g = c.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, s.contact.edge);
      g.addColorStop(0.45, s.contact.face);
      g.addColorStop(1, s.contact.edge);
      c.fillStyle = g;
    } else {
      c.fillStyle = s.contact.face;
    }
    c.fillRect(x, y, w, h);
    c.restore();
  }

  private drawEmptyCells(board: Board, view: ViewState): void {
    const c = this.ctx;
    const s = view.skin;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (row === ANTENNA_ROW && col > 0) continue;
        if (board.ownerOf({ col, row })) continue;
        const r = cellRectMm({ col, row });
        const rectW = row === ANTENNA_ROW ? r.w * COLS : r.w;
        const [x, y] = this.toScreen(r.x + 0.7, r.y + 0.7);
        const w = this.px(rectW - 1.4);
        const h = this.px(r.h - 1.4);
        c.save();
        roundRect(c, x, y, w, h, this.px(1.2));
        if (s.style.texture) {
          const g = c.createLinearGradient(x, y, x, y + h);
          g.addColorStop(0, 'rgba(0,0,0,0.34)');
          g.addColorStop(0.55, 'rgba(0,0,0,0.12)');
          g.addColorStop(1, 'rgba(255,255,255,0.07)');
          c.fillStyle = g;
          c.fill();
        }
        c.globalAlpha = 0.7;
        c.strokeStyle = s.field.wellEdge;
        c.lineWidth = Math.max(0.6, this.px(0.25));
        c.stroke();
        if (view.hover && view.hover.col === col && view.hover.row === row && view.dragging) {
          c.globalAlpha = 1;
          c.fillStyle = board.canPlace(view.dragging, { col, row })
            ? 'rgba(120,220,140,0.28)'
            : 'rgba(230,70,50,0.28)';
          c.fill();
        }
        c.restore();
      }
    }
  }

  private drawModules(board: Board, view: ViewState): void {
    for (const [owner, placement] of board.placements) {
      const def = MODULE_BY_ID.get(placement.moduleId);
      if (!def) continue;
      const [col, row] = owner.split(',').map(Number) as [number, number];
      const r0 = cellRectMm({ col, row });
      const wMm = r0.w * def.width;

      if (def.shape === 'antenna') {
        this.drawAntennaBody(r0.x, r0.y, wMm, r0.h, view.skin);
      } else {
        const isButton = def.shape === 'button';
        this.drawCubeBody(
          r0.x, r0.y, r0.w, r0.h, view.skin, isButton, isButton && board.controls.buttonDown,
        );
      }

      this.drawSymbol(
        def,
        r0.x + wMm / 2,
        r0.y + r0.h / 2,
        r0.h * 0.385,
        def.rotatable === false ? 0 : placement.rotation,
        view.skin,
      );

      for (const site of sitesOf(def)) {
        const edge = def.rotatable === false ? site.edge : rotatePin(site.edge, placement.rotation);
        this.drawPad({ col: col + site.offset, row }, edge, view);
      }
    }
  }

  /**
   * A cube: square body with a large domed circular cap, the square shoulders showing at the
   * corners. That is what the photograph shows, and it is what makes the field read as cubes.
   */
  private drawCubeBody(
    xMm: number, yMm: number, wMm: number, hMm: number, s: Skin, tall: boolean, pressed: boolean,
  ): void {
    const c = this.ctx;
    const inset = BODY_INSET_MM;
    const [x, y] = this.toScreen(xMm + inset, yMm + inset);
    const w = this.px(wMm - inset * 2);
    const h = this.px(hMm - inset * 2);

    c.save();
    roundRect(c, x, y, w, h, this.px(1.5));
    c.fillStyle = s.module.shoulder;
    c.fill();
    c.globalAlpha = 0.35;
    c.strokeStyle = s.module.shadow;
    c.lineWidth = Math.max(0.6, this.px(0.25));
    c.stroke();
    c.restore();

    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) * DOME_RATIO;

    if (s.style.cap === 'flat') {
      c.save();
      roundRect(c, x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.88, this.px(1.2));
      c.fillStyle = s.module.top;
      c.fill();
      c.restore();
      if (tall) {
        // A pale cap, so the symbol stays legible; it lightens while held.
        c.save();
        c.beginPath();
        c.arc(cx, cy, r * CAP_RATIO, 0, Math.PI * 2);
        c.fillStyle = pressed ? '#F2F0EA' : '#D9D6CD';
        c.fill();
        c.strokeStyle = s.module.shadow;
        c.lineWidth = Math.max(0.6, this.px(0.22));
        c.stroke();
        c.restore();
      }
      return;
    }
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    if (s.style.texture) {
      const g = c.createRadialGradient(cx - r * 0.38, cy - r * 0.44, r * 0.05, cx, cy, r * 1.25);
      g.addColorStop(0, s.module.topHi);
      g.addColorStop(0.42, s.module.top);
      g.addColorStop(0.86, s.module.top);
      g.addColorStop(1, s.module.side);
      c.fillStyle = g;
    } else {
      c.fillStyle = s.module.top;
    }
    c.fill();
    c.strokeStyle = s.module.side;
    c.lineWidth = Math.max(0.6, this.px(0.22));
    c.stroke();
    c.restore();

    if (tall) {
      // The кнопка stands proud with a black push cap, which reads lighter while held.
      c.save();
      c.beginPath();
      c.arc(cx, cy, r * CAP_RATIO, 0, Math.PI * 2);
      if (s.style.texture) {
        const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.32, r * 0.04, cx, cy, r * 0.8);
        g.addColorStop(0, pressed ? '#7A7A7A' : '#4C4C4C');
        g.addColorStop(1, pressed ? '#383838' : '#0D0D0D');
        c.fillStyle = g;
      } else {
        c.fillStyle = pressed ? '#4A4A4A' : '#2A2A2A';
      }
      c.fill();
      c.restore();
    }
  }

  /** The antenna bar: a long flat-topped moulding, not a dome. */
  private drawAntennaBody(xMm: number, yMm: number, wMm: number, hMm: number, s: Skin): void {
    const c = this.ctx;
    const inset = 0.12;
    const [x, y] = this.toScreen(xMm + inset, yMm + inset);
    const w = this.px(wMm - inset * 2);
    const h = this.px(hMm - inset * 2);
    c.save();
    roundRect(c, x, y, w, h, this.px(2.2));
    if (s.style.texture) {
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, s.module.topHi);
      g.addColorStop(0.45, s.module.top);
      g.addColorStop(1, s.module.side);
      c.fillStyle = g;
    } else {
      c.fillStyle = s.module.top;
    }
    c.fill();
    c.strokeStyle = s.module.side;
    c.lineWidth = Math.max(0.6, this.px(0.25));
    c.stroke();
    c.restore();
  }

  private drawSymbol(
    def: ModuleDef, cxMm: number, cyMm: number, radiusMm: number, rotation: number, s: Skin,
  ): void {
    const c = this.ctx;
    const [x, y] = this.toScreen(cxMm, cyMm);
    const r = this.px(radiusMm);

    const paint = (colour: string, dx: number, dy: number): void => {
      c.save();
      c.translate(x + dx, y + dy);
      c.rotate((rotation * Math.PI) / 2);
      c.scale(r, r);
      c.lineWidth = s.symbol.weight;
      c.lineJoin = 'round';
      c.lineCap = 'butt';
      c.strokeStyle = colour;
      c.fillStyle = colour;
      drawModuleSymbol(c, def);
      c.restore();
    };

    if (s.symbol.emboss) paint('rgba(255,255,255,0.45)', this.px(0.18), this.px(0.18));
    paint(s.symbol.ink, 0, 0);
  }

  private drawPad(cell: Cell, edge: Pin, view: ViewState): void {
    const r = cellRectMm(cell);
    const t = 1.9;
    const long = Math.min(4.6, r.w * 0.32);
    let x = r.x + r.w / 2 - long / 2;
    let y = r.y + r.h / 2 - long / 2;
    let w = long;
    let h = long;
    if (edge === 'N') { y = r.y - t / 2; h = t; }
    else if (edge === 'S') { y = r.y + r.h - t / 2; h = t; }
    else if (edge === 'W') { x = r.x - t / 2; w = t; }
    else { x = r.x + r.w - t / 2; w = t; }

    const key = `${cell.col},${cell.row}:${edge}`;
    const net = view.contactNet.get(key);
    const lit = view.litNet !== null && net === view.litNet;
    const [sx, sy] = this.toScreen(x, y);

    if (lit) {
      const c = this.ctx;
      c.save();
      c.fillStyle = view.skin.netLive;
      c.fillRect(sx, sy, this.px(w), this.px(h));
      c.restore();
    } else {
      this.metalTab(sx, sy, this.px(w), this.px(h), view.skin, false);
    }
  }

  private drawLeads(board: Board, view: ViewState): void {
    if (board.leads.length === 0) return;
    const c = this.ctx;
    c.save();
    c.strokeStyle = view.skin.accent;
    c.lineWidth = Math.max(1.4, this.px(0.85));
    c.lineCap = 'round';
    for (const lead of board.leads) {
      const a = this.contactCentre(lead.from.cell, lead.from.edge);
      const b = this.contactCentre(lead.to.cell, lead.to.edge);
      const sag = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22;
      c.beginPath();
      c.moveTo(a[0], a[1]);
      c.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag, b[0], b[1]);
      c.stroke();
    }
    c.restore();
  }

  contactCentre(cell: Cell, edge: Pin): [number, number] {
    const r = cellRectMm(cell);
    const mid: Record<Pin, [number, number]> = {
      N: [r.x + r.w / 2, r.y],
      S: [r.x + r.w / 2, r.y + r.h],
      W: [r.x, r.y + r.h / 2],
      E: [r.x + r.w, r.y + r.h / 2],
    };
    const [mx, my] = mid[edge];
    return this.toScreen(mx, my);
  }

  // -- right-hand furniture --------------------------------------------------

  private drawSpeaker(s: Skin, level: number): void {
    const c = this.ctx;
    const { cx, cy, r } = CONTROLS_MM.speaker;
    const [x, y] = this.toScreen(cx, cy);
    const rad = this.px(r);

    c.save();
    c.beginPath();
    c.arc(x, y, rad, 0, Math.PI * 2);
    if (s.style.texture) {
      const g = c.createLinearGradient(x, y - rad, x, y + rad);
      g.addColorStop(0, s.case.dark);
      g.addColorStop(0.32, s.speaker.plate);
      g.addColorStop(1, s.case.base);
      c.fillStyle = g;
    } else {
      c.fillStyle = s.speaker.plate;
    }
    c.fill();
    c.strokeStyle = s.speaker.rim;
    c.lineWidth = Math.max(1, this.px(0.5));
    c.stroke();
    c.restore();

    const wobble = 1 + level * 0.1;
    c.save();
    c.beginPath();
    c.arc(x, y, rad * 0.88, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = s.speaker.hole;

    if (s.style.grille === 'hex') {
      const pitch = rad * 0.235;
      const hole = pitch * 0.38 * wobble;
      const span = Math.ceil(rad / pitch) + 2;
      for (let iy = -span; iy <= span; iy++) {
        const py = y + iy * pitch * 0.866;
        const offset = (iy & 1) === 0 ? 0 : pitch / 2;
        for (let ix = -span; ix <= span; ix++) {
          const hx = x + ix * pitch + offset;
          if (Math.hypot(hx - x, py - y) > rad * 0.8) continue;
          c.beginPath();
          c.arc(hx, py, hole, 0, Math.PI * 2);
          c.fill();
        }
      }
    } else {
      const hole = rad * 0.08 * wobble;
      const at = (hx: number, hy: number): void => {
        c.beginPath();
        c.arc(x + hx, y + hy, hole, 0, Math.PI * 2);
        c.fill();
      };
      at(0, 0);
      for (const [count, ring] of [[6, 0.3], [12, 0.56], [18, 0.8]] as const) {
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + ring;
          at(Math.cos(a) * rad * ring, Math.sin(a) * rad * ring);
        }
      }
    }
    c.restore();

    // Six moulded bridges cutting into the rim.
    if (s.style.grille === 'hex') {
      c.save();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        c.save();
        c.translate(x + Math.cos(a) * rad * 0.84, y + Math.sin(a) * rad * 0.84);
        c.rotate(a + Math.PI / 2);
        roundRect(c, -rad * 0.075, -rad * 0.13, rad * 0.15, rad * 0.26, rad * 0.07);
        const g = c.createLinearGradient(0, -rad * 0.13, 0, rad * 0.13);
        g.addColorStop(0, s.speaker.plate);
        g.addColorStop(1, s.speaker.rim);
        c.fillStyle = g;
        c.globalAlpha = 0.92;
        c.fill();
        c.globalAlpha = 0.5;
        c.strokeStyle = s.speaker.rim;
        c.lineWidth = Math.max(0.7, this.px(0.25));
        c.stroke();
        c.restore();
      }
      c.restore();
    }
  }

  private drawVolume(board: Board, s: Skin): void {
    const c = this.ctx;
    const v = CONTROLS_MM.volume;
    const [vx, vy] = this.toScreen(v.x, v.y);
    const vw = this.px(v.w);
    const vh = this.px(v.h);

    // «ВКЛ.» legend with its arrow, above the window.
    c.save();
    c.fillStyle = s.textOnCase;
    c.font = `600 ${Math.max(5, this.px(2.7))}px "Arial Narrow", Arial, sans-serif`;
    c.textAlign = 'right';
    c.textBaseline = 'bottom';
    c.fillText('ВКЛ.', vx + vw - this.px(0.8), vy - this.px(0.5));
    c.strokeStyle = s.textOnCase;
    c.lineWidth = Math.max(0.8, this.px(0.32));
    c.beginPath();
    c.moveTo(vx + this.px(1.5), vy - this.px(2.2));
    c.lineTo(vx + vw * 0.44, vy - this.px(2.2));
    c.stroke();
    c.beginPath();
    c.moveTo(vx + vw * 0.52, vy - this.px(2.2));
    c.lineTo(vx + vw * 0.4, vy - this.px(3.0));
    c.lineTo(vx + vw * 0.4, vy - this.px(1.4));
    c.closePath();
    c.fillStyle = s.textOnCase;
    c.fill();
    c.restore();

    c.save();
    roundRect(c, vx, vy, vw, vh, this.px(1.2));
    c.fillStyle = s.case.dark;
    c.fill();
    c.strokeStyle = s.case.edge;
    c.lineWidth = Math.max(0.8, this.px(0.4));
    c.stroke();
    c.clip();

    const inset = vh * 0.18;
    c.fillStyle = s.knob.face;
    c.fillRect(vx, vy + inset, vw, vh - inset * 2);
    c.strokeStyle = s.knob.rib;
    c.lineWidth = Math.max(0.7, this.px(0.26));
    const ribs = 26;
    const shift = board.controls.volume * (vw / ribs);
    for (let i = -1; i <= ribs; i++) {
      const rx = vx + (i * vw) / ribs + shift;
      c.beginPath();
      c.moveTo(rx, vy + inset);
      c.lineTo(rx, vy + vh - inset);
      c.stroke();
    }
    c.fillStyle = '#C4342E';
    c.fillRect(
      vx + vw * (0.1 + board.controls.volume * 0.8) - this.px(0.35),
      vy + inset,
      this.px(0.7),
      vh - inset * 2,
    );
    c.restore();
  }

  private drawTuning(board: Board, view: ViewState): void {
    const c = this.ctx;
    const s = view.skin;
    const t = CONTROLS_MM.tuning;
    const [tx, ty] = this.toScreen(t.cx, t.cy);
    const tr = this.px(t.r);
    const angle = board.controls.tuning * Math.PI * 1.5 - Math.PI * 1.25;

    c.save();
    c.beginPath();
    c.arc(tx, ty + this.px(0.7), tr * 1.02, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.26)';
    c.fill();

    c.beginPath();
    c.arc(tx, ty, tr, 0, Math.PI * 2);
    if (s.style.texture) {
      const g = c.createLinearGradient(tx - tr, ty - tr, tx + tr, ty + tr);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.5, s.knob.face);
      g.addColorStop(1, s.knob.rib);
      c.fillStyle = g;
    } else {
      c.fillStyle = s.knob.face;
    }
    c.fill();

    if (s.style.knob === 'knurled') {
      c.strokeStyle = s.knob.rib;
      c.lineWidth = Math.max(0.7, this.px(0.28));
      const teeth = 44;
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2 + angle;
        c.beginPath();
        c.moveTo(tx + Math.cos(a) * tr * 0.84, ty + Math.sin(a) * tr * 0.84);
        c.lineTo(tx + Math.cos(a) * tr, ty + Math.sin(a) * tr);
        c.stroke();
      }
    }

    c.beginPath();
    c.arc(tx, ty, tr * 0.66, 0, Math.PI * 2);
    c.fillStyle = s.knob.dish;
    c.fill();
    c.strokeStyle = s.knob.rib;
    c.lineWidth = Math.max(0.7, this.px(0.3));
    c.stroke();

    if (s.style.knob === 'knurled') {
      // Engraved dial arc with its index dots, as on the original knob.
      c.beginPath();
      c.arc(tx, ty, tr * 0.73, angle + 0.4, angle + Math.PI * 1.6);
      c.strokeStyle = s.knob.mark;
      c.lineWidth = Math.max(0.8, this.px(0.3));
      c.stroke();
      c.fillStyle = s.knob.mark;
      for (let i = 0; i < 4; i++) {
        const a = angle + 0.4 + (i / 3) * Math.PI * 1.6;
        c.beginPath();
        c.arc(tx + Math.cos(a) * tr * 0.79, ty + Math.sin(a) * tr * 0.79, this.px(0.45), 0, 7);
        c.fill();
      }
    }

    c.strokeStyle = s.accent;
    c.lineWidth = Math.max(1.2, this.px(0.65));
    c.beginPath();
    c.moveTo(tx + Math.cos(angle) * tr * 0.28, ty + Math.sin(angle) * tr * 0.28);
    c.lineTo(tx + Math.cos(angle) * tr * 0.58, ty + Math.sin(angle) * tr * 0.58);
    c.stroke();
    c.restore();

    if (view.tunedHz > 0) {
      c.save();
      c.fillStyle = s.textOnCase;
      c.font = `${Math.max(6, this.px(2.8))}px ui-monospace, monospace`;
      c.textAlign = 'center';
      const khz = Math.round(view.tunedHz / 1000);
      const label = view.station ? `${khz} кГц · ${view.station}` : `${khz} кГц`;
      const [lx, ly] = this.toScreen(t.cx, t.cy + t.r + 5.2);
      c.fillText(label, lx, ly);
      c.restore();
    }
  }

  private drawProbes(view: ViewState): void {
    if (view.probes.length === 0) return;
    const c = this.ctx;
    c.save();
    for (const p of view.probes) {
      const [x, y] = this.contactCentre(p.cell, p.edge);
      c.beginPath();
      c.arc(x, y, this.px(2.0), 0, Math.PI * 2);
      c.strokeStyle = view.skin.probe;
      c.lineWidth = Math.max(1.4, this.px(0.65));
      c.stroke();
    }
    c.restore();
  }

  private drawDragGhost(view: ViewState): void {
    if (!view.dragging || !view.dragPos) return;
    const def = MODULE_BY_ID.get(view.dragging);
    if (!def) return;
    const c = this.ctx;
    const size = this.px(FIELD_MM.pitch);
    const w = size * def.width;
    c.save();
    c.globalAlpha = 0.9;
    c.translate(view.dragPos.x, view.dragPos.y);
    roundRect(c, -w / 2, -size / 2, w, size, this.px(1.6));
    c.fillStyle = view.skin.module.top;
    c.fill();
    c.strokeStyle = view.skin.module.side;
    c.lineWidth = Math.max(0.8, this.px(0.3));
    c.stroke();
    c.restore();

    c.save();
    c.translate(view.dragPos.x, view.dragPos.y);
    c.scale(size * 0.36, size * 0.36);
    c.lineWidth = view.skin.symbol.weight;
    c.lineJoin = 'round';
    c.strokeStyle = view.skin.symbol.ink;
    c.fillStyle = view.skin.symbol.ink;
    drawModuleSymbol(c, def);
    c.restore();
  }
}

function nearEdge(dx: number, dy: number, w: number, h: number): Pin | null {
  const band = w * 0.22;
  const mid = (v: number, span: number): boolean => Math.abs(v - span / 2) < span * 0.3;
  if (dy < band && mid(dx, w)) return 'N';
  if (dy > h - band && mid(dx, w)) return 'S';
  if (dx < band && mid(dy, h)) return 'W';
  if (dx > w - band && mid(dy, h)) return 'E';
  return null;
}

function roundRect(
  c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}
