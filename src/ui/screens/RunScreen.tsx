import { useState } from 'react';
import { getCard, type Faction } from '../../rules';
import {
  REMOVE_PRICE,
  canChoose,
  getEnemy,
  getEvent,
  getHero,
  getRelic,
  maxHearts,
  upgradable,
  type RunChoice,
  type RunState,
  type ShopItem,
} from '../../run';
import { DuelCard } from '../duel/Card';
import { Icon } from '../Icon';
import { useApp } from '../app';
import { useRun } from '../runStore';
import { useDuel } from '../duel/store';
import { useLongPress } from '../useLongPress';
import { NODE_GLYPH, NODE_LABEL, type NodeType } from '../nodes';
import { FACTION_NAME } from '../factions';
import { RunMap } from './RunMap';

function PickCard({
  cardId,
  label,
  onTap,
  disabled,
}: {
  cardId: string;
  label: string;
  onTap: () => void;
  disabled?: boolean;
}) {
  const showDetail = useDuel((s) => s.showDetail);
  const press = useLongPress(onTap, () => showDetail(cardId));
  return (
    <button
      type="button"
      className={`grid-card${disabled ? ' grid-card--locked' : ''}`}
      aria-label={label}
      aria-disabled={disabled}
      data-card-id={cardId}
      {...press}
    >
      <DuelCard cardId={cardId} />
    </button>
  );
}

function RunBar({ run, onDeck, onRelics }: { run: RunState; onDeck: () => void; onRelics: () => void }) {
  return (
    <div className="run-bar">
      <span className="run-bar__hearts" aria-label={`Hearts ${run.hearts} of ${maxHearts(run)}`}>
        {Array.from({ length: maxHearts(run) }, (_, i) => (
          <span key={i} className={i < run.hearts ? 'heart heart--on' : 'heart'}>
            ♥
          </span>
        ))}
      </span>
      <span className="run-bar__gold" aria-label={`Gold ${run.gold}`}>
        ● {run.gold}
      </span>
      <button type="button" className="chip" onClick={onDeck} aria-label={`Deck, ${run.deck.length} cards`}>
        ▤ {run.deck.length}
      </button>
      <button type="button" className="chip" onClick={onRelics} aria-label={`Relics, ${run.relics.length}`}>
        ✦ {run.relics.length}
      </button>
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overlay overlay--sheet" role="dialog" aria-label={title}>
      <div className="sheet">
        <header className="sheet__header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}

function DeckGrid({
  deck,
  onTap,
  label,
}: {
  deck: string[];
  onTap?: (i: number) => void;
  label: (id: string) => string;
}) {
  const sorted = deck
    .map((id, i) => ({ id, i }))
    .sort((a, b) => getCard(a.id).cost - getCard(b.id).cost || a.id.localeCompare(b.id));
  return (
    <div className="card-grid">
      {sorted.map(({ id, i }) => (
        <PickCard key={i} cardId={id} label={label(id)} onTap={() => onTap?.(i)} />
      ))}
    </div>
  );
}

function RelicList({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <p className="empty">No relics yet. Find them in treasure and shops.</p>;
  return (
    <ul className="relic-list">
      {ids.map((id) => {
        const r = getRelic(id);
        return (
          <li key={id} className="relic">
            <span className="relic__icon" aria-hidden>
              <Icon id={id} size={28} fallback="✦" />
            </span>
            <span>
              <strong>{r.name}</strong>
              <span className="relic__text">{r.text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Encounter({ run }: { run: RunState }) {
  const playMatch = useRun((s) => s.playMatch);
  const saved = useApp((s) => s.profile.activeRun?.match?.step === run.step);
  if (run.phase.kind !== 'match') return null;
  const enemy = getEnemy(run.phase.enemyId);
  return (
    <section className="encounter" aria-label="Encounter">
      <p className="label">{{ boss: `Act ${run.act} boss`, elite: 'Elite', fight: 'Fight' }[enemy.kind]}</p>
      <Icon id={enemy.id} size={96} className="icon--hero" />
      <h2 className="encounter__name">{enemy.name}</h2>
      {enemy.rule && <p className="encounter__rule">Boss rule: {enemy.rule}</p>}
      <p className="hint">
        {enemy.kind === 'elite'
          ? 'A tougher enemy. Win to earn a relic, a card and gold; lose and you lose a Heart.'
          : 'Win to earn a card and gold; lose and you lose a Heart.'}
      </p>
      <button type="button" className="primary wide" onClick={playMatch}>
        {saved ? 'Resume fight' : 'Fight'}
      </button>
    </section>
  );
}

function Reward({ run, choose }: { run: RunState; choose: (c: RunChoice) => void }) {
  if (run.phase.kind !== 'reward') return null;
  return (
    <section className="run-panel" aria-label="Reward">
      <h2>Victory</h2>
      {run.phase.relicId && <RelicList ids={[run.phase.relicId]} />}
      <p className="hint">
        +{run.phase.gold} gold. Choose a card to add to your deck (long-press to read it).
      </p>
      <div className="card-grid">
        {run.phase.cards.map((id, i) => (
          <PickCard
            key={i}
            cardId={id}
            label={`Take ${getCard(id).name}`}
            onTap={() => choose({ t: 'pick', index: i })}
          />
        ))}
      </div>
      <button type="button" className="secondary wide" onClick={() => choose({ t: 'pick', index: null })}>
        Skip
      </button>
    </section>
  );
}

function itemName(item: ShopItem) {
  return item.kind === 'card' ? getCard(item.id).name : getRelic(item.id).name;
}

function Shop({ run, choose }: { run: RunState; choose: (c: RunChoice) => void }) {
  const [removing, setRemoving] = useState(false);
  if (run.phase.kind !== 'shop') return null;
  const { stock, removed } = run.phase;
  const cards = stock.map((item, i) => ({ item, i })).filter((x) => x.item.kind === 'card');
  const relics = stock.map((item, i) => ({ item, i })).filter((x) => x.item.kind === 'relic');
  const cant = (item: ShopItem) => item.sold || item.price > run.gold;
  return (
    <section className="run-panel" aria-label="Shop">
      <h2>Shop</h2>
      <h3 className="label">Cards</h3>
      <div className="card-grid">
        {cards.map(({ item, i }) => (
          <div key={i} className="shop-item">
            <PickCard
              cardId={item.id}
              label={`Buy ${itemName(item)} for ${item.price} gold${item.sold ? ' (sold)' : ''}`}
              disabled={cant(item)}
              onTap={() => !cant(item) && choose({ t: 'buy', index: i })}
            />
            <span className="shop-item__price">{item.sold ? 'Sold' : `● ${item.price}`}</span>
          </div>
        ))}
      </div>
      <h3 className="label">Relics</h3>
      <div className="list">
        {relics.map(({ item, i }) => {
          const r = getRelic(item.id);
          return (
            <button
              key={i}
              type="button"
              className="list__row relic"
              disabled={cant(item)}
              aria-label={`Buy ${r.name} for ${item.price} gold${item.sold ? ' (sold)' : ''}`}
              onClick={() => choose({ t: 'buy', index: i })}
            >
              <span className="relic__icon" aria-hidden>
                <Icon id={r.id} size={28} fallback="✦" />
              </span>
              <span className="relic__body">
                <strong>{r.name}</strong>
                <span className="relic__text">{r.text}</span>
              </span>
              <span className="shop-item__price">{item.sold ? 'Sold' : `● ${item.price}`}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="secondary wide"
        disabled={removed || run.gold < REMOVE_PRICE || run.deck.length <= 1}
        onClick={() => setRemoving(true)}
      >
        {removed ? 'Card removed' : `Remove a card · ● ${REMOVE_PRICE}`}
      </button>
      <button type="button" className="primary wide" onClick={() => choose({ t: 'leave' })}>
        Leave shop
      </button>
      {removing && (
        <Sheet title="Remove a card" onClose={() => setRemoving(false)}>
          <DeckGrid
            deck={run.deck}
            label={(id) => `Remove ${getCard(id).name}`}
            onTap={(i) => {
              setRemoving(false);
              choose({ t: 'removeCard', index: i });
            }}
          />
        </Sheet>
      )}
    </section>
  );
}

function Rest({ run, choose }: { run: RunState; choose: (c: RunChoice) => void }) {
  const [upgrading, setUpgrading] = useState(false);
  const full = run.hearts >= maxHearts(run);
  const options = upgradable(run);
  return (
    <section className="run-panel" aria-label="Rest">
      <h2>Campfire</h2>
      <p className="hint">
        {full ? 'Your Hearts are full.' : 'Rest to restore 1 Heart,'} or upgrade one card (+1 Power, or a
        stronger effect).
      </p>
      <button type="button" className="primary wide" disabled={full} onClick={() => choose({ t: 'rest' })}>
        Restore 1 Heart
      </button>
      <button
        type="button"
        className="primary wide"
        disabled={options.length === 0}
        onClick={() => setUpgrading(true)}
      >
        Upgrade a card
      </button>
      <button type="button" className="secondary wide" onClick={() => choose({ t: 'leave' })}>
        Move on
      </button>
      {upgrading && (
        <Sheet title="Upgrade a card" onClose={() => setUpgrading(false)}>
          <p className="hint">Long-press a card to compare. Tap to upgrade it.</p>
          <div className="card-grid">
            {options.map((i) => {
              const id = run.deck[i]!;
              return (
                <PickCard
                  key={i}
                  cardId={`${id}+`}
                  label={`Upgrade ${getCard(id).name}`}
                  onTap={() => {
                    setUpgrading(false);
                    choose({ t: 'upgrade', index: i });
                  }}
                />
              );
            })}
          </div>
        </Sheet>
      )}
    </section>
  );
}

function EventScene({ run, choose }: { run: RunState; choose: (c: RunChoice) => void }) {
  if (run.phase.kind !== 'event') return null;
  const event = getEvent(run.phase.eventId);
  const { chosen, result } = run.phase;
  const costText = (cost: { gold?: number; hearts?: number }) =>
    [cost.gold && `● ${cost.gold}`, cost.hearts && `−${cost.hearts} ♥`].filter(Boolean).join(' · ');
  return (
    <section className="run-panel event" aria-label="Event">
      <Icon id={event.id} size={96} className="icon--hero" />
      <h2>{event.name}</h2>
      <p className="event__text">{event.text}</p>
      {chosen === null ? (
        event.choices.map((c, i) => {
          const ok = canChoose(run, c.cost);
          const cost = costText(c.cost);
          return (
            <button
              key={i}
              type="button"
              className={c.outcomes.length === 0 && !cost ? 'secondary wide' : 'primary wide'}
              disabled={!ok}
              onClick={() => choose({ t: 'event', index: i })}
            >
              {c.label}
              {cost && <span className="event__cost"> ({cost})</span>}
            </button>
          );
        })
      ) : (
        <>
          <p className="event__result">{event.choices[chosen]!.result}</p>
          <ul className="event__outcomes" aria-label="Outcome">
            {result.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <button type="button" className="primary wide" onClick={() => choose({ t: 'leave' })}>
            Continue
          </button>
        </>
      )}
    </section>
  );
}

function ActCleared({ run, choose }: { run: RunState; choose: (c: RunChoice) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  if (run.phase.kind !== 'actCleared') return null;
  const { act, relicId, gold, factions } = run.phase;
  return (
    <section className="run-panel" aria-label="Act cleared">
      <h2>Act {act} cleared</h2>
      <p className="hint">+{gold} gold and a relic. A new act restores 1 Heart.</p>
      {relicId && <RelicList ids={[relicId]} />}
      {factions.length > 0 && (
        <>
          <h3 className="label">Add a second faction</h3>
          <p className="hint">Its cards will appear in your card rewards and shops from now on.</p>
          <div className="segmented segmented--wrap" role="radiogroup" aria-label="Second faction">
            {factions.map((f: Faction, i) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={pick === i}
                className={`faction-${f}${pick === i ? ' segmented--on' : ''}`}
                onClick={() => setPick(i)}
              >
                {FACTION_NAME[f]}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        className="primary wide"
        disabled={factions.length > 0 && pick === null}
        onClick={() => choose({ t: 'nextAct', faction: pick })}
      >
        Start act {act + 1}
      </button>
    </section>
  );
}

function Treasure({ run, choose }: { run: RunState; choose: (c: RunChoice) => void }) {
  if (run.phase.kind !== 'treasure') return null;
  const { relicId, gold } = run.phase;
  return (
    <section className="run-panel" aria-label="Treasure">
      <h2>Treasure</h2>
      {relicId ? <RelicList ids={[relicId]} /> : <p className="hint">The chest holds {gold} gold.</p>}
      <button type="button" className="primary wide" onClick={() => choose({ t: 'leave' })}>
        Continue
      </button>
    </section>
  );
}

const LEGEND: NodeType[] = ['fight', 'elite', 'event', 'rest', 'shop', 'treasure', 'boss'];

export function RunScreen() {
  const run = useRun((s) => s.run);
  const error = useRun((s) => s.error);
  const choose = useRun((s) => s.choose);
  const go = useApp((s) => s.go);
  const [sheet, setSheet] = useState<'deck' | 'relics' | 'abandon' | null>(null);
  if (!run) return null;
  const hero = getHero(run.config.heroId);
  const kind = run.phase.kind;
  return (
    <main className="screen run" aria-label="Run">
      <header className="screen__header">
        <button type="button" className="icon-button" aria-label="Back to menu" onClick={() => go('menu')}>
          ‹
        </button>
        <h1>
          {hero.name} · Act {run.act}
        </h1>
      </header>
      <RunBar run={run} onDeck={() => setSheet('deck')} onRelics={() => setSheet('relics')} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="screen__body">
        {kind === 'map' && (
          <>
            <p className="hint">
              {run.row < 0 ? 'Choose where to start.' : `Next: pick a node on row ${run.row + 2}.`} Legend:{' '}
              {LEGEND.map((t) => `${NODE_GLYPH[t]} ${NODE_LABEL[t]}`).join(' · ')}
            </p>
            <RunMap run={run} onMove={(col) => choose({ t: 'move', col })} />
            <button type="button" className="danger wide" onClick={() => setSheet('abandon')}>
              Abandon run
            </button>
          </>
        )}
        {kind === 'match' && <Encounter run={run} />}
        {kind === 'reward' && <Reward run={run} choose={choose} />}
        {kind === 'shop' && <Shop run={run} choose={choose} />}
        {kind === 'rest' && <Rest run={run} choose={choose} />}
        {kind === 'treasure' && <Treasure run={run} choose={choose} />}
        {kind === 'event' && <EventScene run={run} choose={choose} />}
        {kind === 'actCleared' && <ActCleared run={run} choose={choose} />}
      </div>
      {sheet === 'deck' && (
        <Sheet title={`Deck · ${run.deck.length} cards`} onClose={() => setSheet(null)}>
          <DeckGrid deck={run.deck} label={(id) => getCard(id).name} />
        </Sheet>
      )}
      {sheet === 'relics' && (
        <Sheet title="Relics" onClose={() => setSheet(null)}>
          <p className="hint">Hero passive: {hero.passive}</p>
          <RelicList ids={run.relics} />
        </Sheet>
      )}
      {sheet === 'abandon' && (
        <Sheet title="Abandon run?" onClose={() => setSheet(null)}>
          <p className="hint">The run ends now and counts as a loss.</p>
          <button
            type="button"
            className="danger wide"
            onClick={() => {
              setSheet(null);
              choose({ t: 'abandon' });
            }}
          >
            Abandon
          </button>
          <button type="button" className="secondary wide" onClick={() => setSheet(null)}>
            Keep playing
          </button>
        </Sheet>
      )}
    </main>
  );
}
