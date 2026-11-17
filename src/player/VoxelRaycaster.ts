import * as THREE from 'three';
import { BlockId } from '../blocks/BlockRegistry';
import type { WorldManager } from '../world/WorldManager';

export interface VoxelRaycastHit {
  blockX: number;
  blockY: number;
  blockZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  placeX: number;
  placeY: number;
  placeZ: number;
  blockId: number;
  distance: number;
}

export class VoxelRaycaster {
  public raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    world: WorldManager,
    includeLiquids = false
  ): VoxelRaycastHit | null {
    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return null;

    const dirX = dx / len;
    const dirY = dy / len;
    const dirZ = dz / len;

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dirX > 0 ? 1 : dirX < 0 ? -1 : 0;
    const stepY = dirY > 0 ? 1 : dirY < 0 ? -1 : 0;
    const stepZ = dirZ > 0 ? 1 : dirZ < 0 ? -1 : 0;

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dirX) : Number.POSITIVE_INFINITY;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dirY) : Number.POSITIVE_INFINITY;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dirZ) : Number.POSITIVE_INFINITY;

    let tMaxX =
      stepX > 0
        ? (x + 1 - origin.x) * tDeltaX
        : stepX < 0
        ? (origin.x - x) * tDeltaX
        : Number.POSITIVE_INFINITY;
    let tMaxY =
      stepY > 0
        ? (y + 1 - origin.y) * tDeltaY
        : stepY < 0
        ? (origin.y - y) * tDeltaY
        : Number.POSITIVE_INFINITY;
    let tMaxZ =
      stepZ > 0
        ? (z + 1 - origin.z) * tDeltaZ
        : stepZ < 0
        ? (origin.z - z) * tDeltaZ
        : Number.POSITIVE_INFINITY;

    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;

    while (t <= maxDistance) {
      const blockId = world.getBlock(x, y, z);
      const isHit = includeLiquids
        ? blockId !== BlockId.AIR
        : blockId !== BlockId.AIR && blockId !== BlockId.WATER && blockId !== BlockId.LAVA;

      if (isHit) {
        return {
          blockX: x,
          blockY: y,
          blockZ: z,
          normalX: nx,
          normalY: ny,
          normalZ: nz,
          placeX: x + nx,
          placeY: y + ny,
          placeZ: z + nz,
          blockId,
          distance: t,
        };
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          t = tMaxX;
          tMaxX += tDeltaX;
          nx = -stepX;
          ny = 0;
          nz = 0;
        } else {
          z += stepZ;
          t = tMaxZ;
          tMaxZ += tDeltaZ;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          t = tMaxY;
          tMaxY += tDeltaY;
          nx = 0;
          ny = -stepY;
          nz = 0;
        } else {
          z += stepZ;
          t = tMaxZ;
          tMaxZ += tDeltaZ;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      }
    }

    return null;
  }
}
