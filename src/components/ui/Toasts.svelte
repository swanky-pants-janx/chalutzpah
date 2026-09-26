<script>
  import { dismiss, toasts } from '../../lib/toasts.svelte.js';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <button class="toast toast--{t.kind}" onclick={() => dismiss(t.id)}>{t.message}</button>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    z-index: 80;
    left: 50%;
    bottom: 25px;
    transform: translateX(-50%);
    display: grid;
    gap: 10px;
    justify-items: center;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    max-width: min(560px, calc(100vw - 50px));
    padding: 14px 24px;
    border-radius: 25px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow: var(--shadow-lift);
    font-weight: 600;
    text-align: center;
    cursor: pointer;
    color: #fff;
    background: linear-gradient(135deg, var(--ink-3), var(--ink));
    animation: rise 0.25s ease;
  }

  .toast--error {
    background: linear-gradient(135deg, #c8423f, #8e1c30);
  }

  .toast--success {
    background: linear-gradient(135deg, #3d8a55, #245a36);
  }
</style>
