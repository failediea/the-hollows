import Phaser from 'phaser';
import type { Stance } from '../../stores/types';

const STANCE_FLASH_COLORS: Record<Stance, number> = {
  aggressive: 0xff3333,
  balanced: 0x4ade80,
  defensive: 0x3b82f6,
  evasive: 0x8b5cf6,
};

export function createSlashArc(
  scene: Phaser.Scene,
  x: number,
  y: number,
  facing: 'up' | 'down' | 'left' | 'right',
  color: number = 0xff6b35,
) {
  const arc = scene.add.graphics();
  arc.lineStyle(3, color, 0.9);

  let startAngle: number;
  let endAngle: number;
  let arcX = x;
  let arcY = y;

  switch (facing) {
    case 'right': startAngle = -0.6; endAngle = 0.6; arcX += 15; break;
    case 'left': startAngle = Math.PI - 0.6; endAngle = Math.PI + 0.6; arcX -= 15; break;
    case 'up': startAngle = -Math.PI / 2 - 0.6; endAngle = -Math.PI / 2 + 0.6; arcY -= 15; break;
    default: startAngle = Math.PI / 2 - 0.6; endAngle = Math.PI / 2 + 0.6; arcY += 15; break;
  }

  arc.beginPath();
  arc.arc(arcX, arcY, 30, startAngle, endAngle, false);
  arc.strokePath();
  arc.setDepth(45);

  scene.tweens.add({
    targets: arc,
    alpha: 0,
    duration: 250,
    onComplete: () => arc.destroy(),
  });
}

export function createMoveTrail(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number = 0x666666,
) {
  if (!scene.textures.exists('particle')) {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff);
    g.fillCircle(4, 4, 4);
    g.generateTexture('particle', 8, 8);
    g.destroy();
  }

  const emitter = scene.add.particles(0, 0, 'particle', {
    x,
    y,
    speed: { min: 5, max: 15 },
    scale: { start: 0.2, end: 0 },
    alpha: { start: 0.3, end: 0 },
    lifespan: 300,
    tint: [color],
    emitting: false,
  });
  emitter.explode(3, x, y);
  scene.time.delayedCall(500, () => emitter.destroy());
}

export function createAggroIndicator(scene: Phaser.Scene, x: number, y: number) {
  const text = scene.add.text(x, y - 30, '!', {
    fontSize: '20px',
    color: '#ff3333',
    fontFamily: 'MedievalSharp, serif',
    fontStyle: 'bold',
    stroke: '#000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(45);

  scene.tweens.add({
    targets: text,
    y: y - 50,
    alpha: 0,
    scale: 1.5,
    duration: 800,
    ease: 'Power2',
    onComplete: () => text.destroy(),
  });
}

export function createStanceChangeFlash(scene: Phaser.Scene, x: number, y: number, stance: Stance) {
  const color = STANCE_FLASH_COLORS[stance];
  const ring = scene.add.graphics();
  ring.lineStyle(3, color, 0.8);
  ring.strokeCircle(x, y, 20);
  ring.setDepth(45);

  scene.tweens.add({
    targets: ring,
    alpha: 0,
    scaleX: 2,
    scaleY: 2,
    duration: 400,
    ease: 'Power2',
    onComplete: () => ring.destroy(),
  });
}

export function spawnRealtimeDamageNumber(
  scene: Phaser.Scene,
  x: number,
  y: number,
  damage: number,
  isCrit: boolean,
) {
  const text = isCrit ? `${damage}!` : `${damage}`;
  const color = isCrit ? '#ffd700' : '#ff3333';
  const fontSize = isCrit ? '20px' : '14px';

  const dmgText = scene.add.text(x, y - 10, text, {
    fontFamily: 'MedievalSharp, serif',
    fontSize,
    color,
    stroke: '#000000',
    strokeThickness: 3,
    fontStyle: isCrit ? 'bold' : 'normal',
  }).setOrigin(0.5).setDepth(50);

  scene.tweens.add({
    targets: dmgText,
    y: y - 40,
    alpha: 0,
    duration: 800,
    ease: 'Power2',
    onComplete: () => dmgText.destroy(),
  });
}
