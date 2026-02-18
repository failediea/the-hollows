#!/usr/bin/env tsx
// Procedural dungeon generator CLI
// Usage: npx tsx scripts/dungeon-gen/index.ts --seed 7777 --zone crypt --size medium --difficulty nightmare

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { generateDungeon } from './assembler.js';
import type { ZoneType, DungeonSize, Difficulty } from './types.js';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const VALID_ZONES = new Set(['crypt', 'cavern', 'cathedral', 'sewer', 'fortress']);
const VALID_SIZES = new Set(['small', 'medium', 'large']);
const VALID_DIFFICULTIES = new Set(['normal', 'nightmare', 'hell']);

function parseArgs(argv: string[]): {
  seed: number;
  zone: ZoneType;
  size: DungeonSize;
  difficulty: Difficulty;
} {
  const args = argv.slice(2); // skip node and script path
  const map = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && i + 1 < args.length) {
      map.set(arg.slice(2), args[i + 1]);
      i++;
    }
  }

  // Seed
  const seedStr = map.get('seed');
  if (!seedStr) {
    console.error('Error: --seed is required (integer)');
    process.exit(1);
  }
  const seed = parseInt(seedStr, 10);
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
    console.error(`Error: --seed must be an integer, got "${seedStr}"`);
    process.exit(1);
  }

  // Zone
  const zone = map.get('zone') ?? 'crypt';
  if (!VALID_ZONES.has(zone)) {
    console.error(`Error: --zone must be one of: ${[...VALID_ZONES].join(', ')}, got "${zone}"`);
    process.exit(1);
  }

  // Size
  const size = map.get('size') ?? 'medium';
  if (!VALID_SIZES.has(size)) {
    console.error(`Error: --size must be one of: ${[...VALID_SIZES].join(', ')}, got "${size}"`);
    process.exit(1);
  }

  // Difficulty
  const difficulty = map.get('difficulty') ?? 'normal';
  if (!VALID_DIFFICULTIES.has(difficulty)) {
    console.error(`Error: --difficulty must be one of: ${[...VALID_DIFFICULTIES].join(', ')}, got "${difficulty}"`);
    process.exit(1);
  }

  return {
    seed,
    zone: zone as ZoneType,
    size: size as DungeonSize,
    difficulty: difficulty as Difficulty,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs(process.argv);

  console.log(`Generating dungeon: seed=${config.seed} zone=${config.zone} size=${config.size} difficulty=${config.difficulty}`);
  console.log('---');

  const startTime = performance.now();
  const { glb, manifest } = await generateDungeon(config);
  const genTime = performance.now() - startTime;

  // Output paths
  const projectRoot = resolve(dirname(new URL(import.meta.url).pathname), '../..');
  const outDir = resolve(projectRoot, 'client/public/assets/dungeons');
  const baseName = `dungeon_${config.zone}_${config.seed}`;
  const glbPath = resolve(outDir, `${baseName}.glb`);
  const jsonPath = resolve(outDir, `${baseName}.json`);

  // Create output directory
  mkdirSync(outDir, { recursive: true });

  // Write files
  writeFileSync(glbPath, glb);
  writeFileSync(jsonPath, JSON.stringify(manifest, null, 2));

  // Verify: read back GLB and count nodes
  const io = new NodeIO();
  const verifyDoc = await io.readBinary(readFileSync(glbPath));
  const scenes = verifyDoc.getRoot().listScenes();
  let nodeCount = 0;
  for (const scene of scenes) {
    const countNodes = (nodes: ReturnType<typeof scene.listChildren>): number => {
      let count = nodes.length;
      for (const node of nodes) {
        count += countNodes(node.listChildren());
      }
      return count;
    };
    nodeCount += countNodes(scene.listChildren());
  }

  // Print summary
  const glbSizeKB = (glb.byteLength / 1024).toFixed(1);
  const jsonSize = readFileSync(jsonPath, 'utf-8').length;
  const jsonSizeKB = (jsonSize / 1024).toFixed(1);

  console.log(`Generated in ${genTime.toFixed(0)}ms`);
  console.log(`GLB: ${glbPath} (${glbSizeKB} KB)`);
  console.log(`JSON: ${jsonPath} (${jsonSizeKB} KB)`);
  console.log('---');
  console.log(`Rooms: ${manifest.rooms.length}`);
  console.log(`  ${manifest.rooms.map((r) => `${r.id} (${r.type})`).join(', ')}`);
  console.log(`Connections: ${manifest.connections.length}`);
  console.log(`Lights: ${manifest.light_count}`);
  console.log(`Props: ${manifest.prop_count}`);
  console.log(`Spawn: [${manifest.spawn_points.player.map((v) => v.toFixed(1)).join(', ')}]`);
  if (manifest.spawn_points.boss) {
    console.log(`Boss:  [${manifest.spawn_points.boss.map((v) => v.toFixed(1)).join(', ')}]`);
  }
  console.log('---');
  console.log(`Verification: ${nodeCount} nodes in GLB`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
