// Rewrites every card's `text` in src/content/next/cards.json from its data (src/rules/text.ts).
import { readFileSync, writeFileSync } from 'node:fs';
import { generatedText } from '../../src/rules/content';
import { CardListSchema } from '../../src/rules/schema';

const path = 'src/content/next/cards.json';
const raw = JSON.parse(readFileSync(path, 'utf8')) as { text: string }[];
const parsed = CardListSchema.parse(raw);
parsed.forEach((card, i) => {
  raw[i]!.text = generatedText(card);
});
writeFileSync(path, JSON.stringify(raw, null, 2) + '\n');
console.log(`Wrote ${raw.length} card texts`);
