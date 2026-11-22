import { describe, expect, it } from 'vitest';
import { collectibleCards, getCard, initMatch, starterCollection } from '../../src/rules';
import {
  ASCENSION_RULES,
  CARD_CHOICES,
  HEROES,
  IllegalChoiceError,
  MAP_ROWS,
  MAX_LEVEL,
  RELICS,
  START_GOLD,
  UNLOCKS,
  applyChoice,
  ascensionRules,
  bundlesBetween,
  grantXp,
  levelForXp,
  maxHearts,
  ownedCardIds,
  ownedHeroes,
  recordRunResult,
  relicPool,
  removePrice,
  runMatch,
  startRun,
  starterHeroes,
  statsSummary,
  unlockLevel,
  unlockedIds,
  upgradable,
  withXp,
  xpProgress,
  xpThreshold,
  type NodeType,
  type RunState,
} from '../../src/run';
import { newProfile } from '../../src/save';
import { FILLER, pass, place, setup } from './rules/helpers';

const pool = [...starterCollection()];
const allRelics = RELICS.map((r) => r.id);
const config = (ascension = 0, seed = 1, heroId = 'hero-pyra') => ({
  seed,
  heroId,
  pool,
  ascension,
  relics: allRelics,
});

/** A run standing on a node of the given type in row 1 (test setup only). */
function at(type: NodeType, ascension = 0, extra: Partial<RunState> = {}, seed = 1): RunState {
  const r = { ...startRun(config(ascension, seed)), ...extra };
  r.map = structuredClone(r.map);
  r.row = 0;
  r.col = 0;
  r.map.rows[1]![0]!.type = type;
  for (const n of r.map.rows[0]!) n.next = [0];
  return applyChoice(r, { t: 'move', col: 0 });
}

function atBoss(ascension: number): RunState {
  const r = structuredClone(startRun(config(ascension)));
  r.row = MAP_ROWS - 1;
  r.col = 0;
  return applyChoice(r, { t: 'move', col: 0 });
}

/** The enemy hero's starting HP in the run's current match. */
const enemyHp = (r: RunState) => initMatch(runMatch(r).config, 1).players[1].hp;

/** How much more HP the same enemy has at this Ascension than at the level below (or, with `from`, that level). */
function hpGain(node: 'fight' | 'elite' | 'boss', ascension: number, from = ascension - 1): number {
  const make = (a: number) => (node === 'boss' ? atBoss(a) : at(node, a));
  const base = make(from);
  const asc = make(ascension);
  expect(runMatch(asc).enemyId).toBe(runMatch(base).enemyId);
  return enemyHp(asc) - enemyHp(base);
}

describe('a new profile', () => {
  it('owns exactly the 60 starter cards, 3 heroes and 28 relics', () => {
    const p = newProfile();
    expect(ownedCardIds(p)).toEqual(starterCollection());
    expect(ownedCardIds(p).size).toBe(60);
    expect(ownedHeroes(p)).toEqual(starterHeroes());
    expect(ownedHeroes(p)).toHaveLength(3);
    expect(relicPool(p)).toHaveLength(28);
    expect(p.unlocks).toEqual([]);
    expect(p.ascension).toEqual({ best: 0, unlocked: 0 });
  });

  it('a level 30 profile owns everything: 150 cards, 10 heroes, 40 relics, 2 heroes per faction', () => {
    expect(ownedCardIds(MAX_LEVEL).size).toBe(collectibleCards().length);
    expect(ownedHeroes(MAX_LEVEL)).toHaveLength(10);
    expect(relicPool(MAX_LEVEL)).toHaveLength(40);
    for (const f of ['ember', 'bastion', 'tide', 'grove', 'dusk'])
      expect(HEROES.filter((h) => h.faction === f)).toHaveLength(2);
  });
});

describe('the unlock track', () => {
  it('has one bundle per level from 2 to 30', () => {
    expect(UNLOCKS).toHaveLength(29);
    expect(UNLOCKS.map((b) => b.level)).toEqual(Array.from({ length: 29 }, (_, i) => i + 2));
  });

  it('bundle shapes: a hero and 3 cards, 3-4 cards of one faction, 3 relics', () => {
    const counts = { cards: 0, hero: 0, relics: 0 };
    for (const b of UNLOCKS) {
      counts[b.kind]++;
      if (b.kind === 'relics') {
        expect(b.ids, `level ${b.level}`).toHaveLength(3);
        for (const id of b.ids) expect(allRelics).toContain(id);
        continue;
      }
      const ids = b.kind === 'hero' ? b.ids.slice(1) : b.ids;
      if (b.kind === 'hero') expect(ids.length, `level ${b.level}`).toBe(3);
      else {
        expect(ids.length, `level ${b.level}`).toBeGreaterThanOrEqual(3);
        expect(ids.length, `level ${b.level}`).toBeLessThanOrEqual(4);
      }
      const factions = new Set(ids.map((id) => getCard(id).faction));
      expect(factions.size, `level ${b.level}`).toBe(1);
      for (const id of ids) expect(getCard(id).unlock).toBe('track');
      if (b.kind === 'hero') {
        const hero = HEROES.find((h) => h.id === b.ids[0])!;
        expect(hero.unlock).toBe('track');
        expect(factions.has(hero.faction)).toBe(true);
      }
    }
    expect(counts).toEqual({ cards: 18, hero: 7, relics: 4 });
  });

  it('every track card and new hero appears exactly once, and no starter card does', () => {
    const ids = UNLOCKS.flatMap((b) => b.ids);
    expect(new Set(ids).size).toBe(ids.length);
    const track = collectibleCards()
      .filter((c) => c.unlock === 'track')
      .map((c) => c.id);
    expect(track).toHaveLength(90);
    const trackHeroes = HEROES.filter((h) => h.unlock === 'track').map((h) => h.id);
    expect(trackHeroes).toHaveLength(7);
    const relics = UNLOCKS.filter((b) => b.kind === 'relics').flatMap((b) => b.ids);
    expect(relics).toHaveLength(12);
    expect(ids.slice().sort()).toEqual([...track, ...trackHeroes, ...relics].sort());
    for (const id of ids) expect(unlockLevel(id)).not.toBeNull();
    for (const id of starterCollection()) expect(unlockLevel(id)).toBeNull();
    expect(unlockLevel('hero-pyra')).toBeNull();
  });

  it('spreads heroes and relics over the track, with rare cards later than commons', () => {
    const heroLevels = UNLOCKS.filter((b) => b.kind === 'hero').map((b) => b.level);
    expect(heroLevels[0]!).toBeLessThanOrEqual(4);
    expect(heroLevels.at(-1)!).toBeGreaterThanOrEqual(24);
    const relicLevels = UNLOCKS.filter((b) => b.kind === 'relics').map((b) => b.level);
    expect(relicLevels[0]!).toBeLessThanOrEqual(10);
    expect(relicLevels.at(-1)!).toBeGreaterThanOrEqual(26);
    const mean = (rarity: string) => {
      const ls = collectibleCards()
        .filter((c) => c.unlock === 'track' && c.rarity === rarity)
        .map((c) => unlockLevel(c.id)!);
      return ls.reduce((a, b) => a + b, 0) / ls.length;
    };
    expect(mean('common')).toBeLessThan(mean('uncommon'));
    expect(mean('uncommon')).toBeLessThan(mean('rare'));
    expect(mean('rare')).toBeLessThan(mean('legendary'));
  });

  it('each bundle adds exactly its ids at its level, and not before', () => {
    for (const b of UNLOCKS) {
      const before = b.level - 1;
      const cards = (l: number) => ownedCardIds(l);
      const heroes = (l: number) => new Set(ownedHeroes(l).map((h) => h.id));
      const relics = (l: number) => new Set(relicPool(l));
      const added = (a: Set<string>, z: Set<string>) => [...z].filter((x) => !a.has(x)).sort();
      const expectCards =
        b.kind === 'relics' ? [] : b.ids.filter((id) => id !== b.ids[0] || b.kind !== 'hero');
      expect(added(cards(before), cards(b.level)), `cards at ${b.level}`).toEqual([...expectCards].sort());
      expect(added(heroes(before), heroes(b.level)), `heroes at ${b.level}`).toEqual(
        b.kind === 'hero' ? [b.ids[0]!] : [],
      );
      expect(added(relics(before), relics(b.level)), `relics at ${b.level}`).toEqual(
        b.kind === 'relics' ? [...b.ids].sort() : [],
      );
      expect(unlockedIds(b.level)).toEqual(expect.arrayContaining(b.ids));
      expect(unlockedIds(before)).not.toContain(b.ids[0]);
      expect(bundlesBetween(before, b.level)).toEqual([b]);
    }
  });
});

describe('XP and levels', () => {
  it('level n needs 100 + 50n XP to reach n + 1', () => {
    expect(xpThreshold(1)).toBe(0);
    expect(xpThreshold(2)).toBe(150);
    expect(xpThreshold(3)).toBe(350);
    let total = 0;
    for (let n = 1; n < MAX_LEVEL; n++) {
      total += 100 + 50 * n;
      expect(xpThreshold(n + 1)).toBe(total);
      expect(levelForXp(total - 1)).toBe(n);
      expect(levelForXp(total)).toBe(n + 1);
    }
  });

  it('xpProgress reports progress in the level, and needed 0 at the cap', () => {
    expect(xpProgress(0)).toEqual({ level: 1, into: 0, needed: 150 });
    expect(xpProgress(200)).toEqual({ level: 2, into: 50, needed: 200 });
    const cap = xpThreshold(MAX_LEVEL);
    expect(xpProgress(cap)).toMatchObject({ level: 30, into: 0, needed: 0 });
    expect(xpProgress(cap + 5000)).toMatchObject({ level: 30, needed: 0 });
  });

  it('one grant can jump several levels and reports every bundle passed', () => {
    const g = grantXp(newProfile(), xpThreshold(7) + 3);
    expect(g.from).toBe(1);
    expect(g.to).toBe(7);
    expect(g.bundles.map((b) => b.level)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(g.profile.level).toBe(7);
    expect(g.profile.xp).toBe(xpThreshold(7) + 3);
    expect(g.profile.unlocks).toEqual(unlockedIds(7));
    // A small grant afterwards unlocks nothing.
    expect(grantXp(g.profile, 10).bundles).toEqual([]);
  });

  it('caps at level 30 and keeps counting XP', () => {
    const g = grantXp(newProfile(), 10_000_000);
    expect(g.to).toBe(30);
    expect(g.bundles).toHaveLength(29);
    expect(g.profile.unlocks).toEqual(unlockedIds(30));
    const again = grantXp(g.profile, 50);
    expect(again.bundles).toEqual([]);
    expect(again.profile.xp).toBe(g.profile.xp + 50);
    expect(again.profile.level).toBe(30);
  });

  it('withXp recomputes level and unlocks', () => {
    const p = withXp({ ...newProfile(), level: 9, unlocks: ['x'] }, 160);
    expect(p.level).toBe(2);
    expect(p.unlocks).toEqual(unlockedIds(2));
  });
});

describe('Ascension data', () => {
  it('has 10 rules, one per level, and they are cumulative', () => {
    expect(ASCENSION_RULES.map((r) => r.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ascensionRules(0)).toEqual([]);
    expect(ascensionRules(4).map((r) => r.level)).toEqual([1, 2, 3, 4]);
    expect(ascensionRules(10)).toHaveLength(10);
  });
});

describe('Ascension rules', () => {
  it('1: elites have +2 HP', () => {
    expect(hpGain('elite', 1)).toBe(2);
    expect(hpGain('fight', 1)).toBe(0);
    expect(hpGain('elite', 3)).toBe(0);
    expect(hpGain('elite', 3, 0)).toBe(2); // cumulative
  });

  it('2: shops cost 25% more, rounded up, after relic discounts', () => {
    const base = at('shop', 1);
    const dear = at('shop', 2);
    if (base.phase.kind !== 'shop' || dear.phase.kind !== 'shop') throw new Error('not a shop');
    expect(dear.phase.stock.map((i) => i.price)).toEqual(
      base.phase.stock.map((i) => Math.ceil((i.price * 5) / 4)),
    );
    expect(dear.phase.stock.find((i) => i.kind === 'relic')!.price).toBe(94); // 75 * 1.25 = 93.75
    expect(removePrice(base)).toBe(40);
    expect(removePrice(dear)).toBe(50);
    // With Silver Tongue (-25%): 75 -> 56 -> 70.
    const sale = at('shop', 2, { relics: ['relic-silver-tongue'] });
    expect(sale.phase.kind === 'shop' && sale.phase.stock.find((i) => i.kind === 'relic')!.price).toBe(70);
    // Cannot remove a card without the (higher) price.
    const poor = { ...dear, gold: 45 };
    expect(() => applyChoice(poor, { t: 'removeCard', index: 0 })).toThrow(IllegalChoiceError);
    expect(applyChoice({ ...dear, gold: 50 }, { t: 'removeCard', index: 0 }).gold).toBe(0);
  });

  it('3: start with 15 less gold', () => {
    expect(startRun(config(2)).gold).toBe(START_GOLD);
    expect(startRun(config(3)).gold).toBe(START_GOLD - 15);
  });

  it('4: normal fight enemies have +3 HP', () => {
    expect(hpGain('fight', 4)).toBe(3);
    expect(hpGain('fight', 3)).toBe(0);
    expect(hpGain('elite', 4)).toBe(0);
    expect(hpGain('fight', 5, 0)).toBe(3);
  });

  it('5: fights give 25% less gold, rounded down', () => {
    const win = (a: number) => applyChoice(at('fight', a), { t: 'matchEnd', won: true });
    const g4 = win(4);
    const g5 = win(5);
    if (g4.phase.kind !== 'reward' || g5.phase.kind !== 'reward') throw new Error('no reward');
    expect(g5.phase.gold).toBe(Math.floor((g4.phase.gold * 3) / 4));
    expect(g5.phase.gold).toBeLessThan(g4.phase.gold);
    expect(g5.gold - g5.phase.gold).toBe(g4.gold - g4.phase.gold - 0); // same starting gold from here
    const elite4 = applyChoice(at('elite', 4), { t: 'matchEnd', won: true });
    const elite5 = applyChoice(at('elite', 5), { t: 'matchEnd', won: true });
    if (elite4.phase.kind !== 'reward' || elite5.phase.kind !== 'reward') throw new Error('no reward');
    expect(elite5.phase.gold).toBe(Math.floor((elite4.phase.gold * 3) / 4));
  });

  it('6: bosses have +5 HP', () => {
    expect(hpGain('boss', 6)).toBe(5);
    expect(hpGain('boss', 5)).toBe(0);
    expect(hpGain('fight', 6)).toBe(0);
  });

  it('7: act 1 fights use Normal AI', () => {
    let easy: number | null = null;
    for (let seed = 1; seed < 60 && easy === null; seed++) {
      const r = at('fight', 6, {}, seed);
      if (runMatch(r).difficulty === 'easy') easy = seed;
    }
    expect(easy, 'a seed with an easy act 1 enemy').not.toBeNull();
    expect(runMatch(at('fight', 6, {}, easy!)).difficulty).toBe('easy');
    expect(runMatch(at('fight', 7, {}, easy!)).difficulty).toBe('normal');
    // Later acts keep their own difficulty.
    const act2 = at('fight', 7, { act: 2 }, easy!);
    expect(runMatch(act2).difficulty).toBe(runMatch(at('fight', 0, { act: 2 }, easy!)).difficulty);
  });

  it('8: a rest can only upgrade a card', () => {
    const rest = (a: number) => at('rest', a, { hearts: 2 });
    expect(applyChoice(rest(7), { t: 'rest' }).hearts).toBe(3);
    expect(() => applyChoice(rest(8), { t: 'rest' })).toThrow(IllegalChoiceError);
    const r8 = rest(8);
    expect(upgradable(r8).length).toBeGreaterThan(0);
    const up = applyChoice(r8, { t: 'upgrade', index: upgradable(r8)[0]! });
    expect(up.hearts).toBe(2);
    expect(up.deck.some((id) => id.endsWith('+'))).toBe(true);
    // With nothing to upgrade, the only way on is to leave.
    const allUp = rest(8);
    allUp.deck = allUp.deck.map((id) => id + '+');
    expect(() => applyChoice(allUp, { t: 'upgrade', index: 0 })).toThrow(IllegalChoiceError);
    expect(applyChoice(allUp, { t: 'leave' }).phase.kind).toBe('map');
  });

  it('9: card rewards offer 2 cards, and relic bonuses still add', () => {
    const cards = (a: number, relics: string[] = []) => {
      const r = applyChoice(at('fight', a, { relics }), { t: 'matchEnd', won: true });
      return r.phase.kind === 'reward' ? r.phase.cards.length : -1;
    };
    expect(cards(8)).toBe(CARD_CHOICES);
    expect(cards(9)).toBe(2);
    expect(cards(8, ['relic-keen-eye'])).toBe(4);
    expect(cards(9, ['relic-keen-eye'])).toBe(3);
  });

  it('10: start with 2 Hearts, and the limit stays 3', () => {
    expect(startRun(config(9)).hearts).toBe(3);
    const r = startRun(config(10));
    expect(r.hearts).toBe(2);
    expect(maxHearts(r)).toBe(3);
  });

  it('rules are cumulative: Ascension 10 has all of them, 0 has none', () => {
    const top = startRun(config(10));
    expect(top.gold).toBe(15);
    expect(top.hearts).toBe(2);
    expect(hpGain('elite', 10, 0)).toBe(2);
    expect(hpGain('fight', 10, 0)).toBe(3);
    expect(hpGain('boss', 10, 0)).toBe(5);
    const bottom = startRun(config(0));
    expect(bottom.gold).toBe(30);
    expect(bottom.hearts).toBe(3);
  });

  it('runs draw relics only from the config relic pool', () => {
    const limited = { ...config(0), relics: ['relic-aegis', 'relic-tome'] };
    let r = { ...startRun(limited), relics: ['relic-aegis'] };
    r.map = structuredClone(r.map);
    r.row = 0;
    r.col = 0;
    r.map.rows[1]![0]!.type = 'treasure';
    for (const n of r.map.rows[0]!) n.next = [0];
    r = applyChoice(r, { t: 'move', col: 0 });
    expect(r.phase).toMatchObject({ kind: 'treasure', relicId: 'relic-tome' });
    const none = applyChoice(
      { ...r, relics: ['relic-aegis', 'relic-tome'], phase: { kind: 'map' }, row: 0, col: 0 },
      { t: 'move', col: 0 },
    );
    expect(none.phase.kind).not.toBe('over');
  });
});

describe('Ascension progress', () => {
  const win = (p = newProfile(), hero = 'hero-pyra', a = 0) => recordRunResult(p, hero, a, true);

  it('stays 0 until the first full run win, which opens Ascension 1', () => {
    let p = recordRunResult(newProfile(), 'hero-pyra', 0, false);
    expect(p.ascension).toEqual({ best: 0, unlocked: 0 });
    expect(p.stats.runs['hero-pyra']).toEqual({ played: 1, won: 0 });
    p = win(p);
    expect(p.ascension).toEqual({ best: 0, unlocked: 1 });
    expect(p.stats.runs['hero-pyra']).toEqual({ played: 2, won: 1 });
  });

  it('winning at the top open level opens the next, up to 10; other results do not', () => {
    let p = win();
    p = recordRunResult(p, 'hero-kael', 1, false);
    expect(p.ascension).toEqual({ best: 0, unlocked: 1 });
    p = win(p, 'hero-kael', 1);
    expect(p.ascension).toEqual({ best: 1, unlocked: 2 });
    // Winning a lower level changes nothing.
    p = win(p, 'hero-kael', 0);
    expect(p.ascension).toEqual({ best: 1, unlocked: 2 });
    for (let a = 2; a <= 10; a++) p = win(p, 'hero-pyra', a);
    expect(p.ascension).toEqual({ best: 10, unlocked: 10 });
    expect(win(p, 'hero-pyra', 10).ascension).toEqual({ best: 10, unlocked: 10 });
  });

  it('best only rises', () => {
    let p = win(win(newProfile(), 'hero-pyra', 0), 'hero-pyra', 1);
    p = win(p, 'hero-pyra', 0);
    expect(p.ascension.best).toBe(1);
  });
});

describe('stats summary', () => {
  it('lists runs per owned hero, best Ascension and Quick Play win rate per deck', () => {
    let p = newProfile();
    p.stats.quickPlay = { 'pre-ember': { played: 4, won: 1 }, d1: { played: 0, won: 0 } };
    p = recordRunResult(recordRunResult(p, 'hero-pyra', 0, true), 'hero-aldric', 0, false);
    const s = statsSummary(p);
    expect(s.runs.map((r) => r.heroId)).toEqual(['hero-pyra', 'hero-kael', 'hero-aldric']);
    expect(s.runs[0]).toMatchObject({ played: 1, won: 1 });
    expect(s.runsPlayed).toBe(2);
    expect(s.runsWon).toBe(1);
    expect(s.bestAscension).toBe(0);
    expect(s.quickPlay[0]).toEqual({ deckId: 'pre-ember', played: 4, won: 1, winRate: 0.25 });
    expect(s.quickPlay[1]!.winRate).toBe(0);
    expect(s.quickPlayPlayed).toBe(4);
    expect(s.quickPlayWon).toBe(1);
    // Locked heroes appear once they are owned.
    expect(statsSummary({ ...p, level: 30 }).runs).toHaveLength(10);
  });
});

describe('the 7 unlockable heroes', () => {
  const unlockable = HEROES.filter((h) => h.unlock === 'track');
  const mods = (id: string) => HEROES.find((h) => h.id === id)!.modifiers;
  const withHero = (id: string, extra: Parameters<typeof setup>[0] = {}) =>
    setup({ ...extra, modifiers: [mods(id), []] });
  /** Ends this turn and the opponent's, so player 0's next turn starts (and its turnStart modifiers run). */
  const next = (s: ReturnType<typeof setup>) => pass(pass(s));
  const mine = (s: ReturnType<typeof setup>, i = 0) => s.boards[0][i]!;
  const theirs = (s: ReturnType<typeof setup>, i = 0) => s.boards[1][i]!;

  it('there are 7, two per faction overall, each with a legal 12-card starter deck', () => {
    expect(unlockable.map((h) => h.faction).sort()).toEqual([
      'bastion',
      'dusk',
      'dusk',
      'grove',
      'grove',
      'tide',
      'tide',
    ]);
    for (const h of unlockable) {
      expect(h.starterDeck).toHaveLength(12);
      for (const id of h.starterDeck) {
        const c = getCard(id);
        expect(c.faction).toBe(h.faction);
        expect(c.token).toBe(false);
        expect(c.unlock, `${h.id} uses ${id}`).toBe('starter');
      }
      // The deck plays as a match deck for the hero.
      const deck = [...h.starterDeck, ...h.starterDeck, ...h.starterDeck];
      expect(() => initMatch({ decks: [deck, deck], modifiers: [h.modifiers, []] }, 3)).not.toThrow();
    }
    expect(new Set(unlockable.map((h) => h.starterDeck.join())).size).toBe(7);
  });

  it('Brenna: Barrier on a random friendly unit at the start of your 2nd, 4th and 6th turns', () => {
    let s = withHero('hero-brenna');
    place(s, 0, FILLER);
    expect(mine(s).barrier).toBe(false);
    s = next(s);
    expect(s.players[0].turnsTaken).toBe(2);
    expect(mine(s).barrier).toBe(true);
  });

  it('Marin: 1 extra card at the start, and a card at the start of your 3rd and 6th turns', () => {
    const base = setup();
    const marin = withHero('hero-marin');
    // `setup` empties hands, so count the cards drawn from the deck: 1 at the start, 1 on turn 3.
    expect(base.players[0].deck.length - marin.players[0].deck.length).toBe(1);
    const b3 = next(next(base));
    const m3 = next(next(marin));
    expect(b3.players[0].turnsTaken).toBe(3);
    expect(b3.players[0].deck.length - m3.players[0].deck.length).toBe(2);
  });

  it('Corin: enemy units get -1 Power this turn at the start of your 2nd, 4th and 6th turns', () => {
    let s = withHero('hero-corin');
    place(s, 1, 'bastion-militia');
    s = next(s);
    expect(theirs(s).turnPower).toBe(-1);
  });

  it('Sylva: a random friendly unit gets +1 Health at the start of each of your turns', () => {
    let s = withHero('hero-sylva');
    place(s, 0, 'bastion-militia');
    const hp = getCard('bastion-militia').health!;
    s = next(s);
    expect(mine(s).baseHealth).toBe(hp + 1);
    s = next(s);
    expect(mine(s).baseHealth).toBe(hp + 2);
  });

  it('Oren: heals friendly units each turn, and +2 Health to all of them on your 3rd turn', () => {
    let s = withHero('hero-oren');
    place(s, 0, 'bastion-militia', { damage: 1 });
    const hp = getCard('bastion-militia').health!;
    s = next(s);
    expect(mine(s).damage).toBe(0);
    expect(mine(s).baseHealth).toBe(hp);
    s = next(s);
    expect(mine(s).baseHealth).toBe(hp + 2);
  });

  it('Vesper: 2 damage to a random enemy unit at the start of your 2nd, 4th and 6th turns', () => {
    let s = withHero('hero-vesper');
    place(s, 1, 'bastion-wall-warden');
    s = next(s);
    expect(theirs(s).damage).toBe(2);
    s = next(s);
    expect(theirs(s).damage).toBe(2); // not a listed turn
  });

  it('Morrow: 1 damage to the enemy hero and 1 healing for yours on your 2nd, 4th, 6th and 8th turns', () => {
    let s = withHero('hero-morrow');
    s.players[0].hp = 10;
    s = next(s);
    expect(s.players[1].hp).toBe(19);
    expect(s.players[0].hp).toBe(11);
    s = next(s);
    expect(s.players[1].hp).toBe(19);
  });

  it('every hero passive text names the turns its modifiers fire on', () => {
    const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
    for (const h of unlockable) {
      const turns = h.modifiers.flatMap((m) => (m.kind === 'turnStart' ? (m.turns ?? []) : []));
      for (const t of turns) expect(h.passive, h.id).toContain(ordinal(t));
    }
  });
});

describe('meta progression on Spellfall’s card pool', () => {
  it('the starting collection and the unlock track together cover every collectible card exactly once', () => {
    const track = UNLOCKS.filter((b) => b.kind !== 'relics')
      .flatMap((b) => b.ids)
      .filter((id) => !id.startsWith('hero-'));
    const all = [...starterCollection(), ...track].sort();
    expect(all).toEqual(
      collectibleCards()
        .map((c) => c.id)
        .sort(),
    );
    for (const id of track) expect(getCard(id).unlock, id).toBe('track');
  });

  it('a new profile owns 12 starter cards in each faction', () => {
    const owned = [...ownedCardIds(newProfile())];
    for (const f of ['ember', 'tide', 'grove', 'bastion', 'dusk'])
      expect(
        owned.filter((id) => getCard(id).faction === f),
        f,
      ).toHaveLength(12);
  });
});
