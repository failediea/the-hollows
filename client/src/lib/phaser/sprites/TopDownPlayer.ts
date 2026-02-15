import Phaser from 'phaser';
import type { Stance } from '../../stores/types';
import { PLAYER_SPRITE_CONFIGS, type SpriteSheetConfig, type DirectionalAnimDef, type AnimDef, type FacingDir } from '../spriteConfig';

const STANCE_COLORS: Record<Stance, number> = {
  aggressive: 0xff3333,
  balanced: 0x4ade80,
  defensive: 0x3b82f6,
  evasive: 0x8b5cf6,
};

export class TopDownPlayer {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite | null = null;
  private spriteConfig: SpriteSheetConfig;
  private stanceRing: Phaser.GameObjects.Graphics;
  private dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  // Gather tool (programmatic — kept as-is since sprites don't have gather anims)
  private gatherTool: Phaser.GameObjects.Graphics | null = null;
  private gatherAnim: Phaser.Tweens.Tween | null = null;
  private gatherBob: Phaser.Tweens.Tween | null = null;
  private gatherParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private currentGatherType: string | null = null;
  private gatherToolAngle = 0;

  public targetX: number;
  public targetY: number;
  private currentStance: Stance = 'balanced';
  private currentFacing: FacingDir = 'down';
  private currentAnim: string = '';
  private isMoving = false;
  private isAttacking = false;
  private attackAnimTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.targetX = x;
    this.targetY = y;

    // Pick LedA as default player sprite
    this.spriteConfig = PLAYER_SPRITE_CONFIGS[0];

    // Stance ring
    this.stanceRing = scene.add.graphics();
    this.drawStanceRing('balanced');

    const children: Phaser.GameObjects.GameObject[] = [this.stanceRing];

    // Create sprite if texture loaded
    console.log(`[Player] texture ${this.spriteConfig.key} exists: ${scene.textures.exists(this.spriteConfig.key)}, all keys: ${scene.textures.getTextureKeys().filter(k => k.includes('Led')).join(',')}`);
    if (scene.textures.exists(this.spriteConfig.key)) {
      this.sprite = scene.add.sprite(0, 0, this.spriteConfig.key);
      this.sprite.setScale(this.spriteConfig.scale ?? 1.0);
      // LPC humanoid frames have empty space at top — shift origin down to center on body
      this.sprite.setOrigin(0.5, 0.65);
      // Ensure player sprite is always visible above darkness
      this.sprite.setTint(0xffffff);
      this.createAnimations();
      const idleKey = `${this.spriteConfig.key}_idle_down`;
      if (scene.anims.exists(idleKey)) {
        this.sprite.play(idleKey);
        this.currentAnim = idleKey;
      }
      children.push(this.sprite);
    }

    this.container = scene.add.container(x, y, children);
    this.container.setDepth(39); // Above darkness(38), below vignette(42)/UI(50)

    this.setupDustParticles();
  }

  private createAnimations() {
    const cfg = this.spriteConfig;
    const cols = cfg.humanoid ? 13 : Math.ceil(this.scene.textures.get(cfg.key).getSourceImage().width / cfg.frameWidth);
    const directions: FacingDir[] = ['up', 'left', 'down', 'right'];

    for (const [animName, animDef] of Object.entries(cfg.animations)) {
      if (!animDef) continue;

      if ('up' in animDef) {
        const dirDef = animDef as DirectionalAnimDef;
        for (const dir of directions) {
          const key = `${cfg.key}_${animName}_${dir}`;
          if (this.scene.anims.exists(key)) continue;
          const ad = dirDef[dir];
          const startFrame = ad.row * cols;
          const frames: number[] = [];
          for (let i = 0; i < ad.frames; i++) frames.push(startFrame + i);
          this.scene.anims.create({
            key,
            frames: frames.map(f => ({ key: cfg.key, frame: f })),
            frameRate: ad.frameRate ?? 8,
            repeat: -1,
          });
        }
      } else {
        const ad = animDef as AnimDef;
        const key = `${cfg.key}_${animName}`;
        if (this.scene.anims.exists(key)) continue;
        const startFrame = ad.row * cols;
        const frames: number[] = [];
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

  private playAnim(animName: string, facing: FacingDir) {
    if (!this.sprite) return;
    const cfg = this.spriteConfig;
    const animDef = cfg.animations[animName as keyof typeof cfg.animations];
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

  private setupDustParticles() {
    if (!this.scene.textures.exists('particle')) {
      const g = this.scene.add.graphics();
      g.fillStyle(0xffffff);
      g.fillCircle(4, 4, 4);
      g.generateTexture('particle', 8, 8);
      g.destroy();
    }
    this.dustEmitter = this.scene.add.particles(0, 0, 'particle', {
      follow: this.container,
      speed: { min: 5, max: 20 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.4, end: 0 },
      lifespan: 400,
      tint: [0x666666, 0x444444],
      frequency: -1,
    });
    this.dustEmitter.setDepth(5);
  }

  private drawStanceRing(stance: Stance) {
    this.stanceRing.clear();
    const color = STANCE_COLORS[stance];
    this.stanceRing.lineStyle(5, color, 0.15);
    this.stanceRing.strokeCircle(0, 0, 20);
    this.stanceRing.lineStyle(2, color, 0.7);
    this.stanceRing.strokeCircle(0, 0, 18);
    const positions = [
      { x: 0, y: -18 }, { x: 18, y: 0 }, { x: 0, y: 18 }, { x: -18, y: 0 },
    ];
    this.stanceRing.fillStyle(color, 0.9);
    for (const p of positions) this.stanceRing.fillCircle(p.x, p.y, 2);
  }

  // ====== Gather animations (kept programmatic) ======

  private getGatherStyle(resourceId: string | null): 'mine' | 'herb' | 'arcane' | null {
    if (!resourceId) return null;
    const mining = ['torchwood', 'iron_scraps', 'dark_iron', 'cursed_steel', 'grave_iron', 'starsilver_ore', 'bone_dust', 'ancient_coins', 'gems', 'ember_core'];
    const herbs = ['herbs', 'spider_silk', 'shadow_thread', 'venom_sac'];
    if (mining.includes(resourceId)) return 'mine';
    if (herbs.includes(resourceId)) return 'herb';
    return 'arcane';
  }

  private startGatherAnimation(style: 'mine' | 'herb' | 'arcane') {
    this.stopGatherAnimation();
    this.currentGatherType = style;
    this.gatherTool = this.scene.add.graphics();
    this.gatherTool.setDepth(45);
    this.container.add(this.gatherTool);

    // Hide sprite during gather for cleaner look with tool overlay
    switch (style) {
      case 'mine': {
        this.gatherToolAngle = -0.8;
        this.gatherAnim = this.scene.tweens.add({
          targets: this, gatherToolAngle: { from: -0.8, to: 0.6 },
          duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          onUpdate: () => this.drawGatherTool(style),
        });
        this.createGatherParticles(0xffaa33, 0x888888);
        break;
      }
      case 'herb': {
        this.gatherToolAngle = 0;
        this.gatherAnim = this.scene.tweens.add({
          targets: this, gatherToolAngle: { from: 0, to: 1 },
          duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          onUpdate: () => this.drawGatherTool(style),
        });
        this.createGatherParticles(0x44cc66, 0x88dd88);
        break;
      }
      case 'arcane': {
        this.gatherToolAngle = 0;
        this.gatherAnim = this.scene.tweens.add({
          targets: this, gatherToolAngle: { from: 0, to: Math.PI * 2 },
          duration: 1500, repeat: -1, ease: 'Linear',
          onUpdate: () => this.drawGatherTool(style),
        });
        this.createGatherParticles(0x9955ee, 0xbb77ff);
        break;
      }
    }
    this.drawGatherTool(style);
  }

  private drawGatherTool(style: 'mine' | 'herb' | 'arcane') {
    if (!this.gatherTool) return;
    this.gatherTool.clear();
    const a = this.gatherToolAngle;

    switch (style) {
      case 'mine': {
        const handleLen = 16;
        const hx = 8 + Math.cos(a - Math.PI / 4) * handleLen;
        const hy = -2 + Math.sin(a - Math.PI / 4) * handleLen;
        this.gatherTool.lineStyle(2.5, 0x6b4226, 1);
        this.gatherTool.lineBetween(8, -2, hx, hy);
        const headAngle = a - Math.PI / 4 + Math.PI / 2;
        this.gatherTool.lineStyle(3, 0x888899, 1);
        this.gatherTool.lineBetween(
          hx - Math.cos(headAngle) * 5, hy - Math.sin(headAngle) * 5,
          hx + Math.cos(headAngle) * 5, hy + Math.sin(headAngle) * 5,
        );
        break;
      }
      case 'herb': {
        const reachY = 6 + a * 8;
        const reachX = 6 + Math.sin(a * 2) * 2;
        this.gatherTool.lineStyle(2, 0xddb896, 0.9);
        this.gatherTool.lineBetween(6, 0, reachX, reachY);
        this.gatherTool.fillStyle(0xddb896, 0.9);
        this.gatherTool.fillCircle(reachX, reachY, 2.5);
        if (a > 0.5) {
          this.gatherTool.fillStyle(0x44cc66, 0.8);
          this.gatherTool.fillCircle(reachX + 1, reachY - 2, 2);
        }
        break;
      }
      case 'arcane': {
        const orbRadius = 14;
        for (let i = 0; i < 4; i++) {
          const orbAngle = a + (i / 4) * Math.PI * 2;
          const ox = Math.cos(orbAngle) * orbRadius;
          const oy = Math.sin(orbAngle) * orbRadius * 0.6 - 4;
          this.gatherTool.fillStyle(0x9955ee, 0.6);
          this.gatherTool.fillCircle(ox, oy, 3);
          this.gatherTool.fillStyle(0xbb77ff, 0.8);
          this.gatherTool.fillCircle(ox, oy, 1.5);
        }
        this.gatherTool.fillStyle(0x9955ee, 0.15);
        this.gatherTool.fillCircle(0, -4, orbRadius + 4);
        break;
      }
    }
  }

  private createGatherParticles(color1: number, color2: number) {
    if (!this.scene.textures.exists('particle')) {
      const pg = this.scene.add.graphics();
      pg.fillStyle(0xffffff);
      pg.fillCircle(4, 4, 4);
      pg.generateTexture('particle', 8, 8);
      pg.destroy();
    }
    this.gatherParticles = this.scene.add.particles(0, 0, 'particle', {
      speed: { min: 10, max: 30 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.3, end: 0 },
      lifespan: 600,
      frequency: 150,
      tint: [color1, color2],
      follow: this.container,
      followOffset: { x: 0, y: 5 },
    });
    this.gatherParticles.setDepth(45);
  }

  private stopGatherAnimation() {
    if (this.gatherAnim) { this.gatherAnim.destroy(); this.gatherAnim = null; }
    if (this.gatherBob) { this.gatherBob.destroy(); this.gatherBob = null; }
    if (this.gatherTool) { this.gatherTool.destroy(); this.gatherTool = null; }
    if (this.gatherParticles) { this.gatherParticles.destroy(); this.gatherParticles = null; }
    this.currentGatherType = null;
  }

  triggerAttack() {
    if (!this.sprite || !this.spriteConfig.animations.attack) return;
    this.isAttacking = true;
    this.playAnim('attack', this.currentFacing);
    // Reset after attack animation duration
    if (this.attackAnimTimer) this.attackAnimTimer.destroy();
    this.attackAnimTimer = this.scene.time.delayedCall(500, () => {
      this.isAttacking = false;
    });
  }

  update(serverX: number, serverY: number, facing: FacingDir, stance: Stance, gatheringResource?: string | null, attackCooldown?: number) {
    this.targetX = serverX;
    this.targetY = serverY;

    const lerpFactor = 0.3;
    const prevX = this.container.x;
    const prevY = this.container.y;
    this.container.x += (this.targetX - this.container.x) * lerpFactor;
    this.container.y += (this.targetY - this.container.y) * lerpFactor;

    const dx = Math.abs(this.targetX - this.container.x);
    const dy = Math.abs(this.targetY - this.container.y);
    const moving = dx > 1 || dy > 1;

    // Update sprite animation
    if (this.sprite) {
      if (this.currentGatherType) {
        this.playAnim('idle', facing);
      } else if (this.isAttacking) {
        this.playAnim('attack', facing);
      } else if (moving) {
        this.playAnim('walk', facing);
      } else {
        this.playAnim('idle', facing);
      }
    }

    this.currentFacing = facing;

    if (stance !== this.currentStance) {
      this.currentStance = stance;
      this.drawStanceRing(stance);
    }

    // Handle gather animation
    const gatherStyle = this.getGatherStyle(gatheringResource ?? null);
    if (gatherStyle && gatherStyle !== this.currentGatherType) {
      this.startGatherAnimation(gatherStyle);
    } else if (!gatherStyle && this.currentGatherType) {
      this.stopGatherAnimation();
    }

    if (moving && this.dustEmitter) {
      this.dustEmitter.emitParticle(1);
    }
  }

  playAttackArc(facing: FacingDir, color: number = 0xff6b35) {
    const arc = this.scene.add.graphics();
    arc.lineStyle(3, color, 0.8);
    let startAngle: number, endAngle: number;
    let arcX = this.container.x, arcY = this.container.y;
    switch (facing) {
      case 'right': startAngle = -0.5; endAngle = 0.5; arcX += 20; break;
      case 'left': startAngle = Math.PI - 0.5; endAngle = Math.PI + 0.5; arcX -= 20; break;
      case 'up': startAngle = -Math.PI / 2 - 0.5; endAngle = -Math.PI / 2 + 0.5; arcY -= 20; break;
      default: startAngle = Math.PI / 2 - 0.5; endAngle = Math.PI / 2 + 0.5; arcY += 20; break;
    }
    arc.beginPath();
    arc.arc(arcX, arcY, 25, startAngle, endAngle, false);
    arc.strokePath();
    arc.setDepth(45);
    this.scene.tweens.add({
      targets: arc, alpha: 0, duration: 200,
      onComplete: () => arc.destroy(),
    });
  }

  get x() { return this.container.x; }
  get y() { return this.container.y; }

  destroy() {
    this.stopGatherAnimation();
    if (this.dustEmitter) this.dustEmitter.destroy();
    this.container.destroy();
  }
}
