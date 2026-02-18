<script lang="ts">
  import { untrack } from 'svelte';
  import { realtimeStore } from '../stores/realtimeStore.svelte';
  import { STANCE_INFO } from '../phaser/assetMaps';
  import { CLASS_DEFS } from '../three/ClassDefs';
  import { ITEM_MAP } from '../data/items';
  import { ZONES } from '../data/zones';
  import type { Stance, PlayerClass, EquipSlot, InventoryItem } from '../stores/types';
  import HealthBar from './HealthBar.svelte';

  let { pointerLocked = false, selectedClass }: { pointerLocked?: boolean; selectedClass?: PlayerClass } = $props();

  const STANCE_KEYS: Stance[] = ['aggressive', 'balanced', 'defensive', 'evasive'];
  const STANCE_COLORS: Record<Stance, string> = {
    aggressive: 'var(--flame-red, #ff3333)',
    balanced: 'var(--safe-green, #4ade80)',
    defensive: 'var(--stamina-blue, #3b82f6)',
    evasive: 'var(--corruption-purple, #8b5cf6)',
  };

  const SLOT_KEYS: Record<string, string> = { q: 'Q', e: 'E', r: 'R', space: 'SP' };

  let status = $derived(realtimeStore.state.status);
  let player = $derived(realtimeStore.state.player);
  let enemies = $derived(realtimeStore.state.enemies);
  let rewards = $derived(realtimeStore.state.rewards);

  let playerLevel = $derived(realtimeStore.state.playerLevel || 1);
  let playerXp = $derived(realtimeStore.state.playerXp || 0);
  let playerXpToNext = $derived(realtimeStore.state.playerXpToNext || 110);
  let xpPercent = $derived(playerXpToNext > 0 ? Math.min(100, (playerXp / playerXpToNext) * 100) : 0);
  let groundLoot = $derived(realtimeStore.state.groundLoot || []);

  let classDef = $derived(selectedClass ? CLASS_DEFS[selectedClass] : null);
  let abilitySlots = $derived(classDef ? classDef.abilities.filter(a => a.slot !== 'primary') : []);

  let targetEnemyId = $derived(realtimeStore.state.targetEnemyId);
  let targetEnemy = $derived(
    targetEnemyId ? enemies.find(e => e.id === targetEnemyId) ?? null : null
  );

  function getCooldownFraction(abilityId: string): number {
    if (!player?.abilityCooldowns) return 0;
    return player.abilityCooldowns[abilityId] ?? 0;
  }

  function getAbilitySlotIndex(slot: string): number {
    if (slot === 'q') return 0;
    if (slot === 'e') return 1;
    if (slot === 'r') return 2;
    return 0;
  }

  // --- Screen damage/heal flash ---
  let screenFlash = $state<{ color: string } | null>(null);
  let prevHp = $state(0);

  $effect(() => {
    const hp = player?.hp ?? 0;
    const prev = untrack(() => prevHp);
    if (prev > 0 && hp < prev) {
      screenFlash = { color: 'rgba(255,0,0,0.3)' };
      setTimeout(() => { screenFlash = null; }, 300);
    } else if (prev > 0 && hp > prev) {
      screenFlash = { color: 'rgba(0,255,100,0.2)' };
      setTimeout(() => { screenFlash = null; }, 300);
    }
    prevHp = hp;
  });

  // --- Combat event log ---
  let combatLog = $state<Array<{ text: string; color: string; time: number }>>([]);

  export function addCombatLog(text: string, color: string) {
    combatLog = [...combatLog.slice(-9), { text, color, time: Date.now() }];
  }

  // --- Ability ready pulse ---
  let prevCooldowns = $state<Record<string, number>>({});
  let readyPulse = $state<Record<string, boolean>>({});

  $effect(() => {
    if (!player?.abilityCooldowns) return;
    const cds = player.abilityCooldowns;
    const prev = untrack(() => prevCooldowns);
    for (const [id, cd] of Object.entries(cds)) {
      const prevCd = prev[id] ?? 0;
      if (prevCd > 0.01 && cd <= 0.01) {
        readyPulse[id] = true;
        setTimeout(() => { readyPulse[id] = false; }, 500);
      }
    }
    prevCooldowns = { ...cds };
  });

  // Rarity color helper
  function rarityColor(rarity: string): string {
    const colors: Record<string, string> = {
      common: '#aaa',
      uncommon: '#2ecc71',
      rare: '#3498db',
      legendary: '#f39c12',
      cursed: '#9b59b6',
    };
    return colors[rarity] || '#aaa';
  }

  // --- Loot pickup feed ---
  let lootFeed = $state<Array<{ itemName: string; rarity: string; time: number; id: number }>>([]);
  let lootFeedId = $state(0);

  // --- Inventory & Equipment ---
  let inventory = $state<InventoryItem[]>([]);
  let nextInvId = $state(0);
  let bagOpen = $state(false);
  let equipped = $state<Record<EquipSlot, InventoryItem | null>>({
    weapon: null, armor: null, shield: null, accessory: null,
  });

  // Derive total stat bonuses from equipped items
  let equipBonuses = $derived({
    atk: Object.values(equipped).reduce((sum, it) => sum + (it?.atkBonus || 0), 0),
    def: Object.values(equipped).reduce((sum, it) => sum + (it?.defBonus || 0), 0),
    hp: Object.values(equipped).reduce((sum, it) => sum + (it?.hpBonus || 0), 0),
  });

  function equipItem(item: InventoryItem) {
    const slot = item.category as EquipSlot;
    if (!['weapon', 'armor', 'shield', 'accessory'].includes(slot)) return;
    // Unequip current item in that slot
    const prev = equipped[slot];
    if (prev) prev.equipped = false;
    // Equip new item
    item.equipped = true;
    equipped[slot] = item;
    equipped = { ...equipped }; // trigger reactivity
    realtimeStore.sendEquipBonuses(equipBonuses);
  }

  function unequipItem(item: InventoryItem) {
    const slot = item.category as EquipSlot;
    if (equipped[slot]?.id === item.id) {
      equipped[slot] = null;
      equipped = { ...equipped };
    }
    item.equipped = false;
    realtimeStore.sendEquipBonuses(equipBonuses);
  }

  // --- Dash cooldown ---
  let dashCooldown = $derived(player?.dashCooldown ?? 0);
  let dashOnCooldown = $derived(dashCooldown > 0.01);
  let stanceCooldown = $derived(player?.stanceCooldown ?? 0);
  let stanceOnCooldown = $derived(stanceCooldown > 0.01);

  // --- Ability tooltip ---
  let hoveredAbility = $state<string | null>(null);

  // --- XP popup on bar ---
  let xpPopup = $state<{ text: string; id: number } | null>(null);
  let xpPopupId = $state(0);

  // Poll UI events for loot pickups
  $effect(() => {
    if (status !== 'active') return;
    const interval = setInterval(() => {
      const uiEvents = realtimeStore.consumeUiEvents();
      for (const evt of uiEvents) {
        if (evt.type === 'loot_pickup' && evt.text) {
          const rarity = evt.rarity || 'common';
          lootFeedId++;
          lootFeed = [...lootFeed.slice(-4), { itemName: evt.text, rarity, time: Date.now(), id: lootFeedId }];
          // Build InventoryItem from ITEM_MAP
          const itemName = evt.text;
          const itemDef = [...ITEM_MAP.values()].find(d => d.name === itemName);
          nextInvId++;
          const invItem: InventoryItem = {
            id: nextInvId,
            itemCode: itemDef?.code || '',
            itemName,
            rarity,
            category: itemDef?.category || 'material',
            atkBonus: itemDef?.atkBonus || 0,
            defBonus: itemDef?.defBonus || 0,
            hpBonus: itemDef?.hpBonus || 0,
            equipped: false,
          };
          inventory = [...inventory, invItem];
        }
        if (evt.type === 'kill_reward' && evt.text) {
          const xpMatch = evt.text.match(/\+(\d+) XP/);
          if (xpMatch) {
            xpPopupId++;
            xpPopup = { text: `+${xpMatch[1]} XP`, id: xpPopupId };
            setTimeout(() => { xpPopup = null; }, 1200);
          }
        }
      }
    }, 100);
    return () => clearInterval(interval);
  });

  // Auto-expire loot feed entries after 3s
  $effect(() => {
    if (lootFeed.length === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      lootFeed = lootFeed.filter(e => now - e.time < 3000);
    }, 3100);
    return () => clearTimeout(timer);
  });

  // --- Minimap ---
  let minimapCanvas: HTMLCanvasElement | null = $state(null);
  const MINIMAP_SIZE = 160;

  // Derive minimap height reactively from actual arena dimensions
  let arena = $derived(realtimeStore.state.arena);
  let minimapHeight = $derived(arena ? Math.round(MINIMAP_SIZE * (arena.height / arena.width)) : Math.round(MINIMAP_SIZE * 0.75));

  $effect(() => {
    if (!minimapCanvas || status !== 'active') return;
    const interval = setInterval(() => drawMinimap(), 200);
    return () => clearInterval(interval);
  });

  // FoW cell check helper for minimap
  function isFowRevealed(arenaX: number, arenaY: number): boolean {
    const fowGrid = realtimeStore.state.fowGrid;
    const fowGridW = realtimeStore.state.fowGridW;
    if (!fowGrid || fowGridW <= 0) return false; // FoW not loaded yet — hide everything
    const CELL_SIZE = 10;
    const gx = Math.floor(arenaX / CELL_SIZE);
    const gy = Math.floor(arenaY / CELL_SIZE);
    const gridH = Math.ceil((arena?.height || 1800) / CELL_SIZE);
    if (gx < 0 || gx >= fowGridW || gy < 0 || gy >= gridH) return false;
    return fowGrid[gy * fowGridW + gx] > 0;
  }

  function drawMinimap() {
    const p = realtimeStore.state.player;
    if (!minimapCanvas || !p) return;
    const ctx = minimapCanvas.getContext('2d');
    if (!ctx) return;
    const arenaData = realtimeStore.state.arena;
    if (!arenaData) return;

    const mW = MINIMAP_SIZE;
    const mH = minimapHeight;
    const scaleX = mW / arenaData.width;
    const scaleY = mH / arenaData.height;

    ctx.clearRect(0, 0, mW, mH);

    // Background — solid dark
    ctx.fillStyle = '#0c0a10';
    ctx.fillRect(0, 0, mW, mH);

    // Draw revealed floor as slightly lighter so explored areas are visible
    const fowGrid = realtimeStore.state.fowGrid;
    const fowGridW = realtimeStore.state.fowGridW;
    if (fowGrid && fowGridW > 0) {
      const CELL_SIZE = 10;
      const gridH = Math.ceil(arenaData.height / CELL_SIZE);
      const cellW = CELL_SIZE * scaleX;
      const cellH = CELL_SIZE * scaleY;
      ctx.fillStyle = '#1a1720';
      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < fowGridW; gx++) {
          if (fowGrid[gy * fowGridW + gx] > 0) {
            ctx.fillRect(gx * cellW, gy * cellH, cellW + 0.5, cellH + 0.5);
          }
        }
      }
    }

    // Walls — bright outlines for visibility
    for (const wall of arenaData.walls) {
      const cx = wall.x + wall.w / 2;
      const cy = wall.y + wall.h / 2;
      if (!isFowRevealed(cx, cy)) continue;
      const wx = wall.x * scaleX;
      const wy = wall.y * scaleY;
      const ww = Math.max(2, wall.w * scaleX);
      const wh = Math.max(2, wall.h * scaleY);
      // Fill
      ctx.fillStyle = '#5a5060';
      ctx.fillRect(wx, wy, ww, wh);
      // Bright edge
      ctx.strokeStyle = '#8a7a90';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(wx, wy, ww, wh);
    }

    // Ground loot — bright colored diamonds (healing = green circles)
    const loot = realtimeStore.state.groundLoot || [];
    for (const item of loot) {
      if (!isFowRevealed(item.x, item.y)) continue;
      const lx = item.x * scaleX;
      const ly = item.y * scaleY;
      if ((item as any).isHealing) {
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = rarityColor(item.rarity);
        ctx.beginPath();
        ctx.moveTo(lx, ly - 2.5);
        ctx.lineTo(lx + 2, ly);
        ctx.lineTo(lx, ly + 2.5);
        ctx.lineTo(lx - 2, ly);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Enemies — larger red dots with glow
    const enemyList = realtimeStore.state.enemies;
    for (const e of enemyList) {
      if (!isFowRevealed(e.x, e.y)) continue;
      const ex = e.x * scaleX;
      const ey = e.y * scaleY;
      // Glow
      ctx.fillStyle = 'rgba(255,50,50,0.3)';
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      ctx.fill();
      // Dot
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Exit marker — pulsing green circle
    const exitPos = arenaData.exitPosition;
    if (exitPos && isFowRevealed(exitPos.x, exitPos.y)) {
      const ex = exitPos.x * scaleX;
      const ey = exitPos.y * scaleY;
      const pulse = 3 + Math.sin(Date.now() / 300) * 1.5;
      // Outer glow
      ctx.fillStyle = 'rgba(0,255,170,0.25)';
      ctx.beginPath();
      ctx.arc(ex, ey, pulse + 2, 0, Math.PI * 2);
      ctx.fill();
      // Core
      ctx.fillStyle = '#00ffaa';
      ctx.beginPath();
      ctx.arc(ex, ey, pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player — bright green with glow ring
    const px = p.x * scaleX;
    const py = p.y * scaleY;
    // Outer glow
    ctx.strokeStyle = 'rgba(74,222,128,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.stroke();
    // Inner dot
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255,107,53,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, mW - 1, mH - 1);
  }

  // --- Buff/debuff helper ---
  function getBuffIcon(effect: any): string {
    const name = effect.name ?? '';
    if (name.includes('Frenzy')) return 'F';
    if (name.includes('Fortress') || name.includes('reduction')) return 'D';
    if (name.includes('Flame') || name.includes('Reflect')) return 'R';
    if (name.includes('speed')) return 'S';
    if (name.includes('Taunt')) return 'T';
    if (name.includes('Stealth') || name.includes('Smoke')) return 'H';
    return 'B';
  }
</script>

<div class="realtime-overlay">
  {#if status === 'victory'}
    <div class="end-overlay victory-overlay">
      <div class="end-content">
        <h1 class="end-title victory-title">VICTORY</h1>
        {#if rewards}
          <div class="rewards">
            <div class="reward-item">
              <span class="reward-icon">+{rewards.xpGained} XP</span>
              {#if rewards.xpCapped}
                <span class="xp-capped">{rewards.xpCappedMessage}</span>
              {/if}
            </div>
            <div class="reward-item">
              <span class="reward-icon">+{rewards.goldGained} Gold</span>
            </div>
            {#if rewards.playerLevelEnd && rewards.playerLevelEnd > 1}
              <div class="level-up-text">Level {rewards.playerLevel || 1} &rarr; {rewards.playerLevelEnd}</div>
            {/if}
            {#if rewards.itemsDropped && rewards.itemsDropped.length > 0}
              {#each rewards.itemsDropped as item}
                <div class="reward-item loot-item" style="color: {typeof item === 'string' ? '#8b5cf6' : rarityColor(item.rarity)}">
                  {typeof item === 'string' ? item : item.itemName}
                </div>
              {/each}
            {/if}
            {#if rewards.gateUnlocked}
              <div class="gate-message">{rewards.gateMessage}</div>
            {/if}
            {#if rewards.nextZone}
              {@const nextZone = rewards.nextZone}
              {@const nextZoneConfig = ZONES[nextZone]}
              <button class="end-btn victory-btn zone-btn" onclick={() => {
                realtimeStore.disconnect();
                realtimeStore.connectDemo(nextZone, selectedClass || 'reaver');
              }}>Continue to {nextZoneConfig?.name || nextZone}</button>
            {/if}
          </div>
        {/if}
        <button class="end-btn victory-btn" onclick={() => realtimeStore.closeCombat()}>Return</button>
      </div>
    </div>

  {:else if status === 'defeat'}
    <div class="end-overlay defeat-overlay">
      <div class="end-content">
        <h1 class="end-title defeat-title">DEFEATED</h1>
        <p class="defeat-message">Your soul fades into the darkness...</p>
        <p class="permadeath-info">Permadeath is final. Your prestige lives on.</p>
        <button class="end-btn defeat-btn" onclick={() => realtimeStore.closeCombat()}>Return</button>
      </div>
    </div>

  {:else if status === 'active' && player}
    <!-- Top-left: class badge + HP/STA -->
    <div class="top-bar">
      <div class="top-left">
        {#if classDef}
          <div class="class-badge" style="--accent: {classDef.color}">
            <span class="class-badge-name">{classDef.name}</span>
            <span class="class-badge-role">{classDef.role}</span>
          </div>
        {/if}
        <div class="player-vitals-top">
          <HealthBar value={player.hp} max={player.maxHp} label="HP" size="sm" />
          <HealthBar value={Math.round(player.stamina)} max={player.maxStamina} color="blue" label="MANA" size="sm" />
        </div>
      </div>
    </div>

    <!-- Minimap -->
    <div class="minimap-container">
      <canvas
        bind:this={minimapCanvas}
        width={MINIMAP_SIZE}
        height={minimapHeight}
        class="minimap-canvas"
      ></canvas>
    </div>

    <!-- Centered target info -->
    {#if targetEnemy}
      <div class="target-info-center">
        <span class="target-name">{targetEnemy.name}</span>
        <div class="target-hp">
          <HealthBar value={targetEnemy.hp} max={targetEnemy.maxHp} color="red" size="sm" />
        </div>
      </div>
    {/if}

    <!-- Combat event log -->
    <div class="combat-log">
      {#each combatLog.slice(-4) as entry}
        <div class="log-entry" style="color: {entry.color}">{entry.text}</div>
      {/each}
    </div>

    <!-- Loot pickup feed -->
    {#if lootFeed.length > 0}
      <div class="loot-feed">
        {#each lootFeed as entry (entry.id)}
          <div class="loot-feed-entry" style="--rarity-color: {rarityColor(entry.rarity)}">
            <span class="loot-feed-icon">+</span>
            <span class="loot-feed-name">{entry.itemName}</span>
            <span class="loot-feed-rarity">({entry.rarity})</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Inventory bag button -->
    <button class="bag-btn" onclick={() => bagOpen = !bagOpen} title="Inventory (B)">
      <span class="bag-icon">🎒</span>
      {#if inventory.length > 0}
        <span class="bag-count">{inventory.length}</span>
      {/if}
    </button>

    <!-- Inventory panel -->
    {#if bagOpen}
      <div class="inventory-panel">
        <div class="inventory-header">
          <span>Inventory</span>
          {#if equipBonuses.atk > 0 || equipBonuses.def > 0 || equipBonuses.hp !== 0}
            <span class="equip-stats">
              {#if equipBonuses.atk > 0}<span class="stat-atk">+{equipBonuses.atk} ATK</span>{/if}
              {#if equipBonuses.def > 0}<span class="stat-def">+{equipBonuses.def} DEF</span>{/if}
              {#if equipBonuses.hp !== 0}<span class="stat-hp" class:stat-negative={equipBonuses.hp < 0}>{equipBonuses.hp > 0 ? '+' : ''}{equipBonuses.hp} HP</span>{/if}
            </span>
          {/if}
          <button class="inventory-close" onclick={() => bagOpen = false}>&times;</button>
        </div>
        <!-- Equipment slots summary -->
        <div class="equip-slots">
          {#each (['weapon', 'armor', 'shield', 'accessory'] as EquipSlot[]) as slot}
            <div class="equip-slot" class:filled={!!equipped[slot]}>
              <span class="equip-slot-label">{slot}</span>
              {#if equipped[slot]}
                <span class="equip-slot-name" style="color: {rarityColor(equipped[slot]!.rarity)}">{equipped[slot]!.itemName}</span>
              {:else}
                <span class="equip-slot-empty">---</span>
              {/if}
            </div>
          {/each}
        </div>
        <div class="inventory-list">
          {#if inventory.length === 0}
            <div class="inventory-empty">No items yet</div>
          {:else}
            {#each inventory as item (item.id)}
              {@const isEquippable = ['weapon', 'armor', 'shield', 'accessory'].includes(item.category)}
              <div class="inventory-item" class:equipped-item={item.equipped} style="--rarity-color: {rarityColor(item.rarity)}">
                <span class="inventory-item-name">{item.itemName}</span>
                {#if item.atkBonus || item.defBonus || item.hpBonus}
                  <span class="inventory-item-stats">
                    {#if item.atkBonus}<span class="stat-atk">+{item.atkBonus}A</span>{/if}
                    {#if item.defBonus}<span class="stat-def">+{item.defBonus}D</span>{/if}
                    {#if item.hpBonus}<span class="stat-hp">{item.hpBonus > 0 ? '+' : ''}{item.hpBonus}H</span>{/if}
                  </span>
                {/if}
                {#if isEquippable}
                  {#if item.equipped}
                    <button class="equip-btn unequip" onclick={() => unequipItem(item)}>X</button>
                  {:else}
                    <button class="equip-btn" onclick={() => equipItem(item)}>Equip</button>
                  {/if}
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    <!-- Bottom HUD -->
    <div class="bottom-hud">
      <!-- Level & XP bar -->
      <div class="xp-row">
        <span class="level-badge">Lv.{playerLevel}</span>
        <div class="xp-bar-outer">
          <div class="xp-bar-fill" style="width: {xpPercent}%"></div>
          {#if xpPopup}
            {#key xpPopup.id}
              <span class="xp-popup">{xpPopup.text}</span>
            {/key}
          {/if}
        </div>
        <span class="xp-text">{Math.floor(playerXp)}/{playerXpToNext}</span>
      </div>

      <!-- Buff/debuff indicators -->
      {#if (player.buffs && player.buffs.length > 0) || (player.debuffs && player.debuffs.length > 0)}
        <div class="buff-row">
          {#each player.buffs ?? [] as buff}
            <div class="buff-indicator buff" title={buff.name}>
              <span class="buff-icon">{getBuffIcon(buff)}</span>
              <span class="buff-timer">{buff.duration}</span>
            </div>
          {/each}
          {#each player.debuffs ?? [] as debuff}
            <div class="buff-indicator debuff" title={debuff.name}>
              <span class="buff-icon">{getBuffIcon(debuff)}</span>
              <span class="buff-timer">{debuff.duration}</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="hotbar-grid">
        <!-- Row 1: Stances -->
        {#each STANCE_KEYS as stance, i}
          {@const info = STANCE_INFO[stance]}
          {@const isActive = player.stance === stance}
          <button
            class="stance-btn"
            class:active={isActive}
            style="--stance-color: {STANCE_COLORS[stance]}"
            title="{info.label}: {info.description} ({info.atkMod}, {info.defMod})"
            onclick={() => realtimeStore.sendInput({ moveX: 0, moveY: 0, attacking: false, abilitySlot: null, stanceChange: stance })}
          >
            <span class="stance-key">{i + 1}</span>
            <span class="stance-icon">{info.icon}</span>
            {#if stanceOnCooldown}
              <div class="stance-cd-sweep" style="--cd-angle: {(1 - stanceCooldown) * 360}deg"></div>
            {/if}
          </button>
        {/each}

        <!-- Row 2: Abilities (Q, E, R, SPACE) aligned under stances -->
        {#each abilitySlots as ab}
          {@const cd = getCooldownFraction(ab.id)}
          {@const onCooldown = cd > 0.01}
          {@const slotIdx = getAbilitySlotIndex(ab.slot)}
          <button
            class="ability-btn"
            class:on-cooldown={onCooldown}
            class:ready-pulse={readyPulse[ab.id]}
            style="--ability-color: {classDef?.color || '#ff6b35'}"
            onclick={() => realtimeStore.sendInput({ moveX: 0, moveY: 0, attacking: false, abilitySlot: slotIdx, stanceChange: null })}
            onmouseenter={() => hoveredAbility = ab.id}
            onmouseleave={() => hoveredAbility = null}
          >
            <span class="ability-key">{SLOT_KEYS[ab.slot]}</span>
            <img
              class="ability-icon-img"
              src="/spell-icons/{ab.id}.png"
              alt={ab.name}
              onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget as HTMLImageElement).nextElementSibling?.classList.add('show'); }}
            />
            <span class="ability-icon-fallback">{ab.name[0]}</span>
            {#if onCooldown}
              <div class="cooldown-sweep" style="--cd-angle: {(1 - cd) * 360}deg"></div>
            {/if}
            {#if hoveredAbility === ab.id}
              <div class="ability-tooltip">
                <div class="tooltip-name">{ab.name}</div>
                {#if ab.staminaCost > 0}<div class="tooltip-cost">{ab.staminaCost} STA</div>{/if}
                <div class="tooltip-cd">{(ab.cooldownTicks / 20).toFixed(1)}s CD</div>
              </div>
            {/if}
          </button>
        {/each}

        <!-- Dash button (4th ability slot) -->
        <button
          class="ability-btn dash-btn"
          class:on-cooldown={dashOnCooldown}
          style="--ability-color: #66ccff"
          title="Dash (SPACE) — 15s CD"
        >
          <span class="ability-key">SP</span>
          <span class="ability-icon-fallback show">D</span>
          {#if dashOnCooldown}
            <div class="cooldown-sweep" style="--cd-angle: {(1 - dashCooldown) * 360}deg"></div>
          {/if}
        </button>
      </div>

      <div class="stance-label" style="color: {STANCE_COLORS[player.stance]}">
        {STANCE_INFO[player.stance].label} &mdash; {STANCE_INFO[player.stance].special}
      </div>
    </div>

  {:else if status === 'connecting'}
    <div class="connecting">
      <p class="connecting-text">Descending into darkness<span class="loading-dots"></span></p>
    </div>

  {:else if status === 'disconnected'}
    <div class="end-overlay">
      <div class="end-content">
        <h1 class="end-title" style="color: var(--muted)">DISCONNECTED</h1>
        <button class="end-btn defeat-btn" onclick={() => realtimeStore.closeCombat()}>Return</button>
      </div>
    </div>
  {/if}

  <!-- Screen damage/heal flash -->
  {#if screenFlash}
    <div class="screen-flash" style="background: {screenFlash.color}"></div>
  {/if}
</div>

<style>
  .realtime-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    z-index: 10;
  }

  /* Screen flash */
  .screen-flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
    animation: flashFade 0.3s ease-out forwards;
  }
  @keyframes flashFade {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  /* Top bar */
  .top-bar {
    padding: var(--space-sm, 8px) var(--space-lg, 16px);
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
  }
  .top-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .class-badge {
    display: flex;
    flex-direction: column;
    background: var(--panel-bg, rgba(18,18,26,0.92));
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    border-radius: var(--radius-md, 6px);
    padding: 3px 10px;
  }
  .class-badge-name {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 13px;
    color: var(--accent);
    line-height: 1.2;
  }
  .class-badge-role {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 9px;
    color: var(--muted, #888);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .player-vitals-top {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 180px;
  }

  /* Centered target info */
  .target-info-center {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    border: 1px solid var(--panel-border, rgba(255,107,53,0.25));
    border-radius: var(--radius-md, 6px);
    padding: var(--space-xs, 4px) var(--space-sm, 8px);
    max-width: 300px;
    pointer-events: auto;
  }
  .target-name {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 14px;
    color: var(--flame-red, #ff3333);
    white-space: nowrap;
    min-width: 80px;
  }
  .target-hp {
    flex: 1;
    min-width: 100px;
  }

  /* Combat log */
  .combat-log {
    position: absolute;
    bottom: 140px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    pointer-events: none;
  }
  .log-entry {
    font-family: 'Cinzel', serif;
    font-size: 12px;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    animation: logSlideUp 0.3s ease;
  }
  @keyframes logSlideUp {
    from { transform: translateY(10px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* Bottom HUD */
  .bottom-hud {
    margin-top: auto;
    padding: var(--space-sm, 8px) var(--space-lg, 16px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs, 4px);
    pointer-events: auto;
    background: linear-gradient(to top, rgba(10,10,15,0.8) 0%, transparent 100%);
  }
  /* (player vitals moved to top-left) */

  /* Buff/debuff row */
  .buff-row {
    display: flex;
    gap: 3px;
    justify-content: center;
  }
  .buff-indicator {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    position: relative;
  }
  .buff-indicator.buff {
    background: rgba(74,222,128,0.2);
    border: 1px solid rgba(74,222,128,0.5);
    color: #4ade80;
  }
  .buff-indicator.debuff {
    background: rgba(255,51,51,0.2);
    border: 1px solid rgba(255,51,51,0.5);
    color: #ff3333;
  }
  .buff-icon { font-size: 11px; font-weight: 700; }
  .buff-timer { font-size: 7px; opacity: 0.7; }

  /* Hotbar — 4-column grid: stances on top, abilities underneath */
  .hotbar-grid {
    display: grid;
    grid-template-columns: repeat(4, 40px);
    gap: var(--space-xs, 4px);
    justify-content: center;
  }
  .stance-btn {
    position: relative;
    width: 40px;
    height: 40px;
    border: 2px solid rgba(255,255,255,0.15);
    border-radius: var(--radius-md, 6px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast, 0.15s ease);
    padding: 0;
  }
  .stance-btn.active {
    border-color: var(--stance-color);
    box-shadow: 0 0 8px color-mix(in srgb, var(--stance-color) 40%, transparent);
    background: color-mix(in srgb, var(--stance-color) 15%, var(--panel-bg, rgba(18,18,26,0.92)));
  }
  .stance-key {
    position: absolute;
    top: 1px;
    left: 3px;
    font-size: 9px;
    color: var(--muted, #888);
    font-family: var(--font-ui, 'Cinzel', serif);
  }
  .stance-icon {
    font-size: 18px;
  }
  /* Stance cooldown radial sweep — clock-like animation */
  .stance-cd-sweep {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: conic-gradient(
      from 0deg,
      transparent 0deg,
      transparent var(--cd-angle),
      rgba(0,0,0,0.65) var(--cd-angle),
      rgba(0,0,0,0.65) 360deg
    );
    z-index: 2;
    pointer-events: none;
  }
  /* Ability cooldown radial sweep */
  .cooldown-sweep {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: conic-gradient(
      from 0deg,
      transparent 0deg,
      transparent var(--cd-angle),
      rgba(0,0,0,0.65) var(--cd-angle),
      rgba(0,0,0,0.65) 360deg
    );
    z-index: 1;
    pointer-events: none;
  }
  .ability-btn {
    position: relative;
    width: 40px;
    height: 40px;
    border: 2px solid color-mix(in srgb, var(--ability-color) 40%, transparent);
    border-radius: var(--radius-md, 6px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast, 0.15s ease);
    padding: 0;
    overflow: hidden;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.4);
  }
  .ability-btn:hover {
    border-color: var(--ability-color);
    box-shadow: 0 0 8px color-mix(in srgb, var(--ability-color) 30%, transparent), inset 0 1px 3px rgba(0,0,0,0.4);
  }
  .ability-btn.on-cooldown {
    opacity: 0.6;
  }
  .ability-btn.ready-pulse {
    animation: abilityReady 0.5s ease;
  }
  @keyframes abilityReady {
    0% { box-shadow: 0 0 0px var(--ability-color); }
    50% { box-shadow: 0 0 20px var(--ability-color); }
    100% { box-shadow: 0 0 0px var(--ability-color); }
  }
  .ability-key {
    position: absolute;
    top: 1px;
    left: 3px;
    font-size: 9px;
    font-weight: 600;
    color: var(--muted, #888);
    font-family: var(--font-ui, 'Cinzel', serif);
    z-index: 3;
  }
  .ability-icon-img {
    width: 28px;
    height: 28px;
    object-fit: cover;
    border-radius: 2px;
    z-index: 2;
    pointer-events: none;
  }
  .ability-icon-fallback {
    display: none;
    font-size: 18px;
    font-weight: 700;
    color: var(--ability-color);
    font-family: var(--font-title, 'MedievalSharp', cursive);
    z-index: 2;
  }
  .ability-icon-fallback.show {
    display: block;
  }
  /* Ability tooltip */
  .ability-tooltip {
    position: absolute;
    bottom: 46px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(12,12,20,0.95);
    border: 1px solid var(--ability-color);
    border-radius: 4px;
    padding: 4px 8px;
    white-space: nowrap;
    z-index: 20;
    pointer-events: none;
    animation: fadeIn 0.15s ease;
  }
  .tooltip-name {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 11px;
    color: var(--bone-white, #e8dcc4);
    font-weight: 600;
  }
  .tooltip-cost {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 9px;
    color: var(--stamina-blue, #3b82f6);
  }
  .tooltip-cd {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 9px;
    color: var(--muted, #888);
  }
  /* cooldown-fill removed — using cooldown-sweep radial instead */

  /* XP bar */
  .xp-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    max-width: 400px;
  }
  .level-badge {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 14px;
    color: var(--gold, #ffd700);
    min-width: 32px;
    text-align: center;
  }
  .xp-bar-outer {
    flex: 1;
    height: 6px;
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
    overflow: visible;
    position: relative;
  }
  .xp-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #ffd700, #ffaa00);
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .xp-popup {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 16px;
    font-weight: 700;
    color: #ffd700;
    text-shadow: 0 0 8px rgba(255,215,0,0.8), 0 1px 3px rgba(0,0,0,0.9);
    pointer-events: none;
    white-space: nowrap;
    animation: xpPopFloat 1.2s ease-out forwards;
    z-index: 5;
  }
  @keyframes xpPopFloat {
    0% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
    30% { opacity: 1; transform: translate(-50%, -80%) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -120%) scale(0.9); }
  }
  .xp-text {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 10px;
    color: var(--muted, #888);
    min-width: 60px;
    text-align: right;
  }
  .level-up-text {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 18px;
    color: var(--gold, #ffd700);
    text-shadow: 0 0 15px rgba(255,215,0,0.5);
  }

  /* Stance label */
  .stance-label {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.8;
    text-align: center;
  }

  /* End screens */
  .end-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    pointer-events: auto;
    animation: fadeIn var(--transition-slow, 0.5s ease);
  }
  .defeat-overlay {
    background: rgba(10,0,0,0.9);
  }
  .end-content {
    text-align: center;
    max-width: 360px;
    padding: var(--space-xl, 24px);
  }
  .end-title {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 48px;
    margin-bottom: var(--space-lg, 16px);
  }
  .victory-title {
    color: var(--gold, #ffd700);
    text-shadow: 0 0 30px rgba(255,215,0,0.6);
    animation: scaleIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .defeat-title {
    color: var(--flame-red, #ff3333);
    text-shadow: 0 0 30px rgba(255,51,51,0.6);
    animation: shake 0.6s ease;
  }
  .rewards {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
    margin-bottom: var(--space-xl, 24px);
    font-family: var(--font-ui, 'Cinzel', serif);
    color: var(--bone-white, #e8dcc4);
    font-size: 15px;
  }
  .reward-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    justify-content: center;
  }
  .xp-capped {
    font-size: 12px;
    color: var(--warning-amber, #f59e0b);
    font-style: italic;
  }
  .loot-item {
    color: var(--corruption-purple, #8b5cf6);
    font-size: 14px;
  }
  .gate-message {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 15px;
    color: var(--gold, #ffd700);
    padding: var(--space-sm, 8px);
    border: 1px solid var(--gold, #ffd700);
    border-radius: var(--radius-md, 6px);
    background: rgba(255,215,0,0.1);
  }
  .defeat-message {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    color: var(--muted, #888);
    font-size: 16px;
    margin-bottom: var(--space-sm, 8px);
  }
  .permadeath-info {
    font-size: 13px;
    color: var(--muted-dim, #666);
    font-family: var(--font-ui, 'Cinzel', serif);
    margin-bottom: var(--space-xl, 24px);
  }
  .end-btn {
    padding: var(--space-md, 12px) 40px;
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 18px;
    font-weight: 600;
    color: white;
    border-radius: var(--radius-lg, 8px);
    cursor: pointer;
    transition: all var(--transition-normal, 0.25s ease);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .victory-btn {
    background: rgba(255,107,53,0.3);
    border: 2px solid var(--ember-orange, #ff6b35);
  }
  .victory-btn:hover {
    background: rgba(255,107,53,0.5);
    box-shadow: var(--glow-ember), 0 0 25px rgba(255,107,53,0.4);
  }
  .zone-btn {
    background: rgba(0,255,170,0.2);
    border-color: #00ffaa;
    margin-bottom: 8px;
  }
  .zone-btn:hover {
    background: rgba(0,255,170,0.4);
    box-shadow: 0 0 20px rgba(0,255,170,0.5);
  }
  .defeat-btn {
    background: rgba(255,51,51,0.2);
    border: 2px solid var(--flame-red, #ff3333);
  }
  .defeat-btn:hover {
    background: rgba(255,51,51,0.4);
    box-shadow: var(--glow-red), 0 0 25px rgba(255,51,51,0.4);
  }

  /* Connecting state */
  .connecting {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    pointer-events: auto;
  }
  .connecting-text {
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 28px;
    color: var(--ember-orange, #ff6b35);
    text-shadow: 0 0 20px rgba(255,107,53,0.6);
    animation: loadingPulse 2s ease-in-out infinite;
  }
  .loading-dots::after {
    content: '';
    animation: dots 1.5s steps(3, end) infinite;
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scaleIn { from { transform: scale(0.3); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-10px); }
    40% { transform: translateX(10px); }
    60% { transform: translateX(-6px); }
    80% { transform: translateX(6px); }
  }
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

  /* Minimap */
  .minimap-container {
    position: absolute;
    top: 12px;
    right: 12px;
    border: 1px solid rgba(255,107,53,0.3);
    border-radius: var(--radius-md, 6px);
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,0,0,0.5);
    pointer-events: none;
  }
  .minimap-canvas {
    display: block;
  }

  /* Loot feed */
  .loot-feed {
    position: absolute;
    right: 16px;
    top: 140px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: none;
    max-width: 240px;
  }
  .loot-feed-entry {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(18,18,26,0.88);
    border: 1px solid var(--rarity-color);
    border-radius: 4px;
    padding: 4px 10px;
    animation: lootSlideIn 0.3s ease;
    box-shadow: 0 0 8px color-mix(in srgb, var(--rarity-color) 30%, transparent);
  }
  .loot-feed-icon {
    color: var(--rarity-color);
    font-weight: 700;
    font-size: 14px;
  }
  .loot-feed-name {
    color: var(--rarity-color);
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .loot-feed-rarity {
    color: var(--muted, #888);
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 10px;
    text-transform: capitalize;
  }
  @keyframes lootSlideIn {
    from { transform: translateX(40px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  /* Inventory bag button */
  .bag-btn {
    position: absolute;
    bottom: 16px;
    right: 16px;
    width: 44px;
    height: 44px;
    border: 2px solid rgba(255,255,255,0.2);
    border-radius: var(--radius-md, 6px);
    background: var(--panel-bg, rgba(18,18,26,0.92));
    cursor: pointer;
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }
  .bag-btn:hover {
    border-color: var(--ember-orange, #ff6b35);
    box-shadow: 0 0 10px rgba(255,107,53,0.3);
  }
  .bag-icon {
    font-size: 22px;
  }
  .bag-count {
    position: absolute;
    top: -6px;
    right: -6px;
    background: var(--ember-orange, #ff6b35);
    color: white;
    font-size: 10px;
    font-weight: 700;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-ui, 'Cinzel', serif);
  }

  /* Inventory panel */
  .inventory-panel {
    position: absolute;
    bottom: 68px;
    right: 16px;
    width: 260px;
    max-height: 320px;
    background: var(--panel-bg, rgba(18,18,26,0.95));
    border: 1px solid var(--panel-border, rgba(255,107,53,0.25));
    border-radius: var(--radius-md, 6px);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    animation: fadeIn 0.2s ease;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }
  .inventory-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    font-family: var(--font-title, 'MedievalSharp', cursive);
    font-size: 14px;
    color: var(--bone-white, #e8dcc4);
  }
  .inventory-close {
    background: none;
    border: none;
    color: var(--muted, #888);
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .inventory-close:hover { color: #fff; }
  .inventory-list {
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .inventory-empty {
    text-align: center;
    color: var(--muted, #888);
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 12px;
    padding: 16px;
  }
  .inventory-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    border-radius: 3px;
    border-left: 3px solid var(--rarity-color);
    background: rgba(255,255,255,0.03);
  }
  .inventory-item-name {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 11px;
    color: var(--rarity-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }
  .inventory-item.equipped-item {
    background: rgba(255,215,0,0.08);
    border-left: 3px solid var(--gold, #ffd700);
  }
  .inventory-item-stats {
    display: flex;
    gap: 3px;
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 8px;
    flex-shrink: 0;
  }
  .stat-atk { color: #ff6b35; }
  .stat-def { color: #3b82f6; }
  .stat-hp { color: #4ade80; }
  .stat-hp.stat-negative { color: #ff3333; }
  .equip-btn {
    background: rgba(255,107,53,0.2);
    border: 1px solid rgba(255,107,53,0.4);
    color: var(--bone-white, #e8dcc4);
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    margin-left: 4px;
  }
  .equip-btn:hover { background: rgba(255,107,53,0.4); }
  .equip-btn.unequip {
    background: rgba(255,51,51,0.2);
    border-color: rgba(255,51,51,0.4);
    color: #ff6666;
  }
  .equip-btn.unequip:hover { background: rgba(255,51,51,0.4); }

  /* Equipment slots summary */
  .equip-slots {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 4px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .equip-slot {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 2px 4px;
    border-radius: 2px;
    background: rgba(255,255,255,0.02);
  }
  .equip-slot.filled { background: rgba(255,215,0,0.05); }
  .equip-slot-label {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 8px;
    color: var(--muted, #888);
    text-transform: uppercase;
    min-width: 28px;
  }
  .equip-slot-name {
    font-family: var(--font-ui, 'Cinzel', serif);
    font-size: 9px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .equip-slot-empty {
    font-size: 9px;
    color: var(--muted-dim, #555);
  }
  .equip-stats {
    display: flex;
    gap: 4px;
    font-size: 9px;
    font-family: var(--font-ui, 'Cinzel', serif);
  }

  @media (max-width: 768px) {
    .top-bar {
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
    }
    .bottom-hud {
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
    }
    .stance-btn, .ability-btn {
      width: 34px;
      height: 34px;
    }
    .hotbar-grid {
      grid-template-columns: repeat(4, 34px);
    }
    .stance-icon {
      font-size: 16px;
    }
    .end-title {
      font-size: 36px;
    }
  }
</style>
