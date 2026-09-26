<script>
  import { COSTS, PIECE_LABELS } from '$engine';
  import Bundle from '../ui/Bundle.svelte';
  import Icon from '../ui/Icon.svelte';

  let { controls, mode, busy, onmode, onbuy, ontrade } = $props();

  // Only the player whose turn it is can build, so everyone else sees a folded
  // cost card (which leaves room for offers and the chronicle).
  let peek = $state(false);
  const expanded = $derived((controls.myTurn && controls.phase !== 'setup_settlement' && controls.phase !== 'setup_road') || peek);

  const ITEMS = [
    { key: 'road', icon: 'road' },
    { key: 'settlement', icon: 'settlement' },
    { key: 'city', icon: 'city' },
    { key: 'devCard', icon: 'devCard' },
  ];

  const piecesLeft = (key) => (key === 'devCard' ? null : controls.player.piecesLeft[key]);
</script>

<section class="card build" class:folded={!expanded}>
  <div class="head">
    <h2>Build</h2>
    {#if controls.myTurn}
      <button class="btn btn--small btn--sea btn--tight" disabled={!controls.canTrade || busy} onclick={ontrade}>
        <Icon name="trade" size={18} /> Trade
      </button>
    {:else}
      <button class="peek" onclick={() => (peek = !peek)} aria-expanded={peek}>{peek ? 'Hide costs' : 'Show costs'}</button>
    {/if}
  </div>
  {#if expanded}
  <div class="grid">
    {#each ITEMS as item (item.key)}
      {@const opt = controls.build[item.key]}
      {@const left = piecesLeft(item.key)}
      <button
        class="tile"
        class:active={mode === item.key && controls.activeMode === item.key}
        class:ready={opt.can}
        disabled={!opt.can || busy}
        title={opt.reason ?? `Build a ${PIECE_LABELS[item.key]}`}
        aria-pressed={mode === item.key}
        onclick={() => (item.key === 'devCard' ? onbuy() : onmode(mode === item.key ? null : item.key))}
      >
        <span class="icon"><Icon name={item.icon} size={24} /></span>
        <span class="label">
          {PIECE_LABELS[item.key]}
          {#if left !== null}<small>{left} left</small>{/if}
        </span>
        <span class="cost"><Bundle bundle={COSTS[item.key]} size={15} /></span>
      </button>
    {/each}
  </div>
  {/if}
</section>

<style>
  .build {
    display: grid;
    gap: 12px;
    padding: 20px 22px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h2 {
    font-size: 1.1rem;
    font-weight: 800;
  }

  .grid {
    display: grid;
    gap: 8px;
  }

  .tile {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 25px;
    border: 1px solid rgba(43, 33, 24, 0.12);
    background: #fffaf0;
    box-shadow: var(--shadow);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .tile.ready {
    border-color: rgba(212, 105, 59, 0.55);
  }

  .tile.ready:hover:not(:disabled) {
    transform: translateX(2px);
    background: #fff4e0;
  }

  .tile.active,
  .tile.active.ready:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--brand-1), var(--brand-2));
    color: #fff;
    border-color: transparent;
  }

  .tile.active :global(.chip) {
    background: rgba(255, 255, 255, 0.25);
  }

  .tile:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .icon {
    display: grid;
    place-items: center;
    color: var(--pomegranate);
  }

  .active .icon {
    color: #fff;
  }

  .label {
    display: grid;
    font-weight: 800;
    font-size: 0.92rem;
    line-height: 1.15;
    white-space: nowrap;
  }

  .cost :global(.bundle) {
    flex-wrap: nowrap;
    gap: 4px;
  }

  .folded {
    padding-block: 14px;
  }

  .peek {
    border: 0;
    background: none;
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: underline;
    cursor: pointer;
  }

  small {
    font-weight: 600;
    font-size: 0.72rem;
    opacity: 0.7;
  }
</style>
