import { baseId } from '../rules';

// One SVG per base card id in src/content/art/<id>.svg. Vite emits them as separate hashed assets
// (never inlined, see vite.config.ts) and the service worker precaches them.
const modules = import.meta.glob('../content/art/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const ART: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  const id = /([^/]+)\.svg$/.exec(path)?.[1];
  if (id) ART[id] = url;
}

/** URL of the illustration for a card id (upgrades share the base art), or undefined if none exists. */
export function artUrl(id: string): string | undefined {
  return ART[baseId(id)];
}
