import { Agent } from '../db/schema.js';
import { Mob } from '../world/zones.js';
import Database from 'better-sqlite3';
import { getSkillBonuses } from './skills.js';

export type ElementType = 'fire' | 'ice' | 'shadow' | 'holy' | 'none';

export interface CombatStats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
  element?: ElementType;
}

export interface CombatTurn {
  attacker: string;
  defender: string;
  damage: number;
  isCritical: boolean;
  elementMultiplier: number;
}

export interface CombatResult {
  winner: 'agent' | 'opponent';
  turns: CombatTurn[];
  agentDamageDealt: number;
  agentDamageTaken: number;
  xpGained: number;
  goldGained: number;
  itemsDropped: string[];
}

// Element effectiveness multipliers
const ELEMENT_CHART: Record<ElementType, Record<ElementType, number>> = {
  fire: { fire: 1.0, ice: 2.0, shadow: 1.0, holy: 0.5, none: 1.0 },
  ice: { fire: 0.5, ice: 1.0, shadow: 1.0, holy: 1.0, none: 1.0 },
  shadow: { fire: 1.0, ice: 1.0, shadow: 1.0, holy: 2.0, none: 1.2 },
  holy: { fire: 1.0, ice: 1.0, shadow: 2.0, holy: 1.0, none: 1.2 },
  none: { fire: 1.0, ice: 1.0, shadow: 1.0, holy: 1.0, none: 1.0 }
};

function getElementMultiplier(attackerElement: ElementType, defenderElement: ElementType): number {
  return ELEMENT_CHART[attackerElement]?.[defenderElement] || 1.0;
}

function calculateDamage(
  atk: number,
  def: number,
  elementMultiplier: number,
  isCritical: boolean
): number {
  const baseDamage = atk * elementMultiplier - def / 2;
  const randomVariance = Math.floor(Math.random() * 5) - 2; // -2 to +2
  const damage = Math.max(1, Math.floor(baseDamage + randomVariance));
  return isCritical ? Math.floor(damage * 1.5) : damage;
}

function rollCritical(luck: number): boolean {
  const critChance = Math.min(0.5, luck / 100); // Max 50% crit chance
  return Math.random() < critChance;
}

export function simulateCombat(
  agent: Agent,
  agentElement: ElementType,
  opponent: Mob | CombatStats,
  opponentName: string,
  db?: Database.Database
): CombatResult {
  const turns: CombatTurn[] = [];
  
  let agentHp = agent.hp;
  let agentAtk = agent.atk;
  let agentDef = agent.def;
  let agentSpd = agent.spd;
  let agentLuck = agent.luck;

  // Apply skill bonuses if database is provided
  if (db) {
    const skillBonuses = getSkillBonuses(db, agent.id);
    agentAtk = Math.floor(agentAtk * skillBonuses.atkMultiplier);
    agentDef = Math.floor(agentDef * skillBonuses.defMultiplier);
    agentHp += skillBonuses.hpBonus;
    agentLuck += skillBonuses.luckBonus;

    // Check for Berserker Rage
    if (skillBonuses.specialAbilities.includes('berserker_rage') && agent.hp < agent.max_hp * 0.3) {
      agentAtk = agentAtk * 2;
    }
  }

  let opponentHp = opponent.hp;
  const opponentAtk = opponent.atk;
  const opponentDef = opponent.def;
  const opponentSpd = opponent.spd;
  const opponentElement: ElementType = 'element' in opponent && opponent.element ? opponent.element : 'none';

  let agentDamageDealt = 0;
  let agentDamageTaken = 0;

  // Determine turn order (higher speed goes first)
  const agentGoesFirst = agentSpd >= opponentSpd;

  // Check for special abilities
  let firstStrikeCrit = false;
  let pickpocketBonus = 1.0;
  if (db) {
    const skillBonuses = getSkillBonuses(db, agent.id);
    if (skillBonuses.specialAbilities.includes('first_strike_crit')) {
      firstStrikeCrit = true;
    }
    // Note: poison_attacks ability exists but damage implementation is pending
    if (skillBonuses.specialAbilities.includes('bonus_gold')) {
      pickpocketBonus = 1.5;
    }
  }

  // Combat loop (max 50 turns to prevent infinite loops)
  let turnCount = 0;
  const maxTurns = 50;

  while (agentHp > 0 && opponentHp > 0 && turnCount < maxTurns) {
    turnCount++;

    const firstAttacker = agentGoesFirst ? 'agent' : 'opponent';
    const secondAttacker = agentGoesFirst ? 'opponent' : 'agent';

    // First attacker's turn
    if (firstAttacker === 'agent') {
      const isCrit = (turnCount === 1 && firstStrikeCrit) ? true : rollCritical(agentLuck);
      const elementMult = getElementMultiplier(agentElement, opponentElement);
      const damage = calculateDamage(agentAtk, opponentDef, elementMult, isCrit);
      
      opponentHp -= damage;
      agentDamageDealt += damage;
      
      turns.push({
        attacker: agent.name,
        defender: opponentName,
        damage,
        isCritical: isCrit,
        elementMultiplier: elementMult
      });

      if (opponentHp <= 0) break;
    } else {
      const isCrit = rollCritical('luck' in opponent ? opponent.luck : 5);
      const elementMult = getElementMultiplier(opponentElement, agentElement);
      const damage = calculateDamage(opponentAtk, agentDef, elementMult, isCrit);
      
      agentHp -= damage;
      agentDamageTaken += damage;
      
      turns.push({
        attacker: opponentName,
        defender: agent.name,
        damage,
        isCritical: isCrit,
        elementMultiplier: elementMult
      });

      if (agentHp <= 0) break;
    }

    // Second attacker's turn
    if (secondAttacker === 'agent') {
      const isCrit = (turnCount === 1 && firstStrikeCrit) ? true : rollCritical(agentLuck);
      const elementMult = getElementMultiplier(agentElement, opponentElement);
      const damage = calculateDamage(agentAtk, opponentDef, elementMult, isCrit);
      
      opponentHp -= damage;
      agentDamageDealt += damage;
      
      turns.push({
        attacker: agent.name,
        defender: opponentName,
        damage,
        isCritical: isCrit,
        elementMultiplier: elementMult
      });

      if (opponentHp <= 0) break;
    } else {
      const isCrit = rollCritical('luck' in opponent ? opponent.luck : 5);
      const elementMult = getElementMultiplier(opponentElement, agentElement);
      const damage = calculateDamage(opponentAtk, agentDef, elementMult, isCrit);
      
      agentHp -= damage;
      agentDamageTaken += damage;
      
      turns.push({
        attacker: opponentName,
        defender: agent.name,
        damage,
        isCritical: isCrit,
        elementMultiplier: elementMult
      });

      if (agentHp <= 0) break;
    }
  }

  const won = agentHp > 0;
  const mobOpponent = 'xp_reward' in opponent ? opponent as Mob : null;

  // Calculate rewards
  const xpGained = won && mobOpponent ? mobOpponent.xp_reward : 0;
  const goldGained = won && mobOpponent ? Math.floor(mobOpponent.gold_reward * pickpocketBonus) : 0;

  // Roll for item drops
  const itemsDropped: string[] = [];
  if (won && mobOpponent) {
    for (const drop of mobOpponent.drop_table) {
      if (Math.random() < drop.chance) {
        itemsDropped.push(drop.item);
      }
    }
  }

  return {
    winner: won ? 'agent' : 'opponent',
    turns,
    agentDamageDealt,
    agentDamageTaken,
    xpGained,
    goldGained,
    itemsDropped
  };
}

// Guild combat for world bosses
export function simulateGuildCombat(
  agents: Agent[],
  boss: Mob,
  bossName: string
): {
  damageByAgent: Record<number, number>;
  totalDamage: number;
  bossDefeated: boolean;
  casualties: number[];
  turns: CombatTurn[];
} {
  const turns: CombatTurn[] = [];
  const damageByAgent: Record<number, number> = {};
  const casualties: number[] = [];
  
  let bossHp = boss.hp;
  const agentHpMap: Record<number, number> = {};

  // Initialize HP tracking
  for (const agent of agents) {
    agentHpMap[agent.id] = agent.hp;
    damageByAgent[agent.id] = 0;
  }

  // Combat simulation (max 100 turns)
  let turnCount = 0;
  const maxTurns = 100;

  while (bossHp > 0 && Object.values(agentHpMap).some(hp => hp > 0) && turnCount < maxTurns) {
    turnCount++;

    // Each living agent attacks
    for (const agent of agents) {
      if (agentHpMap[agent.id] <= 0) continue;

      const isCrit = rollCritical(agent.luck);
      const elementMult = getElementMultiplier('none', boss.element || 'none');
      const damage = calculateDamage(agent.atk, boss.def, elementMult, isCrit);
      
      bossHp -= damage;
      damageByAgent[agent.id] += damage;
      
      turns.push({
        attacker: agent.name,
        defender: bossName,
        damage,
        isCritical: isCrit,
        elementMultiplier: elementMult
      });

      if (bossHp <= 0) break;
    }

    if (bossHp <= 0) break;

    // Boss attacks random living agent
    const livingAgents = agents.filter(a => agentHpMap[a.id] > 0);
    if (livingAgents.length === 0) break;

    const target = livingAgents[Math.floor(Math.random() * livingAgents.length)];
    const isCrit = rollCritical(5);
    const elementMult = getElementMultiplier(boss.element || 'none', 'none');
    const damage = calculateDamage(boss.atk, target.def, elementMult, isCrit);
    
    agentHpMap[target.id] -= damage;
    
    turns.push({
      attacker: bossName,
      defender: target.name,
      damage,
      isCritical: isCrit,
      elementMultiplier: elementMult
    });

    if (agentHpMap[target.id] <= 0) {
      casualties.push(target.id);
    }
  }

  return {
    damageByAgent,
    totalDamage: Object.values(damageByAgent).reduce((sum, dmg) => sum + dmg, 0),
    bossDefeated: bossHp <= 0,
    casualties,
    turns
  };
}

// PvP combat between two agents
export function simulatePvPCombat(
  agent1: Agent,
  agent2: Agent
): {
  winner: Agent;
  loser: Agent;
  turns: CombatTurn[];
  damageDealt: Record<number, number>;
} {
  const turns: CombatTurn[] = [];
  const damageDealt: Record<number, number> = {
    [agent1.id]: 0,
    [agent2.id]: 0
  };

  let hp1 = agent1.hp;
  let hp2 = agent2.hp;

  // Determine turn order
  const agent1GoesFirst = agent1.spd >= agent2.spd;

  let turnCount = 0;
  const maxTurns = 50;

  while (hp1 > 0 && hp2 > 0 && turnCount < maxTurns) {
    turnCount++;

    const firstAttacker = agent1GoesFirst ? agent1 : agent2;
    const secondAttacker = agent1GoesFirst ? agent2 : agent1;

    // First attacker
    {
      const isCrit = rollCritical(firstAttacker.luck);
      const damage = calculateDamage(firstAttacker.atk, secondAttacker.def, 1.0, isCrit);
      
      if (firstAttacker.id === agent1.id) {
        hp2 -= damage;
        damageDealt[agent1.id] += damage;
      } else {
        hp1 -= damage;
        damageDealt[agent2.id] += damage;
      }
      
      turns.push({
        attacker: firstAttacker.name,
        defender: secondAttacker.name,
        damage,
        isCritical: isCrit,
        elementMultiplier: 1.0
      });

      if ((firstAttacker.id === agent1.id && hp2 <= 0) || (firstAttacker.id === agent2.id && hp1 <= 0)) {
        break;
      }
    }

    // Second attacker
    {
      const isCrit = rollCritical(secondAttacker.luck);
      const damage = calculateDamage(secondAttacker.atk, firstAttacker.def, 1.0, isCrit);
      
      if (secondAttacker.id === agent1.id) {
        hp2 -= damage;
        damageDealt[agent1.id] += damage;
      } else {
        hp1 -= damage;
        damageDealt[agent2.id] += damage;
      }
      
      turns.push({
        attacker: secondAttacker.name,
        defender: firstAttacker.name,
        damage,
        isCritical: isCrit,
        elementMultiplier: 1.0
      });
    }
  }

  const winner = hp1 > 0 ? agent1 : agent2;
  const loser = hp1 > 0 ? agent2 : agent1;

  return { winner, loser, turns, damageDealt };
}
