<script lang="ts">
  import { onDestroy } from 'svelte';
  import { builderStore } from '../stores/builderStore.svelte';
  import { realtimeStore } from '../stores/realtimeStore.svelte';
  import ClassSelect from './ClassSelect.svelte';
  import ThreeScene from './ThreeScene.svelte';
  import ThreeDOverlay from './ThreeDOverlay.svelte';
  import type { PlayerClass } from '../stores/types';

  let { onBack }: { onBack: () => void } = $props();

  let selectedClass = $state<PlayerClass | null>(null);
  let ready = $state(false);
  let pointerLocked = $state(false);

  async function handleClassSelect(cls: PlayerClass) {
    selectedClass = cls;

    const arena = builderStore.toArenaData();
    // Map enemy catalog IDs to archetypes
    const archMap: Record<string, string> = {
      'enemies/Goblin': 'assassin',
      'enemies/Skeleton': 'guardian',
      'enemies/Skeleton_Armor': 'guardian',
      'enemies/Hedgehog': 'brute',
      'enemies/Wizard': 'caster',
      'enemies/Zombie': 'brute',
      'enemies/Yeti': 'brute',
      'enemies/Demon': 'boss',
      'enemies/Giant': 'boss',
    };

    const customArena = {
      arena,
      spawnPosition: builderStore.playerSpawn || { x: arena.width / 2, y: arena.height / 2 },
      enemies: [
        // Legacy BuilderEnemy entries
        ...builderStore.enemies.map(e => ({
          name: e.name,
          archetype: e.archetype,
          element: e.element,
          x: e.x,
          y: e.y,
        })),
        // Enemy props (3D models placed as props)
        ...builderStore.props
          .filter(p => p.catalogId.startsWith('enemies/'))
          .map(p => ({
            name: p.catalogId.split('/')[1],
            archetype: archMap[p.catalogId] || 'brute',
            element: 'none',
            x: p.x,
            y: p.y,
          })),
      ],
      resources: builderStore.resources.map(r => ({
        resourceId: r.resourceId,
        name: r.name,
        rarity: r.rarity,
        x: r.x,
        y: r.y,
      })),
    };

    await realtimeStore.connectDemo(builderStore.zone, cls, customArena);
    ready = true;
  }

  function handleBack() {
    realtimeStore.disconnect();
    onBack();
  }

  onDestroy(() => {
    realtimeStore.disconnect();
  });
</script>

<div class="play-mode">
  {#if !selectedClass}
    <ClassSelect onSelect={handleClassSelect} />
  {:else if ready}
    <ThreeScene
      onPointerLockChange={(locked) => { pointerLocked = locked; }}
      selectedClass={selectedClass}
    />
    <ThreeDOverlay {pointerLocked} selectedClass={selectedClass} />
    <button class="back-btn" onclick={handleBack}>
      Back to Editor
    </button>
  {:else}
    <div class="loading">Loading...</div>
  {/if}
</div>

<style>
  .play-mode {
    width: 100%;
    height: 100%;
    position: relative;
  }

  .back-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 100;
    padding: 8px 16px;
    background: rgba(10,10,18,0.9);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 6px;
    color: rgba(232,220,196,0.8);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 12px;
    transition: all 0.15s;
  }
  .back-btn:hover {
    background: rgba(255,107,53,0.2);
    border-color: rgba(255,107,53,0.4);
    color: #ff6b35;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-family: 'Cinzel', serif;
    font-size: 18px;
    color: rgba(232,220,196,0.5);
  }
</style>
