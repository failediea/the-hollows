import * as THREE from 'three';
import type { PlayerClass, EnemyArchetype, ElementType } from '../stores/types';

// ---------- Element Color Mapping ----------

const ELEMENT_COLORS: Record<ElementType, number> = {
  fire: 0xff6b35,
  ice: 0x3b82f6,
  shadow: 0x8b5cf6,
  holy: 0xffd700,
  none: 0x444444,
};

// ---------- Shared Helpers ----------

function mat(color: number, opts?: {
  metalness?: number;
  roughness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts?.metalness ?? 0.0,
    roughness: opts?.roughness ?? 0.8,
    emissive: opts?.emissive ?? 0x000000,
    emissiveIntensity: opts?.emissiveIntensity ?? 0,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1.0,
  });
}

function namedMesh(
  name: string,
  geo: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  pos?: [number, number, number],
  rot?: [number, number, number],
  scale?: [number, number, number],
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  return m;
}

function addGroundRing(group: THREE.Group, color: number, emissiveIntensity = 0.5, radius = 0.55) {
  const ring = namedMesh(
    'ring',
    new THREE.TorusGeometry(radius, 0.06, 8, 32),
    mat(color, { emissive: color, emissiveIntensity, metalness: 0.2, roughness: 0.4 }),
    [0, 0.02, 0],
    [-Math.PI / 2, 0, 0],
  );
  group.add(ring);
}

function addDirectionArrow(group: THREE.Group, color = 0xffd700) {
  const arrow = namedMesh(
    'arrow',
    new THREE.ConeGeometry(0.12, 0.4, 3),
    mat(color, { emissive: color, emissiveIntensity: 0.3, metalness: 0.3, roughness: 0.5 }),
    [0, 0.02, -0.7],
    [Math.PI / 2, 0, 0],
  );
  group.add(arrow);
}

function addHead(
  group: THREE.Group,
  color = 0xd4c8b0,
  y = 1.45,
  name = 'head',
): THREE.Mesh {
  const head = namedMesh(
    name,
    new THREE.SphereGeometry(0.18, 12, 10),
    mat(color, { roughness: 0.75, metalness: 0.0 }),
    [0, y, 0],
  );
  group.add(head);
  return head;
}

function addArm(
  group: THREE.Group,
  side: 'left' | 'right',
  color: number,
  opts?: { metalness?: number; roughness?: number; radius?: number; height?: number; y?: number },
) {
  const x = side === 'left' ? -0.32 : 0.32;
  const r = opts?.radius ?? 0.05;
  const h = opts?.height ?? 0.4;
  const arm = namedMesh(
    side === 'left' ? 'leftArm' : 'rightArm',
    new THREE.CylinderGeometry(r, r * 0.9, h, 8),
    mat(color, { metalness: opts?.metalness ?? 0.0, roughness: opts?.roughness ?? 0.8 }),
    [x, opts?.y ?? 0.9, 0],
  );
  group.add(arm);
  return arm;
}

// ---------- Player Mesh Factories ----------

function createSentinelMesh(): THREE.Group {
  const g = new THREE.Group();
  addGroundRing(g, 0xc0c0c0, 0.4);

  // Dark chainmail robe base
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.35, 0.48, 0.45, 12),
    mat(0x2a2a30, { metalness: 0.3, roughness: 0.55 }),
    [0, 0.22, 0],
  ));

  // Heavy wide torso — polished armor
  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.32, 0.55, 8, 12),
    mat(0xc0c0c0, { metalness: 0.6, roughness: 0.4 }),
    [0, 0.85, 0],
  ));

  // Heavy pauldrons
  g.add(namedMesh('leftPauldron',
    new THREE.BoxGeometry(0.22, 0.16, 0.3),
    mat(0x8a8a8a, { metalness: 0.5, roughness: 0.45 }),
    [-0.34, 1.18, 0],
  ));
  g.add(namedMesh('rightPauldron',
    new THREE.BoxGeometry(0.22, 0.16, 0.3),
    mat(0x8a8a8a, { metalness: 0.5, roughness: 0.45 }),
    [0.34, 1.18, 0],
  ));

  // Helmet — flattened sphere + visor
  g.add(namedMesh('head',
    new THREE.SphereGeometry(0.2, 12, 10),
    mat(0xa0a0a0, { metalness: 0.55, roughness: 0.4 }),
    [0, 1.45, 0],
    undefined,
    [1, 0.85, 1],
  ));
  g.add(namedMesh('visor',
    new THREE.BoxGeometry(0.22, 0.06, 0.1),
    mat(0x505050, { metalness: 0.6, roughness: 0.35 }),
    [0, 1.42, -0.15],
  ));

  // Arms
  addArm(g, 'left', 0xa0a0a0, { metalness: 0.5, roughness: 0.45 });
  addArm(g, 'right', 0xa0a0a0, { metalness: 0.5, roughness: 0.45 });

  // Tower shield — left side
  g.add(namedMesh('shield',
    new THREE.BoxGeometry(0.08, 0.6, 0.45),
    mat(0x606060, { metalness: 0.7, roughness: 0.35 }),
    [-0.42, 0.85, 0],
  ));

  // Gold cross emblem on shield
  g.add(namedMesh('shieldCrossH',
    new THREE.BoxGeometry(0.09, 0.04, 0.3),
    mat(0xffd700, { emissive: 0xffd700, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3 }),
    [-0.46, 0.9, 0],
  ));
  g.add(namedMesh('shieldCrossV',
    new THREE.BoxGeometry(0.09, 0.3, 0.04),
    mat(0xffd700, { emissive: 0xffd700, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3 }),
    [-0.46, 0.9, 0],
  ));

  // Mace — right hand
  g.add(namedMesh('weaponHandle',
    new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6),
    mat(0x5a5a5a, { metalness: 0.5, roughness: 0.4 }),
    [0.4, 0.7, 0],
  ));
  g.add(namedMesh('weapon',
    new THREE.SphereGeometry(0.1, 8, 6),
    mat(0xc0c0c0, { metalness: 0.65, roughness: 0.35 }),
    [0.4, 1.0, 0],
  ));

  addDirectionArrow(g, 0xc0c0c0);
  return g;
}

function createReaverMesh(): THREE.Group {
  const g = new THREE.Group();
  addGroundRing(g, 0xff3333, 0.5);

  // Leather waistguard
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.28, 0.36, 0.35, 12),
    mat(0x3a2218, { roughness: 0.8, metalness: 0.05 }),
    [0, 0.2, 0],
  ));

  // Muscular torso — tanned skin
  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.26, 0.5, 8, 12),
    mat(0x8a4422, { roughness: 0.8, metalness: 0.0 }),
    [0, 0.85, 0],
  ));

  // War paint — red emissive band across chest
  g.add(namedMesh('warPaint',
    new THREE.BoxGeometry(0.53, 0.04, 0.3),
    mat(0xff2222, { emissive: 0xff2222, emissiveIntensity: 0.5, roughness: 0.9, metalness: 0.0 }),
    [0, 0.92, 0],
  ));

  // Spiked shoulder guard (one side)
  g.add(namedMesh('shoulderGuard',
    new THREE.BoxGeometry(0.2, 0.12, 0.22),
    mat(0x5a3020, { roughness: 0.75, metalness: 0.1 }),
    [-0.3, 1.15, 0],
  ));
  // Spike on shoulder
  g.add(namedMesh('shoulderSpike',
    new THREE.ConeGeometry(0.04, 0.14, 4),
    mat(0x8a8a8a, { metalness: 0.5, roughness: 0.4 }),
    [-0.3, 1.27, 0],
  ));

  addHead(g, 0xc0a888);

  // Arms — bare skin
  addArm(g, 'left', 0x8a4422, { roughness: 0.8, metalness: 0.0 });
  addArm(g, 'right', 0x8a4422, { roughness: 0.8, metalness: 0.0 });

  // Dual axes — right: ember-orange blade + dark wood handle
  g.add(namedMesh('weapon',
    new THREE.BoxGeometry(0.04, 0.25, 0.14),
    mat(0xff6b35, { emissive: 0xff6b35, emissiveIntensity: 0.3, metalness: 0.3, roughness: 0.5 }),
    [0.38, 1.05, 0],
  ));
  g.add(namedMesh('weaponHandleR',
    new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6),
    mat(0x3a2a1a, { roughness: 0.85, metalness: 0.0 }),
    [0.38, 0.65, 0],
  ));

  // Dual axes — left
  g.add(namedMesh('weaponLeft',
    new THREE.BoxGeometry(0.04, 0.25, 0.14),
    mat(0xff6b35, { emissive: 0xff6b35, emissiveIntensity: 0.3, metalness: 0.3, roughness: 0.5 }),
    [-0.38, 1.05, 0],
  ));
  g.add(namedMesh('weaponHandleL',
    new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6),
    mat(0x3a2a1a, { roughness: 0.85, metalness: 0.0 }),
    [-0.38, 0.65, 0],
  ));

  addDirectionArrow(g, 0xff3333);
  return g;
}

function createShadeMesh(): THREE.Group {
  const g = new THREE.Group();
  addGroundRing(g, 0x4ade80, 0.3);

  // Long cloak flowing down
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.22, 0.4, 0.5, 12),
    mat(0x0f1a0f, { roughness: 0.9, metalness: 0.0 }),
    [0, 0.25, 0],
  ));

  // Slim dark figure body
  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.2, 0.55, 8, 12),
    mat(0x1a2a1a, { roughness: 0.9, metalness: 0.0 }),
    [0, 0.85, 0],
  ));

  // Large hood enveloping head
  g.add(namedMesh('head',
    new THREE.SphereGeometry(0.24, 12, 10),
    mat(0x0a1a0a, { roughness: 0.92, metalness: 0.0 }),
    [0, 1.45, 0],
  ));

  // Arms — dark
  addArm(g, 'left', 0x1a2a1a, { roughness: 0.9, metalness: 0.0 });
  addArm(g, 'right', 0x1a2a1a, { roughness: 0.9, metalness: 0.0 });

  // Belt with pouches
  g.add(namedMesh('belt',
    new THREE.BoxGeometry(0.44, 0.06, 0.28),
    mat(0x2a1a10, { roughness: 0.8, metalness: 0.05 }),
    [0, 0.55, 0],
  ));
  g.add(namedMesh('pouch1',
    new THREE.BoxGeometry(0.08, 0.08, 0.08),
    mat(0x2a1a10, { roughness: 0.8, metalness: 0.05 }),
    [-0.15, 0.52, -0.14],
  ));
  g.add(namedMesh('pouch2',
    new THREE.BoxGeometry(0.07, 0.07, 0.07),
    mat(0x2a1a10, { roughness: 0.8, metalness: 0.05 }),
    [0.12, 0.52, -0.14],
  ));

  // Twin daggers — poison-green blades
  g.add(namedMesh('weapon',
    new THREE.BoxGeometry(0.025, 0.38, 0.05),
    mat(0x4ade80, { emissive: 0x4ade80, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.3 }),
    [0.32, 0.9, 0],
  ));
  g.add(namedMesh('weaponHandleR',
    new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6),
    mat(0x1a1a1a, { roughness: 0.85, metalness: 0.1 }),
    [0.32, 0.68, 0],
  ));
  g.add(namedMesh('weaponLeft',
    new THREE.BoxGeometry(0.025, 0.38, 0.05),
    mat(0x4ade80, { emissive: 0x4ade80, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.3 }),
    [-0.32, 0.9, 0],
  ));
  g.add(namedMesh('weaponHandleL',
    new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6),
    mat(0x1a1a1a, { roughness: 0.85, metalness: 0.1 }),
    [-0.32, 0.68, 0],
  ));

  addDirectionArrow(g, 0x4ade80);
  return g;
}

function createWardenMesh(): THREE.Group {
  const g = new THREE.Group();
  addGroundRing(g, 0xe8dcc4, 0.35);

  // Leather leggings
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.26, 0.34, 0.4, 12),
    mat(0x5a4a30, { roughness: 0.8, metalness: 0.05 }),
    [0, 0.2, 0],
  ));

  // Medium leather armor body
  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.24, 0.5, 8, 12),
    mat(0xe8dcc4, { roughness: 0.75, metalness: 0.1 }),
    [0, 0.85, 0],
  ));

  // Shoulder guard (one side)
  g.add(namedMesh('shoulderGuard',
    new THREE.BoxGeometry(0.18, 0.1, 0.22),
    mat(0x8a7a60, { roughness: 0.7, metalness: 0.15 }),
    [-0.28, 1.14, 0],
  ));

  // Ranger hood (subtle)
  g.add(namedMesh('head',
    new THREE.SphereGeometry(0.2, 12, 10),
    mat(0x6a5a40, { roughness: 0.85, metalness: 0.0 }),
    [0, 1.45, 0],
  ));
  // Face visible beneath hood
  g.add(namedMesh('face',
    new THREE.SphereGeometry(0.14, 10, 8),
    mat(0xd4c8b0, { roughness: 0.75, metalness: 0.0 }),
    [0, 1.42, -0.06],
  ));

  // Arms
  addArm(g, 'left', 0x7a6a50, { roughness: 0.75, metalness: 0.1 });
  addArm(g, 'right', 0x7a6a50, { roughness: 0.75, metalness: 0.1 });

  // Longbow — torus arc on back
  g.add(namedMesh('weapon',
    new THREE.TorusGeometry(0.35, 0.025, 6, 16, Math.PI),
    mat(0x6a5030, { roughness: 0.8, metalness: 0.0 }),
    [0, 1.0, 0.2],
    [0, 0, Math.PI / 2],
  ));
  // Bowstring
  g.add(namedMesh('bowstring',
    new THREE.CylinderGeometry(0.005, 0.005, 0.7, 4),
    mat(0xcccccc, { roughness: 0.6, metalness: 0.1 }),
    [0, 1.0, 0.2],
  ));

  // Quiver with arrows
  g.add(namedMesh('quiver',
    new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6),
    mat(0x5a4030, { roughness: 0.8, metalness: 0.05 }),
    [0.2, 0.9, 0.15],
    [0, 0, 0.2],
  ));
  // Arrow tips poking out
  g.add(namedMesh('arrowTip1',
    new THREE.ConeGeometry(0.02, 0.08, 3),
    mat(0x888888, { metalness: 0.4, roughness: 0.4 }),
    [0.18, 1.14, 0.15],
  ));
  g.add(namedMesh('arrowTip2',
    new THREE.ConeGeometry(0.02, 0.08, 3),
    mat(0x888888, { metalness: 0.4, roughness: 0.4 }),
    [0.22, 1.16, 0.13],
  ));

  addDirectionArrow(g, 0xe8dcc4);
  return g;
}

function createCorsairMesh(): THREE.Group {
  const g = new THREE.Group();
  addGroundRing(g, 0xff6b35, 0.4);

  // Coat tails / lower longcoat
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.28, 0.42, 0.45, 12),
    mat(0x4a3020, { roughness: 0.75, metalness: 0.05 }),
    [0, 0.22, 0],
  ));

  // Leather longcoat body
  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.25, 0.5, 8, 12),
    mat(0x5a4030, { roughness: 0.7, metalness: 0.1 }),
    [0, 0.85, 0],
  ));

  // Head
  addHead(g, 0xd4c8b0);

  // Tricorn hat — flattened cone on head
  g.add(namedMesh('hat',
    new THREE.ConeGeometry(0.22, 0.14, 3),
    mat(0x2a1a10, { roughness: 0.8, metalness: 0.05 }),
    [0, 1.6, 0],
    undefined,
    [1, 0.6, 1],
  ));
  // Hat brim
  g.add(namedMesh('hatBrim',
    new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12),
    mat(0x2a1a10, { roughness: 0.8, metalness: 0.05 }),
    [0, 1.54, 0],
  ));

  // Bandolier — diagonal across chest
  g.add(namedMesh('bandolier',
    new THREE.BoxGeometry(0.06, 0.02, 0.55),
    mat(0x3a2a18, { roughness: 0.8, metalness: 0.1 }),
    [0, 1.0, 0],
    [0, 0, 0.6],
  ));
  // Small bolt boxes on bandolier
  g.add(namedMesh('bolt1',
    new THREE.BoxGeometry(0.03, 0.06, 0.03),
    mat(0x8a7a60, { metalness: 0.3, roughness: 0.5 }),
    [-0.08, 1.06, 0],
  ));
  g.add(namedMesh('bolt2',
    new THREE.BoxGeometry(0.03, 0.06, 0.03),
    mat(0x8a7a60, { metalness: 0.3, roughness: 0.5 }),
    [0.06, 0.95, 0],
  ));

  // Arms
  addArm(g, 'left', 0x5a4030, { roughness: 0.75, metalness: 0.1 });
  addArm(g, 'right', 0x5a4030, { roughness: 0.75, metalness: 0.1 });

  // Crossbow — right hand: box stock + box limb
  g.add(namedMesh('weapon',
    new THREE.BoxGeometry(0.06, 0.08, 0.5),
    mat(0x5a4030, { roughness: 0.8, metalness: 0.0 }),
    [0.4, 0.75, -0.1],
  ));
  g.add(namedMesh('weaponLimb',
    new THREE.BoxGeometry(0.4, 0.04, 0.04),
    mat(0x8a7a60, { roughness: 0.7, metalness: 0.15 }),
    [0.4, 0.78, -0.35],
  ));

  addDirectionArrow(g, 0xff6b35);
  return g;
}

function createPyromancerMesh(): THREE.Group {
  const g = new THREE.Group();
  addGroundRing(g, 0xff6b35, 0.6);

  // Deep red robes — lower
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.22, 0.45, 0.5, 12),
    mat(0x5a1a10, { roughness: 0.9, metalness: 0.0 }),
    [0, 0.25, 0],
  ));

  // Slender torso — dark red
  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.2, 0.45, 8, 12),
    mat(0x7a2218, { roughness: 0.85, metalness: 0.0 }),
    [0, 0.82, 0],
  ));

  // Rune band on torso
  g.add(namedMesh('runeBand',
    new THREE.BoxGeometry(0.42, 0.03, 0.25),
    mat(0xff6b35, { emissive: 0xff6b35, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.1 }),
    [0, 0.88, 0],
  ));

  // Pointed wizard hat / hood
  g.add(namedMesh('head',
    new THREE.SphereGeometry(0.19, 12, 10),
    mat(0x4a1510, { roughness: 0.9, metalness: 0.0 }),
    [0, 1.38, 0],
  ));
  g.add(namedMesh('hatTip',
    new THREE.ConeGeometry(0.12, 0.25, 8),
    mat(0x4a1510, { roughness: 0.9, metalness: 0.0 }),
    [0, 1.6, 0],
  ));

  // Face
  g.add(namedMesh('face',
    new THREE.SphereGeometry(0.13, 10, 8),
    mat(0xd4b898, { roughness: 0.75, metalness: 0.0 }),
    [0, 1.36, -0.06],
  ));

  // Arms — robed
  addArm(g, 'left', 0x5a1a10, { roughness: 0.85, metalness: 0.0 });
  addArm(g, 'right', 0x5a1a10, { roughness: 0.85, metalness: 0.0 });

  // Staff — dark wood shaft
  g.add(namedMesh('staffShaft',
    new THREE.CylinderGeometry(0.025, 0.03, 1.6, 6),
    mat(0x3a2218, { roughness: 0.85, metalness: 0.0 }),
    [0.35, 0.8, 0],
  ));

  // GLOWING fire orb atop staff
  g.add(namedMesh('weapon',
    new THREE.SphereGeometry(0.12, 12, 10),
    mat(0xff6b35, { emissive: 0xff6b35, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.1 }),
    [0.35, 1.65, 0],
  ));

  // Inner fire core
  g.add(namedMesh('fireCore',
    new THREE.SphereGeometry(0.06, 8, 6),
    mat(0xffcc00, { emissive: 0xffcc00, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.0 }),
    [0.35, 1.65, 0],
  ));

  addDirectionArrow(g, 0xff3333);
  return g;
}

function createVoidWeaverMesh(): THREE.Group {
  const g = new THREE.Group();
  addGroundRing(g, 0x8b5cf6, 0.5);

  // Deep purple-black robes — tattered lower
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.22, 0.47, 0.5, 10),
    mat(0x1a0e28, { roughness: 0.92, metalness: 0.0 }),
    [0, 0.25, 0],
  ));

  // Torso — deep purple
  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.2, 0.45, 8, 12),
    mat(0x3a2050, { roughness: 0.85, metalness: 0.05 }),
    [0, 0.82, 0],
  ));

  // Large ominous hood
  g.add(namedMesh('head',
    new THREE.SphereGeometry(0.25, 12, 10),
    mat(0x1a0e28, { roughness: 0.92, metalness: 0.0 }),
    [0, 1.4, 0],
  ));

  // Tattered robe flaps (slight asymmetry)
  g.add(namedMesh('robeFlap1',
    new THREE.BoxGeometry(0.12, 0.25, 0.04),
    mat(0x1a0e28, { roughness: 0.95, metalness: 0.0 }),
    [-0.2, 0.12, -0.12],
    [0.15, 0, 0],
  ));
  g.add(namedMesh('robeFlap2',
    new THREE.BoxGeometry(0.1, 0.2, 0.04),
    mat(0x2a1838, { roughness: 0.95, metalness: 0.0 }),
    [0.18, 0.1, -0.1],
    [-0.1, 0, 0],
  ));

  // Arms — dark robed
  addArm(g, 'left', 0x2a1838, { roughness: 0.88, metalness: 0.02 });
  addArm(g, 'right', 0x2a1838, { roughness: 0.88, metalness: 0.02 });

  // Staff — bone-colored shaft
  g.add(namedMesh('staffShaft',
    new THREE.CylinderGeometry(0.025, 0.03, 1.6, 6),
    mat(0x8a7a70, { roughness: 0.7, metalness: 0.1 }),
    [0.35, 0.8, 0],
  ));

  // GLOWING void orb
  g.add(namedMesh('weapon',
    new THREE.SphereGeometry(0.12, 12, 10),
    mat(0x8b5cf6, { emissive: 0x8b5cf6, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.1 }),
    [0.35, 1.65, 0],
  ));

  // Inner void core — dark center
  g.add(namedMesh('voidCore',
    new THREE.SphereGeometry(0.055, 8, 6),
    mat(0x1a0a30, { emissive: 0x1a0a30, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.0 }),
    [0.35, 1.65, 0],
  ));

  // Floating rune ring around orb
  g.add(namedMesh('runeRing',
    new THREE.TorusGeometry(0.18, 0.015, 6, 16),
    mat(0x8b5cf6, { emissive: 0x8b5cf6, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2 }),
    [0.35, 1.65, 0],
    [Math.PI / 4, 0, 0],
  ));

  addDirectionArrow(g, 0x8b5cf6);
  return g;
}

// ---------- Player Mesh Dispatch ----------

const PLAYER_FACTORY: Record<PlayerClass, () => THREE.Group> = {
  sentinel: createSentinelMesh,
  reaver: createReaverMesh,
  shade: createShadeMesh,
  warden: createWardenMesh,
  corsair: createCorsairMesh,
  pyromancer: createPyromancerMesh,
  void_weaver: createVoidWeaverMesh,
};

export function createPlayerMesh(playerClass: PlayerClass): THREE.Group {
  const factory = PLAYER_FACTORY[playerClass];
  const group = factory();
  group.name = `player_${playerClass}`;
  return group;
}

// ---------- Enemy Mesh Factories ----------

function createBruteMesh(element: ElementType): THREE.Group {
  const g = new THREE.Group();
  const ec = ELEMENT_COLORS[element];
  addGroundRing(g, ec, 0.4, 0.65);

  // Large hulking body — dark rust-brown, hunched forward
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.4, 0.5, 0.4, 12),
    mat(0x3a2218, { roughness: 0.75, metalness: 0.05 }),
    [0, 0.2, 0],
  ));

  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.45, 1.2, 8, 12),
    mat(0x5a3828, { roughness: 0.7, metalness: 0.05 }),
    [0, 0.95, 0],
    [0.15, 0, 0], // hunched forward
  ));

  // Heavy head — larger sphere
  g.add(namedMesh('head',
    new THREE.SphereGeometry(0.25, 12, 10),
    mat(0x4a2a1a, { roughness: 0.75, metalness: 0.0 }),
    [0, 1.65, -0.1],
  ));

  // Tusked jaw — two small cones
  g.add(namedMesh('tuskLeft',
    new THREE.ConeGeometry(0.03, 0.12, 4),
    mat(0xd4c8a0, { roughness: 0.5, metalness: 0.2 }),
    [-0.1, 1.55, -0.22],
    [Math.PI, 0, 0],
  ));
  g.add(namedMesh('tuskRight',
    new THREE.ConeGeometry(0.03, 0.12, 4),
    mat(0xd4c8a0, { roughness: 0.5, metalness: 0.2 }),
    [0.1, 1.55, -0.22],
    [Math.PI, 0, 0],
  ));

  // Element-colored eyes
  g.add(namedMesh('eyeLeft',
    new THREE.SphereGeometry(0.035, 6, 6),
    mat(ec, { emissive: ec, emissiveIntensity: 0.8, roughness: 0.2 }),
    [-0.08, 1.7, -0.2],
  ));
  g.add(namedMesh('eyeRight',
    new THREE.SphereGeometry(0.035, 6, 6),
    mat(ec, { emissive: ec, emissiveIntensity: 0.8, roughness: 0.2 }),
    [0.08, 1.7, -0.2],
  ));

  // Thick arms — positioned wide
  g.add(namedMesh('leftArm',
    new THREE.CylinderGeometry(0.08, 0.07, 0.55, 8),
    mat(0x5a3828, { roughness: 0.7, metalness: 0.05 }),
    [-0.5, 1.1, 0],
    [0, 0, 0.2],
  ));
  g.add(namedMesh('rightArm',
    new THREE.CylinderGeometry(0.08, 0.07, 0.55, 8),
    mat(0x5a3828, { roughness: 0.7, metalness: 0.05 }),
    [0.5, 1.1, 0],
    [0, 0, -0.2],
  ));

  // Big club weapon
  g.add(namedMesh('weaponHandle',
    new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6),
    mat(0x3a2a1a, { roughness: 0.85, metalness: 0.0 }),
    [0.55, 0.9, 0],
    [0, 0, -0.3],
  ));
  g.add(namedMesh('weapon',
    new THREE.BoxGeometry(0.18, 0.35, 0.12),
    mat(0x4a4a4a, { metalness: 0.4, roughness: 0.5 }),
    [0.65, 1.3, 0],
  ));

  addDirectionArrow(g, ec);
  return g;
}

function createGuardianMesh(element: ElementType): THREE.Group {
  const g = new THREE.Group();
  const ec = ELEMENT_COLORS[element];
  addGroundRing(g, ec, 0.35);

  // Thick legs
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.34, 0.44, 0.4, 12),
    mat(0x5a5a5a, { roughness: 0.5, metalness: 0.35 }),
    [0, 0.2, 0],
  ));

  // Medium capsule body — stone-gray armor
  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.3, 0.7, 8, 12),
    mat(0x7a7a7a, { roughness: 0.5, metalness: 0.4 }),
    [0, 0.9, 0],
  ));

  // Helmet — sphere + visor
  g.add(namedMesh('head',
    new THREE.SphereGeometry(0.2, 12, 10),
    mat(0x8a8a8a, { roughness: 0.45, metalness: 0.45 }),
    [0, 1.5, 0],
    undefined,
    [1, 0.9, 1],
  ));
  g.add(namedMesh('visor',
    new THREE.BoxGeometry(0.22, 0.06, 0.1),
    mat(0x3a3a3a, { metalness: 0.5, roughness: 0.4 }),
    [0, 1.47, -0.15],
  ));

  // Arms
  g.add(namedMesh('leftArm',
    new THREE.CylinderGeometry(0.06, 0.055, 0.45, 8),
    mat(0x7a7a7a, { roughness: 0.5, metalness: 0.35 }),
    [-0.36, 0.95, 0],
  ));
  g.add(namedMesh('rightArm',
    new THREE.CylinderGeometry(0.06, 0.055, 0.45, 8),
    mat(0x7a7a7a, { roughness: 0.5, metalness: 0.35 }),
    [0.36, 0.95, 0],
  ));

  // Shield — large box, left side, element-colored emissive edge
  g.add(namedMesh('shield',
    new THREE.BoxGeometry(0.08, 0.55, 0.4),
    mat(0x5a5a5a, { metalness: 0.5, roughness: 0.4 }),
    [-0.44, 0.9, 0],
  ));
  // Shield trim — element-colored
  g.add(namedMesh('shieldTrim',
    new THREE.BoxGeometry(0.09, 0.58, 0.04),
    mat(ec, { emissive: ec, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.4 }),
    [-0.45, 0.9, -0.2],
  ));
  // Element runes on shield
  g.add(namedMesh('rune1',
    new THREE.BoxGeometry(0.09, 0.06, 0.06),
    mat(ec, { emissive: ec, emissiveIntensity: 0.6, roughness: 0.3 }),
    [-0.46, 1.0, 0.05],
  ));
  g.add(namedMesh('rune2',
    new THREE.BoxGeometry(0.09, 0.06, 0.06),
    mat(ec, { emissive: ec, emissiveIntensity: 0.6, roughness: 0.3 }),
    [-0.46, 0.8, 0.05],
  ));

  // Sword — right hand
  g.add(namedMesh('weaponHandle',
    new THREE.CylinderGeometry(0.025, 0.025, 0.15, 6),
    mat(0x4a3a2a, { roughness: 0.7, metalness: 0.2 }),
    [0.42, 0.65, 0],
  ));
  g.add(namedMesh('weapon',
    new THREE.BoxGeometry(0.04, 0.55, 0.06),
    mat(0x9a9a9a, { metalness: 0.55, roughness: 0.35 }),
    [0.42, 1.0, 0],
  ));

  addDirectionArrow(g, ec);
  return g;
}

function createAssassinMesh(element: ElementType): THREE.Group {
  const g = new THREE.Group();
  const ec = ELEMENT_COLORS[element];
  addGroundRing(g, ec, 0.3);

  // Slim body — crouched (lower center of mass)
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.2, 0.3, 0.3, 12),
    mat(0x1a1a1a, { roughness: 0.9, metalness: 0.0 }),
    [0, 0.15, 0],
  ));

  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.22, 0.45, 8, 12),
    mat(0x1a1a1a, { roughness: 0.9, metalness: 0.0 }),
    [0, 0.68, 0],
    [0.1, 0, 0], // slight crouch
  ));

  // Hood — large sphere, dark
  g.add(namedMesh('head',
    new THREE.SphereGeometry(0.2, 12, 10),
    mat(0x0f0f0f, { roughness: 0.92, metalness: 0.0 }),
    [0, 1.18, -0.03],
  ));

  // Element-colored eyes
  g.add(namedMesh('eyeLeft',
    new THREE.SphereGeometry(0.025, 6, 6),
    mat(ec, { emissive: ec, emissiveIntensity: 0.8, roughness: 0.2 }),
    [-0.06, 1.22, -0.16],
  ));
  g.add(namedMesh('eyeRight',
    new THREE.SphereGeometry(0.025, 6, 6),
    mat(ec, { emissive: ec, emissiveIntensity: 0.8, roughness: 0.2 }),
    [0.06, 1.22, -0.16],
  ));

  // Cape behind
  g.add(namedMesh('cape',
    new THREE.BoxGeometry(0.3, 0.5, 0.03),
    mat(0x0a0a0a, { roughness: 0.95, metalness: 0.0 }),
    [0, 0.7, 0.18],
    [0.05, 0, 0],
  ));

  // Arms — slim
  g.add(namedMesh('leftArm',
    new THREE.CylinderGeometry(0.04, 0.035, 0.35, 8),
    mat(0x1a1a1a, { roughness: 0.9, metalness: 0.0 }),
    [-0.28, 0.7, 0],
  ));
  g.add(namedMesh('rightArm',
    new THREE.CylinderGeometry(0.04, 0.035, 0.35, 8),
    mat(0x1a1a1a, { roughness: 0.9, metalness: 0.0 }),
    [0.28, 0.7, 0],
  ));

  // Twin blades — element-colored emissive edges
  g.add(namedMesh('weapon',
    new THREE.BoxGeometry(0.025, 0.4, 0.04),
    mat(ec, { emissive: ec, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.3 }),
    [0.34, 0.75, 0],
  ));
  g.add(namedMesh('weaponLeft',
    new THREE.BoxGeometry(0.025, 0.4, 0.04),
    mat(ec, { emissive: ec, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.3 }),
    [-0.34, 0.75, 0],
  ));

  addDirectionArrow(g, ec);
  return g;
}

function createCasterMesh(element: ElementType): THREE.Group {
  const g = new THREE.Group();
  const ec = ELEMENT_COLORS[element];
  addGroundRing(g, ec, 0.5);

  // Wispy robe base — semi-transparent
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.3, 0.5, 0.45, 12),
    mat(0x1a1a2a, { roughness: 0.9, metalness: 0.0, transparent: true, opacity: 0.8 }),
    [0, 0.22, 0],
  ));

  // Robed body — dark with element-colored trim
  g.add(namedMesh('body',
    new THREE.CylinderGeometry(0.2, 0.3, 0.7, 10),
    mat(0x1a1a2a, { roughness: 0.88, metalness: 0.0 }),
    [0, 0.7, 0],
  ));

  // Element accent trim on robes
  g.add(namedMesh('robeTrim',
    new THREE.BoxGeometry(0.42, 0.03, 0.26),
    mat(ec, { emissive: ec, emissiveIntensity: 0.4, roughness: 0.5 }),
    [0, 0.75, 0],
  ));

  // Head — hooded
  g.add(namedMesh('head',
    new THREE.SphereGeometry(0.18, 12, 10),
    mat(0x1a1a2a, { roughness: 0.9, metalness: 0.0 }),
    [0, 1.25, 0],
  ));

  // Outstretched arms — thinner
  g.add(namedMesh('leftArm',
    new THREE.CylinderGeometry(0.035, 0.03, 0.45, 8),
    mat(0x1a1a2a, { roughness: 0.88, metalness: 0.0 }),
    [-0.3, 0.95, 0],
    [0, 0, 0.4],
  ));
  g.add(namedMesh('rightArm',
    new THREE.CylinderGeometry(0.035, 0.03, 0.45, 8),
    mat(0x1a1a2a, { roughness: 0.88, metalness: 0.0 }),
    [0.3, 0.95, 0],
    [0, 0, -0.4],
  ));

  // Floating crystal above head — octahedron, element-colored
  g.add(namedMesh('weapon',
    new THREE.OctahedronGeometry(0.12, 0),
    mat(ec, { emissive: ec, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.3 }),
    [0, 1.6, 0],
    [0, Math.PI / 4, 0],
  ));

  // Glowing rune circle around base
  g.add(namedMesh('runeCircle',
    new THREE.TorusGeometry(0.45, 0.02, 6, 24),
    mat(ec, { emissive: ec, emissiveIntensity: 0.6, roughness: 0.3 }),
    [0, 0.04, 0],
    [-Math.PI / 2, 0, 0],
  ));

  addDirectionArrow(g, ec);
  return g;
}

function createBossMesh(element: ElementType): THREE.Group {
  const g = new THREE.Group();
  const ec = ELEMENT_COLORS[element];

  // 1.5x scale applied at the end
  addGroundRing(g, ec, 0.7, 0.75);

  // Thick armored legs
  g.add(namedMesh('legs',
    new THREE.CylinderGeometry(0.4, 0.52, 0.5, 12),
    mat(0x3a3a3a, { roughness: 0.45, metalness: 0.5 }),
    [0, 0.25, 0],
  ));

  // Armored body — massive capsule
  g.add(namedMesh('body',
    new THREE.CapsuleGeometry(0.5, 1.0, 8, 12),
    mat(0x4a4a4a, { roughness: 0.45, metalness: 0.5 }),
    [0, 1.0, 0],
  ));

  // Head
  g.add(namedMesh('head',
    new THREE.SphereGeometry(0.24, 12, 10),
    mat(0x3a3a3a, { roughness: 0.5, metalness: 0.45 }),
    [0, 1.75, 0],
  ));

  // Crown / horns — element-colored emissive cones
  g.add(namedMesh('hornLeft',
    new THREE.ConeGeometry(0.05, 0.3, 5),
    mat(ec, { emissive: ec, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4 }),
    [-0.15, 2.0, 0],
    [0, 0, 0.2],
  ));
  g.add(namedMesh('hornRight',
    new THREE.ConeGeometry(0.05, 0.3, 5),
    mat(ec, { emissive: ec, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4 }),
    [0.15, 2.0, 0],
    [0, 0, -0.2],
  ));
  g.add(namedMesh('hornCenter',
    new THREE.ConeGeometry(0.04, 0.2, 5),
    mat(ec, { emissive: ec, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4 }),
    [0, 2.05, 0],
  ));

  // Element-colored eyes
  g.add(namedMesh('eyeLeft',
    new THREE.SphereGeometry(0.04, 6, 6),
    mat(ec, { emissive: ec, emissiveIntensity: 0.9, roughness: 0.2 }),
    [-0.09, 1.8, -0.18],
  ));
  g.add(namedMesh('eyeRight',
    new THREE.SphereGeometry(0.04, 6, 6),
    mat(ec, { emissive: ec, emissiveIntensity: 0.9, roughness: 0.2 }),
    [0.09, 1.8, -0.18],
  ));

  // Shoulder pieces with element emissive
  g.add(namedMesh('leftPauldron',
    new THREE.BoxGeometry(0.25, 0.18, 0.3),
    mat(0x3a3a3a, { roughness: 0.45, metalness: 0.5 }),
    [-0.48, 1.55, 0],
  ));
  g.add(namedMesh('leftPauldronGlow',
    new THREE.BoxGeometry(0.12, 0.05, 0.2),
    mat(ec, { emissive: ec, emissiveIntensity: 0.5, roughness: 0.3 }),
    [-0.48, 1.62, 0],
  ));
  g.add(namedMesh('rightPauldron',
    new THREE.BoxGeometry(0.25, 0.18, 0.3),
    mat(0x3a3a3a, { roughness: 0.45, metalness: 0.5 }),
    [0.48, 1.55, 0],
  ));
  g.add(namedMesh('rightPauldronGlow',
    new THREE.BoxGeometry(0.12, 0.05, 0.2),
    mat(ec, { emissive: ec, emissiveIntensity: 0.5, roughness: 0.3 }),
    [0.48, 1.62, 0],
  ));

  // Arms — heavy
  g.add(namedMesh('leftArm',
    new THREE.CylinderGeometry(0.08, 0.07, 0.55, 8),
    mat(0x4a4a4a, { roughness: 0.5, metalness: 0.4 }),
    [-0.52, 1.15, 0],
  ));
  g.add(namedMesh('rightArm',
    new THREE.CylinderGeometry(0.08, 0.07, 0.55, 8),
    mat(0x4a4a4a, { roughness: 0.5, metalness: 0.4 }),
    [0.52, 1.15, 0],
  ));

  // Massive weapon — scaled up greatsword
  g.add(namedMesh('weaponHandle',
    new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6),
    mat(0x3a2a1a, { roughness: 0.8, metalness: 0.1 }),
    [0.6, 0.85, 0],
  ));
  g.add(namedMesh('weapon',
    new THREE.BoxGeometry(0.07, 0.8, 0.1),
    mat(0x8a8a8a, { metalness: 0.55, roughness: 0.35 }),
    [0.6, 1.45, 0],
  ));
  // Weapon element glow edge
  g.add(namedMesh('weaponGlow',
    new THREE.BoxGeometry(0.075, 0.8, 0.02),
    mat(ec, { emissive: ec, emissiveIntensity: 0.5, roughness: 0.3 }),
    [0.6, 1.45, -0.05],
  ));

  // Cape / wings suggestion behind
  g.add(namedMesh('cape',
    new THREE.BoxGeometry(0.7, 0.8, 0.04),
    mat(0x1a1a1a, { roughness: 0.9, metalness: 0.0 }),
    [0, 1.1, 0.3],
  ));
  g.add(namedMesh('capeGlow',
    new THREE.BoxGeometry(0.65, 0.04, 0.04),
    mat(ec, { emissive: ec, emissiveIntensity: 0.4, roughness: 0.3 }),
    [0, 1.52, 0.3],
  ));

  // Element-colored aura ring at base
  g.add(namedMesh('auraRing',
    new THREE.TorusGeometry(0.7, 0.04, 8, 32),
    mat(ec, { emissive: ec, emissiveIntensity: 0.7, roughness: 0.3 }),
    [0, 0.04, 0],
    [-Math.PI / 2, 0, 0],
  ));

  addDirectionArrow(g, ec);

  // Apply 1.5x scale to entire boss
  g.scale.set(1.5, 1.5, 1.5);
  return g;
}

// ---------- Enemy Mesh Dispatch ----------

const ENEMY_FACTORY: Record<EnemyArchetype, (element: ElementType) => THREE.Group> = {
  brute: createBruteMesh,
  guardian: createGuardianMesh,
  assassin: createAssassinMesh,
  caster: createCasterMesh,
  boss: createBossMesh,
};

export function createEnemyMesh(archetype: EnemyArchetype, element: ElementType): THREE.Group {
  const factory = ENEMY_FACTORY[archetype];
  const group = factory(element);
  group.name = `enemy_${archetype}_${element}`;
  return group;
}
