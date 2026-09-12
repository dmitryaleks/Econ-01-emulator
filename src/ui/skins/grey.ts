/**
 * The grey production variant, matched to `assets/the-original-econ-01-body.jpg`.
 *
 * Colours sampled from that photograph: light warm grey ABS with a strong specular sheen on
 * the mouldings, pale lemon modules with a domed cap, bronze contact tabs, and near-black
 * engraved markings. The dimpled carry rail, boxed badge, hex speaker grille and knurled
 * white knob are all specific to this unit.
 */

import type { Skin } from './skin.js';

export const GREY: Skin = {
  id: 'grey',
  label: 'Реплика (серый)',

  case: {
    base: '#A7ACAC',
    light: '#C2C7C6',
    dark: '#868B8C',
    edge: '#5E6365',
    bevel: '#DDE2E2',
  },
  field: {
    well: '#5F6462',
    wellEdge: '#474B4A',
    frame: '#878C8A',
  },
  // Phosphor-bronze tabs, tarnished to a dark olive brown.
  contact: {
    face: '#7A6A44',
    edge: '#332C18',
  },
  module: {
    top: '#EFE774',
    topHi: '#FBF48D',
    side: '#C9BC53',
    shoulder: '#D9CE60',
    shadow: '#6E6428',
  },
  symbol: {
    ink: '#241D0B',
    weight: 0.085,
    emboss: false,
    slot: '#5A4F22',
  },
  speaker: {
    plate: '#8A9093',
    hole: '#14171B',
    rim: '#6B7174',
  },
  knob: {
    face: '#F3F2EC',
    rib: '#B9BAB4',
    shadow: '#5F676B',
    dish: '#E8E7E1',
    mark: '#1E2125',
  },

  silkscreen: '#1E2125',
  textOnCase: '#2B2F31',
  accent: '#C43420',
  netLive: '#FF9C2A',
  probe: '#1E8FD6',
  scope: { background: '#22262A', grid: '#333A3F' },

  style: {
    handle: 'dimpled',
    badge: 'boxed',
    grille: 'hex',
    knob: 'knurled',
    cap: 'domed',
    texture: true,
  },
};
