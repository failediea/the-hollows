import Phaser from 'phaser';

export function spawnDamageNumber(
  scene: Phaser.Scene,
  x: number,
  y: number,
  damage: number,
  isCrit: boolean,
  isHeal: boolean
) {
  const text = isHeal ? `+${damage}` : `${damage}${isCrit ? '!' : ''}`;
  const color = isHeal ? '#4ade80' : isCrit ? '#ffd700' : '#ff3333';
  const fontSize = isCrit ? '32px' : '24px';

  const dmgText = scene.add.text(x, y, text, {
    fontFamily: 'MedievalSharp, serif',
    fontSize,
    color,
    stroke: '#000000',
    strokeThickness: 4,
    fontStyle: isCrit ? 'bold' : 'normal',
  }).setOrigin(0.5).setDepth(100);

  scene.tweens.add({
    targets: dmgText,
    y: y - 60,
    alpha: 0,
    scale: isCrit ? 1.5 : 1.2,
    duration: 1500,
    ease: 'Power2',
    onComplete: () => dmgText.destroy(),
  });
}
