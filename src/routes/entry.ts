import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { handleAction } from '../engine/actions.js';
import { Agent } from '../db/schema.js';
import { getGuildInfo } from '../engine/guild.js';
import {
  validateAction,
  checkRateLimit,
  getApiKeyFromRequest
} from '../utils/validation.js';

export function createEntryRoutes(db: Database.Database) {
  const app = new Hono();

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
