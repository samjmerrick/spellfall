import { getHero } from '../../run';
import type { Profile } from '../../save';
import { useApp } from '../app';
import { currentIosEnv, shouldShowIosTip } from '../ios';
import { useRun } from '../runStore';
import { useMatch } from '../store';
import { XpBar } from './XpBar';

/** A fresh profile: the tutorial has not been played or skipped and nothing else has either. */
function isNewPlayer(p: Profile): boolean {
  return (
    !p.tutorialDone &&
    p.xp === 0 &&
    !p.activeRun &&
    Object.keys(p.stats.quickPlay).length === 0 &&
    Object.keys(p.stats.runs).length === 0
  );
}

export function MenuScreen() {
  const go = useApp((s) => s.go);
  const profile = useApp((s) => s.profile);
  const fellBack = useApp((s) => s.fellBack);
  const active = profile.activeRun;
  const resume = useRun((s) => s.resume);
  const runError = useRun((s) => s.error);
  const dismissIosTip = useApp((s) => s.dismissIosTip);
  const completeTutorial = useApp((s) => s.completeTutorial);
  const startTutorial = useMatch((s) => s.startTutorial);
  // A new player gets the prompt in place of the Tutorial button.
  const newPlayer = isNewPlayer(profile);
  const showTip = shouldShowIosTip(currentIosEnv(), profile.iosTipSeen);
  return (
    <main className={`menu${showTip ? ' menu--tip' : ''}`} aria-label="Main menu">
      <header className="menu__header">
        <h1>Spellfall</h1>
        <p>Pick your targets. Answer every spell.</p>
        <XpBar xp={profile.xp} className="menu__xp" />
      </header>
      {fellBack && (
        <p className="notice" role="status">
          Your latest save was damaged, so the previous one was loaded.
        </p>
      )}
      {runError && !active && (
        <p className="notice" role="status">
          {runError}
        </p>
      )}
      {newPlayer && (
        <aside className="menu__prompt" data-testid="tutorial-prompt" aria-label="Tutorial">
          <p>New here? Play the tutorial.</p>
          <button type="button" className="primary" onClick={startTutorial}>
            Play
          </button>
          <button type="button" className="secondary" onClick={completeTutorial}>
            Skip
          </button>
        </aside>
      )}
      <nav className="menu__nav">
        {active ? (
          <button type="button" className="primary" onClick={resume}>
            Continue run · {getHero(active.config.heroId).name}
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => go('runStart')}>
            New run
          </button>
        )}
        <button type="button" className={active ? 'secondary' : 'primary'} onClick={() => go('quickplay')}>
          Quick Play
        </button>
        <button type="button" className="secondary" onClick={() => go('decks')}>
          Decks
        </button>
        <button type="button" className="secondary" onClick={() => go('collection')}>
          Collection
        </button>
        <button type="button" className="secondary" onClick={() => go('stats')}>
          Stats
        </button>
        {!newPlayer && (
          <button type="button" className="secondary" onClick={startTutorial}>
            Tutorial
          </button>
        )}
        <button type="button" className="secondary" onClick={() => go('settings')}>
          Settings
        </button>
      </nav>
      {showTip && (
        <aside className="ios-tip" data-testid="ios-tip" aria-label="Install tip">
          <p>
            Install Spellfall: tap Share, then Add to Home Screen. This keeps your save safe from
            Safari&apos;s data clearing.
          </p>
          <button type="button" className="primary" onClick={dismissIosTip}>
            Got it
          </button>
        </aside>
      )}
    </main>
  );
}
