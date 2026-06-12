/* Regenerates the golden-master fixtures in tests/golden/.
   Run: node scripts/generate-golden.mjs

   Only run this deliberately: the fixtures pin generator behaviour, and the
   kakuro fixtures were originally captured from the pre-refactor engine
   (verified byte-identical to the extracted one). If a fixture changes,
   generation behaviour changed — that's a finding, not a refresh. */

import { writeFileSync, mkdirSync } from 'fs';
import { seededRandom } from '../js/core/random.js';
import { makePuzzle } from '../js/games/sudoku/engine.js';
import { generate } from '../js/games/kakuro/engine.js';
import { mkGrid, spawnTile, computeMove } from '../js/games/2048/engine.js';

mkdirSync('tests/golden', { recursive: true });

const write = (name, data) => {
  writeFileSync(`tests/golden/${name}`, JSON.stringify(data, null, 1) + '\n');
  console.log('wrote', name);
};

// — Sudoku: fixed-seed puzzle per difficulty —
for (const [diff, seed] of [
  ['medium', 7],
  ['easy', 11],
  ['expert', 3],
]) {
  write(`sudoku-${diff}-seed${seed}.json`, makePuzzle(diff, seededRandom(seed)));
}

// — Kakuro: board+clues+solution per level/size —
for (const [level, size, seed] of [
  ['easy', 5, 1234],
  ['medium', 7, 1234],
  ['hard', 9, 1234],
]) {
  write(`kakuro-${level}-${size}-seed${seed}.json`, generate(level, size, seed));
}

// — 2048: scripted move sequence under a seeded RNG —
{
  const rand = seededRandom(99);
  let uid = 0;
  const nextId = () => ++uid;
  let grid = mkGrid();
  spawnTile(grid, rand, nextId);
  spawnTile(grid, rand, nextId);
  let score = 0;
  const dirs = [0, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 0, 0, 3, 2, 1, 0, 1, 2, 3];
  const trace = [];
  for (const dir of dirs) {
    const res = computeMove(grid, dir);
    if (!res) {
      trace.push({ dir, moved: false });
      continue;
    }
    score += res.gained;
    grid = res.newGrid;
    const spawn = spawnTile(grid, rand, nextId);
    trace.push({ dir, moved: true, gained: res.gained, spawn });
  }
  write('2048-seed99-moves.json', { seed: 99, dirs, trace, finalScore: score, finalGrid: grid });
}
