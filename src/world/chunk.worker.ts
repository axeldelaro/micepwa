import { CHUNK_HEIGHT, CHUNK_SIZE, CHUNK_VOLUME } from './Chunk';
import { ChunkMesher, type ChunkMeshResult } from './ChunkMesher';
import { LightingEngine } from './LightingEngine';
import { TerrainGenerator } from './TerrainGenerator';

const PADDED_SIZE = CHUNK_SIZE + 2; // 18
const PADDED_VOLUME = PADDED_SIZE * CHUNK_HEIGHT * PADDED_SIZE;

export interface WorkerInitMessage {
  type: 'INIT_SEED';
  seed: string;
}

export interface WorkerGenerateMessage {
  type: 'GENERATE_CHUNK';
  jobId: number;
  cx: number;
  cz: number;
  /** Array of [chunkKey, Array<[blockIndex, blockId]>] for chunk + 8 neighbors */
  neighborDeltas: Array<[string, Array<[number, number]>]>;
}

export interface WorkerRemeshMessage {
  type: 'REMESH_PADDED';
  jobId: number;
  cx: number;
  cz: number;
  paddedBlocks: Uint8Array;
}

export type ChunkWorkerRequest = WorkerInitMessage | WorkerGenerateMessage | WorkerRemeshMessage;

export interface ChunkWorkerResponse {
  type: 'CHUNK_READY';
  jobId: number;
  cx: number;
  cz: number;
  blocks?: Uint8Array;
  light: Uint8Array;
  meshes: ChunkMeshResult;
}

let generator = new TerrainGenerator('VOXELCRAFT');
const lighting = new LightingEngine(PADDED_VOLUME);
const mesher = new ChunkMesher();
const scratchPaddedBlocks = new Uint8Array(PADDED_VOLUME);
const scratchPaddedLight = new Uint8Array(PADDED_VOLUME);

function extractCoreChunk(
  paddedBlocks: Uint8Array,
  paddedLight: Uint8Array,
  includeBlocks: boolean
): { blocks?: Uint8Array; light: Uint8Array } {
  const blocks = includeBlocks ? new Uint8Array(CHUNK_VOLUME) : undefined;
  const light = new Uint8Array(CHUNK_VOLUME);

  const pStrideZ = PADDED_SIZE;
  const pStrideY = PADDED_SIZE * PADDED_SIZE;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    const pyOff = y * pStrideY;
    const cyOff = y * CHUNK_SIZE * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const pRow = pyOff + (lz + 1) * pStrideZ + 1;
      const cRow = cyOff + lz * CHUNK_SIZE;
      if (blocks) {
        blocks.set(paddedBlocks.subarray(pRow, pRow + CHUNK_SIZE), cRow);
      }
      light.set(paddedLight.subarray(pRow, pRow + CHUNK_SIZE), cRow);
    }
  }

  return { blocks, light };
}

function collectTransferables(res: ChunkWorkerResponse): Transferable[] {
  const list: Transferable[] = [
    res.light.buffer,
    res.meshes.opaque.positions.buffer,
    res.meshes.opaque.normals.buffer,
    res.meshes.opaque.uvs.buffer,
    res.meshes.opaque.voxelLight.buffer,
    res.meshes.opaque.indices.buffer,
    res.meshes.water.positions.buffer,
    res.meshes.water.normals.buffer,
    res.meshes.water.uvs.buffer,
    res.meshes.water.voxelLight.buffer,
    res.meshes.water.indices.buffer,
    res.meshes.floraCutout.positions.buffer,
    res.meshes.floraCutout.normals.buffer,
    res.meshes.floraCutout.uvs.buffer,
    res.meshes.floraCutout.voxelLight.buffer,
    res.meshes.floraCutout.indices.buffer,
  ];
  if (res.blocks) {
    list.push(res.blocks.buffer);
  }
  return list;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (ev: MessageEvent<ChunkWorkerRequest>) => {
  const msg = ev.data;

  if (msg.type === 'INIT_SEED') {
    generator = new TerrainGenerator(msg.seed);
    return;
  }

  if (msg.type === 'GENERATE_CHUNK') {
    scratchPaddedBlocks.fill(0);
    const deltasMap = new Map<string, Array<[number, number]>>(msg.neighborDeltas);
    generator.generatePaddedChunkBlocks(msg.cx, msg.cz, scratchPaddedBlocks, PADDED_SIZE, deltasMap);
    lighting.computePaddedLighting(scratchPaddedBlocks, scratchPaddedLight, PADDED_SIZE);
    const meshes = mesher.buildChunkMeshes(scratchPaddedBlocks, scratchPaddedLight, PADDED_SIZE);
    const core = extractCoreChunk(scratchPaddedBlocks, scratchPaddedLight, true);

    const response: ChunkWorkerResponse = {
      type: 'CHUNK_READY',
      jobId: msg.jobId,
      cx: msg.cx,
      cz: msg.cz,
      blocks: core.blocks,
      light: core.light,
      meshes,
    };
    workerScope.postMessage(response, collectTransferables(response));
    return;
  }

  if (msg.type === 'REMESH_PADDED') {
    lighting.computePaddedLighting(msg.paddedBlocks, scratchPaddedLight, PADDED_SIZE);
    const meshes = mesher.buildChunkMeshes(msg.paddedBlocks, scratchPaddedLight, PADDED_SIZE);
    const core = extractCoreChunk(msg.paddedBlocks, scratchPaddedLight, false);

    const response: ChunkWorkerResponse = {
      type: 'CHUNK_READY',
      jobId: msg.jobId,
      cx: msg.cx,
      cz: msg.cz,
      light: core.light,
      meshes,
    };
    workerScope.postMessage(response, collectTransferables(response));
  }
};
