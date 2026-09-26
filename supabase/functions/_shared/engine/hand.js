// Helpers for resource bundles: plain objects like { timber: 2, wheat: 1 }.

import { RESOURCES } from './constants.js';
import { GameError } from './errors.js';

export const emptyHand = () => ({ timber: 0, clay: 0, fleece: 0, wheat: 0, stone: 0 });

export const isResource = (value) => RESOURCES.includes(value);

export function handSize(hand) {
  if (!hand) return 0;
  return RESOURCES.reduce((total, r) => total + (hand[r] ?? 0), 0);
}

export function hasAll(hand, cost) {
  return RESOURCES.every((r) => (hand?.[r] ?? 0) >= (cost[r] ?? 0));
}

export function addTo(hand, bundle, sign = 1) {
  for (const r of RESOURCES) hand[r] = (hand[r] ?? 0) + sign * (bundle[r] ?? 0);
}

export function transfer(from, to, bundle) {
  addTo(from, bundle, -1);
  addTo(to, bundle, 1);
}

/** Expand a hand into a flat list of cards, e.g. ['timber', 'timber', 'wheat']. */
export function handToList(hand) {
  return RESOURCES.flatMap((r) => Array(hand[r] ?? 0).fill(r));
}

/** Only the non-zero entries, for compact logs. */
export function compact(bundle) {
  const out = {};
  for (const r of RESOURCES) if (bundle[r]) out[r] = bundle[r];
  return out;
}

/**
 * Validate untrusted input into a full bundle of non-negative integers.
 * Throws GameError on anything unexpected.
 */
export function parseBundle(input, { max = 40 } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new GameError('BAD_BUNDLE', 'That resource selection is invalid.');
  }
  const bundle = emptyHand();
  for (const [key, value] of Object.entries(input)) {
    if (!isResource(key)) throw new GameError('BAD_BUNDLE', `Unknown resource "${key}".`);
    if (!Number.isInteger(value) || value < 0 || value > max) {
      throw new GameError('BAD_BUNDLE', 'Resource amounts must be whole numbers.');
    }
    bundle[key] = value;
  }
  return bundle;
}
