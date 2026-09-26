// Core rule constants for Chalutzpah.
// Internal ids stay short and stable; display names live in labels.js.

export const RESOURCES = Object.freeze(['timber', 'clay', 'fleece', 'wheat', 'stone']);

/** Which resource each terrain produces (dunes produce nothing). */
export const TERRAIN_RESOURCE = Object.freeze({
  grove: 'timber',
  claypit: 'clay',
  pasture: 'fleece',
  terraces: 'wheat',
  quarry: 'stone',
  dunes: null,
});

export const TERRAIN_COUNTS = Object.freeze({
  grove: 4,
  claypit: 3,
  pasture: 4,
  terraces: 4,
  quarry: 3,
  dunes: 1,
});

export const NUMBER_TOKENS = Object.freeze([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);

/** 'any' harbors trade 3:1, resource harbors trade that resource 2:1. */
export const HARBOR_TYPES = Object.freeze(['any', 'any', 'any', 'any', 'timber', 'clay', 'fleece', 'wheat', 'stone']);

export const COSTS = Object.freeze({
  road: Object.freeze({ timber: 1, clay: 1 }),
  settlement: Object.freeze({ timber: 1, clay: 1, fleece: 1, wheat: 1 }),
  city: Object.freeze({ wheat: 2, stone: 3 }),
  devCard: Object.freeze({ fleece: 1, wheat: 1, stone: 1 }),
});

export const PIECE_LIMITS = Object.freeze({ road: 15, settlement: 5, city: 4 });

export const BANK_PER_RESOURCE = 19;

/** Chutzpah card deck composition. */
export const DEV_DECK_COUNTS = Object.freeze({
  watchman: 14,
  landmark: 5,
  pathfinder: 2,
  harvest: 2,
  chutzpah: 2,
});
export const DEV_CARD_TYPES = Object.freeze(Object.keys(DEV_DECK_COUNTS));

export const DISCARD_THRESHOLD = 7;
export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;
export const ACHIEVEMENT_VP = 2;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const VP_TARGETS = Object.freeze([8, 10, 12]);
export const DEFAULT_SETTINGS = Object.freeze({
  maxPlayers: 4,
  vpTarget: 10,
  // House rules
  closeNeighbours: false, // homesteads may sit one trail apart
  watchmanChoice: false, // a Watchman names the resource it takes
});

export const PLAYER_COLORS = Object.freeze(['pomegranate', 'cobalt', 'almond', 'fig']);

/** Islands are identified by a shareable number, which is also their seed. */
export const MAP_NUMBER_MAX = 999999;

export const NAME_MAX_LENGTH = 16;
export const MAX_OPEN_TRADES = 3;
export const LOG_LIMIT = 80;
export const PRIVATE_LOG_LIMIT = 30;
export const RECENT_ACTION_LIMIT = 50;
