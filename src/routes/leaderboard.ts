import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { getLeaderboard, getCurrentSeason, getSeasonProgress } from '../engine/seasons.js';

export function createLeaderboardRoutes(db: Database.Database) {
  const app = new Hono();

  // Get current season leaderboard
  app.get('/leaderboard', (c) => {
    try {
      const limit = parseInt(c.req.query('limit') || '100');
      const leaderboard = getLeaderboard(db, undefined, limit);

      return c.json({
        success: true,
        agents: leaderboard.map((entry: any) => ({
          rank: entry.rank,
          name: entry.agent_name,
          level: entry.xp_earned / 100 + 1, // Approximate level from XP
          xp: entry.xp_earned,
          xpEarned: entry.xp_earned,
          kills: entry.mobs_killed,
          mobsKilled: entry.mobs_killed,
          gold: entry.gold_accumulated,
          goldAccumulated: entry.gold_accumulated,
          bossDamage: entry.boss_damage,
          walletAddress: entry.wallet_address
        }))
      });
    } catch (error) {
      console.error('Error in /leaderboard:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Get season info
  app.get('/season', (c) => {
    try {
      const season = getCurrentSeason(db);
      const progress = getSeasonProgress(db);

      if (!season || !progress) {
        return c.json({ error: 'No active season' }, 404);
      }

      return c.json({
        success: true,
        season: {
          id: season.id,
          startTime: season.start_time,
          endTime: season.end_time,
          isActive: season.is_active,
          prizePool: season.prize_pool,
          progress: {
            dayNumber: progress.dayNumber,
            daysRemaining: progress.daysRemaining,
            hoursRemaining: progress.hoursRemaining,
            percentComplete: progress.percentComplete
          }
        }
      });
    } catch (error) {
      console.error('Error in /season:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
