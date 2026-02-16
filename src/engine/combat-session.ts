/**
 * Tactical turn-based combat system for The Hollows
 * Replaces the auto-battler with player-driven combat decisions
 */

import Database from 'better-sqlite3';
import { Agent } from '../db/schema.js';
import { Mob } from '../world/zones.js';
import { RngAuditor, secureRandom, secureRandomInt, secureChoice } from './crypto-rng.js';
import { getSkillBonuses, hasSkill } from './skills.js';
import { getEquippedStats } from './agent.js';

export type Stance = 'aggressive' | 'balanced' | 'defensive' | 'evasive';
export type ElementType = 'fire' | 'ice' | 'shadow' | 'holy' | 'none';
export type EnemyArchetype = 'brute' | 'guardian' | 'assassin' | 'caster' | 'boss';

export interface CombatAction {
  type: 'basic_attack' | 'ability' | 'consumable' | 'guard' | 'flee';
  abilityId?: string;
  itemCode?: string;
}

export interface AbilityState {
  id: string;
  name: string;
  description: string;
  staminaCost: number;
  cooldown: number;
  maxCooldown: number;
  multiplier: number;
  effect?: AbilityEffect;
}

export interface AbilityEffect {
  type: 'damage' | 'stun' | 'poison' | 'buff_atk' | 'buff_def' | 'heal' | 'riposte';
  value: number;
  duration?: number;
}

export interface StatusEffect {
  id?: string;
  name?: string;
  type: 'buff' | 'debuff' | 'buff_atk' | 'buff_def' | 'damage' | 'stun' | 'poison' | 'heal' | 'riposte';
  stat?: string;
  value: number;
  duration: number;
  damagePerTurn?: number;
}

export interface PlayerCombatState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
  element: ElementType;
  abilities: AbilityState[];
  buffs: StatusEffect[];
  debuffs: StatusEffect[];
  stunned: boolean;
  riposteActive: boolean;
  hasShield: boolean;
  specialAbilities?: string[];
}

export interface EnemyCombatState {
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
  element: ElementType;
  archetype: EnemyArchetype;
  abilities: AbilityState[];
  buffs: StatusEffect[];
  debuffs: StatusEffect[];
  stunned: boolean;
  bossPhase?: number;
}

export interface RoundResolution {
  round: number;
  playerStance: Stance;
  enemyStance: Stance;
  playerAction: CombatAction;
  enemyAction: CombatAction;
  stanceInteraction: string | null;
  turnOrder: 'player_first' | 'enemy_first' | 'simultaneous';
  playerDamageDealt: number;
  playerDamageTaken: number;
  enemyDamageDealt: number;
  enemyDamageTaken: number;
  events: string[];
  narrative: string;
  rngLog: any[];
}

export type EncounterType = 'mob' | 'gate_boss' | 'world_boss';

export interface CombatSession {
  id: string;
  agentId: number;
  playerState: PlayerCombatState;
  enemyState: EnemyCombatState;
  round: number;
  status: 'awaiting_input' | 'resolving' | 'victory' | 'defeat' | 'fled';
  roundHistory: RoundResolution[];
  createdAt: number;
  lastInputAt: number;
  timeoutCount: number;
  encounterType: EncounterType;
  targetZone?: string;
  gateId?: string;
  deadlineAt: number;
  playerStanceHistory: Stance[];
  consumablesUsed: string[];
}

// Combat configuration constants
export const COMBAT_CONFIG = {
  // Timing
  ROUND_TIMEOUT_SECONDS: 15,
  MAX_COMBAT_MINUTES: 15,
  AUTO_FLEE_AFTER_TIMEOUTS: 2,

  // Stamina
  BASE_MAX_STAMINA: 10,
  STAMINA_PER_LEVEL: 0.2,
  STAMINA_REGEN_PER_ROUND: 1,
  GUARD_BONUS_STAMINA: 3,

  // Stances - ITERATION 3: Final balance - middle ground between iter 1 & 2
  AGGRESSIVE_ATK_MOD: 1.35,    // Balanced: less dominant
  AGGRESSIVE_DEF_MOD: 0.8,
  AGGRESSIVE_CRIT_BONUS: 0.13, // Middle ground
  DEFENSIVE_ATK_MOD: 0.7,
  DEFENSIVE_DEF_MOD: 1.4,
  DEFENSIVE_BLOCK_CHANCE: 0.25,
  EVASIVE_ATK_MOD: 0.9,
  EVASIVE_DEF_MOD: 0.9,
  EVASIVE_BASE_DODGE: 0.30,
  EVASIVE_DODGE_PER_SPD: 0.04,
  EVASIVE_COUNTER_MULTIPLIER: 0.7,

  // Combat - ITERATION 3: Balanced defense/offense
  DAMAGE_VARIANCE: 0.10,       // Back to normal variance
  CRIT_MULTIPLIER: 1.6,        // Fewer crits but bigger payoff
  DEF_FACTOR: 0.85,            // Defense blocks more damage
  MAX_CRIT_CHANCE: 0.40,
  LUCK_CRIT_DIVISOR: 120,

  // Flee
  FLEE_BASE_CHANCE: 0.40,
  FLEE_SPD_FACTOR: 0.05,
  FLEE_MIN_CHANCE: 0.10,
  FLEE_MAX_CHANCE: 0.90,

  // Rest
  REST_COOLDOWN_MS: 300_000, // 5 minutes
  REST_HEAL_PERCENT: 0.25,

  // Shield
  SHIELD_BLOCK_BONUS: 0.15,

  // Guard
  GUARD_DEF_BONUS: 0.50,
};

// Element chart
const ELEMENT_CHART: Record<ElementType, Record<ElementType, number>> = {
  fire: { fire: 1.0, ice: 2.0, shadow: 1.0, holy: 0.5, none: 1.0 },
  ice: { fire: 0.5, ice: 1.0, shadow: 1.0, holy: 1.0, none: 1.0 },
  shadow: { fire: 1.0, ice: 1.0, shadow: 1.0, holy: 2.0, none: 1.2 },
  holy: { fire: 1.0, ice: 1.0, shadow: 2.0, holy: 1.0, none: 1.2 },
  none: { fire: 1.0, ice: 1.0, shadow: 1.0, holy: 1.0, none: 1.0 }
};

// Base abilities available to all players
const BASE_ABILITIES: AbilityState[] = [
  {
    id: 'power_strike',
    name: 'Power Strike',
    description: 'Deal 1.8× ATK damage',
    staminaCost: 3,
    cooldown: 0,
    maxCooldown: 2,
    multiplier: 1.8,
  },
  {
    id: 'shield_bash',
    name: 'Shield Bash',
    description: 'Deal 1.0× ATK and stun enemy for 1 round',
    staminaCost: 2,
    cooldown: 0,
    maxCooldown: 3,
    multiplier: 1.0,
    effect: { type: 'stun', value: 1, duration: 1 },
  },
];

// Skill-unlocked abilities
const SKILL_ABILITIES: { skillId: string; ability: AbilityState }[] = [
  {
    skillId: 'poison_blade',
    ability: {
      id: 'venom_slash',
      name: 'Venom Slash',
      description: '0.8× ATK + Poison (3 dmg/turn, 3 turns)',
      staminaCost: 2,
      cooldown: 0,
      maxCooldown: 2,
      multiplier: 0.8,
      effect: { type: 'poison', value: 3, duration: 3 },
    },
  },
  {
    skillId: 'berserker_rage',
    ability: {
      id: 'battle_cry',
      name: 'Battle Cry',
      description: '+30% ATK for 3 rounds',
      staminaCost: 4,
      cooldown: 0,
      maxCooldown: 5,
      multiplier: 0,
      effect: { type: 'buff_atk', value: 30, duration: 3 },
    },
  },
  {
    skillId: 'healing_light',
    ability: {
      id: 'heal',
      name: 'Heal',
      description: 'Restore 25% max HP',
      staminaCost: 5,
      cooldown: 0,
      maxCooldown: 4,
      multiplier: 0,
      effect: { type: 'heal', value: 0.25 },
    },
  },
  {
    skillId: 'shadow_meld',
    ability: {
      id: 'riposte',
      name: 'Riposte',
      description: 'Counter next hit for 1.5× damage',
      staminaCost: 2,
      cooldown: 0,
      maxCooldown: 2,
      multiplier: 0,
      effect: { type: 'riposte', value: 1.5 },
    },
  },
  {
    skillId: 'arcane_knowledge',
    ability: {
      id: 'arcane_bolt',
      name: 'Arcane Bolt',
      description: '1.6× ATK holy damage, ignores 30% DEF',
      staminaCost: 3,
      cooldown: 0,
      maxCooldown: 2,
      multiplier: 1.6,
      effect: { type: 'damage', value: 0.3 }, // value = DEF ignore %
    },
  },
  {
    skillId: 'iron_skin',
    ability: {
      id: 'fortify',
      name: 'Fortify',
      description: '+40% DEF for 2 rounds',
      staminaCost: 3,
      cooldown: 0,
      maxCooldown: 3,
      multiplier: 0,
      effect: { type: 'buff_def', value: 40, duration: 2 },
    },
  },
  {
    skillId: 'arcane_knowledge',
    ability: {
      id: 'elemental_burst',
      name: 'Elemental Burst',
      description: '2.0× ATK, double element bonus',
      staminaCost: 4,
      cooldown: 0,
      maxCooldown: 3,
      multiplier: 2.0,
      effect: { type: 'damage', value: 0 }, // special: double element handled in resolveAttack
    },
  },
  {
    skillId: 'silent_step',
    ability: {
      id: 'feint',
      name: 'Feint',
      description: "Reveal enemy's TRUE next stance",
      staminaCost: 1,
      cooldown: 0,
      maxCooldown: 1,
      multiplier: 0,
      effect: { type: 'reveal' as any, value: 0 },
    },
  },
];

// Active combat sessions (in-memory)
const activeSessions = new Map<string, CombatSession>();

/**
 * Create a new combat session
 */
export function createCombatSession(
  db: Database.Database,
  agent: Agent,
  enemy: Mob,
  agentElement: ElementType = 'none',
  partySize: number = 1
): CombatSession {
  const sessionId = `c_${Date.now()}_${secureRandomInt(1000, 9999)}`;

  // Calculate agent stats with skill bonuses
  let agentAtk = agent.atk;
  let agentDef = agent.def;
  let agentHp = agent.hp;
  let agentLuck = agent.luck;
  
  const skillBonuses = getSkillBonuses(db, agent.id);
  agentAtk = Math.floor(agentAtk * skillBonuses.atkMultiplier);
  agentDef = Math.floor(agentDef * skillBonuses.defMultiplier);
  agentHp += skillBonuses.hpBonus;
  agentLuck += skillBonuses.luckBonus;

  // Equipment bonuses
  const equipStats = getEquippedStats(db, agent.id);
  agentAtk += equipStats.atkBonus;
  agentDef += equipStats.defBonus;
  agentHp += equipStats.hpBonus;

  const maxStamina = Math.floor(COMBAT_CONFIG.BASE_MAX_STAMINA + agent.level * COMBAT_CONFIG.STAMINA_PER_LEVEL);

  // Check if agent has a shield equipped
  const hasShield = !!db.prepare(`
    SELECT 1 FROM inventory inv JOIN items i ON inv.item_code = i.code
    WHERE inv.agent_id = ? AND inv.equipped >= 1 AND i.category = 'shield'
  `).get(agent.id);

  // Scale mob HP for party: baseHp * (1 + 0.5 * (partySize - 1))
  const scaledEnemyHp = Math.floor(enemy.hp * (1 + 0.5 * (partySize - 1)));

  // Build enemy abilities based on archetype
  const archetype: EnemyArchetype = (enemy as any).archetype || 'brute';
  const enemyAbilities = getEnemyAbilities(archetype);

  const now = Date.now();
  const session: CombatSession = {
    id: sessionId,
    agentId: agent.id,
    playerState: {
      hp: agentHp,
      maxHp: agent.max_hp + skillBonuses.hpBonus + equipStats.hpBonus,
      stamina: maxStamina,
      maxStamina,
      atk: agentAtk,
      def: agentDef,
      spd: agent.spd,
      luck: agentLuck,
      element: agentElement,
      abilities: [
        ...BASE_ABILITIES.map(a => ({ ...a, cooldown: 0 })),
        ...SKILL_ABILITIES
          .filter(sa => hasSkill(db, agent.id, sa.skillId))
          .map(sa => ({ ...sa.ability, cooldown: 0 })),
      ],
      buffs: [],
      debuffs: [],
      stunned: false,
      riposteActive: false,
      hasShield,
      specialAbilities: skillBonuses.specialAbilities,
    },
    enemyState: {
      name: enemy.name,
      hp: scaledEnemyHp,
      maxHp: scaledEnemyHp,
      atk: enemy.atk,
      def: enemy.def,
      spd: enemy.spd,
      luck: 5,
      element: enemy.element || 'none',
      archetype,
      abilities: enemyAbilities,
      buffs: [],
      debuffs: [],
      stunned: false,
    },
    round: 1,
    status: 'awaiting_input',
    roundHistory: [],
    createdAt: now,
    lastInputAt: now,
    timeoutCount: 0,
    encounterType: 'mob',
    deadlineAt: now + COMBAT_CONFIG.ROUND_TIMEOUT_SECONDS * 1000,
    playerStanceHistory: [],
    consumablesUsed: [],
  };

  activeSessions.set(sessionId, session);
  return session;
}

/**
 * Get an active combat session
 */
export function getCombatSession(sessionId: string): CombatSession | null {
  return activeSessions.get(sessionId) || null;
}

/**
 * Find an active combat session by agent ID
 */
export function getCombatSessionByAgentId(agentId: number): CombatSession | null {
  for (const session of activeSessions.values()) {
    if (session.agentId === agentId && (session.status === 'awaiting_input' || session.status === 'resolving')) {
      return session;
    }
  }
  return null;
}

/**
 * Submit player's round input and resolve the round
 */
export function submitRoundAction(
  sessionId: string,
  stance: Stance,
  action: CombatAction
): RoundResolution | null {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'awaiting_input') {
    return null;
  }

  session.status = 'resolving';
  session.lastInputAt = Date.now();
  session.timeoutCount = 0;
  session.playerStanceHistory.push(stance);

  // Enemy AI decision (with pattern detection)
  const enemyStance = selectEnemyStance(session.enemyState, session.playerStanceHistory);
  const enemyAction = selectEnemyAction(session.enemyState);

  // Resolve round
  const resolution = resolveRound(session, stance, action, enemyStance, enemyAction);
  
  session.roundHistory.push(resolution);
  session.round++;

  // Update session status
  if (session.playerState.hp <= 0) {
    session.status = 'defeat';
  } else if (session.enemyState.hp <= 0) {
    session.status = 'victory';
  } else if (action.type === 'flee' && resolution.events.includes('fled')) {
    session.status = 'fled';
  } else {
    session.status = 'awaiting_input';
    session.deadlineAt = Date.now() + COMBAT_CONFIG.ROUND_TIMEOUT_SECONDS * 1000;
  }

  activeSessions.set(sessionId, session);
  return resolution;
}

/**
 * Handle round timeout (auto-submit defensive + basic attack)
 */
export function handleTimeout(sessionId: string): RoundResolution | null {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'awaiting_input') {
    return null;
  }

  session.timeoutCount++;
  
  const isBoss = session.encounterType === 'gate_boss' || session.encounterType === 'world_boss';
  
  // Boss encounters: auto defensive + guard (no auto-flee)
  if (isBoss) {
    return submitRoundAction(sessionId, 'defensive', { type: 'guard' });
  }
  
  // Auto-flee after consecutive timeouts for non-boss encounters
  if (session.timeoutCount >= COMBAT_CONFIG.AUTO_FLEE_AFTER_TIMEOUTS) {
    return submitRoundAction(sessionId, 'defensive', { type: 'flee' });
  }

  return submitRoundAction(sessionId, 'defensive', { type: 'basic_attack' });
}

/**
 * Get enemy abilities based on archetype
 */
function getEnemyAbilities(archetype: EnemyArchetype): AbilityState[] {
  switch (archetype) {
    case 'brute':
      return [{
        id: 'heavy_slam', name: 'Heavy Slam', description: '1.6x ATK damage',
        staminaCost: 0, cooldown: 0, maxCooldown: 2, multiplier: 1.6,
      }];
    case 'guardian':
      return [{
        id: 'shield_wall', name: 'Shield Wall', description: 'Block next hit, 3-round CD',
        staminaCost: 0, cooldown: 0, maxCooldown: 3, multiplier: 0,
        effect: { type: 'buff_def', value: 100, duration: 1 }, // Massive DEF boost = effective block
      }];
    case 'assassin':
      return [{
        id: 'backstab', name: 'Backstab', description: '2.0x ATK from evasive stance',
        staminaCost: 0, cooldown: 0, maxCooldown: 3, multiplier: 2.0,
      }];
    case 'caster':
      return [{
        id: 'dark_bolt', name: 'Dark Bolt', description: '1.5x shadow damage',
        staminaCost: 0, cooldown: 0, maxCooldown: 2, multiplier: 1.5,
      }];
    case 'boss':
      return [
        { id: 'enrage', name: 'Enrage', description: '+30% ATK buff',
          staminaCost: 0, cooldown: 0, maxCooldown: 5, multiplier: 1.0,
          effect: { type: 'buff_atk', value: 30, duration: 3 } },
        { id: 'death_strike', name: 'Death Strike', description: '3x ATK, ignores 50% DEF',
          staminaCost: 0, cooldown: 0, maxCooldown: 4, multiplier: 3.0 },
      ];
    default:
      return [];
  }
}

/**
 * Enemy AI: Select stance based on archetype with pattern detection and HP awareness
 */
function selectEnemyStance(enemy: EnemyCombatState, playerStanceHistory: Stance[] = []): Stance {
  if (enemy.stunned) return 'balanced';

  const roll = secureRandom();
  const hpPercent = enemy.hp / enemy.maxHp;

  // Pattern detection: if player used same stance 3 times in a row, counter it
  if (playerStanceHistory.length >= 3) {
    const last3 = playerStanceHistory.slice(-3);
    if (last3[0] === last3[1] && last3[1] === last3[2]) {
      const playerStance = last3[0];
      if (playerStance === 'aggressive') return 'defensive';
      if (playerStance === 'defensive') return 'aggressive';
      if (playerStance === 'evasive') return 'balanced';
      if (playerStance === 'balanced') return 'aggressive';
    }
  }
  
  switch (enemy.archetype) {
    case 'brute':
      // HP-aware: when low HP, go berserk
      if (hpPercent < 0.30) {
        return 'aggressive'; // Always aggressive when desperate
      }
      if (roll < 0.60) return 'aggressive';
      if (roll < 0.85) return 'balanced';
      return 'defensive';
    
    case 'guardian':
      // HP-aware: more defensive when low
      if (hpPercent < 0.30) {
        if (roll < 0.80) return 'defensive';
        return 'balanced';
      }
      if (roll < 0.20) return 'aggressive';
      if (roll < 0.50) return 'balanced';
      return 'defensive';
    
    case 'assassin':
      // HP-aware: try to flee when low
      if (hpPercent < 0.30) {
        if (roll < 0.50) return 'evasive'; // More evasive when desperate
        return 'aggressive'; // Or go all-in
      }
      if (roll < 0.30) return 'aggressive';
      if (roll < 0.40) return 'balanced';
      return 'evasive';
    
    case 'caster':
      if (hpPercent < 0.30) {
        if (roll < 0.60) return 'defensive';
        return 'evasive';
      }
      if (roll < 0.40) return 'aggressive';
      if (roll < 0.80) return 'balanced';
      return 'defensive';
    
    case 'boss':
      if (hpPercent > 0.60) {
        // Phase 1: normal
        return secureChoice(['aggressive', 'balanced', 'defensive'] as Stance[]);
      } else if (hpPercent > 0.30) {
        // Phase 2: more aggressive
        if (roll < 0.70) return 'aggressive';
        return 'balanced';
      } else {
        // Phase 3: enraged
        return 'aggressive';
      }
    
    default:
      return 'balanced';
  }
}

/**
 * Enemy AI: Select action with cooldown-aware ability usage and HP phases
 */
function selectEnemyAction(enemy: EnemyCombatState): CombatAction {
  if (enemy.stunned) {
    return { type: 'basic_attack' };
  }

  const roll = secureRandom();
  const hpPercent = enemy.hp / enemy.maxHp;
  
  // Boss phase-based abilities
  if (enemy.archetype === 'boss') {
    const enrage = enemy.abilities.find(a => a.id === 'enrage');
    const deathStrike = enemy.abilities.find(a => a.id === 'death_strike');
    
    if (hpPercent <= 0.30 && deathStrike && deathStrike.cooldown === 0) {
      // Phase 3: use Death Strike
      deathStrike.cooldown = deathStrike.maxCooldown;
      return { type: 'ability', abilityId: 'death_strike' };
    }
    if (hpPercent <= 0.60 && hpPercent > 0.30 && enrage && enrage.cooldown === 0 && roll < 0.5) {
      // Phase 2: use Enrage
      enrage.cooldown = enrage.maxCooldown;
      // Apply ATK buff
      const existingBuff = enemy.buffs.find(b => b.id === 'enrage_atk');
      if (!existingBuff) {
        enemy.buffs.push({
          id: 'enrage_atk', name: 'Enrage', type: 'buff', stat: 'atk',
          value: 30, duration: 3, damagePerTurn: 0,
        });
      } else {
        existingBuff.duration = 3;
      }
      return { type: 'ability', abilityId: 'enrage' };
    }
  }
  
  // Check for available abilities (cooldown-aware)
  // Bosses use abilities 60% of the time, regular enemies 35%
  const availableAbilities = enemy.abilities.filter(a => a.cooldown === 0 && a.id !== 'enrage' && a.id !== 'death_strike');
  const abilityChance = enemy.archetype === 'boss' ? 0.60 : 0.35;
  
  if (availableAbilities.length > 0 && roll < abilityChance) {
    const ability = secureChoice(availableAbilities);
    ability.cooldown = ability.maxCooldown;
    
    // Guardian Shield Wall: massive DEF buff (effectively blocks next hit)
    if (ability.id === 'shield_wall') {
      const existingBuff = enemy.buffs.find(b => b.stat === 'def');
      if (!existingBuff) {
        enemy.buffs.push({
          id: 'shield_wall_def', name: 'Shield Wall', type: 'buff', stat: 'def',
          value: 100, duration: 1, damagePerTurn: 0,
        });
      } else {
        existingBuff.duration = 1;
        existingBuff.value = 100;
      }
      return { type: 'guard' };
    }
    
    return { type: 'ability', abilityId: ability.id };
  }

  // Guardian guards more often
  if (enemy.archetype === 'guardian' && roll < 0.30) {
    return { type: 'guard' };
  }

  return { type: 'basic_attack' };
}

/**
 * Resolve a combat round
 */
function resolveRound(
  session: CombatSession,
  playerStance: Stance,
  playerAction: CombatAction,
  enemyStance: Stance,
  enemyAction: CombatAction
): RoundResolution {
  const rng = new RngAuditor();
  const events: string[] = [];
  let narrative = '';

  const player = session.playerState;
  const enemy = session.enemyState;

  // Determine turn order
  let turnOrder: 'player_first' | 'enemy_first' | 'simultaneous';
  if (player.spd > enemy.spd) {
    turnOrder = 'player_first';
  } else if (enemy.spd > player.spd) {
    turnOrder = 'enemy_first';
  } else {
    turnOrder = 'simultaneous';
  }

  // Check stance interactions
  const stanceInteraction = getStanceInteraction(playerStance, enemyStance);
  if (stanceInteraction) {
    events.push(stanceInteraction);
  }

  let playerDamageDealt = 0;
  let playerDamageTaken = 0;
  let enemyDamageDealt = 0;
  let enemyDamageTaken = 0;

  // Handle flee attempt
  if (playerAction.type === 'flee') {
    const fleeChance = calculateFleeChance(player.spd, enemy.spd);
    if (rng.rollChance('flee_attempt', fleeChance)) {
      events.push('fled');
      narrative = `You successfully fled from ${enemy.name}!`;
      return {
        round: session.round,
        playerStance,
        enemyStance,
        playerAction,
        enemyAction,
        stanceInteraction,
        turnOrder,
        playerDamageDealt: 0,
        playerDamageTaken: 0,
        enemyDamageDealt: 0,
        enemyDamageTaken: 0,
        events,
        narrative,
        rngLog: rng.getRolls(),
      };
    } else {
      events.push('flee_failed');
      // Enemy gets free hit
      const fleeHit = resolveAttack(
        enemy, player, 'aggressive', { type: 'basic_attack' },
        playerStance, rng, stanceInteraction
      );
      playerDamageTaken = fleeHit.damage;
      enemyDamageDealt = fleeHit.damage;
      events.push(...fleeHit.eventList);
      narrative = `Flee failed! ${enemy.name} strikes you as you attempt to escape. ${fleeHit.narr}`;
      player.hp -= fleeHit.damage;
      if (fleeHit.counterDamage > 0) {
        enemy.hp -= fleeHit.counterDamage;
        playerDamageDealt += fleeHit.counterDamage;
        enemyDamageTaken += fleeHit.counterDamage;
      }
      return {
        round: session.round,
        playerStance,
        enemyStance,
        playerAction,
        enemyAction,
        stanceInteraction,
        turnOrder,
        playerDamageDealt: 0,
        playerDamageTaken,
        enemyDamageDealt,
        enemyDamageTaken: 0,
        events,
        narrative,
        rngLog: rng.getRolls(),
      };
    }
  }

  // Handle consumable usage
  if (playerAction.type === 'consumable' && playerAction.itemCode === 'health_potion') {
    const healAmount = Math.floor(player.maxHp * 0.30);
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    events.push('used_potion');
    session.consumablesUsed.push('health_potion');
    narrative = `You drink a health potion and recover ${healAmount} HP. `;

    // Enemy still attacks
    const enemyResult = resolveAttack(
      enemy, player, enemyStance, enemyAction,
      playerStance, rng, stanceInteraction
    );
    playerDamageTaken = enemyResult.damage;
    enemyDamageDealt = enemyResult.damage;
    events.push(...enemyResult.eventList);
    player.hp -= enemyResult.damage;
    // Apply counter damage from player's dodge/riposte
    if (enemyResult.counterDamage > 0) {
      enemy.hp -= enemyResult.counterDamage;
      playerDamageDealt += enemyResult.counterDamage;
      enemyDamageTaken += enemyResult.counterDamage;
    }
    narrative += enemyResult.narr;

    // Apply status effects and cooldowns
    tickCooldowns(player);
    tickStatusEffects(player, events);
    tickStatusEffects(enemy, events);
    regenerateStamina(player, playerAction);
    if (player.stunned) {
      const stunEffect = player.buffs.find(b => b.stat === 'stun');
      if (stunEffect) {
        stunEffect.duration--;
        if (stunEffect.duration <= 0) {
          player.stunned = false;
          player.buffs = player.buffs.filter(b => b.stat !== 'stun');
        }
      } else {
        player.stunned = false;
      }
    }
    if (enemy.stunned) {
      const stunEffect = enemy.buffs.find(b => b.stat === 'stun');
      if (stunEffect) {
        stunEffect.duration--;
        if (stunEffect.duration <= 0) {
          enemy.stunned = false;
          enemy.buffs = enemy.buffs.filter(b => b.stat !== 'stun');
        }
      } else {
        enemy.stunned = false;
      }
    }

    return {
      round: session.round,
      playerStance,
      enemyStance,
      playerAction,
      enemyAction,
      stanceInteraction,
      turnOrder,
      playerDamageDealt: 0,
      playerDamageTaken,
      enemyDamageDealt,
      enemyDamageTaken: 0,
      events,
      narrative,
      rngLog: rng.getRolls(),
    };
  }

  // Execute actions based on turn order
  if (turnOrder === 'player_first') {
    // Player attacks first
    const playerResult = resolveAttack(
      player, enemy, playerStance, playerAction,
      enemyStance, rng, stanceInteraction
    );
    playerDamageDealt = playerResult.damage;
    enemyDamageTaken = playerResult.damage;
    events.push(...playerResult.eventList);
    enemy.hp -= playerResult.damage;
    // Apply counter damage from enemy's dodge/riposte back to player
    if (playerResult.counterDamage > 0) {
      player.hp -= playerResult.counterDamage;
      playerDamageTaken += playerResult.counterDamage;
      enemyDamageDealt += playerResult.counterDamage;
    }

    // Check if enemy died
    if (enemy.hp <= 0) {
      narrative = `${playerResult.narr} ${enemy.name} has been slain!`;
    } else {
      // Enemy attacks back
      const enemyResult = resolveAttack(
        enemy, player, enemyStance, enemyAction,
        playerStance, rng, stanceInteraction
      );
      playerDamageTaken += enemyResult.damage;
      enemyDamageDealt += enemyResult.damage;
      events.push(...enemyResult.eventList);
      player.hp -= enemyResult.damage;
      // Apply counter damage from player's dodge/riposte back to enemy
      if (enemyResult.counterDamage > 0) {
        enemy.hp -= enemyResult.counterDamage;
        playerDamageDealt += enemyResult.counterDamage;
        enemyDamageTaken += enemyResult.counterDamage;
      }

      narrative = `${playerResult.narr} ${enemyResult.narr}`;
    }
  } else {
    // Enemy attacks first (or simultaneous)
    const enemyResult = resolveAttack(
      enemy, player, enemyStance, enemyAction,
      playerStance, rng, stanceInteraction
    );
    playerDamageTaken = enemyResult.damage;
    enemyDamageDealt = enemyResult.damage;
    events.push(...enemyResult.eventList);
    player.hp -= enemyResult.damage;
    // Apply counter damage from player's dodge/riposte back to enemy
    if (enemyResult.counterDamage > 0) {
      enemy.hp -= enemyResult.counterDamage;
      playerDamageDealt += enemyResult.counterDamage;
      enemyDamageTaken += enemyResult.counterDamage;
    }

    // Check if player died
    if (player.hp <= 0) {
      narrative = `${enemyResult.narr} You have been defeated!`;
    } else {
      // Player attacks back
      const playerResult = resolveAttack(
        player, enemy, playerStance, playerAction,
        enemyStance, rng, stanceInteraction
      );
      playerDamageDealt += playerResult.damage;
      enemyDamageTaken += playerResult.damage;
      events.push(...playerResult.eventList);
      enemy.hp -= playerResult.damage;
      // Apply counter damage from enemy's dodge/riposte back to player
      if (playerResult.counterDamage > 0) {
        player.hp -= playerResult.counterDamage;
        playerDamageTaken += playerResult.counterDamage;
        enemyDamageDealt += playerResult.counterDamage;
      }

      if (enemy.hp <= 0) {
        narrative = `${enemyResult.narr} ${playerResult.narr} ${enemy.name} has been slain!`;
      } else {
        narrative = `${enemyResult.narr} ${playerResult.narr}`;
      }
    }
  }

  // Apply status effects and cooldowns
  tickCooldowns(player);
  tickStatusEffects(player, events);
  tickStatusEffects(enemy, events);
  
  // Stamina regeneration
  regenerateStamina(player, playerAction);

  // Decrement stun from status effects rather than clearing unconditionally
  if (player.stunned) {
    const stunEffect = player.buffs.find(b => b.stat === 'stun');
    if (stunEffect) {
      stunEffect.duration--;
      if (stunEffect.duration <= 0) {
        player.stunned = false;
        player.buffs = player.buffs.filter(b => b.stat !== 'stun');
      }
    } else {
      player.stunned = false;
    }
  }
  if (enemy.stunned) {
    const stunEffect = enemy.buffs.find(b => b.stat === 'stun');
    if (stunEffect) {
      stunEffect.duration--;
      if (stunEffect.duration <= 0) {
        enemy.stunned = false;
        enemy.buffs = enemy.buffs.filter(b => b.stat !== 'stun');
      }
    } else {
      enemy.stunned = false;
    }
  }

  return {
    round: session.round,
    playerStance,
    enemyStance,
    playerAction,
    enemyAction,
    stanceInteraction,
    turnOrder,
    playerDamageDealt,
    playerDamageTaken,
    enemyDamageDealt,
    enemyDamageTaken,
    events,
    narrative,
    rngLog: rng.getRolls(),
  };
}

/**
 * Resolve a single attack
 */
function resolveAttack(
  attacker: PlayerCombatState | EnemyCombatState,
  defender: PlayerCombatState | EnemyCombatState,
  attackerStance: Stance,
  attackerAction: CombatAction,
  defenderStance: Stance,
  rng: RngAuditor,
  stanceInteraction: string | null
): { damage: number; counterDamage: number; eventList: string[]; narr: string } {
  const events: string[] = [];
  let damage = 0;
  let narr = '';

  // Guard action
  if (attackerAction.type === 'guard') {
    narr = `${(attacker as any).name || 'You'} take${attacker === defender ? '' : 's'} a defensive stance.`;
    return { damage: 0, counterDamage: 0, eventList: events, narr };
  }

  // Support abilities (no damage, effect only)
  if (attackerAction.type === 'ability' && attackerAction.abilityId) {
    const supportAbil = (attacker as any).abilities?.find((a: AbilityState) => a.id === attackerAction.abilityId);
    if (supportAbil && supportAbil.multiplier === 0 && supportAbil.effect) {
      const selfEffects: string[] = ['heal', 'buff_atk', 'buff_def', 'riposte'];
      const effectTarget = selfEffects.includes(supportAbil.effect.type) ? attacker : defender;
      applyAbilityEffect(supportAbil.effect, effectTarget, events);
      narr = `${(attacker as any).name || 'You'} used ${supportAbil.name}!`;
      return { damage: 0, counterDamage: 0, eventList: events, narr };
    }
  }

  // Get stance modifiers
  const atkMod = getStanceAtkModifier(attackerStance);
  const defMod = getStanceDefModifier(defenderStance);

  // Check for dodge (evasive stance)
  if (defenderStance === 'evasive') {
    let dodgeChance = calculateDodgeChance(
      (defender as any).spd,
      (attacker as any).spd,
      attackerStance === 'balanced'
    );
    // evasion_boost skill (Silent Step): +10% dodge chance
    if ('specialAbilities' in defender && (defender as PlayerCombatState).specialAbilities?.includes('evasion_boost')) {
      dodgeChance = Math.min(0.60, dodgeChance + 0.10);
    }
    if (rng.rollChance('dodge', dodgeChance)) {
      events.push('dodged');
      narr = `${(defender as any).name || 'You'} dodge${defender !== attacker ? '' : ''} the attack!`;

      // Counter-attack on dodge
      const counterDamage = Math.max(1, Math.floor(
        (defender as any).atk * COMBAT_CONFIG.EVASIVE_COUNTER_MULTIPLIER
      ));
      events.push('counter');
      narr += ` Counter: ${counterDamage} damage!`;

      return { damage: 0, counterDamage, eventList: events, narr };
    }
  }

  // Check for block (defensive stance)
  if (defenderStance === 'defensive') {
    let blockChance = COMBAT_CONFIG.DEFENSIVE_BLOCK_CHANCE;
    if ('hasShield' in defender && (defender as PlayerCombatState).hasShield) {
      blockChance += COMBAT_CONFIG.SHIELD_BLOCK_BONUS;
    }
    if (rng.rollChance('block', blockChance)) {
      events.push('blocked');
      narr = `${(defender as any).name || 'You'} block${defender !== attacker ? '' : ''} the attack completely!`;
      return { damage: 0, counterDamage: 0, eventList: events, narr };
    }
  }

  // Check for riposte
  let riposteCounterDamage = 0;
  if ('riposteActive' in defender && (defender as PlayerCombatState).riposteActive) {
    (defender as PlayerCombatState).riposteActive = false;
    riposteCounterDamage = Math.max(1, Math.floor(getEffectiveAtk(defender) * 0.8));
    events.push('riposte_counter');
    narr = `Riposte! Counter for ${riposteCounterDamage} damage! `;
  }

  // Calculate damage with effective stats (buff-modified)
  const effectiveAtk = getEffectiveAtk(attacker);
  const effectiveDef = getEffectiveDef(defender);
  const actionMultiplier = getActionMultiplier(attackerAction, attacker);
  const attackerElement: ElementType = (attacker as any).element || 'none';
  const defenderElement: ElementType = (defender as any).element || 'none';
  let elementMult = ELEMENT_CHART[attackerElement]?.[defenderElement] || 1.0;
  
  // Elemental Burst: double the element bonus
  if (attackerAction.type === 'ability' && attackerAction.abilityId === 'elemental_burst' && elementMult > 1.0) {
    elementMult = 1.0 + (elementMult - 1.0) * 2; // e.g. 2.0 → 3.0
    events.push('elemental_burst');
  }
  
  let rawDamage = effectiveAtk * atkMod * actionMultiplier * elementMult;
  
  // Apply stance interaction bonus
  if (stanceInteraction === 'guard_break' && attackerStance === 'aggressive' && defenderStance === 'defensive') {
    rawDamage *= 1.5;
    events.push('guard_break');
  }

  // DEF ignore: Death Strike (50%), Arcane Bolt (30%), or any ability with damage effect
  const ability = attackerAction.type === 'ability' && attackerAction.abilityId
    ? (attacker as any).abilities?.find((a: AbilityState) => a.id === attackerAction.abilityId)
    : null;
  let defIgnore = 0;
  if (attackerAction.abilityId === 'death_strike') defIgnore = 0.5;
  else if (ability?.effect?.type === 'damage' && ability.effect.value) defIgnore = ability.effect.value;
  const defFactor = COMBAT_CONFIG.DEF_FACTOR * (1 - defIgnore);
  const defense = effectiveDef * defMod * defFactor;
  const mitigatedBase = rawDamage - defense;
  let mitigated = mitigatedBase;
  
  // Damage variance
  const variance = rng.roll('damage_variance') * 2 - 1; // -1 to +1
  mitigated += mitigated * variance * COMBAT_CONFIG.DAMAGE_VARIANCE;
  
  damage = Math.max(1, Math.floor(mitigated));

  // Critical hit check
  const baseCrit = Math.min(
    COMBAT_CONFIG.MAX_CRIT_CHANCE,
    (attacker as any).luck / COMBAT_CONFIG.LUCK_CRIT_DIVISOR
  );
  const critBonus = attackerStance === 'aggressive' ? COMBAT_CONFIG.AGGRESSIVE_CRIT_BONUS : 0;
  const critChance = baseCrit + critBonus;
  
  if (rng.rollChance('critical', critChance)) {
    damage = Math.floor(damage * COMBAT_CONFIG.CRIT_MULTIPLIER);
    events.push('critical');
    narr = `CRITICAL HIT! ${damage} damage!`;
  } else {
    narr = `${damage} damage.`;
  }

  // Apply ability effects
  if (attackerAction.type === 'ability' && attackerAction.abilityId) {
    const abil = (attacker as any).abilities?.find((a: AbilityState) => a.id === attackerAction.abilityId);
    if (abil?.effect) {
      // Self-targeting effects
      const selfEffects: string[] = ['heal', 'buff_atk', 'buff_def', 'riposte'];
      const effectTarget = selfEffects.includes(abil.effect.type) ? attacker : defender;
      applyAbilityEffect(abil.effect, effectTarget, events);
    }
  }

  return { damage, counterDamage: riposteCounterDamage, eventList: events, narr };
}

/**
 * Get action damage multiplier
 */
function getActionMultiplier(action: CombatAction, attacker: any): number {
  if (action.type === 'ability' && action.abilityId) {
    const ability = attacker.abilities?.find((a: AbilityState) => a.id === action.abilityId);
    return ability?.multiplier || 1.0;
  }
  return 1.0;
}

/**
 * Apply ability effect - full status effect system
 */
function applyAbilityEffect(
  effect: AbilityEffect,
  target: PlayerCombatState | EnemyCombatState,
  events: string[]
): void {
  if (effect.type === 'stun') {
    target.stunned = true;
    events.push('stunned');
  } else if (effect.type === 'poison') {
    const existing = target.debuffs.filter(d => (d.id || '').startsWith('poison'));
    if (existing.length < 3) {
      target.debuffs.push({
        id: `poison_${Date.now()}`, name: 'Poison', type: 'debuff',
        value: effect.value, duration: effect.duration || 3, damagePerTurn: effect.value,
      });
      events.push('poisoned');
    } else {
      // Refresh duration on oldest stack
      existing[0].duration = effect.duration || 3;
    }
  } else if (effect.type === 'buff_atk') {
    const existing = target.buffs.find(b => b.stat === 'atk');
    if (existing) {
      existing.duration = effect.duration || 3;
      existing.value = Math.max(existing.value, effect.value);
    } else {
      target.buffs.push({
        id: `atk_buff_${Date.now()}`, name: 'ATK Boost', type: 'buff', stat: 'atk',
        value: effect.value, duration: effect.duration || 3,
      });
    }
    events.push('atk_buffed');
  } else if (effect.type === 'buff_def') {
    const existing = target.buffs.find(b => b.stat === 'def');
    if (existing) {
      existing.duration = effect.duration || 2;
      existing.value = Math.max(existing.value, effect.value);
    } else {
      target.buffs.push({
        id: `def_buff_${Date.now()}`, name: 'DEF Boost', type: 'buff', stat: 'def',
        value: effect.value, duration: effect.duration || 2,
      });
    }
    events.push('def_buffed');
  } else if (effect.type === 'heal') {
    // value is a percentage of maxHP (0.25 = 25%)
    const maxHp = (target as any).maxHp || 100;
    const healAmount = Math.floor(maxHp * effect.value);
    (target as any).hp = Math.min(maxHp, (target as any).hp + healAmount);
    events.push(`healed_${healAmount}`);
  } else if (effect.type === 'riposte') {
    if ('riposteActive' in target) {
      (target as PlayerCombatState).riposteActive = true;
    }
    events.push('riposte_active');
  } else if ((effect as any).type === 'reveal') {
    // Feint: reveal enemy's next stance (pre-compute)
    // The actual enemy state is passed as target here, so we can predict
    const nextStance = selectEnemyStance(target as EnemyCombatState);
    events.push(`feint_reveal:${nextStance}`);
  }
}

/**
 * Calculate flee chance
 */
function calculateFleeChance(playerSpd: number, enemySpd: number): number {
  const chance = COMBAT_CONFIG.FLEE_BASE_CHANCE +
    (playerSpd - enemySpd) * COMBAT_CONFIG.FLEE_SPD_FACTOR;
  return Math.max(
    COMBAT_CONFIG.FLEE_MIN_CHANCE,
    Math.min(COMBAT_CONFIG.FLEE_MAX_CHANCE, chance)
  );
}

/**
 * Calculate dodge chance
 */
function calculateDodgeChance(
  defenderSpd: number,
  attackerSpd: number,
  attackerIsBalanced: boolean
): number {
  let chance = COMBAT_CONFIG.EVASIVE_BASE_DODGE +
    (defenderSpd - attackerSpd) * COMBAT_CONFIG.EVASIVE_DODGE_PER_SPD;
  
  // Balanced stance "tracks" evasive
  if (attackerIsBalanced) {
    chance *= 0.5;
  }
  
  return Math.max(0.05, Math.min(0.60, chance));
}

/**
 * Get stance interaction
 */
function getStanceInteraction(playerStance: Stance, enemyStance: Stance): string | null {
  if (playerStance === 'aggressive' && enemyStance === 'defensive') return 'guard_break';
  if (playerStance === 'defensive' && enemyStance === 'aggressive') return 'punish';
  if (playerStance === 'evasive' && enemyStance === 'balanced') return 'read';
  if (playerStance === 'balanced' && enemyStance === 'evasive') return 'track';
  return null;
}

/**
 * Get stance attack modifier
 */
function getStanceAtkModifier(stance: Stance): number {
  switch (stance) {
    case 'aggressive': return COMBAT_CONFIG.AGGRESSIVE_ATK_MOD;
    case 'defensive': return COMBAT_CONFIG.DEFENSIVE_ATK_MOD;
    case 'evasive': return COMBAT_CONFIG.EVASIVE_ATK_MOD;
    default: return 1.0;
  }
}

/**
 * Get stance defense modifier
 */
function getStanceDefModifier(stance: Stance): number {
  switch (stance) {
    case 'aggressive': return COMBAT_CONFIG.AGGRESSIVE_DEF_MOD;
    case 'defensive': return COMBAT_CONFIG.DEFENSIVE_DEF_MOD;
    case 'evasive': return COMBAT_CONFIG.EVASIVE_DEF_MOD;
    default: return 1.0;
  }
}

/**
 * Tick ability cooldowns
 */
function tickCooldowns(combatant: PlayerCombatState | EnemyCombatState): void {
  for (const ability of (combatant as any).abilities || []) {
    if (ability.cooldown > 0) {
      ability.cooldown--;
    }
  }
}

/**
 * Tick status effects - applies DoT, buffs, debuffs
 */
function tickStatusEffects(combatant: PlayerCombatState | EnemyCombatState, events: string[]): void {
  // Tick buffs
  for (let i = combatant.buffs.length - 1; i >= 0; i--) {
    const buff = combatant.buffs[i];
    // Regen effect
    if (buff.damagePerTurn && buff.damagePerTurn < 0) {
      const healAmt = Math.abs(buff.damagePerTurn);
      (combatant as any).hp = Math.min((combatant as any).maxHp, (combatant as any).hp + healAmt);
      events.push(`regen_${healAmt}`);
    }
    buff.duration--;
    if (buff.duration <= 0) {
      events.push(`buff_expired_${buff.name}`);
      combatant.buffs.splice(i, 1);
    }
  }
  
  // Tick debuffs (poison, bleed, burn)
  for (let i = combatant.debuffs.length - 1; i >= 0; i--) {
    const debuff = combatant.debuffs[i];
    if (debuff.damagePerTurn && debuff.damagePerTurn > 0) {
      (combatant as any).hp -= debuff.damagePerTurn;
      const name = (debuff.name || 'effect').toLowerCase();
      events.push(`${name}_tick_${debuff.damagePerTurn}`);
    }
    debuff.duration--;
    if (debuff.duration <= 0) {
      combatant.debuffs.splice(i, 1);
    }
  }
}

/**
 * Get effective ATK with buff modifiers
 */
function getEffectiveAtk(combatant: PlayerCombatState | EnemyCombatState): number {
  let atk = (combatant as any).atk;
  for (const buff of combatant.buffs) {
    if (buff.stat === 'atk') {
      atk = Math.floor(atk * (1 + buff.value / 100));
    }
  }
  return atk;
}

/**
 * Get effective DEF with buff modifiers
 */
function getEffectiveDef(combatant: PlayerCombatState | EnemyCombatState): number {
  let def = (combatant as any).def;
  for (const buff of combatant.buffs) {
    if (buff.stat === 'def') {
      def = Math.floor(def * (1 + buff.value / 100));
    }
  }
  return def;
}

/**
 * Regenerate stamina
 */
function regenerateStamina(player: PlayerCombatState, action: CombatAction): void {
  // Deduct stamina for abilities FIRST
  if (action.type === 'ability' && action.abilityId) {
    const ability = player.abilities.find(a => a.id === action.abilityId);
    if (ability) {
      player.stamina -= ability.staminaCost;
      ability.cooldown = ability.maxCooldown;
    }
  }

  // Then regenerate
  let regen = COMBAT_CONFIG.STAMINA_REGEN_PER_ROUND;
  if (action.type === 'guard') {
    regen += COMBAT_CONFIG.GUARD_BONUS_STAMINA;
  }
  player.stamina = Math.min(player.maxStamina, player.stamina + regen);
}

/**
 * End combat session and clean up
 */
export function endCombatSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

/**
 * Get all active sessions (for cleanup/debugging)
 */
export function getAllActiveSessions(): CombatSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Cleanup stale sessions (older than MAX_COMBAT_MINUTES)
 */
export function cleanupStaleSessions(): number {
  const now = Date.now();
  const maxAge = COMBAT_CONFIG.MAX_COMBAT_MINUTES * 60 * 1000;
  let cleaned = 0;
  
  for (const [id, session] of activeSessions.entries()) {
    if (now - session.createdAt > maxAge) {
      activeSessions.delete(id);
      cleaned++;
    }
  }
  
  return cleaned;
}
