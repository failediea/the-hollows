import type { Stance, ElementType, EnemyArchetype, Rewards } from './types';

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
  arena: ArenaData | null;
  events: RealtimeEvent[];
  rewards: Rewards | null;
  tick: number;
  zone: string;
}

function createRealtimeStore() {
  let state = $state<RealtimeState>({
    connected: false,
    sessionId: '',
    status: 'connecting',
    player: null,
    enemies: [],
    resources: [],
    arena: null,
    events: [],
    rewards: null,
    tick: 0,
    zone: '',
  });

  let ws: WebSocket | null = null;
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
  }) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: input }));
    }
  }

  function consumeEvents(): RealtimeEvent[] {
    const events = [...state.events];
    state.events = [];
    return events;
  }

  function disconnect() {
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
    sendInput,
    consumeEvents,
    disconnect,
    closeCombat,
  };
}

export const realtimeStore = createRealtimeStore();
