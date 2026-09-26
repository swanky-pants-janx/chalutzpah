import { describe, expect, it } from 'vitest';
import { COSTS, TOPOLOGY, victoryPoints } from '../supabase/functions/_shared/engine/index.js';
import { act, blankMain, give, putBuilding } from './helpers.js';

function withCards(types, { boughtTurn = 1 } = {}) {
  const s = blankMain(3);
  s.players[0].devCards = types.map((type) => ({ type, boughtTurn }));
  return s;
}

describe('buying Chutzpah cards', () => {
  it('costs fleece + wheat + stone and draws from the deck', () => {
    const s = blankMain(2);
    s.devDeck = ['landmark', 'watchman'];
    give(s, 0, COSTS.devCard);
    const next = act(s, 0, { type: 'BUY_DEV_CARD' });
    expect(next.players[0].devCards).toEqual([{ type: 'watchman', boughtTurn: 5 }]);
    expect(next.devDeck).toEqual(['landmark']);
    // the public log hides the card, the private log reveals it
    expect(JSON.stringify(next.log.at(-1))).not.toMatch(/Watchman/);
    expect(JSON.stringify(next.privateLog.p0)).toMatch(/Watchman/);
  });

  it('fails on an empty deck or without resources', () => {
    const s = blankMain(2);
    s.devDeck = [];
    give(s, 0, COSTS.devCard);
    expect(() => act(s, 0, { type: 'BUY_DEV_CARD' })).toThrow(/empty/);
    const poor = blankMain(2);
    expect(() => act(poor, 0, { type: 'BUY_DEV_CARD' })).toThrow(/resources/);
  });
});

describe('playing Chutzpah cards', () => {
  it("can't be played on the turn they were drawn", () => {
    const s = withCards(['watchman'], { boughtTurn: 5 });
    expect(() => act(s, 0, { type: 'PLAY_DEV_CARD', card: 'watchman' })).toThrow(/next turn/);
  });

  it('allows only one per turn', () => {
    let s = withCards(['harvest', 'harvest']);
    s = act(s, 0, { type: 'PLAY_DEV_CARD', card: 'harvest', resources: ['wheat', 'stone'] });
    expect(() => act(s, 0, { type: 'PLAY_DEV_CARD', card: 'harvest', resources: ['wheat', 'stone'] })).toThrow(/one Chutzpah/);
  });

  it('Watchman: may be played before rolling, moves the Jackal, then returns to rolling', () => {
    let s = withCards(['watchman']);
    s.phase = 'roll';
    s = act(s, 0, { type: 'PLAY_DEV_CARD', card: 'watchman' });
    expect(s.phase).toBe('robber');
    expect(s.players[0].knightsPlayed).toBe(1);
    const hex = s.robber === 0 ? 1 : 0;
    s = act(s, 0, { type: 'MOVE_ROBBER', hex });
    expect(s.phase).toBe('roll');
  });

  it('other cards must wait until after the roll', () => {
    const s = withCards(['harvest']);
    s.phase = 'roll';
    expect(() => act(s, 0, { type: 'PLAY_DEV_CARD', card: 'harvest', resources: ['wheat', 'wheat'] })).toThrow(/Roll/);
  });

  it('Bountiful Year: takes two resources from the supply', () => {
    const s = withCards(['harvest']);
    const next = act(s, 0, { type: 'PLAY_DEV_CARD', card: 'harvest', resources: ['clay', 'clay'] });
    expect(next.players[0].resources.clay).toBe(2);
    expect(next.players[0].devCards).toHaveLength(0);
    s.bank.clay = 1;
    expect(() => act(s, 0, { type: 'PLAY_DEV_CARD', card: 'harvest', resources: ['clay', 'clay'] })).toThrow(/run out/);
    expect(() => act(s, 0, { type: 'PLAY_DEV_CARD', card: 'harvest', resources: ['gold', 'clay'] })).toThrow();
  });

  it('Chutzpah!: collects every card of one resource from all opponents', () => {
    const s = withCards(['chutzpah']);
    give(s, 1, { wheat: 3, stone: 1 });
    give(s, 2, { wheat: 2 });
    const next = act(s, 0, { type: 'PLAY_DEV_CARD', card: 'chutzpah', resource: 'wheat' });
    expect(next.players[0].resources.wheat).toBe(5);
    expect(next.players[1].resources).toMatchObject({ wheat: 0, stone: 1 });
    expect(next.players[2].resources.wheat).toBe(0);
  });

  it('Pathfinders: two free trails, then back to the main phase', () => {
    let s = withCards(['pathfinder']);
    putBuilding(s, 0, 20);
    s = act(s, 0, { type: 'PLAY_DEV_CARD', card: 'pathfinder' });
    expect(s.phase).toBe('road_building');
    expect(() => act(s, 0, { type: 'END_TURN' })).toThrow(/free trails/);
    const e1 = TOPOLOGY.vertices[20].edges[0];
    s = act(s, 0, { type: 'BUILD_ROAD', edge: e1 });
    expect(s.phase).toBe('road_building');
    const e2 = TOPOLOGY.vertices[20].edges[1];
    s = act(s, 0, { type: 'BUILD_ROAD', edge: e2 });
    expect(s.phase).toBe('main');
    expect(s.players[0].piecesLeft.road).toBe(13);
  });

  it('Landmarks cannot be played but count as hidden points', () => {
    const s = withCards(['landmark', 'landmark']);
    expect(() => act(s, 0, { type: 'PLAY_DEV_CARD', card: 'landmark' })).toThrow(/secret/);
    expect(victoryPoints(s, 0)).toBe(0);
    expect(victoryPoints(s, 0, { hidden: true })).toBe(2);
  });
});
