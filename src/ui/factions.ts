import type { Faction } from '../rules';

/** Each faction has a glyph as well as a colour, so factions can be told apart without colour. */
export const GLYPHS: Record<Faction, string> = {
  ember: '▲',
  tide: '≈',
  grove: '♣',
  bastion: '■',
  dusk: '◐',
};

export const FACTION_NAME: Record<Faction, string> = {
  ember: 'Ember',
  tide: 'Tide',
  grove: 'Grove',
  bastion: 'Bastion',
  dusk: 'Dusk',
};
