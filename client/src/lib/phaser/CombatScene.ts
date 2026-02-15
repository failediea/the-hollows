import Phaser from 'phaser';
import { combatStore } from '../stores/combatStore.svelte';
import type { CombatState, RoundResolution, ElementType, EnemyArchetype } from '../stores/types';
import { ENEMY_SPRITE_MAP, ENEMY_BG_MAP, ZONE_BG_MAP, ENEMY_FALLBACK_EMOJI } from './assetMaps';
import { EnemySprite } from './sprites/EnemySprite';
import { PlayerSprite } from './sprites/PlayerSprite';
import { shakeCamera } from './effects/animations';
import { createVictoryParticles } from './effects/particles';
import { spawnDamageNumber } from './effects/damageNumbers';

export class CombatScene extends Phaser.Scene {
  private enemySprite: EnemySprite | null = null;
  private playerSprite: PlayerSprite | null = null;
  private background: Phaser.GameObjects.Image | null = null;
  private vignette: Phaser.GameObjects.Rectangle | null = null;
  private phaseTint: Phaser.GameObjects.Rectangle | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastProcessedResolution: RoundResolution | null = null;
  private isAnimating = false;
  private vsComplete = false;

  private enemyName = '';
  private zoneName = '';
  private enemyElement: ElementType = 'none';
  private enemyArchetype: EnemyArchetype = 'brute';

  constructor() {
    super({ key: 'CombatScene' });
  }

  init() {
    // Get initial data from the store
    const state = combatStore.getState();
    this.enemyName = state.enemy.name;
    this.zoneName = state.zone;
    this.enemyElement = state.enemy.element;
    this.enemyArchetype = state.enemy.archetype;
  }

  preload() {
    // Load zone background
    const bgPath = ENEMY_BG_MAP[this.enemyName] || ZONE_BG_MAP[this.zoneName];
    if (bgPath) {
      this.load.image('zone-bg', bgPath);
    }

    // Load enemy sprite
    const enemyPath = ENEMY_SPRITE_MAP[this.enemyName];
    if (enemyPath) {
      this.load.image('enemy', enemyPath);
    }
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Background
    if (this.textures.exists('zone-bg')) {
      this.background = this.add.image(w / 2, h / 2, 'zone-bg');
      const bgScale = Math.max(w / this.background.width, h / this.background.height);
      this.background.setScale(bgScale);
      this.background.setDepth(0);
    } else {
      // Fallback dark gradient
      const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x0a0a0f);
      bg.setDepth(0);
    }

    // Vignette overlay for contrast
    this.vignette = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.4);
    this.vignette.setDepth(1);

    // Boss phase tint overlay (starts invisible)
    this.phaseTint = this.add.rectangle(w / 2, h / 2, w, h, 0x330000, 0);
    this.phaseTint.setDepth(2);

    // Enemy sprite (right side, 65%)
    const enemyX = w * 0.65;
    const enemyY = h * 0.38;

    if (this.textures.exists('enemy')) {
      this.enemySprite = new EnemySprite(this, enemyX, enemyY, 'enemy', this.enemyElement, this.enemyArchetype);
    } else {
      // Fallback: styled container with emoji and glow effect
      const emoji = ENEMY_FALLBACK_EMOJI[this.enemyName] || '\u{1F479}';

      const fallbackBg = this.add.graphics();
      fallbackBg.fillStyle(0x1a1a2e, 0.9);
      fallbackBg.fillCircle(0, 0, 52);
      fallbackBg.lineStyle(3, 0xff6b35, 0.8);
      fallbackBg.strokeCircle(0, 0, 52);

      // Outer glow ring
      const glowRing = this.add.graphics();
      glowRing.lineStyle(6, 0xff6b35, 0.25);
      glowRing.strokeCircle(0, 0, 62);

      const fallbackText = this.add.text(0, 0, emoji, {
        fontSize: '56px',
      }).setOrigin(0.5);

      const fallbackContainer = this.add.container(enemyX, enemyY, [glowRing, fallbackBg, fallbackText]);
      fallbackContainer.setDepth(10);

      // Pulse the glow
      this.tweens.add({
        targets: glowRing,
        alpha: { from: 0.3, to: 0.8 },
        duration: 1500,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }

    // Player sprite (left side, 25%)
    const playerX = w * 0.25;
    const playerY = h * 0.55;
    this.playerSprite = new PlayerSprite(this, playerX, playerY);

    // Play VS screen before enabling combat UI
    this.playVsScreen().then(() => {
      this.vsComplete = true;
    });

    // Subscribe to combat store updates
    this.unsubscribe = combatStore.subscribe((state: CombatState) => {
      this.handleStateChange(state);
    });

    // Handle resize
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.handleResize(gameSize.width, gameSize.height);
    });
  }

  private async playVsScreen(): Promise<void> {
    const w = this.scale.width;
    const h = this.scale.height;
    const depth = 200;

    // Dark backdrop
    const backdrop = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.75);
    backdrop.setDepth(depth);
    backdrop.setAlpha(0);

    // Enemy name text - slides in from right
    const nameText = this.add.text(w + 200, h * 0.38, this.enemyName, {
      fontFamily: 'MedievalSharp, serif',
      fontSize: '42px',
      color: '#ff3333',
      stroke: '#000000',
      strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 0, color: '#ff0000', blur: 20, fill: true, stroke: true },
    }).setOrigin(0.5).setDepth(depth + 1);

    // "VS" text - centered, gold
    const vsText = this.add.text(w / 2, h / 2, 'VS', {
      fontFamily: 'MedievalSharp, serif',
      fontSize: '72px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#ffd700', blur: 30, fill: true, stroke: true },
    }).setOrigin(0.5).setDepth(depth + 1);
    vsText.setAlpha(0);
    vsText.setScale(0.3);

    return new Promise((resolve) => {
      // Fade in backdrop
      this.tweens.add({
        targets: backdrop,
        alpha: 0.75,
        duration: 300,
        ease: 'Power1',
      });

      // Slide enemy name from right
      this.tweens.add({
        targets: nameText,
        x: w / 2,
        duration: 500,
        ease: 'Power3',
        delay: 100,
      });

      // Pop in VS text
      this.tweens.add({
        targets: vsText,
        alpha: 1,
        scale: 1,
        duration: 400,
        ease: 'Back.easeOut',
        delay: 400,
      });

      // Hold, then fade everything out
      this.time.delayedCall(1500, () => {
        this.tweens.add({
          targets: [backdrop, nameText, vsText],
          alpha: 0,
          duration: 400,
          ease: 'Power2',
          onComplete: () => {
            backdrop.destroy();
            nameText.destroy();
            vsText.destroy();
            resolve();
          },
        });
      });
    });
  }

  private handleStateChange(state: CombatState) {
    // Wait for VS screen before processing combat
    if (!this.vsComplete) return;

    // If we have a new resolution and we're in 'animating' status, play it
    if (
      state.status === 'animating' &&
      state.lastResolution &&
      state.lastResolution !== this.lastProcessedResolution &&
      !this.isAnimating
    ) {
      this.lastProcessedResolution = state.lastResolution;
      this.playRoundAnimation(state.lastResolution, state);
    }
  }

  private async playRoundAnimation(resolution: RoundResolution, state: CombatState) {
    this.isAnimating = true;

    const { turnOrder, playerDamageDealt, playerDamageTaken, events } = resolution;
    const isCrit = events.some(e => e.toLowerCase().includes('crit'));
    const isPlayerCrit = events.some(e => e.toLowerCase().includes('critical') && e.toLowerCase().includes('player'));
    const isEnemyCrit = events.some(e => e.toLowerCase().includes('critical') && !e.toLowerCase().includes('player'));
    const blocked = events.some(e => e.toLowerCase().includes('block'));
    const dodged = events.some(e => e.toLowerCase().includes('dodge'));

    // Helper to animate one attack
    const animatePlayerAttack = async () => {
      if (!this.playerSprite || !this.enemySprite) return;
      if (playerDamageDealt > 0) {
        await this.playerSprite.playAttack(this.enemySprite.x);
        await this.enemySprite.playHit(playerDamageDealt, isPlayerCrit || isCrit, this.enemyElement);
        if (isPlayerCrit || isCrit) shakeCamera(this, 0.008, 150);
      }
    };

    const animateEnemyAttack = async () => {
      if (!this.playerSprite || !this.enemySprite) return;
      if (playerDamageTaken > 0) {
        await this.enemySprite.playAttack(this.playerSprite.x);
        await this.playerSprite.playHit(playerDamageTaken, isEnemyCrit, this.enemyElement);
        if (isEnemyCrit) shakeCamera(this, 0.008, 150);
      } else if (blocked) {
        // Show block text
        spawnDamageNumber(this, this.playerSprite.x, this.playerSprite.y - 40, 0, false, false);
      } else if (dodged) {
        // Show dodge text
        const dodgeText = this.add.text(this.playerSprite.x, this.playerSprite.y - 40, 'DODGE!', {
          fontFamily: 'MedievalSharp, serif',
          fontSize: '24px',
          color: '#4ade80',
          stroke: '#000',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(100);
        this.tweens.add({
          targets: dodgeText,
          y: dodgeText.y - 40,
          alpha: 0,
          duration: 1200,
          onComplete: () => dodgeText.destroy(),
        });
      }
    };

    // Animate based on turn order
    if (turnOrder === 'player_first') {
      await animatePlayerAttack();
      await this.delay(300);
      await animateEnemyAttack();
    } else if (turnOrder === 'enemy_first') {
      await animateEnemyAttack();
      await this.delay(300);
      await animatePlayerAttack();
    } else {
      // Simultaneous
      await Promise.all([animatePlayerAttack(), animateEnemyAttack()]);
    }

    // Update boss phase visuals based on remaining HP
    if (state.enemy.maxHp > 0) {
      const hpPercent = state.enemy.hp / state.enemy.maxHp;
      this.updateBossPhaseVisuals(hpPercent);
    }

    // Check for death animations
    if (state.enemy.hp <= 0 && this.enemySprite) {
      await this.delay(300);
      await this.enemySprite.playDeath();
      createVictoryParticles(this);
    }

    await this.delay(500);

    this.isAnimating = false;
    combatStore.onAnimationComplete();
  }

  private updateBossPhaseVisuals(hpPercent: number) {
    if (!this.phaseTint) return;

    if (hpPercent < 0.3) {
      // Intense red tint + screen shake
      this.tweens.add({
        targets: this.phaseTint,
        alpha: 0.25,
        duration: 500,
        ease: 'Power1',
      });
      shakeCamera(this, 0.004, 300);
    } else if (hpPercent < 0.6) {
      // Slight reddish tint
      this.tweens.add({
        targets: this.phaseTint,
        alpha: 0.12,
        duration: 500,
        ease: 'Power1',
      });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, resolve);
    });
  }

  private handleResize(width: number, height: number) {
    if (this.background) {
      this.background.setPosition(width / 2, height / 2);
      const bgScale = Math.max(width / this.background.width, height / this.background.height);
      this.background.setScale(bgScale);
    }
    if (this.vignette) {
      this.vignette.setPosition(width / 2, height / 2);
      this.vignette.setSize(width, height);
    }
    if (this.phaseTint) {
      this.phaseTint.setPosition(width / 2, height / 2);
      this.phaseTint.setSize(width, height);
    }
    if (this.enemySprite) {
      this.enemySprite.setPosition(width * 0.65, height * 0.38);
    }
    if (this.playerSprite) {
      this.playerSprite.setPosition(width * 0.25, height * 0.55);
    }
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
  }
}
