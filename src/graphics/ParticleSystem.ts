import * as THREE from 'three';
import { BlockId, getBlockOrItem } from '../blocks/BlockRegistry';
import { getTileUVRect } from '../world/ChunkMesher';
import type { ProceduralAtlas } from './ProceduralAtlas';

interface VoxelParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  age: number;
  maxAge: number;
  gravity: number;
  color: THREE.Color;
}

export interface DroppedItemEntity {
  id: number;
  itemId: number;
  count: number;
  durability?: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  pickupDelay: number;
  mesh: THREE.Mesh;
}

export class ParticleSystem {
  private readonly maxParticles = 420;
  private readonly particles: VoxelParticle[] = [];
  private readonly instancedMesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  public readonly drops: DroppedItemEntity[] = [];
  private readonly dropsGroup = new THREE.Group();
  private nextDropId = 1;
  private readonly atlas: ProceduralAtlas;
  private readonly itemMeshGeoCache = new Map<number, THREE.BufferGeometry>();
  private readonly itemSpriteTexCache = new Map<number, THREE.Texture>();
  private readonly planeGeo = new THREE.PlaneGeometry(0.38, 0.38);

  constructor(scene: THREE.Scene, atlas: ProceduralAtlas) {
    this.atlas = atlas;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.instancedMesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.frustumCulled = false;

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 0.12,
        age: 0,
        maxAge: 1,
        gravity: 16,
        color: new THREE.Color(0xffffff),
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
      this.instancedMesh.setColorAt(i, new THREE.Color(0xffffff));
    }

    scene.add(this.instancedMesh);
    scene.add(this.dropsGroup);

    this.atlas.onPackChanged(() => {
      for (const tex of this.itemSpriteTexCache.values()) {
        tex.dispose();
      }
      this.itemSpriteTexCache.clear();
    });
  }

  private getBlockTint(blockId: number): number {
    switch (blockId) {
      case BlockId.GRASS:
      case BlockId.OAK_LEAVES:
      case BlockId.BIRCH_LEAVES:
      case BlockId.SPRUCE_LEAVES:
      case BlockId.TALL_GRASS:
      case BlockId.CACTUS:
        return 0x4ade80;
      case BlockId.DIRT:
        return 0x854d0e;
      case BlockId.SAND:
      case BlockId.SANDSTONE:
        return 0xfde047;
      case BlockId.OAK_LOG:
      case BlockId.OAK_PLANKS:
      case BlockId.CRAFTING_TABLE:
      case BlockId.CHEST:
        return 0xb47a3c;
      case BlockId.DIAMOND_ORE:
        return 0x38bdf8;
      case BlockId.GOLD_ORE:
      case BlockId.GLOWSTONE:
        return 0xfacc15;
      case BlockId.TNT:
      case BlockId.BRICKS:
      case BlockId.FLOWER_RED:
        return 0xef4444;
      case BlockId.SNOW:
      case BlockId.SNOWY_GRASS:
        return 0xf8fafc;
      case BlockId.WATER:
      case BlockId.ICE:
        return 0x38bdf8;
      default:
        return 0x94a3b8;
    }
  }

  public spawnBlockChips(x: number, y: number, z: number, blockId: number, count = 6): void {
    const baseHex = this.getBlockTint(blockId);
    for (let i = 0; i < count; i++) {
      this.emit({
        x: x + 0.25 + Math.random() * 0.5,
        y: y + 0.25 + Math.random() * 0.5,
        z: z + 0.25 + Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 3.8,
        vy: 1.5 + Math.random() * 3.4,
        vz: (Math.random() - 0.5) * 3.8,
        size: 0.09 + Math.random() * 0.08,
        maxAge: 0.45 + Math.random() * 0.35,
        gravity: 16,
        hex: baseHex,
      });
    }
  }

  public spawnBlockBreakBurst(x: number, y: number, z: number, blockId: number): void {
    this.spawnBlockChips(x, y, z, blockId, 24);
  }

  public spawnExplosionBurst(cx: number, cy: number, cz: number): void {
    for (let i = 0; i < 68; i++) {
      const fire = i % 3 === 0 ? 0xf97316 : i % 3 === 1 ? 0xfef08a : 0x475569;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 3 + Math.random() * 11;
      this.emit({
        x: cx + (Math.random() - 0.5) * 0.8,
        y: cy + (Math.random() - 0.5) * 0.8,
        z: cz + (Math.random() - 0.5) * 0.8,
        vx: Math.sin(phi) * Math.cos(theta) * speed,
        vy: Math.abs(Math.cos(phi)) * speed + 2,
        vz: Math.sin(phi) * Math.sin(theta) * speed,
        size: 0.18 + Math.random() * 0.24,
        maxAge: 0.6 + Math.random() * 0.75,
        gravity: i % 3 === 2 ? 3 : 12,
        hex: fire,
      });
    }
  }

  private emit(cfg: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    size: number;
    maxAge: number;
    gravity: number;
    hex: number;
  }): void {
    let slot = this.particles.find((p) => !p.active);
    if (!slot) {
      slot = this.particles[Math.floor(Math.random() * this.particles.length)]!;
    }
    slot.active = true;
    slot.x = cfg.x;
    slot.y = cfg.y;
    slot.z = cfg.z;
    slot.vx = cfg.vx;
    slot.vy = cfg.vy;
    slot.vz = cfg.vz;
    slot.size = cfg.size;
    slot.age = 0;
    slot.maxAge = cfg.maxAge;
    slot.gravity = cfg.gravity;
    slot.color.setHex(cfg.hex).offsetHSL(0, 0, (Math.random() - 0.5) * 0.14);
  }

  public spawnDroppedItem(
    x: number,
    y: number,
    z: number,
    itemId: number,
    count = 1,
    durability?: number,
    pickupDelay = 0.35,
    vx = (Math.random() - 0.5) * 2.2,
    vy = 3.4,
    vz = (Math.random() - 0.5) * 2.2
  ): void {
    if (itemId <= 0 || count <= 0) return;

    const mesh = this.createItem3DMesh(itemId);
    mesh.position.set(x, y, z);
    this.dropsGroup.add(mesh);

    this.drops.push({
      id: this.nextDropId++,
      itemId,
      count,
      durability,
      x,
      y,
      z,
      vx,
      vy,
      vz,
      age: 0,
      pickupDelay,
      mesh,
    });
  }

  public createItem3DMesh(itemId: number): THREE.Mesh {
    const def = getBlockOrItem(itemId);
    if (def.isBlock && def.renderType !== 'cross' && def.renderType !== 'torch') {
      let geo = this.itemMeshGeoCache.get(itemId);
      if (!geo) {
        geo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
        const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute;
        // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
        const faceTiles = [
          def.faces.east,
          def.faces.west,
          def.faces.top,
          def.faces.bottom,
          def.faces.south,
          def.faces.north,
        ];
        for (let f = 0; f < 6; f++) {
          const [u0, vb, u1, vt] = getTileUVRect(faceTiles[f]!);
          const base = f * 4;
          uvAttr.setXY(base + 0, u0, vt);
          uvAttr.setXY(base + 1, u1, vt);
          uvAttr.setXY(base + 2, u0, vb);
          uvAttr.setXY(base + 3, u1, vb);
        }
        uvAttr.needsUpdate = true;
        this.itemMeshGeoCache.set(itemId, geo);
      }
      const mat = new THREE.MeshLambertMaterial({
        map: this.atlas.diffuseTexture,
        alphaTest: 0.3,
      });
      return new THREE.Mesh(geo, mat);
    }

    // Non-block tool/food/cross item: textured 2D/3D sprite quad using cached generated icon
    let tex = this.itemSpriteTexCache.get(itemId);
    if (!tex) {
      const iconUrl = this.atlas.getItemIcon(itemId);
      tex = new THREE.TextureLoader().load(iconUrl);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.itemSpriteTexCache.set(itemId, tex);
    }
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(this.planeGeo, mat);
  }

  public update(
    dt: number,
    isSolidAt: (wx: number, wy: number, wz: number) => boolean,
    playerFeetPos: THREE.Vector3,
    onCollectDrop: (drop: DroppedItemEntity) => boolean
  ): void {
    // 1. Update instanced voxel particles
    let anyChanged = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i]!;
      if (!p.active) continue;
      anyChanged = true;

      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      p.vy -= p.gravity * dt;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const nz = p.z + p.vz * dt;

      if (isSolidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        p.vy = 0;
        p.vx *= 0.65;
        p.vz *= 0.65;
      } else {
        p.x = nx;
        p.y = ny;
        p.z = nz;
      }

      const lifeLeft = 1.0 - p.age / p.maxAge;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(p.size * (0.4 + 0.6 * lifeLeft));
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
      this.instancedMesh.setColorAt(i, p.color);
    }

    if (anyChanged) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
      if (this.instancedMesh.instanceColor) {
        this.instancedMesh.instanceColor.needsUpdate = true;
      }
    }

    // 2. Update floating magnetic item drops
    const targetX = playerFeetPos.x;
    const targetY = playerFeetPos.y + 0.85;
    const targetZ = playerFeetPos.z;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      d.age += dt;
      if (d.pickupDelay > 0) d.pickupDelay -= dt;

      if (d.age > 300) {
        this.removeDropAt(i);
        continue;
      }

      d.vy -= 18 * dt;
      const nextY = d.y + d.vy * dt;
      if (isSolidAt(Math.floor(d.x), Math.floor(nextY - 0.16), Math.floor(d.z))) {
        d.y = Math.floor(nextY - 0.16) + 1.16;
        d.vy = 0;
        d.vx *= 0.82;
        d.vz *= 0.82;
      } else {
        d.y = nextY;
      }

      const nextX = d.x + d.vx * dt;
      if (!isSolidAt(Math.floor(nextX), Math.floor(d.y), Math.floor(d.z))) {
        d.x = nextX;
      } else {
        d.vx = 0;
      }

      const nextZ = d.z + d.vz * dt;
      if (!isSolidAt(Math.floor(d.x), Math.floor(d.y), Math.floor(nextZ))) {
        d.z = nextZ;
      } else {
        d.vz = 0;
      }

      // Magnetic pull toward player when within 2.5 blocks
      if (d.pickupDelay <= 0) {
        const dx = targetX - d.x;
        const dy = targetY - d.y;
        const dz = targetZ - d.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 0.85) {
          if (onCollectDrop(d)) {
            this.removeDropAt(i);
            continue;
          }
        } else if (dist < 2.6) {
          const pull = (1.0 - dist / 2.6) * 14.0;
          d.x += (dx / dist) * pull * dt;
          d.y += (dy / dist) * pull * dt;
          d.z += (dz / dist) * pull * dt;
        }
      }

      d.mesh.position.set(d.x, d.y + Math.sin(d.age * 3.2) * 0.08, d.z);
      d.mesh.rotation.y = d.age * 2.1;
    }
  }

  public clearAll(): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      this.removeDropAt(i);
    }
  }

  private removeDropAt(index: number): void {
    const d = this.drops[index];
    if (!d) return;
    this.dropsGroup.remove(d.mesh);
    (d.mesh.material as THREE.Material).dispose();
    this.drops.splice(index, 1);
  }
}
