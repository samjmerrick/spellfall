import { useMemo, useState } from 'react';
import {
  collectibleCards,
  sortCards,
  getCard,
  type CardDef,
  type CollectibleCard,
  type Faction,
  type Keyword,
} from '../../rules';
import { KEYWORD_NAME } from '../../rules/text';
import { DuelCard } from '../duel/Card';
import { GLYPHS } from '../factions';
import { useDuel } from '../duel/store';
import { useLongPress } from '../useLongPress';

export interface Filters {
  factions: Faction[];
  cost: number | null; // 8 means 8+
  type: 'all' | 'unit' | 'burst' | 'fast' | 'slow';
  keyword: Keyword | 'all';
  rarity: CardDef['rarity'] | 'all';
  search: string;
}

const EMPTY: Filters = { factions: [], cost: null, type: 'all', keyword: 'all', rarity: 'all', search: '' };
const RARITIES: CardDef['rarity'][] = ['common', 'uncommon', 'rare', 'legendary'];

function matches(card: CollectibleCard, f: Filters): boolean {
  if (f.factions.length > 0 && !f.factions.includes(card.faction)) return false;
  if (f.cost !== null && (f.cost === 8 ? card.cost < 8 : card.cost !== f.cost)) return false;
  if (f.type === 'unit' && card.type !== 'unit') return false;
  if (f.type !== 'all' && f.type !== 'unit' && card.speed !== f.type) return false;
  if (f.keyword !== 'all' && !card.keywords.includes(f.keyword)) return false;
  if (f.rarity !== 'all' && card.rarity !== f.rarity) return false;
  const q = f.search.trim().toLowerCase();
  if (q && !card.name.toLowerCase().includes(q) && !card.text.toLowerCase().includes(q)) return false;
  return true;
}

function FilterBar({ value, onChange }: { value: Filters; onChange(f: Filters): void }) {
  const factions = [...new Set(collectibleCards().map((c) => c.faction))];
  return (
    <div className="filters">
      <input
        type="search"
        className="filters__search"
        placeholder="Search name or text"
        aria-label="Search cards"
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
      />
      <div className="chips" role="group" aria-label="Faction">
        {factions.map((f) => (
          <button
            key={f}
            type="button"
            className={`chip faction-${f}${value.factions.includes(f) ? ' chip--on' : ''}`}
            aria-pressed={value.factions.includes(f)}
            onClick={() =>
              onChange({
                ...value,
                factions: value.factions.includes(f)
                  ? value.factions.filter((x) => x !== f)
                  : [...value.factions, f],
              })
            }
          >
            {GLYPHS[f]} {f[0]!.toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="chips chips--cost" role="group" aria-label="Cost">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
          <button
            key={c}
            type="button"
            className={`chip chip--cost${value.cost === c ? ' chip--on' : ''}`}
            aria-pressed={value.cost === c}
            aria-label={c === 8 ? 'Cost 8 or more' : `Cost ${c}`}
            onClick={() => onChange({ ...value, cost: value.cost === c ? null : c })}
          >
            {c === 8 ? '8+' : c}
          </button>
        ))}
      </div>
      <div className="filters__selects">
        <select
          aria-label="Type"
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value as Filters['type'] })}
        >
          <option value="all">All types</option>
          <option value="unit">Units</option>
          <option value="burst">Burst spells</option>
          <option value="fast">Fast spells</option>
          <option value="slow">Slow spells</option>
        </select>
        <select
          aria-label="Keyword"
          value={value.keyword}
          onChange={(e) => onChange({ ...value, keyword: e.target.value as Filters['keyword'] })}
        >
          <option value="all">Any keyword</option>
          {Object.entries(KEYWORD_NAME).map(([k, name]) => (
            <option key={k} value={k}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Rarity"
          value={value.rarity}
          onChange={(e) => onChange({ ...value, rarity: e.target.value as Filters['rarity'] })}
        >
          <option value="all">Any rarity</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r[0]!.toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function GridCard({
  id,
  count,
  limit,
  onTap,
}: {
  id: string;
  count?: number;
  limit?: number;
  onTap(): void;
}) {
  const showDetail = useDuel((s) => s.showDetail);
  const press = useLongPress(onTap, () => showDetail(id));
  const name = getCard(id).name;
  return (
    <button
      type="button"
      className={`grid-card${count ? ' grid-card--in-deck' : ''}`}
      aria-label={`${name}${count !== undefined ? `, ${count} in deck` : ''}`}
      data-card-id={id}
      {...press}
    >
      <DuelCard cardId={id} />
      {count !== undefined && count > 0 && (
        <span className="grid-card__count">
          {count}/{limit}
        </span>
      )}
    </button>
  );
}

export function CardBrowser({
  counts,
  limitFor,
  onTap,
}: {
  counts?: Map<string, number>;
  limitFor?: (id: string) => number;
  onTap(id: string): void;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const cards = useMemo(
    () =>
      sortCards(
        collectibleCards()
          .filter((c) => matches(c, filters))
          .map((c) => c.id),
      ),
    [filters],
  );
  return (
    <>
      <FilterBar value={filters} onChange={setFilters} />
      <div className="card-grid" aria-label="Cards">
        {cards.map((id) => (
          <GridCard
            key={id}
            id={id}
            count={counts ? (counts.get(id) ?? 0) : undefined}
            limit={limitFor?.(id)}
            onTap={() => onTap(id)}
          />
        ))}
        {cards.length === 0 && <p className="empty">No cards match these filters.</p>}
      </div>
    </>
  );
}
