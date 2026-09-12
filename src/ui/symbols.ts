/**
 * Schematic symbols embossed on the module tops, as drawn in Приложение 1 and 2 of the manual.
 *
 * Every symbol is drawn in a unit square centred on the origin, spanning -1..1, so the caller
 * decides size and rotation. Leads run to the face midpoints at (0,-1) N, (1,0) E, (0,1) S,
 * (-1,0) W. The diagonal band is the moulded prising slot, present on the real cubes.
 */

export type SymbolKey =
  | 'resistor-o' | 'resistor-a'
  | 'cap-o' | 'cap-a'
  | 'elcap-o' | 'elcap-a'
  | 'diodes' | 'bjt-a' | 'bjt-b'
  | 'j-ugol' | 'j-krest' | 'j-shchel' | 'j-liniya' | 'j-troynik' | 'j-mostik'
  | 'button' | 'antenna';

type Draw = (c: CanvasRenderingContext2D) => void;

const LEAD = 0.92;

function line(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r = 0.09): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

/** The prising slot: a shallow diagonal channel with rounded ends. */
function slot(c: CanvasRenderingContext2D, angle: number): void {
  c.save();
  c.rotate(angle);
  c.lineWidth *= 2.6;
  c.globalAlpha *= 0.35;
  c.lineCap = 'round';
  line(c, -0.72, 0.72, 0.72, -0.72);
  c.restore();
}

/** Resistor body: a rectangle across the middle of a lead run. */
function resistorBody(c: CanvasRenderingContext2D): void {
  c.beginPath();
  c.rect(-0.34, -0.19, 0.68, 0.38);
  c.stroke();
}

function capPlates(c: CanvasRenderingContext2D, polarised: boolean): void {
  line(c, -0.09, -0.42, -0.09, 0.42);
  if (polarised) {
    c.beginPath();
    c.arc(0.28, 0, 0.42, Math.PI * 0.62, Math.PI * 1.38, true);
    c.stroke();
  } else {
    line(c, 0.09, -0.42, 0.09, 0.42);
  }
}

function transistor(c: CanvasRenderingContext2D, flip: boolean): void {
  const s = flip ? -1 : 1;
  // Base bar, vertical, fed from the west.
  line(c, -LEAD, 0, -0.34, 0);
  line(c, -0.34, -0.44, -0.34, 0.44);
  // Collector to the north (or south when flipped), emitter opposite.
  line(c, -0.34, -0.2 * s, 0.34, -0.72 * s);
  line(c, 0.34, -0.72 * s, 0.34, -LEAD * s);
  line(c, -0.34, 0.2 * s, 0.34, 0.72 * s);
  line(c, 0.34, 0.72 * s, 0.34, LEAD * s);
  // Emitter arrow.
  c.save();
  c.translate(0.06, 0.44 * s);
  c.rotate(Math.atan2(0.52 * s, 0.68));
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(-0.2, -0.11);
  c.lineTo(-0.2, 0.11);
  c.closePath();
  c.fill();
  c.restore();
}

function diode(c: CanvasRenderingContext2D, x: number, w: number): void {
  c.beginPath();
  c.moveTo(x - w, -w);
  c.lineTo(x - w, w);
  c.lineTo(x + w, 0);
  c.closePath();
  c.fill();
  line(c, x + w, -w, x + w, w);
}

export const SYMBOLS: Record<SymbolKey, Draw> = {
  'resistor-o': (c) => {
    slot(c, 0);
    line(c, -LEAD, 0, -0.34, 0);
    line(c, 0.34, 0, LEAD, 0);
    resistorBody(c);
  },
  'resistor-a': (c) => {
    slot(c, Math.PI / 2);
    c.save();
    c.rotate(-Math.PI / 4);
    line(c, -LEAD * 0.9, 0, -0.34, 0);
    line(c, 0.34, 0, LEAD * 0.9, 0);
    resistorBody(c);
    c.restore();
  },
  'cap-o': (c) => {
    slot(c, 0);
    line(c, -LEAD, 0, -0.09, 0);
    line(c, 0.09, 0, LEAD, 0);
    capPlates(c, false);
  },
  'cap-a': (c) => {
    slot(c, Math.PI / 2);
    c.save();
    c.rotate(-Math.PI / 4);
    line(c, -LEAD * 0.9, 0, -0.09, 0);
    line(c, 0.09, 0, LEAD * 0.9, 0);
    capPlates(c, false);
    c.restore();
  },
  'elcap-o': (c) => {
    slot(c, 0);
    line(c, -LEAD, 0, -0.09, 0);
    line(c, 0.28, 0, LEAD, 0);
    capPlates(c, true);
    plus(c, -0.46, -0.44);
  },
  'elcap-a': (c) => {
    slot(c, Math.PI / 2);
    c.save();
    c.rotate(-Math.PI / 4);
    line(c, -LEAD * 0.9, 0, -0.09, 0);
    line(c, 0.28, 0, LEAD * 0.9, 0);
    capPlates(c, true);
    c.restore();
    plus(c, -0.5, -0.4);
  },
  diodes: (c) => {
    slot(c, Math.PI / 2);
    line(c, -LEAD, 0, -0.62, 0);
    line(c, -0.28, 0, 0.28, 0);
    line(c, 0.62, 0, LEAD, 0);
    diode(c, -0.45, 0.17);
    diode(c, 0.45, 0.17);
    line(c, 0, 0, 0, LEAD);
    dot(c, 0, 0, 0.07);
  },
  'bjt-a': (c) => transistor(c, false),
  'bjt-b': (c) => transistor(c, true),

  'j-ugol': (c) => {
    line(c, 0, -LEAD, 0, 0);
    line(c, 0, 0, LEAD, 0);
  },
  'j-krest': (c) => {
    line(c, -LEAD, 0, LEAD, 0);
    line(c, 0, -LEAD, 0, LEAD);
    dot(c, 0, 0);
  },
  'j-shchel': (c) => {
    slot(c, 0);
  },
  'j-liniya': (c) => {
    line(c, -LEAD, 0, LEAD, 0);
  },
  'j-troynik': (c) => {
    line(c, -LEAD, 0, LEAD, 0);
    line(c, 0, 0, 0, LEAD);
    dot(c, 0, 0);
  },
  'j-mostik': (c) => {
    line(c, -LEAD, 0, LEAD, 0);
    // The north-south path steps around the crossing, showing it is insulated.
    c.beginPath();
    c.moveTo(0, -LEAD);
    c.lineTo(0, -0.22);
    c.lineTo(0.22, -0.1);
    c.lineTo(0.22, 0.1);
    c.lineTo(0, 0.22);
    c.lineTo(0, LEAD);
    c.stroke();
  },
  button: (c) => {
    line(c, -LEAD, 0, -0.52, 0);
    line(c, 0.52, 0, LEAD, 0);
    c.beginPath();
    c.arc(0, 0, 0.52, Math.PI * 0.12, Math.PI * 0.88);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 0.52, Math.PI * 1.12, Math.PI * 1.88);
    c.stroke();
  },
  antenna: (c) => {
    // The bar is six cells wide, so this symbol lives in x in [-6, 6] while every cube symbol
    // lives in [-1, 1]. The caller scales by cell height either way.
    c.save();
    c.lineWidth *= 0.6;
    // Ferrite rod.
    c.globalAlpha *= 0.5;
    line(c, -5.4, 0, 5.4, 0);
    c.globalAlpha /= 0.5;
    // L1, the tapped tuning winding, and L2, the coupling winding.
    coil(c, -4.6, -0.18, 5.4, 0, 9);
    coil(c, 1.4, 0.5, 2.4, 0, 4);
    c.restore();
  },
};

function plus(c: CanvasRenderingContext2D, x: number, y: number): void {
  const r = 0.16;
  line(c, x - r, y, x + r, y);
  line(c, x, y - r, x, y + r);
}

function coil(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  _unused: number,
  turns: number,
): void {
  const step = width / turns;
  c.beginPath();
  c.moveTo(x, y);
  for (let i = 0; i < turns; i++) {
    c.arc(x + step * (i + 0.5), y, step / 2, Math.PI, 0, false);
  }
  c.stroke();
}
