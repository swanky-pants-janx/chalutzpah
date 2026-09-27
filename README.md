# Chalutzpah

*chalutz* (pioneer) + *chutzpah* (nerve). A browser-based, multiplayer hex-settling board game for friends: host a table, share a 5-letter code on Discord, roll the island until you like it, and race to 10 points.

**Features:** realtime play for 2–6, instant moves, a Classic (19-tile) or Grand (30-tile) island, shareable map numbers, house rules, an optional turn timer, Chaos mode event cards, Oasis mode (no Jackal), rematches, and rich invite links that unfurl in Discord with a picture of your island.

It follows the classic hex/resource/trading structure with original names, art, rules text and UI:

| Chalutzpah | Classic concept |
| --- | --- |
| Timber · Clay · Fleece · Wheat · Stone | the five resources |
| Cedar Grove · Clay Pits · Goat Pasture · Wheat Terraces · Quarry · Dunes | terrain / desert |
| Trail · Homestead · Kibbutz | road · settlement · city |
| Chutzpah cards: Watchman, Pathfinders, Bountiful Year, Chutzpah!, Landmark | knight, road building, year of plenty, monopoly, victory point |
| The Jackal | the robber |
| Trailblazer · Night Watch | longest road · largest army |
| Market · Harbors | bank trade · ports |

## Quick start

You need Node 20+, the [Supabase CLI](https://supabase.com/docs/guides/cli), and a free Supabase project.

1. **Create a Supabase project**, then turn on **Authentication → Sign In / Providers → Allow anonymous sign-ins**. Players never see an account screen; see [Identity](#identity-and-reconnecting).
2. **Apply the database schema and deploy the game function:**
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push                              # runs supabase/migrations/*
   supabase functions deploy game --use-api      # no Docker needed
   ```
   (No CLI? Paste `supabase/migrations/20260926000000_init.sql` into the SQL editor. The function still needs the CLI.)
3. **Point the app at your project.** Copy `.env.example` to `.env.local` and fill in the Project URL and the anon (or publishable) key from **Project Settings → API**.
4. **Run it:**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:5173. To play against yourself, open a second **different browser or private window**. Each browser is one player identity, so two tabs in the same browser are the same player.

### Deploying (Vercel)

Import the GitHub repo into Vercel (framework preset **Vite**) and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables for Production and Preview, then redeploy. Invite links look like `https://your-site/join/X7K4P`: `vercel.json` rewrites them to `api/invite`, which serves the link preview (Open Graph tags) and forwards people to the join screen. `api/og` draws the preview image. Both are Vercel Edge Functions and read the same two variables.

The game itself is static (`npm run build` outputs `dist/`), so any static host works. Only the Discord previews need Vercel functions.

## How it works

```
Browser (Svelte)                       Supabase
────────────────                       ─────────────────────────────────────────────
click "Build Trail"
  → rules.js highlights legal spots    (same engine code as the server)
  → callGame('action', BUILD_ROAD) ──▶ Edge Function `game`
                                         1. verify the caller's session (auth.getUser)
                                         2. load full state + version  (game_secrets)
                                         3. engine.applyAction → throws on illegal moves
                                         4. commit_game(version) — compare-and-swap;
                                            on conflict re-read and re-validate
                                         5. writes public view → games.public_state
                                                  each hand     → player_private (1 row each)
◀── Realtime (postgres_changes, RLS-filtered) ── everyone gets the public row,
                                                  each player gets only their own hand
```

- **One rules engine, two runtimes.** `supabase/functions/_shared/engine/` is plain ES-module JavaScript with no dependencies. The Edge Function (Deno) uses it to validate every move. The browser imports the same files (Vite alias `$engine`) only to highlight legal moves. The server never trusts the client.
- **State machine.** `status: lobby → setup → playing → finished`, with phases `setup_settlement → setup_road` (snake order), then `roll → [discard →] robber → main` for a 7, `roll → main` otherwise, `main → road_building → main` for Pathfinders, and `END_TURN` → next player's `roll`. See the header of `engine/actions.js`.
- **Hidden information stays hidden.** The full state (every hand, the shuffled deck) lives in `game_secrets`, which clients cannot read at all. Clients get a *public view* (card counts only) and their *own* private row. Row-level security (RLS) filters Realtime too, so other players' hands never reach your browser.
- **Instant moves.** Your own moves appear the moment you click: the browser predicts the result with the same engine (`engine/predict.js`) and queues the move. The server's answer replaces the prediction, and a rejected move rolls back with its message. Anything that needs dice, a hidden card or another player's hand (rolling, drawing, the Jackal's steal, Chutzpah!) waits for the server. A test replays full bot games and checks every prediction against the server's actual result.
- **Race conditions.** Every commit is compare-and-swap on a version number inside one SQL transaction. If two players accept the same trade at once, one commits and the other is re-validated against the new state and gets "That offer is no longer on the table". Every action also carries a unique id, so a retried request can't apply twice.
- **Randomness** (dice, shuffles, steals) comes from `crypto.getRandomValues` on the server. Maps are generated from a seed, so the same seed always produces the same island, and 6s/8s never touch.

### Table options

Set by the host in the lobby, and visible to everyone there:

- **Island:** Classic (19 tiles, up to 4 players) or Grand (30 tiles, 11 harbors, a supply of 24 and a 34-card deck, up to 6 players). Layouts live in `engine/layouts.js` and `engine/topology.js`.
- **Map number:** every island has a number from 1 to 999999, which is also its seed. The host can type one in to replay a favourite island.
- **Points to win:** 8, 10 or 12.
- **Turn timer:** off, 60 s, 90 s, 2 min or 3 min. The server stores the deadline. When it passes, any browser can call time, and the server checks its own clock, then finishes the turn minimally (roll, auto-discard, move the Jackal) and passes it. Nothing is built or traded for the player.
- **Chaos mode:** a new event card every round from an original 15-card deck (`engine/events.js`): droughts and booms, Market Day, Calm Night, Caravan, Sandstorm, Tithe, Windfall, Shifting Sands and more.
- **Oasis mode:** there is no Jackal, and the Dunes become an Oasis. A 7 is *Oasis Day*: nobody discards, the roller draws a free Chutzpah card, and everyone touching an Oasis picks one resource per Oasis they touch. A Watchman takes a card from any player you choose. Chaos mode leaves out the Jackal events.
- **House rules:** *Close neighbours* lets homesteads sit one trail apart. *Choosy Watchman* means a Watchman names a resource: you take it if the victim has one, otherwise a random card.

After a game, **Rematch** opens a new lobby with the same settings, where everyone keeps their name and colour.

### Speed

The game server is pinned to the database's region (`eu-west-1`, see `src/lib/api.js`; override with `VITE_SUPABASE_FUNCTION_REGION`). It verifies logins locally against the project's published signing key, and a warm instance reuses the last game state it saw. The compare-and-swap commit still guarantees nothing stale is ever saved.

### Identity and reconnecting

There are no accounts. The app signs each browser in with Supabase **anonymous sign-in**, which is silent and has no email or password. The session lives in localStorage. That gives every browser a signed, unforgeable user id that RLS and Realtime can use, which a hand-rolled token can't do. Refreshing or reopening the site reconnects you to your seat with your hand intact, and the home screen lists your open tables.

### Leaving, absent players, host migration

- Leaving the **lobby** frees your seat. If the host leaves or goes quiet for about 45 seconds (Realtime Presence plus server heartbeats), hosting passes to the next player.
- Leaving an **active game** marks you *away*. Your pieces and hand are kept, your turns are skipped automatically, and rejoining with the code puts you back in your seat.
- If someone just goes silent, others get a **Skip ahead** button after about 90 seconds. The server only allows it if that player's heartbeat really is stale. Skipping rolls, discards and moves the Jackal for them where needed, but never builds or trades.
- Abandoned games are removed by `cleanup_stale_games()` (lobbies after 6 hours, anything after 3 days idle). It runs whenever a game is created. You can also schedule it with pg_cron:
  ```sql
  select cron.schedule('chalutzpah-cleanup', '0 * * * *', 'select public.cleanup_stale_games()');
  ```

## Project layout

```
src/
  App.svelte                 screen switch: home / lobby / game
  lib/                       supabase client, API calls, realtime session (table.svelte.js), sound, toasts
  game/controls.js           pure UI logic: what can I do now, what to highlight
  components/
    landing/                 home page, host & join dialogs
    lobby/Lobby.svelte       code, players, island preview with the re-roll dice
    board/Board.svelte       SVG island, pieces, move targets
    game/                    game screen, panels, dialogs
supabase/
  migrations/                schema, RLS policies, SECURITY DEFINER commit functions
api/                         Vercel Edge Functions for invite links (invite.js) and preview images (og.js)
  functions/
    game/index.ts            Edge Function entry (auth + HTTP)
    _shared/engine/          rules engine (shared with the browser)
    _shared/server/          request handler + Supabase / in-memory stores
tests/                       engine, server, UI-logic and database tests
```

## Tests

```bash
npm test                     # 187 tests, ~6s
SIM_GAMES=300 npm test       # plus 300 extra full bot games as a stress test
```

- **Engine:** board generation, setup, placement rules, costs, production, the Jackal and discards, every card, market/harbor and player trades, both titles, victory, turn validation, duplicate and illegal actions, absent players, and no private data in the public view.
- **Server:** join validation, reconnecting, host migration, heartbeat-gated skips, and concurrency (simultaneous rolls, double-accepted trades, parallel purchases).
- **Simulation:** bots play complete 2–6 player games (classic, grand, chaos, house rules) through the real handler, checking invariants after every step (resources conserved, spacing rule, piece counts).
- **Features:** house rules, turn timer, chaos events, grand island, map numbers, rematch and invite previews each have their own tests.
- **Database:** runs the real migration in PGlite (Postgres in WASM) to check the RLS policies, function privileges, compare-and-swap commits, membership sync and cleanup.

## Settings and rules

Hosts choose 2–4 players and 8 / 10 / 12 points. The in-game **How to play** menu has the full rules. Costs: Trail = Timber + Clay; Homestead = Timber + Clay + Fleece + Wheat; Kibbutz = 2 Wheat + 3 Stone; Chutzpah card = Fleece + Wheat + Stone.

Keyboard: **R** roll · **E** end turn · **Esc** cancel building.

## Troubleshooting

- **"Anonymous sign-ins are switched off"**: enable them (Quick start step 1).
- **"Could not reach the game server"** on every action: the `game` function isn't deployed, or `.env.local` points at another project.
- **Players don't see each other's moves live**: check that the migration ran. It adds `games` and `player_private` to the `supabase_realtime` publication.
