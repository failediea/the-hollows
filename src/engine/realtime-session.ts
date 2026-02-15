/**
 * Real-time combat engine for The Hollows
 * Converts turn-based combat to real-time top-down action RPG with WebSocket support
 */

import Database from 'better-sqlite3';
import type { WebSocket } from 'ws';
import { Agent } from '../db/schema.js';
import { ZONES } from '../world/zones.js';
import { secureRandom, secureRandomInt, secureChance, secureChoice } from './crypto-rng.js';
import { getSkillBonuses, hasSkill } from './skills.js';
import { getEquippedStats, gainXp, addGold, addItemToInventory } from './agent.js';
import { generateLoot } from './loot.js';
import {
  COMBAT_CONFIG,
  type AbilityState,
  type StatusEffect,
  type Stance,
  type ElementType,
  type EnemyArchetype,
} from './combat-session.js';

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

type Facing = 'up' | 'down' | 'left' | 'right';
type AIState = 'idle' | 'patrol' | 'chase' | 'attack' | 'cooldown';

interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  facing: Facing;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  stance: Stance;
  element: ElementType;
  attackCooldown: number; // ticks remaining
  buffs: StatusEffect[];
  debuffs: StatusEffect[];
}

interface RealtimePlayer extends Entity {
  atk: number;
  def: number;
  spd: number;
  luck: number;
  abilities: AbilityState[];
  inputState: {
    moveX: number;
    moveY: number;
    attacking: boolean;
    abilitySlot: number | null;
    stanceChange: Stance | null;
  };
}

interface RealtimeEnemy extends Entity {
  id: string;
  mobId: string;
  name: string;
  archetype: EnemyArchetype;
  atk: number;
  def: number;
  spd: number;
  aiState: AIState;
  aiTarget: { x: number; y: number } | null;
  aggroRadius: number;
  attackRange: number;
  patrolOrigin: { x: number; y: number };
  patrolRadius: number;
}

interface ArenaState {
  width: number;
  height: number;
  walls: { x: number; y: number; w: number; h: number }[];
}

interface ResourceNode {
  id: string;
  resourceId: string;
  name: string;
  x: number;
  y: number;
  rarity: string;
  gatherTime: number; // seconds
  isGathered: boolean;
  gatheringBy: string | null;
  gatherProgress: number; // ticks
}

export interface RealtimeSession {
  id: string;
  agentId: number;
  ws: WebSocket | null;
  status: 'active' | 'victory' | 'defeat' | 'fled';
  arena: ArenaState;
  player: RealtimePlayer;
  enemies: RealtimeEnemy[];
  resources: ResourceNode[];
  tickRate: number; // 200ms = 5/s
  tickTimer: ReturnType<typeof setInterval> | null;
  tickCount: number;
  createdAt: number;
  zone: string;
  encounterType: string;
  db: Database.Database;
}

// ---------------------------------------------------------------------------
// Active sessions store
// ---------------------------------------------------------------------------

const activeRealtimeSessions = new Map<string, RealtimeSession>();

// ---------------------------------------------------------------------------
// Constants per archetype
// ---------------------------------------------------------------------------

const ARCHETYPE_SPEED: Record<EnemyArchetype, number> = {
  brute: 1.5,
  guardian: 1.2,
  assassin: 2.5,
  caster: 1.0,
  boss: 1.8,
};

const ARCHETYPE_AGGRO: Record<EnemyArchetype, number> = {
  brute: 150,
  guardian: 150,
  assassin: 200,
  caster: 180,
  boss: 250,
};

const ARCHETYPE_RANGE: Record<EnemyArchetype, number> = {
  brute: 25,
  guardian: 25,
  assassin: 22,
  caster: 80,
  boss: 30,
};

const ARCHETYPE_COOLDOWN: Record<EnemyArchetype, number> = {
  brute: 14,
  guardian: 18,
  assassin: 8,
  caster: 14,
  boss: 10,
};

// ---------------------------------------------------------------------------
// Arena generation
// ---------------------------------------------------------------------------

function generateArena(zone: string): ArenaState {
  const width = 800;
  const height = 600;
  const borderThickness = 10;

  // Border walls
  const walls: ArenaState['walls'] = [
    { x: 0, y: 0, w: width, h: borderThickness },               // top
    { x: 0, y: height - borderThickness, w: width, h: borderThickness }, // bottom
    { x: 0, y: 0, w: borderThickness, h: height },               // left
    { x: width - borderThickness, y: 0, w: borderThickness, h: height }, // right
  ];

  // 2-4 random interior obstacles, count slightly influenced by zone
  const obstacleCount = secureRandomInt(2, Math.min(4, 2 + zone.length % 3));
  for (let i = 0; i < obstacleCount; i++) {
    const w = secureRandomInt(30, 60);
    const h = secureRandomInt(30, 60);
    const x = secureRandomInt(80, width - 80 - w);
    const y = secureRandomInt(80, height - 80 - h);
    walls.push({ x, y, w, h });
  }

  return { width, height, walls };
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

export function createRealtimeSession(
  agentId: number,
  zone: string,
  encounterType: string,
  db: Database.Database,
): RealtimeSession {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  // Skill / equipment bonuses
  const skillBonuses = getSkillBonuses(db, agentId);
  const equipStats = getEquippedStats(db, agentId);

  let agentAtk = Math.floor(agent.atk * skillBonuses.atkMultiplier) + equipStats.atkBonus;
  let agentDef = Math.floor(agent.def * skillBonuses.defMultiplier) + equipStats.defBonus;
  const agentHp = agent.hp + skillBonuses.hpBonus + equipStats.hpBonus;
  const agentMaxHp = agent.max_hp + skillBonuses.hpBonus + equipStats.hpBonus;
  const agentLuck = agent.luck + skillBonuses.luckBonus;

  // Prevent unused-var warnings while keeping the mutable lets
  agentAtk = agentAtk;
  agentDef = agentDef;

  const maxStamina = Math.floor(COMBAT_CONFIG.BASE_MAX_STAMINA + agent.level * COMBAT_CONFIG.STAMINA_PER_LEVEL);
  const playerSpeed = 4.0 + agent.spd * 0.15;

  const arena = generateArena(zone);

  // Build player abilities
  const BASE_ABILITIES: AbilityState[] = [
    {
      id: 'power_strike', name: 'Power Strike', description: 'Deal 1.8x ATK damage',
      staminaCost: 3, cooldown: 0, maxCooldown: 2, multiplier: 1.8,
    },
    {
      id: 'shield_bash', name: 'Shield Bash', description: 'Deal 1.0x ATK and stun',
      staminaCost: 2, cooldown: 0, maxCooldown: 3, multiplier: 1.0,
      effect: { type: 'stun', value: 1, duration: 1 },
    },
  ];

  const SKILL_ABILITIES: { skillId: string; ability: AbilityState }[] = [
    {
      skillId: 'poison_blade',
      ability: {
        id: 'venom_slash', name: 'Venom Slash', description: '0.8x ATK + Poison',
        staminaCost: 2, cooldown: 0, maxCooldown: 2, multiplier: 0.8,
        effect: { type: 'poison', value: 3, duration: 3 },
      },
    },
    {
      skillId: 'berserker_rage',
      ability: {
        id: 'battle_cry', name: 'Battle Cry', description: '+30% ATK for 3 rounds',
        staminaCost: 4, cooldown: 0, maxCooldown: 5, multiplier: 0,
        effect: { type: 'buff_atk', value: 30, duration: 3 },
      },
    },
    {
      skillId: 'healing_light',
      ability: {
        id: 'heal', name: 'Heal', description: 'Restore 25% max HP',
        staminaCost: 5, cooldown: 0, maxCooldown: 4, multiplier: 0,
        effect: { type: 'heal', value: 0.25 },
      },
    },
  ];

  const abilities: AbilityState[] = [
    ...BASE_ABILITIES.map(a => ({ ...a, cooldown: 0 })),
    ...SKILL_ABILITIES
      .filter(sa => hasSkill(db, agentId, sa.skillId))
      .map(sa => ({ ...sa.ability, cooldown: 0 })),
  ];

  // Player spawns at center-bottom
  const player: RealtimePlayer = {
    x: arena.width / 2,
    y: arena.height - 80,
    vx: 0,
    vy: 0,
    radius: 16,
    facing: 'up',
    hp: agentHp,
    maxHp: agentMaxHp,
    stamina: maxStamina,
    maxStamina,
    stance: 'balanced',
    element: 'none',
    attackCooldown: 0,
    buffs: [],
    debuffs: [],
    atk: agentAtk,
    def: agentDef,
    spd: playerSpeed,
    luck: agentLuck,
    abilities,
    inputState: {
      moveX: 0,
      moveY: 0,
      attacking: false,
      abilitySlot: null,
      stanceChange: null,
    },
  };

  // Spawn enemies from zone mob pool
  const zoneConfig = ZONES[zone];
  const mobPool = zoneConfig?.mobs ?? [];
  const enemyCount = mobPool.length > 0 ? secureRandomInt(2, Math.min(4, mobPool.length + 1)) : 2;

  const enemies: RealtimeEnemy[] = [];
  for (let i = 0; i < enemyCount; i++) {
    const mob = mobPool.length > 0 ? secureChoice(mobPool) : null;
    const archetype: EnemyArchetype = (mob?.archetype as EnemyArchetype) || 'brute';

    // Random spawn near edges
    const edge = secureRandomInt(0, 3); // 0=top, 1=right, 2=left, 3=center-top
    let ex: number, ey: number;
    switch (edge) {
      case 0:
        ex = secureRandomInt(60, arena.width - 60);
        ey = secureRandomInt(40, 120);
        break;
      case 1:
        ex = secureRandomInt(arena.width - 150, arena.width - 60);
        ey = secureRandomInt(60, arena.height - 150);
        break;
      case 2:
        ex = secureRandomInt(60, 150);
        ey = secureRandomInt(60, arena.height - 150);
        break;
      default:
        ex = secureRandomInt(200, arena.width - 200);
        ey = secureRandomInt(60, 200);
        break;
    }

    enemies.push({
      id: `e_${i}_${secureRandomInt(1000, 9999)}`,
      mobId: mob?.id ?? 'shade',
      name: mob?.name ?? 'Hollow Shade',
      archetype,
      x: ex,
      y: ey,
      vx: 0,
      vy: 0,
      radius: archetype === 'boss' ? 24 : 16,
      facing: 'down',
      hp: mob?.hp ?? 50,
      maxHp: mob?.hp ?? 50,
      stamina: 10,
      maxStamina: 10,
      stance: 'balanced',
      element: (mob?.element as ElementType) || 'none',
      attackCooldown: 0,
      buffs: [],
      debuffs: [],
      atk: mob?.atk ?? 8,
      def: mob?.def ?? 3,
      spd: ARCHETYPE_SPEED[archetype],
      aiState: 'idle',
      aiTarget: null,
      aggroRadius: ARCHETYPE_AGGRO[archetype],
      attackRange: ARCHETYPE_RANGE[archetype],
      patrolOrigin: { x: ex, y: ey },
      patrolRadius: 60,
    });
  }

  // Spawn resource nodes from zone's resource pool
  const resourcePool = zoneConfig?.resources ?? [];
  const resources: ResourceNode[] = [];
  if (resourcePool.length > 0) {
    const resourceCount = secureRandomInt(2, Math.min(4, resourcePool.length) + 1);
    const chosen = [...resourcePool].sort(() => secureRandom() - 0.5).slice(0, resourceCount);
    for (let i = 0; i < chosen.length; i++) {
      const res = chosen[i];
      // Find a position not overlapping walls
      let rx: number, ry: number;
      let attempts = 0;
      do {
        rx = secureRandomInt(60, arena.width - 60);
        ry = secureRandomInt(60, arena.height - 60);
        attempts++;
      } while (attempts < 20 && arena.walls.some(w =>
        rx > w.x - 20 && rx < w.x + w.w + 20 && ry > w.y - 20 && ry < w.y + w.h + 20
      ));
      resources.push({
        id: `res_${i}_${secureRandomInt(1000, 9999)}`,
        resourceId: res.id,
        name: res.name,
        x: rx,
        y: ry,
        rarity: res.rarity,
        gatherTime: res.gather_time_seconds,
        isGathered: false,
        gatheringBy: null,
        gatherProgress: 0,
      });
    }
  }

  const sessionId = `rt_${Date.now()}_${secureRandomInt(1000, 9999)}`;

  const session: RealtimeSession = {
    id: sessionId,
    agentId,
    ws: null,
    status: 'active',
    arena,
    player,
    enemies,
    resources,
    tickRate: 200,
    tickTimer: null,
    tickCount: 0,
    createdAt: Date.now(),
    zone,
    encounterType,
    db,
  };

  activeRealtimeSessions.set(sessionId, session);
  return session;
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

export function startGameLoop(session: RealtimeSession): void {
  if (session.tickTimer) return;
  session.tickTimer = setInterval(() => tick(session), session.tickRate);
}

function tick(session: RealtimeSession): void {
  if (session.status !== 'active') {
    if (session.tickTimer) {
      clearInterval(session.tickTimer);
      session.tickTimer = null;
    }
    endSession(session, session.db);
    return;
  }

  session.tickCount++;

  processInput(session);
  processGathering(session);
  moveEntities(session);
  updateEnemyAI(session);
  resolveAttacks(session);
  applyEffects(session);
  checkDeath(session);
  broadcastState(session);
}

// ---------------------------------------------------------------------------
// Input processing
// ---------------------------------------------------------------------------

function processInput(session: RealtimeSession): void {
  const p = session.player;
  const input = p.inputState;

  // Stance change
  if (input.stanceChange) {
    p.stance = input.stanceChange;
    input.stanceChange = null;
  }

  // Movement velocity from input
  const speed = p.spd; // already computed as 2.5 + agent.spd * 0.1
  p.vx = input.moveX * speed;
  p.vy = input.moveY * speed;

  // Update facing based on movement direction
  if (Math.abs(input.moveX) > Math.abs(input.moveY)) {
    p.facing = input.moveX > 0 ? 'right' : 'left';
  } else if (Math.abs(input.moveY) > 0) {
    p.facing = input.moveY > 0 ? 'down' : 'up';
  }
}

// ---------------------------------------------------------------------------
// Resource gathering
// ---------------------------------------------------------------------------

function processGathering(session: RealtimeSession): void {
  const p = session.player;
  const input = p.inputState;

  // Check if player is trying to gather
  const wantsGather = (input as any).gather === true;

  // Check if player is in combat (enemies chasing/attacking them)
  const inCombat = session.enemies.some(e =>
    e.hp > 0 && (e.aiState === 'chase' || e.aiState === 'attack' || e.aiState === 'cooldown')
  );

  // Check if player is moving (WASD input)
  const isMoving = Math.abs(input.moveX) > 0.1 || Math.abs(input.moveY) > 0.1;

  // Find any resource currently being gathered by this player
  const currentlyGathering = session.resources.find(r => r.gatheringBy === 'player' && !r.isGathered);

  if (currentlyGathering) {
    // Cancel if moving or in combat
    if (isMoving || inCombat) {
      currentlyGathering.gatheringBy = null;
      currentlyGathering.gatherProgress = 0;
      sendEvent(session, 'gather_cancel', { resourceId: currentlyGathering.id });
      return;
    }

    // Increment progress
    currentlyGathering.gatherProgress++;
    const ticksNeeded = currentlyGathering.gatherTime * 5; // 5 ticks per second (200ms tick rate)

    if (currentlyGathering.gatherProgress >= ticksNeeded) {
      // Gathering complete
      currentlyGathering.isGathered = true;
      currentlyGathering.gatheringBy = null;
      addItemToInventory(session.db, session.agentId, currentlyGathering.resourceId, 1);
      sendEvent(session, 'gather', {
        resourceId: currentlyGathering.id,
        name: currentlyGathering.name,
        itemId: currentlyGathering.resourceId,
      });
    }

    // Freeze player movement while gathering
    p.vx = 0;
    p.vy = 0;
    return;
  }

  // Start new gathering
  if (wantsGather && !inCombat && !isMoving) {
    for (const res of session.resources) {
      if (res.isGathered || res.gatheringBy) continue;
      const dist = distanceBetween(p, res);
      if (dist < 30) {
        res.gatheringBy = 'player';
        res.gatherProgress = 0;
        sendEvent(session, 'gather_start', { resourceId: res.id, name: res.name });
        // Freeze movement
        p.vx = 0;
        p.vy = 0;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Movement & collision
// ---------------------------------------------------------------------------

function moveEntities(session: RealtimeSession): void {
  const arena = session.arena;

  // Move player
  moveEntity(session.player, arena);

  // Move enemies
  for (const enemy of session.enemies) {
    moveEntity(enemy, arena);
  }
}

function moveEntity(entity: Entity, arena: ArenaState): void {
  entity.x += entity.vx;
  entity.y += entity.vy;

  // Wall collision (rectangle vs circle)
  for (const wall of arena.walls) {
    resolveCircleRectCollision(entity, wall);
  }

  // Clamp to arena bounds
  entity.x = Math.max(entity.radius, Math.min(arena.width - entity.radius, entity.x));
  entity.y = Math.max(entity.radius, Math.min(arena.height - entity.radius, entity.y));

  // Friction
  entity.vx *= 0.8;
  entity.vy *= 0.8;
}

function resolveCircleRectCollision(
  entity: Entity,
  rect: { x: number; y: number; w: number; h: number },
): void {
  // Find closest point on rect to circle center
  const closestX = Math.max(rect.x, Math.min(entity.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(entity.y, rect.y + rect.h));

  const dx = entity.x - closestX;
  const dy = entity.y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq < entity.radius * entity.radius && distSq > 0) {
    const dist = Math.sqrt(distSq);
    const overlap = entity.radius - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    entity.x += nx * overlap;
    entity.y += ny * overlap;
    // Kill velocity along normal
    const dot = entity.vx * nx + entity.vy * ny;
    if (dot < 0) {
      entity.vx -= dot * nx;
      entity.vy -= dot * ny;
    }
  }
}

// ---------------------------------------------------------------------------
// Enemy AI
// ---------------------------------------------------------------------------

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function updateEnemyAI(session: RealtimeSession): void {
  const p = session.player;

  for (const enemy of session.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.attackCooldown > 0) enemy.attackCooldown--;

    const distToPlayer = distanceBetween(enemy, p);
    const distToOrigin = distanceBetween(enemy, enemy.patrolOrigin);
    const speed = enemy.spd;

    switch (enemy.aiState) {
      case 'idle': {
        // Wander randomly near patrol origin
        if (!enemy.aiTarget || distanceBetween(enemy, enemy.aiTarget) < 10) {
          enemy.aiTarget = {
            x: enemy.patrolOrigin.x + (secureRandom() - 0.5) * enemy.patrolRadius * 2,
            y: enemy.patrolOrigin.y + (secureRandom() - 0.5) * enemy.patrolRadius * 2,
          };
        }
        moveToward(enemy, enemy.aiTarget, speed * 0.3);

        // Aggro check
        if (distToPlayer < enemy.aggroRadius) {
          enemy.aiState = 'chase';
        }
        break;
      }

      case 'patrol': {
        // Same as idle for simplicity
        if (distToPlayer < enemy.aggroRadius) {
          enemy.aiState = 'chase';
        } else {
          enemy.aiState = 'idle';
        }
        break;
      }

      case 'chase': {
        moveToward(enemy, p, speed);

        // Leash check
        if (distToPlayer > enemy.aggroRadius * 2) {
          enemy.aiState = 'idle';
          enemy.aiTarget = null;
          break;
        }

        // Attack range check
        if (distToPlayer < enemy.attackRange) {
          if (enemy.attackCooldown <= 0) {
            enemy.aiState = 'attack';
          }
        }
        break;
      }

      case 'attack': {
        // Attack is resolved in resolveAttacks, transition to cooldown
        enemy.attackCooldown = ARCHETYPE_COOLDOWN[enemy.archetype];
        enemy.aiState = 'cooldown';
        break;
      }

      case 'cooldown': {
        if (enemy.attackCooldown <= 0) {
          if (distToPlayer < enemy.aggroRadius) {
            enemy.aiState = 'chase';
          } else if (distToOrigin > enemy.patrolRadius) {
            enemy.aiState = 'idle';
            enemy.aiTarget = null;
          } else {
            enemy.aiState = 'idle';
          }
        }
        break;
      }
    }
  }
}

function moveToward(entity: RealtimeEnemy, target: { x: number; y: number }, speed: number): void {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 1) {
    entity.vx = (dx / dist) * speed;
    entity.vy = (dy / dist) * speed;

    // Update facing
    if (Math.abs(dx) > Math.abs(dy)) {
      entity.facing = dx > 0 ? 'right' : 'left';
    } else {
      entity.facing = dy > 0 ? 'down' : 'up';
    }
  }
}

// ---------------------------------------------------------------------------
// Attack resolution
// ---------------------------------------------------------------------------

function getStanceAtkModifier(stance: Stance): number {
  switch (stance) {
    case 'aggressive': return COMBAT_CONFIG.AGGRESSIVE_ATK_MOD;
    case 'defensive': return COMBAT_CONFIG.DEFENSIVE_ATK_MOD;
    case 'evasive': return COMBAT_CONFIG.EVASIVE_ATK_MOD;
    default: return 1.0;
  }
}

function getStanceDefModifier(stance: Stance): number {
  switch (stance) {
    case 'aggressive': return COMBAT_CONFIG.AGGRESSIVE_DEF_MOD;
    case 'defensive': return COMBAT_CONFIG.DEFENSIVE_DEF_MOD;
    case 'evasive': return COMBAT_CONFIG.EVASIVE_DEF_MOD;
    default: return 1.0;
  }
}

function resolveAttacks(session: RealtimeSession): void {
  const p = session.player;

  // Player attack
  if (p.inputState.attacking && p.attackCooldown <= 0) {
    // Find closest enemy in range
    let closestEnemy: RealtimeEnemy | null = null;
    let closestDist = 35;
    for (const enemy of session.enemies) {
      if (enemy.hp <= 0) continue;
      const dist = distanceBetween(p, enemy);
      if (dist < closestDist) {
        closestDist = dist;
        closestEnemy = enemy;
      }
    }

    if (closestEnemy) {
      // Check if using an ability (Q=0, E=1)
      const abilityIdx = p.inputState.abilitySlot;
      const ability = (abilityIdx !== null && abilityIdx >= 0 && abilityIdx < p.abilities.length)
        ? p.abilities[abilityIdx] : null;

      // Ability validation: check cooldown and stamina
      const useAbility = ability && ability.cooldown <= 0 && p.stamina >= ability.staminaCost;

      if (ability && !useAbility) {
        // Ability not ready — send feedback
        if (ability.cooldown > 0) {
          sendEvent(session, 'ability_fail', { reason: 'cooldown', abilityId: ability.id });
        } else {
          sendEvent(session, 'ability_fail', { reason: 'stamina', abilityId: ability.id });
        }
        p.inputState.abilitySlot = null;
      }

      // Handle heal/buff abilities (no target needed)
      if (useAbility && ability!.effect && (ability!.effect.type === 'heal' || ability!.effect.type === 'buff_atk')) {
        p.stamina -= ability!.staminaCost;
        ability!.cooldown = ability!.maxCooldown;

        if (ability!.effect.type === 'heal') {
          const healAmt = Math.floor(p.maxHp * (ability!.effect.value as number));
          p.hp = Math.min(p.maxHp, p.hp + healAmt);
          sendEvent(session, 'heal', { amount: healAmt, abilityId: ability!.id });
        } else if (ability!.effect.type === 'buff_atk') {
          p.buffs.push({ ...ability!.effect, duration: ability!.effect.duration! });
          sendEvent(session, 'buff', { abilityId: ability!.id, effect: ability!.effect.type });
        }

        p.attackCooldown = 10;
        p.inputState.abilitySlot = null;
        return;
      }

      const atkMod = getStanceAtkModifier(p.stance);
      const defMod = getStanceDefModifier(closestEnemy.stance);
      const multiplier = useAbility ? ability!.multiplier : 1.0;
      const buffAtkBonus = p.buffs
        .filter(b => b.type === 'buff_atk')
        .reduce((sum, b) => sum + (b.value as number), 0);
      const raw = (p.atk + buffAtkBonus) * atkMod * multiplier;
      const defense = closestEnemy.def * defMod * COMBAT_CONFIG.DEF_FACTOR;
      let damage = Math.max(1, Math.floor(raw - defense));

      // Crit check
      const critChance = Math.min(
        COMBAT_CONFIG.MAX_CRIT_CHANCE,
        p.luck / COMBAT_CONFIG.LUCK_CRIT_DIVISOR,
      ) + (p.stance === 'aggressive' ? COMBAT_CONFIG.AGGRESSIVE_CRIT_BONUS : 0);
      let isCrit = false;
      if (secureRandom() < critChance) {
        damage = Math.floor(damage * COMBAT_CONFIG.CRIT_MULTIPLIER);
        isCrit = true;
      }

      // Dodge check for evasive enemies
      if (closestEnemy.stance === 'evasive') {
        const dodgeChance = COMBAT_CONFIG.EVASIVE_BASE_DODGE +
          (closestEnemy.spd - p.spd) * COMBAT_CONFIG.EVASIVE_DODGE_PER_SPD;
        if (secureRandom() < Math.max(0.05, Math.min(0.60, dodgeChance))) {
          sendEvent(session, 'dodge', { enemyId: closestEnemy.id });
          p.attackCooldown = 10;
          p.inputState.abilitySlot = null;
          return;
        }
      }

      // Apply ability cost
      if (useAbility) {
        p.stamina -= ability!.staminaCost;
        ability!.cooldown = ability!.maxCooldown;

        // Apply ability effects (stun, poison, etc.)
        if (ability!.effect) {
          if (ability!.effect.type === 'stun') {
            closestEnemy.attackCooldown = Math.max(closestEnemy.attackCooldown, (ability!.effect.duration ?? 1) * 5);
            closestEnemy.aiState = 'idle';
          } else if (ability!.effect.type === 'poison') {
            closestEnemy.debuffs = closestEnemy.debuffs || [];
            closestEnemy.debuffs.push({ ...ability!.effect, duration: ability!.effect.duration! });
          }
        }
        sendEvent(session, 'ability_use', { abilityId: ability!.id, abilityName: ability!.name });
      }

      closestEnemy.hp -= damage;
      p.attackCooldown = useAbility ? 12 : 10; // Abilities slightly slower

      sendEvent(session, 'damage', {
        source: 'player',
        targetId: closestEnemy.id,
        damage,
        crit: isCrit,
        ability: useAbility ? ability!.id : undefined,
      });

      p.inputState.abilitySlot = null;
    }
  }

  // Enemy attacks
  for (const enemy of session.enemies) {
    if (enemy.hp <= 0) continue;

    // Only enemies that just transitioned to 'cooldown' this tick from 'attack' deal damage
    // Since 'attack' transitions immediately to 'cooldown', we check cooldown === archetype cooldown
    if (enemy.aiState === 'cooldown' && enemy.attackCooldown === ARCHETYPE_COOLDOWN[enemy.archetype]) {
      const dist = distanceBetween(enemy, p);
      if (dist < enemy.attackRange + p.radius) {
        const atkMod = getStanceAtkModifier(enemy.stance);
        const defMod = getStanceDefModifier(p.stance);
        const raw = enemy.atk * atkMod;
        const defense = p.def * defMod * COMBAT_CONFIG.DEF_FACTOR;
        let damage = Math.max(1, Math.floor(raw - defense));

        // Block check if player is defensive
        if (p.stance === 'defensive') {
          if (secureChance(COMBAT_CONFIG.DEFENSIVE_BLOCK_CHANCE)) {
            sendEvent(session, 'block', { enemyId: enemy.id });
            continue;
          }
        }

        // Dodge check if player is evasive
        if (p.stance === 'evasive') {
          const dodgeChance = COMBAT_CONFIG.EVASIVE_BASE_DODGE +
            (p.spd - enemy.spd) * COMBAT_CONFIG.EVASIVE_DODGE_PER_SPD;
          if (secureChance(Math.max(0.05, Math.min(0.60, dodgeChance)))) {
            sendEvent(session, 'dodge', { source: 'player' });
            continue;
          }
        }

        // Crit check for enemy
        if (secureChance(0.1)) {
          damage = Math.floor(damage * COMBAT_CONFIG.CRIT_MULTIPLIER);
        }

        p.hp -= damage;
        sendEvent(session, 'damage', {
          source: enemy.id,
          targetId: 'player',
          damage,
          crit: false,
        });
      }
    }
  }

  // Decrement player attack cooldown
  if (p.attackCooldown > 0) p.attackCooldown--;

  // Tick ability cooldowns (1 per tick = 0.2s each)
  for (const ability of p.abilities) {
    if (ability.cooldown > 0) ability.cooldown--;
  }

  // Tick buff/debuff durations every 5 ticks (1 second)
  if (session.tickCount % 5 === 0) {
    p.buffs = p.buffs.filter(b => { b.duration!--; return b.duration! > 0; });
    // Apply poison damage to enemies
    for (const enemy of session.enemies) {
      if (enemy.hp <= 0) continue;
      if (enemy.debuffs && enemy.debuffs.length > 0) {
        enemy.debuffs = enemy.debuffs.filter(d => {
          if (d.type === 'poison' && d.duration! > 0) {
            enemy.hp -= d.value as number;
            sendEvent(session, 'damage', { source: 'poison', targetId: enemy.id, damage: d.value, crit: false });
          }
          d.duration!--;
          return d.duration! > 0;
        });
      }
    }
  }

  // Stamina regen (1 per second)
  if (session.tickCount % 5 === 0 && p.stamina < p.maxStamina) {
    p.stamina = Math.min(p.maxStamina, p.stamina + 1);
  }
}

// ---------------------------------------------------------------------------
// Status effects
// ---------------------------------------------------------------------------

function applyEffects(session: RealtimeSession): void {
  const p = session.player;

  // Every 5 ticks = 1 second
  if (session.tickCount % 5 !== 0) return;

  // Stamina regen
  p.stamina = Math.min(p.maxStamina, p.stamina + 1);

  // Tick player buffs/debuffs
  tickEffects(p);

  // Tick enemy buffs/debuffs
  for (const enemy of session.enemies) {
    if (enemy.hp > 0) tickEffects(enemy);
  }
}

function tickEffects(entity: Entity): void {
  // Buffs
  for (let i = entity.buffs.length - 1; i >= 0; i--) {
    entity.buffs[i].duration--;
    if (entity.buffs[i].duration <= 0) {
      entity.buffs.splice(i, 1);
    }
  }

  // Debuffs
  for (let i = entity.debuffs.length - 1; i >= 0; i--) {
    const debuff = entity.debuffs[i];
    if (debuff.damagePerTurn && debuff.damagePerTurn > 0) {
      entity.hp -= debuff.damagePerTurn;
    }
    debuff.duration--;
    if (debuff.duration <= 0) {
      entity.debuffs.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Death checks
// ---------------------------------------------------------------------------

function checkDeath(session: RealtimeSession): void {
  // Enemy deaths
  for (let i = session.enemies.length - 1; i >= 0; i--) {
    if (session.enemies[i].hp <= 0) {
      sendEvent(session, 'death', { enemyId: session.enemies[i].id, name: session.enemies[i].name });
      session.enemies.splice(i, 1);
    }
  }

  // All enemies dead = victory
  if (session.enemies.length === 0 && session.status === 'active') {
    session.status = 'victory';
  }

  // Player death
  if (session.player.hp <= 0 && session.status === 'active') {
    session.status = 'defeat';
  }
}

// ---------------------------------------------------------------------------
// State broadcast
// ---------------------------------------------------------------------------

function broadcastState(session: RealtimeSession): void {
  if (!session.ws) return;
  if (session.ws.readyState !== 1) return; // 1 = OPEN

  const payload = {
    type: 'state',
    data: {
      tick: session.tickCount,
      status: session.status,
      player: {
        x: session.player.x,
        y: session.player.y,
        hp: session.player.hp,
        maxHp: session.player.maxHp,
        stamina: session.player.stamina,
        maxStamina: session.player.maxStamina,
        stance: session.player.stance,
        facing: session.player.facing,
        attackCooldown: session.player.attackCooldown,
        abilities: session.player.abilities.map(a => ({
          id: a.id, name: a.name, cooldown: a.cooldown, maxCooldown: a.maxCooldown,
          staminaCost: a.staminaCost,
        })),
        gatheringResource: session.resources.find(r => r.gatheringBy === 'player' && !r.isGathered)?.resourceId || null,
      },
      enemies: session.enemies.map(e => ({
        id: e.id,
        mobId: e.mobId,
        name: e.name,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        archetype: e.archetype,
        element: e.element,
        aiState: e.aiState,
        facing: e.facing,
      })),
      arena: session.arena,
      zone: session.zone,
      resources: session.resources.map(r => ({
        id: r.id,
        resourceId: r.resourceId,
        name: r.name,
        x: r.x,
        y: r.y,
        rarity: r.rarity,
        gatherTime: r.gatherTime,
        isGathered: r.isGathered,
        gatheringBy: r.gatheringBy,
        gatherProgress: r.gatherProgress,
      })),
    },
  };

  try {
    session.ws.send(JSON.stringify(payload));
  } catch (_err) {
    // Connection dropped
  }
}

function sendEvent(session: RealtimeSession, event: string, data: Record<string, unknown>): void {
  if (!session.ws) return;
  if (session.ws.readyState !== 1) return;

  try {
    session.ws.send(JSON.stringify({ type: 'event', event, data }));
  } catch (_err) {
    // Connection dropped
  }
}

// ---------------------------------------------------------------------------
// Player input handling
// ---------------------------------------------------------------------------

export function handlePlayerInput(
  session: RealtimeSession,
  input: Record<string, unknown>,
): void {
  const p = session.player.inputState;

  if (typeof input.moveX === 'number') {
    p.moveX = Math.max(-1, Math.min(1, input.moveX));
  }
  if (typeof input.moveY === 'number') {
    p.moveY = Math.max(-1, Math.min(1, input.moveY));
  }
  if (typeof input.attacking === 'boolean') {
    p.attacking = input.attacking;
  }
  if (typeof input.abilitySlot === 'number' || input.abilitySlot === null) {
    p.abilitySlot = input.abilitySlot as number | null;
  }
  if (typeof input.gather === 'boolean') {
    (p as any).gather = input.gather;
  }
  const stanceVal = input.stanceChange ?? input.stance;
  if (typeof stanceVal === 'string') {
    const validStances: Stance[] = ['aggressive', 'balanced', 'defensive', 'evasive'];
    if (validStances.includes(stanceVal as Stance)) {
      p.stanceChange = stanceVal as Stance;
    }
  }
}

// ---------------------------------------------------------------------------
// Session end
// ---------------------------------------------------------------------------

let endingSessionIds = new Set<string>();

export function endSession(
  session: RealtimeSession,
  db: Database.Database,
): void {
  if (endingSessionIds.has(session.id)) return;
  endingSessionIds.add(session.id);

  // Stop game loop
  if (session.tickTimer) {
    clearInterval(session.tickTimer);
    session.tickTimer = null;
  }

  if (session.status === 'victory') {
    // Calculate XP and gold from zone mobs
    const zoneConfig = ZONES[session.zone];
    const baseMobs = zoneConfig?.mobs ?? [];
    // Sum up rewards based on number of enemies killed (original count)
    let totalXp = 0;
    let totalGold = 0;
    for (const mob of baseMobs) {
      totalXp += Math.floor(mob.xp_reward * 0.5);
      totalGold += Math.floor(mob.gold_reward * 0.5);
    }
    // At least some reward
    totalXp = Math.max(totalXp, 10);
    totalGold = Math.max(totalGold, 5);

    gainXp(db, session.agentId, totalXp);
    addGold(db, session.agentId, totalGold);

    // Generate loot drops
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(session.agentId) as any;
    const mobDef = baseMobs[0];
    const lootDrops = generateLoot(
      db,
      mobDef?.id || '',
      session.enemies[0]?.name || '',
      zoneConfig?.dangerLevel || 1,
      agent?.luck || 3,
      false,
    );
    const itemsDropped: string[] = [];
    for (const drop of lootDrops) {
      addItemToInventory(db, session.agentId, drop.itemCode, 1);
      itemsDropped.push(`${drop.itemName} (${drop.rarity})`);
    }

    // Update agent HP
    const finalHp = Math.max(1, session.player.hp);
    db.prepare('UPDATE agents SET hp = ? WHERE id = ?').run(finalHp, session.agentId);

    sendEnd(session, 'victory', { xpGained: totalXp, goldGained: totalGold, itemsDropped });
  } else if (session.status === 'defeat') {
    // Set HP to 0
    db.prepare('UPDATE agents SET hp = 0 WHERE id = ?').run(session.agentId);

    sendEnd(session, 'defeat', {});
  } else {
    // Fled or other
    const finalHp = Math.max(1, session.player.hp);
    db.prepare('UPDATE agents SET hp = ? WHERE id = ?').run(finalHp, session.agentId);

    sendEnd(session, 'fled', {});
  }

  activeRealtimeSessions.delete(session.id);
}

function sendEnd(session: RealtimeSession, result: string, rewards: Record<string, unknown>): void {
  if (!session.ws) return;
  if (session.ws.readyState !== 1) return;

  try {
    session.ws.send(JSON.stringify({ type: 'end', data: { result, rewards } }));
  } catch (_err) {
    // Connection dropped
  }
}

// ---------------------------------------------------------------------------
// Session lookup & cleanup
// ---------------------------------------------------------------------------

export function getRealtimeSession(sessionId: string): RealtimeSession | undefined {
  return activeRealtimeSessions.get(sessionId);
}

export function cleanupRealtimeSessions(): void {
  const now = Date.now();
  const maxAge = 15 * 60 * 1000; // 15 minutes

  for (const [id, session] of activeRealtimeSessions.entries()) {
    if (now - session.createdAt > maxAge) {
      if (session.tickTimer) {
        clearInterval(session.tickTimer);
        session.tickTimer = null;
      }
      if (session.ws) {
        try { session.ws.close(1000, 'Session expired'); } catch (_e) { /* ignore */ }
      }
      activeRealtimeSessions.delete(id);
    }
  }
}
