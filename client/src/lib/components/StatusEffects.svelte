<script lang="ts">
  import type { StatusEffect } from '../stores/types';

  let { buffs = [], debuffs = [] }: {
    buffs?: StatusEffect[];
    debuffs?: StatusEffect[];
  } = $props();

  const effectIcons: Record<string, string> = {
    'buff_atk': '⚔️', 'buff_def': '🛡️', 'poison': '☠️',
    'stun': '💫', 'burn': '🔥', 'riposte': '⚡', 'heal': '💚',
    'regen': '💚',
  };
</script>

<div class="status-row">
  {#each buffs as buff}
    <span class="status-pill buff" title="{buff.name}: {buff.duration} rounds">
      {effectIcons[buff.id] || effectIcons[buff.stat || ''] || '✨'} {buff.duration}
    </span>
  {/each}
  {#each debuffs as debuff}
    <span class="status-pill debuff" title="{debuff.name}: {debuff.duration} rounds">
      {effectIcons[debuff.id] || effectIcons[debuff.stat || ''] || '💀'} {debuff.duration}
    </span>
  {/each}
</div>

<style>
  .status-row {
    display: flex;
    gap: var(--space-xs, 4px);
    flex-wrap: wrap;
    justify-content: center;
    min-height: 22px;
  }
  .status-pill {
    padding: 1px 6px;
    border-radius: var(--radius-pill, 20px);
    font-size: 11px;
    font-family: var(--font-ui, 'Cinzel', serif);
    line-height: 1.4;
  }
  .buff {
    background: rgba(74, 222, 128, 0.15);
    border: 1px solid var(--safe-green, #4ade80);
    color: var(--safe-green, #4ade80);
  }
  .debuff {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid var(--flame-red, #ff3333);
    color: var(--flame-red, #ff3333);
  }
</style>
