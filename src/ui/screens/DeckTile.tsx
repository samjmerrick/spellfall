import { deckFactions, getCard } from '../../rules';
import { CardArt } from '../CardView';
import { GLYPHS } from '../factions';

export function DeckTile({
  name,
  cover,
  cards,
  sub,
}: {
  name: string;
  cover: string;
  cards: string[];
  sub?: string;
}) {
  const card = getCard(cover);
  return (
    <span className="deck-tile">
      <span className={`deck-tile__cover faction-${card.faction}`}>
        <CardArt id={card.id} faction={card.faction} />
      </span>
      <span className="deck-tile__text">
        <span className="deck-tile__name">{name}</span>
        <span className="deck-tile__sub">
          {deckFactions(cards)
            .map((f) => GLYPHS[f])
            .join(' ')}{' '}
          · {cards.length} cards{sub ? ` · ${sub}` : ''}
        </span>
      </span>
    </span>
  );
}
