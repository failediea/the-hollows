/**
 * Combat system simulation and balance testing
 * Creates bot agents and runs them through multiple combats to identify balance issues
 *
 * Key improvements over original:
 * - Bots pick level-appropriate targets (not random mobs)
 * - Bots rest between fights when below 50% HP
 * - All 4 stances used in bot AI (including Evasive)
 * - Dead bots are properly skipped
 * - Per-mob win rate tracking
 * - 10 bots x 100 fights for full zone progression testing
 */

import Database from 'better-sqlite3';
import { initDatabase } from './db/schema.js';
import { createAgent, rest, gainXp } from './engine/agent.js';
import { ZONES, Mob } from './world/zones.js';
import { createCombatSession, submitRoundAction, Stance, endCombatSession } from './engine/combat-session.js';
import { Agent } from './db/schema.js';
import { secureChoice } from './engine/crypto-rng.js';
import { initializeSkills } from './engine/skills.js';

const TEST_DB_PATH = './data/test-combat.db';
const NUM_BOTS = 10;
const COMBATS_PER_BOT = 100;
const ZONE_ID = 'the_gate';

interface SimulationStats {
  totalCombats: number;
  victories: number;
  defeats: number;
  fled: number;
  totalRounds: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  stanceUsage: Record<Stance, number>;
  avgRoundsPerFight: number;
  winRate: number;
  deathRate: number;
  survivalRate: number;
}

interface BotStats extends SimulationStats {
  botName: string;
  level: number;
  finalHp: number;
}

interface MobStats {
  mobName: string;
  mobId: string;
  fights: number;
  wins: number;
  losses: number;
  flees: number;
  totalRounds: number;
  avgRounds: number;
  winRate: number;
}

/**
 * Pick a level-appropriate mob from the zone.
 * Maps bot level to mob index in the zone's mob list.
 * Level 1 → first mob (Sewer Rat), level 10 → last mob (Tomb Shade).
 */
function pickTargetMob(agentLevel: number): Mob {
  const zone = ZONES[ZONE_ID];
  const mobs = zone.mobs;
  const maxLevel = zone.maxLevel || 10;

  // Map agent level to mob index (0-based)
  // Level 1 fights mob[0], max level fights mob[last]
  const progress = Math.min(1, (agentLevel - 1) / Math.max(1, maxLevel - 1));
  const mobIndex = Math.min(mobs.length - 1, Math.floor(progress * mobs.length));

  // Allow fighting current tier or one below for variety
  const minIndex = Math.max(0, mobIndex - 1);
  const targetIndex = minIndex + Math.floor(Math.random() * (mobIndex - minIndex + 1));

  return mobs[targetIndex];
}

function createTestBot(db: Database.Database, id: number, seasonId: number) {
  const runId = Date.now().toString(36);
  const name = `TestBot_${runId}_${id}`;
  const walletAddress = `0xTEST${runId}${id.toString().padStart(30, '0')}`;

  const agent = createAgent(db, name, walletAddress, seasonId);

  // Small random stat variance for realistic spread
  const statBonus = Math.floor(Math.random() * 3);
  db.prepare(`UPDATE agents SET
    atk = atk + ?,
    def = def + ?,
    spd = spd + ?
    WHERE id = ?
  `).run(statBonus, statBonus, statBonus, agent.id);

  return db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id) as Agent;
}

function simulateOneCombat(db: Database.Database, agent: Agent, mob: Mob): {
  won: boolean;
  fled: boolean;
  rounds: number;
  damageDealt: number;
  damageTaken: number;
  stances: Stance[];
  mobName: string;
} {
  const session = createCombatSession(db, agent, mob);

  const stances: Stance[] = [];

  let totalDamageDealt = 0;
  let totalDamageTaken = 0;
  let rounds = 0;

  // Simulate combat rounds with improved AI
  while (session.status === 'awaiting_input' && rounds < 50) {
    rounds++;

    const hpPercent = session.playerState.hp / session.playerState.maxHp;
    let stance: Stance;

    // Improved bot strategy with all 4 stances:
    // - Flee when HP < 15%
    // - Defensive/Evasive when HP < 35%
    // - Balanced/Evasive when HP 35-65%
    // - Aggressive/Balanced when HP > 65%

    if (hpPercent < 0.15) {
      // Try to flee at critically low HP
      const resolution = submitRoundAction(session.id, 'evasive', { type: 'flee' });
      if (!resolution) break;

      stances.push('evasive');
      totalDamageDealt += resolution.playerDamageDealt;
      totalDamageTaken += resolution.playerDamageTaken;

      if (resolution.events.includes('fled')) {
        break;
      }
      continue;
    } else if (hpPercent < 0.35) {
      // Low HP: primarily defensive, mix in evasive
      stance = secureChoice(['defensive', 'defensive', 'evasive', 'balanced'] as Stance[]);
    } else if (hpPercent < 0.65) {
      // Mid HP: balanced play, sprinkle evasive
      stance = secureChoice(['balanced', 'balanced', 'aggressive', 'evasive'] as Stance[]);
    } else {
      // High HP: mostly aggressive, some balanced/evasive
      stance = secureChoice(['aggressive', 'aggressive', 'balanced', 'evasive'] as Stance[]);
    }

    stances.push(stance);

    // Choose action based on stamina and stance
    let action: any = { type: 'basic_attack' };

    if (session.playerState.stamina >= 3) {
      // Use power strike when available and in aggressive/balanced stance
      const powerStrike = session.playerState.abilities.find(a => a.id === 'power_strike');
      if (powerStrike && powerStrike.cooldown === 0 && (stance === 'aggressive' || stance === 'balanced')) {
        action = { type: 'ability', abilityId: 'power_strike' };
      }
    }

    if (session.playerState.stamina >= 2 && stance === 'balanced' && rounds % 4 === 0) {
      // Occasionally shield bash for stun
      const shieldBash = session.playerState.abilities.find(a => a.id === 'shield_bash');
      if (shieldBash && shieldBash.cooldown === 0) {
        action = { type: 'ability', abilityId: 'shield_bash' };
      }
    }

    if (session.playerState.stamina < 4 && stance === 'defensive' && rounds % 3 === 0) {
      // Guard to recover stamina when defensive and low on stamina
      action = { type: 'guard' };
    }

    const resolution = submitRoundAction(session.id, stance, action);
    if (!resolution) break;

    totalDamageDealt += resolution.playerDamageDealt;
    totalDamageTaken += resolution.playerDamageTaken;
  }

  // Update agent HP in database
  const finalHp = Math.max(0, session.playerState.hp);
  db.prepare('UPDATE agents SET hp = ? WHERE id = ?').run(finalHp, agent.id);

  // Handle permadeath
  if (finalHp <= 0) {
    const goldLost = Math.floor(agent.gold * 0.5);
    db.prepare('UPDATE agents SET hp = 0, is_dead = 1, gold = gold - ? WHERE id = ?').run(goldLost, agent.id);
  }

  // Clean up session
  endCombatSession(session.id);

  return {
    won: session.status === 'victory',
    fled: session.status === 'fled',
    rounds,
    damageDealt: totalDamageDealt,
    damageTaken: totalDamageTaken,
    stances,
    mobName: mob.name,
  };
}

function runSimulation(): BotStats[] {
  // Create fresh test database
  const db = initDatabase(TEST_DB_PATH);
  initializeSkills(db);

  // Create test season
  const season = db.prepare(`
    INSERT INTO seasons (start_time, end_time, is_active)
    VALUES (?, ?, 1)
  `).run(Date.now(), Date.now() + 86400000);
  const seasonId = season.lastInsertRowid as number;

  console.log(`\n🧪 Starting Combat Simulation (${NUM_BOTS} bots x ${COMBATS_PER_BOT} fights)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const botStats: BotStats[] = [];
  const mobStatsMap: Record<string, MobStats> = {};

  // Initialize per-mob tracking
  for (const mob of ZONES[ZONE_ID].mobs) {
    mobStatsMap[mob.id] = {
      mobName: mob.name,
      mobId: mob.id,
      fights: 0,
      wins: 0,
      losses: 0,
      flees: 0,
      totalRounds: 0,
      avgRounds: 0,
      winRate: 0,
    };
  }

  for (let i = 0; i < NUM_BOTS; i++) {
    const bot = createTestBot(db, i + 1, seasonId);

    const stats: BotStats = {
      botName: bot.name,
      level: bot.level,
      finalHp: bot.hp,
      totalCombats: 0,
      victories: 0,
      defeats: 0,
      fled: 0,
      totalRounds: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      stanceUsage: {
        aggressive: 0,
        balanced: 0,
        defensive: 0,
        evasive: 0,
      },
      avgRoundsPerFight: 0,
      winRate: 0,
      deathRate: 0,
      survivalRate: 0,
    };

    console.log(`🤖 ${bot.name} (HP: ${bot.hp}, ATK: ${bot.atk}, DEF: ${bot.def}, SPD: ${bot.spd})`);

    for (let fight = 0; fight < COMBATS_PER_BOT; fight++) {
      // Reload agent data
      const currentBot = db.prepare('SELECT * FROM agents WHERE id = ?').get(bot.id) as Agent;

      // Skip dead bots
      if (currentBot.is_dead) {
        console.log(`  💀 Bot died after ${fight} combats`);
        break;
      }

      // REST if below 50% HP (mimics real player behavior)
      const hpPercent = currentBot.hp / currentBot.max_hp;
      if (hpPercent < 0.50 && currentBot.hp > 0) {
        rest(db, currentBot.id);
        const afterRest = db.prepare('SELECT hp FROM agents WHERE id = ?').get(bot.id) as { hp: number };
        console.log(`  💤 Rested: ${currentBot.hp} → ${afterRest.hp} HP`);
      }

      // Reload after rest
      const readyBot = db.prepare('SELECT * FROM agents WHERE id = ?').get(bot.id) as Agent;

      // Pick level-appropriate target
      const mob = pickTargetMob(readyBot.level);

      stats.totalCombats++;

      const result = simulateOneCombat(db, readyBot, mob);

      stats.totalRounds += result.rounds;
      stats.totalDamageDealt += result.damageDealt;
      stats.totalDamageTaken += result.damageTaken;

      // Track per-mob stats
      const ms = mobStatsMap[mob.id];
      if (ms) {
        ms.fights++;
        ms.totalRounds += result.rounds;
        if (result.won) ms.wins++;
        else if (result.fled) ms.flees++;
        else ms.losses++;
      }

      if (result.won) {
        stats.victories++;
        // Grant XP so bots level up
        gainXp(db, readyBot.id, mob.xp_reward);
        console.log(`  ✅ vs ${mob.name} — Victory in ${result.rounds}R (dealt: ${result.damageDealt}, took: ${result.damageTaken})`);
      } else if (result.fled) {
        stats.fled++;
        console.log(`  🏃 vs ${mob.name} — Fled after ${result.rounds}R (dealt: ${result.damageDealt}, took: ${result.damageTaken})`);
      } else {
        stats.defeats++;
        console.log(`  ❌ vs ${mob.name} — Defeat in ${result.rounds}R (dealt: ${result.damageDealt}, took: ${result.damageTaken})`);
      }

      // Count stance usage
      result.stances.forEach(stance => {
        stats.stanceUsage[stance]++;
      });
    }

    // Calculate final stats
    const finalBot = db.prepare('SELECT * FROM agents WHERE id = ?').get(bot.id) as Agent;
    stats.finalHp = finalBot.hp;
    stats.level = finalBot.level;
    stats.avgRoundsPerFight = stats.totalCombats > 0 ? stats.totalRounds / stats.totalCombats : 0;
    stats.winRate = stats.totalCombats > 0 ? (stats.victories / stats.totalCombats) * 100 : 0;
    stats.deathRate = finalBot.is_dead ? 100 : 0;
    stats.survivalRate = finalBot.is_dead ? 0 : 100;

    botStats.push(stats);
    console.log(`  Final: L${stats.level} ${stats.victories}W-${stats.defeats}L-${stats.fled}F | HP: ${stats.finalHp} | Win Rate: ${stats.winRate.toFixed(1)}%\n`);
  }

  // ============ AGGREGATE STATISTICS ============
  console.log(`\n📊 AGGREGATE STATISTICS`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const totalCombats = botStats.reduce((sum, s) => sum + s.totalCombats, 0);
  const totalVictories = botStats.reduce((sum, s) => sum + s.victories, 0);
  const totalDefeats = botStats.reduce((sum, s) => sum + s.defeats, 0);
  const totalFled = botStats.reduce((sum, s) => sum + s.fled, 0);
  const avgWinRate = totalCombats > 0 ? (totalVictories / totalCombats) * 100 : 0;
  const deaths = botStats.filter(s => s.deathRate > 0).length;
  const deathRate = (deaths / NUM_BOTS) * 100;
  const avgRounds = botStats.reduce((sum, s) => sum + s.avgRoundsPerFight, 0) / botStats.length;
  const avgLevel = botStats.reduce((sum, s) => sum + s.level, 0) / botStats.length;

  console.log(`Total Combats: ${totalCombats}`);
  console.log(`Victories: ${totalVictories} (${((totalVictories / totalCombats) * 100).toFixed(1)}%)`);
  console.log(`Defeats: ${totalDefeats} (${((totalDefeats / totalCombats) * 100).toFixed(1)}%)`);
  console.log(`Fled: ${totalFled} (${((totalFled / totalCombats) * 100).toFixed(1)}%)`);
  console.log(`Overall Win Rate: ${avgWinRate.toFixed(1)}%`);
  console.log(`Death Rate: ${deathRate.toFixed(1)}% (${deaths}/${NUM_BOTS} bots died)`);
  console.log(`Average Rounds per Fight: ${avgRounds.toFixed(1)}`);
  console.log(`Average Final Level: ${avgLevel.toFixed(1)}`);

  // ============ PER-MOB WIN RATES ============
  console.log(`\n🐾 PER-MOB WIN RATES`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  for (const mob of ZONES[ZONE_ID].mobs) {
    const ms = mobStatsMap[mob.id];
    if (ms.fights === 0) {
      console.log(`${mob.name.padEnd(20)}: No fights`);
      continue;
    }
    ms.avgRounds = ms.totalRounds / ms.fights;
    ms.winRate = (ms.wins / ms.fights) * 100;
    const bar = '█'.repeat(Math.floor(ms.winRate / 5));
    console.log(`${mob.name.padEnd(20)}: ${ms.fights.toString().padStart(3)} fights | ${ms.winRate.toFixed(0).padStart(3)}% win | ${ms.avgRounds.toFixed(1).padStart(4)}R avg | ${ms.wins}W ${ms.losses}L ${ms.flees}F ${bar}`);
  }

  // ============ STANCE USAGE ============
  console.log(`\n📈 STANCE USAGE DISTRIBUTION`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const totalStances = {
    aggressive: botStats.reduce((sum, s) => sum + s.stanceUsage.aggressive, 0),
    balanced: botStats.reduce((sum, s) => sum + s.stanceUsage.balanced, 0),
    defensive: botStats.reduce((sum, s) => sum + s.stanceUsage.defensive, 0),
    evasive: botStats.reduce((sum, s) => sum + s.stanceUsage.evasive, 0),
  };

  const totalStanceCount = Object.values(totalStances).reduce((sum, v) => sum + v, 0);

  Object.entries(totalStances).forEach(([stance, count]) => {
    const percent = totalStanceCount > 0 ? ((count / totalStanceCount) * 100).toFixed(1) : '0.0';
    const bar = '█'.repeat(Math.floor(parseFloat(percent) / 2));
    console.log(`${stance.padEnd(12)}: ${count.toString().padStart(4)} (${percent.padStart(5)}%) ${bar}`);
  });

  // ============ BALANCE ASSESSMENT ============
  console.log(`\n⚠️  BALANCE ASSESSMENT`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Win rate check (target: 50-70%)
  if (avgWinRate < 40) {
    console.log(`❌ Win rate too low (${avgWinRate.toFixed(1)}%) — Combat too difficult`);
    console.log(`   Target: 50-70%. Consider: increase player ATK or reduce enemy HP/ATK\n`);
  } else if (avgWinRate > 80) {
    console.log(`❌ Win rate too high (${avgWinRate.toFixed(1)}%) — Combat too easy`);
    console.log(`   Target: 50-70%. Consider: reduce player ATK or increase enemy stats\n`);
  } else if (avgWinRate >= 50 && avgWinRate <= 70) {
    console.log(`✅ Win rate in target range (${avgWinRate.toFixed(1)}%, target: 50-70%)\n`);
  } else {
    console.log(`⚠️  Win rate acceptable but outside ideal range (${avgWinRate.toFixed(1)}%, target: 50-70%)\n`);
  }

  // Death rate check (target: <15%)
  if (deathRate > 30) {
    console.log(`❌ Death rate too high (${deathRate.toFixed(1)}%) — Too punishing`);
    console.log(`   Target: <15%. Consider: increase base HP or reduce enemy damage\n`);
  } else if (deathRate <= 15) {
    console.log(`✅ Death rate within target (${deathRate.toFixed(1)}%, target: <15%)\n`);
  } else {
    console.log(`⚠️  Death rate elevated (${deathRate.toFixed(1)}%, target: <15%)\n`);
  }

  // Combat length check (target: 3-8 rounds)
  if (avgRounds < 3) {
    console.log(`❌ Fights too short (${avgRounds.toFixed(1)} rounds, target: 3-8)`);
    console.log(`   Consider: increase HP pools or reduce damage output\n`);
  } else if (avgRounds > 10) {
    console.log(`❌ Fights too long (${avgRounds.toFixed(1)} rounds, target: 3-8)`);
    console.log(`   Consider: increase damage output or reduce HP pools\n`);
  } else if (avgRounds >= 3 && avgRounds <= 8) {
    console.log(`✅ Combat length in target range (${avgRounds.toFixed(1)} rounds, target: 3-8)\n`);
  } else {
    console.log(`⚠️  Combat length slightly off (${avgRounds.toFixed(1)} rounds, target: 3-8)\n`);
  }

  // Stance balance check
  const stanceCounts = Object.values(totalStances);
  const maxStance = Math.max(...stanceCounts);
  const minStance = Math.min(...stanceCounts);
  const stanceImbalance = minStance > 0 ? maxStance / minStance : Infinity;

  if (stanceImbalance > 5) {
    console.log(`❌ Stance usage heavily skewed (${stanceImbalance.toFixed(1)}x difference)`);
    const mostUsed = Object.entries(totalStances).find(([_, v]) => v === maxStance)?.[0];
    const leastUsed = Object.entries(totalStances).find(([_, v]) => v === minStance)?.[0];
    console.log(`   Most used: ${mostUsed}, Least used: ${leastUsed}\n`);
  } else if (stanceImbalance <= 3) {
    console.log(`✅ Stance usage reasonably balanced (${stanceImbalance.toFixed(1)}x spread)\n`);
  } else {
    console.log(`⚠️  Moderate stance imbalance (${stanceImbalance.toFixed(1)}x spread)\n`);
  }

  // Per-mob difficulty curve check
  console.log(`\n🎯 DIFFICULTY CURVE`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  let prevWinRate = 100;
  let curveOk = true;
  for (const mob of ZONES[ZONE_ID].mobs) {
    const ms = mobStatsMap[mob.id];
    if (ms.fights < 3) continue; // Not enough data
    if (ms.winRate > prevWinRate + 20) {
      console.log(`⚠️  ${mob.name} is EASIER than previous mob (${ms.winRate.toFixed(0)}% vs ${prevWinRate.toFixed(0)}%)`);
      curveOk = false;
    }
    prevWinRate = ms.winRate;
  }
  if (curveOk) {
    console.log(`✅ Difficulty increases progressively through mob list\n`);
  }

  console.log(`\n✨ Simulation complete! Test database saved at: ${TEST_DB_PATH}\n`);

  db.close();
  return botStats;
}

// Run simulation
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runSimulation();
  } catch (error) {
    console.error('Simulation error:', error);
    process.exit(1);
  }
}

export { runSimulation };
