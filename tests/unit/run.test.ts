import { describe, expect, it } from 'vitest';
import { getCard, starterCollection } from '../../src/rules';
import { seedRng } from '../../src/rules/rng';
import {
  BOSS_XP,
  ENEMIES,
  EVENTS,
  HEROES,
  IllegalChoiceError,
  MAP_ROWS,
  NODE_XP,
  RELICS,
  REMOVE_PRICE,
  START_HEARTS,
  applyChoice,
  cardPool,
  currentNode,
  generateMap,
  getEnemy,
  getHero,
  getRelic,
  getEvent,
  mapProblems,
  maxHearts,
  nextCols,
  replayRun,
  runMatch,
  runXp,
  startRun,
  starterHeroes,
  type NodeType,
  type RunState,
} from '../../src/run';

const pool = [...starterCollection()];
const config = (seed = 1, heroId = 'hero-pyra', ascension = 0) => ({
  seed,
  heroId,
  pool,
  ascension,
  relics: RELICS.map((x) => x.id),
});

/** A run standing on a node of the given type in row 1 (test setup only). */
function at(type: NodeType, extra: Partial<RunState> = {}): RunState {
  const r = { ...startRun(config()), ...extra };
  r.map = structuredClone(r.map);
  r.row = 0;
  r.col = 0;
  r.map.rows[1]![0]!.type = type;
  for (const n of r.map.rows[0]!) n.next = [0];
  return applyChoice(r, { t: 'move', col: 0 });
}

/** Moves the run onto its act's boss node. */
function atBoss(start: RunState): RunState {
  const r = structuredClone(start);
  r.row = MAP_ROWS - 1;
  r.col = 0;
  return applyChoice(r, { t: 'move', col: 0 });
}

function withFirstRow(r: RunState, type: NodeType) {
  const map = structuredClone(r.map);
  for (const n of map.rows[0]!) n.type = type;
  return map;
}

const illegal = (r: RunState, c: Parameters<typeof applyChoice>[1]) =>
  expect(() => applyChoice(r, c)).toThrow(IllegalChoiceError);

describe('content', () => {
  it('has 3 starter heroes, 40 relics, 20 events, and fights, elites and 3 bosses in each of 3 acts', () => {
    expect(starterHeroes()).toHaveLength(3);
    for (const h of HEROES) for (const id of h.starterDeck) expect(getCard(id).faction).toBe(h.faction);
    expect(RELICS).toHaveLength(40);
    expect(EVENTS).toHaveLength(20);
    for (const act of [1, 2, 3]) {
      expect(ENEMIES.filter((e) => e.act === act && e.kind === 'boss')).toHaveLength(3);
      expect(ENEMIES.filter((e) => e.act === act && e.kind === 'elite').length).toBeGreaterThanOrEqual(3);
      expect(ENEMIES.filter((e) => e.act === act && e.kind === 'fight').length).toBeGreaterThanOrEqual(3);
    }
    for (const b of ENEMIES.filter((e) => e.kind === 'boss')) expect(b.rule, b.id).toBeTruthy();
    expect(() => getEvent('event-nope')).toThrow(/Unknown event/);
    expect(() => getHero('hero-nobody')).toThrow(/Unknown hero/);
    expect(() => getRelic('relic-nope')).toThrow(/Unknown relic/);
    expect(() => getEnemy('enemy-nope')).toThrow(/Unknown enemy/);
  });
});

describe('map generation', () => {
  it('across 1,000 seeds every map is connected and every path reaches the boss', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const [map] = generateMap(seedRng(seed));
      expect(mapProblems(map), `seed ${seed}`).toEqual([]);
      // Walk every path from row 0: each must end at the boss.
      const ends = new Set<string>();
      const walk = (row: number, col: number): void => {
        const node = map.rows[row]![col]!;
        if (node.type === 'boss') return void ends.add(`${row}`);
        expect(node.next.length).toBeGreaterThan(0);
        for (const c of node.next) walk(row + 1, c);
      };
      for (const n of map.rows[0]!) walk(0, n.col);
      expect([...ends]).toEqual([String(MAP_ROWS)]);
    }
  });

  it('first row is fights, the row before the boss is rests, and paths never cross', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [map] = generateMap(seedRng(seed));
      expect(map.rows[0]!.every((n) => n.type === 'fight')).toBe(true);
      expect(map.rows[MAP_ROWS - 1]!.every((n) => n.type === 'rest')).toBe(true);
      for (const row of map.rows.slice(0, MAP_ROWS)) {
        for (let i = 1; i < row.length; i++) {
          expect(Math.min(...row[i]!.next)).toBeGreaterThanOrEqual(Math.max(...row[i - 1]!.next));
        }
        // Paths only lead to neighbouring columns (drawn positions at most 0.3 of the width apart).
        const next = map.rows[row[0]!.row + 1]!;
        for (const n of row)
          for (const c of n.next)
            expect(
              Math.abs((n.col + 1) / (row.length + 1) - (c + 1) / (next.length + 1)),
            ).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it('is the same for the same seed', () => {
    expect(generateMap(seedRng(42))[0]).toEqual(generateMap(seedRng(42))[0]);
    expect(generateMap(seedRng(42))[0]).not.toEqual(generateMap(seedRng(43))[0]);
  });

  it('mapProblems reports broken maps', () => {
    const [map] = generateMap(seedRng(5));
    map.rows[2]![0]!.next = [];
    map.rows[3]![0]!.next.push(9);
    map.rows[MAP_ROWS]![0]!.type = 'fight';
    const problems = mapProblems(map);
    expect(problems).toContain('2:0 is a dead end');
    expect(problems.some((p) => p.includes('links to missing'))).toBe(true);
    expect(problems).toContain('last row is not the boss');
    expect(mapProblems({ rows: map.rows.slice(0, 3) })).toContain(`expected ${MAP_ROWS + 1} rows`);
  });
});

describe('run flow', () => {
  it('starts on the map with 3 Hearts, starting gold and the hero starter deck', () => {
    const r = startRun(config());
    expect(r.phase).toEqual({ kind: 'map' });
    expect(r.hearts).toBe(START_HEARTS);
    expect(r.deck).toEqual(getHero('hero-pyra').starterDeck);
    expect(currentNode(r)).toBeNull();
    expect(nextCols(r)).toEqual(r.map.rows[0]!.map((n) => n.col));
  });

  it('only allows moves along the paths', () => {
    let r = startRun(config());
    illegal(r, { t: 'move', col: 7 });
    illegal(r, { t: 'pick', index: 0 });
    r = applyChoice(r, { t: 'move', col: 0 });
    expect(r.phase.kind).toBe('match');
    illegal(r, { t: 'move', col: 0 });
    illegal(r, { t: 'abandon' });
  });

  it('winning a fight offers 3 cards of the hero faction and gold; picking adds one to the deck', () => {
    let r = applyChoice(startRun(config()), { t: 'move', col: 0 });
    const gold = r.gold;
    r = applyChoice(r, { t: 'matchEnd', won: true });
    if (r.phase.kind !== 'reward') throw new Error('expected a reward');
    expect(r.phase.cards).toHaveLength(3);
    expect(new Set(r.phase.cards).size).toBe(3);
    for (const id of r.phase.cards) expect(getCard(id).faction).toBe('ember');
    expect(r.gold - gold).toBe(r.phase.gold);
    expect(r.phase.gold).toBeGreaterThanOrEqual(15);
    const card = r.phase.cards[1]!;
    illegal(r, { t: 'pick', index: 5 });
    r = applyChoice(r, { t: 'pick', index: 1 });
    expect(r.deck).toHaveLength(13);
    expect(r.deck.at(-1)).toBe(card);
    expect(r.phase).toEqual({ kind: 'map' });
    expect(r.nodesCleared).toBe(1);
  });

  it('skipping a reward keeps the deck', () => {
    let r = applyChoice(startRun(config()), { t: 'move', col: 0 });
    r = applyChoice(applyChoice(r, { t: 'matchEnd', won: true }), { t: 'pick', index: null });
    expect(r.deck).toHaveLength(12);
  });

  it('losing costs a Heart and gives no reward; the run ends at 0 Hearts', () => {
    let r = applyChoice(startRun(config()), { t: 'move', col: 0 });
    r = applyChoice(r, { t: 'matchEnd', won: false });
    expect(r.hearts).toBe(2);
    expect(r.phase).toEqual({ kind: 'map' });
    expect(r.nodesCleared).toBe(0);
    r = at('fight', { hearts: 1 });
    r = applyChoice(r, { t: 'matchEnd', won: false });
    expect(r.phase).toEqual({ kind: 'over', won: false, abandoned: false });
    illegal(r, { t: 'leave' });
  });

  it('the boss: a loss with Hearts left is a rematch against the same act pool', () => {
    let r = atBoss(startRun(config()));
    expect(currentNode(r)!.type).toBe('boss');
    if (r.phase.kind !== 'match') throw new Error('expected a match');
    expect(getEnemy(r.phase.enemyId)).toMatchObject({ kind: 'boss', act: 1 });
    const first = r.phase.seed;
    r = applyChoice(r, { t: 'matchEnd', won: false });
    expect(r.phase.kind).toBe('match');
    expect(r.phase.kind === 'match' && r.phase.seed).not.toBe(first);
    expect(r.phase.kind === 'match' && getEnemy(r.phase.enemyId).kind).toBe('boss');
  });

  it('the act 1 boss gives a relic and gold and offers a second faction, which joins the card pool', () => {
    let r = applyChoice(atBoss(startRun(config(1, 'hero-aldric'))), { t: 'matchEnd', won: true });
    if (r.phase.kind !== 'actCleared') throw new Error('expected actCleared');
    expect(r.phase.act).toBe(1);
    expect(r.phase.factions).toEqual(['ember', 'tide', 'grove', 'dusk']);
    expect(r.relics).toEqual([r.phase.relicId]);
    illegal(r, { t: 'leave' });
    illegal(r, { t: 'nextAct', faction: 9 });
    const hearts = r.hearts;
    const skipped = applyChoice({ ...r, hearts: 1 }, { t: 'nextAct', faction: null });
    expect(skipped.secondFaction).toBeNull();
    expect(skipped.hearts).toBe(2); // a new act restores 1 Heart
    r = applyChoice(r, { t: 'nextAct', faction: 3 });
    expect(r).toMatchObject({
      act: 2,
      row: -1,
      secondFaction: 'dusk',
      hearts: hearts,
      phase: { kind: 'map' },
    });
    expect(mapProblems(r.map)).toEqual([]);
    const factions = new Set(cardPool(r).map((id) => getCard(id).faction));
    expect(factions).toEqual(new Set(['bastion', 'dusk']));
    // Act 2 nodes use act 2 enemies.
    r = applyChoice({ ...r, map: withFirstRow(r, 'fight') }, { t: 'move', col: 0 });
    expect(r.phase.kind === 'match' && getEnemy(r.phase.enemyId).act).toBe(2);
  });

  it('the act 2 boss offers no faction; the act 3 boss wins the run with doubled XP', () => {
    let r = applyChoice(atBoss({ ...startRun(config()), act: 2 }), { t: 'matchEnd', won: true });
    expect(r.phase.kind === 'actCleared' && r.phase.factions).toEqual([]);
    r = applyChoice(r, { t: 'nextAct', faction: null });
    expect(r.act).toBe(3);
    r = atBoss(r);
    expect(r.phase.kind === 'match' && getEnemy(r.phase.enemyId).difficulty).toBe('hard');
    const cleared = r.nodesCleared;
    r = applyChoice(r, { t: 'matchEnd', won: true });
    expect(r.phase).toEqual({ kind: 'over', won: true, abandoned: false });
    expect(nextCols(r)).toEqual([]);
    expect(runXp(r)).toBe(((cleared + 1) * NODE_XP + 2 * BOSS_XP) * 2);
  });

  it('an elite gives a relic, extra gold and a card choice', () => {
    const r = at('elite');
    expect(r.phase.kind === 'match' && getEnemy(r.phase.enemyId).kind).toBe('elite');
    const won = applyChoice(r, { t: 'matchEnd', won: true });
    if (won.phase.kind !== 'reward') throw new Error('expected a reward');
    expect(won.phase.relicId).not.toBeNull();
    expect(won.relics).toEqual([won.phase.relicId]);
    expect(won.phase.cards).toHaveLength(3);
    expect(won.phase.gold).toBeGreaterThanOrEqual(30);
  });

  it('rest can upgrade one card instead of restoring a Heart', () => {
    let r = at('rest');
    const id = r.deck[2]!;
    r = applyChoice(r, { t: 'upgrade', index: 2 });
    expect(r.deck[2]).toBe(`${id}+`);
    expect(getCard(r.deck[2]!).name).toBe(`${getCard(id).name}+`);
    const again = at('rest', { deck: r.deck });
    illegal(again, { t: 'upgrade', index: 2 });
    illegal(again, { t: 'upgrade', index: 99 });
  });

  it('events: pay costs, apply outcomes, then leave', () => {
    let r = at('event', { gold: 100 });
    if (r.phase.kind !== 'event') throw new Error('expected an event');
    expect(r.phase.chosen).toBeNull();
    illegal(r, { t: 'leave' });
    illegal(r, { t: 'event', index: 9 });
    // Every event has a free choice, so it can always be passed.
    for (const e of EVENTS) expect(e.choices.some((c) => !c.cost.gold && !c.cost.hearts)).toBe(true);
    const ev = getEvent(r.phase.eventId);
    const i = ev.choices.findIndex((c) => c.outcomes.length > 0 || c.cost.gold);
    r = applyChoice(r, { t: 'event', index: i });
    if (r.phase.kind !== 'event') throw new Error('expected an event');
    expect(r.phase.chosen).toBe(i);
    expect(r.phase.result.length).toBeGreaterThan(0);
    illegal(r, { t: 'event', index: 0 });
    expect(applyChoice(r, { t: 'leave' }).phase).toEqual({ kind: 'map' });
  });

  it('event outcomes do what they say', () => {
    const run = (id: string, index: number, extra: Partial<RunState> = {}) => {
      const r = at('event', { gold: 100, ...extra });
      return applyChoice(
        { ...r, phase: { kind: 'event', eventId: id, chosen: null, result: [] } },
        { t: 'event', index },
      );
    };
    const smith = run('event-wandering-smith', 0);
    expect(smith.gold).toBe(70);
    expect(smith.deck.filter((id) => id.endsWith('+'))).toHaveLength(2);
    const shrine = run('event-old-shrine', 1, { hearts: 2 });
    expect(shrine.hearts).toBe(1);
    expect(shrine.gold).toBe(140);
    illegal(
      {
        ...at('event', { hearts: 1 }),
        phase: { kind: 'event', eventId: 'event-old-shrine', chosen: null, result: [] },
      },
      { t: 'event', index: 1 },
    );
    illegal(
      {
        ...at('event', { gold: 0 }),
        phase: { kind: 'event', eventId: 'event-wandering-smith', chosen: null, result: [] },
      },
      { t: 'event', index: 0 },
    );
    const idol = run('event-cursed-idol', 0);
    expect(idol.relics).toHaveLength(1);
    expect(idol.hearts).toBe(2);
    const library = run('event-ruined-library', 0);
    expect(library.deck).toHaveLength(10);
    const camp = run('event-battlefield', 0);
    expect(camp.deck).toHaveLength(14);
    const well = run('event-fountain', 0, { hearts: 2 });
    expect(well.hearts).toBe(3);
    const gamble = run('event-gambler', 0);
    expect(gamble.gold).toBeGreaterThanOrEqual(75);
    expect(gamble.gold).toBeLessThanOrEqual(145);
  });

  it('a Heart relic raises the Heart limit', () => {
    const r = at('rest', { hearts: 3, relics: [] });
    illegal(r, { t: 'rest' });
    const withRelic = at('treasure', {
      hearts: 2,
      relics: RELICS.map((x) => x.id).filter((id) => id !== 'relic-fourth-heart'),
    });
    expect(withRelic.hearts).toBe(3);
    expect(withRelic.relics).toContain('relic-fourth-heart');
    expect(maxHearts(withRelic)).toBe(4);
  });

  it('rest restores a Heart (not past full) or can be left', () => {
    let r = at('rest', { hearts: 2 });
    expect(r.phase).toEqual({ kind: 'rest' });
    illegal(r, { t: 'buy', index: 0 });
    r = applyChoice(r, { t: 'rest' });
    expect(r.hearts).toBe(3);
    r = at('rest');
    illegal(r, { t: 'rest' });
    expect(applyChoice(r, { t: 'leave' }).phase).toEqual({ kind: 'map' });
  });

  it('treasure gives a free relic, or gold once every relic is owned', () => {
    let r = at('treasure');
    if (r.phase.kind !== 'treasure') throw new Error('expected treasure');
    expect(r.relics).toEqual([r.phase.relicId]);
    illegal(r, { t: 'rest' });
    expect(applyChoice(r, { t: 'leave' }).phase).toEqual({ kind: 'map' });
    r = at('treasure', { relics: RELICS.map((x) => x.id) });
    expect(r.phase).toEqual({ kind: 'treasure', relicId: null, gold: 50 });
  });

  it('shop sells cards and relics for gold, and removes one card per visit', () => {
    let r = at('shop', { gold: 500 });
    if (r.phase.kind !== 'shop') throw new Error('expected a shop');
    expect(r.phase.stock.filter((i) => i.kind === 'card')).toHaveLength(4);
    expect(r.phase.stock.filter((i) => i.kind === 'relic')).toHaveLength(2);
    const card = r.phase.stock[0]!;
    r = applyChoice(r, { t: 'buy', index: 0 });
    expect(r.gold).toBe(500 - card.price);
    expect(r.deck.at(-1)).toBe(card.id);
    illegal(r, { t: 'buy', index: 0 });
    illegal(r, { t: 'buy', index: 99 });
    r = applyChoice(r, { t: 'buy', index: 4 });
    expect(r.relics).toHaveLength(1);
    const size = r.deck.length;
    r = applyChoice(r, { t: 'removeCard', index: 0 });
    expect(r.deck).toHaveLength(size - 1);
    illegal(r, { t: 'removeCard', index: 0 });
    illegal(r, { t: 'rest' });
    expect(applyChoice(r, { t: 'leave' }).phase).toEqual({ kind: 'map' });
  });

  it('shop refuses what you cannot afford', () => {
    const r = at('shop', { gold: 0 });
    illegal(r, { t: 'buy', index: 0 });
    illegal(r, { t: 'removeCard', index: 0 });
    const rich = at('shop', { gold: REMOVE_PRICE, deck: ['ember-spark-imp'] });
    illegal(rich, { t: 'removeCard', index: 0 });
    illegal(at('shop', { gold: REMOVE_PRICE }), { t: 'removeCard', index: 99 });
  });

  it('relics change the run: discount, extra gold, extra card choice', () => {
    const shop = at('shop', { relics: ['relic-silver-tongue'] });
    const full = at('shop');
    if (shop.phase.kind !== 'shop' || full.phase.kind !== 'shop') throw new Error('expected shops');
    expect(shop.phase.stock.find((i) => i.kind === 'relic')!.price).toBe(56);
    expect(full.phase.stock.find((i) => i.kind === 'relic')!.price).toBe(75);
    const fight = applyChoice(at('fight', { relics: ['relic-merchant-purse', 'relic-keen-eye'] }), {
      t: 'matchEnd',
      won: true,
    });
    if (fight.phase.kind !== 'reward') throw new Error('expected a reward');
    expect(fight.phase.cards).toHaveLength(4);
    expect(fight.phase.gold).toBeGreaterThanOrEqual(25);
  });

  it('the run match uses the run deck, hero passive and relic modifiers', () => {
    const r = at('fight', { relics: ['relic-iron-heart'] });
    const m = runMatch(r);
    expect(m.config.decks[0]).toEqual(r.deck);
    expect(m.config.modifiers![0]).toEqual([
      ...getHero('hero-pyra').modifiers,
      ...getRelic('relic-iron-heart').modifiers,
    ]);
    expect(m.difficulty).toBe('easy');
    expect(() => runMatch(startRun(config()))).toThrow(IllegalChoiceError);
  });

  it('can be abandoned from the map and other screens', () => {
    const r = applyChoice(startRun(config()), { t: 'abandon' });
    expect(r.phase).toEqual({ kind: 'over', won: false, abandoned: true });
    expect(runXp(r)).toBe(0);
  });

  it('card pool is owned cards of the hero faction (until a second faction is added)', () => {
    const r = startRun(config(1, 'hero-aldric'));
    expect(cardPool(r).length).toBe(17);
    expect(cardPool(r).every((id) => getCard(id).faction === 'bastion')).toBe(true);
  });

  it('replaying the same choices gives the same state', () => {
    const choices = [
      { t: 'move', col: 0 },
      { t: 'matchEnd', won: true },
      { t: 'pick', index: 2 },
    ] as const;
    const a = replayRun(config(9), [...choices]);
    const b = replayRun(config(9), [...choices]);
    expect(a).toEqual(b);
    expect(a.step).toBe(3);
  });
});
