/**
 * Sizes for the simulation tests. The defaults are a quick smoke check (well under a minute in total);
 * set SIM_SCALE=10 (or more) for a thorough local soak before a big content or balance change.
 * Thresholds are deliberately loose: these tests catch broken AI or rules, not small balance drift.
 */
const scale = Math.max(1, Number(process.env.SIM_SCALE ?? 1) || 1);
export const sized = (n: number): number => Math.round(n * scale);
export const SCALE = scale;
