// A simple random-but-sensible bot used by the simulation and prediction tests.

import {
  COSTS,
  RESOURCES,
  topologyFor,
  bankRate,
  hasAll,
  legalCityVertices,
  legalRoadEdges,
  legalSettlementVertices,
  pick,
  playableDevCards,
  robberVictims,
} from '../supabase/functions/_shared/engine/index.js';

/** In oasis mode a Watchman visits a player instead of moving the Jackal. */
function watchman(s, i, rng) {
  if (!s.settings.oasis) return { type: 'PLAY_DEV_CARD', card: 'watchman' };
  const targets = s.players.map((_, j) => j).filter((j) => j !== i && Object.values(s.players[j].resources).some((n) => n > 0));
  return { type: 'PLAY_DEV_CARD', card: 'watchman', victim: targets.length ? pick(rng, targets) : null, resource: pick(rng, RESOURCES) };
}

/** Oasis Day: pick random resources the supply still has. */
export function oasisPick(s, i, rng) {
  const bundle = {};
  for (let k = 0; k < s.pendingOasis[i]; k++) {
    const available = RESOURCES.filter((r) => s.bank[r] - (bundle[r] ?? 0) > 0);
    const r = pick(rng, available);
    bundle[r] = (bundle[r] ?? 0) + 1;
  }
  return { type: 'OASIS_PICK', resources: bundle };
}

/** Decide one action for player `i` given the full state (bots are trusted test code). */
export function decide(s, i, rng) {
  const me = s.players[i];
  switch (s.phase) {
    case 'setup_settlement':
      return { type: 'BUILD_SETTLEMENT', vertex: pick(rng, legalSettlementVertices(s, i, { setup: true })) };
    case 'setup_road':
      return { type: 'BUILD_ROAD', edge: pick(rng, legalRoadEdges(s, i, { fromVertex: s.turn.setupVertex })) };
    case 'roll':
      if (playableDevCards(s, i).includes('watchman') && rng() < 0.5) return watchman(s, i, rng);
      return { type: 'ROLL_DICE' };
    case 'robber': {
      const hexes = topologyFor(s.board.layout).hexes.map((h) => h.id).filter((h) => h !== s.robber);
      const hex = pick(rng, hexes);
      const victims = robberVictims(s, i, hex);
      return { type: 'MOVE_ROBBER', hex, victim: victims.length ? pick(rng, victims) : null };
    }
    case 'road_building':
      return { type: 'BUILD_ROAD', edge: pick(rng, legalRoadEdges(s, i)) };
    case 'main': {
      const cities = legalCityVertices(s, i);
      if (cities.length && me.piecesLeft.city && hasAll(me.resources, COSTS.city)) return { type: 'BUILD_CITY', vertex: pick(rng, cities) };
      const spots = legalSettlementVertices(s, i);
      if (spots.length && me.piecesLeft.settlement && hasAll(me.resources, COSTS.settlement)) {
        return { type: 'BUILD_SETTLEMENT', vertex: pick(rng, spots) };
      }
      const playable = playableDevCards(s, i);
      if (playable.length && rng() < 0.6) {
        const card = pick(rng, playable);
        if (card === 'harvest') return { type: 'PLAY_DEV_CARD', card, resources: [pick(rng, RESOURCES), pick(rng, RESOURCES)] };
        if (card === 'chutzpah') return { type: 'PLAY_DEV_CARD', card, resource: pick(rng, RESOURCES) };
        if (card === 'watchman') return watchman(s, i, rng);
        if (card !== 'pathfinder' || (me.piecesLeft.road > 0 && legalRoadEdges(s, i).length)) return { type: 'PLAY_DEV_CARD', card };
      }
      if (s.devDeck.length && hasAll(me.resources, COSTS.devCard) && rng() < 0.5) return { type: 'BUY_DEV_CARD' };
      const roads = legalRoadEdges(s, i);
      if (roads.length && me.piecesLeft.road && hasAll(me.resources, COSTS.road) && (spots.length === 0 || rng() < 0.3)) {
        return { type: 'BUILD_ROAD', edge: pick(rng, roads) };
      }
      const surplus = RESOURCES.find((r) => me.resources[r] >= bankRate(s, i, r) + 1);
      const need = RESOURCES.find((r) => me.resources[r] === 0 && s.bank[r] > 0);
      if (surplus && need && surplus !== need) return { type: 'BANK_TRADE', give: surplus, get: need };
      if (!s.trades.length && surplus && need && surplus !== need && rng() < 0.3) {
        return { type: 'OFFER_TRADE', give: { [surplus]: 1 }, want: { [need]: 1 } };
      }
      return { type: 'END_TURN' };
    }
    default:
      return null;
  }
}

