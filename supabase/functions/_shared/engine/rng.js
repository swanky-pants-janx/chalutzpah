// Random number helpers. Every function takes an `rng` (() => float in [0, 1))
// so the engine stays deterministic under test and cryptographically random on the server.

/** Small, fast seeded PRNG used for board generation and tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unpredictable RNG backed by the Web Crypto API (Deno, Node 19+, browsers). */
export function cryptoRng() {
  const buffer = new Uint32Array(1);
  return function next() {
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0] / 4294967296;
  };
}

export function randomInt(rng, n) {
  return Math.floor(rng() * n);
}

export function pick(rng, items) {
  return items[randomInt(rng, items.length)];
}

/** Fisher–Yates shuffle returning a new array. */
export function shuffle(rng, items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rollDie(rng) {
  return 1 + randomInt(rng, 6);
}

/** A positive 31-bit integer suitable for seeding mulberry32. */
export function randomSeed(rng) {
  return 1 + randomInt(rng, 0x7ffffffe);
}
