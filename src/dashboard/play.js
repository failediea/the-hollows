/* ============================================
   THE HOLLOWS - Human Player UI
   ============================================ */

const API = window.location.origin;
const MONAD_RPC = 'https://rpc.monad.xyz';
const MONAD_CHAIN_ID = 143;
const TREASURY_ADDRESS = '0x23d916bd5c4c5a88e2ee1ee124ca320902f79820';
const TREASURY_ABI = [
    'function enter() external payable',
    'function entryFee() external view returns (uint256)',
];

// Track active gather cooldowns { resourceCode: { endTime, interval } }
const gatherCooldowns = {};

// State
let state = {
    name: null,
    apiKey: null,
    walletAddress: null,
    agent: null,
    world: null,
    zoneData: null,
    provider: null,
    signer: null,
    refreshInterval: null,
    zoneRefreshInterval: null,
    pendingRiddle: null,
};

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.apiKey}`,
    };
}

function authHeadersOnly() {
    return { 'Authorization': `Bearer ${state.apiKey}` };
}

// Item emoji map
const ITEM_EMOJI = {
    health_potion: '🧪', greater_health_potion: '🧪', antidote: '💊', nunchaku: '🥋', bandage: '🩹',
    corruption_cleanse: '✨', torchwood: '🪵', iron_scraps: '⚙️', bone_dust: '🦴',
    ancient_coins: '🪙', grave_iron: '⛓️', starsilver_ore: '💎', dark_iron: '🔩',
    gems: '💠', spider_silk: '🕸️', venom_sac: '🧫', shadow_thread: '🧵',
    cursed_steel: '⚔️', ember_core: '🔥', runic_fragments: '📜', soul_shard: '👻',
    dark_essence: '🌑', necrotic_tome: '📕', rat_pelt: '🐀', bat_wing: '🦇',
    rusty_sword: '🗡️', iron_sword: '⚔️', leather_armor: '🦺', iron_plate: '🛡️',
    bone_shield: '🛡️', grave_iron_sword: '🗡️',
    herbs: '🌿', troll_hide: '🧶', wight_shroud: '👻', cursed_helm: '⛑️',
    gremlin_crown: '👑', gremlin_shiv: '🔪', ring_of_the_deep: '💍',
    spider_silk_cloak: '🧥', webspinner_staff: '🪄', iron_hammer: '🔨',
    warlord_axe: '🪓', flame_essence: '🔥', death_blade: '🗡️', bone_cleaver: '🪓',
    necromancer_grimoire: '📖', ashborn_heart: '❤️‍🔥', flame_crown: '👑',
    ashborn_fang: '🦷', ashborn_scale_mail: '🛡️', crown_of_madness: '👑',
    ancient_power: '⚡', glory_tokens: '🏆', rusty_pickaxe: '⛏️',
    woodcutters_axe: '🪓', pickaxe: '⛏️', herbalist_sickle: '🌾',
};

const ZONE_ORDER = [
    'the_gate', 'tomb_halls', 'the_mines', 'the_web',
    'forge_of_ruin', 'bone_throne', 'abyss_bridge', 'black_pit'
];

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    spawnEmbers();
    tryAutoLogin();
});

function spawnEmbers() {
    const container = document.getElementById('embers');
    for (let i = 0; i < 25; i++) {
        const ember = document.createElement('div');
        ember.className = 'ember';
        ember.style.left = Math.random() * 100 + '%';
        ember.style.animationDuration = (6 + Math.random() * 8) + 's';
        ember.style.animationDelay = Math.random() * 10 + 's';
        ember.style.width = (2 + Math.random() * 3) + 'px';
        ember.style.height = ember.style.width;
        container.appendChild(ember);
    }
}

async function tryAutoLogin() {
    const saved = localStorage.getItem('hollows_session');
    if (!saved) return;
    try {
        const s = JSON.parse(saved);
        if (!s.name || !s.apiKey) return;

        // Verify agent still exists on server before restoring session
        const res = await fetch(`${API}/agent/${encodeURIComponent(s.name)}`);
        if (!res.ok) {
            // Agent no longer exists (DB reset or permadeath) — clear stale session
            localStorage.removeItem('hollows_session');
            const err = document.getElementById('loginError');
            if (err) err.textContent = 'Your previous session has expired. Please create a new character.';
            return;
        }

        const agentData = await res.json();
        if (agentData.is_dead) {
            localStorage.removeItem('hollows_session');
            const err = document.getElementById('loginError');
            if (err) err.textContent = 'Your champion has fallen. Create a new character to continue.';
            return;
        }

        state.name = s.name;
        state.apiKey = s.apiKey;
        state.walletAddress = s.walletAddress;
        showGame();
    } catch (e) {
        console.error('Auto-login failed:', e);
    }
}

// ============ WALLET ============
async function connectWallet() {
    const err = document.getElementById('loginError');
    err.textContent = '';

    if (!window.ethereum) {
        err.textContent = 'MetaMask not found. Install MetaMask to play.';
        return;
    }

    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        state.walletAddress = accounts[0];

        // Switch to Monad Mainnet
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x' + MONAD_CHAIN_ID.toString(16) }],
            });
        } catch (switchErr) {
            if (switchErr.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x' + MONAD_CHAIN_ID.toString(16),
                        chainName: 'Monad Mainnet',
                        rpcUrls: [MONAD_RPC],
                        nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
                    }],
                });
            }
        }

        // Setup ethers
        if (window.ethers) {
            state.provider = new ethers.BrowserProvider(window.ethereum);
            state.signer = await state.provider.getSigner();
            const balance = await state.provider.getBalance(state.walletAddress);
            document.getElementById('walletBal').textContent =
                parseFloat(ethers.formatEther(balance)).toFixed(4) + ' MON';
        }

        const short = state.walletAddress.slice(0, 6) + '...' + state.walletAddress.slice(-4);
        document.getElementById('walletAddr').textContent = short;
        document.getElementById('walletInfo').classList.remove('hidden');
        document.getElementById('connectWalletBtn').textContent = '✅ Wallet Connected';
        document.getElementById('connectWalletBtn').disabled = true;
        document.getElementById('enterBtn').classList.remove('hidden');

        // Check if this wallet already has a character
        try {
            const checkRes = await fetch(`${API}/enter-wallet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress: state.walletAddress, checkOnly: true }),
            });
            const checkData = await checkRes.json();

            if (checkRes.ok && checkData.agent) {
                showReturningPlayerUI(checkData.agent);
                return;
            }
        } catch (checkErr) {
            // Non-fatal — fall through to normal new-player flow
            console.warn('Returning player check failed:', checkErr);
        }

    } catch (e) {
        err.textContent = e.message || 'Failed to connect wallet';
    }
}

function showReturningPlayerUI(agent) {
    state.returningAgent = agent;

    // Hide name input
    document.querySelector('.form-group').style.display = 'none';

    // Show welcome-back info
    const info = document.createElement('div');
    info.className = 'returning-player-info';
    info.innerHTML = `
        <p class="welcome-back">Welcome back, <strong>${agent.name}</strong></p>
        <p class="char-preview">Level ${agent.stats?.level || '?'} · ${agent.zone || 'The Gate'}</p>
    `;
    document.querySelector('.login-form').insertBefore(info, document.getElementById('walletInfo'));

    // Update button
    const enterBtn = document.getElementById('enterBtn');
    enterBtn.textContent = '⚔️ Resume Adventure';
    enterBtn.classList.remove('hidden');
}

async function enterGame() {
    const err = document.getElementById('loginError');
    err.textContent = '';
    const name = state.returningAgent
        ? state.returningAgent.name
        : document.getElementById('nameInput').value.trim();

    if (!name && !state.returningAgent) { err.textContent = 'Enter a name'; return; }
    if (!state.walletAddress) { err.textContent = 'Connect wallet first'; return; }

    try {
        // Step 1: Check if this wallet already has a living character (checkOnly — no creation)
        const checkRes = await fetch(`${API}/enter-wallet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: state.walletAddress, checkOnly: true }),
        });
        const checkData = await checkRes.json();

        if (checkRes.ok && checkData.message === 'Welcome back to The Hollows') {
            // Existing character — sign with existing name to prove wallet ownership & get apiKey
            const existingName = checkData.agent.name;
            let loginSig = '';
            if (state.signer) {
                const loginMsg = `Enter The Hollows as "${existingName}" on chain ${MONAD_CHAIN_ID}`;
                loginSig = await state.signer.signMessage(loginMsg);
            }
            // Re-fetch with signature to get apiKey
            const authRes = await fetch(`${API}/enter-wallet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress: state.walletAddress, signature: loginSig }),
            });
            const authData = await authRes.json();
            state.name = authData.agent.name;
            state.apiKey = authData.agent.apiKey || authData.apiKey;
            if (!state.apiKey) {
                err.textContent = 'Wallet signature verification failed. Please try again.';
                return;
            }
            localStorage.setItem('hollows_session', JSON.stringify({
                name: state.name, apiKey: state.apiKey, walletAddress: state.walletAddress,
            }));
            showGame();
            return;
        }

        // Sign message for new character creation (includes chain ID to prevent replay)
        let signature = '';
        if (state.signer) {
            const msg = `Enter The Hollows as "${name}" on chain ${MONAD_CHAIN_ID}`;
            signature = await state.signer.signMessage(msg);
        }

        // Step 2: No existing character — pay 10 MON entry fee (if not already paid)
        const feeKey = `hollows_fee_paid_${state.walletAddress.toLowerCase()}`;
        const alreadyPaid = localStorage.getItem(feeKey);

        if (!alreadyPaid && state.signer && window.ethers) {
            try {
                err.textContent = 'Paying 10 MON entry fee...';
                const treasury = new ethers.Contract(TREASURY_ADDRESS, TREASURY_ABI, state.signer);
                const tx = await treasury.enter({ value: ethers.parseEther('10') });
                await tx.wait();
                localStorage.setItem(feeKey, Date.now().toString());
                err.textContent = '';
            } catch (txErr) {
                // If contract reverts (already paid), continue anyway
                const reason = txErr.reason || txErr.message || '';
                if (reason.includes('already entered') || reason.includes('Already entered')) {
                    localStorage.setItem(feeKey, 'contract');
                } else {
                    err.textContent = 'Entry fee payment failed: ' + (reason || 'Transaction rejected');
                    return;
                }
            }
        }

        // Step 3: Create character via API (this is the actual creation call)
        const res = await fetch(`${API}/enter-wallet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, walletAddress: state.walletAddress, signature }),
        });
        const data = await res.json();

        if (!res.ok) {
            err.textContent = data.error || 'Failed to enter';
            return;
        }

        state.name = data.agent.name;
        state.apiKey = data.agent.apiKey || data.apiKey;

        localStorage.setItem('hollows_session', JSON.stringify({
            name: state.name,
            apiKey: state.apiKey,
            walletAddress: state.walletAddress,
        }));

        showGame();
    } catch (e) {
        err.textContent = e.message || 'Connection failed';
    }
}

function logout() {
    localStorage.removeItem('hollows_session');
    if (state.refreshInterval) clearInterval(state.refreshInterval);
    if (state.zoneRefreshInterval) clearInterval(state.zoneRefreshInterval);
    state = { name: null, apiKey: null, walletAddress: null, agent: null, world: null, zoneData: null, provider: null, signer: null, refreshInterval: null, zoneRefreshInterval: null };
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    // Reset login form
    document.getElementById('nameInput').value = '';
    document.getElementById('walletInfo').classList.add('hidden');
    document.getElementById('enterBtn').classList.add('hidden');
    document.getElementById('connectWalletBtn').textContent = '🦊 Connect MetaMask';
    document.getElementById('connectWalletBtn').disabled = false;
}

// ============ GAME ============
async function showGame() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');

    if (state.walletAddress) {
        document.getElementById('topWallet').textContent =
            state.walletAddress.slice(0, 6) + '...' + state.walletAddress.slice(-4);
    }

    await Promise.all([refreshAgent(), refreshWorld(), refreshActivity()]);

    // If agent couldn't be loaded, go back to login
    if (!state.agent) {
        document.getElementById('gameScreen').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        localStorage.removeItem('hollows_session');
        state = { name: null, apiKey: null, walletAddress: null, agent: null, world: null, zoneData: null, provider: null, signer: null, refreshInterval: null, zoneRefreshInterval: null };
        const err = document.getElementById('loginError');
        if (err) err.textContent = 'Session expired — please log in again.';
        return;
    }

    await Promise.all([refreshZoneData(), refreshActiveQuest()]);

    if (state.refreshInterval) clearInterval(state.refreshInterval);
    state.refreshInterval = setInterval(async () => {
        await Promise.all([refreshAgent(), refreshWorld(), refreshActivity()]);
    }, 5000);

    if (state.zoneRefreshInterval) clearInterval(state.zoneRefreshInterval);
    state.zoneRefreshInterval = setInterval(refreshZoneData, 10000);
}

async function refreshAgent() {
    try {
        const res = await fetch(`${API}/agent/${encodeURIComponent(state.name)}`);
        if (!res.ok) return;
        state.agent = await res.json();
        renderCharPanel();
        renderEquipment();
        renderInventory();
        updateZoneView();
    } catch (e) { console.error('Agent refresh failed:', e); }
}

async function refreshWorld() {
    try {
        const res = await fetch(`${API}/world`);
        if (!res.ok) return;
        state.world = await res.json();
        renderMap();
        renderBoss();
    } catch (e) { console.error('World refresh failed:', e); }
}

async function refreshActivity() {
    try {
        const res = await fetch(`${API}/activity?limit=30`);
        if (!res.ok) return;
        const data = await res.json();
        renderActivity(data.events || []);
    } catch (e) {}
}

// ============ RENDER: Character ============
function renderCharPanel() {
    const a = state.agent;
    if (!a) return;

    document.getElementById('charName').textContent = a.name;
    document.getElementById('charLevel').textContent = `Lv. ${a.level}`;

    // HP
    const hpPct = a.maxHp > 0 ? (a.hp / a.maxHp * 100) : 0;
    document.getElementById('hpBar').style.width = hpPct + '%';
    document.getElementById('hpText').textContent = `${a.hp} / ${a.maxHp}`;

    // XP
    const xpInLevel = a.xp % 100;
    document.getElementById('xpBar').style.width = xpInLevel + '%';
    document.getElementById('xpText').textContent = `${xpInLevel} / 100`;

    // Corruption
    const corrPct = Math.min(a.corruption, 100);
    document.getElementById('corruptionBar').style.width = corrPct + '%';
    document.getElementById('corruptionText').textContent = `${a.corruption}`;

    // Stats with equipment bonuses
    const eb = a.equipBonuses || { atk: 0, def: 0, hp: 0 };
    const baseAtk = a.attack || a.atk || 0;
    const baseDef = a.defense || a.def || 0;
    const baseSpd = a.speed || a.spd || 0;
    const baseLuck = a.luck || 0;
    document.getElementById('statAtk').innerHTML = eb.atk ? `${baseAtk} <span class="equip-bonus-inline">(+${eb.atk})</span>` : `${baseAtk}`;
    document.getElementById('statDef').innerHTML = eb.def ? `${baseDef} <span class="equip-bonus-inline">(+${eb.def})</span>` : `${baseDef}`;
    document.getElementById('statSpd').textContent = baseSpd;
    document.getElementById('statLuck').textContent = baseLuck;

    // Gold
    document.getElementById('goldAmount').textContent = a.gold || 0;

    // Skill Points (show if > 0)
    let spEl = document.getElementById('skillPointsDisplay');
    if (!spEl) {
        const goldDisplay = document.querySelector('.gold-display');
        if (goldDisplay) {
            spEl = document.createElement('div');
            spEl.id = 'skillPointsDisplay';
            spEl.className = 'gold-display';
            spEl.style.cursor = 'pointer';
            spEl.onclick = () => { switchTab('skills'); renderSkillsTab(); };
            goldDisplay.parentNode.insertBefore(spEl, goldDisplay.nextSibling);
        }
    }
    if (spEl) {
        const sp = a.skillPoints || 0;
        spEl.innerHTML = sp > 0
            ? `<span class="gold-icon">🌟</span><span class="gold-amount" style="color:#fbbf24">${sp}</span><span class="gold-label">Skill Points</span>`
            : '';
    }

    // Status
    const statusEl = document.getElementById('charStatus');
    if (a.status === 'dead' || a.isDead) {
        statusEl.innerHTML = `<span style="color:var(--flame-red)">💀 FALLEN PERMANENTLY</span> <span style="color:#64748b;font-size:11px">Create a new champion</span>`;
    } else if (a.status === 'corrupted') {
        statusEl.innerHTML = '<span style="color:var(--corruption-purple)">😈 CORRUPTED — Stats reduced 20%</span>';
    } else {
        statusEl.innerHTML = '<span style="color:var(--danger-safe)">✨ Alive</span>';
    }

    // Top zone
    const zoneData = state.world?.zones?.find(z => z.id === a.zone);
    const topZoneEl = document.getElementById('topZone');
    if (topZoneEl) topZoneEl.textContent = zoneData
        ? `${zoneData.emoji} ${zoneData.name}`
        : a.zone;
}

// ============ RENDER: Equipment ============
function renderEquipment() {
    const a = state.agent;
    if (!a) return;
    const equipped = a.equipped || { weapon: null, weapon2: null, armor: null, accessory: null };
    const RARITY_BORDER = { common: '#555', uncommon: '#4ade80', rare: '#60a5fa', legendary: '#f59e0b', cursed: '#a855f7' };

    // Show/hide off-hand slot based on dual wield
    const w2slot = document.getElementById('slotWeapon2');
    if (w2slot) w2slot.style.display = equipped.weapon2 !== undefined ? '' : 'none';

    ['weapon', 'weapon2', 'armor', 'accessory'].forEach(slot => {
        const el = document.getElementById('slot' + slot.charAt(0).toUpperCase() + slot.slice(1) + 'Item');
        const slotEl = document.getElementById('slot' + slot.charAt(0).toUpperCase() + slot.slice(1));
        const item = equipped[slot];
        if (item) {
            const bonuses = [];
            if (item.atkBonus) bonuses.push(`+${item.atkBonus} ATK`);
            if (item.defBonus) bonuses.push(`+${item.defBonus} DEF`);
            if (item.hpBonus) bonuses.push(`+${item.hpBonus} HP`);
            el.innerHTML = `<span class="equip-item-name">${item.name}</span>` +
                (bonuses.length ? `<span class="equip-item-stats">${bonuses.join(', ')}</span>` : '') +
                `<button class="equip-unequip-btn" onclick="unequipItem('${item.code}')">✕</button>`;
            slotEl.style.borderColor = RARITY_BORDER[item.rarity] || '#555';
            el.classList.add('equipped');
        } else {
            el.innerHTML = 'Empty';
            el.classList.remove('equipped');
            slotEl.style.borderColor = '';
        }
    });

    // Total bonuses
    const eb = a.equipBonuses || { atk: 0, def: 0, hp: 0 };
    const bonusEl = document.getElementById('equipBonuses');
    const parts = [];
    if (eb.atk) parts.push(`<span class="eb-pos">+${eb.atk} ATK</span>`);
    if (eb.def) parts.push(`<span class="eb-pos">+${eb.def} DEF</span>`);
    if (eb.hp) parts.push(`<span class="eb-pos">+${eb.hp} HP</span>`);
    bonusEl.innerHTML = parts.length ? parts.join(' · ') : '';
}

async function unequipItem(code) {
    await doAction('unequip_item', null, { itemCode: code });
}

// ============ RENDER: Inventory ============
function renderInventory() {
    const a = state.agent;
    const grid = document.getElementById('inventoryGrid');
    if (!a) return;

    // Fetch full inventory
    fetch(`${API}/world/agent/${a.name}`)
        .catch(() => null);

    // Use inventory from /agent/:name (objects with code/name/quantity)
    const items = a.inventory || [];
    grid.innerHTML = '';

    if (items.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--starsilver-silver);font-size:11px;padding:12px;">Empty</div>';
        return;
    }

    // Group items by code
    const grouped = {};
    const nameMap = {};
    const catMap = {};
    items.forEach(item => {
        if (typeof item === 'string') {
            const code = nameToCode(item);
            grouped[code] = (grouped[code] || 0) + 1;
            nameMap[code] = item;
        } else {
            grouped[item.code] = (grouped[item.code] || 0) + (item.quantity || 1);
            nameMap[item.code] = item.name;
            catMap[item.code] = item.category;
        }
    });

    const EQUIPPABLE = ['weapon', 'armor', 'accessory', 'artifact'];
    Object.entries(grouped).forEach(([code, qty]) => {
        const name = nameMap[code] || code.replace(/_/g, ' ');
        const emoji = ITEM_EMOJI[code] || '📦';
        const img = RESOURCE_IMAGES[code];
        const cat = catMap[code] || '';
        const isEquippable = EQUIPPABLE.includes(cat);
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        slot.innerHTML = `
            ${img ? `<img src="${img}" class="inv-icon">` : `<span>${emoji}</span>`}
            <span class="inv-qty">x${qty}</span>
            <div class="inv-tooltip">
                <div class="tt-name">${name}</div>
                <div class="tt-actions">
                    ${cat === 'consumable' ? `<button class="tt-btn" onclick="useItem('${code}')">Use</button>` : ''}
                    ${isEquippable ? `<button class="tt-btn" onclick="equipItem('${code}')">Equip</button>` : ''}
                </div>
            </div>
        `;
        grid.appendChild(slot);
    });
}


// ============ CHAT ============
let chatMessages = [];
const MAX_CHAT = 50;

function sendChat() {
    const input = document.getElementById('chatInput');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';
    
    const msg = {
        author: state.agent?.name || 'You',
        text: text,
        time: Date.now(),
        zone: state.agent?.zone
    };
    
    // Post to server
    fetch(`${API}/chat`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message: text })
    }).catch(() => {});
    
    addChatMessage(msg);
}

function addChatMessage(msg) {
    chatMessages.push(msg);
    if (chatMessages.length > MAX_CHAT) chatMessages.shift();
    renderChat();
}

function renderChat() {
    const el = document.getElementById('chatMessages');
    if (!el) return;
    el.innerHTML = '';
    chatMessages.forEach(m => {
        const div = document.createElement('div');
        div.className = m.system ? 'chat-msg system-msg' : 'chat-msg';
        const author = document.createElement('span');
        author.className = 'chat-author';
        author.textContent = m.author;
        const text = document.createElement('span');
        text.className = 'chat-text';
        text.textContent = m.text;
        const time = document.createElement('span');
        time.className = 'chat-time';
        const t = new Date(m.time);
        time.textContent = t.getHours().toString().padStart(2,'0') + ':' + t.getMinutes().toString().padStart(2,'0');
        div.append(author, text, time);
        el.appendChild(div);
    });
    el.scrollTop = el.scrollHeight;
}

function pollChat() {
    fetch(`${API}/chat?zone=${state.agent?.zone || ''}&since=${chatMessages.length ? chatMessages[chatMessages.length-1].time : 0}`)
        .then(r => r.json())
        .then(msgs => {
            if (Array.isArray(msgs)) msgs.forEach(m => addChatMessage(m));
        })
        .catch(() => {});
}

// Poll chat every 5s
setInterval(pollChat, 5000);

// Add zone enter message
function addSystemChat(text) {
    addChatMessage({ author: '⚔️', text, time: Date.now(), system: true });
}

function nameToCode(name) {
    return name.toLowerCase().replace(/\s+/g, '_');
}

// ============ ZONE DATA ============
async function refreshZoneData() {
    const a = state.agent;
    if (!a?.zone) return;
    try {
        const res = await fetch(`${API}/world/zone/${encodeURIComponent(a.zone)}`);
        if (!res.ok) return;
        state.zoneData = await res.json();
        renderZoneDetails();
    } catch (e) { console.error('Zone refresh failed:', e); }
}

const RARITY_COLORS = { common: '#9ca3af', uncommon: '#4ade80', rare: '#60a5fa', legendary: '#f59e0b' };
const ELEMENT_EMOJI = { fire: '🔥', ice: '❄️', shadow: '🌑', holy: '✨' };
const MOB_EMOJI = {
    'Giant Rat': '🐀', 'Cave Bat': '🦇', 'Plague Rat': '🐀', 'Skeleton Warrior': '💀',
    'Wight': '👻', 'Gremlin Miner': '👺', 'Giant Spider': '🕷️', 'Broodmother': '🕷️',
    'Brute Smith': '🔨', 'Wraith': '👻', 'Death Knight': '⚔️', 'Cave Troll': '🧌',
    'The Ashborn': '🔥', 'Pit Fighter': '👹', 'Shadow Assassin': '🗡️',
};

// ============ RENDER: Zone ============
function updateZoneView() {
    const a = state.agent;
    if (!a || !state.world) return;

    const zone = state.world.zones?.find(z => z.id === a.zone);
    if (!zone) return;

    document.getElementById('zoneName').textContent = zone.emoji + ' ' + zone.name;

    // Zone background image
    const zoneImgMap = {
        the_gate: '/assets/zone-the-gate.png',
        tomb_halls: '/assets/zone-tomb-halls.png',
        the_mines: '/assets/zone-the-mines.png',
        the_web: '/assets/zone-the-web.png',
        forge_of_ruin: '/assets/zone-forge-of-ruin.png',
        bone_throne: '/assets/zone-bone-throne.png',
        abyss_bridge: '/assets/zone-abyss-bridge.png'
    };
    const zoneBgImg = document.getElementById('zoneBackgroundImg');
    if (zoneBgImg && zoneImgMap[zone.id]) {
        zoneBgImg.src = zoneImgMap[zone.id] + '?v=2';
        zoneBgImg.style.display = 'block';
    } else if (zoneBgImg) {
        zoneBgImg.style.display = 'none';
    }
    document.getElementById('zoneDesc').textContent = zone.description;

    const dangerEl = document.getElementById('zoneDanger');
    const labels = ['PvP Arena', 'Safe', 'Low', 'Medium', 'High', 'DEADLY'];
    dangerEl.textContent = `⚠️ ${labels[zone.dangerLevel] || zone.dangerLevel}`;
    dangerEl.className = `danger-badge danger-${zone.dangerLevel}`;

    document.getElementById('zoneAgents').textContent = `👤 ${zone.agentCount} agents here`;

    renderZoneDetails();

    // Update shop note
    const shopNote = document.getElementById('shopNote');
    shopNote.textContent = '🏪 Buy supplies for your journey.';
    loadShop();
}

function renderZoneDetails() {
    const zd = state.zoneData;
    if (!zd) return;

    // Lore (strip the short description prefix to avoid duplication)
    const loreEl = document.getElementById('zoneLore');
    if (loreEl) {
        let lore = zd.lore || '';
        const desc = zd.description || '';
        // Remove the short description sentence(s) from lore to avoid duplication
        if (desc && lore) {
            // Split desc into sentences and remove each from lore
            desc.split(/(?<=\.)\s+/).forEach(sentence => {
                lore = lore.replace(sentence, '').trim();
            });
        }
        loreEl.textContent = lore;
    }

    const loreBlock = document.getElementById('zoneLoreBlock');
    if (loreBlock) {
        const loreText = document.getElementById('zoneLore');
        loreBlock.style.display = (loreText && loreText.textContent) ? 'block' : 'none';
    }

    // Zone info badges
    const infoEl = document.getElementById('zoneInfo');
    if (infoEl) {
        let badges = '';
        if (zd.isPvP) badges += '<span class="zone-badge pvp">⚔️ PvP Zone</span>';
        if (zd.requiresGuildSize > 0) badges += `<span class="zone-badge guild">👥 Guild ${zd.requiresGuildSize}+</span>`;
        infoEl.innerHTML = badges;
    }

    // Mobs
    const mobsEl = document.getElementById('zoneMobs');
    if (mobsEl) {
        if (!zd.mobs?.length) {
            mobsEl.innerHTML = '<div class="zone-empty">No monsters here</div>';
        } else {
            mobsEl.innerHTML = zd.mobs.map(m => {
                const emoji = MOB_EMOJI[m.name] || '👹';
                const mobArtMap = {'Sewer Rat':'/assets/combat/sewer-rat.png','Giant Rat':'/assets/combat/giant-rat.png','Cave Bat':'/assets/combat/cave-bat.png','Plague Rat':'/assets/combat/plague-rat.png','Corrupted Hound':'/assets/combat/corrupted-hound.png','Rabid Ghoul':'/assets/combat/rabid-ghoul.png','Wandering Ghost':'/assets/combat/wandering-ghost.png','Tomb Shade':'/assets/combat/tomb-shade.png','Gremlin Miner':'/assets/gremlin-miner.png','Skeleton Warrior':'/assets/skeleton-warrior.png','Cave Troll':'/assets/cave-troll.png','Giant Spider':'/assets/giant-spider.png','Broodmother':'/assets/broodmother.png','Brute Smith':'/assets/brute-smith.png','Ember Colossus':'/assets/ember-colossus.png','Death Knight':'/assets/death-knight.png','The Ashborn':'/assets/the-ashborn.png','Skeletal Dragon':'/assets/skeletal-dragon.png'};
                const elem = m.element ? `<span class="mob-element">${ELEMENT_EMOJI[m.element] || ''} ${m.element}</span>` : '';
                const drops = m.drop_table?.map(d => `${ITEM_EMOJI[d.item] || '📦'} ${Math.round(d.chance*100)}%`).join('  ') || 'None';
                
                // Threat analysis
                const pa = state.agent || {};
                const pAtk = pa.attack || pa.atk || 6;
                const pDef = pa.defense || pa.def || 3;
                const pHp = pa.hp || 60;
                const pSpd = pa.speed || pa.spd || 5;
                
                const dmgToMob = Math.max(1, pAtk - (m.def || 0));
                const dmgToPlayer = Math.max(1, (m.atk || 0) - pDef);
                const turnsToKill = Math.ceil((m.hp || 1) / dmgToMob);
                const turnsTodie = Math.ceil(pHp / dmgToPlayer);
                const expectedDmgTaken = Math.min(turnsToKill * dmgToPlayer, pHp);
                const winChance = turnsTodie > turnsToKill ? Math.min(99, Math.round((turnsTodie / (turnsTodie + turnsToKill)) * 100)) : turnsTodie === turnsToKill ? 50 : Math.max(1, Math.round((turnsTodie / (turnsTodie + turnsToKill)) * 100));
                
                let threatLevel, threatClass;
                if (winChance >= 80) { threatLevel = '🟢 Easy'; threatClass = 'threat-easy'; }
                else if (winChance >= 50) { threatLevel = '🟡 Risky'; threatClass = 'threat-risky'; }
                else { threatLevel = '🔴 Deadly'; threatClass = 'threat-deadly'; }
                
                const recAtk = (m.def || 0) + Math.ceil((m.hp || 1) / 8);
                const recDef = Math.max(1, (m.atk || 0) - Math.floor(pHp / 6));
                
                const mobImgSrc = mobArtMap[m.name] || '';
                const portrait = mobImgSrc ? `<img src="${mobImgSrc}" class="mob-portrait" alt="${m.name}" loading="lazy">` : `<span class="mob-portrait-emoji">${emoji}</span>`;

                return `<div class="mob-card-compact ${threatClass}" id="mob-${m.id}">
                    <div class="mob-portrait-wrap">${portrait}</div>
                    <div class="mob-info-compact">
                        <div class="mob-info-left">
                            <div class="mob-name-row"><span class="mob-name">${m.name}</span>${elem}</div>
                            <div class="mob-stat-row"><span>❤️ ${m.hp}</span> <span>⚔️ ${m.atk}</span> <span>🛡️ ${m.def}</span></div>
                            <div class="mob-reward-row"><span>⭐ <span class="reward-label">XP</span> ${m.xp_reward}</span> <span>💰 <span class="reward-label">${m.gold_reward}g</span></span> ${drops}</div>
                            <div class="mob-threat-row"><span class="threat-badge ${threatClass}">${threatLevel}</span> <span class="win-chance">~${winChance}% win</span></div>
                        </div>
                        <div class="mob-info-right">
                            <p class="mob-lore">${m.description || ''}</p>
                        </div>
                    </div>
                    <div class="mob-btn-row">
                        <button class="btn btn-attack-compact" onclick="attackMob('${m.id}', '${m.name}', ${m.hp})">⚔️ Attack</button>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // Resources
    const RESOURCE_TOOL_REQS = {
        torchwood: { tool: 'woodcutters_axe', label: '🪓 Axe' },
        iron_scraps: { tool: 'pickaxe', label: '⛏️ Pickaxe', alt: 'mining_pick' },
        starsilver_ore: { tool: 'pickaxe', label: '⛏️ Pickaxe', alt: 'mining_pick' },
        dark_iron: { tool: 'pickaxe', label: '⛏️ Pickaxe', alt: 'mining_pick' },
        gems: { tool: 'pickaxe', label: '⛏️ Pickaxe', alt: 'mining_pick' },
        cursed_steel: { tool: 'pickaxe', label: '⛏️ Pickaxe', alt: 'mining_pick' },
        herbs: { tool: 'herbalist_sickle', label: '🌾 Sickle' },
        spider_silk: { tool: 'herbalist_sickle', label: '🌾 Sickle' },
        shadow_thread: { tool: 'herbalist_sickle', label: '🌾 Sickle' },
        venom_sac: { tool: 'herbalist_sickle', label: '🌾 Sickle' },
    };
    function hasGatherTool(code) {
        const req = RESOURCE_TOOL_REQS[code];
        if (!req) return true;
        const inv = state.agent?.inventory || [];
        return inv.some(i => {
            const c = typeof i === 'string' ? i.toLowerCase().replace(/\s+/g,'_') : (i.code || i.item_code || '');
            return c === req.tool || c === req.alt;
        });
    }
    function gatherLabel(code) {
        // If resource is on cooldown, show remaining time
        const cd = gatherCooldowns[code];
        if (cd) {
            const remaining = Math.ceil((cd.endTime - Date.now()) / 1000);
            if (remaining > 0) return `⏳ ${remaining}s`;
        }
        return getGatherLabelMap()[code] || '🪓 Gather';
    }
    const resEl = document.getElementById('zoneResources');
    if (resEl) {
        if (!zd.resources?.length) {
            resEl.innerHTML = '<div class="zone-empty">No resources here</div>';
        } else {
            resEl.innerHTML = '<div class="resource-grid">' + zd.resources.map(r => {
                const color = RARITY_COLORS[r.rarity] || '#9ca3af';
                const code = r.name.toLowerCase().replace(/\s+/g, '_');
                const img = RESOURCE_IMAGES[code];
                const icon = img ? `<img src="${img}" class="resource-icon">` : `<span class="resource-emoji">${RESOURCE_EMOJI[code] || '📦'}</span>`;
                const toolReq = RESOURCE_TOOL_REQS[code];
                const hasTool = hasGatherTool(code);
                const toolTag = toolReq ? `<span class="resource-tool" style="font-size:11px;color:${hasTool ? '#4CAF50' : '#f44336'}">Requires: ${toolReq.label}${hasTool ? ' ✓' : ' ✗'}</span>` : '';
                const onCd = gatherCooldowns[code] && (gatherCooldowns[code].endTime - Date.now()) > 0;
                return `<div class="resource-card">
                    ${icon}
                    <span class="resource-name" style="color:${color}">${r.name}</span>
                    ${toolTag}
                    <button class="btn btn-gather${onCd ? ' btn-cooldown' : ''}" id="gather-btn-${code}" ${onCd ? 'disabled' : ''} onclick="doGather('${code}', ${r.gather_time_seconds})">${gatherLabel(code)}</button>
                </div>`;
            }).join('') + '</div>';
            // Re-apply any active gather cooldowns to the freshly rendered buttons
            reapplyGatherCooldowns();
        }
    }

    // Agents present
    const agentsEl = document.getElementById('zoneAgentsList');
    if (agentsEl) {
        const agents = zd.agentsPresent || [];
        const others = agents.filter(a => a.name !== state.agent?.name);
        if (!others.length) {
            agentsEl.innerHTML = '<div class="zone-empty">You\'re alone here</div>';
        } else {
            agentsEl.innerHTML = others.map(a => 
                `<div class="agent-card ${a.is_dead ? 'dead' : ''}">
                    <span>${a.is_dead ? '💀' : '👤'} ${a.name}</span>
                    <span class="agent-level">Lv.${a.level}</span>
                </div>`
            ).join('');
        }
    }

    // Crafting section
    renderZoneCrafting();

    // Connected zones (use server data instead of hardcoded)
    renderConnectedZones();
}

function renderConnectedZones() {
    const container = document.getElementById('connectedZones');
    if (!container) return;
    container.innerHTML = '';

    const conns = state.zoneData?.connectedZones || [];
    const allZones = state.world?.zones || [];

    // Check which gates the player has unlocked
    const unlockedGates = state.agent?.unlockedGates || [];

    conns.forEach(zid => {
        const z = allZones.find(zone => zone.id === zid);
        const card = document.createElement('div');
        card.className = 'zone-card';
        card.onclick = () => moveToZone(zid);
        const playerLvl = state.agent?.level || 1;
        const capped = z?.maxLevel && playerLvl >= z.maxLevel;
        const isUnlocked = unlockedGates.includes(zid);
        const hasGate = !isUnlocked; // assume gate if not unlocked
        card.innerHTML = `
            <div class="zc-name">${z ? z.emoji + ' ' + z.name : zid}</div>
            <div class="zc-meta">${z ? `${z.agentCount} agents` : ''}</div>
            ${hasGate ? '<div class="zc-gate">⚔️ Gate Boss — Click to challenge!</div>' : ''}
            ${isUnlocked ? '<div class="zc-unlocked" style="color:#4ade80;font-size:11px">✅ Unlocked</div>' : ''}
            ${capped ? '<div class="zc-capped">🚫 No XP</div>' : ''}
        `;
        if (capped) card.classList.add('zone-capped');
        container.appendChild(card);
    });
}

// ============ RENDER: Map ============
function renderMap() {
    const map = document.getElementById('dungeonMap');
    if (!state.world) return;
    map.innerHTML = '';

    const zones = state.world.zones || [];
    ZONE_ORDER.forEach((zid, i) => {
        const z = zones.find(zone => zone.id === zid);
        if (!z) return;

        if (i > 0) {
            const conn = document.createElement('div');
            conn.className = 'map-connector';
            map.appendChild(conn);
        }

        const node = document.createElement('div');
        node.className = 'map-node' + (state.agent?.zone === zid ? ' current' : '');
        node.onclick = () => moveToZone(zid);
        const playerLevel = state.agent?.level || 1;
        const isXpCapped = z.maxLevel && playerLevel >= z.maxLevel;
        node.innerHTML = `
            <div class="mn-emoji">${z.emoji}</div>
            <div class="mn-info">
                <div class="mn-name">${z.name}</div>
                <div class="mn-desc">${z.description}</div>
                <div class="mn-meta">
                    <span class="mn-badge danger-${z.dangerLevel}">⚠️ ${z.dangerLevel}</span>
                    <span class="mn-badge" style="background:rgba(255,255,255,0.05);color:var(--starsilver-silver)">👤 ${z.agentCount}</span>
                    ${z.maxLevel ? `<span class="mn-badge" style="background:rgba(255,255,255,0.05);color:var(--starsilver-silver)">Max Lv ${z.maxLevel}</span>` : ''}
                    ${isXpCapped ? '<span class="mn-badge xp-capped-badge">🚫 No XP</span>' : ''}
                    ${z.id === 'abyss_bridge' ? '<span class="mn-badge" style="background:rgba(255,51,51,0.15);color:var(--flame-red)">🔥 BOSS</span>' : ''}
                    ${z.id === 'black_pit' ? '<span class="mn-badge" style="background:rgba(255,107,53,0.15);color:var(--ember-orange)">⚔️ PVP</span>' : ''}
                </div>
            </div>
        `;
        map.appendChild(node);
    });
}

// ============ RENDER: Boss ============
async function renderBoss() {
    const container = document.getElementById('bossContent');
    try {
        const res = await fetch(`${API}/boss`);
        const boss = await res.json();

        const hpPct = boss.maxHp > 0 ? (boss.currentHp / boss.maxHp * 100) : 0;
        const canRaid = state.agent?.zone === 'abyss_bridge' && (state.agent?.guild?.length >= 3 || false);

        container.innerHTML = `
            <div class="boss-display">
                <span class="boss-emoji">🔥</span>
                <div class="boss-name">${boss.name}</div>
                <div style="font-size:12px;color:var(--starsilver-silver);margin:4px 0">${boss.isAlive ? 'ALIVE' : 'DEFEATED — Respawning...'}</div>
                <div class="boss-hp-bar">
                    <div class="boss-hp-fill" style="width:${hpPct}%"></div>
                    <div class="boss-hp-text">${boss.currentHp.toLocaleString()} / ${boss.maxHp.toLocaleString()}</div>
                </div>
                <div class="boss-info">
                    Prize Pool: <span style="color:var(--gold)">${boss.prizePool?.toLocaleString() || 0} gold</span> ·
                    ATK: ${boss.atk} · DEF: ${boss.def}
                </div>
                ${boss.attackers?.length ? `<div class="boss-info">Recent attackers: ${boss.attackers.join(', ')}</div>` : ''}
                <button class="btn-raid" ${!boss.isAlive || !canRaid ? 'disabled' : ''} onclick="doAction('attack_ashborn')">
                    🔥 RAID THE ASHBORN
                </button>
                ${!canRaid && boss.isAlive ? '<div style="font-size:11px;color:var(--flame-red);margin-top:6px">Requires guild of 3+ at Abyss Bridge</div>' : ''}
            </div>
        `;
    } catch (e) {
        container.innerHTML = '<p style="color:var(--starsilver-silver)">Failed to load boss data</p>';
    }
}

// ============ RENDER: Shop ============
const SHOP_ITEMS = [
    { code: 'woodcutters_axe', name: "Woodcutter's Axe", desc: 'Required for chopping torchwood', price: 15 },
    { code: 'pickaxe', name: 'Pickaxe', desc: 'Required for mining ore & gems', price: 20 },
    { code: 'herbalist_sickle', name: "Herbalist's Sickle", desc: 'Required for harvesting herbs & silk', price: 15 },
    { code: 'health_potion', name: 'Health Potion', desc: 'Restores 50 HP', price: 25 },
    { code: 'greater_health_potion', name: 'Greater Health Potion', desc: 'Restores 100 HP', price: 60 },
    { code: 'antidote', name: 'Antidote', desc: 'Cures poison, +20 HP', price: 40 },
    { code: 'corruption_cleanse', name: 'Purification Elixir', desc: 'Reduces corruption by 50', price: 200 },
    { code: 'leather_armor', name: 'Leather Armor', desc: '+3 DEF', price: 80 },
    { code: 'rusty_sword', name: 'Rusty Sword', desc: '+3 ATK', price: 50 },
    { code: 'iron_sword', name: 'Iron Sword', desc: '+6 ATK', price: 150 },
    { code: 'iron_plate', name: 'Iron Plate', desc: '+6 DEF', price: 200 },
];

function loadShop() {
    const grid = document.getElementById('shopGrid');
    grid.innerHTML = '';

    const atGate = state.agent?.zone === 'the_gate';

    SHOP_ITEMS.forEach(item => {
        const emoji = ITEM_EMOJI[item.code] || '📦';
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `
            <div class="si-top">
                <span class="si-emoji">${emoji}</span>
                <span class="si-name">${item.name}</span>
            </div>
            <div class="si-desc">${item.desc}</div>
            <div class="si-price">💰 ${item.price} gold</div>
            <div class="si-actions">
                <button class="btn-shop" onclick="buyItem('${item.code}')">Buy</button>
            </div>
        `;
        grid.appendChild(div);
    });
}

// ============ RENDER: PvP ============
async function renderPvP() {
    const container = document.getElementById('pvpContent');
    try {
        const res = await fetch(`${API}/pvp`);
        const data = await res.json();

        let html = '';

        // Active matches
        html += '<div class="pvp-section"><h3>⏳ Active Challenges</h3>';
        if (data.activeMatches?.length) {
            data.activeMatches.forEach(m => {
                html += `<div class="pvp-match">
                    <div class="pvp-fighters">${m.fighter1} ⚔️ ${m.fighter2}</div>
                    <div class="pvp-wager">💰 ${m.wager}</div>
                </div>`;
            });
        } else {
            html += '<p style="color:var(--starsilver-silver);font-size:12px">No active challenges</p>';
        }
        html += '</div>';

        // Recent results
        html += '<div class="pvp-section"><h3>🏆 Recent Results</h3>';
        if (data.recentResults?.length) {
            data.recentResults.forEach(m => {
                html += `<div class="pvp-match">
                    <div class="pvp-fighters">🏆 ${m.winner} defeated ${m.loser}</div>
                    <div class="pvp-wager">💰 ${m.wager * 2}</div>
                </div>`;
            });
        } else {
            html += '<p style="color:var(--starsilver-silver);font-size:12px">No recent matches</p>';
        }
        html += '</div>';

        // Challenge form (only in Black Pit)
        if (state.agent?.zone === 'black_pit') {
            html += `<div class="pvp-section">
                <h3>⚔️ Issue Challenge</h3>
                <p style="font-size:11px;color:var(--starsilver-silver);margin-bottom:8px">Challenge another fighter in the pit</p>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <input id="pvpTarget" placeholder="Target Agent ID" style="padding:8px;background:var(--void-black);border:1px solid var(--panel-border);border-radius:6px;color:var(--bone-white);font-family:var(--font-body);width:120px">
                    <input id="pvpWager" placeholder="Wager (gold)" type="number" style="padding:8px;background:var(--void-black);border:1px solid var(--panel-border);border-radius:6px;color:var(--bone-white);font-family:var(--font-body);width:100px">
                    <button class="btn-shop" onclick="issuePvPChallenge()">Challenge</button>
                </div>
            </div>`;
        } else {
            html += '<p style="color:var(--flame-red);font-size:12px;margin-top:8px">⚠️ Go to The Black Pit to challenge others</p>';
        }

        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="color:var(--starsilver-silver)">Failed to load PvP data</p>';
    }
}

// ============ RENDER: Guild ============
function renderGuild() {
    const container = document.getElementById('guildContent');
    const a = state.agent;
    if (!a) return;

    const fellows = a.guild || [];

    let html = '';
    if (fellows.length > 0) {
        html += '<h3 style="margin-bottom:8px">Your Guild</h3>';
        html += '<div class="guild-members">';
        fellows.forEach(name => {
            html += `<div class="fellow-member"><span class="fm-name">👤 ${name}</span></div>`;
        });
        html += '</div>';
        html += `<button class="btn-shop" style="margin-top:10px" onclick="doAction('leave_guild')">Leave Guild</button>`;
    } else {
        html += `
            <p style="color:var(--starsilver-silver);font-size:12px;margin-bottom:12px">You're not in a guild. Create or join one to access deep zones.</p>
            <div class="guild-form">
                <input id="guildName" placeholder="Guild name...">
                <button class="btn-shop" onclick="createGuild()">Create</button>
            </div>
            <div class="guild-form">
                <input id="guildJoinId" placeholder="Guild ID..." type="number">
                <button class="btn-shop" onclick="joinGuild()">Join</button>
            </div>
        `;
    }

    container.innerHTML = html;
}

// ============ RENDER: Chain ============
function renderChain() {
    const container = document.getElementById('chainContent');

    let balanceHtml = '';
    if (state.walletAddress) {
        balanceHtml = `
            <div class="chain-section">
                <h3>💳 Wallet</h3>
                <div style="font-size:11px;color:var(--starsilver-silver);font-family:monospace">${state.walletAddress}</div>
                <div class="chain-balance" id="chainBalance">Loading...</div>
                <div style="font-size:11px;color:var(--starsilver-silver)">Monad Mainnet (Chain ID: ${MONAD_CHAIN_ID})</div>
            </div>
        `;
    }

    container.innerHTML = `
        ${balanceHtml}
        <div class="chain-section">
            <h3>🏦 Treasury Contract</h3>
            <p style="font-size:12px;color:var(--starsilver-silver);margin-bottom:6px">Contract: <span style="font-family:monospace;font-size:10px">${TREASURY_ADDRESS}</span></p>
            <p style="font-size:12px;color:var(--gold)">✅ 10 MON entry fee is live on Monad Mainnet</p>
        </div>
        <div class="chain-section">
            <h3>📊 On-Chain Features</h3>
            <ul style="font-size:12px;color:var(--starsilver-silver);list-style:none;line-height:2">
                <li>✅ 10 MON entry fee</li>
                <li>⏳ Season prize pool distribution</li>
                <li>⏳ NFT loot drops for legendary items</li>
                <li>⏳ Cross-season prestige tracking</li>
            </ul>
        </div>
    `;

    // Update balance
    if (state.provider && state.walletAddress) {
        state.provider.getBalance(state.walletAddress).then(bal => {
            const el = document.getElementById('chainBalance');
            if (el) el.textContent = parseFloat(ethers.formatEther(bal)).toFixed(4) + ' MON';
        }).catch(() => {});
    }
}

// ============ RENDER: Activity ============
function renderActivity(events) {
    const feed = document.getElementById('activityFeed');
    feed.innerHTML = '';

    events.slice(0, 10).forEach(e => {
        const ago = timeAgo(e.timestamp);
        const div = document.createElement('div');
        div.className = `activity-item type-${e.type}`;
        div.innerHTML = `<span class="ai-time">${ago}</span> ${e.message}`;
        feed.appendChild(div);
    });

    if (events.length === 0) {
        feed.innerHTML = '<div style="text-align:center;color:var(--starsilver-silver);font-size:11px;padding:20px">No activity yet</div>';
    }
}

function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
}

// ============ TABS ============
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));

    // Load tab-specific data
    if (tab === 'pvp') renderPvP();
    if (tab === 'guild') renderGuild();
    if (tab === 'chain') renderChain();
    if (tab === 'shop') loadShop();
    if (tab === 'boss') renderBoss();
    if (tab === 'market') renderMarketTab();
    if (tab === 'skills') renderSkillsTab();
    if (tab === 'quests') renderQuestsTab();
    if (tab === 'leaderboard') renderLeaderboard();
    if (tab === 'party') renderPartySection();
}

async function renderLeaderboard() {
    const body = document.getElementById('lbBody');
    if (!body) return;
    try {
        const res = await fetch(`${API}/api/leaderboard`);
        const data = await res.json();
        if (!data.success) { body.innerHTML = '<tr><td colspan="6">Failed to load</td></tr>'; return; }
        body.innerHTML = data.agents.map((a, i) => {
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
            const type = a.walletAddress ? '👤' : '🤖';
            const cls = rank <= 3 ? `lb-top lb-rank-${rank}` : '';
            return `<tr class="${cls}"><td>${medal}</td><td>${type} ${a.name}</td><td>${a.level}</td><td>${a.xp}</td><td>${a.kills}</td><td>${a.gold}</td></tr>`;
        }).join('');
    } catch(e) { body.innerHTML = '<tr><td colspan="6">Error loading leaderboard</td></tr>'; }
}

// ============ ACTIONS ============
async function doAction(action, target, params) {
    if (!state.apiKey) return;

    // Disable action buttons briefly
    document.querySelectorAll('.btn-action, .btn-rest').forEach(b => b.disabled = true);

    try {
        const body = { action };
        if (target) body.target = target;
        if (params) body.params = params;

        const res = await fetch(`${API}/action`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
            showMessage(data.error || 'Action failed', 'error');
            return;
        }

        // Check for gate boss encounter on move
        if (data.data?.gateBoss && data.data?.combatId) {
            showGateBossModal(data.data);
            return;
        }

        // Check success:false responses
        if (data.success === false) {
            showMessage(data.message || 'Action failed', 'error');
            // If gather cooldown, show timer on the button
            if (action === 'gather' && data.data?.cooldownRemaining && params?.target) {
                startGatherCooldown(params.target, data.data.cooldownRemaining);
            }
            if (action === 'rest' && data.data?.cooldownRemaining) {
                startRestCooldown(data.data.cooldownRemaining);
            }
            await refreshAgent();
            return;
        }

        // Handle combat results
        if ((action === 'attack' || action === 'attack_ashborn') && data.data) {
            // Check for realtime combat first, then tactical, then legacy
            if (data.data.combatId && data.data.realtime) {
                showRealtimeCombat(data.data);
            } else if (data.data.combatId) {
                showTacticalCombat(data.data);
            } else if (data.data.combat) {
                // Old auto-battler system (backwards compatibility)
                showCombat(data);
            }
        } else if (action === 'gather' && data.data) {
            showGatherResult(data);
        } else {
            showMessage(data.message || 'Action completed', 'success');
            if (action === 'rest' && data.success !== false) {
                startRestCooldown(300);
            }
        }

        await refreshAgent();
        await refreshWorld();
        await refreshActivity();
        await Promise.all([refreshZoneData(), refreshActiveQuest()]);

    } catch (e) {
        showMessage(e.message || 'Action failed', 'error');
    } finally {
        document.querySelectorAll('.btn-action, .btn-rest').forEach(b => b.disabled = false);
    }
}

async function attackMob(mobId, mobName, mobHp) {
    showMessage(`Attacking ${mobName}...`, 'info');
    await doAction('attack', null, { target: mobId });
}

async function moveToZone(zoneId) {
    await doAction('move', zoneId);
}

async function buyItem(code) {
    await doAction('buy', null, { itemCode: code, quantity: 1 });
}

async function sellItem(code) {
    await doAction('sell', null, { itemCode: code, quantity: 1 });
}

// ============ REST COOLDOWN ============
let restCooldownInterval = null;
function startRestCooldown(seconds) {
    const btn = document.getElementById('restBtn');
    const bar = document.getElementById('restCooldownBar');
    if (!btn) return;

    if (restCooldownInterval) clearInterval(restCooldownInterval);

    const endTime = Date.now() + seconds * 1000;
    const totalDuration = seconds * 1000;
    btn.disabled = true;
    btn.classList.add('on-cooldown');

    function tick() {
        const remaining = Math.max(0, endTime - Date.now());
        if (remaining <= 0) {
            clearInterval(restCooldownInterval);
            restCooldownInterval = null;
            btn.disabled = false;
            btn.classList.remove('on-cooldown');
            btn.textContent = '';
            btn.append('💤 Rest');
            const newBar = document.createElement('span');
            newBar.className = 'cooldown-bar';
            newBar.id = 'restCooldownBar';
            newBar.style.width = '0%';
            btn.appendChild(newBar);
            return;
        }
        const secs = Math.ceil(remaining / 1000);
        const min = Math.floor(secs / 60);
        const sec = secs % 60;
        const pct = Math.round((1 - remaining / totalDuration) * 100);
        btn.textContent = '';
        btn.append(`⏳ ${min}:${String(sec).padStart(2, '0')}`);
        const newBar = document.createElement('span');
        newBar.className = 'cooldown-bar';
        newBar.id = 'restCooldownBar';
        newBar.style.width = pct + '%';
        btn.appendChild(newBar);
    }

    restCooldownInterval = setInterval(tick, 1000);
    tick();
    if (bar) bar.style.width = '0%';
}

// ============ CRAFT TAB ============
const RECIPES = [
    // Basic (Lv 1-3)
    { code: 'health_potion', name: 'Health Potion', desc: 'Restores 50 HP', mats: { herbs: 3 }, result: 'health_potion', minLevel: 1, requiredZone: null, requiresPlan: null, tier: 'basic' },
    { code: 'nunchaku', name: 'Nunchaku', desc: 'Two sticks and a rope', mats: { torchwood: 2 }, result: 'nunchaku', minLevel: 1, requiredZone: null, requiresPlan: null, tier: 'basic' },
    { code: 'bandage', name: 'Bandage', desc: 'Restores 25 HP', mats: { herbs: 2, torchwood: 1 }, result: 'bandage', minLevel: 1, requiredZone: null, requiresPlan: null, tier: 'basic' },
    // Apprentice (Lv 4-6)
    { code: 'bone_shield', name: 'Bone Shield', desc: 'Shield crafted from bone dust and iron', mats: { bone_dust: 5, iron_scraps: 3 }, result: 'bone_shield', minLevel: 4, requiredZone: null, requiresPlan: null, tier: 'apprentice' },
    { code: 'grave_iron_sword', name: 'Grave Iron Sword', desc: 'Blade forged from grave iron', mats: { grave_iron: 3, iron_scraps: 5 }, result: 'grave_iron_sword', minLevel: 4, requiredZone: null, requiresPlan: null, tier: 'apprentice' },
    { code: 'antidote', name: 'Antidote', desc: 'Cures poison and restores 20 HP', mats: { herbs: 3, bone_dust: 2 }, result: 'antidote', minLevel: 4, requiredZone: null, requiresPlan: null, tier: 'apprentice' },
    { code: 'iron_plate', name: 'Iron Plate Armor', desc: 'Heavy but protective plate armor', mats: { iron_scraps: 8, dark_iron: 2 }, result: 'iron_plate', minLevel: 5, requiredZone: null, requiresPlan: null, tier: 'apprentice' },
    { code: 'mining_pick', name: 'Mining Pick', desc: 'Sturdy pick for mining operations', mats: { iron_scraps: 5, torchwood: 3 }, result: 'mining_pick', minLevel: 4, requiredZone: null, requiresPlan: null, tier: 'apprentice' },
    // Journeyman (Lv 7-10)
    { code: 'venom_blade', name: 'Venom Blade', desc: 'Poisoned blade dripping with venom', mats: { venom_sac: 3, iron_scraps: 5 }, result: 'venom_blade', minLevel: 7, requiredZone: null, requiresPlan: null, tier: 'journeyman' },
    { code: 'spider_silk_cloak', name: 'Spider Silk Cloak', desc: 'Lightweight and poison-resistant cloak', mats: { spider_silk: 5, shadow_thread: 2 }, result: 'spider_silk_cloak', minLevel: 7, requiredZone: null, requiresPlan: null, tier: 'journeyman' },
    { code: 'poison_trap', name: 'Poison Trap', desc: 'A deadly trap laced with venom', mats: { venom_sac: 2, spider_silk: 2 }, result: 'poison_trap', minLevel: 7, requiredZone: null, requiresPlan: null, tier: 'journeyman' },
    { code: 'starsilver_sword', name: 'Starsilver Sword', desc: 'Blessed blade of pure starsilver', mats: { starsilver_ore: 5, dark_iron: 3 }, result: 'starsilver_sword', minLevel: 8, requiredZone: null, requiresPlan: null, tier: 'journeyman' },
    { code: 'ember_shield', name: 'Ember Shield', desc: 'Shield infused with dark iron and gems', mats: { dark_iron: 5, gems: 2 }, result: 'ember_shield', minLevel: 8, requiredZone: null, requiresPlan: null, tier: 'journeyman' },
    // Master (Lv 11-15)
    { code: 'death_blade', name: 'Death Blade', desc: 'Forged from pure death energy', mats: { cursed_steel: 5, soul_shard: 3, bone_dust: 5 }, result: 'death_blade', minLevel: 11, requiredZone: null, requiresPlan: null, tier: 'master' },
    { code: 'necromancer_grimoire', name: 'Necromancer Staff', desc: 'Staff of dark necromantic power', mats: { soul_shard: 5, shadow_thread: 3, ancient_coins: 10 }, result: 'necromancer_grimoire', minLevel: 12, requiredZone: null, requiresPlan: null, tier: 'master' },
    // Legendary (Plan-Required)
    { code: 'webspinner_staff', name: 'Webspinner Staff', desc: 'Staff wrapped in frozen silk', mats: { spider_silk: 8, shadow_thread: 5, venom_sac: 3 }, result: 'webspinner_staff', minLevel: 9, requiredZone: null, requiresPlan: 'plan_webspinner_staff', tier: 'legendary', planSource: 'Giant Spider' },
    { code: 'cursed_greatsword', name: 'Cursed Greatsword', desc: 'Massive blade of cursed steel', mats: { cursed_steel: 8, soul_shard: 5, dark_iron: 5 }, result: 'cursed_greatsword', minLevel: 13, requiredZone: null, requiresPlan: 'plan_cursed_greatsword', tier: 'legendary', planSource: 'Death Knight' },
    { code: 'troll_hide_armor', name: 'Troll Hide Armor', desc: 'Thick armor from troll hide', mats: { iron_scraps: 10, herbs: 5, bone_dust: 5 }, result: 'troll_hide_armor', minLevel: 6, requiredZone: null, requiresPlan: 'plan_troll_hide_armor', tier: 'legendary', planSource: 'Cave Troll' },
    { code: 'ashborn_scale_mail', name: 'Ashborn Scale Mail', desc: 'Impenetrable scales from the Ashborn', mats: { dark_iron: 10, gems: 5, soul_shard: 5 }, result: 'ashborn_scale_mail', minLevel: 15, requiredZone: null, requiresPlan: 'plan_ashborn_scale_mail', tier: 'legendary', planSource: 'The Ashborn' },
];

const TIER_COLORS = { basic: '#888', apprentice: '#4CAF50', journeyman: '#2196F3', master: '#9C27B0', legendary: '#FF9800' };
const TIER_LABELS = { basic: 'Basic', apprentice: 'Apprentice', journeyman: 'Journeyman', master: 'Master', legendary: 'Legendary' };

let craftFilter = 'learned'; // 'all' | 'learned' | 'not_learned'

const RESOURCE_IMAGES = {
    torchwood: '/assets/torchwood.png',
    iron_scraps: '/assets/iron-scraps.png',
};

const RESOURCE_EMOJI = {
    health_potion: '❤️‍🩹', herbs: '🌿', torchwood: '🪵', iron_scraps: '⚙️',
    bone_dust: '🦴', venom_sac: '🧪', spider_silk: '🕸️', soul_shard: '💎',
    ancient_coins: '🪙', starsilver_ore: '✨', dark_iron: '⛏️', gems: '💎',
    cursed_steel: '🗡️', shadow_thread: '🧵', grave_iron: '⚔️', ember_core: '🔥',
    runic_fragments: '🔮',
};

function getInventoryCounts() {
    const counts = {};
    const inv = state.agent?.inventory || [];
    inv.forEach(item => {
        // Handle both string names and object {code, name, quantity} formats
        if (typeof item === 'string') {
            const code = item.toLowerCase().replace(/\s+/g, '_');
            counts[code] = (counts[code] || 0) + 1;
        } else if (item && item.code) {
            counts[item.code] = (counts[item.code] || 0) + (item.quantity || 1);
        }
    });
    return counts;
}

function hasRecipePlan(r, inv) {
    if (!r.requiresPlan) return true;
    return (inv[r.requiresPlan] || 0) >= 1;
}

function filterRecipes(recipes, inv) {
    const level = state.agent?.level || 1;
    if (craftFilter === 'learned') return recipes.filter(r => hasRecipePlan(r, inv) && level >= r.minLevel);
    if (craftFilter === 'not_learned') return recipes.filter(r => !hasRecipePlan(r, inv) || level < r.minLevel);
    return recipes;
}

function renderCraftFilterButtons() {
    return `<div style="display:flex;gap:6px;margin-bottom:12px">
        <button class="btn-shop" style="font-size:11px;padding:4px 10px;${craftFilter==='all'?'background:#ff6b35;':''}" onclick="craftFilter='all';renderZoneCrafting();renderCraftTab()">All</button>
        <button class="btn-shop" style="font-size:11px;padding:4px 10px;${craftFilter==='learned'?'background:#4CAF50;':''}" onclick="craftFilter='learned';renderZoneCrafting();renderCraftTab()">Learned</button>
        <button class="btn-shop" style="font-size:11px;padding:4px 10px;${craftFilter==='not_learned'?'background:#9C27B0;':''}" onclick="craftFilter='not_learned';renderZoneCrafting();renderCraftTab()">Not Learned</button>
    </div>`;
}

function renderRecipeCard(r, inv, compact) {
    const playerLevel = state.agent?.level || 1;
    const levelOk = playerLevel >= r.minLevel;
    const hasPlan = hasRecipePlan(r, inv);
    const tierColor = TIER_COLORS[r.tier] || '#888';
    const tierLabel = TIER_LABELS[r.tier] || r.tier;

    let canCraft = levelOk && hasPlan;
    const matHtml = Object.entries(r.mats).map(([mat, need]) => {
        const have = inv[mat] || 0;
        const ok = have >= need;
        if (!ok) canCraft = false;
        const emoji = RESOURCE_EMOJI[mat] || ITEM_EMOJI[mat] || '📦';
        return `<span class="craft-mat-tag ${ok ? 'have' : 'missing'}">${emoji} ${mat.replace(/_/g,' ')} ${have}/${need}</span>`;
    }).join('');

    const tierBadge = `<span style="background:${tierColor};color:#fff;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:6px">${tierLabel}</span>`;
    const levelBadge = `<span style="color:${levelOk?'#4CAF50':'#f44336'};font-size:10px;margin-left:6px">Lv ${r.minLevel}${levelOk?'':'🔒'}</span>`;
    
    let planStatus = '';
    if (r.requiresPlan) {
        planStatus = hasPlan 
            ? `<div style="color:#4CAF50;font-size:11px">📜 Plan Found!</div>`
            : `<div style="color:#f44336;font-size:11px">🔒 Requires Plan (drops from ${r.planSource || 'unknown'})</div>`;
    }

    const dimStyle = (!levelOk || !hasPlan) ? 'opacity:0.5;' : '';

    if (compact) {
        return `<div class="mob-card-compact ${canCraft ? 'threat-easy' : ''}" style="${dimStyle}">
            <div class="mob-col-left"><span class="mob-portrait-emoji">${ITEM_EMOJI[r.code] || '🔨'}</span></div>
            <div class="mob-col-mid">
                <div class="mob-name-row"><span class="mob-name">${r.name}</span>${tierBadge}${levelBadge}</div>
                <div style="font-size:11px;color:#999;margin:2px 0">${r.desc}</div>
                ${planStatus}
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${matHtml}</div>
            </div>
            <div class="mob-col-right">
                ${canCraft ? `<button class="btn-shop" onclick="doCraftFromTab('${r.code}')" style="font-size:11px;padding:4px 10px">🔨 Craft</button>` : ''}
            </div>
        </div>`;
    } else {
        return `<div class="craft-recipe-card" style="${dimStyle}">
            <div class="craft-recipe-top">
                <div class="craft-recipe-name">${r.name}${tierBadge}${levelBadge}</div>
                <div class="craft-recipe-desc">${r.desc}</div>
                ${planStatus}
            </div>
            <div class="craft-recipe-mats">${Object.entries(r.mats).map(([mat, need]) => {
                const have = inv[mat] || 0;
                const ok = have >= need;
                const emoji = RESOURCE_EMOJI[mat] || '📦';
                return `<span class="${ok ? 'have' : 'missing'}">${emoji} ${mat.replace(/_/g,' ')} (${have}/${need})</span>`;
            }).join(' + ')}</div>
            <button class="craft-btn-full" ${canCraft ? '' : 'disabled'} onclick="doCraftFromTab('${r.code}')">
                ${canCraft ? '🔨 Craft' : !levelOk ? '🔒 Level Too Low' : !hasPlan ? '🔒 Need Plan' : '🔒 Missing Materials'}
            </button>
        </div>`;
    }
}

function renderZoneCrafting() {
    const container = document.getElementById('zoneCraftContent');
    if (!container) return;
    const inv = getInventoryCounts();
    const filtered = filterRecipes(RECIPES, inv);
    
    if (filtered.length === 0) {
        container.innerHTML = renderCraftFilterButtons() + '<div class="zone-empty">No recipes match this filter</div>';
        return;
    }

    container.innerHTML = renderCraftFilterButtons() + `<div class="craft-zone-grid">${filtered.map(r => renderRecipeCard(r, inv, true)).join('')}</div>`;
}

function renderCraftTab() {
    const inv = getInventoryCounts();
    const container = document.getElementById('craftContent');

    // Show current materials
    const allMats = ['herbs','torchwood','iron_scraps','bone_dust','venom_sac','spider_silk','soul_shard','ancient_coins','health_potion','starsilver_ore','dark_iron','gems','cursed_steel','shadow_thread','grave_iron','ember_core','runic_fragments'];
    const matEntries = Object.entries(inv).filter(([code]) => allMats.includes(code));
    
    let materialsHtml = '';
    if (matEntries.length > 0) {
        materialsHtml = `<div class="craft-materials">
            <h3 style="color:#aaa;margin-bottom:8px">📦 Your Materials</h3>
            <div class="mat-grid">${matEntries.map(([code, qty]) => {
                const img = RESOURCE_IMAGES[code];
                const icon = img ? `<img src="${img}" class="mat-icon">` : `<span class="mat-emoji">${RESOURCE_EMOJI[code] || '📦'}</span>`;
                return `<div class="mat-card">${icon}<span class="mat-name">${code.replace(/_/g,' ')}</span><span class="mat-qty">x${qty}</span></div>`;
            }).join('')}</div>
        </div>`;
    } else {
        materialsHtml = `<div class="craft-materials"><p style="color:#666">No crafting materials yet. Gather resources from zones!</p></div>`;
    }

    // Show plans owned
    const planEntries = Object.entries(inv).filter(([code]) => code.startsWith('plan_'));
    if (planEntries.length > 0) {
        materialsHtml += `<div class="craft-materials" style="margin-top:12px">
            <h3 style="color:#FF9800;margin-bottom:8px">📜 Crafting Plans</h3>
            <div class="mat-grid">${planEntries.map(([code, qty]) => {
                return `<div class="mat-card"><span class="mat-emoji">📜</span><span class="mat-name">${code.replace(/^plan_/, '').replace(/_/g,' ')}</span><span class="mat-qty">x${qty}</span></div>`;
            }).join('')}</div>
        </div>`;
    }

    const filtered = filterRecipes(RECIPES, inv);
    const recipesHtml = filtered.map(r => renderRecipeCard(r, inv, false)).join('');

    container.innerHTML = materialsHtml + renderCraftFilterButtons() + `<h3 style="color:#ff6b35;margin:20px 0 12px;font-family:'MedievalSharp',cursive">📜 Recipes</h3><div class="craft-recipe-grid">${recipesHtml}</div>`;
}

async function doCraftFromTab(code) {
    await doAction('craft', null, { itemCode: code });
    renderCraftTab(); // refresh after craft
}

// ============ TRADE TAB ============
// ============ MARKETPLACE ============
let marketView = 'browse'; // 'browse' | 'sell' | 'my' | 'history'

async function renderMarketTab() {
    const container = document.getElementById('marketContent');
    if (!container) return;

    const navHtml = `
        <div class="market-nav">
            <button class="btn-shop ${marketView==='browse'?'market-active':''}" onclick="marketView='browse';renderMarketTab()">🛒 Browse</button>
            <button class="btn-shop ${marketView==='sell'?'market-active':''}" onclick="marketView='sell';renderMarketTab()">📤 Sell</button>
            <button class="btn-shop ${marketView==='my'?'market-active':''}" onclick="marketView='my';renderMarketTab()">📋 My Listings</button>
            <button class="btn-shop ${marketView==='history'?'market-active':''}" onclick="marketView='history';renderMarketTab()">📜 History</button>
        </div>
    `;

    if (marketView === 'browse') {
        await renderMarketBrowse(container, navHtml);
    } else if (marketView === 'sell') {
        renderMarketSell(container, navHtml);
    } else if (marketView === 'my') {
        await renderMarketMy(container, navHtml);
    } else if (marketView === 'history') {
        await renderMarketHistory(container, navHtml);
    }
}

async function renderMarketBrowse(container, navHtml) {
    let listings = [];
    try {
        const res = await fetch(`${API}/marketplace/listings`, { headers: authHeadersOnly() });
        const data = await res.json();
        listings = data.listings || [];
    } catch(e) {}

    const listingsHtml = listings.length === 0
        ? '<div class="zone-empty">No items for sale. Be the first to list!</div>'
        : listings.map(l => {
            const timeLeft = Math.max(0, Math.floor((l.expires_at - Date.now()) / 3600000));
            const emoji = ITEM_EMOJI[l.item_code] || '📦';
            return `<div class="market-listing">
                <div class="market-item-info">
                    <span class="market-item-name">${emoji} ${l.item_name}</span>
                    <span class="market-item-qty">x${l.quantity}</span>
                </div>
                <div class="market-item-meta">
                    <span class="market-seller">by ${l.seller_name}</span>
                    <span class="market-expires">${timeLeft}h left</span>
                </div>
                <div class="market-item-price">
                    <span class="market-gold">💰 ${l.price}g</span>
                    <button class="btn-shop market-buy-btn" onclick="marketBuy(${l.id}, '${l.item_name}', ${l.price})">Buy</button>
                </div>
            </div>`;
        }).join('');

    container.innerHTML = navHtml + `<div class="market-listings">${listingsHtml}</div>`;
}

function renderMarketSell(container, navHtml) {
    const inv = getInventoryCounts();
    const invOptions = Object.entries(inv).map(([code, qty]) =>
        `<option value="${code}">${(ITEM_EMOJI[code]||'📦')} ${code.replace(/_/g,' ')} (x${qty})</option>`
    ).join('');

    container.innerHTML = navHtml + `
        <div class="market-sell-form">
            <h3 style="color:var(--starsilver-silver)">📤 List Item for Sale</h3>
            <div class="market-form-row">
                <label>Item</label>
                <select id="marketSellItem" class="game-input">
                    <option value="">-- Select Item --</option>
                    ${invOptions}
                </select>
            </div>
            <div class="market-form-row">
                <label>Quantity</label>
                <input type="number" id="marketSellQty" class="game-input" value="1" min="1">
            </div>
            <div class="market-form-row">
                <label>Price (gold)</label>
                <input type="number" id="marketSellPrice" class="game-input" value="10" min="1">
            </div>
            <div class="market-tax-note">5% tax deducted on sale. Buyer pays listed price.</div>
            <button class="craft-btn-full" onclick="marketList()" style="margin-top:12px">📤 List for Sale</button>
        </div>
    `;
}

async function renderMarketMy(container, navHtml) {
    let active = [], sold = [];
    try {
        const res = await fetch(`${API}/marketplace/my`, { headers: authHeadersOnly() });
        const data = await res.json();
        active = data.active || [];
        sold = data.sold || [];
    } catch(e) {}

    const activeHtml = active.length === 0
        ? '<div class="zone-empty">No active listings</div>'
        : active.map(l => {
            const emoji = ITEM_EMOJI[l.item_code] || '📦';
            return `<div class="market-listing">
                <div class="market-item-info">
                    <span class="market-item-name">${emoji} ${l.item_name}</span>
                    <span class="market-item-qty">x${l.quantity}</span>
                </div>
                <div class="market-item-price">
                    <span class="market-gold">💰 ${l.price}g</span>
                    <button class="btn-shop" style="background:#dc2626" onclick="marketCancel(${l.id})">Cancel</button>
                </div>
            </div>`;
        }).join('');

    const soldHtml = sold.length === 0
        ? '<div class="zone-empty">No sales yet</div>'
        : sold.map(s => {
            const emoji = ITEM_EMOJI[s.item_code] || '📦';
            const tax = Math.floor(s.price * 0.05);
            return `<div class="market-listing sold">
                <div class="market-item-info">
                    <span class="market-item-name">${emoji} ${s.item_name} x${s.quantity}</span>
                </div>
                <div class="market-item-meta">
                    <span>→ ${s.buyer_name}</span>
                    <span class="market-gold">💰 ${s.price - tax}g received</span>
                </div>
            </div>`;
        }).join('');

    container.innerHTML = navHtml + `
        <h3 style="color:var(--starsilver-silver)">📋 Active Listings</h3>
        ${activeHtml}
        <h3 style="color:var(--starsilver-silver);margin-top:20px">✅ Sold</h3>
        ${soldHtml}
    `;
}

async function renderMarketHistory(container, navHtml) {
    let sales = [];
    try {
        const res = await fetch(`${API}/marketplace/history`);
        const data = await res.json();
        sales = data.sales || [];
    } catch(e) {}

    const salesHtml = sales.length === 0
        ? '<div class="zone-empty">No sales recorded yet</div>'
        : sales.map(s => {
            const emoji = ITEM_EMOJI[s.item_code] || '📦';
            const ago = Math.floor((Date.now() - s.sold_at) / 60000);
            const timeStr = ago < 60 ? `${ago}m ago` : `${Math.floor(ago/60)}h ago`;
            return `<div class="market-listing history">
                <div class="market-item-info">
                    <span class="market-item-name">${emoji} ${s.item_name} x${s.quantity}</span>
                </div>
                <div class="market-item-meta">
                    <span>${s.seller_name} → ${s.buyer_name}</span>
                    <span class="market-gold">💰 ${s.price}g</span>
                    <span style="color:#888">${timeStr}</span>
                </div>
            </div>`;
        }).join('');

    container.innerHTML = navHtml + `
        <h3 style="color:var(--starsilver-silver)">📜 Recent Sales</h3>
        ${salesHtml}
    `;
}

async function marketList() {
    const itemCode = document.getElementById('marketSellItem')?.value;
    const quantity = parseInt(document.getElementById('marketSellQty')?.value) || 1;
    const price = parseInt(document.getElementById('marketSellPrice')?.value) || 0;

    if (!itemCode) { showMessage('Select an item to sell', 'error'); return; }
    if (price < 1) { showMessage('Price must be at least 1g', 'error'); return; }

    try {
        const res = await fetch(`${API}/marketplace/list`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ itemCode, quantity, price }),
        });
        const data = await res.json();
        showMessage(data.message || data.error, res.ok ? 'success' : 'error');
        if (res.ok) {
            await refreshAgent();
            renderMarketTab();
        }
    } catch(e) {
        showMessage('Failed to list item', 'error');
    }
}

async function marketBuy(listingId, itemName, price) {
    if (!confirm(`Buy ${itemName} for ${price}g?`)) return;

    try {
        const res = await fetch(`${API}/marketplace/buy`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ listingId }),
        });
        const data = await res.json();
        showMessage(data.message || data.error, res.ok ? 'success' : 'error');
        if (res.ok) {
            await refreshAgent();
            renderMarketTab();
        }
    } catch(e) {
        showMessage('Failed to buy item', 'error');
    }
}

async function marketCancel(listingId) {
    try {
        const res = await fetch(`${API}/marketplace/cancel`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ listingId }),
        });
        const data = await res.json();
        showMessage(data.message || data.error, res.ok ? 'success' : 'error');
        if (res.ok) {
            await refreshAgent();
            renderMarketTab();
        }
    } catch(e) {
        showMessage('Failed to cancel listing', 'error');
    }
}

// ============ SKILLS ============
const TREE_COLORS = { warrior: '#ef4444', shadow: '#8b5cf6', mystic: '#3b82f6' };
const TREE_ICONS = { warrior: '⚔️', shadow: '🗡️', mystic: '✨' };

// Map skill → unlocked ability description
const SKILL_ABILITY_MAP = {
    poison_blade: { name: 'Venom Slash', desc: '0.8× ATK + Poison (3/turn, 3 turns)', icon: '🐍' },
    berserker_rage: { name: 'Battle Cry', desc: '+30% ATK for 3 rounds', icon: '📣' },
    healing_light: { name: 'Heal', desc: 'Restore 25% max HP', icon: '💚' },
    shadow_meld: { name: 'Riposte', desc: 'Counter next hit for 1.5×', icon: '🔄' },
    arcane_knowledge: { name: 'Arcane Bolt / Elemental Burst', desc: '1.6× DEF ignore + 2.0× double element bonus', icon: '⚡' },
    iron_skin: { name: 'Fortify', desc: '+40% DEF for 2 rounds', icon: '🛡️' },
    silent_step: { name: 'Feint', desc: "Reveal enemy's TRUE next stance", icon: '👁️' },
};

function buildQuestRewardHtml(rewards) {
    const pills = [];
    if (rewards.xp) pills.push(`<span class="quest-reward reward-xp">⭐ +${rewards.xp} XP</span>`);
    if (rewards.gold) pills.push(`<span class="quest-reward reward-gold">💰 +${rewards.gold}</span>`);
    if (rewards.skillPoints) pills.push(`<span class="quest-reward reward-sp">🌟 +${rewards.skillPoints} SP</span>`);
    if (rewards.item) pills.push(`<span class="quest-reward reward-item">🎁 ${rewards.item.quantity}x ${rewards.item.name}</span>`);
    return pills.join('');
}

async function renderQuestsTab() {
    const container = document.getElementById('questsContent');
    if (!container) return;
    container.innerHTML = '<div class="zone-empty">Loading quests...</div>';

    try {
        const res = await fetch(`${API}/api/quests`, { headers: authHeadersOnly() });
        const data = await res.json();
        if (!data.success) { container.innerHTML = '<div class="zone-empty">Failed to load quests</div>'; return; }

        const ZONE_NAMES = { the_gate: '🕯️ The Gate', tomb_halls: '⚰️ Tomb Halls', the_mines: '⛏️ The Mines', the_web: '🕸️ The Web', forge_of_ruin: '🔥 Forge of Ruin', bone_throne: '💀 Bone Throne' };
        
        // Zone progress bar
        let html = '<div class="quest-zone-summary">';
        for (const zs of data.zoneSummary) {
            const pct = zs.total > 0 ? Math.round(zs.completed / zs.total * 100) : 0;
            const isCurrent = zs.zone === data.currentZone;
            html += `<div class="quest-zone-bar ${isCurrent ? 'quest-zone-current' : ''}" style="margin-bottom:6px">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
                    <span>${ZONE_NAMES[zs.zone] || zs.zone}${isCurrent ? ' 📍' : ''}</span>
                    <span style="color:#4ade80">${zs.completed}/${zs.total}</span>
                </div>
                <div class="quest-progress-bar" style="height:6px">
                    <div class="quest-progress-fill fill-active" style="width:${pct}%;background:linear-gradient(90deg,#4ade80,#22c55e)"></div>
                </div>
            </div>`;
        }
        html += '</div><hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">';

        // Current zone quests
        html += `<h3 style="color:var(--ember-orange);margin-bottom:10px">${ZONE_NAMES[data.currentZone] || data.currentZone} Quests</h3>`;
        
        for (const q of data.quests) {
            const pct = q.objective.amount > 0 ? Math.round(q.progress / q.objective.amount * 100) : 0;
            let statusIcon, statusClass, statusBorder;
            if (q.claimed) {
                statusIcon = '✅'; statusClass = 'quest-done'; statusBorder = '#4ade80';
            } else if (q.completed) {
                statusIcon = '🎉'; statusClass = 'quest-claimable'; statusBorder = '#fbbf24';
            } else if (q.unlocked) {
                statusIcon = '📜'; statusClass = 'quest-active'; statusBorder = 'var(--ember-orange)';
            } else {
                statusIcon = '🔒'; statusClass = 'quest-locked'; statusBorder = 'rgba(255,255,255,0.1)';
            }

            html += `<div class="quest-card ${statusClass}">
                <div class="quest-header">
                    <span class="quest-title"><span class="quest-icon">${statusIcon}</span> ${q.name}</span>
                    <span class="quest-order">#${q.order}</span>
                </div>
                <div class="quest-desc">${q.description}</div>
                ${q.unlocked && !q.claimed ? `
                    <div class="quest-progress">
                        <div class="quest-progress-labels">
                            <span>${q.objective.targetName}: ${q.progress}/${q.objective.amount}</span>
                            <span>${pct}%</span>
                        </div>
                        <div class="quest-progress-bar">
                            <div class="quest-progress-fill ${q.completed ? 'fill-claimable' : 'fill-active'}" style="width:${pct}%"></div>
                        </div>
                    </div>
                ` : ''}
                <div class="quest-footer">
                    <div class="quest-rewards">${buildQuestRewardHtml(q.rewards)}</div>
                    ${q.completed && !q.claimed ? `<button class="btn-claim" onclick="claimQuest('${q.id}')">🎁 Claim</button>` : ''}
                </div>
            </div>`;
        }

        if (data.quests.length === 0) {
            html += '<div class="zone-empty">No quests available in this zone.</div>';
        }

        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="zone-empty">Failed to load quests</div>';
    }
}

async function claimQuest(questId) {
    const result = await doAction('claim_quest', null, { questId });
    renderQuestsTab();
    refreshActiveQuest();
    await refreshAgent();
}

async function refreshActiveQuest() {
    const section = document.getElementById('activeQuestSection');
    const container = document.getElementById('activeQuestContent');
    if (!section || !container || !state.apiKey) return;

    try {
        const res = await fetch(`${API}/api/quests`, { headers: authHeadersOnly() });
        if (!res.ok) { section.style.display = 'none'; return; }
        const data = await res.json();
        if (!data.success || !data.quests || data.quests.length === 0) {
            section.style.display = 'none';
            return;
        }

        // Find the first unclaimed, unlocked quest (active quest)
        const active = data.quests.find(q => q.unlocked && !q.claimed);
        if (!active) {
            // All done or all locked — show completion
            const allClaimed = data.quests.every(q => q.claimed);
            if (allClaimed) {
                section.style.display = '';
                container.innerHTML = `<div class="quest-card quest-done" style="opacity:1;color:#4ade80;font-size:13px">✅ All quests completed in this zone!</div>`;
            } else {
                section.style.display = 'none';
            }
            return;
        }

        section.style.display = '';
        const pct = active.objective.amount > 0 ? Math.round(active.progress / active.objective.amount * 100) : 0;
        const claimable = active.completed && !active.claimed;

        container.innerHTML = `
            <div class="quest-card ${claimable ? 'quest-claimable' : 'quest-active'}">
                <div class="quest-header">
                    <span class="quest-title"><span class="quest-icon">${claimable ? '🎉' : '📜'}</span> ${active.name}</span>
                    <span class="quest-order">#${active.order}</span>
                </div>
                <div class="quest-desc">${active.description}</div>
                <div class="quest-progress">
                    <div class="quest-progress-labels">
                        <span>${active.objective.targetName}: ${active.progress}/${active.objective.amount}</span>
                        <span>${pct}%</span>
                    </div>
                    <div class="quest-progress-bar">
                        <div class="quest-progress-fill ${claimable ? 'fill-claimable' : 'fill-active'}" style="width:${pct}%"></div>
                    </div>
                </div>
                <div class="quest-footer">
                    <div class="quest-rewards">${buildQuestRewardHtml(active.rewards)}</div>
                    ${claimable ? `<button class="btn-claim" onclick="claimQuest('${active.id}')">🎁 Claim</button>` : ''}
                </div>
            </div>`;
    } catch (e) {
        section.style.display = 'none';
    }
}

async function renderSkillsTab() {
    const container = document.getElementById('skillsContent');
    if (!container) return;

    try {
        const res = await fetch(`${API}/api/skills`, { headers: authHeadersOnly() });
        const data = await res.json();
        if (!data.success) { container.innerHTML = `<div class="zone-empty">${data.error}</div>`; return; }

        const learnedIds = new Set(data.learned.map(s => s.id));

        let html = `<div class="skills-header">
            <span class="skill-points-display">🌟 Skill Points: <strong>${data.skillPoints}</strong></span>
        </div>`;

        html += `<div class="skill-trees-grid">`;
        for (const tree of ['warrior', 'shadow', 'mystic']) {
            const treeSkills = data.allSkills.filter(s => s.tree === tree);
            const color = TREE_COLORS[tree];
            const icon = TREE_ICONS[tree];

            html += `<div class="skill-tree">
                <h3 style="color:${color}">${icon} ${tree.charAt(0).toUpperCase() + tree.slice(1)} Path</h3>
                <div class="skill-nodes">`;

            for (const skill of treeSkills) {
                const learned = learnedIds.has(skill.id);
                const available = data.available.some(s => s.id === skill.id);
                const locked = !learned && !available;
                const canAfford = data.skillPoints >= skill.cost;
                const abilityInfo = SKILL_ABILITY_MAP[skill.id];

                let statusClass = learned ? 'skill-learned' : available ? 'skill-available' : 'skill-locked';
                let statusIcon = learned ? '✅' : available ? (canAfford ? '🔓' : '🔒') : '🔒';

                html += `<div class="skill-node ${statusClass}" style="border-color:${learned ? color : 'rgba(255,255,255,0.1)'}">
                    <div class="skill-node-header">
                        <span class="skill-node-name">${statusIcon} ${skill.name}</span>
                        <span class="skill-node-cost">${skill.cost} SP</span>
                    </div>
                    <div class="skill-node-desc">${skill.description}</div>
                    ${abilityInfo ? `<div class="skill-ability-unlock">${abilityInfo.icon} Unlocks: <strong>${abilityInfo.name}</strong> — ${abilityInfo.desc}</div>` : ''}
                    ${skill.requires ? `<div class="skill-req">Requires: ${data.allSkills.find(s => s.id === skill.requires)?.name || skill.requires}</div>` : ''}
                    ${available && canAfford && !learned ? `<button class="btn-shop" style="margin-top:6px;background:${color}" onclick="learnSkillAction('${skill.id}')">Learn</button>` : ''}
                    ${available && !canAfford && !learned ? `<div class="skill-req" style="color:#f59e0b">Need ${skill.cost} SP (have ${data.skillPoints})</div>` : ''}
                </div>`;
            }

            html += `</div></div>`;
        }
        html += `</div>`;

        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="zone-empty">Failed to load skills</div>';
    }
}

async function learnSkillAction(skillId) {
    await doAction('learn_skill', null, { skillId });
    renderSkillsTab();
}

async function useItem(code) {
    await doAction('use_item', null, { itemCode: code });
}

async function equipItem(code) {
    await doAction('equip_item', null, { itemCode: code });
}

async function createGuild() {
    const name = document.getElementById('guildName')?.value?.trim();
    if (!name) return;
    await doAction('create_guild', null, { name });
    renderGuild();
}

async function joinGuild() {
    const id = parseInt(document.getElementById('guildJoinId')?.value);
    if (!id) return;
    await doAction('join_guild', null, { guildId: id });
    renderGuild();
}

async function issuePvPChallenge() {
    const targetId = parseInt(document.getElementById('pvpTarget')?.value);
    const wager = parseInt(document.getElementById('pvpWager')?.value);
    if (!targetId || !wager) return showMessage('Enter target ID and wager', 'error');

    try {
        const res = await fetch(`${API}/pvp/challenge`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ targetAgentId: targetId, wagerAmount: wager }),
        });
        const data = await res.json();
        showMessage(data.message || data.error || 'Challenge issued', res.ok ? 'success' : 'error');
        renderPvP();
    } catch (e) {
        showMessage('Failed to issue challenge', 'error');
    }
}

// ============ GATHER WITH COOLDOWN ============
function doGather(resourceCode, cooldownSec) {
    doAction('gather', null, { target: resourceCode });
}

function getGatherLabelMap() {
    return {
        torchwood: '🪓 Chop', iron_scraps: '⛏️ Mine', herbs: '🌿 Gather',
        bone_dust: '🦴 Collect', ancient_coins: '🪙 Loot', grave_iron: '⛏️ Mine',
        starsilver_ore: '⛏️ Mine', dark_iron: '⛏️ Mine', gems: '⛏️ Mine',
        spider_silk: '🕸️ Harvest', venom_sac: '🧪 Extract', shadow_thread: '🧵 Harvest',
        cursed_steel: '⛏️ Mine', ember_core: '🔥 Extract', runic_fragments: '🔮 Collect',
        soul_shard: '💎 Extract', dark_essence: '🌑 Siphon', necrotic_tome: '📕 Loot',
        ashborn_heart: '❤️‍🔥 Claim', flame_crown: '👑 Claim', ancient_power: '⚡ Claim',
        glory_tokens: '🏆 Claim',
    };
}

function startGatherCooldown(resourceCode, seconds) {
    // Clear any existing cooldown interval for this resource
    if (gatherCooldowns[resourceCode]?.interval) {
        clearInterval(gatherCooldowns[resourceCode].interval);
    }

    const endTime = Date.now() + seconds * 1000;
    gatherCooldowns[resourceCode] = { endTime, interval: null };

    function tick() {
        const btn = document.getElementById('gather-btn-' + resourceCode);
        if (!btn) return;
        const remaining = Math.ceil((endTime - Date.now()) / 1000);
        if (remaining <= 0) {
            clearInterval(gatherCooldowns[resourceCode].interval);
            delete gatherCooldowns[resourceCode];
            btn.disabled = false;
            btn.classList.remove('btn-cooldown');
            btn.textContent = getGatherLabelMap()[resourceCode] || '🪓 Gather';
        } else {
            btn.disabled = true;
            btn.classList.add('btn-cooldown');
            btn.textContent = `⏳ ${remaining}s`;
        }
    }

    gatherCooldowns[resourceCode].interval = setInterval(tick, 1000);
    tick(); // run immediately
}

// Re-apply active cooldowns after zone re-render
function reapplyGatherCooldowns() {
    for (const [code, cd] of Object.entries(gatherCooldowns)) {
        const remaining = Math.ceil((cd.endTime - Date.now()) / 1000);
        if (remaining > 0) {
            // Clear old interval and start fresh (buttons may have been re-created)
            if (cd.interval) clearInterval(cd.interval);
            startGatherCooldown(code, remaining);
        } else {
            if (cd.interval) clearInterval(cd.interval);
            delete gatherCooldowns[code];
        }
    }
}

// ============ GATHER RESULT ============
function showGatherResult(data) {
    const d = data.data;
    const msg = data.message || 'Gathered successfully';
    showMessage(msg, 'success');
    // Start cooldown timer on the button if cooldownSeconds is provided
    if (d.cooldownSeconds && d.itemCode) {
        startGatherCooldown(d.itemCode, d.cooldownSeconds);
    }
}

// ============ COMBAT VIEW ============
function showCombat(data) {
    const overlay = document.getElementById('combatOverlay');
    overlay.classList.remove('hidden');

    const combat = data.data.combat;
    const log = document.getElementById('combatLog');
    const resultContainer = document.getElementById('combatResultContainer');
    resultContainer.innerHTML = '';

    document.getElementById('combatPlayerName').textContent = state.agent?.name || 'You';
    document.getElementById('combatMobName').textContent = combat.mobName || combat.opponent || 'Enemy';

    const mobEmojis = {
        'Giant Rat': '🐀', 'Cave Bat': '🦇', 'Skeleton Warrior': '💀', 'Wight': '👻',
        'Gremlin Miner': '👺', 'Giant Spider': '🕷️', 'Broodmother': '🕷️', 'Brute Smith': '🔨',
        'Wraith': '👻', 'Death Knight': '⚔️', 'The Ashborn': '🔥', 'Cave Troll': '🧌',
    };
    document.getElementById('combatMobEmoji').textContent = mobEmojis[combat.mobName] || '👹';

    // Mob art image
    const mobImgMap = {
        'Sewer Rat': '/assets/sewer-rat.png',
        'Giant Rat': '/assets/giant-rat.png',
        'Cave Bat': '/assets/cave-bat.png',
        'Plague Rat': '/assets/blighted-rat.png',
        'Corrupted Hound': '/assets/corrupted-hound.png',
        'Rabid Ghoul': '/assets/rabid-ghoul.png',
        'Wandering Ghost': '/assets/wraith.png',
        'Tomb Shade': '/assets/tomb-shade.png',
        'Skeleton Warrior': '/assets/skeleton-warrior.png',
        'Gremlin Miner': '/assets/gremlin-miner.png',
        'Wraith': '/assets/tomb-wraith.png',
        'Cave Troll': '/assets/cave-troll.png',
        'Giant Spider': '/assets/giant-spider.png',
        'Broodmother': '/assets/broodmother.png',
        'Brute Smith': '/assets/brute-smith.png',
        'Ember Colossus': '/assets/ember-colossus.png',
        'Death Knight': '/assets/death-knight.png',
        'The Ashborn': '/assets/the-ashborn.png',
        'Skeletal Dragon': '/assets/skeletal-dragon.png',
    };
    const combatMobImg = document.getElementById('combatMobImg');
    const combatMobEmoji = document.getElementById('combatMobEmoji');
    if (combatMobImg && mobImgMap[combat.mobName]) {
        combatMobImg.src = mobImgMap[combat.mobName];
        combatMobImg.style.display = 'block';
        if (combatMobEmoji) combatMobEmoji.style.display = 'none';
    } else {
        if (combatMobImg) combatMobImg.style.display = 'none';
        if (combatMobEmoji) combatMobEmoji.style.display = 'block';
    }

    // Reset HP bars
    const playerHpBar = document.getElementById('combatPlayerHp');
    const mobHpBar = document.getElementById('combatMobHp');
    playerHpBar.style.width = '100%';
    playerHpBar.className = 'fighter-hp-fill hp-high';
    mobHpBar.style.width = '100%';
    mobHpBar.className = 'fighter-hp-fill mob-hp';
    log.innerHTML = '';

    // Animate turns
    const turns = combat.turns || [];
    let playerMaxHp = state.agent?.maxHp || state.agent?.hp || 100;
    let mobMaxHp = combat.mobHp || 50;
    let mobHp = mobMaxHp;
    let currentPlayerHp = playerMaxHp;
    const turnDelay = 400;

    function updatePlayerHpColor() {
        const pct = currentPlayerHp / playerMaxHp;
        playerHpBar.className = 'fighter-hp-fill ' + (pct > 0.6 ? 'hp-high' : pct > 0.3 ? 'hp-mid' : 'hp-low');
    }

    function spawnFloatingDmg(fighterSelector, damage, isCrit) {
        const fighter = document.querySelector(fighterSelector);
        if (!fighter) return;
        const el = document.createElement('div');
        el.className = 'floating-dmg ' + (isCrit ? 'crit' : 'normal');
        el.textContent = (isCrit ? '💥 ' : '') + '-' + damage;
        el.style.left = (30 + Math.random() * 40) + '%';
        el.style.top = '20%';
        fighter.appendChild(el);
        setTimeout(() => el.remove(), 1300);
    }

    turns.forEach((turn, i) => {
        setTimeout(() => {
            const line = document.createElement('div');
            const isPlayer = turn.attacker === state.agent?.name || turn.attacker === 'player';

            if (isPlayer) {
                line.className = turn.critical ? 'turn-crit' : 'turn-player';
                line.textContent = `⚔️ You deal ${turn.damage} damage${turn.critical ? ' (CRIT!)' : ''}`;
                mobHp = Math.max(0, mobHp - turn.damage);
                mobHpBar.style.width = (mobHp / mobMaxHp * 100) + '%';

                spawnFloatingDmg('.fighter-mob', turn.damage, turn.critical);

                document.querySelector('.fighter-player .fighter-sprite').classList.add('attacking');
                setTimeout(() => {
                    document.querySelector('.fighter-player .fighter-sprite').classList.remove('attacking');
                    document.querySelector('.fighter-mob .fighter-sprite').classList.add('hit');
                    setTimeout(() => document.querySelector('.fighter-mob .fighter-sprite').classList.remove('hit'), 300);
                }, 150);
            } else {
                line.className = turn.critical ? 'turn-crit' : 'turn-mob';
                line.textContent = `💥 Enemy deals ${turn.damage} damage${turn.critical ? ' (CRIT!)' : ''}`;
                currentPlayerHp = Math.max(0, currentPlayerHp - turn.damage);
                playerHpBar.style.width = (currentPlayerHp / playerMaxHp * 100) + '%';
                updatePlayerHpColor();

                spawnFloatingDmg('.fighter-player', turn.damage, turn.critical);

                document.querySelector('.fighter-mob .fighter-sprite').classList.add('attacking');
                setTimeout(() => {
                    document.querySelector('.fighter-mob .fighter-sprite').classList.remove('attacking');
                    document.querySelector('.fighter-player .fighter-sprite').classList.add('hit');
                    setTimeout(() => document.querySelector('.fighter-player .fighter-sprite').classList.remove('hit'), 300);
                }, 150);

                // Screen shake (bigger on crit)
                if (turn.critical) {
                    document.getElementById('combatArena').classList.add('screen-shake');
                    setTimeout(() => document.getElementById('combatArena').classList.remove('screen-shake'), 400);
                }
                document.getElementById('gameScreen').classList.add('screen-shake');
                setTimeout(() => document.getElementById('gameScreen').classList.remove('screen-shake'), 400);
            }

            log.appendChild(line);
            log.scrollTop = log.scrollHeight;

            // Last turn -> show result screen
            if (i === turns.length - 1) {
                const won = data.data.combat.won || data.success;
                setTimeout(() => {
                    if (won) {
                        showVictoryResult(data, resultContainer);
                    } else {
                        showDefeatResult(data, resultContainer);
                    }
                }, turnDelay + 200);
            }
        }, i * (turnDelay + 200));
    });

    if (turns.length === 0) {
        log.innerHTML = `<div class="turn-result">${data.message || 'Combat resolved'}</div>`;
        const won = data.data?.combat?.won || data.success;
        setTimeout(() => {
            if (won) showVictoryResult(data, resultContainer);
            else showDefeatResult(data, resultContainer);
        }, 300);
    }
}

function showVictoryResult(data, container) {
    const xp = data.data.xpGained || 0;
    const gold = data.data.goldGained || 0;
    const loot = data.data.loot || [];
    const mobName = data.data.combat?.mobName || 'Enemy';
    const xpCapped = data.data.xpCapped || false;

    // Flavor text
    const flavors = [
        'The darkness retreats...', 'Another soul claimed by the void.',
        'Your blade drinks deep.', 'The Hollows tremble before you.',
        'First blood!', 'A worthy kill.', 'The embers burn brighter.',
        'Death bows to your will.', 'The shadows scatter.'
    ];
    const flavor = flavors[Math.floor(Math.random() * flavors.length)];

    // Build confetti HTML (24 pieces)
    let confettiHtml = '<div class="confetti-container">';
    for (let i = 0; i < 24; i++) confettiHtml += '<div class="confetti-piece"></div>';
    confettiHtml += '</div>';

    container.innerHTML = `
        ${confettiHtml}
        <div class="combat-result-overlay" id="victoryOverlay">
            <div class="victory-banner">💀 ${mobName.toUpperCase()} DEFEATED!</div>
            <div class="victory-title">⚔️ VICTORY! ⚔️</div>
            <div class="loot-reveal-area" id="lootRevealArea">
                ${xpCapped ? `<div class="loot-badge xp" style="animation-delay: 0s">
                    <span class="loot-badge-icon">🚫</span>
                    <div><div class="loot-badge-label">XP Capped</div>
                    <div class="loot-badge-value xp-capped">This zone holds nothing more for you. Descend deeper...</div></div>
                </div>` : (xp ? `<div class="loot-badge xp" style="animation-delay: 0s">
                    <span class="loot-badge-icon">⭐</span>
                    <div><div class="loot-badge-label">Experience</div>
                    <div class="loot-badge-value counter-roll" id="xpCounter">+${xp} XP</div></div>
                </div>` : '')}
                ${gold ? `<div class="loot-badge gold" style="animation-delay: 0.2s">
                    <span class="loot-badge-icon">💰</span>
                    <div><div class="loot-badge-label">Gold</div>
                    <div class="loot-badge-value counter-roll" id="goldCounter">+${gold}</div></div>
                </div>` : ''}
                ${loot.length ? '<div class="item-drops" id="itemDrops"></div>' : ''}
                <div class="combat-flavor" style="animation-delay: 1.5s">${flavor}</div>
            </div>
            <button class="btn-continue-victory" id="victoryContinueBtn" onclick="closeCombat()">⚔️ Continue</button>
        </div>
    `;

    // Add green border pulse
    const borderPulse = document.createElement('div');
    borderPulse.className = 'pulse-border-green';
    document.body.appendChild(borderPulse);
    setTimeout(() => borderPulse.remove(), 3000);

    // Phase timing: banner(0) → loot(1200ms) → items(1800ms) → button(2400ms)
    setTimeout(() => {
        document.getElementById('lootRevealArea')?.classList.add('visible');
        // Counter roll animation for XP
        if (xp) animateCounter('xpCounter', xp, 'XP');
        if (gold) animateCounter('goldCounter', gold, '');
    }, 1200);

    // Reveal items one by one
    if (loot.length) {
        setTimeout(() => {
            const itemDrops = document.getElementById('itemDrops');
            if (!itemDrops) return;
            loot.forEach((item, idx) => {
                setTimeout(() => {
                    const el = document.createElement('div');
                    const rarity = guessItemRarity(item);
                    el.className = `item-drop rarity-${rarity}`;
                    el.style.animationDelay = '0s';
                    el.innerHTML = `📦 ${item}`;
                    itemDrops.appendChild(el);
                }, idx * 300);
            });
        }, 1800);
    }

    // Show continue button
    setTimeout(() => {
        document.getElementById('victoryContinueBtn')?.classList.add('visible');
    }, 2400);
}

function showDefeatResult(data, container) {
    const damageTaken = data.data.combat?.turns?.filter(t => t.attacker !== state.agent?.name && t.attacker !== 'player')
        .reduce((sum, t) => sum + (t.damage || 0), 0) || 0;
    const goldLost = data.data.goldLost || 0;
    const died = data.data.died || data.data.dead || false;
    const reviveCost = data.data.reviveCost || Math.max(50, (state.agent?.level || 1) * 25);

    container.innerHTML = `
        <div class="combat-result-overlay vignette-red">
            <div class="defeat-banner">💀 DEFEATED</div>
            ${died ? `<div class="permadeath-text">YOU HAVE FALLEN</div>` : ''}
            <div class="defeat-summary">
                ${damageTaken ? `<div>Damage suffered: <strong>${damageTaken}</strong></div>` : ''}
                ${goldLost ? `<div>Gold lost: <span class="lost-gold">-${goldLost}</span></div>` : ''}
                ${data.message ? `<div style="margin-top:8px;color:var(--bone-white)">${data.message}</div>` : ''}
            </div>
            <button class="btn-ember" onclick="closeCombat()" style="margin-top:8px">
                ${died ? '🪦 Your Champion Has Fallen' : '⚔️ Try Again'}
            </button>
        </div>
    `;

    // Red border pulse
    const borderPulse = document.createElement('div');
    borderPulse.className = 'pulse-border-red';
    document.body.appendChild(borderPulse);
    setTimeout(() => borderPulse.remove(), 2000);
}

function animateCounter(elementId, target, suffix) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let current = 0;
    const steps = 20;
    const increment = Math.max(1, Math.ceil(target / steps));
    const interval = setInterval(() => {
        current = Math.min(current + increment, target);
        el.textContent = '+' + current + (suffix ? ' ' + suffix : '');
        if (current >= target) clearInterval(interval);
    }, 40);
}

function guessItemRarity(itemName) {
    const lower = (itemName || '').toLowerCase();
    if (lower.includes('legendary') || lower.includes('dragon') || lower.includes('mythic')) return 'legendary';
    if (lower.includes('epic') || lower.includes('shadow') || lower.includes('void')) return 'epic';
    if (lower.includes('rare') || lower.includes('enchanted') || lower.includes('starsilver')) return 'rare';
    if (lower.includes('uncommon') || lower.includes('iron') || lower.includes('silver')) return 'uncommon';
    return 'common';
}

function closeCombat() {
    document.getElementById('combatOverlay').classList.add('hidden');
    document.getElementById('combatResultContainer').innerHTML = '';
}

// ============ GATE BOSS ============
let pendingGateBoss = null;

function showGateBossModal(data) {
    pendingGateBoss = data;
    const overlay = document.getElementById('gateBossOverlay');
    if (!overlay) return;
    
    const bossName = data.enemy?.name || 'Unknown Boss';
    const archetype = data.enemy?.archetype || 'boss';
    const archetypeHints = {
        brute: 'Brute — Favors raw aggression',
        guardian: 'Guardian — Prefers defensive tactics',
        assassin: 'Assassin — Swift and evasive',
        caster: 'Caster — Wields dark magic',
        boss: 'Boss — Adapts through combat phases',
    };
    
    document.getElementById('gateBossName').textContent = `${bossName} blocks the way!`;
    document.getElementById('gateBossDesc').textContent = archetypeHints[archetype] || '';
    
    const fightBtn = document.getElementById('gateBossFightBtn');
    fightBtn.onclick = () => {
        const bossData = pendingGateBoss;
        closeGateBoss();
        showTacticalCombat(bossData);
    };
    
    overlay.classList.remove('hidden');
}

function closeGateBoss() {
    const overlay = document.getElementById('gateBossOverlay');
    if (overlay) overlay.classList.add('hidden');
    pendingGateBoss = null;
}

// ============ MESSAGES ============
function showMessage(msg, type) {
    const duration = type === 'error' ? 5000 : 2000;
    const el = document.createElement('div');
    el.style.cssText = `
        position: fixed; top: 60px; left: 50%; transform: translateX(-50%); z-index: 80;
        padding: 10px 24px; border-radius: 8px; font-family: var(--font-header); font-size: 13px;
        animation: damage-pop ${duration / 1000}s ease-out forwards; pointer-events: none;
        ${type === 'error'
            ? 'background: rgba(255,51,51,0.9); color: white;'
            : 'background: rgba(74,222,128,0.9); color: #0a0a0f;'}
    `;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '1') doAction('attack');
    if (e.key === '2') doAction('gather');
    if (e.key === '3') doAction('rest');
});

// ============ TACTICAL COMBAT SYSTEM ============
let activeCombat = null;
let combatTimeout = null;
let combatTimer = 15;

function renderStatusEffects(buffs, debuffs) {
    const effectIcons = {
        'ATK Boost': '⚔️', 'Enrage': '🔥', 'Shield Wall': '🛡️',
        'Poison': '☠️', 'Bleed': '🩸', 'Burn': '🔥',
        'Stun': '💫', 'Regen': '💚', 'Riposte': '⚡',
    };
    const all = [
        ...(buffs || []).map(b => ({ ...b, isBuff: true })),
        ...(debuffs || []).map(d => ({ ...d, isBuff: false })),
    ];
    if (all.length === 0) return '';
    return all.map(e => {
        const icon = effectIcons[e.name] || (e.isBuff ? '✨' : '💀');
        const cls = e.isBuff ? 'status-buff' : 'status-debuff';
        return `<span class="status-effect-icon ${cls}" title="${e.name} (${e.duration} rounds)">${icon}${e.duration}</span>`;
    }).join('');
}

function showTacticalCombat(combatData) {
    activeCombat = combatData;
    combatTimer = 15;
    combatLogHtml = ''; // Reset log for new combat
    
    // Hide old combat overlay
    const oldOverlay = document.getElementById('combatOverlay');
    if (oldOverlay) oldOverlay.classList.add('hidden');
    
    // Create tactical combat UI
    renderTacticalCombatUI();
    
    // Start countdown timer
    startCombatTimer();
}

function renderTacticalCombatUI() {
    if (!activeCombat) return;
    
    const overlay = document.getElementById('tacticalCombatOverlay');
    if (!overlay) {
        // Create overlay if it doesn't exist
        const newOverlay = document.createElement('div');
        newOverlay.id = 'tacticalCombatOverlay';
        newOverlay.className = 'tactical-combat-overlay';
        document.body.appendChild(newOverlay);
    }
    
    const { enemy, agent, round, combatId } = activeCombat;
    const enemyHpPct = (enemy.hp / enemy.maxHp * 100).toFixed(1);
    const playerHpPct = (agent.hp / agent.maxHp * 100).toFixed(1);
    const staminaPct = (agent.stamina / agent.maxStamina * 100).toFixed(1);
    
    // Mob image map (same as showCombat)
    const mobImgMap = {
        'Sewer Rat': '/assets/sewer-rat.png',
        'Giant Rat': '/assets/giant-rat.png',
        'Cave Bat': '/assets/cave-bat.png',
        'Plague Rat': '/assets/blighted-rat.png',
        'Corrupted Hound': '/assets/corrupted-hound.png',
        'Rabid Ghoul': '/assets/rabid-ghoul.png',
        'Wandering Ghost': '/assets/wraith.png',
        'Tomb Shade': '/assets/tomb-shade.png',
        'Skeleton Warrior': '/assets/skeleton-warrior.png',
        'Gremlin Miner': '/assets/gremlin-miner.png',
        'Wraith': '/assets/tomb-wraith.png',
        'Cave Troll': '/assets/cave-troll.png',
        'Giant Spider': '/assets/giant-spider.png',
        'Broodmother': '/assets/broodmother.png',
        'Brute Smith': '/assets/brute-smith.png',
        'Ember Colossus': '/assets/ember-colossus.png',
        'Death Knight': '/assets/death-knight.png',
        'The Ashborn': '/assets/the-ashborn.png',
        'Skeletal Dragon': '/assets/skeletal-dragon.png',
    };
    // Combat portrait map for VS row (wide cinematic format)
    const combatImgMap = {
        'Sewer Rat': '/assets/combat/sewer-rat.png',
        'Cave Bat': '/assets/combat/cave-bat.png',
        'Giant Rat': '/assets/combat/giant-rat.png',
        'Plague Rat': '/assets/combat/plague-rat.png',
        'Corrupted Hound': '/assets/combat/corrupted-hound.png',
        'Rabid Ghoul': '/assets/combat/rabid-ghoul.png',
        'Wandering Ghost': '/assets/combat/wandering-ghost.png',
        'Tomb Shade': '/assets/combat/tomb-shade.png',
    };
    const mobEmojis = {
        'Sewer Rat': '🐀', 'Giant Rat': '🐀', 'Cave Bat': '🦇', 'Plague Rat': '🐀',
        'Corrupted Hound': '🐕', 'Rabid Ghoul': '🧟', 'Tomb Shade': '👤',
        'Skeleton Warrior': '💀',
        'Gremlin Miner': '👺', 'Wandering Ghost': '👻', 'Giant Spider': '🕷️', 'Broodmother': '🕸️',
        'Brute Smith': '🔨', 'Ember Colossus': '🔥',
        'Wraith': '👻', 'Death Knight': '⚔️', 'The Ashborn': '🔥', 'Cave Troll': '🧌',
        'Skeletal Dragon': '🐉',
    };
    
    // Per-mob combat background images
    const mobBgMap = {
        'Sewer Rat': '/assets/sewer-rat-the-drain-tunnels.png',
        'Cave Bat': '/assets/cave-bat-the-upper-cavern.png',
        'Giant Rat': '/assets/giant-rat-the-ruined-storehouse.png',
        'Plague Rat': '/assets/plague-rat-the-toxic-junction.png',
        'Corrupted Hound': '/assets/corrupted-hound-the-kennel-passage.png',
        'Rabid Ghoul': '/assets/rabid-ghoul-the-defiled-crypt.png',
        'Wandering Ghost': '/assets/wandering-ghost-the-forgotten-shrine.png',
        'Tomb Shade': '/assets/tomb-shade-the-sealed-threshold.png',
    };

    // Zone fallback backgrounds
    const zoneBgMap = {
        the_gate: '/assets/zone-the-gate.png',
        tomb_halls: '/assets/zone-tomb-halls.png',
        the_mines: '/assets/zone-the-mines.png',
        the_web: '/assets/zone-the-web.png',
        forge_of_ruin: '/assets/zone-forge-of-ruin.png',
        bone_throne: '/assets/zone-bone-throne.png',
        abyss_bridge: '/assets/zone-abyss-bridge.png',
    };

    const bgImage = mobBgMap[enemy.name] || zoneBgMap[state.agent?.zone] || '';
    const bgStyle = bgImage ? `background-image: url('${bgImage}');` : '';

    const combatImg = combatImgMap[enemy.name] || mobImgMap[enemy.name];
    const enemyArtHtml = combatImg
        ? `<img class="enemy-art-img" src="${combatImg}" alt="${enemy.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
            + `<div class="enemy-art-emoji" style="display:none">${mobEmojis[enemy.name] || '👹'}</div>`
        : `<div class="enemy-art-emoji">${mobEmojis[enemy.name] || '👹'}</div>`;

    // Player stats
    const stats = agent.stats || state.agent?.stats || {};

    const html = `
        <div class="tactical-arena" id="tacticalArena" style="${bgStyle}">
<!-- close btn removed -->
            
            <!-- VS Row: Player left, Round center, Enemy right -->
            <div class="vs-row">
                <!-- Player Section (LEFT) -->
                <div class="tactical-player">
                    <div class="player-art-container"><img class="player-art-img" src="/assets/combat/player.png" alt="Avatar"></div>
                    <div class="player-name">${state.agent?.name || 'You'}</div>
                    <div class="hp-bar-container">
                        <div class="hp-bar player-hp">
                            <div class="hp-bar-fill" style="width: ${playerHpPct}%"></div>
                        </div>
                        <div class="hp-text">${agent.hp} / ${agent.maxHp} HP</div>
                    </div>
                    <div class="stamina-bar-container">
                        <div class="stamina-bar">
                            <div class="stamina-bar-fill" style="width: ${staminaPct}%"></div>
                        </div>
                        <div class="stamina-text">${agent.stamina} / ${agent.maxStamina} STA</div>
                    </div>
                    <div class="status-effects-row" id="playerStatusEffects">${renderStatusEffects(agent.buffs || [], agent.debuffs || [])}</div>
                </div>

                <!-- Round Info (CENTER) -->
                <div class="round-info">
                    <div class="round-number">⚔️ R${round} ⚔️</div>
                    <div class="round-timer" id="roundTimer">${combatTimer}s</div>
                </div>

                <!-- Enemy Section (RIGHT) -->
                <div class="tactical-enemy">
                    <div class="enemy-art-container">${enemyArtHtml}</div>
                    <div class="enemy-name">${enemy.name}</div>
                    <div class="hp-bar-container">
                        <div class="hp-bar enemy-hp">
                            <div class="hp-bar-fill" style="width: ${enemyHpPct}%"></div>
                        </div>
                        <div class="hp-text">${enemy.hp} / ${enemy.maxHp} HP</div>
                    </div>
                    <div class="status-effects-row" id="enemyStatusEffects">${renderStatusEffects(enemy.buffs || [], enemy.debuffs || [])}</div>
                </div>
            </div>
            
            <!-- Combat Log -->
            <div class="tactical-log" id="tacticalLog"></div>
            
            <!-- Bottom Bar: Stance + Action + Confirm -->
            <div class="combat-bottom-bar">
            <div class="stance-selection" id="stanceSelection">
                <div class="section-title">Choose Your Stance</div>
                <div class="stance-buttons">
                    <button class="stance-btn" data-stance="aggressive" onclick="selectStance('aggressive')">
                        <span class="stance-icon">⚔️</span>
                        <span class="stance-name">Aggressive</span>
                        <span class="stance-desc">+30% ATK, -30% DEF, +15% crit</span>
                    </button>
                    <button class="stance-btn" data-stance="balanced" onclick="selectStance('balanced')">
                        <span class="stance-icon">🛡️</span>
                        <span class="stance-name">Balanced</span>
                        <span class="stance-desc">No modifiers, reliable</span>
                    </button>
                    <button class="stance-btn" data-stance="defensive" onclick="selectStance('defensive')">
                        <span class="stance-icon">🏰</span>
                        <span class="stance-name">Defensive</span>
                        <span class="stance-desc">-40% ATK, +50% DEF, 30% block</span>
                    </button>
                    <button class="stance-btn" data-stance="evasive" onclick="selectStance('evasive')">
                        <span class="stance-icon">💨</span>
                        <span class="stance-name">Evasive</span>
                        <span class="stance-desc">-20% ATK/DEF, SPD-based dodge + counter</span>
                    </button>
                </div>
            </div>
            
            <!-- Action Selection -->
            <div class="action-selection" id="actionSelection">
                <div class="section-title">Choose Your Action</div>
                <div class="action-buttons">
                    <button class="action-btn" onclick="selectAction('basic_attack', null)">
                        <span class="action-icon">🗡️</span>
                        <span class="action-name">Basic Attack</span>
                        <span class="action-cost">Free</span>
                    </button>
                    ${renderAbilityButtons(agent.abilities, agent.stamina)}
                    <button class="action-btn" onclick="selectAction('guard', null)">
                        <span class="action-icon">🛡️</span>
                        <span class="action-name">Guard</span>
                        <span class="action-cost">+2 STA, +50% DEF</span>
                    </button>
                    ${renderConsumableButton(agent.consumables)}
                </div>
            </div>
            
            <!-- Confirm + Flee Row -->
            <div class="combat-confirm-container">
                <button class="combat-confirm-btn" id="confirmCombatBtn" onclick="confirmCombatAction()" disabled>
                    ⚔️
                </button>
                <button class="action-btn flee flee-standalone" onclick="fleeCombat()">
                    <span class="action-icon">🏃</span>
                    <span class="action-name">Flee</span>
                </button>
            </div>
            </div><!-- end combat-bottom-bar -->
            
        </div>
    `;
    
    const tacticalOverlay = document.getElementById('tacticalCombatOverlay');
    if (tacticalOverlay) {
        tacticalOverlay.innerHTML = html;
        tacticalOverlay.classList.remove('hidden');
    }
}

function renderAbilityButtons(abilities, currentStamina) {
    if (!abilities || abilities.length === 0) return '';
    
    return abilities.map(ability => {
        const canUse = ability.cooldown === 0 && currentStamina >= ability.staminaCost;
        const disabled = !canUse ? 'disabled' : '';
        const cooldownText = ability.cooldown > 0 ? `CD: ${ability.cooldown}` : `${ability.staminaCost} STA`;
        
        return `
            <button class="action-btn ability-btn ${disabled}" onclick="selectAction('ability', '${ability.id}')" ${disabled}>
                <span class="action-icon">💥</span>
                <span class="action-name">${ability.name}</span>
                <span class="action-cost">${cooldownText}</span>
                ${ability.cooldown > 0 ? '<span class="cooldown-overlay"></span>' : ''}
            </button>
        `;
    }).join('');
}

function renderConsumableButton(consumables) {
    if (!consumables || consumables.length === 0) return '';
    const potion = consumables.find(c => c.itemCode === 'health_potion');
    if (!potion || potion.quantity <= 0) return '';
    return `
        <button class="action-btn consumable-btn" onclick="selectAction('consumable', null, 'health_potion')">
            <span class="action-icon">🧪</span>
            <span class="action-name">Health Potion</span>
            <span class="action-cost">x${potion.quantity}</span>
        </button>
    `;
}

let selectedStance = null;
let selectedAction = null;

function selectStance(stance) {
    selectedStance = stance;
    
    // Update UI
    document.querySelectorAll('.stance-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector(`[data-stance="${stance}"]`)?.classList.add('selected');
    
    updateConfirmButton();
}

function selectAction(actionType, abilityId, itemCode) {
    selectedAction = { type: actionType };
    if (abilityId) {
        selectedAction.abilityId = abilityId;
    }
    if (itemCode) {
        selectedAction.itemCode = itemCode;
    }
    
    // Update UI
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    event.target.closest('.action-btn')?.classList.add('selected');
    
    updateConfirmButton();
}

function updateConfirmButton() {
    const btn = document.getElementById('confirmCombatBtn');

    if (selectedStance && selectedAction) {
        btn.disabled = false;
        btn.classList.add('ready');

        // Put damage preview on the button
        const preview = getDamagePreview();
        btn.innerHTML = preview ? `⚔️ ${preview}` : '⚔️';
    } else {
        btn.disabled = true;
        btn.classList.remove('ready');
        btn.innerHTML = '⚔️';
    }
}

function getDamagePreview() {
    if (!activeCombat || !selectedStance || !selectedAction) return '';
    const agent = activeCombat.agent;
    const stats = state.agent;
    if (!agent || !stats) return '';
    
    const baseAtk = (stats.attack || stats.atk || 6) + (stats.equipBonuses?.atk || 0);
    
    // Stance modifiers
    const stanceMods = {
        aggressive: { atk: 1.3, crit: 0.15 },
        balanced: { atk: 1.0, crit: 0.05 },
        defensive: { atk: 0.6, crit: 0.05 },
        evasive: { atk: 0.8, crit: 0.05 }
    };
    const mod = stanceMods[selectedStance] || stanceMods.balanced;
    
    if (selectedAction.type === 'flee') return '🏃 Escape attempt';
    if (selectedAction.type === 'guard') return '🛡️ +50% DEF, recover 2 STA';
    if (selectedAction.type === 'consumable') return '🧪 Heal 30% HP';
    
    // Action multiplier
    let actionMult = 1.0;
    let actionLabel = '';
    if (selectedAction.type === 'ability' && selectedAction.abilityId) {
        const abilityMults = {
            power_strike: 1.8, shield_bash: 1.0, venom_slash: 1.3,
            battle_cry: 0, heal: 0, riposte: 0, arcane_bolt: 1.5,
            elemental_burst: 2.0, fortify: 0, feint: 0
        };
        actionMult = abilityMults[selectedAction.abilityId] ?? 1.0;
        if (actionMult === 0) return '✨ Support ability (no direct damage)';
    }
    
    const effAtk = Math.floor(baseAtk * mod.atk * actionMult);
    const minDmg = Math.max(1, Math.floor(effAtk * 0.7));
    const maxDmg = Math.floor(effAtk * 1.3);
    const critDmg = Math.floor(maxDmg * 1.5);
    
    return `${minDmg}-${maxDmg} dmg${mod.crit > 0.1 ? ` · crit ${critDmg}` : ''}`;
}

function startCombatTimer() {
    if (combatTimeout) clearInterval(combatTimeout);
    
    combatTimeout = setInterval(() => {
        combatTimer--;
        const timerEl = document.getElementById('roundTimer');
        if (timerEl) {
            timerEl.textContent = `${combatTimer}s`;
            if (combatTimer <= 10) {
                timerEl.classList.add('urgent');
            }
        }
        
        if (combatTimer <= 0) {
            clearInterval(combatTimeout);
            // Auto-submit defensive + basic attack on timeout
            selectedStance = 'defensive';
            selectedAction = { type: 'basic_attack' };
            confirmCombatAction();
        }
    }, 1000);
}

async function confirmCombatAction() {
    if (!selectedStance || !selectedAction || !activeCombat) return;
    
    clearInterval(combatTimeout);
    
    const btn = document.getElementById('confirmCombatBtn');
    btn.disabled = true;
    btn.textContent = '⚔️ ...';
    
    try {
        const res = await fetch(`${API}/api/combat/${activeCombat.combatId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stance: selectedStance,
                action: selectedAction,
            }),
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            showMessage(data.error || 'Combat action failed', 'error');
            btn.innerHTML = '⚔️';
            btn.disabled = false;
            return;
        }
        
        // Animate the round resolution visually
        animateRoundResolution(data);
        
    } catch (e) {
        showMessage('Combat error: ' + e.message, 'error');
        btn.innerHTML = '⚔️';
        btn.disabled = false;
    }
}

function showRoundResolution(data) {
    const log = document.getElementById('tacticalLog');
    if (!log) return;
    
    const resolution = data.resolution || {};
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    let html = `<div class="log-round">— Round ${(data.round || 1) - 1} —</div>`;
    if (resolution.narrative) {
        html += `<div class="log-narrative">${resolution.narrative}</div>`;
    }
    
    const events = resolution.events || [];
    if (events.length > 0) {
        html += `<div class="log-events">`;
        events.forEach(evt => {
            const icon = evt.includes('critical') ? '💥' : evt.includes('dodged') ? '💨' :
                        evt.includes('blocked') ? '🛡️' : evt.includes('stunned') ? '💫' :
                        evt.includes('healed') ? '💚' : evt.includes('potion') ? '🧪' : '⚔️';
            html += `<span class="log-event">${icon} ${evt}</span>`;
        });
        html += `</div>`;
    }
    
    entry.innerHTML = html;
    log.prepend(entry);
    log.scrollTop = 0;
}

// Persistent log storage between rounds
let combatLogHtml = '';

function saveCombatLog() {
    const log = document.getElementById('tacticalLog');
    if (log) combatLogHtml = log.innerHTML;
}

function restoreCombatLog() {
    const log = document.getElementById('tacticalLog');
    if (log && combatLogHtml) log.innerHTML = combatLogHtml;
}

function animateRoundResolution(data) {
    const resolution = data.resolution || {};
    const events = resolution.events || [];
    
    // 1. Show the round log entry
    showRoundResolution(data);
    
    // Check for feint reveal — show enemy's next stance
    const feintEvent = events.find(e => e.startsWith('feint_reveal:'));
    if (feintEvent) {
        const revealedStance = feintEvent.split(':')[1];
        const stanceEl = document.querySelector('.enemy-stance');
        if (stanceEl) {
            const stanceIcons = { aggressive: '⚔️', balanced: '🛡️', defensive: '🏰', evasive: '💨' };
            stanceEl.innerHTML = `👁️ Next Stance: <strong style="color:#fbbf24">${stanceIcons[revealedStance] || ''} ${revealedStance}</strong>`;
            stanceEl.style.color = '#fbbf24';
        }
    }
    
    // 2. Animate HP bar changes smoothly
    const state = data.state || {};
    const player = state.player || {};
    const enemy = state.enemy || {};
    
    // Animate enemy HP
    const enemyHpBar = document.querySelector('.tactical-enemy .hp-bar-fill');
    const enemyHpText = document.querySelector('.tactical-enemy .hp-text');
    if (enemyHpBar && enemy.maxHp) {
        const pct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
        enemyHpBar.style.width = pct + '%';
        if (enemyHpText) enemyHpText.textContent = `${enemy.hp} / ${enemy.maxHp}`;
    }
    
    // Animate player HP  
    const playerHpBar = document.querySelector('.tactical-player .hp-bar-fill');
    const playerHpText = document.querySelector('.tactical-player .hp-text');
    if (playerHpBar && player.maxHp) {
        const pct = Math.max(0, (player.hp / player.maxHp) * 100);
        playerHpBar.style.width = pct + '%';
        if (pct <= 30) playerHpBar.style.background = 'linear-gradient(90deg, #ff3333, #cc0000)';
        else if (pct <= 60) playerHpBar.style.background = 'linear-gradient(90deg, #fbbf24, #ca8a04)';
        if (playerHpText) playerHpText.textContent = `${player.hp} / ${player.maxHp} HP`;
    }
    
    // Animate stamina
    const staBar = document.querySelector('.stamina-bar-fill');
    const staText = document.querySelector('.stamina-text');
    if (staBar && player.maxStamina) {
        staBar.style.width = ((player.stamina / player.maxStamina) * 100) + '%';
        if (staText) staText.textContent = `${player.stamina} / ${player.maxStamina} STA`;
    }
    
    // 3. Flash effects for damage
    const hasPlayerDmg = events.some(e => e.toLowerCase().includes('you take') || e.toLowerCase().includes('hits you') || e.toLowerCase().includes('damage to you'));
    const hasEnemyDmg = events.some(e => e.toLowerCase().includes('you deal') || e.toLowerCase().includes('strike') || e.toLowerCase().includes('hit'));
    const hasCrit = events.some(e => e.toLowerCase().includes('critical'));
    
    if (hasEnemyDmg) {
        const enemySection = document.querySelector('.tactical-enemy');
        if (enemySection) { enemySection.classList.add('hit-flash'); setTimeout(() => enemySection.classList.remove('hit-flash'), 600); }
    }
    if (hasPlayerDmg) {
        const playerSection = document.querySelector('.tactical-player');
        if (playerSection) { playerSection.classList.add('hit-flash'); setTimeout(() => playerSection.classList.remove('hit-flash'), 600); }
    }
    if (hasCrit) {
        const arena = document.getElementById('tacticalArena');
        if (arena) { arena.classList.add('screen-shake'); setTimeout(() => arena.classList.remove('screen-shake'), 500); }
    }
    
    // 4. Floating damage numbers
    if (resolution.playerDamageDealt || resolution.playerDamage) {
        spawnTacticalDmg('.tactical-enemy', resolution.playerDamageDealt || resolution.playerDamage, hasCrit);
    }
    if (resolution.enemyDamageDealt || resolution.enemyDamage) {
        spawnTacticalDmg('.tactical-player', resolution.enemyDamageDealt || resolution.enemyDamage, false);
    }
    
    // 5. After animation, check status or go to next round
    const delay = 2500;
    if (data.status === 'victory') {
        setTimeout(() => showCombatVictory(data), delay);
    } else if (data.status === 'defeat') {
        setTimeout(() => showCombatDefeat(data), delay);
    } else if (data.status === 'fled') {
        setTimeout(() => { showMessage('You escaped!', 'info'); closeTacticalCombat(); }, delay);
    } else {
        // Save log, update state, re-render, restore log
        setTimeout(() => {
            saveCombatLog();
            activeCombat.round = data.round;
            // Merge server state with existing data (preserve name, element, abilities)
            activeCombat.agent = { 
                ...activeCombat.agent, 
                ...data.state.player,
                abilities: (() => {
                    const orig = activeCombat.agent?.abilities || [];
                    const updated = data.state.abilities || [];
                    return orig.map(a => {
                        const u = updated.find(x => x.id === a.id);
                        return u ? { ...a, cooldown: u.cooldown } : a;
                    });
                })()
            };
            activeCombat.enemy = { 
                ...activeCombat.enemy, 
                ...data.state.enemy 
            };
            selectedStance = null;
            selectedAction = null;
            combatTimer = 15;
            renderTacticalCombatUI();
            restoreCombatLog();
            startCombatTimer();
        }, delay);
    }
}

function spawnTacticalDmg(selector, damage, isCrit) {
    const el = document.querySelector(selector);
    if (!el || !damage) return;
    const dmg = document.createElement('div');
    dmg.className = 'tactical-floating-dmg' + (isCrit ? ' crit' : '');
    dmg.textContent = (isCrit ? '💥 ' : '') + '-' + damage;
    dmg.style.left = (30 + Math.random() * 40) + '%';
    el.style.position = 'relative';
    el.appendChild(dmg);
    setTimeout(() => dmg.remove(), 1500);
}

function showCombatVictory(data) {
    let overlay = document.getElementById('tacticalCombatOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tacticalCombatOverlay';
        overlay.className = 'tactical-combat-overlay';
        document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    
    const { rewards } = data;
    const xp = rewards?.xpGained || 0;
    const gold = rewards?.goldGained || 0;
    const items = rewards?.itemsDropped || [];
    
    const xpCapped = rewards?.xpCapped || false;
    const xpCappedMessage = rewards?.xpCappedMessage || 'This zone holds nothing more for you. Descend deeper...';
    const enemyName = activeCombat?.enemy?.name || 'The enemy';
    const gateUnlocked = data.gateUnlocked || false;
    const gateMessage = data.gateMessage || '';
    
    overlay.innerHTML = `
        <div class="tactical-arena" style="display:flex;align-items:center;justify-content:center;">
            <div class="combat-victory-screen">
                <div class="victory-title">⚔️ VICTORY! ⚔️</div>
                <div class="victory-subtitle">${enemyName} has been defeated!</div>
                ${gateUnlocked ? `<div class="reward-item" style="color:var(--gold);font-size:18px;margin:16px 0">🏆 ${gateMessage}</div>` : ''}
                <div class="victory-rewards">
                    ${xpCapped ? `<div class="reward-item xp-capped">🚫 ${xpCappedMessage}</div>` : (xp > 0 ? `<div class="reward-item">⭐ +${xp} XP</div>` : '')}
                    ${gold > 0 ? `<div class="reward-item">💰 +${gold} Gold</div>` : ''}
                    ${items.length > 0 ? items.map(item => `<div class="reward-item">📦 ${item}</div>`).join('') : ''}
                </div>
                <button class="combat-close-final" onclick="closeTacticalCombat()">Continue</button>
            </div>
        </div>
    `;
    
    // Refresh agent data
    setTimeout(() => refreshAgent(), 500);
}

function showCombatDefeat(data) {
    let overlay = document.getElementById('tacticalCombatOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tacticalCombatOverlay';
        overlay.className = 'tactical-combat-overlay';
        document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    
    const permadeath = data.permadeath || false;
    
    let html = `
        <div class="tactical-arena" style="display:flex;align-items:center;justify-content:center;">
        <div class="combat-defeat-screen">
            <div class="defeat-title">💀 DEFEATED 💀</div>
    `;
    
    if (permadeath) {
        html += `
            <div class="permadeath-message">
                <div class="permadeath-title">YOUR CHAMPION HAS FALLEN</div>
                <div class="permadeath-text">${data.message || 'Death is permanent in The Hollows.'}</div>
                <div class="permadeath-stats">
                    ${data.finalStats ? `
                        <div>Champion: ${data.finalStats.name}</div>
                        <div>Level: ${data.finalStats.level}</div>
                        <div>Slain by: ${data.finalStats.killedBy}</div>
                    ` : ''}
                </div>
                <button class="combat-close-final" onclick="handlePermadeath()">Create New Champion</button>
            </div>
        `;
    } else {
        html += `
            <div class="defeat-subtitle">You were defeated by ${activeCombat?.enemy?.name || 'the enemy'}</div>
            <div class="defeat-damage">Took ${data.resolution?.playerDamageTaken || 0} damage</div>
            <button class="combat-close-final" onclick="closeTacticalCombat()">Continue</button>
        `;
    }
    
    html += `</div></div>`;
    overlay.innerHTML = html;
    
    // Refresh agent data
    setTimeout(() => refreshAgent(), 500);
}

function handlePermadeath() {
    // Clear session and go back to login
    localStorage.removeItem('hollows_session');
    location.reload();
}

function fleeCombat() {
    selectedStance = 'defensive';
    selectedAction = { type: 'flee' };
    confirmCombatAction();
}

function closeTacticalCombat() {
    const overlay = document.getElementById('tacticalCombatOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.innerHTML = '';
    }
    
    clearInterval(combatTimeout);
    activeCombat = null;
    selectedStance = null;
    selectedAction = null;
    
    refreshAgent();
    refreshWorld();
    refreshActiveQuest();
}

// ============ PARTY SYSTEM ============
let currentParty = null;

let lastPartyJson = '';
async function refreshParty() {
    if (!state.apiKey || state.agent?.is_dead || state.agent?.isDead) return;
    try {
        const res = await fetch(`${API}/party/mine`, { headers: authHeadersOnly() });
        if (!res.ok) return;
        const data = await res.json();
        const newJson = JSON.stringify(data.party || null);
        if (newJson === lastPartyJson) return; // No change, skip re-render
        lastPartyJson = newJson;
        currentParty = data.party;
        renderPartySection();
    } catch (e) { console.error('Party refresh failed:', e); }
}

async function createPartyAction(isOpen) {
    try {
        const res = await fetch(`${API}/party/create`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ open: isOpen }),
        });
        const data = await res.json();
        if (!res.ok) { showMessage(data.error || 'Failed to create party', 'error'); return; }
        showMessage(data.message, 'success');
        await refreshParty();
    } catch (e) { showMessage('Failed to create party', 'error'); }
}

async function joinPartyAction(partyId) {
    try {
        const res = await fetch(`${API}/party/join/${partyId}`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) { showMessage(data.error || 'Failed to join party', 'error'); return; }
        showMessage(data.message, 'success');
        await refreshParty();
    } catch (e) { showMessage('Failed to join party', 'error'); }
}

async function leavePartyAction() {
    try {
        const res = await fetch(`${API}/party/leave`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) { showMessage(data.error || 'Failed to leave party', 'error'); return; }
        showMessage(data.message, 'success');
        currentParty = null;
        renderPartySection();
    } catch (e) { showMessage('Failed to leave party', 'error'); }
}

async function inviteToPartyAction() {
    const targetName = document.getElementById('partyInviteName')?.value?.trim();
    if (!targetName || !currentParty) return;
    try {
        const res = await fetch(`${API}/party/invite`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ partyId: currentParty.id, targetAgent: targetName }),
        });
        const data = await res.json();
        if (!res.ok) { showMessage(data.error || 'Failed to invite', 'error'); return; }
        showMessage(data.message, 'success');
        document.getElementById('partyInviteName').value = '';
        await refreshParty();
    } catch (e) { showMessage('Failed to invite', 'error'); }
}

async function kickPartyMember(targetId) {
    try {
        const res = await fetch(`${API}/party/kick`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ targetAgentId: targetId }),
        });
        const data = await res.json();
        if (!res.ok) { showMessage(data.error || 'Failed to kick', 'error'); return; }
        showMessage(data.message, 'success');
        await refreshParty();
    } catch (e) { showMessage('Failed to kick', 'error'); }
}

let lastOpenPartiesJson = '';
async function loadOpenParties() {
    if (!state.apiKey) return;
    try {
        const res = await fetch(`${API}/party/open`, { headers: authHeadersOnly() });
        if (!res.ok) return;
        const data = await res.json();
        const newJson = JSON.stringify(data.parties || []);
        if (newJson === lastOpenPartiesJson) return;
        lastOpenPartiesJson = newJson;
        renderOpenParties(data.parties || []);
    } catch (e) {}
}

function renderPartySection() {
    const container = document.getElementById('partySection');
    if (!container) return;

    if (currentParty) {
        const isLeader = currentParty.members.some(m => m.agentId === currentParty.leaderId && m.agentName === state.name);
        let membersHtml = currentParty.members.map(m => {
            const hpPct = m.maxHp > 0 ? (m.hp / m.maxHp * 100) : 0;
            const isLead = m.agentId === currentParty.leaderId;
            const kickBtn = isLeader && !isLead ? `<button class="party-kick-btn" onclick="kickPartyMember(${m.agentId})">✕</button>` : '';
            return `<div class="party-member-card">
                <div class="party-member-info">
                    <span class="party-member-name">${isLead ? '👑 ' : ''}${m.agentName}</span>
                    <span class="party-member-level">Lv.${m.level}</span>
                    ${kickBtn}
                </div>
                <div class="party-member-hp-bar">
                    <div class="party-member-hp-fill" style="width:${hpPct}%"></div>
                    <span class="party-member-hp-text">${m.hp}/${m.maxHp}</span>
                </div>
            </div>`;
        }).join('');

        let inviteHtml = '';
        if (isLeader && currentParty.members.length < currentParty.maxSize) {
            inviteHtml = `<div class="party-invite-row">
                <input id="partyInviteName" placeholder="Invite player..." class="party-invite-input">
                <button class="btn-shop" onclick="inviteToPartyAction()">Invite</button>
            </div>`;
        }

        container.innerHTML = `
            <div class="party-current">
                <div class="party-header-row">
                    <span class="party-title">⚔️ Your Party (${currentParty.members.length}/${currentParty.maxSize})</span>
                    <span class="party-type">${currentParty.isOpen ? '🔓 Open' : '🔒 Private'}</span>
                </div>
                <div class="party-members">${membersHtml}</div>
                ${inviteHtml}
                <button class="btn-shop party-leave-btn" onclick="leavePartyAction()">Leave Party</button>
            </div>`;
    } else {
        container.innerHTML = `
            <div class="party-none">
                <div class="party-create-row">
                    <button class="btn-shop" onclick="createPartyAction(true)">🔓 Create Open Party</button>
                    <button class="btn-shop" onclick="createPartyAction(false)">🔒 Create Private</button>
                </div>
                <div id="openPartiesList" class="open-parties-list"></div>
            </div>`;
        loadOpenParties();
    }
}

function renderOpenParties(parties) {
    const container = document.getElementById('openPartiesList');
    if (!container) return;

    if (parties.length === 0) {
        container.innerHTML = '<div class="zone-empty">No open parties in this zone</div>';
        return;
    }

    container.innerHTML = parties.map(p => {
        const leaderName = p.members[0]?.agentName || 'Unknown';
        return `<div class="open-party-card">
            <div class="open-party-info">
                <span>👑 ${leaderName}'s party</span>
                <span class="open-party-size">${p.members.length}/${p.maxSize}</span>
            </div>
            <button class="btn-shop" onclick="joinPartyAction('${p.id}')">Join</button>
        </div>`;
    }).join('');
}

// ============ LOOT ROLL ANIMATION ============

function showLootRollScreen(lootRoll) {
    // Create overlay
    let overlay = document.getElementById('lootRollOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'lootRollOverlay';
        overlay.className = 'loot-roll-overlay';
        document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');

    const items = lootRoll.items || [];
    const participants = lootRoll.participants || [];

    if (items.length === 0) {
        overlay.innerHTML = `<div class="loot-roll-arena">
            <div class="loot-roll-title">🎲 LOOT ROLL 🎲</div>
            <div style="color:var(--starsilver-silver);text-align:center;padding:40px">No items to roll for</div>
            <button class="combat-close-final" onclick="closeLootRoll()">Continue</button>
        </div>`;
        return;
    }

    // Show items one at a time with slot machine animation
    let currentItem = 0;
    
    function showNextItem() {
        if (currentItem >= items.length) {
            // All items shown, show summary
            showLootRollSummary(overlay, items);
            return;
        }

        const item = items[currentItem];
        const rarity = item.rarity || 'common';
        
        overlay.innerHTML = `
            <div class="loot-roll-arena">
                <div class="loot-roll-title">🎲 LOOT ROLL 🎲</div>
                <div class="loot-roll-item-count">Item ${currentItem + 1} of ${items.length}</div>
                <div class="loot-roll-item-name rarity-${rarity}">${ITEM_EMOJI[item.itemCode] || '📦'} ${item.itemName}</div>
                <div class="loot-roll-players" id="lootRollPlayers">
                    ${participants.map(p => `
                        <div class="loot-roll-player" id="rollPlayer_${p.name.replace(/\s/g,'_')}">
                            <span class="loot-roll-player-name">${p.name}</span>
                            <span class="loot-roll-number" id="rollNum_${p.name.replace(/\s/g,'_')}">--</span>
                        </div>
                    `).join('')}
                </div>
                <div class="loot-roll-countdown" id="lootCountdown">3</div>
                <div class="loot-roll-winner hidden" id="lootWinner"></div>
            </div>
        `;

        // Phase 1: Countdown (3 seconds)
        let count = 3;
        const countdownEl = document.getElementById('lootCountdown');
        const countdownInterval = setInterval(() => {
            count--;
            if (countdownEl) countdownEl.textContent = count > 0 ? count : 'ROLL!';
            if (count <= 0) {
                clearInterval(countdownInterval);
                if (countdownEl) countdownEl.classList.add('hidden');
                startSlotMachine(item, participants, () => {
                    currentItem++;
                    setTimeout(showNextItem, 2000);
                });
            }
        }, 1000);
    }

    showNextItem();
}

function startSlotMachine(item, participants, onComplete) {
    const rolls = item.rolls || {};
    const winnerName = item.winnerName;
    
    // Phase 2: Fast spinning (2 seconds total, gradually slowing)
    const spinIntervals = [];
    let elapsed = 0;
    const totalDuration = 2000;
    
    // Start spinning all numbers
    participants.forEach(p => {
        const safeName = p.name.replace(/\s/g, '_');
        const el = document.getElementById(`rollNum_${safeName}`);
        if (!el) return;
        
        let speed = 50; // Start at 50ms
        let spinTimer;
        
        function spin() {
            el.textContent = Math.floor(Math.random() * 100) + 1;
            el.classList.add('spinning');
        }
        
        function scheduleSpin() {
            spin();
            elapsed += speed;
            
            // Slow down progressively
            if (elapsed > totalDuration * 0.5) speed = 100;
            if (elapsed > totalDuration * 0.7) speed = 200;
            if (elapsed > totalDuration * 0.85) speed = 500;
            
            if (elapsed < totalDuration) {
                spinTimer = setTimeout(scheduleSpin, speed);
            } else {
                // SNAP to final value
                const finalRoll = rolls[p.name] || Math.floor(Math.random() * 100) + 1;
                el.textContent = finalRoll;
                el.classList.remove('spinning');
                el.classList.add('snapped');
                
                // Flash effect
                el.parentElement.classList.add('roll-flash');
                setTimeout(() => el.parentElement.classList.remove('roll-flash'), 500);
                
                // Check if winner
                if (p.name === winnerName) {
                    setTimeout(() => {
                        el.parentElement.classList.add('roll-winner');
                        const winnerEl = document.getElementById('lootWinner');
                        if (winnerEl) {
                            winnerEl.classList.remove('hidden');
                            winnerEl.innerHTML = `<span class="winner-glow">🏆 ${winnerName} WINS! 🏆</span>`;
                        }
                        // Screen shake
                        document.getElementById('lootRollOverlay')?.classList.add('screen-shake');
                        setTimeout(() => document.getElementById('lootRollOverlay')?.classList.remove('screen-shake'), 400);
                        
                        onComplete();
                    }, 300);
                }
            }
        }
        
        // Stagger start slightly per player
        setTimeout(scheduleSpin, Math.random() * 100);
    });
}

function showLootRollSummary(overlay, items) {
    let summaryHtml = items.map(item => {
        const rarity = item.rarity || 'common';
        return `<div class="loot-summary-item">
            <span class="rarity-${rarity}">${ITEM_EMOJI[item.itemCode] || '📦'} ${item.itemName}</span>
            <span class="loot-summary-arrow">→</span>
            <span class="loot-summary-winner">🏆 ${item.winnerName}</span>
            <span class="loot-summary-roll">(rolled ${item.rolls[item.winnerName]})</span>
        </div>`;
    }).join('');

    overlay.innerHTML = `
        <div class="loot-roll-arena">
            <div class="loot-roll-title">🎲 LOOT ROLL RESULTS 🎲</div>
            <div class="loot-summary">${summaryHtml}</div>
            <button class="combat-close-final" onclick="closeLootRoll()">Continue</button>
        </div>
    `;
}

function closeLootRoll() {
    const overlay = document.getElementById('lootRollOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.innerHTML = '';
    }
    refreshAgent();
}

// Override showCombatVictory to handle loot rolls
const _originalShowCombatVictory = typeof showCombatVictory === 'function' ? showCombatVictory : null;

// Patch the tactical combat victory to show loot rolls
const _origShowCombatVictoryFn = showCombatVictory;
showCombatVictory = function(data) {
    // Check if there's a loot roll
    if (data.lootRoll && data.lootRoll.items && data.lootRoll.items.length > 0) {
        // Close tactical combat first
        const overlay = document.getElementById('tacticalCombatOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.innerHTML = '';
        }
        clearInterval(combatTimeout);
        activeCombat = null;
        
        // Show loot roll animation
        showLootRollScreen(data.lootRoll);
    } else {
        // No loot roll, show normal victory
        _origShowCombatVictoryFn(data);
    }
};

// Patch renderTacticalCombatUI to show party members in combat
const _origRenderTacticalUI = renderTacticalCombatUI;
renderTacticalCombatUI = function() {
    _origRenderTacticalUI();
    
    // Add party members display if in a party
    if (currentParty && currentParty.members.length > 1) {
        const playerSection = document.querySelector('.tactical-player');
        if (playerSection) {
            const otherMembers = currentParty.members.filter(m => m.agentName !== state.name);
            if (otherMembers.length > 0) {
                const partyHtml = `<div class="combat-party-members">
                    ${otherMembers.map(m => {
                        const hpPct = m.maxHp > 0 ? (m.hp / m.maxHp * 100) : 0;
                        return `<div class="combat-party-card">
                            <span class="combat-party-name">${m.agentName}</span>
                            <div class="combat-party-hp"><div class="combat-party-hp-fill" style="width:${hpPct}%"></div></div>
                            <span class="combat-party-hp-text">${m.hp}/${m.maxHp}</span>
                        </div>`;
                    }).join('')}
                </div>`;
                playerSection.insertAdjacentHTML('afterend', partyHtml);
            }
        }
    }
};

// Add party refresh to the game refresh cycle
const _origShowGame = showGame;
showGame = async function() {
    await _origShowGame();
    await refreshParty();
    
    // Add party refresh to the refresh interval
    if (state.refreshInterval) clearInterval(state.refreshInterval);
    state.refreshInterval = setInterval(async () => {
        await Promise.all([refreshAgent(), refreshWorld(), refreshActivity(), refreshParty()]);
    }, 5000);
};

// ============ REALTIME COMBAT (iframe-based Phaser/Svelte client) ============

async function startRealtimeCombat() {
    try {
        showMessage('⚡ Initiating realtime combat...', 'info');
        const res = await fetch(`${API}/api/combat/new/realtime`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ zone: state.agent?.zone, encounterType: 'mob' })
        });
        const data = await res.json();
        if (data.error) {
            showMessage(data.error, 'error');
            return;
        }
        // Launch iframe with session info
        showRealtimeCombat({
            combatId: data.sessionId,
            realtime: true,
            wsUrl: data.wsUrl,
            arena: data.arena,
            player: data.player,
            enemies: data.enemies
        });
    } catch (err) {
        showMessage('Failed to start realtime combat: ' + err.message, 'error');
    }
}

function showRealtimeCombat(combatData) {
    // Hide any existing combat overlays
    const oldOverlay = document.getElementById('combatOverlay');
    if (oldOverlay) oldOverlay.classList.add('hidden');
    const tacticalOverlay = document.getElementById('tacticalCombatOverlay');
    if (tacticalOverlay) tacticalOverlay.remove();

    // Remove existing realtime overlay if any
    let overlay = document.getElementById('realtimeCombatOverlay');
    if (overlay) overlay.remove();

    // Create fullscreen overlay with iframe
    overlay = document.createElement('div');
    overlay.id = 'realtimeCombatOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;background:#0a0a0f;';

    const { combatId, wsUrl } = combatData;
    const apiKey = state.apiKey || '';
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const resolvedWsUrl = wsUrl || `/ws/realtime-combat?sessionId=${combatId}&apiKey=${apiKey}`;
    const params = new URLSearchParams({
        mode: 'realtime',
        combatId: combatId,
        apiKey: apiKey,
        wsUrl: `${wsProtocol}//${location.host}${resolvedWsUrl}`
    });

    const iframe = document.createElement('iframe');
    iframe.src = `/combat?${params.toString()}`;
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    iframe.id = 'realtimeCombatIframe';
    overlay.appendChild(iframe);

    document.body.appendChild(overlay);

    // Listen for messages from iframe (combat end, etc.)
    window.addEventListener('message', handleRealtimeCombatMessage);
}

function handleRealtimeCombatMessage(event) {
    if (event.data && event.data.type === 'combat-end') {
        closeRealtimeCombat();
        if (event.data.result === 'victory') {
            showMessage('⚔️ Victory! You defeated the enemy!', 'success');
        } else {
            showMessage('💀 You were defeated...', 'error');
        }
        refreshAgent();
        refreshWorld();
        refreshActivity();
    }
}

function closeRealtimeCombat() {
    const overlay = document.getElementById('realtimeCombatOverlay');
    if (overlay) overlay.remove();
    window.removeEventListener('message', handleRealtimeCombatMessage);
}

