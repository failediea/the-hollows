/**
 * GLB Metadata Extraction Script
 * Parses each GLB file in the Sentinel assets directory and extracts
 * comprehensive metadata about meshes, materials, skeletons, animations,
 * and the node hierarchy.
 */

import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';

const SENTINEL_DIR = '/home/matrix/hollows/the-hollows/client/public/assets/Sentinel';

/**
 * Compute axis-aligned bounding box from a position accessor.
 */
function computeBoundingBox(positionAccessor) {
  if (!positionAccessor) return null;

  const count = positionAccessor.getCount();
  if (count === 0) return null;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const vec = [0, 0, 0];

  for (let i = 0; i < count; i++) {
    positionAccessor.getElement(i, vec);
    for (let j = 0; j < 3; j++) {
      if (vec[j] < min[j]) min[j] = vec[j];
      if (vec[j] > max[j]) max[j] = vec[j];
    }
  }

  return {
    min: { x: round(min[0]), y: round(min[1]), z: round(min[2]) },
    max: { x: round(max[0]), y: round(max[1]), z: round(max[2]) },
    size: {
      x: round(max[0] - min[0]),
      y: round(max[1] - min[1]),
      z: round(max[2] - min[2]),
    },
  };
}

function round(v) {
  return Math.round(v * 10000) / 10000;
}

/**
 * Extract texture info from a gltf-transform Texture object.
 */
function extractTextureInfo(texture) {
  if (!texture) return null;
  const image = texture.getImage();
  return {
    name: texture.getName() || '(unnamed)',
    mimeType: texture.getMimeType() || 'unknown',
    size: image ? image.byteLength : 0,
    uri: texture.getURI() || null,
  };
}

/**
 * Extract full material metadata.
 */
function extractMaterial(material) {
  if (!material) return null;

  const baseColorFactor = material.getBaseColorFactor();
  const emissiveFactor = material.getEmissiveFactor();

  const info = {
    name: material.getName() || '(unnamed)',
    alphaMode: material.getAlphaMode(),
    alphaCutoff: material.getAlphaCutoff(),
    doubleSided: material.getDoubleSided(),
    pbr: {
      baseColorFactor: baseColorFactor ? Array.from(baseColorFactor) : null,
      metallicFactor: material.getMetallicFactor(),
      roughnessFactor: material.getRoughnessFactor(),
      emissiveFactor: emissiveFactor ? Array.from(emissiveFactor) : null,
    },
    textures: {
      baseColorTexture: extractTextureInfo(material.getBaseColorTexture()),
      metallicRoughnessTexture: extractTextureInfo(material.getMetallicRoughnessTexture()),
      normalTexture: extractTextureInfo(material.getNormalTexture()),
      occlusionTexture: extractTextureInfo(material.getOcclusionTexture()),
      emissiveTexture: extractTextureInfo(material.getEmissiveTexture()),
    },
  };

  // Remove null texture entries for cleaner output
  for (const [key, value] of Object.entries(info.textures)) {
    if (value === null) delete info.textures[key];
  }

  return info;
}

/**
 * Extract mesh primitive data.
 */
function extractMesh(mesh) {
  const primitives = mesh.listPrimitives();
  const primData = primitives.map((prim, idx) => {
    const posAccessor = prim.getAttribute('POSITION');
    const indexAccessor = prim.getIndices();
    const vertexCount = posAccessor ? posAccessor.getCount() : 0;
    const indexCount = indexAccessor ? indexAccessor.getCount() : 0;

    const attributes = {};
    for (const semantic of prim.listSemantics()) {
      const acc = prim.getAttribute(semantic);
      attributes[semantic] = {
        count: acc.getCount(),
        type: acc.getType(),
        componentType: acc.getComponentType(),
      };
    }

    return {
      index: idx,
      mode: prim.getMode(),
      vertexCount,
      indexCount,
      triangleCount: indexCount > 0 ? Math.floor(indexCount / 3) : Math.floor(vertexCount / 3),
      boundingBox: computeBoundingBox(posAccessor),
      material: prim.getMaterial() ? prim.getMaterial().getName() || '(unnamed)' : null,
      attributes,
    };
  });

  return {
    name: mesh.getName() || '(unnamed)',
    primitiveCount: primitives.length,
    primitives: primData,
  };
}

/**
 * Recursively build the node hierarchy.
 */
function buildNodeTree(node, depth = 0) {
  const translation = node.getTranslation();
  const rotation = node.getRotation();
  const scale = node.getScale();
  const mesh = node.getMesh();
  const skin = node.getSkin();

  const entry = {
    name: node.getName() || '(unnamed)',
    translation: Array.from(translation),
    rotation: Array.from(rotation).map(v => round(v)),
    scale: Array.from(scale),
    mesh: mesh ? mesh.getName() || '(unnamed mesh)' : null,
    skin: skin ? skin.getName() || '(unnamed skin)' : null,
    children: node.listChildren().map(child => buildNodeTree(child, depth + 1)),
  };

  return entry;
}

/**
 * Map gltf-transform interpolation path names to friendly types.
 */
function getTrackType(targetPath) {
  return targetPath || 'unknown';
}

/**
 * Extract animation data.
 */
function extractAnimation(animation) {
  const channels = animation.listChannels();
  const samplers = animation.listSamplers();

  let maxDuration = 0;

  const tracks = channels.map((channel, idx) => {
    const targetNode = channel.getTargetNode();
    const targetPath = channel.getTargetPath();
    const sampler = channel.getSampler();

    let inputCount = 0;
    let outputCount = 0;
    let duration = 0;
    let interpolation = 'unknown';

    if (sampler) {
      const input = sampler.getInput();
      const output = sampler.getOutput();
      interpolation = sampler.getInterpolation();

      if (input) {
        inputCount = input.getCount();
        // Find max time in the input accessor (keyframe times)
        for (let i = 0; i < inputCount; i++) {
          const t = input.getElement(i, [0]);
          if (Array.isArray(t)) {
            if (t[0] > duration) duration = t[0];
          } else if (typeof t === 'number') {
            if (t > duration) duration = t;
          }
        }
      }
      if (output) {
        outputCount = output.getCount();
      }
    }

    if (duration > maxDuration) maxDuration = duration;

    return {
      targetNode: targetNode ? targetNode.getName() || '(unnamed)' : null,
      targetPath: getTrackType(targetPath),
      interpolation,
      keyframeCount: inputCount,
    };
  });

  // Summarize track types
  const trackTypeSummary = {};
  for (const track of tracks) {
    const tp = track.targetPath;
    trackTypeSummary[tp] = (trackTypeSummary[tp] || 0) + 1;
  }

  return {
    name: animation.getName() || '(unnamed)',
    duration: round(maxDuration),
    channelCount: channels.length,
    samplerCount: samplers.length,
    trackTypeSummary,
    tracks,
  };
}

/**
 * Extract skin (skeleton) data.
 */
function extractSkin(skin) {
  const joints = skin.listJoints();
  const skeleton = skin.getSkeleton();

  return {
    name: skin.getName() || '(unnamed)',
    jointCount: joints.length,
    skeletonRoot: skeleton ? skeleton.getName() || '(unnamed)' : null,
    joints: joints.map(joint => joint.getName() || '(unnamed)'),
  };
}

/**
 * Main: parse all GLB files and output comprehensive metadata.
 */
async function main() {
  const io = new NodeIO();
  const files = await readdir(SENTINEL_DIR);
  const glbFiles = files.filter(f => f.endsWith('.glb')).sort();

  console.log(`Found ${glbFiles.length} GLB files in ${SENTINEL_DIR}\n`);

  const allResults = [];

  for (const fileName of glbFiles) {
    const filePath = join(SENTINEL_DIR, fileName);
    const fileStat = await stat(filePath);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Processing: ${fileName}`);
    console.log(`${'='.repeat(80)}`);

    const document = await io.read(filePath);
    const root = document.getRoot();

    // 1. File info
    const fileInfo = {
      name: fileName,
      path: filePath,
      sizeBytes: fileStat.size,
      sizeKB: round(fileStat.size / 1024),
      sizeMB: round(fileStat.size / (1024 * 1024)),
    };

    // 2. Scenes
    const scenes = root.listScenes().map(scene => ({
      name: scene.getName() || '(unnamed)',
      rootNodeCount: scene.listChildren().length,
    }));

    // 3. Meshes
    const meshes = root.listMeshes().map(m => extractMesh(m));

    // 4. Materials
    const materials = root.listMaterials().map(m => extractMaterial(m));

    // 5. Textures (top-level list)
    const textures = root.listTextures().map(t => extractTextureInfo(t));

    // 6. Skins (skeletons)
    const skins = root.listSkins().map(s => extractSkin(s));

    // 7. Animations
    const animations = root.listAnimations().map(a => extractAnimation(a));

    // 8. Node hierarchy (from each scene's root nodes)
    const nodeHierarchy = root.listScenes().map(scene => ({
      sceneName: scene.getName() || '(unnamed)',
      roots: scene.listChildren().map(child => buildNodeTree(child)),
    }));

    // 9. Summary counts
    const totalNodes = root.listNodes().length;
    const totalAccessors = root.listAccessors().length;
    const totalBuffers = root.listBuffers().length;
    const totalBufferViews = root.listBuffers().reduce((sum, buf) => {
      const uri = buf.getURI();
      return sum;
    }, 0);

    const result = {
      file: fileInfo,
      summary: {
        sceneCount: scenes.length,
        meshCount: meshes.length,
        materialCount: materials.length,
        textureCount: textures.length,
        skinCount: skins.length,
        animationCount: animations.length,
        nodeCount: totalNodes,
        accessorCount: totalAccessors,
        bufferCount: totalBuffers,
      },
      scenes,
      meshes,
      materials,
      textures,
      skins,
      animations,
      nodeHierarchy,
    };

    allResults.push(result);

    // Print each result as structured JSON
    console.log(JSON.stringify(result, null, 2));
  }

  // Final summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('AGGREGATE SUMMARY');
  console.log(`${'='.repeat(80)}`);
  const summary = {
    totalFiles: allResults.length,
    files: allResults.map(r => ({
      name: r.file.name,
      sizeMB: r.file.sizeMB,
      meshes: r.summary.meshCount,
      materials: r.summary.materialCount,
      textures: r.summary.textureCount,
      skins: r.summary.skinCount,
      animations: r.summary.animationCount,
      joints: r.skins.length > 0 ? r.skins[0].jointCount : 0,
      animDuration: r.animations.length > 0 ? r.animations[0].duration : 0,
      totalVertices: r.meshes.reduce((sum, m) =>
        sum + m.primitives.reduce((s, p) => s + p.vertexCount, 0), 0),
      totalTriangles: r.meshes.reduce((sum, m) =>
        sum + m.primitives.reduce((s, p) => s + p.triangleCount, 0), 0),
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
