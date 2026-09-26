<script>
  import { NAME_MAX_LENGTH, VP_TARGETS } from '$engine';
  import Modal from '../ui/Modal.svelte';
  import Icon from '../ui/Icon.svelte';
  import { callGame } from '../../lib/api.js';
  import { load, save } from '../../lib/storage.js';
  import { table } from '../../lib/table.svelte.js';
  import { toastError } from '../../lib/toasts.svelte.js';

  let { onclose } = $props();

  let username = $state(load('chalutzpah:name', ''));
  let maxPlayers = $state(4);
  let vpTarget = $state(10);
  let busy = $state(false);

  async function submit(event) {
    event.preventDefault();
    busy = true;
    try {
      const res = await callGame('create', { username, settings: { maxPlayers, vpTarget } });
      save('chalutzpah:name', username.trim());
      await table.enter(res);
    } catch (err) {
      toastError(err);
      busy = false;
    }
  }
</script>

<Modal title="Host a table" {onclose}>
  <form class="form" onsubmit={submit}>
    <label class="field">
      <span>Your name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" bind:value={username} maxlength={NAME_MAX_LENGTH} placeholder="e.g. Janx" autofocus required />
    </label>

    <div class="field">
      <span>Players</span>
      <div class="segmented" role="group" aria-label="Maximum players">
        {#each [2, 3, 4] as n (n)}
          <button type="button" aria-pressed={maxPlayers === n} onclick={() => (maxPlayers = n)}>{n}</button>
        {/each}
      </div>
    </div>

    <div class="field">
      <span>Points to win</span>
      <div class="segmented" role="group" aria-label="Points to win">
        {#each VP_TARGETS as n (n)}
          <button type="button" aria-pressed={vpTarget === n} onclick={() => (vpTarget = n)}>
            {n}{n === 10 ? ' · classic' : n === 8 ? ' · quick' : ' · long'}
          </button>
        {/each}
      </div>
    </div>

    <p class="muted hint">You'll get a short code to share on Discord, and you can roll the island until you like it.</p>

    <button class="btn btn--big btn--block btn--tight" disabled={busy || !username.trim()}>
      <Icon name="crown" />
      {busy ? 'Setting the table…' : 'Create game'}
    </button>
  </form>
</Modal>

<style>
  .form {
    display: grid;
    gap: 25px;
  }

  .hint {
    font-size: 0.95rem;
  }
</style>
