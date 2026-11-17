import * as THREE from 'three';
import type { ParticleSystem } from '../graphics/ParticleSystem';

export interface AvatarSkin {
  shirtColor: string;
  pantsColor: string;
  skinTone: string;
  hairColor: string;
}

export const DEFAULT_SKINS: AvatarSkin[] = [
  { shirtColor: '#06b6d4', pantsColor: '#3730a3', skinTone: '#e0ac82', hairColor: '#451a03' },
  { shirtColor: '#22c55e', pantsColor: '#78350f', skinTone: '#f1c27d', hairColor: '#9a3412' },
  { shirtColor: '#f59e0b', pantsColor: '#1e293b', skinTone: '#c68642', hairColor: '#111827' },
  { shirtColor: '#ec4899', pantsColor: '#312e81', skinTone: '#ffdbac', hairColor: '#701a75' },
];

export class RemotePlayer {
  public readonly peerId: string;
  public username: string;
  public readonly group = new THREE.Group();

  public readonly targetPosition = new THREE.Vector3();
  public targetYaw = 0;
  public targetPitch = 0;
  public isSneaking = false;
  public isSwinging = false;

  private readonly headPivot = new THREE.Group();
  private readonly torsoMesh: THREE.Mesh;
  private readonly leftArmPivot = new THREE.Group();
  private readonly rightArmPivot = new THREE.Group();
  private readonly leftLegPivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();
  private readonly heldItemSlot = new THREE.Group();
  private nameSprite?: THREE.Sprite;

  private currentHeldItemId = 0;
  private walkPhase = 0;
  private swingTimer = 0;
  private readonly particles: ParticleSystem;

  constructor(
    peerId: string,
    username: string,
    skin: AvatarSkin,
    particles: ParticleSystem,
    showNameTag = true
  ) {
    this.peerId = peerId;
    this.username = username;
    this.particles = particles;

    const skinMat = new THREE.MeshLambertMaterial({ color: skin.skinTone });
    const hairMat = new THREE.MeshLambertMaterial({ color: skin.hairColor });
    const shirtMat = new THREE.MeshLambertMaterial({ color: skin.shirtColor });
    const pantsMat = new THREE.MeshLambertMaterial({ color: skin.pantsColor });
    const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyePupil = new THREE.MeshBasicMaterial({ color: 0x1e293b });

    // Legs (pivot at hip y = 0.72)
    const legGeo = new THREE.BoxGeometry(0.24, 0.72, 0.24);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.y = -0.36;
    leftLeg.castShadow = true;
    this.leftLegPivot.position.set(-0.13, 0.72, 0);
    this.leftLegPivot.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.y = -0.36;
    rightLeg.castShadow = true;
    this.rightLegPivot.position.set(0.13, 0.72, 0);
    this.rightLegPivot.add(rightLeg);

    // Torso (y = 0.72 .. 1.40)
    this.torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.68, 0.26), shirtMat);
    this.torsoMesh.position.set(0, 1.06, 0);
    this.torsoMesh.castShadow = true;

    // Arms (pivot at shoulder y = 1.36)
    const armGeo = new THREE.BoxGeometry(0.22, 0.68, 0.22);
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.y = -0.3;
    leftArm.castShadow = true;
    this.leftArmPivot.position.set(-0.36, 1.36, 0);
    this.leftArmPivot.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.y = -0.3;
    rightArm.castShadow = true;
    this.rightArmPivot.position.set(0.36, 1.36, 0);
    this.rightArmPivot.add(rightArm);

    this.heldItemSlot.position.set(0, -0.56, -0.18);
    this.rightArmPivot.add(this.heldItemSlot);

    // Head (pivot at neck y = 1.40)
    this.headPivot.position.set(0, 1.40, 0);
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), skinMat);
    headMesh.position.y = 0.23;
    headMesh.castShadow = true;
    this.headPivot.add(headMesh);

    const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48), hairMat);
    hairCap.position.y = 0.42;
    this.headPivot.add(hairCap);

    // Face eyes on -Z forward face
    const eyeL = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.06), eyeWhite);
    eyeL.position.set(-0.1, 0.22, -0.235);
    eyeL.rotation.y = Math.PI;
    const pupL = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.06), eyePupil);
    pupL.position.set(-0.09, 0.22, -0.237);
    pupL.rotation.y = Math.PI;

    const eyeR = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.06), eyeWhite);
    eyeR.position.set(0.1, 0.22, -0.235);
    eyeR.rotation.y = Math.PI;
    const pupR = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.06), eyePupil);
    pupR.position.set(0.09, 0.22, -0.237);
    pupR.rotation.y = Math.PI;

    this.headPivot.add(eyeL, pupL, eyeR, pupR);

    this.group.add(
      this.leftLegPivot,
      this.rightLegPivot,
      this.torsoMesh,
      this.leftArmPivot,
      this.rightArmPivot,
      this.headPivot
    );

    if (showNameTag) {
      this.nameSprite = this.createNameSprite(username);
      this.nameSprite.position.set(0, 2.18, 0);
      this.group.add(this.nameSprite);
    }
  }

  private createNameSprite(text: string): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(11, 16, 26, 0.72)';
    ctx.fillRect(18, 12, 220, 40);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 12, 220, 40);
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 16), 128, 33);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.75, 0.44, 1);
    sprite.renderOrder = 20;
    return sprite;
  }

  public setHeldItem(itemId: number): void {
    if (this.currentHeldItemId === itemId) return;
    this.currentHeldItemId = itemId;
    while (this.heldItemSlot.children.length > 0) {
      this.heldItemSlot.remove(this.heldItemSlot.children[0]!);
    }
    if (itemId > 0) {
      const mesh = this.particles.createItem3DMesh(itemId);
      mesh.scale.setScalar(0.95);
      mesh.rotation.x = 0.35;
      this.heldItemSlot.add(mesh);
    }
  }

  public triggerSwing(): void {
    this.swingTimer = 0.28;
  }

  public update(dt: number, directLocalSync = false): void {
    const prevX = this.group.position.x;
    const prevZ = this.group.position.z;

    if (directLocalSync) {
      this.group.position.copy(this.targetPosition);
      this.group.rotation.y = this.targetYaw;
    } else {
      this.group.position.lerp(this.targetPosition, Math.min(1, dt * 15));
      let dyaw = this.targetYaw - this.group.rotation.y;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      this.group.rotation.y += dyaw * Math.min(1, dt * 15);
    }

    const movedDist = Math.hypot(this.group.position.x - prevX, this.group.position.z - prevZ);
    const moveSpeed = movedDist / Math.max(0.001, dt);

    if (moveSpeed > 0.15) {
      this.walkPhase += dt * Math.min(13, moveSpeed * 2.4);
    } else {
      this.walkPhase = 0;
    }

    const limbAmp = moveSpeed > 0.15 ? Math.sin(this.walkPhase) * 0.65 : 0;
    this.leftLegPivot.rotation.x = limbAmp;
    this.rightLegPivot.rotation.x = -limbAmp;
    this.leftArmPivot.rotation.x = -limbAmp * 0.8;

    if (this.isSwinging) {
      this.swingTimer = 0.26;
      this.isSwinging = false;
    }

    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      const p = 1.0 - this.swingTimer / 0.28;
      this.rightArmPivot.rotation.x = -Math.sin(p * Math.PI) * 1.55 + limbAmp * 0.3;
    } else {
      this.rightArmPivot.rotation.x = limbAmp * 0.8 - (this.currentHeldItemId > 0 ? 0.32 : 0);
    }

    this.headPivot.rotation.x = THREE.MathUtils.clamp(this.targetPitch, -1.35, 1.35);

    // Sneak crouch pose
    this.torsoMesh.rotation.x = this.isSneaking ? 0.32 : 0;
    this.headPivot.position.y = this.isSneaking ? 1.28 : 1.40;
  }

  public dispose(): void {
    if (this.nameSprite) {
      (this.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
      this.nameSprite.material.dispose();
    }
  }
}
