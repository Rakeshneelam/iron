/**
 * Makes the app's own modules importable under `node --test`: resolves the `@/…`
 * alias and extensionless relative imports, and swaps the three native modules
 * (expo-sqlite, expo-crypto) for in-process stand-ins. Test-only.
 */
import { statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const support = (name: string) => pathToFileURL(join(ROOT, 'tests/support', name)).href;

const STUBS: Record<string, string> = {
  '@/db/client': support('client.ts'),
  'expo-sqlite': support('expo-sqlite-stub.ts'),
  'expo-crypto': support('expo-crypto-stub.ts'),
  'better-sqlite3': support('better-sqlite3-stub.ts'),
  react: support('react-stub.ts'),
  'expo-constants': support('expo-misc-stub.ts'),
  'expo-file-system': support('expo-misc-stub.ts'),
  'expo-haptics': support('expo-haptics-stub.ts'),
};

/** `./foo` and `@/foo` are written without an extension; find the real file. */
function withExtension(base: string): string | null {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, next) {
    const stub = STUBS[specifier];
    if (stub) return next(stub, context);

    if (specifier.startsWith('@/')) {
      const hit = withExtension(join(ROOT, 'src', specifier.slice(2)));
      if (hit) return next(pathToFileURL(hit).href, context);
    }
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const hit = withExtension(join(dirname(fileURLToPath(context.parentURL)), specifier));
      if (hit) return next(pathToFileURL(hit).href, context);
    }
    return next(specifier, context);
  },
});
