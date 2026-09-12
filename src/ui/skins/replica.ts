/** The 1982 look: black textured case, chrome-yellow cubes, Cyrillic silkscreen. */

import type { Skin } from './skin.js';

export const REPLICA: Skin = {
  id: 'replica',
  label: 'Реплика 1982',

  caseFill: '#1b1b1d',
  caseEdge: '#080809',
  caseHighlight: '#3a3a3e',
  fieldWell: '#0e0e10',
  fieldEdge: '#2c2c30',
  silkscreen: '#c9c9c4',
  contact: '#c8cbd0',
  contactShadow: '#5a5d63',

  cubeTop: '#f6c81f',
  cubeTopHi: '#ffe272',
  cubeSide: '#c98f05',
  cubeEmboss: '#8a6003',
  cubeEmbossHi: '#ffe89a',

  speakerGrille: '#141416',
  speakerHole: '#050506',
  knobFace: '#efeee6',
  knobRib: '#b9b7ab',
  knobCentre: '#25252b',

  accent: '#e04a2f',
  netLive: '#ffcf4a',
  probe: '#4ad3ff',
  textOnCase: '#d7d7d2',

  texture: true,
  emboss: true,
};
