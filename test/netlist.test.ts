import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board.js';
import { ALL_MODULES, CATALOGUE, CUBE_COUNT } from '../src/model/catalogue.js';
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
    for (const def of ALL_MODULES) {
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
    board.place('block_023', { col: 2, row: 2 }); // «Линия»
    board.place('block_023', { col: 3, row: 2 });
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
    board.place('block_025', { col: 2, row: 2 }); // «Мостик»
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
    board.place('block_021', { col: 1, row: 1 }); // «Крест»
    const net = buildNetlist(board);
    const nets = PINS.map((p) => net.contactNet.get(contactKey({ col: 1, row: 1 }, p)));
    expect(new Set(nets).size).toBe(1);
  });

  it('gives «Щель» two separate corner links, not a blank', () => {
    const board = new Board();
    board.place('block_022', { col: 1, row: 1 });
    const net = buildNetlist(board);
    const at = (p: (typeof PINS)[number]) => net.contactNet.get(contactKey({ col: 1, row: 1 }, p));
    expect(at('N')).toBeDefined();
    expect(at('N')).toBe(at('W'));
    expect(at('E')).toBe(at('S'));
    expect(at('N')).not.toBe(at('E'));
  });

  it('binds a right-column contact to its XT terminal, and a left-column one to nothing', () => {
    const board = new Board();
    // Row 0, right edge -> XT1 -> GND.
    board.place('block_023', { col: 5, row: 0 });
    board.place('block_023', { col: 0, row: 3 });
    const net = buildNetlist(board);
    expect(net.contactNet.get(contactKey({ col: 5, row: 0 }, 'E'))).toBe(net.ground);
    expect(XT_NETS[0]).toBe(FIXED_NETS.GND);
    const west = net.contactNet.get(contactKey({ col: 0, row: 3 }, 'W'));
    expect(Object.values(FIXED_NETS)).not.toContain(west);
  });

  it('joins the contacts along the top edge, but not to ground', () => {
    const board = new Board();
    board.place('block_023', { col: 0, row: 0 }, 1); // «Линия» turned N-S
    board.place('block_023', { col: 4, row: 0 }, 1);
    const net = buildNetlist(board);
    const left = net.contactNet.get(contactKey({ col: 0, row: 0 }, 'N'));
    expect(left).toBe(net.contactNet.get(contactKey({ col: 4, row: 0 }, 'N')));
    expect(left).not.toBe(net.ground);
  });

  it('rotation changes which faces a module reaches', () => {
    const a = new Board();
    a.place('block_023', { col: 2, row: 2 }, 0); // «Линия», W-E
    const na = buildNetlist(a);
    expect(na.contactNet.has(contactKey({ col: 2, row: 2 }, 'W'))).toBe(true);
    expect(na.contactNet.has(contactKey({ col: 2, row: 2 }, 'N'))).toBe(false);

    const b = new Board();
    b.place('block_023', { col: 2, row: 2 }, 1); // rotated a quarter turn -> N-S
    const nb = buildNetlist(b);
    expect(nb.contactNet.has(contactKey({ col: 2, row: 2 }, 'N'))).toBe(true);
    expect(nb.contactNet.has(contactKey({ col: 2, row: 2 }, 'W'))).toBe(false);
  });

  it('always includes the battery and the five-transistor amplifier of Приложение 3', () => {
    const net = buildNetlist(new Board());
    const names = net.elements.map((e) => e.name);
    for (const n of ['GB1', 'SW1', 'R3', 'C4', 'C10', 'C8', 'BA1']) expect(names).toContain(n);
    const models = Object.fromEntries(
      net.elements.flatMap((e) => (e.kind === 'Q' ? [[e.name, e.model]] : [])),
    );
    expect(models).toEqual({
      VT1: 'KT315B', VT2: 'KT315B', VT3: 'MP26A', VT4: 'MP38', VT5: 'MP42B',
    });
  });

  it('wires XT2 to nothing, XT3 behind R3 and XT7 to the loudspeaker', () => {
    const board = new Board();
    for (const row of [1, 2, 6]) board.place('block_023', { col: 5, row }); // «Линия»
    const net = buildNetlist(board);
    const east = (row: number) => net.contactNet.get(contactKey({ col: 5, row }, 'E'));
    expect(Object.values(FIXED_NETS)).not.toContain(east(1));
    expect(east(2)).toBe(FIXED_NETS.VCC);
    expect(east(6)).toBe(net.speaker.p);
    const r3 = net.elements.find((e) => e.name === 'R3');
    expect(r3?.kind === 'R' && [r3.a, r3.b].includes(FIXED_NETS.VCC) && r3.ohms).toBe(820);
  });

  it('keeps a short between two terminals when the field makes one', () => {
    const board = new Board();
    // A «Линия» turned N-S joins XT7 (right of the bottom row) to nothing; instead short XT3 to
    // XT1 with a lead and check the amplifier's own parts see the same merged net.
    board.leads.push({
      from: { cell: { col: 5, row: 2 }, edge: 'E' },
      to: { cell: { col: 5, row: 0 }, edge: 'E' },
    });
    const net = buildNetlist(board);
    const r3 = net.elements.find((e) => e.name === 'R3');
    const c4 = net.elements.find((e) => e.name === 'C4');
    expect(r3?.kind === 'R' && c4?.kind === 'C').toBe(true);
    if (r3?.kind !== 'R' || c4?.kind !== 'C') return;
    // C4 sat between XT3 and ground; with the two shorted it has both ends on one net.
    expect(c4.a).toBe(c4.b);
    expect([r3.a, r3.b]).toContain(net.ground);
  });

  it('places the antenna only in its slot, and reports its windings', () => {
    const board = new Board();
    expect(board.place('block_019', { col: 0, row: 2 })).toBe(false);
    expect(board.place('block_019', { col: 0, row: ANTENNA_ROW })).toBe(true);
    const net = buildNetlist(board);
    expect(net.antenna).not.toBeNull();
    expect(net.elements.filter((e) => e.kind === 'L')).toHaveLength(3);
    const north = (col: number) => net.contactNet.get(contactKey({ col, row: ANTENNA_ROW }, 'N'));
    // L1 runs from N2 (joined to N5) to the east end; L2 sits on N3 and N4, apart from L1.
    expect(net.antenna!.tuned).toEqual([
      north(1),
      net.contactNet.get(contactKey({ col: 5, row: ANTENNA_ROW }, 'E')),
    ]);
    expect(north(1)).toBe(north(4));
    expect(net.antenna!.coupling).toEqual([north(2), north(3)]);
    // Nothing reaches the west end, so the bar alone touches no panel terminal.
    expect(net.contactNet.has(contactKey({ col: 0, row: ANTENNA_ROW }, 'W'))).toBe(false);
  });
});

describe('board bookkeeping', () => {
  it('runs out of a module type once the kit is exhausted', () => {
    const board = new Board();
    let placed = 0;
    for (let col = 0; col < 6 && placed < 6; col++) {
      if (board.place('block_023', { col, row: 0 })) placed++;
    }
    // The kit contains four «Линия» links.
    expect(placed).toBe(4);
    expect(board.remaining('block_023')).toBe(0);
  });

  it('round-trips through the URL serialisation', () => {
    const board = new Board();
    board.place('block_003', { col: 1, row: 1 }, 2);
    board.place('block_017', { col: 3, row: 4 }, 1);
    board.controls.volume = 0.6;
    const restored = Board.deserialise(board.serialise());
    expect(restored.placements.size).toBe(2);
    expect(restored.placements.get('1,1')).toEqual({ moduleId: 'block_003', rotation: 2 });
    expect(restored.controls.volume).toBeCloseTo(0.6, 5);
  });
});
