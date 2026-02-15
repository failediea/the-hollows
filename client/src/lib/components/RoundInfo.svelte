<script lang="ts">
  import { combatStore } from '../stores/combatStore.svelte';

  let round = $derived(combatStore.state.round);
  let timer = $derived(combatStore.state.timer);
  let status = $derived(combatStore.state.status);
  let timerClass = $derived(
    timer <= 3 ? 'urgent' : timer <= 5 ? 'warning' : ''
  );
  let showTimer = $derived(status === 'awaiting_input');
</script>

<div class="round-info">
  <span class="round-label">Round</span>
  <span class="round-number">{round}</span>
  {#if showTimer}
    <span class="timer-divider">|</span>
    <span class="timer {timerClass}">{timer}s</span>
  {/if}
</div>

<style>
  .round-info {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-xs, 4px) var(--space-md, 12px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    border: 1px solid var(--panel-border, rgba(255,107,53,0.25));
    border-radius: 0 0 var(--radius-lg, 8px) var(--radius-lg, 8px);
    align-self: center;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .round-label {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 12px;
    color: var(--muted, #888);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .round-number {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 18px;
    color: var(--gold, #ffd700);
    text-shadow: var(--glow-gold, 0 0 10px rgba(255,215,0,0.5));
  }
  .timer-divider {
    color: var(--muted-dim, #666);
    font-size: 14px;
  }
  .timer {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 16px;
    font-weight: 600;
    color: var(--bone-white, #e8dcc4);
    transition: color var(--transition-normal, 0.25s ease), font-weight var(--transition-normal, 0.25s ease);
  }
  .warning {
    color: var(--warning-amber, #f59e0b);
    font-weight: 700;
  }
  .urgent {
    color: var(--flame-red, #ff3333);
    font-weight: 700;
    animation: urgentPulse 0.8s ease-in-out infinite alternate;
  }
  @keyframes urgentPulse {
    from { opacity: 1; }
    to { opacity: 0.6; }
  }
</style>
