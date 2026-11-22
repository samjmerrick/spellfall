// What one player may know about a match. The AI and the UI read only views.
import { other, type GameEvent, type GameState, type PlayerId } from './types';

/** A card id the viewer cannot see. */
export const HIDDEN = '?';

export type PlayerView = GameState & { viewer: PlayerId };

/**
 * A copy of the state as `viewer` sees it: the opponent's hand and deck are hidden, the viewer's own deck
 * order is hidden (sorted), and the RNG is replaced so future random results cannot be read.
 */
export function viewFor(s: GameState, viewer: PlayerId, opts: { seeHand?: boolean } = {}): PlayerView {
  const v = structuredClone(s) as PlayerView;
  v.viewer = viewer;
  const opp = v.players[other(viewer)];
  // A boss rule ("sees your hand") can reveal the opponent's hand; their deck stays hidden.
  if (!opts.seeHand) opp.hand = opp.hand.map((c) => ({ uid: c.uid, cardId: HIDDEN }));
  opp.deck = opp.deck.map(() => HIDDEN);
  v.players[viewer].deck.sort();
  v.rng = (0x9e3779b9 ^ (s.turn * 2654435761)) >>> 0;
  return v;
}

/** Events as `viewer` may see them: the opponent's draws and burns are hidden. */
export function eventsFor(events: readonly GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e) =>
    (e.type === 'CardDrawn' || e.type === 'CardBurned') && e.player !== viewer ? { ...e, cardId: HIDDEN } : e,
  );
}
