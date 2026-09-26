import { describe, expect, it } from 'vitest';
import { TOPOLOGY, handSize } from '../supabase/functions/_shared/engine/index.js';
import { act, blankMain, diceRng, give, putBuilding } from './helpers.js';

function rollState(n = 2) {
  const s = blankMain(n);
  s.phase = 'roll';
  s.turn.rolled = false;
  return s;
}

/** Force tile `hex` to be a terrain/number for predictable production. */
function setTile(s, hex, terrain, number) {
  s.board.hexes[hex] = { terrain, number };
  if (s.robber === hex) s.robber = s.board.hexes.findIndex((h, i) => i !== hex && h.terrain === 'dunes');
}

describe('dice', () => {
  it('rolls two d6 and records the result', () => {
    const s = rollState();
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([3, 5]) });
    expect(next.lastRoll).toMatchObject({ dice: [3, 5], total: 8, player: 0 });
    expect(next.phase).toBe('main');
  });

  it('only allows one roll per turn, by the current player', () => {
    const s = rollState();
    expect(() => act(s, 1, { type: 'ROLL_DICE' })).toThrow(/not your turn/);
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([2, 2]) });
    expect(() => act(next, 0, { type: 'ROLL_DICE' })).toThrow(/already rolled/);
  });

  it('produces every face 1–6 with a uniform source', () => {
    const faces = new Set();
    for (let i = 0; i < 200; i++) {
      const s = act(rollState(), 0, { type: 'ROLL_DICE' }, { rng: Math.random });
      for (const d of s.lastRoll.dice) faces.add(d);
    }
    expect([...faces].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('production', () => {
  it('pays 1 per homestead and 2 per kibbutz on matching tiles', () => {
    const s = rollState();
    const hex = 9; // centre
    setTile(s, hex, 'quarry', 9);
    const [v0, , v2] = TOPOLOGY.hexes[hex].vertices;
    putBuilding(s, 0, v0, 'settlement');
    putBuilding(s, 1, v2, 'city');
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([4, 5]) });
    expect(next.players[0].resources.stone).toBe(1);
    expect(next.players[1].resources.stone).toBe(2);
    expect(next.bank.stone).toBe(s.bank.stone - 3);
  });

  it('pays nothing from the tile the Jackal guards', () => {
    const s = rollState();
    const hex = 9;
    setTile(s, hex, 'quarry', 9);
    s.robber = hex;
    putBuilding(s, 0, TOPOLOGY.hexes[hex].vertices[0]);
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([4, 5]) });
    expect(next.players[0].resources.stone).toBe(0);
  });

  it('pays nobody when the supply cannot cover several players', () => {
    const s = rollState();
    const hex = 9;
    setTile(s, hex, 'quarry', 9);
    const [v0, , v2] = TOPOLOGY.hexes[hex].vertices;
    putBuilding(s, 0, v0, 'city');
    putBuilding(s, 1, v2, 'city');
    s.bank.stone = 3;
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([4, 5]) });
    expect(next.players[0].resources.stone).toBe(0);
    expect(next.players[1].resources.stone).toBe(0);
  });

  it('gives a lone claimant whatever is left in the supply', () => {
    const s = rollState();
    const hex = 9;
    setTile(s, hex, 'quarry', 9);
    putBuilding(s, 0, TOPOLOGY.hexes[hex].vertices[0], 'city');
    s.bank.stone = 1;
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([4, 5]) });
    expect(next.players[0].resources.stone).toBe(1);
    expect(next.bank.stone).toBe(0);
  });
});

describe('rolling a 7', () => {
  it('makes big hands discard half, then sends the roller to move the Jackal', () => {
    const s = rollState(3);
    give(s, 1, { timber: 5, clay: 4 }); // 9 cards → discard 4
    give(s, 2, { wheat: 7 }); // 7 cards → safe
    let next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([3, 4]) });
    expect(next.phase).toBe('discard');
    expect(next.pendingDiscards).toEqual({ 1: 4 });

    expect(() => act(next, 0, { type: 'MOVE_ROBBER', hex: 0 })).toThrow(/discard/);
    expect(() => act(next, 2, { type: 'DISCARD', resources: { wheat: 3 } })).toThrow(/don't need/);
    expect(() => act(next, 1, { type: 'DISCARD', resources: { timber: 3 } })).toThrow(/exactly 4/);
    expect(() => act(next, 1, { type: 'DISCARD', resources: { wheat: 4 } })).toThrow(/hold/);
    expect(() => act(next, 1, { type: 'DISCARD', resources: { timber: -1, clay: 5 } })).toThrow();

    next = act(next, 1, { type: 'DISCARD', resources: { timber: 2, clay: 2 } });
    expect(handSize(next.players[1].resources)).toBe(5);
    expect(next.phase).toBe('robber');
  });

  it('skips discarding when nobody holds more than 7', () => {
    const next = act(rollState(), 0, { type: 'ROLL_DICE' }, { rng: diceRng([6, 1]) });
    expect(next.phase).toBe('robber');
  });
});

describe('the Jackal', () => {
  function robberState() {
    const s = blankMain(3);
    s.phase = 'robber';
    s.turn.robberReturn = 'main';
    return s;
  }

  it('must move to a new tile', () => {
    const s = robberState();
    expect(() => act(s, 0, { type: 'MOVE_ROBBER', hex: s.robber })).toThrow(/different/);
    expect(() => act(s, 1, { type: 'MOVE_ROBBER', hex: 0 })).toThrow(/not your turn/);
  });

  it('steals one random card from a chosen neighbour of the tile', () => {
    const s = robberState();
    const hex = s.robber === 9 ? 8 : 9;
    const [v0, , v2] = TOPOLOGY.hexes[hex].vertices;
    putBuilding(s, 1, v0);
    putBuilding(s, 2, v2);
    give(s, 1, { fleece: 1 });
    give(s, 2, { stone: 2 });
    expect(() => act(s, 0, { type: 'MOVE_ROBBER', hex })).toThrow(/Choose/);
    const next = act(s, 0, { type: 'MOVE_ROBBER', hex, victim: 2 });
    expect(next.robber).toBe(hex);
    expect(next.players[0].resources.stone).toBe(1);
    expect(next.players[2].resources.stone).toBe(1);
    expect(next.phase).toBe('main');
    // the public log never says what was taken; the private logs do
    const publicText = JSON.stringify(next.log.at(-1));
    expect(publicText).not.toMatch(/stone/);
    expect(JSON.stringify(next.privateLog.p0)).toMatch(/stone/);
    expect(JSON.stringify(next.privateLog.p2)).toMatch(/stone/);
  });

  it('cannot rob players with no cards, or yourself', () => {
    const s = robberState();
    const hex = s.robber === 9 ? 8 : 9;
    putBuilding(s, 0, TOPOLOGY.hexes[hex].vertices[0]);
    putBuilding(s, 1, TOPOLOGY.hexes[hex].vertices[2]);
    give(s, 0, { wheat: 3 });
    expect(() => act(s, 0, { type: 'MOVE_ROBBER', hex, victim: 1 })).toThrow(/Nobody/);
    expect(() => act(s, 0, { type: 'MOVE_ROBBER', hex, victim: 0 })).toThrow(/Nobody/);
    const next = act(s, 0, { type: 'MOVE_ROBBER', hex });
    expect(next.players[0].resources.wheat).toBe(3);
  });
});
