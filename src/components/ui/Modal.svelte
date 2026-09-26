<script>
  import Icon from './Icon.svelte';

  /** @type {{ title: string, onclose?: () => void, locked?: boolean, wide?: boolean, children: any }} */
  let { title, onclose = null, locked = false, wide = false, children } = $props();

  function onkeydown(event) {
    if (event.key === 'Escape' && !locked && onclose) onclose();
  }
</script>

<svelte:window {onkeydown} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && !locked && onclose?.()}>
  <div class="card dialog" class:wide role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <h2>{title}</h2>
      {#if onclose && !locked}
        <button class="close" onclick={onclose} aria-label="Close"><Icon name="close" size={20} /></button>
      {/if}
    </header>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 25px;
    background: rgba(12, 17, 24, 0.62);
    backdrop-filter: blur(4px);
    animation: fade 0.18s ease;
  }

  .dialog {
    width: min(520px, 100%);
    max-height: calc(100vh - 50px);
    overflow: auto;
    padding: 32px;
    display: grid;
    gap: 25px;
    animation: rise 0.22s ease;
  }

  .dialog.wide {
    width: min(760px, 100%);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 25px;
  }

  h2 {
    font-size: 1.45rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .close {
    width: 40px;
    height: 40px;
    border-radius: 25px;
    border: 1px solid rgba(43, 33, 24, 0.14);
    background: #fffaf0;
    color: var(--text);
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: var(--shadow);
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
