// Deterministic island generation: the same seed always yields the same map.

import { HARBOR_TYPES, MAP_NUMBER_MAX, NUMBER_TOKENS, TERRAIN_COUNTS } from './constants.js';
import { GameError } from './errors.js';
import { mulberry32, randomInt, shuffle } from './rng.js';
import { TOPOLOGY } from './topology.js';

const HOT_NUMBERS = new Set([6, 8]);
const MAX_NUMBER_ATTEMPTS = 2000;

/**
 * Build a board from a seed.
 * @returns {{ seed: number, hexes: {terrain: string, number: number|null}[], harbors: {edge: number, type: string}[], desert: number }}
 */
export function generateBoard(seed) {
  const rng = mulberry32(seed);
  const terrainBag = Object.entries(TERRAIN_COUNTS).flatMap(([terrain, n]) => Array(n).fill(terrain));
  const terrains = shuffle(rng, terrainBag);
  const producing = TOPOLOGY.hexes.filter((hex) => terrains[hex.id] !== 'dunes').map((hex) => hex.id);

  let numbers = null;
  for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt++) {
    const bag = shuffle(rng, NUMBER_TOKENS);
    const candidate = new Array(TOPOLOGY.hexes.length).fill(null);
    producing.forEach((hexId, i) => {
      candidate[hexId] = bag[i];
    });
    numbers = candidate;
    if (isBalanced(candidate)) break;
  }

  const harborTypes = shuffle(rng, HARBOR_TYPES);
  const hexes = TOPOLOGY.hexes.map((hex) => ({ terrain: terrains[hex.id], number: numbers[hex.id] }));

  return {
    seed,
    hexes,
    harbors: TOPOLOGY.harborSlots.map((edge, i) => ({ edge, type: harborTypes[i] })),
    desert: hexes.findIndex((hex) => hex.terrain === 'dunes'),
  };
}

/** No two 6/8 tiles touch, and no two identical numbers touch. */
export function isBalanced(numbers) {
  for (const hex of TOPOLOGY.hexes) {
    const n = numbers[hex.id];
    if (n == null) continue;
    for (const neighbor of hex.neighbors) {
      const m = numbers[neighbor];
      if (m == null) continue;
      if (n === m) return false;
      if (HOT_NUMBERS.has(n) && HOT_NUMBERS.has(m)) return false;
    }
  }
  return true;
}

/** A fresh island number (1–999999). The number is the board's seed, so it can be shared and replayed. */
export function randomMapNumber(rng) {
  return 1 + randomInt(rng, MAP_NUMBER_MAX);
}

/** Validate a map number typed by a player. */
export function parseMapNumber(value) {
  const n = typeof value === 'string' ? Number(value.replace(/[\s,.]/g, '')) : value;
  if (!Number.isInteger(n) || n < 1 || n > MAP_NUMBER_MAX) {
    throw new GameError('BAD_MAP', `Map numbers run from 1 to ${MAP_NUMBER_MAX}.`);
  }
  return n;
}
