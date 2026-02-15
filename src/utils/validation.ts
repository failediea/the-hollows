import Database from 'better-sqlite3';
import { Context } from 'hono';
import { createPublicClient, http, defineChain } from 'viem';
import { Agent } from '../db/schema.js';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://monad-testnet.drpc.org'] } },
});

const TREASURY_ADDRESS = '0x23d916bd5c4c5a88e2ee1ee124ca320902f79820' as const;

/**
 * Verify that the wallet has paid the on-chain entry fee.
 * Compares on-chain entry count with server-side agent count.
 */
export async function verifyEntryPayment(walletAddress: string, db: Database.Database): Promise<{ paid: boolean; error?: string }> {
  try {
    const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });
    const onChainEntries = await publicClient.readContract({
      address: TREASURY_ADDRESS,
      abi: [{
        name: 'getAgentEntries',
        type: 'function',
        inputs: [{ name: 'agent', type: 'address' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
      }],
      functionName: 'getAgentEntries',
      args: [walletAddress as `0x${string}`],
    });
    const serverCount = db.prepare('SELECT COUNT(*) as cnt FROM agents WHERE LOWER(wallet_address) = ?')
      .get(walletAddress.toLowerCase()) as { cnt: number };
    if (Number(onChainEntries) <= serverCount.cnt) {
      return { paid: false, error: 'Entry fee not paid on-chain. Pay 0.01 MON to the treasury contract first.' };
    }
    return { paid: true };
  } catch (error) {
    console.error('On-chain verification error:', error);
    // If on-chain check fails (RPC down), allow entry with warning
    return { paid: true };
  }
}

/**
 * Extract API key from request, trying multiple sources for backwards compatibility.
 * Preferred: Authorization: Bearer header
 */
export function getApiKeyFromRequest(c: Context, body?: any): string | null {
  // Try Authorization: Bearer header first (preferred)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  // Fallback: x-api-key header
  const xApiKey = c.req.header('x-api-key');
  if (xApiKey) return xApiKey;
  // Fallback: body.apiKey (for POST endpoints during migration)
  if (body?.apiKey) return body.apiKey;
  // Fallback: query param (for GET endpoints during migration)
  const queryKey = c.req.query('apiKey');
  if (queryKey) return queryKey;
  return null;
}

// Rate limiting constants
export const RATE_LIMIT_SECONDS = 2;
export const MAX_ENTRIES_PER_WALLET = 10;

// Validation constants
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 20;
export const NAME_REGEX = /^[a-zA-Z0-9 ]+$/;
export const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Allowed action types
export const ALLOWED_ACTIONS = [
  'move',
  'attack',
  'gather',
  'rest',
  'use_item',
  'craft',
  'buy',
  'sell',
  'trade',
  'solve_riddle',
  'create_guild',
  'join_guild',
  'leave_guild',
  'attack_ashborn',
  'learn_skill',
  'equip_item',
  'unequip_item',
  'accept_trade',
  'reject_trade',
  'cancel_trade',
  'claim_quest',
];

/**
 * Validate agent name
 */
export function validateName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Name is required' };
  }

  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `Name must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters` };
  }

  if (!NAME_REGEX.test(name)) {
    return { valid: false, error: 'Name must contain only letters, numbers, and spaces' };
  }

  return { valid: true };
}

/**
 * Validate wallet address
 */
export function validateWalletAddress(address: string): { valid: boolean; error?: string } {
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'Wallet address is required' };
  }

  if (!WALLET_REGEX.test(address)) {
    return { valid: false, error: 'Invalid wallet address format (must start with 0x and be 42 characters)' };
  }

  return { valid: true };
}

/**
 * Validate action type
 */
// Added claim_quest to allowed actions
export function validateAction(action: string): { valid: boolean; error?: string } {
  if (!action || typeof action !== 'string') {
    return { valid: false, error: 'Action is required' };
  }

  if (!ALLOWED_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action. Allowed: ${ALLOWED_ACTIONS.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Sanitize string input (basic XSS prevention)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, 200); // Max 200 chars for any string
}

/**
 * Check rate limit (max 1 action per 2 seconds)
 */
export function checkRateLimit(agent: Agent): { allowed: boolean; error?: string } {
  const now = Date.now();
  const timeSinceLastAction = now - agent.last_action_at;
  const cooldownMs = RATE_LIMIT_SECONDS * 1000;

  if (timeSinceLastAction < cooldownMs) {
    const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastAction) / 1000);
    return { 
      allowed: false, 
      error: `Rate limited. Please wait ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''} before your next action.` 
    };
  }

  return { allowed: true };
}

/**
 * Check max entries per wallet address
 */
export function checkMaxEntriesPerWallet(
  db: Database.Database, 
  walletAddress: string, 
  seasonId: number
): { allowed: boolean; error?: string } {
  const count = db.prepare(
    'SELECT COUNT(*) as count FROM agents WHERE wallet_address = ? AND season_id = ?'
  ).get(walletAddress, seasonId) as { count: number };

  if (count.count >= MAX_ENTRIES_PER_WALLET) {
    return { 
      allowed: false, 
      error: `Maximum ${MAX_ENTRIES_PER_WALLET} entries per wallet address reached for this season.` 
    };
  }

  return { allowed: true };
}

/**
 * Validate zone transition
 */
export function validateZoneId(zoneId: string): { valid: boolean; error?: string } {
  const validZones = [
    'the_gate',
    'tomb_halls',
    'the_mines',
    'the_web',
    'forge_of_ruin',
    'bone_throne',
    'abyss_bridge',
    'black_pit'
  ];

  if (!validZones.includes(zoneId)) {
    return { valid: false, error: 'Invalid zone ID' };
  }

  return { valid: true };
}
