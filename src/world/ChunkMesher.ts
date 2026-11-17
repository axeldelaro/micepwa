import {
  ATLAS_GRID_SIZE,
  BlockId,
  getBlockOrItem,
  isOpaqueBlock,
} from '../blocks/BlockRegistry';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './Chunk';

export const ATLAS_SIZE_PX = 2048;
export const ATLAS_CELL_PX = 128; // 2048 / 16 = 128
export const ATLAS_INNER_PX = 64; // 64x64 HD micro-detail per block face!
export const ATLAS_PAD_PX = 32; // 32px extruded mipmap padding on all 4 sides

export interface SubMeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** 4 floats per vertex: [ao (0..1), skyLight (0..1), blockLight (0..1), windWeight (0..1)] */
  voxelLight: Float32Array;
  indices: Uint32Array;
}

export interface ChunkMeshResult {
  opaque: SubMeshBuffers;
  water: SubMeshBuffers;
  floraCutout: SubMeshBuffers;
}

const AO_TABLE = [0.38, 0.60, 0.82, 1.0] as const;

class DynamicMeshBuilder {
  public pos: number[] = [];
  public norm: number[] = [];
  public uv: number[] = [];
  public light: number[] = [];
  public idx: number[] = [];
  public vertCount = 0;

  public pushQuad(
    v0: [number, number, number],
    v1: [number, number, number],
    v2: [number, number, number],
    v3: [number, number, number],
    nx: number,
    ny: number,
    nz: number,
    u0: number,
    vBottom: number,
    u1: number,
    vTop: number,
    l0: [number, number, number, number],
    l1: [number, number, number, number],
    l2: [number, number, number, number],
    l3: [number, number, number, number]
  ): void {
    const base = this.vertCount;
    this.pos.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2], v3[0], v3[1], v3[2]);
    this.norm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.uv.push(u0, vBottom, u1, vBottom, u1, vTop, u0, vTop);
    this.light.push(
      l0[0], l0[1], l0[2], l0[3],
      l1[0], l1[1], l1[2], l1[3],
      l2[0], l2[1], l2[2], l2[3],
      l3[0], l3[1], l3[2], l3[3]
    );

    if (l0[0] + l2[0] > l1[0] + l3[0]) {
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      this.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
    this.vertCount += 4;
  }

  public toBuffers(): SubMeshBuffers {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.norm),
      uvs: new Float32Array(this.uv),
      voxelLight: new Float32Array(this.light),
      indices: new Uint32Array(this.idx),
    };
  }
}

export function getTileUVRect(tileId: number): [number, number, number, number] {
  const col = tileId % ATLAS_GRID_SIZE;
  const row = Math.floor(tileId / ATLAS_GRID_SIZE);
  const uLeft = (col * ATLAS_CELL_PX + ATLAS_PAD_PX) / ATLAS_SIZE_PX;
  const uRight = (col * ATLAS_CELL_PX + ATLAS_PAD_PX + ATLAS_INNER_PX) / ATLAS_SIZE_PX;
  const vTop = 1.0 - (row * ATLAS_CELL_PX + ATLAS_PAD_PX) / ATLAS_SIZE_PX;
  const vBottom = 1.0 - (row * ATLAS_CELL_PX + ATLAS_PAD_PX + ATLAS_INNER_PX) / ATLAS_SIZE_PX;
  return [uLeft, vBottom, uRight, vTop];
}

export class ChunkMesher {
  public buildChunkMeshes(
    paddedBlocks: Uint8Array,
    paddedLight: Uint8Array,
    paddedSize: number
  ): ChunkMeshResult {
    const opaque = new DynamicMeshBuilder();
    const water = new DynamicMeshBuilder();
    const floraCutout = new DynamicMeshBuilder();

    const strideZ = paddedSize;
    const strideY = paddedSize * paddedSize;

    const getBlockP = (px: number, y: number, pz: number): number => {
      if (y < 0) return BlockId.BEDROCK;
      if (y >= CHUNK_HEIGHT || px < 0 || px >= paddedSize || pz < 0 || pz >= paddedSize) {
        return BlockId.AIR;
      }
      return paddedBlocks[y * strideY + pz * strideZ + px]!;
    };

    const getLightByteP = (px: number, y: number, pz: number): number => {
      if (y >= CHUNK_HEIGHT) return 0xf0;
      if (y < 0 || px < 0 || px >= paddedSize || pz < 0 || pz >= paddedSize) return 0xf0;
      return paddedLight[y * strideY + pz * strideZ + px]!;
    };

    const sampleCornerLightAndAO = (
      npx: number,
      ny: number,
      npz: number,
      t1x: number,
      t1y: number,
      t1z: number,
      t2x: number,
      t2y: number,
      t2z: number,
      wind: number,
      selfEmission: number
    ): [number, number, number, number] => {
      const bSide1 = getBlockP(npx + t1x, ny + t1y, npz + t1z);
      const bSide2 = getBlockP(npx + t2x, ny + t2y, npz + t2z);
      const o1 = isOpaqueBlock(bSide1) ? 1 : 0;
      const o2 = isOpaqueBlock(bSide2) ? 1 : 0;
      const bCorner = o1 && o2 ? BlockId.STONE : getBlockP(npx + t1x + t2x, ny + t1y + t2y, npz + t1z + t2z);
      const oc = o1 && o2 ? 1 : isOpaqueBlock(bCorner) ? 1 : 0;

      const aoLevel = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
      const ao = selfEmission >= 12 ? 1.0 : AO_TABLE[aoLevel]!;

      let skySum = 0;
      let blkSum = 0;
      let count = 0;

      const l0 = getLightByteP(npx, ny, npz);
      skySum += (l0 >> 4) & 0x0f;
      blkSum += l0 & 0x0f;
      count++;

      if (!o1) {
        const l1 = getLightByteP(npx + t1x, ny + t1y, npz + t1z);
        skySum += (l1 >> 4) & 0x0f;
        blkSum += l1 & 0x0f;
        count++;
      }
      if (!o2) {
        const l2 = getLightByteP(npx + t2x, ny + t2y, npz + t2z);
        skySum += (l2 >> 4) & 0x0f;
        blkSum += l2 & 0x0f;
        count++;
      }
      if (!(o1 && o2) && !oc) {
        const lc = getLightByteP(npx + t1x + t2x, ny + t1y + t2y, npz + t1z + t2z);
        skySum += (lc >> 4) & 0x0f;
        blkSum += lc & 0x0f;
        count++;
      }

      const avgSky = skySum / (count * 15);
      const avgBlk = Math.max(selfEmission / 15, blkSum / (count * 15));
      return [ao, avgSky, avgBlk, wind];
    };

    const shouldRenderFace = (selfId: number, selfRender: string, neighborId: number): boolean => {
      if (neighborId === BlockId.AIR) return true;
      if (selfRender === 'liquid') {
        return neighborId !== selfId && !isOpaqueBlock(neighborId);
      }
      if (selfRender === 'cutout') {
        if (selfId === BlockId.GLASS || selfId === BlockId.ICE || selfId === BlockId.SLIME_BLOCK) {
          return neighborId !== selfId && !isOpaqueBlock(neighborId);
        }
        return !isOpaqueBlock(neighborId);
      }
      return !isOpaqueBlock(neighborId);
    };

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      // Quick empty Y-slice check for performance optimization
      let sliceHasNonAir = false;
      const yBase = y * strideY;
      for (let lz = 1; lz <= CHUNK_SIZE && !sliceHasNonAir; lz++) {
        const rowBase = yBase + lz * strideZ;
        for (let lx = 1; lx <= CHUNK_SIZE; lx++) {
          if (paddedBlocks[rowBase + lx] !== BlockId.AIR) {
            sliceHasNonAir = true;
            break;
          }
        }
      }
      if (!sliceHasNonAir) continue;

      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const pz = lz + 1;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const px = lx + 1;
          const blockId = paddedBlocks[y * strideY + pz * strideZ + px]!;
          if (blockId === BlockId.AIR) continue;

          const def = getBlockOrItem(blockId);
          const rType = def.renderType;
          const wind = def.windSway ? 1.0 : 0.0;
          const emit = def.lightEmission;

          // 1. Diagonal Cross Flora / Crystals (Flowers, Tall Grass, Amethyst Crystal)
          if (rType === 'cross') {
            const [u0, vb, u1, vt] = getTileUVRect(def.faces.top);
            const lb = getLightByteP(px, y, pz);
            const sky = ((lb >> 4) & 0x0f) / 15;
            const blk = Math.max(emit / 15, (lb & 0x0f) / 15);
            const bottomLight: [number, number, number, number] = [0.88, sky, blk, 0];
            const topLight: [number, number, number, number] = [1.0, sky, blk, wind];

            floraCutout.pushQuad([lx + 0.12, y, lz + 0.12], [lx + 0.88, y, lz + 0.88], [lx + 0.88, y + 0.92, lz + 0.88], [lx + 0.12, y + 0.92, lz + 0.12], 0, 1, 0, u0, vb, u1, vt, bottomLight, bottomLight, topLight, topLight);
            floraCutout.pushQuad([lx + 0.88, y, lz + 0.88], [lx + 0.12, y, lz + 0.12], [lx + 0.12, y + 0.92, lz + 0.12], [lx + 0.88, y + 0.92, lz + 0.88], 0, 1, 0, u0, vb, u1, vt, bottomLight, bottomLight, topLight, topLight);
            floraCutout.pushQuad([lx + 0.12, y, lz + 0.88], [lx + 0.88, y, lz + 0.12], [lx + 0.88, y + 0.92, lz + 0.12], [lx + 0.12, y + 0.92, lz + 0.88], 0, 1, 0, u0, vb, u1, vt, bottomLight, bottomLight, topLight, topLight);
            floraCutout.pushQuad([lx + 0.88, y, lz + 0.12], [lx + 0.12, y, lz + 0.88], [lx + 0.12, y + 0.92, lz + 0.88], [lx + 0.88, y + 0.92, lz + 0.12], 0, 1, 0, u0, vb, u1, vt, bottomLight, bottomLight, topLight, topLight);
            continue;
          }

          // 2. Slim 3D Torch
          if (rType === 'torch') {
            const [u0, vb, u1, vt] = getTileUVRect(def.faces.top);
            const lit: [number, number, number, number] = [1.0, 1.0, 1.0, 0];
            const x0 = lx + 0.42;
            const x1 = lx + 0.58;
            const z0 = lz + 0.42;
            const z1 = lz + 0.58;
            const yh = y + 0.65;
            const uMid0 = u0 + (u1 - u0) * 0.38;
            const uMid1 = u0 + (u1 - u0) * 0.62;
            const vTopTorch = vb + (vt - vb) * 0.85;

            floraCutout.pushQuad([x0, y, z1], [x1, y, z1], [x1, yh, z1], [x0, yh, z1], 0, 0, 1, uMid0, vb, uMid1, vTopTorch, lit, lit, lit, lit);
            floraCutout.pushQuad([x1, y, z0], [x0, y, z0], [x0, yh, z0], [x1, yh, z0], 0, 0, -1, uMid0, vb, uMid1, vTopTorch, lit, lit, lit, lit);
            floraCutout.pushQuad([x1, y, z1], [x1, y, z0], [x1, yh, z0], [x1, yh, z1], 1, 0, 0, uMid0, vb, uMid1, vTopTorch, lit, lit, lit, lit);
            floraCutout.pushQuad([x0, y, z0], [x0, y, z1], [x0, yh, z1], [x0, yh, z0], -1, 0, 0, uMid0, vb, uMid1, vTopTorch, lit, lit, lit, lit);
            floraCutout.pushQuad([x0, yh, z1], [x1, yh, z1], [x1, yh, z0], [x0, yh, z0], 0, 1, 0, uMid0, vTopTorch - 0.01, uMid1, vTopTorch, lit, lit, lit, lit);
            continue;
          }

          // 3. Ornate 3D Forged Lantern
          if (rType === 'lantern') {
            const [u0, vb, u1, vt] = getTileUVRect(def.faces.top);
            const lit: [number, number, number, number] = [1.0, 1.0, 1.0, 0];
            const x0 = lx + 0.28;
            const x1 = lx + 0.72;
            const z0 = lz + 0.28;
            const z1 = lz + 0.72;
            const yh = y + 0.62;

            floraCutout.pushQuad([x0, y, z1], [x1, y, z1], [x1, yh, z1], [x0, yh, z1], 0, 0, 1, u0, vb, u1, vt, lit, lit, lit, lit);
            floraCutout.pushQuad([x1, y, z0], [x0, y, z0], [x0, yh, z0], [x1, yh, z0], 0, 0, -1, u0, vb, u1, vt, lit, lit, lit, lit);
            floraCutout.pushQuad([x1, y, z1], [x1, y, z0], [x1, yh, z0], [x1, yh, z1], 1, 0, 0, u0, vb, u1, vt, lit, lit, lit, lit);
            floraCutout.pushQuad([x0, y, z0], [x0, y, z1], [x0, yh, z1], [x0, yh, z0], -1, 0, 0, u0, vb, u1, vt, lit, lit, lit, lit);
            floraCutout.pushQuad([x0, yh, z1], [x1, yh, z1], [x1, yh, z0], [x0, yh, z0], 0, 1, 0, u0, vb, u1, vt, lit, lit, lit, lit);
            continue;
          }

          // 4. Inset Cactus Cube
          if (rType === 'cactus') {
            const inset = 1 / 16;
            const [sU0, sVb, sU1, sVt] = getTileUVRect(def.faces.north);
            const [tU0, tVb, tU1, tVt] = getTileUVRect(def.faces.top);
            const lb = getLightByteP(px, y, pz);
            const sky = ((lb >> 4) & 0x0f) / 15;
            const blk = (lb & 0x0f) / 15;
            const cl: [number, number, number, number] = [0.92, sky, blk, 0];

            floraCutout.pushQuad([lx, y, lz + 1 - inset], [lx + 1, y, lz + 1 - inset], [lx + 1, y + 1, lz + 1 - inset], [lx, y + 1, lz + 1 - inset], 0, 0, 1, sU0, sVb, sU1, sVt, cl, cl, cl, cl);
            floraCutout.pushQuad([lx + 1, y, lz + inset], [lx, y, lz + inset], [lx, y + 1, lz + inset], [lx + 1, y + 1, lz + inset], 0, 0, -1, sU0, sVb, sU1, sVt, cl, cl, cl, cl);
            floraCutout.pushQuad([lx + 1 - inset, y, lz + 1], [lx + 1 - inset, y, lz], [lx + 1 - inset, y + 1, lz], [lx + 1 - inset, y + 1, lz + 1], 1, 0, 0, sU0, sVb, sU1, sVt, cl, cl, cl, cl);
            floraCutout.pushQuad([lx + inset, y, lz], [lx + inset, y, lz + 1], [lx + inset, y + 1, lz + 1], [lx + inset, y + 1, lz], -1, 0, 0, sU0, sVb, sU1, sVt, cl, cl, cl, cl);
            if (getBlockP(px, y + 1, pz) !== BlockId.CACTUS) {
              floraCutout.pushQuad([lx, y + 1, lz + 1], [lx + 1, y + 1, lz + 1], [lx + 1, y + 1, lz], [lx, y + 1, lz], 0, 1, 0, tU0, tVb, tU1, tVt, cl, cl, cl, cl);
            }
            continue;
          }

          // 5. Standard Cube / Liquid / Cutout Faces
          const target =
            blockId === BlockId.WATER
              ? water
              : rType === 'cutout'
              ? floraCutout
              : opaque;

          const isLiquid = rType === 'liquid';
          const aboveIsSameLiquid = isLiquid && getBlockP(px, y + 1, pz) === blockId;
          const topY = isLiquid && !aboveIsSameLiquid ? y + 0.88 : y + 1;

          // +Y (Top)
          const nTop = getBlockP(px, y + 1, pz);
          if (shouldRenderFace(blockId, rType, nTop)) {
            const [u0, vb, u1, vt] = getTileUVRect(def.faces.top);
            const wTop = isLiquid && !aboveIsSameLiquid ? 1.0 : wind;
            const l0 = sampleCornerLightAndAO(px, y + 1, pz, -1, 0, 0, 0, 0, 1, wTop, emit);
            const l1 = sampleCornerLightAndAO(px, y + 1, pz, 1, 0, 0, 0, 0, 1, wTop, emit);
            const l2 = sampleCornerLightAndAO(px, y + 1, pz, 1, 0, 0, 0, 0, -1, wTop, emit);
            const l3 = sampleCornerLightAndAO(px, y + 1, pz, -1, 0, 0, 0, 0, -1, wTop, emit);
            target.pushQuad([lx, topY, lz + 1], [lx + 1, topY, lz + 1], [lx + 1, topY, lz], [lx, topY, lz], 0, 1, 0, u0, vb, u1, vt, l0, l1, l2, l3);
          }

          // -Y (Bottom)
          const nBot = getBlockP(px, y - 1, pz);
          if (shouldRenderFace(blockId, rType, nBot)) {
            const [u0, vb, u1, vt] = getTileUVRect(def.faces.bottom);
            const l0 = sampleCornerLightAndAO(px, y - 1, pz, -1, 0, 0, 0, 0, -1, wind, emit);
            const l1 = sampleCornerLightAndAO(px, y - 1, pz, 1, 0, 0, 0, 0, -1, wind, emit);
            const l2 = sampleCornerLightAndAO(px, y - 1, pz, 1, 0, 0, 0, 0, 1, wind, emit);
            const l3 = sampleCornerLightAndAO(px, y - 1, pz, -1, 0, 0, 0, 0, 1, wind, emit);
            target.pushQuad([lx, y, lz], [lx + 1, y, lz], [lx + 1, y, lz + 1], [lx, y, lz + 1], 0, -1, 0, u0, vb, u1, vt, l0, l1, l2, l3);
          }

          // +Z (South)
          const nSouth = getBlockP(px, y, pz + 1);
          if (shouldRenderFace(blockId, rType, nSouth)) {
            const [u0, vb, u1, vt] = getTileUVRect(def.faces.south);
            const l0 = sampleCornerLightAndAO(px, y, pz + 1, -1, 0, 0, 0, -1, 0, wind, emit);
            const l1 = sampleCornerLightAndAO(px, y, pz + 1, 1, 0, 0, 0, -1, 0, wind, emit);
            const l2 = sampleCornerLightAndAO(px, y, pz + 1, 1, 0, 0, 0, 1, 0, wind, emit);
            const l3 = sampleCornerLightAndAO(px, y, pz + 1, -1, 0, 0, 0, 1, 0, wind, emit);
            target.pushQuad([lx, y, lz + 1], [lx + 1, y, lz + 1], [lx + 1, topY, lz + 1], [lx, topY, lz + 1], 0, 0, 1, u0, vb, u1, vt, l0, l1, l2, l3);
          }

          // -Z (North)
          const nNorth = getBlockP(px, y, pz - 1);
          if (shouldRenderFace(blockId, rType, nNorth)) {
            const [u0, vb, u1, vt] = getTileUVRect(def.faces.north);
            const l0 = sampleCornerLightAndAO(px, y, pz - 1, 1, 0, 0, 0, -1, 0, wind, emit);
            const l1 = sampleCornerLightAndAO(px, y, pz - 1, -1, 0, 0, 0, -1, 0, wind, emit);
            const l2 = sampleCornerLightAndAO(px, y, pz - 1, -1, 0, 0, 0, 1, 0, wind, emit);
            const l3 = sampleCornerLightAndAO(px, y, pz - 1, 1, 0, 0, 0, 1, 0, wind, emit);
            target.pushQuad([lx + 1, y, lz], [lx, y, lz], [lx, topY, lz], [lx + 1, topY, lz], 0, 0, -1, u0, vb, u1, vt, l0, l1, l2, l3);
          }

          // +X (East)
          const nEast = getBlockP(px + 1, y, pz);
          if (shouldRenderFace(blockId, rType, nEast)) {
            const [u0, vb, u1, vt] = getTileUVRect(def.faces.east);
            const l0 = sampleCornerLightAndAO(px + 1, y, pz, 0, -1, 0, 0, 0, 1, wind, emit);
            const l1 = sampleCornerLightAndAO(px + 1, y, pz, 0, -1, 0, 0, 0, -1, wind, emit);
            const l2 = sampleCornerLightAndAO(px + 1, y, pz, 0, 1, 0, 0, 0, -1, wind, emit);
            const l3 = sampleCornerLightAndAO(px + 1, y, pz, 0, 1, 0, 0, 0, 1, wind, emit);
            target.pushQuad([lx + 1, y, lz + 1], [lx + 1, y, lz], [lx + 1, topY, lz], [lx + 1, topY, lz + 1], 1, 0, 0, u0, vb, u1, vt, l0, l1, l2, l3);
          }

          // -X (West)
          const nWest = getBlockP(px - 1, y, pz);
          if (shouldRenderFace(blockId, rType, nWest)) {
            const [u0, vb, u1, vt] = getTileUVRect(def.faces.west);
            const l0 = sampleCornerLightAndAO(px - 1, y, pz, 0, -1, 0, 0, 0, -1, wind, emit);
            const l1 = sampleCornerLightAndAO(px - 1, y, pz, 0, -1, 0, 0, 0, 1, wind, emit);
            const l2 = sampleCornerLightAndAO(px - 1, y, pz, 0, 1, 0, 0, 0, 1, wind, emit);
            const l3 = sampleCornerLightAndAO(px - 1, y, pz, 0, 1, 0, 0, 0, -1, wind, emit);
            target.pushQuad([lx, y, lz], [lx, y, lz + 1], [lx, topY, lz + 1], [lx, topY, lz], -1, 0, 0, u0, vb, u1, vt, l0, l1, l2, l3);
          }
        }
      }
    }

    return {
      opaque: opaque.toBuffers(),
      water: water.toBuffers(),
      floraCutout: floraCutout.toBuffers(),
    };
  }
}
