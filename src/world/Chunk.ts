export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 128;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE; // 32768

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function blockIndex(lx: number, y: number, lz: number): number {
  return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

export function worldToChunkCoord(w: number): number {
  return Math.floor(w / CHUNK_SIZE);
}

export function worldToLocalCoord(w: number): number {
  const m = Math.floor(w) % CHUNK_SIZE;
  return m < 0 ? m + CHUNK_SIZE : m;
}

export class Chunk {
  public readonly cx: number;
  public readonly cz: number;
  public readonly blocks: Uint8Array;
  /** High nibble (bits 4..7) = skyLight (0..15), Low nibble (bits 0..3) = blockLight (0..15) */
  public readonly light: Uint8Array;
  public dirty = true;

  constructor(cx: number, cz: number, blocks?: Uint8Array, light?: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = blocks ?? new Uint8Array(CHUNK_VOLUME);
    this.light = light ?? new Uint8Array(CHUNK_VOLUME);
  }

  public getBlock(lx: number, y: number, lz: number): number {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
      return 0;
    }
    return this.blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx]!;
  }

  public setBlock(lx: number, y: number, lz: number, id: number): void {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
      return;
    }
    this.blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = id;
    this.dirty = true;
  }

  public getSkyLight(lx: number, y: number, lz: number): number {
    if (y >= CHUNK_HEIGHT) return 15;
    if (y < 0 || lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 15;
    return (this.light[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx]! >> 4) & 0x0f;
  }

  public getBlockLight(lx: number, y: number, lz: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT || lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 0;
    return this.light[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx]! & 0x0f;
  }

  public setSkyLight(lx: number, y: number, lz: number, val: number): void {
    const idx = (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
    this.light[idx] = ((val & 0x0f) << 4) | (this.light[idx]! & 0x0f);
  }

  public setBlockLight(lx: number, y: number, lz: number, val: number): void {
    const idx = (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
    this.light[idx] = (this.light[idx]! & 0xf0) | (val & 0x0f);
  }
}
