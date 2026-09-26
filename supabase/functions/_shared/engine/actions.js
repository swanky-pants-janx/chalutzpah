// Turn actions. `applyAction` is the single entry point for everything a
// player does once the game has started; it validates against the current
// state and returns a new state (the input is never mutated).
//
// State machine (status / phase):
//   setup    : setup_settlement → setup_road → (next seat, snake order) …
//   playing  : roll → [discard →] robber → main          (a 7 was rolled)
//              roll → main                                (any other roll)
//              roll|main → robber → back                  (Watchman card)
//              main → road_building → main                (Pathfinders card)
//              main → END_TURN → roll (next player)
//   finished : game_over

import {
  COSTS,
  DEV_CARD_TYPES,
  DISCARD_GRACE_MS,
  ROBBER_GRACE_MS,
  LARGEST_ARMY_MIN,
  LONGEST_ROAD_MIN,
  MAX_OPEN_TRADES,
  RECENT_ACTION_LIMIT,
  RESOURCES,
  TERRAIN_RESOURCE,
} from './constants.js';
import { GameError } from './errors.js';
import { compact, emptyHand, handSize, handToList, hasAll, isResource, parseBundle, transfer } from './hand.js';
import { DEV_CARD_LABELS, TERRAIN_LABELS } from './labels.js';
import { B, P, log, whisper } from './log.js';
import { pick, randomInt, rollDie } from './rng.js';
import {
  bankRate,
  canPlaceRoad,
  canPlaceSettlement,
  discardAmount,
  legalRoadEdges,
  legalSettlementVertices,
  longestRoadLength,
  playerIndexByUser,
  robberVictims,
  setupSeat,
  victoryPoints,
} from './rules.js';
import { EDGE_COUNT, HEX_COUNT, TOPOLOGY, VERTEX_COUNT } from './topology.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Apply one player action.
 * @param {object} state   full game state (not mutated)
 * @param {string} userId  authenticated user making the request
 * @param {object} action  { type, id?, ...params }
 * @param {object} ctx     { rng, now, idle: userIds considered away (for FORCE_SKIP) }
 * @returns {object} the next state
 * @throws {GameError} when the action is illegal
 */
export function applyAction(state, userId, action, ctx = {}) {
  const s = structuredClone(state);
  const actor = playerIndexByUser(s, userId);
  if (actor < 0) throw new GameError('NOT_A_PLAYER', 'You are not seated at this table.');
  if (!action || typeof action.type !== 'string' || !Object.hasOwn(HANDLERS, action.type)) {
    throw new GameError('BAD_ACTION', 'Unknown action.');
  }
  if (s.status !== 'setup' && s.status !== 'playing') {
    throw new GameError('NOT_PLAYING', 'The game is not in progress.');
  }
  if (action.id != null) {
    if (typeof action.id !== 'string' || action.id.length > 64) throw new GameError('BAD_ACTION', 'Invalid action id.');
    if (s.recentActions.includes(action.id)) throw new GameError('DUPLICATE', 'That action was already processed.');
  }

  const env = makeEnv(s, ctx);
  HANDLERS[action.type](s, actor, action, env);

  if (action.id != null) {
    s.recentActions.push(action.id);
    if (s.recentActions.length > RECENT_ACTION_LIMIT) s.recentActions.splice(0, s.recentActions.length - RECENT_ACTION_LIMIT);
  }
  checkVictory(s, env);
  resolveAbsent(s, leftPlayers(s), env);
  return s;
}

const NEEDS_THE_SERVER = new Error('This move depends on something only the server knows.');

/**
 * Try one of the actor's own actions against a best-knowledge state (see
 * predict.js) so the UI can show the result before the server confirms it.
 * Returns null whenever the outcome needs randomness (dice, steals, card
 * draws) or information the client doesn't have — those wait for the server.
 * The server always re-validates; this never decides anything.
 */
export function simulateAction(state, actorIdx, action) {
  if (!action || !Object.hasOwn(HANDLERS, action.type) || action.type === 'FORCE_SKIP') return null;
  const s = structuredClone(state);
  const env = {
    rng: () => {
      throw NEEDS_THE_SERVER;
    },
    now: Date.now(),
    idle: new Set(),
  };
  try {
    HANDLERS[action.type](s, actorIdx, action, env);
    checkVictory(s, env);
  } catch {
    return null;
  }
  return s;
}

export function makeEnv(s, ctx = {}) {
  const idle = new Set();
  for (const userId of ctx.idle ?? []) {
    const idx = playerIndexByUser(s, userId);
    if (idx >= 0) idle.add(idx);
  }
  return { rng: ctx.rng ?? Math.random, now: ctx.now ?? Date.now(), idle };
}

const HANDLERS = {
  BUILD_ROAD: buildRoad,
  BUILD_SETTLEMENT: buildSettlement,
  BUILD_CITY: buildCity,
  ROLL_DICE: rollDice,
  DISCARD: discard,
  MOVE_ROBBER: moveRobber,
  BUY_DEV_CARD: buyDevCard,
  PLAY_DEV_CARD: playDevCard,
  BANK_TRADE: bankTrade,
  OFFER_TRADE: offerTrade,
  CANCEL_TRADE: cancelTrade,
  ACCEPT_TRADE: acceptTrade,
  DECLINE_TRADE: declineTrade,
  END_TURN: endTurn,
  FORCE_SKIP: forceSkip,
  TIMEOUT: timeout,
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function requireCurrent(s, idx) {
  if (s.turn.current !== idx) throw new GameError('NOT_YOUR_TURN', "It's not your turn.");
}

const PHASE_HINTS = {
  setup_settlement: 'Place your starting homestead first.',
  setup_road: 'Place the trail next to your new homestead first.',
  roll: 'Roll the dice first.',
  discard: 'Waiting for players to discard.',
  robber: 'Move the Jackal first.',
  main: "You've already rolled this turn.",
  road_building: 'Place your free trails first.',
  game_over: 'The game is over.',
};

function requirePhase(s, ...phases) {
  if (!phases.includes(s.phase)) {
    throw new GameError('WRONG_PHASE', PHASE_HINTS[s.phase] ?? "You can't do that right now.");
  }
}

function requireIndex(value, count, what) {
  if (!Number.isInteger(value) || value < 0 || value >= count) {
    throw new GameError('BAD_TARGET', `That ${what} doesn't exist.`);
  }
  return value;
}

function pay(s, idx, cost) {
  const player = s.players[idx];
  if (!hasAll(player.resources, cost)) {
    throw new GameError('CANNOT_AFFORD', "You don't have the resources for that.");
  }
  transfer(player.resources, s.bank, cost);
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

function buildSettlement(s, actor, { vertex }, env) {
  requireCurrent(s, actor);
  const v = requireIndex(vertex, VERTEX_COUNT, 'corner');
  const player = s.players[actor];

  if (s.phase === 'setup_settlement') {
    if (!canPlaceSettlement(s, actor, v, { setup: true })) {
      throw new GameError('BAD_SPOT', 'Homesteads need an empty corner with no neighbour next door.');
    }
    placeBuilding(s, actor, v, 'settlement');
    s.turn.setupVertex = v;
    s.phase = 'setup_road';
    const isSecondRound = s.turn.setupIndex >= s.players.length;
    if (isSecondRound) {
      const gained = emptyHand();
      for (const hex of TOPOLOGY.vertices[v].hexes) {
        const resource = TERRAIN_RESOURCE[s.board.hexes[hex].terrain];
        if (resource && s.bank[resource] > 0) gained[resource] += 1;
      }
      transfer(s.bank, player.resources, gained);
      log(s, [P(s, actor), ' founded a Homestead and gathered ', B(gained)], 'build');
    } else {
      log(s, [P(s, actor), ' founded a Homestead.'], 'build');
    }
    return;
  }

  requirePhase(s, 'main');
  if (player.piecesLeft.settlement <= 0) throw new GameError('NO_PIECES', 'You have no Homesteads left to place.');
  if (!canPlaceSettlement(s, actor, v)) {
    throw new GameError('BAD_SPOT', 'Homesteads must sit on your trail with no neighbour next door.');
  }
  pay(s, actor, COSTS.settlement);
  placeBuilding(s, actor, v, 'settlement');
  log(s, [P(s, actor), ' founded a Homestead.'], 'build');
  updateLongestRoad(s);
}

function placeBuilding(s, idx, vertex, kind) {
  s.buildings[vertex] = { owner: idx, kind };
  s.players[idx].piecesLeft[kind] -= 1;
}

function buildRoad(s, actor, { edge }, env) {
  requireCurrent(s, actor);
  const e = requireIndex(edge, EDGE_COUNT, 'path');
  const player = s.players[actor];

  if (s.phase === 'setup_road') {
    if (!canPlaceRoad(s, actor, e, { fromVertex: s.turn.setupVertex })) {
      throw new GameError('BAD_SPOT', 'Your starting trail must touch the homestead you just founded.');
    }
    placeRoad(s, actor, e);
    log(s, [P(s, actor), ' blazed a Trail.'], 'build');
    advanceSetup(s, env);
    return;
  }

  requirePhase(s, 'main', 'road_building');
  if (player.piecesLeft.road <= 0) throw new GameError('NO_PIECES', 'You have no Trails left to place.');
  if (!canPlaceRoad(s, actor, e)) {
    throw new GameError('BAD_SPOT', 'Trails must connect to your own trails or buildings.');
  }

  if (s.phase === 'road_building') {
    placeRoad(s, actor, e);
    s.turn.freeRoads -= 1;
    log(s, [P(s, actor), ' blazed a free Trail.'], 'build');
    if (s.turn.freeRoads <= 0 || player.piecesLeft.road <= 0 || legalRoadEdges(s, actor).length === 0) {
      s.turn.freeRoads = 0;
      s.phase = 'main';
    }
  } else {
    pay(s, actor, COSTS.road);
    placeRoad(s, actor, e);
    log(s, [P(s, actor), ' blazed a Trail.'], 'build');
  }
  updateLongestRoad(s);
}

function placeRoad(s, idx, edge) {
  s.roads[edge] = idx;
  s.players[idx].piecesLeft.road -= 1;
}

function advanceSetup(s, env) {
  const n = s.players.length;
  s.turn.setupIndex += 1;
  s.turn.setupVertex = null;
  startClock(s, env);
  if (s.turn.setupIndex >= 2 * n) {
    s.status = 'playing';
    s.phase = 'roll';
    s.turn.current = 0;
    s.turn.number = 1;
    log(s, ['Every family has staked its claim. ', P(s, 0), ' rolls first.'], 'turn');
    return;
  }
  s.turn.current = setupSeat(n, s.turn.setupIndex);
  s.phase = 'setup_settlement';
}

function buildCity(s, actor, { vertex }) {
  requireCurrent(s, actor);
  requirePhase(s, 'main');
  const v = requireIndex(vertex, VERTEX_COUNT, 'corner');
  const player = s.players[actor];
  const building = s.buildings[v];
  if (!building || building.owner !== actor || building.kind !== 'settlement') {
    throw new GameError('BAD_SPOT', 'Only your own Homesteads can grow into a Kibbutz.');
  }
  if (player.piecesLeft.city <= 0) throw new GameError('NO_PIECES', 'You have no Kibbutzim left to place.');
  pay(s, actor, COSTS.city);
  s.buildings[v] = { owner: actor, kind: 'city' };
  player.piecesLeft.city -= 1;
  player.piecesLeft.settlement += 1;
  log(s, [P(s, actor), ' grew a Homestead into a Kibbutz.'], 'build');
}

// ---------------------------------------------------------------------------
// Dice, production, the Jackal
// ---------------------------------------------------------------------------

function rollDice(s, actor, _action, env) {
  requireCurrent(s, actor);
  requirePhase(s, 'roll');
  const dice = [rollDie(env.rng), rollDie(env.rng)];
  const total = dice[0] + dice[1];
  s.turn.rolled = true;
  log(s, [P(s, actor), ' rolled ', { dice }], 'roll');
  s.lastRoll = { player: actor, dice, total, seq: s.logSeq };

  if (total === 7) {
    const pending = {};
    s.players.forEach((player, i) => {
      const n = discardAmount(handSize(player.resources));
      if (n > 0) pending[i] = n;
    });
    s.pendingDiscards = pending;
    s.turn.robberReturn = 'main';
    s.turn.robberSource = 'seven';
    log(s, ['The Jackal prowls! Nothing is gathered.'], 'jackal');
    if (Object.keys(pending).length > 0) {
      s.phase = 'discard';
      extendClock(s, env, DISCARD_GRACE_MS);
      for (const i of Object.keys(pending)) {
        log(s, [P(s, Number(i)), ` must discard ${pending[i]} cards.`], 'discard');
      }
    } else {
      s.phase = 'robber';
    }
    return;
  }

  produce(s, total);
  s.phase = 'main';
}

/** Hand out resources for a roll, respecting the Jackal and a shrinking supply. */
export function produce(s, total) {
  const gains = s.players.map(() => emptyHand());
  let guarded = null;

  for (const hex of TOPOLOGY.hexes) {
    const tile = s.board.hexes[hex.id];
    const resource = TERRAIN_RESOURCE[tile.terrain];
    if (tile.number !== total || !resource) continue;
    if (hex.id === s.robber) {
      guarded = hex.id;
      continue;
    }
    for (const v of hex.vertices) {
      const building = s.buildings[v];
      if (building) gains[building.owner][resource] += building.kind === 'city' ? 2 : 1;
    }
  }

  for (const resource of RESOURCES) {
    const takers = gains.map((g, i) => [i, g[resource]]).filter(([, n]) => n > 0);
    const wanted = takers.reduce((sum, [, n]) => sum + n, 0);
    if (wanted === 0 || wanted <= s.bank[resource]) continue;
    if (takers.length === 1) {
      gains[takers[0][0]][resource] = s.bank[resource];
    } else {
      for (const [i] of takers) gains[i][resource] = 0;
    }
    log(s, ['The supply is running low on ', { res: resource }, '.'], 'info');
  }

  let anyone = false;
  gains.forEach((gain, i) => {
    if (handSize(gain) === 0) return;
    anyone = true;
    transfer(s.bank, s.players[i].resources, gain);
    log(s, [P(s, i), ' gathered ', B(gain)], 'gain');
  });

  if (guarded !== null) {
    const tile = s.board.hexes[guarded];
    log(s, [`The Jackal guards the ${TERRAIN_LABELS[tile.terrain]} (${tile.number}).`], 'jackal');
  }
  if (!anyone) log(s, ['Nobody gathered anything.'], 'info');
}

function discard(s, actor, { resources }, env) {
  if (s.phase !== 'discard') throw new GameError('WRONG_PHASE', 'Nobody needs to discard right now.');
  const need = s.pendingDiscards[actor];
  if (!need) throw new GameError('NO_DISCARD', "You don't need to discard.");
  const bundle = parseBundle(resources);
  if (handSize(bundle) !== need) throw new GameError('BAD_DISCARD', `Choose exactly ${need} cards to discard.`);
  const player = s.players[actor];
  if (!hasAll(player.resources, bundle)) throw new GameError('CANNOT_AFFORD', "You don't hold those cards.");
  transfer(player.resources, s.bank, bundle);
  delete s.pendingDiscards[actor];
  log(s, [P(s, actor), ' discarded ', B(bundle)], 'discard');
  if (Object.keys(s.pendingDiscards).length === 0) {
    s.phase = 'robber';
    if (env) extendClock(s, env, ROBBER_GRACE_MS);
  }
}

function moveRobber(s, actor, { hex, victim = null, resource = null }, env) {
  requireCurrent(s, actor);
  requirePhase(s, 'robber');
  const h = requireIndex(hex, HEX_COUNT, 'tile');
  // House rule: a Watchman names what it's after (a 7 still steals at random).
  const choosy = s.settings.watchmanChoice === true && s.turn.robberSource === 'watchman';
  if (choosy && resource != null && !isResource(resource)) throw new GameError('BAD_RESOURCE', 'Name a resource.');
  if (h === s.robber) throw new GameError('SAME_TILE', 'The Jackal must move to a different tile.');

  const victims = robberVictims(s, actor, h);
  if (victims.length > 0 && !victims.includes(victim)) {
    throw new GameError('PICK_VICTIM', 'Choose which neighbour the Jackal robs.');
  }
  if (victims.length === 0 && victim != null) {
    throw new GameError('BAD_VICTIM', 'Nobody there has anything to take.');
  }

  s.robber = h;
  const tile = s.board.hexes[h];
  const where = tile.number ? `${TERRAIN_LABELS[tile.terrain]} (${tile.number})` : TERRAIN_LABELS[tile.terrain];
  log(s, [P(s, actor), ` sent the Jackal to the ${where}.`], 'jackal');

  if (victims.length > 0) {
    const hand = s.players[victim].resources;
    const named = choosy ? resource : null;
    const found = named !== null && hand[named] > 0;
    let stolen = named;
    if (!found) {
      const cards = handToList(hand);
      stolen = cards[randomInt(env.rng, cards.length)];
    }
    hand[stolen] -= 1;
    s.players[actor].resources[stolen] += 1;
    log(s, [P(s, actor), ' snatched a card from ', P(s, victim), '.'], 'steal');
    if (named === null) whisper(s, actor, ['You snatched ', { res: stolen }, ' from ', P(s, victim), '.']);
    else if (found) whisper(s, actor, ['Your Watchman found ', { res: stolen }, ' at ', P(s, victim), "'s."]);
    else whisper(s, actor, [P(s, victim), ' had no ', { res: named }, ' — your Watchman grabbed ', { res: stolen }, ' instead.']);
    whisper(s, victim, [P(s, actor), ' snatched your ', { res: stolen }, '.']);
  }

  s.phase = s.turn.robberReturn ?? 'main';
  s.turn.robberReturn = null;
  s.turn.robberSource = null;
}

// ---------------------------------------------------------------------------
// Chutzpah (development) cards
// ---------------------------------------------------------------------------

function buyDevCard(s, actor) {
  requireCurrent(s, actor);
  requirePhase(s, 'main');
  if (s.devDeck.length === 0) throw new GameError('DECK_EMPTY', 'The Chutzpah deck is empty.');
  pay(s, actor, COSTS.devCard);
  const type = s.devDeck.pop();
  s.players[actor].devCards.push({ type, boughtTurn: s.turn.number });
  log(s, [P(s, actor), ' drew a Chutzpah card.'], 'card');
  whisper(s, actor, [`You drew ${DEV_CARD_LABELS[type]}.`]);
}

function playDevCard(s, actor, action) {
  requireCurrent(s, actor);
  const card = action.card;
  if (card === 'landmark') throw new GameError('BAD_CARD', 'Landmarks score on their own — keep them secret!');
  if (!DEV_CARD_TYPES.includes(card)) throw new GameError('BAD_CARD', 'Unknown card.');
  if (s.turn.devPlayed) throw new GameError('ONE_CARD', 'You can only play one Chutzpah card per turn.');
  if (card === 'watchman') requirePhase(s, 'roll', 'main');
  else requirePhase(s, 'main');

  const player = s.players[actor];
  const index = player.devCards.findIndex((c) => c.type === card && c.boughtTurn < s.turn.number);
  if (index < 0) {
    const fresh = player.devCards.some((c) => c.type === card);
    throw new GameError(
      'NO_CARD',
      fresh ? 'Cards drawn this turn can be played from your next turn.' : "You don't hold that card.",
    );
  }

  switch (card) {
    case 'watchman': {
      player.knightsPlayed += 1;
      s.turn.robberReturn = s.phase;
      s.turn.robberSource = 'watchman';
      s.phase = 'robber';
      log(s, [P(s, actor), ' called a Watchman.'], 'card');
      updateLargestArmy(s, actor);
      break;
    }
    case 'pathfinder': {
      const free = Math.min(2, player.piecesLeft.road);
      if (free === 0 || legalRoadEdges(s, actor).length === 0) {
        throw new GameError('NO_SPOT', 'There is nowhere to lay a trail.');
      }
      s.turn.freeRoads = free;
      s.phase = 'road_building';
      log(s, [P(s, actor), ' sent out the Pathfinders.'], 'card');
      break;
    }
    case 'harvest': {
      const picks = action.resources;
      if (!Array.isArray(picks) || picks.length !== 2 || !picks.every(isResource)) {
        throw new GameError('BAD_CARD', 'Pick two resources.');
      }
      const bundle = emptyHand();
      for (const r of picks) bundle[r] += 1;
      if (!hasAll(s.bank, bundle)) throw new GameError('SUPPLY_EMPTY', 'The supply has run out of that.');
      transfer(s.bank, player.resources, bundle);
      log(s, [P(s, actor), ' had a Bountiful Year: ', B(bundle)], 'card');
      break;
    }
    case 'chutzpah': {
      const resource = action.resource;
      if (!isResource(resource)) throw new GameError('BAD_CARD', 'Name a resource.');
      let total = 0;
      s.players.forEach((other, i) => {
        if (i === actor || other.resources[resource] === 0) return;
        const n = other.resources[resource];
        other.resources[resource] = 0;
        player.resources[resource] += n;
        total += n;
        log(s, [P(s, i), ' handed over ', B({ [resource]: n })], 'card');
      });
      log(s, [P(s, actor), ' showed real Chutzpah and demanded all ', { res: resource }, ` — collecting ${total}.`], 'card');
      break;
    }
  }

  player.devCards.splice(index, 1);
  s.turn.devPlayed = true;
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

function bankTrade(s, actor, { give, get }) {
  requireCurrent(s, actor);
  requirePhase(s, 'main');
  if (!isResource(give) || !isResource(get)) throw new GameError('BAD_TRADE', 'Pick what to give and what to get.');
  if (give === get) throw new GameError('BAD_TRADE', 'Pick two different resources.');
  const rate = bankRate(s, actor, give);
  const player = s.players[actor];
  if (player.resources[give] < rate) throw new GameError('CANNOT_AFFORD', `You need ${rate} of that to trade.`);
  if (s.bank[get] < 1) throw new GameError('SUPPLY_EMPTY', 'The supply has run out of that.');
  player.resources[give] -= rate;
  s.bank[give] += rate;
  player.resources[get] += 1;
  s.bank[get] -= 1;
  log(s, [P(s, actor), ' traded ', B({ [give]: rate }), ' at the market for ', B({ [get]: 1 })], 'trade');
}

function offerTrade(s, actor, action) {
  requireCurrent(s, actor);
  requirePhase(s, 'main');
  const give = parseBundle(action.give, { max: 19 });
  const want = parseBundle(action.want, { max: 19 });
  if (handSize(give) === 0 || handSize(want) === 0) {
    throw new GameError('BAD_TRADE', 'An offer needs something to give and something to get.');
  }
  if (RESOURCES.some((r) => give[r] > 0 && want[r] > 0)) {
    throw new GameError('BAD_TRADE', "You can't give and ask for the same resource.");
  }
  if (!hasAll(s.players[actor].resources, give)) throw new GameError('CANNOT_AFFORD', "You don't hold what you're offering.");
  if (s.trades.filter((t) => t.from === actor).length >= MAX_OPEN_TRADES) {
    throw new GameError('TOO_MANY_TRADES', `You can have at most ${MAX_OPEN_TRADES} open offers.`);
  }
  const trade = { id: s.nextTradeId, from: actor, give: compact(give), want: compact(want), declined: [] };
  s.nextTradeId += 1;
  s.trades.push(trade);
  log(s, [P(s, actor), ' offered ', B(give), ' for ', B(want)], 'trade');
}

function findTrade(s, tradeId) {
  const trade = s.trades.find((t) => t.id === tradeId);
  if (!trade) throw new GameError('TRADE_GONE', 'That offer is no longer on the table.');
  return trade;
}

function cancelTrade(s, actor, { tradeId }) {
  const trade = findTrade(s, tradeId);
  if (trade.from !== actor) throw new GameError('NOT_YOURS', 'Only the player who made an offer can withdraw it.');
  s.trades = s.trades.filter((t) => t.id !== trade.id);
  log(s, [P(s, actor), ' withdrew an offer.'], 'trade');
}

function acceptTrade(s, actor, { tradeId }) {
  const trade = findTrade(s, tradeId);
  if (trade.from === actor) throw new GameError('NOT_YOURS', "You can't accept your own offer.");
  if (s.phase !== 'main' || s.turn.current !== trade.from) {
    throw new GameError('WRONG_PHASE', 'Trades can only be completed during the offering player\'s turn.');
  }
  const giver = s.players[trade.from];
  const taker = s.players[actor];
  if (!hasAll(taker.resources, trade.want)) throw new GameError('CANNOT_AFFORD', "You don't have what they asked for.");
  if (!hasAll(giver.resources, trade.give)) throw new GameError('STALE_TRADE', 'They no longer have what they offered.');
  transfer(giver.resources, taker.resources, trade.give);
  transfer(taker.resources, giver.resources, trade.want);
  s.trades = s.trades.filter((t) => t.id !== trade.id);
  log(s, [P(s, trade.from), ' traded ', B(trade.give), ' to ', P(s, actor), ' for ', B(trade.want)], 'trade');
}

function declineTrade(s, actor, { tradeId }) {
  const trade = findTrade(s, tradeId);
  if (trade.from === actor) throw new GameError('NOT_YOURS', 'Withdraw your own offer instead.');
  if (!trade.declined.includes(actor)) trade.declined.push(actor);
  const others = s.players.map((p, i) => i).filter((i) => i !== trade.from && !s.players[i].left);
  if (others.every((i) => trade.declined.includes(i))) {
    s.trades = s.trades.filter((t) => t.id !== trade.id);
    log(s, ['Nobody took ', P(s, trade.from), "'s offer."], 'trade');
  }
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function endTurn(s, actor, _action, env) {
  requireCurrent(s, actor);
  requirePhase(s, 'main');
  passTurn(s, env);
}

function passTurn(s, env) {
  s.trades = [];
  s.turn = {
    ...s.turn,
    current: (s.turn.current + 1) % s.players.length,
    number: s.turn.number + 1,
    rolled: false,
    devPlayed: false,
    freeRoads: 0,
    robberReturn: null,
  };
  s.phase = 'roll';
  startClock(s, env);
  log(s, [P(s, s.turn.current), "'s turn."], 'turn');
  checkVictory(s, env);
}

// ---------------------------------------------------------------------------
// Turn timer
// ---------------------------------------------------------------------------

/** Start the clock for a new turn (or setup placement) when the table uses a timer. */
export function startClock(s, env) {
  const seconds = s.settings?.turnTimer ?? 0;
  s.turn.deadline = seconds > 0 ? env.now + seconds * 1000 : null;
}

function extendClock(s, env, minMs) {
  if (s.turn.deadline != null) s.turn.deadline = Math.max(s.turn.deadline, env.now + minMs);
}

const turnMark = (s) => `${s.status}:${s.status === 'setup' ? s.turn.setupIndex : s.turn.number}`;

/**
 * Anyone may call time once the server's clock passes the deadline. The rest
 * of the turn is played out minimally — roll, discard, move the Jackal — and
 * the turn passes. Nothing is ever built or traded on a player's behalf.
 */
function timeout(s, actor, _action, env) {
  if (s.turn?.deadline == null) throw new GameError('NO_TIMER', 'This table has no turn timer.');
  if (env.now < s.turn.deadline) throw new GameError('NOT_YET', 'There is still time on the clock.');
  const who = s.turn.current;
  const mark = turnMark(s);
  log(s, ["Time's up for ", P(s, who), '!'], 'away');
  for (let guard = 0; guard < 40; guard++) {
    if (s.status !== 'setup' && s.status !== 'playing') return;
    if (s.phase === 'discard') {
      for (const i of Object.keys(s.pendingDiscards).map(Number)) autoDiscard(s, i, env);
      continue;
    }
    if (turnMark(s) !== mark) return;
    switch (s.phase) {
      case 'setup_settlement':
        buildSettlement(s, who, { vertex: pick(env.rng, legalSettlementVertices(s, who, { setup: true })) }, env);
        break;
      case 'setup_road':
        buildRoad(s, who, { edge: pick(env.rng, legalRoadEdges(s, who, { fromVertex: s.turn.setupVertex })) }, env);
        break;
      case 'roll':
        rollDice(s, who, {}, env);
        break;
      case 'robber':
        autoMoveRobber(s, who, env);
        break;
      case 'main':
      case 'road_building':
        passTurn(s, env);
        break;
      default:
        return;
    }
  }
}

/** Someone may claim victory only on their own turn. */
export function checkVictory(s, env) {
  if (s.status !== 'playing') return;
  const idx = s.turn.current;
  const vp = victoryPoints(s, idx, { hidden: true });
  if (vp < s.settings.vpTarget) return;
  s.status = 'finished';
  s.phase = 'game_over';
  s.winner = idx;
  s.trades = [];
  s.finishedAt = env.now;
  log(s, [P(s, idx), ` reached ${vp} points and wins the land!`], 'victory');
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

/**
 * Recompute trail lengths and move the Trailblazer title if needed:
 * the holder keeps it on a tie; a clear new leader takes it; a tie among
 * challengers (after the holder was cut) leaves it unclaimed.
 */
export function updateLongestRoad(s) {
  const lengths = s.players.map((_, i) => longestRoadLength(s, i));
  s.roadLengths = lengths;
  const holder = s.achievements.longestRoad?.player ?? null;
  const max = Math.max(...lengths);

  let next;
  if (max < LONGEST_ROAD_MIN) next = null;
  else if (holder !== null && lengths[holder] === max) next = holder;
  else {
    const leaders = lengths.flatMap((length, i) => (length === max ? [i] : []));
    next = leaders.length === 1 ? leaders[0] : null;
  }

  if (next !== holder) {
    if (next === null) log(s, ['The Trailblazer title is up for grabs again.'], 'achievement');
    else log(s, [P(s, next), ` is the Trailblazer with a ${lengths[next]}-segment trail!`], 'achievement');
  }
  s.achievements.longestRoad = next === null ? null : { player: next, size: lengths[next] };
}

function updateLargestArmy(s, idx) {
  const count = s.players[idx].knightsPlayed;
  if (count < LARGEST_ARMY_MIN) return;
  const holder = s.achievements.largestArmy;
  if (holder && holder.player === idx) {
    holder.size = count;
    return;
  }
  if (!holder || count > s.players[holder.player].knightsPlayed) {
    s.achievements.largestArmy = { player: idx, size: count };
    log(s, [P(s, idx), ` leads the Night Watch with ${count} Watchmen!`], 'achievement');
  }
}

// ---------------------------------------------------------------------------
// Absent players
// ---------------------------------------------------------------------------

function leftPlayers(s) {
  const set = new Set();
  s.players.forEach((p, i) => {
    if (p.left) set.add(i);
  });
  return set;
}

/** Another player asks to move the game past someone who has gone quiet. */
function forceSkip(s, actor, _action, env) {
  const absent = leftPlayers(s);
  for (const i of env.idle) if (i !== actor) absent.add(i);
  const before = s.logSeq;
  resolveAbsent(s, absent, env);
  if (s.logSeq === before) throw new GameError('NOTHING_TO_SKIP', 'Nobody away is holding up the game.');
}

/**
 * Play the minimum on behalf of absent players until someone present must act:
 * random starting placements, rolling, random discards, a random Jackal move,
 * and ending their turn. Absent players never build or trade.
 */
export function resolveAbsent(s, absent, env) {
  if (absent.size === 0) return;
  const guardLimit = 16 * s.players.length;
  for (let guard = 0; guard < guardLimit; guard++) {
    if (s.status !== 'setup' && s.status !== 'playing') return;

    if (s.phase === 'discard') {
      const waiting = Object.keys(s.pendingDiscards).map(Number).filter((i) => absent.has(i));
      if (waiting.length === 0) return;
      for (const i of waiting) autoDiscard(s, i, env);
      continue;
    }

    const current = s.turn.current;
    if (!absent.has(current)) return;

    switch (s.phase) {
      case 'setup_settlement': {
        log(s, [P(s, current), ' is away — a homestead was placed for them.'], 'away');
        buildSettlement(s, current, { vertex: pick(env.rng, legalSettlementVertices(s, current, { setup: true })) }, env);
        break;
      }
      case 'setup_road': {
        const edges = legalRoadEdges(s, current, { fromVertex: s.turn.setupVertex });
        buildRoad(s, current, { edge: pick(env.rng, edges) }, env);
        break;
      }
      case 'roll':
        log(s, [P(s, current), ' is away — rolling for them.'], 'away');
        rollDice(s, current, {}, env);
        break;
      case 'robber':
        autoMoveRobber(s, current, env);
        break;
      case 'main':
      case 'road_building':
        log(s, [P(s, current), ' is away — their turn was skipped.'], 'away');
        passTurn(s, env);
        break;
      default:
        return;
    }
  }
}

function autoDiscard(s, idx, env) {
  const need = s.pendingDiscards[idx];
  const cards = handToList(s.players[idx].resources);
  const bundle = emptyHand();
  for (let k = 0; k < need; k++) {
    const j = randomInt(env.rng, cards.length);
    bundle[cards[j]] += 1;
    cards.splice(j, 1);
  }
  discard(s, idx, { resources: bundle }, env);
}

function autoMoveRobber(s, idx, env) {
  const options = TOPOLOGY.hexes.map((h) => h.id).filter((h) => h !== s.robber);
  const polite = options.filter((h) => !TOPOLOGY.hexes[h].vertices.some((v) => s.buildings[v]?.owner === idx));
  const hex = pick(env.rng, polite.length ? polite : options);
  const victims = robberVictims(s, idx, hex);
  moveRobber(s, idx, { hex, victim: victims.length ? pick(env.rng, victims) : null }, env);
}

