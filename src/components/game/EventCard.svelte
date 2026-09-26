<script>
  import { EVENTS } from '$engine';
  import Icon from '../ui/Icon.svelte';

  /** Chaos mode: the event that's in force this round. */
  let { chaos } = $props();

  const event = $derived(chaos?.current ? EVENTS[chaos.current] : null);
</script>

{#if event}
  {#key `${chaos.current}:${chaos.round}`}
    <aside class="event event--{event.tone}" aria-live="polite">
      <span class="icon"><Icon name={event.icon} size={26} /></span>
      <div class="body">
        <span class="eyebrow">Round {chaos.round} · chaos</span>
        <b>{event.name}</b>
        <small>{event.text}</small>
      </div>
    </aside>
  {/key}
{/if}

<style>
  .event {
    position: absolute;
    top: 16px;
    left: 16px;
    z-index: 2;
    width: min(300px, calc(100% - 32px));
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: start;
    padding: 14px 16px;
    border-radius: 25px;
    background: linear-gradient(160deg, #fffaf0, var(--parchment-2));
    color: var(--text);
    border: 2px solid var(--tone);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    transform-origin: top left;
    animation: flip-in 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }

  .event--good {
    --tone: #3d8a55;
  }
  .event--bad {
    --tone: #b3263e;
  }
  .event--wild {
    --tone: #d98a2b;
  }

  .icon {
    width: 44px;
    height: 44px;
    border-radius: 25px;
    display: grid;
    place-items: center;
    background: var(--tone);
    color: #fff;
  }

  .body {
    display: grid;
    gap: 2px;
  }

  .eyebrow {
    font-size: 0.66rem;
  }

  b {
    font-size: 1.05rem;
    font-weight: 900;
  }

  small {
    color: var(--text-muted);
    line-height: 1.35;
  }

  @keyframes flip-in {
    from {
      opacity: 0;
      transform: perspective(600px) rotateY(-90deg) scale(0.9);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
