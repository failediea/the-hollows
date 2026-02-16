import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { Agent } from '../db/schema.js';
import {
  getCombatSession,
  submitRoundAction,
  handleTimeout,
  CombatAction,
  Stance,
  COMBAT_CONFIG,
  STANCE_COMBOS,
} from '../engine/combat-session.js';
import { processCombatOutcome } from '../engine/combat-outcome.js';
import { getApiKeyFromRequest } from '../utils/validation.js';

export function createCombatRoutes(db: Database.Database) {
  const app = new Hono();

  /**
   * GET /api/combat/:id
   * Get current combat state
   */
  app.get('/api/combat/:id', async (c) => {
    const combatId = c.req.param('id');
    const session = getCombatSession(combatId);

    if (!session) {
      // Check if it's a realtime session
      if (combatId.startsWith('rt_')) {
        const { getRealtimeSession } = await import('../engine/realtime-session.js');
        const rtSession = getRealtimeSession(combatId);
        if (rtSession) {
          return c.json({
            combatId: rtSession.id,
            round: 1,
            status: rtSession.status,
            encounterType: 'mob',
            realtime: true,
            enemy: {
              name: rtSession.enemies[0]?.name || 'Enemy',
              hp: rtSession.enemies[0]?.hp || 0,
              maxHp: rtSession.enemies[0]?.maxHp || 0,
              element: rtSession.enemies[0]?.element || null,
            },
            agent: {
              hp: rtSession.player.hp,
              maxHp: rtSession.player.maxHp,
              stamina: rtSession.player.stamina,
              maxStamina: rtSession.player.maxStamina,
            },
            arena: rtSession.arena,
            player: rtSession.player,
            enemies: rtSession.enemies,
            secondsRemaining: 999,
          });
        }
      }
      return c.json({ error: 'Combat session not found' }, 404);
    }

    const now = Date.now();
    const secondsRemaining = Math.max(0, Math.floor((session.deadlineAt - now) / 1000));

    return c.json({
      combatId: session.id,
      round: session.round,
      status: session.status,
      encounterType: session.encounterType,
      enemy: {
        name: session.enemyState.name,
        hp: session.enemyState.hp,
        maxHp: session.enemyState.maxHp,
        element: session.enemyState.element,
        archetype: session.enemyState.archetype,
        buffs: session.enemyState.buffs,
        debuffs: session.enemyState.debuffs,
        atk: session.enemyState.atk,
      },
      intent: session.enemyIntent || null,
      combos: STANCE_COMBOS || [],
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
        buffs: session.playerState.buffs,
        debuffs: session.playerState.debuffs,
      },
      timeoutSeconds: COMBAT_CONFIG.ROUND_TIMEOUT_SECONDS,
      deadlineAt: session.deadlineAt,
      secondsRemaining,
    });
  });

  /**
   * POST /api/combat/:id/action
   * Submit player's round action
   */
  app.post('/api/combat/:id/action', async (c) => {
    const combatId = c.req.param('id');
    const session = getCombatSession(combatId);

    if (!session) {
      return c.json({ error: 'Combat session not found' }, 404);
    }

    if (session.status !== 'awaiting_input') {
      return c.json({ error: `Combat is ${session.status}` }, 400);
    }

    const body = await c.req.json();
    const { stance, action } = body;

    if (!stance || !action) {
      return c.json({ error: 'stance and action required' }, 400);
    }

    // Validate stance
    const validStances: Stance[] = ['aggressive', 'balanced', 'defensive', 'evasive'];
    if (!validStances.includes(stance)) {
      return c.json({ error: 'Invalid stance' }, 400);
    }

    // Validate action
    const validActionTypes = ['basic_attack', 'ability', 'consumable', 'guard', 'flee'];
    if (!validActionTypes.includes(action.type)) {
      return c.json({ error: 'Invalid action type' }, 400);
    }

    // Validate consumable usage
    if (action.type === 'consumable') {
      if (!action.itemCode) {
        return c.json({ error: 'itemCode required for consumable action' }, 400);
      }
      if (action.itemCode !== 'health_potion') {
        return c.json({ error: 'Only health potions can be used in combat' }, 400);
      }
    }

    // Validate ability usage
    if (action.type === 'ability') {
      if (!action.abilityId) {
        return c.json({ error: 'abilityId required for ability action' }, 400);
      }

      const ability = session.playerState.abilities.find(a => a.id === action.abilityId);
      if (!ability) {
        return c.json({ error: 'Ability not found' }, 400);
      }

      if (ability.cooldown > 0) {
        return c.json({ error: `Ability on cooldown (${ability.cooldown} rounds remaining)` }, 400);
      }

      const maxDeficit = 2; // OVEREXERTION_MAX_DEFICIT
      if (session.playerState.stamina + maxDeficit < ability.staminaCost) {
        return c.json({ error: `Insufficient stamina (need ${ability.staminaCost}, have ${session.playerState.stamina}, max overexert: ${maxDeficit})` }, 400);
      }
    }

    // Resolve round
    const resolution = submitRoundAction(combatId, stance, action as CombatAction);

    if (!resolution) {
      return c.json({ error: 'Failed to resolve round' }, 500);
    }

    const updatedSession = getCombatSession(combatId);
    if (!updatedSession) {
      return c.json({ error: 'Session lost' }, 500);
    }

    // Build response
    const response: any = {
      combatId,
      round: updatedSession.round,
      resolution: {
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
      state: {
        player: {
          hp: updatedSession.playerState.hp,
          maxHp: updatedSession.playerState.maxHp,
          stamina: updatedSession.playerState.stamina,
          maxStamina: updatedSession.playerState.maxStamina,
          buffs: updatedSession.playerState.buffs,
          debuffs: updatedSession.playerState.debuffs,
        },
        enemy: {
          name: updatedSession.enemyState.name,
          element: updatedSession.enemyState.element,
          archetype: updatedSession.enemyState.archetype,
          hp: updatedSession.enemyState.hp,
          maxHp: updatedSession.enemyState.maxHp,
          buffs: updatedSession.enemyState.buffs,
          debuffs: updatedSession.enemyState.debuffs,
          atk: updatedSession.enemyState.atk,
        },
        abilities: updatedSession.playerState.abilities.map(a => ({
          id: a.id,
          cooldown: a.cooldown,
          maxCooldown: a.maxCooldown,
        })),
      },
      status: updatedSession.status,
      timeoutSeconds: COMBAT_CONFIG.ROUND_TIMEOUT_SECONDS,
      deadlineAt: updatedSession.deadlineAt,
      secondsRemaining: Math.max(0, Math.floor((updatedSession.deadlineAt - Date.now()) / 1000)),
      encounterType: updatedSession.encounterType,
      intent: updatedSession.enemyIntent || null,
      activeCombo: resolution.activeCombo || null,
    };

    // Handle combat end
    if (updatedSession.status === 'victory' || updatedSession.status === 'defeat' || updatedSession.status === 'fled') {
      const outcome = processCombatOutcome(db, session, updatedSession, resolution);
      Object.assign(response, outcome);
    }

    return c.json(response);
  });

  /**
   * POST /api/combat/:id/auto
   * Explicit client timeout fallback - triggers auto-action
   */
  app.post('/api/combat/:id/auto', async (c) => {
    const combatId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const apiKey = getApiKeyFromRequest(c, body);
    if (!apiKey) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as Agent | undefined;
    if (!agent) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const session = getCombatSession(combatId);

    if (!session) {
      return c.json({ error: 'Combat session not found' }, 404);
    }

    if (session.agentId !== agent.id) {
      return c.json({ error: 'Unauthorized — not your combat session' }, 403);
    }

    if (session.status !== 'awaiting_input') {
      return c.json({ error: `Combat is ${session.status}` }, 400);
    }

    const snapshot = { ...session, agentId: session.agentId };
    const resolution = handleTimeout(combatId);
    if (!resolution) {
      return c.json({ error: 'Failed to auto-resolve' }, 500);
    }

    const updatedSession = getCombatSession(combatId);
    let outcome = {};
    if (updatedSession && (updatedSession.status === 'victory' || updatedSession.status === 'defeat' || updatedSession.status === 'fled')) {
      outcome = processCombatOutcome(db, snapshot, updatedSession, resolution);
    }

    return c.json({ autoResolved: true, message: 'Round auto-resolved due to timeout', ...outcome });
  });

  /**
   * POST /api/combat/:id/realtime
   * Initiate a real-time combat session
   */
  app.post('/api/combat/:id/realtime', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const apiKey = getApiKeyFromRequest(c, body) || '';

    const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as Agent | undefined;
    if (!agent) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const zone = (body as Record<string, unknown>).zone as string || agent.zone_id;
    const encounterType = (body as Record<string, unknown>).encounterType as string || 'mob';

    try {
      const { createRealtimeSession } = await import('../engine/realtime-session.js');
      const session = createRealtimeSession(agent.id, zone, encounterType, db);

      return c.json({
        sessionId: session.id,
        wsUrl: `/ws/realtime-combat?sessionId=${session.id}&apiKey=${apiKey}`,
        arena: session.arena,
        player: {
          x: session.player.x,
          y: session.player.y,
          hp: session.player.hp,
          maxHp: session.player.maxHp,
          stamina: session.player.stamina,
          maxStamina: session.player.maxStamina,
          stance: session.player.stance,
          abilities: session.player.abilities,
        },
        enemies: session.enemies.map(e => ({
          id: e.id,
          name: e.name,
          x: e.x,
          y: e.y,
          hp: e.hp,
          maxHp: e.maxHp,
          archetype: e.archetype,
          element: e.element,
        })),
      });
    } catch (err) {
      console.error('Failed to create realtime session:', err);
      return c.json({ error: 'Failed to create session' }, 500);
    }
  });

  /**
   * GET /api/combat/realtime/:id
   * Get current real-time session state (REST fallback)
   */
  app.get('/api/combat/realtime/:id', async (c) => {
    const sessionId = c.req.param('id');
    const { getRealtimeSession } = await import('../engine/realtime-session.js');
    const session = getRealtimeSession(sessionId);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    return c.json({
      sessionId: session.id,
      status: session.status,
      arena: session.arena,
      player: {
        x: session.player.x,
        y: session.player.y,
        hp: session.player.hp,
        maxHp: session.player.maxHp,
        stamina: session.player.stamina,
        maxStamina: session.player.maxStamina,
        stance: session.player.stance,
      },
      enemies: session.enemies.map(e => ({
        id: e.id,
        name: e.name,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        archetype: e.archetype,
        element: e.element,
        aiState: e.aiState,
      })),
    });
  });

  return app;
}
