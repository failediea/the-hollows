import Phaser from 'phaser';
import { CombatScene } from './CombatScene';
import { ArenaScene } from './ArenaScene';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.CANVAS,
    parent,
    transparent: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    scene: [CombatScene],
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    audio: { noAudio: true },
  };
}

export function createRealtimeGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.CANVAS,
    parent,
    transparent: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    scene: [ArenaScene],
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    audio: { noAudio: true },
  };
}
