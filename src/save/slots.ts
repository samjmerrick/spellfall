// Two-slot saves: each write goes to the older slot, so a write interrupted half-way never loses the
// last good save. Loading picks the newest slot that passes validation.
import { checksum } from './checksum';
import { migrate } from './migrations';
import type { Profile } from './profile';

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export const SLOT_KEYS = ['save-slot-a', 'save-slot-b'] as const;

export interface SlotRecord {
  /** Write counter; the higher one is newer. */
  seq: number;
  checksum: string;
  json: string;
  /** When this profile was last changed on this device (ms since epoch). Cloud sync compares it with the cloud copy. Absent in older saves. */
  savedAt?: number;
}

export type LoadResult =
  | { status: 'ok'; profile: Profile; slot: 0 | 1; seq: number; fellBack: boolean; savedAt: number }
  | { status: 'empty' }
  | { status: 'corrupt'; raw: [unknown, unknown] };

function readSlot(value: unknown): { seq: number; profile: Profile; savedAt: number } | null {
  if (typeof value !== 'object' || value === null) return null;
  const rec = value as Partial<SlotRecord>;
  if (typeof rec.seq !== 'number' || typeof rec.json !== 'string' || typeof rec.checksum !== 'string')
    return null;
  if (checksum(rec.json) !== rec.checksum) return null;
  try {
    const savedAt = typeof rec.savedAt === 'number' && Number.isFinite(rec.savedAt) ? rec.savedAt : 0;
    return { seq: rec.seq, profile: migrate(JSON.parse(rec.json)), savedAt };
  } catch {
    return null;
  }
}

export async function loadProfile(store: KeyValueStore): Promise<LoadResult> {
  const raw: [unknown, unknown] = [await store.get(SLOT_KEYS[0]), await store.get(SLOT_KEYS[1])];
  if (raw[0] === undefined && raw[1] === undefined) return { status: 'empty' };
  const slots = raw.map(readSlot);
  const valid = ([0, 1] as const).filter((i) => slots[i] !== null);
  if (valid.length === 0) return { status: 'corrupt', raw };
  const best = valid.reduce((a, b) => (slots[b]!.seq > slots[a]!.seq ? b : a));
  const newestSeq = Math.max(
    ...raw.map((r) =>
      typeof r === 'object' && r && typeof (r as SlotRecord).seq === 'number' ? (r as SlotRecord).seq : -1,
    ),
  );
  return {
    status: 'ok',
    profile: slots[best]!.profile,
    slot: best,
    seq: slots[best]!.seq,
    savedAt: slots[best]!.savedAt,
    fellBack: slots[best]!.seq < newestSeq || valid.length < raw.filter((r) => r !== undefined).length,
  };
}

/**
 * Writes the profile to the older (or invalid) slot with the next sequence number. `savedAt` is the change time
 * kept for cloud sync: now for a local change, or the cloud copy's time when a pulled profile is stored.
 */
export async function saveProfile(
  store: KeyValueStore,
  profile: Profile,
  savedAt: number = Date.now(),
): Promise<{ slot: 0 | 1; seq: number }> {
  const slots = [readSlot(await store.get(SLOT_KEYS[0])), readSlot(await store.get(SLOT_KEYS[1]))];
  const seqs = slots.map((s) => s?.seq ?? -1);
  const slot: 0 | 1 = seqs[0]! <= seqs[1]! ? 0 : 1;
  const seq = Math.max(...seqs) + 1;
  const json = JSON.stringify(profile);
  const record: SlotRecord = { seq, checksum: checksum(json), json, savedAt };
  await store.set(SLOT_KEYS[slot], record);
  return { slot, seq };
}

export function memoryStore(
  initial: Record<string, unknown> = {},
): KeyValueStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: async (key) => data[key],
    set: async (key, value) => {
      data[key] = structuredClone(value);
    },
  };
}
