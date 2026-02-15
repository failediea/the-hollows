import Anthropic from '@anthropic-ai/sdk';
import WebSocket from 'ws';
import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { SYSTEM_PROMPT, TOOLS } from './prompts.js';

dotenv.config();

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:4000';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
const ACTION_DELAY = parseInt(process.env.ACTION_DELAY || '2500');
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || '0x23d916bd5c4c5a88e2ee1ee124ca320902f79820';
const SESSION_FILE = path.join(import.meta.dirname, '.hollows-session.json');

const MONAD_CHAIN_ID = 10143;

// Monad testnet chain definition
const monadTestnet = defineChain({
  id: MONAD_CHAIN_ID,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  testnet: true,
});

interface Session {
  agentName: string;
  apiKey: string;
  walletAddress: string;
}

interface Observation {
  type: string;
  agent: any;
  zone: any;
  inventory: any[];
  combat: any;
  quests: any[];
  availableActions: string[];
  world: any;
}

// Anthropic client
let anthropic: Anthropic;

// Reconnection state
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;

/**
 * Load saved session from disk.
 */
function loadSession(): Session | null {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
      if (data.agentName && data.apiKey && data.walletAddress) {
        return data as Session;
      }
    }
  } catch {
    // Corrupted session file
  }
  return null;
}

/**
 * Save session to disk.
 */
function saveSession(session: Session): void {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

/**
 * Generate a random agent name.
 */
function generateAgentName(): string {
  const prefixes = ['Shadow', 'Dark', 'Iron', 'Storm', 'Flame', 'Frost', 'Void', 'Grim', 'Ash', 'Blood'];
  const suffixes = ['Walker', 'Blade', 'Fang', 'Heart', 'Wraith', 'Hunter', 'Seeker', 'Sage', 'Guard', 'Born'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  const num = Math.floor(Math.random() * 999);
  return `${prefix}${suffix}${num}`;
}

/**
 * Register a new agent via wallet entry.
 */
async function registerAgent(): Promise<Session> {
  if (!PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in .env — required for wallet-based registration');
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletAddress = account.address.toLowerCase();
  const agentName = generateAgentName();

  console.log(`Registering new agent "${agentName}" with wallet ${walletAddress}...`);

  // Pay entry fee (0.01 MON)
  console.log('Paying entry fee (0.01 MON)...');
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  try {
    const txHash = await walletClient.sendTransaction({
      to: TREASURY_ADDRESS as `0x${string}`,
      value: parseEther('0.01'),
    });
    console.log(`Entry fee paid: ${txHash}`);

    // Wait for transaction to propagate
    console.log('Waiting for transaction confirmation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (err: any) {
    console.error('Failed to pay entry fee:', err.message);
    throw new Error('Entry fee payment failed. Check your PRIVATE_KEY and MON balance.');
  }

  // Sign entry message
  const message = `Enter The Hollows as "${agentName}" on chain ${MONAD_CHAIN_ID}`;
  const signature = await account.signMessage({ message });

  // POST /enter-wallet
  const response = await fetch(`${API_URL}/enter-wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: agentName,
      walletAddress,
      signature,
    }),
  });

  const data = await response.json() as any;
  if (!response.ok || !data.apiKey) {
    throw new Error(`Registration failed: ${data.error || 'Unknown error'}`);
  }

  const session: Session = {
    agentName: data.agent.name,
    apiKey: data.apiKey,
    walletAddress,
  };

  saveSession(session);
  console.log(`Agent "${session.agentName}" registered successfully!`);
  return session;
}

/**
 * Format observation into a concise summary for Claude.
 */
function formatObservation(obs: Observation): string {
  const a = obs.agent;
  const z = obs.zone;
  const c = obs.combat;

  let text = `=== GAME STATE ===
Agent: ${a.name} (Level ${a.level}, XP ${a.xp})
HP: ${a.hp}/${a.maxHp} | ATK: ${a.atk} | DEF: ${a.def} | SPD: ${a.spd} | Luck: ${a.luck}
Gold: ${a.gold} | Corruption: ${a.corruption} | Dead: ${a.isDead}
Zone: ${z.name} (${z.id}) | Danger: ${z.dangerLevel}
Connected Zones: ${z.connectedZones.join(', ')}`;

  if (z.mobs.length > 0) {
    text += `\nMobs: ${z.mobs.map((m: any) => `${m.name} (HP:${m.hp} ATK:${m.atk} DEF:${m.def})`).join(', ')}`;
  }

  if (z.resources.length > 0) {
    text += `\nResources: ${z.resources.map((r: any) => `${r.name} (${r.gather_time_seconds}s)`).join(', ')}`;
  }

  if (z.nearbyPlayers.length > 0) {
    text += `\nNearby Players: ${z.nearbyPlayers.map((p: any) => `${p.name} (Lv${p.level})`).join(', ')}`;
  }

  if (obs.inventory.length > 0) {
    text += `\nInventory: ${obs.inventory.map((i: any) => `${i.name}${i.equipped ? ' [E]' : ''} x${i.quantity}`).join(', ')}`;
  }

  if (c.active) {
    text += `\n\n=== COMBAT (Round ${c.round}) ===`;
    text += `\nStatus: ${c.status} | Type: ${c.encounterType || 'mob'}`;
    if (c.enemy) {
      text += `\nEnemy: ${c.enemy.name} HP:${c.enemy.hp}/${c.enemy.maxHp} Element:${c.enemy.element} Archetype:${c.enemy.archetype}`;
      if (c.enemy.buffs?.length > 0) text += ` Buffs:[${c.enemy.buffs.map((b: any) => b.name).join(',')}]`;
      if (c.enemy.debuffs?.length > 0) text += ` Debuffs:[${c.enemy.debuffs.map((d: any) => d.name).join(',')}]`;
    }
    if (c.player) {
      text += `\nYou: HP:${c.player.hp}/${c.player.maxHp} Stamina:${c.player.stamina}/${c.player.maxStamina}`;
      if (c.player.buffs?.length > 0) text += ` Buffs:[${c.player.buffs.map((b: any) => b.name).join(',')}]`;
      if (c.player.debuffs?.length > 0) text += ` Debuffs:[${c.player.debuffs.map((d: any) => d.name).join(',')}]`;
      text += `\nAbilities: ${c.player.abilities.map((ab: any) => `${ab.name}(${ab.id}, stamina:${ab.staminaCost}, cd:${ab.cooldown}/${ab.maxCooldown})`).join(', ')}`;
    }
    if (c.deadlineAt) {
      const secsLeft = Math.max(0, Math.floor((c.deadlineAt - Date.now()) / 1000));
      text += `\nDeadline: ${secsLeft}s remaining`;
    }
  }

  if (obs.quests.length > 0) {
    const active = obs.quests.filter((q: any) => !q.claimed);
    if (active.length > 0) {
      text += `\n\nQuests:`;
      for (const q of active) {
        text += `\n- ${q.name}: ${q.description} (${q.progress}/${q.objective.amount}${q.completed ? ' COMPLETE - claim it!' : ''})`;
      }
    }
  }

  if (obs.world.worldBoss) {
    const wb = obs.world.worldBoss;
    text += `\n\nWorld Boss: ${wb.name} HP:${wb.hp}/${wb.maxHp} ${wb.isAlive ? 'ALIVE' : 'DEAD'}`;
  }

  text += `\n\nAvailable Actions: ${obs.availableActions.join(', ')}`;

  return text;
}

/**
 * Ask Claude to decide the next action given an observation.
 */
async function askClaude(
  observation: Observation,
  lastResult?: { success: boolean; message: string },
): Promise<{ toolName: string; input: any } | null> {
  const messages: Anthropic.Messages.MessageParam[] = [];

  let userContent = formatObservation(observation);
  if (lastResult) {
    userContent = `Last action result: [${lastResult.success ? 'SUCCESS' : 'FAILED'}] ${lastResult.message}\n\n${userContent}`;
  }

  messages.push({ role: 'user', content: userContent });

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages,
  });

  // Find tool use in response
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      return { toolName: block.name, input: block.input };
    }
  }

  // If Claude just returned text without using a tool, log it
  for (const block of response.content) {
    if (block.type === 'text' && block.text) {
      console.log(`[Claude says] ${block.text}`);
    }
  }

  return null;
}

/**
 * Convert Claude's tool call to a WebSocket message.
 */
function toolCallToMessage(toolName: string, input: any, combatId?: string): any {
  if (toolName === 'game_action') {
    // For attack/gather, the engine reads the mob/resource ID from params.target
    const params = input.params || {};
    if ((input.action === 'attack' || input.action === 'gather') && input.target && !params.target) {
      params.target = input.target;
    }
    return {
      type: 'action',
      id: `act_${Date.now()}`,
      action: input.action,
      target: input.target,
      params: Object.keys(params).length > 0 ? params : undefined,
    };
  }

  if (toolName === 'combat_action') {
    return {
      type: 'combat_action',
      id: `cbt_${Date.now()}`,
      combatId: combatId || '',
      stance: input.stance,
      action: {
        type: input.actionType,
        abilityId: input.abilityId,
      },
    };
  }

  return null;
}

/**
 * Main game loop running over WebSocket.
 */
function runGameLoop(session: Session): void {
  const wsUrl = API_URL.replace(/^http/, 'ws') + '?mode=agent';
  console.log(`Connecting to ${wsUrl}...`);

  const ws = new WebSocket(wsUrl);
  let latestObservation: Observation | null = null;
  let lastResult: { success: boolean; message: string } | undefined;
  let loopRunning = false;
  let loopTimer: NodeJS.Timeout | null = null;

  ws.on('open', () => {
    console.log('WebSocket connected. Authenticating...');
    reconnectAttempts = 0;
    ws.send(JSON.stringify({ type: 'auth', apiKey: session.apiKey }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'welcome':
          console.log(`Authenticated as ${msg.agentName} (ID: ${msg.agentId})`);
          break;

        case 'observation':
          latestObservation = msg as Observation;
          if (!loopRunning) {
            loopRunning = true;
            scheduleNextAction();
          }
          break;

        case 'action_result':
          lastResult = { success: msg.success, message: msg.message };
          if (msg.observation) {
            latestObservation = msg.observation as Observation;
          }
          const status = msg.success ? 'OK' : 'FAIL';
          console.log(`[${status}] ${msg.message}`);
          if (msg.data?.resolution) {
            console.log(`  Round: ${msg.data.resolution.narrative || ''}`);
          }
          scheduleNextAction();
          break;

        case 'error':
          console.error(`[Server Error] ${msg.error}`);
          // Continue the loop despite errors
          scheduleNextAction();
          break;

        default:
          console.log(`[Unknown message type: ${msg.type}]`);
          break;
      }
    } catch (err) {
      console.error('Failed to parse server message:', err);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`WebSocket closed: ${code} ${reason.toString()}`);
    loopRunning = false;
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    attemptReconnect(session);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });

  function scheduleNextAction(): void {
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = setTimeout(async () => {
      await executeNextAction();
    }, ACTION_DELAY);
  }

  async function executeNextAction(): Promise<void> {
    if (!latestObservation || ws.readyState !== WebSocket.OPEN) return;

    const obs = latestObservation;

    // Dead agent: nothing to do
    if (obs.agent.isDead) {
      console.log('Champion is dead. Permadeath is permanent. Exiting...');
      ws.close();
      process.exit(0);
    }

    try {
      const decision = await askClaude(obs, lastResult);
      lastResult = undefined;

      if (!decision) {
        console.log('[No tool call from Claude, retrying...]');
        scheduleNextAction();
        return;
      }

      console.log(`[Action] ${decision.toolName}: ${JSON.stringify(decision.input)}`);

      const combatId = obs.combat.active ? obs.combat.combatId : undefined;
      const wsMsg = toolCallToMessage(decision.toolName, decision.input, combatId);

      if (wsMsg) {
        ws.send(JSON.stringify(wsMsg));
        // Response will trigger scheduleNextAction via the message handler
      } else {
        console.log('[Invalid tool call, retrying...]');
        scheduleNextAction();
      }
    } catch (err: any) {
      console.error(`Error during action: ${err.message}`);
      scheduleNextAction();
    }
  }
}

/**
 * Attempt to reconnect with exponential backoff.
 */
function attemptReconnect(session: Session): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Exiting.`);
    process.exit(1);
  }

  reconnectAttempts++;
  const delay = Math.min(30000, BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1));
  console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

  setTimeout(() => {
    runGameLoop(session);
  }, delay);
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  console.log('=== The Hollows - Claude Agent ===');

  if (!ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not set in .env');
    process.exit(1);
  }

  anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Load or create session
  let session = loadSession();

  if (session) {
    console.log(`Loaded session for "${session.agentName}"`);
  } else {
    console.log('No saved session found. Registering new agent...');
    session = await registerAgent();
  }

  // Start game loop
  runGameLoop(session);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
