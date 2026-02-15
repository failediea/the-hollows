<script lang="ts">
  let { value, max, color = 'green', label = '', size = 'md' }: {
    value: number;
    max: number;
    color?: 'green' | 'red' | 'blue';
    label?: string;
    size?: 'sm' | 'md';
  } = $props();

  let clampedMax = $derived(Math.max(1, max));
  let clampedValue = $derived(Math.max(0, Math.min(value, clampedMax)));
  let pct = $derived(Math.max(0, Math.min((clampedValue / clampedMax) * 100, 100)));

  let barGradient = $derived(
    color === 'blue' ? 'linear-gradient(90deg, #60a5fa, #3b82f6)' :
    color === 'red' ? 'linear-gradient(90deg, #7f1d1d, #ff3333)' :
    pct > 60 ? 'linear-gradient(90deg, #16a34a, #4ade80)' :
    pct > 30 ? 'linear-gradient(90deg, #ca8a04, #fbbf24)' :
    'linear-gradient(90deg, #991b1b, #ef4444)'
  );

  let trackHeight = $derived(size === 'sm' ? '14px' : '20px');
  let fontSize = $derived(size === 'sm' ? '10px' : '12px');
</script>

<div class="health-bar">
  {#if label}
    <div class="bar-label">{label}</div>
  {/if}
  <div class="bar-track" style="height: {trackHeight}">
    <div
      class="bar-fill"
      style="width: {pct}%; background: {barGradient}"
    ></div>
    <span class="bar-text" style="font-size: {fontSize}">{clampedValue} / {clampedMax}</span>
  </div>
</div>

<style>
  .health-bar { width: 100%; }
  .bar-label {
    font-size: 10px;
    color: var(--muted, #888);
    margin-bottom: 2px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-family: var(--font-ui, 'Cinzel', serif);
  }
  .bar-track {
    position: relative;
    background: var(--panel-bg, rgba(18,18,26,0.92));
    border: 1px solid var(--panel-border, rgba(255,107,53,0.25));
    border-radius: var(--radius-sm, 4px);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    transition: width var(--transition-slow, 0.5s ease), background var(--transition-normal, 0.25s ease);
    border-radius: calc(var(--radius-sm, 4px) - 1px);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
  }
  .bar-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-family: var(--font-ui, 'Cinzel', serif);
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);
    white-space: nowrap;
  }
</style>
