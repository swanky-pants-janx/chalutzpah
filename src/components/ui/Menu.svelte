<script>
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';

  /** Left-side hamburger + slide-in drawer. `items`: [{ label, icon, onclick, danger? }] */
  let { items = [] } = $props();
  let open = $state(false);

  function choose(item) {
    open = false;
    item.onclick();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<button class="icon-btn burger" aria-label="Open menu" aria-expanded={open} onclick={() => (open = true)}>
  <Icon name="menu" />
</button>

{#if open}
  <div class="scrim" role="presentation" onclick={() => (open = false)}></div>
  <nav class="drawer" aria-label="Main menu">
    <div class="top">
      <Logo size="sm" />
      <button class="icon-btn" aria-label="Close menu" onclick={() => (open = false)}><Icon name="close" /></button>
    </div>
    <ul>
      {#each items as item (item.label)}
        <li>
          <button class="item" class:danger={item.danger} onclick={() => choose(item)}>
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  </nav>
{/if}

<style>
  .burger {
    flex: none;
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(12, 17, 24, 0.55);
    animation: fade 0.2s ease;
  }

  .drawer {
    position: fixed;
    z-index: 61;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(340px, 88vw);
    padding: 25px;
    display: grid;
    align-content: start;
    gap: 25px;
    background: linear-gradient(180deg, var(--ink-2), var(--ink));
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0 25px 25px 0;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.4);
    animation: slide 0.25s ease;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 25px;
  }

  ul {
    list-style: none;
    display: grid;
    gap: 10px;
  }

  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    border-radius: 25px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-light);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .item.danger {
    color: #ff9c8a;
  }

  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
