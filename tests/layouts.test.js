import { describe, expect, it } from 'vitest';
import {
  LAYOUTS,
  applyAction,
  PLAYER_COLORS,
  TOPOLOGY,
  createGame,
  generateBoard,
  isBalanced,
  joinGame,
  legalRoadEdges,
  legalSettlementVertices,
  startGame,
  topologyFor,
  updateSettings,
} from '../supabase/functions/_shared/engine/index.js';

const users = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'];
const act = (s, i, action) => applyAction(s, users[i], action, { rng: Math.random, now: 0 });
const names = ['Ana', 'Ben', 'Cal', 'Dov', 'Eli', 'Fay'];

function grandLobby(n) {
  let s = createGame({
    gameId: 'g',
    code: 'GRAND',
    settings: { layout: 'grand', maxPlayers: 6 },
    seed: 777,
    host: { playerId: 'p0', userId: users[0], name: names[0] },
    now: 0,
  });
  for (let i = 1; i < n; i++) s = joinGame(s, { userId: users[i], name: names[i], playerId: `p${i}` });
  return s;
}

describe('grand island', () => {
  it('has 30 tiles, 80 corners, 109 paths and 11 well-spaced harbors', () => {
    const t = topologyFor('grand');
    expect([t.hexes.length, t.vertices.length, t.edges.length, t.coastalEdges.length]).toEqual([30, 80, 109, 38]);
    expect(t.harborSlots).toHaveLength(11);
    const corners = t.harborSlots.flatMap((e) => t.edges[e].vertices);
    expect(new Set(corners).size).toBe(22);
  });

  it('leaves the classic island exactly as it was', () => {
    expect(topologyFor('classic')).toBe(TOPOLOGY);
    expect(topologyFor('nonsense')).toBe(TOPOLOGY);
    expect(generateBoard(1234)).toEqual(generateBoard(1234, 'classic'));
    expect(generateBoard(1234).layout).toBe('classic');
  });

  it('uses the grand tile mix, numbers and harbors, deterministically and balanced', () => {
    const spec = LAYOUTS.grand;
    for (const seed of [1, 42, 999, 123456]) {
      const board = generateBoard(seed, 'grand');
      expect(board).toEqual(generateBoard(seed, 'grand'));
      expect(board.layout).toBe('grand');
      const terrains = {};
      for (const h of board.hexes) terrains[h.terrain] = (terrains[h.terrain] ?? 0) + 1;
      expect(terrains).toEqual(spec.terrain);
      expect(board.hexes.map((h) => h.number).filter(Boolean).sort((a, b) => a - b)).toEqual([...spec.numbers].sort((a, b) => a - b));
      expect(board.harbors.map((h) => h.type).sort()).toEqual([...spec.harbors].sort());
    }
    let balanced = 0;
    for (let seed = 1; seed <= 100; seed++) {
      if (isBalanced(generateBoard(seed, 'grand').hexes.map((h) => h.number), topologyFor('grand'))) balanced++;
    }
    expect(balanced).toBe(100);
  });

  it('seats up to 6 players in 6 different colours', () => {
    const s = grandLobby(6);
    expect(s.players).toHaveLength(6);
    expect(new Set(s.players.map((p) => p.color)).size).toBe(6);
    expect(PLAYER_COLORS).toHaveLength(6);
    expect(() => joinGame(s, { userId: 'u9', name: 'Gil', playerId: 'p9' })).toThrow(/full/);
  });

  it('switching layouts in the lobby reshapes the island and respects the player cap', () => {
    const classic = createGame({ gameId: 'g', code: 'CLASS', settings: {}, seed: 55, host: { playerId: 'p0', userId: 'u0', name: 'Ana' }, now: 0 });
    expect(classic.settings.maxPlayers).toBe(4);
    const grand = updateSettings(classic, 'u0', { layout: 'grand', maxPlayers: 6 });
    expect(grand.board.layout).toBe('grand');
    expect(grand.board.seed).toBe(55);
    expect(grand.board.hexes).toHaveLength(30);
    expect(grand.settings.maxPlayers).toBe(6);
    expect(updateSettings(grand, 'u0', { layout: 'classic' }).settings.maxPlayers).toBe(4);
    const five = grandLobby(5);
    expect(() => updateSettings(five, 'u0', { layout: 'classic' })).toThrow(/already 5/);
  });

  it('starts with a supply of 24 and a 34-card deck, and sets up six players in snake order', () => {
    let s = startGame(grandLobby(6), users[0], { rng: () => 0.999999, now: 0 });
    expect(Object.values(s.bank)).toEqual([24, 24, 24, 24, 24]);
    expect(s.devDeck).toHaveLength(34);
    const order = [];
    while (s.status === 'setup') {
      const cur = s.turn.current;
      order.push(cur);
      const v = legalSettlementVertices(s, cur, { setup: true })[0];
      s = act(s, cur, { type: 'BUILD_SETTLEMENT', vertex: v });
      s = act(s, cur, { type: 'BUILD_ROAD', edge: legalRoadEdges(s, cur, { fromVertex: v })[0] });
    }
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0]);
    expect(s.phase).toBe('roll');
  });

  it('rejects corners and paths that only exist on the other island', () => {
    let s = startGame(grandLobby(2), users[0], { rng: () => 0.999999, now: 0 });
    expect(() => act(s, 0, { type: 'BUILD_SETTLEMENT', vertex: 80 })).toThrow(/exist/);
    s = act(s, 0, { type: 'BUILD_SETTLEMENT', vertex: 70 }); // only valid on the grand island
    expect(s.buildings[70]).toBeDefined();
  });
});
