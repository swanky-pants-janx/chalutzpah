// Test helpers: build games quickly and poke state directly for targeted rule tests.

import {
  TOPOLOGY,
  applyAction,
  createGame,
  emptyHand,
  joinGame,
  legalRoadEdges,
  legalSettlementVertices,
  mulberry32,
  startGame,
  updateLongestRoad,
} from '../supabase/functions/_shared/engine/index.js';

export const users = ['u-ana', 'u-ben', 'u-cal', 'u-dov'];
export const names = ['Ana', 'Ben', 'Cal', 'Dov'];

/** A fixed "dice" sequence: each call returns the next die face. */
export function diceRng(faces) {
  const queue = [...faces];
  return () => {
    if (queue.length === 0) throw new Error('diceRng ran out of faces');
    return (queue.shift() - 1) / 6 + 0.01;
  };
}

export function lobby(n = 3, { seed = 42, settings } = {}) {
  let s = createGame({
    gameId: 'g-1',
    code: 'ABCDE',
    settings: settings ?? { maxPlayers: 4 },
    seed,
    host: { playerId: 'p0', userId: users[0], name: names[0] },
    now: 0,
  });
  for (let i = 1; i < n; i++) s = joinGame(s, { userId: users[i], name: names[i], playerId: `p${i}` });
  return s;
}

/** Started game, seats kept in join order (identity shuffle). */
export function started(n = 3, opts) {
  const s = lobby(n, opts);
  const identity = () => 0.999999; // Fisher–Yates with j = i keeps the order
  return startGame(s, users[0], { rng: identity, now: 1 });
}

export const act = (s, i, action, ctx = {}) => applyAction(s, users[i], action, { rng: mulberry32(7), ...ctx });

/** Play through setup with the first legal spots, returning a 'roll' phase state. */
export function afterSetup(n = 3, opts) {
  let s = started(n, opts);
  while (s.status === 'setup') {
    const cur = s.turn.current;
    const v = legalSettlementVertices(s, cur, { setup: true })[0];
    s = act(s, cur, { type: 'BUILD_SETTLEMENT', vertex: v });
    const e = legalRoadEdges(s, cur, { fromVertex: v })[0];
    s = act(s, cur, { type: 'BUILD_ROAD', edge: e });
  }
  return s;
}

/**
 * A blank 'main'-phase game with no pieces on the board: useful for placing
 * exactly the buildings a test needs.
 */
export function blankMain(n = 3, opts) {
  const s = structuredClone(started(n, opts));
  s.status = 'playing';
  s.phase = 'main';
  s.turn = { ...s.turn, number: 5, current: 0, rolled: true, setupIndex: 2 * n };
  return s;
}

export function give(s, idx, bundle) {
  for (const [r, n] of Object.entries(bundle)) {
    s.players[idx].resources[r] += n;
    s.bank[r] -= n;
  }
  return s;
}

export function clearHand(s, idx) {
  for (const [r, n] of Object.entries(s.players[idx].resources)) {
    s.bank[r] += n;
  }
  s.players[idx].resources = emptyHand();
  return s;
}

export function putBuilding(s, idx, vertex, kind = 'settlement') {
  s.buildings[vertex] = { owner: idx, kind };
  s.players[idx].piecesLeft[kind] -= 1;
  return s;
}

export function putRoad(s, idx, edge) {
  s.roads[edge] = idx;
  s.players[idx].piecesLeft.road -= 1;
  return s;
}

/**
 * A simple (non-revisiting) path of `length` edges starting at `startVertex`,
 * found by backtracking. Returns the edges, the end vertex and the vertices in order.
 */
export function chain(startVertex, length) {
  const path = [startVertex];
  const edges = [];
  const extend = () => {
    if (edges.length === length) return true;
    const v = path.at(-1);
    for (const e of TOPOLOGY.vertices[v].edges) {
      const [a, b] = TOPOLOGY.edges[e].vertices;
      const w = a === v ? b : a;
      if (path.includes(w)) continue;
      path.push(w);
      edges.push(e);
      if (extend()) return true;
      path.pop();
      edges.pop();
    }
    return false;
  };
  if (!extend()) throw new Error('no chain of that length');
  return { edges, end: path.at(-1), vertices: path };
}

export function withRoads(s, idx, edges) {
  for (const e of edges) putRoad(s, idx, e);
  updateLongestRoad(s);
  return s;
}

/** A chain of `length` edges whose corners don't touch any corner in `taken` chains. */
export function disjointChain(length, taken = []) {
  const blocked = new Set();
  for (const c of taken) {
    for (const v of c.vertices) {
      blocked.add(v);
      for (const n of TOPOLOGY.vertices[v].neighbors) blocked.add(n);
    }
  }
  for (let start = TOPOLOGY.vertices.length - 1; start >= 0; start--) {
    if (blocked.has(start)) continue;
    try {
      const c = chain(start, length);
      if (c.vertices.every((v) => !blocked.has(v))) return c;
    } catch {
      // try the next start
    }
  }
  throw new Error('no disjoint chain');
}
