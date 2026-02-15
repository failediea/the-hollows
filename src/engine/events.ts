import Database from 'better-sqlite3';
import { Agent } from '../db/schema.js';
import { addGold, addItemToInventory, takeDamage, gainXp, logActivity } from './agent.js';

export interface ZoneEvent {
  id: string;
  name: string;
  description: string;
  zone: string;
  chance: number; // 0.0 to 1.0
  trigger: (db: Database.Database, agent: Agent) => EventResult;
}

export interface EventResult {
  message: string;
  effects: {
    hp?: number;
    gold?: number;
    xp?: number;
    items?: string[];
    corruption?: number;
    weaponUpgrade?: { itemCode: string; atkBonus: number };
    buff?: { type: string; value: number; duration: number };
  };
}

export const ZONE_EVENTS: ZoneEvent[] = [
  // THE GATE EVENTS
  {
    id: 'mysterious_merchant',
    name: 'Mysterious Merchant',
    description: 'A hooded figure offers rare items at a discount...',
    zone: 'the_gate',
    chance: 0.01,
    trigger: (db: Database.Database, agent: Agent): EventResult => {
      const goldFound = 15 + Math.floor(Math.random() * 25);
      addGold(db, agent.id, goldFound);

      logActivity(db, 'event', `🎭 A cloaked stranger slipped ${agent.name} a pouch of ${goldFound} gold and vanished into shadow`, agent.name);

      return {
        message: `A cloaked stranger presses a jingling pouch into your hand. "${goldFound} gold — spend it before The Hollows takes it." Then they're gone.`,
        effects: {
          gold: goldFound
        }
      };
    }
  },

  // TOMB HALLS EVENTS
  {
    id: 'dead_whisper',
    name: 'Whispers of the Dead',
    description: 'The dead whisper ancient secrets...',
    zone: 'tomb_halls',
    chance: 0.01,
    trigger: (db: Database.Database, agent: Agent): EventResult => {
      // Learn mob weakness - next combat gets +10% damage (simulate with gold/xp bonus)
      logActivity(db, 'event', `👻 The dead whispered secrets to ${agent.name}`, agent.name);
      
      return {
        message: `The dead whisper ancient secrets... You feel wiser about their weaknesses. (+25 XP)`,
        effects: {
          xp: 25
        }
      };
    }
  },

  // THE MINES EVENTS
  {
    id: 'cave_in',
    name: 'Cave-In!',
    description: 'The ceiling collapses!',
    zone: 'the_mines',
    chance: 0.01,
    trigger: (db: Database.Database, agent: Agent): EventResult => {
      const damage = 10 + Math.floor(Math.random() * 10);
      const goldFound = 20 + Math.floor(Math.random() * 30);
      
      takeDamage(db, agent.id, damage);
      addGold(db, agent.id, goldFound);
      
      logActivity(db, 'event', `⚠️ Cave-in! ${agent.name} took ${damage} damage but found ${goldFound} gold`, agent.name);
      
      return {
        message: `CAVE-IN! You take ${damage} damage but find ${goldFound} gold in the rubble!`,
        effects: {
          hp: -damage,
          gold: goldFound
        }
      };
    }
  },

  // THE WEB EVENTS
  {
    id: 'caught_in_web',
    name: 'Caught in a Web!',
    description: 'You stumble into a sticky web...',
    zone: 'the_web',
    chance: 0.01,
    trigger: (db: Database.Database, agent: Agent): EventResult => {
      const silkFound = 2 + Math.floor(Math.random() * 3);
      addItemToInventory(db, agent.id, 'spider_silk', silkFound);
      
      logActivity(db, 'event', `🕸️ ${agent.name} was caught in a web but found ${silkFound} spider silk`, agent.name);
      
      return {
        message: `You're caught in a sticky web! You lose your next turn but find ${silkFound}x spider silk.`,
        effects: {
          items: ['spider_silk']
        }
      };
    }
  },

  // FORGE OF RUIN EVENTS
  {
    id: 'forge_flare',
    name: 'The Forge Flares!',
    description: 'Ancient magic surges through the forge...',
    zone: 'forge_of_ruin',
    chance: 0.01,
    trigger: (db: Database.Database, agent: Agent): EventResult => {
      // Check if agent has a weapon equipped
      const weapon = db.prepare(`
        SELECT i.code, i.atk_bonus, i.name
        FROM inventory inv
        JOIN items i ON inv.item_code = i.code
        WHERE inv.agent_id = ? AND inv.equipped = 1 AND i.category = 'weapon'
        LIMIT 1
      `).get(agent.id) as { code: string; atk_bonus: number; name: string } | undefined;

      if (weapon) {
        // Upgrade weapon by +2 ATK (we'll simulate this with a message - actual implementation would need item modification)
        logActivity(db, 'event', `🔥 The forge flared! ${agent.name}'s ${weapon.name} was enhanced (+2 ATK)`, agent.name);
        
        return {
          message: `The forge erupts with ancient power! Your ${weapon.name} is permanently enhanced (+2 ATK)!`,
          effects: {
            weaponUpgrade: { itemCode: weapon.code, atkBonus: 2 }
          }
        };
      } else {
        logActivity(db, 'event', `🔥 The forge flared near ${agent.name} (+20 XP)`, agent.name);
        return {
          message: `The forge flares with power, but you have no weapon to enhance. You gain knowledge instead. (+20 XP)`,
          effects: {
            xp: 20
          }
        };
      }
    }
  },

  // BONE THRONE EVENTS
  {
    id: 'wraith_deal',
    name: "A Wraith's Deal",
    description: 'A wraith offers you a dark bargain...',
    zone: 'bone_throne',
    chance: 0.01,
    trigger: (db: Database.Database, agent: Agent): EventResult => {
      const choice = Math.random();
      
      if (choice < 0.5) {
        // Sacrifice HP for XP
        const hpCost = 20;
        const xpGain = 40;
        takeDamage(db, agent.id, hpCost);
        gainXp(db, agent.id, xpGain);
        
        logActivity(db, 'event', `💀 ${agent.name} made a wraith's bargain: -${hpCost} HP, +${xpGain} XP`, agent.name);
        
        return {
          message: `A wraith offers a deal: "Your life essence for power..." You accept. (-${hpCost} HP, +${xpGain} XP)`,
          effects: {
            hp: -hpCost,
            xp: xpGain
          }
        };
      } else {
        // Sacrifice gold for corruption reduction
        const goldCost = 30;
        const corruptionReduced = 20;
        
        const currentGold = (db.prepare('SELECT gold FROM agents WHERE id = ?').get(agent.id) as { gold: number }).gold;
        
        if (currentGold >= goldCost) {
          addGold(db, agent.id, -goldCost);
          db.prepare('UPDATE agents SET corruption = MAX(0, corruption - ?) WHERE id = ?').run(corruptionReduced, agent.id);
          
          logActivity(db, 'event', `💀 ${agent.name} paid a wraith ${goldCost} gold to reduce corruption by ${corruptionReduced}`, agent.name);
          
          return {
            message: `A wraith offers: "Gold for purification..." You pay ${goldCost} gold. (-${corruptionReduced} corruption)`,
            effects: {
              gold: -goldCost,
              corruption: -corruptionReduced
            }
          };
        } else {
          return {
            message: `A wraith appears but you lack the gold it demands. It vanishes with a laugh.`,
            effects: {}
          };
        }
      }
    }
  },

  // ABYSS BRIDGE EVENTS
  {
    id: 'ashborn_stirs',
    name: 'The Ashborn Stirs...',
    description: 'The demon lord awakens!',
    zone: 'abyss_bridge',
    chance: 0.01,
    trigger: (db: Database.Database, agent: Agent): EventResult => {
      const damage = 15 + Math.floor(Math.random() * 15);
      takeDamage(db, agent.id, damage);
      
      // Deal damage to all agents in the zone
      const agentsInZone = db.prepare('SELECT id, name FROM agents WHERE zone_id = ? AND is_dead = 0').all('abyss_bridge') as { id: number; name: string }[];
      
      for (const a of agentsInZone) {
        if (a.id !== agent.id) {
          takeDamage(db, a.id, damage);
        }
      }
      
      logActivity(db, 'event', `🔥 THE ASHBORN STIRS! All agents at Abyss Bridge take ${damage} fire damage`, agent.name);
      
      return {
        message: `THE ASHBORN STIRS! Waves of fire wash over the bridge! All agents take ${damage} fire damage!`,
        effects: {
          hp: -damage
        }
      };
    }
  },

  // BLACK PIT EVENTS
  {
    id: 'crowd_roars',
    name: 'The Crowd Roars!',
    description: 'The spectators are in a frenzy!',
    zone: 'black_pit',
    chance: 0.01,
    trigger: (db: Database.Database, agent: Agent): EventResult => {
      logActivity(db, 'event', `⚔️ The crowd roars for ${agent.name}! PvP wagers doubled for next match!`, agent.name);
      
      return {
        message: `The crowd goes wild! Your next PvP wager is DOUBLED! The people love blood!`,
        effects: {
          buff: { type: 'pvp_wager_double', value: 2, duration: 1 }
        }
      };
    }
  }
];

/**
 * Trigger a zone event with 20% chance
 * Call this when an agent performs an action in a zone
 */
export function triggerZoneEvent(db: Database.Database, agent: Agent): EventResult | null {
  // Each event has its own chance (1%), no global gate


  // Find events for current zone
  const zoneEvents = ZONE_EVENTS.filter(e => e.zone === agent.zone_id);
  if (zoneEvents.length === 0) {
    return null;
  }

  // Pick a random event and check its chance
  const event = zoneEvents[Math.floor(Math.random() * zoneEvents.length)];
  if (Math.random() > event.chance) {
    return null;
  }

  return event.trigger(db, agent);
}

/**
 * Apply event effects to an agent
 */
export function applyEventEffects(db: Database.Database, agentId: number, effects: EventResult['effects']): void {
  if (effects.hp !== undefined && effects.hp !== 0) {
    if (effects.hp > 0) {
      // Healing is handled separately if needed
    } else {
      takeDamage(db, agentId, Math.abs(effects.hp));
    }
  }

  if (effects.gold !== undefined && effects.gold !== 0) {
    addGold(db, agentId, effects.gold);
  }

  if (effects.xp !== undefined && effects.xp !== 0) {
    gainXp(db, agentId, effects.xp);
  }

  if (effects.items && effects.items.length > 0) {
    for (const itemCode of effects.items) {
      addItemToInventory(db, agentId, itemCode, 1);
    }
  }

  if (effects.corruption !== undefined && effects.corruption !== 0) {
    db.prepare('UPDATE agents SET corruption = MAX(0, corruption + ?) WHERE id = ?')
      .run(effects.corruption, agentId);
  }

  // Buffs and weapon upgrades would need additional tracking tables to persist
  // For now, we log them but don't implement full persistence
}
