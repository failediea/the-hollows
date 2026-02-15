import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { RECIPES } from '../engine/items.js';
import { ZONES } from '../world/zones.js';
import { getApiKeyFromRequest } from '../utils/validation.js';

const TAX_RATE = 0.05; // 5% tax
const MAX_LISTINGS_PER_AGENT = 10;
const LISTING_EXPIRY_HOURS = 48;

// Build item → minLevel map from recipes + zone drops
// Zone danger level → approximate min player level
const ZONE_LEVEL_MAP: Record<number, number> = { 0: 1, 1: 1, 2: 3, 3: 6, 4: 10, 5: 13 };

function buildItemLevelMap(): Record<string, number> {
  const map: Record<string, number> = {};

  // From recipes
  for (const r of RECIPES) {
    map[r.code] = r.minLevel;
    // Also tag materials by their lowest recipe usage
    for (const mat of Object.keys(r.mats)) {
      if (!map[mat] || map[mat] > r.minLevel) map[mat] = r.minLevel;
    }
  }

  // From zone drops (mobs + resources)
  for (const zone of Object.values(ZONES)) {
    const zoneMinLevel = ZONE_LEVEL_MAP[zone.dangerLevel] || 1;
    // Resources
    for (const res of zone.resources || []) {
      if (!map[res.id] || map[res.id] > zoneMinLevel) map[res.id] = zoneMinLevel;
    }
    // Mob drops
    for (const mob of zone.mobs || []) {
      for (const drop of (mob as any).drop_table || []) {
        if (!map[drop.item]) map[drop.item] = zoneMinLevel;
        else if (map[drop.item] > zoneMinLevel) map[drop.item] = zoneMinLevel;
      }
    }
  }

  return map;
}

const ITEM_LEVEL_MAP = buildItemLevelMap();

function getItemMinLevel(itemCode: string): number {
  return ITEM_LEVEL_MAP[itemCode] || 1;
}

export function createMarketplaceRoutes(db: Database.Database) {
  const app = new Hono();

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL,
      seller_name TEXT NOT NULL,
      item_code TEXT NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      sold INTEGER NOT NULL DEFAULT 0,
      buyer_id INTEGER,
      buyer_name TEXT,
      sold_at INTEGER,
      cancelled INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(seller_id) REFERENCES agents(id)
    );
    CREATE INDEX IF NOT EXISTS idx_marketplace_active ON marketplace_listings(sold, cancelled, expires_at);
    CREATE INDEX IF NOT EXISTS idx_marketplace_seller ON marketplace_listings(seller_id);
  `);

  // GET /marketplace/listings — browse active listings (filtered by buyer level)
  app.get('/listings', (c) => {
    try {
      const apiKey = getApiKeyFromRequest(c);
      let buyerLevel = 1;
      if (apiKey) {
        const agent = db.prepare('SELECT level FROM agents WHERE api_key = ?').get(apiKey) as any;
        if (agent) buyerLevel = agent.level;
      }

      const now = Date.now();
      const listings = db.prepare(`
        SELECT id, seller_name, item_code, item_name, quantity, price, created_at, expires_at
        FROM marketplace_listings
        WHERE sold = 0 AND cancelled = 0 AND expires_at > ?
        ORDER BY created_at DESC
      `).all(now) as any[];

      // Filter by buyer level
      const filtered = listings.filter(l => getItemMinLevel(l.item_code) <= buyerLevel);

      return c.json({ success: true, listings: filtered, taxRate: TAX_RATE, buyerLevel });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // GET /marketplace/my — my listings
  app.get('/my', (c) => {
    const apiKey = getApiKeyFromRequest(c);
    if (!apiKey) return c.json({ error: 'Missing apiKey' }, 400);

    const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as any;
    if (!agent) return c.json({ error: 'Invalid apiKey' }, 401);

    const now = Date.now();
    const active = db.prepare(`
      SELECT id, item_code, item_name, quantity, price, created_at, expires_at
      FROM marketplace_listings
      WHERE seller_id = ? AND sold = 0 AND cancelled = 0 AND expires_at > ?
      ORDER BY created_at DESC
    `).all(agent.id, now) as any[];

    const sold = db.prepare(`
      SELECT id, item_code, item_name, quantity, price, buyer_name, sold_at
      FROM marketplace_listings
      WHERE seller_id = ? AND sold = 1
      ORDER BY sold_at DESC LIMIT 20
    `).all(agent.id) as any[];

    return c.json({ success: true, active, sold });
  });

  // POST /marketplace/list — create a listing
  app.post('/list', async (c) => {
    try {
      const body = await c.req.json();
      const { itemCode, quantity, price } = body;
      const apiKey = getApiKeyFromRequest(c, body);

      if (!apiKey || !itemCode || !quantity || !price) {
        return c.json({ error: 'Missing required fields' }, 400);
      }

      const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as any;
      if (!agent) return c.json({ error: 'Invalid apiKey' }, 401);
      if (agent.is_dead) return c.json({ error: 'Dead agents cannot trade' }, 400);

      const qty = Math.floor(quantity);
      const cost = Math.floor(price);
      if (qty < 1) return c.json({ error: 'Quantity must be at least 1' }, 400);
      if (cost < 1) return c.json({ error: 'Price must be at least 1 gold' }, 400);

      // Check listing limit
      const now = Date.now();
      const activeCount = db.prepare(`
        SELECT COUNT(*) as c FROM marketplace_listings
        WHERE seller_id = ? AND sold = 0 AND cancelled = 0 AND expires_at > ?
      `).get(agent.id, now) as any;
      if (activeCount.c >= MAX_LISTINGS_PER_AGENT) {
        return c.json({ error: `Max ${MAX_LISTINGS_PER_AGENT} active listings` }, 400);
      }

      // Check inventory
      const inv = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?').get(agent.id, itemCode) as any;
      if (!inv || inv.quantity < qty) {
        return c.json({ error: 'Not enough items in inventory' }, 400);
      }

      // Check not equipped
      if (inv.equipped) {
        return c.json({ error: 'Unequip item before listing' }, 400);
      }

      // Get item info
      const item = db.prepare('SELECT * FROM items WHERE code = ?').get(itemCode) as any;
      if (!item) return c.json({ error: 'Unknown item' }, 400);

      // Remove from inventory
      const newQty = inv.quantity - qty;
      if (newQty <= 0) {
        db.prepare('DELETE FROM inventory WHERE id = ?').run(inv.id);
      } else {
        db.prepare('UPDATE inventory SET quantity = ? WHERE id = ?').run(newQty, inv.id);
      }

      // Create listing
      const expiresAt = now + LISTING_EXPIRY_HOURS * 60 * 60 * 1000;
      const result = db.prepare(`
        INSERT INTO marketplace_listings (seller_id, seller_name, item_code, item_name, quantity, price, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(agent.id, agent.name, itemCode, item.name, qty, cost, now, expiresAt);

      // Activity log
      db.prepare('INSERT INTO activity_log (event_type, agent_name, message, created_at) VALUES (?, ?, ?, ?)').run(
        'marketplace', agent.name, `listed ${qty}x ${item.name} for ${cost}g`, now
      );

      return c.json({
        success: true,
        message: `Listed ${qty}x ${item.name} for ${cost}g`,
        listingId: result.lastInsertRowid,
      });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // POST /marketplace/buy — buy a listing
  app.post('/buy', async (c) => {
    try {
      const body = await c.req.json();
      const { listingId } = body;
      const apiKey = getApiKeyFromRequest(c, body);

      if (!apiKey || !listingId) return c.json({ error: 'Missing required fields' }, 400);

      const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as any;
      if (!agent) return c.json({ error: 'Invalid apiKey' }, 401);
      if (agent.is_dead) return c.json({ error: 'Dead agents cannot trade' }, 400);

      const now = Date.now();
      const listing = db.prepare(`
        SELECT * FROM marketplace_listings
        WHERE id = ? AND sold = 0 AND cancelled = 0 AND expires_at > ?
      `).get(listingId, now) as any;

      if (!listing) return c.json({ error: 'Listing not found or expired' }, 400);
      if (listing.seller_id === agent.id) return c.json({ error: "Can't buy your own listing" }, 400);

      // Level check
      const itemMinLevel = getItemMinLevel(listing.item_code);
      if (agent.level < itemMinLevel) {
        return c.json({ error: `You need to be level ${itemMinLevel} to buy this item` }, 400);
      }

      if (agent.gold < listing.price) return c.json({ error: `Not enough gold (need ${listing.price}g)` }, 400);

      // Calculate tax
      const tax = Math.floor(listing.price * TAX_RATE);
      const sellerReceives = listing.price - tax;

      // Transaction in a single write
      const txn = db.transaction(() => {
        // Deduct gold from buyer
        db.prepare('UPDATE agents SET gold = gold - ? WHERE id = ?').run(listing.price, agent.id);

        // Give gold to seller (minus tax)
        db.prepare('UPDATE agents SET gold = gold + ? WHERE id = ?').run(sellerReceives, listing.seller_id);

        // Give item to buyer
        const existingInv = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?').get(agent.id, listing.item_code) as any;
        if (existingInv) {
          db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(listing.quantity, existingInv.id);
        } else {
          db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, equipped, acquired_at) VALUES (?, ?, ?, 0, ?)').run(
            agent.id, listing.item_code, listing.quantity, now
          );
        }

        // Mark listing as sold
        db.prepare('UPDATE marketplace_listings SET sold = 1, buyer_id = ?, buyer_name = ?, sold_at = ? WHERE id = ?').run(
          agent.id, agent.name, now, listing.id
        );

        // Record transaction
        db.prepare('INSERT INTO transactions (from_agent_id, to_agent_id, transaction_type, item_code, quantity, gold_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          agent.id, listing.seller_id, 'marketplace', listing.item_code, listing.quantity, listing.price, now
        );

        // Activity log
        db.prepare('INSERT INTO activity_log (event_type, agent_name, message, created_at) VALUES (?, ?, ?, ?)').run(
          'marketplace', agent.name, `bought ${listing.quantity}x ${listing.item_name} from ${listing.seller_name} for ${listing.price}g`, now
        );
      });

      txn();

      return c.json({
        success: true,
        message: `Bought ${listing.quantity}x ${listing.item_name} for ${listing.price}g (${tax}g tax)`,
        goldSpent: listing.price,
        tax,
      });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // POST /marketplace/cancel — cancel your listing
  app.post('/cancel', async (c) => {
    try {
      const body = await c.req.json();
      const { listingId } = body;
      const apiKey = getApiKeyFromRequest(c, body);

      if (!apiKey || !listingId) return c.json({ error: 'Missing required fields' }, 400);

      const agent = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as any;
      if (!agent) return c.json({ error: 'Invalid apiKey' }, 401);

      const listing = db.prepare('SELECT * FROM marketplace_listings WHERE id = ? AND seller_id = ? AND sold = 0 AND cancelled = 0').get(listingId, agent.id) as any;
      if (!listing) return c.json({ error: 'Listing not found' }, 400);

      const now = Date.now();

      // Return items to seller
      const existingInv = db.prepare('SELECT * FROM inventory WHERE agent_id = ? AND item_code = ?').get(agent.id, listing.item_code) as any;
      if (existingInv) {
        db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(listing.quantity, existingInv.id);
      } else {
        db.prepare('INSERT INTO inventory (agent_id, item_code, quantity, equipped, acquired_at) VALUES (?, ?, ?, 0, ?)').run(
          agent.id, listing.item_code, listing.quantity, now
        );
      }

      // Mark cancelled
      db.prepare('UPDATE marketplace_listings SET cancelled = 1 WHERE id = ?').run(listing.id);

      return c.json({ success: true, message: `Cancelled listing for ${listing.quantity}x ${listing.item_name}` });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // GET /marketplace/history — recent sales (public)
  app.get('/history', (c) => {
    const sales = db.prepare(`
      SELECT item_name, item_code, quantity, price, seller_name, buyer_name, sold_at
      FROM marketplace_listings
      WHERE sold = 1
      ORDER BY sold_at DESC LIMIT 20
    `).all() as any[];

    return c.json({ success: true, sales });
  });

  return app;
}
