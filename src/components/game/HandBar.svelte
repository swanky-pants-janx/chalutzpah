<script>
  import { DEV_CARD_LABELS, RESOURCES, RESOURCE_LABELS, landmarkCount } from '$engine';
  import Icon from '../ui/Icon.svelte';
  import { CARD_ORDER, CARD_TEXT } from '../../game/cards.js';
  import { RESOURCE_COLORS } from '../../lib/theme.js';

  let { view, controls, busy, onplay } = $props();

  const player = $derived(controls.player);
  const hand = $derived(player.resources ?? {});
  const cards = $derived(
    CARD_ORDER.map((type) => {
      const all = (player.devCards ?? []).filter((c) => c.type === type);
      const fresh = all.filter((c) => c.boughtTurn >= (view.turn?.number ?? 0)).length;
      return { type, count: all.length, fresh };
    }).filter((g) => g.count > 0),
  );
  const secret = $derived(landmarkCount(player));
  const total = $derived(player.publicVP + secret);
</script>

<section class="hand card card--dark" aria-label="Your hand">
  <div class="resources">
    {#each RESOURCES as r (r)}
      <div class="res" class:empty={!hand[r]} style="--rc: {RESOURCE_COLORS[r]}" title="{RESOURCE_LABELS[r]} · market rate {controls.rates[r]}:1">
        <Icon name={r} size={30} />
        <span class="count">{hand[r] ?? 0}</span>
        <span class="label">{RESOURCE_LABELS[r]}</span>
        <span class="rate" class:better={controls.rates[r] < 4}>{controls.rates[r]}:1</span>
      </div>
    {/each}
  </div>

  <div class="devs">
    {#if cards.length === 0}
      <p class="empty-note">No Chutzpah cards yet — buy one for <b>Fleece + Wheat + Stone</b>.</p>
    {/if}
    {#each cards as card (card.type)}
      {@const canPlay = controls.playable.has(card.type) && card.count > card.fresh}
      <div class="dev" title={CARD_TEXT[card.type]}>
        <span class="dev-icon"><Icon name={card.type} size={22} /></span>
        <span class="dev-name">
          {DEV_CARD_LABELS[card.type]}{#if card.count > 1}<b> ×{card.count}</b>{/if}
          {#if card.type === 'landmark'}
            <small>secret +1 point</small>
          {:else if card.fresh === card.count}
            <small>playable next turn</small>
          {/if}
        </span>
        {#if card.type !== 'landmark'}
          <button class="btn btn--small btn--gold btn--tight" disabled={!canPlay || busy} onclick={() => onplay(card.type)}>Play</button>
        {/if}
      </div>
    {/each}
  </div>

  <div class="score">
    <span class="eyebrow">Your points</span>
    <span class="vp"><b>{total}</b> / {view.settings.vpTarget}</span>
    {#if secret}<small>incl. {secret} secret</small>{/if}
  </div>
</section>

<style>
  .hand {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 25px;
    padding: 14px 20px;
  }

  .resources {
    display: flex;
    gap: 10px;
  }

  .res {
    position: relative;
    width: 74px;
    height: 96px;
    border-radius: 25px;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 2px;
    background: linear-gradient(160deg, color-mix(in srgb, var(--rc) 35%, #fff6e2), color-mix(in srgb, var(--rc) 70%, #1b2430));
    border: 2px solid color-mix(in srgb, var(--rc) 60%, #fff);
    box-shadow: var(--shadow);
    color: #fff;
    transition:
      transform 0.2s ease,
      opacity 0.2s ease;
  }

  .res:not(.empty):hover {
    transform: translateY(-4px);
  }

  .res.empty {
    opacity: 0.4;
  }

  .count {
    font-size: 1.5rem;
    font-weight: 900;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .rate {
    position: absolute;
    top: -8px;
    right: -6px;
    padding: 1px 7px;
    border-radius: 25px;
    font-size: 0.66rem;
    font-weight: 800;
    background: var(--ink);
    color: var(--text-light-muted);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .rate.better {
    background: #f3c060;
    color: #2b2118;
  }

  .devs {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    overflow-x: auto;
    min-width: 0;
    padding: 4px;
  }

  .empty-note {
    color: var(--text-light-muted);
    font-size: 0.9rem;
  }

  .dev {
    flex: none;
    display: grid;
    grid-template-columns: auto auto auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 25px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .dev-icon {
    width: 40px;
    height: 40px;
    border-radius: 25px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, var(--brand-1), var(--brand-2));
    color: #fff;
  }

  .dev-name {
    display: grid;
    font-weight: 800;
    font-size: 0.88rem;
    white-space: nowrap;
  }

  .dev-name small {
    font-weight: 500;
    font-size: 0.72rem;
    color: var(--text-light-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .score {
    display: grid;
    justify-items: end;
    gap: 2px;
  }

  .vp {
    font-size: 1.1rem;
    color: var(--text-light-muted);
  }

  .vp b {
    font-size: 2rem;
    font-weight: 900;
    color: #f3c060;
  }

  .score small {
    color: var(--text-light-muted);
  }

  @media (max-width: 1400px) {
    .hand {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 18px;
      padding: 12px 16px;
    }
    /* your score is already on your chip in the player strip */
    .score {
      display: none;
    }
    .devs {
      flex-wrap: nowrap;
      overflow-x: auto;
    }
    .dev-name small {
      display: none;
    }
    .res {
      width: 64px;
      height: 84px;
    }
  }

  @media (max-width: 1100px) {
    .hand {
      grid-template-columns: 1fr;
    }
    .score {
      justify-items: start;
    }
  }
</style>
