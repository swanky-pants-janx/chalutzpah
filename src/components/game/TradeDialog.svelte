<script>
  import { MAX_OPEN_TRADES, RESOURCES, RESOURCE_LABELS, emptyHand, handSize } from '$engine';
  import Bundle from '../ui/Bundle.svelte';
  import Icon from '../ui/Icon.svelte';
  import Modal from '../ui/Modal.svelte';
  import ResourceStepper from './ResourceStepper.svelte';

  let { view, controls, busy, onoffer, onbank, onclose } = $props();

  let tab = $state('players');
  let give = $state(emptyHand());
  let want = $state(emptyHand());
  let bankGive = $state(null);
  let bankGet = $state(null);

  const hand = $derived(controls.player.resources);
  const myOpen = $derived(view.trades.filter((t) => t.from === view.me).length);
  const offerValid = $derived(handSize(give) > 0 && handSize(want) > 0 && myOpen < MAX_OPEN_TRADES);
  const giving = $derived(Object.fromEntries(RESOURCES.map((r) => [r, give[r] > 0])));
  const wanting = $derived(Object.fromEntries(RESOURCES.map((r) => [r, want[r] > 0])));
  const bankRate = $derived(bankGive ? controls.rates[bankGive] : null);
  const bankValid = $derived(bankGive && bankGet && bankGive !== bankGet && hand[bankGive] >= bankRate && view.bank[bankGet] > 0);

  async function sendOffer() {
    await onoffer({ give: $state.snapshot(give), want: $state.snapshot(want) });
    give = emptyHand();
    want = emptyHand();
  }
</script>

<Modal title="Trade" wide {onclose}>
  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={tab === 'players'} onclick={() => (tab = 'players')}><Icon name="user" size={18} /> With players</button>
    <button role="tab" aria-selected={tab === 'market'} onclick={() => (tab = 'market')}><Icon name="trade" size={18} /> At the market</button>
  </div>

  {#if tab === 'players'}
    <div class="columns">
      <div>
        <h3>You give</h3>
        <ResourceStepper bind:value={give} max={hand} disabled={wanting} />
      </div>
      <div>
        <h3>You want</h3>
        <ResourceStepper bind:value={want} disabled={giving} />
      </div>
    </div>
    <div class="summary">
      {#if offerValid}
        <span>Offer <Bundle bundle={give} /> for <Bundle bundle={want} /></span>
      {:else if myOpen >= MAX_OPEN_TRADES}
        <span class="muted">You already have {MAX_OPEN_TRADES} open offers.</span>
      {:else}
        <span class="muted">Pick what you give and what you want. The first player to accept completes the trade.</span>
      {/if}
      <button class="btn btn--tight" disabled={!offerValid || busy} onclick={sendOffer}>Put offer on the table</button>
    </div>
  {:else}
    <p class="muted">Trade with the supply. Standard rate is 4:1; harbors you've settled beside improve it.</p>
    <div class="columns">
      <div>
        <h3>Give</h3>
        <div class="picks">
          {#each RESOURCES as r (r)}
            <button
              class="pick"
              aria-pressed={bankGive === r}
              disabled={hand[r] < controls.rates[r]}
              onclick={() => (bankGive = r)}
            >
              <Icon name={r} size={26} />
              <span>{RESOURCE_LABELS[r]}</span>
              <small>{controls.rates[r]}:1 · you have {hand[r]}</small>
            </button>
          {/each}
        </div>
      </div>
      <div>
        <h3>Get</h3>
        <div class="picks">
          {#each RESOURCES as r (r)}
            <button class="pick" aria-pressed={bankGet === r} disabled={r === bankGive || view.bank[r] === 0} onclick={() => (bankGet = r)}>
              <Icon name={r} size={26} />
              <span>{RESOURCE_LABELS[r]}</span>
              <small>{view.bank[r]} in supply</small>
            </button>
          {/each}
        </div>
      </div>
    </div>
    <div class="summary">
      {#if bankValid}
        <span>Trade <Bundle bundle={{ [bankGive]: bankRate }} /> for <Bundle bundle={{ [bankGet]: 1 }} /></span>
      {:else}
        <span class="muted">Choose one resource to give and one to get.</span>
      {/if}
      <button class="btn btn--sea btn--tight" disabled={!bankValid || busy} onclick={() => onbank({ give: bankGive, get: bankGet })}>Trade at market</button>
    </div>
  {/if}
</Modal>

<style>
  .tabs {
    display: flex;
    gap: 10px;
  }

  .tabs button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border-radius: 25px;
    border: 1px solid rgba(43, 33, 24, 0.14);
    background: #fffaf0;
    font-weight: 700;
    cursor: pointer;
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .tabs button[aria-selected='true'] {
    background: linear-gradient(135deg, var(--sea-1), var(--sea-2));
    color: #fff;
  }

  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 25px;
  }

  h3 {
    font-size: 0.8rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted);
    margin-bottom: 10px;
  }

  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 25px;
    flex-wrap: wrap;
  }

  .picks {
    display: grid;
    gap: 8px;
  }

  .pick {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 10px;
    align-items: center;
    text-align: left;
    padding: 8px 14px;
    border-radius: 25px;
    border: 1px solid rgba(43, 33, 24, 0.12);
    background: #fffaf0;
    cursor: pointer;
    color: var(--text);
  }

  .pick :global(svg) {
    grid-row: span 2;
  }

  .pick span {
    font-weight: 800;
  }

  .pick small {
    color: var(--text-muted);
  }

  .pick[aria-pressed='true'] {
    border-color: var(--sea);
    box-shadow: 0 0 0 3px rgba(35, 123, 147, 0.3);
  }

  .pick:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .columns {
      grid-template-columns: 1fr;
    }
  }
</style>
