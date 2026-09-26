import { describe, expect, it } from 'vitest';
import {
  TERRAIN_RESOURCE,
  TOPOLOGY,
  claimHost,
  handSize,
  joinGame,
  kickPlayer,
  leaveGame,
  rerollMap,
  startGame,
  updateProfile,
} from '../supabase/functions/_shared/engine/index.js';
import { act, lobby, names, started, users } from './helpers.js';

describe('lobby', () => {
  it('seats players with distinct colours', () => {
    const s = lobby(4);
    expect(s.players.map((p) => p.name)).toEqual(names);
    expect(new Set(s.players.map((p) => p.color)).size).toBe(4);
    expect(s.hostId).toBe('p0');
  });

  it('rejects a full table, a taken name and a bad name', () => {
    const full = lobby(4);
    expect(() => joinGame(full, { userId: 'u-x', name: 'Eve', playerId: 'px' })).toThrow(/full/);
    const s = lobby(2);
    expect(() => joinGame(s, { userId: 'u-x', name: 'ana', playerId: 'px' })).toThrow(/already uses/);
    expect(() => joinGame(s, { userId: 'u-x', name: '   ', playerId: 'px' })).toThrow(/name/);
    expect(() => joinGame(s, { userId: 'u-x', name: '<script>', playerId: 'px' })).toThrow();
    expect(() => joinGame(s, { userId: 'u-x', name: 'x'.repeat(17), playerId: 'px' })).toThrow(/at most/);
  });

  it('treats joining twice as a reconnect, not a second seat', () => {
    const s = lobby(2);
    const again = joinGame(s, { userId: users[1], name: 'Whatever', playerId: 'pz' });
    expect(again).toBe(s);
    expect(again.players).toHaveLength(2);
  });

  it('refuses newcomers once the game has started', () => {
    const s = started(2);
    expect(() => joinGame(s, { userId: 'u-new', name: 'Late', playerId: 'pl' })).toThrow(/already started/);
  });

  it('migrates host when the host leaves the lobby', () => {
    const s = leaveGame(lobby(3), users[0]);
    expect(s.players).toHaveLength(2);
    expect(s.hostId).toBe('p1');
  });

  it('lets someone claim host only if the host is away', () => {
    const s = lobby(3);
    expect(() => claimHost(s, users[1], { hostIdle: false })).toThrow(/still here/);
    expect(claimHost(s, users[1], { hostIdle: true }).hostId).toBe('p1');
  });

  it('only lets the host reroll the map, and only in the lobby', () => {
    const s = lobby(2);
    expect(() => rerollMap(s, users[1], 5)).toThrow(/host/);
    const r = rerollMap(s, users[0], 5);
    expect(r.board.seed).toBe(5);
    expect(r.mapRolls).toBe(2);
    expect(r.robber).toBe(r.board.desert);
    expect(() => rerollMap(started(2), users[0], 6)).toThrow(/started/);
  });

  it('lets players change name/colour but not steal one', () => {
    const s = lobby(2);
    expect(() => updateProfile(s, users[1], { color: s.players[0].color })).toThrow(/taken/);
    const u = updateProfile(s, users[1], { name: 'Benji', color: 'fig' });
    expect(u.players[1]).toMatchObject({ name: 'Benji', color: 'fig' });
  });

  it('lets only the host remove a player', () => {
    const s = lobby(3);
    expect(() => kickPlayer(s, users[1], 'p2')).toThrow(/host/);
    expect(kickPlayer(s, users[0], 'p2').players).toHaveLength(2);
  });

  it('needs two players and the host to start', () => {
    expect(() => startGame(lobby(1), users[0], { rng: Math.random, now: 0 })).toThrow(/at least/);
    expect(() => startGame(lobby(2), users[1], { rng: Math.random, now: 0 })).toThrow(/host/);
  });

  it('shuffles a 25-card Chutzpah deck on start', () => {
    const s = started(2);
    expect(s.devDeck).toHaveLength(25);
    expect(s.status).toBe('setup');
    expect(s.phase).toBe('setup_settlement');
  });
});

describe('setup placement', () => {
  it('follows snake order and grants resources for the second homestead', () => {
    let s = started(3);
    const order = [];
    const placed = [];
    while (s.status === 'setup') {
      const cur = s.turn.current;
      order.push(cur);
      const v = TOPOLOGY.vertices.find((vx) =>
        !s.buildings[vx.id] && vx.neighbors.every((n) => !s.buildings[n]) && vx.hexes.length === 3,
      ).id;
      const before = handSize(s.players[cur].resources);
      s = act(s, cur, { type: 'BUILD_SETTLEMENT', vertex: v });
      placed.push({ cur, v, gained: handSize(s.players[cur].resources) - before });
      const e = TOPOLOGY.vertices[v].edges.find((edge) => s.roads[edge] == null);
      s = act(s, cur, { type: 'BUILD_ROAD', edge: e });
    }
    expect(order).toEqual([0, 1, 2, 2, 1, 0]);
    // first round: nothing; second round: one card per producing adjacent tile
    for (const p of placed.slice(0, 3)) expect(p.gained).toBe(0);
    for (const p of placed.slice(3)) {
      const producing = TOPOLOGY.vertices[p.v].hexes.filter((h) => TERRAIN_RESOURCE[s.board.hexes[h].terrain]).length;
      expect(p.gained).toBe(producing);
    }
    expect(s.status).toBe('playing');
    expect(s.phase).toBe('roll');
    expect(s.turn.current).toBe(0);
  });

  it('enforces the spacing rule and the adjacent-trail rule', () => {
    let s = started(2);
    const v = 10;
    s = act(s, 0, { type: 'BUILD_SETTLEMENT', vertex: v });
    const farEdge = TOPOLOGY.edges.find((e) => !e.vertices.includes(v)).id;
    expect(() => act(s, 0, { type: 'BUILD_ROAD', edge: farEdge })).toThrow(/touch the homestead/);
    s = act(s, 0, { type: 'BUILD_ROAD', edge: TOPOLOGY.vertices[v].edges[0] });
    const neighbour = TOPOLOGY.vertices[v].neighbors[0];
    expect(() => act(s, 1, { type: 'BUILD_SETTLEMENT', vertex: neighbour })).toThrow(/neighbour/);
    expect(() => act(s, 1, { type: 'BUILD_SETTLEMENT', vertex: v })).toThrow();
  });

  it('rejects out-of-turn and out-of-phase setup moves', () => {
    const s = started(2);
    expect(() => act(s, 1, { type: 'BUILD_SETTLEMENT', vertex: 0 })).toThrow(/not your turn/);
    expect(() => act(s, 0, { type: 'BUILD_ROAD', edge: 0 })).toThrow(/homestead/);
    expect(() => act(s, 0, { type: 'ROLL_DICE' })).toThrow();
  });
});
