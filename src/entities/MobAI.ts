import * as THREE from 'three';
import { ItemId } from '../blocks/BlockRegistry';
import type { WorldManager } from '../world/WorldManager';

export type MobKind = 'sheep' | 'pig' | 'cow' | 'zombie' | 'skeleton';

export class MobEntity {
  public readonly id: number;
  public readonly kind: MobKind;
  public readonly hostile: boolean;
  public readonly group = new THREE.Group();

  public position: THREE.Vector3;
  public velocity = new THREE.Vector3();
  public yaw = 0;
  public health: number;
  public maxHealth: number;
  public hurtFlash = 0;

  private readonly legPivots: THREE.Group[] = [];
  private readonly bodyMaterials: THREE.MeshLambertMaterial[] = [];
  private aiTimer = 0;
  private wanderDir = new THREE.Vector2(0, 0);
  private attackCooldown = 0;
  private walkPhase = 0;

  constructor(id: number, kind: MobKind, x: number, y: number, z: number) {
    this.id = id;
    this.kind = kind;
    this.hostile = kind === 'zombie' || kind === 'skeleton';
    this.position = new THREE.Vector3(x, y, z);
    this.maxHealth = this.hostile ? 20 : 10;
    this.health = this.maxHealth;

    this.buildModel();
    this.group.position.copy(this.position);
  }

  private makeMat(hex: number): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color: hex });
    this.bodyMaterials.push(m);
    return m;
  }

  private buildModel(): void {
    if (this.kind === 'sheep' || this.kind === 'pig' || this.kind === 'cow') {
      const bodyColor =
        this.kind === 'sheep' ? 0xf1f5f9 : this.kind === 'pig' ? 0xf9a8d4 : 0x6b4423;
      const headColor =
        this.kind === 'sheep' ? 0xd6d3d1 : this.kind === 'pig' ? 0xf472b6 : 0x54341a;
      const bodyH = this.kind === 'pig' ? 0.46 : 0.56;
      const legH = this.kind === 'pig' ? 0.34 : 0.46;

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, bodyH, 0.96),
        this.makeMat(bodyColor)
      );
      body.position.set(0, legH + bodyH * 0.5, 0);
      body.castShadow = true;

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.42, 0.42),
        this.makeMat(headColor)
      );
      head.position.set(0, legH + bodyH * 0.85, -0.58);
      head.castShadow = true;

      if (this.kind === 'cow') {
        const patch = new THREE.Mesh(
          new THREE.BoxGeometry(0.64, 0.3, 0.36),
          this.makeMat(0xf8fafc)
        );
        patch.position.set(0, legH + bodyH * 0.55, 0.1);
        this.group.add(patch);
      }

      this.group.add(body, head);

      const legCoords = [
        [-0.2, -0.32],
        [0.2, -0.32],
        [-0.2, 0.32],
        [0.2, 0.32],
      ];
      for (const [lx, lz] of legCoords) {
        const piv = new THREE.Group();
        piv.position.set(lx!, legH, lz!);
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, legH, 0.18),
          this.makeMat(headColor)
        );
        leg.position.y = -legH * 0.5;
        leg.castShadow = true;
        piv.add(leg);
        this.legPivots.push(piv);
        this.group.add(piv);
      }
      return;
    }

    // Hostile Humanoid: Zombie / Skeleton
    const skinHex = this.kind === 'zombie' ? 0x4d7c0f : 0xe2e8f0;
    const torsoHex = this.kind === 'zombie' ? 0x0284c7 : 0xcbd5e1;
    const legHex = this.kind === 'zombie' ? 0x312e81 : 0x94a3b8;
    const limbW = this.kind === 'skeleton' ? 0.14 : 0.22;

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.66, 0.24),
      this.makeMat(torsoHex)
    );
    torso.position.set(0, 1.03, 0);
    torso.castShadow = true;

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.44, 0.44),
      this.makeMat(skinHex)
    );
    head.position.set(0, 1.58, 0);
    head.castShadow = true;

    const eyeMat = new THREE.MeshBasicMaterial({
      color: this.kind === 'zombie' ? 0x111827 : 0xef4444,
    });
    const eyes = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.07), eyeMat);
    eyes.position.set(0, 1.58, -0.225);
    eyes.rotation.y = Math.PI;

    // Outstretched menacing arms
    const armL = new THREE.Mesh(
      new THREE.BoxGeometry(limbW, 0.66, limbW),
      this.makeMat(skinHex)
    );
    armL.position.set(-0.34, 1.24, -0.26);
    armL.rotation.x = Math.PI * 0.45;
    armL.castShadow = true;

    const armR = new THREE.Mesh(
      new THREE.BoxGeometry(limbW, 0.66, limbW),
      this.makeMat(skinHex)
    );
    armR.position.set(0.34, 1.24, -0.26);
    armR.rotation.x = Math.PI * 0.45;
    armR.castShadow = true;

    this.group.add(torso, head, eyes, armL, armR);

    for (const lx of [-0.13, 0.13]) {
      const piv = new THREE.Group();
      piv.position.set(lx, 0.7, 0);
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(limbW, 0.7, limbW),
        this.makeMat(legHex)
      );
      leg.position.y = -0.35;
      leg.castShadow = true;
      piv.add(leg);
      this.legPivots.push(piv);
      this.group.add(piv);
    }
  }

  public getDropItem(): { itemId: number; count: number } {
    switch (this.kind) {
      case 'pig':
        return { itemId: ItemId.RAW_PORK, count: 1 + Math.floor(Math.random() * 2) };
      case 'cow':
        return { itemId: ItemId.RAW_BEEF, count: 1 + Math.floor(Math.random() * 2) };
      case 'sheep':
        return { itemId: ItemId.RAW_MUTTON, count: 1 + Math.floor(Math.random() * 2) };
      case 'zombie':
        return { itemId: ItemId.COAL, count: 1 };
      case 'skeleton':
        return { itemId: ItemId.FLINT, count: 1 + Math.floor(Math.random() * 2) };
    }
  }

  public applyDamage(amount: number, knockX: number, knockZ: number): boolean {
    this.health -= amount;
    this.hurtFlash = 0.26;
    const len = Math.hypot(knockX, knockZ) || 1;
    this.velocity.x = (knockX / len) * 6.5;
    this.velocity.z = (knockZ / len) * 6.5;
    this.velocity.y = 4.6;

    if (!this.hostile) {
      // Passive animals panic-sprint away when hit!
      this.wanderDir.set(knockX / len, knockZ / len);
      this.aiTimer = 2.5;
    }

    return this.health <= 0;
  }

  public update(
    dt: number,
    world: WorldManager,
    playerPos: THREE.Vector3,
    isSurvivalPlayer: boolean,
    sunBrightness: number,
    onDealPlayerDamage: (dmg: number, kx: number, kz: number) => void
  ): boolean {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // Hurt flash tint
    if (this.hurtFlash > 0) {
      this.hurtFlash = Math.max(0, this.hurtFlash - dt);
      for (const m of this.bodyMaterials) {
        m.emissive.setHex(this.hurtFlash > 0 ? 0xaa1111 : 0x000000);
      }
    }

    // Hostile mobs burn under bright daylight if exposed to open sky
    if (this.hostile && sunBrightness > 0.78) {
      const light = world.getLightAt(this.position.x, this.position.y + 1, this.position.z);
      if (light.sky >= 13) {
        this.health -= dt * 2.5;
        this.hurtFlash = 0.12;
        if (this.health <= 0) return false;
      }
    }

    const dxP = playerPos.x - this.position.x;
    const dyP = playerPos.y - this.position.y;
    const dzP = playerPos.z - this.position.z;
    const distToPlayer = Math.hypot(dxP, dyP, dzP);

    let moveX = 0;
    let moveZ = 0;
    let speed = this.hostile ? 2.85 : 1.55;

    if (this.hostile && isSurvivalPlayer && distToPlayer < 18) {
      // Voxel chase + melee/ranged strike
      const hDist = Math.hypot(dxP, dzP) || 1;
      moveX = dxP / hDist;
      moveZ = dzP / hDist;
      this.yaw = Math.atan2(-moveX, -moveZ);

      const attackReach = this.kind === 'skeleton' ? 5.2 : 1.55;
      if (distToPlayer <= attackReach && Math.abs(dyP) < 2.2 && this.attackCooldown <= 0) {
        this.attackCooldown = this.kind === 'skeleton' ? 1.65 : 1.1;
        onDealPlayerDamage(this.kind === 'skeleton' ? 2 : 3, moveX, moveZ);
      }
    } else {
      // Passive / idle wandering FSM
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        this.aiTimer = 1.8 + Math.random() * 3.5;
        if (Math.random() < 0.45) {
          this.wanderDir.set(0, 0);
        } else {
          const a = Math.random() * Math.PI * 2;
          this.wanderDir.set(Math.cos(a), Math.sin(a));
          this.yaw = Math.atan2(-this.wanderDir.x, -this.wanderDir.y);
        }
      }
      moveX = this.wanderDir.x;
      moveZ = this.wanderDir.y;
      if (this.hurtFlash > 0 && !this.hostile) speed = 3.6;
    }

    // Apply horizontal velocity + voxel step-up jump
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveX * speed, Math.min(1, dt * 8));
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveZ * speed, Math.min(1, dt * 8));
    this.velocity.y = Math.max(-32, this.velocity.y - 24 * dt);

    const nextX = this.position.x + this.velocity.x * dt;
    const nextZ = this.position.z + this.velocity.z * dt;
    const footY = Math.floor(this.position.y + 0.05);

    const blockedX = world.isSolidAt(nextX, footY, this.position.z) || world.isSolidAt(nextX, footY + 1, this.position.z);
    const blockedZ = world.isSolidAt(this.position.x, footY, nextZ) || world.isSolidAt(this.position.x, footY + 1, nextZ);

    if (!blockedX) {
      this.position.x = nextX;
    } else if (
      world.isSolidAt(this.position.x, footY - 1, this.position.z) &&
      !world.isSolidAt(nextX, footY + 1, this.position.z) &&
      !world.isSolidAt(nextX, footY + 2, this.position.z)
    ) {
      // Step-up 1 voxel obstacle
      this.velocity.y = 7.6;
    }

    if (!blockedZ) {
      this.position.z = nextZ;
    } else if (
      world.isSolidAt(this.position.x, footY - 1, this.position.z) &&
      !world.isSolidAt(this.position.x, footY + 1, nextZ) &&
      !world.isSolidAt(this.position.x, footY + 2, nextZ)
    ) {
      this.velocity.y = 7.6;
    }

    const nextY = this.position.y + this.velocity.y * dt;
    if (this.velocity.y <= 0 && world.isSolidAt(this.position.x, Math.floor(nextY), this.position.z)) {
      this.position.y = Math.floor(nextY) + 1.0;
      this.velocity.y = 0;
    } else {
      this.position.y = nextY;
    }

    // Animate legs
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (hSpeed > 0.15) {
      this.walkPhase += dt * hSpeed * 3.2;
      const swing = Math.sin(this.walkPhase) * 0.6;
      for (let i = 0; i < this.legPivots.length; i++) {
        this.legPivots[i]!.rotation.x = i % 2 === 0 ? swing : -swing;
      }
    } else {
      for (const piv of this.legPivots) piv.rotation.x = 0;
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;

    return this.position.y > -20;
  }
}
