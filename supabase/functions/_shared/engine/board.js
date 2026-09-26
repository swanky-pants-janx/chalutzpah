// Deterministic island generation: the same seed always yields the same map.

import { MAP_NUMBER_MAX } from './constants.js';
import { GameError } from './errors.js';
import { mulberry32, randomInt, shuffle } from './rng.js';
import { LAYOUT_IDS, layoutOf } from './layouts.js';
import { topologyFor } from './topology.js';

const HOT_NUMBERS = new Set([6, 8]);
const MAX_NUMBER_ATTEMPTS = 2000;

/**
 * Build a board from a seed.
 * @returns {{ seed: number, hexes: {terrain: string, number: number|null}[], harbors: {edge: number, type: string}[], desert: number }}
 */
export function generateBoard(seed, layout = 'classic') {
  const id = LAYOUT_IDS.includes(layout) ? layout : 'classic';
  const spec = layoutOf(id);
  const topology = topologyFor(id);
  const rng = mulberry32(seed);
  const terrainBag = Object.entries(spec.terrain).flatMap(([terrain, n]) => Array(n).fill(terrain));
  const terrains = shuffle(rng, terrainBag);
  const producing = topology.hexes.filter((hex) => terrains[hex.id] !== 'dunes').map((hex) => hex.id);

  let numbers = null;
  let balanced = false;
  for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS && !balanced; attempt++) {
    const bag = shuffle(rng, spec.numbers);
    const candidate = new Array(topology.hexes.length).fill(null);
    producing.forEach((hexId, i) => {
      candidate[hexId] = bag[i];
    });
    numbers = candidate;
    balanced = isBalanced(candidate, topology);
  }
  // Bigger islands are harder to balance by luck: fall back to a search.
  if (!balanced) numbers = placeNumbers(rng, topology, producing, spec.numbers) ?? numbers;

  const harborTypes = shuffle(rng, spec.harbors);
  const hexes = topology.hexes.map((hex) => ({ terrain: terrains[hex.id], number: numbers[hex.id] }));

  return {
    seed,
    layout: id,
    hexes,
    harbors: topology.harborSlots.map((edge, i) => ({ edge, type: harborTypes[i] })),
    desert: hexes.findIndex((hex) => hex.terrain === 'dunes'),
  };
}

/** Seeded backtracking search for a balanced number placement (null if none found). */
function placeNumbers(rng, topology, producing, tokens) {
  const remaining = new Map();
  for (const n of tokens) remaining.set(n, (remaining.get(n) ?? 0) + 1);
  const numbers = new Array(topology.hexes.length).fill(null);
  const order = shuffle(rng, producing).sort((a, b) => topology.hexes[b].neighbors.length - topology.hexes[a].neighbors.length);
  let budget = 200_000;

  const fits = (hex, n) =>
    topology.hexes[hex].neighbors.every((nb) => {
      const m = numbers[nb];
      return m == null || (m !== n && !(HOT_NUMBERS.has(n) && HOT_NUMBERS.has(m)));
    });

  const place = (i) => {
    if (i === order.length) return true;
    if (--budget < 0) return false;
    const hex = order[i];
    const choices = shuffle(rng, [...remaining.keys()].filter((n) => remaining.get(n) > 0));
    // Hot numbers first: they're the hardest to fit.
    choices.sort((a, b) => Number(HOT_NUMBERS.has(b)) - Number(HOT_NUMBERS.has(a)));
    for (const n of choices) {
      if (!fits(hex, n)) continue;
      numbers[hex] = n;
      remaining.set(n, remaining.get(n) - 1);
      if (place(i + 1)) return true;
      remaining.set(n, remaining.get(n) + 1);
      numbers[hex] = null;
    }
    return false;
  };

  return place(0) ? numbers : null;
}

/** No two 6/8 tiles touch, and no two identical numbers touch. */
export function isBalanced(numbers, topology = topologyFor('classic')) {
  for (const hex of topology.hexes) {
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
