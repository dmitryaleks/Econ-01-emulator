/**
 * Check a board's netlist against a device's schematic written as parts between named nodes.
 *
 * The factory layouts carry spare modules and route wires through resistors and capacitors, so
 * the check is a search: find an assignment of the schematic's nodes to nets under which every
 * schematic part is a distinct module element, and no module element left over bridges two of
 * the schematic's nodes. Nodes named in `fixed` are pinned to those nets.
 */

import { windingSection } from '../src/model/antenna.js';
import type { Netlist, NlElement } from '../src/netlist/build.js';

export type Part =
  | { kind: 'R'; ohms: number; a: string; b: string }
  /** `polar`: a is the + terminal. */
  | { kind: 'C'; farads: number; a: string; b: string; polar?: boolean }
  | { kind: 'Q'; b: string; c: string; e: string }
  | { kind: 'D'; anode: string; cathode: string }
  /** The кнопка, open or closed. */
  | { kind: 'key'; a: string; b: string }
  /**
   * The magnetic antenna: L1 from `top` through its tap to `end`, and L2, with the induced EMF in
   * series, from `l2a` to `l2b`.
   */
  | { kind: 'antenna'; top: string; tap: string; end: string; l2a: string; l2b: string };

export interface Schematic {
  parts: Part[];
  /** Nodes that are particular nets: ground, the supply, panel terminals. */
  fixed: Record<string, string>;
}

type Pairs = Array<[node: string, net: string]>;
type Candidate = { el: NlElement | null; pairs: Pairs };

/** Problems found; empty when the netlist is the schematic plus harmless spares. */
export function matchSchematic(netlist: Netlist, schematic: Schematic): string[] {
  const modules = netlist.elements.filter((e) => e.name.includes('@') && e.kind !== 'K');
  const nodeToNet = new Map<string, string>();
  const netToNode = new Map<string, string>();
  for (const [node, net] of Object.entries(schematic.fixed)) {
    nodeToNet.set(node, net);
    netToNode.set(net, node);
  }
  const used = new Set<NlElement>();
  // The antenna's windings are matched as one part.
  if (schematic.parts.some((p) => p.kind === 'antenna')) {
    for (const el of modules) if (el.kind === 'L') used.add(el);
  }

  const candidates = (part: Part): Candidate[] => {
    const out: Candidate[] = [];
    const both = (
      el: NlElement, a: string, b: string, p: { a: string; b: string }, polar = false,
    ): void => {
      out.push({ el, pairs: [[p.a, a], [p.b, b]] });
      if (!polar) out.push({ el, pairs: [[p.a, b], [p.b, a]] });
    };
    if (part.kind === 'antenna') {
      const ant = netlist.antenna;
      const start = netlist.elements.find(
        (e) => e.kind === 'L' && e.henries === windingSection(100).henries,
      );
      if (ant && start?.kind === 'L') {
        out.push({
          el: null,
          pairs: [
            [part.top, ant.tuned[0]], [part.tap, start.b], [part.end, ant.tuned[1]],
            [part.l2a, ant.coupling[0]], [part.l2b, ant.coupling[1]],
          ],
        });
      }
      return out;
    }
    for (const el of modules) {
      if (used.has(el)) continue;
      const key = el.name.startsWith('block_026@');
      if (part.kind === 'R' && el.kind === 'R' && !key && el.ohms === part.ohms) {
        both(el, el.a, el.b, part);
      } else if (part.kind === 'C' && el.kind === 'C' && el.farads === part.farads) {
        both(el, el.a, el.b, part, part.polar);
      } else if (part.kind === 'key' && el.kind === 'R' && key) {
        both(el, el.a, el.b, part);
      } else if (part.kind === 'Q' && el.kind === 'Q') {
        out.push({ el, pairs: [[part.b, el.base], [part.c, el.collector], [part.e, el.emitter]] });
      } else if (part.kind === 'D' && el.kind === 'D') {
        out.push({ el, pairs: [[part.anode, el.anode], [part.cathode, el.cathode]] });
      }
    }
    return out;
  };

  const unbind = (added: Pairs): void => {
    for (const [node, net] of added) {
      nodeToNet.delete(node);
      netToNode.delete(net);
    }
  };
  const bind = (pairs: Pairs): Pairs | null => {
    const added: Pairs = [];
    for (const [node, net] of pairs) {
      const was = nodeToNet.get(node);
      if (was === net) continue;
      if (was !== undefined || netToNode.has(net)) {
        unbind(added);
        return null;
      }
      nodeToNet.set(node, net);
      netToNode.set(net, node);
      added.push([node, net]);
    }
    return added;
  };

  // Most constrained parts first: the antenna and transistors pin several nodes at once.
  const order = [...schematic.parts].sort((p, q) => weight(q) - weight(p));
  let deepest = 0;
  let leftoverBridges: string[] = [];
  const search = (i: number): boolean => {
    deepest = Math.max(deepest, i);
    if (i === order.length) {
      leftoverBridges = bridges();
      return leftoverBridges.length === 0;
    }
    for (const cand of candidates(order[i]!)) {
      const added = bind(cand.pairs);
      if (!added) continue;
      if (cand.el) used.add(cand.el);
      if (search(i + 1)) return true;
      if (cand.el) used.delete(cand.el);
      unbind(added);
    }
    return false;
  };

  /** Groups of schematic nodes joined through leftover module elements. */
  const bridges = (): string[] => {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)!;
      return x;
    };
    const leftovers = modules.filter((e) => !used.has(e));
    for (const el of leftovers) {
      const ts = terminals(el);
      for (let k = 1; k < ts.length; k++) {
        const [a, b] = [find(ts[0]!), find(ts[k]!)];
        if (a !== b) parent.set(a, b);
      }
    }
    const reach = new Map<string, Set<string>>();
    for (const el of leftovers) {
      for (const t of terminals(el)) {
        const node = netToNode.get(t);
        if (node === undefined) continue;
        const root = find(t);
        if (!reach.has(root)) reach.set(root, new Set());
        reach.get(root)!.add(node);
      }
    }
    return [...reach.values()].filter((s) => s.size > 1).map((s) => [...s].join(' ~ '));
  };

  if (search(0)) return [];
  const stuck = order[deepest];
  if (!stuck) return [`every part fits, but leftover modules bridge ${leftoverBridges.join(', ')}`];
  return [`matched ${deepest} of ${order.length} parts; nothing fits ${JSON.stringify(stuck)}`];
}

function weight(p: Part): number {
  switch (p.kind) {
    case 'antenna': return 5;
    case 'Q': return 3;
    case 'key': return 2;
    default: return 1;
  }
}

function terminals(el: NlElement): string[] {
  switch (el.kind) {
    case 'R': case 'C': case 'L': return [el.a, el.b];
    case 'D': return [el.anode, el.cathode];
    case 'Q': return [el.base, el.collector, el.emitter];
    case 'V': return [el.p, el.n];
    default: return [];
  }
}
