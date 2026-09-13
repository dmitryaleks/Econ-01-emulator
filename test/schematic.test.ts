import { describe, expect, it } from 'vitest';
import { DEVICE_27, DEVICE_9, loadCircuit, type Circuit } from '../src/circuits/index.js';
import { Board } from '../src/model/board.js';
import { buildNetlist } from '../src/netlist/build.js';
import { matchSchematic, type Schematic } from './schematic.js';

function netlistOf(circuit: Circuit) {
  const board = new Board();
  loadCircuit(board, circuit);
  return buildNetlist(board);
}

describe('the schematic matcher', () => {
  it('accepts device 9 against its schematic', () => {
    const netlist = netlistOf(DEVICE_9);
    const schematic: Schematic = {
      fixed: { GND: netlist.ground, VCC: 'VCC', OUT: 'AMP_IN' },
      parts: [
        { kind: 'Q', b: 'B1', c: 'P', e: 'E1' },
        { kind: 'Q', b: 'B2', c: 'C2', e: 'GND' },
        { kind: 'R', ohms: 68e3, a: 'VCC', b: 'P' },
        { kind: 'R', ohms: 680e3, a: 'P', b: 'B1' },
        { kind: 'C', farads: 0.01e-6, a: 'P', b: 'B1' },
        { kind: 'R', ohms: 2.2e3, a: 'E1', b: 'K' },
        { kind: 'key', a: 'K', b: 'GND' },
        { kind: 'C', farads: 680e-12, a: 'P', b: 'B2' },
        { kind: 'R', ohms: 1e6, a: 'VCC', b: 'B2' },
        { kind: 'R', ohms: 2.2e3, a: 'VCC', b: 'C2' },
        { kind: 'C', farads: 0.01e-6, a: 'C2', b: 'B1' },
        { kind: 'C', farads: 3300e-12, a: 'C2', b: 'OUT' },
        { kind: 'C', farads: 20e-6, a: 'VCC', b: 'GND', polar: true },
      ],
    };
    expect(matchSchematic(netlist, schematic)).toEqual([]);
  });

  it('rejects device 9 with a part moved', () => {
    const netlist = netlistOf(DEVICE_9);
    const schematic: Schematic = {
      fixed: { GND: netlist.ground, VCC: 'VCC', OUT: 'AMP_IN' },
      parts: [
        { kind: 'Q', b: 'B1', c: 'P', e: 'E1' },
        { kind: 'Q', b: 'B2', c: 'C2', e: 'GND' },
        { kind: 'R', ohms: 68e3, a: 'VCC', b: 'B2' },
      ],
    };
    expect(matchSchematic(netlist, schematic)).not.toEqual([]);
  });

  it('accepts device 27 with its antenna', () => {
    const netlist = netlistOf(DEVICE_27);
    const schematic: Schematic = {
      fixed: { GND: netlist.ground, VCC: 'VCC', OUT: 'AMP_IN' },
      parts: [
        { kind: 'antenna', top: 'T', tap: 'X', end: 'Y', l2a: 'M', l2b: 'E' },
        { kind: 'Q', b: 'B', c: 'X', e: 'E' },
        { kind: 'R', ohms: 12e3, a: 'VCC', b: 'T' },
        { kind: 'C', farads: 0.01e-6, a: 'T', b: 'OUT' },
        { kind: 'R', ohms: 1e6, a: 'VCC', b: 'N1' },
        { kind: 'R', ohms: 1e6, a: 'N1', b: 'N2' },
        { kind: 'R', ohms: 680e3, a: 'N2', b: 'B' },
        { kind: 'C', farads: 680e-12, a: 'B', b: 'M' },
        { kind: 'R', ohms: 68e3, a: 'M', b: 'GND' },
        { kind: 'C', farads: 3300e-12, a: 'M', b: 'GND' },
        { kind: 'key', a: 'M', b: 'GND' },
        { kind: 'C', farads: 20e-6, a: 'VCC', b: 'GND', polar: true },
      ],
    };
    expect(matchSchematic(netlist, schematic)).toEqual([]);
  });
});
