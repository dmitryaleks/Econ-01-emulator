/**
 * The 36 cube modules and the antenna module of the ЭКОН-01 kit, generated from the
 * reverse-engineering registry `assets/blocks/block_spec.json`.
 *
 * Every block there carries a confirmed face-to-face pinout, taken from the module icons of
 * Приложение 2 and checked by hand. Rotation 0 is the module as its icon is drawn; rotation
 * permutes N->E->S->W, so one declaration covers all four orientations.
 */

import registry from '../../assets/blocks/block_spec.json';
import {
  ANTENNA_EMF,
  PINS,
  type ContactSite,
  type Element,
  type ModuleDef,
  type ModuleNode,
  type ModuleShape,
  type Pin,
} from './types.js';

interface TwoTerminal {
  from: string;
  to: string;
  via: string;
  winding?: string;
  turns?: number;
}

interface MultiTerminal {
  via: string;
  terminals: Record<string, string>;
}

interface Block {
  name: string;
  short_id: string;
  shape: ModuleShape;
  width_cells: number;
  rotatable?: boolean;
  rus_orig_desc: string;
  schematic_prop: {
    kind: string;
    value?: number;
    tolerance_pct?: number;
    tolerance_pct_minus?: number;
    tolerance_pct_plus?: number;
    model?: string;
    count?: number;
  };
  num_in_kit: number;
  pinout: { status: string; connections: (TwoTerminal | MultiTerminal)[] };
}

/**
 * Antenna winding sections, estimated from turn count on this rod (L ~ N^2): the 100-turn
 * section tunes medium wave against C10 = 10…100 pF, the full 330 turns long wave. The solver
 * has no mutual inductance, so sections are separate coils. Keyed by winding and turns.
 */
const WINDINGS: Record<string, { henries: number; esr: number }> = {
  'L1:100': { henries: 0.51e-3, esr: 1.2 },
  'L1:230': { henries: 5.1e-3, esr: 4.0 },
  'L2:25': { henries: 32e-6, esr: 0.4 },
};

/** The winding the radio induces its signal into. */
const COUPLING_WINDING = 'L2';

function isPinFace(face: string): face is Pin {
  return (PINS as readonly string[]).includes(face);
}

/** A face in the registry ("W", or "N2" on a wide module) as a module node. */
function nodeOf(face: string): ModuleNode {
  return isPinFace(face) ? face : `#${face}`;
}

function siteOf(face: string, width: number): ContactSite {
  if (isPinFace(face)) {
    return { node: face, edge: face, offset: face === 'E' ? width - 1 : 0 };
  }
  const edge = face[0];
  const cell = Number(face.slice(1));
  if ((edge !== 'N' && edge !== 'S') || !(cell >= 1 && cell <= width)) {
    throw new Error(`block_spec.json: bad contact "${face}" on a module ${width} cells wide`);
  }
  return { node: `#${face}`, edge, offset: cell - 1 };
}

function elementsOf(block: Block): Element[] {
  const p = block.schematic_prop;
  const out: Element[] = [];

  for (const c of block.pinout.connections) {
    if ('terminals' in c) {
      const t = c.terminals;
      if (c.via === 'bjt') {
        out.push({
          kind: 'bjt',
          base: nodeOf(t['base']!),
          collector: nodeOf(t['collector']!),
          emitter: nodeOf(t['emitter']!),
          model: p.model!,
        });
      } else if (c.via === 'button') {
        // One cap closes every contact at once: chain them so all are joined while held.
        const faces = Object.values(t).map(nodeOf);
        for (let i = 1; i < faces.length; i++) {
          out.push({ kind: 'button', a: faces[i - 1]!, b: faces[i]! });
        }
      } else {
        throw new Error(`block_spec.json: ${block.name} has an unsupported element "${c.via}"`);
      }
      continue;
    }

    const a = nodeOf(c.from);
    const b = nodeOf(c.to);
    switch (c.via) {
      case 'wire':
        out.push({ kind: 'link', a, b });
        break;
      case 'resistor':
        out.push({ kind: 'resistor', a, b, ohms: p.value!, tol: (p.tolerance_pct ?? 0) / 100 });
        break;
      case 'capacitor':
        out.push({
          kind: 'capacitor',
          a,
          b,
          farads: p.value!,
          tolLow: (p.tolerance_pct_minus ?? 0) / 100,
          tolHigh: (p.tolerance_pct_plus ?? 0) / 100,
        });
        break;
      case 'electrolytic':
        // `from` is the + terminal; the element's b is the negative one.
        out.push({ kind: 'electrolytic', a, b, farads: p.value! });
        break;
      case 'diode':
        out.push({ kind: 'diode', anode: a, cathode: b, model: p.model! });
        break;
      case 'inductor': {
        const w = WINDINGS[`${c.winding}:${c.turns}`];
        if (!w) throw new Error(`block_spec.json: no inductance for ${c.winding} ${c.turns} turns`);
        if (c.winding === COUPLING_WINDING) {
          out.push({ kind: 'inductor', a, b: '#emf', ...w, winding: c.winding });
          out.push({ kind: 'emf', p: '#emf', n: b, name: ANTENNA_EMF });
        } else {
          out.push({ kind: 'inductor', a, b, ...w, winding: c.winding });
        }
        break;
      }
      default:
        throw new Error(`block_spec.json: ${block.name} has an unsupported element "${c.via}"`);
    }
  }
  return out;
}

function facesOf(block: Block): string[] {
  const faces = block.pinout.connections.flatMap((c) =>
    'terminals' in c ? Object.values(c.terminals) : [c.from, c.to],
  );
  return [...new Set(faces)];
}

/** "2,2 кОм", "0,01 мкФ", "Д9Б ×2", "«Угол»" — what the parts bin prints. */
function captionOf(block: Block): string {
  const p = block.schematic_prop;
  const num = (v: number): string => String(Number(v.toPrecision(3))).replace('.', ',');
  const lastWord = block.rus_orig_desc.trim().split(/\s+/).at(-1)!;
  switch (p.kind) {
    case 'resistor': {
      const ohms = p.value!;
      if (ohms >= 1e6) return `${num(ohms / 1e6)} МОм`;
      if (ohms >= 1e3) return `${num(ohms / 1e3)} кОм`;
      return `${num(ohms)} Ом`;
    }
    case 'capacitor':
    case 'electrolytic': {
      const f = p.value!;
      return f >= 1e-8 ? `${num(f * 1e6)} мкФ` : `${num(f * 1e12)} пФ`;
    }
    case 'diode':
      return p.count && p.count > 1 ? `${lastWord} ×${p.count}` : lastWord;
    case 'bjt':
      return lastWord;
    case 'link':
      return block.rus_orig_desc.match(/«[^»]+»/)?.[0] ?? block.rus_orig_desc;
    case 'button':
      return 'кнопка';
    default:
      return block.shape === 'antenna' ? 'антенна' : block.rus_orig_desc;
  }
}

function moduleOf(block: Block): ModuleDef {
  if (block.pinout.status !== 'confirmed') {
    throw new Error(`block_spec.json: ${block.name} has no confirmed pinout yet`);
  }
  const faces = facesOf(block);
  const width = block.width_cells;
  const def: ModuleDef = {
    id: block.name,
    shortId: block.short_id,
    label: block.rus_orig_desc,
    caption: captionOf(block),
    shape: block.shape,
    qty: block.num_in_kit,
    width,
    contacts: [...new Set(faces.map((f) => siteOf(f, width).edge))],
    elements: elementsOf(block),
  };
  if (width > 1) def.sites = faces.map((f) => siteOf(f, width));
  if (block.rotatable === false) def.rotatable = false;
  return def;
}

const MODULES = (registry.elements as unknown as Block[]).map(moduleOf);

/** The cube modules, in registry order. */
export const CATALOGUE: ModuleDef[] = MODULES.filter((m) => m.shape !== 'antenna');

/** The magnetic antenna bar, six cells wide, which only fits its own slot. */
export const ANTENNA: ModuleDef = MODULES.find((m) => m.shape === 'antenna')!;

/** Every placeable module type, antenna last. */
export const ALL_MODULES: ModuleDef[] = [...CATALOGUE, ANTENNA];

export const MODULE_BY_ID = new Map(ALL_MODULES.map((m) => [m.id, m]));

/** Total number of cube modules in the kit. Приложение 2 says 36. */
export const CUBE_COUNT = CATALOGUE.reduce((n, m) => n + m.qty, 0);
