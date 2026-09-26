<script>
  import { play } from '../../lib/sound.svelte.js';
  import { table } from '../../lib/table.svelte.js';

  /** Countdown for a timed turn, synced to the server's clock. */
  let { deadline, seconds, mine = false } = $props();

  let now = $state(table.serverNow());
  $effect(() => {
    const timer = setInterval(() => (now = table.serverNow()), 250);
    return () => clearInterval(timer);
  });

  const left = $derived(Math.max(0, deadline - now));
  const secs = $derived(Math.ceil(left / 1000));
  const share = $derived(Math.min(100, (left / (seconds * 1000)) * 100));
  const label = $derived(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);

  let lastTick = null;
  $effect(() => {
    if (mine && secs > 0 && secs <= 5 && secs !== lastTick) {
      lastTick = secs;
      play('tick');
    }
  });
</script>

<div class="clock" class:urgent={secs <= 10} class:out={secs === 0} role="timer" aria-label="{secs} seconds left">
  <div class="bar"><span style="width: {share}%"></span></div>
  <span class="time">{secs === 0 ? "Time's up" : label}</span>
</div>

<style>
  .clock {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 12px;
  }

  .bar {
    height: 8px;
    border-radius: 25px;
    background: rgba(43, 33, 24, 0.1);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    border-radius: 25px;
    background: linear-gradient(90deg, #3d8a55, #86b454);
    transition: width 0.25s linear;
  }

  .time {
    min-width: 64px;
    text-align: right;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .urgent .bar span {
    background: linear-gradient(90deg, var(--brand-2), var(--brand-1));
  }

  .urgent .time {
    color: var(--pomegranate);
    animation: pulse 1s ease-in-out infinite;
  }

  .out .time {
    animation: none;
  }
</style>
