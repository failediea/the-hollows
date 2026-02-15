import Phaser from 'phaser';
import type { ElementType } from '../../stores/types';
import { ELEMENT_COLORS } from '../assetMaps';

export function createHitParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  element: ElementType
) {
  const colors = ELEMENT_COLORS[element];

  // Create a simple white circle texture if it doesn't exist
  if (!scene.textures.exists('particle')) {
    const graphics = scene.add.graphics();
    graphics.fillStyle(0xffffff);
    graphics.fillCircle(8, 8, 8);
    graphics.generateTexture('particle', 16, 16);
    graphics.destroy();
  }

  const configs: Record<ElementType, Phaser.Types.GameObjects.Particles.ParticleEmitterConfig> = {
    fire: {
      x, y,
      speed: { min: 50, max: 150 },
      angle: { min: 230, max: 310 },
      scale: { start: 0.6, end: 0 },
      lifespan: 800,
      quantity: 20,
      tint: [colors.primary, colors.secondary],
      gravityY: -100,
      emitting: false,
    },
    ice: {
      x, y,
      speed: { min: 30, max: 100 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.4, end: 0 },
      lifespan: 1200,
      quantity: 15,
      tint: [colors.primary, colors.secondary],
      gravityY: 50,
      emitting: false,
    },
    shadow: {
      x, y,
      speed: { min: 20, max: 80 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      lifespan: 1000,
      quantity: 10,
      tint: [colors.primary, colors.secondary],
      gravityY: 0,
      emitting: false,
    },
    holy: {
      x, y,
      speed: { min: 40, max: 120 },
      angle: { min: 240, max: 300 },
      scale: { start: 0.5, end: 0 },
      lifespan: 1000,
      quantity: 15,
      tint: [colors.primary, colors.secondary],
      gravityY: -80,
      emitting: false,
    },
    none: {
      x, y,
      speed: { min: 60, max: 160 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.3, end: 0 },
      lifespan: 400,
      quantity: 12,
      tint: [colors.primary, colors.secondary],
      emitting: false,
    },
  };

  const emitter = scene.add.particles(0, 0, 'particle', configs[element]);
  emitter.explode(configs[element].quantity as number || 15, x, y);

  // Auto-cleanup
  scene.time.delayedCall(2000, () => emitter.destroy());
}

export function createDeathParticles(scene: Phaser.Scene, x: number, y: number) {
  if (!scene.textures.exists('particle')) {
    const graphics = scene.add.graphics();
    graphics.fillStyle(0xffffff);
    graphics.fillCircle(8, 8, 8);
    graphics.generateTexture('particle', 16, 16);
    graphics.destroy();
  }

  const emitter = scene.add.particles(0, 0, 'particle', {
    x, y,
    speed: { min: 50, max: 200 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.8, end: 0 },
    lifespan: 1500,
    quantity: 30,
    tint: [0xff3333, 0x880000],
    emitting: false,
  });
  emitter.explode(30, x, y);
  scene.time.delayedCall(2000, () => emitter.destroy());
}

export function createVictoryParticles(scene: Phaser.Scene) {
  if (!scene.textures.exists('particle')) {
    const graphics = scene.add.graphics();
    graphics.fillStyle(0xffffff);
    graphics.fillCircle(8, 8, 8);
    graphics.generateTexture('particle', 16, 16);
    graphics.destroy();
  }

  const w = scene.scale.width;
  const emitter = scene.add.particles(0, 0, 'particle', {
    x: { min: 0, max: w },
    y: -20,
    speed: { min: 30, max: 80 },
    angle: { min: 80, max: 100 },
    scale: { start: 0.5, end: 0.1 },
    lifespan: 4000,
    quantity: 2,
    frequency: 100,
    tint: [0xffd700, 0xff6b35, 0xffffff],
    gravityY: 50,
  });

  scene.time.delayedCall(5000, () => emitter.destroy());
}
