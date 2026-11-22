// Save codes: the profile JSON, deflate-compressed, base64url-encoded, with a checksum.
// Format: "SS1." + base64url(deflate(json)) + "." + checksum(json)
import { checksum } from './checksum';
import { migrate } from './migrations';
import type { Profile } from './profile';

const PREFIX = 'SS1.';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

export async function exportSaveCode(profile: Profile): Promise<string> {
  const json = JSON.stringify(profile);
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return `${PREFIX}${toBase64Url(packed)}.${checksum(json)}`;
}

/** Parses a save code back into a profile, migrating older versions. Throws a readable Error if invalid. */
export async function importSaveCode(code: string): Promise<Profile> {
  const parts = code.trim().split('.');
  if (parts.length !== 3 || `${parts[0]}.` !== PREFIX) throw new Error('That is not a Spellfall save code');
  let json: string;
  try {
    const bytes = await pipe(fromBase64Url(parts[1]!), new DecompressionStream('deflate-raw'));
    json = new TextDecoder().decode(bytes);
  } catch {
    throw new Error('The save code is damaged');
  }
  if (checksum(json) !== parts[2]) throw new Error('The save code is damaged (checksum mismatch)');
  try {
    return migrate(JSON.parse(json));
  } catch (err) {
    throw new Error(
      `The save code is not a valid save: ${err instanceof Error ? err.message : String(err)}`,
      {
        cause: err,
      },
    );
  }
}
