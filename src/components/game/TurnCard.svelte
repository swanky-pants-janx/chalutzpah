<script>
  import Die from '../ui/Die.svelte';
  import Icon from '../ui/Icon.svelte';
  import { describeTurn } from '../../game/controls.js';
  import { colorOf } from '../../lib/theme.js';

  let { view, controls, busy, rolling, skippable = [], onroll, onend, onskip } = $props();

  const desc = $derived(describeTurn(view, controls));
  const current = $derived(view.players[view.turn?.current]);
  const dice = $derived(view.lastRoll?.dice ?? [1, 1]);
  const roundLabel = $derived(
    view.status === 'setup' ? `Setup · round ${view.turn.setupIndex < view.players.length ? 1 : 2}` : `Turn ${view.turn?.number ?? 0}`,
  );
</script>

<section class="card turn" class:mine={controls.myTurn} style="--pc: {colorOf(current)}">
  <div class="head">
    <p class="eyebrow">{roundLabel}</p>
    {#if view.status !== 'finished'}<span class="whose"><span class="dot"></span>{current?.name}</span>{/if}
  </div>
  <h2>{desc.title}</h2>
  <p class="hint">{desc.hint}</p>

  <div class="dice-row">
    <div class="dice" class:stale={!view.lastRoll}>
      <Die value={dice[0]} {rolling} size={42} />
      <Die value={dice[1]} {rolling} size={42} tone="red" />
      {#if view.lastRoll}
        <span class="total" class:seven={view.lastRoll.total === 7}>{view.lastRoll.total}</span>
      {/if}
    </div>
    <div class="actions">
      {#if controls.canRoll}
        <button class="btn btn--tight roll" disabled={busy} onclick={onroll}><Icon name="dice" /> Roll</button>
      {/if}
      {#if controls.canEndTurn}
        <button class="btn btn--tight btn--dark" disabled={busy} onclick={onend}>End turn <Icon name="arrow-right" size={18} /></button>
      {/if}
    </div>
  </div>

  {#if skippable.length}
    <div class="skip">
      <span>{skippable.map((p) => p.name).join(', ')} {skippable.length > 1 ? 'seem' : 'seems'} to be away.</span>
      <button class="btn btn--small btn--light btn--tight" disabled={busy} onclick={onskip}>Skip ahead</button>
    </div>
  {/if}
</section>

<style>
  .turn {
    display: grid;
    gap: 8px;
    padding: 20px 22px;
    border-top: 6px solid var(--pc);
    transition: box-shadow 0.3s ease;
  }

  .turn.mine {
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--pc) 55%, transparent),
      0 10px 30px rgba(0, 0, 0, 0.3);
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .whose {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    font-size: 0.85rem;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--pc);
    border: 2px solid rgba(43, 33, 24, 0.4);
  }

  h2 {
    font-size: 1.3rem;
    font-weight: 900;
    letter-spacing: -0.01em;
  }

  .hint {
    color: var(--text-muted);
    font-size: 0.92rem;
    min-height: 2.8em;
  }

  .dice-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .dice {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dice.stale {
    opacity: 0.35;
  }

  .total {
    min-width: 36px;
    font-size: 1.7rem;
    font-weight: 900;
    text-align: center;
  }

  .total.seven {
    color: var(--pomegranate);
  }

  .actions {
    display: flex;
    gap: 12px;
  }

  .roll {
    animation: nudge 1.8s ease-in-out infinite;
  }

  .skip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 25px;
    background: rgba(226, 87, 76, 0.1);
    font-size: 0.88rem;
    font-weight: 600;
  }

  @keyframes nudge {
    0%,
    100% {
      transform: none;
    }
    50% {
      transform: scale(1.05);
    }
  }
</style>
