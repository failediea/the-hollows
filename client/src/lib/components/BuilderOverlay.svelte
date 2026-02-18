<script lang="ts">
  import { builderStore, GRID_CELL, type BuilderTool } from '../stores/builderStore.svelte';
  import { ARENA_SCALE } from '../three/DungeonBuilder';
  import type { BuilderScene } from '../three/BuilderScene';
  import { ASSET_CATEGORIES, type AssetCategory } from '../three/BuilderAssetCatalog';

  const pixelBlockEntries = ASSET_CATEGORIES.find(c => c.id === 'pixel_blocks')?.entries ?? [];

  let { onPlay, onRebuild, getScene }: {
    onPlay: () => void;
    onRebuild: () => void;
    getScene: () => BuilderScene | null;
  } = $props();

  const tools: { id: BuilderTool; label: string; hotkey: string }[] = [
    { id: 'select',       label: 'Select',   hotkey: '1' },
    { id: 'prop',         label: 'Prop',     hotkey: '2' },
    { id: 'player_spawn', label: 'Spawn',    hotkey: '3' },
    { id: 'exit_portal',  label: 'Exit',     hotkey: '4' },
    { id: 'resource',     label: 'Resource', hotkey: '5' },
    { id: 'wall_erase',   label: 'Erase',    hotkey: '6' },
    { id: 'wall_paint',   label: 'Wall',     hotkey: '8' },
  ];

  const zones = [
    { id: 'the_gate', name: 'The Gate' },
    { id: 'tomb_halls', name: 'Tomb Halls' },
    { id: 'the_mines', name: 'The Mines' },
    { id: 'the_web', name: 'The Web' },
    { id: 'forge_of_ruin', name: 'Forge of Ruin' },
    { id: 'bone_throne', name: 'Bone Throne' },
    { id: 'abyss_bridge', name: 'Abyss Bridge' },
    { id: 'black_pit', name: 'Black Pit' },
  ];

  const resourceTypes = ['iron_scraps', 'dark_iron', 'cursed_steel', 'herbs', 'spider_silk', 'shadow_thread', 'bone_dust', 'ancient_coins', 'gems', 'ember_core'];
  const rarities = ['common', 'uncommon', 'rare', 'legendary'];

  let assetCategory = $state<AssetCategory>('environment');
  let assetSearch = $state('');

  // --- Generate Dungeon ---
  let generateSeed = $state(Math.floor(Math.random() * 100000));
  let generateSize = $state<'small' | 'medium' | 'large'>('medium');
  let showGeneratePanel = $state(false);

  // --- Pixel Block Style ---
  let blockStyleEnabled = $state(builderStore.blockStyle?.enabled ?? false);
  let blockFloor = $state(builderStore.blockStyle?.floorBlock ?? 'pixel_blocks/Stone');
  let blockWall = $state(builderStore.blockStyle?.wallBlock ?? 'pixel_blocks/Bricks_Dark');
  let blockWallHeight = $state(builderStore.blockStyle?.wallHeight ?? 3);

  function handleBlockStyleChange() {
    builderStore.blockStyle = blockStyleEnabled
      ? { floorBlock: blockFloor, wallBlock: blockWall, wallHeight: blockWallHeight, enabled: true }
      : null;
    onRebuild();
  }

  function handleGenerate() {
    // Apply block style before generating
    builderStore.blockStyle = blockStyleEnabled
      ? { floorBlock: blockFloor, wallBlock: blockWall, wallHeight: blockWallHeight, enabled: true }
      : null;
    builderStore.generateDungeon(generateSeed, generateSize);
    onRebuild();
  }

  function rollSeed() {
    generateSeed = Math.floor(Math.random() * 100000);
  }

  // --- AI Prompt Panel ---
  interface PromptMessage {
    id: number;
    text: string;
    agent: string;
    timestamp: number;
  }

  const agents = [
    { id: 'auto', label: 'Auto', desc: 'Let Claude pick the right agent' },
    { id: 'gltf-scene-builder', label: 'Scene', desc: 'Scene assembly, glTF generation, layout' },
    { id: 'procedural-dungeon', label: 'Dungeon', desc: 'BSP/cellular automata generation' },
    { id: 'gltf-asset-creator', label: 'Asset', desc: 'Procedural geometry → GLB' },
    { id: 'pbr-material-library', label: 'Material', desc: 'Dark fantasy PBR materials' },
    { id: 'threejs', label: 'Three.js', desc: 'General Three.js / WebGL' },
  ];

  let aiPanelOpen = $state(false);
  let aiPromptText = $state('');
  let aiSelectedAgent = $state('auto');
  let aiMessages = $state<PromptMessage[]>([]);
  let aiNextId = $state(1);
  let aiScrollEl: HTMLDivElement | null = $state(null);
  let copiedId = $state<number | null>(null);

  function buildContext(): string {
    const parts: string[] = [];
    parts.push(`Zone: ${builderStore.zone}`);
    parts.push(`Arena: ${builderStore.arenaWidth}x${builderStore.arenaHeight}`);
    parts.push(`Walls: ${wallCount} cells`);
    parts.push(`Resources: ${builderStore.resources.length}, Props: ${builderStore.props.length}`);
    if (builderStore.playerSpawn) parts.push(`Spawn: (${builderStore.playerSpawn.x}, ${builderStore.playerSpawn.y})`);
    if (builderStore.exitPosition) parts.push(`Exit: (${builderStore.exitPosition.x}, ${builderStore.exitPosition.y})`);
    if (builderStore.selectedId) {
      const prop = builderStore.props.find(p => p.id === builderStore.selectedId);
      if (prop) parts.push(`Selected prop: ${prop.catalogId} at (${prop.x}, ${prop.y}) scale=${prop.scale} rot=${prop.rotation.toFixed(2)}`);
    }
    return parts.join(' | ');
  }

  function handleAiSend() {
    const text = aiPromptText.trim();
    if (!text) return;

    const agent = aiSelectedAgent;
    const context = buildContext();
    const fullPrompt = agent === 'auto'
      ? `[Builder Context: ${context}]\n\n${text}`
      : `[Agent: ${agent}] [Builder Context: ${context}]\n\n${text}`;

    aiMessages = [...aiMessages, {
      id: aiNextId++,
      text: fullPrompt,
      agent,
      timestamp: Date.now(),
    }];
    aiPromptText = '';

    // Auto-scroll
    requestAnimationFrame(() => {
      if (aiScrollEl) aiScrollEl.scrollTop = aiScrollEl.scrollHeight;
    });
  }

  function handleAiKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAiSend();
    }
    // Stop propagation so WASD/hotkeys don't fire
    e.stopPropagation();
  }

  function copyMessage(msg: PromptMessage) {
    navigator.clipboard.writeText(msg.text).then(() => {
      copiedId = msg.id;
      setTimeout(() => { if (copiedId === msg.id) copiedId = null; }, 1500);
    });
  }

  function clearMessages() {
    aiMessages = [];
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  let filteredAssets = $derived.by(() => {
    const cat = ASSET_CATEGORIES.find(c => c.id === assetCategory);
    if (!cat) return [];
    if (!assetSearch) return cat.entries;
    const q = assetSearch.toLowerCase();
    return cat.entries.filter(e => e.name.toLowerCase().includes(q));
  });

  // Count wall cells
  let wallCount = $derived.by(() => {
    let count = 0;
    const grid = builderStore.wallGrid;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === 1) count++;
    }
    return count;
  });

  // --- Minimap ---
  let minimapCanvas: HTMLCanvasElement | null = $state(null);
  const MINIMAP_W = 160;
  let minimapH = $derived(Math.round(MINIMAP_W * (builderStore.arenaHeight / builderStore.arenaWidth)));

  // Poll camera position for viewport indicator (camera moves independently of store state)
  $effect(() => {
    if (!minimapCanvas) return;
    const interval = setInterval(() => drawMinimap(), 100);
    return () => clearInterval(interval);
  });

  // Also redraw immediately when store data changes
  $effect(() => {
    const _grid = builderStore.wallGrid;
    const _spawn = builderStore.playerSpawn;
    const _exit = builderStore.exitPosition;
    const _enemies = builderStore.enemies;
    const _resources = builderStore.resources;
    const _props = builderStore.props;
    drawMinimap();
  });

  function handleMinimapClick(e: MouseEvent) {
    const scene = getScene();
    if (!minimapCanvas || !scene) return;
    const rect = minimapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Convert minimap pixel to arena coordinates
    const arenaX = (mx / MINIMAP_W) * builderStore.arenaWidth;
    const arenaY = (my / minimapH) * builderStore.arenaHeight;

    // Convert arena to world coordinates (arena center = world origin)
    const worldX = (arenaX - builderStore.arenaWidth / 2) * ARENA_SCALE;
    const worldZ = (arenaY - builderStore.arenaHeight / 2) * ARENA_SCALE;

    scene.panCameraTo(worldX, worldZ);
  }

  function drawMinimap() {
    if (!minimapCanvas) return;
    const ctx = minimapCanvas.getContext('2d');
    if (!ctx) return;

    const aW = builderStore.arenaWidth;
    const aH = builderStore.arenaHeight;
    const mW = MINIMAP_W;
    const mH = minimapH;
    const scaleX = mW / aW;
    const scaleY = mH / aH;

    ctx.clearRect(0, 0, mW, mH);

    // Background
    ctx.fillStyle = '#0c0a10';
    ctx.fillRect(0, 0, mW, mH);

    // Floor area
    ctx.fillStyle = '#1a1720';
    ctx.fillRect(0, 0, mW, mH);

    // Walls from grid
    const grid = builderStore.wallGrid;
    const gridW = builderStore.gridW;
    const gridH = builderStore.gridH;
    const cellW = GRID_CELL * scaleX;
    const cellH = GRID_CELL * scaleY;
    ctx.fillStyle = '#5a5060';
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        if (grid[gy * gridW + gx] === 1) {
          ctx.fillRect(gx * cellW, gy * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }

    // Resources — colored diamonds
    for (const res of builderStore.resources) {
      const rx = res.x * scaleX;
      const ry = res.y * scaleY;
      const colors: Record<string, string> = {
        common: '#aaa', uncommon: '#2ecc71', rare: '#3498db', legendary: '#f39c12',
      };
      ctx.fillStyle = colors[res.rarity] || '#aaa';
      ctx.beginPath();
      ctx.moveTo(rx, ry - 2.5);
      ctx.lineTo(rx + 2, ry);
      ctx.lineTo(rx, ry + 2.5);
      ctx.lineTo(rx - 2, ry);
      ctx.closePath();
      ctx.fill();
    }

    // Props — small white dots
    for (const prop of builderStore.props) {
      const px = prop.x * scaleX;
      const py = prop.y * scaleY;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies — red dots with glow
    for (const e of builderStore.enemies) {
      const ex = e.x * scaleX;
      const ey = e.y * scaleY;
      ctx.fillStyle = 'rgba(255,50,50,0.3)';
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Exit — cyan circle
    const exit = builderStore.exitPosition;
    if (exit) {
      const ex = exit.x * scaleX;
      const ey = exit.y * scaleY;
      ctx.fillStyle = 'rgba(0,255,170,0.25)';
      ctx.beginPath();
      ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#00ffaa';
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player spawn — green dot
    const spawn = builderStore.playerSpawn;
    if (spawn) {
      const sx = spawn.x * scaleX;
      const sy = spawn.y * scaleY;
      ctx.strokeStyle = 'rgba(74,222,128,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Camera viewport indicator
    const scene = getScene();
    if (scene) {
      const camPos = scene.getCameraWorldPosition();
      // World coords → arena coords
      const camArenaX = camPos.x / ARENA_SCALE + aW / 2;
      const camArenaY = camPos.z / ARENA_SCALE + aH / 2;
      const cx = camArenaX * scaleX;
      const cy = camArenaY * scaleY;

      // Draw a crosshair / viewport rect
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 12, cy - 9, 24, 18);

      // Center dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = 'rgba(255,107,53,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, mW - 1, mH - 1);
  }

  function handleZoneChange(e: Event) {
    builderStore.zone = (e.target as HTMLSelectElement).value;
    onRebuild();
  }

  function handleSave() {
    const json = builderStore.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${builderStore.mapName.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoad() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        builderStore.importJSON(text);
        onRebuild();
      } catch (e) {
        console.error('Failed to import map:', e);
      }
    };
    input.click();
  }

  function handleClear() {
    if (confirm('Clear all map data? This cannot be undone.')) {
      builderStore.clear();
      onRebuild();
    }
  }

  function handlePlay() {
    if (!builderStore.playerSpawn) {
      alert('Place a player spawn point first (tool 3)');
      return;
    }
    onPlay();
  }

  function handleDeleteSelected() {
    if (builderStore.selectedId) {
      builderStore.removeEnemy(builderStore.selectedId);
      builderStore.removeResource(builderStore.selectedId);
      builderStore.removeProp(builderStore.selectedId);
      onRebuild();
    }
  }
</script>

<div class="builder-overlay">
  <!-- Top toolbar -->
  <div class="top-bar">
    <div class="tool-group">
      {#each tools as tool}
        <button
          class="tool-btn"
          class:active={builderStore.activeTool === tool.id}
          onclick={() => builderStore.activeTool = tool.id}
          title="{tool.label} ({tool.hotkey})"
        >
          <span class="tool-label">{tool.label}</span>
          <span class="tool-hotkey">{tool.hotkey}</span>
        </button>
      {/each}
    </div>

    <div class="top-right">
      <button
        class="toggle-btn"
        class:active={builderStore.showGrid}
        onclick={() => builderStore.showGrid = !builderStore.showGrid}
        title="Toggle Grid (G)"
      >
        Grid
      </button>
      <div class="map-info">
        {builderStore.arenaWidth}x{builderStore.arenaHeight} | Walls: {wallCount} | Res: {builderStore.resources.length} | Props: {builderStore.props.length}
      </div>
    </div>
  </div>

  <!-- Minimap -->
  <div class="minimap-container" role="button" tabindex="-1" onclick={handleMinimapClick}>
    <canvas
      bind:this={minimapCanvas}
      width={MINIMAP_W}
      height={minimapH}
      class="minimap-canvas"
    ></canvas>
  </div>

  <!-- Properties panel (context-sensitive) -->
  <div class="properties-panel">
    {#if builderStore.activeTool === 'resource'}
      <div class="prop-group">
        <label>Type</label>
        <select bind:value={builderStore.resourceType}>
          {#each resourceTypes as rt}
            <option value={rt}>{rt.replace(/_/g, ' ')}</option>
          {/each}
        </select>
      </div>
      <div class="prop-group">
        <label>Rarity</label>
        <select bind:value={builderStore.resourceRarity}>
          {#each rarities as r}
            <option value={r}>{r}</option>
          {/each}
        </select>
      </div>
    {:else if builderStore.activeTool === 'prop'}
      <div class="prop-group">
        <div class="asset-category-tabs">
          {#each ASSET_CATEGORIES as cat}
            <button
              class="cat-tab"
              class:active={assetCategory === cat.id}
              onclick={() => assetCategory = cat.id}
              title={cat.label}
            >
              {cat.label}
            </button>
          {/each}
        </div>
        <input
          type="text"
          class="asset-search"
          placeholder="Search..."
          bind:value={assetSearch}
        />
        <div class="asset-list">
          {#each filteredAssets as entry}
            <button
              class="asset-item"
              class:selected={builderStore.selectedCatalogId === entry.id}
              onclick={() => builderStore.selectedCatalogId = entry.id}
            >
              {entry.name}
            </button>
          {/each}
        </div>
      </div>
    {:else if builderStore.activeTool === 'select' && builderStore.selectedId}
      {#if builderStore.props.find(p => p.id === builderStore.selectedId)}
        {@const selectedProp = builderStore.props.find(p => p.id === builderStore.selectedId)!}
        <div class="prop-group">
          <span class="selected-info">Selected: {selectedProp.catalogId}</span>
          <div class="prop-controls">
            <label>Rotation</label>
            <input type="range" min="0" max="6.28" step="0.785"
              value={selectedProp.rotation}
              oninput={(e) => builderStore.updateProp(selectedProp.id, { rotation: parseFloat(e.currentTarget.value) })}
            />
            <label>Scale: {selectedProp.scale.toFixed(1)}x</label>
            <input type="range" min="0.2" max="3" step="0.1"
              value={selectedProp.scale}
              oninput={(e) => builderStore.updateProp(selectedProp.id, { scale: parseFloat(e.currentTarget.value) })}
            />
          </div>
          {#if (getScene()?.getAnimationClips(selectedProp.id) ?? []).length > 0}
            {@const clipNames = getScene()?.getAnimationClips(selectedProp.id) ?? []}
            {@const currentClip = getScene()?.getCurrentClip(selectedProp.id) ?? null}
            <label>Animations</label>
            <div class="anim-buttons">
              {#each clipNames as clip}
                <button
                  class="anim-btn"
                  class:active={currentClip === clip}
                  onclick={() => getScene()?.playAnimation(selectedProp.id, clip)}
                >
                  {clip}
                </button>
              {/each}
            </div>
          {/if}
          <button class="delete-btn" onclick={handleDeleteSelected}>Delete</button>
        </div>
      {:else}
        <div class="prop-group">
          <span class="selected-info">Selected: {builderStore.selectedId}</span>
          <button class="delete-btn" onclick={handleDeleteSelected}>Delete</button>
        </div>
      {/if}
    {/if}
  </div>

  <!-- AI Prompt Panel -->
  <div class="ai-panel" class:open={aiPanelOpen}>
    <button class="ai-toggle" onclick={() => aiPanelOpen = !aiPanelOpen}>
      <span class="ai-toggle-icon">{aiPanelOpen ? '\u25BC' : '\u25B2'}</span>
      <span>AI Prompt</span>
      {#if aiMessages.length > 0}
        <span class="ai-badge">{aiMessages.length}</span>
      {/if}
    </button>

    {#if aiPanelOpen}
      <div class="ai-body">
        <div class="ai-agent-bar">
          {#each agents as agent}
            <button
              class="ai-agent-btn"
              class:active={aiSelectedAgent === agent.id}
              onclick={() => aiSelectedAgent = agent.id}
              title={agent.desc}
            >
              {agent.label}
            </button>
          {/each}
        </div>

        <div class="ai-messages" bind:this={aiScrollEl}>
          {#if aiMessages.length === 0}
            <div class="ai-empty">
              Type a prompt and copy it to Claude Code. The builder context (zone, arena size, entities) is auto-attached.
            </div>
          {/if}
          {#each aiMessages as msg (msg.id)}
            <div class="ai-msg">
              <div class="ai-msg-header">
                <span class="ai-msg-agent">{agents.find(a => a.id === msg.agent)?.label ?? msg.agent}</span>
                <span class="ai-msg-time">{formatTime(msg.timestamp)}</span>
                <button class="ai-copy-btn" onclick={() => copyMessage(msg)}>
                  {copiedId === msg.id ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div class="ai-msg-text">{msg.text}</div>
            </div>
          {/each}
        </div>

        <div class="ai-input-row">
          <textarea
            class="ai-input"
            placeholder="Describe what you want to build..."
            bind:value={aiPromptText}
            onkeydown={handleAiKeydown}
            rows={2}
          ></textarea>
          <div class="ai-input-actions">
            <button class="ai-send-btn" onclick={handleAiSend} disabled={!aiPromptText.trim()}>Send</button>
            {#if aiMessages.length > 0}
              <button class="ai-clear-btn" onclick={clearMessages}>Clear</button>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Generate Dungeon Panel -->
  {#if showGeneratePanel}
    <div class="generate-panel">
      <div class="gen-header">Generate Dungeon</div>
      <div class="gen-row">
        <label>Seed</label>
        <div class="gen-seed-row">
          <input
            type="number"
            class="gen-seed-input"
            bind:value={generateSeed}
            onkeydown={(e) => e.stopPropagation()}
          />
          <button class="gen-roll-btn" onclick={rollSeed}>Roll</button>
        </div>
      </div>
      <div class="gen-row">
        <label>Size</label>
        <select class="gen-size-select" bind:value={generateSize}>
          <option value="small">Small (1800x1800)</option>
          <option value="medium">Medium (3600x2700)</option>
          <option value="large">Large (5400x5400)</option>
        </select>
      </div>
      <div class="gen-row">
        <label class="gen-checkbox-label">
          <input type="checkbox" bind:checked={blockStyleEnabled} onchange={handleBlockStyleChange} />
          Pixel Block Style
        </label>
      </div>
      {#if blockStyleEnabled}
        <div class="gen-row">
          <label>Floor Block</label>
          <select class="gen-size-select" bind:value={blockFloor} onchange={handleBlockStyleChange}>
            {#each pixelBlockEntries as entry}
              <option value={entry.id}>{entry.name}</option>
            {/each}
          </select>
        </div>
        <div class="gen-row">
          <label>Wall Block</label>
          <select class="gen-size-select" bind:value={blockWall} onchange={handleBlockStyleChange}>
            {#each pixelBlockEntries as entry}
              <option value={entry.id}>{entry.name}</option>
            {/each}
          </select>
        </div>
        <div class="gen-row">
          <label>Wall Height: {blockWallHeight}</label>
          <input type="range" min="1" max="4" step="1"
            bind:value={blockWallHeight}
            oninput={handleBlockStyleChange}
            class="gen-slider"
          />
        </div>
      {/if}
      <button class="gen-btn" onclick={handleGenerate}>Generate Dungeon</button>
    </div>
  {/if}

  <!-- Bottom bar -->
  <div class="bottom-bar">
    <div class="bottom-left">
      <input
        type="text"
        class="map-name-input"
        bind:value={builderStore.mapName}
        placeholder="Map name..."
      />
    </div>

    <div class="bottom-center">
      <label class="zone-label">Zone:</label>
      <select class="zone-select" value={builderStore.zone} onchange={handleZoneChange}>
        {#each zones as z}
          <option value={z.id}>{z.name}</option>
        {/each}
      </select>
    </div>

    <div class="bottom-right">
      <button class="action-btn play-btn" onclick={handlePlay}>Play</button>
      <button class="action-btn generate-btn" onclick={() => showGeneratePanel = !showGeneratePanel}>Generate</button>
      <button class="action-btn" onclick={handleSave}>Save</button>
      <button class="action-btn" onclick={handleLoad}>Load</button>
      <button class="action-btn danger-btn" onclick={handleClear}>Clear</button>
    </div>
  </div>
</div>

<style>
  .builder-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
    font-family: 'Cinzel', serif;
  }

  .builder-overlay > * {
    pointer-events: auto;
  }

  .top-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: linear-gradient(180deg, rgba(10,10,18,0.95) 0%, rgba(10,10,18,0.7) 100%);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .tool-group {
    display: flex;
    gap: 4px;
  }

  .tool-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: rgba(232,220,196,0.7);
    cursor: pointer;
    transition: all 0.15s;
    font-family: 'Cinzel', serif;
    font-size: 11px;
    min-width: 52px;
  }
  .tool-btn:hover {
    background: rgba(255,255,255,0.1);
    border-color: rgba(255,255,255,0.2);
  }
  .tool-btn.active {
    background: rgba(68,136,255,0.2);
    border-color: rgba(68,136,255,0.5);
    color: #4488ff;
  }
  .tool-hotkey {
    font-size: 9px;
    opacity: 0.5;
    margin-top: 2px;
  }

  .top-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toggle-btn {
    padding: 6px 12px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: rgba(232,220,196,0.7);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 11px;
  }
  .toggle-btn.active {
    background: rgba(68,170,255,0.15);
    border-color: rgba(68,170,255,0.3);
    color: #44aaff;
  }

  .map-info {
    font-size: 10px;
    color: rgba(232,220,196,0.5);
    white-space: nowrap;
  }

  .properties-panel {
    position: absolute;
    top: 56px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: rgba(10,10,18,0.9);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 10px;
    min-width: 180px;
  }
  .properties-panel:empty {
    display: none;
  }

  .prop-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .prop-group label {
    font-size: 10px;
    color: rgba(232,220,196,0.5);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .prop-group select {
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: rgba(232,220,196,0.8);
    padding: 4px 8px;
    font-family: 'Cinzel', serif;
    font-size: 11px;
  }

  .selected-info {
    font-size: 11px;
    color: rgba(232,220,196,0.7);
  }
  .delete-btn {
    padding: 4px 10px;
    background: rgba(255,68,68,0.15);
    border: 1px solid rgba(255,68,68,0.3);
    border-radius: 4px;
    color: #ff4444;
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 11px;
  }

  .bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: linear-gradient(0deg, rgba(10,10,18,0.95) 0%, rgba(10,10,18,0.7) 100%);
    border-top: 1px solid rgba(255,255,255,0.08);
  }

  .bottom-left, .bottom-center, .bottom-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .map-name-input {
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: rgba(232,220,196,0.8);
    padding: 6px 10px;
    font-family: 'Cinzel', serif;
    font-size: 12px;
    width: 160px;
  }

  .zone-label {
    font-size: 11px;
    color: rgba(232,220,196,0.5);
  }
  .zone-select {
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: rgba(232,220,196,0.8);
    padding: 6px 10px;
    font-family: 'Cinzel', serif;
    font-size: 11px;
  }

  .action-btn {
    padding: 6px 14px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: rgba(232,220,196,0.7);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 12px;
    transition: all 0.15s;
  }
  .action-btn:hover {
    background: rgba(255,255,255,0.1);
    border-color: rgba(255,255,255,0.2);
  }
  .play-btn {
    background: rgba(68,255,136,0.15);
    border-color: rgba(68,255,136,0.3);
    color: #44ff88;
  }
  .play-btn:hover {
    background: rgba(68,255,136,0.25);
  }
  .danger-btn {
    color: rgba(255,100,100,0.7);
  }
  .danger-btn:hover {
    background: rgba(255,68,68,0.15);
    border-color: rgba(255,68,68,0.3);
  }

  /* Minimap */
  .minimap-container {
    position: absolute;
    top: 56px;
    right: 12px;
    border: 1px solid rgba(255,107,53,0.3);
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,0,0,0.5);
    pointer-events: auto;
    cursor: pointer;
  }
  .minimap-container:hover {
    border-color: rgba(255,107,53,0.6);
  }
  .minimap-canvas {
    display: block;
  }

  .asset-category-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .cat-tab {
    padding: 3px 6px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 3px;
    color: rgba(232,220,196,0.5);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 9px;
    white-space: nowrap;
  }
  .cat-tab:hover { background: rgba(255,255,255,0.1); }
  .cat-tab.active {
    background: rgba(68,136,255,0.2);
    border-color: rgba(68,136,255,0.4);
    color: #4488ff;
  }
  .asset-search {
    width: 100%;
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: rgba(232,220,196,0.8);
    padding: 4px 8px;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    margin-top: 4px;
  }
  .asset-list {
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 4px;
  }
  .asset-item {
    padding: 4px 8px;
    background: rgba(255,255,255,0.03);
    border: 1px solid transparent;
    border-radius: 3px;
    color: rgba(232,220,196,0.6);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    text-align: left;
  }
  .asset-item:hover {
    background: rgba(255,255,255,0.08);
    border-color: rgba(255,255,255,0.1);
  }
  .asset-item.selected {
    background: rgba(68,136,255,0.15);
    border-color: rgba(68,136,255,0.3);
    color: #4488ff;
  }
  .prop-controls {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }
  .prop-controls label {
    font-size: 10px;
    color: rgba(232,220,196,0.5);
  }
  .prop-controls input[type="range"] {
    width: 100%;
    accent-color: #4488ff;
  }

  .anim-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 2px;
  }
  .anim-btn {
    padding: 3px 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: rgba(232,220,196,0.6);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    transition: all 0.15s;
  }
  .anim-btn:hover {
    background: rgba(255,255,255,0.1);
    border-color: rgba(255,255,255,0.2);
  }
  .anim-btn.active {
    background: rgba(68,255,136,0.2);
    border-color: rgba(68,255,136,0.5);
    color: #44ff88;
  }

  /* AI Prompt Panel */
  .ai-panel {
    position: absolute;
    bottom: 52px;
    right: 12px;
    width: 380px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    pointer-events: auto;
  }
  .ai-panel.open {
    border: 1px solid rgba(140,100,255,0.25);
  }

  .ai-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    background: rgba(10,10,18,0.92);
    border: 1px solid rgba(140,100,255,0.2);
    border-radius: 8px;
    color: rgba(200,180,255,0.8);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 11px;
    transition: all 0.15s;
  }
  .ai-panel.open .ai-toggle {
    border-radius: 8px 8px 0 0;
    border-bottom: 1px solid rgba(140,100,255,0.12);
  }
  .ai-toggle:hover {
    background: rgba(20,16,30,0.95);
    border-color: rgba(140,100,255,0.35);
  }
  .ai-toggle-icon {
    font-size: 8px;
    opacity: 0.6;
  }
  .ai-badge {
    margin-left: auto;
    background: rgba(140,100,255,0.3);
    color: rgba(200,180,255,0.9);
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 8px;
  }

  .ai-body {
    background: rgba(10,10,18,0.95);
    display: flex;
    flex-direction: column;
  }

  .ai-agent-bar {
    display: flex;
    gap: 2px;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    flex-wrap: wrap;
  }
  .ai-agent-btn {
    padding: 2px 7px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 3px;
    color: rgba(200,180,255,0.5);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 9px;
    transition: all 0.12s;
  }
  .ai-agent-btn:hover {
    background: rgba(140,100,255,0.1);
    border-color: rgba(140,100,255,0.2);
  }
  .ai-agent-btn.active {
    background: rgba(140,100,255,0.2);
    border-color: rgba(140,100,255,0.4);
    color: rgba(200,180,255,0.9);
  }

  .ai-messages {
    max-height: 220px;
    min-height: 60px;
    overflow-y: auto;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ai-messages::-webkit-scrollbar {
    width: 4px;
  }
  .ai-messages::-webkit-scrollbar-track {
    background: transparent;
  }
  .ai-messages::-webkit-scrollbar-thumb {
    background: rgba(140,100,255,0.2);
    border-radius: 2px;
  }

  .ai-empty {
    font-size: 10px;
    color: rgba(200,180,255,0.3);
    text-align: center;
    padding: 16px 8px;
    line-height: 1.5;
  }

  .ai-msg {
    background: rgba(140,100,255,0.06);
    border: 1px solid rgba(140,100,255,0.1);
    border-radius: 6px;
    padding: 6px 8px;
  }
  .ai-msg-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .ai-msg-agent {
    font-size: 9px;
    font-weight: 600;
    color: rgba(180,150,255,0.8);
    background: rgba(140,100,255,0.15);
    padding: 1px 5px;
    border-radius: 3px;
  }
  .ai-msg-time {
    font-size: 9px;
    color: rgba(200,180,255,0.3);
  }
  .ai-copy-btn {
    margin-left: auto;
    padding: 1px 6px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 3px;
    color: rgba(200,180,255,0.5);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 8px;
    transition: all 0.12s;
  }
  .ai-copy-btn:hover {
    background: rgba(140,100,255,0.15);
    color: rgba(200,180,255,0.8);
  }

  .ai-msg-text {
    font-size: 10px;
    color: rgba(232,220,196,0.7);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
    font-family: monospace;
  }

  .ai-input-row {
    padding: 6px 8px 8px;
    border-top: 1px solid rgba(255,255,255,0.05);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ai-input {
    width: 100%;
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(140,100,255,0.15);
    border-radius: 4px;
    color: rgba(232,220,196,0.85);
    padding: 6px 8px;
    font-family: monospace;
    font-size: 11px;
    resize: none;
    line-height: 1.4;
  }
  .ai-input::placeholder {
    color: rgba(200,180,255,0.25);
    font-family: 'Cinzel', serif;
  }
  .ai-input:focus {
    outline: none;
    border-color: rgba(140,100,255,0.35);
  }
  .ai-input-actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }
  .ai-send-btn {
    padding: 4px 14px;
    background: rgba(140,100,255,0.2);
    border: 1px solid rgba(140,100,255,0.35);
    border-radius: 4px;
    color: rgba(200,180,255,0.9);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    transition: all 0.12s;
  }
  .ai-send-btn:hover:not(:disabled) {
    background: rgba(140,100,255,0.3);
    border-color: rgba(140,100,255,0.5);
  }
  .ai-send-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .ai-clear-btn {
    padding: 4px 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px;
    color: rgba(200,180,255,0.4);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    transition: all 0.12s;
  }
  .ai-clear-btn:hover {
    background: rgba(255,68,68,0.1);
    border-color: rgba(255,68,68,0.2);
    color: rgba(255,100,100,0.7);
  }

  /* Generate Dungeon */
  .generate-btn {
    background: rgba(255,170,50,0.15);
    border-color: rgba(255,170,50,0.3);
    color: #ffaa33;
  }
  .generate-btn:hover {
    background: rgba(255,170,50,0.25);
  }

  .generate-panel {
    position: absolute;
    bottom: 52px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(10,10,18,0.95);
    border: 1px solid rgba(255,170,50,0.25);
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 240px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    pointer-events: auto;
  }
  .gen-header {
    font-size: 12px;
    color: rgba(255,170,50,0.9);
    font-weight: 600;
    text-align: center;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .gen-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .gen-row label {
    font-size: 10px;
    color: rgba(232,220,196,0.5);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .gen-seed-row {
    display: flex;
    gap: 4px;
  }
  .gen-seed-input {
    flex: 1;
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: rgba(232,220,196,0.8);
    padding: 4px 8px;
    font-family: monospace;
    font-size: 12px;
  }
  .gen-roll-btn {
    padding: 4px 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: rgba(232,220,196,0.7);
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 10px;
  }
  .gen-roll-btn:hover {
    background: rgba(255,255,255,0.1);
  }
  .gen-size-select {
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: rgba(232,220,196,0.8);
    padding: 4px 8px;
    font-family: 'Cinzel', serif;
    font-size: 11px;
  }
  .gen-btn {
    padding: 8px 16px;
    background: rgba(255,170,50,0.2);
    border: 1px solid rgba(255,170,50,0.4);
    border-radius: 6px;
    color: #ffaa33;
    cursor: pointer;
    font-family: 'Cinzel', serif;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.15s;
    margin-top: 4px;
  }
  .gen-btn:hover {
    background: rgba(255,170,50,0.3);
    border-color: rgba(255,170,50,0.6);
  }
  .gen-checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: rgba(232,220,196,0.8);
    cursor: pointer;
  }
  .gen-checkbox-label input[type="checkbox"] {
    accent-color: #ffaa33;
  }
  .gen-slider {
    width: 100%;
    accent-color: #ffaa33;
  }
</style>
