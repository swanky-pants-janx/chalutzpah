<script>
  import { onMount } from 'svelte';
  import GameScreen from './components/game/GameScreen.svelte';
  import Landing from './components/landing/Landing.svelte';
  import SetupNeeded from './components/landing/SetupNeeded.svelte';
  import Lobby from './components/lobby/Lobby.svelte';
  import Toasts from './components/ui/Toasts.svelte';
  import Logo from './components/ui/Logo.svelte';
  import { ensureSession, isConfigured } from './lib/supabase.js';
  import { table } from './lib/table.svelte.js';
  import { toast } from './lib/toasts.svelte.js';

  let booting = $state(true);
  let bootError = $state(null);

  onMount(async () => {
    if (!isConfigured) {
      booting = false;
      return;
    }
    try {
      await ensureSession();
      const last = table.lastGameId;
      if (last && (await table.resume(last))) toast('Welcome back — you are reconnected to your table.', { kind: 'success' });
    } catch (err) {
      const message = err?.message ?? String(err);
      bootError = /anonymous/i.test(message)
        ? 'Anonymous sign-ins are switched off for this Supabase project. Turn them on under Authentication → Sign In / Providers.'
        : message;
    }
    booting = false;
  });

  $effect(() => {
    if (table.removed) {
      toast('You are no longer seated at that table.', { kind: 'error' });
      table.close();
    }
  });

  const screen = $derived(!table.pub ? 'home' : table.pub.status === 'lobby' ? 'lobby' : 'game');
</script>

{#if !isConfigured}
  <SetupNeeded />
{:else if booting}
  <div class="boot">
    <Logo size="lg" />
    <p>Lighting the lanterns…</p>
  </div>
{:else if bootError}
  <div class="boot">
    <Logo size="lg" />
    <h1>We couldn't reach the settlement</h1>
    <p>{bootError}</p>
    <button class="btn" onclick={() => location.reload()}>Try again</button>
  </div>
{:else if screen === 'home'}
  <Landing />
{:else if screen === 'lobby'}
  <Lobby />
{:else}
  <GameScreen />
{/if}

<Toasts />

<style>
  .boot {
    min-height: 100vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 25px;
    text-align: center;
    padding: 25px;
  }

  .boot h1 {
    font-size: 1.6rem;
    font-weight: 800;
  }

  .boot p {
    color: var(--text-light-muted);
    animation: pulse 1.6s ease-in-out infinite;
  }
</style>
