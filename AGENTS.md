# Spellfall

Portrait-mode, single-player card battler (PWA): open board with chosen targets, spell speeds, priority and a stack. Forked from Lanefall (3-lane game; old spec `docs/v1/spec.md`). The spec is `docs/spec.md` and is the source of truth.

## Commands

- Install: `pnpm install`
- Dev server: `pnpm dev`
- Test: `pnpm test` (unit + 10,000 bot matches, ~15 s); `pnpm coverage` (≥90% gate on `src/engine`, `src/run`, `src/save`); `pnpm e2e` (Playwright)
- Lint / format: `pnpm lint`, `pnpm format`; types: `pnpm typecheck`
- Build: `pnpm build`

## Layout

- `src/rules/` - Spellfall rules (from V1); `src/engine/` - Lanefall rules until V2 (no React/DOM; no `Math.random` or `Date`, use the seeded RNG)
- `src/content/` - JSON content validated by Zod
- `src/run/`, `src/ai/` - roguelike run, opponent planners
- `src/save/` - profile schema, saves, migrations
- `src/ui/` - React screens; only sends actions to the engine and animates events
- `tools/sim/`, `tests/` - simulator and tests

## Conventions

- Further repo rules (engine notes, working rules, milestones) are in `CLAUDE.md`; follow them.
