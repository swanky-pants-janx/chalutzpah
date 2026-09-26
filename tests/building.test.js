import { describe, expect, it } from 'vitest';
import { COSTS, TOPOLOGY, handSize, victoryPoints } from '../supabase/functions/_shared/engine/index.js';
import { act, blankMain, give, putBuilding, putRoad } from './helpers.js';

describe('trails', () => {
  it('must connect to your own network and costs timber + clay', () => {
    const s = blankMain(2);
    putBuilding(s, 0, 20);
    give(s, 0, { timber: 2, clay: 2 });
    const own = TOPOLOGY.vertices[20].edges[0];
    const far = TOPOLOGY.edges.find((e) => !e.vertices.includes(20) && e.vertices.every((v) => !TOPOLOGY.vertices[20].neighbors.includes(v))).id;
    expect(() => act(s, 0, { type: 'BUILD_ROAD', edge: far })).toThrow(/connect/);
    const next = act(s, 0, { type: 'BUILD_ROAD', edge: own });
    expect(next.roads[own]).toBe(0);
    expect(next.players[0].resources).toMatchObject({ timber: 1, clay: 1 });
    expect(next.players[0].piecesLeft.road).toBe(14);
    expect(next.bank.timber).toBe(s.bank.timber + 1);
  });

  it('cannot pass through an opponent homestead', () => {
    const s = blankMain(2);
    putBuilding(s, 0, 20);
    const e1 = TOPOLOGY.vertices[20].edges[0];
    putRoad(s, 0, e1);
    const [a, b] = TOPOLOGY.edges[e1].vertices;
    const mid = a === 20 ? b : a;
    putBuilding(s, 1, mid);
    give(s, 0, { timber: 1, clay: 1 });
    const beyond = TOPOLOGY.vertices[mid].edges.find((e) => e !== e1);
    expect(() => act(s, 0, { type: 'BUILD_ROAD', edge: beyond })).toThrow(/connect/);
  });

  it('cannot be built on an occupied path or without resources', () => {
    const s = blankMain(2);
    putBuilding(s, 0, 20);
    const e = TOPOLOGY.vertices[20].edges[0];
    expect(() => act(s, 0, { type: 'BUILD_ROAD', edge: e })).toThrow(/resources/);
    putRoad(s, 1, e);
    give(s, 0, { timber: 1, clay: 1 });
    expect(() => act(s, 0, { type: 'BUILD_ROAD', edge: e })).toThrow();
  });

  it('respects the 15 trail limit', () => {
    const s = blankMain(2);
    putBuilding(s, 0, 20);
    s.players[0].piecesLeft.road = 0;
    give(s, 0, { timber: 1, clay: 1 });
    expect(() => act(s, 0, { type: 'BUILD_ROAD', edge: TOPOLOGY.vertices[20].edges[0] })).toThrow(/no Trails/);
  });
});

describe('homesteads', () => {
  it('need a connecting trail, spacing, and the full cost', () => {
    const s = blankMain(2);
    putBuilding(s, 0, 20);
    const e1 = TOPOLOGY.vertices[20].edges[0];
    putRoad(s, 0, e1);
    const [a, b] = TOPOLOGY.edges[e1].vertices;
    const near = a === 20 ? b : a;
    const e2 = TOPOLOGY.vertices[near].edges.find((e) => e !== e1);
    putRoad(s, 0, e2);
    const [c, d] = TOPOLOGY.edges[e2].vertices;
    const far = c === near ? d : c;

    give(s, 0, COSTS.settlement);
    expect(() => act(s, 0, { type: 'BUILD_SETTLEMENT', vertex: near })).toThrow(/neighbour/);
    const next = act(s, 0, { type: 'BUILD_SETTLEMENT', vertex: far });
    expect(next.buildings[far]).toEqual({ owner: 0, kind: 'settlement' });
    expect(handSize(next.players[0].resources)).toBe(0);
    expect(victoryPoints(next, 0)).toBe(2);

    const unconnected = TOPOLOGY.vertices.find((v) => v.id > 40 && !v.neighbors.some((n) => s.buildings[n])).id;
    give(next, 0, COSTS.settlement);
    expect(() => act(next, 0, { type: 'BUILD_SETTLEMENT', vertex: unconnected })).toThrow(/trail/);
  });
});

describe('kibbutzim (city upgrades)', () => {
  it('upgrade your own homestead for 2 wheat + 3 stone and return the homestead piece', () => {
    const s = blankMain(2);
    putBuilding(s, 0, 20);
    give(s, 0, COSTS.city);
    const next = act(s, 0, { type: 'BUILD_CITY', vertex: 20 });
    expect(next.buildings[20].kind).toBe('city');
    expect(next.players[0].piecesLeft).toMatchObject({ settlement: 5, city: 3 });
    expect(victoryPoints(next, 0)).toBe(2);
    expect(handSize(next.players[0].resources)).toBe(0);
  });

  it("can't upgrade an opponent's homestead, an empty corner, or without resources", () => {
    const s = blankMain(2);
    putBuilding(s, 1, 20);
    putBuilding(s, 0, 30);
    give(s, 0, COSTS.city);
    expect(() => act(s, 0, { type: 'BUILD_CITY', vertex: 20 })).toThrow(/own/);
    expect(() => act(s, 0, { type: 'BUILD_CITY', vertex: 0 })).toThrow(/own/);
    const poor = blankMain(2);
    putBuilding(poor, 0, 30);
    expect(() => act(poor, 0, { type: 'BUILD_CITY', vertex: 30 })).toThrow(/resources/);
  });
});

describe('building is turn-bound', () => {
  it('rejects building before rolling or on another turn', () => {
    const s = blankMain(2);
    putBuilding(s, 1, 20);
    give(s, 1, COSTS.city);
    expect(() => act(s, 1, { type: 'BUILD_CITY', vertex: 20 })).toThrow(/not your turn/);
    s.phase = 'roll';
    putBuilding(s, 0, 40);
    give(s, 0, COSTS.city);
    expect(() => act(s, 0, { type: 'BUILD_CITY', vertex: 40 })).toThrow(/Roll the dice/);
  });

  it('rejects malformed targets', () => {
    const s = blankMain(2);
    expect(() => act(s, 0, { type: 'BUILD_ROAD', edge: 999 })).toThrow(/exist/);
    expect(() => act(s, 0, { type: 'BUILD_SETTLEMENT', vertex: '3' })).toThrow(/exist/);
    expect(() => act(s, 0, { type: 'HACK_THE_PLANET' })).toThrow(/Unknown/);
  });
});
