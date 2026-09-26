<script>
  import { VP_TARGETS } from '$engine';
  import { HOUSE_RULES } from '../../game/cards.js';

  /** Lobby settings: editable by the host, read-only for everyone else. */
  let { view, isHost, busy = false, onchange } = $props();

  const settings = $derived(view.settings);
  const seated = $derived(view.players.length);
</script>

<section class="card settings">
  <div class="head">
    <h2>Table settings</h2>
    {#if !isHost}<span class="muted small">Set by the host</span>{/if}
  </div>

  <div class="row">
    <span class="label">Players</span>
    <div class="segmented" role="group" aria-label="Maximum players">
      {#each [2, 3, 4] as n (n)}
        <button
          type="button"
          aria-pressed={settings.maxPlayers === n}
          disabled={!isHost || busy || n < seated}
          onclick={() => onchange({ maxPlayers: n })}>{n}</button
        >
      {/each}
    </div>
  </div>

  <div class="row">
    <span class="label">Points to win</span>
    <div class="segmented" role="group" aria-label="Points to win">
      {#each VP_TARGETS as n (n)}
        <button type="button" aria-pressed={settings.vpTarget === n} disabled={!isHost || busy} onclick={() => onchange({ vpTarget: n })}>
          {n}
        </button>
      {/each}
    </div>
  </div>

  <div class="rules">
    <span class="label">House rules</span>
    {#each HOUSE_RULES as rule (rule.key)}
      <button
        type="button"
        class="rule"
        class:on={settings[rule.key]}
        role="switch"
        aria-checked={settings[rule.key] === true}
        disabled={!isHost || busy}
        onclick={() => onchange({ [rule.key]: !settings[rule.key] })}
      >
        <span class="switch" aria-hidden="true"><span class="knob"></span></span>
        <span class="text">
          <b>{rule.name}</b>
          <small>{rule.text}</small>
        </span>
      </button>
    {/each}
  </div>
</section>

<style>
  .settings {
    display: grid;
    gap: 16px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  h2 {
    font-size: 1.35rem;
    font-weight: 800;
  }

  .small {
    font-size: 0.85rem;
  }

  .row {
    display: grid;
    gap: 8px;
  }

  .label {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .segmented button:disabled {
    cursor: not-allowed;
  }

  .segmented button:disabled:not([aria-pressed='true']) {
    opacity: 0.45;
  }

  .rules {
    display: grid;
    gap: 10px;
  }

  .rule {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-radius: 25px;
    border: 1px solid rgba(43, 33, 24, 0.1);
    background: #fffaf0;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    box-shadow: var(--shadow);
  }

  .rule:disabled {
    cursor: default;
  }

  .rule.on {
    border-color: rgba(212, 105, 59, 0.55);
    background: #fff3e2;
  }

  .switch {
    width: 44px;
    height: 26px;
    border-radius: 25px;
    background: #d8ccb4;
    position: relative;
    transition: background 0.2s ease;
    flex: none;
  }

  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.2s ease;
  }

  .on .switch {
    background: linear-gradient(135deg, var(--brand-1), var(--brand-2));
  }

  .on .knob {
    transform: translateX(18px);
  }

  .text {
    display: grid;
    gap: 2px;
  }

  .text small {
    color: var(--text-muted);
    line-height: 1.4;
  }
</style>
