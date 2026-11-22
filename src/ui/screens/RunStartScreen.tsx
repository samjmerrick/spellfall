import { useState } from 'react';
import { getCard } from '../../rules';
import { ascensionRules, HEROES, MAX_ASCENSION } from '../../run';
import { useApp } from '../app';
import { FACTION_NAME, GLYPHS } from '../factions';
import { Icon } from '../Icon';
import { useRun } from '../runStore';
import { ScreenFrame } from './common';

export function RunStartScreen() {
  const profile = useApp((s) => s.profile);
  const [heroId, setHeroId] = useState(HEROES[0]!.id);
  const [asc, setAsc] = useState(0);
  const begin = useRun((s) => s.begin);
  const { unlocked, best } = profile.ascension;
  const level = Math.min(asc, unlocked);
  const rules = ascensionRules(level);
  return (
    <ScreenFrame
      title="New run"
      footer={
        <button type="button" className="primary wide" onClick={() => begin(heroId, level)}>
          Begin run{level > 0 ? ` · Ascension ${level}` : ''}
        </button>
      }
    >
      <p className="hint">
        Clear the map and beat the act boss. You have 3 Hearts; each lost match costs one.
      </p>
      {unlocked >= 1 && (
        <section className="ascent" aria-label="Ascension">
          <h2 className="label">Ascension</h2>
          <div className="stepper">
            <button
              type="button"
              className="icon-button"
              aria-label="Lower Ascension"
              disabled={level <= 0}
              onClick={() => setAsc(level - 1)}
            >
              −
            </button>
            <output className="stepper__value" aria-live="polite">
              {level === 0 ? 'None' : `Ascension ${level}`}
            </output>
            <button
              type="button"
              className="icon-button"
              aria-label="Raise Ascension"
              disabled={level >= Math.min(unlocked, MAX_ASCENSION)}
              onClick={() => setAsc(level + 1)}
            >
              +
            </button>
          </div>
          {best > 0 && <p className="hint">Best: Ascension {best}</p>}
          {rules.length > 0 ? (
            <ol className="ascent__rules" aria-label="Active Ascension rules">
              {rules.map((r) => (
                <li key={r.id} className={r.level === level ? 'ascent__rule--new' : undefined}>
                  <span className="ascent__n">{r.level}</span>
                  {r.text}
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">Standard rules. Win a run to raise the challenge.</p>
          )}
        </section>
      )}
      <h2 className="label">Choose a hero</h2>
      <div className="list" role="radiogroup" aria-label="Hero">
        {HEROES.map((h) => {
          return (
            <button
              key={h.id}
              type="button"
              role="radio"
              aria-checked={h.id === heroId}
              className={`list__row hero-row faction-${h.faction}${h.id === heroId ? ' list__row--on' : ''}`}
              onClick={() => setHeroId(h.id)}
            >
              <span className="hero-row__glyph" aria-hidden>
                <Icon id={h.id} size={40} fallback={GLYPHS[h.faction]} />
              </span>
              <span className="hero-row__text">
                <span className="hero-row__name">
                  {h.name}{' '}
                  <span className="hero-row__faction" aria-label={FACTION_NAME[h.faction]}>
                    {GLYPHS[h.faction]}
                  </span>{' '}
                  <span className="hero-row__title">· {h.title}</span>
                </span>
                <span className="hero-row__passive">{h.passive}</span>
                <span className="hero-row__deck">
                  Starter deck: {h.starterDeck.length} {getCard(h.starterDeck[0]!).faction} cards
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
