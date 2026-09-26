<script>
  import { RESOURCES, RESOURCE_LABELS } from '$engine';
  import Icon from '../ui/Icon.svelte';

  /** Pick counts per resource. `max` limits each resource (e.g. to your hand). */
  let { value = $bindable(), max = {}, total = Infinity, disabled = {} } = $props();

  const sum = $derived(RESOURCES.reduce((n, r) => n + (value[r] ?? 0), 0));

  function change(r, delta) {
    const next = (value[r] ?? 0) + delta;
    if (next < 0 || next > (max[r] ?? 19) || (delta > 0 && sum >= total)) return;
    value = { ...value, [r]: next };
  }
</script>

<div class="stepper">
  {#each RESOURCES as r (r)}
    <div class="row" class:off={disabled[r]}>
      <span class="res"><Icon name={r} size={24} />{RESOURCE_LABELS[r]}</span>
      <button type="button" aria-label="Less {RESOURCE_LABELS[r]}" disabled={!value[r] || disabled[r]} onclick={() => change(r, -1)}>−</button>
      <span class="n">{value[r] ?? 0}</span>
      <button
        type="button"
        aria-label="More {RESOURCE_LABELS[r]}"
        disabled={disabled[r] || (value[r] ?? 0) >= (max[r] ?? 19) || sum >= total}
        onclick={() => change(r, 1)}>+</button
      >
    </div>
  {/each}
</div>

<style>
  .stepper {
    display: grid;
    gap: 8px;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 40px 36px 40px;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 14px;
    border-radius: 25px;
    background: #fffaf0;
    border: 1px solid rgba(43, 33, 24, 0.08);
  }

  .row.off {
    opacity: 0.4;
  }

  .res {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
  }

  button {
    width: 40px;
    height: 40px;
    border-radius: 25px;
    border: 1px solid rgba(43, 33, 24, 0.15);
    background: linear-gradient(135deg, #fff, var(--parchment-2));
    font-size: 1.3rem;
    font-weight: 800;
    cursor: pointer;
    color: var(--text);
    box-shadow: var(--shadow);
  }

  button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .n {
    text-align: center;
    font-size: 1.2rem;
    font-weight: 900;
  }
</style>
