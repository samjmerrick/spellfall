# Spellfall

Portrait-mode, single-player card battler (PWA): open board with chosen targets, spell speeds, priority and a stack. Forked from Lanefall (3-lane game; old spec `docs/v1/spec.md`). The spec is `docs/spec.md` and is the source of truth.

## Commands

- Install: `pnpm install`
- Dev server: `pnpm dev`
- Test: `pnpm test` (unit + simulations); `pnpm coverage` (≥90% gate on `src/rules`, `src/run`, `src/save`); `pnpm e2e` (Playwright)
- Lint / format: `pnpm lint`, `pnpm format`; types: `pnpm typecheck`
- Build: `pnpm build`; test build: `pnpm build:preview` (writes `dist-preview/`)

## Layout

- `src/rules/` - pure game rules (no React/DOM; no `Math.random` or `Date`, use the seeded RNG)
- `src/content/` - JSON content validated by Zod
- `src/run/`, `src/ai/` - roguelike run and meta progression, opponent planners
- `src/save/` - profile schema, saves, migrations
- `src/ui/` - React screens; only sends actions to the rules and animates events
- `tools/sim/`, `tests/` - simulator and tests

## Conventions

- Further repo rules (rules notes, working rules, milestones) are in `CLAUDE.md`; follow them.
- **Test build every time.** After every batch of changes (each time you commit work for the owner), run
  `pnpm build:preview` and publish `dist-preview/` as a claude.ai artifact: page `dist-preview/spellfall.html`, the
  other files (`assets/*`, `icon.svg`) as its supporting files, with `dist-preview/` as the root. Update the existing
  test-build artifact (https://claude.ai/artifact/P4mBQyJP7jCRK8QyQJhoCi) rather than making a new one, removing the
  previous build's hashed files, and give the owner the link with a short list of what to try. If publishing fails, say
  so; never skip it silently.
