// Pure UI logic: given the merged view (public state + my hand) and the build
// mode I picked, work out what I may do right now and what to highlight.
// It uses the same rule queries as the server, so the UI never offers a move
// the server would reject (the server re-checks everything anyway).

import {
  RESOURCES,
  bankRate,
  costOf,
  hasAll,
  legalCityVertices,
  legalRoadEdges,
  legalSettlementVertices,
  playableDevCards,
  topologyFor,
} from '$engine';

const NONE = Object.freeze({ vertices: [], edges: [], hexes: [] });

export function getControls(view, mode = null) {
  if (!view || view.me < 0) return null;
  const me = view.me;
  const player = view.players[me];
  const hand = player.resources ?? {};
  const inGame = view.status === 'setup' || view.status === 'playing';
  const myTurn = inGame && view.turn?.current === me;
  const phase = view.phase;
  const main = myTurn && phase === 'main';

  const roadSpots = main ? legalRoadEdges(view, me) : [];
  const settlementSpots = main ? legalSettlementVertices(view, me) : [];
  const citySpots = main ? legalCityVertices(view, me) : [];

  const costs = {
    road: costOf(view, 'road'),
    settlement: costOf(view, 'settlement'),
    city: costOf(view, 'city'),
    devCard: costOf(view, 'devCard'),
  };
  const build = {
    road: option(main, hand, costs.road, player.piecesLeft.road, roadSpots.length, 'road'),
    settlement: option(main, hand, costs.settlement, player.piecesLeft.settlement, settlementSpots.length, 'settlement'),
    city: option(main, hand, costs.city, player.piecesLeft.city, citySpots.length, 'city'),
    devCard: option(main, hand, costs.devCard, view.devDeckCount, 1, 'devCard'),
  };

  let activeMode = null;
  let targets = NONE;
  if (myTurn) {
    if (phase === 'setup_settlement') {
      activeMode = 'settlement';
      targets = { ...NONE, vertices: legalSettlementVertices(view, me, { setup: true }) };
    } else if (phase === 'setup_road') {
      activeMode = 'road';
      targets = { ...NONE, edges: legalRoadEdges(view, me, { fromVertex: view.turn.setupVertex }) };
    } else if (phase === 'road_building') {
      activeMode = 'road';
      targets = { ...NONE, edges: legalRoadEdges(view, me) };
    } else if (phase === 'robber') {
      activeMode = 'robber';
      targets = { ...NONE, hexes: topologyFor(view.board.layout).hexes.map((h) => h.id).filter((h) => h !== view.robber) };
    } else if (main && mode && build[mode]?.can) {
      activeMode = mode;
      if (mode === 'road') targets = { ...NONE, edges: roadSpots };
      if (mode === 'settlement') targets = { ...NONE, vertices: settlementSpots };
      if (mode === 'city') targets = { ...NONE, vertices: citySpots };
    }
  }

  const playable = new Set(playableDevCards(view, me));
  if (player.piecesLeft.road === 0 || roadSpots.length === 0) playable.delete('pathfinder');

  return {
    me,
    player,
    myTurn,
    phase,
    inGame,
    build,
    activeMode,
    targets,
    playable,
    canRoll: myTurn && phase === 'roll',
    canEndTurn: main,
    canTrade: main,
    costs,
    mustDiscard: view.pendingDiscards?.[me] ?? 0,
    mustPickOasis: view.pendingOasis?.[me] ?? 0,
    rates: Object.fromEntries(RESOURCES.map((r) => [r, bankRate(view, me, r)])),
  };
}

function option(allowed, hand, cost, piecesLeft, spots, kind) {
  const affordable = hasAll(hand, cost);
  let reason = null;
  if (!allowed) reason = 'Not now';
  else if (!affordable) reason = 'Not enough resources';
  else if (piecesLeft <= 0) reason = kind === 'devCard' ? 'Deck is empty' : 'No pieces left';
  else if (spots === 0) reason = 'Nowhere to build';
  return { can: reason === null, affordable, reason };
}

/** The headline + hint shown in the turn panel. */
export function describeTurn(view, controls) {
  if (!view) return { title: '', hint: '' };
  const current = view.players[view.turn?.current];
  const name = current?.name ?? 'Someone';

  if (view.status === 'finished') {
    return { title: `${view.players[view.winner]?.name} wins!`, hint: 'The land is settled. What a game.' };
  }

  const waitingFor = Object.keys(view.pendingDiscards ?? {}).map((i) => view.players[i]?.name);
  const atOasis = Object.keys(view.pendingOasis ?? {}).map((i) => view.players[i]?.name);
  if (view.phase === 'oasis') {
    return controls?.mustPickOasis
      ? { title: 'Oasis Day!', hint: `Pick ${controls.mustPickOasis} resource${controls.mustPickOasis === 1 ? '' : 's'} from the supply.` }
      : { title: 'Oasis Day!', hint: `Waiting for ${atOasis.join(', ')} to pick at the Oasis…` };
  }

  if (controls?.myTurn) {
    const secondRound = view.turn.setupIndex >= view.players.length;
    switch (view.phase) {
      case 'setup_settlement':
        return {
          title: 'Found a homestead',
          hint: secondRound
            ? 'Pick a corner for your second homestead — it gathers one of each neighbouring resource right away.'
            : 'Pick any open corner. Homesteads need a free corner on every side.',
        };
      case 'setup_road':
        return { title: 'Blaze a trail', hint: 'Lay a trail touching the homestead you just founded.' };
      case 'roll':
        return {
          title: 'Your turn — roll!',
          hint: controls.playable.has('watchman') ? 'You may call a Watchman before rolling.' : view.settings?.oasis ? 'Press Roll or hit R — a 7 means Oasis Day!' : 'Press Roll or hit R.',
        };
      case 'discard':
        return controls.mustDiscard
          ? { title: 'The Jackal prowls!', hint: `Discard ${controls.mustDiscard} cards.` }
          : { title: 'The Jackal prowls!', hint: `Waiting for ${waitingFor.join(', ')} to discard…` };
      case 'robber':
        return { title: 'Move the Jackal', hint: 'Click a tile. It stops producing, and you snatch a card from a neighbour.' };
      case 'road_building':
        return { title: 'Pathfinders', hint: `Place ${view.turn.freeRoads} free trail${view.turn.freeRoads === 1 ? '' : 's'}.` };
      case 'main':
        return { title: 'Build, trade, dare', hint: 'Pick something to build, trade, or end your turn (E).' };
    }
  }

  if (view.phase === 'discard') {
    return controls?.mustDiscard
      ? { title: 'The Jackal prowls!', hint: `Discard ${controls.mustDiscard} cards.` }
      : { title: 'The Jackal prowls!', hint: `Waiting for ${waitingFor.join(', ')} to discard…` };
  }

  const doing = {
    setup_settlement: 'is choosing a homestead…',
    setup_road: 'is blazing a trail…',
    roll: 'is about to roll…',
    robber: 'is moving the Jackal…',
    road_building: 'is laying free trails…',
    main: 'is building and trading…',
  };
  return { title: `${name}'s turn`, hint: `${name} ${doing[view.phase] ?? 'is thinking…'}` };
}
