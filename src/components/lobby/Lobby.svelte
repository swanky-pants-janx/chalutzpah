<script>
  import { MAP_NUMBER_MAX, MIN_PLAYERS, NAME_MAX_LENGTH, PLAYER_COLORS as COLOR_IDS } from '$engine';
  import Board from '../board/Board.svelte';
  import RulesDialog from '../game/RulesDialog.svelte';
  import TableSettings from './TableSettings.svelte';
  import Die from '../ui/Die.svelte';
  import Icon from '../ui/Icon.svelte';
  import Logo from '../ui/Logo.svelte';
  import Menu from '../ui/Menu.svelte';
  import { play, sound, toggleMute } from '../../lib/sound.svelte.js';
  import { table } from '../../lib/table.svelte.js';
  import { PLAYER_COLORS } from '../../lib/theme.js';
  import { toast, toastError } from '../../lib/toasts.svelte.js';

  const HOST_AWAY_MS = 45_000;

  const view = $derived(table.view);
  const me = $derived(view.players[view.me]);
  const isHost = $derived(me?.id === view.hostId);
  const host = $derived(view.players.find((p) => p.id === view.hostId));
  const openSeats = $derived(Math.max(0, view.settings.maxPlayers - view.players.length));
  const canStart = $derived(isHost && view.players.length >= MIN_PLAYERS);
  const inviteLink = $derived(`${location.origin}/join/${view.code}`);
  const dark = $derived(view.settings?.nightLanding === true);

  let rolling = $state(false);
  let starting = $state(false);
  let faces = $state([5, 2]);
  let editingName = $state(false);
  let nameDraft = $state('');
  let showRules = $state(false);
  let mapDraft = $state('');

  function loadMap(event) {
    event.preventDefault();
    const n = Number(mapDraft.replace(/[\s,.]/g, ''));
    if (!Number.isInteger(n) || n < 1 || n > MAP_NUMBER_MAX) {
      toast(`Map numbers run from 1 to ${MAP_NUMBER_MAX}.`, { kind: 'error' });
      return;
    }
    reroll(n);
  }

  // Everyone hears the dice when the host rolls a new island.
  let lastSeed = null;
  $effect(() => {
    const seed = view.board.seed;
    if (lastSeed !== null && seed !== lastSeed && !isHost) play('dice');
    lastSeed = seed;
  });

  async function reroll(mapNumber = null) {
    if (rolling) return;
    rolling = true;
    play('dice');
    faces = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const started = Date.now();
    try {
      await table.send('reroll_map', mapNumber == null ? {} : { mapNumber });
      mapDraft = '';
    } catch (err) {
      toastError(err);
    }
    // Let the tumble finish so the new island lands with a flourish.
    setTimeout(() => (rolling = false), Math.max(0, 450 - (Date.now() - started)));
  }

  async function start() {
    starting = true;
    try {
      await table.send('start');
      play('turn');
    } catch (err) {
      toastError(err);
      starting = false;
    }
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied — paste it in Discord!`, { kind: 'success' });
    } catch {
      toast(text);
    }
  }

  async function setColor(color) {
    try {
      await table.send('update_profile', { color });
    } catch (err) {
      toastError(err);
    }
  }

  async function saveName(event) {
    event.preventDefault();
    try {
      await table.send('update_profile', { name: nameDraft });
      editingName = false;
    } catch (err) {
      toastError(err);
    }
  }

  let savingSettings = $state(false);
  async function changeSettings(patch) {
    savingSettings = true;
    try {
      await table.send('update_settings', { settings: patch });
    } catch (err) {
      toastError(err);
    } finally {
      savingSettings = false;
    }
  }

  async function kick(player) {
    try {
      await table.send('kick', { playerId: player.id });
      table.nudge();
    } catch (err) {
      toastError(err);
    }
  }

  async function leave() {
    try {
      await table.leave();
    } catch (err) {
      toastError(err);
    }
  }

  // Host migration: if the host drops out of presence, the next online player
  // (in seat order) claims hosting. The server double-checks via heartbeats.
  let hostAwaySince = $state(null);
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 5000);
    return () => clearInterval(timer);
  });
  $effect(() => {
    const hostOnline = host && table.online.has(host.id);
    if (hostOnline || table.connection !== 'live' || table.online.size === 0) hostAwaySince = null;
    else if (hostAwaySince === null) hostAwaySince = Date.now();
  });
  const hostAway = $derived(hostAwaySince !== null && now - hostAwaySince > HOST_AWAY_MS);
  let claiming = false;
  $effect(() => {
    if (!hostAway || isHost || claiming) return;
    const successor = view.players.find((p) => p.id !== view.hostId && table.online.has(p.id));
    if (successor?.id !== me?.id) return;
    claiming = true;
    table
      .send('claim_host')
      .then(() => toast('The host stepped away — you are now the host.', { kind: 'success' }))
      .catch(() => {})
      .finally(() => (claiming = false));
  });

  const menuItems = $derived([
    { label: 'How to play', icon: 'book', onclick: () => (showRules = true) },
    { label: sound.muted ? 'Sound: off' : 'Sound: on', icon: sound.muted ? 'mute' : 'sound', onclick: toggleMute },
    { label: 'Copy invite link', icon: 'link', onclick: () => copy(inviteLink, 'Invite link') },
    { label: 'Leave table', icon: 'exit', onclick: leave, danger: true },
  ]);
</script>

<svelte:head>
  <title>Lobby {view.code} · Chalutzpah</title>
</svelte:head>

<header class="bar">
  <div class="container bar-inner">
    <Menu items={menuItems} />
    <Logo size="sm" />
    <span class="conn conn--{table.connection}" title="Realtime connection: {table.connection}"></span>
  </div>
</header>

<main class="container lobby">
  <section class="side">
    <div class="card code-card">
      <p class="eyebrow">Game code</p>
      <h1 class="code" aria-label="Game code {view.code.split('').join(' ')}">{view.code}</h1>
      <p class="muted">Share this code with your friends.</p>
      <div class="share">
        <button class="btn btn--small btn--tight" onclick={() => copy(view.code, 'Code')}><Icon name="copy" size={18} /> Copy code</button>
        <button class="btn btn--small btn--light btn--tight" onclick={() => copy(inviteLink, 'Invite link')}>
          <Icon name="link" size={18} /> Copy invite link
        </button>
      </div>
    </div>

    <div class="card players-card">
      <div class="players-head">
        <h2>Settlers</h2>
        <span class="muted">{view.players.length}/{view.settings.maxPlayers}</span>
      </div>
      <ul class="players">
        {#each view.players as player (player.id)}
          {@const mine = player.id === me?.id}
          <li class="player" class:mine style="--pc: {PLAYER_COLORS[player.color]?.fill}">
            <span class="swatch"></span>
            <div class="who">
              {#if mine && editingName}
                <form class="rename" onsubmit={saveName}>
                  <!-- svelte-ignore a11y_autofocus -->
                  <input class="input rename-input" bind:value={nameDraft} maxlength={NAME_MAX_LENGTH} autofocus />
                  <button class="btn btn--small btn--tight">Save</button>
                </form>
              {:else}
                <span class="name">
                  {player.name}
                  {#if mine}
                    <button class="linklike" onclick={() => ((nameDraft = player.name), (editingName = true))}>(you · rename)</button>
                  {/if}
                </span>
              {/if}
              {#if mine}
                <div class="colors" role="group" aria-label="Choose your colour">
                  {#each COLOR_IDS as color (color)}
                    {@const taken = view.players.some((p) => p.color === color && p.id !== me.id)}
                    <button
                      class="color-dot"
                      class:current={player.color === color}
                      style="--dot: {PLAYER_COLORS[color].fill}"
                      disabled={taken}
                      aria-label={PLAYER_COLORS[color].label}
                      title={taken ? `${PLAYER_COLORS[color].label} (taken)` : PLAYER_COLORS[color].label}
                      onclick={() => setColor(color)}
                    ></button>
                  {/each}
                </div>
              {/if}
            </div>
            <span class="badges">
              {#if player.id === view.hostId}<span class="crown" title="Host"><Icon name="crown" size={20} /></span>{/if}
              <span class="dot" class:on={table.online.has(player.id)} title={table.online.has(player.id) ? 'Online' : 'Offline'}></span>
              {#if isHost && !mine}
                <button class="kick" onclick={() => kick(player)} aria-label="Remove {player.name}"><Icon name="close" size={16} /></button>
              {/if}
            </span>
          </li>
        {/each}
        {#each Array.from({ length: openSeats }, (_, i) => i) as seat (seat)}
          <li class="player empty">
            <span class="swatch"></span>
            <span class="muted">Waiting for a friend…</span>
          </li>
        {/each}
      </ul>
      <p class="rules-line muted">Seats are shuffled when the game starts.</p>
    </div>

    <TableSettings {view} {isHost} busy={savingSettings} onchange={changeSettings} />
  </section>

  <section class="card map-card">
    <div class="map-head">
      <div>
        <p class="eyebrow">The island</p>
        {#if dark}
          <h2>Night Landing</h2>
        {:else}
          <h2>
            Map No. {view.board.seed}
            <button class="copy-map" title="Copy map number" aria-label="Copy map number" onclick={() => copy(String(view.board.seed), 'Map number')}>
              <Icon name="copy" size={16} />
            </button>
          </h2>
        {/if}
      </div>
      {#if dark}
        <span class="muted">Dealt fresh at the start — nobody sees it, not even the host</span>
      {:else if isHost}
        <form class="map-load" onsubmit={loadMap}>
          <input class="input" bind:value={mapDraft} inputmode="numeric" maxlength="7" placeholder="Map number" aria-label="Load a map by number" />
          <button class="btn btn--small btn--light btn--tight" disabled={rolling || !mapDraft.trim()}>Load</button>
        </form>
      {:else}
        <span class="muted">{view.mapRolls} {view.mapRolls === 1 ? 'roll' : 'rolls'} so far</span>
      {/if}
    </div>

    <div class="map">
      <Board {view} preview shuffling={rolling} />
      {#if isHost && !dark}
        <button class="reroll" onclick={() => reroll()} disabled={rolling} aria-label="Roll a new island">
          <Die value={faces[0]} {rolling} size={48} />
          <Die value={faces[1]} {rolling} size={48} tone="red" />
          <span class="reroll-label">Roll a new island</span>
        </button>
      {/if}
    </div>

    <div class="map-foot">
      {#if isHost}
        <p class="muted">
          {dark ? 'The island stays dark until everyone has placed their starting pieces.' : 'Click the dice to re-roll the island until it feels right, then settle it.'}
        </p>
        <button class="btn btn--big btn--tight" disabled={!canStart || starting || rolling} onclick={start}>
          <Icon name="flag" />
          {starting ? 'Settling…' : 'Settle this land'}
        </button>
      {:else}
        <p class="waiting">
          <Icon name="hourglass" size={20} />
          {#if hostAway}
            The host seems to be away — hosting will pass to the next player shortly.
          {:else}
            Waiting for {host?.name ?? 'the host'} to choose the island and start the game…
          {/if}
        </p>
      {/if}
    </div>
    {#if isHost && !canStart}
      <p class="muted need">You need at least {MIN_PLAYERS} settlers to start.</p>
    {/if}
  </section>
</main>

{#if showRules}
  <RulesDialog settings={view.settings} onclose={() => (showRules = false)} />
{/if}

<style>
  .bar {
    height: 100px;
    display: flex;
    align-items: center;
  }

  .bar-inner {
    display: flex;
    align-items: center;
    gap: 25px;
  }

  .conn {
    margin-left: auto;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #d9a92f;
  }

  .conn--live {
    background: #5ec27a;
    box-shadow: 0 0 0 6px rgba(94, 194, 122, 0.15);
  }

  .conn--offline {
    background: #e2574c;
  }

  .lobby {
    display: grid;
    grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
    gap: 25px;
    padding-bottom: 64px;
    align-items: start;
  }

  .side {
    display: grid;
    gap: 25px;
  }

  .code-card {
    display: grid;
    gap: 12px;
    text-align: center;
    justify-items: center;
    padding: 32px 25px;
  }

  .code {
    font-size: clamp(3rem, 6vw, 4.6rem);
    font-weight: 900;
    letter-spacing: 0.18em;
    padding-left: 0.18em;
    line-height: 1.05;
    color: var(--pomegranate);
  }

  .share {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    margin-top: 8px;
  }

  .players-card {
    display: grid;
    gap: 18px;
  }

  .players-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  h2 {
    font-size: 1.35rem;
    font-weight: 800;
  }

  .players {
    list-style: none;
    display: grid;
    gap: 12px;
  }

  .player {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-radius: 25px;
    background: #fffaf0;
    border: 1px solid rgba(43, 33, 24, 0.08);
    box-shadow: var(--shadow);
    animation: rise 0.3s ease;
  }

  .player.mine {
    border-color: var(--pc);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--pc) 35%, transparent);
  }

  .player.empty {
    background: transparent;
    border-style: dashed;
    border-color: rgba(43, 33, 24, 0.2);
    box-shadow: none;
  }

  .swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--pc, transparent);
    border: 2px solid rgba(43, 33, 24, 0.35);
  }

  .empty .swatch {
    border-style: dashed;
  }

  .who {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .name {
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .linklike {
    border: 0;
    background: none;
    color: var(--text-muted);
    font-weight: 500;
    font-size: 0.85rem;
    cursor: pointer;
    text-decoration: underline;
  }

  .rename {
    display: flex;
    gap: 8px;
  }

  .rename-input {
    padding: 8px 14px;
    font-size: 1rem;
  }

  .colors {
    display: flex;
    gap: 8px;
  }

  .color-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(43, 33, 24, 0.3);
    background: var(--dot);
    cursor: pointer;
  }

  .color-dot.current {
    outline: 3px solid var(--text);
    outline-offset: 2px;
  }

  .color-dot:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .badges {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .crown {
    color: #d9a92f;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #c9bba0;
  }

  .dot.on {
    background: #3fae5f;
  }

  .kick {
    width: 30px;
    height: 30px;
    border-radius: 25px;
    border: 1px solid rgba(43, 33, 24, 0.15);
    background: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
    color: var(--text-muted);
  }

  .rules-line {
    font-size: 0.9rem;
  }

  .map-card {
    display: grid;
    gap: 18px;
  }

  .copy-map {
    margin-left: 6px;
    width: 30px;
    height: 30px;
    border-radius: 25px;
    border: 1px solid rgba(43, 33, 24, 0.14);
    background: #fffaf0;
    color: var(--text-muted);
    display: inline-grid;
    place-items: center;
    vertical-align: middle;
    cursor: pointer;
  }

  .map-load {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .map-load .input {
    width: 150px;
    padding: 9px 16px;
    font-size: 0.95rem;
  }

  .map-head {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 25px;
  }

  .map {
    position: relative;
    border-radius: 25px;
    overflow: hidden;
    background: #134c5d;
    aspect-ratio: 1200 / 1040;
    max-height: 68vh;
    margin-inline: auto;
    width: 100%;
  }

  .reroll {
    position: absolute;
    right: 25px;
    bottom: 25px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 22px 12px 12px;
    border-radius: 25px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: linear-gradient(135deg, rgba(51, 69, 93, 0.92), rgba(18, 26, 36, 0.94));
    box-shadow: var(--shadow-lift);
    color: var(--text-light);
    font-weight: 800;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .reroll:hover:not(:disabled) {
    transform: translateY(-2px) rotate(-1.5deg) scale(1.03);
  }

  .reroll:disabled {
    cursor: progress;
  }

  .map-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 25px;
    flex-wrap: wrap;
  }

  .waiting {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .need {
    font-size: 0.9rem;
  }

  @media (max-width: 1000px) {
    .lobby {
      grid-template-columns: 1fr;
    }
  }
</style>
