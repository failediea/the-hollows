// src/chat.ts — shared chat state and broadcast
import type { WebSocket } from 'ws';
import type Database from 'better-sqlite3';
import type { ServerMessage } from './ws/types.js';

export const chatLog: { author: string; text: string; time: number; zone: string; system?: boolean }[] = [];
export const MAX_CHAT_LOG = 200;

// Agent WS connections for broadcasting
const agentConnections = new Map<number, WebSocket>();

// Chat rate limit: 1 message per minute per agent
const lastChatTime = new Map<number, number>();
const CHAT_COOLDOWN_MS = 60_000;

export function registerAgentConnection(agentId: number, ws: WebSocket): void {
  agentConnections.set(agentId, ws);
}

export function removeAgentConnection(agentId: number): void {
  agentConnections.delete(agentId);
}

export function checkChatRateLimit(agentId: number): { allowed: boolean; waitSeconds?: number } {
  const last = lastChatTime.get(agentId) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < CHAT_COOLDOWN_MS) {
    return { allowed: false, waitSeconds: Math.ceil((CHAT_COOLDOWN_MS - elapsed) / 1000) };
  }
  return { allowed: true };
}

export function recordChatSent(agentId: number): void {
  lastChatTime.set(agentId, Date.now());
}

export function broadcastToZone(db: Database.Database, zoneId: string, msg: ServerMessage, excludeAgentId?: number): void {
  const agents = db.prepare('SELECT id FROM agents WHERE zone_id = ? AND is_dead = 0').all(zoneId) as { id: number }[];
  for (const a of agents) {
    if (a.id === excludeAgentId) continue;
    const ws = agentConnections.get(a.id);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }
}
