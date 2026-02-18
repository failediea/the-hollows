<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { BuilderScene } from '../three/BuilderScene';

  let containerEl: HTMLDivElement;
  let builderScene: BuilderScene | null = null;

  export function getScene(): BuilderScene | null {
    return builderScene;
  }

  onMount(() => {
    builderScene = new BuilderScene(containerEl);
  });

  onDestroy(() => {
    if (builderScene) {
      builderScene.dispose();
      builderScene = null;
    }
  });
</script>

<div class="builder-container" bind:this={containerEl}></div>

<style>
  .builder-container {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .builder-container :global(canvas) {
    display: block;
  }
</style>
