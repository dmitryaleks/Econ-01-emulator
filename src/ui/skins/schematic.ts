/** Clean high-contrast mode: same geometry, flat ink, large symbols. */

import type { Skin } from './skin.js';

export const SCHEMATIC: Skin = {
  id: 'schematic',
  label: 'Схема',

  caseFill: '#f6f5f1',
  caseEdge: '#d8d6cf',
  caseHighlight: '#ffffff',
  fieldWell: '#ffffff',
  fieldEdge: '#b9b6ad',
  silkscreen: '#5a574f',
  contact: '#8d8a80',
  contactShadow: '#d8d6cf',

  cubeTop: '#ffffff',
  cubeTopHi: '#ffffff',
  cubeSide: '#e7e4dc',
  cubeEmboss: '#1d1c19',
  cubeEmbossHi: '#1d1c19',

  speakerGrille: '#eceae4',
  speakerHole: '#c4c1b8',
  knobFace: '#ffffff',
  knobRib: '#c4c1b8',
  knobCentre: '#5a574f',

  accent: '#b3341b',
  netLive: '#1d6fd0',
  probe: '#0e8f6f',
  textOnCase: '#3a3833',

  texture: false,
  emboss: false,
};
