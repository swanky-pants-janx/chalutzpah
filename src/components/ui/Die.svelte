<script>
  let { value = 1, rolling = false, size = 56, tone = 'light' } = $props();

  const PIPS = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };
</script>

<div class="die die--{tone}" class:rolling style="--size: {size}px" aria-label="Die showing {value}">
  {#each Array.from({ length: 9 }, (_, i) => i + 1) as cell (cell)}
    <span class="cell">{#if PIPS[value]?.includes(cell)}<span class="pip"></span>{/if}</span>
  {/each}
</div>

<style>
  .die {
    width: var(--size);
    height: var(--size);
    padding: calc(var(--size) * 0.14);
    border-radius: calc(var(--size) * 0.24);
    display: grid;
    grid-template: repeat(3, 1fr) / repeat(3, 1fr);
    box-shadow:
      inset 0 -4px 0 rgba(0, 0, 0, 0.12),
      0 6px 16px rgba(0, 0, 0, 0.25);
    flex: none;
  }

  .die--light {
    background: linear-gradient(145deg, #fffaf0, #eadbb8);
    border: 1px solid rgba(43, 33, 24, 0.2);
  }

  .die--red {
    background: linear-gradient(145deg, #e0773f, #b3263e);
    border: 1px solid rgba(255, 255, 255, 0.25);
  }

  .cell {
    display: grid;
    place-items: center;
  }

  .pip {
    width: calc(var(--size) * 0.15);
    height: calc(var(--size) * 0.15);
    border-radius: 50%;
    background: #2b2118;
  }

  .die--red .pip {
    background: #fff4e0;
  }

  .rolling {
    animation: tumble 0.7s cubic-bezier(0.3, 0.7, 0.4, 1);
  }

  @keyframes tumble {
    0% {
      transform: translateY(-18px) rotate(-200deg) scale(0.8);
    }
    60% {
      transform: translateY(4px) rotate(20deg) scale(1.05);
    }
    100% {
      transform: none;
    }
  }
</style>
