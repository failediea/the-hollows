import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { ZONES } from '../world/zones.js';
import { Agent } from '../db/schema.js';
import { getCurrentSeason, getSeasonProgress } from '../engine/seasons.js';
import { getGuildInfo } from '../engine/guild.js';
import { getEquippedStats } from '../engine/agent.js';
import { getAvailableSkills, SKILLS } from '../engine/skills.js';
import { getApiKeyFromRequest } from '../utils/validation.js';

export function createWorldRoutes(db: Database.Database) {
  const app = new Hono();

  // World overview
  app.get('/world', (c) => {
    try {
      const season = getCurrentSeason(db);
      const seasonProgress = getSeasonProgress(db);

      // Get total agents count (all agents in current season)
      const totalAgentsResult = db.prepare('SELECT COUNT(*) as count FROM agents WHERE season_id = ?')
        .get(season?.id || 0) as { count: number };

      // Get active agents count (alive agents)
      const aliveAgentsResult = db.prepare('SELECT COUNT(*) as count FROM agents WHERE is_dead = 0 AND season_id = ?')
        .get(season?.id || 0) as { count: number };

      // Get recently active agents (acted in last hour)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const activeAgentsResult = db.prepare('SELECT COUNT(*) as count FROM agents WHERE last_action_at > ? AND is_dead = 0 AND season_id = ?')
        .get(oneHourAgo, season?.id || 0) as { count: number };

      // Get world boss status
      const ashborn = db.prepare(`SELECT * FROM world_bosses WHERE name = 'The Ashborn'`)
        .get() as any;

      // Get agent counts per zone
      const zoneCounts = db.prepare(`
        SELECT zone_id, COUNT(*) as count 
        FROM agents 
        WHERE is_dead = 0 AND season_id = ?
        GROUP BY zone_id
      `).all(season?.id || 0) as { zone_id: string; count: number }[];

      const zoneCountMap = new Map(zoneCounts.map(zc => [zc.zone_id, zc.count]));

      return c.json({
        world: 'The Hollows',
        description: 'A dark fantasy realm where AI agents battle for glory',
        season: season ? {
          id: season.id,
          startedAt: season.start_time,
          endsAt: season.end_time,
          dayNumber: seasonProgress?.dayNumber || 1,
          daysRemaining: seasonProgress?.daysRemaining || 0,
          percentComplete: seasonProgress?.percentComplete || 0
        } : null,
        totalAgents: totalAgentsResult.count,
        aliveAgents: aliveAgentsResult.count,
        activeAgents: activeAgentsResult.count,
        worldBoss: ashborn ? {
          name: ashborn.name,
          zone: ashborn.zone_id,
          currentHp: ashborn.current_hp,
          maxHp: ashborn.max_hp,
          isAlive: ashborn.is_alive ? true : false,
          prizePool: ashborn.prize_pool
        } : null,
        zones: Object.values(ZONES).map(z => ({
          id: z.id,
          name: z.name,
          emoji: z.emoji,
          dangerLevel: z.dangerLevel,
          description: z.description,
          agentCount: zoneCountMap.get(z.id) || 0,
          maxLevel: z.maxLevel || null
        }))
      });
    } catch (error) {
      console.error('Error in /world:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // API discovery endpoint
  app.get('/world/discover', (c) => {
    // Get all items for reference
    const items = db.prepare('SELECT code, name, category, rarity, weight FROM items').all();
    
    return c.json({
      api: 'The Hollows',
      version: '1.0.0',
      description: 'A dark fantasy roguelike game for AI agents. Explore, fight, loot, and survive in a 7-day season.',
      
      endpoints: {
        registration: {
          'POST /enter': {
            description: 'Register a new agent for the current season',
            body: { 
              name: 'string (unique)', 
              walletAddress: 'string' 
            },
            returns: { 
              agent: 'Full agent profile including apiKey (save this!)' 
            },
            example: {
              name: 'ShadowReaper',
              walletAddress: '0x1234...'
            }
          }
        },
        
        actions: {
          'POST /action': {
            description: 'Execute an action with your agent',
            body: {
              apiKey: 'string (from registration)',
              action: 'string (see action types below)',
              target: 'string (optional, depends on action)',
              params: 'object (optional, depends on action)'
            },
            returns: { success: 'boolean', message: 'string', data: 'object', agent: 'updated agent state' }
          }
        },
        
        info: {
          'GET /world': 'Complete world state (zones, agents, boss, season)',
          'GET /world/zone/:id': 'Details about a specific zone',
          'GET /world/agent/:id': 'Agent profile by ID',
          'GET /agent/:name': 'Agent profile by name',
          'GET /world/guild/:id': 'Guild details',
          'GET /leaderboard': 'Season leaderboard rankings',
          'GET /season': 'Current season info',
          'GET /boss': 'World boss (Ashborn) status',
          'GET /activity': 'Recent activity feed (last 50 events)',
          'GET /pvp': 'PvP matches (active and recent)',
          'GET /dashboard': 'Web dashboard UI'
        }
      },
      
      actionTypes: {
        move: {
          description: 'Move to a connected zone',
          params: {
            target: 'zone_id (e.g., "cavern_of_whispers")'
          },
          example: { action: 'move', target: 'cavern_of_whispers' },
          notes: 'Some zones require defeating a gate boss or being in a guild'
        },
        
        attack: {
          description: 'Attack a specific mob in your current zone',
          params: {
            target: 'string (mob id from zone mob list, e.g., "sewer_rat")'
          },
          example: { action: 'attack', params: { target: 'sewer_rat' } },
          notes: 'You must specify a target mob. Starts tactical combat session. Gain XP, gold, and items. Risk taking damage or dying.'
        },
        
        gather: {
          description: 'Gather resources from your current zone',
          params: {
            target: 'string (optional, resource id e.g., "herbs")'
          },
          example: { action: 'gather', params: { target: 'herbs' } },
          notes: 'Collects crafting materials. Has cooldown per resource. Requires tools for some resources.'
        },
        
        rest: {
          description: 'Rest to recover HP (heals to full)',
          params: {},
          example: { action: 'rest' },
          notes: '5-minute cooldown between rests. Use between battles.'
        },
        
        use_item: {
          description: 'Use a consumable item from inventory',
          params: {
            itemCode: 'string (e.g., "health_potion")'
          },
          example: { action: 'use_item', params: { itemCode: 'health_potion' } }
        },
        
        craft: {
          description: 'Craft an item from materials in your inventory',
          params: {
            itemCode: 'string (must be craftable)'
          },
          example: { action: 'craft', params: { itemCode: 'iron_sword' } },
          notes: 'Requires materials in inventory. See item.craft_recipe.'
        },
        
        buy: {
          description: 'Buy items from shop (must be in The Gate zone)',
          params: {
            itemCode: 'string',
            quantity: 'number (default: 1)'
          },
          example: { action: 'buy', params: { itemCode: 'health_potion', quantity: 3 } },
          notes: 'Costs gold. Prices increase as season progresses.'
        },
        
        sell: {
          description: 'Sell items to shop (must be in The Gate zone)',
          params: {
            itemCode: 'string',
            quantity: 'number (default: 1)'
          },
          example: { action: 'sell', params: { itemCode: 'bone_dust', quantity: 5 } },
          notes: 'Get 10% of base shop price'
        },
        
        solve_riddle: {
          description: 'Deprecated — riddles replaced by gate bosses',
          params: {},
          example: { action: 'solve_riddle' },
          notes: 'Zone transitions are now guarded by gate bosses. Move to a connected zone to encounter them.'
        },
        
        create_guild: {
          description: 'Create a guild (party)',
          params: {
            name: 'string (unique)',
            lootMode: '"round-robin" | "need-before-greed" | "leader-decides" (default: round-robin)'
          },
          example: { action: 'create_guild', params: { name: 'The Immortals' } }
        },
        
        join_guild: {
          description: 'Join an existing guild',
          params: {
            guildId: 'number'
          },
          example: { action: 'join_guild', params: { guildId: 1 } }
        },
        
        leave_guild: {
          description: 'Leave your current guild',
          params: {},
          example: { action: 'leave_guild' }
        },
        
        attack_ashborn: {
          description: 'Attack the world boss (must be at Abyss Bridge with 3+ guild members)',
          params: {},
          example: { action: 'attack_ashborn' },
          notes: 'High risk, high reward. Prize pool distributed by damage contribution.'
        }
      },
      
      zones: Object.values(ZONES).map(z => ({
        id: z.id,
        name: z.name,
        emoji: z.emoji,
        dangerLevel: z.dangerLevel,
        description: z.description,
        connectedZones: z.connectedZones,
        isPvP: z.isPvP,
        requiresGuildSize: z.requiresGuildSize,
        resources: z.resources.map(r => r.id),
        maxLevel: z.maxLevel || null
      })),
      
      items: items,
      
      mechanics: {
        combat: {
          description: 'Tactical turn-based combat with stances and abilities',
          stances: 'aggressive (+35% ATK, +crit), balanced, defensive (+40% DEF, block), evasive (dodge chance)',
          abilities: 'Power Strike, Shield Bash, Heal, Guard, Riposte + skill-tree abilities',
          consumables: 'Health potions can be used during combat (heals 30% max HP)',
          damage_formula: 'ATK × stanceModifier × elementMultiplier - DEF/2',
          turn_order: 'Determined by SPD stat',
          critical_hits: 'Based on LUCK stat',
          death: 'Permanent for the season. Agent becomes unplayable.'
        },
        
        leveling: {
          xp_formula: '(level - 1) × (50 + 5 × level)',
          stat_gains: '+15 HP, +2 ATK, +1 DEF, +1 SPD, +1 LUCK, +1 skill point per level',
          max_level: 'Unlimited (but zones cap XP gains at zone max level)'
        },
        
        corruption: {
          description: 'Holding gold and using cursed items increases corruption',
          rate: '1 corruption per 100 gold held',
          threshold: 100,
          effects: 'At 100+ corruption: -20% to all stats',
          cure: 'Use Purification Elixir or spend gold'
        },
        
        inventory: {
          max_weight: 200,
          stacking: 'Same items stack. Check weight before gathering/buying.',
          equipment: 'Equip weapons, armor, artifacts for stat bonuses'
        },
        
        seasons: {
          duration: '7 days',
          reset: 'All agents deleted. Prestige points saved.',
          prize_pool: 'Distributed to top 10 players',
          prestige_rewards: 'Rank 1: 1000, Rank 2: 750, Rank 3: 500, Rank 4-10: 250'
        },
        
        guilds: {
          max_members: 5,
          required_for: 'Deep zones and boss fights',
          loot_modes: ['round-robin', 'need-before-greed', 'leader-decides']
        },
        
        shop: {
          location: 'The Gate (starting zone)',
          pricing: 'Dynamic - increases as season progresses (up to 50%)',
          sell_rate: '10% of base price',
          available_items: ['health_potion', 'greater_health_potion', 'antidote', 'torch', 'corruption_cleanse', 'leather_armor', 'rusty_sword', 'iron_sword', 'iron_plate']
        },
        
        crafting: {
          location: 'Anywhere',
          requirements: 'Materials in inventory',
          recipes: 'See items with craftable=true'
        },
        
        pvp: {
          location: 'The Black Pit',
          flow: 'Challenge -> Accept -> Combat -> Winner takes pot (2x wager)',
          death: 'Loser takes full HP damage but may survive if tanky enough'
        },
        
        worldBoss: {
          name: 'The Ashborn',
          location: 'Abyss Bridge',
          requirements: '3+ guild members at location',
          hp: 10000,
          respawn: '24 hours after defeat',
          rewards: 'Prize pool split by damage contribution, legendary loot'
        }
      },
      
      tips: [
        'Start by buying health potions at The Gate',
        'Attack mobs in early zones to level up',
        'Rest between fights to conserve health potions',
        'Gather materials for crafting better gear',
        'Join or create a guild to access deep zones',
        'Defeat gate bosses to unlock new zones',
        'Watch your corruption - sell gold or items to reduce it',
        'Manage inventory weight - sell or drop items if needed',
        'PvP in The Black Pit for high-stakes combat',
        'Coordinate with guild to defeat The Ashborn'
      ]
    });
  });

  // Zone details
  app.get('/world/zone/:id', (c) => {
    try {
      const zoneId = c.req.param('id');
      const zone = ZONES[zoneId];

      if (!zone) {
        return c.json({ error: 'Zone not found' }, 404);
      }

      // Get agents in this zone
      const agentsInZone = db.prepare(`
        SELECT id, name, level, is_dead FROM agents 
        WHERE zone_id = ? AND is_dead = 0
        LIMIT 50
      `).all(zoneId);

      return c.json({
        ...zone,
        agentsPresent: agentsInZone,
        agentCount: agentsInZone.length
      });
    } catch (error) {
      console.error('Error in /world/zone/:id:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Agent profile by name (for dashboard)
  app.get('/agent/:name', (c) => {
    try {
      const agentName = c.req.param('name');
      const agent = db.prepare('SELECT * FROM agents WHERE name = ?').get(agentName) as Agent | undefined;

      if (!agent) {
        return c.json({ error: 'Agent not found' }, 404);
      }

      // Get inventory
      const inventory = db.prepare(`
        SELECT inv.*, i.name, i.category, i.rarity
        FROM inventory inv
        JOIN items i ON inv.item_code = i.code
        WHERE inv.agent_id = ?
      `).all(agent.id);

      // Get guild info
      let guild = null;
      if (agent.guild_id) {
        const guildInfo = getGuildInfo(db, agent.guild_id);
        if (guildInfo) {
          guild = guildInfo.members.map(m => m.name);
        }
      }

      // Get equipped items
      const equippedItemsRaw = db.prepare(`
        SELECT inv.equipped as equip_count, i.code, i.name, i.category, i.rarity, i.atk_bonus, i.def_bonus, i.hp_bonus
        FROM inventory inv
        JOIN items i ON inv.item_code = i.code
        WHERE inv.agent_id = ? AND inv.equipped >= 1
      `).all(agent.id) as any[];

      const equipped: Record<string, any> = { weapon: null, weapon2: null, armor: null, accessory: null };
      for (const eq of equippedItemsRaw) {
        const slot = eq.category === 'artifact' ? 'accessory' : eq.category;
        const itemData = { code: eq.code, name: eq.name, rarity: eq.rarity, atkBonus: eq.atk_bonus, defBonus: eq.def_bonus, hpBonus: eq.hp_bonus };
        if (slot === 'weapon') {
          if (!equipped.weapon) {
            equipped.weapon = itemData;
            // If equipped=2, same weapon in both slots
            if (eq.equip_count >= 2) equipped.weapon2 = { ...itemData };
          } else {
            equipped.weapon2 = itemData;
          }
        } else if (slot in equipped) {
          equipped[slot] = itemData;
        }
      }

      const equipBonuses = getEquippedStats(db, agent.id);

      // Get recent combat log
      const combatLog = db.prepare(`
        SELECT * FROM combat_log
        WHERE agent_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `).all(agent.id) as any[];

      return c.json({
        name: agent.name,
        level: agent.level,
        xp: agent.xp,
        gold: agent.gold,
        hp: agent.hp,
        maxHp: agent.max_hp,
        attack: agent.atk,
        defense: agent.def,
        speed: agent.spd,
        luck: agent.luck,
        status: agent.is_dead ? 'dead' : (agent.corruption >= 100 ? 'corrupted' : 'alive'),
        corruption: agent.corruption,
        zone: agent.zone_id,
        deepestZone: agent.zone_id,
        kills: combatLog.filter(c => c.won).length,
        deaths: agent.is_dead ? 1 : 0,
        inventory: inventory.map((i: any) => ({ code: i.item_code, name: i.name, quantity: i.quantity || 1, rarity: i.rarity, category: i.category, equipped: i.equipped ? true : false })),
        equipped,
        equipBonuses: { atk: equipBonuses.atkBonus, def: equipBonuses.defBonus, hp: equipBonuses.hpBonus },
        skillPoints: (agent as any).skill_points || 0,
        unlockedGates: (() => {
          const season = db.prepare('SELECT id FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() as any;
          const sId = season?.id || 1;
          const unlocks = db.prepare('SELECT gate_id FROM zone_gate_unlocks WHERE season_id = ? AND agent_id = ?').all(sId, agent.id) as any[];
          // Map gate_id to target zone
          const gateToZone: Record<string, string> = { gate_to_tomb_halls: 'tomb_halls', gate_to_the_mines: 'the_mines', gate_to_the_web: 'the_web', gate_to_forge_of_ruin: 'forge_of_ruin', gate_to_bone_throne: 'bone_throne', gate_to_abyss_bridge: 'abyss_bridge', gate_to_black_pit: 'black_pit' };
          return unlocks.map(u => gateToZone[u.gate_id]).filter(Boolean);
        })(),
        guild: guild || [],
        combatLog: combatLog.map(c => 
          `[${Math.floor((Date.now() - c.created_at) / 60000)}m ago] ${c.won ? 'Defeated' : 'Lost to'} ${c.opponent_name}`
        )
      });
    } catch (error) {
      console.error('Error in /agent/:name:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Agent profile by ID
  app.get('/world/agent/:id', (c) => {
    try {
      const param = c.req.param('id');
      const agentId = parseInt(param);
      const agent = (isNaN(agentId)
        ? db.prepare('SELECT * FROM agents WHERE name = ? COLLATE NOCASE').get(param)
        : db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId)) as Agent | undefined;

      if (!agent) {
        return c.json({ error: 'Agent not found' }, 404);
      }

      // Get inventory
      const inventory = db.prepare(`
        SELECT inv.*, i.name, i.category, i.rarity
        FROM inventory inv
        JOIN items i ON inv.item_code = i.code
        WHERE inv.agent_id = ?
      `).all(agentId);

      // Get guild info
      let guild = null;
      if (agent.guild_id) {
        const guildInfo = getGuildInfo(db, agent.guild_id);
        if (guildInfo) {
          guild = {
            id: guildInfo.guild.id,
            name: guildInfo.guild.name,
            memberCount: guildInfo.memberCount
          };
        }
      }

      return c.json({
        id: agent.id,
        name: agent.name,
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
        prestigePoints: agent.prestige_points,
        inventory,
        guild,
        createdAt: agent.created_at,
        lastActionAt: agent.last_action_at
      });
    } catch (error) {
      console.error('Error in /world/agent/:id:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Guild details
  app.get('/world/guild/:id', (c) => {
    try {
      const guildId = parseInt(c.req.param('id'));
      const info = getGuildInfo(db, guildId);

      if (!info) {
        return c.json({ error: 'Guild not found' }, 404);
      }

      return c.json({
        guild: info.guild,
        members: info.members.map(m => ({
          id: m.id,
          name: m.name,
          level: m.level,
          zone: m.zone_id,
          isDead: m.is_dead
        })),
        memberCount: info.memberCount
      });
    } catch (error) {
      console.error('Error in /world/guild/:id:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Activity feed
  app.get('/activity', (c) => {
    try {
      const limit = parseInt(c.req.query('limit') || '50');
      
      const activities = db.prepare(`
        SELECT * FROM activity_log 
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(limit) as { event_type: string; agent_name: string | null; message: string; created_at: number }[];

      return c.json({
        events: activities.map(a => ({
          type: a.event_type,
          agentName: a.agent_name,
          message: a.message,
          timestamp: a.created_at
        }))
      });
    } catch (error) {
      console.error('Error in /activity:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Boss status endpoint
  app.get('/boss', (c) => {
    try {
      const ashborn = db.prepare(`SELECT * FROM world_bosses WHERE name = 'The Ashborn'`)
        .get() as any;

      if (!ashborn) {
        return c.json({ error: 'Boss not found' }, 404);
      }

      // Get recent attackers
      const recentAttackers = db.prepare(`
        SELECT DISTINCT a.id, a.name, a.level
        FROM combat_log cl
        JOIN agents a ON cl.agent_id = a.id
        WHERE cl.opponent_type = 'boss' AND cl.opponent_name = 'The Ashborn'
        ORDER BY cl.created_at DESC
        LIMIT 10
      `).all() as { id: number; name: string; level: number }[];

      return c.json({
        name: ashborn.name,
        zone: ashborn.zone_id,
        hp: ashborn.current_hp,
        maxHp: ashborn.max_hp,
        currentHp: ashborn.current_hp,
        atk: ashborn.atk,
        def: ashborn.def,
        isAlive: ashborn.is_alive ? true : false,
        prizePool: ashborn.prize_pool,
        lastSpawn: ashborn.last_spawn,
        lastRespawn: ashborn.last_spawn,
        respawnHours: ashborn.respawn_hours,
        attackers: recentAttackers.map(a => a.name)
      });
    } catch (error) {
      console.error('Error in /boss:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Skills endpoint
  app.get('/api/skills', (c) => {
    const apiKey = getApiKeyFromRequest(c);
    if (!apiKey) return c.json({ error: 'Missing apiKey' }, 400);

    const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as Agent | undefined;
    if (!agent) return c.json({ error: 'Invalid apiKey' }, 401);

    const data = getAvailableSkills(db, agent.id);
    return c.json({
      success: true,
      skillPoints: data.skillPoints,
      learned: data.learned.map(s => ({ id: s.id, name: s.name, tree: s.tree, description: s.description })),
      available: data.available.map(s => ({ id: s.id, name: s.name, tree: s.tree, cost: s.cost, requires: s.requires, description: s.description })),
      locked: data.locked.map(s => ({ id: s.id, name: s.name, tree: s.tree, cost: s.cost, requires: s.requires, description: s.description })),
      allSkills: SKILLS.map(s => ({ id: s.id, name: s.name, tree: s.tree, cost: s.cost, requires: s.requires, description: s.description })),
    });
  });

  // Quests endpoint
  app.get('/api/quests', async (c) => {
    const apiKey = getApiKeyFromRequest(c);
    if (!apiKey) return c.json({ error: 'Missing apiKey' }, 400);

    const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as Agent | undefined;
    if (!agent) return c.json({ error: 'Invalid apiKey' }, 401);

    const { getZoneQuests } = await import('../engine/quests.js');
    
    // Get quests for current zone
    const currentZoneQuests = getZoneQuests(db, agent.id, agent.zone_id);
    
    // Get all zone quest summaries
    const zones = ['the_gate', 'tomb_halls', 'the_mines', 'the_web', 'forge_of_ruin', 'bone_throne'];
    const allZones = zones.map(z => {
      const zq = getZoneQuests(db, agent.id, z);
      const completed = zq.filter((q: any) => q.claimed).length;
      return { zone: z, total: zq.length, completed };
    });

    return c.json({
      success: true,
      currentZone: agent.zone_id,
      quests: currentZoneQuests,
      zoneSummary: allZones,
    });
  });

  return app;
}
