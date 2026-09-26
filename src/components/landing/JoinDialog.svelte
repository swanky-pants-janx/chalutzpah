<script>
  import { NAME_MAX_LENGTH } from '$engine';
  import Modal from '../ui/Modal.svelte';
  import Icon from '../ui/Icon.svelte';
  import { callGame } from '../../lib/api.js';
  import { load, save } from '../../lib/storage.js';
  import { table } from '../../lib/table.svelte.js';
  import { toastError } from '../../lib/toasts.svelte.js';

  let { onclose, code: initialCode = '' } = $props();

  let username = $state(load('chalutzpah:name', ''));
  // svelte-ignore state_referenced_locally
  let code = $state(initialCode.toUpperCase());
  let busy = $state(false);

  const cleanCode = $derived(code.toUpperCase().replace(/[^A-Z0-9]/g, ''));

  async function submit(event) {
    event.preventDefault();
    busy = true;
    try {
      const res = await callGame('join', { code: cleanCode, username });
      save('chalutzpah:name', username.trim());
      history.replaceState(null, '', '/');
      await table.enter(res);
    } catch (err) {
      toastError(err);
      busy = false;
    }
  }
</script>

<Modal title="Join a table" {onclose}>
  <form class="form" onsubmit={submit}>
    <label class="field">
      <span>Your name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" bind:value={username} maxlength={NAME_MAX_LENGTH} placeholder="e.g. Janx" autofocus={!!initialCode} required />
    </label>
    <label class="field">
      <span>Game code</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="input input--code"
        bind:value={code}
        maxlength="7"
        placeholder="X7K4P"
        autocomplete="off"
        spellcheck="false"
        autofocus={!initialCode && !!username}
        required
      />
    </label>
    <button class="btn btn--big btn--sea btn--block btn--tight" disabled={busy || !username.trim() || cleanCode.length !== 5}>
      <Icon name="arrow-right" />
      {busy ? 'Finding your table…' : 'Join game'}
    </button>
  </form>
</Modal>

<style>
  .form {
    display: grid;
    gap: 25px;
  }
</style>
