# Spellfall

Portrait-mode, single-player card battler (PWA): open board with chosen targets, spell speeds, priority and a stack. Forked from Lanefall (3-lane game; old spec `docs/v1/spec.md`). **The spec is `docs/spec.md` — it is the source of truth.**

## Commands

- `pnpm dev` — dev server
- `pnpm lint` — ESLint + Prettier check (`pnpm format` to fix)
- `pnpm typecheck` — `tsc -b`
- `pnpm test` — Vitest unit and simulation tests (includes 10,000 bot matches, ~15 s)
- `pnpm test:sim` — only the simulation tests (CI runs `coverage` + `test:sim` instead of `test`)
- `pnpm coverage` — unit tests with the coverage gate (≥90%) on `src/engine`, `src/run` and `src/save`
- `pnpm e2e` — Playwright (builds, serves on :4173, tests at 360×740, 390×844, 430×932)
- `pnpm screens` — regenerate the committed screenshots in `docs/screens/` (every screen at all 3 viewports; also checks overflow)
- `pnpm sim [n] [easy|normal] [easy|normal]` — bot-vs-bot simulator (Ember vs Bastion)
- `pnpm sim:run [n] [easy|normal|hard] [ascension]` — bot roguelike runs per hero, fully unlocked profile (win rate, nodes cleared)
- `pnpm sim:balance [n] [--out path]` — M8 balance report (all 10 faction pairs, Normal vs Normal, n per seat, default 1000) written to `docs/balance.md`; multi-threaded, reproducible; exits 1 if an out-of-target faction/card has no reason in `tools/sim/balance-exceptions.json`
- `pnpm content:text` — rewrite every card's `text` in `cards.json` from its data (`src/engine/text.ts`)
- `pnpm content:text:next` — the same for Spellfall's cards, `src/content/next/cards.json` (`src/rules/text.ts`)
- `pnpm content:paths` — regenerate `tests/fixtures/run-paths.json` (e2e run paths) after run or content changes
- `pnpm build` — production build (`VITE_BASE=/spellfall/` for GitHub Pages; CI sets it)

## Folder rules

- `src/rules/` — Spellfall's pure rules (V1 onwards). `src/engine/` — Lanefall's rules, still driving the UI until V2, then deleted. Both are pure rules. No React, no DOM, no `src/ui` imports. Lint bans `Math.random` and `Date`
  here, in `src/rules/`, `src/run/` and `src/ai/`: all randomness comes from the seeded RNG in game state.
- `src/content/` — JSON content, validated by Zod schemas.
- `src/run/`, `src/ai/` — roguelike run, opponent planners.
- `src/save/` — profile schema (Zod), two-slot saves over IndexedDB, migrations (`tests/fixtures/save-v*.json`), save codes.
- `src/ui/` — React screens. Only sends actions to the engine and animates returned events; never computes results.
- `tools/sim/` — CLI simulator. `tests/unit`, `tests/e2e` — tests.

## Rules notes (Spellfall, `src/rules/`)

- Public API is `src/rules/index.ts`: `initMatch`, `legalActions(state)` (for the player with priority), `applyAction(state, action) → { state, events }`, `viewFor`, `eventsFor`.
- Actions: `mulligan`, `playUnit` (with a board position and On Play targets), `castSpell`, `attack`, `pass` (empty stack: end
  turn; otherwise resolve the whole stack). Burst resolves at once; Fast/Slow spells and attacks go on `state.stack`.
- Cards are `src/content/next/cards.json` until V2 (schema `src/rules/schema.ts`: `speed`, `targets[]`, `target`/`target2`
  selectors). Run `pnpm content:text:next` after editing one.
- AI: `src/ai/next` (`act(difficulty, view, rng, clock?)`, one action per call, from `viewFor`; Hard in `hard.ts`); weights in
  `src/content/next/ai-weights.json`. The match UI is `src/ui/duel/` (store, screen, worker); Quick Play uses it.
  Runs and the tutorial still use Lanefall's `src/ui/store.ts` + `MatchScreen` until V4/V7.
- e2e: `tests/e2e/duel.ts` (`playCard`, `attackOnce`, `playDuel`) plays Spellfall matches by tapping.
- Tests: `tests/unit/rules/` (helpers `setup`, `place`, `give`, `cast`, `play`, `attack`, `pass`); bulk and determinism in
  `tests/sim/rules-bulk.test.ts` with the random bot in `tools/sim/rules-bot.ts`.

## Engine notes

These describe Lanefall's `src/engine/`, which still runs the game until V2. Spellfall's rules interface is in the spec
(Tech stack and architecture); update these notes as `src/rules/` replaces it.

- Public API is `src/engine/index.ts`: `initMatch`, `legalActions`, `applyAction`, `resolveRound`.
- Card and lane-effect behaviour is data (`src/content/*.json`, validated by `src/engine/schema.ts`). Add a primitive
  in `src/engine/effects.ts` only when no combination of existing ones can express a card.
- AI planners live in `src/ai` behind `plan(difficulty, state, player, rng)`; the UI runs them in a Web Worker
  (`src/ui/aiClient.ts`).
- The UI replays engine events onto a view model (`src/ui/view.ts`) to animate, then snaps to the engine's state.
  URL params `?seed=N&speed=0.05` make matches deterministic and fast for Playwright.
- UI screens: `src/ui/app.ts` (navigation + profile + autosave) and `src/ui/store.ts` (the match). Bump
  `CURRENT_SCHEMA` and add a migration + fixture whenever the profile shape changes.
- Runs (`src/run/`) are config (seed, hero, card pool) + a list of choices; `replayRun` rebuilds the state, and
  `applyChoice` is the only way to change it. Hero passives, relics and boss rules become `MatchConfig.modifiers`.
  Run content is `heroes.json`, `relics.json`, `enemies.json` (schemas in `src/run/content.ts`).
- Card text is generated from data and must match `cards.json` (run `pnpm content:text` after editing a card). Upgraded cards are
  `<id>+` (`upgradeCard` in `src/engine/content.ts`). `tests/unit/cards.test.ts` plays every card and its upgrade.
- Append new cards to the end of `cards.json`: deck share codes index the collectible list by position.
- AI difficulties: Easy, Normal, Hard (`src/ai/hard.ts`). Hard is deterministic unless given a clock (the UI passes one, 500 ms).
- Meta progression is `src/run/meta.ts` (levels, `unlocks.json`, `ascension.json`, `grantXp`, `recordRunResult`, `statsSummary`). `RunConfig` holds the Ascension level and the relic pool.
- Run content also includes `events.json`; run phases are map, match, reward, shop, rest, treasure, event, actCleared, over.
- Tests build boards with `tests/unit/helpers.ts` (`setup`, `place`, `give`, `plan`, `resolve`).

## Working rules

- One milestone (V0–V8, see spec; V3 is full content, V4 the deck builder, V5 runs) per branch and PR; don't start the next until CI is green. CI runs on PRs and
  `main` (jobs `check` and `e2e` in parallel; `deploy` to Pages after both, on `main` only).
- Spec silent on something? Pick the simplest option and log it in `docs/decisions.md` (date, question, decision).
- Any game-rule change updates `docs/spec.md` in the same PR.
- After UI changes, run `pnpm e2e` and look at `test-results/screens/*.png` before committing.
- New dependency → one-line reason in the PR description.
