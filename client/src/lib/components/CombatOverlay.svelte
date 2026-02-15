<script lang="ts">
  import { combatStore } from '../stores/combatStore.svelte';
  import EnemyPanel from './EnemyPanel.svelte';
  import PlayerPanel from './PlayerPanel.svelte';
  import RoundInfo from './RoundInfo.svelte';
  import CombatLog from './CombatLog.svelte';
  import StanceSelector from './StanceSelector.svelte';
  import ActionSelector from './ActionSelector.svelte';
  import ConfirmButton from './ConfirmButton.svelte';
  import VictoryScreen from './VictoryScreen.svelte';
  import DefeatScreen from './DefeatScreen.svelte';

  let status = $derived(combatStore.state.status);
</script>

<div class="combat-overlay">
  {#if status === 'victory'}
    <VictoryScreen />
  {:else if status === 'defeat'}
    <DefeatScreen />
  {:else if status !== 'loading'}
    <div class="ui-layout">
      <div class="top-rail">
        <EnemyPanel />
        <RoundInfo />
      </div>

      <div class="battlefield-spacer"></div>

      <div class="command-deck">
        <PlayerPanel />
        <StanceSelector />
        <ActionSelector />
        <CombatLog />
        <ConfirmButton />
      </div>
    </div>
  {:else}
    <div class="loading">
      <div class="loading-backdrop"></div>
      <div class="loading-content">
        <p class="loading-text">Entering combat<span class="loading-dots"></span></p>
        <div class="loading-bar">
          <div class="loading-bar-fill"></div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .combat-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    z-index: 10;
  }
  .combat-overlay :global(button),
  .combat-overlay :global(.combat-log-wrapper),
  .combat-overlay :global(.combat-log),
  .combat-overlay :global(.enemy-panel),
  .combat-overlay :global(.player-panel),
  .combat-overlay :global(.stance-selector),
  .combat-overlay :global(.action-selector),
  .combat-overlay :global(.victory-overlay),
  .combat-overlay :global(.defeat-overlay) {
    pointer-events: auto;
  }

  .ui-layout {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
    max-width: 1024px;
    width: 100%;
    margin: 0 auto;
    padding: env(safe-area-inset-top, 0) var(--space-lg, 16px) env(safe-area-inset-bottom, var(--space-md, 12px));
  }

  .top-rail {
    display: flex;
    align-items: stretch;
    gap: var(--space-sm, 8px);
    pointer-events: auto;
  }

  .battlefield-spacer {
    min-height: 30vh;
    pointer-events: none;
  }

  .command-deck {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
    pointer-events: auto;
    padding-bottom: var(--space-sm, 8px);
  }

  /* Loading state */
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    pointer-events: auto;
    position: relative;
  }
  .loading-backdrop {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, rgba(26,10,0,0.9) 0%, var(--void-black, #0a0a0f) 70%);
  }
  .loading-content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg, 16px);
  }
  .loading-text {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 28px;
    color: var(--ember-orange, #ff6b35);
    text-shadow: 0 0 20px rgba(255,107,53,0.6), 0 0 40px rgba(255,107,53,0.3);
    animation: loadingPulse 2s ease-in-out infinite;
  }
  .loading-dots::after {
    content: '';
    animation: dots 1.5s steps(3, end) infinite;
  }
  @keyframes dots {
    0% { content: ''; }
    33% { content: '.'; }
    66% { content: '..'; }
    100% { content: '...'; }
  }
  .loading-bar {
    width: 160px;
    height: 3px;
    background: rgba(255,107,53,0.15);
    border-radius: 2px;
    overflow: hidden;
  }
  .loading-bar-fill {
    width: 40%;
    height: 100%;
    background: linear-gradient(90deg, transparent, var(--ember-orange, #ff6b35), transparent);
    border-radius: 2px;
    animation: loadingSweep 1.2s ease-in-out infinite;
  }
  @keyframes loadingPulse {
    0%, 100% { opacity: 1; text-shadow: 0 0 20px rgba(255,107,53,0.6), 0 0 40px rgba(255,107,53,0.3); }
    50% { opacity: 0.7; text-shadow: 0 0 30px rgba(255,107,53,0.8), 0 0 60px rgba(255,107,53,0.4); }
  }
  @keyframes loadingSweep {
    0% { transform: translateX(-160px); }
    100% { transform: translateX(400px); }
  }

  /* Responsive: mobile */
  @media (max-width: 768px) {
    .ui-layout {
      padding: var(--space-xs, 4px) var(--space-sm, 8px) env(safe-area-inset-bottom, var(--space-sm, 8px));
    }
    .top-rail {
      flex-direction: column;
      gap: var(--space-xs, 4px);
    }
    .battlefield-spacer {
      min-height: 20vh;
    }
    .command-deck {
      gap: var(--space-sm, 8px);
    }
  }
</style>
