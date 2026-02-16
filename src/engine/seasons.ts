import Database from 'better-sqlite3';
import { Season, Agent } from '../db/schema.js';

export const SEASON_DURATION_DAYS = 7;

export function initializeSeason(db: Database.Database): Season {
  const now = Date.now();
  const endTime = now + (SEASON_DURATION_DAYS * 24 * 60 * 60 * 1000);

  // Deactivate previous seasons
  db.prepare('UPDATE seasons SET is_active = 0').run();

  // Create new season
  const result = db.prepare(`
    INSERT INTO seasons (start_time, end_time, is_active, prize_pool)
    VALUES (?, ?, 1, 0)
  `).run(now, endTime);

  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(result.lastInsertRowid) as Season;
  return season;
}

export function getCurrentSeason(db: Database.Database): Season | null {
  const season = db.prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1')
    .get() as Season | undefined;
  
  return season || null;
}

export function checkSeasonEnd(db: Database.Database): boolean {
  const season = getCurrentSeason(db);
  if (!season) return false;

  const now = Date.now();
  
  if (now >= season.end_time) {
    endSeason(db, season.id);
    return true;
  }

  return false;
}

export function endSeason(db: Database.Database, seasonId: number): void {
  console.log(`Ending season ${seasonId}...`);

  // Finalize leaderboard
  updateLeaderboard(db, seasonId);

  // Award prestige points to top players
  const topPlayers = db.prepare(`
    SELECT agent_id, rank FROM leaderboard
    WHERE season_id = ? 
    ORDER BY rank ASC
    LIMIT 10
  `).all(seasonId) as { agent_id: number; rank: number }[];

  for (const player of topPlayers) {
    const prestigeBonus = calculatePrestigeBonus(player.rank);
    db.prepare('UPDATE agents SET prestige_points = prestige_points + ? WHERE id = ?')
      .run(prestigeBonus, player.agent_id);
  }

  // Mark season as inactive
  db.prepare('UPDATE seasons SET is_active = 0 WHERE id = ?').run(seasonId);

  // Start new season (no wipe — game is persistent)
  initializeSeason(db);

  console.log('New season started!');
}

function calculatePrestigeBonus(rank: number): number {
  // Rank 1: 1000 prestige
  // Rank 2: 750 prestige
  // Rank 3: 500 prestige
  // Rank 4-10: 250 prestige
  if (rank === 1) return 1000;
  if (rank === 2) return 750;
  if (rank === 3) return 500;
  if (rank <= 10) return 250;
  return 0;
}

export function updateLeaderboard(db: Database.Database, seasonId?: number): void {
  const season = seasonId 
    ? db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId) as Season
    : getCurrentSeason(db);

  if (!season) return;

  // Get all agents for this season
  const agents = db.prepare('SELECT * FROM agents WHERE season_id = ?').all(season.id) as Agent[];

  for (const agent of agents) {
    // Calculate stats
    const combatStats = db.prepare(`
      SELECT 
        COUNT(*) as mobs_killed,
        SUM(xp_gained) as total_xp,
        SUM(gold_gained) as total_gold
      FROM combat_log
      WHERE agent_id = ? AND opponent_type = 'mob'
    `).get(agent.id) as { mobs_killed: number; total_xp: number; total_gold: number };

    const bossStats = db.prepare(`
      SELECT SUM(damage_dealt) as boss_damage
      FROM combat_log
      WHERE agent_id = ? AND opponent_type = 'boss'
    `).get(agent.id) as { boss_damage: number | null };

    // Update or insert leaderboard entry
    db.prepare(`
      INSERT INTO leaderboard (
        season_id, agent_id, agent_name, wallet_address,
        xp_earned, mobs_killed, gold_accumulated, boss_damage, rank, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(season_id, agent_id) DO UPDATE SET
        xp_earned = excluded.xp_earned,
        mobs_killed = excluded.mobs_killed,
        gold_accumulated = excluded.gold_accumulated,
        boss_damage = excluded.boss_damage,
        updated_at = excluded.updated_at
    `).run(
      season.id,
      agent.id,
      agent.name,
      agent.wallet_address,
      combatStats.total_xp || 0,
      combatStats.mobs_killed || 0,
      combatStats.total_gold || 0,
      bossStats.boss_damage || 0,
      Date.now()
    );
  }

  // Calculate ranks (by XP earned)
  const leaderboardEntries = db.prepare(`
    SELECT id FROM leaderboard
    WHERE season_id = ?
    ORDER BY xp_earned DESC, mobs_killed DESC, boss_damage DESC
  `).all(season.id) as { id: number }[];

  leaderboardEntries.forEach((entry, index) => {
    db.prepare('UPDATE leaderboard SET rank = ? WHERE id = ?').run(index + 1, entry.id);
  });
}

export function getLeaderboard(db: Database.Database, seasonId?: number, limit: number = 100) {
  const season = seasonId 
    ? db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId) as Season
    : getCurrentSeason(db);

  if (!season) return [];

  return db.prepare(`
    SELECT * FROM leaderboard
    WHERE season_id = ?
    ORDER BY rank ASC
    LIMIT ?
  `).all(season.id, limit);
}

export function getSeasonProgress(db: Database.Database): {
  seasonId: number;
  dayNumber: number;
  daysRemaining: number;
  hoursRemaining: number;
  percentComplete: number;
} | null {
  const season = getCurrentSeason(db);
  if (!season) return null;

  const now = Date.now();
  const elapsed = now - season.start_time;
  const total = season.end_time - season.start_time;
  const remaining = season.end_time - now;

  const dayNumber = Math.floor(elapsed / (24 * 60 * 60 * 1000)) + 1;
  const daysRemaining = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  const hoursRemaining = Math.ceil(remaining / (60 * 60 * 1000));
  const percentComplete = Math.min(100, (elapsed / total) * 100);

  return {
    seasonId: season.id,
    dayNumber,
    daysRemaining,
    hoursRemaining,
    percentComplete
  };
}
