/** Core domain types for the ЭКОН-01 field, modules and elements. See SPEC.md §3–§4. */

/** The four side faces of a cube module. Order matters: rotation is a cyclic shift of this list. */
export const PINS = ['N', 'E', 'S', 'W'] as const;
export type Pin = (typeof PINS)[number];

/** Quarter-turn steps clockwise. 0 = as drawn in Приложение 2. */
export type Rotation = 0 | 1 | 2 | 3;

/** Rotate a pin clockwise by `r` quarter turns. */
export function rotatePin(pin: Pin, r: Rotation): Pin {
  const i = PINS.indexOf(pin);
  return PINS[(i + r) & 3]!;
}

/** The opposite face. */
export function oppositePin(pin: Pin): Pin {
  return rotatePin(pin, 2);
}

/**
 * A node inside a module. Either one of its four face contacts, or a private internal node
 * (used by the transistor and twin-diode modules, whose third lead has nowhere else to go).
 */
export type ModuleNode = Pin | `#${string}`;

export type ElementKind =
  | 'resistor'
  | 'capacitor'
  | 'electrolytic'
  | 'inductor'
  | 'diode'
  | 'bjt'
  | 'link'
  | 'button'
  | 'emf';

export interface ResistorEl {
  kind: 'resistor';
  a: ModuleNode;
  b: ModuleNode;
  /** Ohms. */
  ohms: number;
  /** Fractional tolerance, e.g. 0.1 for ±10 %. */
  tol?: number;
}

export interface CapacitorEl {
  kind: 'capacitor' | 'electrolytic';
  a: ModuleNode;
  /** For an electrolytic this is the negative terminal. */
  b: ModuleNode;
  /** Farads. */
  farads: number;
  tolLow?: number;
  tolHigh?: number;
}

export interface InductorEl {
  kind: 'inductor';
  a: ModuleNode;
  b: ModuleNode;
  /** Henries. */
  henries: number;
  /** Winding DC resistance in ohms. */
  esr: number;
  /** Which winding this section belongs to, e.g. "L1". */
  winding?: string;
}

export interface DiodeEl {
  kind: 'diode';
  anode: ModuleNode;
  cathode: ModuleNode;
  model: string;
}

export interface BjtEl {
  kind: 'bjt';
  base: ModuleNode;
  collector: ModuleNode;
  emitter: ModuleNode;
  model: string;
}

/** An ideal conductor between two module nodes. */
export interface LinkEl {
  kind: 'link';
  a: ModuleNode;
  b: ModuleNode;
}

/** Momentary normally-open contact; closed while the user holds it. */
export interface ButtonEl {
  kind: 'button';
  a: ModuleNode;
  b: ModuleNode;
}

/** Netlist name of the antenna's induced-EMF source, which the radio block drives. */
export const ANTENNA_EMF = 'WA_EMF';

/**
 * An induced electromotive force in series with a winding. The radio block drives it; a real
 * antenna induces a voltage in the coil, it does not push current across it.
 */
export interface EmfEl {
  kind: 'emf';
  p: ModuleNode;
  n: ModuleNode;
  /** Netlist element name, so the driver can find it again. */
  name: string;
}

export type Element =
  | ResistorEl
  | CapacitorEl
  | InductorEl
  | DiodeEl
  | BjtEl
  | LinkEl
  | ButtonEl
  | EmfEl;

export type ModuleShape = 'cube' | 'button' | 'antenna';

/**
 * Where one of a module's electrical nodes physically reaches the outside world.
 * A 1×1 cube has at most four sites, one per face, all at offset 0. The antenna bar is six
 * cells wide, so it can present several contacts along the same edge at different offsets.
 */
export interface ContactSite {
  /** The module-internal node this contact exposes. */
  node: ModuleNode;
  /** Which side of the module body the contact sits on. */
  edge: Pin;
  /** Cell index along the module's width, 0-based, left to right at rotation 0. */
  offset: number;
}

export interface ModuleDef {
  /** Stable id used in saved boards and preset circuits: the block's name in the registry. */
  id: string;
  /** The block's two-letter short_id in the registry. */
  shortId: string;
  /** Russian label as printed in Приложение 2. */
  label: string;
  /** Short value caption for the parts bin, e.g. "2,2 кОм". */
  caption?: string;
  shape: ModuleShape;
  /** How many the kit contains. */
  qty: number;
  /** How wide the module is, in cells. Only the antenna module is wider than 1. */
  width: number;
  elements: Element[];
  /** Which face contacts physically exist on this module. Empty for the blank «Щель». */
  contacts: Pin[];
  /**
   * Contact sites. Omitted for 1×1 cubes, where it is derived from `contacts`
   * (one site per face, node name = face name, offset 0).
   */
  sites?: ContactSite[];
  /** False for modules that only fit one way, i.e. the antenna bar. */
  rotatable?: boolean;
}

/** Contact sites of a module, filling in the default for 1×1 cubes. */
export function sitesOf(def: ModuleDef): ContactSite[] {
  return def.sites ?? def.contacts.map((p) => ({ node: p, edge: p, offset: 0 }));
}

/** Is this node one of the four rotatable face contacts? */
export function isPin(node: ModuleNode): node is Pin {
  return node.length === 1;
}

/** Apply a rotation to a module node; internal nodes are unaffected. */
export function rotateNode(node: ModuleNode, r: Rotation): ModuleNode {
  return isPin(node) ? rotatePin(node, r) : node;
}
