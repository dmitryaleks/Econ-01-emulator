/** Clean high-contrast mode: same geometry, flat ink, no moulding. */

import type { Skin } from './skin.js';

export const SCHEMATIC: Skin = {
  id: 'schematic',
  label: 'Схема',

  case: {
    base: '#F6F5F1',
    light: '#FFFFFF',
    dark: '#E7E4DC',
    edge: '#C4C1B8',
    bevel: '#FFFFFF',
  },
  field: {
    well: '#FFFFFF',
    wellEdge: '#B9B6AD',
    frame: '#F0EEE8',
  },
  contact: {
    face: '#8D8A80',
    edge: '#B9B6AD',
  },
  module: {
    top: '#FFFFFF',
    topHi: '#FFFFFF',
    side: '#E7E4DC',
    shoulder: '#F4F2EC',
    shadow: '#D4D1C8',
  },
  symbol: {
    ink: '#1D1C19',
    weight: 0.085,
    emboss: false,
    slot: '#B9B6AD',
  },
  speaker: {
    plate: '#ECEAE4',
    hole: '#C4C1B8',
    rim: '#D8D5CC',
  },
  knob: {
    face: '#FFFFFF',
    rib: '#C4C1B8',
    shadow: '#D8D5CC',
    dish: '#F6F5F1',
    mark: '#5A574F',
  },

  silkscreen: '#5A574F',
  textOnCase: '#3A3833',
  accent: '#B3341B',
  netLive: '#1D6FD0',
  probe: '#0E8F6F',
  scope: { background: '#FFFFFF', grid: '#E7E4DC' },

  style: {
    handle: 'plain',
    badge: 'boxed',
    grille: 'rings',
    knob: 'plain',
    cap: 'flat',
    texture: false,
  },
};
