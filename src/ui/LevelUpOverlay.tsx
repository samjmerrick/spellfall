import { motion } from 'motion/react';
import { useEffect } from 'react';
import { getCard } from '../rules';
import { getHero, getRelic, type UnlockBundle } from '../run';
import { useApp } from './app';
import { DuelCard } from './duel/Card';
import { FACTION_NAME, GLYPHS } from './factions';
import { Icon } from './Icon';
import { FADE_SECONDS, useDurationScale } from './motion';
import { sfx } from './feedback';
import { useDuel } from './duel/store';
import { useReduceMotion } from './useReduceMotion';

function Bundle({ bundle }: { bundle: UnlockBundle }) {
  return (
    <section className="levelup__bundle" aria-label={`Level ${bundle.level} unlocks`}>
      <h3 className="levelup__level">Level {bundle.level}</h3>
      {bundle.kind === 'cards' && (
        <>
          <p className="levelup__kind">{bundle.ids.length} new cards</p>
          <ul className="levelup__cards">
            {bundle.ids.map((id) => (
              <li key={id} aria-label={getCard(id).name}>
                <DuelCard cardId={id} />
              </li>
            ))}
          </ul>
        </>
      )}
      {bundle.kind === 'hero' &&
        bundle.ids.map((id) => {
          const cards = bundle.ids.filter((x) => !x.startsWith('hero-'));
          if (!id.startsWith('hero-')) return null;
          const h = getHero(id);
          return (
            <div key={id}>
              <p className="levelup__kind">New hero</p>
              <div className={`levelup__hero faction-${h.faction}`}>
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
                </span>
              </div>
              {cards.length > 0 && (
                <>
                  <p className="levelup__kind">{cards.length} new cards</p>
                  <ul className="levelup__cards">
                    {cards.map((c) => (
                      <li key={c} aria-label={getCard(c).name}>
                        <DuelCard cardId={c} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      {bundle.kind === 'relics' && (
        <>
          <p className="levelup__kind">{bundle.ids.length} new relics</p>
          <ul className="relic-list levelup__relics">
            {bundle.ids.map((id) => {
              const r = getRelic(id);
              return (
                <li key={id} className="relic list__row">
                  <span className="relic__icon" aria-hidden>
                    ✦
                  </span>
                  <span className="relic__body">
                    <strong>{r.name}</strong>
                    <span className="relic__text">{r.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Shown on the Quick Play result and the run summary when XP has unlocked something. The profile
 * already holds the new level; this only presents `lastUnlocks` and clears them on dismiss.
 */
export function LevelUpOverlay() {
  const bundles = useApp((s) => s.lastUnlocks);
  const level = useApp((s) => s.profile.level);
  const screen = useApp((s) => s.screen);
  const clear = useApp((s) => s.clearUnlocks);
  const matchOver = useDuel((s) => s.game?.phase === 'over' && !s.busy);
  const reduce = useReduceMotion();
  const scale = useDurationScale();
  const shown =
    bundles.length > 0 && (screen === 'duel' ? matchOver : screen !== 'loading' && screen !== 'corrupt');
  useEffect(() => {
    if (shown) sfx('levelUp');
  }, [shown]);
  if (bundles.length === 0) return null;
  if (screen === 'duel' ? !matchOver : screen === 'loading' || screen === 'corrupt') return null;
  const dur = (reduce ? FADE_SECONDS : 0.3) * scale;
  return (
    <motion.div
      className="overlay levelup"
      role="dialog"
      aria-modal="true"
      aria-label="Level up"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: dur }}
    >
      <div className="levelup__scroll">
        <motion.h2
          className="levelup__title"
          initial={reduce ? false : { scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: dur, ease: 'easeOut' }}
        >
          Level {level}!
        </motion.h2>
        <p className="overlay__hint">You unlocked</p>
        {bundles.map((b) => (
          <Bundle key={`${b.level}-${b.kind}`} bundle={b} />
        ))}
      </div>
      <button type="button" className="primary" autoFocus onClick={clear}>
        Continue
      </button>
    </motion.div>
  );
}
