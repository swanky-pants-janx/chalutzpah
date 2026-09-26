<script>
  import { RESOURCES, RESOURCE_LABELS, emptyHand, handSize } from '$engine';
  import Icon from '../ui/Icon.svelte';
  import Modal from '../ui/Modal.svelte';
  import ResourceStepper from './ResourceStepper.svelte';

  /** count = 2 (Bountiful Year, repeats allowed) or 1 (Chutzpah!, name one resource). */
  let { title, text, count, supply, busy, onpick, onclose } = $props();

  let picked = $state(emptyHand());
  let single = $state(null);

  function confirm() {
    if (count === 1) onpick([single]);
    else onpick(RESOURCES.flatMap((r) => Array(picked[r]).fill(r)));
  }
</script>

<Modal {title} {onclose}>
  <p>{text}</p>
  {#if count === 1}
    <div class="grid">
      {#each RESOURCES as r (r)}
        <button class="pick" aria-pressed={single === r} onclick={() => (single = r)}>
          <Icon name={r} size={34} />
          <span>{RESOURCE_LABELS[r]}</span>
        </button>
      {/each}
    </div>
  {:else}
    <ResourceStepper bind:value={picked} max={supply} total={count} />
  {/if}
  <button
    class="btn btn--block btn--tight"
    disabled={busy || (count === 1 ? !single : handSize(picked) !== count)}
    onclick={confirm}
  >
    Confirm
  </button>
</Modal>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
  }

  .pick {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 14px 6px;
    border-radius: 25px;
    border: 1px solid rgba(43, 33, 24, 0.12);
    background: #fffaf0;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .pick[aria-pressed='true'] {
    border-color: var(--pomegranate);
    box-shadow: 0 0 0 3px rgba(179, 38, 62, 0.3);
  }
</style>
