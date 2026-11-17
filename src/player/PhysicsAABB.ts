import * as THREE from 'three';
import { BlockId, getBlockOrItem } from '../blocks/BlockRegistry';
import type { WorldManager } from '../world/WorldManager';

export interface PhysicsState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  onGround: boolean;
  inWater: boolean;
  headUnderwater: boolean;
  inLava: boolean;
  isFlying: boolean;
  isSneaking: boolean;
  fallStartY: number;
}

export class PhysicsAABB {
  public readonly halfWidth = 0.3;
  public readonly standingHeight = 1.8;
  public readonly sneakingHeight = 1.52;

  public stepPhysics(
    dt: number,
    state: PhysicsState,
    wishDirX: number,
    wishDirZ: number,
    speed: number,
    jumpHeld: boolean,
    sneakHeld: boolean,
    allowFly: boolean,
    noClipSpectator: boolean,
    world: WorldManager
  ): { landedFallDistance: number; bouncedOnSlime: boolean } {
    // 0. Spectator No-Clip Cinema Flight
    if (noClipSpectator) {
      state.isFlying = true;
      state.onGround = false;
      state.inWater = false;
      state.headUnderwater = false;
      state.inLava = false;
      const specSpeed = speed * 2.6;
      state.velocity.x = THREE.MathUtils.lerp(state.velocity.x, wishDirX * specSpeed, Math.min(1, dt * 12));
      state.velocity.z = THREE.MathUtils.lerp(state.velocity.z, wishDirZ * specSpeed, Math.min(1, dt * 12));
      let vy = 0;
      if (jumpHeld) vy += 10.5;
      if (sneakHeld) vy -= 10.5;
      state.velocity.y = THREE.MathUtils.lerp(state.velocity.y, vy, Math.min(1, dt * 12));

      state.position.x += state.velocity.x * dt;
      state.position.y = Math.max(-10, Math.min(150, state.position.y + state.velocity.y * dt));
      state.position.z += state.velocity.z * dt;
      state.fallStartY = state.position.y;
      return { landedFallDistance: 0, bouncedOnSlime: false };
    }

    let landedFallDistance = 0;
    let bouncedOnSlime = false;
    const height = state.isSneaking ? this.sneakingHeight : this.standingHeight;

    const bx = Math.floor(state.position.x);
    const bz = Math.floor(state.position.z);
    const feetBlock = world.getBlock(bx, Math.floor(state.position.y + 0.15), bz);
    const waistBlock = world.getBlock(bx, Math.floor(state.position.y + 0.85), bz);
    const eyeBlock = world.getBlock(bx, Math.floor(state.position.y + (state.isSneaking ? 1.38 : 1.62)), bz);

    state.inWater = feetBlock === BlockId.WATER || waistBlock === BlockId.WATER;
    state.headUnderwater = eyeBlock === BlockId.WATER;
    state.inLava = feetBlock === BlockId.LAVA || waistBlock === BlockId.LAVA;

    if (!allowFly) {
      state.isFlying = false;
    }

    // 1. Creative Free-Flight Physics
    if (state.isFlying) {
      const flySpeed = speed * 2.15;
      state.velocity.x = wishDirX * flySpeed;
      state.velocity.z = wishDirZ * flySpeed;
      let vy = 0;
      if (jumpHeld) vy += 8.5;
      if (sneakHeld) vy -= 8.5;
      state.velocity.y = THREE.MathUtils.lerp(state.velocity.y, vy, Math.min(1, dt * 14));

      this.moveAxis(state.position, state.velocity, 'x', dt, height, world);
      this.moveAxis(state.position, state.velocity, 'z', dt, height, world);
      const hitY = this.moveAxis(state.position, state.velocity, 'y', dt, height, world);
      if (hitY && state.velocity.y <= 0) {
        state.isFlying = false;
        state.onGround = true;
      }
      state.fallStartY = state.position.y;
      return { landedFallDistance: 0, bouncedOnSlime: false };
    }

    // 2. Water / Lava Buoyancy Physics
    if (state.inWater || state.inLava) {
      const swimFactor = state.inLava ? 0.45 : 0.68;
      state.velocity.x = THREE.MathUtils.lerp(state.velocity.x, wishDirX * speed * swimFactor, Math.min(1, dt * 10));
      state.velocity.z = THREE.MathUtils.lerp(state.velocity.z, wishDirZ * speed * swimFactor, Math.min(1, dt * 10));

      state.velocity.y -= 7.5 * dt;
      state.velocity.y = Math.max(state.velocity.y, -3.5);
      if (jumpHeld) {
        state.velocity.y = 4.2;
      } else if (sneakHeld) {
        state.velocity.y = -3.4;
      }

      this.moveAxis(state.position, state.velocity, 'x', dt, height, world);
      this.moveAxis(state.position, state.velocity, 'z', dt, height, world);
      const hitY = this.moveAxis(state.position, state.velocity, 'y', dt, height, world);
      state.onGround = hitY && state.velocity.y <= 0;
      state.fallStartY = state.position.y;
      return { landedFallDistance: 0, bouncedOnSlime: false };
    }

    // 3. Standard Ground & Air Swept/Stepped AABB Physics
    const accel = state.onGround ? 18.0 : 7.5;
    state.velocity.x = THREE.MathUtils.lerp(state.velocity.x, wishDirX * speed, Math.min(1, dt * accel));
    state.velocity.z = THREE.MathUtils.lerp(state.velocity.z, wishDirZ * speed, Math.min(1, dt * accel));

    if (state.onGround && jumpHeld) {
      state.velocity.y = 8.45;
      state.onGround = false;
      state.fallStartY = state.position.y;
    }

    state.velocity.y = Math.max(-42, state.velocity.y - 26.0 * dt);

    // Sneak anti-fall edge guard when grounded
    let dx = state.velocity.x * dt;
    let dz = state.velocity.z * dt;
    if (state.onGround && state.isSneaking) {
      if (dx !== 0 && !this.hasGroundSupport(state.position.x + dx, state.position.y, state.position.z, world)) {
        dx = 0;
        state.velocity.x = 0;
      }
      if (dz !== 0 && !this.hasGroundSupport(state.position.x, state.position.y, state.position.z + dz, world)) {
        dz = 0;
        state.velocity.z = 0;
      }
      if (dx !== 0 && dz !== 0 && !this.hasGroundSupport(state.position.x + dx, state.position.y, state.position.z + dz, world)) {
        dz = 0;
        state.velocity.z = 0;
      }
    }

    if (dx !== 0) {
      if (this.collidesAt(state.position.x + dx, state.position.y, state.position.z, height, world)) {
        state.velocity.x = 0;
      } else {
        state.position.x += dx;
      }
    }
    if (dz !== 0) {
      if (this.collidesAt(state.position.x, state.position.y, state.position.z + dz, height, world)) {
        state.velocity.z = 0;
      } else {
        state.position.z += dz;
      }
    }

    if (!state.onGround && state.position.y > state.fallStartY) {
      state.fallStartY = state.position.y;
    }

    const prevVy = state.velocity.y;
    const hitY = this.moveAxis(state.position, state.velocity, 'y', dt, height, world);
    if (hitY && prevVy <= 0) {
      const groundId = world.getBlock(
        Math.floor(state.position.x),
        Math.floor(state.position.y - 0.15),
        Math.floor(state.position.z)
      );
      if (getBlockOrItem(groundId).bouncy && !sneakHeld && prevVy < -3.0) {
        // Bouncy Slime Block trampoline rebound!
        state.velocity.y = Math.min(20, Math.max(11.5, -prevVy * 0.92));
        state.onGround = false;
        state.fallStartY = state.position.y;
        bouncedOnSlime = true;
      } else {
        if (!state.onGround && !getBlockOrItem(groundId).bouncy) {
          const fell = state.fallStartY - state.position.y;
          if (fell > 3.4) {
            landedFallDistance = fell;
          }
        }
        state.onGround = true;
        state.fallStartY = state.position.y;
      }
    } else if (!hitY) {
      if (state.onGround) {
        state.fallStartY = state.position.y;
      }
      state.onGround = false;
    }

    return { landedFallDistance, bouncedOnSlime };
  }

  private hasGroundSupport(px: number, py: number, pz: number, world: WorldManager): boolean {
    const hw = this.halfWidth * 0.92;
    const checkY = Math.floor(py - 0.08);
    const minX = Math.floor(px - hw);
    const maxX = Math.floor(px + hw);
    const minZ = Math.floor(pz - hw);
    const maxZ = Math.floor(pz + hw);

    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (world.isSolidAt(x, checkY, z)) {
          return true;
        }
      }
    }
    return false;
  }

  public collidesAt(px: number, py: number, pz: number, height: number, world: WorldManager): boolean {
    const hw = this.halfWidth;
    const eps = 0.001;
    const minX = Math.floor(px - hw + eps);
    const maxX = Math.floor(px + hw - eps);
    const minY = Math.floor(py + eps);
    const maxY = Math.floor(py + height - eps);
    const minZ = Math.floor(pz - hw + eps);
    const maxZ = Math.floor(pz + hw - eps);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (world.isSolidAt(x, y, z)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private moveAxis(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    axis: 'x' | 'y' | 'z',
    dt: number,
    height: number,
    world: WorldManager
  ): boolean {
    const total = vel[axis] * dt;
    if (Math.abs(total) < 1e-6) return false;

    const steps = Math.max(1, Math.ceil(Math.abs(total) / 0.25));
    const stepDelta = total / steps;

    for (let s = 0; s < steps; s++) {
      const nx = axis === 'x' ? pos.x + stepDelta : pos.x;
      const ny = axis === 'y' ? pos.y + stepDelta : pos.y;
      const nz = axis === 'z' ? pos.z + stepDelta : pos.z;

      if (this.collidesAt(nx, ny, nz, height, world)) {
        if (axis === 'y' && stepDelta < 0) {
          pos.y = Math.floor(ny) + 1.0;
        }
        vel[axis] = 0;
        return true;
      }
      pos[axis] += stepDelta;
    }
    return false;
  }

  public wouldBlockIntersectEntity(
    bx: number,
    by: number,
    bz: number,
    entityPos: THREE.Vector3,
    height = this.standingHeight
  ): boolean {
    const hw = this.halfWidth - 0.02;
    const eMinX = entityPos.x - hw;
    const eMaxX = entityPos.x + hw;
    const eMinY = entityPos.y + 0.02;
    const eMaxY = entityPos.y + height - 0.02;
    const eMinZ = entityPos.z - hw;
    const eMaxZ = entityPos.z + hw;

    return (
      eMaxX > bx &&
      eMinX < bx + 1 &&
      eMaxY > by &&
      eMinY < by + 1 &&
      eMaxZ > bz &&
      eMinZ < bz + 1
    );
  }
}
