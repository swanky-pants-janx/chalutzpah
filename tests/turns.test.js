import { describe, expect, it } from 'vitest';
import {
  COSTS,
  applyAction,
  leaveGame,
  joinGame,
  mulberry32,
  publicView,
  privateView,
} from '../supabase/functions/_shared/engine/index.js';
import { act, afterSetup, blankMain, give, putBuilding, users } from './helpers.js';

describe('turn order', () => {
  it('cycles players and resets per-turn flags', () => {
    let s = blankMain(3);
    s = act(s, 0, { type: 'END_TURN' });
    expect(s.turn.current).toBe(1);
    expect(s.phase).toBe('roll');
    expect(s.turn.devPlayed).toBe(false);
    expect(() => act(s, 1, { type: 'END_TURN' })).toThrow(/Roll the dice/);
    expect(() => act(s, 0, { type: 'END_TURN' })).toThrow(/not your turn/);
  });

  it('rejects actions from strangers and after the game ends', () => {
    const s = blankMain(2);
    expect(() => applyAction(s, 'u-stranger', { type: 'END_TURN' })).toThrow(/not seated/);
    s.status = 'finished';
    s.phase = 'game_over';
    expect(() => act(s, 0, { type: 'END_TURN' })).toThrow(/not in progress/);
  });

  it('ignores a replayed action id', () => {
    const s = blankMain(2);
    give(s, 0, { timber: 8 });
    const once = act(s, 0, { type: 'BANK_TRADE', give: 'timber', get: 'stone', id: 'a-1' });
    expect(() => act(once, 0, { type: 'BANK_TRADE', give: 'timber', get: 'stone', id: 'a-1' })).toThrow(/already processed/);
    const twice = act(once, 0, { type: 'BANK_TRADE', give: 'timber', get: 'stone', id: 'a-2' });
    expect(twice.players[0].resources.stone).toBe(2);
  });

  it('never mutates the input state', () => {
    const s = blankMain(2);
    const frozen = JSON.stringify(s);
    act(s, 0, { type: 'END_TURN' });
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe('victory', () => {
  it('Blitz: reaching 5 points on your turn wins', () => {
    const s = blankMain(2, { settings: { maxPlayers: 4, vpTarget: 5 } });
    for (const v of [0, 8, 16, 24]) putBuilding(s, 0, v); // 4 points
    give(s, 0, COSTS.city);
    const next = act(s, 0, { type: 'BUILD_CITY', vertex: 0 }); // 5 points
    expect(next.status).toBe('finished');
    expect(next.winner).toBe(0);
  });

  it('ends the game when the current player reaches the target', () => {
    const s = blankMain(2, { settings: { maxPlayers: 4, vpTarget: 8 } });
    for (const v of [0, 8, 16, 24, 32, 40, 48]) putBuilding(s, 0, v); // 7 points
    give(s, 0, COSTS.city);
    const next = act(s, 0, { type: 'BUILD_CITY', vertex: 0 }); // 8 points
    expect(next.status).toBe('finished');
    expect(next.winner).toBe(0);
    expect(next.phase).toBe('game_over');
    expect(() => act(next, 1, { type: 'END_TURN' })).toThrow(/not in progress/);
  });

  it('counts hidden landmarks, but only on your own turn', () => {
    const s = blankMain(2, { settings: { maxPlayers: 4, vpTarget: 8 } });
    for (const v of [0, 8, 16, 24, 32, 40, 48]) putBuilding(s, 1, v); // 7 public points
    s.players[1].devCards.push({ type: 'landmark', boughtTurn: 1 }); // +1 hidden
    give(s, 0, { timber: 4 });
    const during = act(s, 0, { type: 'BANK_TRADE', give: 'timber', get: 'stone' });
    expect(during.status).toBe('playing'); // player 1 has 8 but it's not their turn
    const next = act(during, 0, { type: 'END_TURN' });
    expect(next.status).toBe('finished');
    expect(next.winner).toBe(1);
  });
});

describe('absent players', () => {
  it('a player who leaves mid-game is skipped automatically and can return', () => {
    let s = afterSetup(3);
    s = leaveGame(s, users[1], { rng: mulberry32(1) });
    expect(s.players[1].left).toBe(true);
    s = act(s, 0, { type: 'ROLL_DICE' });
    while (s.phase !== 'main') {
      if (s.phase === 'discard') {
        for (const i of Object.keys(s.pendingDiscards).map(Number)) {
          const r = s.players[i].resources;
          const need = s.pendingDiscards[i];
          const bundle = {};
          let left = need;
          for (const k of Object.keys(r)) {
            const n = Math.min(r[k], left);
            if (n) bundle[k] = n;
            left -= n;
          }
          s = act(s, i, { type: 'DISCARD', resources: bundle });
        }
      } else if (s.phase === 'robber') {
        s = act(s, 0, { type: 'MOVE_ROBBER', hex: s.robber === 0 ? 1 : 0 });
      }
    }
    s = act(s, 0, { type: 'END_TURN' });
    // player 1 was skipped: it's player 2's turn
    expect(s.turn.current).toBe(2);
    expect(s.log.some((e) => JSON.stringify(e).includes('away'))).toBe(true);

    const back = joinGame(s, { userId: users[1], name: 'ignored', playerId: 'x' });
    expect(back.players[1].left).toBe(false);
    expect(back.players[1].id).toBe(s.players[1].id);
  });

  it('FORCE_SKIP only works on players the server reports idle', () => {
    const s = blankMain(3);
    s.phase = 'roll';
    expect(() => act(s, 1, { type: 'FORCE_SKIP' }, { idle: [] })).toThrow(/Nobody/);
    let next = act(s, 1, { type: 'FORCE_SKIP' }, { idle: [users[0]] });
    // the idle player's roll was made and (unless the Jackal needs a live player) the turn passed
    expect(next.log.some((e) => JSON.stringify(e).includes('away'))).toBe(true);
    expect(next.turn.current === 1 || next.phase !== 'roll').toBe(true);
  });
});

describe('private information', () => {
  it('never puts hands, the deck or user ids in the public view', () => {
    const s = afterSetup(3);
    s.players[1].devCards.push({ type: 'landmark', boughtTurn: 1 });
    const pub = publicView(s);
    const text = JSON.stringify(pub);
    expect(text).not.toMatch(/"resources"/);
    expect(text).not.toMatch(/devCards/);
    expect(text).not.toMatch(/userId/);
    expect(text).not.toMatch(/u-ana|u-ben/);
    expect(text).not.toMatch(/landmark/);
    expect(pub.devDeckCount).toBe(25);
    expect(pub.players[1].devCardCount).toBe(1);
    expect(pub.players[1].publicVP).toBe(2);

    const mine = privateView(s, 1);
    expect(mine.devCards).toEqual([{ type: 'landmark', boughtTurn: 1 }]);
    expect(JSON.stringify(mine)).not.toMatch(/u-ben/);
  });

  it('reveals landmarks and totals only when the game is over', () => {
    const s = afterSetup(2);
    s.players[1].devCards.push({ type: 'landmark', boughtTurn: 1 });
    s.status = 'finished';
    const pub = publicView(s);
    expect(pub.players[1]).toMatchObject({ landmarks: 1, totalVP: 3 });
  });
});
