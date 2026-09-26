<script>
  import Icon from '../ui/Icon.svelte';
  import Modal from '../ui/Modal.svelte';
  import { colorOf, inkOf } from '../../lib/theme.js';

  let { view, onclose, onhome } = $props();

  const winner = $derived(view.players[view.winner]);
  const standings = $derived(
    view.players
      .map((p, i) => ({ ...p, i }))
      .sort((a, b) => (b.totalVP ?? b.publicVP) - (a.totalVP ?? a.publicVP)),
  );
  const iWon = $derived(view.winner === view.me);
</script>

<Modal title={iWon ? 'You claimed the land!' : `${winner?.name} claimed the land!`} {onclose} wide>
  <div class="banner" style="--pc: {colorOf(winner)}">
    <span class="sun" aria-hidden="true"></span>
    <span class="trophy"><Icon name="trophy" size={44} /></span>
    <p>{iWon ? 'Real chutzpah. Well played.' : `${winner?.name} reached ${winner?.totalVP} points.`}</p>
  </div>

  <ol class="standings">
    {#each standings as p, rank (p.id)}
      <li style="--pc: {colorOf(p)}; --pink: {inkOf(p)}" class:first={p.i === view.winner}>
        <span class="rank">{rank + 1}</span>
        <span class="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
        <span class="name">
          {p.name}
          <small>
            {#if view.achievements.longestRoad?.player === p.i}Trailblazer ·{/if}
            {#if view.achievements.largestArmy?.player === p.i}Night Watch ·{/if}
            {p.landmarks ?? 0} landmark{p.landmarks === 1 ? '' : 's'} revealed
          </small>
        </span>
        <span class="points">{p.totalVP ?? p.publicVP}</span>
      </li>
    {/each}
  </ol>

  <div class="actions">
    <button class="btn btn--light btn--tight" onclick={onclose}>Look at the board</button>
    <button class="btn btn--tight" onclick={onhome}>Back to home</button>
  </div>
</Modal>

<style>
  .banner {
    position: relative;
    overflow: hidden;
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 32px 25px;
    border-radius: 25px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--pc) 70%, #2b2118), #1b2430);
    color: #fff;
    text-align: center;
    font-weight: 700;
  }

  .sun {
    position: absolute;
    inset: -60%;
    background: repeating-conic-gradient(from 0deg, rgba(243, 192, 96, 0.22) 0deg 10deg, transparent 10deg 20deg);
    animation: spin 24s linear infinite;
  }

  .trophy {
    position: relative;
    color: #f3c060;
    animation: rise 0.6s ease;
  }

  .banner p {
    position: relative;
  }

  .standings {
    list-style: none;
    display: grid;
    gap: 10px;
  }

  li {
    display: grid;
    grid-template-columns: 28px auto 1fr auto;
    align-items: center;
    gap: 14px;
    padding: 10px 18px 10px 14px;
    border-radius: 25px;
    background: #fffaf0;
    border-left: 6px solid var(--pc);
    box-shadow: var(--shadow);
  }

  li.first {
    background: linear-gradient(90deg, rgba(243, 192, 96, 0.35), #fffaf0);
  }

  .rank {
    font-weight: 900;
    color: var(--text-muted);
  }

  .avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--pc);
    color: var(--pink);
    font-weight: 900;
  }

  .name {
    display: grid;
    font-weight: 800;
  }

  .name small {
    font-weight: 500;
    color: var(--text-muted);
  }

  .points {
    font-size: 1.6rem;
    font-weight: 900;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
