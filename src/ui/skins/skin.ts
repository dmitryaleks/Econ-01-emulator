/** A skin is a flat palette plus two rendering switches; both skins share all the geometry. */

export interface Skin {
  id: 'replica' | 'schematic';
  label: string;

  caseFill: string;
  caseEdge: string;
  caseHighlight: string;
  fieldWell: string;
  fieldEdge: string;
  silkscreen: string;
  contact: string;
  contactShadow: string;

  cubeTop: string;
  cubeTopHi: string;
  cubeSide: string;
  cubeEmboss: string;
  cubeEmbossHi: string;

  speakerGrille: string;
  speakerHole: string;
  knobFace: string;
  knobRib: string;
  knobCentre: string;

  accent: string;
  netLive: string;
  probe: string;
  textOnCase: string;

  /** Draw the moulded plastic grain and bevels. */
  texture: boolean;
  /** Draw symbols as raised plastic rather than flat ink. */
  emboss: boolean;
}
