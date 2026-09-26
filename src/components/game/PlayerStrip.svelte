<script>
  import { landmarkCount } from '$engine';
  import Icon from '../ui/Icon.svelte';
  import { ACHIEVEMENT_TEXT } from '../../game/cards.js';
  import { colorOf, inkOf } from '../../lib/theme.js';

  let { view, online } = $props();
</script>

<ol class="strip" class:many={view.players.length > 4} aria-label="Players">
  {#each view.players as p, i (p.id)}
    {@const isMe = i === view.me}
    {@const current = view.turn?.current === i && view.status !== 'finished'}
    {@const hidden = isMe ? landmarkCount(p) : 0}
    <li class="chip" data-player-chip={p.id} class:current class:me={isMe} class:away={!online.has(p.id) || p.left} style="--pc: {colorOf(p)}; --pink: {inkOf(p)}">
      <span class="avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
      <div class="info">
        <span class="name">
          {p.name}{#if isMe}<em> · you</em>{/if}
          {#if p.left}<span class="tag">left</span>{:else if !online.has(p.id)}<span class="tag">away</span>{/if}
        </span>
        <span class="stats">
          <span title="Resource cards in hand"><Icon name="cards" size={15} />{p.resourceCount}</span>
          <span title="Chutzpah cards in hand"><Icon name="devCard" size={15} />{p.devCardCount}</span>
          <span title="Watchmen called"><Icon name="shield" size={15} />{p.knightsPlayed}</span>
          <span title="Longest trail"><Icon name="trail" size={15} />{view.roadLengths?.[i] ?? 0}</span>
          {#if view.achievements.longestRoad?.player === i}
            <span class="award" title={ACHIEVEMENT_TEXT.longestRoad}><Icon name="trail" size={15} />Trailblazer</span>
          {/if}
          {#if view.achievements.largestArmy?.player === i}
            <span class="award" title={ACHIEVEMENT_TEXT.largestArmy}><Icon name="shield" size={15} />Night Watch</span>
          {/if}
        </span>
      </div>
      <span class="vp" title={hidden ? `${p.publicVP} public + ${hidden} secret landmark${hidden > 1 ? 's' : ''}` : 'Victory points'}>
        {#if view.status === 'finished'}{p.totalVP}{:else}{p.publicVP + hidden}{#if hidden}<small>*</small>{/if}{/if}
      </span>
    </li>
  {/each}
</ol>

<style>
  .strip {
    list-style: none;
    display: flex;
    gap: 16px;
    min-width: 0;
    overflow-x: auto;
    padding: 4px;
  }

  .chip {
    flex: 1 1 0;
    min-width: 170px;
    max-width: 320px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 10px 14px 10px 10px;
    border-radius: 25px;
    background: linear-gradient(180deg, rgba(51, 69, 93, 0.7), rgba(27, 36, 48, 0.85));
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: var(--shadow);
    transition:
      transform 0.25s ease,
      box-shadow 0.25s ease,
      border-color 0.25s ease;
  }

  .chip.current {
    border-color: var(--pc);
    box-shadow:
      0 0 0 2px var(--pc),
      0 8px 26px rgba(0, 0, 0, 0.35);
    transform: translateY(-2px);
  }

  .chip.away {
    opacity: 0.65;
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 900;
    background: var(--pc);
    color: var(--pink);
    border: 2px solid rgba(0, 0, 0, 0.35);
  }

  .current .avatar {
    animation: breathe 1.6s ease-in-out infinite;
  }

  .info {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .name {
    font-weight: 800;
    font-size: 0.95rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name em {
    font-style: normal;
    font-weight: 600;
    color: var(--text-light-muted);
  }

  .tag {
    margin-left: 6px;
    padding: 1px 8px;
    border-radius: 25px;
    font-size: 0.7rem;
    font-weight: 700;
    background: rgba(226, 87, 76, 0.25);
    color: #ffb4a8;
  }

  .stats {
    display: flex;
    flex-wrap: nowrap;
    overflow: hidden;
    gap: 4px 10px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-light-muted);
  }

  .stats > span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .award {
    color: #f3c060;
  }

  .vp {
    min-width: 44px;
    height: 44px;
    padding-inline: 8px;
    border-radius: 25px;
    display: grid;
    place-items: center;
    grid-auto-flow: column;
    font-size: 1.35rem;
    font-weight: 900;
    background: linear-gradient(135deg, #f3c060, #d98a2b);
    color: #2b2118;
  }

  .vp small {
    font-size: 0.8rem;
  }

  .many .chip {
    min-width: 140px;
    gap: 8px;
    padding: 8px 10px 8px 8px;
  }

  .many .avatar {
    width: 32px;
    height: 32px;
  }

  .many .vp {
    min-width: 36px;
    height: 36px;
    font-size: 1.1rem;
  }

  /* with 5–6 players, keep cards and Chutzpah cards; titles still show */
  .many .stats > span:nth-child(3),
  .many .stats > span:nth-child(4) {
    display: none;
  }

  @media (max-width: 1400px) {
    .strip {
      gap: 10px;
    }
    .chip {
      gap: 8px;
      padding: 8px 10px 8px 8px;
    }
    .avatar {
      width: 34px;
      height: 34px;
    }
    .vp {
      min-width: 38px;
      height: 38px;
      font-size: 1.15rem;
    }
    .stats {
      gap: 4px 7px;
    }
  }

  @keyframes breathe {
    50% {
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--pc) 35%, transparent);
    }
  }
</style>
