// What each client is allowed to see. The full state never leaves the server;
// clients receive the public view (everyone) and their own private view.

import { handSize } from './hand.js';
import { landmarkCount, victoryPoints } from './rules.js';

/** Night Landing keeps the island dark (for everyone) until setup ends. */
export function isDark(s) {
  return s.settings?.nightLanding === true && (s.status === 'lobby' || s.status === 'setup');
}

/** The board as players may see it: in the dark, only the coast and harbors. */
export function visibleBoard(s) {
  if (!isDark(s)) return s.board;
  return {
    layout: s.board.layout,
    seed: null,
    desert: null,
    harbors: s.board.harbors,
    hexes: s.board.hexes.map(() => ({ terrain: 'hidden', number: null })),
  };
}

export function publicView(s) {
  const finished = s.status === 'finished';
  const dark = isDark(s);
  return {
    id: s.id,
    code: s.code,
    status: s.status,
    phase: s.phase,
    settings: s.settings,
    hostId: s.hostId,
    board: visibleBoard(s),
    mapRolls: s.mapRolls,
    robber: dark ? null : s.robber,
    buildings: s.buildings,
    roads: s.roads,
    bank: s.bank,
    devDeckCount: s.devDeck.length,
    turn: s.turn,
    lastRoll: s.lastRoll,
    pendingDiscards: s.pendingDiscards,
    pendingOasis: s.pendingOasis ?? {},
    trades: s.trades,
    nextTradeId: s.nextTradeId,
    // Random ids of the latest applied actions, so a client can tell when its
    // own optimistic move has been confirmed (they reveal nothing else).
    appliedActions: s.recentActions.slice(-10),
    achievements: s.achievements,
    roadLengths: s.roadLengths,
    winner: s.winner,
    rematch: s.rematch ?? null,
    chaos: s.chaos ? { current: s.chaos.current, round: s.chaos.round, remaining: s.chaos.deck.length } : null,
    log: s.log,
    createdAt: s.createdAt,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    players: s.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      left: p.left,
      resourceCount: handSize(p.resources),
      devCardCount: p.devCards.length,
      knightsPlayed: p.knightsPlayed,
      piecesLeft: p.piecesLeft,
      publicVP: victoryPoints(s, i),
      ...(finished ? { landmarks: landmarkCount(p), totalVP: victoryPoints(s, i, { hidden: true }) } : {}),
    })),
  };
}

export function privateView(s, idx) {
  const p = s.players[idx];
  return {
    playerId: p.id,
    resources: { ...p.resources },
    devCards: p.devCards.map((card) => ({ ...card })),
    log: s.privateLog[p.id] ?? [],
  };
}

/** Rows the database layer needs to persist after every change. */
export function snapshot(s) {
  return {
    state: s,
    status: s.status,
    public: publicView(s),
    privates: s.players.map((p, i) => ({ player_id: p.id, user_id: p.userId, data: privateView(s, i) })),
    members: s.players.map((p) => ({ player_id: p.id, user_id: p.userId })),
  };
}

/**
 * Client side: overlay my private hand onto the public state so the shared
 * rule queries (rules.js) can run in the browser for move highlighting.
 */
export function mergeView(pub, priv) {
  if (!pub) return null;
  const me = priv ? pub.players.findIndex((p) => p.id === priv.playerId) : -1;
  return {
    ...pub,
    me,
    players: pub.players.map((p, i) =>
      i === me ? { ...p, resources: priv.resources, devCards: priv.devCards } : p,
    ),
  };
}
