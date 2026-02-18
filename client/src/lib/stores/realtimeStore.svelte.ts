import type { Stance, ElementType, EnemyArchetype, Rewards, PlayerClass, GroundLootItem } from './types';

export interface RealtimePlayerState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  stance: Stance;
  facing: 'up' | 'down' | 'left' | 'right';
  buffs: any[];
  debuffs: any[];
  attackCooldown: number;
  playerClass?: PlayerClass;
  abilityCooldowns?: Record<string, number>;
  dashCooldown?: number;
  stanceCooldown?: number;
}

export interface RealtimeProjectile {
  id: string;
  x: number;
  y: number;
  element: ElementType;
  visual: string;
  size?: number;
}

export interface RealtimeEnemyState {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  archetype: EnemyArchetype;
  element: ElementType;
  stance: Stance;
  aiState: string;
  facing: 'up' | 'down' | 'left' | 'right';
}

export interface RealtimeResourceState {
  id: string;
  resourceId: string;
  name: string;
  x: number;
  y: number;
  rarity: string;
  gatherTime: number;
  isGathered: boolean;
  gatheringBy: string | null;
  gatherProgress: number;
}

export interface RealtimeEvent {
  type: 'damage' | 'death' | 'dodge' | 'crit' | 'block' | 'effect' | 'heal' | 'gather' | 'gather_start' | 'gather_cancel' | 'kill_reward' | 'loot_drop' | 'loot_pickup' | 'level_up';
  targetId?: string;
  sourceId?: string;
  value?: number;
  x?: number;
  y?: number;
  text?: string;
  xp?: number;
  gold?: number;
  itemName?: string;
  rarity?: string;
  newLevel?: number;
  element?: ElementType;
  itemCode?: string;
}

export interface ArenaData {
  width: number;
  height: number;
  walls: { x: number; y: number; w: number; h: number }[];
  exitPosition?: { x: number; y: number };
}

export type RealtimeStatus = 'connecting' | 'active' | 'victory' | 'defeat' | 'disconnected';

// Event types that go to the UI overlay (non-destructive, separate from 3D scene events)
const UI_EVENT_TYPES: Set<string> = new Set(['kill_reward', 'loot_drop', 'loot_pickup', 'level_up']);

interface RealtimeState {
  connected: boolean;
  sessionId: string;
  status: RealtimeStatus;
  player: RealtimePlayerState | null;
  enemies: RealtimeEnemyState[];
  resources: RealtimeResourceState[];
  projectiles: RealtimeProjectile[];
  arena: ArenaData | null;
  events: RealtimeEvent[];
  uiEvents: RealtimeEvent[];
  rewards: Rewards | null;
  tick: number;
  zone: string;
  playerClass: PlayerClass | null;
  groundLoot: GroundLootItem[];
  playerLevel: number;
  playerXp: number;
  playerXpToNext: number;
  targetEnemyId: string | null;
  fowGrid: Uint8Array | null;
  fowGridW: number;
}

function createRealtimeStore() {
  let state = $state<RealtimeState>({
    connected: false,
    sessionId: '',
    status: 'connecting',
    player: null,
    enemies: [],
    resources: [],
    projectiles: [],
    arena: null,
    events: [],
    uiEvents: [],
    rewards: null,
    tick: 0,
    zone: '',
    playerClass: null,
    groundLoot: [],
    playerLevel: 1,
    playerXp: 0,
    playerXpToNext: 110,
    targetEnemyId: null,
    fowGrid: null,
    fowGridW: 0,
  });

  let ws: WebSocket | null = null;
  let demoSession: any = null;
  let subscribers: Array<(state: RealtimeState) => void> = [];

  function notifySubscribers() {
    for (const cb of subscribers) cb(state);
  }

  function subscribe(cb: (s: RealtimeState) => void) {
    subscribers.push(cb);
    cb(state);
    return () => {
      subscribers = subscribers.filter(s => s !== cb);
    };
  }

  function connect(sessionId: string, apiKey: string) {
    state.sessionId = sessionId;
    state.status = 'connecting';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/realtime-combat?sessionId=${sessionId}&apiKey=${apiKey}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      state.connected = true;
      state.status = 'active';
      notifySubscribers();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onclose = () => {
      state.connected = false;
      if (state.status === 'active') {
        state.status = 'disconnected';
      }
      notifySubscribers();
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  function handleMessage(msg: any) {
    switch (msg.type) {
      case 'state':
        state.player = msg.data.player;
        state.enemies = msg.data.enemies;
        if (msg.data.resources) state.resources = msg.data.resources;
        if (msg.data.projectiles) state.projectiles = msg.data.projectiles;
        if (msg.data.arena) state.arena = msg.data.arena;
        if (msg.data.zone) state.zone = msg.data.zone;
        if (msg.data.groundLoot) state.groundLoot = msg.data.groundLoot;
        if (msg.data.playerLevel !== undefined) state.playerLevel = msg.data.playerLevel;
        if (msg.data.playerXp !== undefined) state.playerXp = msg.data.playerXp;
        if (msg.data.playerXpToNext !== undefined) state.playerXpToNext = msg.data.playerXpToNext;
        state.tick = msg.data.tick;
        break;
      case 'event': {
        const event: RealtimeEvent = { type: msg.event, ...msg.data };
        state.events = [...state.events, event];
        if (UI_EVENT_TYPES.has(event.type)) {
          state.uiEvents = [...state.uiEvents, event];
        }
        break;
      }
      case 'end':
        state.status = msg.data.result === 'victory' ? 'victory' : 'defeat';
        state.rewards = msg.data.rewards || null;
        break;
      case 'pong':
        break;
    }
    notifySubscribers();
  }

  function sendInput(input: {
    moveX: number;
    moveY: number;
    attacking: boolean;
    abilitySlot: number | null;
    stanceChange: Stance | null;
    gather?: boolean;
    targetId?: string;
    dash?: boolean;
  }) {
    if (demoSession) {
      demoSession.receiveInput(input);
      return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: input }));
    }
  }

  function consumeEvents(): RealtimeEvent[] {
    const events = [...state.events];
    state.events = [];
    return events;
  }

  function consumeUiEvents(): RealtimeEvent[] {
    const events = [...state.uiEvents];
    state.uiEvents = [];
    return events;
  }

  async function connectDemo(zone = 'tomb_halls', playerClass?: PlayerClass, customArena?: {
    arena: ArenaData;
    spawnPosition: { x: number; y: number };
    enemies?: Array<{ name: string; archetype: string; element: string; x: number; y: number }>;
    resources?: Array<{ resourceId: string; name: string; rarity: string; x: number; y: number }>;
  }) {
    state.sessionId = 'demo';
    state.status = 'connecting';
    if (playerClass) state.playerClass = playerClass;

    const { DemoSession } = await import('../three/DemoSession');

    demoSession = new DemoSession({
      onStateUpdate: (data: any) => {
        state.player = data.player;
        state.enemies = data.enemies;
        state.resources = data.resources;
        if (data.projectiles) state.projectiles = data.projectiles;
        if (data.arena) state.arena = data.arena;
        if (data.zone) state.zone = data.zone;
        state.groundLoot = data.groundLoot || [];
        if (data.playerLevel !== undefined) state.playerLevel = data.playerLevel;
        if (data.playerXp !== undefined) state.playerXp = data.playerXp;
        if (data.playerXpToNext !== undefined) state.playerXpToNext = data.playerXpToNext;
        state.tick = data.tick;
        notifySubscribers();
      },
      onEvent: (event: RealtimeEvent) => {
        state.events = [...state.events, event];
        if (UI_EVENT_TYPES.has(event.type)) {
          state.uiEvents = [...state.uiEvents, event];
        }
        notifySubscribers();
      },
      onEnd: (result: 'victory' | 'defeat', rewards?: Rewards) => {
        state.status = result;
        if (rewards) state.rewards = rewards;
        notifySubscribers();
      },
    }, zone, playerClass, customArena);

    state.connected = true;
    state.status = 'active';
    notifySubscribers();

    demoSession.start();
  }

  function disconnect() {
    if (demoSession) {
      demoSession.stop();
      demoSession = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    state.connected = false;
  }

  function closeCombat() {
    disconnect();
    window.parent.postMessage({
      type: 'combatComplete',
      combatId: state.sessionId,
      status: state.status,
    }, '*');
  }

  function setTargetEnemyId(id: string | null) {
    state.targetEnemyId = id;
  }

  function setFowGrid(grid: Uint8Array | null, gridW: number) {
    state.fowGrid = grid;
    state.fowGridW = gridW;
  }

  function sendEquipBonuses(bonuses: { atk: number; def: number; hp: number }) {
    if (demoSession && demoSession.setEquipBonuses) {
      demoSession.setEquipBonuses(bonuses);
    }
  }

  return {
    get state() { return state; },
    subscribe,
    connect,
    connectDemo,
    sendInput,
    consumeEvents,
    consumeUiEvents,
    disconnect,
    closeCombat,
    setTargetEnemyId,
    setFowGrid,
    sendEquipBonuses,
  };
}

export const realtimeStore = createRealtimeStore();
