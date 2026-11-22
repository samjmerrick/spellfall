import { z } from 'zod';
import type { GameState } from '../engine';
import { RunChoiceSchema, RunConfigSchema } from '../run/schema';

export const CURRENT_SCHEMA = 6;
export const MAX_SAVED_DECKS = 20;
export const MAX_DECK_NAME = 24;

export const SavedDeckSchema = z.object({
  id: z.string().regex(/^d\d+$/),
  name: z.string().min(1).max(MAX_DECK_NAME),
  cover: z.string(),
  cards: z.array(z.string()),
});

const RecordSchema = z.object({ played: z.number().int().min(0), won: z.number().int().min(0) });

/** A match state saved mid-match; the engine's own invariants are trusted, only the shape is checked. */
const GameStateSchema = z.custom<GameState>(
  (v) => typeof v === 'object' && v !== null && (v as { version?: unknown }).version === 1,
  'Invalid match state',
);

/** The run in progress: rebuilt by replaying `choices` from `config`. */
export const ActiveRunSchema = z.object({
  config: RunConfigSchema,
  choices: z.array(RunChoiceSchema),
  /** The match in progress, if any. `step` is the run step it belongs to (the number of choices). */
  match: z
    .object({ step: z.number().int().min(0), game: GameStateSchema, aiRng: z.number().int() })
    .nullable(),
});

export const ProfileSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA),
  xp: z.number().int().min(0),
  level: z.number().int().min(1),
  /** Ids of everything unlocked beyond the starting collection (cards, heroes, relics). */
  unlocks: z.array(z.string()),
  decks: z.array(SavedDeckSchema).max(MAX_SAVED_DECKS),
  nextDeckId: z.number().int().min(1),
  settings: z.object({
    fastAnimations: z.boolean(),
    reduceMotion: z.boolean(),
    sound: z.boolean(),
    haptics: z.boolean(),
    /** Pass automatically when you get priority with nothing you could play (Spellfall matches). */
    autoPass: z.boolean(),
  }),
  stats: z.object({
    /** Quick Play results per deck id (saved deck ids and pre-built ids). */
    quickPlay: z.record(z.string(), RecordSchema),
    /** Run results per hero id. */
    runs: z.record(z.string(), RecordSchema),
  }),
  ascension: z.object({
    /** The highest Ascension level won. */
    best: z.number().int().min(0).max(10),
    /** The highest level that can be picked: 0 until the first full run win. */
    unlocked: z.number().int().min(0).max(10),
  }),
  activeRun: ActiveRunSchema.nullable(),
  /** The tutorial match has been finished (or skipped). */
  tutorialDone: z.boolean(),
  /** The iOS "add to home screen" tip has been dismissed. */
  iosTipSeen: z.boolean(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type SavedDeck = z.infer<typeof SavedDeckSchema>;
export type ActiveRun = z.infer<typeof ActiveRunSchema>;

export function newProfile(): Profile {
  return {
    schemaVersion: CURRENT_SCHEMA,
    xp: 0,
    level: 1,
    unlocks: [],
    decks: [],
    nextDeckId: 1,
    settings: { fastAnimations: false, reduceMotion: false, sound: true, haptics: true, autoPass: true },
    stats: { quickPlay: {}, runs: {} },
    ascension: { best: 0, unlocked: 0 },
    activeRun: null,
    tutorialDone: false,
    iosTipSeen: false,
  };
}
