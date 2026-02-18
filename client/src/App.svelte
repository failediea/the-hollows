<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Phaser from 'phaser';
  import { createGameConfig, createRealtimeGameConfig } from './lib/phaser/config';
  import { combatStore } from './lib/stores/combatStore.svelte';
  import { realtimeStore } from './lib/stores/realtimeStore.svelte';
  import CombatOverlay from './lib/components/CombatOverlay.svelte';
  import RealtimeCombatOverlay from './lib/components/RealtimeCombatOverlay.svelte';
  import ThreeScene from './lib/components/ThreeScene.svelte';
  import ThreeDOverlay from './lib/components/ThreeDOverlay.svelte';
  import ClassSelect from './lib/components/ClassSelect.svelte';
  import BuilderSceneComponent from './lib/components/BuilderScene.svelte';
  import BuilderOverlay from './lib/components/BuilderOverlay.svelte';
  import BuilderPlayMode from './lib/components/BuilderPlayMode.svelte';
  import type { EncounterType } from './lib/stores/types';
  import type { PlayerClass } from './lib/stores/types';

  let { combatId, zone, apiKey, encounterType, mode = 'turnbased' }: {
    combatId: string;
    zone: string;
    apiKey: string;
    encounterType: EncounterType;
    mode?: 'turnbased' | 'realtime' | '3d' | 'builder';
  } = $props();

  let isRealtime = $derived(mode === 'realtime');
  let is3D = $derived(mode === '3d');
  let game: Phaser.Game | null = null;
  let ready = $state(false);
  let pointerLocked = $state(false);
  let selectedClass = $state<PlayerClass | null>(null);
  let isBuilder = $derived(mode === 'builder');
  let builderPlaying = $state(false);
  let builderSceneRef: BuilderSceneComponent | null = null;

  async function handleClassSelect(cls: PlayerClass) {
    selectedClass = cls;
    // Connect demo with selected class
    if (combatId) {
      realtimeStore.connect(combatId, apiKey);
    } else {
      await realtimeStore.connectDemo(zone || 'tomb_halls', cls);
    }
    ready = true;
  }

  function handleBuilderPlay() {
    builderPlaying = true;
  }

  function handleBuilderBack() {
    builderPlaying = false;
  }

  function handleBuilderRebuild() {
    if (builderSceneRef) {
      const scene = builderSceneRef.getScene();
      if (scene) scene.rebuildDungeon();
    }
  }

  onMount(async () => {
    if (isBuilder) {
      // Builder mode: no connection needed, handled by components
    } else if (is3D) {
      // 3D dungeon mode: show class select first (don't connect yet)
      // Connection happens in handleClassSelect
    } else if (isRealtime) {
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

    if (game) {
      // Mark as ready once Phaser scene is created
      game.events.on('ready', () => {
        ready = true;
      });

      // Fallback: mark ready after a short delay
      setTimeout(() => { ready = true; }, 1000);
    }
  });

  onDestroy(() => {
    if (game) {
      game.destroy(true);
      game = null;
    }
    if (isRealtime || is3D) {
      realtimeStore.disconnect();
    }
  });
</script>

<div class="combat-app">
  {#if isBuilder && !builderPlaying}
    <BuilderSceneComponent bind:this={builderSceneRef} />
    <BuilderOverlay onPlay={handleBuilderPlay} onRebuild={handleBuilderRebuild} getScene={() => builderSceneRef?.getScene() ?? null} />
  {:else if isBuilder && builderPlaying}
    <BuilderPlayMode onBack={handleBuilderBack} />
  {:else if is3D && !selectedClass}
    <ClassSelect onSelect={handleClassSelect} />
  {:else if is3D && selectedClass}
    <ThreeScene
      onPointerLockChange={(locked) => { pointerLocked = locked; }}
      {selectedClass}
    />
    <ThreeDOverlay {pointerLocked} {selectedClass} />
  {:else}
    <div id="phaser-container" class="phaser-container"></div>
    {#if isRealtime}
      <RealtimeCombatOverlay />
    {:else}
      <CombatOverlay />
    {/if}
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
