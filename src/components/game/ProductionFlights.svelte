<script>
  import { TERRAIN_RESOURCE, TOPOLOGY } from '$engine';
  import Icon from '../ui/Icon.svelte';
  import { HEX_UNIT } from '../board/geometry.js';

  /**
   * Visible production: when the dice produce, a token flies from each
   * producing tile to whoever collects it — your hand card, or the other
   * player's badge. Purely visual; the state has already been updated.
   */
  let { view } = $props();

  let flights = $state([]);
  let seenRoll = null;
  let nextId = 0;

  $effect(() => {
    const roll = view.lastRoll;
    if (seenRoll === null) {
      seenRoll = roll?.seq ?? -1;
      return;
    }
    if (!roll || roll.seq === seenRoll) return;
    seenRoll = roll.seq;
    if (roll.total !== 7) launch(roll);
  });

  function launch(roll) {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const svg = document.querySelector('.board-wrap svg.board');
    const ctm = svg?.getScreenCTM();
    if (!ctm) return;

    // What each player actually received (the supply can run short).
    const gained = {};
    for (const entry of view.log) {
      if (entry.seq <= roll.seq || entry.kind !== 'gain') continue;
      const who = entry.parts.find((part) => part.p)?.p;
      const bundle = entry.parts.find((part) => part.r)?.r;
      if (who && bundle) gained[who] = bundle;
    }

    const batch = [];
    for (const hex of TOPOLOGY.hexes) {
      const tile = view.board.hexes[hex.id];
      const resource = TERRAIN_RESOURCE[tile.terrain];
      if (tile.number !== roll.total || !resource || hex.id === view.robber) continue;
      const point = svg.createSVGPoint();
      point.x = hex.x * HEX_UNIT;
      point.y = hex.y * HEX_UNIT;
      const from = point.matrixTransform(ctm);
      for (const vertex of hex.vertices) {
        const building = view.buildings[vertex];
        if (!building) continue;
        const player = view.players[building.owner];
        if (!gained[player.id]?.[resource]) continue;
        const target =
          building.owner === view.me
            ? document.querySelector(`[data-res="${resource}"]`)
            : document.querySelector(`[data-player-chip="${player.id}"]`);
        if (!target) continue;
        const box = target.getBoundingClientRect();
        batch.push({
          id: ++nextId,
          resource,
          double: building.kind === 'city',
          from: { x: from.x, y: from.y },
          to: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
          target,
          delay: 250 + batch.length * 90,
        });
      }
    }
    if (batch.length) flights = [...flights, ...batch];
  }

  function fly(node, flight) {
    const dx = flight.to.x - flight.from.x;
    const dy = flight.to.y - flight.from.y;
    const animation = node.animate(
      [
        { transform: 'translate(0, 0) scale(0.3)', opacity: 0 },
        { transform: `translate(${dx * 0.12}px, ${dy * 0.12 - 70}px) scale(1.2)`, opacity: 1, offset: 0.28 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.75)`, opacity: 1, offset: 0.9 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 1150, delay: flight.delay, easing: 'cubic-bezier(0.45, 0.05, 0.35, 1)', fill: 'both' },
    );
    animation.onfinish = () => {
      flight.target.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
        duration: 280,
        easing: 'ease-out',
      });
      flights = flights.filter((f) => f.id !== flight.id);
    };
    return { destroy: () => animation.cancel() };
  }
</script>

<div class="flights" aria-hidden="true">
  {#each flights as flight (flight.id)}
    <div class="token" style="left: {flight.from.x}px; top: {flight.from.y}px" use:fly={flight}>
      <Icon name={flight.resource} size={28} />
      {#if flight.double}<b>×2</b>{/if}
    </div>
  {/each}
</div>

<style>
  .flights {
    position: fixed;
    inset: 0;
    z-index: 45;
    pointer-events: none;
  }

  .token {
    position: absolute;
    width: 46px;
    height: 46px;
    margin: -23px 0 0 -23px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 35% 30%, #fffdf6, #efe0bf);
    border: 2px solid rgba(43, 33, 24, 0.3);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
    opacity: 0;
  }

  b {
    position: absolute;
    right: -8px;
    bottom: -6px;
    padding: 0 6px;
    border-radius: 25px;
    background: var(--pomegranate);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 900;
  }
</style>
