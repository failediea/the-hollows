import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './db/schema.js';
import { Agent } from './db/schema.js';
import { getApiKeyFromRequest } from './utils/validation.js';
import { verifyMessage } from 'viem';
import { ZONES } from './world/zones.js';
import { initializeItems } from './engine/items.js';
import { getAllActiveSessions, handleTimeout as combatHandleTimeout } from './engine/combat-session.js';
import { initializeSeason, updateLeaderboard } from './engine/seasons.js';
import { initializeSkills } from './engine/skills.js';
import { initializeAchievements } from './engine/achievements.js';
import { createEntryRoutes } from './routes/entry.js';
import { createWorldRoutes } from './routes/world.js';
import { createLeaderboardRoutes } from './routes/leaderboard.js';
import { createPvPRoutes } from './routes/pvp.js';
import { createCombatRoutes } from './routes/combat.js';
import { createPartyRoutes } from './routes/party.js';
import { createMarketplaceRoutes } from './routes/marketplace.js';
import { getRealtimeSession, handlePlayerInput, startGameLoop, cleanupRealtimeSessions } from './engine/realtime-session.js';
import { handleAgentConnection } from './ws/agent-protocol.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4000');
const DATABASE_PATH = process.env.DATABASE_PATH || './data/hollows.db';
const CORRUPTION_TICK_INTERVAL = parseInt(process.env.CORRUPTION_TICK_INTERVAL_MS || '600000'); // 10 min
const MOB_RESPAWN_INTERVAL = parseInt(process.env.MOB_RESPAWN_INTERVAL_MS || '300000'); // 5 min

// Ensure data directory exists
const dataDir = path.dirname(DATABASE_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
console.log('Initializing database...');
const db = initDatabase(DATABASE_PATH);

// Initialize quest tables
import { initQuestTables } from './engine/quests.js';
initQuestTables(db);

// Initialize zones
console.log('Loading zones...');
for (const zone of Object.values(ZONES)) {
  db.prepare(`
    INSERT OR REPLACE INTO zones (id, name, emoji, danger_level, description, is_pvp, requires_guild_size)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    zone.id,
    zone.name,
    zone.emoji,
    zone.dangerLevel,
    zone.description,
    zone.isPvP ? 1 : 0,
    zone.requiresGuildSize
  );
}

// Initialize items
console.log('Loading items...');
initializeItems(db);

// Initialize skills
console.log('Loading skills...');
initializeSkills(db);

// Initialize achievements
console.log('Loading achievements...');
initializeAchievements(db);

// Initialize or get current season
console.log('Checking season...');
let season = db.prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
if (!season) {
  console.log('No active season found. Creating new season...');
  season = initializeSeason(db);
}
console.log(`Season ${(season as any).id} active`);

// Initialize world boss (Ashborn)
const existingAshborn = db.prepare(`SELECT * FROM world_bosses WHERE name = 'The Ashborn'`).get();
if (!existingAshborn) {
  console.log('Spawning The Ashborn...');
  db.prepare(`
    INSERT INTO world_bosses (name, zone_id, max_hp, current_hp, atk, def, prize_pool, last_spawn, respawn_hours, is_alive)
    VALUES ('The Ashborn', 'abyss_bridge', 10000, 10000, 50, 30, 10000, ?, 24, 1)
  `).run(Date.now());
}

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', cors());

// Health check
// Serve dashboard static files
const dashboardDir = path.resolve(import.meta.dirname, 'dashboard');

app.get('/dashboard', (c) => {
  const html = fs.readFileSync(path.join(dashboardDir, 'index.html'), 'utf-8');
  return c.html(html);
});

app.get('/dashboard/styles.css', (c) => {
  const css = fs.readFileSync(path.join(dashboardDir, 'styles.css'), 'utf-8');
  c.header('Content-Type', 'text/css');
  return c.body(css);
});

app.get('/dashboard/app.js', (c) => {
  const js = fs.readFileSync(path.join(dashboardDir, 'app.js'), 'utf-8');
  c.header('Content-Type', 'application/javascript');
  return c.body(js);
});

// Serve play UI
app.get('/play', (c) => {
  const html = fs.readFileSync(path.join(dashboardDir, 'play.html'), 'utf-8');
  return c.html(html);
});

app.get('/play/play.css', (c) => {
  const css = fs.readFileSync(path.join(dashboardDir, 'play.css'), 'utf-8');
  c.header('Content-Type', 'text/css');
  return c.body(css);
});

app.get('/play/play.js', (c) => {
  const js = fs.readFileSync(path.join(dashboardDir, 'play.js'), 'utf-8');
  c.header('Content-Type', 'application/javascript');
  return c.body(js);
});

// Leaderboard page
app.get('/leaderboard', (c) => {
  const html = fs.readFileSync(path.join(dashboardDir, 'leaderboard.html'), 'utf-8');
  return c.html(html);
});

// API: leaderboard with real agent data
app.get('/api/leaderboard', (c) => {
  try {
    const agents = db.prepare(`
      SELECT name, level, xp, hp, gold, zone_id as zone, wallet_address, is_dead,
        (SELECT COUNT(*) FROM combat_log WHERE agent_id = agents.id AND won = 1) as kills
      FROM agents
      ORDER BY level DESC, xp DESC
    `).all() as any[];
    return c.json({
      success: true,
      agents: agents.map((a: any) => ({
        name: a.name,
        level: a.level,
        xp: a.xp,
        hp: a.hp,
        gold: a.gold,
        zone: a.zone,
        walletAddress: a.wallet_address,
        isDead: !!a.is_dead,
        kills: a.kills
      }))
    });
  } catch (error) {
    console.error('Error in /api/leaderboard:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Serve Svelte combat client
const combatClientDir = path.resolve(import.meta.dirname, '..', 'client', 'dist');

app.get('/combat', (c) => {
  const html = fs.readFileSync(path.join(combatClientDir, 'index.html'), 'utf-8');
  return c.html(html);
});

app.get('/sprites/*', (c) => {
  const assetPath = c.req.path.replace('/sprites/', '');
  const fullPath = path.join(combatClientDir, 'sprites', assetPath);
  if (!fs.existsSync(fullPath)) return c.notFound();
  c.header('Content-Type', 'image/png');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(fs.readFileSync(fullPath));
});

app.get('/combat/sprites/*', (c) => {
  const assetPath = c.req.path.replace('/combat/sprites/', '');
  const fullPath = path.join(combatClientDir, 'sprites', assetPath);
  if (!fs.existsSync(fullPath)) return c.notFound();
  c.header('Content-Type', 'image/png');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(fs.readFileSync(fullPath));
});

app.get('/combat/assets/*', (c) => {
  const assetPath = c.req.path.replace('/combat/assets/', '');
  const fullPath = path.join(combatClientDir, 'assets', assetPath);
  if (!fs.existsSync(fullPath)) return c.notFound();
  const ext = path.extname(fullPath).toLowerCase();
  const mimeMap: Record<string, string> = { '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  c.header('Content-Type', mimeMap[ext] || 'application/octet-stream');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(fs.readFileSync(fullPath));
});

// Serve static assets (images, etc.)
app.get('/assets/*', (c) => {
  const assetPath = c.req.path.replace('/assets/', '');
  const fullPath = path.join(dashboardDir, 'assets', assetPath);
  if (!fs.existsSync(fullPath)) return c.notFound();
  const ext = path.extname(fullPath).toLowerCase();
  const mimeMap: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
  c.header('Content-Type', mimeMap[ext] || 'application/octet-stream');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(fs.readFileSync(fullPath));
});

// ============ CHAT ============
import { chatLog, MAX_CHAT_LOG, broadcastToZone } from './chat.js';

app.post('/chat', async (c) => {
  try {
    const body = await c.req.json();
    const { message } = body;
    const apiKey = getApiKeyFromRequest(c, body);
    if (!apiKey || !message) return c.json({ error: 'apiKey and message required' }, 400);
    const agent = db.prepare('SELECT name, zone_id FROM agents WHERE api_key = ?').get(apiKey) as any;
    if (!agent) return c.json({ error: 'Invalid API key' }, 401);
    const msg = { author: agent.name, text: message.slice(0, 200), time: Date.now(), zone: agent.zone_id };
    chatLog.push(msg);
    if (chatLog.length > MAX_CHAT_LOG) chatLog.shift();
    broadcastToZone(db, agent.zone_id, { type: 'chat_message', ...msg });
    return c.json({ success: true });
  } catch { return c.json({ error: 'Chat failed' }, 500); }
});

app.get('/chat', (c) => {
  const zone = c.req.query('zone') || '';
  const since = parseInt(c.req.query('since') || '0');
  const msgs = chatLog.filter(m => m.time > since && (!zone || m.zone === zone));
  return c.json(msgs.slice(-20));
});

app.get('/', (c) => {
  return c.json({ 
    status: 'alive',
    world: 'The Hollows',
    version: '1.0.0',
    dashboard: '/dashboard'
  });
});

// Wallet-based entry for human players
const MONAD_CHAIN_ID = 143;

app.post('/enter-wallet', async (c) => {
  try {
    const body = await c.req.json();
    let { name, walletAddress, signature, checkOnly } = body;

    if (!walletAddress) {
      return c.json({ error: 'Missing required field: walletAddress' }, 400);
    }

    walletAddress = walletAddress.toLowerCase();

    // Check if agent with this wallet already exists
    const existing = db.prepare('SELECT * FROM agents WHERE LOWER(wallet_address) = ? AND is_dead = 0 ORDER BY created_at DESC LIMIT 1').get(walletAddress) as any;
    if (existing) {
      // Require signature to return apiKey (proves wallet ownership)
      if (signature) {
        try {
          const verifyMsg = `Enter The Hollows as "${existing.name}" on chain ${MONAD_CHAIN_ID}`;
          const isValid = await verifyMessage({
            address: walletAddress as `0x${string}`,
            message: verifyMsg,
            signature: signature as `0x${string}`,
          });
          if (isValid) {
            return c.json({
              success: true,
              message: 'Welcome back to The Hollows',
              agent: {
                id: existing.id,
                name: existing.name,
                apiKey: existing.api_key,
                zone: existing.zone_id,
                stats: {
                  hp: existing.hp, maxHp: existing.max_hp,
                  atk: existing.atk, def: existing.def, spd: existing.spd, luck: existing.luck,
                  level: existing.level, xp: existing.xp
                },
                gold: existing.gold, corruption: existing.corruption, isDead: existing.is_dead
              },
              apiKey: existing.api_key
            });
          }
        } catch (_e) {
          // Signature verification failed — fall through to return without apiKey
        }
      }
      // No valid signature — return agent info without apiKey
      return c.json({
        success: true,
        message: 'Welcome back to The Hollows',
        agent: {
          id: existing.id,
          name: existing.name,
          zone: existing.zone_id,
          stats: {
            hp: existing.hp, maxHp: existing.max_hp,
            atk: existing.atk, def: existing.def, spd: existing.spd, luck: existing.luck,
            level: existing.level, xp: existing.xp
          },
          gold: existing.gold, corruption: existing.corruption, isDead: existing.is_dead
        },
      });
    }

    // Check-only mode: just report no existing character
    if (checkOnly) {
      return c.json({ exists: false, message: 'No existing character found' }, 404);
    }

    if (!name) {
      return c.json({ error: 'Missing required field: name' }, 400);
    }

    name = name.trim();

    // Verify signature before creating agent
    if (!signature) {
      return c.json({ error: 'Signature required to create character' }, 400);
    }

    const expectedMessage = `Enter The Hollows as "${name}" on chain ${MONAD_CHAIN_ID}`;
    try {
      const isValid = await verifyMessage({
        address: walletAddress as `0x${string}`,
        message: expectedMessage,
        signature: signature as `0x${string}`,
      });
      if (!isValid) {
        return c.json({ error: 'Invalid signature' }, 401);
      }
    } catch (e) {
      return c.json({ error: 'Signature verification failed' }, 401);
    }

    // Check if name is taken
    const nameTaken = db.prepare('SELECT id FROM agents WHERE name = ?').get(name);
    if (nameTaken) {
      return c.json({ error: 'Agent name already taken' }, 409);
    }

    // Verify on-chain payment
    const { verifyEntryPayment } = await import('./utils/validation.js');
    const paymentCheck = await verifyEntryPayment(walletAddress, db);
    if (!paymentCheck.paid) {
      return c.json({ error: paymentCheck.error }, 402);
    }

    // Get or create season
    const season = db.prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() as any;
    if (!season) {
      return c.json({ error: 'No active season' }, 500);
    }

    // Create new agent (wrapped in transaction to prevent race conditions)
    const { createAgent } = await import('./engine/agent.js');
    const createInTransaction = db.transaction(() => {
      // Re-check name not taken inside transaction
      const taken = db.prepare('SELECT id FROM agents WHERE name = ?').get(name);
      if (taken) throw new Error('Agent name already taken');
      return createAgent(db, name, walletAddress, season.id);
    });

    try {
      const agent = createInTransaction();
      return c.json({
        success: true,
        message: 'Welcome to The Hollows',
        agent: {
          id: agent.id,
          name: agent.name,
          apiKey: agent.api_key,
          zone: agent.zone_id,
          stats: {
            hp: agent.hp, maxHp: agent.max_hp,
            atk: agent.atk, def: agent.def, spd: agent.spd, luck: agent.luck,
            level: agent.level, xp: agent.xp
          },
          gold: agent.gold, corruption: agent.corruption, isDead: agent.is_dead
        },
        apiKey: agent.api_key
      });
    } catch (e: any) {
      return c.json({ error: e.message || 'Registration failed' }, 409);
    }
  } catch (error) {
    console.error('Error in /enter-wallet:', error);
    return c.json({ error: 'Failed to enter. Please try again.' }, 500);
  }
});

// Mount routes
app.route('/', createEntryRoutes(db));
app.route('/', createWorldRoutes(db));
app.route('/', createLeaderboardRoutes(db));
app.route('/', createPvPRoutes(db));
app.route('/', createCombatRoutes(db));
app.route('/', createPartyRoutes(db));
app.route('/marketplace', createMarketplaceRoutes(db));

// Background tasks
let corruptionInterval: NodeJS.Timeout;
let mobRespawnInterval: NodeJS.Timeout;
let seasonCheckInterval: NodeJS.Timeout;

function startBackgroundTasks() {
  console.log('Starting background tasks...');

  // Corruption tick - apply corruption effects
  corruptionInterval = setInterval(() => {
    try {
      db.prepare(`
        UPDATE agents 
        SET corruption = (gold / 100)
        WHERE is_dead = 0
      `).run();
      
      console.log('Corruption tick applied');
    } catch (error) {
      console.error('Error in corruption tick:', error);
    }
  }, CORRUPTION_TICK_INTERVAL);
  corruptionInterval.unref();

  // Mob respawn (placeholder - mobs respawn on attack in actual implementation)
  mobRespawnInterval = setInterval(() => {
    console.log('Mob respawn tick');
  }, MOB_RESPAWN_INTERVAL);
  mobRespawnInterval.unref();

  // Leaderboard update - every hour (season wipe disabled — game is persistent)
  seasonCheckInterval = setInterval(() => {
    try {
      updateLeaderboard(db);
    } catch (error) {
      console.error('Error in leaderboard update:', error);
    }
  }, 60 * 60 * 1000);
  seasonCheckInterval.unref();

  // Combat timeout sweeper - every 5 seconds
  const combatSweeperInterval = setInterval(() => {
    try {
      const now = Date.now();
      const sessions = getAllActiveSessions();
      for (const session of sessions) {
        if (session.status === 'awaiting_input' && now > session.deadlineAt) {
          combatHandleTimeout(session.id);
        }
      }
    } catch (error) {
      console.error('Error in combat timeout sweeper:', error);
    }
  }, 5000);
  combatSweeperInterval.unref();

  // Real-time session cleanup - every 30 seconds
  const realtimeCleanupInterval = setInterval(() => {
    cleanupRealtimeSessions();
  }, 30000);
  realtimeCleanupInterval.unref();

  // Ashborn respawn check - every hour
  const ashbornInterval = setInterval(() => {
    try {
      const ashborn = db.prepare(`SELECT * FROM world_bosses WHERE name = 'The Ashborn'`).get() as any;
      
      if (!ashborn.is_alive) {
        const timeSinceSpawn = Date.now() - ashborn.last_spawn;
        const respawnTime = ashborn.respawn_hours * 60 * 60 * 1000;
        
        if (timeSinceSpawn >= respawnTime) {
          console.log('Respawning The Ashborn...');
          db.prepare(`
            UPDATE world_bosses 
            SET current_hp = max_hp, is_alive = 1, last_spawn = ?, prize_pool = 10000
            WHERE name = 'The Ashborn'
          `).run(Date.now());
        }
      }
    } catch (error) {
      console.error('Error in Ashborn respawn check:', error);
    }
  }, 60 * 60 * 1000);
  ashbornInterval.unref();
}

function stopBackgroundTasks() {
  console.log('Stopping background tasks...');
  if (corruptionInterval) clearInterval(corruptionInterval);
  if (mobRespawnInterval) clearInterval(mobRespawnInterval);
  if (seasonCheckInterval) clearInterval(seasonCheckInterval);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  stopBackgroundTasks();
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  stopBackgroundTasks();
  db.close();
  process.exit(0);
});

// Start server
console.log(`Starting The Hollows on port ${PORT}...`);

const _server = serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`🌑 The Hollows is alive at http://localhost:${info.port}`);
  console.log('💀 May the strongest agents survive...');
  startBackgroundTasks();
});

// WebSocket server for real-time combat and agent protocol
// Cast needed because @hono/node-server returns ServerType which includes Http2Server
const wss = new WebSocketServer({
  server: _server as unknown as import('http').Server,
  maxPayload: 64 * 1024, // 64KB max message
});

// Connection tracking for rate limiting
const connectionsByKey = new Map<string, number>();
const connectionsByIp = new Map<string, number>();
const MAX_CONNECTIONS_PER_KEY = 2;
const MAX_CONNECTIONS_PER_IP = 30;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const mode = url.searchParams.get('mode');

  // Agent protocol: first-message auth (NO api key in URL)
  if (mode === 'agent') {
    const authTimeout = setTimeout(() => {
      ws.close(4008, 'Auth timeout - send auth message within 5 seconds');
    }, 5000);

    ws.once('message', (data) => {
      clearTimeout(authTimeout);
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type !== 'auth' || !msg.apiKey) {
          ws.close(4001, 'First message must be { type: "auth", apiKey: "..." }');
          return;
        }
        const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(msg.apiKey) as Agent | undefined;
        if (!agent) {
          ws.close(4003, 'Invalid API key');
          return;
        }

        // Check connection limits
        const keyCount = connectionsByKey.get(msg.apiKey) || 0;
        if (keyCount >= MAX_CONNECTIONS_PER_KEY) {
          ws.close(4029, 'Too many connections for this API key');
          return;
        }
        const ip = req.socket.remoteAddress || '';
        const ipCount = connectionsByIp.get(ip) || 0;
        if (ipCount >= MAX_CONNECTIONS_PER_IP) {
          ws.close(4029, 'Too many connections from this IP');
          return;
        }

        // Track connection
        connectionsByKey.set(msg.apiKey, keyCount + 1);
        connectionsByIp.set(ip, ipCount + 1);

        // Set idle timeout
        const idleTimer = setTimeout(() => {
          ws.close(4008, 'Idle timeout');
        }, IDLE_TIMEOUT_MS);
        idleTimer.unref();

        // Cleanup on close
        ws.on('close', () => {
          clearTimeout(idleTimer);
          const kc = connectionsByKey.get(msg.apiKey) || 1;
          if (kc <= 1) connectionsByKey.delete(msg.apiKey);
          else connectionsByKey.set(msg.apiKey, kc - 1);
          const ic = connectionsByIp.get(ip) || 1;
          if (ic <= 1) connectionsByIp.delete(ip);
          else connectionsByIp.set(ip, ic - 1);
        });

        // Reset idle timer on messages
        ws.on('message', () => {
          idleTimer.refresh();
        });

        handleAgentConnection(ws, db, agent);
      } catch (_e) {
        ws.close(4002, 'Invalid auth message');
      }
    });
    return;
  }

  // Existing realtime combat handler
  const sessionId = url.searchParams.get('sessionId');
  const apiKey = url.searchParams.get('apiKey');

  if (!sessionId || !apiKey) {
    ws.close(4001, 'Missing sessionId or apiKey');
    return;
  }

  // Validate API key
  const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as Agent | undefined;
  if (!agent) {
    ws.close(4003, 'Invalid API key');
    return;
  }

  // Find or validate session
  const session = getRealtimeSession(sessionId);
  if (!session || session.agentId !== agent.id) {
    ws.close(4004, 'Session not found or unauthorized');
    return;
  }

  // Attach WebSocket to session
  session.ws = ws;
  console.log(`WebSocket connected for realtime session ${sessionId}`);

  // Start game loop if not already running
  if (!session.tickTimer) {
    startGameLoop(session);
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'input') {
        handlePlayerInput(session, msg.data);
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {
      console.error('Invalid WS message:', e);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket disconnected for session ${sessionId}`);
    session.ws = null;
  });
});

// Handle unexpected errors to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
