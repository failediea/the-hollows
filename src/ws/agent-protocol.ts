import type { WebSocket } from 'ws';
import Database from 'better-sqlite3';
import { Agent } from '../db/schema.js';
import { ZONES } from '../world/zones.js';
import { handleAction } from '../engine/actions.js';
import { getEquippedStats } from '../engine/agent.js';
import {
  getCombatSession,
  getCombatSessionByAgentId,
  submitRoundAction,
  Stance,
  CombatAction,
} from '../engine/combat-session.js';
import { processCombatOutcome } from '../engine/combat-outcome.js';
import { RATE_LIMIT_SECONDS, ALLOWED_ACTIONS } from '../utils/validation.js';
import { getZoneQuests } from '../engine/quests.js';
import type {
  AgentObservation,
  ActionResultMessage,
  ErrorMessage,
  GameActionMessage,
  CombatActionMessage,
  ServerMessage,
} from './types.js';

// Input validation patterns
const ZONE_ID_REGEX = /^[a-z_]+$/;
const ITEM_CODE_REGEX = /^[a-z_]+$/;

/**
 * Send a typed message over WebSocket
 */
function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Send an error message over WebSocket
 */
function sendError(ws: WebSocket, error: string, id?: string): void {
  send(ws, { type: 'error', id, error } as ErrorMessage);
}

/**
 * Build a full observation snapshot for an agent.
 */
export function buildObservation(db: Database.Database, agentId: number): AgentObservation {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  const zone = ZONES[agent.zone_id];

  // Equipment bonuses
  const equipBonuses = getEquippedStats(db, agentId);

  // Inventory
  const inventory = db.prepare(`
    SELECT inv.item_code, i.name, inv.quantity, i.category, i.rarity, inv.equipped
    FROM inventory inv
    JOIN items i ON inv.item_code = i.code
    WHERE inv.agent_id = ? AND inv.quantity > 0
  `).all(agentId) as Array<{
    item_code: string;
    name: string;
    quantity: number;
    category: string;
    rarity: string;
    equipped: number;
  }>;

  // Combat session
  const combatSession = getCombatSessionByAgentId(agentId);

  // Quests
  const zoneQuests = getZoneQuests(db, agentId, agent.zone_id);

  // Nearby players
  const nearbyPlayers = db.prepare(
    'SELECT name, level FROM agents WHERE zone_id = ? AND id != ? AND is_dead = 0'
  ).all(agent.zone_id, agentId) as Array<{ name: string; level: number }>;

  // World boss
  const worldBoss = db.prepare("SELECT * FROM world_bosses WHERE name = 'The Ashborn'").get() as {
    name: string;
    current_hp: number;
    max_hp: number;
    is_alive: number;
  } | undefined;

  // Season
  const season = db.prepare('SELECT id FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() as { id: number } | undefined;

  // Build combat block
  const combat: AgentObservation['combat'] = { active: false };
  if (combatSession) {
    combat.active = true;
    combat.combatId = combatSession.id;
    combat.round = combatSession.round;
    combat.status = combatSession.status;
    combat.encounterType = combatSession.encounterType;
    combat.deadlineAt = combatSession.deadlineAt;
    combat.enemy = {
      name: combatSession.enemyState.name,
      hp: combatSession.enemyState.hp,
      maxHp: combatSession.enemyState.maxHp,
      element: combatSession.enemyState.element,
      archetype: combatSession.enemyState.archetype,
      buffs: combatSession.enemyState.buffs,
      debuffs: combatSession.enemyState.debuffs,
    };
    combat.player = {
      hp: combatSession.playerState.hp,
      maxHp: combatSession.playerState.maxHp,
      stamina: combatSession.playerState.stamina,
      maxStamina: combatSession.playerState.maxStamina,
      buffs: combatSession.playerState.buffs,
      debuffs: combatSession.playerState.debuffs,
      abilities: combatSession.playerState.abilities.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        staminaCost: a.staminaCost,
        cooldown: a.cooldown,
        maxCooldown: a.maxCooldown,
      })),
    };
  }

  // Available actions
  const availableActions = computeAvailableActions(
    agent,
    zone,
    combat.active,
    inventory,
    nearbyPlayers,
  );

  return {
    type: 'observation',
    agent: {
      id: agent.id,
      name: agent.name,
      level: agent.level,
      xp: agent.xp,
      hp: agent.hp,
      maxHp: agent.max_hp,
      atk: agent.atk,
      def: agent.def,
      spd: agent.spd,
      luck: agent.luck,
      gold: agent.gold,
      corruption: agent.corruption,
      zone: agent.zone_id,
      isDead: !!agent.is_dead,
      skillPoints: agent.skill_points,
      equipBonuses: {
        atk: equipBonuses.atkBonus,
        def: equipBonuses.defBonus,
        hp: equipBonuses.hpBonus,
      },
    },
    zone: {
      id: zone.id,
      name: zone.name,
      dangerLevel: zone.dangerLevel,
      connectedZones: zone.connectedZones,
      mobs: zone.mobs.map(m => ({
        id: m.id,
        name: m.name,
        hp: m.hp,
        atk: m.atk,
        def: m.def,
        spd: m.spd,
        element: m.element || 'none',
        archetype: m.archetype || 'brute',
        xp_reward: m.xp_reward,
        gold_reward: m.gold_reward,
      })),
      resources: zone.resources.map(r => ({
        id: r.id,
        name: r.name,
        gather_time_seconds: r.gather_time_seconds,
      })),
      nearbyPlayers,
    },
    inventory: inventory.map(i => ({
      itemCode: i.item_code,
      name: i.name,
      quantity: i.quantity,
      category: i.category,
      rarity: i.rarity,
      equipped: !!i.equipped,
    })),
    combat,
    quests: zoneQuests.map(q => ({
      id: q.id,
      name: q.name,
      description: q.description,
      objective: {
        type: q.objective.type,
        target: q.objective.target,
        targetName: q.objective.targetName,
        amount: q.objective.amount,
      },
      progress: q.progress,
      completed: q.completed,
      claimed: q.claimed,
    })),
    availableActions,
    world: {
      season: season?.id || 1,
      worldBoss: worldBoss
        ? {
            name: worldBoss.name,
            hp: worldBoss.current_hp,
            maxHp: worldBoss.max_hp,
            isAlive: !!worldBoss.is_alive,
          }
        : null,
    },
  };
}

/**
 * Compute context-dependent available actions.
 */
function computeAvailableActions(
  agent: Agent,
  _zone: typeof ZONES[string],
  inCombat: boolean,
  _inventory: Array<{ item_code: string; category: string }>,
  nearbyPlayers: Array<{ name: string }>,
): string[] {
  if (agent.is_dead) return [];

  if (inCombat) return ['combat_action'];

  const actions = [
    'move',
    'attack',
    'gather',
    'rest',
    'use_item',
    'craft',
    'buy',
    'sell',
    'equip_item',
    'unequip_item',
    'claim_quest',
  ];

  if (nearbyPlayers.length > 0) {
    actions.push('trade');
  }

  if (agent.skill_points > 0) {
    actions.push('learn_skill');
  }

  if (agent.zone_id === 'abyss_bridge' && agent.guild_id) {
    actions.push('attack_ashborn');
  }

  return actions;
}

/**
 * Validate input parameters for game actions (A6 input validation).
 */
function validateActionParams(action: string, target?: string, params?: Record<string, any>): string | null {
  switch (action) {
    case 'move':
      if (target && !ZONE_ID_REGEX.test(target)) {
        return 'Invalid zone ID format';
      }
      if (target && !ZONES[target]) {
        return 'Unknown zone';
      }
      break;
    case 'buy':
    case 'sell':
      if (params?.itemCode && !ITEM_CODE_REGEX.test(params.itemCode)) {
        return 'Invalid item code format';
      }
      if (params?.quantity !== undefined) {
        const qty = Number(params.quantity);
        if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
          return 'Quantity must be a positive integer (1-999)';
        }
      }
      break;
    case 'trade':
      if (params?.targetAgentId !== undefined && typeof params.targetAgentId !== 'number') {
        return 'targetAgentId must be a number';
      }
      if (params?.offerItems && !Array.isArray(params.offerItems)) {
        return 'offerItems must be an array';
      }
      if (params?.requestItems && !Array.isArray(params.requestItems)) {
        return 'requestItems must be an array';
      }
      if (params?.offerGold !== undefined && (typeof params.offerGold !== 'number' || params.offerGold < 0)) {
        return 'offerGold must be a non-negative number';
      }
      if (params?.requestGold !== undefined && (typeof params.requestGold !== 'number' || params.requestGold < 0)) {
        return 'requestGold must be a non-negative number';
      }
      break;
    case 'equip_item':
    case 'unequip_item':
    case 'use_item':
    case 'craft':
      if (params?.itemCode && !ITEM_CODE_REGEX.test(params.itemCode)) {
        return 'Invalid item code format';
      }
      break;
    case 'attack':
      if (params?.target && !ITEM_CODE_REGEX.test(params.target)) {
        return 'Invalid mob ID format';
      }
      break;
    case 'gather':
      if (params?.target && !ITEM_CODE_REGEX.test(params.target)) {
        return 'Invalid resource ID format';
      }
      break;
  }
  return null;
}

/**
 * Handle a new agent WebSocket connection.
 */
export function handleAgentConnection(ws: WebSocket, db: Database.Database, agent: Agent): void {
  // Send welcome
  send(ws, {
    type: 'welcome',
    agentId: agent.id,
    agentName: agent.name,
  });

  // Send initial observation
  send(ws, buildObservation(db, agent.id));

  // Handle incoming messages
  ws.on('message', async (raw: Buffer | string) => {
    let msg: any;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
    } catch {
      sendError(ws, 'Invalid JSON');
      return;
    }

    if (!msg || typeof msg.type !== 'string') {
      sendError(ws, 'Missing message type');
      return;
    }

    switch (msg.type) {
      case 'action':
        await handleGameAction(ws, db, agent.id, msg as GameActionMessage);
        break;
      case 'combat_action':
        handleCombatAction(ws, db, agent.id, msg as CombatActionMessage);
        break;
      case 'ping':
        send(ws, { type: 'action_result', id: 'pong', success: true, message: 'pong', observation: buildObservation(db, agent.id) });
        break;
      default:
        sendError(ws, `Unknown message type: ${msg.type}`, msg.id);
        break;
    }
  });
}

/**
 * Handle a game action message from an agent.
 */
async function handleGameAction(
  ws: WebSocket,
  db: Database.Database,
  agentId: number,
  msg: GameActionMessage,
): Promise<void> {
  const { id, action, target, params } = msg;

  // Validate action is in allowed list
  if (!action || !ALLOWED_ACTIONS.includes(action)) {
    sendError(ws, `Invalid action. Allowed: ${ALLOWED_ACTIONS.join(', ')}`, id);
    return;
  }

  // Validate action-specific params
  const paramError = validateActionParams(action, target, params);
  if (paramError) {
    sendError(ws, paramError, id);
    return;
  }

  // Rate limit check
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent;
  if (!agent) {
    sendError(ws, 'Agent not found', id);
    return;
  }

  const now = Date.now();
  const timeSinceLastAction = now - agent.last_action_at;
  if (timeSinceLastAction < RATE_LIMIT_SECONDS * 1000) {
    const remaining = Math.ceil((RATE_LIMIT_SECONDS * 1000 - timeSinceLastAction) / 1000);
    sendError(ws, `Rate limited. Wait ${remaining}s.`, id);
    return;
  }

  // Dead agents cannot act
  if (agent.is_dead) {
    sendError(ws, 'Your champion is dead. They cannot act.', id);
    return;
  }

  // Execute action
  const result = await handleAction(db, agent, action, target, params);

  // Build response with fresh observation
  const observation = buildObservation(db, agentId);
  const response: ActionResultMessage = {
    type: 'action_result',
    id,
    success: result.success,
    message: result.message,
    data: result.data,
    observation,
  };

  send(ws, response);
}

/**
 * Handle a combat action message from an agent.
 */
function handleCombatAction(
  ws: WebSocket,
  db: Database.Database,
  agentId: number,
  msg: CombatActionMessage,
): void {
  const { id, combatId, stance, action } = msg;

  // Validate stance
  const validStances: Stance[] = ['aggressive', 'balanced', 'defensive', 'evasive'];
  if (!validStances.includes(stance)) {
    sendError(ws, 'Invalid stance. Must be: aggressive, balanced, defensive, evasive', id);
    return;
  }

  // Validate action type
  const validActionTypes = ['basic_attack', 'ability', 'consumable', 'guard', 'flee'];
  if (!action || !validActionTypes.includes(action.type)) {
    sendError(ws, 'Invalid action type. Must be: basic_attack, ability, consumable, guard, flee', id);
    return;
  }

  // Get combat session
  const session = getCombatSession(combatId);
  if (!session) {
    sendError(ws, 'Combat session not found', id);
    return;
  }

  // Verify session belongs to this agent
  if (session.agentId !== agentId) {
    sendError(ws, 'This combat session does not belong to you', id);
    return;
  }

  if (session.status !== 'awaiting_input') {
    sendError(ws, `Combat is ${session.status}`, id);
    return;
  }

  // Validate ability if specified
  if (action.type === 'ability') {
    if (!action.abilityId) {
      sendError(ws, 'abilityId required for ability action', id);
      return;
    }
    const ability = session.playerState.abilities.find(a => a.id === action.abilityId);
    if (!ability) {
      sendError(ws, 'Ability not found', id);
      return;
    }
    if (ability.cooldown > 0) {
      sendError(ws, `Ability on cooldown (${ability.cooldown} rounds remaining)`, id);
      return;
    }
    if (session.playerState.stamina < ability.staminaCost) {
      sendError(ws, `Insufficient stamina (need ${ability.staminaCost}, have ${session.playerState.stamina})`, id);
      return;
    }
  }

  // Snapshot session before resolution (for outcome processing)
  const sessionSnapshot = { ...session, agentId: session.agentId };

  // Submit the round action
  const resolution = submitRoundAction(combatId, stance, action as CombatAction);
  if (!resolution) {
    sendError(ws, 'Failed to resolve round', id);
    return;
  }

  const updatedSession = getCombatSession(combatId);

  // Process combat outcome if combat ended
  let outcomeData: any = undefined;
  if (updatedSession && (updatedSession.status === 'victory' || updatedSession.status === 'defeat' || updatedSession.status === 'fled')) {
    outcomeData = processCombatOutcome(db, sessionSnapshot, updatedSession, resolution);
  } else if (!updatedSession && (resolution.events.includes('fled') || resolution.playerDamageDealt > 0 || resolution.enemyDamageDealt > 0)) {
    // Session already cleaned up — shouldn't happen but handle gracefully
    outcomeData = {};
  }

  // Build response with fresh observation
  const observation = buildObservation(db, agentId);
  const response: ActionResultMessage = {
    type: 'action_result',
    id,
    success: true,
    message: resolution.narrative,
    data: {
      resolution: {
        round: resolution.round,
        playerStance: resolution.playerStance,
        enemyStance: resolution.enemyStance,
        playerAction: resolution.playerAction,
        enemyAction: resolution.enemyAction,
        stanceInteraction: resolution.stanceInteraction,
        turnOrder: resolution.turnOrder,
        playerDamageDealt: resolution.playerDamageDealt,
        playerDamageTaken: resolution.playerDamageTaken,
        events: resolution.events,
        narrative: resolution.narrative,
      },
      ...(outcomeData || {}),
    },
    observation,
  };

  send(ws, response);
}
