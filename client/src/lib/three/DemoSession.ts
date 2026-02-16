import type { ArenaData, RealtimePlayerState, RealtimeEnemyState, RealtimeResourceState, RealtimeEvent, RealtimeProjectile } from '../stores/realtimeStore.svelte';
import type { Stance, PlayerClass, ClassAbilityDef, ElementType } from '../stores/types';
import { CLASS_DEFS } from './ClassDefs';

// Arena is 1400x1000
const ARENA_W = 1400;
const ARENA_H = 1000;
const PLAYER_SPEED = 5.5;
const ENEMY_SPEED = 2.5;
const CHASE_SPEED = 3.8;
const AGGRO_RANGE = 120;
const ENEMY_ATTACK_RANGE = 45;
const ENEMY_ATTACK_COOLDOWN = 12;
const ENEMY_ATTACK_DMG = 8;
const WALL_MARGIN = 14;

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
}

interface DemoInput {
  moveX: number;
  moveY: number;
  attacking: boolean;
  abilitySlot: number | null;
  stanceChange: Stance | null;
  gather?: boolean;
  targetId?: string;
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
    arena: ArenaData;
    zone: string;
    tick: number;
  }) => void;
  onEvent: (event: RealtimeEvent) => void;
  onEnd: (result: 'victory' | 'defeat') => void;
}

export function generateDungeonArena(): ArenaData {
  const walls: ArenaData['walls'] = [];

  // ============ GRAND ENTRANCE HALL (center) ============
  // Open area around player spawn (700, 500) with pillars
  walls.push({ x: 640, y: 440, w: 24, h: 24 });  // pillar
  walls.push({ x: 740, y: 440, w: 24, h: 24 });  // pillar
  walls.push({ x: 640, y: 560, w: 24, h: 24 });  // pillar
  walls.push({ x: 740, y: 560, w: 24, h: 24 });  // pillar

  // ============ NORTH WING — Tomb Chamber ============
  // Walled room top-center, opening south
  walls.push({ x: 480, y: 80, w: 440, h: 20 });   // north wall
  walls.push({ x: 480, y: 80, w: 20, h: 260 });   // west wall
  walls.push({ x: 900, y: 80, w: 20, h: 260 });   // east wall
  walls.push({ x: 480, y: 320, w: 160, h: 20 });  // south wall left
  walls.push({ x: 760, y: 320, w: 160, h: 20 });  // south wall right (gap in middle for entrance)
  // Interior pillars
  walls.push({ x: 560, y: 160, w: 20, h: 20 });
  walls.push({ x: 820, y: 160, w: 20, h: 20 });
  walls.push({ x: 560, y: 260, w: 20, h: 20 });
  walls.push({ x: 820, y: 260, w: 20, h: 20 });
  // Sarcophagus (central block)
  walls.push({ x: 660, y: 180, w: 80, h: 40 });

  // ============ WEST WING — Mine Tunnels ============
  // Irregular corridors on the left
  walls.push({ x: 40, y: 200, w: 20, h: 400 });    // far west wall
  walls.push({ x: 40, y: 200, w: 200, h: 20 });    // top wall
  walls.push({ x: 40, y: 580, w: 200, h: 20 });    // bottom wall
  walls.push({ x: 220, y: 200, w: 20, h: 120 });   // inner wall top
  walls.push({ x: 220, y: 480, w: 20, h: 120 });   // inner wall bottom (gap for passage)
  // Rubble/pillars inside
  walls.push({ x: 100, y: 300, w: 30, h: 30 });
  walls.push({ x: 160, y: 420, w: 24, h: 24 });
  walls.push({ x: 80, y: 500, w: 28, h: 28 });

  // West corridor connecting to center
  walls.push({ x: 240, y: 370, w: 180, h: 16 });   // corridor north wall
  walls.push({ x: 240, y: 420, w: 180, h: 16 });   // corridor south wall

  // ============ EAST WING — Ritual Chamber ============
  // Large room on the right
  walls.push({ x: 1000, y: 250, w: 20, h: 340 });   // west wall
  walls.push({ x: 1000, y: 250, w: 340, h: 20 });   // north wall
  walls.push({ x: 1320, y: 250, w: 20, h: 340 });   // east wall
  walls.push({ x: 1000, y: 570, w: 140, h: 20 });   // south wall left
  walls.push({ x: 1200, y: 570, w: 140, h: 20 });   // south wall right (gap)
  // Ritual circle pillars (octagon pattern)
  walls.push({ x: 1120, y: 320, w: 20, h: 20 });
  walls.push({ x: 1200, y: 320, w: 20, h: 20 });
  walls.push({ x: 1240, y: 380, w: 20, h: 20 });
  walls.push({ x: 1240, y: 460, w: 20, h: 20 });
  walls.push({ x: 1200, y: 520, w: 20, h: 20 });
  walls.push({ x: 1120, y: 520, w: 20, h: 20 });
  walls.push({ x: 1080, y: 460, w: 20, h: 20 });
  walls.push({ x: 1080, y: 380, w: 20, h: 20 });
  // Altar
  walls.push({ x: 1140, y: 400, w: 60, h: 40 });

  // East corridor connecting to center
  walls.push({ x: 920, y: 400, w: 80, h: 16 });    // corridor north wall
  walls.push({ x: 920, y: 450, w: 80, h: 16 });    // corridor south wall

  // ============ SOUTHWEST — Crypt ============
  walls.push({ x: 100, y: 680, w: 300, h: 20 });   // north wall
  walls.push({ x: 100, y: 680, w: 20, h: 260 });   // west wall
  walls.push({ x: 100, y: 920, w: 300, h: 20 });   // south wall
  walls.push({ x: 380, y: 760, w: 20, h: 180 });   // east wall (gap at top for entrance)
  // Coffins
  walls.push({ x: 150, y: 740, w: 50, h: 24 });
  walls.push({ x: 150, y: 820, w: 50, h: 24 });
  walls.push({ x: 150, y: 900, w: 50, h: 24 });
  walls.push({ x: 300, y: 740, w: 50, h: 24 });
  walls.push({ x: 300, y: 820, w: 50, h: 24 });

  // ============ SOUTHEAST — Arena Pit ============
  walls.push({ x: 900, y: 700, w: 440, h: 20 });   // north wall
  walls.push({ x: 900, y: 700, w: 20, h: 240 });   // west wall (gap at top)
  walls.push({ x: 1320, y: 700, w: 20, h: 240 });  // east wall
  walls.push({ x: 900, y: 920, w: 440, h: 20 });   // south wall
  // Pit pillars
  walls.push({ x: 980, y: 770, w: 24, h: 24 });
  walls.push({ x: 1240, y: 770, w: 24, h: 24 });
  walls.push({ x: 980, y: 870, w: 24, h: 24 });
  walls.push({ x: 1240, y: 870, w: 24, h: 24 });

  // ============ NORTH CORRIDORS ============
  // Connecting north wing to east/west
  walls.push({ x: 300, y: 160, w: 160, h: 16 });
  walls.push({ x: 300, y: 220, w: 160, h: 16 });
  walls.push({ x: 940, y: 160, w: 60, h: 16 });
  walls.push({ x: 940, y: 220, w: 60, h: 16 });

  // ============ SOUTH CORRIDOR ============
  // Connecting SW crypt to center to SE arena
  walls.push({ x: 420, y: 620, w: 460, h: 16 });   // corridor north wall
  walls.push({ x: 420, y: 680, w: 460, h: 16 });   // corridor south wall

  // ============ SCATTERED OBSTACLES ============
  // Cover pillars in open areas
  walls.push({ x: 460, y: 480, w: 20, h: 20 });
  walls.push({ x: 540, y: 380, w: 20, h: 20 });
  walls.push({ x: 840, y: 480, w: 20, h: 20 });
  walls.push({ x: 700, y: 650, w: 20, h: 20 });
  walls.push({ x: 500, y: 750, w: 24, h: 24 });
  walls.push({ x: 700, y: 830, w: 24, h: 24 });

  return { width: ARENA_W, height: ARENA_H, walls };
}

function rectContains(wall: { x: number; y: number; w: number; h: number }, px: number, py: number, margin: number): boolean {
  return px > wall.x - margin && px < wall.x + wall.w + margin &&
         py > wall.y - margin && py < wall.y + wall.h + margin;
}

function collidesWithWalls(walls: ArenaData['walls'], x: number, y: number, margin: number): boolean {
  for (const wall of walls) {
    if (rectContains(wall, x, y, margin)) return true;
  }
  if (x < margin || x > ARENA_W - margin || y < margin || y > ARENA_H - margin) return true;
  return false;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
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

  constructor(callbacks: DemoCallbacks, zone = 'tomb_halls', playerClass?: PlayerClass) {
    this.callbacks = callbacks;
    this.zone = zone;
    this.playerClass = playerClass || 'reaver';
    this.arena = generateDungeonArena();

    const classDef = CLASS_DEFS[this.playerClass];

    // Init cooldowns map
    for (const ab of classDef.abilities) {
      this.abilityCooldowns[ab.id] = 0;
    }

    this.player = {
      x: 700, y: 500,
      hp: classDef.hp, maxHp: classDef.hp,
      stamina: classDef.stamina, maxStamina: classDef.stamina,
      stance: 'balanced',
      facing: 'down',
      buffs: [], debuffs: [],
      attackCooldown: 0,
      playerClass: this.playerClass,
      abilityCooldowns: { ...this.abilityCooldowns },
    };

    this.enemies = [
      // Entrance Hall guards
      this.makeEnemy('e1', 'Tomb Sentinel', 600, 500, 'guardian', 'shadow', 80, 40),
      this.makeEnemy('e2', 'Tomb Sentinel', 800, 500, 'guardian', 'holy', 80, 40),

      // North Tomb Chamber
      this.makeEnemy('e3', 'Ancient Warden', 690, 250, 'guardian', 'holy', 120, 50),
      this.makeEnemy('e4', 'Hollow Wraith', 580, 280, 'caster', 'ice', 55, 30),
      this.makeEnemy('e5', 'Hollow Wraith', 800, 280, 'caster', 'shadow', 55, 30),

      // West Mine Tunnels
      this.makeEnemy('e6', 'Bone Brute', 130, 350, 'brute', 'fire', 100, 40),
      this.makeEnemy('e7', 'Cave Stalker', 160, 500, 'assassin', 'shadow', 60, 35),

      // East Ritual Chamber
      this.makeEnemy('e8', 'Soul Leech', 1160, 480, 'caster', 'shadow', 65, 30),
      this.makeEnemy('e9', 'Crypt Horror', 1100, 350, 'brute', 'none', 110, 40),
      this.makeEnemy('e10', 'Dark Ritualist', 1200, 480, 'caster', 'fire', 70, 25),

      // Southwest Crypt
      this.makeEnemy('e11', 'Grave Stalker', 250, 800, 'assassin', 'shadow', 60, 40),
      this.makeEnemy('e12', 'Restless Dead', 200, 880, 'guardian', 'none', 75, 20),

      // Southeast Arena
      this.makeEnemy('e13', 'Pit Champion', 1100, 810, 'brute', 'fire', 140, 50),
      this.makeEnemy('e14', 'Arena Shade', 1200, 850, 'assassin', 'ice', 65, 45),
    ];

    this.resources = [
      // Entrance area
      this.makeResource('r1', 'iron_scraps', 'Iron Scraps', 580, 450, 'common'),
      this.makeResource('r2', 'herbs', 'Shadow Herbs', 820, 550, 'common'),

      // North tomb
      this.makeResource('r3', 'bone_dust', 'Bone Dust', 550, 130, 'common'),
      this.makeResource('r4', 'ancient_coins', 'Ancient Coins', 850, 130, 'rare'),

      // West mines
      this.makeResource('r5', 'dark_iron', 'Dark Iron', 80, 280, 'rare'),
      this.makeResource('r6', 'iron_scraps', 'Iron Scraps', 180, 550, 'common'),

      // East ritual chamber
      this.makeResource('r7', 'gems', 'Ritual Gems', 1160, 350, 'legendary'),
      this.makeResource('r8', 'ember_core', 'Ember Core', 1280, 500, 'rare'),

      // Southwest crypt
      this.makeResource('r9', 'bone_dust', 'Ancient Bones', 350, 860, 'common'),
      this.makeResource('r10', 'herbs', 'Tomb Moss', 140, 760, 'rare'),

      // Southeast arena
      this.makeResource('r11', 'ancient_coins', 'Champion\'s Hoard', 1100, 900, 'legendary'),
      this.makeResource('r12', 'cursed_steel', 'Cursed Steel', 960, 760, 'rare'),
    ];
  }

  private makeEnemy(id: string, name: string, x: number, y: number, archetype: string, element: string, maxHp: number, patrolRadius: number): DemoEnemy {
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

    // Handle stance change
    if (input.stanceChange) {
      this.player.stance = input.stanceChange;
      this.lastInput.stanceChange = null;
    }

    // Move player
    if (input.moveX !== 0 || input.moveY !== 0) {
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

    // Check victory
    const aliveEnemies = this.enemies.filter(e => e.state.hp > 0);
    if (aliveEnemies.length === 0) {
      this.stop();
      this.callbacks.onEnd('victory');
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
      speed: speed * 10, // arena units per tick
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
      if (proj.x < -50 || proj.x > ARENA_W + 50 || proj.y < -50 || proj.y > ARENA_H + 50) {
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
    const stanceMod = this.player.stance === 'aggressive' ? 1.35 :
                      this.player.stance === 'defensive' ? 0.7 :
                      this.player.stance === 'evasive' ? 0.9 : 1.0;
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

    if (d < effectiveAggro) {
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
      if (d < ENEMY_ATTACK_RANGE && enemy.attackCooldown <= 0) {
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

        let dmg = Math.round(ENEMY_ATTACK_DMG * defMod * this.getDamageReductionMultiplier() * (0.7 + Math.random() * 0.6));
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
      if (d < minDist) {
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
      },
      enemies: this.enemies.filter(e => e.state.hp > 0).map(e => ({ ...e.state })),
      resources: this.resources.map(r => ({ ...r })),
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
    });
  }
}
