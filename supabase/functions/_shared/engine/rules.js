// Read-only rule queries. These work on the full server state AND on the
// client's merged view (public state + own private hand), so the UI can
// highlight exactly the moves the server will accept.

import {
  ACHIEVEMENT_VP,
  COSTS,
  DISCARD_THRESHOLD,
  PIECE_LIMITS,
} from './constants.js';
import { currentEvent } from './events.js';
import { handSize } from './hand.js';
import { topo } from './topology.js';

export function playerIndexByUser(s, userId) {
  return s.players.findIndex((p) => p.userId === userId);
}

export function playerIndexById(s, playerId) {
  return s.players.findIndex((p) => p.id === playerId);
}

/** Card count for any player, whether we can see their hand or only its size. */
export function cardCount(player) {
  return player.resources ? handSize(player.resources) : (player.resourceCount ?? 0);
}

export function buildingAt(s, vertex) {
  return s.buildings[vertex] ?? null;
}

export function roadOwner(s, edge) {
  const owner = s.roads[edge];
  return owner == null ? null : owner;
}

/**
 * Empty corner with no building on any adjacent corner (the spacing rule).
 * House rule "close neighbours": homesteads may sit one trail apart.
 */
export function isSettlementSpotOpen(s, vertex) {
  if (buildingAt(s, vertex)) return false;
  if (s.settings?.closeNeighbours) return true;
  return topo(s).vertices[vertex].neighbors.every((n) => !buildingAt(s, n));
}

export function canPlaceSettlement(s, idx, vertex, { setup = false } = {}) {
  if (!isSettlementSpotOpen(s, vertex)) return false;
  if (setup) return true;
  return topo(s).vertices[vertex].edges.some((e) => roadOwner(s, e) === idx);
}

export function legalSettlementVertices(s, idx, opts = {}) {
  return topo(s).vertices.filter((v) => canPlaceSettlement(s, idx, v.id, opts)).map((v) => v.id);
}

/**
 * A trail must touch the player's own network: one of its ends has their
 * building, or has one of their trails and no opponent building blocking it.
 * During setup it must touch the homestead just placed (`fromVertex`).
 */
export function canPlaceRoad(s, idx, edge, { fromVertex = null } = {}) {
  if (roadOwner(s, edge) !== null) return false;
  const ends = topo(s).edges[edge].vertices;
  if (fromVertex !== null) return ends.includes(fromVertex);
  return ends.some((v) => {
    const building = buildingAt(s, v);
    if (building) return building.owner === idx;
    return topo(s).vertices[v].edges.some((other) => other !== edge && roadOwner(s, other) === idx);
  });
}

export function legalRoadEdges(s, idx, opts = {}) {
  return topo(s).edges.filter((e) => canPlaceRoad(s, idx, e.id, opts)).map((e) => e.id);
}

export function legalCityVertices(s, idx) {
  return Object.entries(s.buildings)
    .filter(([, b]) => b.owner === idx && b.kind === 'settlement')
    .map(([v]) => Number(v));
}

/** Opponents with a building on `hex` who hold at least one card. */
export function robberVictims(s, idx, hex) {
  const owners = new Set();
  for (const v of topo(s).hexes[hex].vertices) {
    const building = buildingAt(s, v);
    if (building && building.owner !== idx) owners.add(building.owner);
  }
  return [...owners].filter((o) => cardCount(s.players[o]) > 0).sort((a, b) => a - b);
}

export function harborsOf(s, idx) {
  const types = new Set();
  for (const harbor of s.board.harbors) {
    const [a, b] = topo(s).edges[harbor.edge].vertices;
    if (buildingAt(s, a)?.owner === idx || buildingAt(s, b)?.owner === idx) types.add(harbor.type);
  }
  return types;
}

/** How many of `resource` the player must give the supply for one card. */
export function bankRate(s, idx, resource) {
  const types = harborsOf(s, idx);
  const rate = types.has(resource) ? 2 : types.has('any') ? 3 : 4;
  const eventRate = currentEvent(s)?.bankRate;
  return eventRate ? Math.min(rate, eventRate) : rate;
}

/** What a piece costs right now (chaos events can change it for a round). */
export function costOf(s, kind) {
  return currentEvent(s)?.cost?.[kind] ?? COSTS[kind];
}

/** Longest continuous trail; opponents' buildings cut a trail in two. */
export function longestRoadLength(s, idx) {
  const own = new Set();
  for (const [edge, owner] of Object.entries(s.roads)) if (owner === idx) own.add(Number(edge));
  if (own.size === 0) return 0;

  const blocked = (v) => {
    const building = buildingAt(s, v);
    return !!building && building.owner !== idx;
  };
  const used = new Set();
  let best = 0;

  const walk = (vertex, length) => {
    if (length > best) best = length;
    if (length > 0 && blocked(vertex)) return;
    for (const edge of topo(s).vertices[vertex].edges) {
      if (!own.has(edge) || used.has(edge)) continue;
      used.add(edge);
      const [a, b] = topo(s).edges[edge].vertices;
      walk(a === vertex ? b : a, length + 1);
      used.delete(edge);
    }
  };

  const starts = new Set([...own].flatMap((edge) => topo(s).edges[edge].vertices));
  for (const vertex of starts) walk(vertex, 0);
  return best;
}

export function landmarkCount(player) {
  return (player.devCards ?? []).filter((card) => card.type === 'landmark').length;
}

/** Victory points. `hidden: true` includes secret landmark cards (server / own view). */
export function victoryPoints(s, idx, { hidden = false } = {}) {
  let vp = 0;
  for (const building of Object.values(s.buildings)) {
    if (building.owner === idx) vp += building.kind === 'city' ? 2 : 1;
  }
  if (s.achievements.longestRoad?.player === idx) vp += ACHIEVEMENT_VP;
  if (s.achievements.largestArmy?.player === idx) vp += ACHIEVEMENT_VP;
  if (hidden) vp += landmarkCount(s.players[idx]);
  return vp;
}

export function discardAmount(cards) {
  return cards > DISCARD_THRESHOLD ? Math.floor(cards / 2) : 0;
}

/** Snake order for the two setup rounds: 0,1,2,3,3,2,1,0. */
export function setupSeat(playerCount, setupIndex) {
  return setupIndex < playerCount ? setupIndex : 2 * playerCount - 1 - setupIndex;
}

export function piecesPlaced(player, kind) {
  return PIECE_LIMITS[kind] - player.piecesLeft[kind];
}

/** Dev card types the player could play right now (ignores card-specific targets). */
export function playableDevCards(s, idx) {
  if (s.status !== 'playing' || s.turn?.current !== idx || s.turn.devPlayed) return [];
  const player = s.players[idx];
  const types = new Set(
    (player.devCards ?? [])
      .filter((card) => card.type !== 'landmark' && card.boughtTurn < s.turn.number)
      .map((card) => card.type),
  );
  if (s.phase === 'roll') return types.has('watchman') ? ['watchman'] : [];
  if (s.phase !== 'main') return [];
  return [...types];
}
