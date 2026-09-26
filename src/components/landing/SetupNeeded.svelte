<script>
  import Logo from '../ui/Logo.svelte';
</script>

<main class="container setup">
  <Logo size="lg" tagline />
  <div class="card">
    <h1>Almost there — connect Supabase</h1>
    <p>Chalutzpah needs a Supabase project for its realtime tables. Create a <code>.env.local</code> file next to <code>package.json</code>:</p>
    <pre>VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key</pre>
    <p>Then restart <code>npm run dev</code>. The README walks through the database migration and deploying the <code>game</code> Edge Function.</p>
  </div>
</main>

<style>
  .setup {
    min-height: 100vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 25px;
    padding-block: 64px;
  }

  .card {
    max-width: 680px;
    display: grid;
    gap: 16px;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 800;
  }

  pre {
    padding: 20px;
    border-radius: 25px;
    background: var(--ink);
    color: var(--parchment);
    overflow-x: auto;
    font-size: 0.9rem;
  }

  code {
    font-weight: 700;
  }
</style>
