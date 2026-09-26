import { describe, expect, it } from 'vitest';
import { TOPOLOGY, bankRate } from '../supabase/functions/_shared/engine/index.js';
import { act, blankMain, give, putBuilding } from './helpers.js';

describe('market (bank) trades', () => {
  it('trade 4:1 by default', () => {
    const s = blankMain(2);
    give(s, 0, { timber: 4 });
    const next = act(s, 0, { type: 'BANK_TRADE', give: 'timber', get: 'stone' });
    expect(next.players[0].resources).toMatchObject({ timber: 0, stone: 1 });
    expect(next.bank.timber).toBe(s.bank.timber + 4);
    give(s, 0, { timber: -1 });
    expect(() => act(s, 0, { type: 'BANK_TRADE', give: 'timber', get: 'stone' })).toThrow(/need 4/);
  });

  it('use 3:1 and 2:1 harbors when you have a building on them', () => {
    const s = blankMain(2);
    const anyHarbor = s.board.harbors.find((h) => h.type === 'any');
    const woodHarbor = s.board.harbors.find((h) => h.type === 'timber');
    putBuilding(s, 0, TOPOLOGY.edges[anyHarbor.edge].vertices[0]);
    expect(bankRate(s, 0, 'clay')).toBe(3);
    expect(bankRate(s, 0, 'timber')).toBe(3);
    putBuilding(s, 0, TOPOLOGY.edges[woodHarbor.edge].vertices[1]);
    expect(bankRate(s, 0, 'timber')).toBe(2);
    expect(bankRate(s, 1, 'timber')).toBe(4);
  });

  it('rejects same-resource swaps and empty supply', () => {
    const s = blankMain(2);
    give(s, 0, { timber: 4 });
    expect(() => act(s, 0, { type: 'BANK_TRADE', give: 'timber', get: 'timber' })).toThrow(/different/);
    s.bank.stone = 0;
    expect(() => act(s, 0, { type: 'BANK_TRADE', give: 'timber', get: 'stone' })).toThrow(/run out/);
  });
});

describe('player trades', () => {
  function offer() {
    const s = blankMain(3);
    give(s, 0, { timber: 2 });
    give(s, 1, { wheat: 1 });
    give(s, 2, { wheat: 2 });
    return act(s, 0, { type: 'OFFER_TRADE', give: { timber: 2 }, want: { wheat: 1 } });
  }

  it('an accepted offer swaps both hands atomically', () => {
    const s = offer();
    const trade = s.trades[0];
    expect(trade).toMatchObject({ from: 0, give: { timber: 2 }, want: { wheat: 1 } });
    const next = act(s, 1, { type: 'ACCEPT_TRADE', tradeId: trade.id });
    expect(next.players[0].resources).toMatchObject({ timber: 0, wheat: 1 });
    expect(next.players[1].resources).toMatchObject({ timber: 2, wheat: 0 });
    expect(next.trades).toHaveLength(0);
  });

  it('cannot be accepted twice', () => {
    const s = offer();
    const id = s.trades[0].id;
    const once = act(s, 1, { type: 'ACCEPT_TRADE', tradeId: id });
    expect(() => act(once, 2, { type: 'ACCEPT_TRADE', tradeId: id })).toThrow(/no longer/);
  });

  it('revalidates both hands at acceptance time', () => {
    const s = offer();
    const id = s.trades[0].id;
    // the offerer spent their timber after offering
    const spent = structuredClone(s);
    spent.players[0].resources.timber = 0;
    expect(() => act(spent, 1, { type: 'ACCEPT_TRADE', tradeId: id })).toThrow(/no longer have/);
    // the acceptor doesn't have what's wanted
    const broke = structuredClone(s);
    broke.players[1].resources.wheat = 0;
    expect(() => act(broke, 1, { type: 'ACCEPT_TRADE', tradeId: id })).toThrow(/don't have/);
  });

  it('validates offers', () => {
    const s = blankMain(2);
    give(s, 0, { timber: 1 });
    expect(() => act(s, 0, { type: 'OFFER_TRADE', give: { timber: 2 }, want: { wheat: 1 } })).toThrow(/don't hold/);
    expect(() => act(s, 0, { type: 'OFFER_TRADE', give: { timber: 1 }, want: {} })).toThrow(/something/);
    expect(() => act(s, 0, { type: 'OFFER_TRADE', give: { timber: 1 }, want: { timber: 1 } })).toThrow(/same/);
    expect(() => act(s, 0, { type: 'OFFER_TRADE', give: { timber: 1.5 }, want: { wheat: 1 } })).toThrow();
    expect(() => act(s, 1, { type: 'OFFER_TRADE', give: { timber: 1 }, want: { wheat: 1 } })).toThrow(/not your turn/);
  });

  it('can be withdrawn only by the offerer, and are cleared at end of turn', () => {
    const s = offer();
    const id = s.trades[0].id;
    expect(() => act(s, 1, { type: 'CANCEL_TRADE', tradeId: id })).toThrow(/Only/);
    expect(act(s, 0, { type: 'CANCEL_TRADE', tradeId: id }).trades).toHaveLength(0);
    expect(act(s, 0, { type: 'END_TURN' }).trades).toHaveLength(0);
  });

  it('disappears once every other player declines', () => {
    let s = offer();
    const id = s.trades[0].id;
    s = act(s, 1, { type: 'DECLINE_TRADE', tradeId: id });
    expect(s.trades).toHaveLength(1);
    s = act(s, 2, { type: 'DECLINE_TRADE', tradeId: id });
    expect(s.trades).toHaveLength(0);
  });
});
