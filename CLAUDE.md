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

- One milestone (V0–V8, see spec) per branch and PR; don't start the next until CI is green. CI runs on PRs and
  `main` (jobs `check` and `e2e` in parallel; `deploy` to Pages after both, on `main` only).
- Spec silent on something? Pick the simplest option and log it in `docs/decisions.md` (date, question, decision).
- Any game-rule change updates `docs/spec.md` in the same PR.
- After UI changes, run `pnpm e2e` and look at `test-results/screens/*.png` before committing.
- New dependency → one-line reason in the PR description.
