// Cloud sync: local-first. The device's save is always the one the game reads and writes; the cloud is an optional
// copy behind a signed-in account. Nothing here talks to PocketBase directly (see pocketbase.ts), so it can be
// tested with an in-memory CloudStore.
//
// Conflict rule (deliberately simple): the copy with the newest change time wins, as a whole. There is no merging of
// two profiles. The change time is `savedAt` locally (set on every local save) and `updatedAt` in the cloud (copied
// from `savedAt` when pushed), so a profile that was pulled keeps the time it was last changed, not the time it was
// downloaded. Anything pulled down goes through `migrate`, so the Zod schema and the migrations validate it exactly
// like a save code; a record that fails validation is ignored, never loaded.
//
// Safety nets: the cloud keeps two slots per user, like the local store, and a push always overwrites the older one,
// so the previous cloud copy survives one push. A pull stores the displaced local save under REPLACED_KEY first.
import { loadProfile, saveProfile, type KeyValueStore } from './slots';
import { CURRENT_SCHEMA, type Profile } from './profile';
import { migrate } from './migrations';

/** Where the local save that a pull replaced is kept (one copy; export it from the browser tools if needed). */
export const REPLACED_KEY = 'save-replaced-by-sync';

export type CloudSlot = 1 | 2;
export const CLOUD_SLOTS: readonly CloudSlot[] = [1, 2];

/** One stored cloud copy. `data` is untrusted until `migrate` accepts it. */
export interface CloudRecord {
  slot: CloudSlot;
  /** Change time of the profile in `data`, in ms since the epoch. */
  updatedAt: number;
  data: unknown;
}

export interface CloudStore {
  list(): Promise<CloudRecord[]>;
  write(slot: CloudSlot, updatedAt: number, profile: Profile): Promise<void>;
}

export type SyncResult =
  | { action: 'pushed'; updatedAt: number }
  | { action: 'pulled'; profile: Profile; updatedAt: number }
  | { action: 'none'; reason: 'in-sync' | 'nothing-to-sync' | 'remote-newer' | 'app-outdated' };

interface Candidate {
  record: CloudRecord;
  /** Null when the record is unreadable. */
  profile: Profile | null;
  tooNew: boolean;
}

function inspect(record: CloudRecord): Candidate {
  const version = (record.data as { schemaVersion?: unknown } | null)?.schemaVersion;
  const tooNew = typeof version === 'number' && version > CURRENT_SCHEMA;
  if (tooNew || typeof record.updatedAt !== 'number') return { record, profile: null, tooNew };
  try {
    return { record, profile: migrate(record.data), tooNew: false };
  } catch {
    return { record, profile: null, tooNew: false };
  }
}

/** The slot a push should overwrite: an empty one, else an unreadable one, else the one with the older copy. */
function pushTarget(candidates: Candidate[]): CloudSlot {
  const bySlot = new Map(candidates.map((c) => [c.record.slot, c]));
  const empty = CLOUD_SLOTS.find((s) => !bySlot.has(s));
  if (empty) return empty;
  const unreadable = CLOUD_SLOTS.find((s) => bySlot.get(s)!.profile === null);
  if (unreadable) return unreadable;
  const [a, b] = CLOUD_SLOTS.map((s) => bySlot.get(s)!);
  return a!.record.updatedAt <= b!.record.updatedAt ? a!.record.slot : b!.record.slot;
}

/**
 * Brings the local save and the cloud copy in line. Reads the local store and writes only to the cloud; a pulled
 * profile is returned for the caller to store (with `saveProfile(store, profile, updatedAt)`) and show, so it can
 * decline to swap profiles while a match is in progress. `allowPull: false` is for background syncs after a local
 * change: they only ever push, and report `remote-newer` instead of pulling.
 */
export async function syncProfile(
  store: KeyValueStore,
  cloud: CloudStore,
  options: { allowPull: boolean },
): Promise<SyncResult> {
  const local = await loadProfile(store);
  const candidates = (await cloud.list()).map(inspect);
  const readable = candidates.filter((c) => c.profile !== null);
  const newest = [...candidates].sort((a, b) => b.record.updatedAt - a.record.updatedAt)[0];

  // A newer version of the game wrote the newest copy: leave it alone rather than overwrite what we can't read.
  if (newest?.tooNew) return { action: 'none', reason: 'app-outdated' };

  const remote = readable.sort((a, b) => b.record.updatedAt - a.record.updatedAt)[0];
  if (!remote) {
    if (local.status !== 'ok') return { action: 'none', reason: 'nothing-to-sync' };
    await cloud.write(pushTarget(candidates), local.savedAt, local.profile);
    return { action: 'pushed', updatedAt: local.savedAt };
  }
  const remoteTime = remote.record.updatedAt;
  if (local.status === 'ok' && local.savedAt === remoteTime) return { action: 'none', reason: 'in-sync' };
  if (local.status !== 'ok' || remoteTime > local.savedAt) {
    if (!options.allowPull) return { action: 'none', reason: 'remote-newer' };
    if (local.status === 'ok')
      await store.set(REPLACED_KEY, { savedAt: local.savedAt, profile: local.profile });
    if (local.status === 'corrupt') await store.set(REPLACED_KEY, { raw: local.raw });
    return { action: 'pulled', profile: remote.profile!, updatedAt: remoteTime };
  }
  await cloud.write(pushTarget(candidates), local.savedAt, local.profile);
  return { action: 'pushed', updatedAt: local.savedAt };
}

/** Stores a pulled profile locally, keeping its cloud change time. */
export function storePulled(store: KeyValueStore, result: Extract<SyncResult, { action: 'pulled' }>) {
  return saveProfile(store, result.profile, result.updatedAt);
}
