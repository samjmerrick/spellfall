import { create } from 'zustand';
import type { Difficulty } from '../ai';
import { PREBUILT_DECKS, type DeckDef } from '../engine';
import { grantXp, ownedCardIds, type UnlockBundle } from '../run/meta';
import {
  idbStore,
  importSaveCode,
  loadProfile,
  memoryStore,
  newProfile,
  requestPersistence,
  saveProfile,
  MAX_SAVED_DECKS,
  type KeyValueStore,
  type PersistStatus,
  type Profile,
  type SavedDeck,
} from '../save';

export type Screen =
  | 'loading'
  | 'corrupt'
  | 'menu'
  | 'quickplay'
  | 'decks'
  | 'builder'
  | 'collection'
  | 'settings'
  | 'stats'
  | 'match'
  | 'duel'
  | 'runStart'
  | 'run'
  | 'runSummary';

/** A deck the player can pick for Quick Play: pre-built or saved. */
export interface DeckChoice {
  id: string;
  name: string;
  cover: string;
  cards: string[];
  prebuilt: boolean;
}

export interface Draft {
  /** Saved deck being edited, or null for a new deck. */
  id: string | null;
  name: string;
  cover: string | null;
  cards: string[];
}

interface AppStore {
  screen: Screen;
  profile: Profile;
  persist: PersistStatus | null;
  storageWorks: boolean;
  /** True when the newest save slot was damaged and an older one was loaded. */
  fellBack: boolean;
  corruptRaw: unknown;
  draft: Draft | null;
  quickPlay: { deckId: string; difficulty: Difficulty };
  /** Bundles unlocked since the UI last cleared them (for the level-up overlay), in level order. */
  lastUnlocks: UnlockBundle[];

  boot(): Promise<void>;
  go(screen: Screen): void;
  update(f: (p: Profile) => Profile): void;
  /** Changes some settings and autosaves. */
  setSettings(change: Partial<Profile['settings']>): void;
  /** Marks the iOS home-screen tip as seen. Autosaves. */
  dismissIosTip(): void;
  /** Marks the tutorial as done (finished or skipped). Autosaves. */
  completeTutorial(): void;
  /** Applies `change` (if any), then adds XP: level, unlocks and `lastUnlocks` follow. Autosaves. */
  awardXp(xp: number, change?: (p: Profile) => Profile): void;
  clearUnlocks(): void;
  newDraft(from?: DeckChoice): void;
  editDeck(id: string): void;
  setDraft(d: Draft): void;
  saveDraft(): string | null;
  deleteDeck(id: string): void;
  recordQuickPlay(deckId: string, outcome: 'win' | 'loss' | 'draw'): void;
  setQuickPlay(q: Partial<AppStore['quickPlay']>): void;
  importSave(code: string): Promise<void>;
  resetProfile(): void;
}

let store: KeyValueStore = idbStore;
let writing: Promise<unknown> = Promise.resolve();

/** Serialises writes so two autosaves never interleave. */
function persistProfile(profile: Profile) {
  writing = writing
    .then(() => saveProfile(store, profile))
    .catch((err: unknown) => console.warn('Save failed', err));
  return writing;
}

/** Waits for pending saves (used by tests and before reloads). */
export function flushSaves(): Promise<unknown> {
  return writing;
}

export function deckChoices(profile: Profile): DeckChoice[] {
  return [
    ...PREBUILT_DECKS.map((d: DeckDef) => ({ ...d, prebuilt: true })),
    ...profile.decks.map((d: SavedDeck) => ({ ...d, prebuilt: false })),
  ];
}

/** Cards the player owns: the starter collection plus unlocked cards. */
export function ownedCards(profile: Profile): Set<string> {
  return ownedCardIds(profile);
}

export const XP_WIN = 50;
export const XP_LOSS = 20;

export const useApp = create<AppStore>((set, get) => ({
  screen: 'loading',
  profile: newProfile(),
  persist: null,
  storageWorks: true,
  fellBack: false,
  corruptRaw: null,
  draft: null,
  quickPlay: { deckId: PREBUILT_DECKS[0]!.id, difficulty: 'normal' },
  lastUnlocks: [],

  async boot() {
    let result;
    try {
      result = await loadProfile(store);
    } catch {
      // IndexedDB unavailable (e.g. some private modes): play on with an in-memory save.
      store = memoryStore();
      set({ storageWorks: false });
      result = await loadProfile(store);
    }
    if (result.status === 'corrupt') {
      set({ screen: 'corrupt', corruptRaw: result.raw });
    } else if (result.status === 'ok') {
      set({ screen: 'menu', profile: result.profile, fellBack: result.fellBack });
    } else {
      const profile = newProfile();
      set({ screen: 'menu', profile });
      void persistProfile(profile);
    }
    set({ persist: await requestPersistence() });
  },

  go: (screen) => set({ screen }),

  update(f) {
    const profile = f(get().profile);
    set({ profile });
    void persistProfile(profile);
  },

  setSettings(change) {
    get().update((p) => ({ ...p, settings: { ...p.settings, ...change } }));
  },

  dismissIosTip() {
    get().update((p) => ({ ...p, iosTipSeen: true }));
  },

  completeTutorial() {
    get().update((p) => ({ ...p, tutorialDone: true }));
  },

  awardXp(xp, change) {
    const base = change ? change(get().profile) : get().profile;
    const grant = grantXp(base, xp);
    set({ profile: grant.profile, lastUnlocks: [...get().lastUnlocks, ...grant.bundles] });
    void persistProfile(grant.profile);
  },

  clearUnlocks: () => set({ lastUnlocks: [] }),

  newDraft(from) {
    if (get().profile.decks.length >= MAX_SAVED_DECKS) return;
    set({
      draft: from
        ? { id: null, name: `${from.name} copy`.slice(0, 24), cover: from.cover, cards: [...from.cards] }
        : { id: null, name: 'New deck', cover: null, cards: [] },
      screen: 'builder',
    });
  },

  editDeck(id) {
    const deck = get().profile.decks.find((d) => d.id === id);
    if (!deck) return;
    set({ draft: { id, name: deck.name, cover: deck.cover, cards: [...deck.cards] }, screen: 'builder' });
  },

  setDraft: (draft) => set({ draft }),

  /** Saves the draft as a deck (caller checks legality first). Returns the deck id. */
  saveDraft() {
    const { draft } = get();
    if (!draft || draft.cards.length === 0) return null;
    const cover = draft.cover && draft.cards.includes(draft.cover) ? draft.cover : draft.cards[0]!;
    const name = draft.name.trim().slice(0, 24) || 'Untitled deck';
    let id = draft.id;
    get().update((p) => {
      if (id) {
        return {
          ...p,
          decks: p.decks.map((d) => (d.id === id ? { ...d, name, cover, cards: [...draft.cards] } : d)),
        };
      }
      if (p.decks.length >= MAX_SAVED_DECKS) return p;
      id = `d${p.nextDeckId}`;
      return {
        ...p,
        nextDeckId: p.nextDeckId + 1,
        decks: [...p.decks, { id, name, cover, cards: [...draft.cards] }],
      };
    });
    set({ draft: null, screen: 'decks' });
    return id;
  },

  deleteDeck(id) {
    get().update((p) => ({ ...p, decks: p.decks.filter((d) => d.id !== id) }));
    if (get().quickPlay.deckId === id)
      set({ quickPlay: { ...get().quickPlay, deckId: PREBUILT_DECKS[0]!.id } });
  },

  recordQuickPlay(deckId, outcome) {
    get().awardXp(outcome === 'win' ? XP_WIN : XP_LOSS, (p) => {
      const prev = p.stats.quickPlay[deckId] ?? { played: 0, won: 0 };
      return {
        ...p,
        stats: {
          ...p.stats,
          quickPlay: {
            ...p.stats.quickPlay,
            [deckId]: { played: prev.played + 1, won: prev.won + (outcome === 'win' ? 1 : 0) },
          },
        },
      };
    });
  },

  setQuickPlay: (q) => set({ quickPlay: { ...get().quickPlay, ...q } }),

  async importSave(code) {
    const profile = await importSaveCode(code);
    // Write before leaving Settings, so a reload straight after the menu appears never finds the old profile.
    await persistProfile(profile);
    set({ profile, screen: 'menu', fellBack: false });
  },

  resetProfile() {
    const broken = get().corruptRaw;
    // Keep unreadable saves under a separate key so they can still be exported or recovered.
    if (broken) void store.set(`save-broken-${Date.now()}`, broken);
    const profile = newProfile();
    set({ profile, screen: 'menu', corruptRaw: null, fellBack: false });
    void persistProfile(profile);
  },
}));
