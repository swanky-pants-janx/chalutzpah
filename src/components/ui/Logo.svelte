<script>
  /** Chalutzpah wordmark: a sun rising over a hex-shaped hill, plus the name. */
  let { size = 'md', tagline = false } = $props();
</script>

<div class="logo logo--{size}">
  <svg class="emblem" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="logo-hex" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e0773f" />
        <stop offset="1" stop-color="#b3263e" />
      </linearGradient>
    </defs>
    <polygon points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" fill="url(#logo-hex)" />
    <g stroke="#f7efdc" stroke-width="2.4" stroke-linecap="round" opacity="0.55">
      <path d="M32 8v5M17 14l3 4M47 14l-3 4M11 27h5M48 27h5" />
    </g>
    <circle cx="32" cy="28" r="9" fill="#f7efdc" />
    <path d="M9 45 Q32 30 55 45 L55 47 L32 60.5 L9 47 Z" fill="#f7efdc" opacity="0.9" />
    <path d="M18 50 Q32 42 46 50" stroke="#b3263e" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.6" />
  </svg>
  <span class="words">
    <span class="name">Chalutzpah</span>
    {#if tagline}<span class="tag">settle · trade · dare</span>{/if}
  </span>
</div>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    color: var(--text-light);
  }

  .emblem {
    width: var(--emblem);
    height: var(--emblem);
    flex: none;
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.25));
    transition:
      width 0.3s ease,
      height 0.3s ease;
  }

  .words {
    display: grid;
    line-height: 1;
  }

  .name {
    font-weight: 900;
    letter-spacing: -0.02em;
    font-size: var(--word);
    transition: font-size 0.3s ease;
  }

  .tag {
    margin-top: 6px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--saffron);
  }

  .logo--sm {
    --emblem: 36px;
    --word: 1.25rem;
  }
  .logo--md {
    --emblem: 64px;
    --word: 1.9rem;
  }
  .logo--lg {
    --emblem: 88px;
    --word: 2.6rem;
  }
</style>
