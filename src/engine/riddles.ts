import Database from 'better-sqlite3';
import { Riddle } from '../db/schema.js';

export const RIDDLES: Omit<Riddle, 'id' | 'active_date'>[] = [
  {
    question: 'I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?',
    answer: 'a map',
    from_zone: 'the_gate',
    to_zone: 'tomb_halls',
    damage_on_fail: 10
  },
  {
    question: 'I speak without a mouth and hear without ears. I have no body, but come alive with the wind. What am I?',
    answer: 'an echo',
    from_zone: 'tomb_halls',
    to_zone: 'bone_throne',
    damage_on_fail: 15
  },
  {
    question: 'The more you take, the more you leave behind. What am I?',
    answer: 'footsteps',
    from_zone: 'the_gate',
    to_zone: 'the_mines',
    damage_on_fail: 10
  },
  {
    question: 'I have keys but no locks. I have space but no room. You can enter but you cannot go inside. What am I?',
    answer: 'a keyboard',
    from_zone: 'the_mines',
    to_zone: 'forge_of_ruin',
    damage_on_fail: 15
  },
  {
    question: 'What can travel around the world while staying in a corner?',
    answer: 'a stamp',
    from_zone: 'tomb_halls',
    to_zone: 'the_web',
    damage_on_fail: 12
  },
  {
    question: 'I am not alive, but I grow. I do not have lungs, but I need air. I do not have a mouth, but water kills me. What am I?',
    answer: 'fire',
    from_zone: 'the_web',
    to_zone: 'forge_of_ruin',
    damage_on_fail: 15
  },
  {
    question: 'What has hands but cannot clap?',
    answer: 'a clock',
    from_zone: 'forge_of_ruin',
    to_zone: 'abyss_bridge',
    damage_on_fail: 20
  },
  {
    question: 'I am always hungry and must be fed. The finger I touch will soon turn red. What am I?',
    answer: 'fire',
    from_zone: 'bone_throne',
    to_zone: 'abyss_bridge',
    damage_on_fail: 20
  },
  {
    question: 'What gets wetter the more it dries?',
    answer: 'a towel',
    from_zone: 'the_gate',
    to_zone: 'tomb_halls',
    damage_on_fail: 10
  },
  {
    question: 'I have a head and a tail but no body. What am I?',
    answer: 'a coin',
    from_zone: 'tomb_halls',
    to_zone: 'the_gate',
    damage_on_fail: 8
  },
  {
    question: 'The person who makes it, sells it. The person who buys it never uses it. The person who uses it never knows. What is it?',
    answer: 'a coffin',
    from_zone: 'tomb_halls',
    to_zone: 'bone_throne',
    damage_on_fail: 15
  },
  {
    question: 'What has many teeth but cannot bite?',
    answer: 'a comb',
    from_zone: 'the_web',
    to_zone: 'tomb_halls',
    damage_on_fail: 12
  },
  {
    question: 'I am taken from a mine and shut up in a wooden case, from which I am never released, yet I am used by almost everyone. What am I?',
    answer: 'pencil lead',
    from_zone: 'the_mines',
    to_zone: 'the_gate',
    damage_on_fail: 10
  },
  {
    question: 'What has a neck but no head?',
    answer: 'a bottle',
    from_zone: 'the_gate',
    to_zone: 'the_mines',
    damage_on_fail: 10
  },
  {
    question: 'What can run but never walks, has a mouth but never talks, has a head but never weeps, has a bed but never sleeps?',
    answer: 'a river',
    from_zone: 'forge_of_ruin',
    to_zone: 'the_web',
    damage_on_fail: 15
  },
  {
    question: 'I am full of holes but still hold water. What am I?',
    answer: 'a sponge',
    from_zone: 'the_web',
    to_zone: 'the_gate',
    damage_on_fail: 12
  },
  {
    question: 'What goes up but never comes down?',
    answer: 'age',
    from_zone: 'bone_throne',
    to_zone: 'tomb_halls',
    damage_on_fail: 15
  },
  {
    question: 'I am invisible, weigh nothing, but when you put me in a barrel, I make it lighter. What am I?',
    answer: 'a hole',
    from_zone: 'the_mines',
    to_zone: 'forge_of_ruin',
    damage_on_fail: 15
  },
  {
    question: 'What has four fingers and a thumb but is not alive?',
    answer: 'a glove',
    from_zone: 'forge_of_ruin',
    to_zone: 'bone_throne',
    damage_on_fail: 18
  },
  {
    question: 'I fly without wings, I cry without eyes. Wherever I go, darkness follows me. What am I?',
    answer: 'a cloud',
    from_zone: 'abyss_bridge',
    to_zone: 'forge_of_ruin',
    damage_on_fail: 25
  },
  {
    question: 'What belongs to you but others use it more than you do?',
    answer: 'your name',
    from_zone: 'the_gate',
    to_zone: 'black_pit',
    damage_on_fail: 10
  },
  {
    question: 'I shave every day but my beard stays the same. What am I?',
    answer: 'a barber',
    from_zone: 'black_pit',
    to_zone: 'the_gate',
    damage_on_fail: 10
  }
];

export function initializeRiddles(db: Database.Database): void {
  const today = new Date().toISOString().split('T')[0];
  
  // Check if riddles already initialized for today
  const existing = db.prepare('SELECT COUNT(*) as count FROM riddles WHERE active_date = ?')
    .get(today) as { count: number };

  if (existing.count > 0) return;

  // Shuffle riddles for today
  const shuffled = [...RIDDLES].sort(() => Math.random() - 0.5);

  const stmt = db.prepare(`
    INSERT INTO riddles (question, answer, from_zone, to_zone, damage_on_fail, active_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const riddle of shuffled) {
    stmt.run(
      riddle.question,
      riddle.answer,
      riddle.from_zone,
      riddle.to_zone,
      riddle.damage_on_fail,
      today
    );
  }
}

export function getRiddleForTransition(
  db: Database.Database,
  fromZone: string,
  toZone: string
): Riddle | null {
  const today = new Date().toISOString().split('T')[0];
  
  const riddle = db.prepare(`
    SELECT * FROM riddles 
    WHERE from_zone = ? AND to_zone = ? AND active_date = ?
    ORDER BY RANDOM()
    LIMIT 1
  `).get(fromZone, toZone, today) as Riddle | undefined;

  return riddle || null;
}

export function checkRiddleAnswer(
  db: Database.Database,
  riddleId: number,
  userAnswer: string
): boolean {
  const riddle = db.prepare('SELECT answer FROM riddles WHERE id = ?').get(riddleId) as { answer: string } | undefined;
  
  if (!riddle) return false;

  // Normalize answers for comparison — strip articles and punctuation
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/^(a|an|the)\s+/i, '').trim();
  const normalizedCorrect = normalize(riddle.answer);
  const normalizedUser = normalize(userAnswer);

  // Match if exact, or if one contains the other (for partial answers like "towel" vs "a towel")
  return normalizedCorrect === normalizedUser 
    || normalizedCorrect.includes(normalizedUser) 
    || normalizedUser.includes(normalizedCorrect);
}

export function rotateRiddles(db: Database.Database): void {
  // Delete old riddles (older than 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  db.prepare('DELETE FROM riddles WHERE active_date < ?').run(sevenDaysAgo);

  // Initialize new riddles for today if needed
  initializeRiddles(db);
}
