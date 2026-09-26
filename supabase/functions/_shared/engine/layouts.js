// Island layouts: the classic 19-tile island for 2–4 players and the grand
// 30-tile island for up to 6. Each defines its tile mix, number tokens,
// harbors, supply and Chutzpah deck. Shapes live in topology.js.

import { DEV_DECK_COUNTS, HARBOR_TYPES, NUMBER_TOKENS, TERRAIN_COUNTS } from './constants.js';

export const LAYOUTS = Object.freeze({
  classic: {
    name: 'Classic',
    maxPlayers: 4,
    terrain: TERRAIN_COUNTS,
    numbers: NUMBER_TOKENS,
    harbors: HARBOR_TYPES,
    bank: 19,
    devDeck: DEV_DECK_COUNTS,
  },
  grand: {
    name: 'Grand',
    maxPlayers: 6,
    terrain: { grove: 6, claypit: 5, pasture: 6, terraces: 6, quarry: 5, dunes: 2 },
    numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
    harbors: ['any', 'any', 'any', 'any', 'any', 'timber', 'clay', 'fleece', 'fleece', 'wheat', 'stone'],
    bank: 24,
    devDeck: { watchman: 20, landmark: 5, pathfinder: 3, harvest: 3, chutzpah: 3 },
  },
});

export const LAYOUT_IDS = Object.freeze(Object.keys(LAYOUTS));

export const layoutOf = (id) => LAYOUTS[id] ?? LAYOUTS.classic;
