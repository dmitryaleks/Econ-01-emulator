/**
 * The earlier black production variant, from the retropc.org photographs. Same mouldings as
 * the grey unit as far as the photographs show, but a black case, chrome-yellow modules and
 * bright nickel contacts, and the badge is silkscreened without an outline box.
 */

import type { Skin } from './skin.js';

export const BLACK: Skin = {
  id: 'black',
  label: 'Реплика (чёрный)',

  case: {
    base: '#1F1F22',
    light: '#3C3C41',
    dark: '#121214',
    edge: '#08080A',
    bevel: '#55555C',
  },
  field: {
    well: '#0E0E10',
    wellEdge: '#2C2C30',
    frame: '#1A1A1D',
  },
  contact: {
    face: '#C3C7CC',
    edge: '#6C7076',
  },
  module: {
    top: '#F6C81F',
    topHi: '#FFE272',
    side: '#B98405',
    shoulder: '#D9A410',
    shadow: '#5C4103',
  },
  symbol: {
    ink: '#3A2903',
    weight: 0.1,
    emboss: true,
    slot: '#7A5A06',
  },
  speaker: {
    plate: '#161618',
    hole: '#040405',
    rim: '#2A2A2E',
  },
  knob: {
    face: '#EFEEE6',
    rib: '#B9B7AB',
    shadow: '#25252B',
    dish: '#DFDED6',
    mark: '#25252B',
  },

  silkscreen: '#C9C9C4',
  textOnCase: '#D7D7D2',
  accent: '#E04A2F',
  netLive: '#FFCF4A',
  probe: '#4AD3FF',
  scope: { background: '#0C0C0E', grid: '#1E1E23', traces: ['#39FF14', '#C6FF4D'] },

  style: {
    handle: 'dimpled',
    badge: 'plain',
    grille: 'hex',
    knob: 'knurled',
    cap: 'domed',
    texture: true,
  },
};
