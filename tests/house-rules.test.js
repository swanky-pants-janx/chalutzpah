import { describe, expect, it } from 'vitest';
import { COSTS, TOPOLOGY, updateSettings } from '../supabase/functions/_shared/engine/index.js';
import { act, blankMain, give, lobby, putBuilding, putRoad, started, users } from './helpers.js';

describe('lobby settings', () => {
  it('only the host changes settings, only in the lobby', () => {
    const s = lobby(3);
    expect(() => updateSettings(s, users[1], { closeNeighbours: true })).toThrow(/host/);
    const next = updateSettings(s, users[0], { closeNeighbours: true, vpTarget: 12 });
    expect(next.settings).toMatchObject({ closeNeighbours: true, vpTarget: 12, watchmanChoice: false });
    expect(() => updateSettings(started(2), users[0], { closeNeighbours: true })).toThrow(/started/);
  });

  it("won't shrink the table below the players already seated", () => {
    expect(() => updateSettings(lobby(3), users[0], { maxPlayers: 2 })).toThrow(/already 3/);
  });

  it('ignores junk values', () => {
    const next = updateSettings(lobby(2), users[0], { closeNeighbours: 'yes', vpTarget: 99, maxPlayers: 50 });
    expect(next.settings).toMatchObject({ closeNeighbours: false, vpTarget: 10, maxPlayers: 4 });
  });
});

describe('house rule: close neighbours', () => {
  it('lets homesteads sit one trail apart, in setup and later', () => {
    let s = started(2, { settings: { maxPlayers: 4, closeNeighbours: true } });
    s = act(s, 0, { type: 'BUILD_SETTLEMENT', vertex: 20 });
    const edge = TOPOLOGY.vertices[20].edges[0];
    s = act(s, 0, { type: 'BUILD_ROAD', edge });
    const [a, b] = TOPOLOGY.edges[edge].vertices;
    const neighbour = a === 20 ? b : a;
    s = act(s, 1, { type: 'BUILD_SETTLEMENT', vertex: neighbour });
    expect(s.buildings[neighbour]).toEqual({ owner: 1, kind: 'settlement' });
  });

  it('still needs an empty corner and your own trail', () => {
    const s = blankMain(2, { settings: { maxPlayers: 4, closeNeighbours: true } });
    putBuilding(s, 0, 20);
    const edge = TOPOLOGY.vertices[20].edges[0];
    putRoad(s, 0, edge);
    const [a, b] = TOPOLOGY.edges[edge].vertices;
    const next = a === 20 ? b : a;
    give(s, 0, COSTS.settlement);
    expect(() => act(s, 0, { type: 'BUILD_SETTLEMENT', vertex: 20 })).toThrow();
    expect(act(s, 0, { type: 'BUILD_SETTLEMENT', vertex: next }).buildings[next].owner).toBe(0);
  });

  it('is off by default', () => {
    const s = blankMain(2);
    putBuilding(s, 0, 20);
    putRoad(s, 0, TOPOLOGY.vertices[20].edges[0]);
    const [a, b] = TOPOLOGY.edges[TOPOLOGY.vertices[20].edges[0]].vertices;
    give(s, 0, COSTS.settlement);
    expect(() => act(s, 0, { type: 'BUILD_SETTLEMENT', vertex: a === 20 ? b : a })).toThrow(/neighbour/);
  });
});

describe('house rule: choosy Watchman', () => {
  function watchmanOn(target, { rule = true } = {}) {
    const s = blankMain(2, { settings: { maxPlayers: 4, watchmanChoice: rule } });
    s.players[0].devCards = [{ type: 'watchman', boughtTurn: 0 }];
    const hex = s.robber === 9 ? 8 : 9;
    putBuilding(s, 1, TOPOLOGY.hexes[hex].vertices[0]);
    give(s, 1, target);
    return { s: act(s, 0, { type: 'PLAY_DEV_CARD', card: 'watchman' }), hex };
  }

  it('takes the named resource when the victim has it', () => {
    const { s, hex } = watchmanOn({ wheat: 1, stone: 5 });
    const next = act(s, 0, { type: 'MOVE_ROBBER', hex, victim: 1, resource: 'wheat' });
    expect(next.players[0].resources.wheat).toBe(1);
    expect(next.players[1].resources).toMatchObject({ wheat: 0, stone: 5 });
    expect(JSON.stringify(next.privateLog.p0)).toMatch(/found/);
    expect(JSON.stringify(next.log.at(-1))).not.toMatch(/wheat/);
  });

  it('falls back to a random card when they have none', () => {
    const { s, hex } = watchmanOn({ stone: 3 });
    const next = act(s, 0, { type: 'MOVE_ROBBER', hex, victim: 1, resource: 'wheat' });
    expect(next.players[0].resources.stone).toBe(1);
    expect(JSON.stringify(next.privateLog.p0)).toMatch(/instead/);
  });

  it('does nothing special when the rule is off, or after rolling a 7', () => {
    const off = watchmanOn({ wheat: 1, stone: 30 }, { rule: false });
    let taken = 0;
    for (let i = 0; i < 5; i++) {
      const next = act(off.s, 0, { type: 'MOVE_ROBBER', hex: off.hex, victim: 1, resource: 'wheat' }, { rng: () => 0.99 });
      taken += next.players[0].resources.wheat;
    }
    expect(taken).toBe(0); // random steal picked stone every time

    const s = blankMain(2, { settings: { maxPlayers: 4, watchmanChoice: true } });
    s.phase = 'robber';
    s.turn.robberReturn = 'main';
    s.turn.robberSource = 'seven';
    const hex = s.robber === 9 ? 8 : 9;
    putBuilding(s, 1, TOPOLOGY.hexes[hex].vertices[0]);
    give(s, 1, { wheat: 1, stone: 30 });
    const next = act(s, 0, { type: 'MOVE_ROBBER', hex, victim: 1, resource: 'wheat' }, { rng: () => 0.99 });
    expect(next.players[0].resources.stone).toBe(1);
  });

  it('rejects a nonsense resource name', () => {
    const { s, hex } = watchmanOn({ wheat: 1 });
    expect(() => act(s, 0, { type: 'MOVE_ROBBER', hex, victim: 1, resource: 'gold' })).toThrow(/Name a resource/);
  });
});
