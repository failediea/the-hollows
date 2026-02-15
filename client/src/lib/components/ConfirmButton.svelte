<script lang="ts">
  import { combatStore } from '../stores/combatStore.svelte';
  import { STANCE_INFO } from '../phaser/assetMaps';

  let selectedStance = $derived(combatStore.state.selectedStance);
  let selectedAction = $derived(combatStore.state.selectedAction);
  let status = $derived(combatStore.state.status);
  let canConfirm = $derived(selectedStance !== null && selectedAction !== null && status === 'awaiting_input');

  let label = $derived.by(() => {
    if (!selectedStance || !selectedAction) return 'Select Stance & Action';
    const stanceName = STANCE_INFO[selectedStance].label;
    const actionName = selectedAction.type === 'ability' ? 'Ability' :
      selectedAction.type === 'basic_attack' ? 'Attack' :
      selectedAction.type === 'guard' ? 'Guard' :
      selectedAction.type === 'flee' ? 'Flee' : selectedAction.type;
    return `${stanceName} + ${actionName}`;
  });
</script>

<button
  class="confirm-btn"
  class:ready={canConfirm}
  disabled={!canConfirm}
  onclick={() => combatStore.confirmAction()}
>
  {#if status === 'resolving'}
    Resolving...
  {:else if status === 'animating'}
    ...
  {:else}
    {label}
  {/if}
</button>

<style>
  .confirm-btn {
    width: 100%;
    padding: 12px 20px;
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    background: var(--panel-bg, rgba(18,18,26,0.92));
    color: var(--muted-dim, #666);
    border: 2px solid rgba(255,255,255,0.1);
    border-radius: var(--radius-lg, 8px);
    cursor: default;
    transition: all var(--transition-normal, 0.25s ease);
    position: sticky;
    bottom: 0;
  }
  .confirm-btn.ready {
    color: white;
    border-color: transparent;
    background: linear-gradient(135deg, var(--ember-orange, #ff6b35), var(--flame-red, #ff3333));
    cursor: pointer;
    box-shadow: 0 0 25px rgba(255,107,53,0.6);
  }
  .confirm-btn.ready:hover {
    transform: scale(1.03);
    box-shadow: 0 0 35px rgba(255,107,53,0.8), 0 0 60px rgba(255,107,53,0.3);
  }
  .confirm-btn:disabled {
    cursor: default;
  }
  .confirm-btn:focus-visible {
    box-shadow: var(--focus-ring, 0 0 0 2px rgba(255,107,53,0.5));
  }
</style>
