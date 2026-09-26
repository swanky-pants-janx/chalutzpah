<script>
  import Modal from '../ui/Modal.svelte';
  import { colorOf, inkOf } from '../../lib/theme.js';

  let { view, victims, busy, onpick, onclose } = $props();
</script>

<Modal title="Who does the Jackal rob?" {onclose}>
  <p>Several neighbours live beside that tile. Pick one — you'll snatch a random card from them.</p>
  <div class="list">
    {#each victims as i (i)}
      {@const p = view.players[i]}
      <button class="victim" disabled={busy} style="--pc: {colorOf(p)}; --pink: {inkOf(p)}" onclick={() => onpick(i)}>
        <span class="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
        <span class="name">{p.name}</span>
        <span class="muted">{p.resourceCount} cards</span>
      </button>
    {/each}
  </div>
</Modal>

<style>
  .list {
    display: grid;
    gap: 10px;
  }

  .victim {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 14px;
    padding: 12px 18px 12px 12px;
    border-radius: 25px;
    border: 1px solid rgba(43, 33, 24, 0.12);
    border-left: 6px solid var(--pc);
    background: #fffaf0;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .victim:hover {
    background: #fff2dc;
  }

  .avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--pc);
    color: var(--pink);
    font-weight: 900;
  }

  .name {
    font-weight: 800;
  }
</style>
