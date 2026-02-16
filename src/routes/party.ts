/**
 * Party & Loot Roll API Routes
 */

import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { Agent } from '../db/schema.js';
import {
  createParty,
  joinParty,
  inviteToParty,
  acceptInvite,
  declineInvite,
  leaveParty,
  kickFromParty,
  getMyParty,
  getOpenParties,
  getLootRoll,
} from '../engine/party.js';
import { getApiKeyFromRequest } from '../utils/validation.js';

function getAgentByApiKey(db: Database.Database, apiKey: string): Agent | null {
  return (db.prepare('SELECT * FROM agents WHERE api_key = ? AND is_dead = 0').get(apiKey) as Agent) || null;
}

export function createPartyRoutes(db: Database.Database) {
  const app = new Hono();

  // POST /party/create
  app.post('/party/create', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const apiKey = getApiKeyFromRequest(c, body);
    if (!apiKey) return c.json({ error: 'API key required' }, 401);
    const agent = getAgentByApiKey(db, apiKey);
    if (!agent) return c.json({ error: 'Invalid API key or dead agent' }, 401);

    const result = createParty(db, agent.id, body.open !== false);
    if (!result.success) return c.json({ error: result.message }, 400);
    return c.json({ success: true, message: result.message, party: formatParty(result.party!) });
  });

  // POST /party/join/:partyId
  app.post('/party/join/:partyId', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const apiKey = getApiKeyFromRequest(c, body);
    if (!apiKey) return c.json({ error: 'API key required' }, 401);
    const agent = getAgentByApiKey(db, apiKey);
    if (!agent) return c.json({ error: 'Invalid API key or dead agent' }, 401);

    const partyId = c.req.param('partyId');
    const result = joinParty(db, agent.id, partyId);
    if (!result.success) return c.json({ error: result.message }, 400);
    return c.json({ success: true, message: result.message, party: formatParty(result.party!) });
  });

  // POST /party/invite
  app.post('/party/invite', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const apiKey = getApiKeyFromRequest(c, body);
    if (!apiKey) return c.json({ error: 'API key required' }, 401);
    const agent = getAgentByApiKey(db, apiKey);
    if (!agent) return c.json({ error: 'Invalid API key or dead agent' }, 401);

    if (!body.partyId || !body.targetAgent) {
      return c.json({ error: 'partyId and targetAgent required' }, 400);
    }

    const result = inviteToParty(db, agent.id, body.partyId, body.targetAgent);
    if (!result.success) return c.json({ error: result.message }, 400);
    return c.json({ success: true, message: result.message });
  });

  // POST /party/accept-invite
  app.post('/party/accept-invite', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const apiKey = getApiKeyFromRequest(c, body);
    if (!apiKey) return c.json({ error: 'API key required' }, 401);
    const agent = getAgentByApiKey(db, apiKey);
    if (!agent) return c.json({ error: 'Invalid API key or dead agent' }, 401);

    const result = acceptInvite(db, agent.id);
    if (!result.success) return c.json({ error: result.message }, 400);
    return c.json({ success: true, message: result.message, party: result.party ? formatParty(result.party) : null });
  });

  // POST /party/decline-invite
  app.post('/party/decline-invite', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const apiKey = getApiKeyFromRequest(c, body);
    if (!apiKey) return c.json({ error: 'API key required' }, 401);
    const agent = getAgentByApiKey(db, apiKey);
    if (!agent) return c.json({ error: 'Invalid API key or dead agent' }, 401);

    const result = declineInvite(agent.id);
    if (!result.success) return c.json({ error: result.message }, 400);
    return c.json({ success: true, message: result.message });
  });

  // POST /party/leave
  app.post('/party/leave', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const apiKey = getApiKeyFromRequest(c, body);
    if (!apiKey) return c.json({ error: 'API key required' }, 401);
    const agent = getAgentByApiKey(db, apiKey);
    if (!agent) return c.json({ error: 'Invalid API key or dead agent' }, 401);

    const result = leaveParty(agent.id);
    if (!result.success) return c.json({ error: result.message }, 400);
    return c.json({ success: true, message: result.message });
  });

  // POST /party/kick
  app.post('/party/kick', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const apiKey = getApiKeyFromRequest(c, body);
    if (!apiKey) return c.json({ error: 'API key required' }, 401);
    const agent = getAgentByApiKey(db, apiKey);
    if (!agent) return c.json({ error: 'Invalid API key or dead agent' }, 401);

    if (!body.targetAgentId) return c.json({ error: 'targetAgentId required' }, 400);

    const result = kickFromParty(agent.id, body.targetAgentId);
    if (!result.success) return c.json({ error: result.message }, 400);
    return c.json({ success: true, message: result.message });
  });

  // GET /party/mine
  app.get('/party/mine', async (c) => {
    const apiKey = getApiKeyFromRequest(c);
    if (!apiKey) return c.json({ error: 'API key required' }, 401);
    const agent = getAgentByApiKey(db, apiKey);
    if (!agent) return c.json({ error: 'Invalid API key or dead agent' }, 401);

    const party = getMyParty(agent.id);
    if (!party) return c.json({ success: true, party: null });
    return c.json({ success: true, party: formatParty(party) });
  });

  // GET /party/open
  app.get('/party/open', async (c) => {
    const apiKey = getApiKeyFromRequest(c);
    if (!apiKey) return c.json({ error: 'API key required' }, 401);
    const agent = getAgentByApiKey(db, apiKey);
    if (!agent) return c.json({ error: 'Invalid API key or dead agent' }, 401);

    const openParties = getOpenParties(agent.zone_id);
    return c.json({
      success: true,
      parties: openParties.map(p => formatParty(p)),
    });
  });

  // GET /loot-roll/:combatId
  app.get('/loot-roll/:combatId', (c) => {
    const combatId = c.req.param('combatId');
    const roll = getLootRoll(combatId);
    if (!roll) return c.json({ error: 'Loot roll not found' }, 404);
    return c.json({ success: true, lootRoll: roll });
  });

  return app;
}

function formatParty(party: any) {
  return {
    id: party.id,
    leaderId: party.leaderId,
    members: party.members.map((m: any) => ({
      agentId: m.agentId,
      agentName: m.agentName,
      level: m.level,
      hp: m.hp,
      maxHp: m.maxHp,
      zone: m.zone,
    })),
    maxSize: party.maxSize,
    isOpen: party.isOpen,
    createdAt: party.createdAt,
  };
}
