// Original card text for the Chutzpah deck.

export const CARD_TEXT = {
  watchman: 'Move the Jackal to any tile and snatch a card from a neighbour there. Call three to contend for the Night Watch.',
  landmark: 'Worth 1 point. Kept secret until the game ends — it counts toward winning on your turn.',
  pathfinder: 'Lay two Trails at no cost.',
  harvest: 'A Bountiful Year: take any two resources from the supply.',
  chutzpah: 'Name a resource. Every other player hands you all of theirs. It takes nerve.',
};

export const CARD_ORDER = ['watchman', 'pathfinder', 'harvest', 'chutzpah', 'landmark'];

export const ACHIEVEMENT_TEXT = {
  longestRoad: 'Trailblazer: longest unbroken trail of at least 5 segments (+2 points).',
  largestArmy: 'Night Watch: most Watchmen called, at least 3 (+2 points).',
};

export const HOUSE_RULES = [
  {
    key: 'closeNeighbours',
    name: 'Close neighbours',
    text: 'Homesteads may sit just one trail apart.',
  },
  {
    key: 'watchmanChoice',
    name: 'Choosy Watchman',
    text: "When you play a Watchman, name a resource. If they have one it's yours — otherwise you grab a random card.",
  },
];

export const MODES = [
  {
    key: 'chaos',
    name: 'Chaos mode',
    text: 'A new event card every round: droughts, market days, sandstorms, caravans…',
  },
];
