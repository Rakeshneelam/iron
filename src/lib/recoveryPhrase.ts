/**
 * The recovery phrase (docs/superpowers/specs/2026-09-12-backup-and-restore-design.md).
 *
 * This is the root secret: the SQLCipher key is derived from it, not the other way
 * round. It gets typed by hand, on a phone, possibly years later, by someone who has
 * just lost theirs — so every decision here favours the transcriber.
 *
 * Crockford base32: no U, and O/I/L are FOLDED onto 0/1/1 rather than rejected.
 * Folding is the kinder half of that choice — someone who reads `0` as `O` gets
 * their data back instead of an error message about a character they cannot see.
 *
 * 15 bytes -> 24 characters -> 120 bits, shown as six groups of four.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BITS = 5;
const BYTES = 15;
export const PHRASE_CHARS = (BYTES * 8) / BITS; // 24
const GROUP = 4;

/** Upper-cases, drops separators, and folds the glyphs people confuse. */
export function normalisePhrase(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function formatPhrase(raw: string): string {
  const s = normalisePhrase(raw);
  const groups: string[] = [];
  for (let i = 0; i < s.length; i += GROUP) groups.push(s.slice(i, i + GROUP));
  return groups.join('-');
}

/**
 * For display. A non-breaking hyphen (U+2011) keeps each group whole, and a normal
 * space between groups lets the line wrap only between them — wrapping inside a
 * group changes the characters someone writes down.
 */
export function displayPhrase(raw: string): string {
  const s = normalisePhrase(raw);
  const groups: string[] = [];
  for (let i = 0; i < s.length; i += GROUP) groups.push(s.slice(i, i + GROUP));
  return groups.join('\u2011 ');
}

export function encodePhrase(bytes: Uint8Array): string {
  if (bytes.length !== BYTES) throw new Error(`a phrase is ${BYTES} bytes, got ${bytes.length}`);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= BITS) {
      bits -= BITS;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }
  return formatPhrase(out);
}

/** Throws with a reason the UI can show as-is. */
export function decodePhrase(phrase: string): Uint8Array {
  const s = normalisePhrase(phrase);
  if (s.length !== PHRASE_CHARS) {
    throw new Error(`A recovery phrase is ${PHRASE_CHARS} characters. This one has ${s.length}.`);
  }
  const out = new Uint8Array(BYTES);
  let bits = 0;
  let value = 0;
  let i = 0;
  for (const ch of s) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`"${ch}" is not part of a recovery phrase.`);
    value = (value << BITS) | idx;
    bits += BITS;
    if (bits >= 8) {
      bits -= 8;
      out[i++] = (value >>> bits) & 0xff;
    }
  }
  return out;
}

/**
 * What actually goes to `PRAGMA key`. SQLCipher runs its own PBKDF2 over a text
 * passphrase, so there is no key derivation to write (or get wrong) in JS — and no
 * async hashing, which matters because the database opens synchronously at startup.
 */
export function phraseToKey(phrase: string): string {
  const s = normalisePhrase(phrase);
  decodePhrase(s); // reject anything malformed before it reaches SQLite
  return s;
}
