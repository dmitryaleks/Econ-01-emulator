/** Wires the panel, the parts bin, the solver and the audio engine together. */

import { AudioEngine } from '../audio/engine.js';
import { Board, POWER_THRESHOLD } from '../model/board.js';
import { ALL_MODULES, CATALOGUE, MODULE_BY_ID } from '../model/catalogue.js';
import { ANTENNA_ROW } from '../model/panel.js';
import type { Cell, } from '../model/panel.js';
import type { ModuleDef, Pin } from '../model/types.js';
import { CIRCUITS, loadCircuit } from '../circuits/index.js';
import { buildNetlist, contactKey, type Netlist } from '../netlist/build.js';
import { Simulation } from '../sim/transient.js';
import { PanelCanvas, type Hit, type ViewState } from './panel-canvas.js';
import { Scope } from './probe.js';
import { drawModuleSymbol } from './symbols.js';
import { BLACK } from './skins/black.js';
import { GREY } from './skins/grey.js';
import { SCHEMATIC } from './skins/schematic.js';
import type { Skin } from './skins/skin.js';

/** The grey unit is the one we have an orthogonal reference photograph of, so it leads. */
const SKINS: Skin[] = [GREY, BLACK, SCHEMATIC];

export class App {
  private readonly board = new Board();
  private readonly panel: PanelCanvas;
  private readonly scope: Scope;
  private readonly audio = new AudioEngine();

  /** Mirror of the worklet's circuit, used to drive the scope on the main thread. */
  private mirror: Simulation | null = null;
  private netlist: Netlist;

  private view: ViewState = {
    skin: GREY,
    dragging: null,
    dragPos: null,
    hover: null,
    probes: [],
    level: 0,
    contactNet: new Map(),
    litNet: null,
  };

  private drag: { control: 'volume' | 'tuning'; startX: number; startValue: number } | null = null;
  /** Last pointer position over the panel, for keyboard rotation. */
  private pointer: { x: number; y: number } | null = null;
  private dirty = true;

  constructor(
    private readonly root: HTMLElement,
    panelCanvas: HTMLCanvasElement,
    scopeCanvas: HTMLCanvasElement,
  ) {
    this.panel = new PanelCanvas(panelCanvas);
    this.scope = new Scope(scopeCanvas);
    this.netlist = buildNetlist(this.board);

    this.restoreFromHash();
    this.buildBin();
    this.bindPanel(panelCanvas);
    this.bindChrome();
    this.rebuild();

    const onResize = (): void => {
      this.panel.resize();
      this.dirty = true;
    };
    window.addEventListener('resize', onResize);
    onResize();

    this.audio.onStatus = (s) => {
      this.view.level = s.peak;
      const rate = s.solverRate
        ? ` · решатель ${Math.round(s.solverRate / 1000)} кГц` +
          (s.solverRate < 24_000 ? ' (упрощённый расчёт)' : '')
        : '';
      this.setStatus(
        `${s.running ? 'питание подано' : 'ожидание'}${rate}` +
          (s.converged ? '' : ' · схема не сходится'),
      );
      this.dirty = true;
    };

    requestAnimationFrame(this.frame);
  }

  // -- assembly -------------------------------------------------------------

  private rebuild(): void {
    this.netlist = buildNetlist(this.board);
    this.view.contactNet = this.netlist.contactNet;
    if (!this.mirror?.update(this.netlist)) this.mirror = new Simulation(this.netlist, 12_000);
    this.audio.setNetlist(this.netlist);
    this.updateBinCounts();
    this.writeHash();
    this.dirty = true;
  }

  // -- parts bin ------------------------------------------------------------

  private binEls = new Map<string, HTMLElement>();

  private buildBin(): void {
    const bin = this.root.querySelector<HTMLElement>('#bin');
    if (!bin) return;
    bin.innerHTML = '';
    for (const def of ALL_MODULES) {
      const el = document.createElement('button');
      el.className = 'part';
      el.type = 'button';
      el.dataset['module'] = def.id;
      el.innerHTML =
        `<span class="part-icon"></span>` +
        `<span class="part-name">${def.caption ?? def.label}</span>` +
        `<span class="part-qty" data-qty></span>`;
      el.title = `${def.label} (${def.id}, ${def.shortId})`;
      const icon = el.querySelector<HTMLElement>('.part-icon')!;
      if (def.shape === 'antenna') icon.remove();
      else icon.style.setProperty('--icon', `url(${symbolMask(def)})`);
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        if (this.board.remaining(def.id) <= 0) return;
        this.view.dragging = def.id;
        this.view.dragPos = null;
      });
      bin.appendChild(el);
      this.binEls.set(def.id, el);
    }
    this.updateBinCounts();
  }

  private updateBinCounts(): void {
    for (const [id, el] of this.binEls) {
      const left = this.board.remaining(id);
      const qty = el.querySelector('[data-qty]');
      if (qty) qty.textContent = Number.isFinite(left) ? `${left}` : '∞';
      el.classList.toggle('empty', left <= 0);
    }
  }

  // -- panel interaction ----------------------------------------------------

  private bindPanel(canvas: HTMLCanvasElement): void {
    const local = (ev: PointerEvent): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };

    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

    canvas.addEventListener('pointerdown', (ev) => {
      const p = local(ev);
      const hit = this.panel.hitTest(p.x, p.y);
      canvas.setPointerCapture(ev.pointerId);

      if (this.view.dragging) {
        this.dropModule(hit);
        return;
      }
      if (!hit) return;

      if (hit.kind === 'volume' || hit.kind === 'tuning') {
        this.drag = {
          control: hit.kind,
          startX: hit.kind === 'volume' ? p.x : p.y,
          startValue:
            hit.kind === 'volume' ? this.board.controls.volume : this.board.controls.tuning,
        };
        return;
      }
      // The кнопка's push cap presses it on a plain click; any other click on the cap acts on
      // the module, never on the contact pads the cap overlaps.
      const cap = this.panel.buttonCapAt(p.x, p.y, this.board);
      const plain = ev.button === 0 && !ev.shiftKey && !ev.altKey;
      if (cap && plain) {
        this.board.controls.buttonDown = true;
        this.rebuild();
        return;
      }
      if (hit.kind === 'contact' && !cap) {
        this.toggleProbe(hit.cell, hit.edge);
        return;
      }
      if (hit.kind === 'cell' || hit.kind === 'contact') {
        if (!this.board.defAt(hit.cell)) return;
        if (ev.button === 2 || ev.shiftKey) {
          this.board.rotate(hit.cell, ev.shiftKey && ev.button !== 2 ? -1 : 1);
        } else if (ev.altKey) {
          this.board.remove(hit.cell);
        } else {
          this.board.rotate(hit.cell, 1);
        }
        this.rebuild();
      }
    });

    canvas.addEventListener('pointermove', (ev) => {
      const p = local(ev);
      this.pointer = p;
      if (this.view.dragging) {
        this.view.dragPos = p;
        const hit = this.panel.hitTest(p.x, p.y);
        this.view.hover = hit && (hit.kind === 'cell' || hit.kind === 'contact') ? hit.cell : null;
        this.dirty = true;
        return;
      }

      if (this.drag) {
        const delta =
          this.drag.control === 'volume'
            ? (p.x - this.drag.startX) / 140
            : (this.drag.startX - p.y) / 180;
        const next = clamp01(this.drag.startValue + delta);
        if (this.drag.control === 'volume') this.board.controls.volume = next;
        else this.board.controls.tuning = next;
        this.rebuild();
        return;
      }

      const hit = this.panel.hitTest(p.x, p.y);
      const lit =
        hit && hit.kind === 'contact'
          ? (this.view.contactNet.get(contactKey(hit.cell, hit.edge)) ?? null)
          : null;
      if (lit !== this.view.litNet) {
        this.view.litNet = lit;
        this.dirty = true;
      }
      canvas.style.cursor = hit ? 'pointer' : 'default';
    });

    const release = (): void => {
      this.drag = null;
      if (this.board.controls.buttonDown) {
        this.board.controls.buttonDown = false;
        this.rebuild();
      }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => (this.pointer = null));

    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.view.dragging) {
        this.view.dragging = null;
        this.view.dragPos = null;
        this.dirty = true;
        return;
      }
      // R rotates whatever module is under the pointer. By key position, so it works on a
      // Russian layout too; Shift+R turns the other way.
      if (ev.code === 'KeyR' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && this.pointer) {
        const hit = this.panel.hitTest(this.pointer.x, this.pointer.y);
        if (!hit || (hit.kind !== 'cell' && hit.kind !== 'contact')) return;
        if (!this.board.defAt(hit.cell)) return;
        this.board.rotate(hit.cell, ev.shiftKey ? -1 : 1);
        this.rebuild();
      }
    });
  }

  private dropModule(hit: Hit): void {
    const id = this.view.dragging;
    this.view.dragging = null;
    this.view.dragPos = null;
    this.view.hover = null;
    if (!id || !hit || (hit.kind !== 'cell' && hit.kind !== 'contact')) {
      this.dirty = true;
      return;
    }
    const def = MODULE_BY_ID.get(id);
    const cell: Cell = def && def.width > 1 ? { col: 0, row: ANTENNA_ROW } : hit.cell;
    this.board.place(id, cell);
    this.rebuild();
  }

  private toggleProbe(cell: Cell, edge: Pin): void {
    const i = this.view.probes.findIndex(
      (p) => p.cell.col === cell.col && p.cell.row === cell.row && p.edge === edge,
    );
    if (i >= 0) this.view.probes.splice(i, 1);
    else {
      this.view.probes.push({ cell, edge });
      if (this.view.probes.length > 2) this.view.probes.shift();
    }
    this.syncScopeChannels();
    this.dirty = true;
  }

  private syncScopeChannels(): void {
    const labels = this.view.probes.map((p) => `${p.cell.col},${p.cell.row}·${p.edge}`);
    if (labels.length === 0) labels.push('динамик');
    this.scope.setChannels(labels, this.view.skin.scope.traces, 600);
  }

  // -- chrome ---------------------------------------------------------------

  private bindChrome(): void {
    const on = (sel: string, fn: (el: HTMLElement) => void): void => {
      const el = this.root.querySelector<HTMLElement>(sel);
      if (el) el.addEventListener('click', () => fn(el));
    };

    on('#power', async () => {
      if (this.audio.status.running) {
        await this.audio.suspend();
      } else {
        await this.audio.start();
        this.audio.setNetlist(this.netlist);
        if (this.board.controls.volume < POWER_THRESHOLD) {
          this.board.controls.volume = 0.55;
          this.rebuild();
        }
      }
      this.dirty = true;
    });

    on('#skin', (el) => {
      const next = SKINS[(SKINS.indexOf(this.view.skin) + 1) % SKINS.length]!;
      this.view.skin = next;
      el.textContent = next.label;
      document.body.dataset['skin'] = next.id;
      this.syncScopeChannels();
      this.dirty = true;
    });

    on('#clear', () => {
      this.board.clear();
      this.view.probes = [];
      this.syncScopeChannels();
      this.rebuild();
    });

    on('#sandbox', (el) => {
      this.board.sandbox = !this.board.sandbox;
      el.classList.toggle('active', this.board.sandbox);
      el.textContent = this.board.sandbox ? 'Свободный режим: вкл' : 'Свободный режим';
      this.updateBinCounts();
    });

    const list = this.root.querySelector<HTMLElement>('#circuits');
    if (list) {
      list.innerHTML = '';
      for (const circuit of CIRCUITS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'circuit';
        const flags: string[] = [];
        if (!circuit.simulates) flags.push('<b>пока не считается</b>');
        if (!circuit.kitLegal) flags.push('нужны дополнительные провода');
        btn.innerHTML =
          `<span class="circuit-title">${circuit.title}</span>` +
          `<span class="circuit-note">${circuit.description}</span>` +
          (flags.length ? `<span class="circuit-flag">${flags.join(' · ')}</span>` : '');
        btn.classList.toggle('inert', !circuit.simulates);
        btn.addEventListener('click', () => {
          loadCircuit(this.board, circuit);
          this.view.probes = [];
          this.syncScopeChannels();
          this.rebuild();
          void this.audio.start();
        });
        list.appendChild(btn);
      }
    }

    this.syncScopeChannels();
  }

  private setStatus(text: string): void {
    const el = this.root.querySelector('#status');
    if (el) el.textContent = text;
  }

  // -- persistence ----------------------------------------------------------

  private writeHash(): void {
    const encoded = encodeURIComponent(this.board.serialise());
    history.replaceState(null, '', `#${encoded}`);
  }

  private restoreFromHash(): void {
    const raw = location.hash.slice(1);
    if (!raw) return;
    try {
      const restored = Board.deserialise(decodeURIComponent(raw));
      for (const [id, p] of restored.placements) {
        const [col, row] = id.split(',').map(Number) as [number, number];
        this.board.place(p.moduleId, { col, row }, p.rotation);
      }
      this.board.controls = restored.controls;
    } catch {
      // A malformed link just starts an empty board.
    }
  }

  // -- frame loop -----------------------------------------------------------

  private frame = (): void => {
    // Advance the mirror so the scope shows live traces even before audio starts.
    const mirror = this.mirror;
    if (mirror) {
      const steps = 200;
      for (let i = 0; i < steps; i++) {
        mirror.sample();
        if (i % 4 === 0) {
          this.scope.push(
            this.view.probes.length > 0
              ? this.view.probes.map((p) =>
                  mirror.circuit.voltageAt(
                    this.view.contactNet.get(contactKey(p.cell, p.edge)) ?? '',
                  ),
                )
              : [
                  mirror.circuit.voltageAt(this.netlist.speaker.p) -
                    mirror.circuit.voltageAt(this.netlist.speaker.n),
                ],
          );
        }
      }
      this.dirty = true;
    }

    if (this.dirty) {
      this.panel.render(this.board, this.view);
      this.scope.render(this.view.skin.scope.background, this.view.skin.scope.grid);
      this.dirty = false;
    }
    requestAnimationFrame(this.frame);
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A module's symbol as an opaque-on-transparent image, used as a CSS mask so the bin icon takes
 * the text colour of whichever skin is active.
 */
function symbolMask(def: ModuleDef): string {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.translate(size / 2, size / 2);
  c.scale(size * 0.47, size * 0.47);
  c.lineWidth = 0.11;
  c.lineJoin = 'round';
  c.strokeStyle = c.fillStyle = '#000';
  c.beginPath();
  c.arc(0, 0, 1, 0, Math.PI * 2);
  c.globalAlpha = 0.35;
  c.stroke();
  c.globalAlpha = 1;
  drawModuleSymbol(c, def);
  return canvas.toDataURL();
}

export { CATALOGUE };
