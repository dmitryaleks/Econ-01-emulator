import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board.js';
import { CATALOGUE, CUBE_COUNT, MODULE_BY_ID } from '../src/model/catalogue.js';
import { ANTENNA_ROW, FIXED_NETS, XT_NETS } from '../src/model/panel.js';
import { PINS, rotatePin, sitesOf } from '../src/model/types.js';
import { buildNetlist, contactKey } from '../src/netlist/build.js';

describe('catalogue', () => {
  it('holds exactly the 36 cube modules the manual lists', () => {
    expect(CUBE_COUNT).toBe(36);
  });

  it('has a unique id per entry', () => {
    const ids = CATALOGUE.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares every element node as a contact or an internal node', () => {
    for (const def of [...CATALOGUE, MODULE_BY_ID.get('ant')!]) {
      const sites = new Set(sitesOf(def).map((s) => s.node));
      for (const el of def.elements) {
        const nodes = Object.entries(el)
          .filter(([k]) => ['a', 'b', 'anode', 'cathode', 'base', 'collector', 'emitter'].includes(k))
          .map(([, v]) => v as string);
        for (const n of nodes) {
          const internal = n.startsWith('#');
          expect(internal || sites.has(n as never)).toBe(true);
        }
      }
    }
  });
});

describe('rotation', () => {
  it('permutes pins cyclically', () => {
    expect(PINS.map((p) => rotatePin(p, 1))).toEqual(['E', 'S', 'W', 'N']);
    expect(PINS.map((p) => rotatePin(p, 2))).toEqual(['S', 'W', 'N', 'E']);
    for (const p of PINS) expect(rotatePin(p, 0)).toBe(p);
  });
});

describe('netlist assembly', () => {
  it('merges two adjacent line links into one net', () => {
    const board = new Board();
    board.place('j-liniya', { col: 2, row: 2 });
    board.place('j-liniya', { col: 3, row: 2 });
    const net = buildNetlist(board);

    const left = net.contactNet.get(contactKey({ col: 2, row: 2 }, 'E'));
    const right = net.contactNet.get(contactKey({ col: 3, row: 2 }, 'W'));
    const farLeft = net.contactNet.get(contactKey({ col: 2, row: 2 }, 'W'));
    const farRight = net.contactNet.get(contactKey({ col: 3, row: 2 }, 'E'));

    expect(left).toBeDefined();
    expect(left).toBe(right);
    // Both links pass straight through, so all four contacts are the same net.
    expect(farLeft).toBe(farRight);
    expect(farLeft).toBe(left);
  });

  it('keeps the two paths of a bridge link separate', () => {
    const board = new Board();
    board.place('j-mostik', { col: 2, row: 2 });
    const net = buildNetlist(board);
    const we = net.contactNet.get(contactKey({ col: 2, row: 2 }, 'W'));
    const ns = net.contactNet.get(contactKey({ col: 2, row: 2 }, 'N'));
    expect(we).toBeDefined();
    expect(ns).toBeDefined();
    expect(we).not.toBe(ns);
    expect(we).toBe(net.contactNet.get(contactKey({ col: 2, row: 2 }, 'E')));
    expect(ns).toBe(net.contactNet.get(contactKey({ col: 2, row: 2 }, 'S')));
  });

  it('joins all four faces of a cross link', () => {
    const board = new Board();
    board.place('j-krest', { col: 1, row: 1 });
    const net = buildNetlist(board);
    const nets = PINS.map((p) => net.contactNet.get(contactKey({ col: 1, row: 1 }, p)));
    expect(new Set(nets).size).toBe(1);
  });

  it('gives the blank filler no contacts at all', () => {
    const board = new Board();
    board.place('j-shchel', { col: 1, row: 1 });
    const net = buildNetlist(board);
    for (const p of PINS) {
      expect(net.contactNet.get(contactKey({ col: 1, row: 1 }, p))).toBeUndefined();
    }
  });

  it('binds a left-column contact to its XT terminal', () => {
    const board = new Board();
    // Row 0 -> XT1 -> GND.
    board.place('j-liniya', { col: 0, row: 0 });
    const net = buildNetlist(board);
    const west = net.contactNet.get(contactKey({ col: 0, row: 0 }, 'W'));
    expect(west).toBe(net.ground);
    expect(XT_NETS[0]).toBe(FIXED_NETS.GND);
  });

  it('rotation changes which faces a resistor reaches', () => {
    const a = new Board();
    a.place('r68k-o', { col: 2, row: 2 }, 0); // W-E
    const na = buildNetlist(a);
    expect(na.contactNet.has(contactKey({ col: 2, row: 2 }, 'W'))).toBe(true);
    expect(na.contactNet.has(contactKey({ col: 2, row: 2 }, 'N'))).toBe(false);

    const b = new Board();
    b.place('r68k-o', { col: 2, row: 2 }, 1); // rotated a quarter turn -> N-S
    const nb = buildNetlist(b);
    expect(nb.contactNet.has(contactKey({ col: 2, row: 2 }, 'N'))).toBe(true);
    expect(nb.contactNet.has(contactKey({ col: 2, row: 2 }, 'W'))).toBe(false);
  });

  it('always includes the built-in amplifier and battery', () => {
    const net = buildNetlist(new Board());
    const names = net.elements.map((e) => e.name);
    expect(names).toContain('GB1');
    expect(names).toContain('BA1');
    expect(names).toContain('C10');
    expect(names).toContain('A1');
    expect(net.elements.filter((e) => e.kind === 'A')).toHaveLength(1);
  });

  it('places the antenna only in its slot, and reports its windings', () => {
    const board = new Board();
    expect(board.place('ant', { col: 0, row: 2 })).toBe(false);
    expect(board.place('ant', { col: 0, row: ANTENNA_ROW })).toBe(true);
    const net = buildNetlist(board);
    expect(net.antenna).not.toBeNull();
    expect(net.elements.filter((e) => e.kind === 'L')).toHaveLength(3);
    // The west end of the bar sits on XT6, one side of the tuning capacitor.
    expect(net.antenna!.tuned[0]).toBe(FIXED_NETS.C10_B);
  });
});

describe('board bookkeeping', () => {
  it('runs out of a module type once the kit is exhausted', () => {
    const board = new Board();
    let placed = 0;
    for (let col = 0; col < 6 && placed < 6; col++) {
      if (board.place('j-liniya', { col, row: 0 })) placed++;
    }
    // The kit contains four «Линия» links.
    expect(placed).toBe(4);
    expect(board.remaining('j-liniya')).toBe(0);
  });

  it('round-trips through the URL serialisation', () => {
    const board = new Board();
    board.place('r68k-o', { col: 1, row: 1 }, 2);
    board.place('q315-a', { col: 3, row: 4 }, 1);
    board.controls.volume = 0.6;
    const restored = Board.deserialise(board.serialise());
    expect(restored.placements.size).toBe(2);
    expect(restored.placements.get('1,1')).toEqual({ moduleId: 'r68k-o', rotation: 2 });
    expect(restored.controls.volume).toBeCloseTo(0.6, 5);
  });
});
