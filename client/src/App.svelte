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
  import WorldSceneComponent from './lib/components/WorldScene.svelte';
  import WorldOverlay from './lib/components/WorldOverlay.svelte';
  import type { EncounterType } from './lib/stores/types';
  import type { PlayerClass } from './lib/stores/types';

  let { combatId, zone, apiKey, encounterType, mode = 'turnbased' }: {
    combatId: string;
    zone: string;
    apiKey: string;
    encounterType: EncounterType;
    mode?: 'turnbased' | 'realtime' | '3d' | 'builder' | 'world';
  } = $props();

  let isRealtime = $derived(mode === 'realtime');
  let is3D = $derived(mode === '3d');
  let isWorld = $derived(mode === 'world');
  let game: Phaser.Game | null = null;
  let ready = $state(false);
  let pointerLocked = $state(false);
  let selectedClass = $state<PlayerClass | null>(null);
  let isBuilder = $derived(mode === 'builder');
  let builderPlaying = $state(false);
  let builderSceneRef: BuilderSceneComponent | null = null;

  // World mode state
  let worldPhase = $state<'hub' | 'dungeon'>('hub');
  let worldSceneRef: WorldSceneComponent | null = null;
  let transitioning = $state(false);

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

  function handleWorldClassSelect(cls: PlayerClass) {
    selectedClass = cls;
    ready = true;
    // Do NOT connect realtimeStore — that happens on dungeon enter
  }

  async function handleDungeonEnter() {
    if (transitioning) return;
    transitioning = true;

    // Wait for fade overlay to show
    await new Promise(r => setTimeout(r, 500));

    // Switch phase: unmounts WorldScene, mounts ThreeScene
    worldPhase = 'dungeon';

    // Connect to dungeon combat
    await realtimeStore.connectDemo(zone || 'tomb_halls', selectedClass || 'reaver');

    transitioning = false;
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
    if (isWorld) {
      // World mode: show class select first, no connection yet
    } else if (isBuilder) {
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
    if (isRealtime || is3D || (isWorld && worldPhase === 'dungeon')) {
      realtimeStore.disconnect();
    }
  });
</script>

<div class="combat-app">
  <!-- World mode -->
  {#if isWorld && !selectedClass}
    <ClassSelect onSelect={handleWorldClassSelect} />
  {:else if isWorld && selectedClass && worldPhase === 'hub' && !transitioning}
    <WorldSceneComponent
      bind:this={worldSceneRef}
      {selectedClass}
      onDungeonEnter={handleDungeonEnter}
    />
    <WorldOverlay
      {selectedClass}
      getScene={() => worldSceneRef?.getScene() ?? null}
    />
  {:else if isWorld && transitioning}
    <div class="transition-overlay">
      <p class="transition-text">Descending into the Hollows<span class="loading-dots"></span></p>
    </div>
  {:else if isWorld && worldPhase === 'dungeon' && selectedClass}
    <ThreeScene
      onPointerLockChange={(locked) => { pointerLocked = locked; }}
      {selectedClass}
    />
    <ThreeDOverlay {pointerLocked} {selectedClass} />

  <!-- Builder mode -->
  {:else if isBuilder && !builderPlaying}
    <BuilderSceneComponent bind:this={builderSceneRef} />
    <BuilderOverlay onPlay={handleBuilderPlay} onRebuild={handleBuilderRebuild} getScene={() => builderSceneRef?.getScene() ?? null} />
  {:else if isBuilder && builderPlaying}
    <BuilderPlayMode onBack={handleBuilderBack} />

  <!-- 3D dungeon mode -->
  {:else if is3D && !selectedClass}
    <ClassSelect onSelect={handleClassSelect} />
  {:else if is3D && selectedClass}
    <ThreeScene
      onPointerLockChange={(locked) => { pointerLocked = locked; }}
      {selectedClass}
    />
    <ThreeDOverlay {pointerLocked} {selectedClass} />

  <!-- Phaser modes (turnbased / realtime) -->
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

  .transition-overlay {
    position: absolute;
    inset: 0;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    animation: fadeIn 0.4s ease;
  }
  .transition-text {
    font-family: 'MedievalSharp', cursive;
    font-size: 28px;
    color: #00ffaa;
    text-shadow: 0 0 20px rgba(0, 255, 170, 0.6);
    animation: loadingPulse 2s ease-in-out infinite;
  }
  .loading-dots::after {
    content: '';
    animation: dots 1.5s steps(3, end) infinite;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
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
</style>
