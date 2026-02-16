import type { Stance, ElementType, EnemyArchetype, Rewards, PlayerClass } from './types';

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
  type: 'damage' | 'death' | 'dodge' | 'crit' | 'block' | 'effect' | 'heal' | 'gather' | 'gather_start' | 'gather_cancel';
  targetId?: string;
  sourceId?: string;
  value?: number;
  x?: number;
  y?: number;
  text?: string;
}

export interface ArenaData {
  width: number;
  height: number;
  walls: { x: number; y: number; w: number; h: number }[];
}

export type RealtimeStatus = 'connecting' | 'active' | 'victory' | 'defeat' | 'disconnected';

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
  rewards: Rewards | null;
  tick: number;
  zone: string;
  playerClass: PlayerClass | null;
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
    rewards: null,
    tick: 0,
    zone: '',
    playerClass: null,
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
        state.tick = msg.data.tick;
        break;
      case 'event':
        state.events = [...state.events, { type: msg.event, ...msg.data }];
        break;
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

  async function connectDemo(zone = 'tomb_halls', playerClass?: PlayerClass) {
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
        state.tick = data.tick;
        notifySubscribers();
      },
      onEvent: (event: any) => {
        state.events = [...state.events, event];
        notifySubscribers();
      },
      onEnd: (result: 'victory' | 'defeat') => {
        state.status = result;
        if (result === 'victory') {
          state.rewards = {
            xpGained: 150,
            goldGained: 45,
            itemsDropped: ['Tomb Shard'],
            xpCapped: false,
          };
        }
        notifySubscribers();
      },
    }, zone, playerClass);

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

  return {
    get state() { return state; },
    subscribe,
    connect,
    connectDemo,
    sendInput,
    consumeEvents,
    disconnect,
    closeCombat,
  };
}

export const realtimeStore = createRealtimeStore();
