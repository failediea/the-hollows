<script lang="ts">
  import HealthBar from './HealthBar.svelte';
  import StatusEffects from './StatusEffects.svelte';
  import { combatStore } from '../stores/combatStore.svelte';

  let player = $derived(combatStore.state.player);
</script>

<div class="player-panel">
  <div class="player-header">
    <span class="player-name">Agent</span>
    <StatusEffects buffs={player.buffs} debuffs={player.debuffs} />
  </div>
  <div class="player-bars">
    <HealthBar value={player.hp} max={player.maxHp} color="green" label="HP" />
    <HealthBar value={player.stamina} max={player.maxStamina} color="blue" label="Stamina" />
  </div>
</div>

<style>
  .player-panel {
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    border: 1px solid var(--safe-green, #4ade80);
    border-radius: var(--radius-lg, 8px);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
  }
  .player-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
  }
  .player-name {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 14px;
    font-weight: 600;
    color: var(--safe-green, #4ade80);
    text-shadow: 0 0 6px rgba(74,222,128,0.4);
    flex-shrink: 0;
  }
  .player-bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
  }
</style>
