<script>
  import { onMount } from 'svelte';
  import { COSTS, generateBoard, randomMapNumber } from '$engine';
  import Board from '../board/Board.svelte';
  import Bundle from '../ui/Bundle.svelte';
  import Die from '../ui/Die.svelte';
  import Icon from '../ui/Icon.svelte';
  import Logo from '../ui/Logo.svelte';
  import Menu from '../ui/Menu.svelte';
  import RulesDialog from '../game/RulesDialog.svelte';
  import HostDialog from './HostDialog.svelte';
  import JoinDialog from './JoinDialog.svelte';
  import { play, sound, toggleMute } from '../../lib/sound.svelte.js';
  import { myOpenGames, table } from '../../lib/table.svelte.js';
  import { toastError } from '../../lib/toasts.svelte.js';

  const inviteCode = new URLSearchParams(location.search).get('join') ?? '';

  let dialog = $state(inviteCode ? 'join' : null);
  let scrolled = $state(false);
  let openGames = $state([]);
  let demo = $state({ board: generateBoard(randomMapNumber(Math.random)), robber: null, lastRoll: null });
  let demoRolling = $state(false);
  let demoFace = $state([3, 4]);

  onMount(async () => {
    openGames = await myOpenGames();
  });

  function rollDemo() {
    play('dice');
    demoRolling = true;
    demoFace = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    setTimeout(() => {
      demo = { ...demo, board: generateBoard(randomMapNumber(Math.random)) };
      demoRolling = false;
    }, 380);
  }

  async function resume(gameId) {
    try {
      if (!(await table.resume(gameId))) openGames = openGames.filter((g) => g.gameId !== gameId);
    } catch (err) {
      toastError(err);
    }
  }

  const menuItems = $derived([
    { label: 'Host a game', icon: 'crown', onclick: () => (dialog = 'host') },
    { label: 'Join a game', icon: 'arrow-right', onclick: () => (dialog = 'join') },
    { label: 'How to play', icon: 'book', onclick: () => (dialog = 'rules') },
    { label: sound.muted ? 'Sound: off' : 'Sound: on', icon: sound.muted ? 'mute' : 'sound', onclick: toggleMute },
  ]);

  const PILLARS = [
    { icon: 'wheat', title: 'Gather', text: 'Every roll wakes the tiles that match it. Homesteads touching them collect one card; a Kibbutz collects two.' },
    { icon: 'settlement', title: 'Build', text: 'Blaze trails, found homesteads a full corner apart, and grow them into bustling kibbutzim.' },
    { icon: 'trade', title: 'Trade', text: 'Haggle with friends, or trade at the market — 4:1, or better if you settle beside a harbor.' },
    { icon: 'chutzpah', title: 'Dare', text: 'Roll a 7 and the Jackal raids. Play Chutzpah cards, claim titles, and race to 10 points.' },
  ];

  const COST_ROWS = [
    { icon: 'road', name: 'Trail', cost: COSTS.road, note: 'Connects your network' },
    { icon: 'settlement', name: 'Homestead', cost: COSTS.settlement, note: '1 point' },
    { icon: 'city', name: 'Kibbutz', cost: COSTS.city, note: 'Upgrade · 2 points' },
    { icon: 'devCard', name: 'Chutzpah card', cost: COSTS.devCard, note: 'A secret advantage' },
  ];
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 0)} />

<svelte:head>
  <title>Chalutzpah — settle, trade, dare</title>
</svelte:head>

<header class="site-header" class:scrolled>
  <div class="container header-inner">
    <Menu items={menuItems} />
    <div class="header-logo"><Logo size={scrolled ? 'sm' : 'md'} /></div>
  </div>
</header>

<main>
  <section class="hero">
    <div class="container hero-grid">
      <div class="hero-copy">
        <p class="kicker">A board game for friends · play in your browser</p>
        <h1>Chalutzpah</h1>
        <p class="lede">
          Settle a sun-baked island with the nerve of a pioneer. Gather, build, haggle and outwit the Jackal — first to
          10 points claims the land.
        </p>
        <div class="cta">
          <button class="btn btn--big" onclick={() => (dialog = 'host')}><Icon name="crown" /> Host game</button>
          <button class="btn btn--big btn--sea" onclick={() => (dialog = 'join')}><Icon name="arrow-right" /> Join game</button>
        </div>
        {#if openGames.length}
          <div class="continue">
            <span class="eyebrow">Your open tables</span>
            <div class="continue-list">
              {#each openGames as game (game.gameId)}
                <button class="btn btn--light btn--small btn--tight" onclick={() => resume(game.gameId)}>
                  <Icon name="arrow-right" size={18} /> Return to {game.code}
                  <span class="status">{game.status === 'lobby' ? 'lobby' : 'in play'}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="hero-art">
        <div class="island" aria-hidden="true">
          <Board view={demo} preview shuffling={demoRolling} />
        </div>
        <button class="demo-roll" onclick={rollDemo} aria-label="Roll a new island">
          <Die value={demoFace[0]} rolling={demoRolling} size={44} />
          <Die value={demoFace[1]} rolling={demoRolling} size={44} tone="red" />
          <span>Roll an island</span>
        </button>
      </div>
    </div>
  </section>

  <section class="section container" id="how">
    <p class="eyebrow light">How it plays</p>
    <h2>Four verbs, one island</h2>
    <div class="pillars">
      {#each PILLARS as pillar (pillar.title)}
        <article class="card pillar">
          <span class="pillar-icon"><Icon name={pillar.icon} size={34} /></span>
          <h3>{pillar.title}</h3>
          <p>{pillar.text}</p>
        </article>
      {/each}
    </div>
  </section>

  <section class="section container">
    <p class="eyebrow light">The price of progress</p>
    <h2>What things cost</h2>
    <div class="costs">
      {#each COST_ROWS as row (row.name)}
        <div class="card card--dark cost">
          <span class="cost-icon"><Icon name={row.icon} size={30} /></span>
          <div>
            <h3>{row.name}</h3>
            <p class="note">{row.note}</p>
          </div>
          <Bundle bundle={row.cost} size={22} />
        </div>
      {/each}
    </div>
    <div class="closing">
      <button class="btn btn--big" onclick={() => (dialog = 'host')}>Gather your friends</button>
    </div>
  </section>
</main>

<footer class="container footer">
  <p>Chalutzpah — chalutz (pioneer) + chutzpah (nerve). An original game inspired by classic hex-settling board games.</p>
</footer>

{#if dialog === 'host'}
  <HostDialog onclose={() => (dialog = null)} />
{:else if dialog === 'join'}
  <JoinDialog code={inviteCode} onclose={() => (dialog = null)} />
{:else if dialog === 'rules'}
  <RulesDialog onclose={() => (dialog = null)} />
{/if}

<style>
  .site-header {
    position: fixed;
    inset: 0 0 auto;
    z-index: 20;
    height: 150px;
    display: flex;
    align-items: center;
    transition:
      height 0.3s ease,
      background 0.3s ease,
      box-shadow 0.3s ease;
  }

  .site-header.scrolled {
    height: 100px;
    background: rgba(18, 26, 36, 0.86);
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  }

  .header-inner {
    display: flex;
    align-items: center;
    gap: 25px;
  }

  .hero {
    min-height: 100vh;
    display: flex;
    align-items: center;
    padding-top: 150px;
    padding-bottom: 64px;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
    gap: 25px;
    align-items: center;
  }

  .hero-copy {
    display: grid;
    gap: 25px;
    animation: rise 0.6s ease both;
  }

  .kicker {
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-size: 0.8rem;
    color: var(--saffron);
  }

  h1 {
    font-size: clamp(3.4rem, 8vw, 7.2rem);
    font-weight: 900;
    letter-spacing: -0.045em;
    line-height: 0.95;
    background: linear-gradient(120deg, #fff4dc 10%, #f3c060 55%, #e0773f 90%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .lede {
    font-size: 1.2rem;
    line-height: 1.6;
    max-width: 34rem;
    color: var(--text-light-muted);
  }

  .cta {
    display: flex;
    flex-wrap: wrap;
    margin: -25px;
  }

  .continue {
    display: grid;
    gap: 12px;
  }

  .continue .eyebrow {
    color: var(--text-light-muted);
  }

  .continue-list {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .status {
    font-size: 0.75rem;
    padding: 2px 10px;
    border-radius: 25px;
    background: rgba(43, 33, 24, 0.1);
  }

  .hero-art {
    position: relative;
    display: grid;
    place-items: center;
  }

  .island {
    width: min(100%, 720px);
    aspect-ratio: 1200 / 1040;
    transform: perspective(1400px) rotateX(28deg) rotateZ(-6deg);
    filter: drop-shadow(0 40px 50px rgba(0, 0, 0, 0.45));
    animation: float 7s ease-in-out infinite;
  }

  .demo-roll {
    position: absolute;
    right: 4%;
    bottom: 6%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px 12px 12px;
    border-radius: 25px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: linear-gradient(135deg, rgba(51, 69, 93, 0.9), rgba(27, 36, 48, 0.92));
    box-shadow: var(--shadow-lift);
    color: var(--text-light);
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .demo-roll:hover {
    transform: translateY(-2px) rotate(-1deg);
  }

  .section {
    margin-block: var(--section-space);
    display: grid;
    gap: 25px;
  }

  .eyebrow.light {
    color: var(--saffron);
  }

  h2 {
    font-size: clamp(2rem, 3.5vw, 3rem);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .pillars {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 25px;
  }

  .pillar {
    display: grid;
    gap: 14px;
    align-content: start;
    padding: 32px;
  }

  .pillar-icon {
    width: 64px;
    height: 64px;
    border-radius: 25px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #fff6e2, var(--parchment-3));
    color: var(--pomegranate);
    box-shadow: var(--shadow);
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 800;
  }

  .pillar p {
    color: var(--text-muted);
    line-height: 1.6;
  }

  .costs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 25px;
  }

  .cost {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 25px;
  }

  .cost-icon {
    width: 56px;
    height: 56px;
    border-radius: 25px;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.08);
    color: var(--saffron);
  }

  .note {
    color: var(--text-light-muted);
    font-size: 0.9rem;
  }

  .closing {
    display: flex;
    justify-content: center;
  }

  .footer {
    padding-block: 64px;
    text-align: center;
    color: var(--text-light-muted);
    font-size: 0.9rem;
  }

  @keyframes float {
    0%,
    100% {
      transform: perspective(1400px) rotateX(28deg) rotateZ(-6deg) translateY(0);
    }
    50% {
      transform: perspective(1400px) rotateX(28deg) rotateZ(-6deg) translateY(-12px);
    }
  }

  @media (max-width: 960px) {
    .hero-grid {
      grid-template-columns: 1fr;
    }
    .hero-art {
      order: -1;
    }
    .island {
      width: min(100%, 520px);
    }
  }
</style>
