// Optimistic moves: predict what the player's own action will do, using only
// what their browser already knows (the public view + their own hand), so the
// board can update the instant they click. The server stays authoritative —
// its reply replaces the prediction, and a rejected move is rolled back.

import { simulateAction } from './actions.js';
import { handSize } from './hand.js';
import { victoryPoints } from './rules.js';
import { topo } from './topology.js';

const PREDICTABLE = new Set([
  'BUILD_ROAD',
  'BUILD_SETTLEMENT',
  'BUILD_CITY',
  'BANK_TRADE',
  'OFFER_TRADE',
  'CANCEL_TRADE',
  'DECLINE_TRADE',
  'END_TURN',
  'DISCARD',
  'PLAY_DEV_CARD',
  'MOVE_ROBBER',
  'OASIS_PICK',
]);

/**
 * @returns {{ pub: object, priv: object } | null} the predicted views, or null
 *   when the result can't be known in advance (the UI then waits for the server).
 */
export function predictView(pub, priv, action) {
  if (!pub || !priv || !PREDICTABLE.has(action?.type)) return null;
  if (pub.status !== 'setup' && pub.status !== 'playing') return null;
  // Chutzpah! needs every other player's hand.
  if (action.type === 'PLAY_DEV_CARD' && action.card === 'chutzpah') return null;
  const me = pub.players.findIndex((p) => p.id === priv.playerId);
  if (me < 0) return null;

  const shadow = toShadow(pub, priv, me);
  let s = simulateAction(shadow, me, action);
  // Moving the Jackal onto a neighbour: show the move now, the stolen card later.
  if (!s && action.type === 'MOVE_ROBBER') s = moveJackalOnly(shadow, me, action);
  // Let the server announce a win, and reveal the island at sunrise.
  if (!s || s.status === 'finished') return null;
  if (pub.settings?.nightLanding && pub.status === 'setup' && s.status !== 'setup') return null;
  return toViews(pub, priv, s, me);
}

/** Rebuild an engine-shaped state from what this client can see. */
function toShadow(pub, priv, me) {
  const seqs = [...pub.log, ...(priv.log ?? [])].map((e) => e.seq);
  return {
    ...structuredClone(pub),
    devDeck: new Array(pub.devDeckCount ?? 0).fill('hidden'),
    nextTradeId: pub.nextTradeId ?? Math.max(0, ...pub.trades.map((t) => t.id)) + 1,
    recentActions: [],
    privateLog: {},
    logSeq: Math.max(0, ...seqs),
    players: pub.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      left: p.left,
      userId: null,
      knightsPlayed: p.knightsPlayed,
      piecesLeft: { ...p.piecesLeft },
      // Other hands are unknown; any rule that needs them makes the prediction bail out.
      resources: i === me ? { ...priv.resources } : null,
      devCards: i === me ? priv.devCards.map((c) => ({ ...c })) : [],
    })),
  };
}

function moveJackalOnly(shadow, me, { hex }) {
  if (shadow.turn?.current !== me || shadow.phase !== 'robber') return null;
  if (!Number.isInteger(hex) || hex < 0 || hex >= topo(shadow).hexes.length || hex === shadow.robber) return null;
  const s = structuredClone(shadow);
  s.robber = hex;
  s.phase = s.turn.robberReturn ?? 'main';
  s.turn.robberReturn = null;
  s.turn.robberSource = null;
  return s;
}

function toViews(pub, priv, s, me) {
  const mine = s.players[me];
  return {
    pub: {
      ...pub,
      status: s.status,
      phase: s.phase,
      turn: s.turn,
      robber: s.robber,
      buildings: s.buildings,
      roads: s.roads,
      bank: s.bank,
      trades: s.trades,
      nextTradeId: s.nextTradeId,
      pendingDiscards: s.pendingDiscards,
      pendingOasis: s.pendingOasis ?? {},
      achievements: s.achievements,
      roadLengths: s.roadLengths,
      lastRoll: s.lastRoll,
      log: s.log,
      players: pub.players.map((p, i) => ({
        ...p,
        piecesLeft: s.players[i].piecesLeft,
        knightsPlayed: s.players[i].knightsPlayed,
        publicVP: victoryPoints(s, i),
        ...(i === me ? { resourceCount: handSize(mine.resources), devCardCount: mine.devCards.length } : {}),
      })),
    },
    priv: { ...priv, resources: mine.resources, devCards: mine.devCards },
  };
}
