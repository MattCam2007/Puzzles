import { readFileSync } from 'fs';
import { resolve } from 'path';

// resolve from the project root (vitest's cwd) — import.meta.url is not a
// file:// URL under the jsdom environment
export function readFixture(name) {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'tests/golden', name), 'utf8'));
}
