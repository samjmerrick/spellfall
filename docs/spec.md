# Spellfall — Mobile TCG Spec v2.0

2026-11-22 · Sam Merrick

## Overview

Spellfall is a single-player, portrait-mode card battler for phones: an open board where you choose every attack's target (Hearthstone), spell speeds, priority and a stack that let the opponent answer on either turn (Legends of Runeterra), and five colour factions with a 20 HP life total.

Spellfall is a fork of Lanefall, a 3-lane simultaneous-reveal game. The Lanefall spec is kept in `docs/v1/spec.md` for reference; this document replaces it (see Transition from Lanefall).

**Design pillars**

- **Fast:** a Quick Play match lasts 5–8 minutes; a roguelike run lasts 40–60 minutes and can be paused at any step.
- **One thumb:** every action is a tap or a drag within the bottom 60% of the screen.
- **Readable:** every number on a card is visible without zooming; tap any card for full rules text; the stack is always on screen.
- **Interactive:** every spell and every attack gives the opponent a chance to answer, but a turn with nothing to answer never waits.
- **Deterministic:** the same seed and the same player choices always give the same result.

**In scope:** Quick Play against the AI, roguelike runs, meta progression, deck building, 5 factions, about 175 cards, vector placeholder art, offline play.

**Not in scope:** online multiplayer, accounts, monetisation, card trading, illustrated art, sound beyond simple effects.

## Core rules

Players take alternating turns. The active player plays units, casts spells and attacks with targets they choose; spells and attacks go on a stack, and the opponent may respond before anything resolves.

**Setup**

- Each hero starts on 20 HP.
- Decks are 30 cards in Quick Play; run decks start at 12 and grow.
- The match seed decides who goes first. The first player draws 3, the second draws 4. After both mulligans the second player also gets **the Spark** (a 0-cost Burst spell: gain 1 mana).
- One mulligan: replace any number of your starting cards once.
- Hand limit is 10; a draw past 10 is burned (discarded).
- Each side of the board holds up to 6 units in one row. A unit is played into any position in the row; units to its right move over. When a unit dies, the gap closes.

**Mana**

- At the start of your turn, your max mana goes up by 1 (cap 10) and your mana refills.
- **Mana stays until your next turn:** unspent mana is not lost at the end of your turn. It stays through the opponent's turn (so it can pay for Fast and Burst spells there) and is replaced when your next turn refills it. There is no spell mana.

**Turn sequence**

1. **Start of turn:** max mana +1 and refill; draw 1 card (from an empty deck you take fatigue damage instead: 1, then 2, then 3, …); then Start of Turn triggers.
2. **Main phase:** the active player has priority. With an empty stack they may, in any order and as often as they can pay: play a unit, cast a spell of any speed, declare an attack, or end the turn.
3. **End of turn:** End of Turn triggers, then effects that last "this turn" expire, and the other player's turn starts (unspent mana is kept).

**Priority and the stack**

- The stack is a last-in, first-out list of pending items: Fast spells, Slow spells and attacks.
- Putting an item on the stack hands priority to the other player. They may add a Fast spell (which hands priority back), cast a Burst spell (which resolves at once and keeps priority with them), or pass.
- When the player with priority **passes** with items on the stack, the **whole stack resolves**, top item first, with no priority in between. Then the active player gets priority again with an empty stack.
- So both players see the full exchange before anything happens, and whoever adds the last item has the last word.
- As each item resolves, its targets are checked again. Targets that are gone or now illegal are skipped; if every target is gone the item **fizzles** (its mana is not refunded). An earlier-resolving item can remove a later item's target.
- The active player may only play a unit, cast a Slow spell, declare an attack or end the turn while the stack is empty.
- Passing with an empty stack ends the turn (only the active player has priority with an empty stack).

**Spell speeds**

| Speed | Can be cast                                      | Uses the stack?                                     |
| ----- | ------------------------------------------------ | --------------------------------------------------- |
| Burst | Whenever you have priority                       | No: resolves at once, and you keep priority         |
| Fast  | Whenever you have priority                       | Yes: the opponent may respond                       |
| Slow  | In your main phase, when the stack is empty only | Yes: the opponent may respond with Fast/Burst spells |

**Units**

- Playing a unit costs its mana and can only happen in your main phase with an empty stack. It does not use the stack: the unit enters at once and its On Play effect resolves at once. Targets for an On Play effect are chosen as the unit is played; if no legal target exists, the unit can still be played and that effect does nothing. Spells always need all their targets.
- A unit can attack once per turn, but not on the turn it entered unless it has **Quick**. Units with 0 Power cannot attack. Summoned units count as entering when summoned.

**Combat**

- Declaring an attack names an attacker and a target: an enemy unit or the enemy hero. If the defender has any unit with **Guard**, only Guard units are legal targets.
- The attack goes on the stack and the defender gets priority. The target cannot be changed.
- When the attack resolves, if the attacker and the target are both still on the board (or the target is the hero): the attacker deals damage equal to its Power to the target, and a target unit deals damage equal to its Power back, at the same time. A hero deals no damage back.
- Damage stays on units between turns unless they are healed.
- After each stack item (and each Burst spell or On Play effect) resolves, units with damage equal to or above their Health die, in play order; their Last Breath effects then resolve.

**Triggered abilities**

- On Play, Last Breath, Start of Turn and End of Turn effects resolve immediately and do not use the stack. When several trigger at once, the active player's resolve first, each side in play order.

**Winning**

- A hero on 0 HP or less loses, checked after each item resolves. If both reach 0 at the same check, the match is a draw.
- If turn 40 (20 each) ends with no winner, the match is a draw. This exists so simulations always end; it should almost never happen.
- In a run, a draw counts as a loss.

**Card types**

- **Unit:** cost, Power, Health, optional keywords and text.
- **Spell:** cost, speed (Burst, Fast or Slow), 0–2 targets and an effect.

## Cards, keywords and factions

About 175 cards: 35 per faction across 5 factions (17 Legendaries, 14 spells per faction), with no colourless cards other than tokens. Every card is a JSON record; effects are built from a small set of reusable effect primitives, not one-off code per card.

**Factions** (names are placeholders)

| Faction | Colour | Play style                                  | Signature keywords        |
| ------- | ------ | ------------------------------------------- | ------------------------- |
| Ember   | Red    | Aggro: Quick units, direct hero damage      | Quick, Overwhelm          |
| Tide    | Blue   | Tricks: Fast and Burst spells, bounce, draw | Elusive, Barrier          |
| Grove   | Green  | Ramp: extra mana, big units that grow       | Growth, Regenerate        |
| Bastion | White  | Swarm: many small units, buffs, healing     | Guard, team-wide On Play buffs |
| Dusk    | Black  | Control: removal, sacrifice, death value    | Last Breath, Lifesteal    |

**Keywords**

| Keyword     | Rule                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| Guard       | While you have a Guard unit, enemies can only attack Guard units (Spellfall's taunt). Elusive and Barrier do not exempt it: an Elusive Guard still has to be attacked, and a Barrier Guard is attacked normally (the Barrier absorbs the hit). Every faction has Guard units. |
| Barrier     | Prevents the next damage this unit would take, then is removed.                       |
| Overwhelm   | When this unit attacks a unit, the target takes damage only up to its remaining Health and the rest hits the enemy hero (Barrier still blocks the target's share). |
| Lifesteal   | Damage this unit deals in combat (attacking or defending, including Overwhelm) heals your hero by the same amount. |
| Quick       | Can attack the turn it enters.                                                        |
| Elusive     | Cannot be targeted by enemy spells or effects until it attacks. It can still be attacked. |
| Growth      | End of your turn: +1 Power and +1 Health.                                             |
| Regenerate  | Start of your turn: heal this unit fully.                                             |
| Ephemeral   | Dies at the end of your turn.                                                         |
| On Play     | Effect resolves when the card is played from hand.                                    |
| Ongoing     | Effect applies while the unit is in play.                                             |
| Last Breath | Effect resolves when the unit dies.                                                   |

**Card record fields:** `id`, `name`, `faction`, `type`, `cost`, `power`, `health`, `speed` (spells), `targets[]`, `keywords[]`, `effects[]`, `text`, `rarity` (Common, Uncommon, Rare, Legendary; at most 1 copy of a Legendary per deck).

**Targets:** each entry of `targets[]` is a target kind (`enemyUnit`, `friendlyUnit`, `anyUnit`, `enemyCharacter`, `anyCharacter`, `stackItem`) with optional filters (cost at most n, damaged, has a keyword). Effects refer to targets by index.

**Effect primitives:** as in Lanefall (`damage`, `heal`, `buff`, `draw`, `summon`, `gainMana`, `grantKeyword`, `destroy`), with board-wide selectors in place of lane-relative ones (`allEnemyUnits`, `allFriendlyUnits`, `adjacentUnits`, `randomEnemyUnit`, …), plus `bounce` (return a unit to its owner's hand), `silence` (remove keywords and text) and `counter` (remove a spell from the stack; rare, Tide and Dusk only). Six more primitives exist for Legendaries: `steal` (take control of enemy units: the unit joins the end of your board, needs a free slot, and cannot attack this turn unless Quick), `setMaxMana` (raise your max mana to n, at most 10, and refill your mana to it), `deathWard` (your hero cannot be reduced below 1 HP until the end of the turn; a hero already at 0 is not saved), `extraTurn` (you also take the next turn, once; only as a spell or On Play effect, so it cannot loop), `revive` (return up to n friendly units from your discard pile to the board, most recent first, while there is room; tokens never go to the discard pile) and `copySpell` (add a copy of the spell just cast to your hand; a full hand burns it). There is one more selector, `otherUnits` (every unit but the source), and two more unit triggers: `whenCast` ("Whenever you cast a spell:") and `whenEnemyCast` ("Whenever the enemy casts a spell:"). They run as the spell is cast, before it goes on the stack or resolves, and a silenced unit does not trigger.

**Legendaries.** Every faction has three or more Legendaries, a mix of units and spells whose effects change the game. A deck holds **at most 1 copy** of a Legendary (the deck builder and `deckProblems` enforce it; the pre-built decks hold one or two different ones). There are 17:

| Faction | Legendary                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| Ember   | Volcano Lord (7, 6/6 Quick: On Play destroy all other units), Ashen Dragon (8, 7/6 Quick, Overwhelm: On Play 5 damage to the enemy hero), Inferno Pyromancer (4, 2/5: whenever you cast a spell, 2 damage to the enemy hero), Supernova (8, Slow: 8 damage to the enemy hero and 3 to all units) |
| Tide    | Sea Queen (8, 5/7 Elusive, Barrier: On Play return all enemy units to their owners' hands and draw 2), Archmage Spellthief (5, 3/5: whenever the enemy casts a spell, add a copy to your hand), Turn the Tide (7, Slow: take an extra turn) |
| Grove   | World Tree (7, 6/7 Growth, Regenerate: Start of Turn gain an empty mana slot; End of Turn other friendly units +1/+1), Gaia, the Heartwood (6, 5/5 Guard, Growth: On Play gain 2 empty mana slots and other friendly units +2/+2), Primal Surge (5, Slow: max mana 10 and refill) |
| Bastion | Grand Marshal (7, 5/6: On Play summon three Levies and other friendly units +2/+2), Archon (8, 6/8 Guard: On Play other friendly units Barrier; Ongoing other friendly units +1/+1), Legion Matriarch (6, 3/7 Guard: End of Turn summon two Levies), Aegis Eternal (4, Fast: heal your hero by 8 and it cannot drop below 1 HP this turn) |
| Dusk    | Night Queen (8, 6/7 Lifesteal: On Play destroy all enemy units), Lich King (6, 5/5: On Play take control of an enemy unit), Rise of the Fallen (6, Slow: revive all friendly units that died this match) |

**Balance baselines**

- A unit with no keywords has Power + Health = 2 × cost + 1 (a 2-cost unit is 3/2 or 2/3).
- Each keyword or effect costs about 1 stat point; Overwhelm, Lifesteal and Elusive cost 2.
- A Fast spell costs about 1 more mana than the same effect at Slow speed; Burst about 1 more than Fast.
- Mana curve per 30-card faction pool: 4 at 1 mana, 5 at 2, 5 at 3, 5 at 4, 4 at 5, 3 at 6, 2 at 7, 2 at 8–10.
- About 2 in 5 cards per faction are spells (14 of 35), most of them Fast or Burst tricks, so both players have something to answer with. Pre-built decks hold 12–14 spells; run starter decks 5 of 12; enemy decks about 40%.

**Porting Lanefall's cards:** about 38 of Lanefall's 153 cards depend on lanes, Shift, moving or lane-relative Rally and are redesigned; the rest are re-costed and re-statted. Names and art carry over. Spellfall's card list and share codes are its own.

**Starter set for V1:** Ember and Bastion, 20 cards each.

## Game modes

There are two modes: Quick Play is one match against the AI; a Run is a 3-act roguelike of about 15 matches, using the same match rules.

### Quick Play

- Pick a deck (a pre-built deck for each faction pair, or one of your own) and an AI difficulty: Easy, Normal or Hard.
- The opponent's deck is picked at random from the pre-built decks.
- Every collectible card is available to build with from the start; results are recorded on the stats screen.

### Roguelike run

As in Lanefall (`docs/v1/spec.md`, Roguelike run): heroes with a faction, a passive and a 12-card starter deck; 3 Hearts; 3 acts of a 7-row branching map with Fight, Elite, Shop, Event, Rest and Treasure nodes; a second faction after the act 1 boss; card upgrades; about 40 relics; 3 bosses per act with a match rule each; seeded and replayable; abandon at any time. Every hero, relic and card is available from the first run; there is no XP.

Changes for Spellfall:

- Relics, hero passives and boss rules that refer to lanes, rounds, Reserve or simultaneous planning are rewritten for turns and the stack: "round n" becomes the owner's n-th turn, Reserve becomes extra mana on your first turn, Pierce becomes Overwhelm, and "sees your planned cards" becomes "sees your hand". Examples: "Gain 1 extra mana on your first turn"; "At the start of your 3rd and 6th turns, draw a card".
- A run match is autosaved whenever the player gets priority, and resumes from that point.
- Lanefall's lane effects are removed. Ideas worth keeping become boss rules or relics (for example "Your first unit each turn has Barrier").

## Meta progression

There are no account levels, XP, unlocks or tutorial: every collectible card, every hero and every relic is available from the start, in the collection, the deck builder, Quick Play and run rewards. What remains is **Ascension 1–10**, which opens after the first full run win (a full win at the highest open level opens the next; rules are cumulative, see `src/content/ascension.json`), and a **stats screen** with run results per hero, the best Ascension won and Quick Play results per deck. A new profile starts with no progress at all.

## Deck building

As in Lanefall (`docs/v1/spec.md`, Deck building): 30-card decks from up to 2 factions, at most 3 copies (1 of a Legendary); up to 20 saved decks; one pre-built deck per faction pair; collection grid with filters (cost 1–7 and 8+; the type filter splits spells by speed: Burst, Fast, Slow); deck strip with count, factions and curve; share codes (Spellfall codes start `SD1-`).

## Portrait UI and art

The layout is designed for a 390 × 844 viewport and must work from 360 × 740 up to 430 × 932 with no horizontal scrolling. Portrait only; in landscape, show a "Rotate your phone" screen.

**Match screen, top to bottom**

| Zone             | Height (at 844) | Contents                                                                          |
| ---------------- | --------------- | --------------------------------------------------------------------------------- |
| Opponent top     | 64 px           | Leave button; the opponent's hand as card backs hanging from the top edge (faces only for cards you may see); opponent mana and deck count |
| Opponent board   | 150 px          | Up to 6 unit cards in a row; at the right, the **opponent hero slot** (portrait art and HP), the target for attacks and spells on the hero |
| Stack strip      | 72 px           | Stack items as round tokens showing their card art (an attack shows the attacker with a sword badge), newest on the right, each with a connector line to its targets; when empty, the current turn and priority ("Your turn", "Opponent's turn", "Your response"), always derived from the live state |
| Your board       | 150 px          | Up to 6 unit cards in a row; at the right, **your hero slot** (portrait art and HP)  |
| Your bar         | 60 px           | Your mana and deck count, the main button on the right                            |
| Hand             | 170 px          | Fanned hand of up to 10 cards; the dragged card lifts above your thumb            |
| Safe-area margin | rest            | Space for the phone's home indicator                                              |

**Touch rules**

- Drag a unit from the hand onto your board to play it; a gap opens where it will go.
- Drag from one of your units to a target to attack; legal targets light up and others dim (Guard applied). Units that can attack have a gold glow; units that cannot attack now (just played without Quick, already attacked, or 0 Power) are dimmed with a "Zz" badge. Guard units have a heavy steel shield frame and a shield badge. Keyword icons are 15-16 px (a column on the card art).
- Every drag also works as two taps: tap a card or unit to pick it (its legal targets light up), then tap a target. Tapping anywhere else drops the pick. A card that cannot be played opens its rules text when tapped.
- **Hold to read**: pressing and holding a hand card, a unit on either board or a stack token for 350 ms (without moving more than 8 px) opens it enlarged with its full text and keyword explanations; releasing closes it and plays nothing. Moving beyond 8 px before 350 ms is a drag and never opens the reader.
- **Spells go to the stack first:** drag a spell anywhere above the hand (or tap it). An untargeted spell is cast at once. A targeted spell becomes a round token on the stack strip (dashed gold ring) while you tap its targets; each chosen target gets a connector line, and the spell is cast when the last target is chosen. Tapping the token, the card or empty space cancels. Units are played by letting go anywhere above the hand; the position comes from where you let go.
- Right-click (or tap an unplayable card, a sleeping unit or a stack item) to see a card enlarged with full text.
- Your own plays show their result at once: a dropped unit is on the board, a cast spell on the stack, before the animation of its events finishes.
- **The main button** reads _End Turn_ in your main phase, _Resolve_ when you have priority with items on the stack (passing resolves the whole stack), and _Opponent's turn_ (disabled) otherwise. It is the largest button on screen.
- **Auto-pass** (setting, on by default): when you get priority but have no legal play, you pass automatically. When you can respond, the newest stack item pulses and the button reads _Resolve_. There are no timers.
- All tap targets are at least 44 × 44 px.

**Vector art style** — as in Lanefall (`docs/v1/spec.md`): CSS/SVG card frames tinted by faction, line-icon art per card id (`src/content/art/<id>.svg`, style in `docs/art.md`), a glyph per faction, dark theme by default. Units have a rectangular art frame; spells have a round art window at the top (the token they become on the stack) and a speed pill at the bottom. Legendaries have a gold frame with an inner ring in the faction colour and a gold crest, in hand and on the board. Units on the board show no name (hold to read it). Their keyword icons sit in a pill on the bottom edge, half out of the frame, between Power and Health, and only for what still matters in play: not Quick or On Play (already used), not Guard (it has its own frame and badge). Hero portraits: in a run, your hero and the enemy's art; in Quick Play, a hero of each deck's first faction.

**Motion and feedback**

- Opponent actions play one at a time at a readable pace (about 600 ms each). Items fly to the stack strip; when the stack resolves, items leave it one by one, newest first.
- Attacks: the attacker lunges at its target; damage numbers pop on both, and a hit unit or hero shakes with a red flash.
- Draws: a card rises into your hand; the opponent's card back drops into theirs. Units land on the board with a short pop; a dying unit fades and shrinks before the gap closes.
- The opponent's plays are shown enlarged in the middle of the screen for about a second. Stack tokens pop in, and flare out one by one as they resolve.
- Game end: the beaten hero's portrait cracks and greys, then the result title lands (gold for Victory, red for Defeat).
- An attack aimed past an enemy Guard shows "Attack a Guard unit first" and keeps the attacker picked.
- Fast animations, Reduce motion, Sound and Haptics settings as in Lanefall.

## Tech stack and architecture

Unchanged from Lanefall: strict TypeScript, Vite and pnpm, React with Zustand and Motion, vite-plugin-pwa, idb-keyval over IndexedDB, Zod for content, Vitest and Playwright, ESLint and Prettier, GitHub Pages (the live site) via GitHub Actions from `main` once CI passes; the claude.ai test-build artifact is the preview.

**Folders**

```
src/
  rules/     Spellfall rules: state, actions, priority, stack, combat, effects, seeded RNG (no React, no DOM)
  content/   cards.json, relics.json, heroes.json, enemies.json, …
  run/       map generation, rewards, shops, events, meta progression
  ai/        opponent planners (Easy, Normal, Hard)
  save/      persistence, schema versions, migrations
  ui/        screens, components, animation of engine events
tools/sim/   command-line bot-vs-bot simulator for balance
tests/       unit, simulation and Playwright tests
```

**Rules interface** (`src/rules/index.ts`)

```ts
initMatch(config: MatchConfig, seed: number): GameState
legalActions(state: GameState): Action[]   // actions for the player with priority (or both, during the mulligan)
applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] }
viewFor(state: GameState, player: PlayerId): PlayerView   // hides the opponent's hand and both deck orders
```

**Rules engine requirements**

- `GameState` is plain, serialisable JSON, including the RNG state, so any match can be saved and resumed at any priority point. It holds `turn`, `activePlayer`, `priority`, `stack`, both players and the result.
- Every action (mulligan, play unit, cast spell, declare attack, pass, end turn) is one `applyAction` step that returns an ordered list of events (`CardPlayed`, `StackItemAdded`, `StackResolving`, `DamageDealt`, `UnitDied`, `HeroDamaged`, `Fizzled`, `TurnStarted` and so on). The UI animates them in order and never works out game results itself.
- All randomness uses one seeded generator stored in the state. A lint rule bans `Math.random` and `Date` inside `src/rules`, `src/run` and `src/ai`.
- The AI and the UI only ever read a `PlayerView`, so neither can see hidden cards, except where a boss rule says so.
- Card effects are data: a new card needs new JSON, not new engine code, in most cases.

## Save persistence

As in Lanefall (`docs/v1/spec.md`, Save persistence): profile and active run in IndexedDB, runs stored as seed + choices, autosave, persistent storage request, schema versions with migrations, two slots, save codes, the iOS home-screen tip, and later optional Supabase sync.

Spellfall uses its own IndexedDB database (`spellfall`) and its own local-storage keys, because it is served from the same origin as Lanefall. Save codes start `SS1.`. Spellfall does not import Lanefall saves. With autosave now after every priority step instead of every End Turn, writes are coalesced to at most one every 500 ms.

## AI opponent

The AI plays from its `PlayerView`: it never sees your hand or deck order, except where a boss rule says otherwise. It now makes many small decisions (each play, attack and pass), including whether to respond on your turn.

| Level  | Main phase                                                                                                                                  | Responses                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Easy   | A random legal action, preferring to spend its mana and to attack the hero.                                                                 | Responds 30% of the time when it can.                        |
| Normal | Greedy: scores the board after each legal action (resolving the stack as if the opponent passes) and takes the best, until ending the turn scores best. | Responds when the scored board after responding beats passing. |
| Hard   | Determinised search: samples 20 hands the opponent could hold, searches the rest of the turn for each, and picks the best average.          | The same search from the priority point.                     |

- Interface: `act(difficulty, view, rng): { action, rng }`, one action per call (`src/ai/next`).
- Scoring: a weighted sum of hero HP difference, board Power and Health, cards in hand, and mana efficiency. Weights live in `src/content/ai-weights.json`.
- Performance: planning runs in a Web Worker. Each Hard decision must finish in under 500 ms on a mid-range phone; if it runs out of time it returns the best action found so far.
- Determinism: the AI uses its own seeded random stream, separate from the match's.
- Bosses can override parts of planning through hooks in `enemies.json`.

## Transition from Lanefall

Spellfall started as a copy of Lanefall with its full history. The new rules were built beside the old ones, so `main` always deployed a working game; from V7 nothing of Lanefall's engine, AI, match screen or lane content remains:

| Area                                                    | Fate                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Tooling, CI, Pages deploy, PWA, lint, Playwright        | Kept                                                                                                    |
| `src/save`                                              | Kept; own database and code prefixes (V0); saved decks migrated to Spellfall's cards (V4) |
| `src/run`, run and meta content                         | Kept; lane-, round- and Reserve-based relics, passives and boss rules rewritten (V5, V6)                 |
| Content pipeline (Zod, generated card text, art icons)  | Kept; schema changes in `src/rules`                                                                     |
| `src/engine`                                            | Replaced by `src/rules` (built in V1; Quick Play switches in V2, runs in V5, the tutorial in V7, then deleted); `rng`, `deck`, `text` and much of `effects` are reused |
| `src/ai`                                                | Rewritten for one-action-at-a-time play in `src/ai/next` (V2, Hard in V3)                               |
| `src/ui`                                                | Menus, run screens, deck builder, collection, settings, card rendering, drag and motion kept; match screen, board, store, view and tutorial coach rewritten (V2, V7) |
| Tests and simulator                                     | Run, meta, save, deck and content tests kept; rules, combat, lane and AI tests and the balance report rewritten |

## Milestones

_The milestone list below is history. The tutorial (V7) and the level/XP/unlock track (V6) were later removed; see the Meta progression section above and `docs/decisions.md` (2026-11-22)._

Build in 9 milestones, V0 to V8, in order. Each ends in checks that Claude Code runs itself; a milestone is done only when every check passes in CI.

### V0: Fork

Copy Lanefall's history into this repository, rename to Spellfall, give saves their own storage, and replace the spec.

- CI passes (`check` and `e2e`) and the game deploys to `/spellfall/` on GitHub Pages.
- The menu, manifest and page title say Spellfall; Spellfall saves never touch Lanefall's IndexedDB database.

### V1: Rules engine

Everything in Core rules in `src/rules/`: turns, mana and spell mana, priority, the stack, spell speeds, combat, all 13 keywords, the effect primitives and targets, seeded RNG, Zod content schemas, and the 40 starter cards (Ember and Bastion) in a new content file.

- A unit test for each rule in Core rules and each keyword, including fizzling, whole-stack resolution order and Guard targeting.
- 10,000 random bot-vs-bot matches all end (win, loss or turn-40 draw) with no errors.
- The same seed and actions give an identical event log, byte for byte.
- `src/rules` imports nothing from `src/ui` or `src/engine`; coverage of `src/rules` is at least 90%.

### V2: One playable match

The new match screen (board rows, stack strip, attack and target drags, main button, auto-pass), Easy and Normal AI, and the result screen, all on `src/rules`. Quick Play moves to the new rules with the starter pre-built decks (saved decks return in V4; Hard plays as Normal until V3). Runs and the tutorial keep Lanefall's match screen and `src/engine` until they are ported (V5, V7); `src/engine` and the lane content are deleted then.

- A Playwright script plays a full match at all 3 viewports, including responding to an opponent's spell, and reaches the result screen with no console errors.
- Each Normal AI decision takes under 50 ms in the test environment.

### V3: Full content

All 5 factions (150 cards) on the new rules, ten pre-built faction-pair decks, and Hard AI. (Moved ahead of the deck builder and runs, which both need the full card pool.)

- All content files pass schema validation; every card and its upgrade has a test that plays it every legal way.
- Every faction has 30 collectible cards, 7–13 of them spells.
- 10,000 random bot matches across all faction pairings end with no errors.
- Hard AI's full search stays under 500 ms per decision in a CI benchmark, stops near its budget with a clock, and beats Normal.

### V4: Quick Play, deck builder and saves

Collection, deck builder, share codes and saved decks on Spellfall's cards; saved decks return to Quick Play. Every Lanefall card id still exists in Spellfall, so saved decks need no migration.

- Unit tests for every deck-legality rule; share codes index Spellfall's collectible list.
- Playwright: build a deck, reload, and the deck is still there and playable in Quick Play; a save code round-trips to an identical profile.

### V5: Run port

Run nodes, relics, hero passives, enemies and bosses re-authored for Spellfall's rules; runs play on the new match screen.

- Every relic, passive and boss rule has a unit test.
- The simulator completes 500 bot runs with no errors.

### V6: Meta progression

The unlock track, 10 heroes and Ascension 1–10 on the new content. Card, hero and relic ids are unchanged, so the track, levels and Ascension rules carry over as they are; this milestone checks them against Spellfall's pool.

- A new profile has only the starter cards (12 per faction) and 3 heroes; the starter cards and the track together cover every collectible card exactly once; tests for each unlock and each Ascension rule.

### V7: Polish

Animation tuning, a tutorial match that teaches attacking, responding and the stack, and the committed screenshot set. `src/engine`, Lanefall's AI, match screen and lane content are deleted.

- Committed screenshots of every screen at all 3 viewports, with no overflow.
- A Playwright script completes the tutorial.

### V8: Balance and 1.0

Run the simulator at scale and tune cards, hero HP and AI weights; tag version 1.0.

- `pnpm sim:balance` writes `docs/balance.md`: win rate per faction pair, first-player win rate and win rate when played per card. A draw counts as a loss.
- Targets: every faction wins 45–55% of Normal-vs-Normal matches; the first player wins 47–53%; no card's win rate when played is above 60%; the median match lasts 14–22 turns. Any exception is listed in the report with a reason.

## Working rules for Claude Code

- **One milestone per branch and pull request.** Do not start the next milestone until the current one's checks all pass in CI.
- **Ambiguity:** when the spec doesn't decide something, choose the simplest option, record it in `docs/decisions.md` (date, question, decision), and carry on.
- **Rule changes:** any change to game rules updates `docs/spec.md` in the same pull request.
- **Look at the UI:** after any UI change, take Playwright screenshots at the 3 viewports and look at them before committing.
- **Engine purity:** game logic never goes in React components. If the UI needs to know something, the engine provides it.
- **Dependencies:** add a new package only with a one-line reason in the pull request description.

## Open questions

- Board limit 6 or 7 units per side? 6 fits a 360 px row at about 52 px per unit; 7 drops to about 45 px.
- Hero HP: 20, or 30 if simulations show matches ending too fast.
- Faction names: themes are fixed (Ember fire, Tide water, Grove nature, Bastion stone and order, Dusk shadow and death); the names may still change.
