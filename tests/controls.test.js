import { describe, expect, it } from 'vitest';
import { COSTS, mergeView, privateView, publicView } from '../supabase/functions/_shared/engine/index.js';
import { describeTurn, getControls } from '../src/game/controls.js';
import { blankMain, give, putBuilding, started } from './helpers.js';

/** What player `idx` sees in the browser: public state + only their own hand. */
const clientView = (s, idx) => mergeView(publicView(s), privateView(s, idx));

describe('UI controls (client-side move highlighting)', () => {
  it('offers only open corners during setup, and nothing to other players', () => {
    const s = started(3);
    const mine = getControls(clientView(s, 0));
    expect(mine.activeMode).toBe('settlement');
    expect(mine.targets.vertices).toHaveLength(54);
    const theirs = getControls(clientView(s, 1));
    expect(theirs.targets.vertices).toHaveLength(0);
    expect(describeTurn(clientView(s, 1), theirs).title).toMatch(/Ana's turn/);
  });

  it('only highlights builds you can afford and place', () => {
    const s = blankMain(2);
    putBuilding(s, 0, 20);
    expect(getControls(clientView(s, 0), 'road').targets.edges).toHaveLength(0);
    give(s, 0, COSTS.road);
    const c = getControls(clientView(s, 0), 'road');
    expect(c.build.road.can).toBe(true);
    expect(c.targets.edges.length).toBeGreaterThan(0);
    expect(getControls(clientView(s, 0), 'city').build.city.reason).toBe('Not enough resources');
  });

  it('lets you pick any tile but the current one for the Jackal', () => {
    const s = blankMain(2);
    s.phase = 'robber';
    const c = getControls(clientView(s, 0));
    expect(c.targets.hexes).toHaveLength(18);
    expect(c.targets.hexes).not.toContain(s.robber);
  });

  it('never needs another player\'s hand to decide', () => {
    const s = blankMain(3);
    give(s, 1, { wheat: 9 });
    const view = clientView(s, 0);
    expect(view.players[1].resources).toBeUndefined();
    expect(view.players[1].resourceCount).toBe(9);
    expect(() => getControls(view)).not.toThrow();
  });
});
