// Act map generation: 7 rows of 2–3 nodes, then the boss. Pure and seeded.
import { nextInt, type RngState } from '../rules/rng';

export const MAP_ROWS = 7;
export type NodeType = 'fight' | 'elite' | 'event' | 'rest' | 'shop' | 'treasure' | 'boss';

export interface MapNode {
  row: number;
  col: number;
  type: NodeType;
  /** Columns in the next row this node leads to. */
  next: number[];
}

/** rows[0..MAP_ROWS-1] are the act's rows; rows[MAP_ROWS] holds the single boss node. */
export interface RunMap {
  rows: MapNode[][];
}

const WEIGHTS: [NodeType, number][] = [
  ['fight', 40],
  ['elite', 12],
  ['event', 20],
  ['rest', 10],
  ['shop', 10],
  ['treasure', 8],
];

/** Elites never appear in the first rows of an act. */
export const FIRST_ELITE_ROW = 2;

function rollType(rng: RngState): [NodeType, RngState] {
  const total = WEIGHTS.reduce((n, [, w]) => n + w, 0);
  const [roll, next] = nextInt(rng, 0, total - 1);
  let acc = 0;
  for (const [type, w] of WEIGHTS) {
    acc += w;
    if (roll < acc) return [type, next];
  }
  return ['fight', next];
}

/** Horizontal position of a column, 0–1, as the map draws it. */
function pos(col: number, size: number) {
  return (col + 1) / (size + 1);
}

/** Paths never jump further sideways than this, so they don't cut across other nodes. */
const MAX_DRIFT = 0.3;

/**
 * Links two rows with non-crossing edges that touch every node on both sides: walk a staircase
 * from (0, 0) to (a-1, b-1), stepping down one row, the other, or both at random, avoiding long diagonals.
 */
function linkRows(from: MapNode[], to: MapNode[], rng: RngState): RngState {
  const a = from.length;
  const b = to.length;
  let i = 0;
  let j = 0;
  from[0]!.next.push(0);
  while (i < a - 1 || j < b - 1) {
    const steps: [number, number][] = [];
    if (i < a - 1) steps.push([i + 1, j]);
    if (j < b - 1) steps.push([i, j + 1]);
    if (i < a - 1 && j < b - 1) steps.push([i + 1, j + 1]);
    const short = steps.filter(([x, y]) => Math.abs(pos(x, a) - pos(y, b)) <= MAX_DRIFT);
    const options = short.length > 0 ? short : steps;
    let pick: number;
    [pick, rng] = nextInt(rng, 0, options.length - 1);
    [i, j] = options[pick]!;
    from[i]!.next.push(j);
  }
  for (const n of from) n.next = [...new Set(n.next)].sort((x, y) => x - y);
  return rng;
}

export function generateMap(rng: RngState): [RunMap, RngState] {
  const rows: MapNode[][] = [];
  for (let row = 0; row < MAP_ROWS; row++) {
    let size: number;
    [size, rng] = nextInt(rng, 2, 3);
    const nodes: MapNode[] = [];
    for (let col = 0; col < size; col++) {
      let type: NodeType;
      if (row === 0) type = 'fight';
      else if (row === MAP_ROWS - 1) type = 'rest';
      else {
        [type, rng] = rollType(rng);
        if (type === 'elite' && row < FIRST_ELITE_ROW) type = 'fight';
      }
      nodes.push({ row, col, type, next: [] });
    }
    rows.push(nodes);
  }
  rows.push([{ row: MAP_ROWS, col: 0, type: 'boss', next: [] }]);
  for (let row = 0; row < MAP_ROWS; row++) rng = linkRows(rows[row]!, rows[row + 1]!, rng);
  return [{ rows }, rng];
}

/** Every path from row 0 reaches the boss, and every node is reachable from row 0. */
export function mapProblems(map: RunMap): string[] {
  const problems: string[] = [];
  const { rows } = map;
  if (rows.length !== MAP_ROWS + 1) problems.push(`expected ${MAP_ROWS + 1} rows`);
  const reach = new Set(rows[0]!.map((n) => `0:${n.col}`));
  rows.forEach((nodes, r) => {
    if (r < MAP_ROWS && (nodes.length < 2 || nodes.length > 3))
      problems.push(`row ${r} has ${nodes.length} nodes`);
    for (const n of nodes) {
      const key = `${r}:${n.col}`;
      if (!reach.has(key)) problems.push(`${key} unreachable`);
      if (r < MAP_ROWS && n.next.length === 0) problems.push(`${key} is a dead end`);
      for (const c of n.next) {
        if (!rows[r + 1]?.[c]) problems.push(`${key} links to missing ${r + 1}:${c}`);
        else if (reach.has(key)) reach.add(`${r + 1}:${c}`);
      }
    }
  });
  if (rows[MAP_ROWS]?.[0]?.type !== 'boss') problems.push('last row is not the boss');
  return problems;
}
