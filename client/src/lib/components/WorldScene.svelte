<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { WorldScene } from '../three/WorldScene';
  import type { PlayerClass } from '../stores/types';

  let { selectedClass, onDungeonEnter }: {
    selectedClass: PlayerClass;
    onDungeonEnter: () => void;
  } = $props();

  let containerEl: HTMLDivElement;
  let worldScene: WorldScene | null = null;

  export function getScene(): WorldScene | null {
    return worldScene;
  }

  onMount(() => {
    worldScene = new WorldScene(containerEl, {
      onDungeonEnter,
    }, selectedClass);
  });

  onDestroy(() => {
    if (worldScene) {
      worldScene.dispose();
      worldScene = null;
    }
  });
</script>

<div class="world-container" bind:this={containerEl}></div>

<style>
  .world-container {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .world-container :global(canvas) {
    display: block;
  }
</style>
