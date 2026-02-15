import Phaser from 'phaser';
import { createFloatTween, createLungeTween, createRecoilTween } from '../effects/animations';
import { createHitParticles } from '../effects/particles';
import { spawnDamageNumber } from '../effects/damageNumbers';
import type { ElementType } from '../../stores/types';

export class PlayerSprite {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private floatTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    // Draw a simple sword + shield silhouette using graphics
    const graphics = scene.add.graphics();

    // Shield (circle)
    graphics.fillStyle(0x666666, 0.8);
    graphics.fillRoundedRect(-20, -25, 35, 50, 8);
    graphics.lineStyle(2, 0xff6b35);
    graphics.strokeRoundedRect(-20, -25, 35, 50, 8);

    // Shield emblem
    graphics.fillStyle(0xff6b35, 0.6);
    graphics.fillCircle(-2, 0, 8);

    // Sword
    graphics.fillStyle(0xcccccc, 0.9);
    graphics.fillRect(18, -35, 4, 55);

    // Sword guard
    graphics.fillStyle(0xffd700);
    graphics.fillRect(10, -5, 20, 4);

    // Sword handle
    graphics.fillStyle(0x8b4513);
    graphics.fillRect(18, 20, 4, 15);

    this.container = scene.add.container(x, y, [graphics]);
    this.container.setScale(1.5);

    this.floatTween = createFloatTween(scene, this.container);
  }

  get x() { return this.container.x; }
  get y() { return this.container.y; }

  setPosition(x: number, y: number) {
    this.container.setPosition(x, y);
  }

  async playAttack(targetX: number): Promise<void> {
    const lungeTarget = this.container.x + 80;
    await createLungeTween(this.scene, this.container, lungeTarget, 300);
  }

  async playHit(damage: number, isCrit: boolean, element: ElementType = 'none') {
    createRecoilTween(this.scene, this.container, -20);
    createHitParticles(this.scene, this.container.x, this.container.y, element);
    spawnDamageNumber(this.scene, this.container.x, this.container.y - 40, damage, isCrit, false);
  }

  destroy() { this.container.destroy(); }
}
