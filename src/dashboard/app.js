// ============================================
// THE HOLLOWS - Dashboard Logic v2
// Fixed API Integration + Polish
// ============================================

// Configuration
const CONFIG = {
    API_BASE: window.location.origin,
    REFRESH_INTERVALS: {
        world: 5000,        // 5 seconds
        leaderboard: 15000, // 15 seconds
        boss: 5000,         // 5 seconds
        activity: 5000,     // 5 seconds
        pvp: 10000          // 10 seconds
    },
    EMBER_COUNT: 30,
    ZONE_DEPTH_MAP: {
        'the_gate': 0,
        'obsidian_gate': 1,
        'cavern_of_whispers': 2,
        'sunken_crypt': 3,
        'chamber_of_shadows': 4,
        'molten_depths': 5,
        'halls_of_madness': 6,
        'black_pit': 7,
        'abyss_bridge': 8
    }
};

// State management
const state = {
    world: null,
    leaderboard: null,
    boss: null,
    activity: [],
    pvp: null,
    selectedAgent: null,
    seasonEndTime: null,
    connected: true,
    lastBossHp: null
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initEmberParticles();
    initDashboard();
    startUpdateCycles();
    initMobileCollapse();
});

function initDashboard() {
    console.log('🔥 The Hollows Dashboard v2 Initialized');
    
    // Initial data fetch
    fetchWorldState();
    fetchLeaderboard();
    fetchBossStatus();
    fetchActivity();
    fetchPvPData();
    
    // Set up season countdown
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function startUpdateCycles() {
    setInterval(fetchWorldState, CONFIG.REFRESH_INTERVALS.world);
    setInterval(fetchLeaderboard, CONFIG.REFRESH_INTERVALS.leaderboard);
    setInterval(fetchBossStatus, CONFIG.REFRESH_INTERVALS.boss);
    setInterval(fetchActivity, CONFIG.REFRESH_INTERVALS.activity);
    setInterval(fetchPvPData, CONFIG.REFRESH_INTERVALS.pvp);
}

function initMobileCollapse() {
    // Add toggle buttons to panels for mobile
    if (window.innerWidth <= 768) {
        document.querySelectorAll('.panel').forEach(panel => {
            const toggle = document.createElement('button');
            toggle.className = 'panel-toggle';
            toggle.innerHTML = '▼';
            toggle.onclick = () => {
                panel.classList.toggle('collapsed');
            };
            panel.appendChild(toggle);
        });
    }
}

// ============================================
// EMBER PARTICLES ANIMATION
// ============================================

function initEmberParticles() {
    const container = document.getElementById('embers');
    
    for (let i = 0; i < CONFIG.EMBER_COUNT; i++) {
        createEmber(container);
    }
    
    setInterval(() => {
        createEmber(container);
    }, 2000);
}

function createEmber(container) {
    const ember = document.createElement('div');
    ember.className = 'ember';
    
    ember.style.left = Math.random() * 100 + '%';
    ember.style.animationDuration = (15 + Math.random() * 15) + 's';
    ember.style.animationDelay = Math.random() * 5 + 's';
    
    container.appendChild(ember);
    
    setTimeout(() => {
        ember.remove();
    }, 30000);
}

// ============================================
// API CALLS
// ============================================

async function apiCall(endpoint) {
    try {
        const response = await fetch(`${CONFIG.API_BASE}${endpoint}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        updateConnectionStatus(true);
        return await response.json();
    } catch (error) {
        console.error(`API call failed: ${endpoint}`, error);
        updateConnectionStatus(false);
        return null;
    }
}

function updateConnectionStatus(connected) {
    state.connected = connected;
    const statusEl = document.getElementById('connectionStatus');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');
    
    if (connected) {
        dot.classList.remove('disconnected');
        text.textContent = 'Connected';
    } else {
        dot.classList.add('disconnected');
        text.textContent = 'Disconnected';
    }
}

// ============================================
// WORLD STATE
// ============================================

async function fetchWorldState() {
    const data = await apiCall('/world');
    
    if (data) {
        state.world = data;
        renderWorldMap(data);
        
        // Update season info
        if (data.season) {
            const seasonNum = data.season.id || data.season.dayNumber || 1;
            document.getElementById('seasonNumber').textContent = seasonNum;
            if (data.season.endsAt) {
                state.seasonEndTime = new Date(data.season.endsAt).getTime();
            }
        }
    } else {
        renderWorldMap(getMockWorldData());
    }
}

function renderWorldMap(worldData) {
    const mapContainer = document.getElementById('worldMap');
    const depthMeter = document.getElementById('depthMeter');
    
    mapContainer.innerHTML = '';
    
    const zones = worldData.zones || getMockWorldData().zones;
    
    // Render depth meter
    renderDepthMeter(depthMeter, zones);
    
    zones.forEach((zone, index) => {
        const zoneEl = createZoneElement(zone);
        mapContainer.appendChild(zoneEl);
        
        // Add connector (except after last zone)
        if (index < zones.length - 1) {
            const connector = document.createElement('div');
            connector.className = 'zone-connector';
            mapContainer.appendChild(connector);
        }
    });
}

function renderDepthMeter(container, zones) {
    // Clear existing except label
    const label = container.querySelector('.depth-label');
    container.innerHTML = '';
    container.appendChild(label);
    
    const maxDepth = Math.max(...zones.map(z => CONFIG.ZONE_DEPTH_MAP[z.id] || 0));
    
    for (let i = 0; i <= maxDepth; i++) {
        const marker = document.createElement('div');
        marker.className = 'depth-marker';
        marker.innerHTML = `
            <div class="depth-line"></div>
            <span>${i * 100}m</span>
        `;
        container.appendChild(marker);
    }
}

function createZoneElement(zone) {
    const zoneDiv = document.createElement('div');
    zoneDiv.className = `zone danger-${zone.dangerLevel || 1}`;
    zoneDiv.onclick = () => openZoneModal(zone);
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'zone-name';
    
    const icon = document.createElement('span');
    icon.textContent = zone.emoji || zone.icon || '⚔️';
    nameDiv.appendChild(icon);
    
    const name = document.createElement('span');
    name.textContent = zone.name;
    nameDiv.appendChild(name);
    
    const dangerDiv = document.createElement('div');
    dangerDiv.className = 'zone-danger';
    for (let i = 0; i < (zone.dangerLevel || 1); i++) {
        const skull = document.createElement('span');
        skull.textContent = '💀';
        dangerDiv.appendChild(skull);
    }
    nameDiv.appendChild(dangerDiv);
    
    zoneDiv.appendChild(nameDiv);
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'zone-info';
    infoDiv.innerHTML = `
        <span>👤 ${zone.agentCount || 0} agents</span>
        <span>📍 Level ${zone.dangerLevel || 1}</span>
    `;
    zoneDiv.appendChild(infoDiv);
    
    // Add agent dots
    if (zone.agentCount > 0) {
        const dotsDiv = document.createElement('div');
        dotsDiv.className = 'agent-dots';
        const dotCount = Math.min(zone.agentCount, 20); // Max 20 visual dots
        for (let i = 0; i < dotCount; i++) {
            const dot = document.createElement('div');
            dot.className = 'agent-dot';
            dot.style.animationDelay = (Math.random() * 2) + 's';
            dotsDiv.appendChild(dot);
        }
        zoneDiv.appendChild(dotsDiv);
    }
    
    // Add connections info
    if (zone.connectedZones && zone.connectedZones.length > 0) {
        const connectionsDiv = document.createElement('div');
        connectionsDiv.className = 'zone-connections';
        connectionsDiv.innerHTML = `↓ Connects to: ${zone.connectedZones.length} zone${zone.connectedZones.length > 1 ? 's' : ''}`;
        zoneDiv.appendChild(connectionsDiv);
    }
    
    // Add tooltip
    const tooltip = createZoneTooltip(zone);
    zoneDiv.appendChild(tooltip);
    
    return zoneDiv;
}

function createZoneTooltip(zone) {
    const tooltip = document.createElement('div');
    tooltip.className = 'zone-tooltip';
    
    const resources = zone.resources && zone.resources.length > 0 
        ? zone.resources.join(', ') 
        : 'None';
    
    const connections = zone.connectedZones && zone.connectedZones.length > 0
        ? zone.connectedZones.join(', ')
        : 'Dead end';
    
    tooltip.innerHTML = `
        <div class="tooltip-section">
            <div class="tooltip-label">Description</div>
            <div class="tooltip-value">${zone.description || 'A mysterious place...'}</div>
        </div>
        <div class="tooltip-section">
            <div class="tooltip-label">Danger Level</div>
            <div class="tooltip-value">${'💀'.repeat(zone.dangerLevel || 1)}</div>
        </div>
        <div class="tooltip-section">
            <div class="tooltip-label">Resources</div>
            <div class="tooltip-value">${resources}</div>
        </div>
        <div class="tooltip-section">
            <div class="tooltip-label">Connected Zones</div>
            <div class="tooltip-value">${connections}</div>
        </div>
        ${zone.isPvP ? '<div class="tooltip-section"><div class="tooltip-label" style="color: var(--flame-red);">⚔️ PvP Zone</div></div>' : ''}
    `;
    
    return tooltip;
}

function openZoneModal(zone) {
    const modal = document.getElementById('zoneModal');
    const title = document.getElementById('zoneModalTitle');
    const content = document.getElementById('zoneModalContent');
    
    title.textContent = zone.name;
    
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <p style="color: var(--starsilver-silver); font-style: italic; margin-bottom: 15px;">
                ${zone.description || 'A mysterious zone shrouded in darkness...'}
            </p>
        </div>
        
        <div class="agent-stat-grid">
            <div class="agent-stat-item">
                <div class="agent-stat-label">Danger Level</div>
                <div class="agent-stat-value">${'💀'.repeat(zone.dangerLevel || 1)}</div>
            </div>
            <div class="agent-stat-item">
                <div class="agent-stat-label">Active Agents</div>
                <div class="agent-stat-value">${zone.agentCount || 0}</div>
            </div>
            <div class="agent-stat-item">
                <div class="agent-stat-label">Depth</div>
                <div class="agent-stat-value">${(CONFIG.ZONE_DEPTH_MAP[zone.id] || 0) * 100}m</div>
            </div>
            <div class="agent-stat-item">
                <div class="agent-stat-label">Type</div>
                <div class="agent-stat-value">${zone.isPvP ? '⚔️ PvP Arena' : '🗡️ PvE Zone'}</div>
            </div>
        </div>
        
        ${zone.connectedZones && zone.connectedZones.length > 0 ? `
            <div style="margin-top: 20px;">
                <div class="section-header">Connected Zones</div>
                <div class="guild-members">
                    ${zone.connectedZones.map(zoneId => `
                        <span class="guild-member">${zoneId.replace(/_/g, ' ').toUpperCase()}</span>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
    
    modal.style.display = 'block';
}

function closeZoneModal() {
    document.getElementById('zoneModal').style.display = 'none';
}

window.onclick = function(event) {
    const modal = document.getElementById('zoneModal');
    if (event.target === modal) {
        closeZoneModal();
    }
}

// ============================================
// LEADERBOARD
// ============================================

async function fetchLeaderboard() {
    const data = await apiCall('/leaderboard');
    
    if (data && data.agents) {
        state.leaderboard = data;
        renderLeaderboard(data.agents);
    } else {
        renderLeaderboard(getMockLeaderboard());
    }
}

function renderLeaderboard(agents) {
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = '';
    
    agents.slice(0, 10).forEach((agent, index) => {
        const row = document.createElement('tr');
        
        const rank = agent.rank || (index + 1);
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        
        // Determine status
        let status = 'alive';
        let statusClass = 'status-alive';
        
        // API returns walletAddress, not status directly
        // We'll infer from the data or use default
        if (agent.status) {
            status = agent.status;
        } else if (agent.isDead) {
            status = 'dead';
        }
        
        if (status === 'dead') {
            statusClass = 'status-dead';
        } else if (status === 'corrupted') {
            statusClass = 'status-corrupted';
        }
        
        row.innerHTML = `
            <td class="rank-cell ${rankClass}">#${rank}</td>
            <td><span class="agent-name" onclick="inspectAgent('${agent.name}')">${agent.name}</span></td>
            <td>${agent.level || Math.floor((agent.xp || agent.xpEarned || 0) / 100) + 1}</td>
            <td>${formatNumber(agent.xp || agent.xpEarned || 0)}</td>
            <td>${agent.kills || agent.mobsKilled || 0}</td>
            <td class="gold-text">${formatNumber(agent.gold || agent.goldAccumulated || 0)} gold</td>
            <td class="${statusClass}">${capitalizeFirst(status)}</td>
        `;
        
        if (status === 'corrupted') {
            row.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.4)';
        }
        
        tbody.appendChild(row);
    });
}

// ============================================
// BOSS STATUS
// ============================================

async function fetchBossStatus() {
    const data = await apiCall('/boss');
    
    if (data) {
        // Check for damage to trigger shake effect
        if (state.lastBossHp !== null && data.hp < state.lastBossHp) {
            triggerScreenShake();
        }
        state.lastBossHp = data.hp;
        
        state.boss = data;
        renderBossStatus(data);
    } else {
        renderBossStatus(getMockBossData());
    }
}

function renderBossStatus(bossData) {
    const hpCurrent = bossData.hp || bossData.currentHp || 10000;
    const hpMax = bossData.maxHp || 10000;
    const hpPercent = Math.round((hpCurrent / hpMax) * 100);
    
    document.getElementById('bossHpCurrent').textContent = formatNumber(hpCurrent);
    document.getElementById('bossHpMax').textContent = formatNumber(hpMax);
    document.getElementById('bossHpPercent').textContent = hpPercent + '%';
    document.getElementById('bossHpBar').style.width = hpPercent + '%';
    
    const attackerCount = bossData.attackers?.length || 0;
    document.getElementById('bossAttackers').textContent = attackerCount;
    
    const respawnTime = bossData.lastRespawn || bossData.lastSpawn;
    document.getElementById('bossRespawn').textContent = respawnTime
        ? timeAgo(new Date(respawnTime))
        : 'Never';
    
    document.getElementById('bossPrize').textContent = formatNumber(bossData.prizePool || 0) + ' gold';
}

// ============================================
// ACTIVITY FEED
// ============================================

async function fetchActivity() {
    const data = await apiCall('/activity');
    
    if (data && data.events) {
        const newEvents = data.events || [];
        
        // Check for death events to trigger flash
        newEvents.forEach(event => {
            if (event.type === 'death' && !state.activity.find(e => e.timestamp === event.timestamp)) {
                triggerFlashEffect();
            } else if (event.type === 'loot' && event.message.includes('Legendary')) {
                triggerGlowPulse();
            } else if (event.type === 'riddle' && event.message.includes('solved')) {
                triggerParticleBurst(event.agentName);
            }
        });
        
        state.activity = newEvents;
        renderActivity(newEvents);
    } else {
        renderActivity(getMockActivity());
    }
}

function renderActivity(activities) {
    const feed = document.getElementById('activityFeed');
    
    const recentActivities = activities.slice(0, 30);
    
    feed.innerHTML = recentActivities.map(activity => {
        const icon = getActivityIcon(activity.type);
        const time = activity.timestamp ? timeAgo(new Date(activity.timestamp)) : 'just now';
        
        return `
            <div class="activity-item">
                <span class="activity-icon">${icon}</span>
                ${activity.message || activity.description || 'Unknown event'}
                <span class="activity-time">${time}</span>
            </div>
        `;
    }).join('');
}

function getActivityIcon(type) {
    const icons = {
        move: '🚶',
        kill: '⚔️',
        death: '💀',
        boss: '🔥',
        pvp: '⚔️',
        riddle: '📜',
        loot: '💎',
        guild: '🤝',
        corruption: '👁️',
        gather: '⛏️',
        craft: '🔨',
        shop: '🏪',
        default: '•'
    };
    
    return icons[type] || icons.default;
}

// ============================================
// PVP ARENA
// ============================================

async function fetchPvPData() {
    const data = await apiCall('/pvp');
    
    if (data) {
        state.pvp = data;
        renderPvP(data);
    } else {
        renderPvP(getMockPvPData());
    }
}

function renderPvP(pvpData) {
    // Active matches
    const activeContainer = document.getElementById('activeMatches');
    const activeMatches = pvpData.activeMatches || [];
    
    if (activeMatches.length === 0) {
        activeContainer.innerHTML = '<p style="color: var(--starsilver-silver); font-style: italic;">No active matches</p>';
    } else {
        activeContainer.innerHTML = activeMatches.map(match => `
            <div class="pvp-match">
                <div class="match-fighters">${match.fighter1} ⚔️ ${match.fighter2}</div>
                <div class="match-wager">Wager: ${formatNumber(match.wager || 0)} gold</div>
            </div>
        `).join('');
    }
    
    // Recent results
    const resultsContainer = document.getElementById('recentMatches');
    const recentResults = pvpData.recentResults || [];
    
    if (recentResults.length === 0) {
        resultsContainer.innerHTML = '<p style="color: var(--starsilver-silver); font-style: italic;">No recent matches</p>';
    } else {
        resultsContainer.innerHTML = recentResults.slice(0, 5).map(result => `
            <div class="pvp-result">
                <span class="result-winner">${result.winner}</span> defeated 
                <span class="result-loser">${result.loser}</span>
                <div style="font-size: 0.8rem; color: var(--starsilver-silver); margin-top: 3px;">
                    ${result.timestamp ? timeAgo(new Date(result.timestamp)) : 'recently'} • ${formatNumber(result.wager * 2 || 0)} gold prize
                </div>
            </div>
        `).join('');
    }
}

// ============================================
// AGENT INSPECTOR
// ============================================

function searchAgent() {
    const searchInput = document.getElementById('agentSearch');
    const agentName = searchInput.value.trim();
    
    if (agentName) {
        inspectAgent(agentName);
    }
}

async function inspectAgent(agentName) {
    const data = await apiCall(`/agent/${encodeURIComponent(agentName)}`);
    
    if (data && !data.error) {
        state.selectedAgent = data;
        renderAgentDetails(data);
    } else {
        renderAgentDetails({ error: true, name: agentName });
    }
}

function renderAgentDetails(agent) {
    const container = document.getElementById('agentDetails');
    
    if (agent.error) {
        container.innerHTML = `
            <p style="text-align: center; color: var(--flame-red); padding: 40px 20px;">
                Agent "${agent.name}" not found. They may not have entered The Hollows yet...
            </p>
        `;
        return;
    }
    
    container.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h3 style="font-size: 1.5rem; color: var(--bone-white); margin-bottom: 10px;">
                ${agent.name}
            </h3>
            <p style="color: var(--starsilver-silver); font-style: italic;">
                ${agent.title || 'Wanderer of the Hollows'}
            </p>
        </div>
        
        <div class="agent-stat-grid">
            <div class="agent-stat-item">
                <div class="agent-stat-label">Level</div>
                <div class="agent-stat-value">${agent.level || 1}</div>
            </div>
            <div class="agent-stat-item">
                <div class="agent-stat-label">XP</div>
                <div class="agent-stat-value">${formatNumber(agent.xp || 0)}</div>
            </div>
            <div class="agent-stat-item">
                <div class="agent-stat-label">Gold</div>
                <div class="agent-stat-value gold-text">${formatNumber(agent.gold || 0)} gold</div>
            </div>
            <div class="agent-stat-item">
                <div class="agent-stat-label">Status</div>
                <div class="agent-stat-value status-${agent.status || 'alive'}">
                    ${capitalizeFirst(agent.status || 'alive')}
                </div>
            </div>
            <div class="agent-stat-item">
                <div class="agent-stat-label">Kills</div>
                <div class="agent-stat-value">${agent.kills || 0}</div>
            </div>
            <div class="agent-stat-item">
                <div class="agent-stat-label">Deaths</div>
                <div class="agent-stat-value">${agent.deaths || 0}</div>
            </div>
            <div class="agent-stat-item">
                <div class="agent-stat-label">Current Zone</div>
                <div class="agent-stat-value">${formatZoneName(agent.zone || 'Unknown')}</div>
            </div>
            <div class="agent-stat-item">
                <div class="agent-stat-label">Corruption</div>
                <div class="agent-stat-value" style="color: var(--corruption-purple);">
                    ${agent.corruption || 0}%
                </div>
            </div>
        </div>
        
        ${agent.inventory && agent.inventory.length > 0 ? `
            <div class="inventory-section">
                <div class="section-header">⚔️ Inventory</div>
                <div class="inventory-items">
                    ${agent.inventory.map(item => `
                        <span class="inventory-item">${item}</span>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${agent.guild && agent.guild.length > 0 ? `
            <div class="guild-section">
                <div class="section-header">🤝 Guild</div>
                <div class="guild-members">
                    ${agent.guild.map(member => `
                        <span class="guild-member" onclick="inspectAgent('${member}')">${member}</span>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${agent.combatLog && agent.combatLog.length > 0 ? `
            <div class="combat-log-section">
                <div class="section-header">📜 Recent Combat</div>
                <div class="combat-log">
                    ${agent.combatLog.slice(0, 10).map(log => `
                        <div class="combat-log-entry">${log}</div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

// ============================================
// VISUAL EFFECTS
// ============================================

function triggerScreenShake() {
    document.body.classList.add('shake');
    setTimeout(() => {
        document.body.classList.remove('shake');
    }, 500);
}

function triggerFlashEffect() {
    document.body.classList.add('flash');
    setTimeout(() => {
        document.body.classList.remove('flash');
    }, 500);
}

function triggerGlowPulse() {
    const feed = document.getElementById('activityFeed');
    if (feed) {
        feed.classList.add('glow-pulse');
        setTimeout(() => {
            feed.classList.remove('glow-pulse');
        }, 1000);
    }
}

function triggerParticleBurst(agentName) {
    const feed = document.getElementById('activityFeed');
    if (!feed) return;
    
    const burst = document.createElement('div');
    burst.className = 'particle-burst';
    burst.style.position = 'absolute';
    burst.style.top = '50%';
    burst.style.left = '50%';
    
    // Create 20 particles
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        const angle = (Math.PI * 2 * i) / 20;
        const distance = 50 + Math.random() * 50;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        particle.style.setProperty('--tx', tx + 'px');
        particle.style.setProperty('--ty', ty + 'px');
        
        burst.appendChild(particle);
    }
    
    feed.style.position = 'relative';
    feed.appendChild(burst);
    
    setTimeout(() => {
        burst.remove();
    }, 1000);
}

// ============================================
// COUNTDOWN TIMER
// ============================================

function updateCountdown() {
    if (!state.seasonEndTime) {
        // Default to 7 days from now if no data
        if (!state.world || !state.world.season) {
            state.seasonEndTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
        } else {
            return;
        }
    }
    
    const now = Date.now();
    const remaining = state.seasonEndTime - now;
    
    if (remaining <= 0) {
        document.getElementById('countdown').textContent = 'SEASON ENDED';
        return;
    }
    
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    const timeString = `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    document.getElementById('countdown').textContent = timeString;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

function formatZoneName(zoneId) {
    if (!zoneId) return 'Unknown';
    return zoneId
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// ============================================
// MOCK DATA (fallback when API unavailable)
// ============================================

function getMockWorldData() {
    return {
        season: { id: 1, dayNumber: 1 },
        zones: [
            { 
                id: 'the_gate',
                name: 'The Gate', 
                emoji: '🚪', 
                dangerLevel: 1, 
                agentCount: 12,
                description: 'The entrance to the Hollows. A safe haven with shops and guild halls.',
                connectedZones: ['obsidian_gate'],
                resources: ['herbs', 'wood']
            },
            { 
                id: 'obsidian_gate',
                name: 'Obsidian Gate', 
                emoji: '🗿', 
                dangerLevel: 1, 
                agentCount: 8,
                description: 'Massive gates of black stone, carved with ancient warnings.',
                connectedZones: ['cavern_of_whispers'],
                resources: ['stone', 'iron_ore']
            },
            { 
                id: 'cavern_of_whispers',
                name: 'Cavern of Whispers', 
                emoji: '🌫️', 
                dangerLevel: 2, 
                agentCount: 6,
                description: 'Strange voices echo through these tunnels.',
                connectedZones: ['sunken_crypt', 'chamber_of_shadows'],
                resources: ['mushrooms', 'crystals']
            },
            { 
                id: 'sunken_crypt',
                name: 'The Sunken Crypt', 
                emoji: '⚰️', 
                dangerLevel: 3, 
                agentCount: 4,
                description: 'An ancient burial ground, flooded by underground rivers.',
                connectedZones: ['molten_depths'],
                resources: ['bone_dust', 'ancient_relics']
            },
            { 
                id: 'molten_depths',
                name: 'The Molten Depths', 
                emoji: '🔥', 
                dangerLevel: 4, 
                agentCount: 3,
                description: 'Rivers of lava flow through cracked stone.',
                connectedZones: ['black_pit', 'abyss_bridge'],
                resources: ['obsidian', 'starsilver']
            },
            { 
                id: 'black_pit',
                name: 'The Black Pit', 
                emoji: '⚔️', 
                dangerLevel: 4, 
                agentCount: 5,
                description: 'The PvP arena where agents face mortal combat.',
                connectedZones: [],
                isPvP: true,
                resources: []
            },
            { 
                id: 'abyss_bridge',
                name: 'Abyss Bridge', 
                emoji: '🌉', 
                dangerLevel: 5, 
                agentCount: 2,
                description: 'A narrow bridge over the endless void. Home of the Ashborn.',
                connectedZones: [],
                resources: ['legendary_ore']
            }
        ]
    };
}

function getMockLeaderboard() {
    return [
        { name: 'ShadowReaper', level: 15, xp: 125000, kills: 87, gold: 45000, status: 'alive' },
        { name: 'DarkMage_42', level: 14, xp: 110000, kills: 72, gold: 38000, status: 'corrupted' },
        { name: 'IronWill', level: 13, xp: 95000, kills: 65, gold: 32000, status: 'alive' }
    ];
}

function getMockBossData() {
    return {
        hp: 7500,
        maxHp: 10000,
        attackers: ['ShadowReaper', 'DarkMage_42'],
        lastSpawn: Date.now() - 2 * 60 * 60 * 1000,
        prizePool: 150000
    };
}

function getMockActivity() {
    const now = Date.now();
    return [
        { type: 'boss', message: 'ShadowReaper dealt 5,000 damage to the Ashborn!', timestamp: now - 30000 },
        { type: 'pvp', message: 'DarkMage_42 defeated CrimsonBlade in the Black Pit', timestamp: now - 120000 },
        { type: 'death', message: '💀 Nightshade perished in the Cavern of Whispers', timestamp: now - 300000 }
    ];
}

function getMockPvPData() {
    return {
        activeMatches: [
            { fighter1: 'ShadowReaper', fighter2: 'DarkMage_42', wager: 25000 }
        ],
        recentResults: [
            { winner: 'ShadowReaper', loser: 'CrimsonBlade', timestamp: Date.now() - 600000, wager: 15000 }
        ]
    };
}
