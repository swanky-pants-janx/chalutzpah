<script>
  import { RESOURCE_LABELS } from '$engine';
  import Bundle from '../ui/Bundle.svelte';
  import Icon from '../ui/Icon.svelte';
  import { colorOf } from '../../lib/theme.js';

  let { view, privateLog = [] } = $props();

  const byId = $derived(Object.fromEntries(view.players.map((p) => [p.id, p])));
  const entries = $derived([...view.log, ...privateLog].sort((a, b) => a.seq - b.seq).slice(-80));

  let list = $state();
  $effect(() => {
    entries.length;
    if (list) requestAnimationFrame(() => list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }));
  });
</script>

<section class="card log">
  <h2>Chronicle</h2>
  <ol bind:this={list}>
    {#each entries as entry (entry.seq)}
      <li class="entry entry--{entry.kind}" class:private={entry.private}>
        {#if entry.private}<span class="lock" title="Only you can see this">only you</span>{/if}
        {#each entry.parts as part, k (k)}
          {#if typeof part === 'string'}
            {part}
          {:else if part.p}
            <b class="who" style="--pc: {colorOf(byId[part.p])}">{byId[part.p]?.name ?? part.name}</b>
          {:else if part.r}
            <Bundle bundle={part.r} size={15} />
          {:else if part.res}
            <span class="res"><Icon name={part.res} size={15} />{RESOURCE_LABELS[part.res]}</span>
          {:else if part.dice}
            <span class="dice">{part.dice[0]} + {part.dice[1]} = <b>{part.dice[0] + part.dice[1]}</b></span>
          {/if}
        {/each}
      </li>
    {/each}
  </ol>
</section>

<style>
  .log {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-height: 180px;
    padding-bottom: 12px;
  }

  h2 {
    font-size: 1.05rem;
    font-weight: 800;
  }

  ol {
    list-style: none;
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 4px;
    padding-right: 6px;
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .entry {
    padding: 4px 10px;
    border-radius: 12px;
  }

  .entry--turn {
    margin-top: 6px;
    background: rgba(43, 33, 24, 0.06);
    font-weight: 600;
  }

  .entry--jackal {
    color: #7a2a1c;
  }

  .entry--achievement,
  .entry--victory {
    background: linear-gradient(90deg, rgba(243, 192, 96, 0.35), transparent);
    font-weight: 700;
  }

  .entry--sunrise {
    margin-top: 6px;
    padding: 8px 12px;
    background: linear-gradient(90deg, rgba(234, 165, 58, 0.4), rgba(234, 165, 58, 0.06));
    font-weight: 800;
  }

  .entry--oasis {
    margin-top: 6px;
    padding: 8px 12px;
    background: linear-gradient(90deg, rgba(47, 147, 173, 0.25), rgba(47, 147, 173, 0.05));
    font-weight: 700;
  }

  .entry--event {
    margin-top: 6px;
    padding: 8px 12px;
    background: linear-gradient(90deg, rgba(217, 138, 43, 0.28), rgba(217, 138, 43, 0.06));
    font-weight: 700;
  }

  .entry--away {
    color: var(--text-muted);
    font-style: italic;
  }

  .private {
    background: rgba(35, 123, 147, 0.1);
  }

  .lock {
    margin-right: 6px;
    padding: 0 8px;
    border-radius: 25px;
    background: var(--sea);
    color: #fff;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .who {
    padding: 0 7px;
    border-radius: 25px;
    background: color-mix(in srgb, var(--pc) 28%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pc) 55%, transparent);
    color: var(--text);
  }

  .res {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    vertical-align: middle;
    font-weight: 600;
  }

  .dice {
    font-weight: 600;
  }
</style>
