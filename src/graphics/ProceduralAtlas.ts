import * as THREE from 'three';
import {
  ATLAS_GRID_SIZE,
  BlockId,
  getAllRegisteredItems,
  getBlockOrItem,
  MAX_USED_TILE_ID,
  TileId,
  type ItemOrBlockDef,
} from '../blocks/BlockRegistry';
import {
  ATLAS_CELL_PX,
  ATLAS_INNER_PX,
  ATLAS_PAD_PX,
  ATLAS_SIZE_PX,
} from '../world/ChunkMesher';

export type DesignPackId = 'realiste_hd' | 'classic' | 'medieval_rpg' | 'neon_cyber';

export const DESIGN_PACK_INFO: Record<
  DesignPackId,
  { name: string; badge: string; smoothFilter: boolean; description: string }
> = {
  realiste_hd: {
    name: 'Vue Réelle Photo-HD (64x PBR)',
    badge: '📸 Vue Réelle HD',
    smoothFilter: true,
    description: 'Textures organiques haute définition 64x64, micro-reliefs réalistes, marbre, mousse et reflets physiques.',
  },
  classic: {
    name: 'Classique Fidèle (16x Minecraft)',
    badge: '🎨 Classique 16x',
    smoothFilter: false,
    description: 'Pixel-art 16x16 iconique ultra-net fidèle au style Minecraft original.',
  },
  medieval_rpg: {
    name: 'Médiéval Fantasy RPG (32x)',
    badge: '🏰 Médiéval 32x',
    smoothFilter: false,
    description: 'Pierres de château patinées, bois rustique chaleureux et feuillages profonds.',
  },
  neon_cyber: {
    name: 'Néons Cyber-Voxel (Tron PBR)',
    badge: '⚡ Cyber Néon',
    smoothFilter: false,
    description: 'Blocs sombres futuristes bordés de circuits lumineux émissifs pour le Bloom.',
  },
};

function hashPx(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x + 31, 374761393) ^ Math.imul(y + 17, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function tileableValueNoise(seed: number, x: number, y: number, period: number): number {
  const ix0 = ((Math.floor(x) % period) + period) % period;
  const iy0 = ((Math.floor(y) % period) + period) % period;
  const ix1 = (ix0 + 1) % period;
  const iy1 = (iy0 + 1) % period;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const v00 = hashPx(seed, ix0, iy0);
  const v10 = hashPx(seed, ix1, iy0);
  const v01 = hashPx(seed, ix0, iy1);
  const v11 = hashPx(seed, ix1, iy1);

  const a = v00 + (v10 - v00) * ux;
  const b = v01 + (v11 - v01) * ux;
  return a + (b - a) * uy;
}

function tileableFbm(seed: number, u: number, v: number): number {
  // u, v in 0..64
  const n1 = tileableValueNoise(seed, u * 0.125, v * 0.125, 8);
  const n2 = tileableValueNoise(seed + 101, u * 0.25, v * 0.25, 16);
  const n3 = tileableValueNoise(seed + 202, u * 0.5, v * 0.5, 32);
  const n4 = tileableValueNoise(seed + 303, u, v, 64);
  return n1 * 0.45 + n2 * 0.28 + n3 * 0.17 + n4 * 0.10;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

interface PixelPBR {
  r: number;
  g: number;
  b: number;
  a: number;
  height: number;
  roughness: number;
  metalness: number;
  emissive: number;
}

export class ProceduralAtlas {
  public readonly diffuseCanvas: HTMLCanvasElement;
  public readonly normalCanvas: HTMLCanvasElement;
  public readonly ormCanvas: HTMLCanvasElement;
  public readonly emissiveCanvas: HTMLCanvasElement;

  public readonly diffuseTexture: THREE.CanvasTexture;
  public readonly normalTexture: THREE.CanvasTexture;
  public readonly ormTexture: THREE.CanvasTexture;
  public readonly emissiveTexture: THREE.CanvasTexture;

  public currentPack: DesignPackId = 'realiste_hd';
  private maxAnisotropy = 8;

  private readonly iconCache = new Map<number, string>();
  private readonly innerTileData = new Map<number, ImageData>();
  private readonly packListeners: Array<(pack: DesignPackId) => void> = [];

  constructor(initialPack: DesignPackId = 'realiste_hd') {
    this.currentPack = initialPack;

    this.diffuseCanvas = document.createElement('canvas');
    this.diffuseCanvas.width = ATLAS_SIZE_PX;
    this.diffuseCanvas.height = ATLAS_SIZE_PX;

    this.normalCanvas = document.createElement('canvas');
    this.normalCanvas.width = ATLAS_SIZE_PX;
    this.normalCanvas.height = ATLAS_SIZE_PX;

    this.ormCanvas = document.createElement('canvas');
    this.ormCanvas.width = ATLAS_SIZE_PX;
    this.ormCanvas.height = ATLAS_SIZE_PX;

    this.emissiveCanvas = document.createElement('canvas');
    this.emissiveCanvas.width = ATLAS_SIZE_PX;
    this.emissiveCanvas.height = ATLAS_SIZE_PX;

    this.generateAllTiles();

    this.diffuseTexture = this.makeTexture(this.diffuseCanvas, THREE.SRGBColorSpace);
    this.normalTexture = this.makeTexture(this.normalCanvas, THREE.NoColorSpace);
    this.ormTexture = this.makeTexture(this.ormCanvas, THREE.NoColorSpace);
    this.emissiveTexture = this.makeTexture(this.emissiveCanvas, THREE.SRGBColorSpace);

    this.applyFilteringForPack();
    this.generateAllItemIcons();
  }

  public setMaxAnisotropy(aniso: number): void {
    this.maxAnisotropy = Math.max(1, aniso);
    this.applyFilteringForPack();
  }

  public onPackChanged(cb: (pack: DesignPackId) => void): void {
    this.packListeners.push(cb);
  }

  public setDesignPack(pack: DesignPackId): void {
    if (this.currentPack === pack) return;
    this.currentPack = pack;
    this.generateAllTiles();
    this.applyFilteringForPack();

    this.diffuseTexture.needsUpdate = true;
    this.normalTexture.needsUpdate = true;
    this.ormTexture.needsUpdate = true;
    this.emissiveTexture.needsUpdate = true;

    this.generateAllItemIcons();
    for (const cb of this.packListeners) cb(pack);
  }

  public cycleDesignPack(): DesignPackId {
    const order: DesignPackId[] = ['realiste_hd', 'classic', 'medieval_rpg', 'neon_cyber'];
    const idx = order.indexOf(this.currentPack);
    const next = order[(idx + 1) % order.length]!;
    this.setDesignPack(next);
    return next;
  }

  private applyFilteringForPack(): void {
    const smooth = DESIGN_PACK_INFO[this.currentPack].smoothFilter;
    const mag = smooth ? THREE.LinearFilter : THREE.NearestFilter;
    const min = smooth ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapLinearFilter;
    const aniso = smooth ? this.maxAnisotropy : 1;

    for (const tex of [this.diffuseTexture, this.normalTexture, this.ormTexture, this.emissiveTexture]) {
      tex.magFilter = mag;
      tex.minFilter = min;
      tex.anisotropy = aniso;
      tex.needsUpdate = true;
    }
  }

  private makeTexture(canvas: HTMLCanvasElement, colorSpace: THREE.ColorSpace): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = colorSpace;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  }

  public getItemIcon(id: number): string {
    return this.iconCache.get(id) ?? '';
  }

  private generateAllTiles(): void {
    const dCtx = this.diffuseCanvas.getContext('2d')!;
    const nCtx = this.normalCanvas.getContext('2d')!;
    const oCtx = this.ormCanvas.getContext('2d')!;
    const eCtx = this.emissiveCanvas.getContext('2d')!;

    const dImg = dCtx.createImageData(ATLAS_SIZE_PX, ATLAS_SIZE_PX);
    const nImg = nCtx.createImageData(ATLAS_SIZE_PX, ATLAS_SIZE_PX);
    const oImg = oCtx.createImageData(ATLAS_SIZE_PX, ATLAS_SIZE_PX);
    const eImg = eCtx.createImageData(ATLAS_SIZE_PX, ATLAS_SIZE_PX);

    const S = ATLAS_INNER_PX; // 64
    const grid: PixelPBR[] = new Array(S * S);
    const normalStrength = this.currentPack === 'realiste_hd' ? 3.8 : 2.6;

    for (let tileId = 0; tileId <= MAX_USED_TILE_ID; tileId++) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          grid[y * S + x] = this.samplePackStyledPixel(tileId, x, y);
        }
      }

      const tilePreview = new ImageData(S, S);
      for (let i = 0; i < grid.length; i++) {
        const p = grid[i]!;
        tilePreview.data[i * 4 + 0] = clampByte(p.r);
        tilePreview.data[i * 4 + 1] = clampByte(p.g);
        tilePreview.data[i * 4 + 2] = clampByte(p.b);
        tilePreview.data[i * 4 + 3] = clampByte(p.a);
      }
      this.innerTileData.set(tileId, tilePreview);

      const col = tileId % ATLAS_GRID_SIZE;
      const row = Math.floor(tileId / ATLAS_GRID_SIZE);
      const cellX = col * ATLAS_CELL_PX;
      const cellY = row * ATLAS_CELL_PX;

      for (let cy = 0; cy < ATLAS_CELL_PX; cy++) {
        const iy = Math.max(0, Math.min(S - 1, cy - ATLAS_PAD_PX));
        for (let cx = 0; cx < ATLAS_CELL_PX; cx++) {
          const ix = Math.max(0, Math.min(S - 1, cx - ATLAS_PAD_PX));
          const p = grid[iy * S + ix]!;

          const hL = grid[iy * S + ((ix - 1 + S) % S)]!.height;
          const hR = grid[iy * S + ((ix + 1) % S)]!.height;
          const hU = grid[((iy - 1 + S) % S) * S + ix]!.height;
          const hD = grid[((iy + 1) % S) * S + ix]!.height;

          let nx = (hL - hR) * normalStrength;
          let ny = (hU - hD) * normalStrength;
          let nz = 1.0;
          const invLen = 1.0 / Math.hypot(nx, ny, nz);
          nx *= invLen;
          ny *= invLen;
          nz *= invLen;

          const outIdx = ((cellY + cy) * ATLAS_SIZE_PX + (cellX + cx)) * 4;

          dImg.data[outIdx + 0] = clampByte(p.r);
          dImg.data[outIdx + 1] = clampByte(p.g);
          dImg.data[outIdx + 2] = clampByte(p.b);
          dImg.data[outIdx + 3] = clampByte(p.a);

          nImg.data[outIdx + 0] = clampByte((nx * 0.5 + 0.5) * 255);
          nImg.data[outIdx + 1] = clampByte((ny * 0.5 + 0.5) * 255);
          nImg.data[outIdx + 2] = clampByte((nz * 0.5 + 0.5) * 255);
          nImg.data[outIdx + 3] = 255;

          oImg.data[outIdx + 0] = 255;
          oImg.data[outIdx + 1] = clampByte(p.roughness * 255);
          oImg.data[outIdx + 2] = clampByte(p.metalness * 255);
          oImg.data[outIdx + 3] = 255;

          eImg.data[outIdx + 0] = clampByte(p.r * p.emissive);
          eImg.data[outIdx + 1] = clampByte(p.g * p.emissive);
          eImg.data[outIdx + 2] = clampByte(p.b * p.emissive);
          eImg.data[outIdx + 3] = 255;
        }
      }
    }

    dCtx.putImageData(dImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);
    oCtx.putImageData(oImg, 0, 0);
    eCtx.putImageData(eImg, 0, 0);
  }

  private samplePackStyledPixel(tileId: number, x64: number, y64: number): PixelPBR {
    // Crack stages stay crisp across all packs
    if (tileId >= TileId.CRACK_0 && tileId <= TileId.CRACK_9) {
      return this.sampleBaseTile64(tileId, x64, y64, true);
    }

    if (this.currentPack === 'realiste_hd') {
      return this.samplePhotorealHD64(tileId, x64, y64);
    }

    if (this.currentPack === 'classic') {
      // Quantize 64x64 -> crisp 16x16 (4x4 texel blocks)
      const qx = (x64 >> 2) << 2;
      const qy = (y64 >> 2) << 2;
      return this.sampleBaseTile64(tileId, qx, qy, false);
    }

    if (this.currentPack === 'medieval_rpg') {
      // Quantize 64x64 -> detailed 32x32 RPG art + warm medieval patina
      const qx = (x64 >> 1) << 1;
      const qy = (y64 >> 1) << 1;
      const p = this.sampleBaseTile64(tileId, qx, qy, true);
      if (p.a === 0) return p;
      const vignette = 1.0 - Math.hypot(x64 - 31.5, y64 - 31.5) * 0.0042;
      p.r = p.r * 1.04 * vignette;
      p.g = p.g * 0.98 * vignette;
      p.b = p.b * 0.88 * vignette;
      return p;
    }

    // 'neon_cyber': Sleek dark futuristic voxel grid with glowing neon emissive circuit borders!
    const qx = (x64 >> 1) << 1;
    const qy = (y64 >> 1) << 1;
    const base = this.sampleBaseTile64(tileId, qx, qy, false);
    if (base.a === 0) return base;

    const border = x64 <= 2 || x64 >= 61 || y64 <= 2 || y64 >= 61;
    const subTrace = (x64 === 16 || x64 === 47) && y64 > 12 && y64 < 52 && tileId <= TileId.BEDROCK;
    if (border || subTrace) {
      // Derive vibrant neon hue from tile's natural color
      const maxC = Math.max(1, base.r, base.g, base.b);
      return {
        r: Math.min(255, (base.r / maxC) * 235 + 35),
        g: Math.min(255, (base.g / maxC) * 245 + 35),
        b: Math.min(255, (base.b / maxC) * 255 + 50),
        a: base.a,
        height: 0.85,
        roughness: 0.2,
        metalness: 0.6,
        emissive: border ? 0.85 : 0.55,
      };
    }

    return {
      r: base.r * 0.34 + 10,
      g: base.g * 0.36 + 14,
      b: base.b * 0.44 + 24,
      a: base.a,
      height: base.height * 0.6,
      roughness: 0.28,
      metalness: 0.45,
      emissive: base.emissive,
    };
  }

  /**
   * True 64x64 continuous multi-octave photorealistic material synthesis ("Vue Réelle HD")
   */
  private samplePhotorealHD64(tileId: number, x: number, y: number): PixelPBR {
    const fbm = tileableFbm(tileId * 97 + 13, x, y);
    const detail = tileableFbm(tileId * 313 + 71, x * 2, y * 2);
    const micro = hashPx(tileId * 571, x, y) - 0.5;

    const out = (
      r: number,
      g: number,
      b: number,
      a = 255,
      height = 0.5,
      roughness = 0.8,
      metalness = 0.0,
      emissive = 0.0
    ): PixelPBR => ({ r, g, b, a, height, roughness, metalness, emissive });

    switch (tileId) {
      case TileId.GRASS_TOP: {
        // Realistic layered meadow grass blades + clover + sunlit dew tips
        const bladeWave = Math.sin(x * 0.85 + Math.sin(y * 0.32) * 2.2) * 0.5 + 0.5;
        const tuft = fbm * 0.65 + bladeWave * 0.35;
        const lush = (tuft - 0.5) * 62 + micro * 12;
        const warmSun = detail > 0.62 ? 14 : 0;
        return out(
          54 + lush * 0.55 + warmSun,
          138 + lush + warmSun * 0.7,
          38 + lush * 0.4,
          255,
          0.32 + tuft * 0.58,
          0.68 - (detail > 0.65 ? 0.16 : 0)
        );
      }
      case TileId.DIRT: {
        // Rich organic soil with small mineral pebbles & roots
        const clod = fbm * 48 - 24 + (detail - 0.5) * 24 + micro * 10;
        const isStoneSpeck = detail > 0.78;
        if (isStoneSpeck) {
          return out(146, 140, 134, 255, 0.82, 0.65);
        }
        return out(114 + clod, 78 + clod * 0.74, 48 + clod * 0.52, 255, 0.28 + fbm * 0.55, 0.88);
      }
      case TileId.GRASS_SIDE: {
        const overhang = 11 + Math.floor(Math.sin(x * 0.24) * 3 + tileableFbm(55, x, 0) * 10);
        if (y <= overhang) {
          const p = this.samplePhotorealHD64(TileId.GRASS_TOP, x, y);
          if (y >= overhang - 1) {
            p.r *= 0.76;
            p.g *= 0.76;
            p.b *= 0.76;
          }
          p.height += 0.18;
          return p;
        }
        const soil = this.samplePhotorealHD64(TileId.DIRT, x, y);
        if (y === overhang + 1) {
          soil.r *= 0.72;
          soil.g *= 0.72;
          soil.b *= 0.72;
        }
        return soil;
      }
      case TileId.SNOW: {
        const drift = Math.sin(x * 0.14 + fbm * 2.6) * 8 + (detail - 0.5) * 10;
        const sparkle = micro > 0.45 ? 12 : 0;
        return out(238 + drift + sparkle, 245 + drift + sparkle, 255, 255, 0.52 + fbm * 0.25, sparkle > 0 ? 0.25 : 0.68);
      }
      case TileId.SNOW_GRASS_SIDE: {
        const overhang = 12 + Math.floor(tileableFbm(79, x, 0) * 10);
        if (y <= overhang) return this.samplePhotorealHD64(TileId.SNOW, x, y);
        return this.samplePhotorealHD64(TileId.DIRT, x, y);
      }
      case TileId.STONE: {
        // Natural stratified granite/limestone cliff rock
        const strata = tileableFbm(404, x * 0.6, y * 1.8);
        const crack = Math.abs(strata - 0.5) < 0.025 ? -28 : 0;
        const v = (strata - 0.5) * 44 + (detail - 0.5) * 22 + crack + micro * 8;
        const quartz = detail > 0.76 ? 18 : 0;
        return out(
          124 + v + quartz,
          127 + v + quartz,
          132 + v + quartz,
          255,
          crack < 0 ? 0.16 : 0.42 + strata * 0.45,
          0.66 - (quartz > 0 ? 0.25 : 0),
          quartz > 0 ? 0.12 : 0.0
        );
      }
      case TileId.COBBLESTONE:
      case TileId.MOSSY_COBBLESTONE: {
        // Voronoi-like river stones with deep recessed mortar & optional lush moss
        const wx = x + (fbm - 0.5) * 9;
        const wy = y + (detail - 0.5) * 9;
        const cellX = Math.sin((wx * Math.PI * 2) / 16);
        const cellY = Math.cos((wy * Math.PI * 2) / 16);
        const stoneShape = Math.abs(cellX * cellY);
        if (stoneShape < 0.16) {
          if (tileId === TileId.MOSSY_COBBLESTONE && fbm > 0.42) {
            return out(46 + detail * 30, 124 + detail * 45, 38, 255, 0.36, 0.78);
          }
          return out(62, 66, 70, 255, 0.10, 0.92);
        }
        const dome = Math.min(1, stoneShape * 1.4);
        const shade = (fbm - 0.5) * 38 + dome * 18;
        return out(118 + shade, 122 + shade, 126 + shade, 255, 0.35 + dome * 0.58, 0.64);
      }
      case TileId.SAND: {
        // Wind-rippled desert dunes with sparkling quartz grains
        const ripple = Math.sin(y * 0.42 + Math.sin(x * 0.15) * 2.4 + fbm * 2.2) * 14;
        const sparkle = micro > 0.44 ? 22 : 0;
        const v = ripple + (detail - 0.5) * 16 + sparkle;
        return out(224 + v, 202 + v * 0.92, 146 + v * 0.75, 255, 0.45 + ripple * 0.018, sparkle > 0 ? 0.25 : 0.76);
      }
      case TileId.OAK_LOG_SIDE:
      case TileId.SPRUCE_LOG_SIDE: {
        const dark = tileId === TileId.SPRUCE_LOG_SIDE;
        const fissure = Math.sin(x * 0.68 + fbm * 3.5);
        const bark = fissure * 22 + (detail - 0.5) * 18;
        return dark
          ? out(68 + bark * 0.7, 46 + bark * 0.55, 28 + bark * 0.4, 255, 0.25 + (fissure * 0.5 + 0.5) * 0.65, 0.82)
          : out(106 + bark, 78 + bark * 0.75, 46 + bark * 0.5, 255, 0.25 + (fissure * 0.5 + 0.5) * 0.65, 0.80);
      }
      case TileId.BIRCH_LOG_SIDE: {
        const lenticel = Math.abs(Math.sin(y * 0.45 + fbm * 4.0)) > 0.92 && detail > 0.48;
        if (lenticel) return out(46, 44, 42, 255, 0.28, 0.85);
        const v = (fbm - 0.5) * 22 + micro * 6;
        return out(232 + v, 228 + v, 218 + v, 255, 0.58 + fbm * 0.18, 0.68);
      }
      case TileId.OAK_PLANKS:
      case TileId.BIRCH_PLANKS:
      case TileId.SPRUCE_PLANKS: {
        const base =
          tileId === TileId.BIRCH_PLANKS
            ? [214, 192, 142]
            : tileId === TileId.SPRUCE_PLANKS
            ? [114, 80, 48]
            : [172, 128, 76];
        const plankRow = Math.floor(y / 16);
        const grooveY = y % 16 === 0 || y % 16 === 15;
        const grooveX = (x + plankRow * 23) % 64 === 0;
        if (grooveY || grooveX) {
          return out(base[0]! * 0.62, base[1]! * 0.62, base[2]! * 0.62, 255, 0.14, 0.84);
        }
        const grain = Math.sin(y * 1.1 + fbm * 6.5 + plankRow * 1.7) * 12 + (detail - 0.5) * 12;
        return out(base[0]! + grain, base[1]! + grain * 0.84, base[2]! + grain * 0.68, 255, 0.56 + grain * 0.008, 0.52);
      }
      case TileId.OAK_LEAVES:
      case TileId.BIRCH_LEAVES:
      case TileId.SPRUCE_LEAVES: {
        const gap = fbm < 0.24 && x > 3 && x < 60 && y > 3 && y < 60;
        if (gap) return out(0, 0, 0, 0, 0.05, 0.9);
        const c =
          tileId === TileId.BIRCH_LEAVES
            ? [104, 174, 62]
            : tileId === TileId.SPRUCE_LEAVES
            ? [38, 96, 58]
            : [48, 138, 40];
        const leafShade = (detail - 0.5) * 52 + (fbm - 0.5) * 28;
        return out(c[0]! + leafShade * 0.65, c[1]! + leafShade, c[2]! + leafShade * 0.5, 255, 0.3 + detail * 0.6, 0.56);
      }
      case TileId.MARBLE: {
        // Polished Carrara Marble with flowing diagonal veins
        const vein = Math.abs(Math.sin((x + y * 0.7) * 0.11 + fbm * 4.2));
        const streak = vein < 0.12 ? (0.12 - vein) * 520 : 0;
        const base = 242 + (detail - 0.5) * 12 - streak;
        return out(base, base, base + 4, 255, 0.62 - streak * 0.002, 0.16, 0.08);
      }
      case TileId.OBSIDIAN: {
        const glassSheen = Math.sin((x - y) * 0.18 + fbm * 5.0) * 16;
        return out(24 + glassSheen * 0.6, 16 + glassSheen * 0.4, 42 + glassSheen, 255, 0.45 + fbm * 0.4, 0.18, 0.35);
      }
      case TileId.GOLD_BLOCK:
      case TileId.DIAMOND_BLOCK:
      case TileId.EMERALD_BLOCK:
      case TileId.IRON_BLOCK: {
        const bevel = Math.min(x, 63 - x, y, 63 - y);
        const rim = bevel < 4 ? (bevel - 2) * 14 : 0;
        const brush = Math.sin((x + y) * 0.22 + fbm * 2.0) * 14 + rim;
        if (tileId === TileId.GOLD_BLOCK) return out(246 + brush, 198 + brush, 46 + brush * 0.5, 255, bevel < 3 ? 0.35 : 0.78, 0.18, 0.94);
        if (tileId === TileId.DIAMOND_BLOCK) return out(78 + brush, 232 + brush, 250, 255, bevel < 3 ? 0.35 : 0.82, 0.12, 0.65, 0.12);
        if (tileId === TileId.EMERALD_BLOCK) return out(34 + brush, 218 + brush, 96 + brush, 255, bevel < 3 ? 0.35 : 0.82, 0.15, 0.55, 0.10);
        return out(212 + brush, 218 + brush, 226 + brush, 255, bevel < 3 ? 0.35 : 0.76, 0.24, 0.88);
      }
      case TileId.BRICKS: {
        const rowH = 16;
        const rIdx = Math.floor(y / rowH);
        const my = y % rowH;
        const mx = (x + (rIdx % 2) * 16) % 32;
        if (my <= 1 || mx <= 1) {
          return out(194 + micro * 12, 186 + micro * 12, 174, 255, 0.16, 0.9);
        }
        const brickSeed = hashPx(91, Math.floor((x + (rIdx % 2) * 16) / 32), rIdx);
        const clay = (brickSeed - 0.5) * 32 + (detail - 0.5) * 22;
        return out(176 + clay, 76 + clay * 0.55, 56 + clay * 0.45, 255, 0.72 + fbm * 0.15, 0.68);
      }
      case TileId.STONE_BRICKS: {
        const rIdx = Math.floor(y / 32);
        const my = y % 32;
        const mx = (x + (rIdx % 2) * 32) % 64;
        if (my <= 1 || mx <= 1) return out(68, 72, 78, 255, 0.14, 0.88);
        const bevel = my <= 4 || mx <= 4 ? 14 : my >= 29 || mx >= 61 ? -12 : 0;
        const v = (fbm - 0.5) * 28 + bevel;
        return out(134 + v, 138 + v, 144 + v, 255, 0.65 + bevel * 0.012, 0.62);
      }
      default:
        return this.sampleBaseTile64(tileId, x, y, true);
    }
  }

  private sampleBaseTile64(tileId: number, x64: number, y64: number, hdDetail: boolean): PixelPBR {
    const px = x64 >> 2; // 0..15 classic grid
    const py = y64 >> 2;
    const n = hashPx(tileId * 131 + 7, px, py);
    const fine = hdDetail ? (tileableFbm(tileId * 71, x64, y64) - 0.5) * 22 : (hashPx(tileId * 977 + 3, x64 >> 1, y64 >> 1) - 0.5) * 6;

    const out = (
      r: number,
      g: number,
      b: number,
      a = 255,
      height = 0.5,
      roughness = 0.82,
      metalness = 0.0,
      emissive = 0.0
    ): PixelPBR => ({ r, g, b, a, height, roughness, metalness, emissive });

    switch (tileId) {
      case TileId.GRASS_TOP: {
        const blade = n * 28 - 14 + fine;
        return out(68 + blade * 0.6, 168 + blade, 52 + blade * 0.5, 255, 0.45 + n * 0.25, 0.84);
      }
      case TileId.DIRT: {
        const pebble = (n > 0.86 ? 22 : n < 0.15 ? -18 : (n - 0.5) * 20) + fine;
        return out(134 + pebble, 92 + pebble * 0.8, 56 + pebble * 0.6, 255, 0.4 + n * 0.35, 0.9);
      }
      case TileId.GRASS_SIDE: {
        const overhang = 3 + Math.floor(hashPx(42, px, 0) * 4);
        if (py <= overhang) {
          const blade = n * 26 - 12 + fine * 0.5;
          const rim = py === overhang ? -16 : 0;
          return out(64 + blade * 0.6 + rim, 164 + blade + rim, 48 + blade * 0.5, 255, 0.68 + n * 0.15, 0.82);
        }
        return this.sampleBaseTile64(TileId.DIRT, x64, y64, hdDetail);
      }
      case TileId.SNOW_GRASS_SIDE: {
        const overhang = 3 + Math.floor(hashPx(77, px, 0) * 4);
        if (py <= overhang) return out(242 + fine * 0.4, 248 + fine * 0.4, 255, 255, 0.7, 0.72);
        return this.sampleBaseTile64(TileId.DIRT, x64, y64, hdDetail);
      }
      case TileId.STONE: {
        const strata = hashPx(303, px, py >> 1);
        const v = (strata - 0.5) * 26 + (n - 0.5) * 14 + fine;
        return out(126 + v, 130 + v, 136 + v, 255, 0.5 + strata * 0.3, 0.74);
      }
      case TileId.COBBLESTONE:
      case TileId.MOSSY_COBBLESTONE: {
        const cell = Math.sin(px * 1.4 + hashPx(11, px >> 1, py >> 1) * 3.0) * Math.cos(py * 1.4);
        if (Math.abs(cell) < 0.18) {
          if (tileId === TileId.MOSSY_COBBLESTONE && n > 0.38) {
            return out(52, 136, 44, 255, 0.35, 0.8);
          }
          return out(74, 78, 84, 255, 0.18, 0.9);
        }
        const shade = (n - 0.5) * 30 + fine;
        return out(122 + shade, 126 + shade, 132 + shade, 255, 0.68 + n * 0.25, 0.74);
      }
      case TileId.SAND: {
        const wave = Math.sin((px + py * 0.5) * 0.8) * 8 + (n - 0.5) * 16 + fine * 0.6;
        return out(226 + wave, 208 + wave, 148 + wave * 0.8, 255, 0.48 + wave * 0.015, 0.84);
      }
      case TileId.SANDSTONE_SIDE: {
        const band = (py < 4 ? 12 : py % 5 === 0 ? -18 : (n - 0.5) * 14) + fine * 0.5;
        return out(216 + band, 196 + band, 136 + band * 0.8, 255, py % 5 === 0 ? 0.25 : 0.62, 0.78);
      }
      case TileId.SANDSTONE_TOP: {
        const v = (n - 0.5) * 18 + fine * 0.5;
        return out(222 + v, 204 + v, 144 + v, 255, 0.55 + n * 0.15, 0.78);
      }
      case TileId.GRAVEL: {
        const c = (n > 0.7 ? 24 : n < 0.25 ? -22 : (n - 0.5) * 18) + fine;
        return out(132 + c, 126 + c, 124 + c, 255, 0.35 + n * 0.45, 0.86);
      }
      case TileId.OAK_LOG_SIDE: {
        const ridge = ((px + (py >> 2)) % 3 === 0 ? -18 : 10) + (n - 0.5) * 16 + fine * 0.5;
        return out(104 + ridge, 76 + ridge * 0.8, 44 + ridge * 0.6, 255, ridge < 0 ? 0.3 : 0.72, 0.82);
      }
      case TileId.BIRCH_LOG_SIDE: {
        if (hashPx(512, px >> 1, py) > 0.84) return out(52, 50, 48, 255, 0.32, 0.85);
        const v = (n - 0.5) * 14 + fine * 0.4;
        return out(228 + v, 224 + v, 214 + v, 255, 0.58 + n * 0.12, 0.74);
      }
      case TileId.SPRUCE_LOG_SIDE: {
        const ridge = (px % 3 === 0 ? -14 : 8) + (n - 0.5) * 14 + fine * 0.4;
        return out(66 + ridge, 44 + ridge * 0.7, 26 + ridge * 0.5, 255, ridge < 0 ? 0.28 : 0.7, 0.84);
      }
      case TileId.OAK_LOG_TOP:
      case TileId.BIRCH_LOG_TOP:
      case TileId.SPRUCE_LOG_TOP: {
        const dist = Math.hypot(x64 - 31.5, y64 - 31.5) / 4.0;
        if (dist > 6.6) {
          return tileId === TileId.BIRCH_LOG_TOP
            ? out(220, 216, 206, 255, 0.65, 0.8)
            : tileId === TileId.SPRUCE_LOG_TOP
            ? out(64, 42, 24, 255, 0.65, 0.85)
            : out(98, 72, 42, 255, 0.65, 0.85);
        }
        const ring = Math.sin(dist * 2.4) * 16;
        return out(172 + ring, 134 + ring * 0.8, 82 + ring * 0.6, 255, 0.5 + ring * 0.01, 0.72);
      }
      case TileId.OAK_PLANKS:
      case TileId.BIRCH_PLANKS:
      case TileId.SPRUCE_PLANKS: {
        const base = tileId === TileId.BIRCH_PLANKS ? [208, 190, 138] : tileId === TileId.SPRUCE_PLANKS ? [116, 84, 50] : [168, 128, 76];
        if (py % 4 === 0 || (px + Math.floor(py / 4) * 7) % 16 === 0) {
          return out(base[0]! - 34, base[1]! - 28, base[2]! - 20, 255, 0.22, 0.85);
        }
        const grain = (hashPx(tileId, px >> 1, py) - 0.5) * 16 + fine * 0.6;
        return out(base[0]! + grain, base[1]! + grain * 0.85, base[2]! + grain * 0.7, 255, 0.6, 0.68);
      }
      case TileId.OAK_LEAVES:
      case TileId.BIRCH_LEAVES:
      case TileId.SPRUCE_LEAVES: {
        if (hashPx(tileId * 19, px, py) < 0.20 && px > 0 && px < 15 && py > 0 && py < 15) return out(0, 0, 0, 0, 0.1, 0.9);
        const leafCol = tileId === TileId.BIRCH_LEAVES ? [96, 166, 68] : tileId === TileId.SPRUCE_LEAVES ? [44, 98, 62] : [52, 142, 44];
        const d = (n - 0.5) * 34 + fine;
        return out(leafCol[0]! + d * 0.7, leafCol[1]! + d, leafCol[2]! + d * 0.6, 255, 0.4 + n * 0.4, 0.75);
      }
      case TileId.WATER: {
        const ripple = Math.sin(x64 * 0.22 + y64 * 0.16) * 16;
        return out(28 + ripple * 0.5, 122 + ripple * 0.8, 218 + ripple, 190, 0.5 + ripple * 0.015, 0.06, 0.1);
      }
      case TileId.LAVA: {
        const magma = Math.sin(x64 * 0.19 + Math.cos(y64 * 0.19) * 2.2) * 0.5 + 0.5;
        const hot = magma * 0.65 + n * 0.35;
        return out(218 + hot * 37, 72 + hot * 150, 12 + hot * 38, 255, 0.35 + hot * 0.45, 0.45, 0.0, 0.65 + hot * 0.35);
      }
      case TileId.GLASS: {
        const border = px === 0 || px === 15 || py === 0 || py === 15;
        const streak = px + py === 6 || px + py === 7 || px + py === 21;
        if (border) return out(205, 238, 250, 255, 0.7, 0.12, 0.15);
        if (streak) return out(235, 250, 255, 175, 0.55, 0.08, 0.1);
        return out(180, 225, 245, 22, 0.5, 0.06, 0.1);
      }
      case TileId.BRICKS: {
        const rowIdx = Math.floor(py / 4);
        if (py % 4 === 0 || (px + (rowIdx % 2) * 4) % 8 === 0) return out(186, 178, 168, 255, 0.22, 0.9);
        const tint = (hashPx(88, Math.floor((px + (rowIdx % 2) * 4) / 8), rowIdx) - 0.5) * 24 + fine;
        return out(172 + tint, 74 + tint * 0.6, 58 + tint * 0.5, 255, 0.68, 0.72);
      }
      case TileId.STONE_BRICKS: {
        const rowIdx = Math.floor(py / 8);
        if (py % 8 === 0 || (px + (rowIdx % 2) * 8) % 16 === 0) return out(76, 80, 86, 255, 0.2, 0.88);
        const bevel = py % 8 === 1 || (px + (rowIdx % 2) * 8) % 16 === 1 ? 16 : 0;
        const v = (n - 0.5) * 16 + bevel + fine * 0.6;
        return out(132 + v, 136 + v, 142 + v, 255, 0.68, 0.68);
      }
      case TileId.SNOW:
        return out(242 + fine * 0.5, 248 + fine * 0.5, 255, 255, 0.5 + n * 0.18, 0.72);
      case TileId.ICE: {
        const crack = Math.abs((px * 2 - py) % 11) === 0 ? 28 : 0;
        const s = (n - 0.5) * 14 + crack;
        return out(135 + s, 198 + s, 250, 220, 0.55, 0.08, 0.18);
      }
      case TileId.COAL_ORE:
      case TileId.IRON_ORE:
      case TileId.GOLD_ORE:
      case TileId.DIAMOND_ORE:
      case TileId.EMERALD_ORE: {
        const speck = hashPx(tileId * 53, px, py);
        const cluster = px > 1 && px < 14 && py > 1 && py < 14 && speck > 0.74 && hashPx(tileId * 53, px >> 1, py >> 1) > 0.4;
        if (!cluster) {
          return this.currentPack === 'realiste_hd'
            ? this.samplePhotorealHD64(TileId.STONE, x64, y64)
            : this.sampleBaseTile64(TileId.STONE, x64, y64, hdDetail);
        }
        const hi = speck > 0.88 ? 36 : 0;
        if (tileId === TileId.COAL_ORE) return out(26 + hi * 0.4, 28 + hi * 0.4, 32 + hi * 0.4, 255, 0.32, 0.6, 0.15);
        if (tileId === TileId.IRON_ORE) return out(218 + hi * 0.5, 182 + hi * 0.5, 152 + hi * 0.5, 255, 0.82, 0.28, 0.82);
        if (tileId === TileId.GOLD_ORE) return out(250, 210 + hi, 44 + hi, 255, 0.86, 0.18, 0.94, 0.12);
        if (tileId === TileId.DIAMOND_ORE) return out(68 + hi, 232 + hi, 252, 255, 0.88, 0.12, 0.65, 0.25);
        return out(36 + hi, 228 + hi, 102 + hi, 255, 0.88, 0.14, 0.58, 0.22);
      }
      case TileId.BEDROCK: {
        const b = n > 0.65 ? 78 : n < 0.3 ? 22 : 46;
        return out(b, b, b + 4, 255, 0.3 + n * 0.5, 0.88);
      }
      case TileId.CRAFTING_TOP: {
        if (px < 2 || px > 13 || py < 2 || py > 13) return out(112, 76, 40, 255, 0.7, 0.75);
        if (px % 4 === 1 || py % 4 === 1) return out(74, 48, 24, 255, 0.32, 0.82);
        return out(170 + fine, 124 + fine * 0.8, 72, 255, 0.6, 0.68);
      }
      case TileId.CRAFTING_SIDE: {
        if (py < 3) return out(122, 82, 44, 255, 0.72, 0.75);
        if (px >= 5 && px <= 7 && py >= 5 && py <= 11) return out(176, 184, 196, 255, 0.78, 0.28, 0.82);
        return this.sampleBaseTile64(TileId.OAK_PLANKS, x64, y64, hdDetail);
      }
      case TileId.FURNACE_SIDE:
      case TileId.FURNACE_TOP: {
        if (px === 0 || px === 15 || py === 0 || py === 15) return out(84, 88, 94, 255, 0.72, 0.78);
        return this.sampleBaseTile64(TileId.COBBLESTONE, x64, y64, hdDetail);
      }
      case TileId.FURNACE_FRONT_OFF:
      case TileId.FURNACE_FRONT_ON: {
        const lit = tileId === TileId.FURNACE_FRONT_ON;
        if (px >= 4 && px <= 11 && py >= 3 && py <= 6) return out(28, 30, 34, 255, 0.15, 0.9);
        if (px >= 4 && px <= 11 && py >= 9 && py <= 13) {
          if (lit) {
            const flame = hashPx(777, px, py);
            return out(255, 135 + flame * 105, 24, 255, 0.45, 0.4, 0, 0.98);
          }
          return out(24, 26, 30, 255, 0.15, 0.9);
        }
        return this.sampleBaseTile64(TileId.FURNACE_SIDE, x64, y64, hdDetail);
      }
      case TileId.CHEST_TOP:
      case TileId.CHEST_SIDE:
      case TileId.CHEST_FRONT: {
        if (px === 0 || px === 15 || py === 0 || py === 15) return out(78, 52, 24, 255, 0.74, 0.78);
        if (tileId !== TileId.CHEST_TOP && py === 5) return out(48, 32, 14, 255, 0.24, 0.85);
        if (tileId === TileId.CHEST_FRONT && px >= 7 && px <= 8 && py >= 4 && py <= 7) {
          return out(246, 210, 74, 255, 0.88, 0.22, 0.9);
        }
        const v = (n - 0.5) * 18 + fine * 0.6;
        return out(170 + v, 116 + v * 0.8, 54 + v * 0.6, 255, 0.6, 0.68);
      }
      case TileId.TNT_SIDE: {
        if (py >= 5 && py <= 10) {
          const letter =
            ((px === 3 || px === 11) && py >= 6 && py <= 9) ||
            ((px === 2 || px === 4 || px === 10 || px === 12) && py === 6) ||
            ((px === 6 || px === 8) && py >= 6 && py <= 9) ||
            (px === 7 && py === 7);
          return letter ? out(22, 22, 26, 255, 0.55, 0.8) : out(242, 242, 246, 255, 0.6, 0.72);
        }
        const stripe = px % 4 === 0 ? -22 : 0;
        return out(218 + stripe, 44 + stripe * 0.5, 36 + stripe * 0.5, 255, 0.62, 0.74);
      }
      case TileId.TNT_TOP:
        if (px >= 6 && px <= 9 && py >= 6 && py <= 9) return out(38, 38, 42, 255, 0.8, 0.85);
        return out(212, 48, 38, 255, 0.6, 0.75);
      case TileId.TNT_BOTTOM:
        return out(186, 42, 34, 255, 0.55, 0.78);
      case TileId.GLOWSTONE: {
        const glow = hashPx(909, px, py);
        const bright = glow > 0.52;
        return out(bright ? 255 : 210, bright ? 234 : 164, bright ? 138 : 72, 255, bright ? 0.82 : 0.36, 0.38, 0.2, bright ? 0.98 : 0.6);
      }
      case TileId.TORCH: {
        if (px < 6 || px > 9 || py < 2) return out(0, 0, 0, 0);
        if (py <= 5) {
          const core = (px === 7 || px === 8) && (py === 3 || py === 4);
          return out(255, core ? 248 : 178, core ? 175 : 36, 255, 0.78, 0.25, 0, 1.0);
        }
        return out(140 + (n - 0.5) * 18, 98 + (n - 0.5) * 14, 52, 255, 0.62, 0.78);
      }
      case TileId.CACTUS_SIDE: {
        const rib = px % 4 === 0 ? -18 : 8;
        if (px % 4 === 2 && py % 5 === 2) return out(232, 228, 190, 255, 0.9, 0.65);
        return out(42 + rib * 0.6, 132 + rib + fine * 0.5, 46 + rib * 0.6, 255, rib < 0 ? 0.3 : 0.72, 0.7);
      }
      case TileId.CACTUS_TOP: {
        const d = Math.hypot(px - 7.5, py - 7.5);
        return out(56, d < 3 ? 166 : 136, 58, 255, 0.6, 0.72);
      }
      case TileId.FLOWER_RED:
      case TileId.FLOWER_YELLOW: {
        if (px >= 7 && px <= 8 && py >= 7) return out(46, 148, 48, 255, 0.6, 0.78);
        const dist = Math.hypot(px - 7.5, py - 4.8);
        if (dist <= 3.6) {
          if (dist < 1.3) return out(250, 204, 21, 255, 0.72, 0.65);
          return tileId === TileId.FLOWER_RED
            ? out(236, 44, 52, 255, 0.68, 0.65)
            : out(252, 220, 38, 255, 0.68, 0.65);
        }
        return out(0, 0, 0, 0);
      }
      case TileId.TALL_GRASS: {
        const stalk = Math.abs(((px * 3 + (py >> 1)) % 5) - 2) === 0 && py > 2 + (px % 4);
        if (!stalk) return out(0, 0, 0, 0);
        return out(62 + n * 24, 162 + n * 30, 48, 255, 0.6, 0.78);
      }
      // ==================== ULTIMATE EDITION NEW TILES ====================
      case TileId.OBSIDIAN: {
        const sh = (n - 0.5) * 24 + fine * 0.5;
        return out(28 + sh * 0.5, 18 + sh * 0.4, 48 + sh, 255, 0.45 + n * 0.35, 0.22, 0.35);
      }
      case TileId.BOOKSHELF_SIDE: {
        if (py <= 1 || py >= 14 || py === 7 || py === 8) {
          return this.sampleBaseTile64(TileId.OAK_PLANKS, x64, y64, hdDetail);
        }
        const spine = Math.floor(px / 2);
        const colors = [
          [178, 38, 42],
          [34, 118, 72],
          [38, 86, 168],
          [164, 112, 34],
          [116, 44, 142],
        ];
        const col = colors[(spine + (py > 7 ? 2 : 0)) % colors.length]!;
        const band = py === 4 || py === 11 ? 38 : 0;
        const seam = x64 % 8 === 0 ? -35 : 0;
        return out(col[0]! + band + seam, col[1]! + band + seam, col[2]! + band + seam, 255, seam < 0 ? 0.25 : 0.72, 0.68);
      }
      case TileId.LANTERN: {
        const border = px <= 2 || px >= 13 || py <= 1 || py >= 14;
        if (border) return out(42, 46, 54, 255, 0.82, 0.35, 0.8);
        const core = Math.hypot(px - 7.5, py - 7.5) < 4.2;
        return out(255, core ? 242 : 185, core ? 156 : 52, 255, 0.65, 0.25, 0.1, 1.0);
      }
      case TileId.MARBLE: {
        const vein = Math.abs((px + py) % 7 - 3) === 0 ? -24 : 0;
        const v = 242 + (n - 0.5) * 10 + vein + fine * 0.4;
        return out(v, v, v + 4, 255, 0.65, 0.18, 0.08);
      }
      case TileId.GOLD_BLOCK:
        return out(248 + fine, 202 + fine, 44, 255, px === 0 || py === 0 ? 0.35 : 0.78, 0.2, 0.92);
      case TileId.DIAMOND_BLOCK:
        return out(76 + fine, 234 + fine, 252, 255, px === 0 || py === 0 ? 0.35 : 0.82, 0.14, 0.65, 0.12);
      case TileId.EMERALD_BLOCK:
        return out(36 + fine, 220 + fine, 98, 255, px === 0 || py === 0 ? 0.35 : 0.82, 0.16, 0.55, 0.1);
      case TileId.IRON_BLOCK:
        return out(216 + fine, 222 + fine, 228 + fine, 255, px === 0 || py === 0 ? 0.35 : 0.76, 0.26, 0.88);
      case TileId.MAGMA_BLOCK: {
        const crack = Math.sin(px * 0.9 + Math.cos(py * 0.9) * 2.0) > 0.42;
        if (crack) return out(255, 128 + n * 90, 22, 255, 0.35, 0.45, 0, 0.92);
        return out(46 + n * 16, 32 + n * 12, 34 + n * 12, 255, 0.72, 0.85);
      }
      case TileId.SLIME_BLOCK: {
        const core = px >= 4 && px <= 11 && py >= 4 && py <= 11;
        return out(118, 222, 54, core ? 242 : 188, core ? 0.75 : 0.55, 0.18, 0.05, 0.08);
      }
      case TileId.POLISHED_BASALT: {
        const groove = px % 4 === 0 ? -12 : 8;
        const v = 54 + groove + (n - 0.5) * 12 + fine * 0.4;
        return out(v, v + 2, v + 8, 255, groove < 0 ? 0.35 : 0.72, 0.36, 0.25);
      }
      case TileId.AMETHYST_CRYSTAL: {
        const dx = Math.abs(px - 7.5);
        const shard = py >= 3 && dx <= (15 - py) * 0.45;
        if (!shard) return out(0, 0, 0, 0);
        const hi = dx < 1.6 ? 48 : 0;
        return out(186 + hi, 96 + hi, 248, 255, 0.85, 0.15, 0.45, 0.88);
      }
      default: {
        if (tileId >= TileId.CRACK_0 && tileId <= TileId.CRACK_9) {
          const stage = tileId - TileId.CRACK_0 + 1;
          const radius = stage * 1.15;
          const dx = px - 7.5;
          const dy = py - 7.5;
          const dist = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx);
          const branch = Math.abs(Math.sin(angle * 3.0 + dist * 0.55)) < 0.14 + stage * 0.015;
          const ring = Math.abs((dist % 3.2) - 1.5) < 0.28 && stage > 4;
          if (dist <= radius && (branch || ring)) {
            return out(12, 14, 18, 215, 0.1, 0.95);
          }
          return out(0, 0, 0, 0);
        }
        return out(255, 0, 255, 255);
      }
    }
  }

  private generateAllItemIcons(): void {
    const items = getAllRegisteredItems();
    for (const def of items) {
      this.iconCache.set(def.id, this.renderIconDataUrl(def));
    }
    this.iconCache.set(BlockId.FURNACE_ON, this.renderIconDataUrl(getBlockOrItem(BlockId.FURNACE_ON)));
  }

  private renderIconDataUrl(def: ItemOrBlockDef): string {
    const size = 48;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = DESIGN_PACK_INFO[this.currentPack].smoothFilter;

    if (def.isBlock) {
      if (def.renderType === 'cross' || def.renderType === 'torch' || def.renderType === 'lantern') {
        const tile = this.innerTileData.get(def.faces.top);
        if (tile) {
          const tmp = document.createElement('canvas');
          tmp.width = ATLAS_INNER_PX;
          tmp.height = ATLAS_INNER_PX;
          tmp.getContext('2d')!.putImageData(tile, 0, 0);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tmp, 6, 4, 36, 40);
        }
        return c.toDataURL();
      }

      const topTile = this.tileToCanvas(def.faces.top, 1.06);
      const leftTile = this.tileToCanvas(def.faces.north, 0.84);
      const rightTile = this.tileToCanvas(def.faces.east, 0.68);
      const S = ATLAS_INNER_PX; // 64
      const scaleF = 32 / S;

      ctx.save();
      ctx.translate(24, 6);
      ctx.transform(0.58 * scaleF, 0.30 * scaleF, -0.58 * scaleF, 0.30 * scaleF, 0, 0);
      ctx.drawImage(topTile, 0, 0, S, S);
      ctx.restore();

      ctx.save();
      ctx.translate(5.5, 15.6);
      ctx.transform(0.58 * scaleF, 0.30 * scaleF, 0, 0.64 * scaleF, 0, 0);
      ctx.drawImage(leftTile, 0, 0, S, S);
      ctx.restore();

      ctx.save();
      ctx.translate(24, 25.2);
      ctx.transform(0.58 * scaleF, -0.30 * scaleF, 0, 0.64 * scaleF, 0, 0);
      ctx.drawImage(rightTile, 0, 0, S, S);
      ctx.restore();

      return c.toDataURL();
    }

    // Crisp 16x16 pixel-art sprite scaled 3x to 48x48 for tools, weapons, gadgets, armor & food
    const px = (gx: number, gy: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(gx * 3, gy * 3, 3, 3);
    };
    const p1 = def.primaryColor;
    const p2 = def.secondaryColor;

    switch (def.iconShape) {
      case 'pickaxe': {
        for (let i = 2; i <= 11; i++) px(i, 15 - i, p2);
        for (let x = 6; x <= 13; x++) px(x, 2, p1);
        for (let x = 8; x <= 14; x++) px(x, 3, p1);
        px(13, 4, p1); px(14, 5, p1); px(14, 6, p1); px(13, 7, p1); px(5, 3, p1); px(4, 4, p1);
        break;
      }
      case 'hammer': {
        for (let i = 2; i <= 10; i++) px(i, 15 - i, '#78471c');
        for (let y = 1; y <= 6; y++) {
          for (let x = 7; x <= 14; x++) {
            if (x + y >= 10 && x + y <= 18) px(x, y, y === 1 || x === 14 ? p2 : p1);
          }
        }
        break;
      }
      case 'axe': {
        for (let i = 2; i <= 12; i++) px(i, 15 - i, p2);
        for (let y = 2; y <= 6; y++) {
          for (let x = 7; x <= 12; x++) {
            if (x + y >= 10 && x - y <= 9) px(x, y, p1);
          }
        }
        px(13, 4, p1); px(13, 5, p1);
        break;
      }
      case 'shovel': {
        for (let i = 2; i <= 10; i++) px(i, 15 - i, p2);
        for (let y = 2; y <= 5; y++) for (let x = 10; x <= 13; x++) px(x, y, p1);
        px(11, 1, p1); px(12, 1, p1);
        break;
      }
      case 'sword': {
        px(2, 13, p2); px(3, 12, p2); px(4, 11, p2);
        px(3, 9, '#475569'); px(4, 10, '#475569'); px(5, 10, '#475569'); px(6, 11, '#475569');
        for (let i = 5; i <= 13; i++) {
          px(i, 15 - i, p1);
          px(i, 14 - i, p1);
        }
        px(14, 1, '#ffffff');
        break;
      }
      case 'bow': {
        // Bow string
        for (let i = 3; i <= 12; i++) px(4, i, p2);
        // Curved wooden limb
        const arc: Array<[number, number]> = [[4,2],[6,2],[8,3],[10,5],[11,7],[11,8],[10,10],[8,12],[6,13],[4,13]];
        for (const [bx, by] of arc) {
          px(bx, by, p1);
          px(bx + 1, by, p1);
        }
        break;
      }
      case 'arrow': {
        for (let i = 3; i <= 12; i++) px(i, 15 - i, '#a16207');
        px(12, 2, p1); px(13, 2, p1); px(13, 3, p1); px(14, 1, '#ffffff');
        px(2, 13, p2); px(3, 14, p2); px(2, 12, p2);
        break;
      }
      case 'grapple': {
        for (let i = 2; i <= 10; i++) px(i, 15 - i, p2);
        px(11, 4, p1); px(12, 3, p1); px(13, 2, p1);
        px(10, 2, p1); px(9, 2, p1); px(13, 5, p1); px(13, 6, p1);
        break;
      }
      case 'bucket': {
        for (let y = 5; y <= 13; y++) {
          const w = y > 10 ? 3 : 4;
          for (let x = 8 - w; x <= 7 + w; x++) {
            const rim = x === 8 - w || x === 7 + w || y >= 12;
            px(x, y, rim ? p1 : y <= 7 && def.id !== 145 ? p2 : '#334155');
          }
        }
        px(5, 3, '#94a3b8'); px(6, 2, '#94a3b8'); px(9, 2, '#94a3b8'); px(10, 3, '#94a3b8');
        break;
      }
      case 'armor': {
        for (let y = 3; y <= 13; y++) {
          for (let x = 3; x <= 12; x++) {
            if (y <= 5 && (x === 7 || x === 8)) continue; // Neckline
            if (y >= 8 && (x <= 4 || x >= 11)) continue; // Waist taper
            const edge = x === 3 || x === 12 || y === 3 || y === 13;
            px(x, y, edge ? p2 : p1);
          }
        }
        px(6, 6, '#ffffff');
        break;
      }
      case 'wand': {
        for (let i = 2; i <= 11; i++) px(i, 15 - i, '#6b21a8');
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) + Math.abs(dy) <= 2) {
              px(12 + dx, 3 + dy, dx === 0 && dy === 0 ? '#ffffff' : p2);
            }
          }
        }
        break;
      }
      case 'stick': {
        for (let i = 3; i <= 12; i++) {
          px(i, 15 - i, p1);
          if (i % 2 === 0) px(i + 1, 15 - i, p2);
        }
        break;
      }
      case 'ingot': {
        for (let y = 6; y <= 10; y++) {
          for (let x = 3; x <= 12; x++) {
            px(x, y, y === 6 || y === 10 || x === 3 || x === 12 ? p2 : p1);
          }
        }
        px(5, 7, '#ffffff'); px(6, 7, '#ffffff');
        break;
      }
      case 'gem':
      case 'coal': {
        for (let y = 3; y <= 12; y++) {
          for (let x = 4; x <= 11; x++) {
            const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
            if (d <= 5.2) px(x, y, d > 4.0 ? p2 : p1);
          }
        }
        if (def.iconShape === 'gem') {
          px(6, 5, '#ffffff'); px(6, 6, '#ffffff'); px(7, 5, '#ffffff');
        }
        break;
      }
      case 'apple': {
        px(8, 2, '#78350f'); px(9, 2, p2); px(10, 3, p2);
        for (let y = 4; y <= 12; y++) {
          for (let x = 4; x <= 11; x++) {
            if (Math.hypot(x - 7.5, y - 8) <= 4.3) px(x, y, p1);
          }
        }
        px(6, 6, '#ffffff');
        break;
      }
      case 'bread': {
        for (let y = 6; y <= 11; y++) {
          for (let x = 2; x <= 13; x++) {
            if (Math.hypot((x - 7.5) * 0.7, y - 8.5) <= 3.8) px(x, y, y <= 7 ? p1 : p2);
          }
        }
        break;
      }
      case 'meat': {
        for (let y = 4; y <= 11; y++) {
          for (let x = 3; x <= 12; x++) {
            if (Math.hypot(x - 7.5, y - 7.8) <= 4.2) px(x, y, (x + y) % 5 === 0 ? p2 : p1);
          }
        }
        px(11, 11, '#f8fafc'); px(12, 12, '#f8fafc');
        break;
      }
      case 'horn': {
        for (let i = 3; i <= 12; i++) {
          const y = Math.round(11 - Math.sin((i - 3) * 0.25) * 6);
          px(i, y, p1); px(i, y + 1, p1);
          if (i > 9) px(i, y - 1, p2);
        }
        break;
      }
      default:
        break;
    }

    return c.toDataURL();
  }

  private tileToCanvas(tileId: number, brightness: number): HTMLCanvasElement {
    const src = this.innerTileData.get(tileId);
    const c = document.createElement('canvas');
    c.width = ATLAS_INNER_PX;
    c.height = ATLAS_INNER_PX;
    if (!src) return c;
    const ctx = c.getContext('2d')!;
    const out = ctx.createImageData(ATLAS_INNER_PX, ATLAS_INNER_PX);
    for (let i = 0; i < src.data.length; i += 4) {
      out.data[i] = clampByte(src.data[i]! * brightness);
      out.data[i + 1] = clampByte(src.data[i + 1]! * brightness);
      out.data[i + 2] = clampByte(src.data[i + 2]! * brightness);
      out.data[i + 3] = src.data[i + 3]!;
    }
    ctx.putImageData(out, 0, 0);
    return c;
  }
}
