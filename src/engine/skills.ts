import Database from 'better-sqlite3';
import { Agent } from '../db/schema.js';
import { logActivity } from './agent.js';

export interface Skill {
  id: string;
  name: string;
  tree: 'warrior' | 'shadow' | 'mystic';
  cost: number; // Skill points required
  requires?: string; // Required prerequisite skill ID
  description: string;
  effect: SkillEffect;
}

export interface SkillEffect {
  type: 'stat_boost' | 'passive' | 'special';
  atkBonus?: number;
  defBonus?: number;
  hpBonus?: number;
  luckBonus?: number;
  special?: string; // Special ability identifier
}

export const SKILLS: Skill[] = [
  // WARRIOR PATH
  {
    id: 'heavy_strike',
    name: 'Heavy Strike',
    tree: 'warrior',
    cost: 1,
    description: '+20% ATK damage',
    effect: {
      type: 'stat_boost',
      atkBonus: 0.2 // Percentage multiplier
    }
  },
  {
    id: 'iron_skin',
    name: 'Iron Skin',
    tree: 'warrior',
    cost: 2,
    requires: 'heavy_strike',
    description: '+15% DEF',
    effect: {
      type: 'stat_boost',
      defBonus: 0.15
    }
  },
  {
    id: 'berserker_rage',
    name: 'Berserker Rage',
    tree: 'warrior',
    cost: 3,
    requires: 'iron_skin',
    description: 'Below 30% HP, ATK doubles',
    effect: {
      type: 'special',
      special: 'berserker_rage'
    }
  },
  {
    id: 'titans_grip',
    name: "Titan's Grip",
    tree: 'warrior',
    cost: 2,
    description: 'Can equip 2 weapons (both ATK bonuses apply)',
    effect: {
      type: 'special',
      special: 'dual_wield'
    }
  },

  // SHADOW PATH
  {
    id: 'silent_step',
    name: 'Silent Step',
    tree: 'shadow',
    cost: 1,
    description: '25% chance to avoid combat when moving zones',
    effect: {
      type: 'passive',
      special: 'avoid_combat'
    }
  },
  {
    id: 'poison_blade',
    name: 'Poison Blade',
    tree: 'shadow',
    cost: 2,
    requires: 'silent_step',
    description: 'Attacks apply poison (3 damage per turn for 3 turns)',
    effect: {
      type: 'special',
      special: 'poison_attacks'
    }
  },
  {
    id: 'shadow_meld',
    name: 'Shadow Meld',
    tree: 'shadow',
    cost: 3,
    requires: 'poison_blade',
    description: 'First attack in combat is always critical',
    effect: {
      type: 'special',
      special: 'first_strike_crit'
    }
  },
  {
    id: 'pickpocket',
    name: 'Pickpocket',
    tree: 'shadow',
    cost: 2,
    description: 'Steal gold from mobs (extra 50% gold drops)',
    effect: {
      type: 'special',
      special: 'bonus_gold'
    }
  },

  // MYSTIC PATH
  {
    id: 'arcane_knowledge',
    name: 'Arcane Knowledge',
    tree: 'mystic',
    cost: 1,
    description: '+50% XP from all sources',
    effect: {
      type: 'special',
      special: 'bonus_xp'
    }
  },
  {
    id: 'healing_light',
    name: 'Healing Light',
    tree: 'mystic',
    cost: 2,
    requires: 'arcane_knowledge',
    description: 'Rest cooldown reduced to 2 minutes (from 5)',
    effect: {
      type: 'special',
      special: 'enhanced_rest'
    }
  },
  {
    id: 'corruption_ward',
    name: 'Corruption Ward',
    tree: 'mystic',
    cost: 3,
    requires: 'healing_light',
    description: 'Corruption gain reduced by 50%',
    effect: {
      type: 'special',
      special: 'corruption_resist'
    }
  },
  {
    id: 'riddle_master',
    name: 'Mystic Insight',
    tree: 'mystic',
    cost: 2,
    description: '+20% loot quality from all sources',
    effect: {
      type: 'special',
      special: 'loot_quality'
    }
  }
];

export function initializeSkills(db: Database.Database): void {
  // Create agent_skills table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      skill_id TEXT NOT NULL,
      unlocked_at INTEGER NOT NULL,
      FOREIGN KEY(agent_id) REFERENCES agents(id),
      UNIQUE(agent_id, skill_id)
    )
  `);

  // Add skill_points column to agents table if it doesn't exist
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN skill_points INTEGER NOT NULL DEFAULT 0`);
  } catch (error) {
    // Column already exists, that's fine
  }

  // Create index
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_skills ON agent_skills(agent_id)`);
}

export function learnSkill(
  db: Database.Database,
  agentId: number,
  skillId: string
): { success: boolean; message: string; skill?: Skill } {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent & { skill_points: number };
  if (!agent || agent.is_dead) {
    return { success: false, message: 'Agent not found or dead' };
  }

  // Find skill
  const skill = SKILLS.find(s => s.id === skillId);
  if (!skill) {
    return { success: false, message: 'Skill not found' };
  }

  // Check if already learned
  const existing = db.prepare('SELECT * FROM agent_skills WHERE agent_id = ? AND skill_id = ?')
    .get(agentId, skillId);
  if (existing) {
    return { success: false, message: 'Skill already learned' };
  }

  // Check skill points
  if (agent.skill_points < skill.cost) {
    return { 
      success: false, 
      message: `Not enough skill points (need ${skill.cost}, have ${agent.skill_points})` 
    };
  }

  // Check prerequisite
  if (skill.requires) {
    const hasPrereq = db.prepare('SELECT * FROM agent_skills WHERE agent_id = ? AND skill_id = ?')
      .get(agentId, skill.requires);
    if (!hasPrereq) {
      const prereqSkill = SKILLS.find(s => s.id === skill.requires);
      return { 
        success: false, 
        message: `Requires ${prereqSkill?.name || skill.requires} skill first` 
      };
    }
  }

  // Learn skill
  db.prepare('INSERT INTO agent_skills (agent_id, skill_id, unlocked_at) VALUES (?, ?, ?)')
    .run(agentId, skillId, Date.now());

  // Deduct skill points
  db.prepare('UPDATE agents SET skill_points = skill_points - ? WHERE id = ?')
    .run(skill.cost, agentId);

  logActivity(db, 'skill', `${agent.name} learned ${skill.name} (${skill.tree} tree)`, agent.name);

  return { 
    success: true, 
    message: `Learned ${skill.name}! (${skill.tree} tree)`,
    skill
  };
}

export function getAgentSkills(db: Database.Database, agentId: number): Skill[] {
  const skillRows = db.prepare('SELECT skill_id FROM agent_skills WHERE agent_id = ?')
    .all(agentId) as { skill_id: string }[];
  
  return skillRows
    .map(row => SKILLS.find(s => s.id === row.skill_id))
    .filter(s => s !== undefined) as Skill[];
}

export function hasSkill(db: Database.Database, agentId: number, skillId: string): boolean {
  const result = db.prepare('SELECT 1 FROM agent_skills WHERE agent_id = ? AND skill_id = ?')
    .get(agentId, skillId);
  return result !== undefined;
}

export function getAvailableSkills(db: Database.Database, agentId: number): {
  learned: Skill[];
  available: Skill[];
  locked: Skill[];
  skillPoints: number;
} {
  const agent = db.prepare('SELECT skill_points FROM agents WHERE id = ?')
    .get(agentId) as { skill_points: number } | undefined;
  
  if (!agent) {
    return { learned: [], available: [], locked: [], skillPoints: 0 };
  }

  const learnedSkills = getAgentSkills(db, agentId);
  const learnedIds = new Set(learnedSkills.map(s => s.id));

  const available: Skill[] = [];
  const locked: Skill[] = [];

  for (const skill of SKILLS) {
    if (learnedIds.has(skill.id)) continue;

    // Check if prerequisite is met
    if (skill.requires && !learnedIds.has(skill.requires)) {
      locked.push(skill);
    } else {
      available.push(skill);
    }
  }

  return {
    learned: learnedSkills,
    available,
    locked,
    skillPoints: agent.skill_points
  };
}

/**
 * Calculate total skill bonuses for an agent
 */
export function getSkillBonuses(db: Database.Database, agentId: number): {
  atkMultiplier: number;
  defMultiplier: number;
  hpBonus: number;
  luckBonus: number;
  specialAbilities: string[];
} {
  const skills = getAgentSkills(db, agentId);
  
  let atkMultiplier = 1.0;
  let defMultiplier = 1.0;
  let hpBonus = 0;
  let luckBonus = 0;
  const specialAbilities: string[] = [];

  for (const skill of skills) {
    if (skill.effect.atkBonus) {
      atkMultiplier += skill.effect.atkBonus;
    }
    if (skill.effect.defBonus) {
      defMultiplier += skill.effect.defBonus;
    }
    if (skill.effect.hpBonus) {
      hpBonus += skill.effect.hpBonus;
    }
    if (skill.effect.luckBonus) {
      luckBonus += skill.effect.luckBonus;
    }
    if (skill.effect.special) {
      specialAbilities.push(skill.effect.special);
    }
  }

  return {
    atkMultiplier,
    defMultiplier,
    hpBonus,
    luckBonus,
    specialAbilities
  };
}
