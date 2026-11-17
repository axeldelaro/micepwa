import * as THREE from 'three';
import type { SoundEngine } from '../audio/SoundEngine';
import {
  BlockId,
  getBlockOrItem,
  getLightEmission,
  ItemId,
  TileId,
} from '../blocks/BlockRegistry';
import type { EntityManager } from '../entities/EntityManager';
import { DEFAULT_SKINS, RemotePlayer } from '../entities/RemotePlayer';
import type { VoxelAgentAI } from '../entities/VoxelAgentAI';
import type { ParticleSystem } from '../graphics/ParticleSystem';
import type { ProceduralAtlas } from '../graphics/ProceduralAtlas';
import type { FrameInputSnapshot, InputManager } from '../input/InputManager';
import { getTileUVRect } from '../world/ChunkMesher';
import type { WorldManager } from '../world/WorldManager';
import type { InventoryManager } from './InventoryManager';
import { PhysicsAABB, type PhysicsState } from './PhysicsAABB';
import { VoxelRaycaster, type VoxelRaycastHit } from './VoxelRaycaster';

export type GameMode = 'survival' | 'creative' | 'hardcore' | 'bastion' | 'spectator';

export const GAMEMODE_LABELS: Record<GameMode, string> = {
  survival: '⚔️ Survie Classique',
  creative: '🪽 Créatif & Architecte',
  hardcore: '💀 Hardcore (1 Vie)',
  bastion: '🛡️ Défense de Bastion (Vagues)',
  spectator: '📷 Spectateur / Cinéma Libre',
};

type WandBlueprintKind = 'chalet' | 'watchtower' | 'pyramid';

export class PlayerController {
  public readonly camera: THREE.PerspectiveCamera;
  public readonly physics = new PhysicsAABB();
  public readonly raycaster = new VoxelRaycaster();
  public readonly inventory: InventoryManager;

  public gameMode: GameMode = 'survival';
  public yaw = 0;
  public pitch = 0;
  public cameraMode: 0 | 1 | 2 = 0;

  public health = 20;
  public readonly maxHealth = 20;
  public absorption = 0; // Golden hearts from Golden Apple (0..6)
  public armor = 0; // Shield points from Iron/Diamond Armor (0..20)
  public hunger = 20;
  public readonly maxHunger = 20;
  public oxygen = 20;
  public readonly maxOxygen = 20;
  public hardcoreDead = false;

  public wandBlueprint: WandBlueprintKind = 'chalet';

  public readonly physState: PhysicsState = {
    position: new THREE.Vector3(8, 72, 8),
    velocity: new THREE.Vector3(),
    onGround: false,
    inWater: false,
    headUnderwater: false,
    inLava: false,
    isFlying: false,
    isSneaking: false,
    fallStartY: 72,
  };

  // Grappling Hook state & 3D tether line
  private grappleAnchor: THREE.Vector3 | null = null;
  private grappleTimer = 0;
  private readonly grappleLine: THREE.Line;

  public currentHit: VoxelRaycastHit | null = null;
  public miningProgress = 0;
  private miningBlockKey = '';
  private mineHitSoundTimer = 0;
  private stepDistanceAccum = 0;
  private attackCooldown = 0;
  private bowCooldown = 0;
  private lavaDamageTimer = 0;
  private hungerTickTimer = 0;
  private regenTickTimer = 0;

  private readonly selectionBox: THREE.LineSegments;
  private readonly crackMesh: THREE.Mesh;
  private readonly crackGeo: THREE.BoxGeometry;
  public readonly viewModelGroup = new THREE.Group();
  private readonly armMesh: THREE.Mesh;
  private readonly armMat: THREE.MeshBasicMaterial;
  private readonly viewModelItemSlot = new THREE.Group();
  private viewModelHeldId = -1;
  private swingAnim = 0;
  private walkBobTime = 0;

  public localThirdPersonAvatar: RemotePlayer;
  public skinIndex = 0;
  public username = 'Explorateur';

  private readonly world: WorldManager;
  private readonly particles: ParticleSystem;
  private readonly entities: EntityManager;
  private readonly sound: SoundEngine;
  private readonly input: InputManager;

  public onOpenCraftingTable?: () => void;
  public onOpenFurnace?: (x: number, y: number, z: number) => void;
  public onOpenChest?: (x: number, y: number, z: number) => void;
  public onInteractCompanion?: (agent: VoxelAgentAI) => void;
  public onNotifyToast?: (msg: string) => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    atlas: ProceduralAtlas,
    world: WorldManager,
    particles: ParticleSystem,
    entities: EntityManager,
    inventory: InventoryManager,
    sound: SoundEngine,
    input: InputManager
  ) {
    this.camera = camera;
    this.world = world;
    this.particles = particles;
    this.entities = entities;
    this.inventory = inventory;
    this.sound = sound;
    this.input = input;

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006));
    this.selectionBox = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x0f172a, linewidth: 2 })
    );
    this.selectionBox.visible = false;
    scene.add(this.selectionBox);

    this.crackGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    const crackMat = new THREE.MeshBasicMaterial({
      map: atlas.diffuseTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.crackMesh = new THREE.Mesh(this.crackGeo, crackMat);
    this.crackMesh.visible = false;
    scene.add(this.crackMesh);

    // 3D Grappling Hook Tether Line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 1, 0),
    ]);
    this.grappleLine = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 })
    );
    this.grappleLine.visible = false;
    this.grappleLine.frustumCulled = false;
    scene.add(this.grappleLine);

    // First-Person Viewmodel Arm + Held Item
    this.camera.up.set(0, 1, 0);
    this.camera.rotation.order = 'YXZ';

    this.armMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_SKINS[0]!.skinTone,
      depthTest: false,
      depthWrite: false,
    });
    this.armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), this.armMat);
    this.armMesh.renderOrder = 60;
    this.armMesh.position.set(0.42, -0.38, -0.58);
    this.armMesh.rotation.set(0.65, -0.22, -0.18);

    this.viewModelItemSlot.position.set(0.40, -0.32, -0.62);
    this.viewModelGroup.add(this.armMesh, this.viewModelItemSlot);
    this.viewModelGroup.visible = false;
    this.camera.add(this.viewModelGroup);
    scene.add(this.camera);

    atlas.onPackChanged(() => {
      this.viewModelHeldId = -1; // Force held item refresh with new pack texture!
    });

    this.localThirdPersonAvatar = new RemotePlayer(
      'local',
      this.username,
      DEFAULT_SKINS[this.skinIndex]!,
      this.particles,
      false
    );
    this.localThirdPersonAvatar.group.visible = false;
    scene.add(this.localThirdPersonAvatar.group);
  }

  public isInfiniteItemsMode(): boolean {
    return this.gameMode === 'creative';
  }

  public isInvulnerableMode(): boolean {
    return this.gameMode === 'creative' || this.gameMode === 'spectator';
  }

  public getHeldLightEmission(): number {
    const held = this.inventory.getHeldStack();
    if (!held) return 0;
    return getLightEmission(held.itemId);
  }

  public setProfile(username: string, skinIndex: number, scene: THREE.Scene): void {
    this.username = username || 'Explorateur';
    this.skinIndex = Math.abs(skinIndex) % DEFAULT_SKINS.length;
    scene.remove(this.localThirdPersonAvatar.group);
    this.localThirdPersonAvatar.dispose();
    this.localThirdPersonAvatar = new RemotePlayer(
      'local',
      this.username,
      DEFAULT_SKINS[this.skinIndex]!,
      this.particles,
      false
    );
    this.localThirdPersonAvatar.group.visible = this.cameraMode !== 0 && this.gameMode !== 'spectator';
    scene.add(this.localThirdPersonAvatar.group);
  }

  public cycleCameraMode(): void {
    this.cameraMode = ((this.cameraMode + 1) % 3) as 0 | 1 | 2;
    this.localThirdPersonAvatar.group.visible = this.cameraMode !== 0 && this.gameMode !== 'spectator';
    this.viewModelGroup.visible = this.cameraMode === 0 && this.gameMode !== 'spectator';
  }

  public setGameMode(mode: GameMode): void {
    this.gameMode = mode;
    this.hardcoreDead = false;
    if (mode === 'survival' || mode === 'hardcore' || mode === 'bastion') {
      this.physState.isFlying = false;
      if (mode === 'bastion' && this.armor < 12) {
        this.armor = 12;
      }
    } else {
      this.health = this.maxHealth;
      this.hunger = this.maxHunger;
      this.oxygen = this.maxOxygen;
      if (mode === 'spectator') {
        this.physState.isFlying = true;
      }
    }
    this.viewModelGroup.visible = this.cameraMode === 0 && mode !== 'spectator';
    this.localThirdPersonAvatar.group.visible = this.cameraMode !== 0 && mode !== 'spectator';
  }

  public respawnAtSpawn(): void {
    let bestX = 8;
    let bestZ = 8;
    let bestY = this.world.generator.getSpawnHeight(8, 8);

    for (let radius = 0; radius <= 36; radius += 4) {
      let foundGood = false;
      for (let dz = -radius; dz <= radius; dz += 4) {
        for (let dx = -radius; dx <= radius; dx += 4) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const col = this.world.generator.sampleColumn(dx, dz);
          if (col.biome !== 'ocean' && col.surfaceY >= 44 && col.surfaceY <= 72) {
            bestX = dx;
            bestZ = dz;
            bestY = col.surfaceY + 1.05;
            foundGood = true;
            break;
          }
        }
        if (foundGood) break;
      }
      if (foundGood) break;
    }

    this.physState.position.set(bestX + 0.5, bestY, bestZ + 0.5);
    this.physState.velocity.set(0, 0, 0);
    this.physState.fallStartY = bestY;
    this.grappleAnchor = null;
    this.grappleLine.visible = false;
    this.yaw = 0;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.oxygen = this.maxOxygen;
    this.syncCameraTransform(0.016);
  }

  public ensureNotEmbeddedInTerrain(): void {
    if (this.gameMode === 'spectator') return;
    const px = this.physState.position.x;
    const pz = this.physState.position.z;
    if (!this.world.isChunkLoadedAt(px, pz)) return;
    const h = this.physState.isSneaking ? this.physics.sneakingHeight : this.physics.standingHeight;
    let safety = 0;
    while (this.physics.collidesAt(px, this.physState.position.y, pz, h, this.world) && safety < 24) {
      this.physState.position.y += 1.0;
      this.physState.fallStartY = this.physState.position.y;
      safety++;
    }
  }

  public applyDamage(amount: number, knockX = 0, knockZ = 0): void {
    if (this.isInvulnerableMode() || amount <= 0) return;

    const scaledRaw = this.gameMode === 'hardcore' ? Math.ceil(amount * 1.45) : amount;
    // Armor reduces incoming damage by up to 65%
    const armorReduction = 1.0 - (this.armor / 20) * 0.65;
    let remaining = Math.max(1, Math.round(scaledRaw * armorReduction));

    if (this.absorption > 0) {
      const absTake = Math.min(this.absorption, remaining);
      this.absorption -= absTake;
      remaining -= absTake;
    }

    this.health = Math.max(0, this.health - remaining);
    this.sound.playHurt();
    this.input.gamepad.vibrate(140, 0.5, 0.8);

    const flash = document.getElementById('damage-flash');
    if (flash) {
      flash.style.opacity = '1';
      window.setTimeout(() => {
        flash.style.opacity = '0';
      }, 170);
    }

    if (knockX !== 0 || knockZ !== 0) {
      const len = Math.hypot(knockX, knockZ) || 1;
      this.physState.velocity.x += (knockX / len) * 6.0;
      this.physState.velocity.z += (knockZ / len) * 6.0;
      this.physState.velocity.y = 4.2;
    }

    if (this.health <= 0) {
      if (this.gameMode === 'hardcore') {
        this.hardcoreDead = true;
        this.setGameMode('spectator');
        this.onNotifyToast?.('💀 MORT DÉFINITIVE EN HARDCORE ! Vous passez en mode Spectateur.');
      } else {
        this.onNotifyToast?.('💀 Vous avez succombé ! Réapparition au point de départ...');
        this.respawnAtSpawn();
      }
    }
  }

  public getEyePosition(out = new THREE.Vector3()): THREE.Vector3 {
    const eyeH = this.physState.isSneaking ? 1.38 : 1.62;
    return out.set(
      this.physState.position.x,
      this.physState.position.y + eyeH,
      this.physState.position.z
    );
  }

  public getLookDirection(out = new THREE.Vector3()): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch);
    return out
      .set(
        -Math.sin(this.yaw) * cosPitch,
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * cosPitch
      )
      .normalize();
  }

  public handleDirectTouchPlaceAtNdc(ndcX: number, ndcY: number): void {
    if (this.gameMode === 'spectator') return;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const origin = ray.ray.origin.clone();
    const dir = ray.ray.direction.clone();

    const agent = this.entities.raycastCompanion(origin, dir, 5.5);
    if (agent) {
      this.onInteractCompanion?.(agent);
      return;
    }

    const hit = this.raycaster.raycast(origin, dir, 5.8, this.world);
    if (hit) {
      this.performRightClickAction(hit, origin, dir);
    } else {
      this.tryUseHeldItemWithoutBlock(origin, dir);
    }
  }

  public update(dt: number, snap: FrameInputSnapshot): void {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.bowCooldown > 0) this.bowCooldown -= dt;

    if (snap.hotbarSelectIndex !== null) {
      this.inventory.selectHotbar(snap.hotbarSelectIndex);
    }
    if (snap.hotbarCycleDelta !== 0 && this.gameMode !== 'spectator') {
      this.inventory.cycleHotbar(snap.hotbarCycleDelta > 0 ? 1 : -1);
    }
    if (snap.dropTriggered && this.gameMode !== 'spectator') {
      this.dropSelectedStackItem();
    }

    this.yaw += snap.lookDeltaYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + snap.lookDeltaPitch, -1.53, 1.53);

    if (snap.flyToggleTriggered && this.gameMode === 'creative') {
      this.physState.isFlying = !this.physState.isFlying;
      this.physState.velocity.y = 0;
    }

    this.physState.isSneaking = snap.sneakHeld && !this.physState.isFlying && this.gameMode !== 'spectator';

    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let wishX = fwdX * snap.moveForward + rightX * snap.moveStrafe;
    let wishZ = fwdZ * snap.moveForward + rightZ * snap.moveStrafe;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    const canSprint = snap.sprintActive && (this.hunger > 4 || this.isInvulnerableMode()) && !this.physState.isSneaking;
    const baseSpeed = this.physState.isSneaking ? 2.1 : canSprint ? 6.45 : 4.5;

    // Grappling Hook Propulsion Pull
    if (this.grappleAnchor) {
      this.grappleTimer -= dt;
      const toAnchor = this.grappleAnchor.clone().sub(this.physState.position);
      const dist = toAnchor.length();
      if (dist < 1.8 || this.grappleTimer <= 0 || snap.sneakHeld) {
        this.grappleAnchor = null;
        this.grappleLine.visible = false;
      } else {
        toAnchor.normalize();
        this.physState.velocity.x = toAnchor.x * 16.5;
        this.physState.velocity.y = Math.max(this.physState.velocity.y, toAnchor.y * 15.0 + 2.2);
        this.physState.velocity.z = toAnchor.z * 16.5;
        this.physState.fallStartY = this.physState.position.y;

        const pts = this.grappleLine.geometry.getAttribute('position') as THREE.BufferAttribute;
        pts.setXYZ(0, this.physState.position.x, this.physState.position.y + 1.1, this.physState.position.z);
        pts.setXYZ(1, this.grappleAnchor.x, this.grappleAnchor.y, this.grappleAnchor.z);
        pts.needsUpdate = true;
      }
    }

    const prevX = this.physState.position.x;
    const prevZ = this.physState.position.z;

    const { landedFallDistance, bouncedOnSlime } = this.physics.stepPhysics(
      dt,
      this.physState,
      wishX,
      wishZ,
      baseSpeed,
      snap.jumpHeld,
      snap.sneakHeld,
      this.gameMode === 'creative',
      this.gameMode === 'spectator',
      this.world
    );

    if (bouncedOnSlime) {
      this.sound.playPickupPop();
      this.particles.spawnBlockChips(
        this.physState.position.x,
        this.physState.position.y,
        this.physState.position.z,
        BlockId.SLIME_BLOCK,
        10
      );
    }

    if (landedFallDistance > 3.5 && !this.isInvulnerableMode()) {
      const fallDmg = Math.max(1, Math.floor(landedFallDistance - 3.0));
      this.applyDamage(fallDmg);
    }

    // Dynamic FOV (with Spectator Cinema Zoom via wheel!)
    let targetFov = canSprint && wishLen > 0.2 ? 84 : 75;
    if (this.gameMode === 'spectator' && snap.hotbarCycleDelta !== 0) {
      targetFov = THREE.MathUtils.clamp(this.camera.fov + snap.hotbarCycleDelta * 6, 22, 95);
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    } else if (this.gameMode !== 'spectator' && Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 10));
      this.camera.updateProjectionMatrix();
    }

    const uwTint = document.getElementById('underwater-tint');
    if (uwTint) {
      uwTint.style.opacity = this.physState.headUnderwater ? '1' : '0';
    }
    this.sound.updateAmbience(this.physState.position.y, this.physState.headUnderwater);

    this.updateSurvivalVitals(dt, wishLen > 0.2 && canSprint);

    const movedHoriz = Math.hypot(this.physState.position.x - prevX, this.physState.position.z - prevZ);
    if (movedHoriz > 0.001 && (this.physState.onGround || this.physState.inWater) && this.gameMode !== 'spectator') {
      this.stepDistanceAccum += movedHoriz;
      if (this.stepDistanceAccum >= 1.85) {
        this.stepDistanceAccum = 0;
        if (this.physState.inWater) {
          this.sound.playFootstep('water');
        } else {
          const groundBlock = this.world.getBlock(
            Math.floor(this.physState.position.x),
            Math.floor(this.physState.position.y - 0.2),
            Math.floor(this.physState.position.z)
          );
          this.sound.playFootstep(getBlockOrItem(groundBlock).soundGroup);
        }
      }
    }

    this.ensureNotEmbeddedInTerrain();
    const heldStack = this.inventory.getHeldStack();
    const heldItemId = heldStack?.itemId ?? 0;
    this.syncCameraTransform(dt);

    if (this.gameMode === 'spectator') {
      this.selectionBox.visible = false;
      this.crackMesh.visible = false;
      return;
    }

    const eyePos = this.getEyePosition();
    const lookDir = this.getLookDirection();

    let rayOrigin = eyePos;
    let rayDir = lookDir;
    if (snap.directMineNdc) {
      const r = new THREE.Raycaster();
      r.setFromCamera(new THREE.Vector2(snap.directMineNdc.x, snap.directMineNdc.y), this.camera);
      rayOrigin = r.ray.origin;
      rayDir = r.ray.direction;
    }

    this.currentHit = this.raycaster.raycast(rayOrigin, rayDir, 5.8, this.world);
    if (this.currentHit) {
      this.selectionBox.visible = true;
      this.selectionBox.position.set(
        this.currentHit.blockX + 0.5,
        this.currentHit.blockY + 0.5,
        this.currentHit.blockZ + 0.5
      );
    } else {
      this.selectionBox.visible = false;
    }

    if (snap.pickBlockTriggered && this.currentHit) {
      this.inventory.pickBlockIntoHotbar(this.currentHit.blockId, this.isInfiniteItemsMode());
    }

    if (snap.placeTriggered) {
      const agent = this.entities.raycastCompanion(eyePos, lookDir, 5.2);
      if (agent) {
        this.onInteractCompanion?.(agent);
      } else if (
        heldItemId === ItemId.BOW ||
        heldItemId === ItemId.GRAPPLING_HOOK ||
        heldItemId === ItemId.BUCKET_EMPTY
      ) {
        this.tryUseHeldItemWithoutBlock(eyePos, lookDir);
      } else if (this.currentHit) {
        this.performRightClickAction(this.currentHit, eyePos, lookDir);
      } else {
        this.tryUseHeldItemWithoutBlock(eyePos, lookDir);
      }
    }

    this.handleMiningAndCombat(dt, snap.mineHeld, rayOrigin, rayDir);
    this.updateViewModel(dt, movedHoriz / Math.max(0.001, dt), heldItemId);
  }

  private updateSurvivalVitals(dt: number, isSprinting: boolean): void {
    if (this.isInvulnerableMode()) return;

    if (this.physState.headUnderwater) {
      this.oxygen = Math.max(0, this.oxygen - dt * 1.4);
      if (this.oxygen <= 0) {
        this.lavaDamageTimer += dt;
        if (this.lavaDamageTimer >= 1.0) {
          this.lavaDamageTimer = 0;
          this.applyDamage(2);
        }
      }
    } else {
      this.oxygen = Math.min(this.maxOxygen, this.oxygen + dt * 4.5);
    }

    if (this.physState.inLava) {
      this.lavaDamageTimer += dt;
      if (this.lavaDamageTimer >= 0.65) {
        this.lavaDamageTimer = 0;
        this.applyDamage(4);
      }
    }

    this.hungerTickTimer += dt * (isSprinting ? 2.4 : 0.4);
    if (this.hungerTickTimer >= 22) {
      this.hungerTickTimer = 0;
      this.hunger = Math.max(0, this.hunger - 1);
    }

    if (this.gameMode !== 'hardcore' && this.hunger >= 16 && this.health < this.maxHealth) {
      this.regenTickTimer += dt;
      if (this.regenTickTimer >= 3.2) {
        this.regenTickTimer = 0;
        this.health = Math.min(this.maxHealth, this.health + 1);
      }
    }
  }

  private handleMiningAndCombat(
    dt: number,
    mineHeld: boolean,
    rayOrigin: THREE.Vector3,
    rayDir: THREE.Vector3
  ): void {
    if (!mineHeld) {
      this.miningProgress = 0;
      this.miningBlockKey = '';
      this.crackMesh.visible = false;
      this.input.touch.setDirectMineProgress(0);
      return;
    }

    this.triggerHandSwing();

    const held = this.inventory.getHeldStack();
    const heldDef = held ? getBlockOrItem(held.itemId) : null;

    // Melee attack on Mob
    if (this.attackCooldown <= 0) {
      const dmg = Math.max(2, heldDef?.attackDamage ?? 2);
      const hitMob = this.entities.raycastMobAttack(rayOrigin, rayDir, dmg, 4.2);
      if (hitMob) {
        this.attackCooldown = 0.42;
        this.sound.playAttackSwing();
        this.inventory.damageHeldTool(1, this.isInfiniteItemsMode());
        this.input.gamepad.vibrate(75, 0.3, 0.45);
        return;
      }
    }

    if (!this.currentHit) {
      this.miningProgress = 0;
      this.crackMesh.visible = false;
      return;
    }

    const { blockX, blockY, blockZ, blockId, normalX, normalY, normalZ } = this.currentHit;
    const blockDef = getBlockOrItem(blockId);

    if (this.gameMode === 'creative') {
      if (this.attackCooldown <= 0) {
        this.attackCooldown = 0.15;
        if (held?.itemId === ItemId.EXCAVATOR_HAMMER) {
          this.excavate3x3(blockX, blockY, blockZ, normalX, normalY, normalZ, false);
        } else {
          this.world.setBlock(blockX, blockY, blockZ, BlockId.AIR, true, true);
        }
        this.particles.spawnBlockBreakBurst(blockX, blockY, blockZ, blockId);
        this.sound.playBlockBreak(blockDef.soundGroup);
        this.input.gamepad.vibrate(55, 0.25, 0.35);
      }
      return;
    }

    if (blockDef.hardness < 0) {
      this.miningProgress = 0;
      this.crackMesh.visible = false;
      return;
    }

    const key = `${blockX},${blockY},${blockZ}`;
    if (key !== this.miningBlockKey) {
      this.miningBlockKey = key;
      this.miningProgress = 0;
    }

    let speedMult = 1.0;
    if (heldDef && heldDef.toolType !== 'none' && heldDef.toolType === blockDef.preferredTool) {
      speedMult = heldDef.toolSpeed;
    } else if (blockDef.minToolTier > 0) {
      speedMult = 0.35;
    }
    if (this.physState.headUnderwater) speedMult *= 0.5;

    const totalBreakTime = Math.max(0.08, blockDef.hardness / speedMult);
    this.miningProgress += dt / totalBreakTime;
    this.input.touch.setDirectMineProgress(this.miningProgress);

    this.mineHitSoundTimer -= dt;
    if (this.mineHitSoundTimer <= 0) {
      this.mineHitSoundTimer = 0.22;
      this.sound.playMineHit(blockDef.soundGroup);
      this.particles.spawnBlockChips(blockX, blockY, blockZ, blockId, 3);
    }

    const stage = Math.min(9, Math.floor(this.miningProgress * 10));
    this.updateCrackStageUVs(TileId.CRACK_0 + stage);
    this.crackMesh.position.set(blockX + 0.5, blockY + 0.5, blockZ + 0.5);
    this.crackMesh.visible = true;

    if (this.miningProgress >= 1.0) {
      this.miningProgress = 0;
      this.miningBlockKey = '';
      this.crackMesh.visible = false;
      this.input.touch.setDirectMineProgress(0);

      if (held?.itemId === ItemId.EXCAVATOR_HAMMER) {
        this.excavate3x3(blockX, blockY, blockZ, normalX, normalY, normalZ, true);
      } else {
        this.harvestSingleBlock(blockX, blockY, blockZ, blockId, heldDef);
      }

      this.particles.spawnBlockBreakBurst(blockX, blockY, blockZ, blockId);
      this.sound.playBlockBreak(blockDef.soundGroup);
      this.input.gamepad.vibrate(85, 0.35, 0.55);
      this.inventory.damageHeldTool(1, false);
    }
  }

  private harvestSingleBlock(
    bx: number,
    by: number,
    bz: number,
    blockId: number,
    heldDef: ReturnType<typeof getBlockOrItem> | null
  ): void {
    const blockDef = getBlockOrItem(blockId);
    if (blockDef.hardness < 0) return;
    this.world.setBlock(bx, by, bz, BlockId.AIR, true, true);

    const canHarvest =
      blockDef.minToolTier === 0 ||
      (heldDef !== null && heldDef.toolType === blockDef.preferredTool && heldDef.toolTier >= blockDef.minToolTier);

    if (canHarvest && blockDef.dropCount > 0) {
      this.particles.spawnDroppedItem(bx + 0.5, by + 0.5, bz + 0.5, blockDef.dropId, blockDef.dropCount);
    }
    if (blockId === BlockId.OAK_LEAVES && Math.random() < 0.18) {
      this.particles.spawnDroppedItem(
        bx + 0.5,
        by + 0.5,
        bz + 0.5,
        Math.random() < 0.45 ? ItemId.APPLE : ItemId.STICK,
        1
      );
    }
  }

  private excavate3x3(
    cx: number,
    cy: number,
    cz: number,
    nx: number,
    ny: number,
    nz: number,
    dropItems: boolean
  ): void {
    const hammerDef = getBlockOrItem(ItemId.EXCAVATOR_HAMMER);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const tx = nx !== 0 ? cx : cx + a;
        const ty = ny !== 0 ? cy : nx !== 0 ? cy + b : cy + b;
        const tz = nz !== 0 ? cz : nx !== 0 ? cz + a : cz;
        const bid = this.world.getBlock(tx, ty, tz);
        if (bid === BlockId.AIR || bid === BlockId.BEDROCK || bid === BlockId.WATER || bid === BlockId.LAVA) continue;
        if (dropItems) {
          this.harvestSingleBlock(tx, ty, tz, bid, hammerDef);
        } else {
          this.world.setBlock(tx, ty, tz, BlockId.AIR, true, true);
        }
      }
    }
  }

  private updateCrackStageUVs(crackTileId: number): void {
    const [u0, vb, u1, vt] = getTileUVRect(crackTileId);
    const uv = this.crackGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let f = 0; f < 6; f++) {
      const base = f * 4;
      uv.setXY(base + 0, u0, vt);
      uv.setXY(base + 1, u1, vt);
      uv.setXY(base + 2, u0, vb);
      uv.setXY(base + 3, u1, vb);
    }
    uv.needsUpdate = true;
  }

  private performRightClickAction(hit: VoxelRaycastHit, eyePos: THREE.Vector3, lookDir: THREE.Vector3): void {
    const targetBlock = hit.blockId;

    if (!this.physState.isSneaking) {
      if (targetBlock === BlockId.CRAFTING_TABLE) {
        this.sound.playUiClick();
        this.onOpenCraftingTable?.();
        return;
      }
      if (targetBlock === BlockId.FURNACE_OFF || targetBlock === BlockId.FURNACE_ON) {
        this.sound.playUiClick();
        this.onOpenFurnace?.(hit.blockX, hit.blockY, hit.blockZ);
        return;
      }
      if (targetBlock === BlockId.CHEST) {
        this.sound.playChest(true);
        this.onOpenChest?.(hit.blockX, hit.blockY, hit.blockZ);
        return;
      }
      if (targetBlock === BlockId.TNT) {
        this.sound.playFuseHiss();
        this.world.igniteTNT(hit.blockX, hit.blockY, hit.blockZ, 3.0);
        this.onNotifyToast?.('🧨 TNT amorcée ! Éloignez-vous !');
        return;
      }
    }

    const held = this.inventory.getHeldStack();
    if (!held) return;
    const def = getBlockOrItem(held.itemId);

    // Architect Wand: 1-Click Instant Structure Builder!
    if (held.itemId === ItemId.ARCHITECT_WAND) {
      if (this.physState.isSneaking) {
        const order: WandBlueprintKind[] = ['chalet', 'watchtower', 'pyramid'];
        this.wandBlueprint = order[(order.indexOf(this.wandBlueprint) + 1) % order.length]!;
        const names: Record<WandBlueprintKind, string> = {
          chalet: '🏡 Chalet Meublé Éclairé',
          watchtower: '🏰 Tour Médiévale Moussue',
          pyramid: '🏜️ Pyramide Royale d\'Or',
        };
        this.sound.playUiClick();
        this.onNotifyToast?.(`✨ Baguette d'Architecte réglée sur : ${names[this.wandBlueprint]}`);
      } else {
        this.stampArchitectBlueprint(hit.placeX, hit.placeY, hit.placeZ);
        this.sound.playBlockPlace('stone');
        this.triggerHandSwing();
      }
      return;
    }

    // Water & Lava Buckets placement
    if (held.itemId === ItemId.BUCKET_WATER || held.itemId === ItemId.BUCKET_LAVA) {
      const fluidBlock = held.itemId === ItemId.BUCKET_WATER ? BlockId.WATER : BlockId.LAVA;
      this.world.setBlock(hit.placeX, hit.placeY, hit.placeZ, fluidBlock, true, true);
      this.sound.playFootstep('water');
      if (!this.isInfiniteItemsMode()) {
        this.inventory.setHeldStack({ itemId: ItemId.BUCKET_EMPTY, count: 1 });
      }
      this.triggerHandSwing();
      return;
    }

    // Companion Horn
    if (held.itemId === ItemId.COMPANION_HORN) {
      this.sound.playHorn();
      const agent = this.entities.spawnCompanion(
        hit.placeX + 0.5,
        hit.placeY + 0.1,
        hit.placeZ + 0.5,
        'guard',
        this.world
      );
      this.inventory.consumeHeldItem(1, this.isInfiniteItemsMode());
      this.onNotifyToast?.(`🤖 Agent Compagnon "${agent.name}" recruté ! Clic droit sur lui pour changer son rôle.`);
      return;
    }

    // Armor Equip or Food
    if (def.armorPoints > 0 || def.foodRestore > 0) {
      this.tryUseHeldItemWithoutBlock(eyePos, lookDir);
      return;
    }

    if (!def.isBlock) return;

    const px = hit.placeX;
    const py = hit.placeY;
    const pz = hit.placeZ;

    if (
      def.solid &&
      this.physics.wouldBlockIntersectEntity(
        px,
        py,
        pz,
        this.physState.position,
        this.physState.isSneaking ? this.physics.sneakingHeight : this.physics.standingHeight
      )
    ) {
      return;
    }

    const existing = this.world.getBlock(px, py, pz);
    if (existing !== BlockId.AIR && existing !== BlockId.WATER && existing !== BlockId.LAVA && existing !== BlockId.TALL_GRASS) {
      return;
    }

    if (this.world.setBlock(px, py, pz, held.itemId, true, true)) {
      this.triggerHandSwing();
      this.sound.playBlockPlace(def.soundGroup);
      this.inventory.consumeHeldItem(1, this.isInfiniteItemsMode());
    }
  }

  private tryUseHeldItemWithoutBlock(eyePos: THREE.Vector3, lookDir: THREE.Vector3): void {
    const held = this.inventory.getHeldStack();
    if (!held) return;
    const def = getBlockOrItem(held.itemId);

    // 1. Bow & 3D Ballistic Arrow Shot!
    if (held.itemId === ItemId.BOW) {
      if (this.bowCooldown > 0) return;
      const hasArrows = this.isInfiniteItemsMode() || this.inventory.removeItemCount(ItemId.ARROW, 1);
      if (!hasArrows) {
        this.onNotifyToast?.('🏹 Plus de flèches ! Fabriquez-en avec Silex + Bâton.');
        return;
      }
      this.bowCooldown = 0.36;
      this.sound.playAttackSwing();
      this.triggerHandSwing();
      const spawnPos = eyePos.clone().addScaledVector(lookDir, 0.55);
      this.entities.spawnArrowProjectile(spawnPos, lookDir, 30, 9);
      this.inventory.damageHeldTool(1, this.isInfiniteItemsMode());
      return;
    }

    // 2. Grappling Hook Launch (up to 32m!)
    if (held.itemId === ItemId.GRAPPLING_HOOK) {
      const farHit = this.raycaster.raycast(eyePos, lookDir, 32, this.world);
      if (farHit) {
        this.grappleAnchor = new THREE.Vector3(
          farHit.blockX + 0.5,
          farHit.blockY + 0.8,
          farHit.blockZ + 0.5
        );
        this.grappleTimer = 1.6;
        this.grappleLine.visible = true;
        this.sound.playAttackSwing();
        this.triggerHandSwing();
        this.inventory.damageHeldTool(1, this.isInfiniteItemsMode());
      } else {
        this.onNotifyToast?.('🪝 Aucune prise à portée du grappin (portée : 32 blocs).');
      }
      return;
    }

    // 3. Empty Bucket: Scoop Water or Lava!
    if (held.itemId === ItemId.BUCKET_EMPTY) {
      const liqHit = this.raycaster.raycast(eyePos, lookDir, 5.8, this.world, true);
      if (liqHit && (liqHit.blockId === BlockId.WATER || liqHit.blockId === BlockId.LAVA)) {
        const filledId = liqHit.blockId === BlockId.WATER ? ItemId.BUCKET_WATER : ItemId.BUCKET_LAVA;
        this.world.setBlock(liqHit.blockX, liqHit.blockY, liqHit.blockZ, BlockId.AIR, true, true);
        this.sound.playFootstep('water');
        if (held.count > 1) {
          this.inventory.consumeHeldItem(1, false);
          this.inventory.addItem(filledId, 1);
        } else {
          this.inventory.setHeldStack({ itemId: filledId, count: 1 });
        }
        this.triggerHandSwing();
      }
      return;
    }

    // 4. Equip Iron / Diamond Armor
    if (def.armorPoints > 0) {
      if (this.armor < def.armorPoints) {
        this.armor = def.armorPoints;
        this.sound.playPickupPop();
        this.inventory.consumeHeldItem(1, this.isInfiniteItemsMode());
        this.onNotifyToast?.(`🛡️ ${def.name} équipée ! Protection active.`);
      } else {
        this.onNotifyToast?.('🛡️ Vous portez déjà une armure équivalente ou supérieure.');
      }
      return;
    }

    // 5. Eat Food / Golden Apple
    if (def.foodRestore > 0) {
      const isGolden = held.itemId === ItemId.GOLDEN_APPLE;
      if (isGolden || (!this.isInvulnerableMode() && (this.hunger < this.maxHunger || this.health < this.maxHealth))) {
        this.sound.playEat();
        this.hunger = Math.min(this.maxHunger, this.hunger + def.foodRestore);
        this.health = Math.min(this.maxHealth, this.health + (isGolden ? 10 : Math.ceil(def.foodRestore * 0.4)));
        if (isGolden) {
          this.absorption = 6;
          this.onNotifyToast?.('💛 Pomme Dorée : Régénération + 3 Cœurs d\'Absorption activés !');
        }
        this.inventory.consumeHeldItem(1, this.isInfiniteItemsMode());
        this.triggerHandSwing();
      }
      return;
    }

    if (held.itemId === ItemId.COMPANION_HORN) {
      const sx = this.physState.position.x + lookDir.x * 2.5;
      const sz = this.physState.position.z + lookDir.z * 2.5;
      this.sound.playHorn();
      const agent = this.entities.spawnCompanion(sx, this.physState.position.y + 0.5, sz, 'guard', this.world);
      this.inventory.consumeHeldItem(1, this.isInfiniteItemsMode());
      this.onNotifyToast?.(`🤖 Agent Compagnon "${agent.name}" recruté !`);
    }
  }

  private stampArchitectBlueprint(ox: number, oy: number, oz: number): void {
    if (this.wandBlueprint === 'chalet') {
      // 7x5x7 Furnished Luxury Chalet (Marble floor, Oak/Spruce walls, Glass windows, Bookshelves, Crafting Table, Furnace, Lanterns!)
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          this.world.setBlock(ox + dx, oy, oz + dz, BlockId.MARBLE, true, false);
          this.world.setBlock(ox + dx, oy + 4, oz + dz, BlockId.SPRUCE_PLANKS, true, false);
          for (let dy = 1; dy <= 3; dy++) {
            const wall = Math.abs(dx) === 3 || Math.abs(dz) === 3;
            const corner = Math.abs(dx) === 3 && Math.abs(dz) === 3;
            if (dx === 0 && dz === -3 && dy <= 2) {
              this.world.setBlock(ox + dx, oy + dy, oz + dz, BlockId.AIR, true, false);
            } else if (wall) {
              const win = dy === 2 && (dx === 0 || dz === 0);
              this.world.setBlock(
                ox + dx,
                oy + dy,
                oz + dz,
                corner ? BlockId.OAK_LOG : win ? BlockId.GLASS : BlockId.OAK_PLANKS,
                true,
                false
              );
            } else {
              this.world.setBlock(ox + dx, oy + dy, oz + dz, BlockId.AIR, true, false);
            }
          }
        }
      }
      this.world.setBlock(ox - 2, oy + 1, oz + 2, BlockId.BOOKSHELF, true, false);
      this.world.setBlock(ox - 1, oy + 1, oz + 2, BlockId.BOOKSHELF, true, false);
      this.world.setBlock(ox + 2, oy + 1, oz + 2, BlockId.CRAFTING_TABLE, true, false);
      this.world.setBlock(ox + 1, oy + 1, oz + 2, BlockId.FURNACE_OFF, true, false);
      this.world.setBlock(ox, oy + 1, oz, BlockId.LANTERN, true, false);
      this.onNotifyToast?.('🏡 Chalet Meublé construit instantanément ! (Sneak+Clic Droit pour changer de modèle)');
      return;
    }

    if (this.wandBlueprint === 'watchtower') {
      for (let dy = 0; dy <= 8; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
            if (dy === 0 || dy === 7) {
              this.world.setBlock(ox + dx, oy + dy, oz + dz, BlockId.STONE_BRICKS, true, false);
            } else if (dy === 8) {
              if (edge && (Math.abs(dx) + Math.abs(dz)) % 2 === 0) {
                this.world.setBlock(ox + dx, oy + dy, oz + dz, BlockId.MOSSY_COBBLESTONE, true, false);
              }
            } else if (dx === 0 && dz === -2 && dy <= 2) {
              this.world.setBlock(ox + dx, oy + dy, oz + dz, BlockId.AIR, true, false);
            } else if (edge) {
              this.world.setBlock(
                ox + dx,
                oy + dy,
                oz + dz,
                (dx + dy) % 3 === 0 ? BlockId.MOSSY_COBBLESTONE : BlockId.STONE_BRICKS,
                true,
                false
              );
            } else {
              this.world.setBlock(ox + dx, oy + dy, oz + dz, BlockId.AIR, true, false);
            }
          }
        }
      }
      this.world.setBlock(ox, oy + 1, oz, BlockId.LANTERN, true, false);
      this.world.setBlock(ox, oy + 8, oz, BlockId.LANTERN, true, false);
      this.onNotifyToast?.('🏰 Tour de Guet Médiévale érigée !');
      return;
    }

    // Golden Pyramid
    for (let l = 0; l <= 4; l++) {
      const r = 4 - l;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const shell = Math.abs(dx) === r || Math.abs(dz) === r || l === 0;
          this.world.setBlock(
            ox + dx,
            oy + l,
            oz + dz,
            l === 4 ? BlockId.GOLD_BLOCK : shell ? BlockId.SANDSTONE : BlockId.AIR,
            true,
            false
          );
        }
      }
    }
    this.world.setBlock(ox, oy + 1, oz - 4, BlockId.AIR, true, false);
    this.world.setBlock(ox, oy + 2, oz - 4, BlockId.AIR, true, false);
    this.world.setBlock(ox, oy + 1, oz, BlockId.LANTERN, true, false);
    this.onNotifyToast?.('🏜️ Pyramide Royale d\'Or érigée !');
  }

  private dropSelectedStackItem(): void {
    const held = this.inventory.getHeldStack();
    if (!held) return;
    const eye = this.getEyePosition();
    const dir = this.getLookDirection();
    this.particles.spawnDroppedItem(
      eye.x + dir.x * 0.6,
      eye.y - 0.2,
      eye.z + dir.z * 0.6,
      held.itemId,
      1,
      held.durability,
      1.1,
      dir.x * 5.2,
      dir.y * 5.2 + 1.8,
      dir.z * 5.2
    );
    this.inventory.consumeHeldItem(1, false);
  }

  public triggerHandSwing(): void {
    if (this.swingAnim <= 0) {
      this.swingAnim = 0.24;
    }
    this.localThirdPersonAvatar.triggerSwing();
  }

  public syncCameraTransform(dt: number): void {
    const eyePos = this.getEyePosition();
    const lookDir = this.getLookDirection();

    this.camera.up.set(0, 1, 0);
    this.camera.rotation.order = 'YXZ';

    if (this.cameraMode === 0 || this.gameMode === 'spectator') {
      this.camera.position.copy(eyePos);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else {
      const maxDist = 3.8;
      const camDir = this.cameraMode === 1 ? lookDir.clone().negate() : lookDir.clone();
      const wallHit = this.raycaster.raycast(eyePos, camDir, maxDist, this.world);
      const actualDist = wallHit ? Math.max(0.45, wallHit.distance - 0.28) : maxDist;

      this.camera.position.copy(eyePos).addScaledVector(camDir, actualDist);
      if (this.cameraMode === 1) {
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      } else {
        this.camera.rotation.set(-this.pitch, this.yaw + Math.PI, 0, 'YXZ');
      }
    }

    const heldStack = this.inventory.getHeldStack();
    const heldItemId = heldStack?.itemId ?? 0;
    if (this.viewModelHeldId !== heldItemId) {
      this.updateViewModel(0, 0, heldItemId);
    }
    this.localThirdPersonAvatar.targetPosition.copy(this.physState.position);
    this.localThirdPersonAvatar.targetYaw = this.yaw;
    this.localThirdPersonAvatar.targetPitch = this.pitch;
    this.localThirdPersonAvatar.isSneaking = this.physState.isSneaking;
    this.localThirdPersonAvatar.setHeldItem(heldItemId);
    this.localThirdPersonAvatar.update(dt, true);
  }

  private updateViewModel(dt: number, horizSpeed: number, heldItemId: number): void {
    if (this.viewModelHeldId !== heldItemId) {
      this.viewModelHeldId = heldItemId;
      while (this.viewModelItemSlot.children.length > 0) {
        const old = this.viewModelItemSlot.children[0] as THREE.Mesh;
        this.viewModelItemSlot.remove(old);
        (old.material as THREE.Material).dispose();
      }
      if (heldItemId > 0) {
        this.armMesh.visible = false;
        const mesh = this.particles.createItem3DMesh(heldItemId);
        const clonedMat = (mesh.material as THREE.Material).clone();
        clonedMat.depthTest = false;
        clonedMat.depthWrite = false;
        mesh.material = clonedMat;
        mesh.renderOrder = 60;

        const def = getBlockOrItem(heldItemId);
        if (def.isBlock && def.renderType !== 'cross' && def.renderType !== 'torch' && def.renderType !== 'lantern') {
          mesh.scale.setScalar(0.76);
          mesh.rotation.set(0.16, Math.PI * 0.25, 0);
        } else {
          mesh.scale.set(-0.82, 0.82, 0.82);
          mesh.rotation.set(0.08, 0.22, 0.12);
        }
        this.viewModelItemSlot.add(mesh);
      } else {
        this.armMesh.visible = true;
      }
    }

    const light = this.world.getLightAt(
      this.physState.position.x,
      this.physState.position.y + 1,
      this.physState.position.z
    );
    const bright = Math.max(0.35, Math.max(light.sky, light.block) / 15);
    const skinHex = DEFAULT_SKINS[this.skinIndex]?.skinTone ?? '#e0ac82';
    this.armMat.color.set(skinHex).multiplyScalar(bright);

    if (horizSpeed > 0.2 && this.physState.onGround) {
      this.walkBobTime += dt * Math.min(11, horizSpeed * 2.0);
    }

    const bobX = Math.cos(this.walkBobTime) * 0.018;
    const bobY = Math.abs(Math.sin(this.walkBobTime)) * -0.022;

    let swingRotX = 0;
    let swingRotZ = 0;
    if (this.swingAnim > 0) {
      this.swingAnim = Math.max(0, this.swingAnim - dt);
      const t = 1.0 - this.swingAnim / 0.24;
      swingRotX = -Math.sin(t * Math.PI) * 0.82;
      swingRotZ = Math.sin(t * Math.PI) * 0.28;
    }

    this.viewModelGroup.position.set(bobX, bobY, 0);
    this.viewModelGroup.rotation.set(swingRotX, 0, swingRotZ);
  }
}
