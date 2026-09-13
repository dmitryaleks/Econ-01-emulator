/**
 * Schematic symbols embossed on the module tops, drawn from each module's actual wiring the way
 * the icons of Приложение 2 draw it: a part between opposite faces runs straight through the
 * middle, a part or wire between adjacent faces is a chord across the corner, and a line that
 * crosses another without joining it humps around the crossing.
 *
 * A cube symbol lives in a unit square centred on the origin, spanning -1..1, so the caller
 * decides size and rotation. Faces sit at (0,-1) N, (1,0) E, (0,1) S, (-1,0) W.
 */

import { PINS, oppositePin, type Element, type ModuleDef, type Pin } from '../model/types.js';

const LEAD = 0.92;

const AT: Record<Pin, readonly [number, number]> = {
  N: [0, -LEAD],
  E: [LEAD, 0],
  S: [0, LEAD],
  W: [-LEAD, 0],
};

/**
 * The antenna bar is drawn in the same units, with the caller scaling by the height of the
 * antenna slot (panel-canvas passes 0.385 of it): one cell is this wide and the long edges sit
 * this far from the centre line.
 */
const ANTENNA_CELL = 2.13;
const ANTENNA_EDGE = 1.3;

type Ctx = CanvasRenderingContext2D;

function line(c: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

function dot(c: Ctx, x: number, y: number, r = 0.09): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

export function drawModuleSymbol(c: Ctx, def: ModuleDef): void {
  if (def.shape === 'antenna') return antenna(c, def);
  if (def.elements.some((e) => e.kind === 'button')) return button(c, def.elements);

  const bjt = def.elements.find((e) => e.kind === 'bjt');
  if (bjt) transistor(c, bjt.base as Pin, bjt.collector as Pin);

  const links = def.elements.filter((e) => e.kind === 'link');
  const parts = def.elements.filter((e) => e.kind !== 'link' && e.kind !== 'bjt');
  const net = linkNets(links);

  if (!bjt && parts.length === 0 && new Set(PINS.map((p) => net(p))).size < PINS.length) {
    const groups = new Map<string, Pin[]>();
    for (const l of links) for (const p of [l.a, l.b] as Pin[]) {
      const g = groups.get(net(p)) ?? [];
      if (!g.includes(p)) g.push(p);
      groups.set(net(p), g);
    }
    if (groups.size === 1) {
      // A plain link: spokes from a common centre, as «Угол», «Тройник» and «Крест» are drawn.
      const faces = [...groups.values()][0]!;
      for (const f of faces) line(c, 0, 0, AT[f][0], AT[f][1]);
      if (faces.length >= 3) dot(c, 0, 0);
      return;
    }
  }

  const straight = new Set<string>();
  for (const l of links) {
    const [a, b] = [l.a as Pin, l.b as Pin];
    if (oppositePin(a) === b) straight.add(a === 'N' || a === 'S' ? 'NS' : 'WE');
  }
  const humpNS = straight.has('NS') && straight.has('WE') && net('N') !== net('W');

  for (const l of links) {
    const [a, b] = [l.a as Pin, l.b as Pin];
    if (humpNS && (a === 'N' || a === 'S') && oppositePin(a) === b) hump(c);
    else segment(c, a, b);
  }
  if (straight.has('NS') && straight.has('WE') && !humpNS) dot(c, 0, 0);

  for (const el of parts) part(c, el);
  if (def.marker) marker(c, def.marker);
}

/**
 * The small ring that tells a module from another drawn with the same wiring but a different
 * value, placed where its icon has it. Icon coordinates put the rim at 1, the leads at LEAD.
 */
function marker(c: Ctx, m: NonNullable<ModuleDef['marker']>): void {
  const r = 0.13;
  const [x, y] = [m.at[0] * LEAD, m.at[1] * LEAD];
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  if (m.stemTo) {
    const [sx, sy] = [m.stemTo[0] * LEAD, m.stemTo[1] * LEAD];
    const d = Math.hypot(sx - x, sy - y) || 1;
    line(c, x + ((sx - x) / d) * r, y + ((sy - y) / d) * r, sx, sy);
  }
}

/** Union of faces joined by plain wire, as a face -> representative lookup. */
function linkNets(links: Element[]): (p: Pin) => string {
  const parent = new Map<Pin, Pin>(PINS.map((p) => [p, p]));
  const find = (p: Pin): Pin => {
    while (parent.get(p) !== p) p = parent.get(p)!;
    return p;
  };
  for (const l of links) if (l.kind === 'link') parent.set(find(l.a as Pin), find(l.b as Pin));
  return find;
}

function segment(c: Ctx, a: Pin, b: Pin): void {
  line(c, AT[a][0], AT[a][1], AT[b][0], AT[b][1]);
}

/** The north-south path stepping around a crossing it doesn't join. */
function hump(c: Ctx): void {
  c.beginPath();
  c.moveTo(0, -LEAD);
  c.lineTo(0, -0.22);
  c.lineTo(0.22, -0.1);
  c.lineTo(0.22, 0.1);
  c.lineTo(0, 0.22);
  c.lineTo(0, LEAD);
  c.stroke();
}

/**
 * A two-terminal part between faces a and b. Local x runs from a to b along the straight line
 * or chord, so the body sits at its middle and a diode points from anode to cathode.
 */
function part(c: Ctx, el: Element): void {
  let a: Pin;
  let b: Pin;
  switch (el.kind) {
    case 'resistor':
    case 'capacitor':
    case 'electrolytic':
    case 'inductor':
      [a, b] = [el.a as Pin, el.b as Pin];
      break;
    case 'diode':
      [a, b] = [el.anode as Pin, el.cathode as Pin];
      break;
    default:
      return;
  }
  const [x1, y1] = AT[a];
  const [x2, y2] = AT[b];
  const half = Math.hypot(x2 - x1, y2 - y1) / 2;
  // Chords are shorter than a diameter, so their bodies are drawn smaller.
  const k = half < LEAD * 0.9 ? 0.72 : 1;

  c.save();
  c.translate((x1 + x2) / 2, (y1 + y2) / 2);
  c.rotate(Math.atan2(y2 - y1, x2 - x1));
  c.scale(k, k);
  const end = half / k;

  switch (el.kind) {
    case 'resistor':
      line(c, -end, 0, -0.34, 0);
      line(c, 0.34, 0, end, 0);
      c.beginPath();
      c.rect(-0.34, -0.19, 0.68, 0.38);
      c.stroke();
      break;
    case 'capacitor':
      line(c, -end, 0, -0.09, 0);
      line(c, 0.09, 0, end, 0);
      line(c, -0.09, -0.42, -0.09, 0.42);
      line(c, 0.09, -0.42, 0.09, 0.42);
      break;
    case 'electrolytic':
      // Two straight plates, as on a plain capacitor, with the + marked beside plate a.
      line(c, -end, 0, -0.09, 0);
      line(c, 0.09, 0, end, 0);
      line(c, -0.09, -0.42, -0.09, 0.42);
      line(c, 0.09, -0.42, 0.09, 0.42);
      plus(c, -0.36, -0.36);
      break;
    case 'diode': {
      const w = 0.2;
      line(c, -end, 0, -w, 0);
      line(c, w, 0, end, 0);
      c.beginPath();
      c.moveTo(-w, -w);
      c.lineTo(-w, w);
      c.lineTo(w, 0);
      c.closePath();
      c.fill();
      line(c, w, -w, w, w);
      break;
    }
    default:
      line(c, -end, 0, end, 0);
  }
  c.restore();
}

function plus(c: Ctx, x: number, y: number): void {
  const r = 0.13;
  line(c, x - r, y, x + r, y);
  line(c, x, y - r, x, y + r);
}

/** An npn transistor with its base lead on `base` and collector on `collector`. */
function transistor(c: Ctx, base: Pin, collector: Pin): void {
  const turns = (PINS.indexOf(base) - PINS.indexOf('W') + 4) % 4;
  c.save();
  c.rotate((turns * Math.PI) / 2);
  // Drawn with the base to the west; the collector is either the face before or after it.
  const s = PINS[(PINS.indexOf('N') + turns) % 4] === collector ? 1 : -1;
  line(c, -LEAD, 0, -0.34, 0);
  line(c, -0.34, -0.44, -0.34, 0.44);
  line(c, -0.34, -0.18 * s, 0, -0.55 * s);
  line(c, 0, -0.55 * s, 0, -LEAD * s);
  line(c, -0.34, 0.18 * s, 0, 0.55 * s);
  line(c, 0, 0.55 * s, 0, LEAD * s);
  // Emitter arrow, pointing away from the base.
  c.save();
  c.translate(-0.08, 0.44 * s);
  c.rotate(Math.atan2(0.37 * s, 0.34));
  c.beginPath();
  c.moveTo(0.1, 0);
  c.lineTo(-0.12, -0.11);
  c.lineTo(-0.12, 0.11);
  c.closePath();
  c.fill();
  c.restore();
  c.restore();
}

/** The push cap as a ring, with a stub to every face the module reaches. */
function button(c: Ctx, els: Element[]): void {
  const faces = new Set<Pin>();
  for (const e of els) {
    if (e.kind === 'button' || e.kind === 'link') faces.add(e.a as Pin).add(e.b as Pin);
  }
  c.beginPath();
  c.arc(0, 0, 0.52, 0, Math.PI * 2);
  c.stroke();
  for (const f of faces) line(c, AT[f][0] * 0.565, AT[f][1] * 0.565, AT[f][0], AT[f][1]);
}

/**
 * The antenna bar: the ferrite rod, the tapped winding L1 and the coupling winding L2, with a
 * lead from every winding end to the contact it reaches, as in its Приложение 2 drawing.
 */
function antenna(c: Ctx, def: ModuleDef): void {
  const width = def.width;
  const cellX = (face: string): number => {
    if (face === 'E') return (width / 2) * ANTENNA_CELL;
    if (face === 'W') return -(width / 2) * ANTENNA_CELL;
    return (Number(face.slice(1)) - 0.5 - width / 2) * ANTENNA_CELL;
  };
  const faceOf = (node: string): string => (node.startsWith('#') ? node.slice(1) : node);
  const edgeY = (face: string): number => (face.startsWith('S') ? ANTENNA_EDGE : -ANTENNA_EDGE);

  c.save();
  c.lineWidth *= 0.6;
  c.globalAlpha *= 0.45;
  line(c, -(width / 2) * ANTENNA_CELL * 0.92, 0.95, (width / 2) * ANTENNA_CELL * 0.92, 0.95);
  c.globalAlpha /= 0.45;

  const coils = def.elements.filter((e) => e.kind === 'inductor');
  const wires = def.elements.filter((e) => e.kind === 'link');
  const emf = def.elements.find((e) => e.kind === 'emf');

  // Each winding section is a row of turns between the x positions of its two ends; L2 sits
  // above L1. A lead rises from each end to its contact, or runs out to the bar's end.
  for (const coil of coils) {
    const a = faceOf(coil.a);
    const b = faceOf(coil.b === '#emf' && emf ? emf.n : coil.b);
    const y = coil.winding === 'L1' ? 0.45 : -0.45;
    const [xa, xb] = [cellX(a), cellX(b)];
    const x0 = Math.min(xa, xb) + 0.25;
    const x1 = Math.max(xa, xb) - 0.25;
    turns(c, x0, y, x1 - x0, Math.max(2, Math.round((x1 - x0) / 0.55)));
    for (const [face, xEnd] of [[a, x0], [b, x1]] as const) {
      if (face === 'E' || face === 'W') {
        line(c, xEnd, y, cellX(face), y);
      } else {
        line(c, xEnd, y, cellX(face), y);
        line(c, cellX(face), y, cellX(face), edgeY(face));
      }
    }
  }
  for (const w of wires) {
    const [a, b] = [faceOf(w.a), faceOf(w.b)];
    line(c, cellX(a), -0.05, cellX(b), -0.05);
    for (const f of [a, b]) line(c, cellX(f), -0.05, cellX(f), edgeY(f));
  }
  c.restore();
}

function turns(c: Ctx, x: number, y: number, width: number, n: number): void {
  const step = width / n;
  c.beginPath();
  c.moveTo(x, y);
  for (let i = 0; i < n; i++) c.arc(x + step * (i + 0.5), y, step / 2, Math.PI, 0, false);
  c.stroke();
}
