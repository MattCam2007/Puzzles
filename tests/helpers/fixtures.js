import { readFileSync } from 'fs';

export function readFixture(name) {
  return JSON.parse(readFileSync(new URL(`../golden/${name}`, import.meta.url), 'utf8'));
}
