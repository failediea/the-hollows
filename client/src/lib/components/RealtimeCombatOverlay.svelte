<script lang="ts">
  import { realtimeStore } from '../stores/realtimeStore.svelte';
  import { STANCE_INFO } from '../phaser/assetMaps';
  import type { Stance } from '../stores/types';
  import HealthBar from './HealthBar.svelte';

  const STANCE_KEYS: Stance[] = ['aggressive', 'balanced', 'defensive', 'evasive'];
  const STANCE_COLORS: Record<Stance, string> = {
    aggressive: 'var(--flame-red, #ff3333)',
    balanced: 'var(--safe-green, #4ade80)',
    defensive: 'var(--stamina-blue, #3b82f6)',
    evasive: 'var(--corruption-purple, #8b5cf6)',
  };

  let status = $derived(realtimeStore.state.status);
  let player = $derived(realtimeStore.state.player);
  let enemies = $derived(realtimeStore.state.enemies);
  let rewards = $derived(realtimeStore.state.rewards);

  // Show the first enemy that is in aggro state as the "target"
  let targetEnemy = $derived(
    enemies.find(e => e.aiState === 'chase' || e.aiState === 'attack') || enemies[0] || null
  );
</script>

<div class="realtime-overlay">
  {#if status === 'victory'}
    <div class="end-overlay victory-overlay">
      <div class="end-content">
        <h1 class="end-title victory-title">VICTORY</h1>
        {#if rewards}
          <div class="rewards">
            <div class="reward-item">
              <span class="reward-icon">+{rewards.xpGained} XP</span>
              {#if rewards.xpCapped}
                <span class="xp-capped">{rewards.xpCappedMessage}</span>
              {/if}
            </div>
            <div class="reward-item">
              <span class="reward-icon">+{rewards.goldGained} Gold</span>
            </div>
            {#if rewards.itemsDropped.length > 0}
              {#each rewards.itemsDropped as item}
                <div class="reward-item loot-item">{item}</div>
              {/each}
            {/if}
            {#if rewards.gateUnlocked}
              <div class="gate-message">{rewards.gateMessage}</div>
            {/if}
          </div>
        {/if}
        <button class="end-btn victory-btn" onclick={() => realtimeStore.closeCombat()}>Continue</button>
      </div>
    </div>

  {:else if status === 'defeat'}
    <div class="end-overlay defeat-overlay">
      <div class="end-content">
        <h1 class="end-title defeat-title">DEFEATED</h1>
        <p class="defeat-message">Your soul fades into the darkness...</p>
        <p class="permadeath-info">Permadeath is final. Your prestige lives on.</p>
        <button class="end-btn defeat-btn" onclick={() => realtimeStore.closeCombat()}>Return</button>
      </div>
    </div>

  {:else if status === 'active' && player}
    <!-- Top bar: targeted enemy info -->
    {#if targetEnemy}
      <div class="top-bar">
        <div class="target-info">
          <span class="target-name">{targetEnemy.name}</span>
          <div class="target-hp">
            <HealthBar value={targetEnemy.hp} max={targetEnemy.maxHp} color="red" size="sm" />
          </div>
        </div>
      </div>
    {/if}

    <!-- Bottom HUD -->
    <div class="bottom-hud">
      <!-- Player vitals -->
      <div class="player-vitals">
        <div class="vital-bar">
          <HealthBar value={player.hp} max={player.maxHp} label="HP" size="sm" />
        </div>
        <div class="vital-bar">
          <HealthBar value={player.stamina} max={player.maxStamina} color="blue" label="STA" size="sm" />
        </div>
      </div>

      <!-- Stance hotbar + abilities -->
      <div class="hotbar">
        <div class="stance-bar">
          {#each STANCE_KEYS as stance, i}
            {@const info = STANCE_INFO[stance]}
            {@const isActive = player.stance === stance}
            <button
              class="stance-btn"
              class:active={isActive}
              style="--stance-color: {STANCE_COLORS[stance]}"
              title="{info.label}: {info.description} ({info.atkMod}, {info.defMod})"
              onclick={() => realtimeStore.sendInput({ moveX: 0, moveY: 0, attacking: false, abilitySlot: null, stanceChange: stance })}
            >
              <span class="stance-key">{i + 1}</span>
              <span class="stance-icon">{info.icon}</span>
            </button>
          {/each}
        </div>

        <div class="ability-slots">
          <button class="ability-btn" title="Ability 1 (Q)" onclick={() => realtimeStore.sendInput({ moveX: 0, moveY: 0, attacking: false, abilitySlot: 0, stanceChange: null })}>
            <span class="ability-key">Q</span>
          </button>
          <button class="ability-btn" title="Ability 2 (E)" onclick={() => realtimeStore.sendInput({ moveX: 0, moveY: 0, attacking: false, abilitySlot: 1, stanceChange: null })}>
            <span class="ability-key">E</span>
          </button>
        </div>
      </div>

      <!-- Current stance label -->
      <div class="stance-label" style="color: {STANCE_COLORS[player.stance]}">
        {STANCE_INFO[player.stance].label} &mdash; {STANCE_INFO[player.stance].special}
      </div>
    </div>

  {:else if status === 'connecting'}
    <div class="connecting">
      <p class="connecting-text">Entering arena<span class="loading-dots"></span></p>
    </div>

  {:else if status === 'disconnected'}
    <div class="end-overlay">
      <div class="end-content">
        <h1 class="end-title" style="color: var(--muted)">DISCONNECTED</h1>
        <button class="end-btn defeat-btn" onclick={() => realtimeStore.closeCombat()}>Return</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .realtime-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    z-index: 10;
  }

  /* Top bar */
  .top-bar {
    padding: var(--space-sm, 8px) var(--space-lg, 16px);
    pointer-events: auto;
  }
  .target-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    border: 1px solid var(--panel-border, rgba(255,107,53,0.25));
    border-radius: var(--radius-md, 6px);
    padding: var(--space-xs, 4px) var(--space-sm, 8px);
    max-width: 300px;
  }
  .target-name {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 14px;
    color: var(--flame-red, #ff3333);
    white-space: nowrap;
    min-width: 80px;
  }
  .target-hp {
    flex: 1;
    min-width: 100px;
  }

  /* Bottom HUD */
  .bottom-hud {
    margin-top: auto;
    padding: var(--space-sm, 8px) var(--space-lg, 16px);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
    pointer-events: auto;
    background: linear-gradient(to top, rgba(10,10,15,0.8) 0%, transparent 100%);
  }
  .player-vitals {
    display: flex;
    gap: var(--space-sm, 8px);
    max-width: 400px;
  }
  .vital-bar {
    flex: 1;
  }

  /* Hotbar */
  .hotbar {
    display: flex;
    align-items: center;
    gap: var(--space-md, 12px);
  }
  .stance-bar {
    display: flex;
    gap: var(--space-xs, 4px);
  }
  .stance-btn {
    position: relative;
    width: 40px;
    height: 40px;
    border: 2px solid rgba(255,255,255,0.15);
    border-radius: var(--radius-md, 6px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast, 0.15s ease);
    padding: 0;
  }
  .stance-btn.active {
    border-color: var(--stance-color);
    box-shadow: 0 0 8px color-mix(in srgb, var(--stance-color) 40%, transparent);
    background: color-mix(in srgb, var(--stance-color) 15%, var(--panel-bg, rgba(18,18,26,0.92)));
  }
  .stance-key {
    position: absolute;
    top: 1px;
    left: 3px;
    font-size: 9px;
    color: var(--muted, #888);
    font-family: var(--font-ui, 'Cinzel', serif);
  }
  .stance-icon {
    font-size: 18px;
  }
  .ability-slots {
    display: flex;
    gap: var(--space-xs, 4px);
    margin-left: var(--space-sm, 8px);
  }
  .ability-btn {
    width: 40px;
    height: 40px;
    border: 2px solid rgba(255,107,53,0.3);
    border-radius: var(--radius-md, 6px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast, 0.15s ease);
    padding: 0;
  }
  .ability-btn:hover {
    border-color: var(--ember-orange, #ff6b35);
  }
  .ability-key {
    font-size: 14px;
    font-weight: 600;
    color: var(--bone-white, #e8dcc4);
    font-family: var(--font-ui, 'Cinzel', serif);
  }

  /* Stance label */
  .stance-label {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.8;
  }

  /* End screens */
  .end-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    pointer-events: auto;
    animation: fadeIn var(--transition-slow, 0.5s ease);
  }
  .defeat-overlay {
    background: rgba(10,0,0,0.9);
  }
  .end-content {
    text-align: center;
    max-width: 360px;
    padding: var(--space-xl, 24px);
  }
  .end-title {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 48px;
    margin-bottom: var(--space-lg, 16px);
  }
  .victory-title {
    color: var(--gold, #ffd700);
    text-shadow: 0 0 30px rgba(255,215,0,0.6);
    animation: scaleIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .defeat-title {
    color: var(--flame-red, #ff3333);
    text-shadow: 0 0 30px rgba(255,51,51,0.6);
    animation: shake 0.6s ease;
  }
  .rewards {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
    margin-bottom: var(--space-xl, 24px);
    font-family: var(--font-ui, 'Cinzel', serif);
    color: var(--bone-white, #e8dcc4);
    font-size: 15px;
  }
  .reward-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    justify-content: center;
  }
  .xp-capped {
    font-size: 12px;
    color: var(--warning-amber, #f59e0b);
    font-style: italic;
  }
  .loot-item {
    color: var(--corruption-purple, #8b5cf6);
    font-size: 14px;
  }
  .gate-message {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 15px;
    color: var(--gold, #ffd700);
    padding: var(--space-sm, 8px);
    border: 1px solid var(--gold, #ffd700);
    border-radius: var(--radius-md, 6px);
    background: rgba(255,215,0,0.1);
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
  .end-btn {
    padding: var(--space-md, 12px) 40px;
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 18px;
    font-weight: 600;
    color: white;
    border-radius: var(--radius-lg, 8px);
    cursor: pointer;
    transition: all var(--transition-normal, 0.25s ease);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .victory-btn {
    background: rgba(255,107,53,0.3);
    border: 2px solid var(--ember-orange, #ff6b35);
  }
  .victory-btn:hover {
    background: rgba(255,107,53,0.5);
    box-shadow: var(--glow-ember), 0 0 25px rgba(255,107,53,0.4);
  }
  .defeat-btn {
    background: rgba(255,51,51,0.2);
    border: 2px solid var(--flame-red, #ff3333);
  }
  .defeat-btn:hover {
    background: rgba(255,51,51,0.4);
    box-shadow: var(--glow-red), 0 0 25px rgba(255,51,51,0.4);
  }

  /* Connecting state */
  .connecting {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    pointer-events: auto;
  }
  .connecting-text {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 28px;
    color: var(--ember-orange, #ff6b35);
    text-shadow: 0 0 20px rgba(255,107,53,0.6);
    animation: loadingPulse 2s ease-in-out infinite;
  }
  .loading-dots::after {
    content: '';
    animation: dots 1.5s steps(3, end) infinite;
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scaleIn { from { transform: scale(0.3); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-10px); }
    40% { transform: translateX(10px); }
    60% { transform: translateX(-6px); }
    80% { transform: translateX(6px); }
  }
  @keyframes loadingPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  @keyframes dots {
    0% { content: ''; }
    33% { content: '.'; }
    66% { content: '..'; }
    100% { content: '...'; }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .top-bar {
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
    }
    .bottom-hud {
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
    }
    .player-vitals {
      max-width: 100%;
    }
    .stance-btn, .ability-btn {
      width: 36px;
      height: 36px;
    }
    .stance-icon {
      font-size: 16px;
    }
    .end-title {
      font-size: 36px;
    }
  }
</style>
