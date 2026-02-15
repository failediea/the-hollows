<script lang="ts">
  import HealthBar from './HealthBar.svelte';
  import StatusEffects from './StatusEffects.svelte';
  import { combatStore } from '../stores/combatStore.svelte';

  let enemy = $derived(combatStore.state.enemy);
</script>

<div class="enemy-panel">
  <div class="enemy-info">
    <div class="enemy-header">
      <span class="enemy-name">{enemy.name}</span>
      {#if enemy.element !== 'none'}
        <span class="element-badge el-{enemy.element}">{enemy.element}</span>
      {/if}
      <span class="archetype-tag">{enemy.archetype}</span>
    </div>
    <StatusEffects buffs={enemy.buffs} debuffs={enemy.debuffs} />
  </div>
  <div class="enemy-bar">
    <HealthBar value={enemy.hp} max={enemy.maxHp} color="red" size="sm" />
  </div>
</div>

<style>
  .enemy-panel {
    display: flex;
    align-items: center;
    gap: var(--space-md, 12px);
    flex: 1;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    border-bottom: 2px solid var(--flame-red, #ff3333);
    border-radius: 0 0 var(--radius-lg, 8px) var(--radius-lg, 8px);
  }
  .enemy-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
    flex-shrink: 0;
  }
  .enemy-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
  }
  .enemy-name {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 18px;
    color: var(--flame-red, #ff3333);
    text-shadow: 0 0 6px rgba(255,51,51,0.4);
  }
  .element-badge {
    padding: 1px 6px;
    border-radius: var(--radius-pill, 20px);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-family: var(--font-ui, 'Cinzel', serif);
  }
  .el-fire { background: rgba(255,69,0,0.2); color: #ff4500; border: 1px solid rgba(255,69,0,0.5); }
  .el-ice { background: rgba(0,191,255,0.2); color: #00bfff; border: 1px solid rgba(0,191,255,0.5); }
  .el-shadow { background: rgba(139,92,246,0.2); color: var(--corruption-purple, #8b5cf6); border: 1px solid rgba(139,92,246,0.5); }
  .el-holy { background: rgba(255,215,0,0.2); color: var(--gold, #ffd700); border: 1px solid rgba(255,215,0,0.5); }
  .archetype-tag {
    font-size: 10px;
    color: var(--muted, #888);
    text-transform: capitalize;
    font-family: var(--font-ui, 'Cinzel', serif);
    margin-left: auto;
  }
  .enemy-bar {
    flex: 1;
    min-width: 120px;
  }

  @media (max-width: 768px) {
    .enemy-panel {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-xs, 4px);
    }
    .enemy-bar {
      min-width: unset;
    }
  }
</style>
