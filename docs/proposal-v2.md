# Proposal: Lanefall v2 — open board, chosen targets, the stack

2026-11-22 · draft for review. Nothing here is built yet; `docs/spec.md` stays the source of truth for the current game.

## 1. What changes

|              | Lanefall v1 (today)                                | v2                                                                                                      |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Board        | 3 lanes × 2×2 slots per side                       | One row per side, up to 6 units (Hearthstone board, LoR's cap of 6)                                     |
| Turns        | Both plan face-down, simultaneous reveal           | Alternating turns, one active player                                                                    |
| Combat       | Lane power vs lane power, damage soaks by slot     | Each unit attacks a target you choose: an enemy unit or the hero                                        |
| Targeting    | Spells target while planning, may fizzle on reveal | Targets chosen at cast; rechecked when the spell resolves                                               |
| Interaction  | None during a round                                | Priority and a stack: the opponent can answer spells and attacks with Fast/Burst spells, on either turn |
| Match length | Max 8 rounds                                       | No round cap; fatigue ends long games, hard stop at turn 40 = draw                                      |
| Lane effects | 33                                                 | Removed; the best ideas move to boss rules and relics                                                   |

Kept: factions, keywords where they still make sense, data-driven cards, seeded determinism, the roguelike run, meta progression, saves, the PWA, the portrait/one-thumb pillars.

## 2. Core rules

**Setup**

- Heroes start on 20 HP. Decks: 30 cards (Quick Play), runs start at 12 and grow.
- Coin flip by seed for who goes first. First player draws 3, second draws 4 and gets **the Spark** (a 0-cost Burst spell: gain 1 mana this turn).
- One mulligan. Hand limit 10; overdraw is burned.

**Mana**

- At the start of your turn: max mana +1 (cap 10), refill.
- **Spell mana** (renamed from Reserve): up to 3 unspent mana at end of your turn is banked, usable on spells only. Carries over from v1.

**Turn structure**

1. **Start of turn:** Start of Turn triggers, refill mana, draw 1 (empty deck: take 1, 2, 3… fatigue damage).
2. **Main phase:** the active player has priority and may, in any order: play units, cast spells, attack with units that can attack, or end the turn.
3. **End of turn:** End of Turn triggers, temporary effects expire, bank spell mana, pass the turn.

**Priority and the stack**

- The stack is a last-in, first-out list of pending items: spells (Fast or Slow) and **attacks**.
- When an item goes on the stack, the _other_ player gets priority. They may add a Fast or Burst spell, or pass.
- When both players pass in a row with items on the stack, the **top item resolves**, then the active player gets priority again (MTG-style, one item at a time, so each response is visible).
- The active player may only take main-phase actions (play a unit, cast Slow, declare an attack, end turn) while the stack is empty.
- On resolve, every chosen target is checked again. Targets that are gone or now illegal are skipped; if all are gone the item **fizzles** (mana is not refunded).

**Spell speeds** (from Legends of Runeterra)

| Speed | When                         | Uses the stack?                                    |
| ----- | ---------------------------- | -------------------------------------------------- |
| Burst | Any time you have priority   | No: resolves at once, then priority stays with you |
| Fast  | Any time you have priority   | Yes: opponent may respond                          |
| Slow  | Your main phase, empty stack | Yes: opponent may respond with Fast/Burst          |

Units are Slow-speed to play, but **do not use the stack**: they enter at once and their On Play effect resolves at once (Hearthstone battlecry). This keeps turns quick; the response point is the spell or the attack.

**Combat**

- A unit can attack once per turn, not on the turn it entered (unless **Quick**).
- Declaring an attack puts it on the stack with its target: an enemy unit or the enemy hero. **Guard** units must be targeted first (if the defender has any Guard unit, only Guard units are legal targets).
- The defender gets priority (the interactive beat: buff, Barrier, remove the attacker, swap the target is _not_ allowed).
- On resolve, if attacker and target both remain: both deal damage equal to their Power at the same time. A hero deals no damage back.
- Damage stays on units between turns unless healed (as in v1). Units at 0 Health die after the item resolves; Last Breath triggers then.

**Winning**

- A hero at 0 HP loses at once (checked after each resolution). Both at 0 at the same time = draw.
- Turn 40 reached = draw (only to guarantee simulations terminate; should practically never happen).

**Triggered abilities** (On Play, Last Breath, Start/End of Turn, Ongoing) resolve immediately in a fixed order (active player's first, then by play order). They do not use the stack. Choosing a target for an On Play effect happens as the unit is played.

## 3. Keywords

| Keyword     | v2 rule                                                                 | From v1              |
| ----------- | ----------------------------------------------------------------------- | -------------------- |
| Guard       | Enemies must attack Guard units first.                                  | Guard (reworded)     |
| Barrier     | Prevents the next damage, then is removed.                              | same                 |
| Overwhelm   | When attacking a unit, excess damage hits the enemy hero.               | replaces Pierce      |
| Lifesteal   | Damage this unit deals heals your hero.                                 | same                 |
| Quick       | Can attack the turn it enters.                                          | new                  |
| Elusive     | Cannot be targeted by enemy spells or On Play effects until it attacks. | replaces Shroud lane |
| Growth      | End of your turn: +1/+1.                                                | same                 |
| Regenerate  | Start of your turn: heal fully.                                         | same                 |
| Ephemeral   | Dies at the end of your turn.                                           | same                 |
| On Play     | Effect resolves when played from hand.                                  | replaces On Reveal   |
| Last Breath | Effect resolves when it dies.                                           | same                 |
| Ongoing     | Applies while in play.                                                  | same                 |
| Rally       | On Play: other friendly units get +1 Power this turn.                   | lane → whole board   |

Shift is removed. Faction signatures change: Ember (Quick, Overwhelm, direct damage), Tide (Fast/Burst tricks, Elusive, bounce), Grove (ramp, Growth, Regenerate), Bastion (Guard, Rally, Barrier), Dusk (removal, Last Breath, Lifesteal).

## 4. Cards

- Same JSON-record approach. Changes to `src/engine/schema.ts`:
  - `speed: 'burst' | 'fast' | 'slow'` on spells.
  - `targets[]`: a list of target specs (`enemyUnit`, `friendlyUnit`, `anyUnit`, `anyCharacter`, `enemyHero`…), each with optional filters (cost ≤ n, damaged, has keyword), so a card can pick 0–2 targets.
  - Lane-relative selectors (`unitsInLane`, `enemyUnitsInLane`…) become board-wide (`allEnemyUnits`, `adjacentUnits` for position-aware cards).
  - New primitives: `bounce` (return to hand), `counter` (remove the top stack item — the "Deny" effect; rare, Tide/Dusk only), `silence`.
- Of today's 153 cards, about 38 rely on lanes, Shift, move or lane-relative Rally and need redesign; the other ~115 port with stat and cost retuning. Card ids restart (new game, new share codes), but names and art carry over.
- Balance baseline (vanilla): Power + Health = 2 × cost + 1, same as v1, re-checked by the simulator.

## 5. Portrait UI (390 × 844)

| Zone           | Height | Contents                                                                            |
| -------------- | ------ | ----------------------------------------------------------------------------------- |
| Opponent bar   | 56     | Hero portrait (a target), HP, mana, spell mana, hand and deck counts                |
| Opponent board | 150    | Up to 6 unit cards in a row                                                         |
| Stack strip    | 72     | Pending stack items, top on the right, arrows to their targets; empty = turn banner |
| Your board     | 150    | Up to 6 unit cards                                                                  |
| Your bar       | 64     | Hero portrait, HP, mana and spell mana pips, the main button                        |
| Hand           | 170    | Fanned hand                                                                         |

- Units are bigger than in v1 (6 across one row instead of 12 tiny tokens), which helps readability at 360 px.
- **Attack:** drag from your unit to a target; legal targets light up (Guard rules applied). Same drag arrow for targeted spells.
- **The main button** changes label with the state: _End Turn_ (your main phase), _Pass_ (you have priority with something on the stack), _Resolve_ (both passed, waiting), _Opponent's turn_ (disabled).
- **Auto-pass** (setting, on by default): skip a priority window when you have no legal response. When you _can_ respond, the opponent's item pulses in the stack strip and the button reads _Pass_. No timers in single-player.
- Opponent actions play at a readable pace (~600 ms each, halved by Fast animations).

## 6. Engine interface

```ts
initMatch(config: MatchConfig, seed: number): GameState
legalActions(state: GameState): Action[]          // only for state.priority
applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] }
```

- `resolveRound` goes away: every action (play, cast, attack, pass, end turn) is a step that returns events.
- `GameState` adds `activePlayer`, `priority`, `stack: StackItem[]`, `passes` (0–2), `turn`. Still plain JSON with the RNG inside.
- Hidden information: `viewFor(state, player)` strips the opponent's hand and deck order. The AI and the UI only ever see their view.

## 7. AI

Decision points are now many and small (each play, each attack, each pass), and include responding on the opponent's turn.

| Level  | Main phase                                                                                                                                                | Responses                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Easy   | Random legal action, prefers spending mana and attacking face                                                                                             | Responds 30% of the time if it can                          |
| Normal | Greedy: scores every legal action one ply ahead (resolving the stack assuming the opponent passes), picks the best, repeats                               | Responds if the scored board after responding beats passing |
| Hard   | Determinised search: sample 20 opponent hands from what they could hold, run a short MCTS over the rest of the turn, pick the best average; 500 ms budget | Same search, from the priority window                       |

Same `plan(difficulty, view, rng)` shape, but it returns one action at a time. Scoring weights stay in JSON.

## 8. What carries over from this codebase

| Area                                                                          | Lines today           | Fate                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tooling, CI, Pages deploy, PWA, lint, Playwright setup                        | —                     | Keep as is                                                                                                                                                           |
| `src/save`                                                                    | ~1,400 with `src/run` | Keep; new storage key, fresh `schemaVersion` 1                                                                                                                       |
| `src/run` (map, nodes, shop, events, meta, ascension, replay-by-choices)      | (above)               | Keep; relics/heroes/bosses whose text mentions lanes, rounds or Reserve (about 1 in 3) are rewritten                                                                 |
| Content pipeline (Zod schemas, generated card text, art icons, contact sheet) | —                     | Keep the pipeline; change the schema                                                                                                                                 |
| `src/engine` + `src/ai`                                                       | ~2,400                | Engine: rewrite `match`, `round`, `combat`, `board`; keep `rng`, `deck`, `text`, `content`, much of `effects`. AI: rewrite                                           |
| `src/ui`                                                                      | ~5,000                | Keep menus, run screens, deck builder, collection, settings, card rendering, drag, motion; rewrite `Board`, `MatchScreen`, `store`, `view`, forecast, tutorial coach |
| Tests and sim                                                                 | ~7,000                | Keep run/meta/save/deck/content tests; rewrite rules, combat, lane and AI tests and the balance report                                                               |

Roughly half the code and nearly all the infrastructure survive; the rules core, AI and match screen are new.

## 9. Recommendation: fork this codebase into a new repository

Not a fresh start, and not an in-place rewrite.

- **Why not from scratch:** the run, meta, save, deck builder, content pipeline, art pipeline and CI took most of M3–M8 and are rule-agnostic. Rebuilding them buys nothing.
- **Why not in place:** v1 is a finished, deployed, balanced game. A rewrite on `main` breaks the Pages build for weeks, the "Lanefall" name stops making sense, every save and share code becomes invalid, and the spec, balance report and e2e paths would all be half-true during the transition.
- **How:** create a new GitHub repository, push this repo's full history to it (so blame and decisions survive), then make the first PR strip it: delete lanes, the v1 engine core, AI and match screen, behind a stubbed engine so CI stays green. v1 stays live and frozen here.

## 10. Milestones for v2

|     | Milestone            | Done when                                                                                                                                                                                    |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V0  | Fork and strip       | New repo deploys; menus, deck builder and run map load against a stub engine; CI green                                                                                                       |
| V1  | Rules engine         | Turns, priority, stack, speeds, combat, all keywords, 40 starter cards (Ember, Bastion); unit test per rule; 10,000 bot matches finish with no errors; byte-identical replays; ≥90% coverage |
| V2  | Playable match       | New match screen, attack/target drag, stack strip, auto-pass, Easy + Normal AI; Playwright plays a full match at 3 viewports                                                                 |
| V3  | Quick Play and saves | Deck builder and pre-builts on the new card set; save round-trip tests                                                                                                                       |
| V4  | Run port             | Relics, heroes, enemies and bosses re-authored; 500 bot runs with no errors                                                                                                                  |
| V5  | Full content         | 150 cards, Hard AI within 500 ms                                                                                                                                                             |
| V6  | Meta port            | Unlock track and Ascension on the new content                                                                                                                                                |
| V7  | Polish               | Tutorial teaching the stack, screenshots, motion                                                                                                                                             |
| V8  | Balance              | Faction win rates 45–55%, no card above 60% played win rate, first-player win rate 47–53%                                                                                                    |

## 11. Open questions

1. Name: "Lanefall" no longer fits. Placeholder needed for the repo (e.g. "Stackfall").
2. Stack resolution: one item at a time (proposed, clearer) or LoR's whole-stack-at-once?
3. Should units also be able to **block** (LoR attack/block rounds) instead of Hearthstone's free targeting? Proposed: no — chosen targets were the ask, and blocking doubles the UI.
4. Board cap 6 or 7? 6 fits a 360 px row at ~52 px per unit; 7 drops to ~45 px.
5. Hero HP 20 vs 30: start at 20 and let the V8 simulations decide, as in v1.
6. Should damage on units heal at end of turn (LoR) instead of persisting (Hearthstone and v1)? Proposed: persist.
