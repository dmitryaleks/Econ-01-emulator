/**
 * Turn a board into a netlist.
 *
 * Contacts of orthogonally adjacent modules touch pad to pad; that, plus the seven right-edge
 * terminals, the strip along the top edge and the two supplied leads, is the whole wiring
 * mechanism (SPEC.md §3.1, §5.1).
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
  type EmfEl,
  type InductorEl,
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
export type NlElement =
  | NlResistor | NlCapacitor | NlInductor | NlDiode | NlBjt | NlVSource;

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

    if (def.shape === 'antenna') antenna = antennaTerminals(def.elements, net);
  }

  // --- 6. Built-in amplifier, battery, controls (Приложение 3) -------------------------------
  // Terminals the field may have shorted together share one net, so resolve names through the
  // same union-find the field used.
  addBuiltIn(elements, board, (name) => uf.find(name));

  const contactNet = new Map<string, NetId>();
  for (const key of contactKeys) contactNet.set(key, uf.find(key));

  return {
    elements,
    nets: [...new Set(elements.flatMap(elementNets))],
    ground: uf.find(FIXED_NETS.GND),
    speaker: { p: uf.find(FIXED_NETS.SPK), n: uf.find(FIXED_NETS.GND) },
    contactNet,
    antenna,
  };
}

/**
 * The tuned winding runs from the first L1 section's start to the last one's end; the coupling
 * winding is L2 together with the EMF source in series with it.
 */
function antennaTerminals(
  els: Element[],
  net: (node: ModuleNode) => NetId,
): NonNullable<Netlist['antenna']> {
  const l1 = els.filter((e): e is InductorEl => e.kind === 'inductor' && e.winding === 'L1');
  const l2 = els.find((e): e is InductorEl => e.kind === 'inductor' && e.winding === 'L2')!;
  const emf = els.find((e): e is EmfEl => e.kind === 'emf')!;
  return {
    tuned: [net(l1[0]!.a), net(l1.at(-1)!.b)],
    coupling: [net(l2.a), net(emf.n)],
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
  }
}

/**
 * Everything inside the case, transistor by transistor as drawn in Приложение 3
 * (`assets/core/core-schematics.png`): the battery and the power switch ganged with the volume
 * control, R3 and its decoupling that feed XT3, the tuning capacitor C10, the input network
 * behind XT4, the five-transistor amplifier and the loudspeaker. Values from SPEC.md §5.2.
 */
function addBuiltIn(elements: NlElement[], board: Board, net: (name: string) => NetId): void {
  const G = FIXED_NETS.GND;
  const on = powerOn(board.controls);

  const R = (name: string, a: string, b: string, ohms: number): void => {
    elements.push({ kind: 'R', name, a: net(a), b: net(b), ohms });
  };
  const C = (name: string, a: string, b: string, farads: number): void => {
    elements.push({ kind: 'C', name, a: net(a), b: net(b), farads });
  };
  const Q = (name: string, model: string, base: string, collector: string, emitter: string) => {
    elements.push({
      kind: 'Q', name, base: net(base), collector: net(collector), emitter: net(emitter), model,
    });
  };

  // Battery, and the switched rail the amplifier runs from.
  const RAIL = 'A_RAIL';
  elements.push({ kind: 'V', name: 'GB1', p: net(FIXED_NETS.BATT_P), n: net(G), volts: 8.7 });
  R('SW1', FIXED_NETS.BATT_P, RAIL, on ? 0.05 : 1e12);

  // XT3 is not the rail itself: R3 limits what the field can draw, C4 and C2 decouple it.
  const V = FIXED_NETS.VCC;
  R('R3', RAIL, V, 820);
  C('C4', V, G, 50e-6);
  C('C2', V, G, 0.022e-6);

  // Tuning capacitor C10 across XT5 and XT6.
  C('C10', FIXED_NETS.C10_A, FIXED_NETS.C10_B, c10Farads(board.controls.tuning));

  // Input network: XT4 -> R1 -> the volume pot, with C1 and C3 shunting radio frequencies to
  // ground, then C5 coupling into the base of VT1.
  const IN = FIXED_NETS.AMP_IN;
  R('R1', IN, 'A_R1', 1.5e3);
  C('C1', IN, G, 0.01e-6);
  C('C3', 'A_R1', G, 0.01e-6);
  const wiper = Math.min(Math.max(board.controls.volume, 0), 1);
  R('R2a', 'A_R1', 'A_W', Math.max(6.8e3 * (1 - wiper), 1));
  R('R2b', 'A_W', G, Math.max(6.8e3 * wiper, 1));
  C('C5', 'A_W', 'A_B1', 20e-6);

  // VT1: first stage, fed through the R6/C6 filter; R4 and R5 set its base from VT2's emitter.
  R('R6', RAIL, 'A_F', 220);
  C('C6', 'A_F', G, 50e-6);
  R('R7', 'A_F', 'A_C1', 3.3e3);
  Q('VT1', 'KT315B', 'A_B1', 'A_C1', 'A_E1');
  R('R8', 'A_E1', G, 470);
  R('R4', 'A_B1', G, 10e3);
  R('R5', 'A_B1', 'A_N1', 30e3);

  // VT2: second stage. Its emitter is bypassed by C7 and R10, and R11 closes the DC loop
  // from the output midpoint.
  Q('VT2', 'KT315B', 'A_C1', 'A_C2', 'A_N1');
  R('R9', RAIL, 'A_C2', 4.7e3);
  C('C7', 'A_N1', 'A_X7', 50e-6);
  R('R10', 'A_X7', G, 30);
  R('R11', 'A_N1', 'A_M', 1.8e3);

  // VT3 drives the complementary emitter followers VT4 and VT5; R12 spreads their bases, R13
  // bootstraps the driver's load from the loudspeaker side of C8, and C9 rolls off the top.
  Q('VT3', 'MP26A', 'A_C2', 'A_D3', RAIL);
  Q('VT4', 'MP38', 'A_D3', RAIL, 'A_M');
  R('R12', 'A_D3', 'A_Q', 30);
  Q('VT5', 'MP42B', 'A_Q', G, 'A_M');
  R('R13', 'A_Q', FIXED_NETS.SPK, 820);
  C('C9', RAIL, 'A_Q', 0.022e-6);

  // Output capacitor and loudspeaker; the loudspeaker's live side is XT7.
  C('C8', 'A_M', FIXED_NETS.SPK, 100e-6);
  R('BA1', FIXED_NETS.SPK, G, 8);
}
