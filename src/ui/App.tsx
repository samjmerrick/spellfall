import { useEffect } from 'react';
import { useApp } from './app';
import { DuelScreen } from './duel/DuelScreen';
import { DetailOverlay } from './duel/Overlays';
import { RotateNotice } from './RotateNotice';
import { useReduceMotion } from './useReduceMotion';
import { CollectionScreen } from './screens/CollectionScreen';
import { CorruptScreen } from './screens/CorruptScreen';
import { DeckBuilderScreen } from './screens/DeckBuilderScreen';
import { DecksScreen } from './screens/DecksScreen';
import { MenuScreen } from './screens/MenuScreen';
import { QuickPlayScreen } from './screens/QuickPlayScreen';
import { RunScreen } from './screens/RunScreen';
import { RunStartScreen } from './screens/RunStartScreen';
import { RunSummaryScreen } from './screens/RunSummaryScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';

function CurrentScreen() {
  const screen = useApp((s) => s.screen);
  switch (screen) {
    case 'loading':
      return <main className="loading" aria-label="Loading" aria-busy="true" />;
    case 'corrupt':
      return <CorruptScreen />;
    case 'menu':
      return <MenuScreen />;
    case 'quickplay':
      return <QuickPlayScreen />;
    case 'decks':
      return <DecksScreen />;
    case 'builder':
      return <DeckBuilderScreen />;
    case 'collection':
      return <CollectionScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'stats':
      return <StatsScreen />;
    case 'duel':
      return <DuelScreen />;
    case 'runStart':
      return <RunStartScreen />;
    case 'run':
      return <RunScreen />;
    case 'runSummary':
      return <RunSummaryScreen />;
  }
}

export function App() {
  const boot = useApp((s) => s.boot);
  useEffect(() => {
    void boot();
  }, [boot]);
  // CSS animations follow the same switch as the motion components (see the `.reduce-motion` rules).
  const reduce = useReduceMotion();
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduce);
  }, [reduce]);
  return (
    <>
      <CurrentScreen />
      <DetailOverlay />
      <RotateNotice />
    </>
  );
}
