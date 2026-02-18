import * as THREE from 'three';
import { builderStore, GRID_CELL } from '../stores/builderStore.svelte';
import { BuilderCamera } from './BuilderCamera';
import { buildDungeon, disposeDungeon, arenaToWorld, worldToArena, ARENA_SCALE, type DungeonGeometry } from './DungeonBuilder';
import { createDungeonLighting, updateZoneLighting, getZoneFogConfig, type DungeonLighting } from './lighting';
import { getZoneTheme } from './materials';
import { preloadWallAsset, getLoadedWallAsset } from './WallAssetLoader';
import { loadBuilderAsset, getCatalogEntry, getCachedAnimationClipNames } from './BuilderAssetCatalog';
import { createPixelBlockRenderer, type PixelBlockHandle } from './PixelBlockRenderer';

const WORLD_CELL = GRID_CELL * ARENA_SCALE; // 2 world units per grid cell

export class BuilderScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private builderCamera: BuilderCamera;
  private lighting: DungeonLighting;

  private dungeon: DungeonGeometry | null = null;
  private pixelBlocks: PixelBlockHandle | null = null;
  private currentZone = '';

  // Grid overlay
  private gridOverlay: THREE.Mesh | null = null;

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Wall painting state
  private isPainting = false;
  private previewGroup = new THREE.Group();
  private previewCells = new Map<string, THREE.Mesh>();
  private previewMaterial = new THREE.MeshBasicMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  private eraseMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4444,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });

  // Placement markers
  private markersGroup = new THREE.Group();
  private spawnMarker: THREE.Group | null = null;
  private exitMarker: THREE.Group | null = null;
  private enemyMarkers = new Map<string, THREE.Group>();
  private resourceMarkers = new Map<string, THREE.Group>();
  private propMarkers = new Map<string, THREE.Group>();
  private propsLoading = new Set<string>(); // track in-flight async loads
  private selectionRing: THREE.Mesh | null = null;

  // Animation mixer management for props
  private propMixers = new Map<string, THREE.AnimationMixer>();
  private propClips = new Map<string, THREE.AnimationClip[]>();
  private propCurrentClip = new Map<string, string>();

  // Click-vs-drag detection for select tool
  private mouseDownPos = new THREE.Vector2();
  private mouseDownTime = 0;

  // Event handlers
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onContextMenu: (e: MouseEvent) => void;
  private onKeyDownHandler: (e: KeyboardEvent) => void;
  private onResize: () => void;

  private animationId: number | null = null;
  private clock = new THREE.Clock();
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 2.2;
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080c12);
    const fogConfig = getZoneFogConfig('tomb_halls');
    this.scene.fog = new THREE.FogExp2(fogConfig.color, fogConfig.density * 0.5); // less fog in builder

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );

    // Camera controller
    this.builderCamera = new BuilderCamera(this.camera, container);
    this.builderCamera.centerOnArena(builderStore.arenaWidth, builderStore.arenaHeight);

    // Lighting
    this.lighting = createDungeonLighting(this.scene, 'tomb_halls');
    // Position directional light to cover whole arena
    this.lighting.directional.position.set(0, 30, 0);
    this.lighting.directional.target.position.set(0, 0, 0);
    // Move torch to center with wide radius
    this.lighting.torch.position.set(0, 10, 0);
    this.lighting.torch.intensity = 5;
    this.lighting.torch.distance = 200;

    // Preview group
    this.scene.add(this.previewGroup);
    this.scene.add(this.markersGroup);

    // Create grid overlay
    this.createGridOverlay();

    // Event handlers
    this.onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
    this.onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    this.onMouseUp = (e: MouseEvent) => this.handleMouseUp(e);
    this.onContextMenu = (e: MouseEvent) => e.preventDefault();
    this.onKeyDownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.onResize = () => this.handleResize();

    container.addEventListener('mousedown', this.onMouseDown);
    container.addEventListener('mousemove', this.onMouseMove);
    container.addEventListener('mouseup', this.onMouseUp);
    container.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDownHandler);
    window.addEventListener('resize', this.onResize);

    // Create selection ring
    const ringGeo = new THREE.RingGeometry(1.0, 1.3, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.05;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    // Preload wall asset, then build initial dungeon
    preloadWallAsset().catch(() => {}).finally(() => {
      if (this.disposed) return;
      this.rebuildDungeon();
    });

    // Start render loop
    this.animate();
  }

  private createGridOverlay() {
    if (this.gridOverlay) {
      this.scene.remove(this.gridOverlay);
      this.gridOverlay.geometry.dispose();
      (this.gridOverlay.material as THREE.Material).dispose();
    }

    const arenaW = builderStore.arenaWidth * ARENA_SCALE;
    const arenaH = builderStore.arenaHeight * ARENA_SCALE;

    const gridShaderMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uCellSize: { value: WORLD_CELL },
        uColor: { value: new THREE.Color(0x44aaff) },
        uOpacity: { value: 0.15 },
        uArenaSize: { value: new THREE.Vector2(arenaW, arenaH) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uCellSize;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform vec2 uArenaSize;
        varying vec3 vWorldPos;
        void main() {
          vec2 grid = abs(fract(vWorldPos.xz / uCellSize + 0.5) - 0.5);
          float line = 1.0 - smoothstep(0.02, 0.06, min(grid.x, grid.y));
          if (line < 0.01) discard;
          gl_FragColor = vec4(uColor, line * uOpacity);
        }
      `,
    });

    const planeGeo = new THREE.PlaneGeometry(arenaW, arenaH);
    this.gridOverlay = new THREE.Mesh(planeGeo, gridShaderMat);
    this.gridOverlay.rotation.x = -Math.PI / 2;
    this.gridOverlay.position.y = 0.01;
    this.scene.add(this.gridOverlay);
  }

  rebuildDungeon() {
    if (this.dungeon) {
      disposeDungeon(this.dungeon);
      this.dungeon = null;
    }
    if (this.pixelBlocks) {
      this.pixelBlocks.dispose();
      this.scene.remove(this.pixelBlocks.group);
      this.pixelBlocks = null;
    }

    const arena = builderStore.toArenaData();
    const zone = builderStore.zone;
    this.currentZone = zone;
    const wallAsset = getLoadedWallAsset() || undefined;
    const style = builderStore.blockStyle;

    if (style?.enabled) {
      // Skeleton only — boundary walls, torches, pillars (no floor or interior walls)
      this.dungeon = buildDungeon(arena, zone, wallAsset, { skipFloor: true, skipInteriorWalls: true });
      this.scene.add(this.dungeon.group);

      // Instanced pixel blocks for floor + interior walls
      this.pixelBlocks = createPixelBlockRenderer();
      this.scene.add(this.pixelBlocks.group);
      const arenaW = builderStore.arenaWidth * ARENA_SCALE;
      const arenaH = builderStore.arenaHeight * ARENA_SCALE;
      this.pixelBlocks.rebuild(
        builderStore.wallGrid,
        builderStore.gridW,
        builderStore.gridH,
        arenaW,
        arenaH,
        style,
      );
    } else {
      // Classic procedural mode
      this.dungeon = buildDungeon(arena, zone, wallAsset);
      this.scene.add(this.dungeon.group);
    }

    // Update zone visuals
    updateZoneLighting(this.lighting, zone);
    const theme = getZoneTheme(zone);
    this.scene.background = new THREE.Color(theme.fogColor);
    const fogConfig = getZoneFogConfig(zone);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(fogConfig.color);
      this.scene.fog.density = fogConfig.density * 0.5;
    }

    // Rebuild grid overlay
    this.createGridOverlay();
    this.gridOverlay!.visible = builderStore.showGrid;

    // Rebuild all markers
    this.rebuildMarkers();
  }

  private rebuildMarkers() {
    // Clear existing non-prop markers
    // (props are handled differentially below because they load async)
    for (const child of [...this.markersGroup.children]) {
      if (this.propMarkers.has((child as THREE.Group).userData?.entityId)) continue;
      this.markersGroup.remove(child);
      if (child instanceof THREE.Group) {
        child.traverse(c => {
          if (c instanceof THREE.Mesh) {
            c.geometry.dispose();
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
            else (c.material as THREE.Material).dispose();
          }
        });
      }
    }
    this.spawnMarker = null;
    this.exitMarker = null;
    this.enemyMarkers.clear();
    this.resourceMarkers.clear();

    // Player spawn
    if (builderStore.playerSpawn) {
      this.createSpawnMarker(builderStore.playerSpawn.x, builderStore.playerSpawn.y);
    }

    // Exit portal
    if (builderStore.exitPosition) {
      this.createExitMarker(builderStore.exitPosition.x, builderStore.exitPosition.y);
    }

    // Enemies
    for (const enemy of builderStore.enemies) {
      this.createEnemyMarker(enemy);
    }

    // Resources
    for (const resource of builderStore.resources) {
      this.createResourceMarker(resource);
    }

    // --- Props ---
    const currentPropIds = new Set(builderStore.props.map(p => p.id));

    // Remove stale prop markers
    for (const [id, group] of this.propMarkers) {
      if (!currentPropIds.has(id)) {
        this.markersGroup.remove(group);
        group.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else (child.material as THREE.Material).dispose();
          }
        });
        this.propMarkers.delete(id);
        // Clean up animation state
        const mixer = this.propMixers.get(id);
        if (mixer) {
          mixer.stopAllAction();
          mixer.uncacheRoot(group);
          this.propMixers.delete(id);
        }
        this.propClips.delete(id);
        this.propCurrentClip.delete(id);
      }
    }

    // Add/update prop markers
    for (const prop of builderStore.props) {
      const entry = getCatalogEntry(prop.catalogId);
      if (!entry) continue;

      const world = arenaToWorld(prop.x, prop.y);

      if (this.propMarkers.has(prop.id)) {
        // Update position/rotation/scale (keep existing groundOffset)
        const group = this.propMarkers.get(prop.id)!;
        const groundOffset = (group.userData.groundOffset ?? 0) * entry.defaultScale * prop.scale;
        group.position.set(world.x, groundOffset, world.z);
        group.rotation.y = prop.rotation;
        group.scale.setScalar(entry.defaultScale * prop.scale);
      } else if (!this.propsLoading.has(prop.id)) {
        // Load and place new prop (async) — skip if already loading
        const propId = prop.id;
        this.propsLoading.add(propId);

        loadBuilderAsset(prop.catalogId).then(({ model, animations }) => {
          this.propsLoading.delete(propId);
          if (this.disposed) return;

          // Re-read latest prop state (may have moved/changed while loading)
          const currentProp = builderStore.props.find(p => p.id === propId);
          if (!currentProp) return; // removed while loading

          const currentEntry = getCatalogEntry(currentProp.catalogId);
          if (!currentEntry) return;

          const currentWorld = arenaToWorld(currentProp.x, currentProp.y);
          const scale = currentEntry.defaultScale * currentProp.scale;
          const groundOffset = (model.userData.groundOffset ?? 0) * scale;

          model.scale.setScalar(scale);
          model.position.set(currentWorld.x, groundOffset, currentWorld.z);
          model.rotation.y = currentProp.rotation;
          model.userData.entityId = propId;
          model.userData.entityType = 'prop';
          model.userData.groundOffset = model.userData.groundOffset ?? 0;

          model.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Remove any stale model for this prop (shouldn't happen now, but defensive)
          const existing = this.propMarkers.get(propId);
          if (existing) {
            this.markersGroup.remove(existing);
          }

          this.propMarkers.set(propId, model);
          this.markersGroup.add(model);

          // Set up animation mixer if clips exist
          if (animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            this.propMixers.set(propId, mixer);
            this.propClips.set(propId, animations);
            // Auto-play Idle or first clip
            const idleClip = animations.find(c => c.name.toLowerCase().includes('idle')) || animations[0];
            mixer.clipAction(idleClip).play();
            this.propCurrentClip.set(propId, idleClip.name);
          }
        }).catch(err => {
          this.propsLoading.delete(propId);
          console.warn(`[BuilderScene] Failed to load prop ${prop.catalogId}:`, err);
        });
      }
    }
  }

  private createSpawnMarker(arenaX: number, arenaY: number) {
    const world = arenaToWorld(arenaX, arenaY);
    const group = new THREE.Group();
    group.position.set(world.x, 0, world.z);

    // Green cylinder
    const geo = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x44ff88,
      emissive: 0x22aa44,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8,
    });
    const disc = new THREE.Mesh(geo, mat);
    disc.position.y = 0.05;
    group.add(disc);

    // Arrow pointing up
    const arrowGeo = new THREE.ConeGeometry(0.3, 1.0, 8);
    const arrowMat = new THREE.MeshStandardMaterial({
      color: 0x44ff88,
      emissive: 0x22aa44,
      emissiveIntensity: 0.8,
    });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.y = 0.7;
    group.add(arrow);

    this.markersGroup.add(group);
    this.spawnMarker = group;
  }

  private createExitMarker(arenaX: number, arenaY: number) {
    const world = arenaToWorld(arenaX, arenaY);
    const group = new THREE.Group();
    group.position.set(world.x, 0, world.z);

    // Floor ring
    const ringGeo = new THREE.RingGeometry(1.2, 2.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);

    // Vertical beam
    const beamGeo = new THREE.CylinderGeometry(0.3, 0.8, 5, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 2.5;
    group.add(beam);

    // Point light
    const light = new THREE.PointLight(0x00ffaa, 5, 20);
    light.position.y = 3;
    group.add(light);

    this.markersGroup.add(group);
    this.exitMarker = group;
  }

  private createEnemyMarker(enemy: { id: string; archetype: string; element: string; x: number; y: number }) {
    const world = arenaToWorld(enemy.x, enemy.y);
    const group = new THREE.Group();
    group.position.set(world.x, 0, world.z);
    group.userData.entityId = enemy.id;
    group.userData.entityType = 'enemy';

    // Archetype-colored sphere
    const archetypeColors: Record<string, number> = {
      brute: 0xa05028,
      guardian: 0x6a7a6a,
      assassin: 0x3a6a3a,
      caster: 0x7a4a7a,
      boss: 0xcc4422,
    };
    const color = archetypeColors[enemy.archetype] || 0x666666;

    const sphereGeo = new THREE.SphereGeometry(0.6, 12, 8);
    const sphereMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      roughness: 0.6,
      metalness: 0.2,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.y = 0.8;
    sphere.castShadow = true;
    group.add(sphere);

    // Red eye dots
    const eyeGeo = new THREE.SphereGeometry(0.1, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.2, 0.9, 0.45);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.2, 0.9, 0.45);
    group.add(rightEye);

    this.markersGroup.add(group);
    this.enemyMarkers.set(enemy.id, group);
  }

  private createResourceMarker(resource: { id: string; resourceId: string; rarity: string; x: number; y: number }) {
    const world = arenaToWorld(resource.x, resource.y);
    const group = new THREE.Group();
    group.position.set(world.x, 0, world.z);
    group.userData.entityId = resource.id;
    group.userData.entityType = 'resource';

    // Crystal shape
    const crystalGeo = new THREE.OctahedronGeometry(0.5, 0);
    const rarityColors: Record<string, number> = {
      common: 0x888888,
      uncommon: 0x44aa55,
      rare: 0x4488ff,
      legendary: 0xffaa33,
    };
    const color = rarityColors[resource.rarity] || 0x888888;
    const crystalMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.85,
      roughness: 0.3,
      metalness: 0.4,
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.y = 0.6;
    crystal.castShadow = true;
    group.add(crystal);

    this.markersGroup.add(group);
    this.resourceMarkers.set(resource.id, group);
  }

  private getFloorHit(e: MouseEvent): THREE.Vector3 | null {
    const rect = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.floorPlane, hit)) {
      return hit;
    }
    return null;
  }

  private worldToGrid(worldX: number, worldZ: number): { gx: number; gy: number } {
    const arena = worldToArena(worldX, worldZ);
    return {
      gx: Math.floor(arena.x / GRID_CELL),
      gy: Math.floor(arena.y / GRID_CELL),
    };
  }

  private handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;

    const tool = builderStore.activeTool;

    // For select tool, just record position for click-vs-drag detection
    if (tool === 'select') {
      this.mouseDownPos.set(e.clientX, e.clientY);
      this.mouseDownTime = performance.now();
      return;
    }

    const hit = this.getFloorHit(e);
    if (!hit) return;

    const arena = worldToArena(hit.x, hit.z);

    switch (tool) {
      case 'wall_paint':
      case 'wall_erase': {
        this.isPainting = true;
        const { gx, gy } = this.worldToGrid(hit.x, hit.z);
        const value = tool === 'wall_paint' ? 1 : 0;
        builderStore.setWallCell(gx, gy, value as 0 | 1);
        this.updatePreviewCell(gx, gy, tool === 'wall_paint');
        break;
      }
      case 'player_spawn':
        builderStore.setPlayerSpawn(arena.x, arena.y);
        this.rebuildMarkers();
        break;
      case 'exit_portal':
        builderStore.setExitPosition(arena.x, arena.y);
        this.rebuildMarkers();
        this.rebuildDungeon(); // exit position is in ArenaData
        break;
      case 'resource': {
        builderStore.addResource(arena.x, arena.y);
        this.rebuildMarkers();
        break;
      }
      case 'prop': {
        builderStore.addProp(arena.x, arena.y);
        this.rebuildMarkers();
        break;
      }
    }
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.isPainting) return;

    const hit = this.getFloorHit(e);
    if (!hit) return;

    const tool = builderStore.activeTool;
    const { gx, gy } = this.worldToGrid(hit.x, hit.z);
    const value = tool === 'wall_paint' ? 1 : 0;
    builderStore.setWallCell(gx, gy, value as 0 | 1);
    this.updatePreviewCell(gx, gy, tool === 'wall_paint');
  }

  private handleMouseUp(e: MouseEvent) {
    if (e.button === 0 && builderStore.activeTool === 'select') {
      const dx = e.clientX - this.mouseDownPos.x;
      const dy = e.clientY - this.mouseDownPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const elapsed = performance.now() - this.mouseDownTime;
      if (dist < 5 && elapsed < 300) {
        this.handleSelectClick(e);
      }
      return;
    }

    if (this.isPainting) {
      this.isPainting = false;
      this.clearPreview();
      this.rebuildDungeon();
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;

    // Delete selected entity
    if ((e.code === 'Delete' || e.code === 'Backspace') && builderStore.selectedId) {
      const id = builderStore.selectedId;
      builderStore.removeEnemy(id);
      builderStore.removeResource(id);
      builderStore.removeProp(id);
      this.rebuildMarkers();
    }

    // Rotate selected prop with R key
    if (e.code === 'KeyR' && builderStore.activeTool === 'select' && builderStore.selectedId) {
      const prop = builderStore.props.find(p => p.id === builderStore.selectedId);
      if (prop) {
        builderStore.updateProp(prop.id, { rotation: prop.rotation + Math.PI / 4 }); // 45 degree increments
        this.rebuildMarkers();
      }
    }

    // Grid toggle
    if (e.code === 'KeyG') {
      builderStore.showGrid = !builderStore.showGrid;
      if (this.gridOverlay) this.gridOverlay.visible = builderStore.showGrid;
    }

    // Tool hotkeys
    const toolKeys: Record<string, string> = {
      'Digit1': 'select',
      'Digit2': 'prop',
      'Digit3': 'player_spawn',
      'Digit4': 'exit_portal',
      'Digit5': 'resource',
      'Digit6': 'wall_erase',
      'Digit8': 'wall_paint',
    };
    if (toolKeys[e.code]) {
      builderStore.activeTool = toolKeys[e.code] as any;
    }
  }

  private handleSelectClick(e: MouseEvent) {
    // Raycast against entity markers
    const rect = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    // Check all marker children
    const meshes: THREE.Object3D[] = [];
    this.markersGroup.traverse(child => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });

    const intersects = this.raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      // Walk up to find group with entityId
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj && !obj.userData.entityId) {
        obj = obj.parent;
      }
      if (obj && obj.userData.entityId) {
        builderStore.selectedId = obj.userData.entityId;
        return;
      }
    }

    builderStore.selectedId = null;
  }

  private updatePreviewCell(gx: number, gy: number, isPaint: boolean) {
    const key = `${gx},${gy}`;
    if (this.previewCells.has(key)) return;

    const geo = new THREE.BoxGeometry(WORLD_CELL, 0.5, WORLD_CELL);
    const mat = isPaint ? this.previewMaterial : this.eraseMaterial;
    const mesh = new THREE.Mesh(geo, mat);

    // Position at grid cell center
    const arenaX = gx * GRID_CELL + GRID_CELL / 2;
    const arenaY = gy * GRID_CELL + GRID_CELL / 2;
    const world = arenaToWorld(arenaX, arenaY);
    mesh.position.set(world.x, 0.25, world.z);

    this.previewGroup.add(mesh);
    this.previewCells.set(key, mesh);
  }

  private clearPreview() {
    for (const mesh of this.previewCells.values()) {
      this.previewGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.previewCells.clear();
  }

  private animate() {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    const dt = this.clock.getDelta();

    // Toggle orbit based on active tool
    this.builderCamera.orbitEnabled = (builderStore.activeTool === 'select');

    // Update camera
    this.builderCamera.update(dt);

    // Tick animation mixers
    for (const mixer of this.propMixers.values()) {
      mixer.update(dt);
    }

    // Rotate exit marker
    if (this.exitMarker) {
      this.exitMarker.rotation.y += dt * 0.5;
    }

    // Rotate resource crystals
    for (const [_, marker] of this.resourceMarkers) {
      marker.children[0].rotation.y += dt;
    }

    // Update selection ring position
    if (this.selectionRing && builderStore.selectedId) {
      const enemyMarker = this.enemyMarkers.get(builderStore.selectedId);
      const resourceMarker = this.resourceMarkers.get(builderStore.selectedId);
      const propMarker = this.propMarkers.get(builderStore.selectedId);
      const marker = enemyMarker || resourceMarker || propMarker;
      if (marker) {
        this.selectionRing.visible = true;
        this.selectionRing.position.x = marker.position.x;
        this.selectionRing.position.z = marker.position.z;
        this.selectionRing.rotation.z += dt * 2;
      } else {
        this.selectionRing.visible = false;
      }
    } else if (this.selectionRing) {
      this.selectionRing.visible = false;
    }

    // Grid visibility
    if (this.gridOverlay) {
      this.gridOverlay.visible = builderStore.showGrid;
    }

    // Check for zone change
    if (builderStore.zone !== this.currentZone) {
      this.rebuildDungeon();
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** Current camera look-at position in world coords. */
  getCameraWorldPosition(): { x: number; z: number } {
    return this.builderCamera.worldPosition;
  }

  /** Pan camera to a world position. */
  panCameraTo(worldX: number, worldZ: number) {
    this.builderCamera.panTo(worldX, worldZ);
  }

  /** Get animation clip names for a prop. */
  getAnimationClips(propId: string): string[] {
    const clips = this.propClips.get(propId);
    return clips ? clips.map(c => c.name) : [];
  }

  /** Get currently playing clip name for a prop. */
  getCurrentClip(propId: string): string | null {
    return this.propCurrentClip.get(propId) ?? null;
  }

  /** Play a specific animation clip on a prop. */
  playAnimation(propId: string, clipName: string): void {
    const mixer = this.propMixers.get(propId);
    const clips = this.propClips.get(propId);
    if (!mixer || !clips) return;

    const clip = clips.find(c => c.name === clipName);
    if (!clip) return;

    mixer.stopAllAction();
    mixer.clipAction(clip).play();
    this.propCurrentClip.set(propId, clipName);
  }

  dispose() {
    this.disposed = true;
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);

    this.container.removeEventListener('mousedown', this.onMouseDown);
    this.container.removeEventListener('mousemove', this.onMouseMove);
    this.container.removeEventListener('mouseup', this.onMouseUp);
    this.container.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDownHandler);
    window.removeEventListener('resize', this.onResize);

    this.builderCamera.dispose();
    if (this.dungeon) disposeDungeon(this.dungeon);
    if (this.pixelBlocks) {
      this.pixelBlocks.dispose();
      this.pixelBlocks = null;
    }
    this.clearPreview();
    this.previewMaterial.dispose();
    this.eraseMaterial.dispose();

    if (this.gridOverlay) {
      this.gridOverlay.geometry.dispose();
      (this.gridOverlay.material as THREE.Material).dispose();
    }

    if (this.selectionRing) {
      this.selectionRing.geometry.dispose();
      (this.selectionRing.material as THREE.Material).dispose();
    }

    // Clean up animation mixers
    for (const [id, mixer] of this.propMixers) {
      mixer.stopAllAction();
      const group = this.propMarkers.get(id);
      if (group) mixer.uncacheRoot(group);
    }
    this.propMixers.clear();
    this.propClips.clear();
    this.propCurrentClip.clear();

    for (const [, group] of this.propMarkers) {
      group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else (child.material as THREE.Material).dispose();
        }
      });
    }
    this.propMarkers.clear();

    this.markersGroup.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else (child.material as THREE.Material).dispose();
      }
    });

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
