// Optional cloud saves, UI side. The game never waits for this: it plays and saves locally exactly as when signed
// out. When the player signs in (PocketBase Google OAuth2 popup) the profile is synced with `spellfall_saves` using
// the rules in src/save/cloud.ts (newest change wins).
import { create } from 'zustand';
import { pocketBaseCloud, syncProfile } from '../save';
import { getStore, persistProfile, flushSaves, useApp, type Screen } from './app';

type PocketBaseClient = import('pocketbase').default;

export type CloudStatus =
  'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'remote-newer' | 'app-outdated';

interface CloudState {
  /** The server answers (or the player is already signed in). */
  available: boolean;
  /** Email of the signed-in account, or null. */
  user: string | null;
  status: CloudStatus;
  /** Shown under the buttons: what the last sync did, or what went wrong. */
  message: string | null;
}

export const useCloud = create<CloudState>(() => ({
  available: false,
  user: null,
  status: 'idle',
  message: null,
}));

const AUTH_KEY = 'pocketbase_auth'; // the SDK's localStorage key
const PUSH_DELAY_MS = 4000;
/** Screens where swapping in a pulled profile can't disturb a match or run in progress. */
const SAFE_SCREENS: Screen[] = ['menu', 'settings', 'stats', 'decks', 'collection', 'quickplay', 'runStart'];

let clientPromise: Promise<PocketBaseClient> | undefined;
function client(): Promise<PocketBaseClient> {
  // Same-origin PocketBase: `/` is the host root even though the game lives under /spellfall/.
  clientPromise ??= import('pocketbase').then((m) => new m.default('/'));
  return clientPromise;
}

const hasStoredAuth = () => {
  try {
    return !!localStorage.getItem(AUTH_KEY);
  } catch {
    return false;
  }
};

const displayName = (pb: PocketBaseClient) => pb.authStore.record?.email || pb.authStore.record?.id || null;

const failure = (err: unknown): Partial<CloudState> =>
  err instanceof TypeError || (err as { status?: number })?.status === 0
    ? { status: 'offline', message: 'Offline: your save is safe on this device and will sync later.' }
    : { status: 'error', message: err instanceof Error ? err.message : 'Cloud sync failed.' };

/** Whether the same-origin server answers; the Cloud save section only appears when it does. */
async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    return ((await res.json()) as { code?: number }).code === 200;
  } catch {
    return false;
  }
}

/** Preloads the SDK (so the sign-in popup opens straight from the tap) and checks the server. */
export async function prepareCloud() {
  const pb = await client().catch(() => null);
  const user = pb?.authStore.isValid ? displayName(pb) : null;
  useCloud.setState({ available: user !== null || (await serverReachable()), user });
}

let running: Promise<void> | null = null;
let again: { allowPull: boolean } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** One sync at a time; a request that arrives meanwhile runs afterwards. */
export function syncNow(allowPull = true): Promise<void> {
  if (running) {
    again = { allowPull: allowPull || !!again?.allowPull };
    return running;
  }
  running = runSync(allowPull).finally(() => {
    running = null;
    if (again) {
      const next = again;
      again = null;
      void syncNow(next.allowPull);
    }
  });
  return running;
}

async function runSync(allowPull: boolean) {
  const pb = await client();
  if (!pb.authStore.isValid) return;
  useCloud.setState({ status: 'syncing', message: null });
  try {
    await flushSaves();
    const before = useApp.getState().profile;
    const result = await syncProfile(getStore(), pocketBaseCloud(pb), { allowPull });
    if (result.action === 'pulled') {
      const app = useApp.getState();
      // The player moved on while we were syncing, or is in a match: leave their profile alone.
      if (app.profile !== before || !SAFE_SCREENS.includes(app.screen)) {
        useCloud.setState({
          status: 'remote-newer',
          message: 'A newer cloud save is waiting. Open Settings and tap Sync now to load it.',
        });
        return;
      }
      await persistProfile(result.profile, result.updatedAt);
      useApp.setState({ profile: result.profile, fellBack: false });
      useCloud.setState({ status: 'synced', message: 'Loaded a newer save from the cloud.' });
    } else if (result.action === 'pushed') {
      useCloud.setState({ status: 'synced', message: 'Saved to the cloud.' });
    } else if (result.reason === 'remote-newer') {
      useCloud.setState({
        status: 'remote-newer',
        message: 'A newer cloud save exists. Tap Sync now to load it (this replaces this device’s save).',
      });
    } else if (result.reason === 'app-outdated') {
      useCloud.setState({
        status: 'app-outdated',
        message: 'The cloud save is from a newer version of the game. Reload to update.',
      });
    } else {
      useCloud.setState({ status: 'synced', message: 'Up to date.' });
    }
  } catch (err) {
    useCloud.setState(failure(err));
  }
}

export async function signIn() {
  try {
    const pb = await client();
    await pb.collection('users').authWithOAuth2({ provider: 'google' });
    useCloud.setState({ user: displayName(pb), status: 'idle', message: null });
    await syncNow(true);
  } catch (err) {
    useCloud.setState(failure(err));
  }
}

export async function signOut() {
  clearTimeout(timer);
  (await client()).authStore.clear();
  // The local save stays exactly as it is.
  useCloud.setState({ user: null, status: 'idle', message: 'Signed out. Your save stays on this device.' });
}

/** Call once after the game has booted. Does nothing for signed-out players. */
let started = false;
export function initCloud() {
  if (started) return;
  started = true;
  // After a local change, push in the background (never pull: that is only at start-up or on Sync now).
  useApp.subscribe((state, prev) => {
    if (state.profile === prev.profile || !useCloud.getState().user) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(false), PUSH_DELAY_MS);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && useCloud.getState().user) {
      clearTimeout(timer);
      void syncNow(false);
    }
  });
  if (!hasStoredAuth()) return; // signed out: no SDK, no network
  void (async () => {
    await prepareCloud();
    const pb = await client();
    try {
      await pb.collection('users').authRefresh();
    } catch (err) {
      // A rejected token (401/403) means signed out; a network error keeps the session for later.
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        pb.authStore.clear();
        useCloud.setState({ user: null });
        return;
      }
    }
    await syncNow(true);
  })();
}
