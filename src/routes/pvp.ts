import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { Agent, PvPMatch } from '../db/schema.js';
import { simulatePvPCombat } from '../engine/combat.js';
import { takeDamage, logActivity } from '../engine/agent.js';
import { getApiKeyFromRequest } from '../utils/validation.js';

export function createPvPRoutes(db: Database.Database) {
  const app = new Hono();

  // Challenge another agent
  app.post('/pvp/challenge', async (c) => {
    try {
      const body = await c.req.json();
      const { targetAgentId, wagerAmount } = body;
      const apiKey = getApiKeyFromRequest(c, body);

      if (!apiKey || !targetAgentId || wagerAmount === undefined) {
        return c.json({ error: 'Missing required fields' }, 400);
      }

      const challenger = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as Agent | undefined;
      if (!challenger) {
        return c.json({ error: 'Invalid API key' }, 401);
      }

      if (challenger.is_dead) {
        return c.json({ error: 'You are dead' }, 403);
      }

      // Must be in Black Pit
      if (challenger.zone_id !== 'black_pit') {
        return c.json({ error: 'You must be in The Black Pit to issue PvP challenges' }, 400);
      }

      const challenged = db.prepare('SELECT * FROM agents WHERE id = ? AND is_dead = 0').get(targetAgentId) as Agent | undefined;
      if (!challenged) {
        return c.json({ error: 'Target agent not found or is dead' }, 404);
      }

      if (challenged.zone_id !== 'black_pit') {
        return c.json({ error: 'Target agent must be in The Black Pit' }, 400);
      }

      // Check wager
      if (challenger.gold < wagerAmount || challenged.gold < wagerAmount) {
        return c.json({ error: 'Insufficient gold for wager' }, 400);
      }

      // Create PvP match
      const result = db.prepare(`
        INSERT INTO pvp_matches (challenger_id, challenged_id, wager_amount, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `).run(challenger.id, targetAgentId, wagerAmount, Date.now());

      return c.json({
        success: true,
        message: 'Challenge issued',
        matchId: result.lastInsertRowid
      });
    } catch (error) {
      console.error('Error in /pvp/challenge:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Accept PvP challenge
  app.post('/pvp/accept/:matchId', async (c) => {
    try {
      const matchId = parseInt(c.req.param('matchId'));
      const body = await c.req.json();
      const apiKey = getApiKeyFromRequest(c, body);

      if (!apiKey) {
        return c.json({ error: 'Missing apiKey' }, 400);
      }

      const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as Agent | undefined;
      if (!agent) {
        return c.json({ error: 'Invalid API key' }, 401);
      }

      const match = db.prepare('SELECT * FROM pvp_matches WHERE id = ?').get(matchId) as PvPMatch | undefined;
      if (!match) {
        return c.json({ error: 'Match not found' }, 404);
      }

      if (match.challenged_id !== agent.id) {
        return c.json({ error: 'You are not the challenged agent' }, 403);
      }

      if (match.status !== 'pending') {
        return c.json({ error: 'Match already completed or declined' }, 400);
      }

      // Get both agents
      const challenger = db.prepare('SELECT * FROM agents WHERE id = ?').get(match.challenger_id) as Agent;
      const challenged = agent;

      // Escrow wagers
      db.prepare('UPDATE agents SET gold = gold - ? WHERE id = ?').run(match.wager_amount, challenger.id);
      db.prepare('UPDATE agents SET gold = gold - ? WHERE id = ?').run(match.wager_amount, challenged.id);

      // Simulate combat
      const combatResult = simulatePvPCombat(challenger, challenged);

      // Award prize to winner
      const totalPrize = match.wager_amount * 2;
      db.prepare('UPDATE agents SET gold = gold + ? WHERE id = ?').run(totalPrize, combatResult.winner.id);

      // Apply damage
      takeDamage(db, combatResult.loser.id, combatResult.loser.hp);

      // Update match
      db.prepare(`
        UPDATE pvp_matches 
        SET status = 'completed', winner_id = ?, combat_log = ?, completed_at = ?
        WHERE id = ?
      `).run(combatResult.winner.id, JSON.stringify(combatResult.turns), Date.now(), matchId);

      // Record transaction
      db.prepare(`
        INSERT INTO transactions (from_agent_id, to_agent_id, transaction_type, gold_amount, created_at)
        VALUES (?, ?, 'pvp_wager', ?, ?)
      `).run(combatResult.loser.id, combatResult.winner.id, totalPrize, Date.now());

      // Log activity
      logActivity(db, 'pvp', `⚔️ ${combatResult.winner.name} defeated ${combatResult.loser.name} in PvP (won ${totalPrize} gold)`, combatResult.winner.name);

      return c.json({
        success: true,
        result: {
          winner: combatResult.winner.name,
          loser: combatResult.loser.name,
          prize: totalPrize,
          turns: combatResult.turns
        }
      });
    } catch (error) {
      console.error('Error in /pvp/accept:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Get PvP matches
  app.get('/pvp/matches', (c) => {
    try {
      const status = c.req.query('status') || 'all';
      
      let query = 'SELECT * FROM pvp_matches';
      const params: any[] = [];

      if (status !== 'all') {
        query += ' WHERE status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT 50';

      const matches = db.prepare(query).all(...params) as PvPMatch[];

      return c.json({
        success: true,
        matches
      });
    } catch (error) {
      console.error('Error in /pvp/matches:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Get PvP data for dashboard
  app.get('/pvp', (c) => {
    try {
      // Get active matches (pending)
      const activeMatches = db.prepare(`
        SELECT pm.*, 
          a1.name as challenger_name,
          a2.name as challenged_name
        FROM pvp_matches pm
        JOIN agents a1 ON pm.challenger_id = a1.id
        JOIN agents a2 ON pm.challenged_id = a2.id
        WHERE pm.status = 'pending'
        ORDER BY pm.created_at DESC
        LIMIT 10
      `).all() as any[];

      // Get recent completed matches
      const recentResults = db.prepare(`
        SELECT pm.*,
          a1.name as challenger_name,
          a2.name as challenged_name,
          aw.name as winner_name
        FROM pvp_matches pm
        JOIN agents a1 ON pm.challenger_id = a1.id
        JOIN agents a2 ON pm.challenged_id = a2.id
        LEFT JOIN agents aw ON pm.winner_id = aw.id
        WHERE pm.status = 'completed'
        ORDER BY pm.completed_at DESC
        LIMIT 10
      `).all() as any[];

      return c.json({
        activeMatches: activeMatches.map(m => ({
          id: m.id,
          fighter1: m.challenger_name,
          fighter2: m.challenged_name,
          wager: m.wager_amount
        })),
        recentResults: recentResults.map(m => {
          const loserName = m.winner_id === m.challenger_id ? m.challenged_name : m.challenger_name;
          return {
            winner: m.winner_name,
            loser: loserName,
            timestamp: m.completed_at,
            wager: m.wager_amount
          };
        })
      });
    } catch (error) {
      console.error('Error in /pvp:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
