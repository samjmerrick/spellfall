# Spellfall

A single-player, portrait-mode card battler for phones: an open board where you choose every attack's target, spell
speeds, priority and a stack that lets the opponent answer on either turn, and five colour factions. Quick Play,
roguelike runs, meta progression and deck building. Installable, offline-capable web app.

Forked from Lanefall, a 3-lane simultaneous-reveal game (its spec is kept in `docs/v1/spec.md`).

See [`docs/spec.md`](docs/spec.md) for the full design and milestone plan, and [`CLAUDE.md`](CLAUDE.md) for commands.

**Play it:** https://bee.samjmerrick.com/spellfall/ (installable; deployed from `main` to Sam's home server by `~/apps/bin/deploy`).
Progress is saved on your device and works offline. Signing in with Google (Settings, Cloud save) is optional and keeps a
copy of your save in the cloud so it follows you between devices. A self-contained copy is also published as a claude.ai
artifact (local saves only). See "Hosting" in [`CLAUDE.md`](CLAUDE.md).

```bash
pnpm install
pnpm dev
```
