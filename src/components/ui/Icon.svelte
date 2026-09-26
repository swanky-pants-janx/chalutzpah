<script>
  /** Original icon set for Chalutzpah (resources, cards and UI glyphs). */
  let { name, size = 24, title = null } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  role={title ? 'img' : 'presentation'}
  aria-label={title}
  aria-hidden={title ? undefined : 'true'}
  fill="none"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === 'timber'}
    <rect x="2.5" y="12.5" width="15" height="7" rx="3.5" fill="#9a6233" />
    <circle cx="17.5" cy="16" r="3.5" fill="#e8b67e" stroke="#8a5528" stroke-width="1.1" />
    <circle cx="17.5" cy="16" r="1.4" stroke="#b17a45" stroke-width="0.8" />
    <rect x="4.5" y="4.5" width="14.5" height="7" rx="3.5" fill="#b37440" />
    <circle cx="19" cy="8" r="3.5" fill="#f0c592" stroke="#8a5528" stroke-width="1.1" />
    <circle cx="19" cy="8" r="1.4" stroke="#b17a45" stroke-width="0.8" />
  {:else if name === 'clay'}
    <rect x="1.8" y="13.5" width="9.8" height="6.5" rx="1.3" fill="#c4623a" />
    <rect x="12.4" y="13.5" width="9.8" height="6.5" rx="1.3" fill="#a94d2a" />
    <rect x="6.8" y="6" width="10.4" height="6.5" rx="1.3" fill="#dd7c4c" />
    <path d="M3.5 15.5h5M14 15.5h5M8.5 8h6" stroke="#f3b08a" stroke-width="1" opacity="0.8" />
  {:else if name === 'fleece'}
    <g stroke="#7d7462" stroke-width="2.4">
      <circle cx="8" cy="12.5" r="4.4" /><circle cx="12.5" cy="8.5" r="4.8" /><circle cx="16.8" cy="12.8" r="4.4" /><circle cx="11.5" cy="16.2" r="4.2" />
    </g>
    <g fill="#fbf7ee">
      <circle cx="8" cy="12.5" r="4.4" /><circle cx="12.5" cy="8.5" r="4.8" /><circle cx="16.8" cy="12.8" r="4.4" /><circle cx="11.5" cy="16.2" r="4.2" />
    </g>
    <circle cx="10.5" cy="10" r="1.2" fill="#e8e0cc" /><circle cx="14.5" cy="13" r="1.4" fill="#e8e0cc" />
  {:else if name === 'wheat'}
    <path d="M12 22V6.5" stroke="#9c7419" stroke-width="1.6" />
    <g fill="#e9b73f" stroke="#a67c1f" stroke-width="0.7">
      <ellipse cx="12" cy="4.2" rx="1.6" ry="2.6" />
      <ellipse cx="9.4" cy="8" rx="1.5" ry="2.5" transform="rotate(-35 9.4 8)" />
      <ellipse cx="14.6" cy="8" rx="1.5" ry="2.5" transform="rotate(35 14.6 8)" />
      <ellipse cx="9.4" cy="12" rx="1.5" ry="2.5" transform="rotate(-35 9.4 12)" />
      <ellipse cx="14.6" cy="12" rx="1.5" ry="2.5" transform="rotate(35 14.6 12)" />
      <ellipse cx="9.4" cy="16" rx="1.5" ry="2.5" transform="rotate(-35 9.4 16)" />
      <ellipse cx="14.6" cy="16" rx="1.5" ry="2.5" transform="rotate(35 14.6 16)" />
    </g>
  {:else if name === 'stone'}
    <polygon points="2.5,18.5 6.5,8.5 12.5,4 19,7.5 21.5,17 14,20.5" fill="#8d95a0" />
    <polygon points="6.5,8.5 12.5,4 12,11.5" fill="#bcc3cc" />
    <polygon points="12,11.5 19,7.5 21.5,17" fill="#68707c" />
    <polygon points="2.5,18.5 12,11.5 14,20.5" fill="#7a828e" />
  {:else if name === 'watchman'}
    <path d="M8.5 21 9.3 10h5.4l.8 11z" fill="currentColor" opacity="0.9" />
    <path d="M7 10V5h2v2h2V5h2v2h2V5h2v5z" fill="currentColor" />
    <rect x="11" y="13" width="2" height="3" rx="1" fill="#f3c060" />
  {:else if name === 'landmark'}
    <rect x="6" y="3" width="12" height="7" rx="2.5" fill="currentColor" />
    <path d="M7.5 10 5.5 21M16.5 10l2 11M6.8 15h10.4M8.7 10l6.6 5M15.3 10l-6.6 5" stroke="currentColor" stroke-width="1.5" />
  {:else if name === 'pathfinder'}
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
    <path d="m12 5 2.4 7L12 19l-2.4-7z" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="#f7efdc" />
  {:else if name === 'harvest'}
    <path d="M3.5 11h17l-2.2 9.5H5.7z" fill="currentColor" />
    <circle cx="8" cy="8.3" r="2.6" fill="#e0773f" /><circle cx="12.3" cy="7" r="2.8" fill="#e9b73f" /><circle cx="16.4" cy="8.5" r="2.4" fill="#86b454" />
    <path d="M6 14h12M6.6 17h10.8" stroke="#f7efdc" stroke-width="1" opacity="0.5" />
  {:else if name === 'chutzpah'}
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" fill="currentColor" />
    <path d="M12 6.2v5" stroke="#f7efdc" stroke-width="2.2" /><circle cx="12" cy="13.6" r="1.2" fill="#f7efdc" />
  {:else if name === 'jackal'}
    <path d="M4 4.5 9 9.5h6l5-5-.5 8.5-2.5 4-5 4.5-5-4.5-2.5-4z" fill="currentColor" />
    <circle cx="9.3" cy="12.3" r="1.1" fill="#f3c060" /><circle cx="14.7" cy="12.3" r="1.1" fill="#f3c060" />
    <path d="m11 17 1 1 1-1" stroke="#f3c060" stroke-width="1" />
  {:else if name === 'road'}
    <path d="M4 19 20 5" stroke="currentColor" stroke-width="4.5" />
  {:else if name === 'settlement'}
    <path d="M5 20v-9l7-6 7 6v9z" fill="currentColor" />
  {:else if name === 'city'}
    <path d="M3 21v-7l5-4 5 4v7zM13 21v-9h8v9z" fill="currentColor" />
    <rect x="14.5" y="3" width="5" height="4" rx="1" fill="currentColor" /><path d="M15.5 7v5M18.5 7v5" stroke="currentColor" stroke-width="1.3" />
  {:else if name === 'devCard'}
    <rect x="5" y="3" width="14" height="18" rx="3" fill="currentColor" />
    <path d="M12 8v5" stroke="#f7efdc" stroke-width="2.2" /><circle cx="12" cy="16" r="1.2" fill="#f7efdc" />
  {:else if name === 'cards'}
    <rect x="3" y="6" width="11" height="15" rx="2.5" stroke="currentColor" stroke-width="1.8" />
    <path d="M8 3.5h8.5A2.5 2.5 0 0 1 19 6v11.5" stroke="currentColor" stroke-width="1.8" />
  {:else if name === 'menu'}
    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" />
  {:else if name === 'close'}
    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" />
  {:else if name === 'copy'}
    <rect x="8" y="8" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.8" />
    <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" stroke="currentColor" stroke-width="1.8" />
  {:else if name === 'link'}
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" stroke="currentColor" stroke-width="1.8" />
  {:else if name === 'crown'}
    <path d="M3.5 17.5 2.5 7l5.5 4.5L12 5l4 6.5L21.5 7l-1 10.5z" fill="currentColor" />
    <rect x="4" y="18.5" width="16" height="2.2" rx="1.1" fill="currentColor" />
  {:else if name === 'sound'}
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" stroke="currentColor" stroke-width="1.8" />
  {:else if name === 'mute'}
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="1.8" />
  {:else if name === 'dice'}
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" stroke="currentColor" stroke-width="1.8" />
    <circle cx="8.3" cy="8.3" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="15.7" cy="15.7" r="1.5" fill="currentColor" />
  {:else if name === 'trade'}
    <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" stroke="currentColor" stroke-width="1.9" />
  {:else if name === 'flag'}
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" stroke="currentColor" stroke-width="1.9" />
  {:else if name === 'exit'}
    <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14M10 16l-4-4 4-4M6 12h10" stroke="currentColor" stroke-width="1.9" />
  {:else if name === 'book'}
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" stroke="currentColor" stroke-width="1.8" />
  {:else if name === 'trophy'}
    <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3.5M8 21h8l-1-3.5H9z" stroke="currentColor" stroke-width="1.8" />
  {:else if name === 'trail'}
    <path d="M4 20c4-2 3-6 7-8s7-1 9-8" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3" />
  {:else if name === 'shield'}
    <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" fill="currentColor" />
  {:else if name === 'user'}
    <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" stroke="currentColor" stroke-width="1.8" />
  {:else if name === 'check'}
    <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.2" />
  {:else if name === 'arrow-right'}
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" />
  {:else if name === 'hourglass'}
    <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" stroke="currentColor" stroke-width="1.8" />
  {/if}
</svg>
