/**
 * Turn a board into a netlist.
 *
 * Contacts of orthogonally adjacent modules touch pad to pad; that, plus the seven left-edge
 * terminals and the two supplied leads, is the whole wiring mechanism (SPEC.md §3.1, §7.1).
 * The built-in low-frequency amplifier of Приложение 3 is always present and is stitched on
 * at the end.
 */

import type { Board } from '../model/board.js';
import { c10Farads, powerOn } from '../model/board.js';
import { MODULE_BY_ID } from '../model/catalogue.js';
import { FACING, FIXED_NETS, cellId, neighbour, panelNetAt, type Cell } from '../model/panel.js';
import {
  rotatePin,
  sitesOf,
  type Element,
  type ModuleNode,
  type Pin,
  type Rotation,
} from '../model/types.js';
import { UnionFind } from './unionfind.js';

export type NetId = string;

export interface NlResistor { kind: 'R'; name: string; a: NetId; b: NetId; ohms: number }
export interface NlCapacitor { kind: 'C'; name: string; a: NetId; b: NetId; farads: number }
export interface NlInductor {
  kind: 'L'; name: string; a: NetId; b: NetId; henries: number; esr: number;
}
export interface NlDiode {
  kind: 'D'; name: string; anode: NetId; cathode: NetId; model: string;
}
export interface NlBjt {
  kind: 'Q'; name: string; base: NetId; collector: NetId; emitter: NetId; model: string;
}
export interface NlVSource { kind: 'V'; name: string; p: NetId; n: NetId; volts: number }
/**
 * The sealed low-frequency amplifier of Приложение 3, as a block. Output between p and n,
 * driven by the voltage across cp..cn, saturating at the supply rails.
 */
export interface NlAmp {
  kind: 'A';
  name: string;
  p: NetId;
  n: NetId;
  cp: NetId;
  cn: NetId;
  gain: number;
  /** Output swings no further than this either way. */
  clip: number;
  /** Output resistance of the emitter-follower pair. */
  rout: number;
}

export type NlElement =
  | NlResistor | NlCapacitor | NlInductor | NlDiode | NlBjt | NlVSource | NlAmp;

export interface Netlist {
  elements: NlElement[];
  /** Every net that carries at least one element terminal. */
  nets: NetId[];
  ground: NetId;
  /** Terminals across the loudspeaker; their difference is the audio signal. */
  speaker: { p: NetId; n: NetId };
  /** Field contact key -> net, for probing and UI highlighting. */
  contactNet: Map<string, NetId>;
  /** Antenna winding terminals, if the antenna module is placed. */
  antenna: { tuned: [NetId, NetId]; coupling: [NetId, NetId] } | null;
}

/** Key identifying one physical contact on the field. */
export function contactKey(cell: Cell, edge: Pin): string {
  return `${cellId(cell.col, cell.row)}:${edge}`;
}

function internalKey(owner: string, node: ModuleNode): string {
  return `${owner}${node}`;
}

interface Placed {
  owner: string;
  origin: Cell;
  defId: string;
  rotation: Rotation;
  /** module node -> union-find key */
  nodeKey: Map<ModuleNode, string>;
}

export function buildNetlist(board: Board): Netlist {
  const uf = new UnionFind();
  const elements: NlElement[] = [];
  const contactKeys = new Set<string>();

  for (const net of Object.values(FIXED_NETS)) uf.pin(net);

  // --- 1. Register contacts, bind them to panel terminals --------------------------------
  const placed: Placed[] = [];

  for (const [owner, p] of board.placements) {
    const def = MODULE_BY_ID.get(p.moduleId);
    if (!def) continue;
    const [col, row] = owner.split(',').map(Number) as [number, number];
    const origin: Cell = { col, row };
    const nodeKey = new Map<ModuleNode, string>();

    for (const site of sitesOf(def)) {
      // Rotation applies only to 1×1 modules; the antenna bar declares rotatable: false.
      const edge = def.rotatable === false ? site.edge : rotatePin(site.edge, p.rotation);
      const cell: Cell = { col: origin.col + site.offset, row: origin.row };
      const key = contactKey(cell, edge);
      uf.add(key);
      contactKeys.add(key);
      nodeKey.set(site.node, key);

      const panelNet = panelNetAt(cell, edge);
      if (panelNet) uf.union(key, panelNet);
    }

    for (const el of def.elements) {
      for (const node of elementNodes(el)) {
        if (!nodeKey.has(node)) nodeKey.set(node, uf.add(internalKey(owner, node)));
      }
    }

    placed.push({ owner, origin, defId: def.id, rotation: p.rotation, nodeKey });
  }

  // --- 2. Adjacent modules touch pad to pad -----------------------------------------------
  for (const key of [...contactKeys]) {
    const [cellPart, edgePart] = key.split(':') as [string, Pin];
    const [col, row] = cellPart.split(',').map(Number) as [number, number];
    const other = neighbour({ col, row }, edgePart);
    if (!other) continue;
    const there = contactKey(other, FACING[edgePart]);
    if (contactKeys.has(there)) uf.union(key, there);
  }

  // --- 3. Internal ideal links -------------------------------------------------------------
  for (const pl of placed) {
    const def = MODULE_BY_ID.get(pl.defId)!;
    for (const el of def.elements) {
      if (el.kind === 'link') {
        uf.union(pl.nodeKey.get(el.a)!, pl.nodeKey.get(el.b)!);
      }
    }
  }

  // --- 4. User leads -----------------------------------------------------------------------
  for (const lead of board.leads) {
    const a = contactKey(lead.from.cell, lead.from.edge);
    const b = contactKey(lead.to.cell, lead.to.edge);
    const na = panelNetAt(lead.from.cell, lead.from.edge);
    const nb = panelNetAt(lead.to.cell, lead.to.edge);
    if (na) uf.union(a, na);
    if (nb) uf.union(b, nb);
    uf.union(a, b);
  }

  // --- 5. Emit module elements --------------------------------------------------------------
  let seq = 0;
  let antenna: Netlist['antenna'] = null;

  for (const pl of placed) {
    const def = MODULE_BY_ID.get(pl.defId)!;
    const net = (node: ModuleNode): NetId => uf.find(pl.nodeKey.get(node)!);

    for (const el of def.elements) {
      const name = `${def.id}@${pl.owner}#${seq++}`;
      switch (el.kind) {
        case 'resistor':
          elements.push({ kind: 'R', name, a: net(el.a), b: net(el.b), ohms: el.ohms });
          break;
        case 'capacitor':
        case 'electrolytic':
          elements.push({ kind: 'C', name, a: net(el.a), b: net(el.b), farads: el.farads });
          break;
        case 'inductor':
          elements.push({
            kind: 'L', name, a: net(el.a), b: net(el.b), henries: el.henries, esr: el.esr,
          });
          break;
        case 'diode':
          elements.push({
            kind: 'D', name, anode: net(el.anode), cathode: net(el.cathode), model: el.model,
          });
          break;
        case 'bjt':
          elements.push({
            kind: 'Q',
            name,
            base: net(el.base),
            collector: net(el.collector),
            emitter: net(el.emitter),
            model: el.model,
          });
          break;
        case 'button':
          elements.push({
            kind: 'R',
            name,
            a: net(el.a),
            b: net(el.b),
            ohms: board.controls.buttonDown ? 0.01 : 1e12,
          });
          break;
        case 'emf':
          elements.push({ kind: 'V', name: el.name, p: net(el.p), n: net(el.n), volts: 0 });
          break;
        case 'link':
          break; // already merged in step 3
      }
    }

    if (def.id === 'ant') {
      antenna = { tuned: [net('W'), net('E')], coupling: [net('#l2'), net('E')] };
    }
  }

  // --- 6. Built-in amplifier, battery, controls (Приложение 3) -------------------------------
  addBuiltIn(elements, board);

  const contactNet = new Map<string, NetId>();
  for (const key of contactKeys) contactNet.set(key, uf.find(key));

  return {
    elements,
    nets: [...new Set(elements.flatMap(elementNets))],
    ground: uf.find(FIXED_NETS.GND),
    speaker: { p: 'SPK', n: uf.find(FIXED_NETS.GND) },
    contactNet,
    antenna,
  };
}

function elementNodes(el: Element): ModuleNode[] {
  switch (el.kind) {
    case 'resistor':
    case 'capacitor':
    case 'electrolytic':
    case 'inductor':
    case 'link':
    case 'button':
      return [el.a, el.b];
    case 'emf':
      return [el.p, el.n];
    case 'diode':
      return [el.anode, el.cathode];
    case 'bjt':
      return [el.base, el.collector, el.emitter];
  }
}

function elementNets(el: NlElement): NetId[] {
  switch (el.kind) {
    case 'R':
    case 'C':
    case 'L':
      return [el.a, el.b];
    case 'D':
      return [el.anode, el.cathode];
    case 'Q':
      return [el.base, el.collector, el.emitter];
    case 'V':
      return [el.p, el.n];
    case 'A':
      return [el.p, el.n, el.cp, el.cn];
  }
}

/**
 * The five-transistor low-frequency amplifier inside the case, plus the battery, the volume
 * potentiometer, the power switch and the tuning capacitor. Values from SPEC.md §5.2.
 */
function addBuiltIn(elements: NlElement[], board: Board): void {
  const G = FIXED_NETS.GND;
  const V = FIXED_NETS.VCC;
  const on = powerOn(board.controls);

  const R = (name: string, a: string, b: string, ohms: number): void => {
    elements.push({ kind: 'R', name, a, b, ohms });
  };
  const C = (name: string, a: string, b: string, farads: number): void => {
    elements.push({ kind: 'C', name, a, b, farads });
  };

  // Battery and the power switch, which is ganged with the volume control.
  elements.push({ kind: 'V', name: 'GB1', p: FIXED_NETS.BATT_P, n: G, volts: 8.7 });
  R('SW1', FIXED_NETS.BATT_P, V, on ? 0.05 : 1e12);
  C('C2', V, G, 0.022e-6);
  C('C9', V, G, 0.022e-6);

  // Tuning capacitor C10 across XT5 and XT6.
  C('C10', FIXED_NETS.C10_A, FIXED_NETS.C10_B, c10Farads(board.controls.tuning));

  // Input network exactly as drawn: XT4 -> R1 -> the volume pot, with C1 and C3 shunting
  // radio frequencies to ground, then C5 coupling into the amplifier proper.
  const IN = FIXED_NETS.AMP_IN;
  R('R1', IN, 'A_R1', 1.5e3);
  C('C1', IN, G, 0.01e-6);
  C('C3', 'A_R1', G, 0.01e-6);
  const wiper = Math.min(Math.max(board.controls.volume, 0), 1);
  R('R2a', 'A_R1', 'A_W', Math.max(6.8e3 * (1 - wiper), 1));
  R('R2b', 'A_W', G, Math.max(6.8e3 * wiper, 1));
  C('C5', 'A_W', 'A_IN', 20e-6);
  // The amplifier's own input impedance.
  R('RIN', 'A_IN', G, 3.3e3);

  // The five-transistor amplifier itself is a sealed block inside the case, drawn as the
  // dashed box "A" in every device schematic of the manual. Modelled by its behaviour rather
  // than transistor by transistor — see SPEC.md 5.3.
  elements.push({
    kind: 'A',
    name: 'A1',
    p: 'A_OUT',
    n: G,
    cp: 'A_IN',
    cn: G,
    gain: on ? 260 : 0,
    clip: 3.6,
    rout: 1.5,
  });
  C('C8', 'A_OUT', 'SPK', 100e-6);
  R('BA1', 'SPK', G, 8);
}
