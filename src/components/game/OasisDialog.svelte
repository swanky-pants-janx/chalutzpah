<script>
  import { emptyHand, handSize } from '$engine';
  import Modal from '../ui/Modal.svelte';
  import ResourceStepper from './ResourceStepper.svelte';

  /** Oasis Day: pick resources of your choice from the supply. */
  let { need, supply, busy, onconfirm } = $props();

  let picked = $state(emptyHand());
  const chosen = $derived(handSize(picked));
</script>

<Modal title="Oasis Day!" locked>
  <p>You live beside the Oasis. Pick <b>{need}</b> resource{need === 1 ? '' : 's'} of your choice from the supply.</p>
  <ResourceStepper bind:value={picked} max={supply} total={need} />
  <button class="btn btn--sea btn--block btn--tight" disabled={busy || chosen !== need} onclick={() => onconfirm(picked)}>
    Gather {chosen}/{need}
  </button>
</Modal>
