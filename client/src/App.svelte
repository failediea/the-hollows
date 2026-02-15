<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Phaser from 'phaser';
  import { createGameConfig, createRealtimeGameConfig } from './lib/phaser/config';
  import { combatStore } from './lib/stores/combatStore.svelte';
  import { realtimeStore } from './lib/stores/realtimeStore.svelte';
  import CombatOverlay from './lib/components/CombatOverlay.svelte';
  import RealtimeCombatOverlay from './lib/components/RealtimeCombatOverlay.svelte';
  import type { EncounterType } from './lib/stores/types';

  let { combatId, zone, apiKey, encounterType, mode = 'turnbased' }: {
    combatId: string;
    zone: string;
    apiKey: string;
    encounterType: EncounterType;
    mode?: 'turnbased' | 'realtime';
  } = $props();

  let isRealtime = $derived(mode === 'realtime');
  let game: Phaser.Game | null = null;
  let ready = $state(false);

  onMount(async () => {
    if (isRealtime) {
      // Real-time mode: connect WebSocket and create arena scene
      realtimeStore.connect(combatId, apiKey);
      const config = createRealtimeGameConfig('phaser-container');
      game = new Phaser.Game(config);
    } else {
      // Turn-based mode: existing behavior
      await combatStore.initCombat(combatId, zone, apiKey, encounterType);
      const config = createGameConfig('phaser-container');
      game = new Phaser.Game(config);
    }

    // Mark as ready once Phaser scene is created
    game.events.on('ready', () => {
      ready = true;
    });

    // Fallback: mark ready after a short delay
    setTimeout(() => { ready = true; }, 1000);
  });

  onDestroy(() => {
    if (game) {
      game.destroy(true);
      game = null;
    }
    if (isRealtime) {
      realtimeStore.disconnect();
    }
  });
</script>

<div class="combat-app">
  <div id="phaser-container" class="phaser-container"></div>
  {#if isRealtime}
    <RealtimeCombatOverlay />
  {:else}
    <CombatOverlay />
  {/if}
</div>

<style>
  .combat-app {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: #0a0a0f;
  }
  .phaser-container {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
  }
  .phaser-container :global(canvas) {
    display: block;
  }
</style>
