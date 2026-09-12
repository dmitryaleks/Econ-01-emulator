/**
 * A skin is a full description of how the panel looks: palette plus the handful of structural
 * choices that actually differ between the real production variants and the schematic view.
 *
 * Two physical variants are known from photographs: an early black case and a later grey one.
 * They differ in more than colour — the grey unit has a dimpled carry rail, a boxed «ЭКОН·01»
 * badge, a hex-packed speaker grille and bronze contacts — so those are structural options
 * rather than palette entries.
 */

export interface CasePalette {
  /** Body colour in the middle of a flat area. */
  base: string;
  /** Where the moulding catches the light. */
  light: string;
  /** Self-shadowed areas and the underside of steps. */
  dark: string;
  /** Outline of the case and of moulded steps. */
  edge: string;
  /** The bright band along a bevel. */
  bevel: string;
}

export interface FieldPalette {
  /** Floor of the recessed assembly field. */
  well: string;
  wellEdge: string;
  /** The moulded frame the contacts sit in. */
  frame: string;
}

export interface ContactPalette {
  face: string;
  edge: string;
}

export interface ModulePalette {
  top: string;
  topHi: string;
  side: string;
  /** The square shoulders left exposed around the round cap. */
  shoulder: string;
  shadow: string;
}

export interface SymbolPalette {
  ink: string;
  /** Stroke width as a fraction of the symbol radius. */
  weight: number;
  /** Raised-plastic look: draw a light offset copy behind the ink. */
  emboss: boolean;
  /** Ink for the prising slot, usually fainter than the symbol itself. */
  slot: string;
}

export interface SpeakerPalette {
  plate: string;
  hole: string;
  rim: string;
}

export interface KnobPalette {
  face: string;
  rib: string;
  shadow: string;
  dish: string;
  /** The index mark and the dial dots. */
  mark: string;
}

export interface SkinStyle {
  /** Row of finger dimples along the carry rail. */
  handle: 'dimpled' | 'plain';
  /** «ЭКОН·01» inside a rounded outline box, or plain lettering. */
  badge: 'boxed' | 'plain';
  /** Hex-packed holes with moulded bridges, or concentric rings. */
  grille: 'hex' | 'rings';
  /** Finely knurled with a dial arc, or smooth. */
  knob: 'knurled' | 'plain';
  /** Round domed cap with square shoulders showing, or a flat tile. */
  cap: 'domed' | 'flat';
  /** Moulding gradients and specular sheen. */
  texture: boolean;
}

export interface Skin {
  id: 'grey' | 'black' | 'schematic';
  label: string;
  case: CasePalette;
  field: FieldPalette;
  contact: ContactPalette;
  module: ModulePalette;
  symbol: SymbolPalette;
  speaker: SpeakerPalette;
  knob: KnobPalette;
  /** Silkscreen and badge ink. */
  silkscreen: string;
  textOnCase: string;
  accent: string;
  netLive: string;
  probe: string;
  /** Background and grid for the scope, so it sits with the panel. */
  scope: { background: string; grid: string };
  style: SkinStyle;
}
