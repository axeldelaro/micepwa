import * as THREE from 'three';
import { BlockId, getBlockOrItem } from '../blocks/BlockRegistry';
import type { ParticleSystem } from '../graphics/ParticleSystem';
import { SEA_LEVEL } from '../world/TerrainGenerator';
import type { WorldManager } from '../world/WorldManager';
import { MobEntity, type MobKind } from './MobAI';
import { DEFAULT_SKINS, RemotePlayer } from './RemotePlayer';
import { VoxelAgentAI, type AgentRole, type CompanionSaveData } from './VoxelAgentAI';

const COMPANION_NAMES = ['Atlas', 'Nova', 'Orion', 'Lyra', 'Kael', 'Vega', 'Zephyr', 'Iris'];

interface ArrowProjectile {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  stuck: boolean;
  age: number;
  mesh: THREE.Group;
}

export class EntityManager {
  private readonly scene: THREE.Scene;
  private readonly particles: ParticleSystem;

  public readonly mobs: MobEntity[] = [];
  public readonly companions: VoxelAgentAI[] = [];
  public readonly remotePlayers = new Map<string, RemotePlayer>();
  private readonly arrows: ArrowProjectile[] = [];

  public killScore = 0;
  public bastionWave = 1;

  private nextMobId = 1;
  private spawnTimer = 2.0;

  constructor(scene: THREE.Scene, particles: ParticleSystem) {
    this.scene = scene;
    this.particles = particles;
  }

  public clearAll(): void {
    for (const m of this.mobs) this.scene.remove(m.group);
    this.mobs.length = 0;

    for (const c of this.companions) c.dispose();
    this.companions.length = 0;

    for (const rp of this.remotePlayers.values()) {
      this.scene.remove(rp.group);
      rp.dispose();
    }
    this.remotePlayers.clear();

    for (const a of this.arrows) this.scene.remove(a.mesh);
    this.arrows.length = 0;

    this.killScore = 0;
    this.bastionWave = 1;
  }

  public spawnArrowProjectile(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    speed = 28,
    damage = 9
  ): void {
    const grp = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.58),
      new THREE.MeshBasicMaterial({ color: 0xa16207 })
    );
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
    );
    tip.position.z = -0.32;
    const fletch = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    fletch.position.z = 0.26;
    grp.add(shaft, tip, fletch);
    grp.position.copy(origin);

    const vel = dir.clone().normalize().multiplyScalar(speed);
    this.orientArrowGroup(grp, vel);
    this.scene.add(grp);

    this.arrows.push({
      pos: origin.clone(),
      vel,
      damage,
      stuck: false,
      age: 0,
      mesh: grp,
    });
  }

  private orientArrowGroup(grp: THREE.Group, vel: THREE.Vector3): void {
    const len = vel.length();
    if (len < 0.01) return;
    const yaw = Math.atan2(-vel.x, -vel.z);
    const horiz = Math.hypot(vel.x, vel.z);
    const pitch = Math.atan2(vel.y, horiz);
    grp.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  public spawnBastionWave(wave: number, world: WorldManager, playerPos: THREE.Vector3): number {
    this.bastionWave = wave;
    const count = Math.min(12, 3 + wave * 2);
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 16 + Math.random() * 10;
      const sx = Math.floor(playerPos.x + Math.cos(angle) * dist);
      const sz = Math.floor(playerPos.z + Math.sin(angle) * dist);
      const sy = world.generator.sampleColumn(sx, sz).surfaceY;
      if (sy <= SEA_LEVEL) continue;
      const kind: MobKind = i % 3 === 0 ? 'skeleton' : 'zombie';
      const mob = new MobEntity(this.nextMobId++, kind, sx + 0.5, sy + 1.1, sz + 0.5);
      this.mobs.push(mob);
      this.scene.add(mob.group);
      spawned++;
    }
    return spawned;
  }

  public spawnCompanion(
    x: number,
    y: number,
    z: number,
    role: AgentRole = 'guard',
    world: WorldManager,
    customId?: string,
    customName?: string
  ): VoxelAgentAI {
    const id = customId ?? `agent-${Date.now().toString(36)}-${Math.floor(Math.random() * 999)}`;
    const name = customName ?? COMPANION_NAMES[this.companions.length % COMPANION_NAMES.length]!;
    const agent = new VoxelAgentAI(id, name, role, x, y, z, this.scene, this.particles);
    if (role === 'builder') {
      agent.setRole('builder', world);
    }
    this.companions.push(agent);
    return agent;
  }

  public loadSavedCompanions(saved: CompanionSaveData[], world: WorldManager): void {
    for (const s of saved) {
      this.spawnCompanion(s.x, s.y, s.z, s.role, world, s.id, s.name);
    }
  }

  public serializeCompanions(): CompanionSaveData[] {
    return this.companions.map((c) => c.serialize());
  }

  public upsertRemotePlayer(
    peerId: string,
    username: string,
    skinIndex: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    sneaking: boolean,
    swinging: boolean,
    heldItemId: number
  ): void {
    let rp = this.remotePlayers.get(peerId);
    if (!rp) {
      const skin = DEFAULT_SKINS[Math.abs(skinIndex) % DEFAULT_SKINS.length]!;
      rp = new RemotePlayer(peerId, username, skin, this.particles, true);
      rp.group.position.set(x, y, z);
      this.scene.add(rp.group);
      this.remotePlayers.set(peerId, rp);
    }
    rp.targetPosition.set(x, y, z);
    rp.targetYaw = yaw;
    rp.targetPitch = pitch;
    rp.isSneaking = sneaking;
    if (swinging) rp.isSwinging = true;
    rp.setHeldItem(heldItemId);
  }

  public removeRemotePlayer(peerId: string): void {
    const rp = this.remotePlayers.get(peerId);
    if (rp) {
      this.scene.remove(rp.group);
      rp.dispose();
      this.remotePlayers.delete(peerId);
    }
  }

  public raycastCompanion(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 5.0): VoxelAgentAI | null {
    let best: VoxelAgentAI | null = null;
    let bestT = maxDist;

    for (const c of this.companions) {
      const center = new THREE.Vector3(c.position.x, c.position.y + 0.95, c.position.z);
      const toCenter = center.sub(origin);
      const proj = toCenter.dot(dir);
      if (proj < 0 || proj > bestT) continue;
      const perpSq = toCenter.lengthSq() - proj * proj;
      if (perpSq <= 0.55 * 0.55) {
        bestT = proj;
        best = c;
      }
    }
    return best;
  }

  public raycastMobAttack(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    maxDist = 4.2
  ): MobEntity | null {
    let best: MobEntity | null = null;
    let bestT = maxDist;

    for (const m of this.mobs) {
      const center = new THREE.Vector3(m.position.x, m.position.y + 0.8, m.position.z);
      const toCenter = center.sub(origin);
      const proj = toCenter.dot(dir);
      if (proj < 0 || proj > bestT) continue;
      const perpSq = toCenter.lengthSq() - proj * proj;
      if (perpSq <= 0.65 * 0.65) {
        bestT = proj;
        best = m;
      }
    }

    if (best) {
      this.damageAndMaybeKillMob(best, damage, dir.x, dir.z);
    }
    return best;
  }

  private damageAndMaybeKillMob(mob: MobEntity, damage: number, kx: number, kz: number): void {
    const died = mob.applyDamage(damage, kx, kz);
    this.particles.spawnBlockChips(mob.position.x, mob.position.y + 0.9, mob.position.z, BlockId.BRICKS, 8);
    if (died) {
      this.killScore += mob.hostile ? 25 : 5;
      const drop = mob.getDropItem();
      this.particles.spawnDroppedItem(mob.position.x, mob.position.y + 0.5, mob.position.z, drop.itemId, drop.count);
      this.scene.remove(mob.group);
      const idx = this.mobs.indexOf(mob);
      if (idx >= 0) this.mobs.splice(idx, 1);
    }
  }

  public applyExplosionDamage(cx: number, cy: number, cz: number, radius: number): void {
    const center = new THREE.Vector3(cx, cy, cz);
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i]!;
      const d = m.position.distanceTo(center);
      if (d <= radius) {
        const dmg = Math.ceil((1 - d / radius) * 26);
        this.damageAndMaybeKillMob(m, dmg, m.position.x - cx, m.position.z - cz);
      }
    }
  }

  public update(
    dt: number,
    world: WorldManager,
    playerPos: THREE.Vector3,
    hostilesAggroPlayer: boolean,
    sunBrightness: number,
    onDealPlayerDamage: (dmg: number, kx: number, kz: number) => void
  ): void {
    // 1. Update 3D Ballistic Arrows
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]!;
      a.age += dt;
      if (a.age > 18) {
        this.scene.remove(a.mesh);
        this.arrows.splice(i, 1);
        continue;
      }
      if (a.stuck) continue;

      a.vel.y -= 18 * dt;
      const next = a.pos.clone().addScaledVector(a.vel, dt);

      // Check Mob collision
      let hitMob = false;
      for (const m of this.mobs) {
        const dx = next.x - m.position.x;
        const dy = next.y - (m.position.y + 0.85);
        const dz = next.z - m.position.z;
        if (dx * dx + dz * dz < 0.48 && Math.abs(dy) < 0.95) {
          this.damageAndMaybeKillMob(m, a.damage, a.vel.x, a.vel.z);
          this.scene.remove(a.mesh);
          this.arrows.splice(i, 1);
          hitMob = true;
          break;
        }
      }
      if (hitMob) continue;

      // Check Voxel terrain collision
      if (world.isSolidAt(Math.floor(next.x), Math.floor(next.y), Math.floor(next.z))) {
        a.stuck = true;
        this.particles.spawnBlockChips(next.x, next.y, next.z, BlockId.OAK_PLANKS, 4);
      } else {
        a.pos.copy(next);
        a.mesh.position.copy(a.pos);
        this.orientArrowGroup(a.mesh, a.vel);
      }
    }

    // 2. Dynamic Fauna & Night Monster Spawner
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.mobs.length < 20) {
      this.spawnTimer = 3.2;
      this.trySpawnNaturalMob(world, playerPos, sunBrightness);
    }

    // 3. Update Mobs
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i]!;
      if (m.position.distanceTo(playerPos) > 68) {
        this.scene.remove(m.group);
        this.mobs.splice(i, 1);
        continue;
      }
      const alive = m.update(dt, world, playerPos, hostilesAggroPlayer, sunBrightness, onDealPlayerDamage);
      if (!alive) {
        this.killScore += m.hostile ? 10 : 5;
        const drop = m.getDropItem();
        this.particles.spawnDroppedItem(m.position.x, m.position.y + 0.4, m.position.z, drop.itemId, drop.count);
        this.scene.remove(m.group);
        this.mobs.splice(i, 1);
      }
    }

    // 4. Update Autonomous Companion Agents
    for (const agent of this.companions) {
      agent.update(dt, world, playerPos, this.mobs, (bx, by, bz, oldId) => {
        const def = getBlockOrItem(oldId);
        this.particles.spawnBlockBreakBurst(bx, by, bz, oldId);
        if (def.dropCount > 0) {
          this.particles.spawnDroppedItem(bx + 0.5, by + 0.5, bz + 0.5, def.dropId, def.dropCount);
        }
      });
    }

    // 5. Smoothly interpolate Remote P2P Players
    for (const rp of this.remotePlayers.values()) {
      rp.update(dt, false);
    }
  }

  private trySpawnNaturalMob(world: WorldManager, playerPos: THREE.Vector3, sunBrightness: number): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 16 + Math.random() * 22;
    const sx = Math.floor(playerPos.x + Math.cos(angle) * dist);
    const sz = Math.floor(playerPos.z + Math.sin(angle) * dist);
    if (!world.isChunkLoadedAt(sx, sz)) return;

    const sy = world.generator.sampleColumn(sx, sz).surfaceY;
    if (sy <= SEA_LEVEL) return;
    const ground = world.getBlock(sx, sy, sz);
    if (ground === BlockId.WATER || ground === BlockId.LAVA || ground === BlockId.AIR) return;
    if (world.isSolidAt(sx, sy + 1, sz) || world.isSolidAt(sx, sy + 2, sz)) return;

    const isNight = sunBrightness < 0.38;
    let kind: MobKind;
    if (isNight) {
      kind = Math.random() < 0.6 ? 'zombie' : 'skeleton';
    } else {
      const r = Math.random();
      kind = r < 0.36 ? 'sheep' : r < 0.7 ? 'pig' : 'cow';
    }

    const mob = new MobEntity(this.nextMobId++, kind, sx + 0.5, sy + 1.05, sz + 0.5);
    this.mobs.push(mob);
    this.scene.add(mob.group);
  }
}
