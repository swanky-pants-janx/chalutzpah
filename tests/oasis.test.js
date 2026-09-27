import { describe, expect, it } from 'vitest';
import {
  TOPOLOGY,
  eventIdsFor,
  handSize,
  publicView,
  startGame,
  topologyFor,
} from '../supabase/functions/_shared/engine/index.js';
import { act, blankMain, diceRng, give, lobby, putBuilding, users } from './helpers.js';

const oasisSettings = { settings: { maxPlayers: 4, oasis: true } };

/** A roll-phase oasis-mode game with a known deck. */
function oasisRoll(n = 3, opts = oasisSettings) {
  const s = blankMain(n, opts);
  s.robber = null;
  s.phase = 'roll';
  s.turn.rolled = false;
  s.devDeck = ['landmark', 'harvest'];
  return s;
}

const oasisHex = (s) => topologyFor(s.board.layout).hexes.find((h) => s.board.hexes[h.id].terrain === 'dunes');

describe('oasis mode: no Jackal', () => {
  it('starts without a Jackal and keeps Jackal events out of the chaos deck', () => {
    const s = startGame(lobby(2, { settings: { maxPlayers: 4, oasis: true, chaos: true } }), users[0], { rng: Math.random, now: 0 });
    expect(s.robber).toBeNull();
    expect(publicView(s).robber).toBeNull();
    expect(s.chaos.deck).not.toContain('sandstorm');
    expect(s.chaos.deck).not.toContain('calmNight');
    expect(eventIdsFor({ oasis: false })).toContain('sandstorm');
  });

  it('the Jackal can never be moved', () => {
    const s = blankMain(2, oasisSettings);
    s.robber = null;
    expect(() => act(s, 0, { type: 'MOVE_ROBBER', hex: 3 })).toThrow();
  });
});

describe('oasis mode: rolling a 7 is Oasis Day', () => {
  it('nobody discards, and the roller draws a free Chutzpah card', () => {
    const s = oasisRoll();
    give(s, 1, { timber: 9 });
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([3, 4]) });
    expect(next.pendingDiscards).toEqual({});
    expect(handSize(next.players[1].resources)).toBe(9);
    expect(next.players[0].devCards).toEqual([{ type: 'harvest', boughtTurn: next.turn.number }]);
    expect(next.devDeck).toEqual(['landmark']);
    expect(next.phase).toBe('main'); // nobody touches the Oasis
    expect(JSON.stringify(next.log)).toMatch(/Oasis Day/);
    expect(JSON.stringify(next.log.at(-1))).not.toMatch(/Bountiful/); // the card stays secret
  });

  it('the free card follows the usual rule: playable from your next turn', () => {
    const next = act(oasisRoll(), 0, { type: 'ROLL_DICE' }, { rng: diceRng([3, 4]) });
    expect(() => act(next, 0, { type: 'PLAY_DEV_CARD', card: 'harvest', resources: ['wheat', 'wheat'] })).toThrow(/next turn/);
  });

  it('everyone touching an Oasis picks a resource of their choice', () => {
    const s = oasisRoll();
    const oasis = oasisHex(s);
    putBuilding(s, 1, oasis.vertices[0]);
    putBuilding(s, 2, oasis.vertices[3], 'city'); // a kibbutz still counts once per Oasis
    let next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([6, 1]) });
    expect(next.phase).toBe('oasis');
    expect(next.pendingOasis).toEqual({ 1: 1, 2: 1 });
    expect(() => act(next, 0, { type: 'OASIS_PICK', resources: { wheat: 1 } })).toThrow(/nothing to collect/);
    expect(() => act(next, 1, { type: 'OASIS_PICK', resources: { wheat: 2 } })).toThrow(/exactly 1/);
    expect(() => act(next, 0, { type: 'END_TURN' })).toThrow(/Oasis/);
    next = act(next, 1, { type: 'OASIS_PICK', resources: { stone: 1 } });
    expect(next.players[1].resources.stone).toBe(1);
    expect(next.phase).toBe('oasis');
    next = act(next, 2, { type: 'OASIS_PICK', resources: { wheat: 1 } });
    expect(next.phase).toBe('main');
  });

  it('on the grand island, touching both Oases means two picks', () => {
    const s = oasisRoll(3, { settings: { maxPlayers: 6, oasis: true, layout: 'grand' } });
    const t = topologyFor('grand');
    const [a, b] = t.hexes.filter((h) => s.board.hexes[h.id].terrain === 'dunes');
    putBuilding(s, 1, a.vertices[0]);
    putBuilding(s, 1, b.vertices[0]);
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([2, 5]) });
    expect(next.pendingOasis).toEqual({ 1: 2 });
  });

  it("can't take what the supply doesn't have", () => {
    const s = oasisRoll();
    putBuilding(s, 1, oasisHex(s).vertices[0]);
    s.bank.stone = 0;
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([3, 4]) });
    expect(() => act(next, 1, { type: 'OASIS_PICK', resources: { stone: 1 } })).toThrow(/run out/);
  });

  it("time running out picks for anyone who hasn't", () => {
    const s = oasisRoll(3, { settings: { maxPlayers: 4, oasis: true, turnTimer: 60 } });
    s.turn.deadline = 1_000;
    putBuilding(s, 1, oasisHex(s).vertices[0]);
    const next = act(s, 2, { type: 'TIMEOUT' }, { now: 5_000, rng: diceRng([3, 4, 1, 1, 1, 1, 1, 1]) });
    expect(handSize(next.players[1].resources)).toBe(1);
    expect(next.turn.current).toBe(1);
  });
});

describe('oasis mode: Watchmen visit a player', () => {
  function withWatchman(settings = {}) {
    const s = blankMain(3, { settings: { maxPlayers: 4, oasis: true, ...settings } });
    s.robber = null;
    s.players[0].devCards = [{ type: 'watchman', boughtTurn: 0 }];
    return s;
  }

  it('takes a card from any player you choose and stays in your turn', () => {
    const s = withWatchman();
    give(s, 2, { clay: 1 });
    expect(() => act(s, 0, { type: 'PLAY_DEV_CARD', card: 'watchman' })).toThrow(/Choose who/);
    expect(() => act(s, 0, { type: 'PLAY_DEV_CARD', card: 'watchman', victim: 1 })).toThrow(/Choose who/); // player 1 has no cards
    const next = act(s, 0, { type: 'PLAY_DEV_CARD', card: 'watchman', victim: 2 });
    expect(next.players[0].resources.clay).toBe(1);
    expect(next.players[2].resources.clay).toBe(0);
    expect(next.phase).toBe('main');
    expect(next.players[0].knightsPlayed).toBe(1);
  });

  it('works before rolling, and with nobody to visit', () => {
    const s = withWatchman();
    s.phase = 'roll';
    const next = act(s, 0, { type: 'PLAY_DEV_CARD', card: 'watchman' });
    expect(next.phase).toBe('roll');
    expect(next.players[0].knightsPlayed).toBe(1);
  });

  it('respects the Choosy Watchman house rule', () => {
    const s = withWatchman({ watchmanChoice: true });
    give(s, 1, { wheat: 1, stone: 5 });
    const next = act(s, 0, { type: 'PLAY_DEV_CARD', card: 'watchman', victim: 1, resource: 'wheat' });
    expect(next.players[0].resources.wheat).toBe(1);
  });

  it('still builds towards the Night Watch', () => {
    let s = withWatchman();
    for (let k = 0; k < 3; k++) {
      s = structuredClone(s);
      s.turn.devPlayed = false;
      s.players[0].devCards.push({ type: 'watchman', boughtTurn: 0 });
      s = act(s, 0, { type: 'PLAY_DEV_CARD', card: 'watchman' });
    }
    expect(s.achievements.largestArmy).toEqual({ player: 0, size: 3 });
  });
});

describe('oasis mode is off by default', () => {
  it('a 7 still brings the Jackal', () => {
    const s = blankMain(2);
    s.phase = 'roll';
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([3, 4]) });
    expect(next.phase).toBe('robber');
    expect(TOPOLOGY.hexes).toHaveLength(19);
  });
});
