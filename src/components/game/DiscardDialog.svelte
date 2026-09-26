<script>
  import { emptyHand, handSize } from '$engine';
  import Modal from '../ui/Modal.svelte';
  import ResourceStepper from './ResourceStepper.svelte';

  let { need, hand, busy, onconfirm } = $props();

  let picked = $state(emptyHand());
  const chosen = $derived(handSize(picked));
</script>

<Modal title="The Jackal prowls!" locked>
  <p>You're holding more than 7 cards. Choose <b>{need}</b> to give back to the supply.</p>
  <ResourceStepper bind:value={picked} max={hand} total={need} />
  <button class="btn btn--block btn--tight" disabled={busy || chosen !== need} onclick={() => onconfirm(picked)}>
    Discard {chosen}/{need}
  </button>
</Modal>
