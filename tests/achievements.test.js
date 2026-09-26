import { describe, expect, it } from 'vitest';
import { COSTS, TOPOLOGY, longestRoadLength, updateLongestRoad, victoryPoints } from '../supabase/functions/_shared/engine/index.js';
import { act, blankMain, chain, disjointChain, give, putBuilding, withRoads } from './helpers.js';

describe('Trailblazer (longest trail)', () => {
  it('needs at least 5 connected segments', () => {
    const s = blankMain(2);
    const four = chain(0, 4);
    withRoads(s, 0, four.edges);
    expect(longestRoadLength(s, 0)).toBe(4);
    expect(s.achievements.longestRoad).toBeNull();

    putBuilding(s, 0, 0);
    give(s, 0, COSTS.road);
    const fifth = TOPOLOGY.vertices[four.end].edges.find((e) => s.roads[e] == null);
    const next = act(s, 0, { type: 'BUILD_ROAD', edge: fifth });
    expect(next.achievements.longestRoad).toEqual({ player: 0, size: 5 });
    expect(victoryPoints(next, 0)).toBe(1 + 2);
  });

  it('counts branches as the longest single path, not the total', () => {
    const s = blankMain(2);
    const trunk = chain(20, 3);
    withRoads(s, 0, trunk.edges);
    const branch = TOPOLOGY.vertices[trunk.vertices[1]].edges.find((e) => s.roads[e] == null);
    withRoads(s, 0, [branch]);
    expect(longestRoadLength(s, 0)).toBe(3);
  });

  it('stays with the holder on a tie and moves on a strict lead', () => {
    const s = blankMain(2);
    const mine = chain(0, 5);
    withRoads(s, 0, mine.edges);
    expect(s.achievements.longestRoad.player).toBe(0);
    const theirs = disjointChain(6, [mine]);
    withRoads(s, 1, theirs.edges.slice(0, 5));
    expect(s.achievements.longestRoad.player).toBe(0); // tie → holder keeps
    withRoads(s, 1, theirs.edges.slice(5));
    expect(s.achievements.longestRoad).toEqual({ player: 1, size: 6 });
  });

  it('is lost when an opponent homestead cuts the trail', () => {
    const s = blankMain(2);
    const path = chain(0, 6);
    withRoads(s, 0, path.edges);
    expect(s.achievements.longestRoad).toEqual({ player: 0, size: 6 });
    // player 1 builds a homestead in the middle of the trail
    const middle = path.vertices[3];
    const spur = TOPOLOGY.vertices[middle].edges.find((e) => s.roads[e] == null);
    s.roads[spur] = 1;
    s.turn.current = 1;
    give(s, 1, COSTS.settlement);
    const next = act(s, 1, { type: 'BUILD_SETTLEMENT', vertex: middle });
    expect(longestRoadLength(next, 0)).toBe(3);
    expect(next.achievements.longestRoad).toBeNull();
  });

  it('is set aside when the holder is cut and challengers tie', () => {
    const s = blankMain(3);
    const c0 = chain(0, 7);
    const c1 = disjointChain(5, [c0]);
    const c2 = disjointChain(5, [c0, c1]);
    withRoads(s, 0, c0.edges);
    withRoads(s, 1, c1.edges);
    withRoads(s, 2, c2.edges);
    expect(s.achievements.longestRoad).toEqual({ player: 0, size: 7 });
    // an opponent homestead cuts the holder's 7-trail into 3 + 4
    s.buildings[c0.vertices[3]] = { owner: 1, kind: 'settlement' };
    updateLongestRoad(s);
    expect(longestRoadLength(s, 0)).toBe(4);
    expect(s.achievements.longestRoad).toBeNull(); // players 1 and 2 tie at 5
  });
});

describe('Night Watch (largest army)', () => {
  function playWatchman(s, idx) {
    s.turn.current = idx;
    s.turn.devPlayed = false;
    s.phase = 'main';
    s.players[idx].devCards.push({ type: 'watchman', boughtTurn: 0 });
    let next = act(s, idx, { type: 'PLAY_DEV_CARD', card: 'watchman' });
    const hex = next.robber === 0 ? 1 : 0;
    next = act(next, idx, { type: 'MOVE_ROBBER', hex });
    return next;
  }

  it('goes to the first player with 3 Watchmen', () => {
    let s = blankMain(2);
    s = playWatchman(s, 0);
    s = playWatchman(s, 0);
    expect(s.achievements.largestArmy).toBeNull();
    s = playWatchman(s, 0);
    expect(s.achievements.largestArmy).toEqual({ player: 0, size: 3 });
    expect(victoryPoints(s, 0)).toBe(2);
  });

  it('only moves when someone strictly exceeds the holder', () => {
    let s = blankMain(2);
    for (let i = 0; i < 3; i++) s = playWatchman(s, 0);
    for (let i = 0; i < 3; i++) s = playWatchman(s, 1);
    expect(s.achievements.largestArmy.player).toBe(0);
    s = playWatchman(s, 1);
    expect(s.achievements.largestArmy).toEqual({ player: 1, size: 4 });
  });
});
