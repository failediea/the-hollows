import Database from 'better-sqlite3';
import { Agent } from '../db/schema.js';
import { ZONES } from '../world/zones.js';
import { CombatSession, RoundResolution, endCombatSession } from './combat-session.js';
import { gainXp, addGold, logActivity, addItemToInventory, moveZone, removeItemFromInventory } from './agent.js';
import { getMyParty, createLootRoll, refreshPartyMember } from './party.js';
import { generateLoot } from './loot.js';
import { trackQuestProgress } from './quests.js';

export interface CombatOutcomeResult {
  rewards?: {
    xpGained: number;
    goldGained: number;
    itemsDropped: string[];
    xpCapped: boolean;
    xpCappedMessage?: string;
  };
  partyRewards?: {
    totalXp: number;
    totalGold: number;
    xpPerMember: number;
    goldPerMember: number;
    livingMembers: number;
    partySize: number;
  };
  lootRoll?: any;
  questCompleted?: string;
  gateUnlocked?: boolean;
  newZone?: string;
  gateMessage?: string;
  permadeath?: boolean;
  message?: string;
  finalStats?: {
    name: string;
    level: number;
    goldLost: number;
    killedBy: string;
  };
}

/**
 * Process combat outcome after a round resolves to victory, defeat, or fled.
 * Handles XP/gold calculation, loot, party rewards, quest tracking, gate boss unlock, death, and flee.
 */
export function processCombatOutcome(
  db: Database.Database,
  session: CombatSession,
  updatedSession: CombatSession,
  resolution: RoundResolution
): CombatOutcomeResult {
  const result: CombatOutcomeResult = {};

  if (updatedSession.status === 'victory') {
    processVictory(db, session, updatedSession, resolution, result);
  } else if (updatedSession.status === 'defeat') {
    processDefeat(db, session, updatedSession, resolution, result);
  } else if (updatedSession.status === 'fled') {
    processFled(db, session, updatedSession, result);
  }

  // Deduct consumables used during combat
  if (updatedSession.consumablesUsed.length > 0) {
    for (const itemCode of updatedSession.consumablesUsed) {
      removeItemFromInventory(db, session.agentId, itemCode, 1);
    }
  }

  endCombatSession(updatedSession.id);
  return result;
}

function processVictory(
  db: Database.Database,
  session: CombatSession,
  updatedSession: CombatSession,
  resolution: RoundResolution,
  result: CombatOutcomeResult
): void {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(session.agentId) as Agent;
  const party = getMyParty(agent.id);
  const partySize = party ? party.members.length : 1;

  // Look up zone and mob definitions
  const zone = ZONES[agent.zone_id];
  const mobDef = zone?.mobs.find(m => m.name === updatedSession.enemyState.name);

  // Calculate mob effective level from position in zone mob list
  let mobEffectiveLevel = 1;
  if (zone && mobDef) {
    const zoneMinLevel = (zone.maxLevel || 10) - 9;
    const mobIndex = zone.mobs.indexOf(mobDef);
    mobEffectiveLevel = zoneMinLevel + Math.round(mobIndex * 9 / Math.max(1, zone.mobs.length - 1));
  }

  // XP penalty for outleveling mobs: 20% reduction per level over 3, 10% floor
  const levelDiff = agent.level - mobEffectiveLevel;
  const penalty = Math.min(0.9, Math.max(0, (levelDiff - 3) * 0.2));

  // Calculate base rewards using mob definition values
  let baseXp = Math.round((mobDef?.xp_reward ?? Math.floor(updatedSession.enemyState.maxHp * 0.5)) * (1 - penalty));
  let baseGold = Math.round((mobDef?.gold_reward ?? Math.floor(updatedSession.enemyState.maxHp * 0.3)) * (1 - penalty));

  // Zone XP cap check
  let xpCapped = false;
  if ((zone as any)?.maxLevel && agent.level >= (zone as any).maxLevel) {
    baseXp = 0;
    baseGold = 0;
    xpCapped = true;
  }

  // Generate loot via Treasure Class system
  const isBoss = updatedSession.encounterType === 'gate_boss' || updatedSession.encounterType === 'world_boss';
  const lootDrops = generateLoot(
    db,
    mobDef?.id || '',
    updatedSession.enemyState.name,
    zone?.dangerLevel || 1,
    updatedSession.playerState.luck,
    isBoss,
  );
  const itemsDropped = lootDrops.map(d => ({ name: d.itemName, code: d.itemCode, rarity: d.rarity }));

  // Distribute rewards based on party or solo
  let xpGained: number;
  let goldGained: number;
  let lootRollData = null;

  if (party && party.members.length > 1) {
    // Party rewards: split XP and gold among living members
    const livingMembers = party.members.filter(m => {
      const a = db.prepare('SELECT hp, is_dead FROM agents WHERE id = ?').get(m.agentId) as { hp: number; is_dead: boolean } | undefined;
      return a && a.hp > 0 && !a.is_dead;
    });
    const numLiving = Math.max(1, livingMembers.length);

    xpGained = Math.floor(baseXp / numLiving);
    goldGained = Math.floor(baseGold / numLiving);

    // Give XP/gold to all living party members
    for (const member of livingMembers) {
      gainXp(db, member.agentId, xpGained);
      addGold(db, member.agentId, goldGained);
      refreshPartyMember(db, member.agentId);
    }

    // Loot roll for items
    if (itemsDropped.length > 0) {
      const combatId = updatedSession.id;
      const participants = livingMembers.map(m => ({ id: m.agentId, name: m.agentName }));
      lootRollData = createLootRoll(combatId, itemsDropped, participants);

      // Award items to roll winners
      for (const item of lootRollData.items) {
        addItemToInventory(db, item.winnerId, item.itemCode, 1);
      }
    }

    result.partyRewards = {
      totalXp: baseXp,
      totalGold: baseGold,
      xpPerMember: xpGained,
      goldPerMember: goldGained,
      livingMembers: numLiving,
      partySize,
    };
  } else {
    // Solo rewards
    xpGained = baseXp;
    goldGained = baseGold;
    gainXp(db, agent.id, xpGained);
    addGold(db, agent.id, goldGained);

    // Give all items directly to solo player
    for (const item of itemsDropped) {
      addItemToInventory(db, agent.id, item.code, 1);
    }
  }

  // Set HP to what the combat session calculated (accounts for all rounds)
  const finalHp = Math.max(0, updatedSession.playerState.hp);
  db.prepare('UPDATE agents SET hp = ? WHERE id = ?').run(finalHp, agent.id);

  // Log combat
  db.prepare(`
    INSERT INTO combat_log (agent_id, opponent_type, opponent_name, zone_id, damage_dealt, damage_taken, xp_gained, gold_gained, won, created_at)
    VALUES (?, 'mob', ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    agent.id,
    updatedSession.enemyState.name,
    agent.zone_id,
    resolution.playerDamageDealt,
    resolution.playerDamageTaken,
    xpGained,
    goldGained,
    Date.now()
  );

  // Track quest progress for kill
  const mobId = mobDef?.id || '';
  const killEventType = isBoss ? 'gate_boss' as const : 'kill' as const;
  const questResult = trackQuestProgress(db, agent.id, agent.zone_id, killEventType, mobId);

  // Track quest progress for collected items (loot drops)
  for (const item of itemsDropped) {
    trackQuestProgress(db, agent.id, agent.zone_id, 'collect', item.code);
  }

  if (questResult?.questCompleted) {
    result.questCompleted = questResult.questName;
  }

  const partyMsg = party && party.members.length > 1 ? ` (party of ${partySize})` : '';
  logActivity(db, 'combat', `${agent.name}${partyMsg} defeated ${updatedSession.enemyState.name} (+${xpGained} XP, +${goldGained} gold)`, agent.name);

  result.rewards = {
    xpGained,
    goldGained,
    itemsDropped: itemsDropped.map(i => i.name),
    xpCapped,
    xpCappedMessage: xpCapped ? 'This zone holds nothing more for you. Descend deeper...' : undefined,
  };

  if (lootRollData) {
    result.lootRoll = lootRollData;
  }

  // Gate boss victory: unlock gate and move agent
  if (updatedSession.encounterType === 'gate_boss' && updatedSession.gateId && updatedSession.targetZone) {
    const season = db.prepare('SELECT id FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() as any;
    const seasonId = season?.id || 1;
    try {
      db.prepare(
        'INSERT OR IGNORE INTO zone_gate_unlocks (season_id, agent_id, gate_id, unlocked_at) VALUES (?, ?, ?, ?)'
      ).run(seasonId, agent.id, updatedSession.gateId, Date.now());
    } catch (_e) { /* already unlocked */ }

    moveZone(db, agent.id, updatedSession.targetZone);
    const targetZoneName = ZONES[updatedSession.targetZone]?.name || updatedSession.targetZone;
    logActivity(db, 'gate', `${agent.name} defeated ${updatedSession.enemyState.name} and unlocked passage to ${targetZoneName}!`, agent.name);

    result.gateUnlocked = true;
    result.newZone = updatedSession.targetZone;
    result.gateMessage = `Gate Boss defeated! Passage to ${targetZoneName} is now open!`;
  }
}

function processDefeat(
  db: Database.Database,
  session: CombatSession,
  updatedSession: CombatSession,
  resolution: RoundResolution,
  result: CombatOutcomeResult
): void {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(session.agentId) as Agent;

  // Set HP from combat session (0 on defeat = death)
  const finalHp = Math.max(0, updatedSession.playerState.hp);
  if (finalHp <= 0) {
    // Agent dies
    const goldLost = Math.floor(agent.gold * 0.5);
    db.prepare('UPDATE agents SET hp = 0, is_dead = 1, gold = gold - ? WHERE id = ?').run(goldLost, agent.id);
    const prestigeGained = agent.level * 10;
    db.prepare('UPDATE agents SET prestige_points = prestige_points + ? WHERE id = ?').run(prestigeGained, agent.id);
  } else {
    db.prepare('UPDATE agents SET hp = ? WHERE id = ?').run(finalHp, agent.id);
  }

  db.prepare(`
    INSERT INTO combat_log (agent_id, opponent_type, opponent_name, zone_id, damage_dealt, damage_taken, xp_gained, gold_gained, won, created_at)
    VALUES (?, 'mob', ?, ?, ?, ?, 0, 0, 0, ?)
  `).run(
    agent.id,
    updatedSession.enemyState.name,
    agent.zone_id,
    resolution.playerDamageDealt,
    resolution.playerDamageTaken,
    Date.now()
  );

  if (finalHp <= 0) {
    const goldLost = Math.floor(agent.gold * 0.5);
    logActivity(db, 'death', `${agent.name} was slain by ${updatedSession.enemyState.name} (lost ${goldLost} gold)`, agent.name);

    result.permadeath = true;
    result.message = `You have fallen. ${updatedSession.enemyState.name} has claimed your life. Your champion is permanently dead.`;
    result.finalStats = {
      name: agent.name,
      level: agent.level,
      goldLost,
      killedBy: updatedSession.enemyState.name,
    };
  }
}

function processFled(
  db: Database.Database,
  session: CombatSession,
  updatedSession: CombatSession,
  _result: CombatOutcomeResult
): void {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(session.agentId) as Agent;

  // Set HP from combat session state
  const fledHp = Math.max(0, updatedSession.playerState.hp);
  db.prepare('UPDATE agents SET hp = ? WHERE id = ?').run(fledHp, agent.id);
  logActivity(db, 'combat', `${agent.name} fled from ${updatedSession.enemyState.name}`, agent.name);
}
