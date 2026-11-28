import { describe, expect, it, vi } from 'vitest';
import fixtureV8 from '../fixtures/save-v8.json';
import {
  CURRENT_SCHEMA,
  loadProfile,
  memoryStore,
  newProfile,
  pocketBaseCloud,
  REPLACED_KEY,
  saveProfile,
  SAVES_COLLECTION,
  storePulled,
  syncProfile,
  type CloudRecord,
  type CloudSlot,
  type CloudStore,
  type PocketBaseLike,
  type Profile,
  type SaveRow,
} from '../../src/save';

function profile(name: string): Profile {
  const p = newProfile();
  p.decks.push({ id: 'd1', name, cover: 'ember-spark-imp', cards: ['ember-spark-imp'] });
  p.nextDeckId = 2;
  return p;
}

/** In-memory CloudStore that records its writes. */
function fakeCloud(initial: CloudRecord[] = []) {
  const records = new Map<CloudSlot, CloudRecord>(initial.map((r) => [r.slot, r]));
  const writes: { slot: CloudSlot; updatedAt: number }[] = [];
  const cloud: CloudStore = {
    list: async () => [...records.values()],
    write: async (slot, updatedAt, p) => {
      writes.push({ slot, updatedAt });
      records.set(slot, { slot, updatedAt, data: structuredClone(p) });
    },
  };
  return { cloud, records, writes };
}

const rec = (slot: CloudSlot, updatedAt: number, data: unknown): CloudRecord => ({ slot, updatedAt, data });
const deckName = (p: Profile) => p.decks[0]?.name;

describe('syncProfile', () => {
  it('does nothing with an empty device and an empty cloud', async () => {
    const { cloud, writes } = fakeCloud();
    const r = await syncProfile(memoryStore(), cloud, { allowPull: true });
    expect(r).toEqual({ action: 'none', reason: 'nothing-to-sync' });
    expect(writes).toEqual([]);
  });

  it('pushes the local save to an empty cloud, keeping its change time', async () => {
    const store = memoryStore();
    await saveProfile(store, profile('local'), 1000);
    const { cloud, records } = fakeCloud();
    const r = await syncProfile(store, cloud, { allowPull: false });
    expect(r).toEqual({ action: 'pushed', updatedAt: 1000 });
    expect(records.get(1)?.updatedAt).toBe(1000);
    expect(deckName(records.get(1)!.data as Profile)).toBe('local');
  });

  it('pushes when the local save is newer, into the older cloud slot', async () => {
    const store = memoryStore();
    await saveProfile(store, profile('new'), 3000);
    const { cloud, records } = fakeCloud([rec(1, 2000, profile('mid')), rec(2, 1000, profile('old'))]);
    const r = await syncProfile(store, cloud, { allowPull: false });
    expect(r).toEqual({ action: 'pushed', updatedAt: 3000 });
    // Slot 1 (the previous newest) survives as the cloud's backup; the oldest is replaced.
    expect(deckName(records.get(1)!.data as Profile)).toBe('mid');
    expect(deckName(records.get(2)!.data as Profile)).toBe('new');
  });

  it('is a no-op when both copies have the same change time', async () => {
    const store = memoryStore();
    await saveProfile(store, profile('same'), 5000);
    const { cloud, writes } = fakeCloud([rec(1, 5000, profile('same'))]);
    expect(await syncProfile(store, cloud, { allowPull: true })).toEqual({
      action: 'none',
      reason: 'in-sync',
    });
    expect(writes).toEqual([]);
  });

  it('pulls a newer cloud copy and keeps the replaced local save', async () => {
    const store = memoryStore();
    await saveProfile(store, profile('local'), 1000);
    const { cloud, writes } = fakeCloud([rec(2, 2000, profile('cloud'))]);
    const r = await syncProfile(store, cloud, { allowPull: true });
    if (r.action !== 'pulled') throw new Error('expected a pull');
    expect(deckName(r.profile)).toBe('cloud');
    expect(r.updatedAt).toBe(2000);
    expect(writes).toEqual([]);
    expect(store.data[REPLACED_KEY]).toMatchObject({ savedAt: 1000 });
    // The caller stores it with the cloud's time, so the next sync sees both sides as equal.
    await storePulled(store, r);
    const loaded = await loadProfile(store);
    expect(loaded).toMatchObject({ status: 'ok', savedAt: 2000 });
    expect(await syncProfile(store, cloud, { allowPull: true })).toEqual({
      action: 'none',
      reason: 'in-sync',
    });
  });

  it('does not pull in a background (push-only) sync', async () => {
    const store = memoryStore();
    await saveProfile(store, profile('local'), 1000);
    const { cloud, writes } = fakeCloud([rec(1, 2000, profile('cloud'))]);
    expect(await syncProfile(store, cloud, { allowPull: false })).toEqual({
      action: 'none',
      reason: 'remote-newer',
    });
    expect(writes).toEqual([]);
    expect(store.data[REPLACED_KEY]).toBeUndefined();
  });

  it('pulls into an empty device', async () => {
    const { cloud } = fakeCloud([rec(1, 2000, profile('cloud'))]);
    const store = memoryStore();
    const r = await syncProfile(store, cloud, { allowPull: true });
    expect(r.action).toBe('pulled');
    expect(store.data[REPLACED_KEY]).toBeUndefined();
  });

  it('treats a save from before sync existed (no change time) as older than any cloud copy', async () => {
    const store = memoryStore();
    await saveProfile(store, profile('legacy'), 1000);
    const slot = store.data['save-slot-a'] as { savedAt?: number };
    delete slot.savedAt;
    const { cloud } = fakeCloud([rec(1, 1, profile('cloud'))]);
    expect((await syncProfile(store, cloud, { allowPull: true })).action).toBe('pulled');
  });

  it('replaces a corrupt local save with the cloud copy, keeping the raw data', async () => {
    const store = memoryStore({ 'save-slot-a': { seq: 1, json: '{', checksum: 'x' } });
    const { cloud } = fakeCloud([rec(1, 10, profile('cloud'))]);
    expect((await syncProfile(store, cloud, { allowPull: true })).action).toBe('pulled');
    expect(store.data[REPLACED_KEY]).toHaveProperty('raw');
  });

  it('ignores unreadable cloud records and overwrites them on the next push', async () => {
    const store = memoryStore();
    await saveProfile(store, profile('local'), 1000);
    const junk = { schemaVersion: CURRENT_SCHEMA, decks: 'nope' };
    const { cloud, records } = fakeCloud([rec(1, 9000, junk), rec(2, 500, profile('older'))]);
    const r = await syncProfile(store, cloud, { allowPull: true });
    // The junk record is newer by time but never loaded; the local save is newer than the readable one.
    expect(r).toEqual({ action: 'pushed', updatedAt: 1000 });
    expect(deckName(records.get(1)!.data as Profile)).toBe('local');
    expect(deckName(records.get(2)!.data as Profile)).toBe('older');
  });

  it('does nothing with only unreadable cloud records and an empty device', async () => {
    const { cloud } = fakeCloud([rec(1, 9000, 'garbage'), rec(2, 1, null)]);
    expect(await syncProfile(memoryStore(), cloud, { allowPull: true })).toEqual({
      action: 'none',
      reason: 'nothing-to-sync',
    });
  });

  it('migrates an older-schema cloud copy before using it', async () => {
    const { cloud } = fakeCloud([rec(1, 2000, fixtureV8)]);
    const r = await syncProfile(memoryStore(), cloud, { allowPull: true });
    if (r.action !== 'pulled') throw new Error('expected a pull');
    expect(r.profile.schemaVersion).toBe(CURRENT_SCHEMA);
  });

  it('leaves a copy from a newer version of the game alone', async () => {
    const store = memoryStore();
    await saveProfile(store, profile('local'), 9999);
    const { cloud, writes } = fakeCloud([rec(1, 5000, { schemaVersion: CURRENT_SCHEMA + 1 })]);
    expect(await syncProfile(store, cloud, { allowPull: true })).toEqual({
      action: 'none',
      reason: 'app-outdated',
    });
    expect(writes).toEqual([]);
  });

  it('prefers an unreadable slot as the push target', async () => {
    const store = memoryStore();
    await saveProfile(store, profile('local'), 3000);
    const { cloud, records } = fakeCloud([rec(1, 1000, profile('old')), rec(2, 2000, 'garbage')]);
    // slot 1 is the only readable copy (older than local) and must survive; the junk slot 2 is overwritten
    await syncProfile(store, cloud, { allowPull: false });
    expect(deckName(records.get(1)!.data as Profile)).toBe('old');
    expect(deckName(records.get(2)!.data as Profile)).toBe('local');
  });
});

describe('pocketBaseCloud', () => {
  function mockPb(rows: SaveRow[], opts: { signedIn?: boolean; failCreateOnce?: boolean } = {}) {
    const calls = { create: vi.fn(), update: vi.fn() };
    let failCreate = opts.failCreateOnce ?? false;
    const pb: PocketBaseLike = {
      authStore: {
        isValid: opts.signedIn ?? true,
        record: opts.signedIn === false ? null : { id: 'user1' },
      },
      collection: (name) => {
        expect(name).toBe(SAVES_COLLECTION);
        return {
          getFullList: async () => rows.map((r) => ({ ...r })),
          create: async (body) => {
            calls.create(body);
            if (failCreate) {
              failCreate = false;
              // another device won the race: its row now exists
              rows.push({ id: 'raced', slot: body.slot as number, updatedAt: 1, data: {} });
              throw new Error('unique');
            }
            return { id: 'new', slot: body.slot as number, updatedAt: 0, data: body.data };
          },
          update: async (id, body) => {
            calls.update(id, body);
            return { id, slot: body.slot as number, updatedAt: 0, data: body.data };
          },
        };
      },
    };
    return { pb, calls };
  }

  it('lists the user rows as cloud records and ignores unknown slots', async () => {
    const { pb } = mockPb([
      { id: 'a', slot: 1, updatedAt: 10, data: { x: 1 } },
      { id: 'b', slot: 7, updatedAt: 20, data: {} },
    ]);
    expect(await pocketBaseCloud(pb).list()).toEqual([{ slot: 1, updatedAt: 10, data: { x: 1 } }]);
  });

  it('refuses to work when signed out', async () => {
    const { pb } = mockPb([], { signedIn: false });
    const cloud = pocketBaseCloud(pb);
    await expect(cloud.list()).rejects.toThrow('Not signed in');
    await expect(cloud.write(1, 5, newProfile())).rejects.toThrow('Not signed in');
  });

  it('creates a missing slot for the signed-in user, then updates it', async () => {
    const { pb, calls } = mockPb([]);
    const cloud = pocketBaseCloud(pb);
    await cloud.list();
    await cloud.write(1, 5, newProfile());
    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'user1', slot: 1, updatedAt: 5, schemaVersion: CURRENT_SCHEMA }),
    );
    await cloud.write(1, 6, newProfile());
    expect(calls.update).toHaveBeenCalledWith('new', expect.objectContaining({ updatedAt: 6 }));
  });

  it('updates an existing slot found by list()', async () => {
    const { pb, calls } = mockPb([{ id: 'row2', slot: 2, updatedAt: 1, data: {} }]);
    const cloud = pocketBaseCloud(pb);
    await cloud.list();
    await cloud.write(2, 9, newProfile());
    expect(calls.update).toHaveBeenCalledWith('row2', expect.objectContaining({ updatedAt: 9 }));
    expect(calls.create).not.toHaveBeenCalled();
  });

  it('falls back to an update when another device created the slot first', async () => {
    const { pb, calls } = mockPb([], { failCreateOnce: true });
    await pocketBaseCloud(pb).write(1, 9, newProfile());
    expect(calls.update).toHaveBeenCalledWith('raced', expect.objectContaining({ updatedAt: 9 }));
  });

  it('rethrows a failed create when no row appeared', async () => {
    const { pb } = mockPb([]);
    const failing: PocketBaseLike = {
      ...pb,
      collection: () => ({
        getFullList: async () => [],
        create: async () => {
          throw new Error('offline');
        },
        update: async () => {
          throw new Error('unused');
        },
      }),
    };
    await expect(pocketBaseCloud(failing).write(1, 1, newProfile())).rejects.toThrow('offline');
  });
});
