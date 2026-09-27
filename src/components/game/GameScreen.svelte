<script>
  import { untrack } from 'svelte';
  import { robberVictims } from '$engine';
  import Board from '../board/Board.svelte';
  import Die from '../ui/Die.svelte';
  import Icon from '../ui/Icon.svelte';
  import Logo from '../ui/Logo.svelte';
  import Menu from '../ui/Menu.svelte';
  import BuildCard from './BuildCard.svelte';
  import DiscardDialog from './DiscardDialog.svelte';
  import EventCard from './EventCard.svelte';
  import OasisDialog from './OasisDialog.svelte';
  import EventLog from './EventLog.svelte';
  import GameOverDialog from './GameOverDialog.svelte';
  import HandBar from './HandBar.svelte';
  import OffersCard from './OffersCard.svelte';
  import PickResourcesDialog from './PickResourcesDialog.svelte';
  import PlayerStrip from './PlayerStrip.svelte';
  import ProductionFlights from './ProductionFlights.svelte';
  import RulesDialog from './RulesDialog.svelte';
  import TradeDialog from './TradeDialog.svelte';
  import TurnCard from './TurnCard.svelte';
  import VictimDialog from './VictimDialog.svelte';
  import { HOUSE_RULES } from '../../game/cards.js';
  import { getControls } from '../../game/controls.js';
  import { callGame } from '../../lib/api.js';
  import { play, sound, toggleMute } from '../../lib/sound.svelte.js';
  import { table } from '../../lib/table.svelte.js';
  import { colorOf } from '../../lib/theme.js';
  import { toast, toastError } from '../../lib/toasts.svelte.js';

  const AWAY_AFTER_MS = 90_000;

  const view = $derived(table.view);
  let mode = $state(null);
  const controls = $derived(getControls(view, mode));

  let busy = $state(false);
  let dialog = $state(null); // 'trade' | 'harvest' | 'chutzpah' | 'rules' | { victims, hex }
  let gameOverOpen = $state(true);

  /**
   * Send an action; the server validates it and Realtime brings everyone the
   * result. Predictable moves show instantly and don't lock the controls;
   * ones only the server can resolve (dice, card draws…) lock until it answers.
   */
  async function run(action) {
    if (busy) return false;
    const { predicted, done } = table.act(action);
    if (!predicted) busy = true;
    try {
      await done;
      return true;
    } catch (err) {
      if (err?.code !== 'CANCELLED') {
        play('error');
        toastError(err);
      }
      return false;
    } finally {
      if (!predicted) busy = false;
    }
  }

  // Dice start tumbling the moment you click; they land when the server rolls.
  let rollPending = $state(false);
  async function roll() {
    if (busy || rollPending) return;
    rollPending = true;
    play('dice');
    await run({ type: 'ROLL_DICE' });
    rollPending = false;
  }

  // Drop any half-chosen build mode when the turn or phase moves on.
  const phaseKey = $derived(`${view.phase}:${view.turn?.current}`);
  $effect(() => {
    phaseKey;
    mode = null;
  });

  // ------------------------------------------------------------ board clicks

  async function onvertex(vertex) {
    const kind = controls.activeMode;
    if (kind === 'settlement') await run({ type: 'BUILD_SETTLEMENT', vertex });
    else if (kind === 'city') await run({ type: 'BUILD_CITY', vertex });
  }

  async function onedge(edge) {
    await run({ type: 'BUILD_ROAD', edge });
  }

  // House rule "Choosy Watchman": a Watchman names what it's after.
  const choosyWatchman = $derived(view.settings?.watchmanChoice === true && view.turn?.robberSource === 'watchman');

  async function onhex(hex) {
    const victims = robberVictims(view, view.me, hex);
    if (victims.length > 1) dialog = { victims, hex };
    else if (victims.length === 1) chooseVictim(hex, victims[0]);
    else await run({ type: 'MOVE_ROBBER', hex, victim: null });
  }

  function chooseVictim(hex, victim) {
    if (choosyWatchman) dialog = { watchmanAsk: true, hex, victim };
    else run({ type: 'MOVE_ROBBER', hex, victim });
  }

  // Oasis mode: a Watchman visits any player you choose (there is no Jackal).
  function playOasisWatchman() {
    const targets = view.players.map((_, i) => i).filter((i) => i !== view.me && view.players[i].resourceCount > 0);
    if (targets.length === 0) run({ type: 'PLAY_DEV_CARD', card: 'watchman', victim: null });
    else dialog = { watchmanVictims: targets };
  }

  function pickWatchmanVictim(victim) {
    if (view.settings?.watchmanChoice) dialog = { watchmanAsk: true, victim, viaCard: true };
    else {
      dialog = null;
      run({ type: 'PLAY_DEV_CARD', card: 'watchman', victim });
    }
  }

  function pickVictim(victim) {
    const { hex } = dialog;
    dialog = null;
    chooseVictim(hex, victim);
  }

  function nameResource([resource]) {
    const { hex, victim, viaCard } = dialog;
    dialog = null;
    if (viaCard) run({ type: 'PLAY_DEV_CARD', card: 'watchman', victim, resource });
    else run({ type: 'MOVE_ROBBER', hex, victim, resource });
  }

  // ------------------------------------------------------------ cards & trades

  function playCard(card) {
    if (card === 'harvest' || card === 'chutzpah') dialog = card;
    else if (card === 'watchman' && view.settings?.oasis) playOasisWatchman();
    else run({ type: 'PLAY_DEV_CARD', card });
  }

  async function pickResources(resources) {
    const card = dialog;
    dialog = null;
    if (card === 'harvest') await run({ type: 'PLAY_DEV_CARD', card, resources });
    else await run({ type: 'PLAY_DEV_CARD', card, resource: resources[0] });
  }

  function offer(terms) {
    dialog = null;
    run({ type: 'OFFER_TRADE', ...terms });
  }

  // ------------------------------------------------------------ absent players

  let offlineSince = $state({});
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 5000);
    return () => clearInterval(timer);
  });
  $effect(() => {
    if (table.connection !== 'live') return;
    const online = table.online;
    const players = view.players;
    untrack(() => {
      const next = {};
      for (const p of players) if (!online.has(p.id)) next[p.id] = offlineSince[p.id] ?? Date.now();
      offlineSince = next;
    });
  });
  const skippable = $derived.by(() => {
    if (!controls?.inGame || view.status === 'finished') return [];
    const blocking =
      view.phase === 'discard'
        ? Object.keys(view.pendingDiscards).map(Number)
        : view.phase === 'oasis'
          ? Object.keys(view.pendingOasis ?? {}).map(Number)
          : [view.turn.current];
    return blocking
      .filter((i) => i !== view.me)
      .map((i) => view.players[i])
      .filter((p) => offlineSince[p.id] && now - offlineSince[p.id] > AWAY_AFTER_MS);
  });

  // Turn timer: whoever's turn it is calls time at zero; everyone else backs
  // them up a few seconds later. The server checks its own clock.
  let lastTimeout = { deadline: null, at: 0 };
  $effect(() => {
    const timer = setInterval(() => {
      const deadline = view?.turn?.deadline;
      if (!deadline || !controls?.inGame) return;
      const blocking = controls.myTurn || controls.mustDiscard > 0 || controls.mustPickOasis > 0;
      if (table.serverNow() - deadline < (blocking ? 300 : 3000)) return;
      if (lastTimeout.deadline === deadline && Date.now() - lastTimeout.at < 2500) return;
      lastTimeout = { deadline, at: Date.now() };
      table.act({ type: 'TIMEOUT' }).done.catch(() => {});
    }, 500);
    return () => clearInterval(timer);
  });

  async function skipAway() {
    if (await run({ type: 'FORCE_SKIP' })) toast('Skipped ahead past the absent player.');
  }

  // ------------------------------------------------------------ feedback: sounds, roll banner, tab title

  const SOUND_FOR = {
    victory: 'victory',
    roll: 'dice',
    jackal: 'jackal',
    steal: 'jackal',
    build: 'build',
    trade: 'trade',
    card: 'card',
    achievement: 'victory',
    discard: 'card',
    event: 'card',
    oasis: 'turn',
    sunrise: 'victory',
  };
  const SOUND_PRIORITY = ['victory', 'sunrise', 'roll', 'achievement', 'event', 'oasis', 'jackal', 'steal', 'build', 'trade', 'card', 'discard'];

  let heardSeq = null;
  $effect(() => {
    const entries = [...view.log, ...(table.priv?.log ?? [])];
    const latest = entries.reduce((m, e) => Math.max(m, e.seq), 0);
    if (heardSeq !== null && latest < heardSeq) heardSeq = latest; // a predicted move was rolled back
    if (heardSeq === null || latest <= heardSeq) {
      heardSeq = Math.max(heardSeq ?? 0, latest);
      return;
    }
    const kinds = new Set(entries.filter((e) => e.seq > heardSeq).map((e) => e.kind));
    heardSeq = latest;
    const kind = SOUND_PRIORITY.find((k) => kinds.has(k));
    if (kind) play(SOUND_FOR[kind]);
  });

  let wasMyTurn = false;
  $effect(() => {
    const mine = !!controls?.myTurn;
    if (mine && !wasMyTurn) setTimeout(() => play('turn'), 450);
    wasMyTurn = mine;
  });

  $effect(() => {
    const prefix = view.status === 'finished' ? '🏁 ' : controls?.myTurn || controls?.mustDiscard || controls?.mustPickOasis ? '● Your move — ' : '';
    document.title = `${prefix}Chalutzpah · ${view.code}`;
  });

  // Night Landing: announce sunrise when the island is revealed.
  let sunriseShow = $state(false);
  let wasDark = untrack(() => view.board.seed == null);
  $effect(() => {
    const dark = view.board.seed == null;
    if (wasDark && !dark) {
      sunriseShow = true;
      play('victory');
      setTimeout(() => (sunriseShow = false), 2600);
    }
    wasDark = dark;
  });

  let rollShow = $state(null);
  let rollSeq = null;
  let rollTimer = null;
  $effect(() => {
    const roll = view.lastRoll;
    if (rollSeq === null) {
      rollSeq = roll?.seq ?? -1;
      return;
    }
    if (!roll || roll.seq === rollSeq) return;
    rollSeq = roll.seq;
    rollShow = { ...roll, name: view.players[roll.player]?.name };
    clearTimeout(rollTimer);
    rollTimer = setTimeout(() => (rollShow = null), 1900);
  });
  $effect(() => () => clearTimeout(rollTimer));

  // ------------------------------------------------------------ keyboard

  function onkeydown(event) {
    if (event.target.closest?.('input, textarea, [role="dialog"]') || event.metaKey || event.ctrlKey) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') mode = null;
    else if (key === 'r' && controls?.canRoll) roll();
    else if (key === 'e' && controls?.canEndTurn) run({ type: 'END_TURN' });
  }

  // Rematch: same settings, same names and colours, fresh island.
  let rematching = $state(false);
  async function rematch() {
    rematching = true;
    try {
      const res = await callGame('rematch', { gameId: table.gameId });
      await table.enter(res);
    } catch (err) {
      toastError(err);
      rematching = false;
    }
  }

  let knownRematch = untrack(() => view.rematch?.gameId ?? null);
  $effect(() => {
    const pointer = view.rematch;
    if (!pointer || pointer.gameId === knownRematch) return;
    knownRematch = pointer.gameId;
    const by = view.players.find((p) => p.id === pointer.by);
    if (by && by.id !== view.players[view.me]?.id) toast(`${by.name} started a rematch — join from the results.`, { kind: 'success' });
    gameOverOpen = true;
  });

  async function leave() {
    try {
      if (view.status === 'finished') table.close();
      else await table.leave();
    } catch (err) {
      toastError(err);
    }
  }

  const menuItems = $derived([
    { label: 'How to play', icon: 'book', onclick: () => (dialog = 'rules') },
    { label: sound.muted ? 'Sound: off' : 'Sound: on', icon: sound.muted ? 'mute' : 'sound', onclick: toggleMute },
    ...(view.status === 'finished'
      ? [
          { label: 'Final scores', icon: 'trophy', onclick: () => (gameOverOpen = true) },
          { label: view.rematch ? 'Join the rematch' : 'Rematch', icon: 'dice', onclick: rematch },
        ]
      : []),
    { label: view.status === 'finished' ? 'Back to home' : 'Leave game', icon: 'exit', onclick: leave, danger: true },
  ]);

  const myColor = $derived(colorOf(view.players[view.me]));
  const houseRules = $derived(HOUSE_RULES.filter((rule) => view.settings?.[rule.key]));
  const modeHint = $derived(
    {
      road: controls?.phase === 'road_building' ? 'Place a free trail' : 'Pick a glowing path for your trail',
      settlement: 'Pick a glowing corner for your homestead',
      city: 'Pick one of your homesteads to grow into a Kibbutz',
      robber: 'Pick a tile for the Jackal',
    }[controls?.activeMode] ?? null,
  );
</script>

<svelte:window {onkeydown} />

<div class="game">
  <header class="top">
    <Menu items={menuItems} />
    <div class="brand"><Logo size="sm" /></div>
    <PlayerStrip {view} online={table.online} />
    <div class="meta">
      <span class="code" title="Game code">{view.code}</span>
      <span class="conn conn--{table.connection}" title="Realtime: {table.connection}"></span>
    </div>
  </header>

  <h1 class="sr-only">Chalutzpah game {view.code}</h1>

  <div class="middle">
    <section class="board-wrap" aria-label="Board">
      <Board
        {view}
        targets={controls?.targets}
        targetColor={myColor}
        {onvertex}
        {onedge}
        {onhex}
      />
      <EventCard chaos={view.chaos} />
      {#if modeHint}
        <div class="mode-hint">
          <span>{modeHint}</span>
          {#if mode && controls?.phase === 'main'}<button onclick={() => (mode = null)}>Cancel · Esc</button>{/if}
        </div>
      {/if}
      {#if sunriseShow}
        <div class="roll-banner sunrise">
          <span class="sun" aria-hidden="true"></span>
          <span class="roll-text"><small>Night Landing</small>Sunrise!</span>
        </div>
      {/if}
      {#if rollShow}
        <div class="roll-banner" class:seven={rollShow.total === 7 && !view.settings?.oasis} class:oasis-day={rollShow.total === 7 && view.settings?.oasis}>
          <Die value={rollShow.dice[0]} rolling size={64} />
          <Die value={rollShow.dice[1]} rolling size={64} tone="red" />
          <span class="roll-text">
            <small>{rollShow.name} rolled</small>{rollShow.total}
            {#if rollShow.total === 7 && view.settings?.oasis}<small class="oasis-label">Oasis Day!</small>{/if}
          </span>
        </div>
      {/if}
      {#if houseRules.length}
        <div class="house-rules" title={houseRules.map((r) => `${r.name}: ${r.text}`).join('\n')}>
          House rules: {houseRules.map((r) => r.name).join(' · ')}
        </div>
      {/if}
      <div class="supply" title="Cards left in the supply">
        <Icon name="cards" size={16} /> Chutzpah deck {view.devDeckCount} · {view.board.seed == null ? 'Island hidden until sunrise' : `Map No. ${view.board.seed}`}
      </div>
    </section>

    <aside class="side">
      {#if controls}
        <TurnCard
          {view}
          {controls}
          {busy}
          rolling={!!rollShow || rollPending}
          {skippable}
          onroll={roll}
          onend={() => run({ type: 'END_TURN' })}
          onskip={skipAway}
        />
        <BuildCard
          {controls}
          {mode}
          {busy}
          onmode={(m) => (mode = m)}
          onbuy={() => run({ type: 'BUY_DEV_CARD' })}
          ontrade={() => (dialog = 'trade')}
        />
        <OffersCard
          {view}
          {busy}
          onaccept={(tradeId) => run({ type: 'ACCEPT_TRADE', tradeId })}
          ondecline={(tradeId) => run({ type: 'DECLINE_TRADE', tradeId })}
          oncancel={(tradeId) => run({ type: 'CANCEL_TRADE', tradeId })}
        />
      {/if}
      <EventLog {view} privateLog={table.priv?.log ?? []} />
    </aside>
  </div>

  {#if controls}
    <HandBar {view} {controls} {busy} onplay={playCard} />
  {/if}
</div>

<ProductionFlights {view} />

{#if controls?.mustPickOasis}
  <OasisDialog need={controls.mustPickOasis} supply={view.bank} {busy} onconfirm={(resources) => run({ type: 'OASIS_PICK', resources })} />
{/if}

{#if controls?.mustDiscard}
  <DiscardDialog need={controls.mustDiscard} hand={controls.player.resources} {busy} onconfirm={(resources) => run({ type: 'DISCARD', resources })} />
{/if}

{#if dialog === 'trade' && controls?.canTrade}
  <TradeDialog {view} {controls} {busy} onoffer={offer} onbank={(t) => run({ type: 'BANK_TRADE', ...t })} onclose={() => (dialog = null)} />
{:else if dialog === 'harvest'}
  <PickResourcesDialog
    title="Bountiful Year"
    text="Take any two resources from the supply."
    count={2}
    supply={view.bank}
    {busy}
    onpick={pickResources}
    onclose={() => (dialog = null)}
  />
{:else if dialog === 'chutzpah'}
  <PickResourcesDialog
    title="Chutzpah!"
    text="Name a resource. Every other player must hand you all of theirs."
    count={1}
    supply={view.bank}
    {busy}
    onpick={pickResources}
    onclose={() => (dialog = null)}
  />
{:else if dialog === 'rules'}
  <RulesDialog settings={view.settings} onclose={() => (dialog = null)} />
{:else if dialog?.watchmanVictims}
  <VictimDialog
    {view}
    victims={dialog.watchmanVictims}
    {busy}
    title="Who does your Watchman visit?"
    text="Pick a player — your Watchman takes a card from them."
    onpick={pickWatchmanVictim}
    onclose={() => (dialog = null)}
  />
{:else if dialog?.watchmanAsk}
  <PickResourcesDialog
    title="What is your Watchman after?"
    text={`Name a resource. If ${view.players[dialog.victim]?.name} has one, it's yours — otherwise you grab a random card.`}
    count={1}
    supply={view.bank}
    {busy}
    onpick={nameResource}
    onclose={() => (dialog = null)}
  />
{:else if dialog?.victims}
  <VictimDialog {view} victims={dialog.victims} {busy} onpick={pickVictim} onclose={() => (dialog = null)} />
{/if}

{#if view.status === 'finished' && gameOverOpen}
  <GameOverDialog {view} {rematching} onrematch={rematch} onclose={() => (gameOverOpen = false)} onhome={() => table.close()} />
{/if}

<style>
  .game {
    height: 100vh;
    max-width: var(--max-width);
    margin-inline: auto;
    padding: 14px clamp(12px, 2vw, 25px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 18px;
  }

  .top {
    display: flex;
    align-items: center;
    gap: 18px;
    min-width: 0;
  }

  .brand {
    flex: none;
  }

  .top :global(.strip) {
    flex: 1;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: none;
  }

  .code {
    padding: 8px 16px;
    border-radius: 25px;
    font-weight: 900;
    letter-spacing: 0.2em;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .conn {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #d9a92f;
  }

  .conn--live {
    background: #5ec27a;
    box-shadow: 0 0 0 5px rgba(94, 194, 122, 0.15);
  }

  .conn--offline {
    background: #e2574c;
  }

  .middle {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 400px;
    gap: 25px;
    min-height: 0;
  }

  .board-wrap {
    position: relative;
    min-height: 0;
    border-radius: 25px;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 45%, #1f6f86, #134c5d 70%),
      #134c5d;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.06),
      var(--shadow);
  }

  .mode-hint {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px 10px 20px;
    border-radius: 25px;
    background: rgba(18, 26, 36, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: var(--shadow-lift);
    font-weight: 700;
    white-space: nowrap;
    animation: rise 0.2s ease;
  }

  .mode-hint button {
    padding: 6px 12px;
    border-radius: 25px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-light);
    font-weight: 600;
    cursor: pointer;
  }

  .roll-banner {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px 28px;
    border-radius: 25px;
    background: rgba(18, 26, 36, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
    pointer-events: none;
    animation: banner 1.9s ease forwards;
  }

  .roll-banner.seven {
    background: rgba(120, 22, 38, 0.92);
  }

  .roll-banner.sunrise {
    background: linear-gradient(135deg, rgba(234, 165, 58, 0.95), rgba(179, 38, 62, 0.95));
  }

  .roll-banner .sun {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: radial-gradient(circle, #fff4dc 30%, #f3c060 70%);
    box-shadow: 0 0 30px rgba(255, 220, 140, 0.9);
  }

  .roll-banner.oasis-day {
    background: rgba(24, 110, 104, 0.94);
  }

  .roll-text .oasis-label {
    margin: 6px 0 0;
    color: #d9f5ea;
    font-size: 0.95rem;
    font-weight: 800;
  }

  .roll-text {
    display: grid;
    font-size: 3rem;
    font-weight: 900;
    line-height: 1;
    min-width: 80px;
    text-align: center;
  }

  .roll-text small {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-light-muted);
    margin-bottom: 4px;
  }

  .house-rules {
    position: absolute;
    right: 16px;
    bottom: 16px;
    padding: 6px 14px;
    border-radius: 25px;
    background: rgba(243, 192, 96, 0.9);
    color: #2b2118;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .supply {
    position: absolute;
    left: 16px;
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 25px;
    background: rgba(18, 26, 36, 0.7);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-light-muted);
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-height: 0;
    overflow-y: auto;
    padding: 4px;
    margin: -4px;
  }

  .side :global(.log) {
    flex: 1;
  }

  @keyframes banner {
    0% {
      opacity: 0;
      transform: translate(-50%, -40%) scale(0.9);
    }
    12%,
    80% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -55%) scale(0.98);
    }
  }

  @media (max-width: 1400px) {
    .brand {
      display: none;
    }
    .middle {
      grid-template-columns: minmax(0, 1fr) 360px;
    }
  }

  @media (max-height: 860px) {
    .game {
      gap: 12px;
      padding-block: 10px;
    }
  }

  @media (max-width: 1100px) {
    .game {
      height: auto;
      min-height: 100vh;
    }
    .top {
      flex-wrap: wrap;
    }
    .middle {
      grid-template-columns: 1fr;
    }
    .board-wrap {
      aspect-ratio: 1200 / 1040;
    }
    .side {
      overflow: visible;
    }
  }
</style>
