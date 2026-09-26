<script>
  import { hasAll } from '$engine';
  import Bundle from '../ui/Bundle.svelte';
  import { colorOf } from '../../lib/theme.js';

  let { view, busy, onaccept, ondecline, oncancel } = $props();

  const me = $derived(view.me);
  const hand = $derived(view.players[me]?.resources ?? {});
</script>

{#if view.trades.length}
  <section class="card offers" aria-live="polite">
    <h2>Offers on the table</h2>
    <ul>
      {#each view.trades as trade (trade.id)}
        {@const from = view.players[trade.from]}
        {@const mine = trade.from === me}
        {@const declined = trade.declined.includes(me)}
        <li class="offer" style="--pc: {colorOf(from)}">
          <p class="who">{mine ? 'You offer' : `${from.name} offers`}</p>
          <div class="terms">
            <Bundle bundle={trade.give} />
            <span class="for">for</span>
            <Bundle bundle={trade.want} />
          </div>
          <div class="buttons">
            {#if mine}
              {#if trade.declined.length}
                <span class="muted small">Declined by {trade.declined.map((i) => view.players[i].name).join(', ')}</span>
              {/if}
              <button class="btn btn--small btn--light btn--tight" disabled={busy} onclick={() => oncancel(trade.id)}>Withdraw</button>
            {:else if declined}
              <span class="muted small">You declined</span>
            {:else}
              <button
                class="btn btn--small btn--tight"
                disabled={busy || !hasAll(hand, trade.want)}
                title={hasAll(hand, trade.want) ? 'Accept this trade' : "You don't have what they want"}
                onclick={() => onaccept(trade.id)}>Accept</button
              >
              <button class="btn btn--small btn--light btn--tight" disabled={busy} onclick={() => ondecline(trade.id)}>Decline</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .offers {
    display: grid;
    gap: 10px;
    padding: 18px 22px;
    animation: rise 0.25s ease;
  }

  h2 {
    font-size: 1.05rem;
    font-weight: 800;
  }

  ul {
    list-style: none;
    display: grid;
    gap: 10px;
  }

  .offer {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 6px 10px;
    padding: 10px 12px 10px 14px;
    border-radius: 25px;
    background: #fffaf0;
    border-left: 6px solid var(--pc);
    box-shadow: var(--shadow);
  }

  .who {
    grid-column: 1 / -1;
    font-weight: 800;
    font-size: 0.88rem;
  }

  .terms {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .for {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .buttons {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .small {
    font-size: 0.78rem;
  }
</style>
