import { createStore, get, set } from 'idb-keyval';
import type { KeyValueStore } from './slots';

export * from './profile';
export * from './slots';
export * from './code';
export { migrate } from './migrations';

/**
 * The browser's IndexedDB, through idb-keyval. Spellfall has its own database, so it never reads or overwrites a
 * Lanefall save served from the same origin (both live on the same github.io host).
 */
let db: ReturnType<typeof createStore> | undefined;
const store = () => (db ??= createStore('spellfall', 'keyval'));
export const idbStore: KeyValueStore = {
  get: (key) => get(key, store()),
  set: (key, value) => set(key, value, store()),
};

export type PersistStatus = 'granted' | 'denied' | 'unsupported';

/** Asks the browser not to evict our storage. Safe to call on every launch. */
export async function requestPersistence(): Promise<PersistStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}
