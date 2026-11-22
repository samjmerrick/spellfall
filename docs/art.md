# Card art style guide

Every card has an SVG icon at `src/content/art/<card id>.svg`; upgraded cards (`<id>+`) reuse the base card's. Cards without a file fall back to the generated emblem. Per-card subjects are in `docs/art-briefs.json`.

This is placeholder art: simple geometric line icons, meant to be replaced by illustrated art later. To swap in raster art, change the glob pattern in `src/ui/art.ts` (one file per card id).

## Style: geometric line icon with no backdrop

- **One subject, one silhouette**, recognisable at 40 px (board tokens) and without colour.
- **Geometric, not hand-drawn.** Use straight segments, 45° and 90° angles, true circular arcs (`a` in paths) and symmetry where the subject allows. Put coordinates on an even grid (whole even numbers). No wobbly freehand curves. Quadratic curves and arcs are fine for organic parts that need them, such as tentacles, tails, flames and smoke, but keep them smooth and few.
- **Lines only.** Every mark is a 4-unit stroke with round caps and joins. No fills, no shading and no second colour.
- **Fill the frame.** The subject spans about x 14–86 and y 10–90. Cost 1–2 creatures are a little smaller; cost 5+ and legendaries fill the frame.
- **Spells** show an object or action (bolt, shield, swirl, burst), not a character. A diagonal or radial layout sets them apart from units.
- **Leave space.** Keep at least 6 units between parallel lines, so they don't merge at 40 px. Use 4–12 strokes per icon.
- **No text, letters or numbers.** No logos, and no copies of characters from existing games.

## Exact structure (enforced by `tests/unit/art.test.ts`)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke="LINE">…shapes…</g></svg>
```

- Inside the `<g>`: only `path line polyline polygon circle ellipse rect`. Shapes carry no `fill`, `stroke`, `stroke-width`, `opacity` or `transform` attributes; everything is inherited.
- The file is at most 2048 bytes (typically about 400).

| Faction | Theme                          | LINE      |
| ------- | ------------------------------ | --------- |
| Ember   | fire, volcanoes, aggression    | `#ff9a3c` |
| Tide    | water, sea, magic, cunning     | `#8fd0ff` |
| Grove   | nature, growth, beasts         | `#a6d96a` |
| Bastion | stone, order, knights, defence | `#e8e2cf` |
| Dusk    | shadow, night, death, trickery | `#c9a3f0` |

## Run content

Heroes, enemies, relics, lane effects and events get icons in the same flat folder, with the same structure and rules. Their ids are already uniquely prefixed. Missing files fall back to a text glyph in the UI (coverage is not yet required: `REQUIRE_RUN_ART` in `tests/unit/art.test.ts`).

| Kind         | File                | LINE                                                           |
| ------------ | ------------------- | -------------------------------------------------------------- |
| Hero         | `hero-*.svg`        | the hero's faction colour (table above)                        |
| Enemy / boss | `enemy-*`, `boss-*` | colour of any faction in the enemy's deck (see `enemies.json`) |
| Relic        | `relic-*.svg`       | `#f0c75e` (gold)                                               |
| Lane effect  | `lane-*.svg`        | `#d6d9e0`                                                      |
| Event        | `event-*.svg`       | `#d6d9e0`                                                      |

Sizes in the UI: hero 40 px (picker), relic 28 px, enemy and event 96 px, lane effect 18 px (in the 56 px lane strip, so it must read at that size).

## Checking your work

`pnpm art:sheet [faction or id prefix]` (for example `ember`, `hero`, `boss`, `relic`, `relic-ember`, `lane`, `event`, or nothing for everything) writes `art-sheets/<filter>.png`, showing each card at 120, 64 and 40 px. Look at it. At 40 px the subject must still be recognisable. Cards in a faction must also look like one set, and like the reference pieces.

Reference pieces: `ember-spark-imp`, `tide-kraken`, `grove-elder-stag`, `bastion-shieldbearer`, `dusk-shadow-bolt`.
