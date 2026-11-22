import { collectibleCards } from '../../rules';
import { useDuel } from '../duel/store';
import { CardBrowser } from './CardBrowser';
import { ScreenFrame } from './common';

export function CollectionScreen() {
  const showDetail = useDuel((s) => s.showDetail);
  return (
    <ScreenFrame title={`Collection · ${collectibleCards().length} cards`} label="Collection">
      <CardBrowser onTap={showDetail} />
    </ScreenFrame>
  );
}
