<script>
  import { RESOURCES, RESOURCE_LABELS } from '$engine';
  import Icon from './Icon.svelte';

  /** Compact resource bundle, e.g. [icon]2 [icon]1 */
  let { bundle = {}, size = 18 } = $props();
</script>

<span class="bundle">
  {#each RESOURCES.filter((r) => bundle[r]) as r (r)}
    <span class="chip" title="{bundle[r]} {RESOURCE_LABELS[r]}">
      <Icon name={r} {size} />
      <b>{bundle[r]}</b>
    </span>
  {/each}
</span>

<style>
  .bundle {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    vertical-align: middle;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 8px 1px 4px;
    border-radius: 25px;
    background: rgba(43, 33, 24, 0.07);
    font-size: 0.85em;
  }

  :global(.card--dark) .chip {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
