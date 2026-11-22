# Spellfall

Portrait-mode, single-player card battler (PWA): open board with chosen targets, spell speeds, priority and a stack. Forked from Lanefall (3-lane game; old spec `docs/v1/spec.md`). The spec is `docs/spec.md` and is the source of truth.

## Commands

- Install: `pnpm install`
- Dev server: `pnpm dev`
- Test: `pnpm test` (unit + simulations); `pnpm coverage` (≥90% gate on `src/rules`, `src/run`, `src/save`); `pnpm e2e` (Playwright)
- Lint / format: `pnpm lint`, `pnpm format`; types: `pnpm typecheck`
- Build: `pnpm build`

## Layout

- `src/rules/` - pure game rules (no React/DOM; no `Math.random` or `Date`, use the seeded RNG)
- `src/content/` - JSON content validated by Zod
- `src/run/`, `src/ai/` - roguelike run and meta progression, opponent planners
- `src/save/` - profile schema, saves, migrations
- `src/ui/` - React screens; only sends actions to the rules and animates events
- `tools/sim/`, `tests/` - simulator and tests

## Conventions

- Further repo rules (rules notes, working rules, milestones) are in `CLAUDE.md`; follow them.
