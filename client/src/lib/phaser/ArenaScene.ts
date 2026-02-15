import Phaser from 'phaser';
import { realtimeStore, type RealtimeEvent, type RealtimeResourceState } from '../stores/realtimeStore.svelte';
import { TopDownPlayer } from './sprites/TopDownPlayer';
import { TopDownEnemy } from './sprites/TopDownEnemy';
import { createSlashArc, createStanceChangeFlash, spawnRealtimeDamageNumber } from './effects/realtimeEffects';
import { getAllSpriteConfigs, PLAYER_SPRITE_CONFIGS } from './spriteConfig';
import type { Stance } from '../stores/types';

export class ArenaScene extends Phaser.Scene {
  private player: TopDownPlayer | null = null;
  private enemies: Map<string, TopDownEnemy> = new Map();
  private resourceNodes: Map<string, { graphics: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; data: RealtimeResourceState }> = new Map();
  private gatherPrompt: Phaser.GameObjects.Text | null = null;
  private gatherProgressBar: Phaser.GameObjects.Graphics | null = null;
  private unsubscribe: (() => void) | null = null;
  private frameCount = 0;
  private lastStance: Stance = 'balanced';

  private keys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    ONE: Phaser.Input.Keyboard.Key;
    TWO: Phaser.Input.Keyboard.Key;
    THREE: Phaser.Input.Keyboard.Key;
    FOUR: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    F: Phaser.Input.Keyboard.Key;
  } | null = null;

  private clickTarget: { x: number; y: number; attack?: boolean; enemyId?: string } | null = null;

  private floorGraphics: Phaser.GameObjects.Graphics | null = null;
  private wallGraphics: Phaser.GameObjects.Graphics | null = null;
  private vignetteGraphics: Phaser.GameObjects.Graphics | null = null;
  private darknessRT: Phaser.GameObjects.RenderTexture | null = null;
  private floorTiles: Phaser.GameObjects.TileSprite | null = null;
  private floorZone: string = '';
  private lightFlickerOffset: number = 0;
  private ambientParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor() {
    super({ key: 'ArenaScene' });
  }

  preload() {
    // Load all LPC sprite sheets
    const configs = getAllSpriteConfigs();
    for (const cfg of configs) {
      if (!this.textures.exists(cfg.key)) {
        this.load.spritesheet(cfg.key, cfg.path, {
          frameWidth: cfg.frameWidth,
          frameHeight: cfg.frameHeight,
        });
      }
    }
    // Load player sprite sheets
    for (const cfg of PLAYER_SPRITE_CONFIGS) {
      if (!this.textures.exists(cfg.key)) {
        this.load.spritesheet(cfg.key, cfg.path, {
          frameWidth: cfg.frameWidth,
          frameHeight: cfg.frameHeight,
        });
      }
    }
    // Load floor textures (now from tileset-extracted tiles)
    const floors = ['the_gate', 'tomb_halls', 'the_mines', 'the_web', 'forge_of_ruin', 'bone_throne', 'abyss'];
    for (const f of floors) {
      if (!this.textures.exists(`floor_${f}`)) {
        this.load.image(`floor_${f}`, `sprites/${f}.png?v=4`);
      }
    }
    // Load decorative props
    const props = ['prop_rock_small', 'prop_rock_med', 'prop_bush', 'prop_dark_rock'];
    for (const p of props) {
      if (!this.textures.exists(p)) {
        this.load.image(p, `sprites/${p}.png`);
      }
    }
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.createArenaFloor(w, h);
    this.createVignette(w, h);
    this.createAmbientParticles(w, h);

    // Camera zoom for claustrophobic feel
    // No zoom — arena is already compact

    if (this.input.keyboard) {
      this.keys = {
        W: this.input.keyboard.addKey('W'),
        A: this.input.keyboard.addKey('A'),
        S: this.input.keyboard.addKey('S'),
        D: this.input.keyboard.addKey('D'),
        ONE: this.input.keyboard.addKey('ONE'),
        TWO: this.input.keyboard.addKey('TWO'),
        THREE: this.input.keyboard.addKey('THREE'),
        FOUR: this.input.keyboard.addKey('FOUR'),
        Q: this.input.keyboard.addKey('Q'),
        E: this.input.keyboard.addKey('E'),
        F: this.input.keyboard.addKey('F'),
      };
    }

    // Click-to-move (right click moves, left click moves toward + attacks)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.clickTarget = { x: pointer.x, y: pointer.y, attack: false };
      } else if (pointer.leftButtonDown()) {
        // Check if clicking near an enemy
        for (const [enemyId, enemy] of this.enemies) {
          const dist = Math.sqrt((pointer.x - enemy.x) ** 2 + (pointer.y - enemy.y) ** 2);
          if (dist < 32) {
            this.clickTarget = { x: enemy.x, y: enemy.y, attack: true, enemyId: enemyId };
            return;
          }
        }
        this.clickTarget = { x: pointer.x, y: pointer.y, attack: false };
      }
    });

    // Clear click target when WASD is pressed
    if (this.keys) {
      const clearTarget = () => { this.clickTarget = null; };
      this.keys.W.on('down', clearTarget);
      this.keys.A.on('down', clearTarget);
      this.keys.S.on('down', clearTarget);
      this.keys.D.on('down', clearTarget);
    }

    // Disable right-click context menu
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.unsubscribe = realtimeStore.subscribe((state) => {
      this.handleStateUpdate(state);
    });

    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.createArenaFloor(gameSize.width, gameSize.height);
      this.createVignette(gameSize.width, gameSize.height);
      this.createAmbientParticles(gameSize.width, gameSize.height);
    });
  }

  private getZoneWallTheme(zone: string) {
    const themes: Record<string, { wallFill: number; wallStroke: number; wallTop: number; grout: number }> = {
      the_gate: { wallFill: 0x443828, wallStroke: 0x5a4a35, wallTop: 0x554838, grout: 0x1a1510 },
      tomb_halls: { wallFill: 0x333348, wallStroke: 0x44446a, wallTop: 0x3a3a55, grout: 0x141420 },
      the_mines: { wallFill: 0x443a28, wallStroke: 0x554a35, wallTop: 0x4e4230, grout: 0x1e1810 },
      the_web: { wallFill: 0x2a3a2a, wallStroke: 0x3a4a3a, wallTop: 0x324232, grout: 0x101a10 },
      forge_of_ruin: { wallFill: 0x4a2818, wallStroke: 0x663820, wallTop: 0x553020, grout: 0x1a0e05 },
      bone_throne: { wallFill: 0x302448, wallStroke: 0x443466, wallTop: 0x3a2c55, grout: 0x100c1e },
      abyss_bridge: { wallFill: 0x1e1e28, wallStroke: 0x2a2a38, wallTop: 0x242430, grout: 0x08080c },
      black_pit: { wallFill: 0x181820, wallStroke: 0x22222e, wallTop: 0x1e1e28, grout: 0x050508 },
    };
    return themes[zone] || themes.tomb_halls;
  }

  private getZoneFloorKey(zone: string): string {
    const map: Record<string, string> = {
      the_gate: 'floor_the_gate',
      tomb_halls: 'floor_tomb_halls',
      the_mines: 'floor_the_mines',
      the_web: 'floor_the_web',
      forge_of_ruin: 'floor_forge_of_ruin',
      bone_throne: 'floor_bone_throne',
      abyss_bridge: 'floor_abyss',
      black_pit: 'floor_abyss',
    };
    return map[zone] || 'floor_tomb_halls';
  }


  private createArenaFloor(w: number, h: number) {
    if (this.floorTiles) { this.floorTiles.destroy(); this.floorTiles = null; }
    if (this.floorGraphics) { this.floorGraphics.destroy(); this.floorGraphics = null; }
    if (this.wallGraphics) { this.wallGraphics.destroy(); this.wallGraphics = null; }

    const zone = realtimeStore.state.zone || 'tomb_halls';
    const floorKey = this.getZoneFloorKey(zone);
    const wallTheme = this.getZoneWallTheme(zone);

    // Use texture-based tiled floor if available
    if (this.textures.exists(floorKey)) {
      this.floorTiles = this.add.tileSprite(0, 0, w, h, floorKey);
      this.floorTiles.setOrigin(0, 0);
      this.floorTiles.setDepth(0);
    } else {
      // Fallback: solid color
      this.floorGraphics = this.add.graphics();
      this.floorGraphics.setDepth(0);
      this.floorGraphics.fillStyle(0x1a1a22, 1);
      this.floorGraphics.fillRect(0, 0, w, h);
    }

    // === WALLS (from arena data) ===
    const arena = realtimeStore.state.arena;
    if (arena) {
      const scaleX = w / arena.width;
      const scaleY = h / arena.height;

      this.wallGraphics = this.add.graphics();
      this.wallGraphics.setDepth(3);

      for (const wall of arena.walls) {
        const wx = wall.x * scaleX;
        const wy = wall.y * scaleY;
        const ww = wall.w * scaleX;
        const wh = wall.h * scaleY;

        // Wall shadow
        this.wallGraphics.fillStyle(0x000000, 0.3);
        this.wallGraphics.fillRect(wx + 3, wy + 3, ww, wh);

        // Wall body
        this.wallGraphics.fillStyle(wallTheme.wallFill, 0.95);
        this.wallGraphics.fillRect(wx, wy, ww, wh);

        // Wall top highlight
        this.wallGraphics.fillStyle(wallTheme.wallTop, 0.8);
        this.wallGraphics.fillRect(wx, wy, ww, 3);

        // Wall outline
        this.wallGraphics.lineStyle(1, wallTheme.wallStroke, 0.7);
        this.wallGraphics.strokeRect(wx, wy, ww, wh);

        // Brick pattern
        const brickH = 8;
        const brickW = 16;
        this.wallGraphics.lineStyle(1, wallTheme.grout, 0.2);
        for (let by = wy + brickH; by < wy + wh; by += brickH) {
          this.wallGraphics.lineBetween(wx, by, wx + ww, by);
        }
        for (let row = 0; row < Math.ceil(wh / brickH); row++) {
          const offset = (row % 2) * (brickW / 2);
          for (let bx = wx + offset; bx < wx + ww; bx += brickW) {
            this.wallGraphics.lineBetween(bx, wy + row * brickH, bx, wy + (row + 1) * brickH);
          }
        }
      }
    }

    // === BORDER ===
    if (!this.floorGraphics) {
      this.floorGraphics = this.add.graphics();
      this.floorGraphics.setDepth(2);
    }
    this.floorGraphics.lineStyle(2, wallTheme.wallStroke, 0.5);
    this.floorGraphics.strokeRect(4, 4, w - 8, h - 8);
  }

  // Dead code removed - old programmatic floor generation

  private createVignette(w: number, h: number) {
    if (this.vignetteGraphics) this.vignetteGraphics.destroy();
    // darkness RT is recreated in createVignette

    // === EDGE DARKNESS (heavy vignette) ===
    this.vignetteGraphics = this.add.graphics();
    this.vignetteGraphics.setDepth(42);

    // Multi-layer edge strips with increasing opacity
    const edgeLayers = [
      { size: 100, alpha: 0.08 },
      { size: 60, alpha: 0.15 },
      { size: 30, alpha: 0.25 },
      { size: 12, alpha: 0.35 },
    ];
    for (const { size, alpha } of edgeLayers) {
      this.vignetteGraphics.fillStyle(0x000000, alpha);
      this.vignetteGraphics.fillRect(0, 0, w, size); // top
      this.vignetteGraphics.fillRect(0, h - size, w, size); // bottom
      this.vignetteGraphics.fillRect(0, size, size, h - size * 2); // left
      this.vignetteGraphics.fillRect(w - size, size, size, h - size * 2); // right
    }

    // Corner darkness (extra dark in corners)
    const cornerSize = 150;
    for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
      for (let r = cornerSize; r > 20; r -= 10) {
        const t = r / cornerSize;
        this.vignetteGraphics.fillStyle(0x000000, t * 0.3);
        this.vignetteGraphics.fillCircle(cx, cy, r);
      }
    }

    // === DARKNESS with light holes (RenderTexture) ===
    if (this.darknessRT) this.darknessRT.destroy();
    this.darknessRT = this.add.renderTexture(0, 0, w, h);
    this.darknessRT.setOrigin(0, 0);
    this.darknessRT.setDepth(38); // Above enemies(15)/player(20), below vignette(42)/UI(50)

    // Pre-create radial light gradient texture if missing
    if (!this.textures.exists('light_gradient')) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
      grad.addColorStop(0.7, 'rgba(255,255,255,0.2)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      this.textures.addCanvas('light_gradient', canvas);
    }
  }

  private lightSprite: Phaser.GameObjects.Image | null = null;

  private updatePlayerLight() {
    if (!this.player || !this.darknessRT) return;
    const rt = this.darknessRT;

    // Clear completely, then redraw darkness with light holes
    rt.clear();
    rt.fill(0x000000, 1.0);

    // Create a reusable sprite for erasing if needed
    if (!this.lightSprite) {
      this.lightSprite = this.add.image(0, 0, 'light_gradient').setVisible(false);
    }

    // Player torch light with flicker — erase a big hole
    const px = this.player.x;
    const py = this.player.y;
    const flickerR = 260 + this.lightFlickerOffset;
    const s = (flickerR * 2) / 256;
    this.lightSprite.setScale(s);
    this.lightSprite.setAlpha(1);
    rt.erase(this.lightSprite, px, py);

    // NO enemy glow erase — enemies in darkness are hidden (true fog of war)
    // Only resources near player get a subtle glow
    this.lightSprite.setScale(0.3);
    this.lightSprite.setAlpha(0.5);
    for (const node of this.resourceNodes.values()) {
      if (node.data.isGathered) continue;
      const dx = node.graphics.x - px;
      const dy = node.graphics.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Only show resource glow if within player light range
      if (dist < flickerR * 0.8) {
        rt.erase(this.lightSprite, node.graphics.x, node.graphics.y);
      }
    }
  }

  private spawnHitParticles(x: number, y: number, color: number, count: number = 8) {
    if (!this.textures.exists('particle')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff);
      g.fillCircle(4, 4, 4);
      g.generateTexture('particle', 8, 8);
      g.destroy();
    }

    const emitter = this.add.particles(0, 0, 'particle', {
      x,
      y,
      speed: { min: 40, max: 100 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.4, end: 0 },
      lifespan: 500,
      tint: [color, color * 0.6],
      emitting: false,
    });
    emitter.setDepth(45);
    emitter.explode(count, x, y);
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private createAmbientParticles(w: number, h: number) {
    if (this.ambientParticles) this.ambientParticles.destroy();

    // Create particle texture if it doesn't exist
    if (!this.textures.exists('particle')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff);
      g.fillCircle(4, 4, 4);
      g.generateTexture('particle', 8, 8);
      g.destroy();
    }

    // Drifting fog/dust particles across arena floor
    this.ambientParticles = this.add.particles(0, 0, 'particle', {
      x: { min: 0, max: w },
      y: { min: 0, max: h },
      speed: { min: 5, max: 15 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.4, end: 0.2 },
      alpha: { start: 0.15, end: 0.05 },
      lifespan: { min: 3000, max: 5000 },
      tint: [0x666666, 0x444444, 0x555544],
      frequency: 150,
      maxAliveParticles: 25,
    });
    this.ambientParticles.setDepth(1);
  }

  private envPropSprites: Phaser.GameObjects.Image[] = [];

  private createEnvironmentProps(w: number, h: number) {
    // Clean up old props
    for (const s of this.envPropSprites) s.destroy();
    this.envPropSprites = [];

    const zone = realtimeStore.state.zone || 'tomb_halls';
    let seed = zone.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = () => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };

    const propKeys = ['prop_rock_small', 'prop_rock_med', 'prop_bush', 'prop_dark_rock'];
    const available = propKeys.filter(k => this.textures.exists(k));
    if (available.length === 0) return;

    const margin = 60;
    const propsCount = Math.floor(random() * 4) + 4; // 4-7 props

    for (let i = 0; i < propsCount; i++) {
      const x = margin + random() * (w - margin * 2);
      const y = margin + random() * (h - margin * 2);
      const key = available[Math.floor(random() * available.length)];
      const scale = 0.4 + random() * 0.4; // 0.4-0.8 scale
      const alpha = 0.5 + random() * 0.3; // subtle

      const img = this.add.image(x, y, key);
      img.setScale(scale);
      img.setAlpha(alpha);
      img.setDepth(1);
      // Slight random tint to match zone darkness
      img.setTint(0x888888);
      this.envPropSprites.push(img);
    }
  }

  update() {
    this.frameCount++;

    const state = realtimeStore.state;
    if (state.status !== 'active' || !state.player) return;

    // Send input every 3 frames (~20 inputs/sec at 60fps)
    if (this.frameCount % 3 === 0) {
      this.sendInputToServer();
    }

    // Process events from server
    const events = realtimeStore.consumeEvents();
    for (const event of events) {
      this.handleEvent(event);
    }

    // Flicker the player light (torch effect)
    this.lightFlickerOffset = (Math.random() - 0.5) * 10;

    // Update player light every frame for smooth darkness
    this.updatePlayerLight();
  }

  private sendInputToServer() {
    if (!this.keys) return;

    let moveX = 0;
    let moveY = 0;
    if (this.keys.A.isDown) moveX = -1;
    if (this.keys.D.isDown) moveX = 1;
    if (this.keys.W.isDown) moveY = -1;
    if (this.keys.S.isDown) moveY = 1;

    // Click-to-move: compute direction toward click target
    let clickAttacking = false;
    if (moveX === 0 && moveY === 0 && this.clickTarget && this.player) {
      // If targeting an enemy, update target position to track them
      if (this.clickTarget.attack && this.clickTarget.enemyId) {
        const enemy = this.enemies.get(this.clickTarget.enemyId);
        if (enemy) {
          this.clickTarget.x = enemy.x;
          this.clickTarget.y = enemy.y;
        }
      }

      const dx = this.clickTarget.x - this.player.x;
      const dy = this.clickTarget.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (this.clickTarget.attack && dist < 55) {
        // In attack range — stop and attack
        clickAttacking = true;
        moveX = 0;
        moveY = 0;
      } else if (dist > 8) {
        moveX = dx / dist;
        moveY = dy / dist;
      } else {
        this.clickTarget = null;
      }
    }

    // Always auto-attack when near an enemy
    const attacking = true;

    let stanceChange: Stance | null = null;
    if (this.keys.ONE.isDown) stanceChange = 'aggressive';
    if (this.keys.TWO.isDown) stanceChange = 'balanced';
    if (this.keys.THREE.isDown) stanceChange = 'defensive';
    if (this.keys.FOUR.isDown) stanceChange = 'evasive';

    let abilitySlot: number | null = null;
    if (this.keys.Q.isDown) abilitySlot = 0;
    if (this.keys.E.isDown) abilitySlot = 1;

    // Gather input - F key near a resource
    const gather = this.keys.F.isDown;

    realtimeStore.sendInput({
      moveX,
      moveY,
      attacking,
      abilitySlot,
      stanceChange,
      gather,
    });
  }

  private handleStateUpdate(state: any) {
    if (!state.player) return;

    const w = this.scale.width;
    const h = this.scale.height;
    const arena = state.arena;
    if (!arena) return;

    // Redraw floor when zone data first arrives
    if (state.zone && state.zone !== this.floorZone) {
      this.floorZone = state.zone;
      this.createArenaFloor(w, h);
      this.createVignette(w, h);
      this.createEnvironmentProps(w, h);
    }

    const scaleX = w / arena.width;
    const scaleY = h / arena.height;

    // Update or create player sprite
    const px = state.player.x * scaleX;
    const py = state.player.y * scaleY;

    if (!this.player) {
      this.player = new TopDownPlayer(this, px, py);
    }
    this.player.update(px, py, state.player.facing, state.player.stance, state.player.gatheringResource, state.player.attackCooldown);

    // Check for stance change
    if (state.player.stance !== this.lastStance) {
      createStanceChangeFlash(this, this.player.x, this.player.y, state.player.stance);
      this.lastStance = state.player.stance;
    }

    // Update or create enemy sprites
    const currentEnemyIds = new Set<string>();
    for (const enemyData of state.enemies) {
      currentEnemyIds.add(enemyData.id);
      const ex = enemyData.x * scaleX;
      const ey = enemyData.y * scaleY;

      let enemy = this.enemies.get(enemyData.id);
      if (!enemy) {
        enemy = new TopDownEnemy(
          this, enemyData.id, ex, ey,
          enemyData.name, enemyData.archetype, enemyData.element, enemyData.maxHp,
          enemyData.mobId,
        );
        this.enemies.set(enemyData.id, enemy);
      }
      enemy.update(ex, ey, enemyData.hp, enemyData.aiState, enemyData.facing);

      // Fog of war: hide enemies outside player light radius
      if (this.player) {
        const dx = ex - this.player.x;
        const dy = ey - this.player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const lightRadius = 260 + this.lightFlickerOffset;
        enemy.setVisible(dist < lightRadius * 0.85);
      }
    }

    // Remove dead enemies that are no longer in state
    for (const [id, enemy] of this.enemies) {
      if (!currentEnemyIds.has(id)) {
        enemy.playDeath().then(() => {
          this.enemies.delete(id);
        });
      }
    }

    // Update resource nodes
    this.updateResourceNodes(state, scaleX, scaleY);
  }

  private handleEvent(event: RealtimeEvent) {
    const w = this.scale.width;
    const h = this.scale.height;
    const arena = realtimeStore.state.arena;
    if (!arena) return;

    const scaleX = w / arena.width;
    const scaleY = h / arena.height;

    const x = (event.x || 0) * scaleX;
    const y = (event.y || 0) * scaleY;

    switch (event.type) {
      case 'damage': {
        const dmg = event.damage || event.value || 0;
        const isCrit = !!event.crit;
        const targetId = event.targetId as string | undefined;

        if (this.player && targetId && targetId !== 'player') {
          // Player dealing damage to enemy
          const enemy = this.enemies.get(targetId);
          if (enemy) {
            // Knockback
            const dx = enemy.x - this.player.x;
            const dy = enemy.y - this.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
              enemy.knockback(dx / dist * 8, dy / dist * 8);
            }

            // White flash
            enemy.flashWhite();

            // Blood particles
            this.spawnHitParticles(enemy.x, enemy.y, 0xaa0000);

            createSlashArc(this, enemy.x, enemy.y, 'right', 0xff6b35);
          }
          spawnRealtimeDamageNumber(this, x, y, dmg, isCrit);

          // Player attack animation
          if (this.player) this.player.triggerAttack();

          // Crit: freeze frame + screen shake
          if (isCrit) {
            this.cameras.main.shake(100, 0.005);
          }
        } else if (this.player && targetId === 'player') {
          // Player taking damage
          spawnRealtimeDamageNumber(this, this.player.x, this.player.y - 10, dmg, false);

          // Screen shake
          this.cameras.main.shake(80, 0.003);

          // Red flash overlay
          const flash = this.add.graphics();
          flash.fillStyle(0xff0000, 0.15);
          flash.fillRect(0, 0, this.scale.width, this.scale.height);
          flash.setDepth(50);
          this.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 150,
            onComplete: () => flash.destroy(),
          });
        }
        break;
      }
      case 'crit': {
        // Freeze frame on crit
        this.scene.pause();
        setTimeout(() => this.scene.resume(), 30);
        
        // Screen shake (stronger)
        this.cameras.main.shake(100, 0.005);
        
        // White screen flash
        const flash = this.add.graphics();
        flash.fillStyle(0xffffff, 0.1);
        flash.fillRect(0, 0, this.scale.width, this.scale.height);
        flash.setDepth(50);
        this.tweens.add({
          targets: flash,
          alpha: 0,
          duration: 100,
          onComplete: () => flash.destroy(),
        });
        
        // Bigger crit number with bounce
        const critText = this.add.text(x, y - 10, `${event.value || 0}!`, {
          fontFamily: 'MedievalSharp, serif',
          fontSize: '24px',
          color: '#ffd700',
          stroke: '#000000',
          strokeThickness: 4,
          fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(50);
        
        this.tweens.add({
          targets: critText,
          y: y - 50,
          alpha: 0,
          scale: { from: 1.3, to: 1.0 },
          duration: 900,
          ease: 'Back.easeOut',
          onComplete: () => critText.destroy(),
        });
        
        // Blood particles (more for crit)
        if (event.targetId) {
          const enemy = this.enemies.get(event.targetId);
          if (enemy) this.spawnHitParticles(enemy.x, enemy.y, 0xaa0000, 12);
        }
        
        break;
      }
      case 'dodge': {
        const dodgeText = this.add.text(x, y - 10, 'DODGE', {
          fontSize: '14px',
          color: '#4ade80',
          fontFamily: 'MedievalSharp, serif',
          stroke: '#000',
          strokeThickness: 2,
        }).setOrigin(0.5).setDepth(50);
        this.tweens.add({
          targets: dodgeText,
          y: y - 40,
          alpha: 0,
          duration: 600,
          onComplete: () => dodgeText.destroy(),
        });
        break;
      }
      case 'block': {
        const blockText = this.add.text(x, y - 10, 'BLOCK', {
          fontSize: '14px',
          color: '#3b82f6',
          fontFamily: 'MedievalSharp, serif',
          stroke: '#000',
          strokeThickness: 2,
        }).setOrigin(0.5).setDepth(50);
        this.tweens.add({
          targets: blockText,
          y: y - 40,
          alpha: 0,
          duration: 600,
          onComplete: () => blockText.destroy(),
        });
        break;
      }
      case 'gather': {
        // Floating "+1 Resource Name" text
        const name = (event as any).name || 'Resource';
        if (this.player) {
          const gatherText = this.add.text(this.player.x, this.player.y - 20, `+1 ${name}`, {
            fontSize: '14px',
            color: '#FFD700',
            fontFamily: 'MedievalSharp, serif',
            stroke: '#000',
            strokeThickness: 3,
          }).setOrigin(0.5).setDepth(50);
          this.tweens.add({
            targets: gatherText,
            y: this.player.y - 60,
            alpha: 0,
            duration: 1200,
            onComplete: () => gatherText.destroy(),
          });
        }
        break;
      }
      case 'death': {
        const deadEnemy = this.enemies.get(event.targetId || '');
        if (deadEnemy) {
          deadEnemy.playDeath().then(() => {
            this.enemies.delete(event.targetId || '');
          });
        }
        break;
      }
    }
  }

  private getResourceStyle(resourceId: string, rarity: string): { color: number; glowColor: number; type: 'mining' | 'organic' | 'treasure' | 'arcane' } {
    const miningIds = ['torchwood', 'iron_scraps', 'dark_iron', 'cursed_steel', 'grave_iron'];
    const organicIds = ['herbs', 'spider_silk', 'shadow_thread', 'venom_sac'];
    const treasureIds = ['bone_dust', 'ancient_coins', 'gems', 'ember_core', 'starsilver_ore'];
    // arcane = everything else

    if (miningIds.includes(resourceId)) return { color: 0x8B7355, glowColor: 0xAA9966, type: 'mining' };
    if (organicIds.includes(resourceId)) return { color: 0x44AA55, glowColor: 0x66DD77, type: 'organic' };
    if (treasureIds.includes(resourceId)) return { color: 0xDDAA33, glowColor: 0xFFCC44, type: 'treasure' };
    return { color: 0x9955EE, glowColor: 0xBB77FF, type: 'arcane' };
  }

  private drawResourceNode(g: Phaser.GameObjects.Graphics, style: ReturnType<typeof this.getResourceStyle>, rarity: string): void {
    // Outer glow
    const glowAlpha = rarity === 'legendary' ? 0.4 : rarity === 'rare' ? 0.3 : 0.2;
    g.fillStyle(style.glowColor, glowAlpha * 0.3);
    g.fillCircle(0, 0, 18);
    g.fillStyle(style.glowColor, glowAlpha * 0.5);
    g.fillCircle(0, 0, 12);

    switch (style.type) {
      case 'mining': {
        // Rock shape
        g.fillStyle(0x666055, 0.9);
        g.fillTriangle(-8, 4, 0, -8, 8, 4);
        g.fillStyle(style.color, 0.9);
        g.fillTriangle(-6, 3, 0, -6, 6, 3);
        // Sparkle
        g.fillStyle(0xFFFFFF, 0.6);
        g.fillCircle(2, -3, 1.5);
        g.fillCircle(-3, 0, 1);
        break;
      }
      case 'organic': {
        // Cluster of small circles
        g.fillStyle(style.color, 0.7);
        g.fillCircle(-3, -2, 5);
        g.fillCircle(3, -1, 4);
        g.fillCircle(0, 3, 4.5);
        g.fillStyle(style.glowColor, 0.5);
        g.fillCircle(-2, -1, 2);
        g.fillCircle(2, 1, 1.5);
        break;
      }
      case 'treasure': {
        // Crystal/gem shape
        g.fillStyle(style.color, 0.9);
        g.fillTriangle(0, -8, -5, 0, 5, 0);
        g.fillStyle(style.glowColor, 0.7);
        g.fillTriangle(0, -8, -3, -1, 3, -1);
        g.fillRect(-5, 0, 10, 4);
        // Sparkles
        g.fillStyle(0xFFFFFF, 0.8);
        g.fillCircle(-1, -4, 1);
        g.fillCircle(3, 2, 0.8);
        break;
      }
      case 'arcane': {
        // Rune circle
        g.lineStyle(2, style.color, 0.7);
        g.strokeCircle(0, 0, 7);
        g.lineStyle(1, style.glowColor, 0.5);
        g.strokeCircle(0, 0, 4);
        // Inner symbol
        g.fillStyle(style.glowColor, 0.6);
        g.fillTriangle(0, -4, -3, 2, 3, 2);
        g.fillStyle(style.color, 0.8);
        g.fillCircle(0, 0, 2);
        break;
      }
    }

    // Rarity indicator
    if (rarity === 'rare' || rarity === 'legendary') {
      const rarityColor = rarity === 'legendary' ? 0xFFD700 : 0xAA55FF;
      g.fillStyle(rarityColor, 0.6);
      g.fillCircle(0, -12, 2);
    }
  }

  private updateResourceNodes(state: any, scaleX: number, scaleY: number): void {
    const resources: RealtimeResourceState[] = state.resources || [];
    const currentIds = new Set<string>();

    for (const res of resources) {
      currentIds.add(res.id);
      const sx = res.x * scaleX;
      const sy = res.y * scaleY;

      let node = this.resourceNodes.get(res.id);

      if (!node) {
        // Create new resource node
        const style = this.getResourceStyle(res.resourceId, res.rarity);
        const g = this.add.graphics();
        g.setDepth(39);
        g.setPosition(sx, sy);
        this.drawResourceNode(g, style, res.rarity);

        const label = this.add.text(sx, sy - 22, res.name, {
          fontSize: '10px',
          color: '#cccccc',
          fontFamily: 'MedievalSharp, serif',
          stroke: '#000',
          strokeThickness: 2,
        }).setOrigin(0.5).setDepth(39);

        node = { graphics: g, label, data: res };
        this.resourceNodes.set(res.id, node);
      }

      // Update data
      node.data = res;

      // Handle gathered state
      if (res.isGathered && node.graphics.alpha > 0) {
        this.tweens.add({
          targets: [node.graphics, node.label],
          alpha: 0,
          scale: 0.5,
          duration: 500,
          onComplete: () => {
            node!.graphics.destroy();
            node!.label.destroy();
            this.resourceNodes.delete(res.id);
          },
        });
      }
    }

    // Remove nodes no longer in state
    for (const [id, node] of this.resourceNodes) {
      if (!currentIds.has(id)) {
        node.graphics.destroy();
        node.label.destroy();
        this.resourceNodes.delete(id);
      }
    }

    // Update gather prompt and progress bar
    this.updateGatherUI(scaleX, scaleY);
  }

  private updateGatherUI(scaleX: number, scaleY: number): void {
    const state = realtimeStore.state;
    if (!this.player || !state.player) {
      if (this.gatherPrompt) { this.gatherPrompt.setVisible(false); }
      if (this.gatherProgressBar) { this.gatherProgressBar.setVisible(false); }
      return;
    }

    // Find nearest ungathered resource
    let nearestRes: RealtimeResourceState | null = null;
    let nearestDist = 40; // screen pixels threshold
    const px = this.player.x;
    const py = this.player.y;

    for (const res of state.resources) {
      if (res.isGathered) continue;
      const rx = res.x * scaleX;
      const ry = res.y * scaleY;
      const dist = Math.sqrt((px - rx) ** 2 + (py - ry) ** 2);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestRes = res;
      }
    }

    // Gather prompt
    if (!this.gatherPrompt) {
      this.gatherPrompt = this.add.text(0, 0, '[F] Gather', {
        fontSize: '12px',
        color: '#FFD700',
        fontFamily: 'MedievalSharp, serif',
        stroke: '#000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(50);
    }

    // Progress bar
    if (!this.gatherProgressBar) {
      this.gatherProgressBar = this.add.graphics();
      this.gatherProgressBar.setDepth(50);
    }

    if (nearestRes && !nearestRes.gatheringBy) {
      const rx = nearestRes.x * scaleX;
      const ry = nearestRes.y * scaleY;
      this.gatherPrompt.setPosition(rx, ry + 18);
      this.gatherPrompt.setVisible(true);
      this.gatherProgressBar.setVisible(false);
    } else if (nearestRes && nearestRes.gatheringBy === 'player') {
      // Show progress bar
      const rx = nearestRes.x * scaleX;
      const ry = nearestRes.y * scaleY;
      this.gatherPrompt.setVisible(false);

      const ticksNeeded = nearestRes.gatherTime * 5;
      const progress = Math.min(1, nearestRes.gatherProgress / ticksNeeded);

      this.gatherProgressBar.clear();
      this.gatherProgressBar.setPosition(rx - 20, ry + 14);
      // Background
      this.gatherProgressBar.fillStyle(0x000000, 0.7);
      this.gatherProgressBar.fillRect(0, 0, 40, 6);
      // Fill
      const barColor = progress < 0.5 ? 0xFFAA00 : 0x44DD44;
      this.gatherProgressBar.fillStyle(barColor, 0.9);
      this.gatherProgressBar.fillRect(1, 1, 38 * progress, 4);
      // Border
      this.gatherProgressBar.lineStyle(1, 0xFFFFFF, 0.5);
      this.gatherProgressBar.strokeRect(0, 0, 40, 6);
      this.gatherProgressBar.setVisible(true);
    } else {
      this.gatherPrompt.setVisible(false);
      this.gatherProgressBar.setVisible(false);
    }
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.player) this.player.destroy();
    for (const enemy of this.enemies.values()) {
      enemy.destroy();
    }
    this.enemies.clear();
    for (const node of this.resourceNodes.values()) {
      node.graphics.destroy();
      node.label.destroy();
    }
    this.resourceNodes.clear();
    if (this.gatherPrompt) this.gatherPrompt.destroy();
    if (this.gatherProgressBar) this.gatherProgressBar.destroy();
  }
}
