<script lang="ts">
  import { combatStore } from '../stores/combatStore.svelte';
</script>

<div class="defeat-overlay">
  <div class="defeat-content">
    <h1 class="defeat-title">DEFEATED</h1>
    <p class="defeat-message">Your soul fades into the darkness...</p>
    <p class="permadeath-info">Permadeath is final. Your prestige lives on.</p>

    <button class="return-btn" onclick={() => combatStore.closeCombat()}>
      Return
    </button>
  </div>
</div>

<style>
  .defeat-overlay {
    position: absolute;
    inset: 0;
    background: rgba(10,0,0,0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    animation: fadeIn var(--transition-slow, 0.5s ease);
  }
  .defeat-content {
    text-align: center;
    max-width: 340px;
    padding: var(--space-xl, 24px);
  }
  .defeat-title {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 48px;
    color: var(--flame-red, #ff3333);
    text-shadow: 0 0 30px rgba(255,51,51,0.6);
    animation: shake 0.6s ease;
    margin-bottom: var(--space-lg, 16px);
  }
  .defeat-message {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    color: var(--muted, #888);
    font-size: 16px;
    margin-bottom: var(--space-sm, 8px);
  }
  .permadeath-info {
    font-size: 13px;
    color: var(--muted-dim, #666);
    font-family: var(--font-ui, 'Cinzel', serif);
    margin-bottom: var(--space-xl, 24px);
  }
  .return-btn {
    padding: var(--space-md, 12px) 40px;
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 18px;
    font-weight: 600;
    color: white;
    background: rgba(255,51,51,0.2);
    border: 2px solid var(--flame-red, #ff3333);
    border-radius: var(--radius-lg, 8px);
    cursor: pointer;
    transition: all var(--transition-normal, 0.25s ease);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .return-btn:hover {
    background: rgba(255,51,51,0.4);
    box-shadow: var(--glow-red, 0 0 10px rgba(255,51,51,0.4)), 0 0 25px rgba(255,51,51,0.4);
  }
  .return-btn:focus-visible {
    box-shadow: 0 0 0 2px rgba(255,51,51,0.5);
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-10px); }
    40% { transform: translateX(10px); }
    60% { transform: translateX(-6px); }
    80% { transform: translateX(6px); }
  }
</style>
