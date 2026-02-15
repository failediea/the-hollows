/**
 * bot-agent/agent.js — Smart autonomous bot for The Hollows
 * Demo-ready agent for hackathon showcase.
 *
 * Usage:
 *   node bot-agent/agent.js [API_URL]
 *   API_URL=http://localhost:4000 node bot-agent/agent.js
 */

const API = process.argv[2] || process.env.API_URL || 'http://localhost:4000';
const MAX_TURNS = parseInt(process.env.MAX_TURNS || '200');
const TURN_DELAY = parseInt(process.env.TURN_DELAY || '1200');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============ GAME DATA ============

const ZONE_GRAPH = {
  the_gate: ['tomb_halls'],
  tomb_halls: ['the_gate', 'the_web', 'bone_throne'],
  the_mines: ['the_gate', 'forge_of_ruin'],
  the_web: ['tomb_halls', 'forge_of_ruin'],
  forge_of_ruin: ['the_mines', 'the_web', 'bone_throne', 'abyss_bridge'],
  bone_throne: ['tomb_halls', 'forge_of_ruin', 'abyss_bridge'],
  abyss_bridge: ['forge_of_ruin', 'bone_throne'],
  black_pit: ['the_gate'],
};

const ZONE_PATH = ['the_gate', 'tomb_halls', 'the_web', 'forge_of_ruin', 'bone_throne', 'abyss_bridge'];

const ZONE_MIN_LEVEL = {
  the_gate: 1,
  tomb_halls: 3,
  the_mines: 3,
  the_web: 5,
  forge_of_ruin: 7,
  bone_throne: 10,
  abyss_bridge: 13,
};

const ZONE_RESOURCES = {
  the_gate: ['torchwood', 'herbs', 'iron_scraps'],
  tomb_halls: ['bone_dust', 'ancient_coins', 'grave_iron'],
  the_mines: ['iron_scraps', 'dark_iron', 'starsilver_ore'],
  the_web: ['spider_silk', 'venom_sac', 'shadow_thread'],
  forge_of_ruin: ['dark_iron', 'gems', 'ember_core'],
  bone_throne: ['cursed_steel', 'soul_shard', 'runic_fragments'],
  abyss_bridge: ['flame_essence', 'dark_essence'],
};

// Recipes the bot can attempt
const RECIPES = [
  { result: 'health_potion', materials: { herbs: 3 } },
  { result: 'nunchaku', materials: { torchwood: 2 } },
  { result: 'bandage', materials: { herbs: 2, torchwood: 1 } },
  { result: 'bone_shield', materials: { bone_dust: 5, iron_scraps: 3 } },
  { result: 'grave_iron_sword', materials: { grave_iron: 3, iron_scraps: 5 } },
  { result: 'antidote', materials: { herbs: 3, bone_dust: 2 } },
  { result: 'iron_plate', materials: { iron_scraps: 8, dark_iron: 2 } },
  { result: 'venom_blade', materials: { venom_sac: 3, iron_scraps: 5 } },
  { result: 'spider_silk_cloak', materials: { spider_silk: 5, shadow_thread: 2 } },
  { result: 'starsilver_sword', materials: { starsilver_ore: 5, dark_iron: 3 } },
  { result: 'ember_shield', materials: { dark_iron: 5, gems: 2 } },
  { result: 'death_blade', materials: { cursed_steel: 5, soul_shard: 3, bone_dust: 5 } },
];

// Shop items to buy in priority order
const STARTUP_PURCHASES = [
  { code: 'woodcutters_axe', qty: 1 },
  { code: 'pickaxe', qty: 1 },
  { code: 'herbalist_sickle', qty: 1 },
  { code: 'health_potion', qty: 5 },
  { code: 'rusty_sword', qty: 1 },
];

const UPGRADE_WEAPONS = [
  { code: 'iron_sword', price: 150, minLevel: 3 },
];

// Fantasy name generator
const FIRST = ['Grim', 'Shadow', 'Iron', 'Storm', 'Ash', 'Blood', 'Bone', 'Dark', 'Void', 'Flame',
  'Night', 'Doom', 'Dread', 'Fell', 'Rune', 'Thorn', 'Ember', 'Frost', 'Blight', 'Crypt'];
const LAST = ['walker', 'blade', 'fang', 'wraith', 'seeker', 'hunter', 'reaver', 'warden', 'claw', 'bane',
  'shade', 'strike', 'maw', 'born', 'weaver', 'bringer', 'song', 'scar', 'thorn', 'forge'];

// ============ STATE ============

let apiKey = null;
let agentName = null;
let lastRestTime = 0;
let fightCount = 0;
let zoneIdx = 0;
let inventory = {};

const stats = {
  kills: 0, gathers: 0, crafts: 0, deaths: 0, rounds: 0,
  goldEarned: 0, goldSpent: 0, potionsUsed: 0, questsClaimed: 0,
  zonesVisited: new Set(), bossesDefeated: 0,
  startTime: Date.now(),
};

// ============ LOGGING ============

function log(emoji, msg) {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
  console.log(`[${elapsed}s] ${emoji} ${msg}`);
}

// ============ API ============

async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
    }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(`${API}${path}`, opts);
    return await r.json();
  } catch (err) {
    return { error: err.message };
  }
}

async function act(action, target, params) {
  return api('POST', '/action', { action, target, params });
}

async function combatAction(combatId, stance, actionObj) {
  return api('POST', `/api/combat/${combatId}/action`, { stance, action: actionObj });
}

async function getAgent() {
  return api('GET', `/agent/${encodeURIComponent(agentName)}`);
}

async function getQuests() {
  return api('GET', '/api/quests');
}

async function getZoneMobs(zone) {
  const r = await api('GET', `/world/zone/${encodeURIComponent(zone)}`);
  return r.mobs || [];
}

// ============ REGISTRATION ============

// NOTE: This bot uses /enter-wallet which requires a valid wallet signature and
// on-chain payment. It will only work in dev/test environments where payment
// verification is mocked or the wallet has already paid the entry fee.
async function register() {
  const name = FIRST[Math.floor(Math.random() * FIRST.length)] +
               LAST[Math.floor(Math.random() * LAST.length)] +
               Math.floor(Math.random() * 10000);
  const wallet = '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  log('📝', `Registering: ${name}`);
  const res = await api('POST', '/enter-wallet', { name, walletAddress: wallet, signature: '0x' + 'ab'.repeat(65) });

  if (!res.success && !res.agent) {
    log('❌', `Registration failed: ${res.error || res.message}`);
    process.exit(1);
  }

  agentName = res.agent.name;
  apiKey = res.agent.apiKey || res.apiKey;
  log('✅', `Registered: ${agentName} | Lv.${res.agent.stats?.level || 1} | Zone: ${res.agent.zone || 'the_gate'}`);
}

// ============ SHOP ============

async function buyItems(items) {
  for (const item of items) {
    const r = await act('buy', null, { itemCode: item.code, quantity: item.qty });
    if (r.success !== false && !r.error) {
      log('🛒', `Bought ${item.qty}x ${item.code}`);
      stats.goldSpent += (r.data?.totalCost || 0);
    } else {
      log('⚠️', `Buy ${item.code}: ${r.error || r.message || 'failed'}`);
    }
    await sleep(200);
  }
}

async function equipBest(agent) {
  // Equip rusty_sword initially; later equip better weapons/armor from crafting or shop
  const equipItems = ['rusty_sword', 'iron_sword', 'grave_iron_sword', 'venom_blade',
    'starsilver_sword', 'death_blade', 'bone_shield', 'iron_plate', 'spider_silk_cloak', 'ember_shield'];
  for (const item of equipItems) {
    await act('equip_item', null, { itemCode: item });
  }
}

// ============ MOB SELECTION ============

let cachedZoneMobs = {};

function chooseMob(agent, mobs, quest) {
  if (!mobs || mobs.length === 0) return null;

  // Priority 1: Quest target mob (kill quests)
  if (quest && !quest.completed && quest.objective?.type === 'kill' && quest.objective?.targetId) {
    const questMob = mobs.find(m => m.id === quest.objective.targetId);
    if (questMob) return questMob;
  }

  const agentAtk = agent.atk || 6;
  const agentDef = agent.def || 3;
  const agentHp = agent.maxHp || agent.hp || 70;

  // Priority 2: Filter out mobs too dangerous for us
  const viable = mobs.filter(m => {
    if (m.archetype === 'boss' && m.hp > agentHp * 2.5) return false;
    if (m.atk > agentDef + agentHp * 0.4) return false;
    return true;
  });

  if (viable.length === 0) {
    return mobs.reduce((a, b) => a.hp < b.hp ? a : b);
  }

  // Priority 3: Best XP efficiency among viable mobs
  const scored = viable.map(m => ({
    mob: m,
    score: (m.xp_reward || 10) / ((m.hp || 50) * Math.max(m.atk - agentDef, 1))
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].mob;
}

// ============ COMBAT ============

async function doCombat(combatId, enemyName, isGateBoss) {
  const maxRounds = isGateBoss ? 30 : 20;
  const label = isGateBoss ? '🚪' : '⚔️';

  for (let round = 0; round < maxRounds; round++) {
    await sleep(TURN_DELAY);
    const agent = await getAgent();
    if (agent.isDead || agent.is_dead) {
      stats.deaths++;
      log('💀', `Died in combat against ${enemyName}!`);
      return 'death';
    }

    const hpPct = agent.hp / (agent.maxHp || 1);
    const stance = hpPct > 0.6 ? 'aggressive' : hpPct > 0.3 ? 'balanced' : 'defensive';

    let actionObj = { type: 'basic_attack' };
    if (hpPct < 0.25 && (agent.stamina || 0) >= 4) {
      actionObj = { type: 'ability', abilityId: 'heal' };
    } else if ((agent.stamina || 0) >= 3 && Math.random() < 0.4) {
      actionObj = { type: 'ability', abilityId: 'power_strike' };
    }

    const cr = await combatAction(combatId, stance, actionObj);
    stats.rounds++;

    if (cr.error) {
      log('⚠️', `Combat error: ${cr.error}`);
      return 'error';
    }

    const narrative = cr.resolution?.narrative || '';

    if (cr.status === 'victory' || narrative.includes('slain')) {
      stats.kills++;
      fightCount++;
      if (isGateBoss) stats.bossesDefeated++;
      const reward = cr.resolution?.rewards;
      if (reward?.gold) stats.goldEarned += reward.gold;
      log('🏆', `${label} Victory over ${enemyName}! (${stats.kills} kills)`);
      return 'victory';
    }
    if (cr.status === 'defeat' || narrative.includes('fallen')) {
      stats.deaths++;
      log('💀', `${label} Defeated by ${enemyName}!`);
      return 'defeat';
    }
  }
  log('⏰', `Combat timed out against ${enemyName}`);
  return 'timeout';
}

async function doFight(agent, quest) {
  // Smart mob targeting
  const zone = agent.zone || 'the_gate';
  if (!cachedZoneMobs[zone]) {
    cachedZoneMobs[zone] = await getZoneMobs(zone);
  }

  const targetMob = chooseMob(agent, cachedZoneMobs[zone], quest);
  const targetId = targetMob?.id;
  const r = await act('attack', null, targetId ? { target: targetId } : undefined);

  if (!r.data?.combatId && !r.combat?.id) {
    log('👻', `No enemy: ${r.message || r.error || 'zone empty'}`);
    return null;
  }
  const cid = r.data?.combatId || r.combat?.id;
  const enemy = r.data?.enemy || r.combat?.enemy;
  log('⚔️', `Engaging ${enemy?.name || 'enemy'} (HP:${enemy?.hp || '?'}) [targeted: ${targetMob?.name || 'random'}]`);
  return doCombat(cid, enemy?.name || 'enemy', false);
}

// ============ GATHERING ============

async function doGather(zone) {
  const resources = ZONE_RESOURCES[zone] || ['torchwood'];
  const resource = resources[Math.floor(Math.random() * resources.length)];
  const r = await act('gather', resource);

  if (r.success !== false && !r.error) {
    stats.gathers++;
    const cd = r.data?.cooldownSeconds || 15;
    log('🌿', `Gathered ${resource} in ${zone} (${cd}s cooldown)`);
    await sleep(cd * 1000);
    return true;
  }

  const msg = r.error || r.message || '';
  if (msg.includes('cooldown')) {
    const secs = r.data?.cooldownRemaining || 10;
    log('⏳', `Gather on cooldown (${secs}s remaining)`);
    await sleep(secs * 1000);
  } else {
    log('⚠️', `Gather failed: ${msg}`);
  }
  return false;
}

// ============ CRAFTING ============

async function tryCraft() {
  // Get current inventory
  const invRes = await act('inventory');
  if (!invRes.success && invRes.error) return;

  const inv = {};
  const items = invRes.data?.inventory || invRes.inventory || [];
  for (const item of items) {
    inv[item.item_code || item.code || item.name] = item.quantity || 1;
  }
  inventory = inv;

  // Try each recipe
  for (const recipe of RECIPES) {
    let canCraft = true;
    for (const [mat, qty] of Object.entries(recipe.materials)) {
      if ((inv[mat] || 0) < qty) { canCraft = false; break; }
    }
    if (!canCraft) continue;

    log('🔨', `Crafting ${recipe.result}...`);
    const r = await act('craft', recipe.result);
    if (r.success !== false && !r.error) {
      stats.crafts++;
      log('✨', `Crafted ${recipe.result}!`);
      // Try to equip it
      await act('equip_item', null, { itemCode: recipe.result });
      return true;
    } else {
      log('⚠️', `Craft ${recipe.result}: ${r.error || r.message}`);
    }
  }
  return false;
}

// ============ QUESTS ============

async function checkAndClaimQuests() {
  const questData = await getQuests();
  if (!questData.success || !questData.quests) return null;

  const active = questData.quests.find(q => q.unlocked && !q.claimed);
  if (!active) return null;

  if (active.completed && !active.claimed) {
    log('📜', `Claiming quest: ${active.name}`);
    const r = await act('claim_quest', null, { questId: active.id });
    if (r.success !== false && !r.error) {
      stats.questsClaimed++;
      log('🎉', `Quest reward: ${r.message || 'claimed!'}`);
    } else {
      log('⚠️', `Claim failed: ${r.error || r.message}`);
    }
    return active;
  }

  const obj = active.objective;
  log('📜', `Quest: ${active.name} — ${obj.displayName} (${active.progress}/${obj.amount})`);
  return active;
}

// ============ ZONE MOVEMENT ============

async function tryAdvance(agent) {
  if (zoneIdx >= ZONE_PATH.length - 1) return false;

  const nextZone = ZONE_PATH[zoneIdx + 1];
  const minLevel = ZONE_MIN_LEVEL[nextZone] || 1;

  if (agent.level < minLevel) {
    log('📊', `Need Lv.${minLevel} for ${nextZone} (currently Lv.${agent.level})`);
    return false;
  }

  const connections = ZONE_GRAPH[agent.zone] || [];
  if (!connections.includes(nextZone)) {
    log('🚫', `${nextZone} not connected to ${agent.zone}`);
    return false;
  }

  log('🚶', `Moving ${agent.zone} → ${nextZone}`);
  const r = await act('move', nextZone);

  // Gate boss encounter
  if (r.data?.gateBoss || r.data?.combatId || r.combat?.id) {
    const cid = r.data?.combatId || r.combat?.id;
    const boss = r.data?.gateBoss || r.data?.enemy || r.combat?.enemy;
    log('🚪', `Gate boss: ${boss?.name || 'Guardian'} (HP:${boss?.hp || '?'})`);

    const result = await doCombat(cid, boss?.name || 'Guardian', true);
    if (result === 'victory') {
      zoneIdx++;
      fightCount = 0;
      stats.zonesVisited.add(nextZone);
      delete cachedZoneMobs[agent.zone]; // clear old zone cache
      log('🗺️', `Entered ${nextZone}!`);
      return true;
    }
    return false;
  }

  if (r.success !== false && !r.error) {
    zoneIdx++;
    fightCount = 0;
    stats.zonesVisited.add(nextZone);
    delete cachedZoneMobs[agent.zone]; // clear old zone cache
    log('🗺️', `Moved to ${nextZone}`);
    return true;
  }

  log('⚠️', `Move failed: ${r.error || r.message}`);
  return false;
}

// ============ HEALING ============

async function tryHeal(agent) {
  // Try health potion
  const useRes = await act('use_item', null, { itemCode: 'health_potion' });
  if (useRes.success !== false && !useRes.error) {
    stats.potionsUsed++;
    log('🧪', `Used health potion (was ${agent.hp}/${agent.maxHp})`);
    return true;
  }

  // Try greater health potion
  const useRes2 = await act('use_item', null, { itemCode: 'greater_health_potion' });
  if (useRes2.success !== false && !useRes2.error) {
    stats.potionsUsed++;
    log('🧪', `Used greater health potion`);
    return true;
  }

  // Try rest
  const now = Date.now();
  if (now - lastRestTime > 5 * 60 * 1000) {
    const r = await act('rest');
    if (r.success !== false && !r.error) {
      lastRestTime = now;
      log('💤', `Rested to full HP`);
      return true;
    }
  }

  return false;
}

// ============ UPGRADE LOGIC ============

async function tryUpgrade(agent) {
  // Buy weapon upgrades when affordable
  for (const weapon of UPGRADE_WEAPONS) {
    if (agent.level >= weapon.minLevel && agent.gold >= weapon.price) {
      const r = await act('buy', null, { itemCode: weapon.code, quantity: 1 });
      if (r.success !== false && !r.error) {
        log('🛒', `Bought upgrade: ${weapon.code}`);
        await act('equip_item', null, { itemCode: weapon.code });
        stats.goldSpent += weapon.price;
        return true;
      }
    }
  }

  // Buy more potions if gold allows and low on potions
  if (agent.gold >= 50) {
    await buyItems([{ code: 'health_potion', qty: 3 }]);
  }

  return false;
}

// ============ MAIN LOOP ============

async function run() {
  log('🌑', `The Hollows Bot Agent`);
  log('🔗', `API: ${API}`);
  log('🎯', `Max turns: ${MAX_TURNS}`);
  console.log('');

  await register();
  await sleep(500);

  // Startup: buy gear
  log('🛒', 'Buying startup gear...');
  await buyItems(STARTUP_PURCHASES);
  await equipBest();
  await sleep(500);

  let agent = await getAgent();
  zoneIdx = Math.max(0, ZONE_PATH.indexOf(agent.zone));
  stats.zonesVisited.add(agent.zone);

  log('🎮', `Starting: ${agent.name} Lv.${agent.level} HP:${agent.hp}/${agent.maxHp} Gold:${agent.gold}`);
  console.log('');

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    agent = await getAgent();

    // Permadeath check
    if (agent.isDead || agent.is_dead) {
      log('💀', `PERMADEATH at turn ${turn}!`);
      break;
    }

    const hpPct = agent.hp / (agent.maxHp || 1);

    // Phase 1: Heal if needed
    if (hpPct < 0.4) {
      const healed = await tryHeal(agent);
      if (healed) { await sleep(TURN_DELAY); continue; }
      // Can't heal — fight if HP > 20%, otherwise wait for rest
      if (hpPct > 0.2) {
        log('⚠️', `T${turn}: Low HP (${agent.hp}/${agent.maxHp}), fighting through it`);
        // fall through to fight/gather below
      } else {
        log('⚠️', `T${turn}: Critical HP (${agent.hp}/${agent.maxHp}), waiting for rest cooldown...`);
        await sleep(TURN_DELAY);
        continue;
      }
    }

    // Phase 2: Check & claim quests every 3 turns
    let currentQuest = null;
    if (turn % 3 === 0) {
      currentQuest = await checkAndClaimQuests();
      if (currentQuest && !currentQuest.completed) {
        const obj = currentQuest.objective;
        // Prioritize quest objective
        if (obj.type === 'gather') {
          log('🪓', `T${turn}: Quest gather — ${obj.targetId}`);
          await doGather(agent.zone);
          await sleep(TURN_DELAY);
          continue;
        }
        if (obj.type === 'craft') {
          log('🔨', `T${turn}: Quest craft — ${obj.targetId}`);
          await act('craft', obj.targetId);
          await sleep(TURN_DELAY);
          continue;
        }
        // kill / collect / gate_boss quests — targeted in doFight
      }
    }

    // Phase 3: Try zone advancement every 6 fights
    if (fightCount >= 6 && hpPct > 0.6) {
      const advanced = await tryAdvance(agent);
      if (advanced) { await sleep(TURN_DELAY); continue; }
    }

    // Phase 4: Try upgrades every 15 turns
    if (turn > 0 && turn % 15 === 0) {
      await tryUpgrade(agent);
    }

    // Phase 5: Try crafting every 10 turns
    if (turn > 0 && turn % 10 === 0) {
      await tryCraft();
    }

    // Phase 6: Fight / Gather cycle (80% fight, 15% gather, 5% craft check)
    const roll = Math.random();
    if (roll < 0.8) {
      log('⚔️', `T${turn}: Fighting in ${agent.zone} (Lv.${agent.level}, ${agent.hp}/${agent.maxHp})`);
      const result = await doFight(agent, currentQuest);
      if (result === 'death' || result === 'defeat') {
        const check = await getAgent();
        if (check.isDead || check.is_dead) {
          log('💀', 'PERMADEATH!');
          break;
        }
      }
    } else if (roll < 0.95) {
      await doGather(agent.zone);
    } else {
      await tryCraft();
    }

    await sleep(TURN_DELAY);
  }

  // ============ FINAL REPORT ============
  agent = await getAgent();
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║          BOT AGENT FINAL REPORT          ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Agent:    ${(agent.name || agentName).padEnd(29)}║`);
  console.log(`║  Level:    ${String(agent.level || '?').padEnd(29)}║`);
  console.log(`║  HP:       ${(agent.hp + '/' + agent.maxHp).padEnd(29)}║`);
  console.log(`║  Zone:     ${(agent.zone || '?').padEnd(29)}║`);
  console.log(`║  Gold:     ${String(agent.gold || 0).padEnd(29)}║`);
  console.log(`║  Status:   ${(agent.isDead || agent.is_dead ? '💀 DEAD' : '✅ ALIVE').padEnd(29)}║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Kills:         ${String(stats.kills).padEnd(24)}║`);
  console.log(`║  Gathers:       ${String(stats.gathers).padEnd(24)}║`);
  console.log(`║  Crafts:        ${String(stats.crafts).padEnd(24)}║`);
  console.log(`║  Deaths:        ${String(stats.deaths).padEnd(24)}║`);
  console.log(`║  Potions Used:  ${String(stats.potionsUsed).padEnd(24)}║`);
  console.log(`║  Quests Done:   ${String(stats.questsClaimed).padEnd(24)}║`);
  console.log(`║  Bosses Beaten: ${String(stats.bossesDefeated).padEnd(24)}║`);
  console.log(`║  Combat Rounds: ${String(stats.rounds).padEnd(24)}║`);
  console.log(`║  Gold Earned:   ${String(stats.goldEarned).padEnd(24)}║`);
  console.log(`║  Gold Spent:    ${String(stats.goldSpent).padEnd(24)}║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Zones:    ${[...stats.zonesVisited].join(', ').slice(0, 29).padEnd(29)}║`);
  console.log(`║  Furthest: ${ZONE_PATH[zoneIdx].padEnd(29)}║`);
  console.log(`║  Runtime:  ${(elapsed + 's').padEnd(29)}║`);
  console.log('╚══════════════════════════════════════════╝');
}

run().catch(e => { console.error('Fatal error:', e); process.exit(1); });
