import Phaser from 'phaser';
import type { EnemyArchetype, ElementType } from '../../stores/types';
import { ELEMENT_COLORS } from '../assetMaps';
import { getSpriteConfig, type SpriteSheetConfig, type FacingDir, type DirectionalAnimDef, type AnimDef } from '../spriteConfig';

const ARCHETYPE_CONFIG: Record<EnemyArchetype, { radius: number; color: number }> = {
  brute: { radius: 16, color: 0x991111 },
  guardian: { radius: 14, color: 0x5577aa },
  assassin: { radius: 10, color: 0x8844aa },
  caster: { radius: 10, color: 0x44aa88 },
  boss: { radius: 22, color: 0xcc2222 },
};

function getElementPalette(element: ElementType) {
  switch (element) {
    case 'fire': return { glow: 0xff4500, accent: 0xff8c00, aura: 0xff6030, bg: 0x4a1a08 };
    case 'ice': return { glow: 0x00bfff, accent: 0x80e0ff, aura: 0x40c0e0, bg: 0x0a2a3a };
    case 'shadow': return { glow: 0x8b5ce6, accent: 0xb08aff, aura: 0x7040c0, bg: 0x1a0a30 };
    default: return { glow: 0x888888, accent: 0xaaaaaa, aura: 0x666666, bg: 0x2a2a2a };
  }
}

export class TopDownEnemy {
  private scene: Phaser.Scene;
  public container: Phaser.GameObjects.Container;
  private hpBarBg: Phaser.GameObjects.Graphics;
  private hpBarFill: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private aggroIcon: Phaser.GameObjects.Text | null = null;

  // Sprite-based rendering
  public sprite: Phaser.GameObjects.Sprite | null = null;
  private spriteConfig: SpriteSheetConfig | null = null;

  // Programmatic fallback rendering
  private bodyGraphics: Phaser.GameObjects.Graphics | null = null;
  private auraGraphics: Phaser.GameObjects.Graphics | null = null;

  public id: string;
  public targetX: number;
  public targetY: number;
  private archetype: EnemyArchetype;
  private element: ElementType;
  private radius: number;
  private maxHp: number;
  private isAlive = true;
  private currentAnim: string = '';

  constructor(
    scene: Phaser.Scene,
    id: string,
    x: number,
    y: number,
    name: string,
    archetype: EnemyArchetype,
    element: ElementType,
    maxHp: number,
    mobId?: string,
  ) {
    this.scene = scene;
    this.id = id;
    this.targetX = x;
    this.targetY = y;
    this.archetype = archetype;
    this.element = element;
    this.maxHp = maxHp;

    const config = ARCHETYPE_CONFIG[archetype];
    this.radius = config.radius;

    // Try sprite-based rendering
    this.spriteConfig = mobId ? (getSpriteConfig(mobId) ?? null) : null;
    const useSprite = this.spriteConfig && scene.textures.exists(this.spriteConfig.key);
    console.log(`[Enemy] mobId=${mobId} spriteConfig=${this.spriteConfig?.key ?? 'none'} textureExists=${useSprite} allTextures=${scene.textures.getTextureKeys().join(',')}`);

    const children: Phaser.GameObjects.GameObject[] = [];

    if (useSprite && this.spriteConfig) {
      // Create animated sprite
      this.sprite = scene.add.sprite(0, 0, this.spriteConfig.key);
      const scale = this.spriteConfig.scale ?? 1.0;
      this.sprite.setScale(scale);
      this.sprite.setOrigin(0.5, 0.5);

      // Create animations for this sprite
      this.createAnimations();

      // Start with idle facing down
      const idleKey = `${this.spriteConfig.key}_idle_down`;
      if (scene.anims.exists(idleKey)) {
        this.sprite.play(idleKey);
        this.currentAnim = idleKey;
      }

      // Element tint for non-none elements
      if (element !== 'none') {
        const pal = getElementPalette(element);
        this.sprite.setTint(pal.glow);
      }

      children.push(this.sprite);
    } else {
      // Fallback to programmatic
      this.auraGraphics = scene.add.graphics();
      this.drawAura();
      this.bodyGraphics = scene.add.graphics();
      this.drawBody();
      children.push(this.auraGraphics, this.bodyGraphics);
    }

    // HP bar background
    this.hpBarBg = scene.add.graphics();
    this.hpBarBg.fillStyle(0x000000, 0.6);
    this.hpBarBg.fillRect(-20, -(this.radius + 16), 40, 5);
    children.push(this.hpBarBg);

    // HP bar fill
    this.hpBarFill = scene.add.graphics();
    this.drawHpBar(maxHp, maxHp);
    children.push(this.hpBarFill);

    // Name
    this.nameText = scene.add.text(0, -(this.radius + 22), name, {
      fontSize: '10px',
      color: '#e8dcc4',
      fontFamily: 'Cinzel, serif',
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    children.push(this.nameText);

    this.container = scene.add.container(x, y, children);
    this.container.setDepth(39); // Above darkness(38), below vignette(42)/UI(50)

    // Boss: pulsing effect
    if (archetype === 'boss') {
      if (this.sprite) {
        scene.tweens.add({
          targets: this.sprite,
          alpha: { from: 0.7, to: 1.0 },
          scaleX: { from: (this.spriteConfig?.scale ?? 1) * 0.95, to: (this.spriteConfig?.scale ?? 1) * 1.05 },
          scaleY: { from: (this.spriteConfig?.scale ?? 1) * 0.95, to: (this.spriteConfig?.scale ?? 1) * 1.05 },
          duration: 1000,
          yoyo: true,
          repeat: -1,
        });
      } else if (this.auraGraphics) {
        scene.tweens.add({
          targets: this.auraGraphics,
          alpha: { from: 0.4, to: 0.9 },
          duration: 1000,
          yoyo: true,
          repeat: -1,
        });
      }
    }
  }

  private createAnimations() {
    if (!this.spriteConfig) return;
    const cfg = this.spriteConfig;
    const cols = cfg.humanoid ? 13 : Math.ceil(this.scene.textures.get(cfg.key).getSourceImage().width / cfg.frameWidth);

    const directions: FacingDir[] = ['up', 'left', 'down', 'right'];

    for (const [animName, animDef] of Object.entries(cfg.animations)) {
      if (!animDef) continue;

      // Check if it's a directional anim (has up/left/down/right) or simple
      if ('up' in animDef) {
        // Directional
        const dirDef = animDef as DirectionalAnimDef;
        for (const dir of directions) {
          const key = `${cfg.key}_${animName}_${dir}`;
          if (this.scene.anims.exists(key)) continue;
          const ad = dirDef[dir];
          const startFrame = ad.row * cols;
          const frames = [];
          for (let i = 0; i < ad.frames; i++) frames.push(startFrame + i);
          this.scene.anims.create({
            key,
            frames: frames.map(f => ({ key: cfg.key, frame: f })),
            frameRate: ad.frameRate ?? 8,
            repeat: -1,
          });
        }
      } else {
        // Non-directional (hurt, die)
        const ad = animDef as AnimDef;
        const key = `${cfg.key}_${animName}`;
        if (this.scene.anims.exists(key)) continue;
        const startFrame = ad.row * cols;
        const frames = [];
        for (let i = 0; i < ad.frames; i++) frames.push(startFrame + i);
        this.scene.anims.create({
          key,
          frames: frames.map(f => ({ key: cfg.key, frame: f })),
          frameRate: ad.frameRate ?? 8,
          repeat: 0,
        });
      }
    }
  }

  private playAnim(animName: string, facing: FacingDir = 'down') {
    if (!this.sprite || !this.spriteConfig) return;
    const cfg = this.spriteConfig;
    const animDef = cfg.animations[animName as keyof typeof cfg.animations];
    
    // Determine the key: directional or not
    let key: string;
    if (animDef && 'up' in animDef) {
      key = `${cfg.key}_${animName}_${facing}`;
    } else {
      key = `${cfg.key}_${animName}`;
    }
    
    if (key !== this.currentAnim && this.scene.anims.exists(key)) {
      this.sprite.play(key);
      this.currentAnim = key;
    }
  }

  private drawHpBar(hp: number, maxHp: number) {
    this.hpBarFill.clear();
    const pct = Math.max(0, hp / maxHp);
    const color = pct > 0.6 ? 0x4ade80 : pct > 0.3 ? 0xf59e0b : 0xff3333;
    this.hpBarFill.fillStyle(color, 1);
    this.hpBarFill.fillRect(-20, -(this.radius + 16), 40 * pct, 5);
  }

  update(serverX: number, serverY: number, hp: number, aiState: string, facing?: string) {
    if (!this.isAlive) return;

    this.targetX = serverX;
    this.targetY = serverY;

    const lerpFactor = 0.25;
    this.container.x += (this.targetX - this.container.x) * lerpFactor;
    this.container.y += (this.targetY - this.container.y) * lerpFactor;

    this.drawHpBar(hp, this.maxHp);

    // Determine facing from server or movement delta
    const dir = (facing as FacingDir) || 'down';

    // Update animation based on AI state + facing
    if (this.sprite) {
      if (aiState === 'attack' || aiState === 'cooldown') {
        this.playAnim('attack', dir);
      } else if (aiState === 'chase') {
        this.playAnim('walk', dir);
      } else {
        this.playAnim('idle', dir);
      }
    }

    // Aggro indicator
    if (aiState === 'chase' || aiState === 'attack') {
      if (!this.aggroIcon) {
        this.aggroIcon = this.scene.add.text(0, -(this.radius + 30), '!', {
          fontSize: '16px',
          color: '#ff3333',
          fontFamily: 'MedievalSharp, serif',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 3,
        }).setOrigin(0.5);
        this.container.add(this.aggroIcon);
      }
    } else if (this.aggroIcon) {
      this.aggroIcon.destroy();
      this.aggroIcon = null;
    }
  }

  playDeath(): Promise<void> {
    this.isAlive = false;

    const deathX = this.container.x;
    const deathY = this.container.y;

    // Try die animation first
    if (this.sprite && this.spriteConfig) {
      const dieKey = `${this.spriteConfig.key}_die`;
      if (this.scene.anims.exists(dieKey)) {
        this.sprite.play(dieKey);
      }
    }

    // Screen flash (red tint)
    const flash = this.scene.add.graphics();
    flash.fillStyle(0x660000, 0.12);
    flash.fillRect(0, 0, this.scene.scale.width, this.scene.scale.height);
    flash.setDepth(50);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 200,
      onComplete: () => flash.destroy(),
    });

    if (!this.scene.textures.exists('particle')) {
      const g = this.scene.add.graphics();
      g.fillStyle(0xffffff);
      g.fillCircle(4, 4, 4);
      g.generateTexture('particle', 8, 8);
      g.destroy();
    }

    // Main death particles (25 instead of 15)
    const emitter = this.scene.add.particles(deathX, deathY, 'particle', {
      speed: { min: 30, max: 100 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      lifespan: 800,
      quantity: 25,
      tint: [ARCHETYPE_CONFIG[this.archetype].color, 0x000000],
      emitting: false,
    });
    emitter.setDepth(25);
    emitter.explode(25, deathX, deathY);

    // Soul particle rising upward
    const pal = getElementPalette(this.element);
    const soulParticle = this.scene.add.particles(deathX, deathY, 'particle', {
      speed: { min: 20, max: 40 },
      angle: { min: -100, max: -80 }, // upward
      scale: { start: 0.8, end: 0.2 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 2000,
      tint: [pal.glow, pal.accent],
      emitting: false,
    });
    soulParticle.setDepth(26);
    soulParticle.explode(1, deathX, deathY);

    // Blood/scorch mark on ground
    const mark = this.scene.add.graphics();
    mark.fillStyle(this.element === 'fire' ? 0x331100 : 0x220000, 0.6);
    mark.fillCircle(deathX, deathY, this.radius * 0.8);
    mark.setDepth(0.5); // Just above floor
    this.scene.tweens.add({
      targets: mark,
      alpha: 0,
      duration: 5000,
      onComplete: () => mark.destroy(),
    });

    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 500,
        ease: 'Power2',
        onComplete: () => {
          emitter.destroy();
          soulParticle.destroy();
          this.container.destroy();
          resolve();
        },
      });
    });
  }

  setVisible(visible: boolean) {
    this.container.setVisible(visible);
  }

  knockback(dx: number, dy: number) {
    if (!this.isAlive) return;
    this.scene.tweens.add({
      targets: this.container,
      x: this.container.x + dx,
      y: this.container.y + dy,
      duration: 100,
      ease: 'Power2',
    });
  }

  flashWhite() {
    if (!this.isAlive) return;
    if (this.sprite) {
      this.sprite.setTint(0xffffff);
      this.scene.time.delayedCall(50, () => {
        if (this.sprite) this.sprite.clearTint();
      });
    } else if (this.bodyGraphics) {
      this.bodyGraphics.setAlpha(0.5);
      this.scene.time.delayedCall(50, () => {
        if (this.bodyGraphics) this.bodyGraphics.setAlpha(1);
      });
    }
  }

  get x() { return this.container.x; }
  get y() { return this.container.y; }

  destroy() {
    this.container.destroy();
  }

  // ============ Programmatic fallback drawing (unchanged) ============

  private drawAura() {
    if (!this.auraGraphics) return;
    this.auraGraphics.clear();
    const pal = getElementPalette(this.element);
    const r = this.radius;

    if (this.archetype === 'boss') {
      this.auraGraphics.lineStyle(3, pal.glow, 0.2);
      this.auraGraphics.strokeCircle(0, 0, r + 12);
      this.auraGraphics.lineStyle(2, pal.accent, 0.3);
      this.auraGraphics.strokeCircle(0, 0, r + 8);
      this.auraGraphics.lineStyle(2, pal.glow, 0.4);
      this.auraGraphics.strokeCircle(0, 0, r + 4);
      this.auraGraphics.fillStyle(pal.glow, 0.6);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.auraGraphics.fillCircle(Math.cos(a) * (r + 10), Math.sin(a) * (r + 10), 1.5);
      }
    } else if (this.element !== 'none') {
      this.auraGraphics.lineStyle(2, pal.glow, 0.35);
      this.auraGraphics.strokeCircle(0, 0, r + 5);
      this.auraGraphics.fillStyle(pal.accent, 0.4);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        this.auraGraphics.fillCircle(Math.cos(a) * (r + 5), Math.sin(a) * (r + 5), 1);
      }
    }
  }

  private drawBody() {
    if (!this.bodyGraphics) return;
    this.bodyGraphics.clear();
    const pal = getElementPalette(this.element);
    const config = ARCHETYPE_CONFIG[this.archetype];
    const r = this.radius;

    switch (this.archetype) {
      case 'brute': this.drawBrute(r, config.color, pal); break;
      case 'guardian': this.drawGuardian(r, config.color, pal); break;
      case 'assassin': this.drawAssassin(r, config.color, pal); break;
      case 'caster': this.drawCaster(r, config.color, pal); break;
      case 'boss': this.drawBoss(r, config.color, pal); break;
    }
  }

  private drawBrute(r: number, baseColor: number, pal: ReturnType<typeof getElementPalette>) {
    const g = this.bodyGraphics!;
    g.fillStyle(darken(baseColor, 0.3), 1);
    g.fillEllipse(0, 0, r * 2.2, r * 2.4);
    g.fillStyle(baseColor, 1);
    g.fillEllipse(0, 0, r * 2, r * 2.2);
    g.fillStyle(lighten(baseColor, 0.2), 0.6);
    g.fillEllipse(-3, -2, r * 0.9, r * 1.2);
    g.fillEllipse(3, -2, r * 0.9, r * 1.2);
    g.fillStyle(darken(baseColor, 0.15), 1);
    g.fillEllipse(-r + 2, -2, r * 0.7, r * 0.9);
    g.fillEllipse(r - 2, -2, r * 0.7, r * 0.9);
    g.fillStyle(darken(baseColor, 0.2), 1);
    g.fillCircle(0, -r * 0.5, r * 0.4);
    g.fillStyle(pal.glow, 0.9);
    g.fillCircle(-2, -r * 0.55, 1.5);
    g.fillCircle(2, -r * 0.55, 1.5);
    g.fillStyle(0x555566, 0.9);
    g.fillRect(r - 2, -r * 0.3, 4, r * 1.4);
    g.fillStyle(0x777788, 1);
    g.fillTriangle(r + 2, -r * 0.3, r + 10, -r * 0.1, r + 2, r * 0.2);
    g.fillStyle(pal.glow, 0.4);
    g.fillTriangle(r + 2, -r * 0.25, r + 8, -r * 0.05, r + 2, r * 0.15);
    g.lineStyle(1.5, 0x000000, 0.8);
    g.strokeEllipse(0, 0, r * 2, r * 2.2);
  }

  private drawGuardian(r: number, baseColor: number, pal: ReturnType<typeof getElementPalette>) {
    const g = this.bodyGraphics!;
    g.fillStyle(darken(baseColor, 0.3), 1);
    g.fillEllipse(0, 0, r * 2.1, r * 2.1);
    g.fillStyle(baseColor, 1);
    g.fillEllipse(0, 0, r * 1.9, r * 1.9);
    g.lineStyle(1, lighten(baseColor, 0.3), 0.5);
    g.lineBetween(-r * 0.8, 0, r * 0.8, 0);
    g.lineBetween(0, -r * 0.8, 0, r * 0.8);
    g.fillStyle(pal.glow, 0.7);
    g.fillCircle(0, -1, 3);
    g.fillStyle(lighten(baseColor, 0.15), 1);
    g.fillEllipse(-r + 1, -1, r * 0.8, r * 0.7);
    g.fillEllipse(r - 1, -1, r * 0.8, r * 0.7);
    g.fillStyle(pal.accent, 0.8);
    g.fillCircle(-r + 1, -3, 1);
    g.fillCircle(r - 1, -3, 1);
    g.fillStyle(lighten(baseColor, 0.1), 1);
    g.fillCircle(0, -r * 0.4, r * 0.4);
    g.fillStyle(0x111122, 1);
    g.fillRect(-3, -r * 0.45, 6, 2);
    g.fillStyle(darken(baseColor, 0.1), 1);
    g.fillRoundedRect(-r - 6, -r * 0.6, 8, r * 1.2, 2);
    g.fillStyle(pal.glow, 0.6);
    g.fillCircle(-r - 2, 0, 2);
    g.lineStyle(1, pal.accent, 0.5);
    g.strokeRoundedRect(-r - 6, -r * 0.6, 8, r * 1.2, 2);
    g.fillStyle(0xaaaacc, 0.9);
    g.fillRect(r + 1, -r * 0.4, 2, r * 0.9);
    g.fillStyle(pal.glow, 0.8);
    g.fillRect(r - 1, -r * 0.4, 6, 2);
    g.lineStyle(1.5, 0x000000, 0.8);
    g.strokeEllipse(0, 0, r * 1.9, r * 1.9);
  }

  private drawAssassin(r: number, baseColor: number, pal: ReturnType<typeof getElementPalette>) {
    const g = this.bodyGraphics!;
    g.fillStyle(0x0a0a15, 0.5);
    g.fillEllipse(0, 1, r * 1.6, r * 2.2);
    g.fillStyle(darken(baseColor, 0.4), 1);
    g.fillEllipse(0, 2, r * 1.5, r * 2.0);
    g.fillStyle(baseColor, 1);
    g.fillEllipse(0, 1, r * 1.2, r * 1.8);
    g.fillStyle(darken(baseColor, 0.4), 1);
    g.fillTriangle(0, -r * 1.2, -r * 0.4, -r * 0.3, r * 0.4, -r * 0.3);
    g.fillStyle(0x0a0a15, 0.8);
    g.fillEllipse(0, -r * 0.3, r * 0.6, r * 0.4);
    g.fillStyle(pal.glow, 1);
    g.fillCircle(-2, -r * 0.35, 1);
    g.fillCircle(2, -r * 0.35, 1);
    g.fillStyle(0x222230, 1);
    g.fillRect(-r * 0.5, 2, r, 2);
    g.fillStyle(pal.accent, 0.7);
    g.fillRect(-1, 2, 2, 2);
    g.fillStyle(0xaaaacc, 0.85);
    g.fillRect(-r - 3, -r * 0.2, 2, r * 0.8);
    g.fillTriangle(-r - 2, -r * 0.2 - 3, -r - 4, -r * 0.2, -r, -r * 0.2);
    g.fillRect(r + 1, -r * 0.2, 2, r * 0.8);
    g.fillTriangle(r + 2, -r * 0.2 - 3, r, -r * 0.2, r + 4, -r * 0.2);
    g.fillStyle(pal.glow, 0.3);
    g.fillRect(-r - 4, -r * 0.2, 4, r * 0.8);
    g.fillRect(r, -r * 0.2, 4, r * 0.8);
    g.lineStyle(1, 0x000000, 0.7);
    g.strokeEllipse(0, 1, r * 1.2, r * 1.8);
  }

  private drawCaster(r: number, baseColor: number, pal: ReturnType<typeof getElementPalette>) {
    const g = this.bodyGraphics!;
    g.fillStyle(darken(baseColor, 0.3), 1);
    g.fillEllipse(0, 2, r * 1.8, r * 2.4);
    g.fillStyle(baseColor, 1);
    g.fillEllipse(0, 2, r * 1.5, r * 2.1);
    g.lineStyle(1, darken(baseColor, 0.2), 0.4);
    g.lineBetween(-2, -r * 0.3, -3, r);
    g.lineBetween(2, -r * 0.3, 3, r);
    g.fillStyle(darken(baseColor, 0.2), 1);
    g.fillEllipse(0, -r * 0.3, r * 0.8, r * 0.5);
    g.fillStyle(darken(baseColor, 0.35), 1);
    g.fillCircle(0, -r * 0.5, r * 0.45);
    g.fillStyle(pal.glow, 0.3);
    g.fillCircle(0, -r * 0.5, r * 0.3);
    g.fillStyle(pal.glow, 1);
    g.fillCircle(-2, -r * 0.55, 1.5);
    g.fillCircle(2, -r * 0.55, 1.5);
    g.fillStyle(0x5c3a1e, 1);
    g.fillRect(r + 2, -r * 1.0, 2, r * 2.2);
    g.fillStyle(pal.glow, 0.8);
    g.fillCircle(r + 3, -r * 1.0, 3);
    g.fillStyle(pal.accent, 0.3);
    g.fillCircle(r + 3, -r * 1.0, 5);
    g.fillStyle(pal.glow, 0.15);
    g.fillCircle(-r * 0.3, 0, 4);
    g.fillCircle(r * 0.3, 0, 4);
    g.fillStyle(pal.glow, 0.4);
    g.fillCircle(0, r * 0.3, 1.5);
    g.fillCircle(-3, r * 0.6, 1);
    g.fillCircle(3, r * 0.6, 1);
    g.lineStyle(1, 0x000000, 0.7);
    g.strokeEllipse(0, 2, r * 1.5, r * 2.1);
  }

  private drawBoss(r: number, baseColor: number, pal: ReturnType<typeof getElementPalette>) {
    const g = this.bodyGraphics!;
    g.fillStyle(0x0a0a10, 0.4);
    g.fillEllipse(0, 2, r * 2.2, r * 2.4);
    g.fillStyle(darken(baseColor, 0.25), 1);
    g.fillEllipse(0, 0, r * 2.0, r * 2.2);
    g.fillStyle(baseColor, 1);
    g.fillEllipse(0, 0, r * 1.8, r * 2.0);
    g.fillStyle(lighten(baseColor, 0.2), 0.6);
    g.fillEllipse(0, -2, r * 1.2, r * 1.0);
    g.lineStyle(1.5, pal.glow, 0.5);
    g.lineBetween(-r * 0.7, -r * 0.2, r * 0.7, -r * 0.2);
    g.lineBetween(0, -r * 0.7, 0, r * 0.5);
    g.fillStyle(lighten(baseColor, 0.15), 1);
    g.fillEllipse(-r + 2, -2, r * 0.9, r * 0.8);
    g.fillEllipse(r - 2, -2, r * 0.9, r * 0.8);
    g.fillStyle(pal.glow, 0.7);
    g.fillTriangle(-r - 2, -6, -r + 2, -2, -r - 2, 2);
    g.fillTriangle(r + 2, -6, r - 2, -2, r + 2, 2);
    g.fillStyle(darken(baseColor, 0.15), 1);
    g.fillCircle(0, -r * 0.45, r * 0.45);
    g.fillStyle(0x444455, 1);
    g.fillTriangle(-r * 0.3, -r * 0.6, -r * 0.5, -r * 1.1, -r * 0.1, -r * 0.65);
    g.fillTriangle(r * 0.3, -r * 0.6, r * 0.5, -r * 1.1, r * 0.1, -r * 0.65);
    g.fillStyle(pal.glow, 0.8);
    g.fillCircle(-r * 0.5, -r * 1.1, 2);
    g.fillCircle(r * 0.5, -r * 1.1, 2);
    g.fillStyle(pal.glow, 1);
    g.fillCircle(-3, -r * 0.5, 2);
    g.fillCircle(3, -r * 0.5, 2);
    g.fillStyle(pal.accent, 0.4);
    g.fillCircle(-3, -r * 0.5, 4);
    g.fillCircle(3, -r * 0.5, 4);
    g.fillStyle(pal.glow, 0.9);
    g.fillCircle(0, -2, 3);
    g.fillStyle(pal.accent, 0.4);
    g.fillCircle(0, -2, 5);
    g.fillStyle(0x666677, 0.9);
    g.fillRect(r + 3, -r * 0.8, 3, r * 1.8);
    g.fillTriangle(r + 4.5, -r * 0.8 - 5, r + 2, -r * 0.8, r + 7, -r * 0.8);
    g.fillStyle(pal.glow, 0.3);
    g.fillRect(r + 2, -r * 0.7, 5, r * 1.6);
    g.fillStyle(pal.glow, 0.8);
    g.fillRect(r, r * 0.5, 9, 2);
    g.fillStyle(0x1a1a20, 1);
    g.fillRect(-r * 0.7, r * 0.3, r * 1.4, 3);
    g.fillStyle(pal.glow, 0.8);
    g.fillRect(-2, r * 0.3, 4, 3);
    g.lineStyle(2, 0x000000, 0.9);
    g.strokeEllipse(0, 0, r * 1.8, r * 2.0);
  }
}

function darken(color: number, amount: number): number {
  const r = Math.max(0, Math.floor(((color >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.floor(((color >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.floor((color & 0xff) * (1 - amount)));
  return (r << 16) | (g << 8) | b;
}

function lighten(color: number, amount: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * (1 + amount)));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * (1 + amount)));
  const b = Math.min(255, Math.floor((color & 0xff) * (1 + amount)));
  return (r << 16) | (g << 8) | b;
}
