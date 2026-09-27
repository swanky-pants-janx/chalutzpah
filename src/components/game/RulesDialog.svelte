<script>
  import { COSTS, DEV_CARD_LABELS, EVENTS, eventIdsFor } from '$engine';
  import Bundle from '../ui/Bundle.svelte';
  import Modal from '../ui/Modal.svelte';
  import { ACHIEVEMENT_TEXT, CARD_ORDER, HOUSE_RULES, OASIS_TEXT, cardText } from '../../game/cards.js';

  let { onclose, settings = null } = $props();
  const activeRules = $derived(HOUSE_RULES.filter((rule) => settings?.[rule.key]));
</script>

<Modal title="How to play Chalutzpah" wide {onclose}>
  <div class="rules">
    {#if activeRules.length || settings?.turnTimer}
      <section class="house">
        <h3>House rules at this table</h3>
        <ul>
          {#if settings?.turnTimer}
            <li>
              <b>Turn timer</b> — {settings.turnTimer} seconds per turn. When it runs out, the turn is finished for you (roll,
              discards, the Jackal) and passes on. Nothing is built or traded for you.
            </li>
          {/if}
          {#each activeRules as rule (rule.key)}
            <li><b>{rule.name}</b> — {rule.text}</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if settings?.oasis}
      <section class="house">
        <h3>Oasis mode is on</h3>
        <p>{OASIS_TEXT}</p>
      </section>
    {/if}

    {#if settings?.chaos}
      <section class="house">
        <h3>Chaos mode is on</h3>
        <p>At the start of every round a new event card flips and lasts until the next one:</p>
        <ul>
          {#each eventIdsFor(settings).map((id) => EVENTS[id]) as event (event.name)}
            <li><b>{event.name}</b> — {event.text}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <section>
      <h3>Goal</h3>
      <p>Be the first to reach the target score (10 by default) <em>during your own turn</em>.</p>
    </section>

    <section>
      <h3>Setting out</h3>
      <p>
        Everyone places a Homestead and a Trail, then again in reverse order. Your second Homestead immediately gathers one
        of each resource from the tiles around it.
      </p>
    </section>

    <section>
      <h3>Each turn</h3>
      <ol>
        <li><b>Roll.</b> Every tile showing that number produces: 1 card per touching Homestead, 2 per Kibbutz.</li>
        <li><b>Trade.</b> Offer deals to the table, or swap with the market at 4:1 (3:1 or 2:1 at harbors you touch).</li>
        <li><b>Build</b> as much as you can afford, then end your turn.</li>
      </ol>
    </section>

    <section>
      <h3>Building</h3>
      <table>
        <tbody>
          <tr><td>Trail</td><td><Bundle bundle={COSTS.road} /></td><td>Must connect to your trails or buildings.</td></tr>
          <tr><td>Homestead</td><td><Bundle bundle={COSTS.settlement} /></td><td>On your trail, with every neighbouring corner empty. 1 point.</td></tr>
          <tr><td>Kibbutz</td><td><Bundle bundle={COSTS.city} /></td><td>Upgrades a Homestead. 2 points, double harvest.</td></tr>
          <tr><td>Chutzpah card</td><td><Bundle bundle={COSTS.devCard} /></td><td>Draw a secret card. Play one per turn, not the turn you drew it.</td></tr>
        </tbody>
      </table>
    </section>

    {#if !settings?.oasis}
    <section>
      <h3>Roll a 7: the Jackal</h3>
      <p>
        Nobody gathers. Anyone holding more than 7 cards discards half (rounded down). The roller moves the Jackal to a new
        tile — it blocks that tile's harvest — and snatches a random card from a neighbour there.
      </p>
    </section>
    {/if}

    <section>
      <h3>Chutzpah cards</h3>
      <ul>
        {#each CARD_ORDER as card (card)}
          <li><b>{DEV_CARD_LABELS[card]}</b> — {cardText(card, settings)}</li>
        {/each}
      </ul>
    </section>

    <section>
      <h3>Titles (+2 points each)</h3>
      <ul>
        <li>{ACHIEVEMENT_TEXT.longestRoad} An opponent's homestead can cut your trail.</li>
        <li>{ACHIEVEMENT_TEXT.largestArmy} Someone must call more to take it from you.</li>
      </ul>
    </section>

    <section>
      <h3>Shortcuts</h3>
      <p><kbd>R</kbd> roll · <kbd>E</kbd> end turn · <kbd>Esc</kbd> cancel building</p>
    </section>
  </div>
</Modal>

<style>
  .rules {
    display: grid;
    gap: 22px;
    line-height: 1.6;
  }

  h3 {
    font-size: 1.05rem;
    font-weight: 800;
    margin-bottom: 6px;
    color: var(--pomegranate);
  }

  ol,
  ul {
    padding-left: 22px;
    display: grid;
    gap: 6px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  td {
    padding: 8px 10px 8px 0;
    border-bottom: 1px solid rgba(43, 33, 24, 0.1);
    vertical-align: middle;
  }

  td:first-child {
    font-weight: 800;
    white-space: nowrap;
  }

  .house {
    padding: 16px 20px;
    border-radius: 25px;
    background: #fff3e2;
    border: 1px solid rgba(212, 105, 59, 0.35);
  }

  kbd {
    padding: 2px 8px;
    border-radius: 8px;
    background: var(--ink);
    color: var(--parchment);
    font-weight: 700;
    font-size: 0.85rem;
  }
</style>
