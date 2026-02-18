<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { CLASS_DEFS } from '../three/ClassDefs';
  import type { PlayerClass } from '../stores/types';
  import type { WorldScene } from '../three/WorldScene';

  let { selectedClass, getScene }: {
    selectedClass: PlayerClass;
    getScene: () => WorldScene | null;
  } = $props();

  let classDef = $derived(CLASS_DEFS[selectedClass]);
  let nearPortal = $state(false);

  let pollInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    // Poll portal proximity at 10Hz
    pollInterval = setInterval(() => {
      const scene = getScene();
      if (scene) {
        nearPortal = scene.isNearPortal;
      }
    }, 100);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });
</script>

<div class="world-overlay">
  <!-- Top-left: Class badge -->
  {#if classDef}
    <div class="top-left">
      <div class="class-badge" style="--accent: {classDef.color}">
        <span class="class-badge-name">{classDef.name}</span>
        <span class="class-badge-role">{classDef.role}</span>
      </div>
    </div>
  {/if}

  <!-- Center-bottom: Portal interact prompt -->
  {#if nearPortal}
    <div class="portal-prompt">
      <span class="portal-prompt-text">
        Press <strong>E</strong> to Enter the Hollows
      </span>
    </div>
  {/if}

  <!-- Bottom: Controls hint -->
  <div class="controls-hint">
    <span>WASD Move</span>
    <span class="hint-sep">&middot;</span>
    <span>Scroll Zoom</span>
    <span class="hint-sep">&middot;</span>
    <span>Click Walk</span>
  </div>
</div>

<style>
  .world-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    z-index: 10;
  }

  .top-left {
    padding: 12px 16px;
    pointer-events: auto;
  }

  .class-badge {
    display: flex;
    flex-direction: column;
    background: rgba(18, 18, 26, 0.85);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    border-radius: 6px;
    padding: 3px 10px;
    width: fit-content;
  }
  .class-badge-name {
    font-family: 'MedievalSharp', cursive;
    font-size: 14px;
    color: var(--accent);
    line-height: 1.2;
  }
  .class-badge-role {
    font-family: 'Cinzel', serif;
    font-size: 9px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .portal-prompt {
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    animation: portalPulse 2s ease-in-out infinite;
  }
  .portal-prompt-text {
    font-family: 'MedievalSharp', cursive;
    font-size: 20px;
    color: #e8dcc4;
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(0, 255, 170, 0.5);
    border-radius: 8px;
    padding: 8px 20px;
    text-shadow: 0 0 10px rgba(0, 255, 170, 0.6);
    white-space: nowrap;
  }
  .portal-prompt-text strong {
    color: #00ffaa;
    text-shadow: 0 0 15px rgba(0, 255, 170, 0.8);
  }
  @keyframes portalPulse {
    0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
    50% { opacity: 0.85; transform: translateX(-50%) scale(1.03); }
  }

  .controls-hint {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    font-family: 'Cinzel', serif;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    background: rgba(0, 0, 0, 0.4);
    padding: 4px 12px;
    border-radius: 4px;
  }
  .hint-sep {
    opacity: 0.4;
  }
</style>
