import { getLightAttenuation, getLightEmission, isOpaqueBlock } from '../blocks/BlockRegistry';
import { CHUNK_HEIGHT } from './Chunk';

const DIRS_6 = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/**
 * Computes Dual-Channel Voxel Lighting (SkyLight 0..15 + BlockLight 0..15)
 * across a padded volume (paddedSize x CHUNK_HEIGHT x paddedSize, typically 18x128x18)
 * using flat TypedArray BFS queues for zero GC pressure inside Web Workers.
 */
export class LightingEngine {
  private readonly skyQueue: Int32Array;
  private readonly blockQueue: Int32Array;

  constructor(maxVolume = 18 * CHUNK_HEIGHT * 18) {
    this.skyQueue = new Int32Array(maxVolume * 2);
    this.blockQueue = new Int32Array(maxVolume * 2);
  }

  public computePaddedLighting(paddedBlocks: Uint8Array, paddedLight: Uint8Array, paddedSize: number): void {
    paddedLight.fill(0);

    let skyHead = 0;
    let skyTail = 0;
    let blkHead = 0;
    let blkTail = 0;

    const strideZ = paddedSize;
    const strideY = paddedSize * paddedSize;

    // 1. Vertical SkyLight column pass + seed BlockLight emitters
    for (let pz = 0; pz < paddedSize; pz++) {
      for (let px = 0; px < paddedSize; px++) {
        let currentSky = 15;
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          const idx = y * strideY + pz * strideZ + px;
          const blockId = paddedBlocks[idx]!;

          if (currentSky > 0) {
            if (isOpaqueBlock(blockId)) {
              currentSky = 0;
            } else {
              const atten = getLightAttenuation(blockId);
              if (atten > 1) {
                currentSky = Math.max(0, currentSky - atten);
              }
            }
          }

          const emission = getLightEmission(blockId);
          paddedLight[idx] = (currentSky << 4) | emission;

          if (emission > 1) {
            this.blockQueue[blkTail++] = idx;
          }
        }
      }
    }

    // Seed SkyLight BFS only for sunlit cells adjacent to darker non-opaque cells
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      const yOff = y * strideY;
      for (let pz = 0; pz < paddedSize; pz++) {
        const zOff = yOff + pz * strideZ;
        for (let px = 0; px < paddedSize; px++) {
          const idx = zOff + px;
          const sky = (paddedLight[idx]! >> 4) & 0x0f;
          if (sky <= 1) continue;

          // Check 4 horizontal neighbors or vertical shadow edge
          if (
            (px > 0 && ((paddedLight[idx - 1]! >> 4) & 0x0f) + 1 < sky && !isOpaqueBlock(paddedBlocks[idx - 1]!)) ||
            (px + 1 < paddedSize && ((paddedLight[idx + 1]! >> 4) & 0x0f) + 1 < sky && !isOpaqueBlock(paddedBlocks[idx + 1]!)) ||
            (pz > 0 && ((paddedLight[idx - strideZ]! >> 4) & 0x0f) + 1 < sky && !isOpaqueBlock(paddedBlocks[idx - strideZ]!)) ||
            (pz + 1 < paddedSize && ((paddedLight[idx + strideZ]! >> 4) & 0x0f) + 1 < sky && !isOpaqueBlock(paddedBlocks[idx + strideZ]!))
          ) {
            this.skyQueue[skyTail++] = idx;
          }
        }
      }
    }

    // 2. Flood-fill SkyLight BFS
    const queueLimit = this.skyQueue.length;
    while (skyHead < skyTail) {
      const idx = this.skyQueue[skyHead++]!;
      const sky = (paddedLight[idx]! >> 4) & 0x0f;
      if (sky <= 1) continue;

      const y = Math.floor(idx / strideY);
      const rem = idx - y * strideY;
      const pz = Math.floor(rem / strideZ);
      const px = rem - pz * strideZ;

      for (let d = 0; d < 6; d++) {
        const dir = DIRS_6[d]!;
        const nx = px + dir[0];
        const ny = y + dir[1];
        const nz = pz + dir[2];
        if (nx < 0 || nx >= paddedSize || nz < 0 || nz >= paddedSize || ny < 0 || ny >= CHUNK_HEIGHT) continue;

        const nIdx = ny * strideY + nz * strideZ + nx;
        const nBlock = paddedBlocks[nIdx]!;
        if (isOpaqueBlock(nBlock)) continue;

        const atten = Math.max(1, getLightAttenuation(nBlock));
        const nextSky = sky - atten;
        const curNSky = (paddedLight[nIdx]! >> 4) & 0x0f;
        if (nextSky > curNSky) {
          paddedLight[nIdx] = (nextSky << 4) | (paddedLight[nIdx]! & 0x0f);
          if (nextSky > 1 && skyTail < queueLimit) {
            this.skyQueue[skyTail++] = nIdx;
          }
        }
      }
    }

    // 3. Flood-fill BlockLight BFS (Torches, Lava, Glowstone, Lit Furnace)
    const blkLimit = this.blockQueue.length;
    while (blkHead < blkTail) {
      const idx = this.blockQueue[blkHead++]!;
      const blk = paddedLight[idx]! & 0x0f;
      if (blk <= 1) continue;

      const y = Math.floor(idx / strideY);
      const rem = idx - y * strideY;
      const pz = Math.floor(rem / strideZ);
      const px = rem - pz * strideZ;

      for (let d = 0; d < 6; d++) {
        const dir = DIRS_6[d]!;
        const nx = px + dir[0];
        const ny = y + dir[1];
        const nz = pz + dir[2];
        if (nx < 0 || nx >= paddedSize || nz < 0 || nz >= paddedSize || ny < 0 || ny >= CHUNK_HEIGHT) continue;

        const nIdx = ny * strideY + nz * strideZ + nx;
        const nBlock = paddedBlocks[nIdx]!;
        if (isOpaqueBlock(nBlock)) continue;

        const atten = Math.max(1, getLightAttenuation(nBlock));
        const nextBlk = blk - atten;
        const curNBlk = paddedLight[nIdx]! & 0x0f;
        if (nextBlk > curNBlk) {
          paddedLight[nIdx] = (paddedLight[nIdx]! & 0xf0) | nextBlk;
          if (nextBlk > 1 && blkTail < blkLimit) {
            this.blockQueue[blkTail++] = nIdx;
          }
        }
      }
    }
  }
}
