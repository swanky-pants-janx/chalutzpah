import { describe, expect, it } from 'vitest';
import {
  HARBOR_TYPES,
  NUMBER_TOKENS,
  TERRAIN_COUNTS,
  TOPOLOGY,
  generateBoard,
  isBalanced,
} from '../supabase/functions/_shared/engine/index.js';

describe('topology', () => {
  it('has the standard island shape', () => {
    expect(TOPOLOGY.hexes).toHaveLength(19);
    expect(TOPOLOGY.vertices).toHaveLength(54);
    expect(TOPOLOGY.edges).toHaveLength(72);
    expect(TOPOLOGY.coastalEdges).toHaveLength(30);
  });

  it('gives every corner 2 or 3 neighbours and every tile 6 corners', () => {
    for (const v of TOPOLOGY.vertices) expect([2, 3]).toContain(v.neighbors.length);
    for (const h of TOPOLOGY.hexes) {
      expect(new Set(h.vertices).size).toBe(6);
      expect(new Set(h.edges).size).toBe(6);
    }
  });

  it('places 9 harbors that never share a corner', () => {
    expect(TOPOLOGY.harborSlots).toHaveLength(9);
    const corners = TOPOLOGY.harborSlots.flatMap((e) => TOPOLOGY.edges[e].vertices);
    expect(new Set(corners).size).toBe(18);
    for (const e of TOPOLOGY.harborSlots) expect(TOPOLOGY.edges[e].hexes).toHaveLength(1);
  });
});

describe('board generation', () => {
  it('is deterministic for a seed', () => {
    expect(generateBoard(1234)).toEqual(generateBoard(1234));
  });

  it('differs between seeds', () => {
    const a = JSON.stringify(generateBoard(1).hexes);
    const b = JSON.stringify(generateBoard(2).hexes);
    expect(a).not.toBe(b);
  });

  it('uses the full terrain, number and harbor sets', () => {
    for (const seed of [1, 99, 31337, 2024]) {
      const board = generateBoard(seed);
      const terrains = {};
      for (const h of board.hexes) terrains[h.terrain] = (terrains[h.terrain] ?? 0) + 1;
      expect(terrains).toEqual(TERRAIN_COUNTS);

      const numbers = board.hexes.map((h) => h.number).filter((n) => n != null).sort((a, b) => a - b);
      expect(numbers).toEqual([...NUMBER_TOKENS].sort((a, b) => a - b));

      expect(board.harbors.map((h) => h.type).sort()).toEqual([...HARBOR_TYPES].sort());
      expect(board.hexes[board.desert].terrain).toBe('dunes');
      expect(board.hexes[board.desert].number).toBeNull();
    }
  });

  it('never puts 6s and 8s (or equal numbers) side by side', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const board = generateBoard(seed);
      expect(isBalanced(board.hexes.map((h) => h.number))).toBe(true);
    }
  });
});
