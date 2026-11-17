import * as THREE from 'three';
import { BlockId, getBlockOrItem, ItemId } from '../blocks/BlockRegistry';
import type { ParticleSystem } from '../graphics/ParticleSystem';
import type { WorldManager } from '../world/WorldManager';
import type { MobEntity } from './MobAI';
import { RemotePlayer } from './RemotePlayer';

export type AgentRole = 'guard' | 'miner' | 'builder' | 'trader';

export const AGENT_ROLE_INFO: Record<
  AgentRole,
  { label: string; badge: string; shirtColor: string; heldItem: number; description: string }
> = {
  guard: {
    label: 'Explorateur / Garde',
    badge: '🛡️ Garde',
    shirtColor: '#dc2626',
    heldItem: ItemId.DIAMOND_SWORD,
    description: 'Escorte le joueur et repousse activement Zombies et Squelettes.',
  },
  miner: {
    label: 'Mineur Autonome',
    badge: '⛏️ Mineur',
    shirtColor: '#f59e0b',
    heldItem: ItemId.IRON_PICKAXE,
    description: 'Recherche et récolte minerais, pierre et bois à proximité pour vous.',
  },
  builder: {
    label: 'Bâtisseur d\'Abri',
    badge: '🏗️ Bâtisseur',
    shirtColor: '#0284c7',
    heldItem: BlockId.OAK_PLANKS,
    description: 'Construit bloc par bloc un abri éclairé (5x4x5) près de sa position.',
  },
  trader: {
    label: 'Marchand Itinérant',
    badge: '💎 Marchand',
    shirtColor: '#16a34a',
    heldItem: ItemId.EMERALD,
    description: 'Échange minerais et ressources contre outils en diamant, TNT et vivres.',
  },
};

export interface MerchantTradeOffer {
  id: string;
  costItemId: number;
  costCount: number;
  rewardItemId: number;
  rewardCount: number;
}

export const MERCHANT_TRADES: MerchantTradeOffer[] = [
  { id: 't_iron_food', costItemId: ItemId.COAL, costCount: 4, rewardItemId: ItemId.COOKED_BEEF, rewardCount: 4 },
  { id: 't_iron_pick', costItemId: ItemId.IRON_INGOT, costCount: 3, rewardItemId: ItemId.IRON_PICKAXE, rewardCount: 1 },
  { id: 't_gold_apple', costItemId: ItemId.GOLD_INGOT, costCount: 2, rewardItemId: ItemId.APPLE, rewardCount: 6 },
  { id: 't_em_diapick', costItemId: ItemId.EMERALD, costCount: 3, rewardItemId: ItemId.DIAMOND_PICKAXE, rewardCount: 1 },
  { id: 't_em_diasword', costItemId: ItemId.EMERALD, costCount: 2, rewardItemId: ItemId.DIAMOND_SWORD, rewardCount: 1 },
  { id: 't_iron_tnt', costItemId: ItemId.IRON_INGOT, costCount: 2, rewardItemId: BlockId.TNT, rewardCount: 3 },
  { id: 't_coal_glow', costItemId: ItemId.COAL, costCount: 3, rewardItemId: BlockId.GLOWSTONE, rewardCount: 4 },
];

export interface CompanionSaveData {
  id: string;
  name: string;
  role: AgentRole;
  x: number;
  y: number;
  z: number;
}

export class VoxelAgentAI {
  public readonly id: string;
  public readonly name: string;
  public role: AgentRole;
  public avatar: RemotePlayer;
  public position: THREE.Vector3;
  private velocity = new THREE.Vector3();

  private readonly scene: THREE.Scene;
  private readonly particles: ParticleSystem;

  private actionCooldown = 0;
  private mineTarget: { x: number; y: number; z: number } | null = null;
  private buildBlueprintQueue: Array<{ x: number; y: number; z: number; blockId: number }> = [];

  constructor(
    id: string,
    name: string,
    role: AgentRole,
    x: number,
    y: number,
    z: number,
    scene: THREE.Scene,
    particles: ParticleSystem
  ) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.position = new THREE.Vector3(x, y, z);
    this.scene = scene;
    this.particles = particles;

    this.avatar = this.buildAvatarForRole(role);
    this.avatar.targetPosition.copy(this.position);
    this.avatar.group.position.copy(this.position);
    this.scene.add(this.avatar.group);
  }

  private buildAvatarForRole(role: AgentRole): RemotePlayer {
    const info = AGENT_ROLE_INFO[role];
    const rp = new RemotePlayer(
      this.id,
      `${info.badge} ${this.name}`,
      {
        shirtColor: info.shirtColor,
        pantsColor: '#1e293b',
        skinTone: '#eab676',
        hairColor: '#3f2305',
      },
      this.particles,
      true
    );
    rp.setHeldItem(info.heldItem);
    return rp;
  }

  public setRole(nextRole: AgentRole, world: WorldManager): void {
    this.role = nextRole;
    this.mineTarget = null;
    this.buildBlueprintQueue = [];

    this.scene.remove(this.avatar.group);
    this.avatar.dispose();
    this.avatar = this.buildAvatarForRole(nextRole);
    this.avatar.targetPosition.copy(this.position);
    this.avatar.group.position.copy(this.position);
    this.scene.add(this.avatar.group);

    if (nextRole === 'builder') {
      this.prepareShelterBlueprint(world);
    }
  }

  private prepareShelterBlueprint(world: WorldManager): void {
    this.buildBlueprintQueue = [];
    const ox = Math.floor(this.position.x) + 3;
    const oz = Math.floor(this.position.z) - 2;
    let baseY = Math.floor(this.position.y);
    while (baseY > 4 && !world.isSolidAt(ox + 2, baseY - 1, oz + 2)) {
      baseY--;
    }

    // 5x4x5 cozy shelter: cobblestone floor, oak plank walls, glass windows, front doorway, roof & interior torch
    for (let dz = 0; dz < 5; dz++) {
      for (let dx = 0; dx < 5; dx++) {
        this.buildBlueprintQueue.push({
          x: ox + dx,
          y: baseY - 1,
          z: oz + dz,
          blockId: BlockId.COBBLESTONE,
        });
      }
    }

    for (let dy = 0; dy < 3; dy++) {
      for (let dz = 0; dz < 5; dz++) {
        for (let dx = 0; dx < 5; dx++) {
          const isWall = dx === 0 || dx === 4 || dz === 0 || dz === 4;
          if (!isWall) continue;
          // Front doorway at dx=2, dz=0, dy=0..1
          if (dx === 2 && dz === 0 && dy < 2) continue;
          // Side windows at dy=1
          if (dy === 1 && ((dx === 2 && dz === 4) || (dz === 2 && (dx === 0 || dx === 4)))) {
            this.buildBlueprintQueue.push({ x: ox + dx, y: baseY + dy, z: oz + dz, blockId: BlockId.GLASS });
            continue;
          }
          const corner = (dx === 0 || dx === 4) && (dz === 0 || dz === 4);
          this.buildBlueprintQueue.push({
            x: ox + dx,
            y: baseY + dy,
            z: oz + dz,
            blockId: corner ? BlockId.OAK_LOG : BlockId.OAK_PLANKS,
          });
        }
      }
    }

    // Roof
    for (let dz = 0; dz < 5; dz++) {
      for (let dx = 0; dx < 5; dx++) {
        this.buildBlueprintQueue.push({
          x: ox + dx,
          y: baseY + 3,
          z: oz + dz,
          blockId: BlockId.SPRUCE_PLANKS,
        });
      }
    }

    // Interior Torch
    this.buildBlueprintQueue.push({
      x: ox + 2,
      y: baseY,
      z: oz + 2,
      blockId: BlockId.TORCH,
    });
  }

  public update(
    dt: number,
    world: WorldManager,
    ownerPos: THREE.Vector3,
    mobs: MobEntity[],
    onAgentBreakBlock: (x: number, y: number, z: number, oldId: number) => void
  ): void {
    if (this.actionCooldown > 0) this.actionCooldown -= dt;

    let goalX = ownerPos.x;
    let goalZ = ownerPos.z;
    let desiredMinDist = 2.8;
    let moveSpeed = 3.4;

    if (this.role === 'guard') {
      // Find nearest hostile mob within 15 blocks
      let nearestHostile: MobEntity | null = null;
      let bestDist = 15;
      for (const m of mobs) {
        if (!m.hostile) continue;
        const d = m.position.distanceTo(this.position);
        if (d < bestDist) {
          bestDist = d;
          nearestHostile = m;
        }
      }

      if (nearestHostile) {
        goalX = nearestHostile.position.x;
        goalZ = nearestHostile.position.z;
        desiredMinDist = 1.3;
        moveSpeed = 4.4;
        if (bestDist <= 2.1 && this.actionCooldown <= 0) {
          this.actionCooldown = 0.65;
          this.avatar.triggerSwing();
          const kx = nearestHostile.position.x - this.position.x;
          const kz = nearestHostile.position.z - this.position.z;
          nearestHostile.applyDamage(6, kx, kz);
          this.particles.spawnBlockChips(
            nearestHostile.position.x,
            nearestHostile.position.y + 1,
            nearestHostile.position.z,
            BlockId.FLOWER_RED,
            6
          );
        }
      }
    } else if (this.role === 'miner') {
      if (!this.mineTarget || world.getBlock(this.mineTarget.x, this.mineTarget.y, this.mineTarget.z) === BlockId.AIR) {
        this.mineTarget = this.findNearbyHarvestableBlock(world);
      }
      if (this.mineTarget) {
        goalX = this.mineTarget.x + 0.5;
        goalZ = this.mineTarget.z + 0.5;
        desiredMinDist = 1.6;
        const d = Math.hypot(goalX - this.position.x, goalZ - this.position.z);
        if (d <= 2.6 && this.actionCooldown <= 0) {
          this.actionCooldown = 0.85;
          const bid = world.getBlock(this.mineTarget.x, this.mineTarget.y, this.mineTarget.z);
          if (bid !== BlockId.AIR && bid !== BlockId.BEDROCK) {
            this.avatar.triggerSwing();
            world.setBlock(this.mineTarget.x, this.mineTarget.y, this.mineTarget.z, BlockId.AIR, true, true);
            onAgentBreakBlock(this.mineTarget.x, this.mineTarget.y, this.mineTarget.z, bid);
          }
          this.mineTarget = null;
        }
      }
    } else if (this.role === 'builder') {
      if (this.buildBlueprintQueue.length > 0) {
        const nextStep = this.buildBlueprintQueue[0]!;
        goalX = nextStep.x + 0.5;
        goalZ = nextStep.z + 0.5;
        desiredMinDist = 2.2;
        const d = Math.hypot(goalX - this.position.x, goalZ - this.position.z);
        if (d <= 4.5 && this.actionCooldown <= 0) {
          this.actionCooldown = 0.24;
          this.buildBlueprintQueue.shift();
          this.avatar.triggerSwing();
          world.setBlock(nextStep.x, nextStep.y, nextStep.z, nextStep.blockId, true, true);
          this.particles.spawnBlockChips(nextStep.x, nextStep.y, nextStep.z, nextStep.blockId, 4);
        }
      }
    } else if (this.role === 'trader') {
      desiredMinDist = 3.5;
      moveSpeed = 2.4;
    }

    // Voxel pathing & gravity step
    const dx = goalX - this.position.x;
    const dz = goalZ - this.position.z;
    const hDist = Math.hypot(dx, dz);

    let vx = 0;
    let vz = 0;
    if (hDist > desiredMinDist) {
      vx = (dx / hDist) * moveSpeed;
      vz = (dz / hDist) * moveSpeed;
      this.avatar.targetYaw = Math.atan2(-vx, -vz);
    } else {
      const lookX = ownerPos.x - this.position.x;
      const lookZ = ownerPos.z - this.position.z;
      if (Math.hypot(lookX, lookZ) > 0.2) {
        this.avatar.targetYaw = Math.atan2(-lookX, -lookZ);
      }
    }

    // Teleport catch-up if player sprinted very far away (> 38 blocks) and not mid-building
    if (this.position.distanceTo(ownerPos) > 38 && this.buildBlueprintQueue.length === 0) {
      this.position.set(ownerPos.x + 2, ownerPos.y + 1, ownerPos.z + 2);
    }

    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, vx, Math.min(1, dt * 10));
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, vz, Math.min(1, dt * 10));
    this.velocity.y = Math.max(-30, this.velocity.y - 24 * dt);

    const footY = Math.floor(this.position.y + 0.05);
    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;

    if (!world.isSolidAt(nx, footY, this.position.z) && !world.isSolidAt(nx, footY + 1, this.position.z)) {
      this.position.x = nx;
    } else if (
      world.isSolidAt(this.position.x, footY - 1, this.position.z) &&
      !world.isSolidAt(nx, footY + 1, this.position.z) &&
      !world.isSolidAt(nx, footY + 2, this.position.z)
    ) {
      this.velocity.y = 7.8;
    }

    if (!world.isSolidAt(this.position.x, footY, nz) && !world.isSolidAt(this.position.x, footY + 1, nz)) {
      this.position.z = nz;
    } else if (
      world.isSolidAt(this.position.x, footY - 1, this.position.z) &&
      !world.isSolidAt(this.position.x, footY + 1, nz) &&
      !world.isSolidAt(this.position.x, footY + 2, nz)
    ) {
      this.velocity.y = 7.8;
    }

    const ny = this.position.y + this.velocity.y * dt;
    if (this.velocity.y <= 0 && world.isSolidAt(this.position.x, Math.floor(ny), this.position.z)) {
      this.position.y = Math.floor(ny) + 1.0;
      this.velocity.y = 0;
    } else {
      this.position.y = ny;
    }

    this.avatar.targetPosition.copy(this.position);
    this.avatar.update(dt, true);
  }

  private findNearbyHarvestableBlock(world: WorldManager): { x: number; y: number; z: number } | null {
    const cx = Math.floor(this.position.x);
    const cy = Math.floor(this.position.y);
    const cz = Math.floor(this.position.z);

    let best: { x: number; y: number; z: number; prio: number } | null = null;
    for (let dy = -2; dy <= 4; dy++) {
      for (let dz = -8; dz <= 8; dz++) {
        for (let dx = -8; dx <= 8; dx++) {
          const bx = cx + dx;
          const by = cy + dy;
          const bz = cz + dz;
          const id = world.getBlock(bx, by, bz);
          let prio = 0;
          if (
            id === BlockId.COAL_ORE ||
            id === BlockId.IRON_ORE ||
            id === BlockId.GOLD_ORE ||
            id === BlockId.DIAMOND_ORE ||
            id === BlockId.EMERALD_ORE
          ) {
            prio = 10;
          } else if (id === BlockId.OAK_LOG || id === BlockId.BIRCH_LOG || id === BlockId.SPRUCE_LOG) {
            prio = 7;
          } else if (id === BlockId.STONE && world.getBlock(bx, by + 1, bz) === BlockId.AIR) {
            prio = 3;
          }
          if (prio > 0 && (!best || prio > best.prio)) {
            best = { x: bx, y: by, z: bz, prio };
          }
        }
      }
    }
    return best ? { x: best.x, y: best.y, z: best.z } : null;
  }

  public serialize(): CompanionSaveData {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
    };
  }

  public dispose(): void {
    this.scene.remove(this.avatar.group);
    this.avatar.dispose();
  }
}

