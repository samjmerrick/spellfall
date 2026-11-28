// The PocketBase side of cloud sync: maps CloudStore onto the `spellfall_saves` collection (one record per user and
// slot; see pocketbase/migrations). The client is typed structurally so tests can pass a mock and the game only
// loads the real SDK when cloud sync is in the build and the player asks for it.
import type { CloudRecord, CloudSlot, CloudStore } from './cloud';
import { CURRENT_SCHEMA, type Profile } from './profile';

export const SAVES_COLLECTION = 'spellfall_saves';

export interface SaveRow {
  id: string;
  slot: number;
  updatedAt: number;
  data: unknown;
}

/** The part of the PocketBase SDK client that sync uses. */
export interface PocketBaseLike {
  authStore: { isValid: boolean; record: { id: string } | null };
  collection(name: string): {
    getFullList(options?: { sort?: string }): Promise<SaveRow[]>;
    create(body: Record<string, unknown>): Promise<SaveRow>;
    update(id: string, body: Record<string, unknown>): Promise<SaveRow>;
  };
}

export function pocketBaseCloud(pb: PocketBaseLike): CloudStore {
  const rows = () => pb.collection(SAVES_COLLECTION);
  const userId = () => {
    if (!pb.authStore.isValid || !pb.authStore.record) throw new Error('Not signed in');
    return pb.authStore.record.id;
  };
  // Record ids by slot, remembered from the last list() so a write is a plain update.
  const ids = new Map<number, string>();
  const refresh = async () => {
    const list = await rows().getFullList();
    ids.clear();
    for (const r of list) ids.set(r.slot, r.id);
    return list;
  };

  return {
    async list(): Promise<CloudRecord[]> {
      userId();
      return (await refresh())
        .filter((r) => r.slot === 1 || r.slot === 2)
        .map((r) => ({ slot: r.slot as CloudSlot, updatedAt: r.updatedAt, data: r.data }));
    },
    async write(slot, updatedAt, profile: Profile) {
      const body = { slot, updatedAt, schemaVersion: CURRENT_SCHEMA, data: profile };
      const existing = ids.get(slot);
      if (existing) {
        await rows().update(existing, body);
        return;
      }
      try {
        const created = await rows().create({ ...body, user: userId() });
        ids.set(slot, created.id);
      } catch (err) {
        // Another device created this slot since list(): the unique (user, slot) index refused it. Update instead.
        await refresh();
        const raced = ids.get(slot);
        if (!raced) throw err;
        await rows().update(raced, body);
      }
    },
  };
}
