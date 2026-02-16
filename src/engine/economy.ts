import Database from 'better-sqlite3';
import { Agent, Item } from '../db/schema.js';
import { canCarryItem } from './agent.js';

export interface ShopItem {
  code: string;
  basePrice: number;
  stock: number; // -1 for unlimited
}

export const SHOP_ITEMS: ShopItem[] = [
  { code: 'woodcutters_axe', basePrice: 15, stock: -1 },
  { code: 'pickaxe', basePrice: 20, stock: -1 },
  { code: 'herbalist_sickle', basePrice: 15, stock: -1 },
  { code: 'health_potion', basePrice: 10, stock: -1 },
  { code: 'greater_health_potion', basePrice: 30, stock: -1 },
  { code: 'greater_health_potion_2', basePrice: 50, stock: -1 },
  { code: 'speed_elixir', basePrice: 30, stock: -1 },
  { code: 'antidote', basePrice: 25, stock: -1 },

  { code: 'corruption_cleanse', basePrice: 100, stock: -1 },
  { code: 'leather_armor', basePrice: 50, stock: 5 },
  { code: 'rusty_sword', basePrice: 40, stock: 5 },
  { code: 'iron_sword', basePrice: 150, stock: 3 },
  { code: 'iron_plate', basePrice: 200, stock: 3 }
];

export function getShopPrice(basePrice: number, seasonProgress: number): number {
  // Prices increase as season progresses (0.0 to 1.0)
  // Max 50% price increase by end of season
  const multiplier = 1 + (seasonProgress * 0.5);
  return Math.floor(basePrice * multiplier);
}

export function buyFromShop(
  db: Database.Database,
  agentId: number,
  itemCode: string,
  quantity: number = 1
): { success: boolean; message: string; totalCost?: number } {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND is_dead = 0').get(agentId) as Agent | undefined;
  if (!agent) {
    return { success: false, message: 'Agent not found or is dead' };
  }

  const shopItem = SHOP_ITEMS.find(si => si.code === itemCode);
  if (!shopItem) {
    return { success: false, message: 'Item not available in shop' };
  }

  // Get current season progress
  const season = db.prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1')
    .get() as { start_time: number; end_time: number } | undefined;

  const seasonProgress = season 
    ? Math.min(1, (Date.now() - season.start_time) / (season.end_time - season.start_time))
    : 0;

  const unitPrice = getShopPrice(shopItem.basePrice, seasonProgress);
  const totalCost = unitPrice * quantity;

  if (agent.gold < totalCost) {
    return { success: false, message: `Insufficient gold. Need ${totalCost}, have ${agent.gold}` };
  }

  // Check inventory space
  const item = db.prepare('SELECT weight FROM items WHERE code = ?').get(itemCode) as { weight: number } | undefined;
  if (!item) {
    return { success: false, message: 'Item data not found' };
  }

  // Weight check
  if (!canCarryItem(db, agentId, itemCode, quantity)) {
    return { success: false, message: 'Cannot carry this item — inventory weight limit reached' };
  }

  // Deduct gold
  db.prepare('UPDATE agents SET gold = gold - ? WHERE id = ?').run(totalCost, agentId);

  // Add item to inventory
  const existing = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(agentId, itemCode) as { id: number } | undefined;

  if (existing) {
    db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(quantity, existing.id);
  } else {
    db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, equipped, acquired_at) VALUES (?, ?, ?, 0, ?)')
      .run(agentId, itemCode, quantity, Date.now());
  }

  // Record transaction
  db.prepare(`
    INSERT INTO transactions (from_agent_id, to_agent_id, transaction_type, item_code, quantity, gold_amount, created_at)
    VALUES (?, NULL, 'shop_buy', ?, ?, ?, ?)
  `).run(agentId, itemCode, quantity, totalCost, Date.now());

  // Update corruption (spending gold reduces it)
  updateCorruption(db, agentId);

  return { success: true, message: `Purchased ${quantity}x ${itemCode}`, totalCost };
}

export function sellToShop(
  db: Database.Database,
  agentId: number,
  itemCode: string,
  quantity: number = 1
): { success: boolean; message: string; goldEarned?: number } {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND is_dead = 0').get(agentId) as Agent | undefined;
  if (!agent) {
    return { success: false, message: 'Agent not found or is dead' };
  }

  const invItem = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(agentId, itemCode) as { id: number; quantity: number; equipped: boolean } | undefined;

  if (!invItem || invItem.quantity < quantity) {
    return { success: false, message: 'Insufficient quantity' };
  }

  if (invItem.equipped) {
    return { success: false, message: 'Cannot sell equipped items' };
  }

  const item = db.prepare('SELECT * FROM items WHERE code = ?').get(itemCode) as Item | undefined;
  if (!item) {
    return { success: false, message: 'Item not found' };
  }

  // Sell price is 10% of base shop price
  const baseShopItem = SHOP_ITEMS.find(si => si.code === itemCode);
  const basePrice = baseShopItem?.basePrice || calculateItemValue(item);
  const unitPrice = Math.floor(basePrice * 0.1);
  const goldEarned = unitPrice * quantity;

  // Remove items
  if (invItem.quantity === quantity) {
    db.prepare('DELETE FROM inventory WHERE id = ?').run(invItem.id);
  } else {
    db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(quantity, invItem.id);
  }

  // Add gold
  db.prepare('UPDATE agents SET gold = gold + ? WHERE id = ?').run(goldEarned, agentId);

  // Record transaction
  db.prepare(`
    INSERT INTO transactions (from_agent_id, to_agent_id, transaction_type, item_code, quantity, gold_amount, created_at)
    VALUES (?, NULL, 'shop_sell', ?, ?, ?, ?)
  `).run(agentId, itemCode, quantity, goldEarned, Date.now());

  // Update corruption (gaining gold increases it)
  updateCorruption(db, agentId);

  return { success: true, message: `Sold ${quantity}x ${itemCode}`, goldEarned };
}

function calculateItemValue(item: Item): number {
  // Calculate base value from item stats
  let value = 10; // Base value

  value += item.atk_bonus * 5;
  value += item.def_bonus * 5;
  value += item.hp_bonus;

  // Rarity multiplier
  const rarityMultipliers: Record<string, number> = {
    common: 1,
    uncommon: 2,
    rare: 4,
    legendary: 10,
    cursed: 5
  };

  value *= rarityMultipliers[item.rarity] || 1;

  return Math.max(1, value);
}

export function tradeWithAgent(
  db: Database.Database,
  fromAgentId: number,
  toAgentId: number,
  itemCode: string,
  quantity: number,
  goldAmount: number
): { success: boolean; message: string } {
  const fromAgent = db.prepare('SELECT * FROM agents WHERE id = ? AND is_dead = 0').get(fromAgentId) as Agent | undefined;
  const toAgent = db.prepare('SELECT * FROM agents WHERE id = ? AND is_dead = 0').get(toAgentId) as Agent | undefined;

  if (!fromAgent || !toAgent) {
    return { success: false, message: 'One or both agents not found or dead' };
  }

  // Must be in same zone
  if (fromAgent.zone_id !== toAgent.zone_id) {
    return { success: false, message: 'Agents must be in the same zone to trade' };
  }

  // Check if fromAgent has the item
  const invItem = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(fromAgentId, itemCode) as { id: number; quantity: number } | undefined;

  if (!invItem || invItem.quantity < quantity) {
    return { success: false, message: 'Insufficient item quantity' };
  }

  // Check if toAgent has the gold
  if (toAgent.gold < goldAmount) {
    return { success: false, message: 'Buyer has insufficient gold' };
  }

  // Transfer item
  if (invItem.quantity === quantity) {
    db.prepare('DELETE FROM inventory WHERE id = ?').run(invItem.id);
  } else {
    db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(quantity, invItem.id);
  }

  const toInv = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?')
    .get(toAgentId, itemCode) as { id: number } | undefined;

  if (toInv) {
    db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(quantity, toInv.id);
  } else {
    db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, equipped, acquired_at) VALUES (?, ?, ?, 0, ?)')
      .run(toAgentId, itemCode, quantity, Date.now());
  }

  // Transfer gold
  db.prepare('UPDATE agents SET gold = gold - ? WHERE id = ?').run(goldAmount, toAgentId);
  db.prepare('UPDATE agents SET gold = gold + ? WHERE id = ?').run(goldAmount, fromAgentId);

  // Record transaction
  db.prepare(`
    INSERT INTO transactions (from_agent_id, to_agent_id, transaction_type, item_code, quantity, gold_amount, created_at)
    VALUES (?, ?, 'trade', ?, ?, ?, ?)
  `).run(fromAgentId, toAgentId, itemCode, quantity, goldAmount, Date.now());

  // Update corruption for both
  updateCorruption(db, fromAgentId);
  updateCorruption(db, toAgentId);

  return { success: true, message: 'Trade completed' };
}

function updateCorruption(db: Database.Database, agentId: number): void {
  const agent = db.prepare('SELECT gold FROM agents WHERE id = ?').get(agentId) as { gold: number } | undefined;
  if (!agent) return;

  const goldCorruption = Math.floor(agent.gold / 100);
  db.prepare('UPDATE agents SET corruption = ? WHERE id = ?').run(goldCorruption, agentId);
}
