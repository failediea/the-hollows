import { getCombatState, submitAction, setApiKey } from '../api/combatApi';
import type { CombatState, Stance, CombatAction, LogEntry } from './types';

function createCombatStore() {
  let state = $state<CombatState>({
    combatId: '',
    zone: '',
    encounterType: 'mob',
    status: 'loading',
    round: 1,
    enemy: { name: '', hp: 0, maxHp: 0, element: 'none', archetype: 'brute', buffs: [], debuffs: [] },
    player: { hp: 0, maxHp: 0, stamina: 0, maxStamina: 0, element: 'none', abilities: [], buffs: [], debuffs: [] },
    selectedStance: null,
    selectedAction: null,
    lastResolution: null,
    log: [],
    rewards: null,
    timer: 15,
    deadlineAt: 0,
  });

  let timerInterval: ReturnType<typeof setInterval> | null = null;

  // Subscribe callbacks for Phaser
  let subscribers: Array<(state: CombatState) => void> = [];

  function notifySubscribers() {
    for (const cb of subscribers) {
      cb(state);
    }
  }

  function subscribe(cb: (state: CombatState) => void) {
    subscribers.push(cb);
    cb(state); // immediate call with current state
    return () => {
      subscribers = subscribers.filter(s => s !== cb);
    };
  }

  async function initCombat(combatId: string, zone: string, apiKey: string, encounterType: string) {
    setApiKey(apiKey);
    state.combatId = combatId;
    state.zone = zone;
    state.encounterType = encounterType as any;
    state.status = 'loading';

    try {
      const data = await getCombatState(combatId);
      state.round = data.round;
      state.status = data.status === 'awaiting_input' ? 'awaiting_input' : data.status;
      state.enemy = {
        name: data.enemy.name,
        hp: data.enemy.hp,
        maxHp: data.enemy.maxHp,
        element: data.enemy.element,
        archetype: data.enemy.archetype,
        buffs: data.enemy.buffs || [],
        debuffs: data.enemy.debuffs || [],
      };
      state.player = {
        hp: data.agent.hp,
        maxHp: data.agent.maxHp,
        stamina: data.agent.stamina,
        maxStamina: data.agent.maxStamina,
        element: data.agent.element || 'none',
        abilities: data.agent.abilities || [],
        buffs: data.agent.buffs || [],
        debuffs: data.agent.debuffs || [],
      };
      state.deadlineAt = data.deadlineAt;
      state.timer = data.secondsRemaining;
      startTimer();
      notifySubscribers();
    } catch (err) {
      console.error('Failed to init combat:', err);
    }
  }

  function selectStance(stance: Stance) {
    if (state.status !== 'awaiting_input') return;
    state.selectedStance = stance;
    notifySubscribers();
  }

  function selectAction(action: CombatAction) {
    if (state.status !== 'awaiting_input') return;
    state.selectedAction = action;
    notifySubscribers();
  }

  async function confirmAction() {
    if (state.status !== 'awaiting_input') return;
    if (!state.selectedStance || !state.selectedAction) return;

    state.status = 'resolving';
    stopTimer();
    notifySubscribers();

    try {
      const data = await submitAction(state.combatId, state.selectedStance, state.selectedAction);

      // Update state from response
      state.round = data.round;
      state.enemy = {
        name: data.state.enemy.name,
        hp: data.state.enemy.hp,
        maxHp: data.state.enemy.maxHp,
        element: data.state.enemy.element,
        archetype: data.state.enemy.archetype,
        buffs: data.state.enemy.buffs || [],
        debuffs: data.state.enemy.debuffs || [],
      };
      state.player = {
        ...state.player,
        hp: data.state.player.hp,
        maxHp: data.state.player.maxHp,
        stamina: data.state.player.stamina,
        maxStamina: data.state.player.maxStamina,
        buffs: data.state.player.buffs || [],
        debuffs: data.state.player.debuffs || [],
      };

      // Update ability cooldowns
      if (data.state.abilities) {
        state.player.abilities = state.player.abilities.map(a => {
          const updated = data.state.abilities.find((u: any) => u.id === a.id);
          return updated ? { ...a, cooldown: updated.cooldown } : a;
        });
      }

      // Store resolution for Phaser animation
      state.lastResolution = data.resolution;

      // Add to log
      const logEntry: LogEntry = {
        round: data.resolution.round || state.round - 1,
        narrative: data.resolution.narrative,
        events: data.resolution.events,
        playerDamageDealt: data.resolution.playerDamageDealt,
        playerDamageTaken: data.resolution.playerDamageTaken,
      };
      state.log = [...state.log, logEntry];

      // Handle combat end or continue
      if (data.status === 'victory' || data.status === 'defeat' || data.status === 'fled') {
        // Merge root-level reward fields into rewards object (server sends them separately)
        const rewards = data.rewards ? { ...data.rewards } : null;
        if (rewards) {
          if (data.gateUnlocked) rewards.gateUnlocked = data.gateUnlocked;
          if (data.newZone) rewards.newZone = data.newZone;
          if (data.gateMessage) rewards.gateMessage = data.gateMessage;
          if (data.questCompleted) rewards.questCompleted = data.questCompleted;
          if (data.lootRoll) rewards.lootRoll = data.lootRoll;
          if (data.partyRewards) rewards.partyRewards = data.partyRewards;
        }
        state.rewards = rewards;
        // Set to 'animating' first so Phaser plays the final animation
        state.status = 'animating';
        notifySubscribers();
        // The final status will be set in onAnimationComplete
      } else {
        state.status = 'animating';
        state.deadlineAt = data.deadlineAt;
        notifySubscribers();
      }
    } catch (err) {
      console.error('Failed to submit action:', err);
      state.status = 'awaiting_input';
      notifySubscribers();
    }
  }

  // Called by Phaser when animation completes
  function onAnimationComplete() {
    // Check if combat ended
    if (state.rewards) {
      // Combat is over, show victory/defeat
      const isVictory = state.enemy.hp <= 0;
      state.status = isVictory ? 'victory' : (state.player.hp <= 0 ? 'defeat' : 'fled');
    } else {
      // Next round — keep stance, reset action
      state.status = 'awaiting_input';
      state.selectedAction = null;
      state.lastResolution = null;
      state.timer = 15;
      startTimer();
    }
    notifySubscribers();
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((state.deadlineAt - now) / 1000));
      state.timer = remaining;

      if (remaining <= 0 && state.status === 'awaiting_input') {
        // Auto-submit on timeout: defensive + basic_attack
        state.selectedStance = state.selectedStance || 'defensive';
        state.selectedAction = state.selectedAction || { type: 'basic_attack' };
        confirmAction();
      }
      notifySubscribers();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function closeCombat() {
    stopTimer();
    // PostMessage to parent window (play.js iframe host)
    window.parent.postMessage({ type: 'combatComplete', combatId: state.combatId, status: state.status }, '*');
  }

  // Getter for current state (for Phaser and components)
  function getState(): CombatState {
    return state;
  }

  return {
    get state() { return state; },
    subscribe,
    initCombat,
    selectStance,
    selectAction,
    confirmAction,
    onAnimationComplete,
    closeCombat,
    getState,
  };
}

export const combatStore = createCombatStore();
