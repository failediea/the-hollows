import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { createAgent } from '../engine/agent.js';
import { getCurrentSeason } from '../engine/seasons.js';
import { handleAction } from '../engine/actions.js';
import { Agent } from '../db/schema.js';
import { getGuildInfo } from '../engine/guild.js';
import {
  validateName,
  validateWalletAddress,
  validateAction,
  sanitizeString,
  checkRateLimit,
  getApiKeyFromRequest
} from '../utils/validation.js';

export function createEntryRoutes(db: Database.Database) {
  const app = new Hono();

  // Register new agent
  app.post('/enter', async (c) => {
    try {
      const body = await c.req.json();
      let { name, walletAddress } = body;

      if (!name || !walletAddress) {
        return c.json({ error: 'Missing required fields: name, walletAddress' }, 400);
      }

      // Sanitize inputs
      name = sanitizeString(name);
      walletAddress = sanitizeString(walletAddress);

      // Validate name
      const nameValidation = validateName(name);
      if (!nameValidation.valid) {
        return c.json({ error: nameValidation.error }, 400);
      }

      // Validate wallet address
      const walletValidation = validateWalletAddress(walletAddress);
      if (!walletValidation.valid) {
        return c.json({ error: walletValidation.error }, 400);
      }

      // Check if agent name already exists
      const existing = db.prepare('SELECT id FROM agents WHERE name = ?').get(name);
      if (existing) {
        return c.json({ error: 'Agent name already taken' }, 409);
      }

      // Get current season
      const season = getCurrentSeason(db);
      if (!season) {
        return c.json({ error: 'No active season' }, 500);
      }

      // Verify on-chain payment (each registration requires a new 0.01 MON payment)
      const { verifyEntryPayment } = await import('../utils/validation.js');
      const paymentCheck = await verifyEntryPayment(walletAddress, db);
      if (!paymentCheck.paid) {
        return c.json({ error: paymentCheck.error }, 402);
      }

      // Create agent (wrapped in transaction to prevent race conditions)
      const createInTransaction = db.transaction(() => {
        // Re-check name not taken inside transaction
        const taken = db.prepare('SELECT id FROM agents WHERE name = ?').get(name);
        if (taken) throw new Error('Agent name already taken');
        return createAgent(db, name, walletAddress, season.id);
      });

      try {
        const agent = createInTransaction();
        return c.json({
          success: true,
          message: 'Welcome to The Hollows',
          agent: {
            id: agent.id,
            name: agent.name,
            apiKey: agent.api_key,
            zone: agent.zone_id,
            stats: {
              hp: agent.hp,
              maxHp: agent.max_hp,
              atk: agent.atk,
              def: agent.def,
              spd: agent.spd,
              luck: agent.luck,
              level: agent.level,
              xp: agent.xp
            },
            gold: agent.gold,
            corruption: agent.corruption,
            isDead: agent.is_dead,
            seasonId: agent.season_id
          }
        });
      } catch (e: any) {
        return c.json({ error: e.message || 'Registration failed' }, 409);
      }
    } catch (error) {
      console.error('Error in /enter:', error);
      return c.json({ error: 'Failed to create agent. Please try again.' }, 500);
    }
  });

  // Submit action
  app.post('/action', async (c) => {
    try {
      const body = await c.req.json();
      const { action, target, params } = body;
      const apiKey = getApiKeyFromRequest(c, body);

      if (!apiKey || !action) {
        return c.json({ error: 'Missing required fields: apiKey, action' }, 400);
      }

      // Validate action type
      const actionValidation = validateAction(action);
      if (!actionValidation.valid) {
        return c.json({ error: actionValidation.error }, 400);
      }

      // Get agent by API key
      const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as Agent | undefined;
      if (!agent) {
        return c.json({ error: 'Invalid API key' }, 401);
      }

      if (agent.is_dead) {
        return c.json({ 
          error: 'Your champion has fallen permanently. Create a new one.',
          message: '💀 Your champion has fallen permanently. Create a new one.',
          permadeath: true,
        }, 403);
      }

      // Check rate limit
      const rateLimitCheck = checkRateLimit(agent);
      if (!rateLimitCheck.allowed) {
        return c.json({ error: rateLimitCheck.error }, 429);
      }

      // Execute action
      const result = await handleAction(db, agent, action, target, params);
      
      // Get updated agent state
      const updatedAgent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id) as Agent;
      
      // Get guild info if in a guild
      let guild = null;
      if (updatedAgent.guild_id) {
        const guildInfo = getGuildInfo(db, updatedAgent.guild_id);
        if (guildInfo) {
          guild = {
            id: guildInfo.guild.id,
            name: guildInfo.guild.name,
            lootMode: guildInfo.guild.loot_mode,
            memberCount: guildInfo.memberCount,
            members: guildInfo.members.map(m => ({
              id: m.id,
              name: m.name,
              level: m.level,
              zone: m.zone_id
            }))
          };
        }
      }
      
      return c.json({
        ...result,
        agent: {
          id: updatedAgent.id,
          name: updatedAgent.name,
          zone: updatedAgent.zone_id,
          stats: {
            hp: updatedAgent.hp,
            maxHp: updatedAgent.max_hp,
            atk: updatedAgent.atk,
            def: updatedAgent.def,
            spd: updatedAgent.spd,
            luck: updatedAgent.luck,
            level: updatedAgent.level,
            xp: updatedAgent.xp
          },
          gold: updatedAgent.gold,
          corruption: updatedAgent.corruption,
          isDead: updatedAgent.is_dead,
          guild: guild
        }
      });
    } catch (error) {
      console.error('Error in /action:', error);
      return c.json({ error: 'Action failed. Please check your inputs and try again.' }, 500);
    }
  });

  return app;
}
