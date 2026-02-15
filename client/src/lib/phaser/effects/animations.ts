import Phaser from 'phaser';

export function createLungeTween(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Container,
  targetX: number,
  duration: number = 300
): Promise<void> {
  const startX = sprite.x;
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: sprite,
      x: targetX,
      duration: duration * 0.4,
      ease: 'Power2',
      yoyo: true,
      hold: 50,
      onComplete: () => {
        sprite.x = startX;
        resolve();
      },
    });
  });
}

export function createRecoilTween(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Container,
  distance: number = -15
): Promise<void> {
  const startX = sprite.x;
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: sprite,
      x: sprite.x + distance,
      duration: 100,
      ease: 'Power1',
      yoyo: true,
      onComplete: () => {
        sprite.x = startX;
        resolve();
      },
    });
  });
}

export function createFloatTween(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Container
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: sprite,
    y: sprite.y - 6,
    duration: 2500,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });
}

export function shakeCamera(scene: Phaser.Scene, intensity: number = 0.01, duration: number = 200) {
  scene.cameras.main.shake(duration, intensity);
}

export function flashSprite(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image,
  color: number = 0xffffff,
  duration: number = 100
): Promise<void> {
  return new Promise((resolve) => {
    sprite.setTint(color);
    scene.time.delayedCall(duration, () => {
      sprite.clearTint();
      resolve();
    });
  });
}
