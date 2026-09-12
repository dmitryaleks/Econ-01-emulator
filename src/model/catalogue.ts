/**
 * The 36 element modules plus the antenna module of the ЭКОН-01 kit.
 * Transcribed from Приложение 2 of the 1986 factory manual — see SPEC.md §4.
 *
 * Convention: rotation 0 is the module as drawn in the manual.
 *  - "opposite" span elements sit between W and E,
 *  - "adjacent" span elements sit between N and E.
 * Rotation permutes N->E->S->W, so one declaration covers all four orientations.
 */

import type { ModuleDef } from './types.js';

/** Netlist name of the antenna's induced-EMF source. */
export const ANTENNA_EMF = 'WA_EMF';

const R_TOL = 0.1;
const CERAMIC_LOW = 0.2;
const CERAMIC_HIGH = 0.8;

function resistor(
  id: string,
  caption: string,
  ohms: number,
  span: 'opposite' | 'adjacent',
  qty = 1,
): ModuleDef {
  const [a, b] = span === 'opposite' ? (['W', 'E'] as const) : (['N', 'E'] as const);
  return {
    id,
    label: `Резистор МЛТ-0,5-${caption}`,
    caption,
    shape: 'cube',
    qty,
    width: 1,
    contacts: [a, b],
    symbol: span === 'opposite' ? 'resistor-o' : 'resistor-a',
    elements: [{ kind: 'resistor', a, b, ohms, tol: R_TOL }],
  };
}

function capacitor(
  id: string,
  caption: string,
  farads: number,
  span: 'opposite' | 'adjacent',
  type: string,
): ModuleDef {
  const [a, b] = span === 'opposite' ? (['W', 'E'] as const) : (['N', 'E'] as const);
  return {
    id,
    label: `Конденсатор ${type}`,
    caption,
    shape: 'cube',
    qty: 1,
    width: 1,
    contacts: [a, b],
    symbol: span === 'opposite' ? 'cap-o' : 'cap-a',
    elements: [
      { kind: 'capacitor', a, b, farads, tolLow: CERAMIC_LOW, tolHigh: CERAMIC_HIGH },
    ],
  };
}

function electrolytic(id: string, span: 'opposite' | 'adjacent'): ModuleDef {
  // Positive terminal is marked "+" on the west side in both manual drawings.
  const [a, b] = span === 'opposite' ? (['W', 'E'] as const) : (['W', 'N'] as const);
  return {
    id,
    label: 'Конденсатор электролитический К50-6-1-10В-20 мкФ',
    caption: '20 мкФ',
    shape: 'cube',
    qty: 1,
    width: 1,
    contacts: [a, b],
    symbol: span === 'opposite' ? 'elcap-o' : 'elcap-a',
    elements: [{ kind: 'electrolytic', a, b, farads: 20e-6 }],
  };
}

function link(
  id: string,
  label: string,
  qty: number,
  symbol: string,
  contacts: ModuleDef['contacts'],
  elements: ModuleDef['elements'],
): ModuleDef {
  return { id, label, shape: 'cube', qty, width: 1, contacts, symbol, elements };
}

export const CATALOGUE: ModuleDef[] = [
  // ---- Resistors (9 modules) ------------------------------------------------
  resistor('r2k2-o', '2,2 кОм', 2.2e3, 'opposite', 2),
  resistor('r12k-a', '12 кОм', 12e3, 'adjacent'),
  resistor('r68k-o', '68 кОм', 68e3, 'opposite'),
  resistor('r68k-a', '68 кОм', 68e3, 'adjacent'),
  resistor('r680k-o', '680 кОм', 680e3, 'opposite'),
  resistor('r680k-a', '680 кОм', 680e3, 'adjacent'),
  resistor('r1m-a', '1 МОм', 1e6, 'adjacent'),
  resistor('r1m-o', '1 МОм', 1e6, 'opposite'),

  // ---- Ceramic capacitors (5 modules) --------------------------------------
  capacitor('c10n-o', '0,01 мкФ', 0.01e-6, 'opposite', 'К10-7В-Н90-0,01 мкФ'),
  capacitor('c680p-a', '680 пФ', 680e-12, 'adjacent', 'КТ-1-Н70-680 пФ'),
  capacitor('c3n3-o', '3300 пФ', 3300e-12, 'opposite', 'КТ-1-Н70-3300 пФ'),
  capacitor('c10n-a', '0,01 мкФ', 0.01e-6, 'adjacent', 'К10-7В-Н90-0,01 мкФ'),
  capacitor('c10n-o2', '0,01 мкФ', 0.01e-6, 'opposite', 'К10-7В-Н90-0,01 мкФ'),

  // ---- Electrolytics (2 modules) -------------------------------------------
  electrolytic('c20u-o', 'opposite'),
  electrolytic('c20u-a', 'adjacent'),

  // ---- Semiconductors (3 modules) ------------------------------------------
  {
    // "Два диода Д9Б": two diodes in series along W->E with the midpoint on S,
    // so the module gives you one diode, the other, or both in series.
    id: 'dd9b',
    label: 'Два диода Д9Б',
    caption: 'Д9Б ×2',
    shape: 'cube',
    qty: 1,
    width: 1,
    contacts: ['W', 'E', 'S'],
    symbol: 'diodes',
    elements: [
      { kind: 'diode', anode: 'W', cathode: 'S', model: 'D9B' },
      { kind: 'diode', anode: 'S', cathode: 'E', model: 'D9B' },
    ],
  },
  {
    id: 'q315-a',
    label: 'Транзистор КТ315Б',
    caption: 'КТ315Б',
    shape: 'cube',
    qty: 1,
    width: 1,
    contacts: ['N', 'S', 'W'],
    symbol: 'bjt-a',
    elements: [{ kind: 'bjt', base: 'W', collector: 'N', emitter: 'S', model: 'KT315B' }],
  },
  {
    id: 'q315-b',
    label: 'Транзистор КТ315Б',
    caption: 'КТ315Б',
    shape: 'cube',
    qty: 1,
    width: 1,
    contacts: ['N', 'S', 'W'],
    symbol: 'bjt-b',
    elements: [{ kind: 'bjt', base: 'W', collector: 'S', emitter: 'N', model: 'KT315B' }],
  },

  // ---- Links (16 modules) ---------------------------------------------------
  link('j-ugol', 'Перемычка «Угол»', 1, 'j-ugol', ['N', 'E'], [
    { kind: 'link', a: 'N', b: 'E' },
  ]),
  link('j-krest', 'Перемычка «Крест»', 1, 'j-krest', ['N', 'E', 'S', 'W'], [
    { kind: 'link', a: 'N', b: 'E' },
    { kind: 'link', a: 'E', b: 'S' },
    { kind: 'link', a: 'S', b: 'W' },
  ]),
  link('j-shchel', 'Перемычка «Щель»', 2, 'j-shchel', [], []),
  link('j-liniya', 'Перемычка «Линия»', 4, 'j-liniya', ['W', 'E'], [
    { kind: 'link', a: 'W', b: 'E' },
  ]),
  link('j-troynik', 'Перемычка «Тройник»', 4, 'j-troynik', ['W', 'E', 'S'], [
    { kind: 'link', a: 'W', b: 'E' },
    { kind: 'link', a: 'E', b: 'S' },
  ]),
  link('j-mostik', 'Перемычка «Мостик»', 4, 'j-mostik', ['N', 'E', 'S', 'W'], [
    { kind: 'link', a: 'W', b: 'E' },
    { kind: 'link', a: 'N', b: 'S' },
  ]),

  // ---- Button (1 module) ----------------------------------------------------
  {
    id: 'sb',
    label: 'Кнопка',
    caption: 'кнопка',
    shape: 'button',
    qty: 1,
    width: 1,
    contacts: ['W', 'E'],
    symbol: 'button',
    elements: [{ kind: 'button', a: 'W', b: 'E' }],
  },
];

/**
 * Magnetic antenna module. Ferrite 400НН 8 × 80 mm; L1 = 100 + 230 turns ПЭВ-2 0,16,
 * L2 = 25 turns. Six cells wide, lives in its own slot.
 *
 * Inductances are estimated from turns count (L ~ N^2 on this rod): the 100-turn section
 * tunes the medium-wave band against C10 = 10…100 pF, the full 330 turns tunes long wave.
 * Contact placement along the bar is a reconstruction — see SPEC.md §8 open question 4.
 */
export const ANTENNA: ModuleDef = {
  id: 'ant',
  label: 'Модуль антенный (антенна магнитная 400НН-8×80)',
  caption: 'антенна',
  shape: 'antenna',
  qty: 1,
  width: 6,
  rotatable: false,
  contacts: ['W', 'E'],
  sites: [
    // Ends of the bar: the west end lands on XT6.
    { node: 'W', edge: 'W', offset: 0 },
    { node: 'E', edge: 'E', offset: 5 },
    // Taps brought out on the north edge, facing the last row of the main grid.
    { node: '#tap', edge: 'N', offset: 1 },
    { node: '#l2', edge: 'N', offset: 4 },
  ],
  symbol: 'antenna',
  elements: [
    // L1, tapped: 100 turns W..tap (medium wave), a further 230 turns tap..E (long wave).
    { kind: 'inductor', a: 'W', b: '#tap', henries: 0.51e-3, esr: 1.2 },
    { kind: 'inductor', a: '#tap', b: 'E', henries: 5.1e-3, esr: 4.0 },
    // L2, 25-turn coupling winding, cold end common with L1, with the induced signal in
    // series with it — see sim/radio.ts.
    { kind: 'inductor', a: '#l2', b: '#emf', henries: 32e-6, esr: 0.4 },
    { kind: 'emf', p: '#emf', n: 'E', name: ANTENNA_EMF },
  ],
};

/** Every placeable module type, antenna included. */
export const ALL_MODULES: ModuleDef[] = [...CATALOGUE, ANTENNA];

export const MODULE_BY_ID = new Map(ALL_MODULES.map((m) => [m.id, m]));

/** Total number of cube modules in the kit. Приложение 2 says 36. */
export const CUBE_COUNT = CATALOGUE.reduce((n, m) => n + m.qty, 0);
