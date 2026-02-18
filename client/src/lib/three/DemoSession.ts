import type { ArenaData, RealtimePlayerState, RealtimeEnemyState, RealtimeResourceState, RealtimeEvent, RealtimeProjectile } from '../stores/realtimeStore.svelte';
import type { Stance, PlayerClass, ClassAbilityDef, ElementType, GroundLootItem, Rewards } from '../stores/types';
import { CLASS_DEFS } from './ClassDefs';
import { ZONES, type Mob } from '../data/zones';
import { rollLoot, type LootDrop } from '../data/loot';
import { ITEM_MAP } from '../data/items';
import { xpRequiredForLevel, getLevelForXp, calculateXpPenalty } from '../data/progression';
import { generateProceduralDungeon, type DungeonLayout, type Room } from './DungeonGenerator';
import type { BlockStyle } from './PixelBlockRenderer';

// Arena is 3600x2700 (1.5x each dimension)
const ARENA_W = 3600;
const ARENA_H = 2700;
const PLAYER_SPEED = 2.2;
const ENEMY_SPEED = 1.5;
const CHASE_SPEED = 2.5;
const AGGRO_RANGE = 120;
const ENEMY_ATTACK_RANGE = 45;
const ENEMY_ATTACK_COOLDOWN = 12;
const ENEMY_ATTACK_DMG = 8;
const WALL_MARGIN = 14;
const DASH_COOLDOWN = 300;  // 15s at 20 ticks/s
const DASH_DURATION = 6;    // 300ms
const DASH_SPEED_MULT = 4;
const LEASH_DISTANCE = 250;
const STANCE_COOLDOWN = 40;  // 2s at 20 ticks/s

interface DemoEnemy {
  state: RealtimeEnemyState;
  patrolOriginX: number;
  patrolOriginY: number;
  patrolAngle: number;
  patrolRadius: number;
  attackCooldown: number;
  taunted: boolean;
  tauntTimer: number;
  dots: DotEffect[];
  mob?: Mob;
}

interface DemoInput {
  moveX: number;
  moveY: number;
  attacking: boolean;
  abilitySlot: number | null;
  stanceChange: Stance | null;
  gather?: boolean;
  targetId?: string;
  dash?: boolean;
}

interface Projectile {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  targetId: string | null;
  speed: number;
  damage: number;
  element: ElementType;
  visual: string;
  aoeRadius: number;
  piercing: boolean;
  healPercent: number;
  hitIds: Set<string>;
  size: number;
}

interface BuffEffect {
  id: string;
  effect: string;
  value: number;
  remaining: number;
}

interface DotEffect {
  sourceId: string;
  damage: number;
  remaining: number;
  tickInterval: number;
  tickCounter: number;
  element: ElementType;
}

export interface DemoCallbacks {
  onStateUpdate: (data: {
    player: RealtimePlayerState;
    enemies: RealtimeEnemyState[];
    resources: RealtimeResourceState[];
    projectiles: RealtimeProjectile[];
    groundLoot: GroundLootItem[];
    arena: ArenaData;
    zone: string;
    tick: number;
    playerLevel: number;
    playerXp: number;
    playerXpToNext: number;
    wallGrid?: Uint8Array | null;
    gridW?: number;
    gridH?: number;
    blockStyle?: BlockStyle | null;
  }) => void;
  onEvent: (event: RealtimeEvent) => void;
  onEnd: (result: 'victory' | 'defeat', rewards?: Rewards) => void;
}

// generateDungeonArena removed — now using generateProceduralDungeon from DungeonGenerator.ts

function rectContains(wall: { x: number; y: number; w: number; h: number }, px: number, py: number, margin: number): boolean {
  return px > wall.x - margin && px < wall.x + wall.w + margin &&
         py > wall.y - margin && py < wall.y + wall.h + margin;
}

function collidesWithWalls(walls: ArenaData['walls'], x: number, y: number, margin: number, arenaW = ARENA_W, arenaH = ARENA_H): boolean {
  for (const wall of walls) {
    if (rectContains(wall, x, y, margin)) return true;
  }
  if (x < margin || x > arenaW - margin || y < margin || y > arenaH - margin) return true;
  return false;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/** Check if a line segment from (x1,y1) to (x2,y2) intersects an AABB */
function lineIntersectsRect(x1: number, y1: number, x2: number, y2: number, rx: number, ry: number, rw: number, rh: number): boolean {
  // Liang-Barsky algorithm for line-segment vs AABB
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
  let tmin = 0, tmax = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > tmin) tmin = t; }
      else { if (t < tmax) tmax = t; }
      if (tmin > tmax) return false;
    }
  }
  return true;
}

/** Returns true if there's a clear line of sight (no wall blocks the path) */
function hasLineOfSight(walls: ArenaData['walls'], x1: number, y1: number, x2: number, y2: number): boolean {
  for (const wall of walls) {
    if (lineIntersectsRect(x1, y1, x2, y2, wall.x, wall.y, wall.w, wall.h)) return false;
  }
  return true;
}

let nextProjectileId = 0;

export class DemoSession {
  private arena: ArenaData;
  private player: RealtimePlayerState;
  private enemies: DemoEnemy[];
  private resources: RealtimeResourceState[];
  private projectiles: Projectile[] = [];
  private callbacks: DemoCallbacks;
  private lastInput: DemoInput = { moveX: 0, moveY: 0, attacking: true, abilitySlot: null, stanceChange: null };
  private tick = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private zone: string;
  private playerAttackCooldown = 0;
  private playerClass: PlayerClass;
  private abilityCooldowns: Record<string, number> = {};
  private playerBuffs: BuffEffect[] = [];
  private stealthTimer = 0;
  private totalXp = 0;
  private totalGold = 0;
  private playerLevel = 1;
  private playerXp = 0;
  private lootDrops: LootDrop[] = [];
  private groundLoot: GroundLootItem[] = [];
  private nextLootId = 0;
  private zoneDangerLevel = 2;
  private dashCooldownTicks = 0;
  private dashActiveTicks = 0;
  private dashDirX = 0;
  private dashDirY = 0;
  private stanceCooldownTicks = 0;
  private equipBonuses = { atk: 0, def: 0, hp: 0 };
  private dungeonLayout: DungeonLayout | null = null;
  private exitPosition: { x: number; y: number } | null = null;
  private exitRadius = 40;
  private wallGrid: Uint8Array | null = null;
  private gridW = 0;
  private gridH = 0;
  private blockStyle: BlockStyle | null = null;

  constructor(callbacks: DemoCallbacks, zone = 'tomb_halls', playerClass?: PlayerClass, customArena?: {
    arena: ArenaData;
    spawnPosition: { x: number; y: number };
    enemies?: Array<{ name: string; archetype: string; element: string; x: number; y: number }>;
    resources?: Array<{ resourceId: string; name: string; rarity: string; x: number; y: number }>;
  }) {
    this.callbacks = callbacks;
    this.zone = zone;
    this.playerClass = playerClass || 'reaver';

    const classDef = CLASS_DEFS[this.playerClass];

    // Init cooldowns map
    for (const ab of classDef.abilities) {
      this.abilityCooldowns[ab.id] = 0;
    }

    if (customArena) {
      // Use custom arena from builder
      this.arena = customArena.arena;
      this.exitPosition = customArena.arena.exitPosition || null;
      this.dungeonLayout = null;

      const spawnX = customArena.spawnPosition.x;
      const spawnY = customArena.spawnPosition.y;

      this.player = {
        x: spawnX, y: spawnY,
        hp: classDef.hp, maxHp: classDef.hp,
        stamina: classDef.stamina, maxStamina: classDef.stamina,
        stance: 'balanced',
        facing: 'down',
        buffs: [], debuffs: [],
        attackCooldown: 0,
        playerClass: this.playerClass,
        abilityCooldowns: { ...this.abilityCooldowns },
      };

      const zoneConfig = ZONES[zone] || ZONES['tomb_halls'];
      this.zoneDangerLevel = zoneConfig.dangerLevel;

      this.enemies = [];
      if (customArena.enemies) {
        for (let i = 0; i < customArena.enemies.length; i++) {
          const ce = customArena.enemies[i];
          const hp = ce.archetype === 'boss' ? 80 : ce.archetype === 'guardian' ? 50 : 35;
          const mob = zoneConfig.mobs[Math.floor(Math.random() * zoneConfig.mobs.length)];
          this.enemies.push(this.makeEnemy(
            `e${i}`, ce.name, ce.x, ce.y,
            ce.archetype, ce.element, hp, 20 + Math.random() * 30, mob
          ));
        }
      }

      this.resources = [];
      if (customArena.resources) {
        for (let i = 0; i < customArena.resources.length; i++) {
          const cr = customArena.resources[i];
          this.resources.push(this.makeResource(
            `r${i}`, cr.resourceId, cr.name, cr.x, cr.y, cr.rarity
          ));
        }
      }
    } else {
      // Generate procedural BSP dungeon
      const layout = generateProceduralDungeon(ARENA_W, ARENA_H);
      this.dungeonLayout = layout;
      this.arena = layout.arena;
      this.exitPosition = layout.exitPosition;

      // Invert grid: BSP uses 0=wall, 1=floor; PixelBlockRenderer needs 1=wall, 0=floor
      this.wallGrid = new Uint8Array(layout.grid.length);
      for (let i = 0; i < layout.grid.length; i++) {
        this.wallGrid[i] = layout.grid[i] === 0 ? 1 : 0;
      }
      this.gridW = layout.gridW;
      this.gridH = layout.gridH;
      this.blockStyle = {
        floorBlock: 'pixel_blocks/Stone',
        wallBlock: 'pixel_blocks/Bricks_Dark',
        wallHeight: 3,
        enabled: true,
      };

      // Player spawns at one of the 4 corners of the map
      const corners = [
        { x: 120, y: 120 },
        { x: ARENA_W - 120, y: 120 },
        { x: 120, y: ARENA_H - 120 },
        { x: ARENA_W - 120, y: ARENA_H - 120 },
      ];
      // Pick a random corner, find nearest room to it for valid spawn
      const corner = corners[Math.floor(Math.random() * corners.length)];
      let spawnX = corner.x;
      let spawnY = corner.y;
      // Find nearest room to this corner for a guaranteed walkable position
      let nearestRoom = layout.rooms[0];
      let nearestDist = Infinity;
      for (const room of layout.rooms) {
        const d = dist(corner.x, corner.y, room.centerX, room.centerY);
        if (d < nearestDist) {
          nearestDist = d;
          nearestRoom = room;
        }
      }
      // Spawn at the edge of that room closest to the corner
      spawnX = Math.max(nearestRoom.x + 30, Math.min(nearestRoom.x + nearestRoom.w - 30, corner.x));
      spawnY = Math.max(nearestRoom.y + 30, Math.min(nearestRoom.y + nearestRoom.h - 30, corner.y));

      this.player = {
        x: spawnX, y: spawnY,
        hp: classDef.hp, maxHp: classDef.hp,
        stamina: classDef.stamina, maxStamina: classDef.stamina,
        stance: 'balanced',
        facing: 'down',
        buffs: [], debuffs: [],
        attackCooldown: 0,
        playerClass: this.playerClass,
        abilityCooldowns: { ...this.abilityCooldowns },
      };

      const zoneConfig = ZONES[zone] || ZONES['tomb_halls'];
      this.zoneDangerLevel = zoneConfig.dangerLevel;

      // Get spawnable rooms (not start room)
      const spawnRooms = layout.rooms.filter(r => !r.isStart);

      // Spawn 28-38 enemies distributed across rooms (scaled for bigger map)
      const numEnemies = 28 + Math.floor(Math.random() * 11);
      this.enemies = [];
      for (let i = 0; i < numEnemies; i++) {
        const mob = zoneConfig.mobs[Math.floor(Math.random() * zoneConfig.mobs.length)];
        const realtimeHp = Math.round(Math.sqrt(mob.hp) * 8);

        // Pick a room — weight exit room higher for guards
        let room: Room;
        if (i < 4 && layout.exitRoom) {
          room = layout.exitRoom; // First few enemies guard the exit
        } else {
          room = spawnRooms[Math.floor(Math.random() * spawnRooms.length)] || layout.rooms[0];
        }

        // Spawn within the room bounds
        let ex: number, ey: number;
        let attempts = 0;
        do {
          ex = room.x + 30 + Math.random() * (room.w - 60);
          ey = room.y + 30 + Math.random() * (room.h - 60);
          attempts++;
        } while (
          collidesWithWalls(this.arena.walls, ex, ey, 30, this.arena.width, this.arena.height) &&
          attempts < 20
        );

        const patrolRadius = 20 + Math.random() * 40;
        this.enemies.push(this.makeEnemy(
          `e${i}`, mob.name, ex, ey,
          mob.archetype || 'brute',
          mob.element || 'none',
          realtimeHp, patrolRadius,
          mob
        ));
      }

      // No resources yet — just enemies
      this.resources = [];
    }
  }

  private makeEnemy(id: string, name: string, x: number, y: number, archetype: string, element: string, maxHp: number, patrolRadius: number, mob?: Mob): DemoEnemy {
    return {
      state: {
        id, name, x, y,
        hp: maxHp, maxHp,
        archetype: archetype as any,
        element: element as any,
        stance: 'balanced',
        aiState: 'patrol',
        facing: 'down',
      },
      patrolOriginX: x,
      patrolOriginY: y,
      patrolAngle: Math.random() * Math.PI * 2,
      patrolRadius,
      attackCooldown: 0,
      taunted: false,
      tauntTimer: 0,
      dots: [],
      mob,
    };
  }

  private makeResource(id: string, resourceId: string, name: string, x: number, y: number, rarity: string): RealtimeResourceState {
    return {
      id, resourceId, name, x, y, rarity,
      gatherTime: rarity === 'legendary' ? 4 : rarity === 'rare' ? 3 : 2,
      isGathered: false,
      gatheringBy: null,
      gatherProgress: 0,
    };
  }

  start() {
    this.broadcastState();
    this.interval = setInterval(() => this.update(), 50);
  }

  receiveInput(input: DemoInput) {
    this.lastInput = { ...input };
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  setEquipBonuses(bonuses: { atk: number; def: number; hp: number }) {
    const oldHpBonus = this.equipBonuses.hp;
    this.equipBonuses = { ...bonuses };
    // Adjust maxHp and clamp current hp
    const baseHp = this.player.maxHp - oldHpBonus;
    this.player.maxHp = baseHp + bonuses.hp;
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
  }

  private get classDef() {
    return CLASS_DEFS[this.playerClass];
  }

  private get primaryAbility(): ClassAbilityDef {
    return this.classDef.abilities.find(a => a.slot === 'primary')!;
  }

  private getAbilityBySlot(slot: number): ClassAbilityDef | null {
    const slotMap: Record<number, string> = { 0: 'q', 1: 'e', 2: 'r' };
    const slotName = slotMap[slot];
    return this.classDef.abilities.find(a => a.slot === slotName) || null;
  }

  private getAttackSpeedMultiplier(): number {
    const frenzy = this.playerBuffs.find(b => b.effect === 'attack_speed');
    return frenzy ? (1 - frenzy.value) : 1; // 0.4 value = 60% of normal cooldown
  }

  private getDamageReductionMultiplier(): number {
    const fort = this.playerBuffs.find(b => b.effect === 'damage_reduction');
    return fort ? (1 - fort.value) : 1;
  }

  private update() {
    this.tick++;
    const input = this.lastInput;

    // Stance cooldown tick
    if (this.stanceCooldownTicks > 0) this.stanceCooldownTicks--;

    // Handle stance change (with cooldown)
    if (input.stanceChange && this.stanceCooldownTicks <= 0) {
      this.player.stance = input.stanceChange;
      this.stanceCooldownTicks = STANCE_COOLDOWN;
      this.lastInput.stanceChange = null;
    } else if (input.stanceChange) {
      this.lastInput.stanceChange = null; // discard blocked change
    }

    // Dash cooldown
    if (this.dashCooldownTicks > 0) this.dashCooldownTicks--;

    // Dash activation
    if (input.dash && this.dashCooldownTicks <= 0 && this.dashActiveTicks <= 0) {
      this.dashCooldownTicks = DASH_COOLDOWN;
      this.dashActiveTicks = DASH_DURATION;
      // Capture dash direction from movement or facing
      if (input.moveX !== 0 || input.moveY !== 0) {
        const len = Math.sqrt(input.moveX ** 2 + input.moveY ** 2);
        this.dashDirX = input.moveX / len;
        this.dashDirY = input.moveY / len;
      } else {
        const facingMap: Record<string, [number, number]> = {
          up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
        };
        const [fx, fy] = facingMap[this.player.facing] || [0, -1];
        this.dashDirX = fx;
        this.dashDirY = fy;
      }
      this.lastInput.dash = false;
    }

    // Dash movement (overrides normal movement)
    if (this.dashActiveTicks > 0) {
      this.dashActiveTicks--;
      const dashSpeed = PLAYER_SPEED * DASH_SPEED_MULT;
      const newX = this.player.x + this.dashDirX * dashSpeed;
      const newY = this.player.y + this.dashDirY * dashSpeed;
      if (!collidesWithWalls(this.arena.walls, newX, newY, WALL_MARGIN)) {
        this.player.x = newX;
        this.player.y = newY;
      } else if (!collidesWithWalls(this.arena.walls, newX, this.player.y, WALL_MARGIN)) {
        this.player.x = newX;
      } else if (!collidesWithWalls(this.arena.walls, this.player.x, newY, WALL_MARGIN)) {
        this.player.y = newY;
      }
    }

    // Move player (skip if dashing)
    if (this.dashActiveTicks <= 0 && (input.moveX !== 0 || input.moveY !== 0)) {
      const len = Math.sqrt(input.moveX ** 2 + input.moveY ** 2);
      const nx = input.moveX / len;
      const ny = input.moveY / len;
      const newX = this.player.x + nx * PLAYER_SPEED;
      const newY = this.player.y + ny * PLAYER_SPEED;

      if (!collidesWithWalls(this.arena.walls, newX, newY, WALL_MARGIN)) {
        this.player.x = newX;
        this.player.y = newY;
      } else if (!collidesWithWalls(this.arena.walls, newX, this.player.y, WALL_MARGIN)) {
        this.player.x = newX;
      } else if (!collidesWithWalls(this.arena.walls, this.player.x, newY, WALL_MARGIN)) {
        this.player.y = newY;
      }

      if (Math.abs(nx) > Math.abs(ny)) {
        this.player.facing = nx > 0 ? 'right' : 'left';
      } else {
        this.player.facing = ny > 0 ? 'down' : 'up';
      }
    }

    // Tick cooldowns
    if (this.playerAttackCooldown > 0) this.playerAttackCooldown--;
    for (const id in this.abilityCooldowns) {
      if (this.abilityCooldowns[id] > 0) this.abilityCooldowns[id]--;
    }
    this.player.attackCooldown = this.playerAttackCooldown;

    // Tick buffs
    this.playerBuffs = this.playerBuffs.filter(b => {
      b.remaining--;
      return b.remaining > 0;
    });

    // Stealth timer
    if (this.stealthTimer > 0) this.stealthTimer--;

    // Stamina regen
    if (this.player.stamina < this.player.maxStamina) {
      this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + 0.15);
    }

    // Handle ability usage
    if (input.abilitySlot !== null) {
      this.executeAbility(input.abilitySlot, input);
      this.lastInput.abilitySlot = null;
    }

    // Update enemies
    for (const enemy of this.enemies) {
      if (enemy.state.hp <= 0) continue;
      this.updateEnemy(enemy, input);
      this.tickEnemyDots(enemy);
    }

    // Player primary attack (auto-attack)
    if (input.attacking && this.playerAttackCooldown <= 0) {
      this.executePrimaryAttack(input);
    }

    // Update projectiles
    this.updateProjectiles();

    // Reflect damage (flame shield)
    const reflectBuff = this.playerBuffs.find(b => b.effect === 'reflect');
    if (reflectBuff) {
      // Applied on enemy melee hit in updateEnemy
    }

    // Gather resources
    this.updateGathering(input);

    // Auto-pickup ground loot
    for (const loot of this.groundLoot) {
      if (loot.pickedUp) continue;
      if (dist(this.player.x, this.player.y, loot.x, loot.y) < 30) {
        loot.pickedUp = true;
        if (loot.isHealing) {
          const healed = loot.healAmount || Math.round(this.player.maxHp * 0.15);
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + healed);
          this.callbacks.onEvent({
            type: 'heal',
            targetId: 'player',
            value: healed,
            x: loot.x,
            y: loot.y,
          });
        } else {
          this.callbacks.onEvent({
            type: 'loot_pickup',
            text: loot.itemName,
            rarity: loot.rarity,
            x: loot.x,
            y: loot.y,
            itemName: loot.itemName,
          });
        }
      }
    }

    // Check exit portal — player walks into the exit to advance
    if (this.exitPosition) {
      const exitDist = dist(this.player.x, this.player.y, this.exitPosition.x, this.exitPosition.y);
      if (exitDist < this.exitRadius) {
        // Auto-collect remaining loot
        for (const loot of this.groundLoot) {
          if (!loot.pickedUp) loot.pickedUp = true;
        }
        const zoneConfig = ZONES[this.zone] || ZONES['tomb_halls'];
        const nextZone = zoneConfig.connectedZones?.[0] || undefined;
        this.stop();
        this.callbacks.onEnd('victory', {
          xpGained: this.totalXp,
          goldGained: this.totalGold,
          itemsDropped: this.lootDrops.map(d => ({ itemName: d.itemName, rarity: d.rarity })),
          xpCapped: false,
          playerLevel: 1,
          playerLevelEnd: this.playerLevel,
          nextZone,
        });
        return;
      }
    }

    // Check victory (all enemies dead — fallback win condition)
    const aliveEnemies = this.enemies.filter(e => e.state.hp > 0);
    if (aliveEnemies.length === 0) {
      // Auto-collect remaining loot
      for (const loot of this.groundLoot) {
        if (!loot.pickedUp) loot.pickedUp = true;
      }
      const zoneConfig = ZONES[this.zone] || ZONES['tomb_halls'];
      const nextZone = zoneConfig.connectedZones?.[0] || undefined;
      this.stop();
      this.callbacks.onEnd('victory', {
        xpGained: this.totalXp,
        goldGained: this.totalGold,
        itemsDropped: this.lootDrops.map(d => ({ itemName: d.itemName, rarity: d.rarity })),
        xpCapped: false,
        playerLevel: 1,
        playerLevelEnd: this.playerLevel,
        nextZone,
      });
      return;
    }

    // Check defeat
    if (this.player.hp <= 0) {
      this.stop();
      this.callbacks.onEnd('defeat');
      return;
    }

    this.broadcastState();
  }

  private executePrimaryAttack(input: DemoInput) {
    const primary = this.primaryAbility;
    const attackCooldown = Math.round(primary.cooldownTicks * this.getAttackSpeedMultiplier());

    // Find target — prefer explicit targetId, else nearest in range
    let target: DemoEnemy | null = null;
    if (input.targetId) {
      const t = this.enemies.find(e => e.state.id === input.targetId && e.state.hp > 0);
      if (t && dist(this.player.x, this.player.y, t.state.x, t.state.y) < primary.range) {
        target = t;
      }
    }
    if (!target) {
      target = this.findNearestAliveEnemyInRange(primary.range);
    }
    if (!target) return;

    this.playerAttackCooldown = attackCooldown;

    if (primary.visual === 'projectile') {
      // Ranged: spawn projectile
      this.spawnProjectile(
        this.player.x, this.player.y,
        target.state.x, target.state.y,
        target.state.id,
        primary.projectileSpeed,
        primary.damage,
        primary.element,
        primary.id,
        primary.aoeRadius,
        false,
        0,
      );
    } else {
      // Melee instant
      this.applyMeleeDamage(target, primary.damage, primary.element, primary.aoeRadius > 0);
    }
  }

  private executeAbility(slot: number, input: DemoInput) {
    const ability = this.getAbilityBySlot(slot);
    if (!ability) return;
    if (this.abilityCooldowns[ability.id] > 0) return;
    if (this.player.stamina < ability.staminaCost) return;

    this.player.stamina -= ability.staminaCost;
    this.abilityCooldowns[ability.id] = ability.cooldownTicks;

    // Find a target for targeted abilities
    let target: DemoEnemy | null = null;
    if (input.targetId) {
      target = this.enemies.find(e => e.state.id === input.targetId && e.state.hp > 0) || null;
    }
    if (!target) {
      target = this.findNearestAliveEnemyInRange(ability.range || 200);
    }

    switch (ability.visual) {
      case 'melee_instant':
        if (target && dist(this.player.x, this.player.y, target.state.x, target.state.y) < ability.range) {
          this.applyMeleeDamage(target, ability.damage, ability.element, false);
          // Apply DoT if defined
          if (ability.dotDamage && ability.dotDuration) {
            target.dots.push({
              sourceId: 'player',
              damage: ability.dotDamage,
              remaining: ability.dotDuration,
              tickInterval: 10,
              tickCounter: 0,
              element: ability.element,
            });
          }
        }
        break;

      case 'projectile':
        if (target) {
          if (ability.projectileCount && ability.projectileCount > 1) {
            // Fan of knives: spread projectiles
            const spread = 0.4; // radians spread
            const baseAngle = Math.atan2(target.state.y - this.player.y, target.state.x - this.player.x);
            for (let i = 0; i < ability.projectileCount; i++) {
              const angle = baseAngle + (i - (ability.projectileCount - 1) / 2) * spread;
              const tx = this.player.x + Math.cos(angle) * ability.range;
              const ty = this.player.y + Math.sin(angle) * ability.range;
              this.spawnProjectile(
                this.player.x, this.player.y, tx, ty, null,
                ability.projectileSpeed, ability.damage, ability.element,
                ability.id, ability.aoeRadius, ability.piercing || false, 0, 0.6,
              );
            }
          } else {
            this.spawnProjectile(
              this.player.x, this.player.y,
              target.state.x, target.state.y,
              target.state.id,
              ability.projectileSpeed, ability.damage, ability.element,
              ability.id, ability.aoeRadius, ability.piercing || false,
              ability.healPercent || 0,
            );
          }
        }
        break;

      case 'self_aoe': {
        // Immediate AoE centered on player
        const radius = ability.aoeRadius;
        this.callbacks.onEvent({
          type: 'effect',
          x: this.player.x,
          y: this.player.y,
          text: ability.name,
          sourceId: 'player',
        });

        if (ability.damage > 0) {
          for (const enemy of this.enemies) {
            if (enemy.state.hp <= 0) continue;
            if (dist(this.player.x, this.player.y, enemy.state.x, enemy.state.y) < radius) {
              this.damageEnemy(enemy, ability.damage, ability.element);
            }
          }
        }

        // Taunt: force aggro
        if (ability.buffEffect === 'taunt') {
          for (const enemy of this.enemies) {
            if (enemy.state.hp <= 0) continue;
            if (dist(this.player.x, this.player.y, enemy.state.x, enemy.state.y) < radius) {
              enemy.taunted = true;
              enemy.tauntTimer = ability.duration || 60;
            }
          }
        }

        // Stealth (smoke bomb)
        if (ability.buffEffect === 'stealth') {
          this.stealthTimer = ability.duration || 40;
        }
        break;
      }

      case 'targeted_aoe': {
        // AoE at target location (volley, meteor)
        const tx = target ? target.state.x : this.player.x;
        const ty = target ? target.state.y : this.player.y;

        this.callbacks.onEvent({
          type: 'effect',
          x: tx,
          y: ty,
          text: ability.name,
          sourceId: 'player',
        });

        // Delayed for meteor, instant for volley
        const isDelayed = ability.id === 'meteor';
        if (isDelayed) {
          // Spawn a slow projectile from above
          this.spawnProjectile(
            tx, ty - 200, tx, ty, null,
            ability.projectileSpeed, ability.damage, ability.element,
            ability.id, ability.aoeRadius, false, 0, 1.5,
          );
        } else {
          // Instant AoE
          for (const enemy of this.enemies) {
            if (enemy.state.hp <= 0) continue;
            if (dist(tx, ty, enemy.state.x, enemy.state.y) < ability.aoeRadius) {
              this.damageEnemy(enemy, ability.damage, ability.element);
            }
          }
        }
        break;
      }

      case 'self_buff': {
        this.playerBuffs.push({
          id: ability.id,
          effect: ability.buffEffect || '',
          value: ability.buffValue || 0,
          remaining: ability.duration || 60,
        });
        this.callbacks.onEvent({
          type: 'effect',
          x: this.player.x,
          y: this.player.y,
          text: ability.name,
          sourceId: 'player',
        });
        break;
      }

      case 'drain': {
        if (target) {
          this.spawnProjectile(
            this.player.x, this.player.y,
            target.state.x, target.state.y,
            target.state.id,
            ability.projectileSpeed, ability.damage, ability.element,
            ability.id, 0, false, ability.healPercent || 0.5,
          );
        }
        break;
      }
    }
  }

  private spawnProjectile(
    sx: number, sy: number, tx: number, ty: number,
    targetId: string | null, speed: number, damage: number,
    element: ElementType, visual: string, aoeRadius: number,
    piercing: boolean, healPercent: number, size = 1,
  ) {
    this.projectiles.push({
      id: `proj_${nextProjectileId++}`,
      x: sx, y: sy,
      targetX: tx, targetY: ty,
      targetId,
      speed: speed * 2, // arena units per tick (slow enough to see travel)
      damage, element, visual,
      aoeRadius, piercing, healPercent,
      hitIds: new Set(),
      size,
    });
  }

  private updateProjectiles() {
    const toRemove: string[] = [];

    for (const proj of this.projectiles) {
      // Update target position if tracking a live enemy
      if (proj.targetId) {
        const target = this.enemies.find(e => e.state.id === proj.targetId && e.state.hp > 0);
        if (target) {
          proj.targetX = target.state.x;
          proj.targetY = target.state.y;
        }
      }

      const dx = proj.targetX - proj.x;
      const dy = proj.targetY - proj.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d < proj.speed + 5) {
        // Arrived at target
        this.onProjectileHit(proj);
        if (!proj.piercing) {
          toRemove.push(proj.id);
        }
      } else {
        // Move toward target
        proj.x += (dx / d) * proj.speed;
        proj.y += (dy / d) * proj.speed;

        // Check if piercing projectile hits enemies along the way
        if (proj.piercing) {
          for (const enemy of this.enemies) {
            if (enemy.state.hp <= 0) continue;
            if (proj.hitIds.has(enemy.state.id)) continue;
            if (dist(proj.x, proj.y, enemy.state.x, enemy.state.y) < 20) {
              proj.hitIds.add(enemy.state.id);
              this.damageEnemy(enemy, proj.damage, proj.element);
            }
          }
        }
      }

      // Remove if out of bounds
      if (proj.x < -50 || proj.x > this.arena.width + 50 || proj.y < -50 || proj.y > this.arena.height + 50) {
        toRemove.push(proj.id);
      }
    }

    this.projectiles = this.projectiles.filter(p => !toRemove.includes(p.id));
  }

  private onProjectileHit(proj: Projectile) {
    if (proj.aoeRadius > 0) {
      // AoE damage
      for (const enemy of this.enemies) {
        if (enemy.state.hp <= 0) continue;
        if (dist(proj.targetX, proj.targetY, enemy.state.x, enemy.state.y) < proj.aoeRadius) {
          this.damageEnemy(enemy, proj.damage, proj.element);
        }
      }
      this.callbacks.onEvent({
        type: 'effect',
        x: proj.targetX,
        y: proj.targetY,
        text: 'AoE',
        sourceId: 'player',
      });
    } else if (proj.targetId) {
      const target = this.enemies.find(e => e.state.id === proj.targetId && e.state.hp > 0);
      if (target && !proj.hitIds.has(target.state.id)) {
        this.damageEnemy(target, proj.damage, proj.element);
        proj.hitIds.add(target.state.id);

        // Life drain heal
        if (proj.healPercent > 0) {
          const healed = Math.round(proj.damage * proj.healPercent);
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + healed);
          this.callbacks.onEvent({
            type: 'heal',
            targetId: 'player',
            value: healed,
            x: this.player.x,
            y: this.player.y,
          });
        }
      }
    } else {
      // No specific target — hit nearest enemy at arrival point
      let nearest: DemoEnemy | null = null;
      let minD = 30;
      for (const enemy of this.enemies) {
        if (enemy.state.hp <= 0) continue;
        const d = dist(proj.x, proj.y, enemy.state.x, enemy.state.y);
        if (d < minD) { minD = d; nearest = enemy; }
      }
      if (nearest && !proj.hitIds.has(nearest.state.id)) {
        this.damageEnemy(nearest, proj.damage, proj.element);
        proj.hitIds.add(nearest.state.id);
      }
    }
  }

  private applyMeleeDamage(target: DemoEnemy, baseDamage: number, element: ElementType, isAoe: boolean) {
    const atkBonus = 1 + (this.equipBonuses.atk * 0.05);
    const stanceMod = (this.player.stance === 'aggressive' ? 1.35 :
                      this.player.stance === 'defensive' ? 0.7 :
                      this.player.stance === 'evasive' ? 0.9 : 1.0) * atkBonus;
    const isCrit = (this.playerClass === 'shade' && Math.random() < 0.25) ||
                   (this.player.stance === 'aggressive' && Math.random() < 0.13);

    if (isAoe) {
      // Hit all enemies in melee range
      for (const enemy of this.enemies) {
        if (enemy.state.hp <= 0) continue;
        if (dist(this.player.x, this.player.y, enemy.state.x, enemy.state.y) < this.classDef.attackRange + 10) {
          let dmg = Math.round(baseDamage * stanceMod * (0.8 + Math.random() * 0.4));
          if (isCrit) dmg = Math.round(dmg * 1.8);
          this.damageEnemy(enemy, dmg, element, isCrit);
        }
      }
    } else {
      let dmg = Math.round(baseDamage * stanceMod * (0.8 + Math.random() * 0.4));
      if (isCrit) dmg = Math.round(dmg * 1.8);
      this.damageEnemy(target, dmg, element, isCrit);
    }
  }

  private damageEnemy(enemy: DemoEnemy, damage: number, element: ElementType, isCrit = false) {
    enemy.state.hp = Math.max(0, enemy.state.hp - damage);

    this.callbacks.onEvent({
      type: isCrit ? 'crit' : 'damage',
      targetId: enemy.state.id,
      sourceId: 'player',
      value: damage,
      x: enemy.state.x,
      y: enemy.state.y,
    });

    if (enemy.state.hp <= 0) {
      this.callbacks.onEvent({
        type: 'death',
        targetId: enemy.state.id,
        x: enemy.state.x,
        y: enemy.state.y,
      });
      this.handleEnemyKill(enemy);
    }
  }

  private handleEnemyKill(enemy: DemoEnemy) {
    if (!enemy.mob) return;
    const mob = enemy.mob;
    const isBoss = mob.archetype === 'boss';

    // XP with level penalty
    const mobLevel = Math.max(1, Math.round(mob.hp / 50));
    const levelDiff = this.playerLevel - mobLevel;
    let xpPenalty = 1.0;
    if (levelDiff > 3) xpPenalty = Math.max(0.1, 1 - (levelDiff - 3) * 0.2);
    const xpGained = Math.round(mob.xp_reward * xpPenalty);
    const goldGained = mob.gold_reward;

    this.totalXp += xpGained;
    this.totalGold += goldGained;
    this.playerXp += xpGained;

    // Check level up
    const newLevel = getLevelForXp(this.playerXp);
    if (newLevel > this.playerLevel) {
      this.playerLevel = newLevel;
      this.callbacks.onEvent({
        type: 'level_up',
        value: newLevel,
        x: this.player.x,
        y: this.player.y,
      });
    }

    // Emit kill reward event
    this.callbacks.onEvent({
      type: 'kill_reward',
      value: xpGained,
      x: enemy.state.x,
      y: enemy.state.y,
      text: `+${xpGained} XP  +${goldGained}g`,
    });

    // Roll loot drops — only place equippable gear on the ground
    const EQUIP_CATEGORIES = new Set(['weapon', 'armor', 'shield', 'accessory']);
    const drops = rollLoot(mob, this.zoneDangerLevel, 3, isBoss);
    for (const drop of drops) {
      const itemDef = ITEM_MAP.get(drop.itemCode);
      if (!itemDef || !EQUIP_CATEGORIES.has(itemDef.category)) continue;

      this.lootDrops.push(drop);
      const lootId = `loot_${this.nextLootId++}`;
      this.groundLoot.push({
        id: lootId,
        itemCode: drop.itemCode,
        itemName: drop.itemName,
        rarity: drop.rarity,
        x: enemy.state.x + (Math.random() - 0.5) * 30,
        y: enemy.state.y + (Math.random() - 0.5) * 30,
        pickedUp: false,
      });

      this.callbacks.onEvent({
        type: 'loot_drop',
        text: drop.itemName,
        rarity: drop.rarity,
        x: enemy.state.x,
        y: enemy.state.y,
      });
    }

    // 40% chance to spawn healing globule
    if (Math.random() < 0.4) {
      const healAmount = Math.round(this.player.maxHp * 0.15);
      const healId = `loot_${this.nextLootId++}`;
      this.groundLoot.push({
        id: healId,
        itemCode: 'healing_globule',
        itemName: 'Healing Globule',
        rarity: 'uncommon',
        x: enemy.state.x + (Math.random() - 0.5) * 20,
        y: enemy.state.y + (Math.random() - 0.5) * 20,
        pickedUp: false,
        isHealing: true,
        healAmount,
      });
    }
  }

  private tickEnemyDots(enemy: DemoEnemy) {
    enemy.dots = enemy.dots.filter(dot => {
      dot.tickCounter++;
      dot.remaining--;
      if (dot.tickCounter >= dot.tickInterval) {
        dot.tickCounter = 0;
        enemy.state.hp = Math.max(0, enemy.state.hp - dot.damage);
        this.callbacks.onEvent({
          type: 'damage',
          targetId: enemy.state.id,
          sourceId: 'player',
          value: dot.damage,
          x: enemy.state.x,
          y: enemy.state.y,
          text: dot.element === 'shadow' ? 'Poison' : 'Bleed',
        });
        if (enemy.state.hp <= 0) {
          this.callbacks.onEvent({
            type: 'death',
            targetId: enemy.state.id,
            x: enemy.state.x,
            y: enemy.state.y,
          });
          this.handleEnemyKill(enemy);
        }
      }
      return dot.remaining > 0 && enemy.state.hp > 0;
    });
  }

  private updateEnemy(enemy: DemoEnemy, input: DemoInput) {
    // Taunt timer
    if (enemy.tauntTimer > 0) {
      enemy.tauntTimer--;
      if (enemy.tauntTimer <= 0) enemy.taunted = false;
    }

    const d = dist(this.player.x, this.player.y, enemy.state.x, enemy.state.y);
    const effectiveAggro = enemy.taunted ? 999 : AGGRO_RANGE;

    // Stealth: enemies lose aggro
    if (this.stealthTimer > 0 && !enemy.taunted) {
      enemy.state.aiState = 'patrol';
      this.doPatrol(enemy);
      return;
    }

    const los = hasLineOfSight(this.arena.walls, enemy.state.x, enemy.state.y, this.player.x, this.player.y);

    if (d < effectiveAggro && los) {
      // Leash check — enemy too far from origin resets
      const distFromOrigin = dist(enemy.state.x, enemy.state.y, enemy.patrolOriginX, enemy.patrolOriginY);
      if (distFromOrigin > LEASH_DISTANCE && !enemy.taunted) {
        enemy.state.hp = enemy.state.maxHp;
        enemy.dots = [];
        this.doPatrol(enemy);
        this.callbacks.onEvent({
          type: 'effect',
          x: enemy.state.x,
          y: enemy.state.y,
          text: 'Resetting...',
          sourceId: enemy.state.id,
        });
        return;
      }
      enemy.state.aiState = d < ENEMY_ATTACK_RANGE ? 'attack' : 'chase';
      const dx = this.player.x - enemy.state.x;
      const dy = this.player.y - enemy.state.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (d > ENEMY_ATTACK_RANGE * 0.8 && len > 0) {
        const speed = enemy.state.aiState === 'chase' ? CHASE_SPEED : ENEMY_SPEED;
        const nx = enemy.state.x + (dx / len) * speed;
        const ny = enemy.state.y + (dy / len) * speed;
        if (!collidesWithWalls(this.arena.walls, nx, ny, 10)) {
          enemy.state.x = nx;
          enemy.state.y = ny;
        }
      }

      // Enemy attack
      if (enemy.attackCooldown > 0) enemy.attackCooldown--;
      if (d < ENEMY_ATTACK_RANGE && enemy.attackCooldown <= 0 && los) {
        enemy.attackCooldown = ENEMY_ATTACK_COOLDOWN + Math.floor(Math.random() * 8);
        const defMod = this.player.stance === 'defensive' ? 0.6 :
                       this.player.stance === 'evasive' ? 0.8 : 1.0;

        if (this.player.stance === 'evasive' && Math.random() < 0.25) {
          this.callbacks.onEvent({ type: 'dodge', targetId: 'player', x: this.player.x, y: this.player.y });
          return;
        }
        if (this.player.stance === 'defensive' && Math.random() < 0.25) {
          this.callbacks.onEvent({ type: 'block', targetId: 'player', x: this.player.x, y: this.player.y });
          return;
        }

        const defReduction = Math.max(0.3, 1 - this.equipBonuses.def * 0.03);
        let dmg = Math.round(ENEMY_ATTACK_DMG * defMod * defReduction * this.getDamageReductionMultiplier() * (0.7 + Math.random() * 0.6));
        this.player.hp = Math.max(0, this.player.hp - dmg);

        this.callbacks.onEvent({
          type: 'damage',
          targetId: 'player',
          sourceId: enemy.state.id,
          value: dmg,
          x: this.player.x,
          y: this.player.y,
        });

        // Flame shield reflect
        const reflect = this.playerBuffs.find(b => b.effect === 'reflect');
        if (reflect) {
          const reflectDmg = Math.round(reflect.value);
          enemy.state.hp = Math.max(0, enemy.state.hp - reflectDmg);
          this.callbacks.onEvent({
            type: 'damage',
            targetId: enemy.state.id,
            sourceId: 'player',
            value: reflectDmg,
            x: enemy.state.x,
            y: enemy.state.y,
            text: 'Reflect',
          });
          if (enemy.state.hp <= 0) {
            this.callbacks.onEvent({ type: 'death', targetId: enemy.state.id, x: enemy.state.x, y: enemy.state.y });
            this.handleEnemyKill(enemy);
          }
        }
      }
    } else {
      this.doPatrol(enemy);
    }

    // Facing
    const dx = this.player.x - enemy.state.x;
    const dy = this.player.y - enemy.state.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      enemy.state.facing = dx > 0 ? 'right' : 'left';
    } else {
      enemy.state.facing = dy > 0 ? 'down' : 'up';
    }
  }

  private doPatrol(enemy: DemoEnemy) {
    enemy.state.aiState = 'patrol';
    enemy.patrolAngle += 0.02;
    const tx = enemy.patrolOriginX + Math.cos(enemy.patrolAngle) * enemy.patrolRadius;
    const ty = enemy.patrolOriginY + Math.sin(enemy.patrolAngle) * enemy.patrolRadius;
    const dx = tx - enemy.state.x;
    const dy = ty - enemy.state.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) {
      const nx = enemy.state.x + (dx / len) * ENEMY_SPEED * 0.5;
      const ny = enemy.state.y + (dy / len) * ENEMY_SPEED * 0.5;
      if (!collidesWithWalls(this.arena.walls, nx, ny, 10)) {
        enemy.state.x = nx;
        enemy.state.y = ny;
      }
    }
  }

  private updateGathering(input: DemoInput) {
    for (const res of this.resources) {
      if (res.isGathered) continue;

      const d = dist(this.player.x, this.player.y, res.x, res.y);
      if (d < 40 && input.gather) {
        if (res.gatheringBy !== 'player') {
          res.gatheringBy = 'player';
          res.gatherProgress = 0;
          this.callbacks.onEvent({ type: 'gather_start', targetId: res.id, x: res.x, y: res.y });
        }
        res.gatherProgress++;
        const ticksNeeded = res.gatherTime * 20;
        if (res.gatherProgress >= ticksNeeded) {
          res.isGathered = true;
          res.gatheringBy = null;
          this.callbacks.onEvent({ type: 'gather', targetId: res.id, x: res.x, y: res.y, text: res.name });
        }
      } else if (res.gatheringBy === 'player') {
        res.gatheringBy = null;
        res.gatherProgress = 0;
        this.callbacks.onEvent({ type: 'gather_cancel', targetId: res.id, x: res.x, y: res.y });
      }
    }
  }

  private findNearestAliveEnemy(): DemoEnemy | null {
    let nearest: DemoEnemy | null = null;
    let minDist = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.state.hp <= 0) continue;
      const d = dist(this.player.x, this.player.y, enemy.state.x, enemy.state.y);
      if (d < minDist) {
        minDist = d;
        nearest = enemy;
      }
    }
    return nearest;
  }

  private findNearestAliveEnemyInRange(range: number): DemoEnemy | null {
    let nearest: DemoEnemy | null = null;
    let minDist = range;
    for (const enemy of this.enemies) {
      if (enemy.state.hp <= 0) continue;
      const d = dist(this.player.x, this.player.y, enemy.state.x, enemy.state.y);
      if (d < minDist && hasLineOfSight(this.arena.walls, this.player.x, this.player.y, enemy.state.x, enemy.state.y)) {
        minDist = d;
        nearest = enemy;
      }
    }
    return nearest;
  }

  private broadcastState() {
    // Serialize cooldowns as fractions (0-1 where 1 = full cooldown)
    const cooldowns: Record<string, number> = {};
    for (const ab of this.classDef.abilities) {
      cooldowns[ab.id] = this.abilityCooldowns[ab.id] / ab.cooldownTicks;
    }

    this.callbacks.onStateUpdate({
      player: {
        ...this.player,
        abilityCooldowns: cooldowns,
        buffs: this.playerBuffs.map(b => ({ id: b.id, name: b.effect, type: 'buff' as const, stat: b.effect, value: b.value, duration: b.remaining })),
        dashCooldown: this.dashCooldownTicks / DASH_COOLDOWN,
        stanceCooldown: this.stanceCooldownTicks / STANCE_COOLDOWN,
      },
      enemies: this.enemies.filter(e => e.state.hp > 0).map(e => ({ ...e.state })),
      resources: this.resources.map(r => ({ ...r })),
      groundLoot: this.groundLoot.filter(l => !l.pickedUp),
      projectiles: this.projectiles.map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        element: p.element,
        visual: p.visual,
        size: p.size,
      })),
      arena: this.arena,
      zone: this.zone,
      tick: this.tick,
      playerLevel: this.playerLevel,
      playerXp: this.playerXp,
      playerXpToNext: xpRequiredForLevel(this.playerLevel + 1),
      wallGrid: this.wallGrid,
      gridW: this.gridW,
      gridH: this.gridH,
      blockStyle: this.blockStyle,
    });
  }
}
