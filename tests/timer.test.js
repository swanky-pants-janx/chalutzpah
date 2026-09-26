import { describe, expect, it } from 'vitest';
import { applyAction, handSize, startGame } from '../supabase/functions/_shared/engine/index.js';
import { diceRng, give, lobby, users } from './helpers.js';

const T = 60; // seconds
const at = (s, i, action, now, rng = Math.random) => applyAction(s, users[i], action, { rng, now });

function timedGame(n = 3) {
  const s = startGame(lobby(n, { settings: { maxPlayers: 4, turnTimer: T } }), users[0], { rng: () => 0.999999, now: 1_000 });
  return s;
}

/** Jump a timed game to player 0's roll at time `now`. */
function rolling(n = 3, now = 50_000) {
  const s = structuredClone(timedGame(n));
  s.status = 'playing';
  s.phase = 'roll';
  s.turn = { ...s.turn, number: 3, current: 0, setupIndex: 2 * n, deadline: now + T * 1000 };
  return s;
}

describe('turn timer', () => {
  it('starts a clock for each turn and setup placement', () => {
    const s = timedGame();
    expect(s.turn.deadline).toBe(1_000 + T * 1000);
    const off = startGame(lobby(2), users[0], { rng: Math.random, now: 5 });
    expect(off.turn.deadline).toBeNull();
  });

  it('ending a turn restarts the clock for the next player', () => {
    const s = rolling();
    s.phase = 'main';
    const next = at(s, 0, { type: 'END_TURN' }, 70_000);
    expect(next.turn.current).toBe(1);
    expect(next.turn.deadline).toBe(70_000 + T * 1000);
  });

  it("can't be called early, and not at a table without a timer", () => {
    const s = rolling(3, 50_000);
    expect(() => at(s, 1, { type: 'TIMEOUT' }, 60_000)).toThrow(/still time/);
    const untimed = structuredClone(s);
    untimed.turn.deadline = null;
    expect(() => at(untimed, 1, { type: 'TIMEOUT' }, 999_999)).toThrow(/no turn timer/);
  });

  it('when time runs out, anyone can call it: the roll is made and the turn passes', () => {
    const s = rolling(3, 50_000);
    const now = s.turn.deadline + 1;
    const next = at(s, 2, { type: 'TIMEOUT' }, now, diceRng([2, 2]));
    expect(next.log.some((e) => JSON.stringify(e).includes("Time's up"))).toBe(true);
    expect(next.log.some((e) => e.kind === 'roll')).toBe(true);
    expect(next.turn.current).toBe(1);
    expect(next.phase).toBe('roll');
    expect(next.turn.deadline).toBe(now + T * 1000);
  });

  it('a 7 at the buzzer: everyone discards automatically and the Jackal is moved', () => {
    const s = rolling(3, 50_000);
    give(s, 1, { timber: 5, clay: 5 });
    const next = at(s, 2, { type: 'TIMEOUT' }, s.turn.deadline + 1, diceRng([3, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]));
    expect(handSize(next.players[1].resources)).toBe(5);
    expect(next.turn.current).toBe(1);
    expect(next.phase).toBe('roll');
  });

  it('discarding after a late 7 gets a grace period', () => {
    const s = rolling(3, 50_000);
    give(s, 1, { timber: 8 });
    const late = s.turn.deadline - 2_000;
    const next = at(s, 0, { type: 'ROLL_DICE' }, late, diceRng([3, 4]));
    expect(next.phase).toBe('discard');
    expect(next.turn.deadline).toBe(late + 20_000);
  });

  it('runs out a setup placement too', () => {
    const s = timedGame(2);
    const next = at(s, 1, { type: 'TIMEOUT' }, s.turn.deadline + 1);
    expect(Object.keys(next.buildings)).toHaveLength(1);
    expect(Object.keys(next.roads)).toHaveLength(1);
    expect(next.turn.current).toBe(1);
    expect(next.phase).toBe('setup_settlement');
  });
});
