// Game lifecycle outside of turn actions: creating a table, joining, leaving,
// rerolling the island in the lobby, host changes, and starting the game.
// Every function returns a new state (or the same object when nothing changed).

import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NAME_MAX_LENGTH,
  PIECE_LIMITS,
  PLAYER_COLORS,
  RESOURCES,
  TURN_TIMERS,
  VP_TARGETS,
} from './constants.js';
import { checkVictory, makeEnv, resolveAbsent, startClock } from './actions.js';
import { generateBoard, randomMapNumber } from './board.js';
import { newChaosDeck } from './events.js';
import { LAYOUT_IDS, layoutOf } from './layouts.js';
import { GameError } from './errors.js';
import { emptyHand } from './hand.js';
import { P, log } from './log.js';
import { shuffle } from './rng.js';
import { playerIndexById, playerIndexByUser } from './rules.js';

const NAME_PATTERN = /^[\p{L}\p{N} _.'-]+$/u;

export function validateName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length === 0) throw new GameError('BAD_NAME', 'Pick a name first.');
  if (name.length > NAME_MAX_LENGTH) throw new GameError('BAD_NAME', `Names can be at most ${NAME_MAX_LENGTH} characters.`);
  if (!NAME_PATTERN.test(name)) throw new GameError('BAD_NAME', 'Names can use letters, numbers, spaces and - _ . \'');
  return name;
}

export function normalizeSettings(input = {}) {
  const layout = LAYOUT_IDS.includes(input.layout) ? input.layout : DEFAULT_SETTINGS.layout;
  const cap = Math.min(MAX_PLAYERS, layoutOf(layout).maxPlayers);
  const maxPlayers = Number.isInteger(input.maxPlayers)
    ? Math.min(cap, Math.max(MIN_PLAYERS, input.maxPlayers))
    : Math.min(cap, DEFAULT_SETTINGS.maxPlayers);
  const vpTarget = VP_TARGETS.includes(input.vpTarget) ? input.vpTarget : DEFAULT_SETTINGS.vpTarget;
  return {
    maxPlayers,
    vpTarget,
    closeNeighbours: input.closeNeighbours === true,
    watchmanChoice: input.watchmanChoice === true,
    turnTimer: TURN_TIMERS.includes(input.turnTimer) ? input.turnTimer : 0,
    chaos: input.chaos === true,
    oasis: input.oasis === true,
    nightLanding: input.nightLanding === true,
    layout,
  };
}

/** Host changes the table's settings or house rules while everyone is in the lobby. */
export function updateSettings(state, userId, patch = {}) {
  const idx = requireMember(state, userId);
  requireLobby(state);
  requireHost(state, idx);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new GameError('BAD_SETTINGS', 'Invalid settings.');
  const settings = normalizeSettings({ ...state.settings, ...patch });
  if (settings.maxPlayers < state.players.length) {
    throw new GameError('TOO_MANY', `There are already ${state.players.length} players at the table.`);
  }
  const s = structuredClone(state);
  s.settings = settings;
  if (settings.layout !== (s.board.layout ?? 'classic')) {
    // Same map number, new island shape.
    s.board = generateBoard(s.board.seed, settings.layout);
    s.robber = s.board.desert;
    s.bank = Object.fromEntries(RESOURCES.map((r) => [r, layoutOf(settings.layout).bank]));
  }
  return s;
}

function newPlayer({ playerId, userId, name }, color) {
  return {
    id: playerId,
    userId,
    name,
    color,
    resources: emptyHand(),
    devCards: [],
    knightsPlayed: 0,
    piecesLeft: { ...PIECE_LIMITS },
    left: false,
  };
}

function freeColor(s, preferred = null) {
  const taken = new Set(s.players.map((p) => p.color));
  if (PLAYER_COLORS.includes(preferred) && !taken.has(preferred)) return preferred;
  return PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[0];
}

function requireMember(s, userId) {
  const idx = playerIndexByUser(s, userId);
  if (idx < 0) throw new GameError('NOT_A_PLAYER', 'You are not seated at this table.');
  return idx;
}

function requireLobby(s) {
  if (s.status !== 'lobby') throw new GameError('ALREADY_STARTED', 'The game has already started.');
}

function requireHost(s, idx) {
  if (s.players[idx].id !== s.hostId) throw new GameError('NOT_HOST', 'Only the host can do that.');
}

/** A fresh lobby with the host seated and a first island rolled. */
export function createGame({ gameId, code, settings, seed, host, now }) {
  const tableSettings = normalizeSettings(settings);
  const board = generateBoard(seed, tableSettings.layout);
  const s = {
    id: gameId,
    code,
    status: 'lobby',
    phase: 'lobby',
    settings: tableSettings,
    hostId: host.playerId,
    players: [],
    board,
    mapRolls: 1,
    robber: board.desert,
    buildings: {},
    roads: {},
    bank: Object.fromEntries(RESOURCES.map((r) => [r, layoutOf(tableSettings.layout).bank])),
    devDeck: [],
    turn: null,
    lastRoll: null,
    pendingDiscards: {},
    trades: [],
    nextTradeId: 1,
    chaos: null,
    pendingOasis: {},
    achievements: { longestRoad: null, largestArmy: null },
    roadLengths: [],
    log: [],
    privateLog: {},
    logSeq: 0,
    winner: null,
    recentActions: [],
    createdAt: now,
    startedAt: null,
    finishedAt: null,
  };
  s.players.push(newPlayer({ ...host, name: validateName(host.name) }, freeColor(s, host.color)));
  log(s, [P(s, 0), ' set up a new table.'], 'lobby');
  return s;
}

/**
 * Seat a new player, or reconnect a returning one (same userId).
 * Returning players keep their seat, hand and buildings.
 */
export function joinGame(state, { userId, name, playerId, color = null }) {
  const existing = playerIndexByUser(state, userId);
  if (existing >= 0) {
    if (!state.players[existing].left) return state;
    const s = structuredClone(state);
    s.players[existing].left = false;
    log(s, [P(s, existing), ' is back at the table.'], 'lobby');
    return s;
  }

  if (state.status !== 'lobby') throw new GameError('ALREADY_STARTED', 'That game has already started.');
  if (state.players.length >= state.settings.maxPlayers) throw new GameError('TABLE_FULL', 'That table is full.');
  const clean = validateName(name);
  if (state.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new GameError('NAME_TAKEN', 'Someone at that table already uses that name.');
  }

  const s = structuredClone(state);
  s.players.push(newPlayer({ playerId, userId, name: clean }, freeColor(s, color)));
  log(s, [P(s, s.players.length - 1), ' joined the table.'], 'lobby');
  return s;
}

/** An in-progress game that every player has left. The server disbands these. */
export function isAbandoned(state) {
  return (state.status === 'setup' || state.status === 'playing') && state.players.every((p) => p.left);
}

/**
 * Lobby: the seat is freed. Active game: the player is marked away (state is kept
 * so they can rejoin) and their turns are skipped automatically — unless they
 * were the last one there, in which case the game is abandoned (see isAbandoned).
 */
export function leaveGame(state, userId, ctx = {}) {
  const idx = requireMember(state, userId);
  if (state.status === 'finished') return state;
  const s = structuredClone(state);

  if (s.status === 'lobby') {
    const [gone] = s.players.splice(idx, 1);
    log(s, [{ p: gone.id, name: gone.name }, ' left the table.'], 'lobby');
    if (s.hostId === gone.id) migrateHost(s);
    return s;
  }

  if (s.players[idx].left) return state;
  s.players[idx].left = true;
  if (isAbandoned(s)) return s; // nobody left to play for: the server disbands it
  log(s, [P(s, idx), ' left the game. Their turns will be skipped until they return.'], 'away');
  if (s.hostId === s.players[idx].id) migrateHost(s);
  const env = makeEnv(s, ctx);
  resolveAbsent(s, new Set(s.players.flatMap((p, i) => (p.left ? [i] : []))), env);
  checkVictory(s, env);
  return s;
}

function migrateHost(s) {
  const next = s.players.find((p) => !p.left && p.id !== s.hostId);
  if (!next) return;
  s.hostId = next.id;
  log(s, [{ p: next.id, name: next.name }, ' is now the host.'], 'lobby');
}

/** Take over hosting when the current host has left or gone quiet. */
export function claimHost(state, userId, { hostIdle = false } = {}) {
  const idx = requireMember(state, userId);
  if (state.players[idx].id === state.hostId) return state;
  if (state.players[idx].left) throw new GameError('AWAY', 'Rejoin the table first.');
  const hostIdx = playerIndexById(state, state.hostId);
  const hostGone = hostIdx < 0 || state.players[hostIdx].left || hostIdle;
  if (!hostGone) throw new GameError('HOST_PRESENT', 'The host is still here.');
  const s = structuredClone(state);
  s.hostId = s.players[idx].id;
  log(s, [P(s, idx), ' took over as host.'], 'lobby');
  return s;
}

/**
 * Point a finished game at its rematch lobby so everyone can follow. The first
 * pointer wins; it's only replaced when the lobby it names no longer exists.
 */
export function setRematch(state, userId, { gameId, code }, { replacing = null } = {}) {
  const idx = requireMember(state, userId);
  if (state.status !== 'finished') throw new GameError('NOT_FINISHED', 'Finish this game first.');
  if (state.rematch && state.rematch.gameId !== replacing) return state;
  const s = structuredClone(state);
  s.rematch = { gameId, code, by: s.players[idx].id };
  log(s, [P(s, idx), ` wants a rematch! Table ${code} is open.`], 'lobby');
  return s;
}

/** Host rolls a brand-new island while everyone waits in the lobby. */
export function rerollMap(state, userId, seed) {
  const idx = requireMember(state, userId);
  requireLobby(state);
  requireHost(state, idx);
  const s = structuredClone(state);
  s.board = generateBoard(seed, s.settings.layout);
  s.robber = s.board.desert;
  s.mapRolls += 1;
  return s;
}

export function updateProfile(state, userId, { name, color } = {}) {
  const idx = requireMember(state, userId);
  requireLobby(state);
  const s = structuredClone(state);
  const player = s.players[idx];
  if (name !== undefined) {
    const clean = validateName(name);
    if (s.players.some((p, i) => i !== idx && p.name.toLowerCase() === clean.toLowerCase())) {
      throw new GameError('NAME_TAKEN', 'Someone at this table already uses that name.');
    }
    player.name = clean;
  }
  if (color !== undefined) {
    if (!PLAYER_COLORS.includes(color)) throw new GameError('BAD_COLOR', 'Unknown colour.');
    if (s.players.some((p, i) => i !== idx && p.color === color)) throw new GameError('COLOR_TAKEN', 'That colour is taken.');
    player.color = color;
  }
  return s;
}

export function kickPlayer(state, userId, playerId) {
  const idx = requireMember(state, userId);
  requireLobby(state);
  requireHost(state, idx);
  const target = playerIndexById(state, playerId);
  if (target < 0) throw new GameError('NOT_FOUND', 'That player already left.');
  if (target === idx) throw new GameError('BAD_TARGET', "You can't remove yourself — leave instead.");
  const s = structuredClone(state);
  const [gone] = s.players.splice(target, 1);
  log(s, [{ p: gone.id, name: gone.name }, ' was asked to leave.'], 'lobby');
  return s;
}

/** Shuffle seats, shuffle the Chutzpah deck, and begin placing homesteads. */
export function startGame(state, userId, { rng, now }) {
  const idx = requireMember(state, userId);
  requireLobby(state);
  requireHost(state, idx);
  if (state.players.length < MIN_PLAYERS) {
    throw new GameError('NOT_ENOUGH_PLAYERS', `You need at least ${MIN_PLAYERS} players to start.`);
  }
  const s = structuredClone(state);
  s.players = shuffle(rng, s.players);
  const layout = layoutOf(s.settings.layout);
  s.bank = Object.fromEntries(RESOURCES.map((r) => [r, layout.bank]));
  s.devDeck = shuffle(
    rng,
    Object.entries(layout.devDeck).flatMap(([type, n]) => Array(n).fill(type)),
  );
  s.chaos = s.settings.chaos ? newChaosDeck(rng, s.settings) : null;
  // Night Landing: deal a fresh island nobody has seen — not even the host.
  if (s.settings.nightLanding) {
    s.board = generateBoard(randomMapNumber(rng), s.settings.layout);
    s.robber = s.board.desert;
  }
  // Oasis mode: there is no Jackal.
  if (s.settings.oasis) s.robber = null;
  s.status = 'setup';
  s.phase = 'setup_settlement';
  s.turn = {
    number: 0,
    current: 0,
    setupIndex: 0,
    setupVertex: null,
    rolled: false,
    devPlayed: false,
    freeRoads: 0,
    robberReturn: null,
  };
  s.roadLengths = s.players.map(() => 0);
  s.startedAt = now;
  startClock(s, { now });
  log(s, ['The settlers arrive! ', P(s, 0), ' chooses the first homestead.'], 'turn');
  return s;
}
