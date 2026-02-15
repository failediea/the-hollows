<script lang="ts">
  import { combatStore } from '../stores/combatStore.svelte';

  let rewards = $derived(combatStore.state.rewards);
</script>

<div class="victory-overlay">
  <div class="victory-content">
    <h1 class="victory-title">VICTORY</h1>

    {#if rewards}
      <div class="rewards">
        <div class="reward-item">
          <span class="reward-icon">✨</span>
          <span class="reward-value">+{rewards.xpGained} XP</span>
          {#if rewards.xpCapped}
            <span class="xp-capped">{rewards.xpCappedMessage}</span>
          {/if}
        </div>
        <div class="reward-item">
          <span class="reward-icon">💰</span>
          <span class="reward-value">+{rewards.goldGained} Gold</span>
        </div>
        {#if rewards.itemsDropped.length > 0}
          <div class="reward-item loot">
            <span class="reward-icon">🎁</span>
            <div class="loot-list">
              {#each rewards.itemsDropped as item}
                <span class="loot-item">{item}</span>
              {/each}
            </div>
          </div>
        {/if}
        {#if rewards.gateUnlocked}
          <div class="gate-message">{rewards.gateMessage}</div>
        {/if}
        {#if rewards.questCompleted}
          <div class="quest-complete">Quest Complete: {rewards.questCompleted}</div>
        {/if}
      </div>
    {/if}

    <button class="continue-btn" onclick={() => combatStore.closeCombat()}>
      Continue
    </button>
  </div>
</div>

<style>
  .victory-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    animation: fadeIn var(--transition-slow, 0.5s ease);
  }
  .victory-content {
    text-align: center;
    max-width: 360px;
    padding: var(--space-xl, 24px);
  }
  .victory-title {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 48px;
    color: var(--gold, #ffd700);
    text-shadow: 0 0 30px rgba(255,215,0,0.6);
    animation: scaleIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    margin-bottom: var(--space-xl, 24px);
  }
  .rewards {
    display: flex;
    flex-direction: column;
    gap: var(--space-md, 12px);
    margin-bottom: var(--space-xl, 24px);
  }
  .reward-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 16px;
    color: var(--bone-white, #e8dcc4);
  }
  .reward-icon { font-size: 24px; }
  .xp-capped {
    font-size: 12px;
    color: var(--warning-amber, #f59e0b);
    font-style: italic;
  }
  .loot { flex-direction: column; align-items: flex-start; }
  .loot-list { display: flex; flex-direction: column; gap: var(--space-xs, 4px); }
  .loot-item {
    color: var(--corruption-purple, #8b5cf6);
    font-size: 14px;
  }
  .gate-message {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 16px;
    color: var(--gold, #ffd700);
    padding: var(--space-sm, 8px);
    border: 1px solid var(--gold, #ffd700);
    border-radius: var(--radius-md, 6px);
    background: rgba(255,215,0,0.1);
  }
  .quest-complete {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    color: var(--safe-green, #4ade80);
    font-size: 14px;
  }
  .continue-btn {
    padding: var(--space-md, 12px) 40px;
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 18px;
    font-weight: 600;
    color: white;
    background: rgba(255,107,53,0.3);
    border: 2px solid var(--ember-orange, #ff6b35);
    border-radius: var(--radius-lg, 8px);
    cursor: pointer;
    transition: all var(--transition-normal, 0.25s ease);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .continue-btn:hover {
    background: rgba(255,107,53,0.5);
    box-shadow: var(--glow-ember, 0 0 12px rgba(255,107,53,0.3)), 0 0 25px rgba(255,107,53,0.4);
  }
  .continue-btn:focus-visible {
    box-shadow: var(--focus-ring, 0 0 0 2px rgba(255,107,53,0.5));
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scaleIn { from { transform: scale(0.3); opacity: 0; } to { transform: scale(1); opacity: 1; } }
</style>
