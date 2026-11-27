# Spellfall

Portrait-mode, single-player card battler (PWA): open board with chosen targets, spell speeds, priority and a stack. Forked from Lanefall (3-lane game; old spec `docs/v1/spec.md`). **The spec is `docs/spec.md` — it is the source of truth.**

## Commands

- `pnpm dev` — dev server
- `pnpm lint` — ESLint + Prettier check (`pnpm format` to fix)
- `pnpm typecheck` — `tsc -b`
- `pnpm test` — Vitest unit and simulation tests (includes a light bot smoke test, about a minute; `SIM_SCALE=10 pnpm test:sim` for the full soak)
- `pnpm test:sim` — only the simulation tests (CI runs `coverage` + `test:sim` instead of `test`)
- `pnpm coverage` — unit tests with the coverage gate (≥90%) on `src/rules`, `src/run` and `src/save`
- `pnpm e2e` — Playwright (builds, serves on :4173, tests at 360×740, 390×844, 430×932)
- `pnpm screens` — regenerate the committed screenshots in `docs/screens/` (every screen at all 3 viewports; also checks overflow)
- `pnpm sim [n] [easy|normal|hard] [easy|normal|hard] [factionA] [factionB]` — bot-vs-bot matches (win rate, first-player win rate, turns)
- `pnpm sim:run [n] [easy|normal|hard] [ascension]` — bot roguelike runs per hero, all cards, heroes and relics (win rate, nodes cleared)
- `pnpm content:text` — rewrite every card's `text` in `cards.json` from its data (`src/rules/text.ts`)
- `pnpm content:paths` — regenerate `tests/fixtures/run-paths.json` (e2e run paths) after run or content changes
- `pnpm build` — standalone production build in `dist/` (PWA; not deployed anywhere)
- `pnpm build:preview` — self-contained build in `dist-preview/` (assets inlined, no service worker) for the claude.ai artifact

## Folder rules

- `src/rules/` — pure rules. No React, no DOM, no `src/ui` imports. Lint bans `Math.random` and `Date` here, in `src/run/`
  and `src/ai/`: all randomness comes from the seeded RNG in game state.
- `src/content/` — JSON content, validated by Zod schemas.
- `src/run/`, `src/ai/` — roguelike run and meta progression (Ascension, stats); opponent planners.
- `src/save/` — profile schema (Zod), two-slot saves over IndexedDB, migrations (`tests/fixtures/save-v*.json`), save codes.
- `src/ui/` — React screens. Only sends actions to the rules and animates returned events; never computes results.
- `tools/sim/` — CLI simulators. `tests/unit`, `tests/sim`, `tests/e2e` — tests.

## Rules notes

- Public API is `src/rules/index.ts`: `initMatch`, `legalActions(state)` (for the player with priority, or both during the
  mulligan), `applyAction(state, action) → { state, events }`, `viewFor(state, player, { seeHand? })`, `eventsFor`.
- Actions: `mulligan`, `choose` (a Discover pick, see spec), `playUnit` (with a board position; On Play targets are optional, otherwise the ability waits on the stack for a `target` action, see `awaitingAbility`), `castSpell`, `attack`, `pass` (empty stack: end
  turn; otherwise resolve the whole stack). Burst resolves at once; Fast/Slow spells and attacks go on `state.stack`.
- Card behaviour is data (`src/content/cards.json`, schema `src/rules/schema.ts`: `speed`, `targets[]`, `target`/`target2`
  selectors). Add a primitive in `src/rules/effects.ts` only when no combination of existing ones can express a card.
- Card text is generated from data and must match `cards.json` (run `pnpm content:text` after editing a card). Upgraded cards are
  `<id>+` (`upgradeCard` in `src/rules/content.ts`). `tests/unit/rules/content.test.ts` plays every card and its upgrade.
- Append new cards to the end of `cards.json`: deck share codes index the collectible list by position.
- AI: `src/ai` (`act(difficulty, view, rng, clock?)`, one action per call, from `viewFor`); Easy, Normal, Hard (`hard.ts`,
  deterministic unless given a clock; the UI passes one). Weights in `src/content/ai-weights.json`.
- The match UI is `src/ui/duel/` (store, screen, AI worker). It plays Quick Play, run matches (`startRun`, autosaved whenever
  the player gets priority). It shows the state before an action while that action's events play, then snaps to the result. URL params
  `?seed=N&speed=0.05` make matches deterministic and fast for Playwright.
- UI screens: `src/ui/app.ts` (navigation + profile + autosave). Bump `CURRENT_SCHEMA` and add a migration + fixture whenever
  the profile shape changes.
- Runs (`src/run/`) are config (seed, hero, card pool) + a list of choices; `replayRun` rebuilds the state, and `applyChoice` is
  the only way to change it. Hero passives, relics and boss rules become `MatchConfig.modifiers` (`turnStart`, `startHand`,
  `heroHp`); a boss's `ai.seesHand` reveals your hand to its planner. Run content is `heroes.json`, `relics.json`,
  `enemies.json`, `events.json` (schemas in `src/run/content.ts`); run phases are map, match, reward, shop, rest, treasure,
  event, actCleared, over.
- Meta progression is `src/run/meta.ts` (`ascension.json`, `recordRunResult`, `statsSummary`). There are no levels, XP, unlocks or tutorial: all cards, heroes and relics are available from the start. The `unlock` field left in `cards.json` and `heroes.json` is unused..
- Tests: `tests/unit/rules/` (helpers `setup`, `place`, `give`, `cast`, `play`, `attack`, `pass`); bulk and determinism in
  `tests/sim/rules-bulk.test.ts` with the bots in `tools/sim/rules-bot.ts`. e2e: `tests/e2e/duel.ts` (`playCard`, `attackOnce`,
  `playDuel`) plays matches by tapping.

## Hosting

The game is hosted only as one claude.ai artifact: https://claude.ai/artifact/P4mBQyJP7jCRK8QyQJhoCi. There is no GitHub Pages
site, no deploy workflow and no separate preview artifact.

To publish: run `pnpm build:preview` and publish `dist-preview/` to that artifact (page `spellfall.html`, `assets/*` and
`icon.svg` as supporting files, root `dist-preview/`, previous build's hashed files removed). Never make a new artifact.

- After every merge, republish it from the latest `main`.
- When the owner needs to see a branch first (UI changes), publish the branch build to it, and republish from `main` once the
  work merges or is dropped.

## Working rules

- One milestone (V0–V8, see spec) per branch and PR; don't start the next until CI is green. CI runs on PRs and `main`
  (jobs `check` and `e2e` in parallel). Once a PR merges, republish the artifact from `main` (see "Hosting").
- Spec silent on something? Pick the simplest option and log it in `docs/decisions.md` (date, question, decision).
- Any game-rule change updates `docs/spec.md` in the same PR.
- After UI changes, run `pnpm e2e` and look at `test-results/screens/*.png` before committing.
- New dependency → one-line reason in the PR description.
- **Test build every time.** After every batch of changes (each time you commit work for the owner), publish the build to the
  artifact as described in "Hosting" and give the owner the link with a short list of what to try. If publishing fails, say
  so; never skip it silently.
