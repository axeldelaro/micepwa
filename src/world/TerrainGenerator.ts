import { createNoise2D, createNoise3D, type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import { BlockId } from '../blocks/BlockRegistry';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './Chunk';

export const SEA_LEVEL = 42;

export type BiomeId = 'plains' | 'forest' | 'desert' | 'mountains' | 'tundra' | 'ocean';

export const BIOME_LABELS: Record<BiomeId, string> = {
  plains: 'Plaines & Ruines Anciennes',
  forest: 'Forêt Chênes & Bouleaux',
  desert: 'Désert & Pyramides d\'Or',
  mountains: 'Hautes Montagnes Enneigées',
  tundra: 'Toundra Glacée',
  ocean: 'Océan & Plages',
};

export function hashSeedString(seedStr: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(seed: number, x: number, z: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hash3D(seed: number, x: number, y: number, z: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 1442695041) ^ Math.imul(z, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface ColumnSample {
  biome: BiomeId;
  surfaceY: number;
  continental: number;
  temperature: number;
  humidity: number;
}

export class TerrainGenerator {
  public readonly seedString: string;
  public readonly numericSeed: number;

  private readonly continentNoise: NoiseFunction2D;
  private readonly detailNoise: NoiseFunction2D;
  private readonly tempNoise: NoiseFunction2D;
  private readonly humidNoise: NoiseFunction2D;
  private readonly ridgeNoise: NoiseFunction2D;
  private readonly caveNoiseA: NoiseFunction3D;
  private readonly caveNoiseB: NoiseFunction3D;
  private readonly oreNoise: NoiseFunction3D;

  constructor(seedString: string) {
    this.seedString = seedString;
    this.numericSeed = hashSeedString(seedString);

    this.continentNoise = createNoise2D(createMulberry32(this.numericSeed ^ 0x11111111));
    this.detailNoise = createNoise2D(createMulberry32(this.numericSeed ^ 0x22222222));
    this.tempNoise = createNoise2D(createMulberry32(this.numericSeed ^ 0x33333333));
    this.humidNoise = createNoise2D(createMulberry32(this.numericSeed ^ 0x44444444));
    this.ridgeNoise = createNoise2D(createMulberry32(this.numericSeed ^ 0x55555555));
    this.caveNoiseA = createNoise3D(createMulberry32(this.numericSeed ^ 0x66666666));
    this.caveNoiseB = createNoise3D(createMulberry32(this.numericSeed ^ 0x77777777));
    this.oreNoise = createNoise3D(createMulberry32(this.numericSeed ^ 0x88888888));
  }

  private fbm2D(noise: NoiseFunction2D, x: number, z: number, octaves: number, scale: number): number {
    let sum = 0;
    let amp = 1;
    let freq = scale;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.02;
    }
    return sum / norm;
  }

  public sampleColumn(wx: number, wz: number): ColumnSample {
    const continental = this.fbm2D(this.continentNoise, wx, wz, 3, 0.0028);
    const temperature = this.fbm2D(this.tempNoise, wx + 1200, wz - 800, 2, 0.0022);
    const humidity = this.fbm2D(this.humidNoise, wx - 1500, wz + 950, 2, 0.0025);
    const detail = this.fbm2D(this.detailNoise, wx, wz, 3, 0.014);
    const ridgeRaw = 1.0 - Math.abs(this.ridgeNoise(wx * 0.0045, wz * 0.0045));
    const ridge = ridgeRaw * ridgeRaw;

    let biome: BiomeId = 'plains';
    if (continental < -0.22) {
      biome = 'ocean';
    } else if (continental > 0.36 && ridge > 0.42) {
      biome = 'mountains';
    } else if (temperature < -0.28) {
      biome = 'tundra';
    } else if (temperature > 0.3 && humidity < -0.08) {
      biome = 'desert';
    } else if (humidity > 0.1) {
      biome = 'forest';
    } else {
      biome = 'plains';
    }

    let baseHeight = SEA_LEVEL + 6 + continental * 18 + detail * 6;
    if (continental < -0.15) {
      const oceanFactor = Math.min(1, (-0.15 - continental) / 0.45);
      baseHeight -= oceanFactor * 16;
    }
    const mountainWeight = Math.max(0, (continental - 0.22) / 0.55) * ridge;
    baseHeight += mountainWeight * 48;

    if (temperature > 0.22 && humidity < 0) {
      const dune = Math.abs(this.detailNoise(wx * 0.02, wz * 0.02)) * 5;
      baseHeight += dune * Math.min(1, (temperature - 0.22) * 3);
    }

    const surfaceY = Math.max(6, Math.min(CHUNK_HEIGHT - 16, Math.round(baseHeight)));
    return { biome, surfaceY, continental, temperature, humidity };
  }

  public getBiomeAt(wx: number, wz: number): BiomeId {
    return this.sampleColumn(wx, wz).biome;
  }

  public getSpawnHeight(wx: number, wz: number): number {
    const col = this.sampleColumn(wx, wz);
    return Math.max(col.surfaceY + 2, SEA_LEVEL + 2);
  }

  public generatePaddedChunkBlocks(
    cx: number,
    cz: number,
    paddedBlocks: Uint8Array,
    paddedSize: number,
    deltasMap?: Map<string, Array<[number, number]>>
  ): void {
    const baseWX = cx * CHUNK_SIZE;
    const baseWZ = cz * CHUNK_SIZE;
    const pIdx = (px: number, y: number, pz: number) => (y * paddedSize + pz) * paddedSize + px;
    const cols: ColumnSample[] = new Array(paddedSize * paddedSize);

    // 1. Base terrain, caves, crystals, water, lava, ores
    for (let pz = 0; pz < paddedSize; pz++) {
      const wz = baseWZ + (pz - 1);
      for (let px = 0; px < paddedSize; px++) {
        const wx = baseWX + (px - 1);
        const col = this.sampleColumn(wx, wz);
        cols[pz * paddedSize + px] = col;
        const surfY = col.surfaceY;
        const isBeach = col.biome !== 'tundra' && surfY >= SEA_LEVEL - 2 && surfY <= SEA_LEVEL + 2 && col.continental < 0.02;

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let block = BlockId.AIR;

          if (y === 0 || (y === 1 && hash2D(this.numericSeed, wx, wz) < 0.55)) {
            block = BlockId.BEDROCK;
          } else if (y > surfY) {
            if (y <= SEA_LEVEL) {
              block = y === SEA_LEVEL && col.biome === 'tundra' ? BlockId.ICE : BlockId.WATER;
            }
          } else {
            if (isBeach || (col.biome === 'ocean' && y >= surfY - 2)) {
              block = hash2D(this.numericSeed ^ 99, wx, wz) < 0.2 && y < SEA_LEVEL - 2 ? BlockId.GRAVEL : BlockId.SAND;
            } else if (col.biome === 'desert') {
              block = y >= surfY - 3 ? BlockId.SAND : y >= surfY - 7 ? BlockId.SANDSTONE : BlockId.STONE;
            } else if (col.biome === 'mountains') {
              if (surfY >= 75) block = y >= surfY - 1 ? BlockId.SNOW : y >= surfY - 4 ? BlockId.MARBLE : BlockId.STONE;
              else if (surfY >= 64) block = y === surfY ? BlockId.SNOWY_GRASS : y >= surfY - 2 ? BlockId.DIRT : BlockId.STONE;
              else block = y === surfY ? BlockId.GRASS : y >= surfY - 3 ? BlockId.DIRT : BlockId.STONE;
            } else if (col.biome === 'tundra') {
              block = y === surfY ? BlockId.SNOWY_GRASS : y >= surfY - 3 ? BlockId.DIRT : BlockId.STONE;
            } else {
              block = y === surfY ? BlockId.GRASS : y >= surfY - 3 ? BlockId.DIRT : BlockId.STONE;
            }

            // Carve 3D caves + Lava + Obsidian/Magma shores
            const preserveCap = surfY <= SEA_LEVEL + 1 ? surfY - 4 : surfY;
            if (y > 1 && y <= preserveCap) {
              const ca = this.caveNoiseA(wx * 0.032, y * 0.042, wz * 0.032);
              const cb = this.caveNoiseB(wx * 0.032 + 91.3, y * 0.042 - 37.1, wz * 0.032 + 54.7);
              const spaghetti = ca * ca + cb * cb;
              const cavern = this.oreNoise(wx * 0.022, y * 0.028, wz * 0.022);
              if (spaghetti < 0.026 || (y < 36 && cavern > 0.68)) {
                if (y <= 10) {
                  block = BlockId.LAVA;
                } else {
                  block = BlockId.AIR;
                }
              } else if (y === 11 && spaghetti < 0.034) {
                block = hash3D(this.numericSeed, wx, y, wz) < 0.4 ? BlockId.MAGMA_BLOCK : BlockId.OBSIDIAN;
              }
            }

            // Stratified Ore Veins inside Stone
            if (block === BlockId.STONE) {
              const ov = this.oreNoise(wx * 0.13, y * 0.13, wz * 0.13);
              if (ov > 0.62) {
                const selector = hash3D(this.numericSeed ^ 0xabcdef, wx >> 1, y >> 1, wz >> 1);
                if (y <= 16 && ov > 0.75 && selector < 0.24) block = BlockId.DIAMOND_ORE;
                else if (y <= 28 && ov > 0.74 && selector >= 0.24 && selector < (col.biome === 'mountains' ? 0.52 : 0.36)) block = BlockId.EMERALD_ORE;
                else if (y <= 32 && ov > 0.70 && selector >= 0.45 && selector < 0.68) block = BlockId.GOLD_ORE;
                else if (y <= 64 && ov > 0.66 && selector >= 0.55) block = BlockId.IRON_ORE;
                else if (y <= 88) block = BlockId.COAL_ORE;
              }
            }
          }

          paddedBlocks[pIdx(px, y, pz)] = block;
        }

        // Luminous Amethyst Crystals growing on deep cave floors (Y = 12..32)
        for (let y = 12; y < 32 && y < surfY - 6; y++) {
          if (
            paddedBlocks[pIdx(px, y, pz)] === BlockId.AIR &&
            paddedBlocks[pIdx(px, y - 1, pz)] === BlockId.STONE &&
            hash3D(this.numericSeed ^ 0x7711, wx, y, wz) < 0.028
          ) {
            paddedBlocks[pIdx(px, y, pz)] = BlockId.AMETHYST_CRYSTAL;
          }
        }
      }
    }

    // 2. Deterministic Ancient Structures (Desert Pyramids & Plains Watchtower Ruins)
    for (let scz = cz - 1; scz <= cz + 1; scz++) {
      for (let scx = cx - 1; scx <= cx + 1; scx++) {
        const structRoll = hash2D(this.numericSeed ^ 0x424242, scx, scz);
        if (structRoll > 0.075) continue;
        // Avoid spawning structure directly at world origin (0,0)
        if (Math.abs(scx) <= 1 && Math.abs(scz) <= 1) continue;

        const centerWX = scx * CHUNK_SIZE + 8;
        const centerWZ = scz * CHUNK_SIZE + 8;
        const centerCol = this.sampleColumn(centerWX, centerWZ);
        if (centerCol.surfaceY <= SEA_LEVEL + 2 || centerCol.surfaceY >= 70) continue;

        if (centerCol.biome === 'desert') {
          this.stampDesertPyramid(paddedBlocks, paddedSize, baseWX, baseWZ, centerWX, centerCol.surfaceY, centerWZ);
        } else if (centerCol.biome === 'plains') {
          this.stampPlainsWatchtower(paddedBlocks, paddedSize, baseWX, baseWZ, centerWX, centerCol.surfaceY, centerWZ);
        }
      }
    }

    // 3. Deterministic Flora & Trees
    for (let gz = -4; gz < CHUNK_SIZE + 4; gz++) {
      const wz = baseWZ + gz;
      for (let gx = -4; gx < CHUNK_SIZE + 4; gx++) {
        const wx = baseWX + gx;
        const r = hash2D(this.numericSeed ^ 0x517cc1b7, wx, wz);
        if (r > 0.16) continue;

        const px = gx + 1;
        const pz = gz + 1;
        const col = px >= 0 && px < paddedSize && pz >= 0 && pz < paddedSize ? cols[pz * paddedSize + px]! : this.sampleColumn(wx, wz);
        const sy = col.surfaceY;
        if (sy <= SEA_LEVEL + 1 || sy >= CHUNK_HEIGHT - 14) continue;

        const neighborTreeCheck =
          hash2D(this.numericSeed ^ 0x517cc1b7, wx + 1, wz) < 0.04 ||
          hash2D(this.numericSeed ^ 0x517cc1b7, wx, wz + 1) < 0.04;

        let treeChance = 0;
        if (col.biome === 'forest') treeChance = 0.032;
        else if (col.biome === 'plains') treeChance = 0.0045;
        else if (col.biome === 'tundra') treeChance = 0.007;
        else if (col.biome === 'mountains' && sy < 72) treeChance = 0.011;

        if (!neighborTreeCheck && r < treeChance) {
          if (px >= 0 && px < paddedSize && pz >= 0 && pz < paddedSize) {
            const ground = paddedBlocks[pIdx(px, sy, pz)]!;
            if (ground !== BlockId.GRASS && ground !== BlockId.SNOWY_GRASS && ground !== BlockId.DIRT) continue;
          }
          const variant = hash2D(this.numericSeed ^ 0x998877, wx, wz);
          const isSpruce = col.biome === 'tundra' || col.biome === 'mountains';
          const isBirch = !isSpruce && col.biome === 'forest' && variant > 0.65;
          const logId = isSpruce ? BlockId.SPRUCE_LOG : isBirch ? BlockId.BIRCH_LOG : BlockId.OAK_LOG;
          const leafId = isSpruce ? BlockId.SPRUCE_LEAVES : isBirch ? BlockId.BIRCH_LEAVES : BlockId.OAK_LEAVES;
          const trunkH = 4 + Math.floor(variant * 3);
          this.placeTreeInPadded(paddedBlocks, paddedSize, px, sy + 1, pz, trunkH, logId, leafId, isSpruce);
          continue;
        }

        if (px >= 0 && px < paddedSize && pz >= 0 && pz < paddedSize) {
          const ground = paddedBlocks[pIdx(px, sy, pz)]!;
          const above = paddedBlocks[pIdx(px, sy + 1, pz)]!;
          if (above !== BlockId.AIR) continue;

          if (col.biome === 'desert' && ground === BlockId.SAND && sy > SEA_LEVEL + 2) {
            if (r < 0.008) {
              const cactusH = 1 + Math.floor(hash2D(this.numericSeed ^ 0x3311, wx, wz) * 3);
              for (let cy = 1; cy <= cactusH && sy + cy < CHUNK_HEIGHT; cy++) {
                paddedBlocks[pIdx(px, sy + cy, pz)] = BlockId.CACTUS;
              }
            }
          } else if (ground === BlockId.GRASS) {
            if (r < 0.025) {
              paddedBlocks[pIdx(px, sy + 1, pz)] = r < 0.012 ? BlockId.FLOWER_RED : BlockId.FLOWER_YELLOW;
            } else if (r < 0.13) {
              paddedBlocks[pIdx(px, sy + 1, pz)] = BlockId.TALL_GRASS;
            }
          }
        }
      }
    }

    // 4. Apply persisted/networked world deltas
    if (deltasMap) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const key = `${cx + dx},${cz + dz}`;
          const entries = deltasMap.get(key);
          if (!entries) continue;
          for (let i = 0; i < entries.length; i++) {
            const [bIdx, blockId] = entries[i]!;
            const lx = bIdx & 15;
            const lz = (bIdx >> 4) & 15;
            const y = bIdx >> 8;
            const px = lx + dx * CHUNK_SIZE + 1;
            const pz = lz + dz * CHUNK_SIZE + 1;
            if (px >= 0 && px < paddedSize && pz >= 0 && pz < paddedSize && y >= 0 && y < CHUNK_HEIGHT) {
              paddedBlocks[pIdx(px, y, pz)] = blockId;
            }
          }
        }
      }
    }
  }

  private setWorldInPadded(
    paddedBlocks: Uint8Array,
    paddedSize: number,
    baseWX: number,
    baseWZ: number,
    wx: number,
    wy: number,
    wz: number,
    blockId: number
  ): void {
    const px = wx - baseWX + 1;
    const pz = wz - baseWZ + 1;
    if (px < 0 || px >= paddedSize || pz < 0 || pz >= paddedSize || wy < 1 || wy >= CHUNK_HEIGHT) return;
    paddedBlocks[(wy * paddedSize + pz) * paddedSize + px] = blockId;
  }

  private stampDesertPyramid(
    paddedBlocks: Uint8Array,
    paddedSize: number,
    baseWX: number,
    baseWZ: number,
    cx: number,
    baseY: number,
    cz: number
  ): void {
    for (let layer = 0; layer <= 5; layer++) {
      const r = 5 - layer;
      const y = baseY + layer;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const isShell = Math.abs(dx) === r || Math.abs(dz) === r || layer === 0;
          const b = layer === 5 ? BlockId.GOLD_BLOCK : isShell ? BlockId.SANDSTONE : BlockId.AIR;
          this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx + dx, y, cz + dz, b);
        }
      }
    }
    // Entrance & treasure room
    this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx, baseY + 1, cz - 5, BlockId.AIR);
    this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx, baseY + 2, cz - 5, BlockId.AIR);
    this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx, baseY + 1, cz, BlockId.DIAMOND_BLOCK);
    this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx, baseY + 2, cz, BlockId.LANTERN);
  }

  private stampPlainsWatchtower(
    paddedBlocks: Uint8Array,
    paddedSize: number,
    baseWX: number,
    baseWZ: number,
    cx: number,
    baseY: number,
    cz: number
  ): void {
    for (let dy = 0; dy <= 6; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          if (dy === 0) {
            this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx + dx, baseY, cz + dz, BlockId.MOSSY_COBBLESTONE);
          } else if (dy < 6) {
            if (dx === 0 && dz === -2 && dy <= 2) {
              this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx + dx, baseY + dy, cz + dz, BlockId.AIR);
            } else if (edge) {
              const mat = (dx + dy + dz) % 3 === 0 ? BlockId.MOSSY_COBBLESTONE : BlockId.STONE_BRICKS;
              this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx + dx, baseY + dy, cz + dz, mat);
            } else {
              this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx + dx, baseY + dy, cz + dz, BlockId.AIR);
            }
          } else if (edge && (Math.abs(dx) + Math.abs(dz)) % 2 === 0) {
            // Battlements
            this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx + dx, baseY + dy, cz + dz, BlockId.STONE_BRICKS);
          }
        }
      }
    }
    this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx, baseY + 1, cz, BlockId.LANTERN);
    this.setWorldInPadded(paddedBlocks, paddedSize, baseWX, baseWZ, cx, baseY + 6, cz, BlockId.LANTERN);
  }

  private placeTreeInPadded(
    paddedBlocks: Uint8Array,
    paddedSize: number,
    tx: number,
    baseY: number,
    tz: number,
    trunkH: number,
    logId: number,
    leafId: number,
    conifer: boolean
  ): void {
    const setIfAirOrLeaf = (x: number, y: number, z: number, id: number, force: boolean) => {
      if (x < 0 || x >= paddedSize || z < 0 || z >= paddedSize || y < 1 || y >= CHUNK_HEIGHT) return;
      const idx = (y * paddedSize + z) * paddedSize + x;
      const cur = paddedBlocks[idx]!;
      if (force || cur === BlockId.AIR || cur === BlockId.TALL_GRASS || cur === BlockId.FLOWER_RED || cur === BlockId.FLOWER_YELLOW) {
        paddedBlocks[idx] = id;
      }
    };

    if (conifer) {
      for (let dy = 1; dy <= trunkH + 1; dy++) {
        const radius = dy >= trunkH ? 1 : dy % 2 === 0 ? 2 : 1;
        for (let lz = -radius; lz <= radius; lz++) {
          for (let lx = -radius; lx <= radius; lx++) {
            if (Math.abs(lx) === radius && Math.abs(lz) === radius && radius > 1) continue;
            setIfAirOrLeaf(tx + lx, baseY + dy, tz + lz, leafId, false);
          }
        }
      }
      setIfAirOrLeaf(tx, baseY + trunkH + 2, tz, leafId, false);
    } else {
      for (let dy = trunkH - 2; dy <= trunkH + 1; dy++) {
        const radius = dy >= trunkH ? 1 : 2;
        for (let lz = -radius; lz <= radius; lz++) {
          for (let lx = -radius; lx <= radius; lx++) {
            if (Math.abs(lx) === radius && Math.abs(lz) === radius && dy === trunkH + 1) continue;
            if (Math.abs(lx) === 2 && Math.abs(lz) === 2 && dy === trunkH - 2) continue;
            setIfAirOrLeaf(tx + lx, baseY + dy, tz + lz, leafId, false);
          }
        }
      }
    }

    for (let dy = 0; dy < trunkH; dy++) {
      setIfAirOrLeaf(tx, baseY + dy, tz, logId, true);
    }
  }
}
