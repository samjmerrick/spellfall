# Lanefall — Mobile TCG Spec v0.1

2026-11-20 · Sam Merrick

## Overview

Lanefall is a single-player, portrait-mode card battler for phones: 3-lane simultaneous-reveal turns (Marvel Snap), lane combat with overflow damage to a hero (Legends of Runeterra), and five colour factions with a 20 HP life total (Magic: The Gathering). "Lanefall" is a working title.

**Design pillars**

- **Fast:** a Quick Play match lasts 3–5 minutes; a roguelike run lasts 30–40 minutes and can be paused at any step.
- **One thumb:** every action is a tap or a drag within the bottom 60% of the screen.
- **Readable:** every number on a card is visible without zooming; tap any card for full rules text.
- **Deterministic:** the same seed and the same player choices always give the same result.

**In scope for v1:** Quick Play against the AI, roguelike runs, meta progression, deck building, 5 factions, about 150 cards, vector placeholder art, offline play.

**Not in v1:** online multiplayer, accounts, monetisation, card trading, illustrated art, sound beyond simple effects.

## Core rules

A match is at most 8 rounds. Both players plan face-down at the same time, cards reveal together, then each lane fights and any overflow damage hits the enemy hero.

**Setup**

- Each hero starts on 20 HP (kept at 20 after the M8 simulations).
- Decks are 30 cards in Quick Play; run decks start at 12 and grow.
- Draw 4 to start. One mulligan: replace any number of those cards once.
- Hand limit is 8; a draw past 8 is discarded.
- The board has 3 lanes (Left, Centre, Right). Each side of a lane holds up to 4 units, shown as a 2×2 grid.

**Round sequence**

- **Mana:** each player's mana refills to the round number, capped at 8.
- **Reserve:** up to 2 mana left unspent last round is kept as Reserve, which can pay for spells only.
- **Draw** 1 card.
- **Lane reveal:** in rounds 1, 2 and 3, the Left, Centre and Right lane effects are revealed in turn.
- **Plan:** both players secretly drag units into lane slots and queue spells with their targets, then tap End Turn. Cards can be taken back until End Turn.
- **Reveal:** the player with initiative reveals first, card by card in the order played; then the other player. Initiative alternates each round; round 1 is set by the match seed. Each card's On Reveal effect resolves as it reveals.
- **Combat:** lanes resolve Left, Centre, Right (rules below).
- **End of round:** End of Round effects trigger, then temporary effects expire.

**Lane combat**

- Each side's lane power = the sum of its units' Power in that lane.
- Both sides deal their lane power at the same time. Some lane effects change who deals damage and in what order (see Lane effects).
- Damage is assigned to enemy units in that lane: Guard units first, then by slot position: front row (slots 1 and 2: front-left, front-right; the row nearest the lane strip) before back row (slots 3 and 4: back-left, back-right), left before right. Empty slots are skipped and gaps never close: units do not shift slots when others die, and play order does not matter. Each unit takes up to its remaining Health before the next takes any.
- Damage left after every enemy unit in the lane is assigned goes to the enemy hero.
- Units whose damage reaches their Health die after the lane resolves. Damage stays on surviving units between rounds unless healed.

**Winning**

- A hero on 0 HP or less after combat loses. If both are at 0 or less, the one with more HP left wins; equal HP = draw.
- After round 8, the higher HP wins; equal HP = draw.
- In a run, a draw counts as a loss.

**Card types**

- **Unit:** cost, Power, Health, optional keywords and text. Played into an empty slot on your side of a lane.
- **Spell:** cost and an effect. Targets are picked while planning; a spell that targets a friendly unit (or any unit) may target a unit you planned earlier in the same turn. If a target has gone by the time the spell reveals, the spell fizzles and its mana is not refunded.

**Lane effects**

- Each lane gets 1 effect, drawn by seed from a pool of 33 (see the table). The effect shows as soon as the lane is revealed and stays for the whole match.
- Text must fit the 56 px lane strip (three columns at 360 px wide), so each is a short line; `tests/e2e/lane-text.spec.ts` checks it at every supported width.
- "Top power" means the player with strictly more total Power in the lane when the effect resolves (after combat); on a tie, nobody.
- A lane effect is data. Besides stat bonuses (`powerBonus`, `healthBonus`), `overflowMultiplier`, `maxUnits`, `heroDamage` and End of Round primitives, an effect may use:
  - `winnerEndOfRound`: primitives at End of Round for the player with top power (their `friendlyHero`, `draw`, `gainMana`, `friendlyUnitsInLane`).
  - `onEnter`: primitives for each unit that enters the lane (played, summoned, moved in or Shifted in); `self` is that unit.
  - `onDeath`: primitives for each unit that dies in the lane; the owner is the dying unit's owner.
  - `returnOnDeath`: a unit that dies there returns to its owner's hand instead of the discard (tokens do not; a full hand discards it).
  - `keywords`: Guard, Pierce or Lifesteal for units fighting there (in combat only; it does not add the keyword to the card).
  - `soak`: which of a side's units take damage first after Guard: `front` (default, slot order), `back` (back row first, right to left) or `weakest` (least remaining Health first, ties by slot).
  - `champion`: only each side's highest-Power unit deals damage (the lowest slot wins a tie), with its Power multiplied.
  - `spellShield`: enemy spells cannot target units there (the spell is illegal to plan, and fizzles if the target moves in before it reveals). Spells that target a lane still work.
- Lane stat bonuses apply while the unit is in the lane. A lane effect that is not yet revealed does nothing.

| Lane | Text |
|---|---|
| Open Field | No effect. |
| Forge | Units here have +1 Power. Only 2 per side. |
| Chasm | Only 1 unit per side. Overflow doubled. |
| Narrows | Only 2 units per side. |
| Bulwark | Units here have +1 Health. |
| Sanctuary | No hero damage. Top power heals 4. |
| Ashfield | Units take 1 a round. Top power draws. |
| Spring | End of Round: heal each unit here by 2. |
| Lowlands | -1 Power, +1 Health. Overflow x2. |
| Fortress | Units here have +2 Health. |
| Crucible | +2 Power, but units here die at End of Round. |
| Rope Bridge | Only 1 unit per side. It has +2/+2. |
| Mountain Pass | Only 3 units per side. |
| Gorge | Only 2 units per side. -1 Power. Overflow tripled. |
| Shrine | End of Round: fully heal each unit here. |
| Stormfront | +1 Power. Units take 3 at End of Round. |
| Oasis | End of Round: heal both heroes by 2. |
| Cursed Land | End of Round: both heroes take 1. |
| Barracks | Max 3 units. Each gains +1 Power a round. |
| Glacier | -1 Power, +3 Health. Overflow tripled. |
| Open Road | Units here have Pierce. Top power heals 1. |
| Bloodmoon | Units here have Lifesteal and -1 Power. |
| Aegis Gate | Units here enter with a Barrier. |
| Ambush | Entering units deal 1 to a random enemy. |
| Scriptorium | Top power here draws a card each round. |
| Leyline | Top power here gains 1 mana each round. |
| Catacombs | A unit dying here draws its owner a card. |
| Phoenix Nest | Units that die here return to hand. |
| Reverse Ranks | Damage hits the back row first. |
| Culling Field | Damage hits the weakest unit first. |
| Crossroads | Units move to another lane each round. |
| Duelling Ring | +1 Power. Only the strongest unit attacks. |
| Shroud | Enemy spells can't target units here. |

## Cards, keywords and factions

v1 ships 150 cards: 30 per faction across 5 factions, with no colourless cards. Every card is a JSON record; effects are built from a small set of reusable effect primitives, not one-off code per card.

**Factions** (names are placeholders)

| Faction | Colour | Play style | Signature keywords |
|---|---|---|---|
| Ember | Red | Aggro: cheap units, direct hero damage | Pierce, Ephemeral |
| Tide | Blue | Tricks: spells, card draw, moving units | Shift, Barrier |
| Grove | Green | Ramp: extra mana, big units that grow | Growth, Regenerate |
| Bastion | White | Swarm: many small units, buffs, healing | Rally, Guard |
| Dusk | Black | Control: removal, sacrifice, death value | Last Breath, Lifesteal |

**Keywords**

| Keyword | Rule |
|---|---|
| Guard | Enemy lane damage is assigned to this unit before non-Guard units, whatever row it is in. |
| Barrier | Prevents the next damage this unit would take, then is removed. |
| Pierce | This unit's Power skips enemy units and goes straight to the enemy hero. |
| Rally | On Reveal: other friendly units in this lane get +1 Power this round. |
| Growth | End of Round: +1 Power and +1 Health. |
| Regenerate | End of Round: heal this unit fully. |
| Lifesteal | When this lane deals hero damage, your hero heals by this unit's Power. |
| Shift | During planning, may move to another lane once per match. |
| Ephemeral | Dies at End of Round. |
| On Reveal | Effect resolves when the card reveals. |
| Ongoing | Effect applies while the unit is in play. |
| Last Breath | Effect resolves when the unit dies. |

**Card record fields:** `id`, `name`, `faction`, `type`, `cost`, `power`, `health`, `keywords[]`, `effects[]`, `text`, `rarity` (Common, Uncommon, Rare, Legendary), `unlock` (starter, or the meta-progression unlock that adds it).

**Balance baselines**

- A unit with no keywords has Power + Health = 2 × cost + 1 (a 2-cost unit is 3/2 or 2/3).
- Each keyword or effect costs about 1 stat point; Pierce and Lifesteal cost 2.
- Mana curve per 30-card faction pool: 4 at 1 mana, 6 at 2, 6 at 3, 5 at 4, 4 at 5, 3 at 6, 2 at 7–8.
- About 1 in 3 cards per faction is a spell.

**Starter set for M2:** Ember and Bastion, 20 cards each.

## Game modes

There are two modes: Quick Play is one match against the AI; a Run is a 3-act roguelike of about 15 matches, using the same match rules.

### Quick Play

- Pick a deck (a pre-built deck for each faction pair, or one of your own) and an AI difficulty: Easy, Normal or Hard.
- The opponent's deck is picked at random from the pre-built decks.
- A win gives 50 XP, a loss 20 XP (meta progression below).

### Roguelike run

**Start**

- Pick a hero. 3 are unlocked at the start. Each hero has one faction, one passive ability and a fixed 12-card starter deck.
- A run has 3 Hearts. Losing a match costs 1 Heart and gives no reward; the run ends at 0 Hearts. A draw counts as a loss. Losing to a boss with Hearts left means a rematch.
- Each match starts with both heroes on 20 HP, so damage does not carry between matches.

**Map**

- Each act is a branching map of 7 rows with 2–3 nodes per row. You move one row at a time along the paths, ending at the act's boss.
- Node types:
  - **Fight:** a standard enemy. Reward: choose 1 of 3 cards, plus gold.
  - **Elite:** a harder enemy. Reward: a relic, plus a card choice.
  - **Shop:** spend gold on cards, relics or removing a card from your deck.
  - **Event:** a short text scene with 2–3 choices and their trade-offs.
  - **Rest:** restore 1 Heart, or upgrade 1 card.
  - **Treasure:** a free relic.
- Card choices come from your hero's faction. Beating the act 1 boss lets you add a second faction, which then appears in later card choices.
- Starting a new act restores 1 Heart.

**Cards, relics and bosses**

- Every card has an upgraded version (+1 stat, or a stronger effect).
- Relics are passive bonuses for the rest of the run, such as "Start each match with 1 Reserve mana". v1 has about 40 relics.
- Each act has a pool of 3 bosses, each with its own rule that changes the match, such as "The boss sees your planned cards".
- Enemy decks are written by hand per enemy, scaling in strength by act.
- Run decks have no size limit and no copy limit.

**Run flow**

- Every run has a seed, shown on the summary screen, so it can be replayed.
- You can abandon a run at any time from the map.
- Run XP: 10 per node cleared, 100 per boss beaten, doubled for a full win.

## Meta progression

XP from both modes raises one account level; each level unlocks something specific, and nothing is bought. There are no currencies outside a run.

- **Levels:** level n needs 100 + 50n XP to reach the next level. Cap at level 30 for v1.
- **Starting collection:** 12 Common cards per faction (60 cards), enough for every faction's pre-built deck.
- **Unlock track:** levels 2–30 each unlock one bundle: 3–4 cards from one faction, a hero (with 3 cards of its faction), or 3 relics added to the run relic pool. 29 bundles: 18 card bundles, 7 heroes and 4 relic bundles; all 90 track cards, 7 heroes and 12 relics appear exactly once. The full track is `src/content/unlocks.json` so it can be tuned. A new profile has 60 cards, 3 heroes and 28 relics in the pool.
- **Heroes:** 3 at the start, 10 in total by level 30 (2 per faction).
- **Shared pool:** unlocked cards appear in run card choices and in the deck builder, so both modes feed each other.
- **Ascension:** after the first full run win, Ascension levels 1–10 open. Each adds one rule, and the rules are cumulative (level n applies rules 1 to n). A full win at the highest open level unlocks the next. The rules (`src/content/ascension.json`):
  1. Elites have +2 HP.
  2. Shops cost 25% more (after relic discounts, rounded up; card removal too).
  3. Start with 15 less gold.
  4. Normal fight enemies have +3 HP.
  5. Fights give 25% less gold (rounded down).
  6. Bosses have +5 HP.
  7. Act 1 enemies use at least Normal AI.
  8. A rest can no longer restore a Heart (upgrade or move on).
  9. Card rewards offer 2 cards (relic bonuses still add).
  10. Start with 2 Hearts (the limit stays 3).
- **Records:** a stats screen shows runs won and played per hero, best Ascension level, and Quick Play win rate per deck.

## Deck building

Quick Play decks are exactly 30 cards, from up to 2 factions, with at most 3 copies of a card (1 of a Legendary). Saving is blocked until a deck is legal, and the reason is shown.

- **Saved decks:** up to 20, each with a name and a cover card.
- **Pre-built decks:** one per faction pair (10). They cannot be edited, but can be copied and the copy edited.
- **Collection screen:** a scrolling 3-column grid of cards. Filters for faction, cost (1–8), type, keyword and rarity; search by name or text. Locked cards show greyed out with the level that unlocks them.
- **Deck panel:** a strip at the bottom shows the card count (for example 27/30), the factions in use and a mana-curve bar chart. Tap the strip to expand it into the full deck list.
- **Adding and removing:** tap a card in the grid to add it; tap a card in the deck list to remove it. Long-press any card for full rules text.
- **Share codes:** export and import a deck as a short text code.

## Portrait UI and art

The layout is designed for a 390 × 844 viewport (iPhone 14-class) and must work from 360 × 740 up to 430 × 932 with no horizontal scrolling. Portrait only; in landscape, show a "Rotate your phone" screen.

**Match screen, top to bottom**

| Zone | Height (at 844) | Contents |
|---|---|---|
| Opponent bar | 48 px | Opponent hero HP, mana, cards in hand, deck size |
| Opponent lanes | 200 px | 3 columns, each a 2×2 grid of unit tokens |
| Lane strip | 56 px | Each lane's effect (icon + short text) and both sides' lane power |
| Your lanes | 200 px | 3 columns, each a 2×2 grid of drop slots |
| Your bar | 48 px | Your hero HP, mana and Reserve pips, End Turn button on the right |
| Hand | 160 px | Fanned hand of up to 8 cards; the dragged card lifts above your thumb |
| Safe-area margin | rest | Space for the phone's home indicator |

**Touch rules**

- Drag a card from the hand onto a slot to play it; slots it can go in are highlighted, and others are dimmed.
- Tap a card to see it enlarged with full text. Long-press a unit on the board for the same view.
- Spells with a target: drag onto the target; an arrow shows the target.
- All tap targets are at least 44 × 44 px. End Turn is the largest button on screen.

**Vector art style**

- Cards are drawn with CSS and SVG: a frame tinted in the faction colour, cost in a top-left gem, Power and Health in the bottom corners, with a row of small keyword and effect-trigger icons (Guard, Shift, On Reveal and so on, each with a label) between them. The name sits on its own line above that row and shrinks to fit, so it never overlaps the stats.
- The art box shows the card's line icon (`src/content/art/<id>.svg`: a geometric line drawing in the faction colour drawn straight onto the card background, with no backdrop shape; style in `docs/art.md`) with the faction glyph as a small badge. A card without an icon falls back to a geometric emblem generated from its id. Icons are placeholders, to be replaced later with illustrated art, one file per card id, without changing the layout.
- Every faction has a glyph as well as a colour, so factions can be told apart without colour.
- Dark theme by default.

**Motion and feedback**

- Reveal: cards flip in sequence, about 250 ms each. Combat: lane power numbers fly at the enemy units or hero, with damage numbers.
- A Fast animations setting halves durations; the Reduce motion setting (which also follows the system setting) replaces movement with fades. Settings also has Sound and Haptics toggles, both on by default. Sounds are short synthesised tones.
- Haptics use `navigator.vibrate` where the phone supports it (Android Chrome); on iOS Safari it does nothing.

## Tech stack and architecture

The game is an installable web app (PWA) in strict TypeScript. The rules engine is pure code with no UI or browser dependencies; the UI only sends actions to it and animates the events it returns.

**Stack**

| Part | Choice |
|---|---|
| Language | TypeScript, `strict: true` |
| Build | Vite, pnpm |
| UI | React, Zustand for UI state, Motion (Framer Motion) for animation |
| Offline and install | vite-plugin-pwa (service worker + web manifest) |
| Storage | idb-keyval over IndexedDB |
| Content validation | Zod schemas for every JSON content file |
| Tests | Vitest (unit and simulation), Playwright (screenshots at phone viewports) |
| Lint | ESLint + Prettier |
| Hosting | GitHub Pages via GitHub Actions, deployed on every push to `main` |

**Folders**

```
src/
  engine/    rules: state, actions, combat, effects, seeded RNG (no React, no DOM)
  content/   cards.json, lanes.json, relics.json, heroes.json, enemies.json, unlocks.json
  run/       map generation, rewards, shops, events
  ai/        opponent planners (Easy, Normal, Hard)
  save/      persistence, schema versions, migrations
  ui/        screens, components, animation of engine events
tools/sim/   command-line bot-vs-bot simulator for balance
tests/       unit, simulation and Playwright tests
```

**Engine interface**

```ts
initMatch(config: MatchConfig, seed: number): GameState
legalActions(state: GameState, player: PlayerId): Action[]
applyAction(state: GameState, action: Action): GameState      // planning-phase actions, pure
resolveRound(state: GameState): { state: GameState; events: GameEvent[] }
```

**Engine rules**

- `GameState` is plain, serialisable JSON, including the RNG state, so any match can be saved and resumed mid-round.
- All randomness uses one seeded generator (for example mulberry32) stored in the state. A lint rule bans `Math.random` and `Date` inside `src/engine`, `src/run` and `src/ai`.
- `resolveRound` returns an ordered list of events (`CardRevealed`, `DamageDealt`, `UnitDied`, `HeroDamaged` and so on). The UI animates them in order and never works out game results itself.
- Card effects are data: each effect is a primitive (`dealDamage`, `buff`, `draw`, `summon`, `move`, `heal`, `gainMana` and so on) with a target selector and parameters. A new card should need new JSON, not new engine code, in most cases.

## Save persistence

Saves live in IndexedDB on the phone, with a copy-and-paste save code as a manual backup; cloud sync through Supabase is a later, optional milestone.

**What is saved**

- **Profile:** XP, level, unlocks, decks, settings, stats, Ascension progress.
- **Active run (if any):** run seed, the list of choices made so far, and the current match state if a match is in progress.
- The run is stored as seed + choices, and is rebuilt by replaying those choices through the engine. This keeps saves small and makes any bug reproducible.

**Rules**

- **Autosave** after every match end, card pick, map step, shop purchase and End Turn.
- **Persistent storage:** call `navigator.storage.persist()` on first launch, and show the result in Settings.
- **Schema version:** every save has a `schemaVersion`. On load, run migrations in order up to the current version. Each migration has a unit test using a stored sample save.
- **Two slots:** write to the older of 2 slots, then mark it current. On load, use the newest slot that passes validation; if both fail, offer a reset and keep the broken data for export.
- **Save code:** Settings has "Copy save code" and "Paste save code". The code is the profile JSON, compressed and base64-encoded, with a checksum.
- **iOS:** on first launch in iOS Safari, show a one-time tip to add the game to the home screen, which protects the save from Safari's data clearing.

**Later: Supabase sync (after M8)**

- Sign in with an emailed one-time link. One table: `saves (user_id, updated_at, schema_version, blob)`, with row-level security so users can only read their own row.
- Sync on app open and after each autosave; if both copies changed, keep the one with the higher total XP and ask before overwriting.

## AI opponent

The AI plans with the same information a player has: it never sees your hand or your face-down cards, except where a boss rule says otherwise. All three levels share one interface: `plan(state, player, rng): Action[]`.

| Level | How it plans |
|---|---|
| Easy | Picks random legal plays, preferring to spend its mana. |
| Normal | Lists every affordable set of plays (pruned to the best 200 by a quick score), simulates each against an empty opponent plan, and picks the highest score. |
| Hard | As Normal, but tests the top 20 candidates against 30 sampled opponent plans drawn from cards the opponent could hold, and picks the best average score. |

**Scoring:** a weighted sum of hero HP difference, lane power difference per lane, total unit Power and Health on board, and cards in hand. Weights live in a JSON file so the simulator can tune them.

**Performance:** planning runs in a Web Worker so the UI never freezes. Hard must finish in under 500 ms on a mid-range phone; if it runs out of time, it returns the best plan found so far.

**Determinism:** the AI uses its own seeded random stream, separate from the match's, so the same seed always gives the same AI choices.

**Bosses:** a boss can override parts of planning (for example, seeing your planned cards) through hooks defined in `enemies.json`.

## Milestones

Build in 9 milestones, M0 to M8, in order. Each ends in checks that Claude Code runs itself; a milestone is done only when every check passes in CI.

### M0: Project setup

Vite + React + TypeScript project, lint, Vitest, Playwright, GitHub Actions deploying to GitHub Pages, PWA manifest, and a placeholder portrait match screen.

- `pnpm lint`, `pnpm test` and `pnpm build` pass in CI.
- The deployed URL loads and can be installed to the home screen.
- Playwright screenshots at 360×740, 390×844 and 430×932 show no horizontal overflow (page scroll width ≤ viewport width).

### M1: Rules engine

Everything in Core rules, the effect primitives, all 12 keywords, seeded RNG, Zod content schemas, and the 40 starter cards (Ember and Bastion).

- A unit test for each round step and each keyword.
- 10,000 random bot-vs-bot matches all finish within 8 rounds with no errors.
- The same seed and actions give an identical event log, byte for byte.
- `src/engine` imports nothing from `src/ui`; engine test coverage is at least 90%.

### M2: One playable match

Match screen, drag-to-play, reveal and combat animations driven by engine events, Easy and Normal AI, and a result screen.

- A Playwright script plays a full match at 390×844 and reaches the result screen with no console errors.
- Normal AI plans in under 200 ms in the test environment.

### M3: Quick Play, deck builder and saves

Main menu, collection, deck builder, pre-built decks for the factions so far, IndexedDB saves (schema v1), two save slots and save codes.

- Unit tests for every deck-legality rule.
- Playwright: build a deck, reload the page, and the deck is still there.
- A save code exported and imported gives an identical profile.
- A corrupted save slot falls back to the other slot.

### M4: Run core

Map generation, Fight, Rest, Shop and Treasure nodes, card rewards, Hearts, gold, 10 relics, and act 1 with one boss. Runs saved as seed + choices.

- Across 1,000 seeds, every map is connected and every path reaches the boss.
- A run closed mid-match and resumed reaches an identical state.
- The simulator completes 500 bot runs with no errors.

### M5: Full content

All 5 factions (150 cards), Elites, Events (20), card upgrades, 40 relics, 33 lane effects (20 at first, then reworked and extended), 3 acts with 9 bosses, and Hard AI.

- All content files pass schema validation.
- Every card has a test that its effect resolves as its text says.
- Hard AI meets its 500 ms budget in a CI benchmark.

### M6: Meta progression

XP, levels, the unlock track, 10 heroes, Ascension 1–10 and the stats screen.

- A new profile has only the 60 starter cards and 3 heroes.
- Tests for each unlock and each Ascension rule.

### M7: Polish

Animation tuning, Fast animations and Reduce motion settings, haptics, simple sound effects, a tutorial match, and the iOS home-screen tip.

- A committed set of screenshots of every screen at all 3 viewports, with no overflow.
- The tutorial is a scripted 3-round match with a coach banner (no XP). It is offered on the menu to a new profile (Play or Skip) and stays available as a Tutorial button; finishing or skipping it sets `tutorialDone`.
- A Playwright script completes the tutorial.

### M8: Balance and 1.0

Run the simulator at scale and tune cards, hero HP and AI weights; tag version 1.0.

- The simulator writes a Markdown report (`pnpm sim:balance`, `docs/balance.md`): win rate per faction pair, and win rate when played per card. A draw counts as a loss.
- Targets: every faction wins 45–55% of Normal-vs-Normal matches; no card's win rate when played is above 60%. Every lane effect is also measured (how often it appears, the share of units and mana played there, hero damage through it, how often the player who dealt more hero damage there wins, and draws) against the lane targets in the report. Any exception is listed in the report with a reason.
- Lane targets (`tools/sim/balance.ts`): 20–55% of the units played in rounds 3 to 8 go into the lane, hero damage through it is 0.4–1.8x the mean, the player who dealt more hero damage through it wins at most 80% of the time, and at most 8% of matches with it are drawn.

## Working rules for Claude Code

Copy this spec into the repository as `docs/spec.md`, and keep it as the source of truth for every session.

- **One milestone per branch and pull request.** Do not start the next milestone until the current one's checks all pass in CI.
- **CLAUDE.md:** at M0, write a short `CLAUDE.md` with the commands (`pnpm dev`, `pnpm test`, `pnpm e2e`, `pnpm sim`), the folder rules, and a pointer to this spec.
- **Ambiguity:** when the spec doesn't decide something, choose the simplest option, record it in `docs/decisions.md` (date, question, decision), and carry on.
- **Rule changes:** any change to game rules updates `docs/spec.md` in the same pull request.
- **Look at the UI:** after any UI change, take Playwright screenshots at the 3 viewports and look at them before committing.
- **Engine purity:** game logic never goes in React components. If the UI needs to know something, the engine provides it.
- **Dependencies:** add a new package only with a one-line reason in the pull request description.

## Open questions

- Final game name ("Lanefall" is a working title).
- Hero HP: 20, or higher if simulations show matches ending before round 6.
- Should damage on units carry over between rounds (current rule) or heal each round as in Legends of Runeterra?
- Faction names: themes are fixed (Ember fire, Tide water, Grove nature, Bastion stone and order, Dusk shadow and death); the names may still change before illustrated art is commissioned or generated.
- When to add Supabase cloud sync: straight after M8, or earlier if you want to play on two devices.
