import { collectibleCards } from '../../rules';
import { ownedCards, useApp } from '../app';
import { useDuel } from '../duel/store';
import { CardBrowser } from './CardBrowser';
import { ScreenFrame } from './common';

export function CollectionScreen() {
  const profile = useApp((s) => s.profile);
  const showDetail = useDuel((s) => s.showDetail);
  const owned = ownedCards(profile);
  return (
    <ScreenFrame title={`Collection · ${owned.size}/${collectibleCards().length}`} label="Collection">
      <CardBrowser owned={owned} onTap={showDetail} />
    </ScreenFrame>
  );
}
