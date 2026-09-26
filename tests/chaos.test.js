import { describe, expect, it } from 'vitest';
import {
  EVENT_IDS,
  TOPOLOGY,
  bankRate,
  costOf,
  handSize,
  publicView,
  startGame,
} from '../supabase/functions/_shared/engine/index.js';
import { act, afterSetup, blankMain, diceRng, give, lobby, putBuilding, users } from './helpers.js';

const chaosSettings = { settings: { maxPlayers: 4, chaos: true } };

/** Main-phase game with a specific event showing. */
function withEvent(event, n = 3) {
  const s = blankMain(n, chaosSettings);
  s.chaos = { deck: [...EVENT_IDS], current: event, round: 1 };
  return s;
}

describe('chaos mode: flipping events', () => {
  it('is off unless the host enables it', () => {
    const s = afterSetup(3);
    expect(s.chaos).toBeNull();
    expect(s.log.some((e) => e.kind === 'event')).toBe(false);
  });

  it('flips the first event when setup ends, and a new one each round', () => {
    let s = afterSetup(3, chaosSettings);
    expect(s.chaos.round).toBe(1);
    const first = s.chaos.current;
    expect(EVENT_IDS).toContain(first);
    expect(s.log.at(-1).kind === 'event' || s.log.some((e) => e.kind === 'event')).toBe(true);

    const endTurn = (st) => {
      st = structuredClone(st);
      st.phase = 'main';
      return act(st, st.turn.current, { type: 'END_TURN' });
    };
    s = endTurn(s); // → seat 1
    s = endTurn(s); // → seat 2
    expect(s.chaos.round).toBe(1);
    s = endTurn(s); // → seat 0: new round
    expect(s.chaos.round).toBe(2);
    expect(s.chaos.current).not.toBe(first);
  });

  it('reshuffles when the deck runs out', () => {
    let s = afterSetup(2, chaosSettings);
    for (let i = 0; i < EVENT_IDS.length * 2 + 3; i++) {
      s = structuredClone(s);
      s.phase = 'main';
      s = act(s, s.turn.current, { type: 'END_TURN' });
    }
    expect(s.chaos.round).toBeGreaterThan(EVENT_IDS.length);
    expect(EVENT_IDS).toContain(s.chaos.current);
  });

  it('keeps the upcoming deck secret', () => {
    const pub = publicView(afterSetup(3, chaosSettings));
    expect(pub.chaos).toEqual({ current: expect.any(String), round: 1, remaining: EVENT_IDS.length - 1 });
    expect(JSON.stringify(pub.chaos)).not.toContain('deck');
  });
});

describe('chaos mode: ongoing effects', () => {
  function rollOn(event, terrain, number = 9) {
    const s = withEvent(event);
    s.phase = 'roll';
    s.board.hexes[9] = { terrain, number };
    if (s.robber === 9) s.robber = 0;
    putBuilding(s, 0, TOPOLOGY.hexes[9].vertices[0], 'settlement');
    putBuilding(s, 1, TOPOLOGY.hexes[9].vertices[2], 'city');
    return act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([4, 5]) });
  }

  it('Drought stops the Wheat Terraces', () => {
    const next = rollOn('drought', 'terraces');
    expect(next.players[0].resources.wheat + next.players[1].resources.wheat).toBe(0);
  });

  it('Timber Rush doubles the Cedar Groves (a Kibbutz gets 4)', () => {
    const next = rollOn('timberRush', 'grove');
    expect(next.players[0].resources.timber).toBe(2);
    expect(next.players[1].resources.timber).toBe(4);
  });

  it('Market Day lowers the market rate to 3:1 but keeps better harbors', () => {
    const s = withEvent('marketDay');
    expect(bankRate(s, 0, 'wheat')).toBe(3);
    const harbor = s.board.harbors.find((h) => h.type === 'wheat');
    putBuilding(s, 0, TOPOLOGY.edges[harbor.edge].vertices[0]);
    expect(bankRate(s, 0, 'wheat')).toBe(2);
  });

  it('Barn Raising and Housewarming make pieces cheaper', () => {
    const s = withEvent('barnRaising');
    expect(costOf(s, 'road')).toEqual({ timber: 1 });
    putBuilding(s, 0, 20);
    give(s, 0, { timber: 1 });
    const next = act(s, 0, { type: 'BUILD_ROAD', edge: TOPOLOGY.vertices[20].edges[0] });
    expect(next.players[0].resources.timber).toBe(0);
    expect(costOf(withEvent('housewarming'), 'settlement').fleece).toBeUndefined();
  });

  it('Calm Night: a 7 makes nobody discard', () => {
    const s = withEvent('calmNight');
    s.phase = 'roll';
    give(s, 1, { timber: 9 });
    const next = act(s, 0, { type: 'ROLL_DICE' }, { rng: diceRng([3, 4]) });
    expect(next.phase).toBe('robber');
    expect(next.pendingDiscards).toEqual({});
  });
});

describe('chaos mode: one-off events', () => {
  /** End seat 2's turn with `event` on top of the deck so it flips at seat 0. */
  function flip(event, prepare = () => {}) {
    const s = blankMain(3, chaosSettings);
    s.chaos = { deck: [event], current: 'drought', round: 1 };
    s.turn.current = 2;
    prepare(s);
    return act(s, 2, { type: 'END_TURN' });
  }

  it('Caravan gives everyone one resource from the supply', () => {
    const next = flip('caravan');
    expect(next.chaos.current).toBe('caravan');
    for (const p of next.players) expect(handSize(p.resources)).toBe(1);
  });

  it('Sandstorm blows the Jackal back to the Dunes', () => {
    const next = flip('sandstorm', (s) => (s.robber = s.board.desert === 0 ? 1 : 0));
    expect(next.robber).toBe(next.board.desert);
  });

  it('Tithe takes one card from big hands only', () => {
    const next = flip('tithe', (s) => {
      give(s, 0, { wheat: 8 });
      give(s, 1, { wheat: 7 });
    });
    expect(handSize(next.players[0].resources)).toBe(7);
    expect(handSize(next.players[1].resources)).toBe(7);
  });

  it('Windfall helps whoever has the fewest points', () => {
    const next = flip('windfall', (s) => {
      putBuilding(s, 0, 0);
      putBuilding(s, 1, 10);
    });
    expect(handSize(next.players[2].resources)).toBe(2);
    expect(handSize(next.players[0].resources)).toBe(0);
  });

  it('Shifting Sands swaps two different number tokens for good', () => {
    const before = blankMain(3, chaosSettings).board.hexes.map((h) => h.number);
    const next = flip('shiftingSands');
    const after = next.board.hexes.map((h) => h.number);
    const changed = after.flatMap((n, i) => (n !== before[i] ? [i] : []));
    expect(changed).toHaveLength(2);
    expect(after[changed[0]]).toBe(before[changed[1]]);
    expect([...after].sort()).toEqual([...before].sort());
  });
});

describe('chaos mode in a real start', () => {
  it('startGame prepares a hidden, shuffled deck', () => {
    const s = startGame(lobby(2, chaosSettings), users[0], { rng: Math.random, now: 0 });
    expect(s.chaos.deck).toHaveLength(EVENT_IDS.length);
    expect(s.chaos.current).toBeNull();
  });
});
