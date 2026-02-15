/**
 * test-agent.js — Automated test bot for The Hollows
 * Self-registers, buys gear, fights, gathers, and progresses through zones.
 */

const API = process.env.API_URL || 'http://localhost:4000';
const MAX_TURNS = parseInt(process.env.MAX_TURNS || '60');
const TURN_DELAY = parseInt(process.env.TURN_DELAY || '1500');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Zone connectivity (matches zones.ts)
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

// Progression path
const ZONE_PATH = ['the_gate', 'tomb_halls', 'the_web', 'forge_of_ruin', 'bone_throne', 'abyss_bridge'];

// Zone resources for gathering
const ZONE_RESOURCES = {
  the_gate: ['torchwood', 'herbs', 'iron_scraps'],
  tomb_halls: ['bone_dust', 'ancient_coins', 'grave_iron'],
  the_mines: ['iron_scraps', 'dark_iron', 'starsilver_ore'],
  the_web: ['spider_silk', 'venom_sac', 'shadow_thread'],
  forge_of_ruin: ['dark_iron', 'gems', 'ember_core'],
  bone_throne: ['cursed_steel', 'soul_shard', 'runic_fragments'],
  abyss_bridge: ['flame_essence', 'dark_essence'],
};

// Startup items to buy
const STARTUP_GEAR = [
  { code: 'woodcutters_axe', qty: 1 },
  { code: 'pickaxe', qty: 1 },
  { code: 'herbalist_sickle', qty: 1 },
  { code: 'health_potion', qty: 3 },
  { code: 'rusty_sword', qty: 1 },
];

let apiKey = null;
let agentName = null;

// Stats tracking
let stats = { kills: 0, gathers: 0, deaths: 0, rounds: 0, zones: new Set(), gold: 0, crafts: 0, questsClaimed: 0 };
let fightCount = 0;
let zoneIdx = 0;
let lastRestTime = 0;

// ============ API HELPERS ============

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  return r.json();
}

async function act(action, target, params) {
  return api('POST', '/action', { apiKey, action, target, params });
}

async function combatAction(combatId, stance, actionObj) {
  return api('POST', `/api/combat/${combatId}/action`, { apiKey, stance, action: actionObj });
}

async function getAgent() {
  return api('GET', `/agent/${encodeURIComponent(agentName)}`);
}

async function getQuests() {
  return api('GET', `/api/quests?apiKey=${apiKey}`);
}

async function getZoneMobs(zone) {
  const r = await api('GET', `/world/zone/${encodeURIComponent(zone)}`);
  return r.mobs || [];
}

// ============ REGISTRATION ============

async function register() {
  const adjectives = ['Shadow', 'Iron', 'Bone', 'Dark', 'Grim', 'Storm', 'Blood', 'Ash', 'Flame', 'Void'];
  const nouns = ['Walker', 'Blade', 'Fang', 'Wraith', 'Seeker', 'Hunter', 'Reaver', 'Warden', 'Claw', 'Bane'];
  const name = adjectives[Math.floor(Math.random() * adjectives.length)] +
               nouns[Math.floor(Math.random() * nouns.length)] +
               Math.floor(Math.random() * 1000);
  const wallet = '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  console.log(`📝 Registering as ${name} (wallet: ${wallet.slice(0, 10)}...)`);
  const res = await api('POST', '/enter', { name, walletAddress: wallet });

  if (!res.success && !res.agent) {
    console.error('❌ Registration failed:', res.error || res.message);
    process.exit(1);
  }

  agentName = res.agent.name;
  apiKey = res.agent.apiKey || res.apiKey;
  console.log(`✅ Registered: ${agentName} (Lv.${res.agent.stats?.level || 1})`);
}

// ============ BUYING GEAR ============

async function buyStartupGear() {
  console.log('🛒 Buying startup gear...');
  for (const item of STARTUP_GEAR) {
    const r = await act('buy', null, { itemCode: item.code, quantity: item.qty });
    if (r.success !== false && !r.error) {
      console.log(`  ✅ Bought ${item.qty}x ${item.code}`);
    } else {
      console.log(`  ⚠️ ${item.code}: ${r.error || r.message || 'failed'}`);
    }
    await sleep(300);
  }

  // Equip weapon
  const equipRes = await act('equip_item', null, { itemCode: 'rusty_sword' });
  console.log(`  🗡️ Equip rusty_sword: ${equipRes.error || equipRes.message || 'ok'}`);
}

// ============ MOB SELECTION ============

let cachedZoneMobs = {};

function chooseMob(agent, mobs, quest) {
  if (!mobs || mobs.length === 0) return null;

  // Priority 1: Quest target mob
  if (quest && !quest.completed && quest.objective?.type === 'kill' && quest.objective?.targetId) {
    const questMob = mobs.find(m => m.id === quest.objective.targetId);
    if (questMob) return questMob;
  }

  // Priority 2: Filter out mobs that are too dangerous
  const agentAtk = agent.atk || 6;
  const agentDef = agent.def || 3;
  const agentHp = agent.maxHp || agent.hp || 70;

  const viable = mobs.filter(m => {
    // Skip bosses if we're low level relative to mob HP
    if (m.archetype === 'boss' && m.hp > agentHp * 2.5) return false;
    // Skip if mob hits way too hard
    if (m.atk > agentDef + agentHp * 0.4) return false;
    return true;
  });

  if (viable.length === 0) {
    // Fall back to weakest mob if everything seems dangerous
    return mobs.reduce((a, b) => a.hp < b.hp ? a : b);
  }

  // Priority 3: Best XP/difficulty ratio among viable mobs
  // Score = xp_reward / (mob.hp * mob.atk) — higher is better (easy XP)
  const scored = viable.map(m => ({
    mob: m,
    score: (m.xp_reward || 10) / ((m.hp || 50) * Math.max(m.atk - agentDef, 1))
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].mob;
}

// ============ COMBAT ============

async function doFight(agent, quest) {
  // Get zone mobs for smart targeting
  const zone = agent.zone || 'the_gate';
  if (!cachedZoneMobs[zone]) {
    cachedZoneMobs[zone] = await getZoneMobs(zone);
  }

  const targetMob = chooseMob(agent, cachedZoneMobs[zone], quest);
  const targetId = targetMob?.id;
  const r = await act('attack', null, targetId ? { target: targetId } : undefined);

  // No combat initiated
  if (!r.data?.combatId && !r.combat?.id) {
    console.log(`  → ${r.message || r.error || 'No enemy found'}`);
    return;
  }

  const cid = r.data?.combatId || r.combat?.id;
  const enemy = r.data?.enemy || r.combat?.enemy;
  console.log(`  ⚔️ Fighting ${enemy?.name || 'enemy'} (HP:${enemy?.hp || '?'}) [targeted: ${targetMob?.name || 'random'}]`);

  for (let round = 0; round < 20; round++) {
    await sleep(TURN_DELAY);
    const agent = await getAgent();
    const hpPct = agent.hp / agent.maxHp;
    const stance = hpPct > 0.6 ? 'aggressive' : hpPct > 0.3 ? 'balanced' : 'defensive';

    let actionObj = { type: 'basic_attack' };
    if (hpPct < 0.3 && (agent.stamina || 0) >= 4) {
      actionObj = { type: 'ability', abilityId: 'heal' };
    } else if ((agent.stamina || 0) >= 3 && Math.random() < 0.4) {
      actionObj = { type: 'ability', abilityId: 'power_strike' };
    }

    const cr = await combatAction(cid, stance, actionObj);
    stats.rounds++;

    if (cr.error) {
      console.log(`  ⚠️ ${cr.error}`);
      return;
    }

    const res = cr.resolution || {};
    if (cr.round) console.log(`  R${cr.round}: ${(res.narrative || '').slice(0, 80)}`);

    if (cr.status === 'victory' || res.narrative?.includes('slain')) {
      stats.kills++;
      fightCount++;
      console.log(`  🏆 Victory! (${stats.kills} total kills)`);
      return;
    }
    if (cr.status === 'defeat' || res.narrative?.includes('fallen')) {
      stats.deaths++;
      console.log(`  💀 Defeated!`);
      return;
    }
  }
}

// Handle gate boss combat (same flow as regular combat)
async function handleGateBoss(moveResult) {
  const cid = moveResult.data?.combatId || moveResult.combat?.id;
  const boss = moveResult.data?.gateBoss || moveResult.data?.enemy || moveResult.combat?.enemy;
  if (!cid) return false;

  console.log(`  🚪 Gate Boss: ${boss?.name || 'Guardian'} (HP:${boss?.hp || '?'})`);

  for (let round = 0; round < 30; round++) {
    await sleep(TURN_DELAY);
    const agent = await getAgent();
    const hpPct = agent.hp / agent.maxHp;
    const stance = hpPct > 0.5 ? 'aggressive' : 'defensive';

    let actionObj = { type: 'basic_attack' };
    if (hpPct < 0.3 && (agent.stamina || 0) >= 4) {
      actionObj = { type: 'ability', abilityId: 'heal' };
    }

    const cr = await combatAction(cid, stance, actionObj);
    stats.rounds++;

    if (cr.error) { console.log(`  ⚠️ ${cr.error}`); return false; }
    const res = cr.resolution || {};
    if (cr.round) console.log(`  R${cr.round}: ${(res.narrative || '').slice(0, 80)}`);

    if (cr.status === 'victory' || res.narrative?.includes('slain')) {
      console.log(`  🏆 Gate boss defeated!`);
      return true;
    }
    if (cr.status === 'defeat' || res.narrative?.includes('fallen')) {
      stats.deaths++;
      console.log(`  💀 Defeated by gate boss!`);
      return false;
    }
  }
  return false;
}

// ============ GATHERING ============

async function doGather(zone) {
  const resources = ZONE_RESOURCES[zone] || ['torchwood'];
  const resource = resources[Math.floor(Math.random() * resources.length)];
  const r = await act('gather', resource);

  if (r.success !== false && !r.error) {
    stats.gathers++;
    console.log(`  🪓 Gathered: ${r.message || resource}`);
    // Wait for gather cooldown (10-20s depending on resource)
    const cd = (r.data?.cooldownSeconds || 15) * 1000;
    console.log(`  ⏳ Waiting ${cd / 1000}s gather cooldown...`);
    await sleep(cd);
  } else {
    const msg = r.error || r.message || 'failed';
    if (msg.includes('cooldown')) {
      const secs = r.data?.cooldownRemaining || 10;
      console.log(`  ⏳ Gather on cooldown (${secs}s remaining)`);
      await sleep(secs * 1000);
    } else if (msg.includes('need') || msg.includes('tool') || msg.includes('require')) {
      console.log(`  🔧 Need tool: ${msg}`);
    } else {
      console.log(`  ⚠️ Gather: ${msg}`);
    }
  }
}

// ============ QUESTS ============

async function checkAndClaimQuests() {
  const questData = await getQuests();
  if (!questData.success || !questData.quests) return null;

  // Find the current active quest (first unlocked, not claimed)
  const active = questData.quests.find(q => q.unlocked && !q.claimed);
  if (!active) return null;

  // If quest is completed but not claimed, claim it
  if (active.completed && !active.claimed) {
    console.log(`📜 Claiming quest: ${active.name}`);
    const r = await act('claim_quest', null, { questId: active.id });
    if (r.success !== false && !r.error) {
      stats.questsClaimed++;
      console.log(`  🎉 Quest reward: ${r.message || 'claimed!'}`);
    } else {
      console.log(`  ⚠️ Claim failed: ${r.error || r.message}`);
    }
    return active;
  }

  // Log current quest progress
  const obj = active.objective;
  console.log(`📜 Quest: ${active.name} — ${obj.displayName} (${active.progress}/${obj.amount})`);
  return active;
}

// ============ MAIN LOOP ============

async function run() {
  await register();
  await sleep(500);
  await buyStartupGear();
  await sleep(500);

  let agent = await getAgent();
  zoneIdx = Math.max(0, ZONE_PATH.indexOf(agent.zone));
  stats.zones.add(agent.zone);

  console.log(`\n🎮 Starting run: ${agent.name} Lv.${agent.level} HP:${agent.hp}/${agent.maxHp} Zone:${agent.zone} Gold:${agent.gold}`);
  console.log(`   Max turns: ${MAX_TURNS}\n`);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    agent = await getAgent();
    if (agent.isDead || agent.is_dead) {
      console.log(`\n💀 PERMADEATH at turn ${turn}!`);
      break;
    }

    const hpPct = agent.hp / (agent.maxHp || 1);
    stats.gold = agent.gold;

    // Check quests every 3 turns
    let currentQuest = null;
    if (turn % 3 === 0) {
      currentQuest = await checkAndClaimQuests();
      // If quest needs gathering, prioritize it
      if (currentQuest && !currentQuest.completed && currentQuest.objective?.type === 'gather') {
        console.log(`🪓 T${turn}: Quest gather — ${currentQuest.objective.targetId}`);
        await doGather(agent.zone);
        await sleep(TURN_DELAY);
        continue;
      }
      // If quest needs crafting, try it
      if (currentQuest && !currentQuest.completed && currentQuest.objective?.type === 'craft') {
        console.log(`🔨 T${turn}: Quest craft — ${currentQuest.objective.targetId}`);
        const r = await act('craft', currentQuest.objective.targetId);
        console.log(`  → ${r.message || r.error || 'crafted'}`);
        await sleep(TURN_DELAY);
        continue;
      }
    }

    // Heal if HP < 40%
    if (hpPct < 0.4) {
      // Try health potion first
      const useRes = await act('use_item', null, { itemCode: 'health_potion' });
      if (useRes.success !== false && !useRes.error) {
        console.log(`🧪 T${turn}: Used health potion (${agent.hp}/${agent.maxHp})`);
        await sleep(TURN_DELAY);
        continue;
      }

      // Try rest (5 min cooldown)
      const now = Date.now();
      if (now - lastRestTime > 5 * 60 * 1000) {
        console.log(`💤 T${turn}: Resting (${agent.hp}/${agent.maxHp} HP)`);
        const r = await act('rest');
        if (r.success !== false && !r.error) {
          lastRestTime = now;
          console.log(`  → ${r.message || 'Rested'}`);
        } else {
          console.log(`  → ${r.error || r.message || 'Rest failed'}`);
        }
        await sleep(TURN_DELAY);
        continue;
      }

      // Can't heal — fight anyway if HP > 20%, otherwise wait
      if (hpPct > 0.2) {
        console.log(`⚠️ T${turn}: Low HP (${agent.hp}/${agent.maxHp}) but fighting through it`);
        // fall through to fight/gather below
      } else {
        console.log(`⚠️ T${turn}: Critical HP (${agent.hp}/${agent.maxHp}), waiting for rest cooldown...`);
        await sleep(TURN_DELAY);
        continue;
      }
    }

    // After enough fights, try to advance zones
    if (fightCount >= 5 && zoneIdx < ZONE_PATH.length - 1) {
      const nextZone = ZONE_PATH[zoneIdx + 1];
      const connections = ZONE_GRAPH[agent.zone] || [];
      if (connections.includes(nextZone)) {
        console.log(`🚶 T${turn}: Moving ${agent.zone} → ${nextZone}`);
        const r = await act('move', nextZone);

        // Check for gate boss
        if (r.data?.gateBoss || r.data?.combatId || r.combat?.id) {
          const won = await handleGateBoss(r);
          if (won) {
            zoneIdx++;
            fightCount = 0;
            stats.zones.add(nextZone);
            delete cachedZoneMobs[agent.zone]; // clear cache for old zone
          }
        } else if (r.success !== false && !r.error) {
          zoneIdx++;
          fightCount = 0;
          stats.zones.add(nextZone);
          delete cachedZoneMobs[agent.zone]; // clear cache for old zone
          console.log(`  → Moved to ${nextZone}`);
        } else {
          console.log(`  → ${r.error || r.message || 'Move failed'}`);
        }
        await sleep(TURN_DELAY);
        continue;
      }
    }

    // 80% fight, 20% gather
    if (Math.random() < 0.8) {
      console.log(`⚔️ T${turn}: Fighting in ${agent.zone} (Lv.${agent.level}, ${agent.hp}/${agent.maxHp} HP)`);
      await doFight(agent, currentQuest);
    } else {
      console.log(`🪓 T${turn}: Gathering in ${agent.zone}`);
      await doGather(agent.zone);
    }

    await sleep(TURN_DELAY);
  }

  // Final report
  agent = await getAgent();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 FINAL REPORT: ${agent.name}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`   Level: ${agent.level} | XP: ${agent.xp}`);
  console.log(`   HP: ${agent.hp}/${agent.maxHp}`);
  console.log(`   Zone: ${agent.zone}`);
  console.log(`   Gold: ${agent.gold}`);
  console.log(`   Kills: ${stats.kills} | Gathers: ${stats.gathers} | Deaths: ${stats.deaths}`);
  console.log(`   Quests Claimed: ${stats.questsClaimed}`);
  console.log(`   Combat Rounds: ${stats.rounds}`);
  console.log(`   Zones Visited: ${[...stats.zones].join(', ')}`);
  console.log(`   Furthest: ${ZONE_PATH[zoneIdx]} (${zoneIdx + 1}/${ZONE_PATH.length})`);
  console.log(`${'='.repeat(50)}`);
}

run().catch(e => { console.error('Fatal error:', e); process.exit(1); });
