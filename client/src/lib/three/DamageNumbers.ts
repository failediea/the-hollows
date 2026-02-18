import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

interface FloatingNumber {
  object: CSS2DObject;
  startY: number;
  lifetime: number;
  maxLifetime: number;
  element: HTMLDivElement;
}

type DamageType = 'damage' | 'crit' | 'heal' | 'fire' | 'ice' | 'shadow' | 'dodge' | 'block' | 'poison' | 'xp' | 'gold';

interface DamageStyle {
  color: string;
  fontSize: string;
  format: (v: number | string) => string;
  bold?: boolean;
  italic?: boolean;
}

const DAMAGE_STYLES: Record<DamageType, DamageStyle> = {
  damage:  { color: '#ffffff', fontSize: '18px', format: (v) => `${v}` },
  crit:    { color: '#ffd700', fontSize: '24px', format: (v) => `${v}!`, bold: true },
  heal:    { color: '#4ade80', fontSize: '18px', format: (v) => `+${v}` },
  fire:    { color: '#ff6b35', fontSize: '18px', format: (v) => `${v}` },
  ice:     { color: '#3b82f6', fontSize: '18px', format: (v) => `${v}` },
  shadow:  { color: '#8b5cf6', fontSize: '18px', format: (v) => `${v}` },
  poison:  { color: '#4ade80', fontSize: '14px', format: (v) => `${v}`, italic: true },
  dodge:   { color: '#888888', fontSize: '16px', format: () => 'DODGE', italic: true },
  block:   { color: '#c0c0c0', fontSize: '16px', format: () => 'BLOCK', bold: true },
  xp:      { color: '#ffd700', fontSize: '14px', format: (v) => `+${v} XP`, bold: true },
  gold:    { color: '#ffaa00', fontSize: '14px', format: (v) => `+${v}g` },
};

export class DamageNumberManager {
  private scene: THREE.Scene;
  private numbers: FloatingNumber[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(
    x: number, y: number, z: number,
    value: number | string,
    type: DamageType
  ): void {
    const style = DAMAGE_STYLES[type];

    const el = document.createElement('div');
    el.className = 'damage-number-3d';
    el.textContent = style.format(value);

    el.style.color = style.color;
    el.style.fontSize = style.fontSize;
    if (style.bold) el.style.fontWeight = '700';
    if (style.italic) el.style.fontStyle = 'italic';
    el.style.textShadow = `0 0 8px ${style.color}99, 0 2px 4px rgba(0,0,0,0.8)`;
    el.style.transform = 'scale(1.2)';

    const object = new CSS2DObject(el);
    const offsetX = (Math.random() - 0.5) * 0.6;
    const spawnY = y + 2.0;
    object.position.set(x + offsetX, spawnY, z);
    this.scene.add(object);

    this.numbers.push({
      object,
      startY: spawnY,
      lifetime: 1.2,
      maxLifetime: 1.2,
      element: el,
    });
  }

  update(dt: number): void {
    this.numbers = this.numbers.filter(n => {
      n.lifetime -= dt;
      if (n.lifetime <= 0) {
        this.scene.remove(n.object);
        n.element.remove();
        return false;
      }

      // Rise
      n.object.position.y = n.startY + (n.maxLifetime - n.lifetime) * 1.5;

      // Fade and scale
      const lifeRatio = n.lifetime / n.maxLifetime;
      const opacity = lifeRatio < 0.5 ? lifeRatio * 2 : 1.0;
      const scale = 0.7 + lifeRatio * 0.5;
      n.element.style.opacity = String(opacity);
      n.element.style.transform = `scale(${scale})`;

      return true;
    });
  }

  dispose(): void {
    for (const n of this.numbers) {
      this.scene.remove(n.object);
      n.element.remove();
    }
    this.numbers = [];
  }
}
