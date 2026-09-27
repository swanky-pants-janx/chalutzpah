import { describe, expect, it } from 'vitest';
import {
  TERRAIN_RESOURCE,
  applyAction,
  handSize,
  legalRoadEdges,
  legalSettlementVertices,
  publicView,
  startGame,
  topologyFor,
} from '../supabase/functions/_shared/engine/index.js';
import { lobby, users } from './helpers.js';

const night = { settings: { maxPlayers: 4, nightLanding: true } };
const act = (s, i, action, ctx = {}) => applyAction(s, users[i], action, { rng: Math.random, now: 0, ...ctx });
const REAL_TERRAINS = /grove|claypit|pasture|terraces|quarry|dunes/;

function darkStart(n = 3, settings = night) {
  return startGame(lobby(n, settings), users[0], { rng: () => 0.999999, now: 0 });
}

/** Place both rounds of starting pieces on the first legal spots. */
function playSetup(s) {
  while (s.status === 'setup') {
    const cur = s.turn.current;
    const v = legalSettlementVertices(s, cur, { setup: true })[0];
    s = act(s, cur, { type: 'BUILD_SETTLEMENT', vertex: v });
    s = act(s, cur, { type: 'BUILD_ROAD', edge: legalRoadEdges(s, cur, { fromVertex: v })[0] });
  }
  return s;
}

describe('night landing: the island stays dark', () => {
  it('reveals only the coast and harbors in the lobby and during setup', () => {
    for (const s of [lobby(3, night), darkStart(3)]) {
      const pub = publicView(s);
      expect(pub.board.hexes.every((h) => h.terrain === 'hidden' && h.number === null)).toBe(true);
      expect(pub.board.seed).toBeNull();
      expect(pub.board.desert).toBeNull();
      expect(pub.robber).toBeNull();
      expect(pub.board.harbors).toEqual(s.board.harbors);
      expect(JSON.stringify(pub.board)).not.toMatch(REAL_TERRAINS);
    }
  });

  it('deals a fresh island at the start, so nobody saw it in the lobby', () => {
    const room = lobby(3, night);
    const s = darkStart(3);
    expect(s.board.seed).not.toBe(room.board.seed);
    expect(s.board.hexes.some((h) => h.terrain !== 'hidden')).toBe(true); // the server knows
  });

  it('hands out nothing in the dark — everyone gathers at sunrise', () => {
    let s = darkStart(3);
    let beforeSunrise = null;
    while (s.status === 'setup') {
      const cur = s.turn.current;
      const v = legalSettlementVertices(s, cur, { setup: true })[0];
      s = act(s, cur, { type: 'BUILD_SETTLEMENT', vertex: v });
      if (s.turn.setupIndex === 2 * s.players.length - 1) beforeSunrise = structuredClone(s);
      s = act(s, cur, { type: 'BUILD_ROAD', edge: legalRoadEdges(s, cur, { fromVertex: v })[0] });
    }
    expect(beforeSunrise.players.every((p) => handSize(p.resources) === 0)).toBe(true);
    expect(s.status).toBe('playing');
    expect(s.log.some((e) => e.kind === 'sunrise')).toBe(true);
    s.players.forEach((p, i) => {
      const v = s.turn.secondHomesteads[i];
      const expected = topologyFor(s.board.layout).vertices[v].hexes.filter((h) => TERRAIN_RESOURCE[s.board.hexes[h].terrain]).length;
      expect(handSize(p.resources), `player ${i}`).toBe(expected);
    });
  });

  it('shows the whole island once the sun is up', () => {
    const s = playSetup(darkStart(3));
    const pub = publicView(s);
    expect(pub.board).toEqual(s.board);
    expect(pub.robber).toBe(s.robber);
  });

  it('a turn timer running out in the dark still reaches sunrise', () => {
    let s = darkStart(2, { settings: { maxPlayers: 4, nightLanding: true, turnTimer: 60 } });
    let now = 0;
    while (s.status === 'setup') {
      now = s.turn.deadline + 1;
      s = act(s, 1, { type: 'TIMEOUT' }, { now });
    }
    expect(s.status).toBe('playing');
    expect(s.players.every((p) => handSize(p.resources) > 0)).toBe(true);
  });

  it('is off by default: starting resources arrive immediately as usual', () => {
    let s = startGame(lobby(2), users[0], { rng: () => 0.999999, now: 0 });
    expect(publicView(s).board.hexes.some((h) => h.terrain !== 'hidden')).toBe(true);
    s = playSetup(s);
    expect(s.log.some((e) => e.kind === 'sunrise')).toBe(false);
  });
});
