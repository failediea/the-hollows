import Database from 'better-sqlite3';
import { Agent } from '../db/schema.js';
import { ZONES, getMobById } from '../world/zones.js';
import { simulateGuildCombat } from './combat.js';
import { trackQuestProgress } from './quests.js';
import {
  gainXp,
  addGold,
  takeDamage,
  rest,
  moveZone,
  addItemToInventory,
  updateLastAction,
  getTotalInventoryWeight,
  MAX_INVENTORY_WEIGHT,
  logActivity,
  equipItem,
  canCarryItem,
} from './agent.js';
import { useConsumable, craftItem, ITEM_MIN_LEVELS } from './items.js';
import { learnSkill, hasSkill } from './skills.js';
import { buyFromShop, sellToShop } from './economy.js';
import { findGate } from './gates.js';
import { 
  createGuild, 
  joinGuild, 
  leaveGuild,
  canEnterZone,
  getGuildMembers,
  distributeLoot
} from './guild.js';

// Tool requirements per resource (item_code or array of acceptable tool codes)
const RESOURCE_TOOLS: Record<string, string[]> = {
  torchwood: ['woodcutters_axe'],
  iron_scraps: ['pickaxe', 'mining_pick'],
  starsilver_ore: ['pickaxe', 'mining_pick'],
  dark_iron: ['pickaxe', 'mining_pick'],
  gems: ['pickaxe', 'mining_pick'],
  cursed_steel: ['pickaxe', 'mining_pick'],
  herbs: ['herbalist_sickle'],
  spider_silk: ['herbalist_sickle'],
  shadow_thread: ['herbalist_sickle'],
  venom_sac: ['herbalist_sickle'],
};

export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

export async function handleAction(
  db: Database.Database,
  agent: Agent,
  action: string,
  target?: string,
  params?: any
): Promise<ActionResult> {
  updateLastAction(db, agent.id);

  switch (action) {
    case 'move':
      return handleMove(db, agent, target);

    case 'attack':
      return await handleAttack(db, agent, params?.target);

    case 'gather':
      return handleGather(db, agent, params?.target);

    case 'rest': {
      // Rest cooldown: 5 minutes (2 minutes with Healing Light skill)
      const hasHealingLight = hasSkill(db, agent.id, 'healing_light');
      const REST_COOLDOWN_MS = hasHealingLight ? 4 * 60 * 1000 : 5 * 60 * 1000;
      const lastRestRow = db.prepare('SELECT last_rest_at FROM agents WHERE id = ?').get(agent.id) as { last_rest_at: number } | undefined;
      const lastRestAt = lastRestRow?.last_rest_at || 0;
      const elapsed = Date.now() - lastRestAt;
      if (elapsed < REST_COOLDOWN_MS && lastRestAt > 0) {
        const remainingMin = Math.ceil((REST_COOLDOWN_MS - elapsed) / 60000);
        return { success: false, message: `⏳ You must wait ${remainingMin} minute(s) before resting again.` };
      }
      rest(db, agent.id);
      db.prepare('UPDATE agents SET last_rest_at = ? WHERE id = ?').run(Date.now(), agent.id);
      return { success: true, message: `You rest and recover to full HP` };
    }

    case 'use_item':
      return handleUseItem(db, agent, params?.itemCode);

    case 'equip_item': {
      if (!params?.itemCode) return { success: false, message: 'Item code required' };
      const eqResult = equipItem(db, agent.id, params.itemCode);
      if (eqResult === true) return { success: true, message: `Equipped ${params.itemCode.replace(/_/g, ' ')}` };
      if (typeof eqResult === 'string') return { success: false, message: eqResult };
      return { success: false, message: 'Cannot equip that item' };
    }

    case 'unequip_item': {
      if (!params?.itemCode) return { success: false, message: 'Item code required' };
      const unequipResult = db.prepare('UPDATE inventory SET equipped = 0 WHERE agent_id = ? AND item_code = ? AND equipped = 1').run(agent.id, params.itemCode);
      if (unequipResult.changes > 0) return { success: true, message: `Unequipped ${params.itemCode.replace(/_/g, ' ')}` };
      return { success: false, message: 'Item not equipped' };
    }

    case 'craft':
      return handleCraft(db, agent, params?.itemCode);

    case 'buy':
      return handleBuy(db, agent, params?.itemCode, params?.quantity || 1);

    case 'sell':
      return handleSell(db, agent, params?.itemCode, params?.quantity || 1);

    case 'trade':
      return handleTrade(db, agent, params);

    case 'accept_trade':
      return handleAcceptTrade(db, agent, params?.tradeId);

    case 'reject_trade':
      return handleRejectTrade(db, agent, params?.tradeId);

    case 'cancel_trade':
      return handleCancelTrade(db, agent, params?.tradeId);

    case 'solve_riddle':
      return handleSolveRiddle(db, agent, params?.riddleId, params?.answer);

    case 'create_guild':
      return handleCreateGuild(db, agent, params?.name, params?.lootMode);

    case 'join_guild':
      return handleJoinGuild(db, agent, params?.guildId);

    case 'leave_guild':
      return leaveGuild(db, agent.id);

    case 'attack_ashborn':
      return handleAttackAshborn(db, agent);

    case 'learn_skill': {
      if (!params?.skillId) return { success: false, message: 'skillId required' };
      return learnSkill(db, agent.id, params.skillId);
    }

    case 'claim_quest': {
      if (!params?.questId) return { success: false, message: 'questId required' };
      const { claimQuestReward } = await import('./quests.js');
      return claimQuestReward(db, agent.id, params.questId);
    }

    // REVIVE ACTION REMOVED - Permadeath is permanent
    // Death means your champion is gone forever

    default:
      return { success: false, message: 'Unknown action' };
  }
}

// Minimum level required to enter each zone
const ZONE_LEVEL_REQUIREMENTS: Record<string, number> = {
  the_gate: 1,
  tomb_halls: 3,
  the_mines: 3,
  the_web: 6,
  forge_of_ruin: 7,
  bone_throne: 9,
  abyss_bridge: 10,
  black_pit: 1,
};

async function handleMove(db: Database.Database, agent: Agent, targetZoneId?: string): Promise<ActionResult> {
  if (!targetZoneId) {
    return { success: false, message: 'Target zone required' };
  }

  const zone = ZONES[targetZoneId];
  if (!zone) {
    return { success: false, message: 'Invalid zone' };
  }

  const currentZone = ZONES[agent.zone_id];
  if (!currentZone.connectedZones.includes(targetZoneId)) {
    return { success: false, message: 'Zones are not connected' };
  }

  // Check level requirement
  const requiredLevel = ZONE_LEVEL_REQUIREMENTS[targetZoneId] ?? 1;
  if (agent.level < requiredLevel) {
    return { 
      success: false, 
      message: `You must be level ${requiredLevel} to enter ${zone.name}. Current level: ${agent.level}` 
    };
  }

  // Check guild requirement
  if (zone.requiresGuildSize > 0) {
    const check = canEnterZone(db, agent.id, targetZoneId, zone.requiresGuildSize);
    if (!check.canEnter) {
      return { success: false, message: check.message };
    }
  }

  // Check for gate boss
  const gate = findGate(agent.zone_id, targetZoneId);
  if (gate) {
    // Check if already unlocked
    const season = db.prepare('SELECT id FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() as any;
    const seasonId = season?.id || 1;
    const unlock = db.prepare(
      'SELECT id FROM zone_gate_unlocks WHERE season_id = ? AND agent_id = ? AND gate_id = ?'
    ).get(seasonId, agent.id, gate.gate_id);

    if (!unlock) {
      // Gate is locked - check level requirement
      if (agent.level < gate.required_level) {
        return {
          success: false,
          message: `You must be level ${gate.required_level} to challenge the gate boss ${gate.boss_mob.name}. Current level: ${agent.level}`,
        };
      }

      // Start gate-boss combat session
      const { createCombatSession } = await import('./combat-session.js');
      const session = createCombatSession(db, agent, gate.boss_mob, 'none', 1);
      session.encounterType = 'gate_boss';
      session.targetZone = targetZoneId;
      session.gateId = gate.gate_id;

      logActivity(db, 'combat', `${agent.name} challenged gate boss ${gate.boss_mob.name}!`, agent.name);

      return {
        success: true,
        message: `⚔️ A powerful guardian blocks your path! ${gate.boss_mob.name} stands between you and ${zone.name}. Defeat it to unlock passage!`,
        data: {
          combatId: session.id,
          gateBoss: true,
          enemy: {
            name: session.enemyState.name,
            hp: session.enemyState.hp,
            maxHp: session.enemyState.maxHp,
            element: session.enemyState.element,
            archetype: session.enemyState.archetype,
          },
          agent: {
            hp: session.playerState.hp,
            maxHp: session.playerState.maxHp,
            stamina: session.playerState.stamina,
            maxStamina: session.playerState.maxStamina,
            element: session.playerState.element,
            abilities: session.playerState.abilities.map(a => ({
              id: a.id, name: a.name, description: a.description,
              staminaCost: a.staminaCost, cooldown: a.cooldown, maxCooldown: a.maxCooldown,
            })),
          },
          round: session.round,
          status: session.status,
          timeoutSeconds: 30,
          deadlineAt: session.deadlineAt,
          targetZone: targetZoneId,
        },
      };
    }
  }

  moveZone(db, agent.id, targetZoneId);
  logActivity(db, 'move', `${agent.name} entered ${zone.name}`, agent.name);
  return { 
    success: true, 
    message: `Moved to ${zone.name}`,
    data: { zone: targetZoneId }
  };
}

async function handleAttack(db: Database.Database, agent: Agent, targetMobId?: string): Promise<ActionResult> {
  if (!targetMobId) {
    return { success: false, message: 'You must choose a target to attack. View the zone\'s monsters first.' };
  }

  const mob = getMobById(targetMobId);
  if (!mob) {
    return { success: false, message: 'Invalid target. That enemy doesn\'t exist.' };
  }

  // Validate the mob is in the player's current zone
  const zone = ZONES[agent.zone_id];
  if (!zone || !zone.mobs.some(m => m.id === targetMobId)) {
    return { success: false, message: 'That enemy is not in your current zone.' };
  }

  if (hasSkill(db, agent.id, 'silent_step') && Math.random() < 0.25) {
    logActivity(db, 'combat', `${agent.name} used Silent Step to avoid combat with ${mob.name}`, agent.name);
    return {
      success: true,
      message: `You silently avoided combat with ${mob.name}!`,
      data: { avoided: true }
    };
  }

  // Create tactical combat session (with party HP scaling)
  const { createCombatSession } = await import('./combat-session.js');
  const { getMyParty } = await import('./party.js');
  const party = getMyParty(agent.id);
  const partySize = party ? party.members.length : 1;
  const session = createCombatSession(db, agent, mob, 'none', partySize);

  logActivity(db, 'combat', `${agent.name} engaged ${mob.name} in combat`, agent.name);

  return {
    success: true,
    message: `You engage ${mob.name} in combat! Choose your stance and action.`,
    data: {
      combatId: session.id,
      enemy: {
        name: session.enemyState.name,
        hp: session.enemyState.hp,
        maxHp: session.enemyState.maxHp,
        element: session.enemyState.element,
        archetype: session.enemyState.archetype,
        tier: 'common',
      },
      agent: {
        hp: session.playerState.hp,
        maxHp: session.playerState.maxHp,
        stamina: session.playerState.stamina,
        maxStamina: session.playerState.maxStamina,
        element: session.playerState.element,
        abilities: session.playerState.abilities.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          staminaCost: a.staminaCost,
          cooldown: a.cooldown,
          maxCooldown: a.maxCooldown,
        })),
        consumables: (() => {
          const potionRow = db.prepare('SELECT quantity FROM inventory WHERE agent_id = ? AND item_code = ?')
            .get(agent.id, 'health_potion') as { quantity: number } | undefined;
          const potionCount = potionRow?.quantity || 0;
          return potionCount > 0 ? [{ itemCode: 'health_potion', name: 'Health Potion', quantity: potionCount }] : [];
        })()
      },
      round: session.round,
      status: session.status,
      timeoutSeconds: 30,
    }
  };
}

function handleGather(db: Database.Database, agent: Agent, targetResource?: string): ActionResult {
  const zone = ZONES[agent.zone_id];
  if (!zone || zone.resources.length === 0) {
    return { success: false, message: 'No resources to gather here' };
  }

  const resource = targetResource
    ? zone.resources.find(r => r.id === targetResource) || zone.resources[Math.floor(Math.random() * zone.resources.length)]
    : zone.resources[Math.floor(Math.random() * zone.resources.length)];

  // Check cooldown using gather_time_seconds
  const lastGatherRow = db.prepare('SELECT last_gather_at FROM agents WHERE id = ?').get(agent.id) as { last_gather_at: number } | undefined;
  const lastGatherAt = lastGatherRow?.last_gather_at || 0;
  const cooldownMs = resource.gather_time_seconds * 1000;
  const elapsed = Date.now() - lastGatherAt;
  if (elapsed < cooldownMs && lastGatherAt > 0) {
    const remainingSec = Math.ceil((cooldownMs - elapsed) / 1000);
    return { success: false, message: `⏳ Gathering cooldown: ${remainingSec}s remaining`, data: { cooldownRemaining: remainingSec } };
  }

  // Check tool requirement
  const requiredTools = RESOURCE_TOOLS[resource.id];
  if (requiredTools) {
    const inventory = db.prepare('SELECT item_code FROM inventory WHERE agent_id = ? AND quantity > 0')
      .all(agent.id) as { item_code: string }[];
    const ownedCodes = new Set(inventory.map(i => i.item_code));
    const hasTool = requiredTools.some(tool => ownedCodes.has(tool));
    if (!hasTool) {
      const toolName = requiredTools[0].replace(/_/g, ' ');
      return { success: false, message: `🔧 You need a ${toolName} to gather ${resource.name}. Buy one from the shop!` };
    }
  }

  // Always yield exactly 1
  const quantity = 1;

  // Get current weight and max weight
  const currentWeight = getTotalInventoryWeight(db, agent.id);
  const item = db.prepare('SELECT weight FROM items WHERE code = ?').get(resource.id) as { weight: number } | null;
  const additionalWeight = item ? item.weight * quantity : 0;

  const success = addItemToInventory(db, agent.id, resource.id, quantity);

  if (!success) {
    return {
      success: false,
      message: `Inventory full! Current weight: ${currentWeight}/${MAX_INVENTORY_WEIGHT}. This item would add ${additionalWeight} weight.`
    };
  }

  // Update last_gather_at
  db.prepare('UPDATE agents SET last_gather_at = ? WHERE id = ?').run(Date.now(), agent.id);

  // Track quest progress
  const questResult = trackQuestProgress(db, agent.id, agent.zone_id, 'gather', resource.id, quantity);

  return {
    success: true,
    message: `Gathered ${quantity}x ${resource.name}${questResult?.questCompleted ? ` — 🎉 Quest "${questResult.questName}" complete!` : ''}`,
    data: { itemCode: resource.id, quantity, questCompleted: questResult?.questCompleted, cooldownSeconds: resource.gather_time_seconds }
  };
}

function handleUseItem(db: Database.Database, agent: Agent, itemCode?: string): ActionResult {
  if (!itemCode) {
    return { success: false, message: 'Item code required' };
  }

  return useConsumable(db, agent.id, itemCode);
}

function handleCraft(db: Database.Database, agent: Agent, itemCode?: string): ActionResult {
  if (!itemCode) {
    return { success: false, message: 'Item code required' };
  }

  // Craft anywhere

  const result = craftItem(db, agent.id, itemCode);
  if (result.success) {
    const questResult = trackQuestProgress(db, agent.id, agent.zone_id, 'craft', itemCode);
    if (questResult?.questCompleted) {
      result.message += ` — 🎉 Quest "${questResult.questName}" complete!`;
    }
  }
  return result;
}

function handleBuy(db: Database.Database, agent: Agent, itemCode?: string, quantity?: number): ActionResult {
  if (!itemCode) {
    return { success: false, message: 'Item code required' };
  }

  return buyFromShop(db, agent.id, itemCode, quantity || 1);
}

function handleSell(db: Database.Database, agent: Agent, itemCode?: string, quantity?: number): ActionResult {
  if (!itemCode) {
    return { success: false, message: 'Item code required' };
  }

  return sellToShop(db, agent.id, itemCode, quantity || 1);
}

function handleTrade(db: Database.Database, agent: Agent, params: any): ActionResult {
  const { targetAgentId, offerItems = [], offerGold = 0, requestItems = [], requestGold = 0 } = params;
  
  if (!targetAgentId) {
    return { success: false, message: 'Target agent ID required' };
  }

  // Validate arrays
  if (!Array.isArray(offerItems) || !Array.isArray(requestItems)) {
    return { success: false, message: 'offerItems and requestItems must be arrays' };
  }

  if (offerItems.length === 0 && offerGold === 0 && requestItems.length === 0 && requestGold === 0) {
    return { success: false, message: 'Trade must include at least one offer or request' };
  }

  // Check target agent exists and is alive
  const targetAgent = db.prepare('SELECT * FROM agents WHERE id = ? AND is_dead = 0')
    .get(targetAgentId) as Agent | undefined;
  
  if (!targetAgent) {
    return { success: false, message: 'Target agent not found or is dead' };
  }

  if (targetAgent.id === agent.id) {
    return { success: false, message: 'Cannot trade with yourself' };
  }

  // Must be in same zone
  if (agent.zone_id !== targetAgent.zone_id) {
    return { success: false, message: 'Both agents must be in the same zone to trade' };
  }

  // Validate proposer has the offered items
  for (const itemCode of offerItems) {
    const invItem = db.prepare('SELECT quantity FROM inventory WHERE agent_id = ? AND item_code = ?')
      .get(agent.id, itemCode) as { quantity: number } | undefined;
    
    if (!invItem || invItem.quantity < 1) {
      return { success: false, message: `You don't have ${itemCode} to offer` };
    }
  }

  // Validate proposer has the offered gold
  if (offerGold > 0 && agent.gold < offerGold) {
    return { success: false, message: `Insufficient gold. Have ${agent.gold}, need ${offerGold}` };
  }

  // Create trade proposal
  const result = db.prepare(`
    INSERT INTO trades (proposer_id, target_id, offer_items, offer_gold, request_items, request_gold, zone_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    agent.id,
    targetAgentId,
    JSON.stringify(offerItems),
    offerGold,
    JSON.stringify(requestItems),
    requestGold,
    agent.zone_id,
    Date.now()
  );

  logActivity(db, 'trade', `${agent.name} proposed a trade to ${targetAgent.name}`, agent.name);

  return {
    success: true,
    message: `Trade proposed to ${targetAgent.name}. Trade ID: ${result.lastInsertRowid}`,
    data: { 
      tradeId: result.lastInsertRowid,
      offerItems,
      offerGold,
      requestItems,
      requestGold
    }
  };
}

function handleAcceptTrade(db: Database.Database, agent: Agent, tradeId?: number): ActionResult {
  if (!tradeId) {
    return { success: false, message: 'Trade ID required' };
  }

  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId) as any;
  
  if (!trade) {
    return { success: false, message: 'Trade not found' };
  }

  if (trade.target_id !== agent.id) {
    return { success: false, message: 'You are not the target of this trade' };
  }

  if (trade.status !== 'pending') {
    return { success: false, message: `Trade is ${trade.status}` };
  }

  // Check if trade expired (5 minutes)
  const TRADE_EXPIRY_MS = 5 * 60 * 1000;
  if (Date.now() - trade.created_at > TRADE_EXPIRY_MS) {
    db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('expired', tradeId);
    return { success: false, message: 'Trade has expired' };
  }

  // Get both agents
  const proposer = db.prepare('SELECT * FROM agents WHERE id = ?').get(trade.proposer_id) as Agent;
  const target = agent;

  // Verify both agents still in same zone
  if (proposer.zone_id !== target.zone_id) {
    db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('expired', tradeId);
    return { success: false, message: 'Agents are no longer in the same zone' };
  }

  const offerItems: string[] = JSON.parse(trade.offer_items);
  const requestItems: string[] = JSON.parse(trade.request_items);

  // Verify proposer still has offered items and gold
  for (const itemCode of offerItems) {
    const invItem = db.prepare('SELECT quantity FROM inventory WHERE agent_id = ? AND item_code = ?')
      .get(proposer.id, itemCode) as { quantity: number } | undefined;
    
    if (!invItem || invItem.quantity < 1) {
      db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('expired', tradeId);
      return { success: false, message: `Proposer no longer has ${itemCode}` };
    }
  }

  if (proposer.gold < trade.offer_gold) {
    db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('expired', tradeId);
    return { success: false, message: 'Proposer has insufficient gold' };
  }

  // Verify target has requested items and gold
  for (const itemCode of requestItems) {
    const invItem = db.prepare('SELECT quantity FROM inventory WHERE agent_id = ? AND item_code = ?')
      .get(target.id, itemCode) as { quantity: number } | undefined;
    
    if (!invItem || invItem.quantity < 1) {
      return { success: false, message: `You don't have ${itemCode}` };
    }
  }

  if (target.gold < trade.request_gold) {
    return { success: false, message: 'You have insufficient gold' };
  }

  // Check level requirements for traded items
  for (const itemCode of offerItems) {
    const minLevel = ITEM_MIN_LEVELS[itemCode];
    if (minLevel && target.level < minLevel) {
      return { success: false, message: `You must be level ${minLevel} to receive ${itemCode.replace(/_/g, ' ')}` };
    }
  }
  for (const itemCode of requestItems) {
    const minLevel = ITEM_MIN_LEVELS[itemCode];
    if (minLevel && proposer.level < minLevel) {
      return { success: false, message: `Proposer must be level ${minLevel} to receive ${itemCode.replace(/_/g, ' ')}` };
    }
  }

  // Weight check: can target carry offered items?
  for (const itemCode of offerItems) {
    if (!canCarryItem(db, target.id, itemCode, 1)) {
      return { success: false, message: `You cannot carry ${itemCode.replace(/_/g, ' ')} — inventory weight limit reached` };
    }
  }
  // Weight check: can proposer carry requested items?
  for (const itemCode of requestItems) {
    if (!canCarryItem(db, proposer.id, itemCode, 1)) {
      return { success: false, message: `Proposer cannot carry ${itemCode.replace(/_/g, ' ')} — inventory weight limit reached` };
    }
  }

  // Execute trade
  // Transfer offer items from proposer to target
  for (const itemCode of offerItems) {
    const proposerInv = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
      .get(proposer.id, itemCode) as any;
    
    if (proposerInv.quantity === 1) {
      db.prepare('DELETE FROM inventory WHERE id = ?').run(proposerInv.id);
    } else {
      db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE id = ?').run(proposerInv.id);
    }

    const targetInv = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
      .get(target.id, itemCode) as any;
    
    if (targetInv) {
      db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(targetInv.id);
    } else {
      db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, equipped, acquired_at) VALUES (?, ?, 1, 0, ?)')
        .run(target.id, itemCode, Date.now());
    }
  }

  // Transfer request items from target to proposer
  for (const itemCode of requestItems) {
    const targetInv = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
      .get(target.id, itemCode) as any;
    
    if (targetInv.quantity === 1) {
      db.prepare('DELETE FROM inventory WHERE id = ?').run(targetInv.id);
    } else {
      db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE id = ?').run(targetInv.id);
    }

    const proposerInv = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
      .get(proposer.id, itemCode) as any;
    
    if (proposerInv) {
      db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(proposerInv.id);
    } else {
      db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, equipped, acquired_at) VALUES (?, ?, 1, 0, ?)')
        .run(proposer.id, itemCode, Date.now());
    }
  }

  // Transfer gold
  if (trade.offer_gold > 0) {
    db.prepare('UPDATE agents SET gold = gold - ? WHERE id = ?').run(trade.offer_gold, proposer.id);
    db.prepare('UPDATE agents SET gold = gold + ? WHERE id = ?').run(trade.offer_gold, target.id);
  }

  if (trade.request_gold > 0) {
    db.prepare('UPDATE agents SET gold = gold - ? WHERE id = ?').run(trade.request_gold, target.id);
    db.prepare('UPDATE agents SET gold = gold + ? WHERE id = ?').run(trade.request_gold, proposer.id);
  }

  // Mark trade as accepted
  db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('accepted', tradeId);

  // Log transaction
  db.prepare(`
    INSERT INTO transactions (from_agent_id, to_agent_id, transaction_type, gold_amount, created_at)
    VALUES (?, ?, 'trade', ?, ?)
  `).run(proposer.id, target.id, trade.offer_gold + trade.request_gold, Date.now());

  logActivity(db, 'trade', `${target.name} accepted trade from ${proposer.name}`, target.name);

  return {
    success: true,
    message: `Trade accepted! Exchanged items and gold.`,
    data: { tradeId, offerItems, requestItems, offerGold: trade.offer_gold, requestGold: trade.request_gold }
  };
}

function handleRejectTrade(db: Database.Database, agent: Agent, tradeId?: number): ActionResult {
  if (!tradeId) {
    return { success: false, message: 'Trade ID required' };
  }

  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId) as any;
  
  if (!trade) {
    return { success: false, message: 'Trade not found' };
  }

  if (trade.target_id !== agent.id) {
    return { success: false, message: 'You are not the target of this trade' };
  }

  if (trade.status !== 'pending') {
    return { success: false, message: `Trade is already ${trade.status}` };
  }

  db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('rejected', tradeId);

  logActivity(db, 'trade', `${agent.name} rejected trade proposal`, agent.name);

  return { success: true, message: `Trade rejected` };
}

function handleCancelTrade(db: Database.Database, agent: Agent, tradeId?: number): ActionResult {
  if (!tradeId) {
    return { success: false, message: 'Trade ID required' };
  }

  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId) as any;
  
  if (!trade) {
    return { success: false, message: 'Trade not found' };
  }

  if (trade.proposer_id !== agent.id) {
    return { success: false, message: 'You are not the proposer of this trade' };
  }

  if (trade.status !== 'pending') {
    return { success: false, message: `Trade is already ${trade.status}` };
  }

  db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('expired', tradeId);

  logActivity(db, 'trade', `${agent.name} cancelled trade proposal`, agent.name);

  return { success: true, message: `Trade cancelled` };
}

function handleSolveRiddle(_db: Database.Database, _agent: Agent, _riddleId?: number, _answer?: string): ActionResult {
  return { success: false, message: 'Riddles have been replaced by gate bosses. Move to a connected zone to encounter them.' };
}

function handleCreateGuild(db: Database.Database, agent: Agent, name?: string, lootMode?: string): ActionResult {
  if (!name) {
    return { success: false, message: 'Guild name required' };
  }

  // Validate guild name (2-20 chars, alphanumeric + spaces)
  if (name.length < 2 || name.length > 20) {
    return { success: false, message: 'Guild name must be 2-20 characters' };
  }

  if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
    return { success: false, message: 'Guild name must contain only letters, numbers, and spaces' };
  }

  const validLootModes = ['round-robin', 'need-before-greed', 'leader-decides'];
  const selectedLootMode = lootMode && validLootModes.includes(lootMode) ? lootMode : 'round-robin';

  const result = createGuild(db, name, agent.id, selectedLootMode as any);
  
  if (result.success && result.guild) {
    logActivity(db, 'guild', `${agent.name} created guild "${name}"`, agent.name);
  }
  
  return result;
}

function handleJoinGuild(db: Database.Database, agent: Agent, guildId?: number): ActionResult {
  if (!guildId || typeof guildId !== 'number') {
    return { success: false, message: 'Guild ID required (must be a number)' };
  }

  const result = joinGuild(db, guildId, agent.id);
  
  if (result.success) {
    const guild = db.prepare('SELECT name FROM guilds WHERE id = ?').get(guildId) as { name: string } | undefined;
    if (guild) {
      logActivity(db, 'guild', `${agent.name} joined guild "${guild.name}"`, agent.name);
    }
  }
  
  return result;
}

function handleAttackAshborn(db: Database.Database, agent: Agent): ActionResult {
  if (agent.zone_id !== 'abyss_bridge') {
    return { success: false, message: 'You must be at The Abyss Bridge to fight The Ashborn' };
  }

  if (!agent.guild_id) {
    return { success: false, message: 'You need a guild of 3+ members to fight The Ashborn' };
  }

  const members = getGuildMembers(db, agent.guild_id);
  const membersHere = members.filter(m => m.zone_id === 'abyss_bridge');

  if (membersHere.length < 3) {
    return { success: false, message: 'Need at least 3 guild members at The Abyss Bridge' };
  }

  const ashborn = db.prepare(`SELECT * FROM world_bosses WHERE name = 'The Ashborn'`).get() as any;
  
  if (!ashborn.is_alive) {
    return { success: false, message: 'The Ashborn has been slain. It will respawn in 24 hours.' };
  }

  const ashbornMob = {
    id: 'ashborn',
    name: 'The Ashborn',
    hp: ashborn.current_hp,
    atk: ashborn.atk,
    def: ashborn.def,
    spd: 8,
    xp_reward: 500,
    gold_reward: 0,
    element: 'fire' as const,
    drop_table: [
      { item: 'ashborn_heart', chance: 1.0 },
      { item: 'flame_crown', chance: 0.5 },
      { item: 'ancient_power', chance: 0.3 }
    ]
  };

  const combat = simulateGuildCombat(membersHere, ashbornMob, 'The Ashborn');

  // Update Ashborn HP
  const newAshbornHp = Math.max(0, ashborn.current_hp - combat.totalDamage);
  db.prepare(`UPDATE world_bosses SET current_hp = ? WHERE name = 'The Ashborn'`).run(newAshbornHp);

  // Handle casualties
  for (const agentId of combat.casualties) {
    takeDamage(db, agentId, 9999); // Kill the agent
  }

  // Log combat for all participants
  for (const member of membersHere) {
    const damage = combat.damageByAgent[member.id] || 0;
    db.prepare(`
      INSERT INTO combat_log (agent_id, opponent_type, opponent_name, zone_id, damage_dealt, damage_taken, xp_gained, gold_gained, won, guild_id, created_at)
      VALUES (?, 'boss', 'The Ashborn', 'abyss_bridge', ?, 0, 0, 0, ?, ?, ?)
    `).run(member.id, damage, combat.bossDefeated ? 1 : 0, agent.guild_id, Date.now());
  }

  if (combat.bossDefeated) {
    // Ashborn defeated!
    db.prepare(`UPDATE world_bosses SET is_alive = 0, last_spawn = ? WHERE name = 'The Ashborn'`)
      .run(Date.now());

    // Distribute prize pool (gold split by damage contribution)
    const totalDamage = combat.totalDamage;
    for (const member of membersHere) {
      const damageShare = combat.damageByAgent[member.id] / totalDamage;
      const goldReward = Math.floor(ashborn.prize_pool * damageShare);
      addGold(db, member.id, goldReward);
      gainXp(db, member.id, 500);
    }

    // Roll for item drops and distribute via guild loot system
    const droppedItems: string[] = [];
    for (const drop of ashbornMob.drop_table) {
      if (Math.random() < drop.chance) {
        droppedItems.push(drop.item);
      }
    }

    // Distribute items according to guild loot rules
    if (droppedItems.length > 0 && agent.guild_id) {
      distributeLoot(db, agent.guild_id, droppedItems, 0);
    }

    const guildInfo = db.prepare('SELECT name FROM guilds WHERE id = ?').get(agent.guild_id) as { name: string };
    logActivity(db, 'boss', `🔥 THE ASHBORN HAS BEEN SLAIN by ${guildInfo.name}! (${ashborn.prize_pool} gold distributed, ${droppedItems.length} items dropped)`, agent.name);

    return {
      success: true,
      message: `THE ASHBORN HAS BEEN SLAIN! Your guild is legendary! Items dropped: ${droppedItems.join(', ') || 'none'}`,
      data: {
        totalDamage: combat.totalDamage,
        damageByAgent: combat.damageByAgent,
        casualties: combat.casualties,
        prizePool: ashborn.prize_pool,
        itemsDropped: droppedItems
      }
    };
  } else {
    logActivity(db, 'boss', `${agent.name}'s guild dealt ${combat.totalDamage} damage to The Ashborn (${newAshbornHp}/${ashborn.max_hp} HP remaining)`, agent.name);
    return {
      success: true,
      message: `Your guild dealt ${combat.totalDamage} damage to The Ashborn. Current HP: ${newAshbornHp}/${ashborn.max_hp}`,
      data: {
        totalDamage: combat.totalDamage,
        damageByAgent: combat.damageByAgent,
        casualties: combat.casualties,
        ashbornHp: newAshbornHp
      }
    };
  }
}

