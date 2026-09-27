<script module>
  import { TERRAIN_LABELS, HARBOR_LABELS } from '$engine';
  import { geometryFor } from './geometry.js';

  const pips = (n) => 6 - Math.abs(7 - n);

  // Decorative art offsets around the number token (R = 100 units).
  const TREES = [
    [-46, -28, 0.95],
    [-10, -56, 0.8],
    [36, -38, 1],
    [52, 14, 0.8],
    [-50, 22, 0.85],
    [-8, 50, 0.95],
    [34, 46, 0.75],
  ];
  const ROCKS = [
    [0, -46, 1.15],
    [-46, 30, 0.85],
    [44, 30, 0.9],
  ];
  const GOATS = [
    [-42, -30],
    [36, -34],
    [-40, 34],
    [40, 30],
  ];
  const BRICKS = [
    [-40, -30],
    [40, -30],
    [0, 52],
  ];
</script>

<script>
  import Icon from '../ui/Icon.svelte';
  import { TERRAIN_COLORS, colorOf } from '../../lib/theme.js';

  /**
   * @typedef {{ vertices: number[], edges: number[], hexes: number[] }} Targets
   * @type {{ view: any, targets?: Targets, targetColor?: string, preview?: boolean, shuffling?: boolean,
   *          onvertex?: (v: number) => void, onedge?: (e: number) => void, onhex?: (h: number) => void }}
   */
  let {
    view,
    targets = { vertices: [], edges: [], hexes: [] },
    targetColor = '#f3c060',
    preview = false,
    shuffling = false,
    onvertex = () => {},
    onedge = () => {},
    onhex = () => {},
  } = $props();

  const board = $derived(view.board);
  const G = $derived(geometryFor(board.layout));
  // Oasis mode: the Dunes are an Oasis that pays out on a 7.
  const oasis = $derived(view.settings?.oasis === true);
  const buildings = $derived(preview ? [] : Object.entries(view.buildings ?? {}).map(([v, b]) => ({ v: Number(v), ...b })));
  const roads = $derived(preview ? [] : Object.entries(view.roads ?? {}).map(([e, owner]) => ({ e: Number(e), owner })));

  // Glow the tiles that produced on the latest roll for a couple of seconds.
  // (The timer lives outside the effect: every state update re-runs the effect,
  // and an effect cleanup would cancel the fade-out.)
  let glowNumber = $state(null);
  let lastGlowSeq = null;
  let glowTimer = null;
  $effect(() => {
    const roll = view.lastRoll;
    if (lastGlowSeq === null) {
      lastGlowSeq = roll?.seq ?? -1;
      return;
    }
    if (!roll || roll.seq === lastGlowSeq) return;
    lastGlowSeq = roll.seq;
    if (roll.total === 7) return;
    glowNumber = roll.total;
    clearTimeout(glowTimer);
    glowTimer = setTimeout(() => (glowNumber = null), 2600);
  });
  $effect(() => () => clearTimeout(glowTimer));

  const playerFill = (idx) => colorOf(view.players?.[idx]);
  const isLight = (idx) => view.players?.[idx]?.color === 'almond';
</script>

<svg class="board" viewBox={G.viewBoxAttr} preserveAspectRatio="xMidYMid meet" role="img" aria-label="The island">
  <defs>
    {#each Object.entries(TERRAIN_COLORS) as [terrain, [light, dark]] (terrain)}
      <linearGradient id="terrain-{terrain}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color={light} />
        <stop offset="1" stop-color={dark} />
      </linearGradient>
    {/each}
    <linearGradient id="terrain-oasis" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e6e7a8" />
      <stop offset="1" stop-color="#b9d38a" />
    </linearGradient>
    <radialGradient id="sea" cx="50%" cy="45%" r="65%">
      <stop offset="0" stop-color="#2f93ad" />
      <stop offset="0.7" stop-color="#1d6a80" />
      <stop offset="1" stop-color="#134c5d" />
    </radialGradient>
    <pattern id="waves" width="80" height="40" patternUnits="userSpaceOnUse">
      <path d="M0 20 Q20 8 40 20 T80 20" stroke="rgba(255,255,255,0.09)" stroke-width="3" fill="none" />
    </pattern>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.28" />
    </filter>
  </defs>

  <!-- Sea -->
  {#if G.frame.kind === 'polygon'}
    <polygon points={G.frame.points} fill="url(#sea)" stroke="#134c5d" stroke-width="40" stroke-linejoin="round" />
    <polygon points={G.frame.points} fill="url(#waves)" />
  {:else}
    <rect x={G.frame.x} y={G.frame.y} width={G.frame.width} height={G.frame.height} rx={G.frame.rx} fill="url(#sea)" stroke="#134c5d" stroke-width="40" />
    <rect x={G.frame.x} y={G.frame.y} width={G.frame.width} height={G.frame.height} rx={G.frame.rx} fill="url(#waves)" />
  {/if}

  <!-- Harbors -->
  {#each board.harbors as harbor (harbor.edge)}
    {@const g = G.harbor(harbor.edge)}
    <g class="harbor">
      <title>{HARBOR_LABELS[harbor.type]}</title>
      <line x1={g.a.x} y1={g.a.y} x2={g.x} y2={g.y} class="pier" />
      <line x1={g.b.x} y1={g.b.y} x2={g.x} y2={g.y} class="pier" />
      <circle cx={g.x} cy={g.y} r="36" class="harbor-badge" class:any={harbor.type === 'any'} />
      {#if harbor.type === 'any'}
        <text x={g.x} y={g.y + 8} class="harbor-text">3:1</text>
      {:else}
        <g transform="translate({g.x - 17} {g.y - 31})"><Icon name={harbor.type} size={34} /></g>
        <text x={g.x} y={g.y + 22} class="harbor-text small">2:1</text>
      {/if}
    </g>
  {/each}

  <!-- Shoreline -->
  {#each G.shorePoints as points, i (i)}
    <polygon {points} class="shore" />
  {/each}

  <!-- Tiles -->
  {#key `${board.layout}:${board.seed}`}
    <g class="tiles" class:shuffling>
      {#each board.hexes as tile, i (i)}
        {@const h = G.H[i]}
        <g
          class="tile"
          class:glow={glowNumber !== null && tile.number === glowNumber && view.robber !== i}
          style="--delay: {h.ring * 90 + ((i * 37) % 60)}ms"
        >
          <title>{tile.terrain === 'hidden' ? 'Unknown land — revealed at sunrise' : oasis && tile.terrain === 'dunes' ? 'Oasis · pays out on a 7' : `${TERRAIN_LABELS[tile.terrain]}${tile.number ? ` · ${tile.number}` : ''}`}</title>
          <polygon points={G.tilePoints[i]} fill="url(#terrain-{oasis && tile.terrain === 'dunes' ? 'oasis' : tile.terrain})" class="tile-face" />
          <g transform="translate({h.x} {h.y})" class="art">
            {#if tile.terrain === 'grove'}
              {#each TREES as [x, y, s] (`${x},${y}`)}
                <g transform="translate({x} {y}) scale({s})">
                  <rect x="-3" y="6" width="6" height="12" rx="2" fill="#5b3a1e" />
                  <path d="M0 -24 L15 -5 L7 -5 L18 10 L-18 10 L-7 -5 L-15 -5 Z" fill="#1d4a2a" />
                  <path d="M0 -24 L15 -5 L7 -5 L18 10 L2 10 Z" fill="#153a20" opacity="0.6" />
                </g>
              {/each}
            {:else if tile.terrain === 'claypit'}
              {#each BRICKS as [x, y] (`${x},${y}`)}
                <g transform="translate({x} {y})">
                  <rect x="-20" y="2" width="19" height="11" rx="2" fill="#8f3f22" />
                  <rect x="1" y="2" width="19" height="11" rx="2" fill="#a54a28" />
                  <rect x="-10" y="-10" width="20" height="11" rx="2" fill="#b95a33" />
                </g>
              {/each}
              <ellipse cx="-50" cy="24" rx="14" ry="7" fill="#8f3f22" opacity="0.55" />
              <ellipse cx="50" cy="22" rx="14" ry="7" fill="#8f3f22" opacity="0.55" />
            {:else if tile.terrain === 'pasture'}
              <path d="M-70 18 Q-35 0 0 16 T70 14" stroke="#6f9a40" stroke-width="5" fill="none" opacity="0.5" />
              <path d="M-66 -12 Q-30 -28 4 -14 T66 -16" stroke="#6f9a40" stroke-width="5" fill="none" opacity="0.4" />
              {#each GOATS as [x, y] (`${x},${y}`)}
                <g transform="translate({x} {y})">
                  <ellipse cx="0" cy="0" rx="13" ry="9" fill="#fbf7ee" stroke="#6f6553" stroke-width="2" />
                  <circle cx="12" cy="-6" r="5.5" fill="#4a3f33" />
                  <path d="M10 -11 L8 -17 M14 -11 L16 -17" stroke="#4a3f33" stroke-width="2" stroke-linecap="round" />
                  <path d="M-7 8 v6 M6 8 v6" stroke="#4a3f33" stroke-width="2.4" stroke-linecap="round" />
                </g>
              {/each}
            {:else if tile.terrain === 'terraces'}
              {#each [-58, -34, 34, 58] as y (y)}
                <path d="M{-Math.min(70, 132 - Math.abs(y) * 1.2)} {y} Q0 {y - 10} {Math.min(70, 132 - Math.abs(y) * 1.2)} {y}" stroke="#b9861d" stroke-width="5" fill="none" stroke-linecap="round" />
              {/each}
              {#each [[-50, -8], [50, -8], [-46, 14], [46, 14]] as [x, y] (`${x},${y}`)}
                <g transform="translate({x} {y})" stroke="#9c7419" stroke-width="2.4" stroke-linecap="round">
                  <path d="M0 10 V-12 M-5 8 L-2 -8 M5 8 L2 -8" />
                  <circle cx="0" cy="-14" r="3.2" fill="#f6d77a" stroke="none" />
                </g>
              {/each}
            {:else if tile.terrain === 'quarry'}
              {#each ROCKS as [x, y, s] (`${x},${y}`)}
                <g transform="translate({x} {y}) scale({s})">
                  <path d="M-32 18 L-10 -22 L2 -8 L12 -20 L32 18 Z" fill="#5c636e" />
                  <path d="M-10 -22 L-2 -6 L-16 8 Z" fill="#c9cfd6" opacity="0.8" />
                  <path d="M12 -20 L20 -2 L6 4 Z" fill="#c9cfd6" opacity="0.6" />
                </g>
              {/each}
            {:else if tile.terrain === 'hidden'}
              {#each [[-44, -40, 2.6], [30, -52, 2], [52, -6, 2.4], [-54, 18, 2], [-10, 52, 2.6], [40, 44, 1.8], [8, -20, 1.6]] as [x, y, r] (`${x},${y}`)}
                <circle cx={x} cy={y} {r} fill="#f7efdc" opacity="0.75" />
              {/each}
              <text y="16" class="hidden-mark">?</text>
            {:else if tile.terrain === 'dunes' && oasis}
              <ellipse cx="0" cy="30" rx="58" ry="26" fill="#2f93ad" stroke="#8cc6a0" stroke-width="7" />
              <path d="M-34 26 Q-16 18 2 26 M8 36 Q24 28 40 36" stroke="#bfe8f2" stroke-width="3.5" fill="none" stroke-linecap="round" />
              {#each [[-50, -26, 1], [48, -30, 0.9], [4, -58, 0.75]] as [x, y, s] (`${x},${y}`)}
                <g transform="translate({x} {y}) scale({s})">
                  <path d="M0 26 Q4 0 0 -24" stroke="#7a5230" stroke-width="5" fill="none" stroke-linecap="round" />
                  <path d="M0 -24 Q-22 -32 -32 -14 M0 -24 Q-14 -40 -30 -36 M0 -24 Q18 -40 32 -30 M0 -24 Q22 -28 30 -10 M0 -24 Q2 -44 12 -46" stroke="#2f7a45" stroke-width="6" fill="none" stroke-linecap="round" />
                </g>
              {/each}
            {:else if tile.terrain === 'dunes'}
              <circle cx="36" cy="-40" r="15" fill="#f6c95c" opacity="0.9" />
              <path d="M-72 30 Q-30 4 8 28 T74 24" stroke="#c9a65e" stroke-width="6" fill="none" stroke-linecap="round" />
              <path d="M-60 54 Q-20 32 20 52 T64 50" stroke="#c9a65e" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7" />
              <g transform="translate(-18 4)">
                <path d="M0 26 Q4 0 0 -24" stroke="#7a5230" stroke-width="5" fill="none" stroke-linecap="round" />
                <path d="M0 -24 Q-22 -32 -32 -14 M0 -24 Q-14 -40 -30 -36 M0 -24 Q18 -40 32 -30 M0 -24 Q22 -28 30 -10 M0 -24 Q2 -44 12 -46" stroke="#3d7a45" stroke-width="6" fill="none" stroke-linecap="round" />
              </g>
            {/if}
          </g>
          {#if oasis && tile.terrain === 'dunes'}
            <g class="token oasis-token" transform="translate({h.x} {h.y - 4})">
              <circle r="27" class="token-disc" />
              <text y="8" class="token-number">7</text>
            </g>
          {/if}
          {#if tile.number}
            <g class="token" class:hot={tile.number === 6 || tile.number === 8} transform="translate({h.x} {h.y})">
              <circle r="31" class="token-disc" />
              <text y="8" class="token-number">{tile.number}</text>
              <g transform="translate({-(pips(tile.number) - 1) * 4} 19)">
                {#each Array.from({ length: pips(tile.number) }, (_, k) => k) as k (k)}
                  <circle cx={k * 8} r="2.4" class="pip" />
                {/each}
              </g>
            </g>
          {/if}
        </g>
      {/each}
    </g>
  {/key}

  <!-- Jackal destinations sit under the pieces so buildings stay crisp -->
  {#each targets.hexes as hex (hex)}
    <polygon
      points={G.tilePoints[hex]}
      class="target-hex"
      data-hex={hex}
      role="button"
      tabindex="0"
      aria-label="Send the Jackal to {TERRAIN_LABELS[board.hexes[hex].terrain]}"
      onclick={() => onhex(hex)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onhex(hex)}
    />
  {/each}

  <!-- The Jackal -->
  {#if view.robber != null && !preview}
    {@const h = G.H[view.robber]}
    {@const hasNumber = board.hexes[view.robber].number != null}
    <g class="jackal" style="transform: translate({h.x + (hasNumber ? 44 : 0)}px, {h.y + (hasNumber ? 6 : 0)}px)" filter="url(#soft)">
      <title>The Jackal</title>
      <ellipse cx="0" cy="30" rx="26" ry="8" fill="#000" opacity="0.3" />
      <path d="M-26 -30 L-10 -12 H10 L26 -30 L25 -2 L18 14 L0 30 L-18 14 L-25 -2 Z" fill="#231a14" stroke="#f3c060" stroke-width="2.5" stroke-linejoin="round" />
      <circle cx="-8" cy="0" r="3.2" fill="#f3c060" />
      <circle cx="8" cy="0" r="3.2" fill="#f3c060" />
      <path d="M-4 16 L0 20 L4 16" stroke="#f3c060" stroke-width="2" fill="none" />
    </g>
  {/if}

  <!-- Trails -->
  {#each roads as road (road.e)}
    {@const s = G.edgeSegments[road.e]}
    <g class="road">
      <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="road-under" />
      <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="road-top" stroke={playerFill(road.owner)} />
    </g>
  {/each}

  <!-- Homesteads & Kibbutzim -->
  {#each buildings as b (b.v)}
    {@const p = G.V[b.v]}
    <g transform="translate({p.x} {p.y})" filter="url(#soft)">
      <g class="building">
      <title>{view.players?.[b.owner]?.name}'s {b.kind === 'city' ? 'Kibbutz' : 'Homestead'}</title>
      {#if b.kind === 'settlement'}
        <path d="M-16 13 V-4 L0 -18 L16 -4 V13 Z" fill={playerFill(b.owner)} class="piece-outline" />
        <rect x="-4" y="1" width="8" height="12" rx="1.5" fill={isLight(b.owner) ? '#9b8664' : 'rgba(0,0,0,0.35)'} />
      {:else}
        <path d="M-27 15 V-2 L-14 -13 L-1 -2 V15 Z" fill={playerFill(b.owner)} class="piece-outline" />
        <path d="M-1 15 V-6 H25 V15 Z" fill={playerFill(b.owner)} class="piece-outline" />
        <path d="M6 -6 L7 -18 M20 -6 L19 -18" class="tower-leg" />
        <rect x="3" y="-32" width="20" height="14" rx="4" fill={playerFill(b.owner)} class="piece-outline" />
        <rect x="-18" y="2" width="7" height="13" rx="1.5" fill={isLight(b.owner) ? '#9b8664' : 'rgba(0,0,0,0.35)'} />
        <path d="M4 3 h5 M14 3 h5" stroke={isLight(b.owner) ? '#9b8664' : 'rgba(0,0,0,0.35)'} stroke-width="4" stroke-linecap="round" />
      {/if}
      </g>
    </g>
  {/each}

  <!-- Move targets -->
  {#each targets.edges as edge (edge)}
    {@const s = G.edgeSegments[edge]}
    <g
      class="target-edge"
      data-edge={edge}
      role="button"
      tabindex="0"
      aria-label="Blaze a trail here"
      style="--target: {targetColor}"
      onclick={() => onedge(edge)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onedge(edge)}
    >
      <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="hit" />
      <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="mark" />
    </g>
  {/each}
  {#each targets.vertices as vertex (vertex)}
    {@const p = G.V[vertex]}
    <g
      class="target-vertex"
      data-vertex={vertex}
      class:upgrade={buildings.some((b) => b.v === vertex)}
      role="button"
      tabindex="0"
      aria-label="Build here"
      style="--target: {targetColor}"
      transform="translate({p.x} {p.y})"
      onclick={() => onvertex(vertex)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onvertex(vertex)}
    >
      <circle r="26" class="hit" />
      <circle r="15" class="mark" />
    </g>
  {/each}
</svg>

<style>
  .board {
    width: 100%;
    height: 100%;
    user-select: none;
  }

  .shore {
    fill: #e9d49c;
    stroke: #e9d49c;
    stroke-width: 18;
    stroke-linejoin: round;
  }

  .tile {
    transform-box: fill-box;
    transform-origin: center;
    animation: tile-in 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
    animation-delay: var(--delay);
  }

  .tile-face {
    stroke: rgba(43, 33, 24, 0.22);
    stroke-width: 3;
  }

  .tile.glow .tile-face {
    stroke: #fff2c4;
    stroke-width: 9;
    animation: glow 0.9s ease-in-out 3;
  }

  .shuffling .tile {
    animation: shuffle 0.5s ease-in-out infinite alternate;
    animation-delay: var(--delay);
  }

  .art {
    pointer-events: none;
  }

  .token-disc {
    fill: #f8f0dc;
    stroke: #b59d6d;
    stroke-width: 3;
  }

  .token-number {
    text-anchor: middle;
    font-size: 30px;
    font-weight: 800;
    fill: #2b2118;
    font-family: var(--font);
  }

  .pip {
    fill: #2b2118;
  }

  .token.hot .token-number,
  .token.hot .pip {
    fill: #b3263e;
  }

  .hidden-mark {
    text-anchor: middle;
    font-size: 46px;
    font-weight: 900;
    fill: rgba(247, 239, 220, 0.28);
    font-family: var(--font);
  }

  .oasis-token .token-disc {
    fill: #e3f5f2;
    stroke: #2f93ad;
    stroke-width: 4;
  }

  .oasis-token .token-number {
    fill: #1d6a80;
  }

  .pier {
    stroke: #8a6a44;
    stroke-width: 7;
    stroke-linecap: round;
    stroke-dasharray: 2 7;
  }

  .harbor-badge {
    fill: #f8f0dc;
    stroke: #8a6a44;
    stroke-width: 4;
  }

  .harbor-text {
    text-anchor: middle;
    font-size: 22px;
    font-weight: 800;
    fill: #2b2118;
    font-family: var(--font);
  }

  .harbor-text.small {
    font-size: 15px;
  }

  .road-under {
    stroke: #2b2118;
    stroke-width: 19;
    stroke-linecap: round;
  }

  .road-top {
    stroke-width: 12;
    stroke-linecap: round;
  }

  .road {
    pointer-events: none;
    animation: pop 0.3s ease;
    transform-box: fill-box;
    transform-origin: center;
  }

  .building {
    pointer-events: none;
    animation: pop 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.4);
    transform-box: fill-box;
    transform-origin: center;
  }

  .piece-outline {
    stroke: #2b2118;
    stroke-width: 3.5;
    stroke-linejoin: round;
  }

  .tower-leg {
    stroke: #2b2118;
    stroke-width: 3.5;
    stroke-linecap: round;
  }

  .jackal {
    pointer-events: none;
    transition: transform 0.45s cubic-bezier(0.3, 0.8, 0.3, 1.2);
  }

  .target-hex {
    fill: rgba(255, 244, 214, 0.12);
    stroke: #f3c060;
    stroke-width: 6;
    cursor: pointer;
    animation: pulse 1.4s ease-in-out infinite;
    outline: none;
  }

  .target-hex:hover,
  .target-hex:focus-visible {
    fill: rgba(255, 244, 214, 0.3);
    animation: none;
  }

  .target-edge,
  .target-vertex {
    cursor: pointer;
    outline: none;
  }

  .target-edge .hit {
    stroke: transparent;
    stroke-width: 34;
    stroke-linecap: round;
  }

  .target-edge .mark {
    stroke: var(--target);
    stroke-width: 12;
    stroke-linecap: round;
    stroke-dasharray: 10 8;
    opacity: 0.85;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .target-edge:hover .mark,
  .target-edge:focus-visible .mark {
    stroke-dasharray: none;
    stroke-width: 15;
    opacity: 1;
    animation: none;
  }

  .target-vertex .hit {
    fill: transparent;
  }

  .target-vertex .mark {
    fill: var(--target);
    fill-opacity: 0.45;
    stroke: #fff8e6;
    stroke-width: 4;
    animation: pulse 1.2s ease-in-out infinite;
    transform-box: fill-box;
    transform-origin: center;
    transition: transform 0.15s ease;
  }

  .target-vertex.upgrade .mark {
    fill-opacity: 0.2;
    stroke-dasharray: 6 5;
  }

  .target-vertex:hover .mark,
  .target-vertex:focus-visible .mark {
    fill-opacity: 0.95;
    transform: scale(1.3);
    animation: none;
  }

  @keyframes tile-in {
    from {
      opacity: 0;
      transform: scale(0.4) rotate(-40deg);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes shuffle {
    from {
      transform: scale(1);
      filter: brightness(1);
    }
    to {
      transform: scale(0.82) rotate(8deg);
      filter: brightness(1.25);
    }
  }

  @keyframes glow {
    50% {
      stroke-width: 3;
      stroke: #ffd36b;
    }
  }

  @keyframes pop {
    from {
      transform: scale(0.2);
      opacity: 0;
    }
  }
</style>
