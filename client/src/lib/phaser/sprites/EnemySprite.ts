import Phaser from 'phaser';
import { createFloatTween, createLungeTween, createRecoilTween, flashSprite } from '../effects/animations';
import { createHitParticles, createDeathParticles } from '../effects/particles';
import { spawnDamageNumber } from '../effects/damageNumbers';
import type { ElementType, EnemyArchetype } from '../../stores/types';
import { ELEMENT_TINT, ARCHETYPE_ANIM } from '../assetMaps';

export class EnemySprite {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Image;
  private floatTween: Phaser.Tweens.Tween | null = null;
  private element: ElementType = 'none';
  private archetype: EnemyArchetype = 'brute';

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey: string, element: ElementType = 'none', archetype: EnemyArchetype = 'brute') {
    this.scene = scene;
    this.element = element;
    this.archetype = archetype;

    this.sprite = scene.add.image(x, y, textureKey);
    this.sprite.setOrigin(0.5, 0.5);

    // Scale to reasonable size (max 200px tall)
    const maxHeight = scene.scale.height * 0.35;
    const maxWidth = scene.scale.width * 0.3;
    const scale = Math.min(maxHeight / this.sprite.height, maxWidth / this.sprite.width, 1);
    this.sprite.setScale(scale);

    // Apply element tint
    const tint = ELEMENT_TINT[element];
    if (tint) {
      this.sprite.setTint(tint);
    }

    // Start idle float animation
    this.floatTween = createFloatTween(scene, this.sprite);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  setPosition(x: number, y: number) {
    this.sprite.setPosition(x, y);
  }

  async playHit(damage: number, isCrit: boolean, element: ElementType = 'none') {
    // Flash white
    await flashSprite(this.scene, this.sprite, 0xffffff, 100);

    // Recoil
    createRecoilTween(this.scene, this.sprite, -15);

    // Particles
    createHitParticles(this.scene, this.sprite.x, this.sprite.y, element);

    // Damage number
    spawnDamageNumber(this.scene, this.sprite.x, this.sprite.y - this.sprite.displayHeight / 2, damage, isCrit, false);
  }

  async playAttack(targetX: number): Promise<void> {
    const anim = ARCHETYPE_ANIM[this.archetype] || ARCHETYPE_ANIM.brute;
    const lungeTarget = this.sprite.x - anim.lungeDistance;
    await createLungeTween(this.scene, this.sprite, lungeTarget, anim.lungeSpeed);
  }

  async playDeath(): Promise<void> {
    if (this.floatTween) {
      this.floatTween.stop();
      this.floatTween = null;
    }

    createDeathParticles(this.scene, this.sprite.x, this.sprite.y);

    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.sprite,
        alpha: 0,
        scale: this.sprite.scale * 0.3,
        angle: 15,
        duration: 800,
        ease: 'Power2',
        onComplete: () => resolve(),
      });
    });
  }

  setVisible(v: boolean) { this.sprite.setVisible(v); }
  destroy() { this.sprite.destroy(); }
}
