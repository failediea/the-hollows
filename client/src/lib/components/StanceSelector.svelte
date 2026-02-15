<script lang="ts">
  import { combatStore } from '../stores/combatStore.svelte';
  import { STANCE_INFO } from '../phaser/assetMaps';
  import type { Stance } from '../stores/types';

  let selectedStance = $derived(combatStore.state.selectedStance);
  let disabled = $derived(combatStore.state.status !== 'awaiting_input');

  const stances: Stance[] = ['aggressive', 'balanced', 'defensive', 'evasive'];

  function select(stance: Stance) {
    if (!disabled) combatStore.selectStance(stance);
  }
</script>

<div class="stance-selector">
  {#each stances as stance}
    {@const info = STANCE_INFO[stance]}
    <button
      class="stance-btn"
      class:selected={selectedStance === stance}
      disabled={disabled}
      onclick={() => select(stance)}
    >
      <div class="stance-top">
        <span class="stance-icon">{info.icon}</span>
        <span class="stance-label">{info.label}</span>
      </div>
      <span class="stance-detail">{info.atkMod} | {info.defMod} · {info.special}</span>
    </button>
  {/each}
</div>

<style>
  .stance-selector {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-sm, 8px);
  }
  .stance-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-sm, 8px) var(--space-xs, 4px);
    background: rgba(255,107,53,0.08);
    border: 1px solid var(--panel-border, rgba(255,107,53,0.25));
    border-radius: var(--radius-md, 6px);
    color: var(--bone-white, #e8dcc4);
    cursor: pointer;
    font-family: var(--font-ui, 'Cinzel', serif);
    transition: all var(--transition-fast, 0.15s ease);
  }
  .stance-btn:hover:not(:disabled) {
    background: rgba(255,107,53,0.2);
    border-color: var(--ember-orange, #ff6b35);
    transform: translateY(-1px);
  }
  .stance-btn.selected {
    background: rgba(255,107,53,0.35);
    border: 2px solid #ff8c42;
    box-shadow: var(--glow-ember, 0 0 12px rgba(255,107,53,0.3)), inset 0 1px 0 rgba(255,255,255,0.1);
    color: white;
  }
  .stance-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .stance-btn:focus-visible {
    box-shadow: var(--focus-ring, 0 0 0 2px rgba(255,107,53,0.5));
  }
  .stance-top {
    display: flex;
    align-items: center;
    gap: var(--space-xs, 4px);
  }
  .stance-icon { font-size: 18px; }
  .stance-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .stance-detail {
    font-size: 10px;
    color: var(--muted, #888);
    line-height: 1.3;
  }
  .stance-btn.selected .stance-detail {
    color: var(--ember-orange, #ff6b35);
  }

  @media (max-width: 768px) {
    .stance-btn {
      min-height: 52px;
      padding: var(--space-sm, 8px);
    }
  }
</style>
