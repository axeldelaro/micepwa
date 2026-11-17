import * as THREE from 'three';
import {
  BlockId,
  getBlockOrItem,
  isSolidBlock,
} from '../blocks/BlockRegistry';
import { getFuelBurnSeconds, getSmeltingRecipe } from '../blocks/Recipes';
import type { ParticleSystem } from '../graphics/ParticleSystem';
import type { ActiveWorldMaterials, RenderPipeline } from '../graphics/RenderPipeline';
import {
  blockIndex,
  Chunk,
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  chunkKey,
  worldToChunkCoord,
  worldToLocalCoord,
} from './Chunk';
import type { ChunkMeshResult, SubMeshBuffers } from './ChunkMesher';
import type { ChunkWorkerRequest, ChunkWorkerResponse } from './chunk.worker';
import { BIOME_LABELS, TerrainGenerator, type BiomeId } from './TerrainGenerator';

const PADDED_SIZE = CHUNK_SIZE + 2;

export interface StackSlot {
  itemId: number;
  count: number;
  durability?: number;
}

export interface FurnaceState {
  key: string;
  x: number;
  y: number;
  z: number;
  input: StackSlot | null;
  fuel: StackSlot | null;
  output: StackSlot | null;
  burnRemaining: number;
  burnTotal: number;
  cookProgress: number;
  cookTotal: number;
}

export interface ChestState {
  key: string;
  x: number;
  y: number;
  z: number;
  slots: Array<StackSlot | null>;
}

interface ChunkRenderEntry {
  group: THREE.Group;
  opaqueMesh?: THREE.Mesh;
  waterMesh?: THREE.Mesh;
  floraMesh?: THREE.Mesh;
}

interface FallingBlockEntity {
  blockId: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  mesh: THREE.Mesh;
}

interface PrimedTNTEntity {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  mesh: THREE.Mesh;
}

export class WorldManager {
  public seed: string;
  public generator: TerrainGenerator;
  public renderDistance = 5;

  public readonly chunks = new Map<string, Chunk>();
  private readonly chunkMeshes = new Map<string, ChunkRenderEntry>();
  private readonly pendingGenerate = new Set<string>();
  /** chunkKey -> Map<blockIndex, blockId> */
  public readonly worldDeltas = new Map<string, Map<number, number>>();
  public readonly furnaces = new Map<string, FurnaceState>();
  public readonly chests = new Map<string, ChestState>();

  private readonly sceneGroup = new THREE.Group();
  private readonly dynamicGroup = new THREE.Group();
  private readonly fallingBlocks: FallingBlockEntity[] = [];
  private readonly primedTnts: PrimedTNTEntity[] = [];
  private readonly scheduledGravity: Array<{ x: number; y: number; z: number; delay: number }> = [];

  private readonly workers: Worker[] = [];
  private nextWorkerIdx = 0;
  private nextJobId = 1;

  private readonly pipeline: RenderPipeline;
  private readonly particles: ParticleSystem;

  public onExplosionCallback?: (
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    brokenBlocks: Array<[number, number, number]>
  ) => void;
  public onBlockChangedCallback?: (wx: number, wy: number, wz: number, blockId: number) => void;

  constructor(
    seed: string,
    scene: THREE.Scene,
    pipeline: RenderPipeline,
    particles: ParticleSystem
  ) {
    this.seed = seed;
    this.generator = new TerrainGenerator(seed);
    this.pipeline = pipeline;
    this.particles = particles;

    scene.add(this.sceneGroup);
    scene.add(this.dynamicGroup);

    const workerCount = Math.max(2, Math.min(4, navigator.hardwareConcurrency || 2));
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL('./chunk.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (ev: MessageEvent<ChunkWorkerResponse>) => this.handleWorkerResponse(ev.data);
      this.postToWorker(worker, { type: 'INIT_SEED', seed: this.seed });
      this.workers.push(worker);
    }

    this.pipeline.onMaterialsChanged((mats) => this.applyMaterialsToAllChunks(mats));
  }

  private postToWorker(worker: Worker, req: ChunkWorkerRequest, transfer?: Transferable[]): void {
    if (transfer) {
      worker.postMessage(req, transfer);
    } else {
      worker.postMessage(req);
    }
  }

  public resetWorld(
    newSeed: string,
    savedDeltas?: Array<[string, Array<[number, number]>]>,
    savedFurnaces?: FurnaceState[],
    savedChests?: ChestState[]
  ): void {
    this.seed = newSeed;
    this.generator = new TerrainGenerator(newSeed);

    for (const entry of this.chunkMeshes.values()) {
      this.disposeChunkRenderEntry(entry);
    }
    this.chunkMeshes.clear();
    this.chunks.clear();
    this.pendingGenerate.clear();
    this.worldDeltas.clear();
    this.furnaces.clear();
    this.chests.clear();

    for (const f of this.fallingBlocks) this.dynamicGroup.remove(f.mesh);
    this.fallingBlocks.length = 0;
    for (const t of this.primedTnts) this.dynamicGroup.remove(t.mesh);
    this.primedTnts.length = 0;
    this.scheduledGravity.length = 0;

    if (savedDeltas) {
      for (const [k, list] of savedDeltas) {
        this.worldDeltas.set(k, new Map(list));
      }
    }
    if (savedFurnaces) {
      for (const f of savedFurnaces) this.furnaces.set(f.key, f);
    }
    if (savedChests) {
      for (const c of savedChests) this.chests.set(c.key, c);
    }

    for (const w of this.workers) {
      this.postToWorker(w, { type: 'INIT_SEED', seed: this.seed });
    }
  }

  public serializeDeltas(): Array<[string, Array<[number, number]>]> {
    const out: Array<[string, Array<[number, number]>]> = [];
    for (const [key, map] of this.worldDeltas.entries()) {
      if (map.size > 0) {
        out.push([key, Array.from(map.entries())]);
      }
    }
    return out;
  }

  public applyNetworkDeltasBatch(deltas: Array<[string, Array<[number, number]>]>): void {
    const touchedChunks = new Set<string>();
    for (const [key, entries] of deltas) {
      let map = this.worldDeltas.get(key);
      if (!map) {
        map = new Map();
        this.worldDeltas.set(key, map);
      }
      const chunk = this.chunks.get(key);
      for (const [bIdx, blockId] of entries) {
        map.set(bIdx, blockId);
        if (chunk) {
          chunk.blocks[bIdx] = blockId;
          touchedChunks.add(key);
        }
      }
    }
    for (const key of touchedChunks) {
      const [cxStr, czStr] = key.split(',');
      this.requestRemeshChunk(Number(cxStr), Number(czStr));
    }
  }

  public getBlock(wx: number, wy: number, wz: number): number {
    const iy = Math.floor(wy);
    if (iy < 0) return BlockId.BEDROCK;
    if (iy >= CHUNK_HEIGHT) return BlockId.AIR;
    const ix = Math.floor(wx);
    const iz = Math.floor(wz);
    const cx = worldToChunkCoord(ix);
    const cz = worldToChunkCoord(iz);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return BlockId.AIR;
    return chunk.getBlock(worldToLocalCoord(ix), iy, worldToLocalCoord(iz));
  }

  public isChunkLoadedAt(wx: number, wz: number): boolean {
    const cx = worldToChunkCoord(Math.floor(wx));
    const cz = worldToChunkCoord(Math.floor(wz));
    return this.chunks.has(chunkKey(cx, cz));
  }

  public isSolidAt(wx: number, wy: number, wz: number): boolean {
    const iy = Math.floor(wy);
    if (iy < 0) return true;
    if (iy >= CHUNK_HEIGHT) return false;
    const cx = worldToChunkCoord(Math.floor(wx));
    const cz = worldToChunkCoord(Math.floor(wz));
    const chunk = this.chunks.get(chunkKey(cx, cz));
    // Prevent falling into unloaded void while spawn chunks generate
    if (!chunk) return true;
    const id = chunk.getBlock(worldToLocalCoord(Math.floor(wx)), iy, worldToLocalCoord(Math.floor(wz)));
    return isSolidBlock(id);
  }

  public getLightAt(wx: number, wy: number, wz: number): { sky: number; block: number } {
    const iy = Math.floor(wy);
    if (iy >= CHUNK_HEIGHT) return { sky: 15, block: 0 };
    if (iy < 0) return { sky: 0, block: 0 };
    const cx = worldToChunkCoord(Math.floor(wx));
    const cz = worldToChunkCoord(Math.floor(wz));
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return { sky: 15, block: 0 };
    const lx = worldToLocalCoord(Math.floor(wx));
    const lz = worldToLocalCoord(Math.floor(wz));
    return {
      sky: chunk.getSkyLight(lx, iy, lz),
      block: chunk.getBlockLight(lx, iy, lz),
    };
  }

  public getBiomeLabelAt(wx: number, wz: number): string {
    const b: BiomeId = this.generator.getBiomeAt(Math.floor(wx), Math.floor(wz));
    return BIOME_LABELS[b];
  }

  public setBlock(
    wx: number,
    wy: number,
    wz: number,
    blockId: number,
    emitNetworkEvent = true,
    triggerPhysics = true
  ): boolean {
    const ix = Math.floor(wx);
    const iy = Math.floor(wy);
    const iz = Math.floor(wz);
    if (iy < 0 || iy >= CHUNK_HEIGHT) return false;

    const cx = worldToChunkCoord(ix);
    const cz = worldToChunkCoord(iz);
    const lx = worldToLocalCoord(ix);
    const lz = worldToLocalCoord(iz);
    const key = chunkKey(cx, cz);

    let deltaMap = this.worldDeltas.get(key);
    if (!deltaMap) {
      deltaMap = new Map();
      this.worldDeltas.set(key, deltaMap);
    }
    const bIdx = blockIndex(lx, iy, lz);
    deltaMap.set(bIdx, blockId);

    const chunk = this.chunks.get(key);
    let prevId = BlockId.AIR;
    if (chunk) {
      prevId = chunk.getBlock(lx, iy, lz);
      if (prevId === blockId) return false;
      chunk.setBlock(lx, iy, lz, blockId);
    }

    // Clean up tile entity drops if Chest or Furnace broken
    const posKey = `${ix},${iy},${iz}`;
    if (prevId === BlockId.CHEST && blockId === BlockId.AIR) {
      const chest = this.chests.get(posKey);
      if (chest) {
        for (const s of chest.slots) {
          if (s && s.count > 0) {
            this.particles.spawnDroppedItem(ix + 0.5, iy + 0.5, iz + 0.5, s.itemId, s.count, s.durability);
          }
        }
        this.chests.delete(posKey);
      }
    }
    if ((prevId === BlockId.FURNACE_OFF || prevId === BlockId.FURNACE_ON) && blockId === BlockId.AIR) {
      const furn = this.furnaces.get(posKey);
      if (furn) {
        for (const s of [furn.input, furn.fuel, furn.output]) {
          if (s && s.count > 0) {
            this.particles.spawnDroppedItem(ix + 0.5, iy + 0.5, iz + 0.5, s.itemId, s.count, s.durability);
          }
        }
        this.furnaces.delete(posKey);
      }
    }

    // Remesh chunk + neighbor chunks when near boundary or when changing light emitters
    const lightChanged =
      getBlockOrItem(prevId).lightEmission > 0 || getBlockOrItem(blockId).lightEmission > 0;
    this.requestRemeshChunk(cx, cz);
    if (lx === 0 || lightChanged) this.requestRemeshChunk(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1 || lightChanged) this.requestRemeshChunk(cx + 1, cz);
    if (lz === 0 || lightChanged) this.requestRemeshChunk(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1 || lightChanged) this.requestRemeshChunk(cx, cz + 1);

    if (triggerPhysics) {
      this.scheduleGravityColumn(ix, iy, iz);
      this.scheduleGravityColumn(ix, iy + 1, iz);
      // Break unsupported flora/torch above
      if (blockId === BlockId.AIR) {
        const above = this.getBlock(ix, iy + 1, iz);
        const aboveDef = getBlockOrItem(above);
        if (aboveDef.renderType === 'cross' || above === BlockId.TORCH || above === BlockId.CACTUS) {
          this.setBlock(ix, iy + 1, iz, BlockId.AIR, emitNetworkEvent, true);
          if (aboveDef.dropCount > 0) {
            this.particles.spawnDroppedItem(ix + 0.5, iy + 1.3, iz + 0.5, aboveDef.dropId, aboveDef.dropCount);
          }
        }
      }
    }

    if (emitNetworkEvent && this.onBlockChangedCallback) {
      this.onBlockChangedCallback(ix, iy, iz, blockId);
    }

    return true;
  }

  private scheduleGravityColumn(x: number, startY: number, z: number): void {
    for (let y = startY; y < CHUNK_HEIGHT - 1; y++) {
      const id = this.getBlock(x, y, z);
      if (getBlockOrItem(id).gravity) {
        const below = this.getBlock(x, y - 1, z);
        if (below === BlockId.AIR || below === BlockId.WATER || below === BlockId.LAVA) {
          this.scheduledGravity.push({ x, y, z, delay: 0.07 });
        }
      } else {
        break;
      }
    }
  }

  public igniteTNT(wx: number, wy: number, wz: number, fuse = 3.0): void {
    const ix = Math.floor(wx);
    const iy = Math.floor(wy);
    const iz = Math.floor(wz);
    if (this.getBlock(ix, iy, iz) === BlockId.TNT) {
      this.setBlock(ix, iy, iz, BlockId.AIR, true, true);
    }
    const mesh = this.particles.createItem3DMesh(BlockId.TNT);
    mesh.scale.setScalar(2.95);
    mesh.position.set(ix + 0.5, iy + 0.5, iz + 0.5);
    this.dynamicGroup.add(mesh);

    this.primedTnts.push({
      x: ix + 0.5,
      y: iy + 0.5,
      z: iz + 0.5,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 3.6,
      vz: (Math.random() - 0.5) * 1.6,
      fuse,
      mesh,
    });
  }

  private detonateTNT(tnt: PrimedTNTEntity): void {
    const radius = 3.6;
    const cx = Math.floor(tnt.x);
    const cy = Math.floor(tnt.y);
    const cz = Math.floor(tnt.z);
    const rCeil = Math.ceil(radius);
    const broken: Array<[number, number, number]> = [];
    const touchedChunks = new Set<string>();

    for (let dy = -rCeil; dy <= rCeil; dy++) {
      for (let dz = -rCeil; dz <= rCeil; dz++) {
        for (let dx = -rCeil; dx <= rCeil; dx++) {
          const dist = Math.hypot(dx, dy, dz);
          if (dist > radius) continue;
          const bx = cx + dx;
          const by = cy + dy;
          const bz = cz + dz;
          if (by <= 0 || by >= CHUNK_HEIGHT) continue;

          const id = this.getBlock(bx, by, bz);
          if (id === BlockId.AIR || id === BlockId.BEDROCK || id === BlockId.OBSIDIAN) continue;

          if (id === BlockId.TNT) {
            this.setBlock(bx, by, bz, BlockId.AIR, false, false);
            this.igniteTNT(bx, by, bz, 0.65 + Math.random() * 0.5);
            continue;
          }

          const def = getBlockOrItem(id);
          if (def.hardness > 2.8 && dist > radius * 0.72) continue;

          // Batch edit without remeshing per single voxel
          const chX = worldToChunkCoord(bx);
          const chZ = worldToChunkCoord(bz);
          const lx = worldToLocalCoord(bx);
          const lz = worldToLocalCoord(bz);
          const k = chunkKey(chX, chZ);
          const ch = this.chunks.get(k);
          if (ch) ch.setBlock(lx, by, lz, BlockId.AIR);

          let dm = this.worldDeltas.get(k);
          if (!dm) {
            dm = new Map();
            this.worldDeltas.set(k, dm);
          }
          dm.set(blockIndex(lx, by, lz), BlockId.AIR);
          touchedChunks.add(k);
          touchedChunks.add(chunkKey(chX - 1, chZ));
          touchedChunks.add(chunkKey(chX + 1, chZ));
          touchedChunks.add(chunkKey(chX, chZ - 1));
          touchedChunks.add(chunkKey(chX, chZ + 1));

          broken.push([bx, by, bz]);
          if (def.dropCount > 0 && Math.random() < 0.35) {
            this.particles.spawnDroppedItem(bx + 0.5, by + 0.5, bz + 0.5, def.dropId, def.dropCount);
          }
        }
      }
    }

    for (const k of touchedChunks) {
      if (this.chunks.has(k)) {
        const [sx, sz] = k.split(',');
        this.requestRemeshChunk(Number(sx), Number(sz));
      }
    }

    for (const [bx, by, bz] of broken) {
      this.scheduleGravityColumn(bx, by + 1, bz);
    }

    this.particles.spawnExplosionBurst(tnt.x, tnt.y, tnt.z);
    if (this.onExplosionCallback) {
      this.onExplosionCallback(tnt.x, tnt.y, tnt.z, radius + 2.2, broken);
    }
  }

  public getOrCreateChest(wx: number, wy: number, wz: number): ChestState {
    const ix = Math.floor(wx);
    const iy = Math.floor(wy);
    const iz = Math.floor(wz);
    const key = `${ix},${iy},${iz}`;
    let chest = this.chests.get(key);
    if (!chest) {
      chest = {
        key,
        x: ix,
        y: iy,
        z: iz,
        slots: new Array(27).fill(null),
      };
      this.chests.set(key, chest);
    }
    return chest;
  }

  public getOrCreateFurnace(wx: number, wy: number, wz: number): FurnaceState {
    const ix = Math.floor(wx);
    const iy = Math.floor(wy);
    const iz = Math.floor(wz);
    const key = `${ix},${iy},${iz}`;
    let f = this.furnaces.get(key);
    if (!f) {
      f = {
        key,
        x: ix,
        y: iy,
        z: iz,
        input: null,
        fuel: null,
        output: null,
        burnRemaining: 0,
        burnTotal: 1,
        cookProgress: 0,
        cookTotal: 5,
      };
      this.furnaces.set(key, f);
    }
    return f;
  }

  public update(dt: number, playerX: number, playerZ: number): void {
    this.streamChunksAround(playerX, playerZ);
    this.updateGravityBlocks(dt);
    this.updatePrimedTNTs(dt);
    this.updateFurnaces(dt);
  }

  private streamChunksAround(playerX: number, playerZ: number): void {
    const centerCX = worldToChunkCoord(Math.floor(playerX));
    const centerCZ = worldToChunkCoord(Math.floor(playerZ));
    const r = this.renderDistance;

    // Unload chunks beyond renderDistance + 2
    const unloadDist = r + 2;
    for (const [key, chunk] of this.chunks.entries()) {
      if (Math.abs(chunk.cx - centerCX) > unloadDist || Math.abs(chunk.cz - centerCZ) > unloadDist) {
        this.chunks.delete(key);
        const meshEntry = this.chunkMeshes.get(key);
        if (meshEntry) {
          this.disposeChunkRenderEntry(meshEntry);
          this.chunkMeshes.delete(key);
        }
      }
    }

    // Spiral queue closest chunks first (cap per frame so main thread never stutters)
    const candidates: Array<{ cx: number; cz: number; dist2: number }> = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > (r + 0.5) * (r + 0.5)) continue;
        const cx = centerCX + dx;
        const cz = centerCZ + dz;
        const k = chunkKey(cx, cz);
        if (!this.chunks.has(k) && !this.pendingGenerate.has(k)) {
          candidates.push({ cx, cz, dist2: d2 });
        }
      }
    }

    if (candidates.length === 0) return;
    candidates.sort((a, b) => a.dist2 - b.dist2);

    const maxDispatchPerFrame = 6;
    const count = Math.min(maxDispatchPerFrame, candidates.length);
    for (let i = 0; i < count; i++) {
      const c = candidates[i]!;
      const k = chunkKey(c.cx, c.cz);
      this.pendingGenerate.add(k);

      const neighborDeltas: Array<[string, Array<[number, number]>]> = [];
      for (let nz = -1; nz <= 1; nz++) {
        for (let nx = -1; nx <= 1; nx++) {
          const nk = chunkKey(c.cx + nx, c.cz + nz);
          const dm = this.worldDeltas.get(nk);
          if (dm && dm.size > 0) {
            neighborDeltas.push([nk, Array.from(dm.entries())]);
          }
        }
      }

      const worker = this.workers[this.nextWorkerIdx % this.workers.length]!;
      this.nextWorkerIdx++;
      this.postToWorker(worker, {
        type: 'GENERATE_CHUNK',
        jobId: this.nextJobId++,
        cx: c.cx,
        cz: c.cz,
        neighborDeltas,
      });
    }
  }

  public requestRemeshChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const center = this.chunks.get(key);
    if (!center) return;

    const padded = new Uint8Array(PADDED_SIZE * CHUNK_HEIGHT * PADDED_SIZE);
    const pStrideZ = PADDED_SIZE;
    const pStrideY = PADDED_SIZE * PADDED_SIZE;

    for (let pz = 0; pz < PADDED_SIZE; pz++) {
      const wzOff = pz - 1;
      const ncz = cz + Math.floor(wzOff / CHUNK_SIZE);
      const nlz = ((wzOff % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      for (let px = 0; px < PADDED_SIZE; px++) {
        const wxOff = px - 1;
        const ncx = cx + Math.floor(wxOff / CHUNK_SIZE);
        const nlx = ((wxOff % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const nChunk = this.chunks.get(chunkKey(ncx, ncz));
        if (!nChunk) continue;

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          padded[y * pStrideY + pz * pStrideZ + px] = nChunk.getBlock(nlx, y, nlz);
        }
      }
    }

    const worker = this.workers[this.nextWorkerIdx % this.workers.length]!;
    this.nextWorkerIdx++;
    this.postToWorker(
      worker,
      {
        type: 'REMESH_PADDED',
        jobId: this.nextJobId++,
        cx,
        cz,
        paddedBlocks: padded,
      },
      [padded.buffer]
    );
  }

  private handleWorkerResponse(res: ChunkWorkerResponse): void {
    const key = chunkKey(res.cx, res.cz);
    this.pendingGenerate.delete(key);

    let chunk = this.chunks.get(key);
    if (res.blocks) {
      chunk = new Chunk(res.cx, res.cz, res.blocks, res.light);
      // Re-apply any local edits that arrived while worker was generating
      const dm = this.worldDeltas.get(key);
      if (dm) {
        for (const [idx, bid] of dm.entries()) {
          chunk.blocks[idx] = bid;
        }
      }
      this.chunks.set(key, chunk);
    } else if (chunk) {
      chunk.light.set(res.light);
    } else {
      return;
    }

    this.uploadChunkMeshes(res.cx, res.cz, res.meshes);
  }

  private uploadChunkMeshes(cx: number, cz: number, meshes: ChunkMeshResult): void {
    const key = chunkKey(cx, cz);
    const old = this.chunkMeshes.get(key);
    if (old) {
      this.disposeChunkRenderEntry(old);
    }

    const mats = this.pipeline.getActiveMaterials();
    const group = new THREE.Group();
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

    const entry: ChunkRenderEntry = { group };

    if (meshes.opaque.indices.length > 0) {
      const geo = this.createBufferGeometry(meshes.opaque);
      const mesh = new THREE.Mesh(geo, mats.opaque);
      mesh.castShadow = mats.castChunkShadows;
      mesh.receiveShadow = mats.castChunkShadows;
      group.add(mesh);
      entry.opaqueMesh = mesh;
    }

    if (meshes.floraCutout.indices.length > 0) {
      const geo = this.createBufferGeometry(meshes.floraCutout);
      const mesh = new THREE.Mesh(geo, mats.floraCutout);
      mesh.castShadow = mats.castChunkShadows;
      mesh.receiveShadow = mats.castChunkShadows;
      mesh.customDepthMaterial = mats.floraDepthMaterial;
      group.add(mesh);
      entry.floraMesh = mesh;
    }

    if (meshes.water.indices.length > 0) {
      const geo = this.createBufferGeometry(meshes.water);
      const mesh = new THREE.Mesh(geo, mats.water);
      mesh.renderOrder = 2;
      group.add(mesh);
      entry.waterMesh = mesh;
    }

    this.sceneGroup.add(group);
    this.chunkMeshes.set(key, entry);
  }

  private createBufferGeometry(buf: SubMeshBuffers): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(buf.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(buf.uvs, 2));
    geo.setAttribute('aVoxelLight', new THREE.BufferAttribute(buf.voxelLight, 4));
    geo.setIndex(new THREE.BufferAttribute(buf.indices, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  private applyMaterialsToAllChunks(mats: ActiveWorldMaterials): void {
    for (const entry of this.chunkMeshes.values()) {
      if (entry.opaqueMesh) {
        entry.opaqueMesh.material = mats.opaque;
        entry.opaqueMesh.castShadow = mats.castChunkShadows;
        entry.opaqueMesh.receiveShadow = mats.castChunkShadows;
      }
      if (entry.floraMesh) {
        entry.floraMesh.material = mats.floraCutout;
        entry.floraMesh.castShadow = mats.castChunkShadows;
        entry.floraMesh.receiveShadow = mats.castChunkShadows;
      }
      if (entry.waterMesh) {
        entry.waterMesh.material = mats.water;
      }
    }
  }

  private disposeChunkRenderEntry(entry: ChunkRenderEntry): void {
    this.sceneGroup.remove(entry.group);
    entry.opaqueMesh?.geometry.dispose();
    entry.floraMesh?.geometry.dispose();
    entry.waterMesh?.geometry.dispose();
  }

  private updateGravityBlocks(dt: number): void {
    for (let i = this.scheduledGravity.length - 1; i >= 0; i--) {
      const g = this.scheduledGravity[i]!;
      g.delay -= dt;
      if (g.delay <= 0) {
        this.scheduledGravity.splice(i, 1);
        const id = this.getBlock(g.x, g.y, g.z);
        if (getBlockOrItem(id).gravity) {
          const below = this.getBlock(g.x, g.y - 1, g.z);
          if (below === BlockId.AIR || below === BlockId.WATER || below === BlockId.LAVA) {
            this.setBlock(g.x, g.y, g.z, BlockId.AIR, true, false);
            const mesh = this.particles.createItem3DMesh(id);
            mesh.scale.setScalar(2.95);
            mesh.position.set(g.x + 0.5, g.y + 0.5, g.z + 0.5);
            this.dynamicGroup.add(mesh);
            this.fallingBlocks.push({
              blockId: id,
              x: g.x,
              y: g.y + 0.5,
              z: g.z,
              vy: 0,
              mesh,
            });
            this.scheduleGravityColumn(g.x, g.y + 1, g.z);
          }
        }
      }
    }

    for (let i = this.fallingBlocks.length - 1; i >= 0; i--) {
      const fb = this.fallingBlocks[i]!;
      fb.vy -= 22 * dt;
      fb.y += fb.vy * dt;
      const landY = Math.floor(fb.y - 0.48);
      if (landY <= 0 || isSolidBlock(this.getBlock(fb.x, landY, fb.z))) {
        const targetY = Math.max(1, landY + 1);
        this.setBlock(fb.x, targetY, fb.z, fb.blockId, true, false);
        this.dynamicGroup.remove(fb.mesh);
        (fb.mesh.material as THREE.Material).dispose();
        this.fallingBlocks.splice(i, 1);
      } else {
        fb.mesh.position.set(fb.x + 0.5, fb.y, fb.z + 0.5);
      }
    }
  }

  private updatePrimedTNTs(dt: number): void {
    for (let i = this.primedTnts.length - 1; i >= 0; i--) {
      const tnt = this.primedTnts[i]!;
      tnt.fuse -= dt;
      tnt.vy -= 18 * dt;

      const ny = tnt.y + tnt.vy * dt;
      if (this.isSolidAt(tnt.x, ny - 0.48, tnt.z)) {
        tnt.y = Math.floor(ny - 0.48) + 1.48;
        tnt.vy = 0;
        tnt.vx *= 0.8;
        tnt.vz *= 0.8;
      } else {
        tnt.y = ny;
      }

      if (!this.isSolidAt(tnt.x + tnt.vx * dt, tnt.y, tnt.z)) tnt.x += tnt.vx * dt;
      if (!this.isSolidAt(tnt.x, tnt.y, tnt.z + tnt.vz * dt)) tnt.z += tnt.vz * dt;

      // Blinking fuse effect + pre-explosion swell
      const blink = Math.floor(tnt.fuse * 7) % 2 === 0;
      const mat = tnt.mesh.material as THREE.MeshLambertMaterial;
      mat.color.setHex(blink ? 0xffffff : 0xff7777);
      const swell = tnt.fuse < 0.4 ? 1.0 + (0.4 - tnt.fuse) * 0.65 : 1.0;
      tnt.mesh.scale.setScalar(2.95 * swell);
      tnt.mesh.position.set(tnt.x, tnt.y, tnt.z);

      if (tnt.fuse <= 0) {
        this.dynamicGroup.remove(tnt.mesh);
        mat.dispose();
        this.primedTnts.splice(i, 1);
        this.detonateTNT(tnt);
      }
    }
  }

  private updateFurnaces(dt: number): void {
    for (const f of this.furnaces.values()) {
      const wasBurning = f.burnRemaining > 0;
      if (f.burnRemaining > 0) {
        f.burnRemaining = Math.max(0, f.burnRemaining - dt);
      }

      const recipe = f.input ? getSmeltingRecipe(f.input.itemId) : undefined;
      const canOutput =
        recipe !== undefined &&
        (!f.output ||
          (f.output.itemId === recipe.outputId &&
            f.output.count + recipe.outputCount <= getBlockOrItem(recipe.outputId).maxStack));

      if (f.burnRemaining <= 0 && canOutput && f.fuel && f.fuel.count > 0) {
        const fuelSec = getFuelBurnSeconds(f.fuel.itemId);
        if (fuelSec > 0) {
          f.burnRemaining = fuelSec;
          f.burnTotal = fuelSec;
          f.fuel.count--;
          if (f.fuel.count <= 0) f.fuel = null;
        }
      }

      if (f.burnRemaining > 0 && canOutput && recipe) {
        f.cookTotal = recipe.cookTimeSec;
        f.cookProgress += dt;
        if (f.cookProgress >= f.cookTotal) {
          f.cookProgress = 0;
          f.input!.count--;
          if (f.input!.count <= 0) f.input = null;
          if (!f.output) {
            f.output = { itemId: recipe.outputId, count: recipe.outputCount };
          } else {
            f.output.count += recipe.outputCount;
          }
        }
      } else {
        f.cookProgress = Math.max(0, f.cookProgress - dt * 2);
      }

      const isBurning = f.burnRemaining > 0;
      if (wasBurning !== isBurning && this.isChunkLoadedAt(f.x, f.z)) {
        const curBlock = this.getBlock(f.x, f.y, f.z);
        if (curBlock === BlockId.FURNACE_OFF || curBlock === BlockId.FURNACE_ON) {
          this.setBlock(f.x, f.y, f.z, isBurning ? BlockId.FURNACE_ON : BlockId.FURNACE_OFF, true, false);
        }
      }
    }
  }
}
