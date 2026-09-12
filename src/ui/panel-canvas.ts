/**
 * Draws the whole ЭКОН-01 panel on one canvas and does the hit testing.
 * Geometry comes from model/panel.ts in millimetres; this scales it to the widget.
 */

import type { Board } from '../model/board.js';
import { MODULE_BY_ID } from '../model/catalogue.js';
import {
  ANTENNA_ROW,
  CASE_MM,
  COLS,
  CONTROLS_MM,
  FIELD_MM,
  ROWS,
  XT_LABELS,
  cellRectMm,
  type Cell,
} from '../model/panel.js';
import { rotatePin, sitesOf, type Pin } from '../model/types.js';
import { SYMBOLS, type SymbolKey } from './symbols.js';
import type { Skin } from './skins/skin.js';

export interface HitCell { kind: 'cell'; cell: Cell }
export interface HitContact { kind: 'contact'; cell: Cell; edge: Pin }
export interface HitControl { kind: 'volume' | 'tuning' | 'speaker' }
export type Hit = HitCell | HitContact | HitControl | null;

export interface ViewState {
  skin: Skin;
  /** Module id being dragged from the parts bin, if any. */
  dragging: string | null;
  dragPos: { x: number; y: number } | null;
  hover: Cell | null;
  /** Contacts the user has clipped a probe onto. */
  probes: Array<{ cell: Cell; edge: Pin }>;
  /** 0..1, drives the speaker cone animation. */
  level: number;
  /** Net id per contact key, used to highlight what is connected to what. */
  contactNet: Map<string, string>;
  /** Net the pointer is hovering, highlighted across the whole field. */
  litNet: string | null;
  station: string | null;
  tunedHz: number;
}

const MARGIN = 6;

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

    const sx = (w - MARGIN * 2) / CASE_MM.w;
    const sy = (h - MARGIN * 2) / CASE_MM.h;
    this.scale = Math.min(sx, sy);
    this.originX = (w - CASE_MM.w * this.scale) / 2;
    this.originY = (h - CASE_MM.h * this.scale) / 2;
  }

  /** Millimetres to CSS pixels. */
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
        // Near an edge midpoint the user is aiming at a contact, not the cell.
        const edge = nearEdge(mx - r.x, my - r.y, r.w, r.h);
        return edge ? { kind: 'contact', cell, edge } : { kind: 'cell', cell };
      }
    }
    return null;
  }

  render(board: Board, view: ViewState): void {
    const c = this.ctx;
    const s = view.skin;
    const rect = this.canvas.getBoundingClientRect();
    c.clearRect(0, 0, rect.width, rect.height);

    this.drawCase(s);
    this.drawFieldWell(s);
    this.drawTerminals(s, view);
    this.drawCells(board, view);
    this.drawModules(board, view);
    this.drawLeads(board, view);
    this.drawSpeaker(s, view.level);
    this.drawControls(board, s, view);
    this.drawSilkscreen(s);
    this.drawProbes(view);
    this.drawDragGhost(view);
  }

  // -- pieces ---------------------------------------------------------------

  private drawCase(s: Skin): void {
    const c = this.ctx;
    const [x, y] = this.toScreen(0, 0);
    const w = this.px(CASE_MM.w);
    const h = this.px(CASE_MM.h);
    const r = this.px(5);

    c.save();
    roundRect(c, x, y, w, h, r);
    c.fillStyle = s.caseFill;
    c.fill();

    if (s.texture) {
      const g = c.createLinearGradient(x, y, x + w * 0.4, y + h);
      g.addColorStop(0, 'rgba(255,255,255,0.075)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.012)');
      g.addColorStop(1, 'rgba(0,0,0,0.28)');
      c.fillStyle = g;
      c.fill();
    }
    c.lineWidth = Math.max(1, this.px(0.5));
    c.strokeStyle = s.caseEdge;
    c.stroke();
    c.restore();

    // Carry handle along the top edge.
    const hx = this.px(22);
    const hy = this.px(8);
    const hw = this.px(CASE_MM.w - 44);
    const hh = this.px(14);
    c.save();
    roundRect(c, x + hx, y + hy, hw, hh, this.px(4));
    c.fillStyle = s.fieldWell;
    c.fill();
    c.lineWidth = Math.max(1, this.px(0.6));
    c.strokeStyle = s.caseHighlight;
    c.stroke();
    c.restore();
  }

  private drawFieldWell(s: Skin): void {
    const c = this.ctx;
    const pad = 3.2;
    const top = cellRectMm({ col: 0, row: 0 });
    const bottom = cellRectMm({ col: COLS - 1, row: ROWS - 1 });
    const [x, y] = this.toScreen(top.x - pad, top.y - pad);
    const w = this.px(bottom.x + bottom.w - top.x + pad * 2);
    const h = this.px(bottom.y + bottom.h - top.y + pad * 2);

    c.save();
    roundRect(c, x, y, w, h, this.px(2));
    c.fillStyle = s.fieldWell;
    c.fill();
    c.lineWidth = Math.max(1, this.px(0.5));
    c.strokeStyle = s.fieldEdge;
    c.stroke();
    c.restore();
  }

  /** The seven outset XT contacts down the left edge, plus the clamp contacts elsewhere. */
  private drawTerminals(s: Skin, view: ViewState): void {
    const c = this.ctx;
    for (let row = 0; row < ROWS; row++) {
      const r = cellRectMm({ col: 0, row });
      const [x, y] = this.toScreen(r.x - 3.0, r.y + r.h / 2 - 3.1);
      c.save();
      roundRect(c, x, y, this.px(3.4), this.px(6.2), this.px(0.7));
      c.fillStyle = s.contact;
      c.fill();
      c.strokeStyle = s.contactShadow;
      c.lineWidth = Math.max(1, this.px(0.35));
      c.stroke();
      c.restore();

      c.save();
      c.fillStyle = s.textOnCase;
      c.font = `${Math.max(6, this.px(2.6))}px ui-monospace, monospace`;
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      const [lx, ly] = this.toScreen(r.x - 3.8, r.y + r.h / 2);
      c.fillText(XT_LABELS[row] ?? '', lx, ly);
      c.restore();
    }

    // Small clamp contacts along the other three sides of the field.
    for (let col = 0; col < COLS; col++) {
      this.clampContact(s, cellRectMm({ col, row: 0 }), 'top');
      this.clampContact(s, cellRectMm({ col, row: ROWS - 1 }), 'bottom');
    }
    for (let row = 0; row < ROWS; row++) {
      this.clampContact(s, cellRectMm({ col: COLS - 1, row }), 'right');
    }
    void view;
  }

  private clampContact(
    s: Skin,
    r: { x: number; y: number; w: number; h: number },
    side: 'top' | 'bottom' | 'right',
  ): void {
    const c = this.ctx;
    const long = 5.2;
    const thin = 1.9;
    let x: number;
    let y: number;
    let w: number;
    let h: number;
    if (side === 'right') {
      w = thin;
      h = long;
      x = r.x + r.w + 0.5;
      y = r.y + r.h / 2 - long / 2;
    } else {
      w = long;
      h = thin;
      x = r.x + r.w / 2 - long / 2;
      y = side === 'top' ? r.y - 2.4 : r.y + r.h + 0.5;
    }
    const [sx, sy] = this.toScreen(x, y);
    c.save();
    c.fillStyle = s.contact;
    c.globalAlpha = 0.8;
    c.fillRect(sx, sy, this.px(w), this.px(h));
    c.restore();
  }

  private drawCells(board: Board, view: ViewState): void {
    const c = this.ctx;
    const s = view.skin;
    for (let row = 0; row < ROWS; row++) {
      if (row === ANTENNA_ROW) continue;
      for (let col = 0; col < COLS; col++) {
        if (board.ownerOf({ col, row })) continue;
        const r = cellRectMm({ col, row });
        const [x, y] = this.toScreen(r.x + 0.9, r.y + 0.9);
        const size = this.px(r.w - 1.8);
        c.save();
        roundRect(c, x, y, size, size, this.px(1.4));
        c.strokeStyle = s.fieldEdge;
        c.lineWidth = Math.max(0.6, this.px(0.28));
        c.stroke();
        const hovering =
          view.hover && view.hover.col === col && view.hover.row === row && view.dragging;
        if (hovering) {
          c.fillStyle = board.canPlace(view.dragging!, { col, row })
            ? 'rgba(120,220,140,0.22)'
            : 'rgba(230,70,50,0.22)';
          c.fill();
        }
        c.restore();
      }
    }

    // The antenna slot is drawn as one long recess.
    const a0 = cellRectMm({ col: 0, row: ANTENNA_ROW });
    const a5 = cellRectMm({ col: COLS - 1, row: ANTENNA_ROW });
    if (!board.ownerOf({ col: 0, row: ANTENNA_ROW })) {
      const [x, y] = this.toScreen(a0.x + 0.8, a0.y + 2.2);
      c.save();
      roundRect(
        c, x, y,
        this.px(a5.x + a5.w - a0.x - 1.6),
        this.px(a0.h - 4.4),
        this.px(1.2),
      );
      c.strokeStyle = s.fieldEdge;
      c.lineWidth = Math.max(0.6, this.px(0.28));
      c.stroke();
      c.restore();
    }
  }

  private drawModules(board: Board, view: ViewState): void {
    for (const [owner, placement] of board.placements) {
      const def = MODULE_BY_ID.get(placement.moduleId);
      if (!def) continue;
      const [col, row] = owner.split(',').map(Number) as [number, number];
      const r0 = cellRectMm({ col, row });
      const wMm = r0.w * def.width;
      this.drawModuleBody(r0.x, r0.y, wMm, r0.h, view.skin, def.shape === 'button');
      this.drawSymbol(
        def.symbol as SymbolKey,
        r0.x + wMm / 2,
        r0.y + r0.h / 2,
        r0.h * 0.34,
        def.rotatable === false ? 0 : placement.rotation,
        view.skin,
      );
      // Contact pads.
      for (const site of sitesOf(def)) {
        const edge = def.rotatable === false ? site.edge : rotatePin(site.edge, placement.rotation);
        const cell = { col: col + site.offset, row };
        this.drawPad(cell, edge, view);
      }
    }
  }

  private drawModuleBody(
    xMm: number, yMm: number, wMm: number, hMm: number, s: Skin, tall: boolean,
  ): void {
    const c = this.ctx;
    const inset = 0.7;
    const [x, y] = this.toScreen(xMm + inset, yMm + inset);
    const w = this.px(wMm - inset * 2);
    const h = this.px(hMm - inset * 2);

    c.save();
    roundRect(c, x, y, w, h, this.px(2));
    c.fillStyle = s.cubeSide;
    c.fill();
    c.restore();

    // Top face, inset to suggest the moulded round cap.
    const lift = this.px(0.9);
    c.save();
    roundRect(c, x + lift * 0.4, y, w - lift * 0.8, h - lift, this.px(1.8));
    if (s.texture) {
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, s.cubeTopHi);
      g.addColorStop(0.55, s.cubeTop);
      g.addColorStop(1, s.cubeSide);
      c.fillStyle = g;
    } else {
      c.fillStyle = s.cubeTop;
    }
    c.fill();
    c.strokeStyle = s.cubeSide;
    c.lineWidth = Math.max(0.6, this.px(0.22));
    c.stroke();
    c.restore();

    if (tall) {
      // The кнопка module stands proud with a cap on top.
      const [cx, cy] = this.toScreen(xMm + wMm / 2, yMm + hMm / 2);
      c.save();
      c.beginPath();
      c.arc(cx, cy, this.px(hMm * 0.24), 0, Math.PI * 2);
      c.fillStyle = s.knobFace;
      c.fill();
      c.strokeStyle = s.cubeSide;
      c.lineWidth = Math.max(0.6, this.px(0.3));
      c.stroke();
      c.restore();
    }
  }

  private drawSymbol(
    key: SymbolKey, cxMm: number, cyMm: number, radiusMm: number, rotation: number, s: Skin,
  ): void {
    const draw = SYMBOLS[key];
    if (!draw) return;
    const c = this.ctx;
    const [x, y] = this.toScreen(cxMm, cyMm);
    const r = this.px(radiusMm);

    const paint = (colour: string, dx: number, dy: number): void => {
      c.save();
      c.translate(x + dx, y + dy);
      c.rotate((rotation * Math.PI) / 2);
      c.scale(r, r);
      c.lineWidth = 0.115;
      c.lineJoin = 'round';
      c.lineCap = 'butt';
      c.strokeStyle = colour;
      c.fillStyle = colour;
      draw(c);
      c.restore();
    };

    if (s.emboss) {
      paint(s.cubeEmbossHi, this.px(0.16), this.px(0.16));
      paint(s.cubeEmboss, 0, 0);
    } else {
      paint(s.cubeEmboss, 0, 0);
    }
  }

  private drawPad(cell: Cell, edge: Pin, view: ViewState): void {
    const c = this.ctx;
    const r = cellRectMm(cell);
    const t = 1.7;
    const long = 4.4;
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
    c.save();
    c.fillStyle = lit ? view.skin.netLive : view.skin.contact;
    c.fillRect(sx, sy, this.px(w), this.px(h));
    c.restore();
  }

  private drawLeads(board: Board, view: ViewState): void {
    if (board.leads.length === 0) return;
    const c = this.ctx;
    c.save();
    c.strokeStyle = view.skin.accent;
    c.lineWidth = Math.max(1.4, this.px(0.9));
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

  private drawSpeaker(s: Skin, level: number): void {
    const c = this.ctx;
    const { cx, cy, r } = CONTROLS_MM.speaker;
    const [x, y] = this.toScreen(cx, cy);
    const rad = this.px(r);

    c.save();
    c.beginPath();
    c.arc(x, y, rad, 0, Math.PI * 2);
    c.fillStyle = s.speakerGrille;
    c.fill();

    // 37 holes: one centre, then rings of 6, 12 and 18.
    const wobble = 1 + level * 0.09;
    c.fillStyle = s.speakerHole;
    const hole = (hx: number, hy: number): void => {
      c.beginPath();
      c.arc(x + hx, y + hy, this.px(1.9) * wobble, 0, Math.PI * 2);
      c.fill();
    };
    hole(0, 0);
    for (const [count, ring] of [[6, 0.33], [12, 0.62], [18, 0.9]] as const) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + ring;
        hole(Math.cos(a) * rad * ring, Math.sin(a) * rad * ring);
      }
    }
    c.restore();
  }

  private drawControls(board: Board, s: Skin, view: ViewState): void {
    const c = this.ctx;

    // Volume: a ribbed thumbwheel peeping through a slot, ganged with the power switch.
    const v = CONTROLS_MM.volume;
    const [vx, vy] = this.toScreen(v.x, v.y);
    const vw = this.px(v.w);
    const vh = this.px(v.h);
    c.save();
    roundRect(c, vx, vy, vw, vh, this.px(1.6));
    c.fillStyle = s.fieldWell;
    c.fill();
    c.clip();
    c.fillStyle = s.knobFace;
    c.fillRect(vx + vw * 0.08, vy + vh * 0.18, vw * 0.84, vh * 0.64);
    c.strokeStyle = s.knobRib;
    c.lineWidth = Math.max(0.8, this.px(0.3));
    const ribs = 22;
    const shift = board.controls.volume * (vw * 0.84) / ribs;
    for (let i = 0; i <= ribs; i++) {
      const rx = vx + vw * 0.08 + (i * vw * 0.84) / ribs + shift;
      c.beginPath();
      c.moveTo(rx, vy + vh * 0.18);
      c.lineTo(rx, vy + vh * 0.82);
      c.stroke();
    }
    c.restore();
    // Red index mark showing the power-on point.
    c.save();
    c.fillStyle = s.accent;
    c.fillRect(vx + vw * 0.5 - this.px(0.4), vy, this.px(0.8), vh * 0.28);
    c.restore();

    // Tuning: the large ribbed wheel.
    const t = CONTROLS_MM.tuning;
    const [tx, ty] = this.toScreen(t.cx, t.cy);
    const tr = this.px(t.r);
    c.save();
    c.beginPath();
    c.arc(tx, ty, tr, 0, Math.PI * 2);
    c.fillStyle = s.knobFace;
    c.fill();
    c.strokeStyle = s.knobRib;
    c.lineWidth = Math.max(0.8, this.px(0.3));
    const teeth = 48;
    const angle = board.controls.tuning * Math.PI * 1.5 - Math.PI * 0.75;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2 + angle;
      c.beginPath();
      c.moveTo(tx + Math.cos(a) * tr * 0.86, ty + Math.sin(a) * tr * 0.86);
      c.lineTo(tx + Math.cos(a) * tr, ty + Math.sin(a) * tr);
      c.stroke();
    }
    c.beginPath();
    c.arc(tx, ty, tr * 0.44, 0, Math.PI * 2);
    c.fillStyle = s.knobCentre;
    c.fill();
    // Pointer.
    c.strokeStyle = s.accent;
    c.lineWidth = Math.max(1.2, this.px(0.7));
    c.beginPath();
    c.moveTo(tx + Math.cos(angle) * tr * 0.48, ty + Math.sin(angle) * tr * 0.48);
    c.lineTo(tx + Math.cos(angle) * tr * 0.82, ty + Math.sin(angle) * tr * 0.82);
    c.stroke();
    c.restore();

    // Tuning read-out.
    if (view.tunedHz > 0) {
      c.save();
      c.fillStyle = s.textOnCase;
      c.font = `${Math.max(6, this.px(3))}px ui-monospace, monospace`;
      c.textAlign = 'center';
      const khz = Math.round(view.tunedHz / 1000);
      const label = view.station ? `${khz} кГц · ${view.station}` : `${khz} кГц`;
      const [lx, ly] = this.toScreen(t.cx, t.cy + t.r + 6);
      c.fillText(label, lx, ly);
      c.restore();
    }
  }

  private drawSilkscreen(s: Skin): void {
    const c = this.ctx;
    c.save();
    c.fillStyle = s.silkscreen;

    const [bx, by] = this.toScreen(CONTROLS_MM.badge.x, CONTROLS_MM.badge.y);
    c.font = `700 ${Math.max(8, this.px(5))}px "Helvetica Neue", Arial, sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText('ЭКОН·01', bx, by);

    c.font = `${Math.max(5, this.px(2.5))}px "Helvetica Neue", Arial, sans-serif`;
    const [tx, ty] = this.toScreen(FIELD_MM.x, FIELD_MM.y - 5.4);
    c.fillText('30 ЭЛЕКТРОННЫХ УСТРОЙСТВ', tx, ty);
    c.restore();
  }

  private drawProbes(view: ViewState): void {
    if (view.probes.length === 0) return;
    const c = this.ctx;
    c.save();
    for (const p of view.probes) {
      const [x, y] = this.contactCentre(p.cell, p.edge);
      c.beginPath();
      c.arc(x, y, this.px(2.2), 0, Math.PI * 2);
      c.strokeStyle = view.skin.probe;
      c.lineWidth = Math.max(1.4, this.px(0.7));
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
    c.save();
    c.globalAlpha = 0.85;
    c.translate(view.dragPos.x - size / 2, view.dragPos.y - size / 2);
    c.translate(-this.originX, -this.originY);
    c.scale(1 / this.scale, 1 / this.scale);
    c.translate(this.originX, this.originY);
    c.restore();

    // Simple filled square with the symbol, following the pointer.
    c.save();
    c.translate(view.dragPos.x, view.dragPos.y);
    const half = size / 2;
    roundRect(c, -half, -half, size, size * (def.width > 1 ? 1 : 1), this.px(2));
    c.fillStyle = view.skin.cubeTop;
    c.globalAlpha = 0.9;
    c.fill();
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
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}
