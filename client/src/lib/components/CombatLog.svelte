<script lang="ts">
  import { combatStore } from '../stores/combatStore.svelte';

  let log = $derived(combatStore.state.log);
  let logEl = $state<HTMLDivElement>();
  let expanded = $state(false);

  let latestEntry = $derived(log.length > 0 ? log[log.length - 1] : null);

  $effect(() => {
    if (expanded && log.length && logEl) {
      logEl.scrollTop = logEl.scrollHeight;
    }
  });
</script>

<div class="combat-log-wrapper">
  {#if !expanded}
    <div class="log-summary">
      {#if latestEntry}
        <span class="summary-round">R{latestEntry.round}</span>
        <span class="summary-text">{latestEntry.narrative}</span>
      {:else}
        <span class="log-empty">Choose your stance and action...</span>
      {/if}
    </div>
  {:else}
    <div class="combat-log" bind:this={logEl}>
      {#each log as entry}
        <div class="log-entry">
          <div class="log-round">Round {entry.round}</div>
          <div class="log-narrative">{entry.narrative}</div>
          {#if entry.events.length > 0}
            <div class="log-events">
              {#each entry.events as event}
                <span class="log-event">{event}</span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      {#if log.length === 0}
        <div class="log-empty">Choose your stance and action...</div>
      {/if}
    </div>
  {/if}

  {#if log.length > 0}
    <button class="toggle-btn" onclick={() => expanded = !expanded}>
      <span class="toggle-label">{expanded ? 'Collapse' : 'History'}</span>
      <span class="toggle-chevron" class:open={expanded}>&#9660;</span>
    </button>
  {/if}
</div>

<style>
  .combat-log-wrapper {
    position: relative;
  }
  .log-summary {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-xs, 4px) var(--space-md, 12px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    border: 1px solid var(--panel-border, rgba(255,107,53,0.25));
    border-radius: var(--radius-md, 6px);
    min-height: 28px;
  }
  .summary-round {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 11px;
    color: var(--gold, #ffd700);
    flex-shrink: 0;
  }
  .summary-text {
    font-size: 11px;
    color: #ccc;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .combat-log {
    max-height: 140px;
    overflow-y: auto;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    border: 1px solid var(--panel-border, rgba(255,107,53,0.25));
    border-radius: var(--radius-md, 6px);
    scrollbar-width: thin;
    scrollbar-color: var(--ember-orange, #ff6b35) var(--void-black, #0a0a0f);
  }
  .log-entry {
    margin-bottom: var(--space-sm, 8px);
    padding-bottom: var(--space-sm, 8px);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .log-entry:last-child { border-bottom: none; margin-bottom: 0; }
  .log-round {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 11px;
    color: var(--gold, #ffd700);
    margin-bottom: 2px;
  }
  .log-narrative {
    font-size: 11px;
    color: #ddd;
    line-height: 1.3;
  }
  .log-events {
    display: flex;
    gap: var(--space-xs, 4px);
    flex-wrap: wrap;
    margin-top: 3px;
  }
  .log-event {
    font-size: 10px;
    padding: 1px 5px;
    background: rgba(255,107,53,0.12);
    border-radius: var(--radius-pill, 20px);
    color: var(--ember-orange, #ff6b35);
  }
  .log-empty {
    color: var(--muted-dim, #666);
    font-style: italic;
    font-size: 12px;
    text-align: center;
    padding: var(--space-sm, 8px);
  }
  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs, 4px);
    width: 100%;
    padding: 3px 0;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted, #888);
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: color var(--transition-fast, 0.15s ease);
  }
  .toggle-btn:hover {
    color: var(--ember-orange, #ff6b35);
  }
  .toggle-chevron {
    font-size: 8px;
    transition: transform var(--transition-fast, 0.15s ease);
  }
  .toggle-chevron.open {
    transform: rotate(180deg);
  }
</style>
