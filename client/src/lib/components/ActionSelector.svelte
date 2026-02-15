<script lang="ts">
  import { combatStore } from '../stores/combatStore.svelte';
  import type { CombatAction } from '../stores/types';

  let abilities = $derived(combatStore.state.player.abilities);
  let stamina = $derived(combatStore.state.player.stamina);
  let selectedAction = $derived(combatStore.state.selectedAction);
  let disabled = $derived(combatStore.state.status !== 'awaiting_input');

  function select(action: CombatAction) {
    if (!disabled) combatStore.selectAction(action);
  }

  function isSelected(action: CombatAction): boolean {
    if (!selectedAction) return false;
    if (action.type !== selectedAction.type) return false;
    if (action.type === 'ability') return action.abilityId === selectedAction.abilityId;
    return true;
  }
</script>

<div class="action-selector">
  <div class="action-grid">
    <button
      class="action-btn"
      class:selected={isSelected({ type: 'basic_attack' })}
      disabled={disabled}
      onclick={() => select({ type: 'basic_attack' })}
    >
      <span class="action-icon">⚔️</span>
      <span class="action-name">Attack</span>
    </button>

    {#each abilities as ability}
      {@const canUse = ability.cooldown === 0 && stamina >= ability.staminaCost}
      {@const lowStamina = ability.cooldown === 0 && stamina < ability.staminaCost}
      <button
        class="action-btn ability-btn"
        class:selected={isSelected({ type: 'ability', abilityId: ability.id })}
        class:on-cooldown={ability.cooldown > 0}
        class:low-stamina={lowStamina}
        disabled={disabled || !canUse}
        onclick={() => select({ type: 'ability', abilityId: ability.id })}
        title={ability.description}
      >
        <span class="action-name">{ability.name}</span>
        <span class="action-cost">{ability.staminaCost} SP</span>
        {#if ability.cooldown > 0}
          <span class="cooldown-badge">{ability.cooldown}</span>
        {/if}
        {#if lowStamina}
          <span class="need-sp">Need {ability.staminaCost} SP</span>
        {/if}
      </button>
    {/each}

    <button
      class="action-btn"
      class:selected={isSelected({ type: 'guard' })}
      disabled={disabled}
      onclick={() => select({ type: 'guard' })}
    >
      <span class="action-icon">🛡️</span>
      <span class="action-name">Guard</span>
      <span class="action-cost">+3 SP</span>
    </button>
  </div>

  <button
    class="action-btn flee-btn"
    class:selected={isSelected({ type: 'flee' })}
    disabled={disabled}
    onclick={() => select({ type: 'flee' })}
  >
    <span class="action-icon">🏃</span>
    <span class="action-name">Flee</span>
  </button>
</div>

<style>
  .action-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
  }
  .action-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-sm, 8px);
  }
  .action-btn {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-sm, 8px) var(--space-sm, 8px);
    background: rgba(255,107,53,0.08);
    border: 1px solid var(--panel-border, rgba(255,107,53,0.25));
    border-radius: var(--radius-md, 6px);
    color: var(--bone-white, #e8dcc4);
    cursor: pointer;
    font-family: var(--font-ui, 'Cinzel', serif);
    transition: all var(--transition-fast, 0.15s ease);
  }
  .action-btn:hover:not(:disabled) {
    background: rgba(255,107,53,0.2);
    border-color: var(--ember-orange, #ff6b35);
    transform: translateY(-1px);
  }
  .action-btn.selected {
    background: rgba(255,107,53,0.35);
    border: 2px solid #ff8c42;
    box-shadow: var(--glow-ember, 0 0 12px rgba(255,107,53,0.3)), inset 0 1px 0 rgba(255,255,255,0.1);
    color: white;
  }
  .action-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .action-btn:focus-visible {
    box-shadow: var(--focus-ring, 0 0 0 2px rgba(255,107,53,0.5));
  }
  .action-icon { font-size: 18px; }
  .action-name {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .action-cost {
    font-size: 10px;
    color: var(--stamina-blue, #3b82f6);
  }
  .on-cooldown { opacity: 0.5; }
  .cooldown-badge {
    position: absolute;
    top: 3px;
    right: 5px;
    background: rgba(239,68,68,0.8);
    color: white;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: var(--radius-pill, 20px);
    font-weight: 600;
  }
  .low-stamina {
    opacity: 0.5;
  }
  .need-sp {
    font-size: 9px;
    color: var(--warning-amber, #f59e0b);
    font-style: italic;
  }
  .flee-btn {
    flex-direction: row;
    justify-content: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-sm, 8px);
    border-color: rgba(255,51,51,0.2);
    background: rgba(255,51,51,0.05);
    opacity: 0.7;
  }
  .flee-btn:hover:not(:disabled) {
    opacity: 1;
    border-color: var(--flame-red, #ff3333);
    background: rgba(255,51,51,0.15);
  }
  .flee-btn.selected {
    opacity: 1;
    border-color: var(--flame-red, #ff3333);
    background: rgba(255,51,51,0.25);
    box-shadow: var(--glow-red, 0 0 10px rgba(255,51,51,0.4));
  }

  @media (max-width: 768px) {
    .action-grid {
      grid-template-columns: 1fr;
    }
    .action-btn {
      padding: var(--space-md, 12px);
      min-height: 48px;
    }
  }
</style>
