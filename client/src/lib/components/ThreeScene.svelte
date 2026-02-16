<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { DungeonScene } from '../three/DungeonScene';
  import type { PlayerClass } from '../stores/types';

  let { onPointerLockChange, selectedClass }: {
    onPointerLockChange?: (locked: boolean) => void;
    selectedClass?: PlayerClass;
  } = $props();

  let containerEl: HTMLDivElement;
  let dungeonScene: DungeonScene | null = null;

  onMount(() => {
    dungeonScene = new DungeonScene(containerEl, {
      onPointerLockChange,
    }, selectedClass);
  });

  onDestroy(() => {
    if (dungeonScene) {
      dungeonScene.dispose();
      dungeonScene = null;
    }
  });
</script>

<div class="three-container" bind:this={containerEl}></div>

<style>
  .three-container {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .three-container :global(canvas) {
    display: block;
  }

  /* CSS2D label styles for enemies */
  .three-container :global(.enemy-label-3d) {
    text-align: center;
    pointer-events: none;
    user-select: none;
  }
  .three-container :global(.enemy-name) {
    font-family: 'MedievalSharp', cursive;
    font-size: 12px;
    color: #ff3333;
    text-shadow: 0 0 4px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.9);
    white-space: nowrap;
  }
  .three-container :global(.enemy-hp-bar) {
    width: 50px;
    height: 4px;
    background: rgba(0,0,0,0.7);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 2px;
    overflow: hidden;
    margin: 2px auto 0;
  }
  .three-container :global(.enemy-hp-fill) {
    height: 100%;
    background: #ff3333;
    transition: width 0.3s ease;
  }

  /* CSS2D label styles for resources */
  .three-container :global(.resource-label-3d) {
    font-family: 'MedievalSharp', cursive;
    font-size: 10px;
    color: #cccccc;
    text-shadow: 0 0 4px rgba(0,0,0,0.8);
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
  }

  /* CSS2D floating damage numbers */
  .three-container :global(.damage-number-3d) {
    font-family: 'MedievalSharp', cursive;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
    z-index: 20;
  }
</style>
