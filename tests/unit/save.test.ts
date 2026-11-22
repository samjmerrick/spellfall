import { describe, expect, it } from 'vitest';
import fixtureV1 from '../fixtures/save-v1.json';
import fixtureV2 from '../fixtures/save-v2.json';
import fixtureV3 from '../fixtures/save-v3.json';
import fixtureV4 from '../fixtures/save-v4.json';
import fixtureV5 from '../fixtures/save-v5.json';
import fixtureV6 from '../fixtures/save-v6.json';
import {
  CURRENT_SCHEMA,
  exportSaveCode,
  importSaveCode,
  loadProfile,
  memoryStore,
  migrate,
  newProfile,
  saveProfile,
  SLOT_KEYS,
  type Profile,
} from '../../src/save';
import { RELICS, replayRun, unlockedIds } from '../../src/run';

function sample(): Profile {
  const p = newProfile();
  p.xp = 340;
  p.level = 3;
  p.decks.push({
    id: 'd1',
    name: 'Mine',
    cover: 'ember-spark-imp',
    cards: ['ember-spark-imp', 'ember-fireball'],
  });
  p.nextDeckId = 2;
  p.stats.quickPlay['pre-ember'] = { played: 4, won: 1 };
  return p;
}

describe('schema and migrations', () => {
  it('migrates the stored v1 sample save to the current schema', () => {
    const p = migrate(fixtureV1);
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(p.activeRun).toBeNull();
    expect(p.stats.runs).toEqual({});
    expect(p.decks[0]!.name).toBe('Fixture Deck');
    expect(p.stats.quickPlay.d1).toEqual({ played: 3, won: 2 });
  });

  it('migrates the stored v2 sample save to v3, dropping its run in progress', () => {
    const p = migrate(fixtureV2);
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(p.stats.runs['hero-pyra']).toEqual({ played: 2, won: 1 });
    expect(p.activeRun).toBeNull();
  });

  it('migrates the stored v3 sample save to v4: level and unlocks from XP, Ascension, run config', () => {
    const p = migrate(fixtureV3);
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA);
    // 120 XP is below the 150 needed for level 2 (the old save had a stale level).
    expect(p.level).toBe(1);
    expect(p.unlocks).toEqual([]);
    // It had a run win, so Ascension 1 opens.
    expect(p.ascension).toEqual({ best: 0, unlocked: 1 });
    const run = p.activeRun!;
    expect(run.choices).toEqual([{ t: 'move', col: 1 }]);
    expect(run.config.ascension).toBe(0);
    expect(run.config.relics).toEqual(RELICS.map((r) => r.id));
    // The run still replays, with every relic in its pool as before.
    expect(replayRun(run.config, run.choices).step).toBe(1);
    expect(() =>
      migrate({ ...fixtureV3, activeRun: { ...fixtureV3.activeRun, choices: [{ t: 'fly' }] } }),
    ).toThrow();
  });

  it('the v3 migration keeps unlocks consistent with a high XP total and no runs won', () => {
    const p = migrate({ ...fixtureV3, xp: 100000, stats: { quickPlay: {}, runs: {} }, activeRun: null });
    expect(p.level).toBe(30);
    expect(p.unlocks).toEqual(unlockedIds(30));
    expect(p.ascension).toEqual({ best: 0, unlocked: 0 });
    expect(p.activeRun).toBeNull();
    expect(migrate({ ...fixtureV3, ascension: { best: 10 } }).ascension).toEqual({ best: 10, unlocked: 10 });
  });

  it('migrates the stored v4 sample save to v5: Sound and Haptics on, tutorial done, tip unseen', () => {
    const p = migrate(fixtureV4);
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(p.settings).toEqual({
      fastAnimations: true,
      reduceMotion: false,
      sound: true,
      haptics: true,
      autoPass: true,
    });
    expect(p.tutorialDone).toBe(true);
    expect(p.iosTipSeen).toBe(false);
    // Everything else is untouched.
    expect(p.xp).toBe(640);
    expect(p.decks).toHaveLength(1);
    expect(p.activeRun!.choices).toEqual([{ t: 'move', col: 1 }]);
  });

  it('migrates the stored v5 sample save to v6: Auto-pass on, everything else kept', () => {
    const p = migrate(fixtureV5);
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(p.settings).toEqual({ ...fixtureV5.settings, autoPass: true });
    expect(p.tutorialDone).toBe(true);
    expect(p.iosTipSeen).toBe(true);
  });

  it('migrates the stored v6 sample save to v7: a Lanefall match in progress is dropped, the run kept', () => {
    expect(fixtureV6.activeRun!.match).not.toBeNull();
    const p = migrate(fixtureV6);
    expect(p.schemaVersion).toBe(7);
    expect(p.activeRun!.match).toBeNull();
    expect(p.activeRun!.choices).toEqual(fixtureV6.activeRun!.choices);
    expect(p.settings.autoPass).toBe(false);
    expect(migrate({ ...fixtureV6, activeRun: null }).activeRun).toBeNull();
  });

  it('the v4 migration marks the tutorial done only when the profile has XP or results', () => {
    const fresh = {
      ...fixtureV4,
      xp: 0,
      level: 1,
      unlocks: [],
      stats: { quickPlay: {}, runs: {} },
      activeRun: null,
    };
    expect(migrate(fresh).tutorialDone).toBe(false);
    expect(migrate({ ...fresh, xp: 10 }).tutorialDone).toBe(true);
    expect(
      migrate({ ...fresh, stats: { quickPlay: { d1: { played: 1, won: 0 } }, runs: {} } }).tutorialDone,
    ).toBe(true);
  });

  it('save codes round-trip a v5 profile', async () => {
    const p = migrate(fixtureV3);
    expect(await importSaveCode(await exportSaveCode(p))).toEqual(p);
    expect(() =>
      migrate({ ...fixtureV3, activeRun: { ...fixtureV3.activeRun, choices: [{ t: 'fly' }] } }),
    ).toThrow();
    expect(() =>
      migrate({ ...fixtureV3, activeRun: { ...fixtureV3.activeRun, choices: [{ t: 'fly' }] } }),
    ).toThrow();
  });

  it('rejects saves without a schema version, from the future, or malformed', () => {
    expect(() => migrate(null)).toThrow(/not an object/);
    expect(() => migrate({})).toThrow(/schemaVersion/);
    expect(() => migrate({ ...fixtureV1, schemaVersion: 99 })).toThrow(/newer version/);
    expect(() => migrate({ ...fixtureV1, xp: -5 })).toThrow();
  });

  it('a new profile is valid', () => {
    expect(migrate(newProfile())).toEqual(newProfile());
  });
});

describe('two save slots', () => {
  it('starts empty, then loads what was saved', async () => {
    const store = memoryStore();
    expect(await loadProfile(store)).toEqual({ status: 'empty' });
    await saveProfile(store, sample());
    const res = await loadProfile(store);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.profile).toEqual(sample());
  });

  it('alternates slots, always writing the older one', async () => {
    const store = memoryStore();
    const writes = [];
    for (let i = 0; i < 4; i++) writes.push(await saveProfile(store, { ...sample(), xp: i }));
    expect(writes.map((w) => w.slot)).toEqual([0, 1, 0, 1]);
    expect(writes.map((w) => w.seq)).toEqual([0, 1, 2, 3]);
    const res = await loadProfile(store);
    expect(res.status === 'ok' && res.profile.xp).toBe(3);
  });

  it('falls back to the other slot when the newest is corrupted', async () => {
    const store = memoryStore();
    await saveProfile(store, { ...sample(), xp: 1 });
    const { slot } = await saveProfile(store, { ...sample(), xp: 2 });
    const rec = store.data[SLOT_KEYS[slot]] as { json: string };
    rec.json = rec.json.replace('"xp":2', '"xp":9'); // checksum no longer matches
    const res = await loadProfile(store);
    expect(res).toMatchObject({ status: 'ok', fellBack: true });
    expect(res.status === 'ok' && res.profile.xp).toBe(1);
    // The next write replaces the corrupted slot, not the good one.
    const next = await saveProfile(store, { ...sample(), xp: 3 });
    expect(next.slot).toBe(slot);
  });

  it('falls back when a slot holds garbage or an invalid profile', async () => {
    const store = memoryStore();
    await saveProfile(store, { ...sample(), xp: 1 });
    store.data[SLOT_KEYS[1]] = 'garbage';
    expect((await loadProfile(store)).status).toBe('ok');
    const json = JSON.stringify({ schemaVersion: 1 });
    const { checksum } = await import('../../src/save/checksum');
    store.data[SLOT_KEYS[1]] = { seq: 50, json, checksum: checksum(json) };
    const res = await loadProfile(store);
    expect(res.status === 'ok' && res.profile.xp).toBe(1);
  });

  it('reports both slots corrupt and keeps the raw data for export', async () => {
    const store = memoryStore({ [SLOT_KEYS[0]]: { seq: 1, json: '{', checksum: 'x' }, [SLOT_KEYS[1]]: 42 });
    const res = await loadProfile(store);
    expect(res.status).toBe('corrupt');
    if (res.status === 'corrupt') expect(res.raw[1]).toBe(42);
  });
});

describe('save codes', () => {
  it('export then import gives an identical profile', async () => {
    const code = await exportSaveCode(sample());
    expect(code).toMatch(/^SS1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
    expect(await importSaveCode(code)).toEqual(sample());
  });

  it('rejects damaged or foreign codes', async () => {
    const code = await exportSaveCode(sample());
    await expect(importSaveCode('nope')).rejects.toThrow(/not a Spellfall save code/);
    await expect(importSaveCode(code.replace(/\.[0-9a-f]{8}$/, '.00000000'))).rejects.toThrow(/checksum/);
    await expect(importSaveCode('SS1.@@@@.00000000')).rejects.toThrow(/damaged/);
    const bad = await exportSaveCode({ ...sample(), level: 0 });
    await expect(importSaveCode(bad)).rejects.toThrow(/not a valid save/);
  });
});
