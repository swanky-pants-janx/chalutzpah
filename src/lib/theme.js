// Visual constants for the board and UI (colours only; names live in the engine's labels.js).

export const PLAYER_COLORS = {
  pomegranate: { fill: '#c8323f', ink: '#ffffff', label: 'Pomegranate' },
  cobalt: { fill: '#2f5fd6', ink: '#ffffff', label: 'Cobalt' },
  almond: { fill: '#f3e9d4', ink: '#2a2118', label: 'Almond' },
  fig: { fill: '#7b3fa1', ink: '#ffffff', label: 'Fig' },
  citrus: { fill: '#f28c28', ink: '#2b2118', label: 'Citrus' },
  teal: { fill: '#159aa0', ink: '#ffffff', label: 'Teal' },
};

export const colorOf = (player) => PLAYER_COLORS[player?.color]?.fill ?? '#888';
export const inkOf = (player) => PLAYER_COLORS[player?.color]?.ink ?? '#fff';

export const RESOURCE_COLORS = {
  timber: '#2f6b3f',
  clay: '#c4623a',
  fleece: '#86b454',
  wheat: '#d9a92f',
  stone: '#77808c',
};

export const TERRAIN_COLORS = {
  grove: ['#4c8a55', '#2b5f37'],
  claypit: ['#d9784a', '#a94d2a'],
  pasture: ['#b3d67c', '#85b150'],
  terraces: ['#f2ca5c', '#d8a232'],
  quarry: ['#a5acb6', '#6f7784'],
  dunes: ['#f2e2b3', '#dcc382'],
};
