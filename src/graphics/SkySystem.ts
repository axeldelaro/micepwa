import * as THREE from 'three';

export class SkySystem {
  public readonly group = new THREE.Group();
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;

  private readonly sunMesh: THREE.Mesh;
  private readonly moonMesh: THREE.Mesh;
  private readonly starsPoints: THREE.Points;
  private readonly cloudsMesh: THREE.InstancedMesh;
  private readonly skyDome: THREE.Mesh;
  private readonly skyDomeUniforms: {
    uTopColor: THREE.IUniform<THREE.Color>;
    uHorizonColor: THREE.IUniform<THREE.Color>;
    uSunsetGlow: THREE.IUniform<number>;
    uSunDir: THREE.IUniform<THREE.Vector3>;
  };

  /** 0..24000 ticks (6000 = Noon, 12000 = Sunset, 18000 = Midnight, 0/24000 = Sunrise) */
  public timeOfDay = 4200;
  public sunBrightness = 1.0;
  public readonly sunDirection = new THREE.Vector3(0.3, 0.9, 0.2);
  public readonly currentSkyColor = new THREE.Color(0x78b9ff);
  public readonly currentFogColor = new THREE.Color(0x9bcaff);
  public readonly currentSunColor = new THREE.Color(0xfff5dc);

  private readonly cloudOffsets: Array<{ x: number; z: number; sx: number; sz: number }> = [];
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    // 1. Atmospheric Sky Dome (used seamlessly in both modes; richer gradient in Ultra)
    this.skyDomeUniforms = {
      uTopColor: { value: new THREE.Color(0x3b82f6) },
      uHorizonColor: { value: new THREE.Color(0x9bd2ff) },
      uSunsetGlow: { value: 0.0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    };

    const domeGeo = new THREE.SphereGeometry(280, 24, 16);
    const domeMat = new THREE.ShaderMaterial({
      uniforms: this.skyDomeUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform float uSunsetGlow;
        uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.62));
          float sunAlign = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
          vec3 sunsetCol = vec3(1.0, 0.48, 0.18) * pow(sunAlign, 5.0) * uSunsetGlow;
          gl_FragColor = vec4(col + sunsetCol, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(domeGeo, domeMat);
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -10;
    this.group.add(this.skyDome);

    // 2. Cubical Pixel-Art Sun & Moon in Orbit
    const sunCanvas = document.createElement('canvas');
    sunCanvas.width = 16;
    sunCanvas.height = 16;
    const sCtx = sunCanvas.getContext('2d')!;
    sCtx.fillStyle = '#fde047';
    sCtx.fillRect(0, 0, 16, 16);
    sCtx.fillStyle = '#fef9c3';
    sCtx.fillRect(3, 3, 10, 10);
    const sunTex = new THREE.CanvasTexture(sunCanvas);
    sunTex.magFilter = THREE.NearestFilter;
    sunTex.colorSpace = THREE.SRGBColorSpace;

    this.sunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(22, 22, 22),
      new THREE.MeshBasicMaterial({ map: sunTex, fog: false })
    );
    this.group.add(this.sunMesh);

    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 16;
    moonCanvas.height = 16;
    const mCtx = moonCanvas.getContext('2d')!;
    mCtx.fillStyle = '#cbd5e1';
    mCtx.fillRect(0, 0, 16, 16);
    mCtx.fillStyle = '#f8fafc';
    mCtx.fillRect(2, 2, 11, 11);
    mCtx.fillStyle = '#94a3b8';
    mCtx.fillRect(4, 5, 3, 3);
    mCtx.fillRect(9, 9, 4, 3);
    const moonTex = new THREE.CanvasTexture(moonCanvas);
    moonTex.magFilter = THREE.NearestFilter;
    moonTex.colorSpace = THREE.SRGBColorSpace;

    this.moonMesh = new THREE.Mesh(
      new THREE.BoxGeometry(18, 18, 18),
      new THREE.MeshBasicMaterial({ map: moonTex, fog: false })
    );
    this.group.add(this.moonMesh);

    // 3. Night Starfield
    const starCount = 380;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.08 + Math.random() * 0.92);
      const r = 245;
      starPositions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starsPoints = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        fog: false,
      })
    );
    this.group.add(this.starsPoints);

    // 4. Volumetric 3D Pixelated Clouds
    const cloudCount = 42;
    const cloudGeo = new THREE.BoxGeometry(1, 4.2, 1);
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
    });
    this.cloudsMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
    this.cloudsMesh.frustumCulled = false;

    for (let i = 0; i < cloudCount; i++) {
      const angle = (i / cloudCount) * Math.PI * 2 + (i % 5) * 0.3;
      const dist = 25 + ((i * 37) % 175);
      this.cloudOffsets.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        sx: 16 + ((i * 13) % 24),
        sz: 12 + ((i * 19) % 20),
      });
    }
    scene.add(this.cloudsMesh);

    // 5. Directional Sun/Moon Shadow Light + Hemisphere Fill
    this.sunLight = new THREE.DirectionalLight(0xfff5dc, 1.9);
    this.sunLight.castShadow = false;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 210;
    const shadowHalf = 58;
    this.sunLight.shadow.camera.left = -shadowHalf;
    this.sunLight.shadow.camera.right = shadowHalf;
    this.sunLight.shadow.camera.top = shadowHalf;
    this.sunLight.shadow.camera.bottom = -shadowHalf;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.03;

    this.hemiLight = new THREE.HemisphereLight(0x9ecbff, 0x475569, 0.72);

    scene.add(this.group);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);
    scene.add(this.hemiLight);
  }

  public update(dt: number, elapsedSec: number, playerPos: THREE.Vector3, advanceClock = true): void {
    if (advanceClock) {
      // Full day/night cycle every 12 minutes (720s -> 33.33 ticks/sec)
      this.timeOfDay = (this.timeOfDay + dt * 33.33) % 24000;
    }

    // Orbit angle: 0 = sunrise (+X), 6000 = noon (+Y), 12000 = sunset (-X), 18000 = midnight (-Y)
    const phase = (this.timeOfDay / 24000) * Math.PI * 2;
    const orbitX = Math.cos(phase);
    const orbitY = Math.sin(phase);
    const orbitZ = 0.26;

    this.sunDirection.set(orbitX, orbitY, orbitZ).normalize();

    // Follow player horizontally for skybox & orbital bodies
    this.group.position.set(playerPos.x, playerPos.y * 0.15, playerPos.z);

    const orbitRadius = 215;
    this.sunMesh.position.set(
      this.sunDirection.x * orbitRadius,
      this.sunDirection.y * orbitRadius,
      this.sunDirection.z * orbitRadius
    );
    this.sunMesh.lookAt(this.group.position);

    this.moonMesh.position.set(
      -this.sunDirection.x * orbitRadius,
      -this.sunDirection.y * orbitRadius,
      -this.sunDirection.z * orbitRadius
    );
    this.moonMesh.lookAt(this.group.position);

    // Day/Sunset/Night color & brightness curves
    const sunElev = this.sunDirection.y; // -1..1
    this.sunBrightness = THREE.MathUtils.clamp((sunElev + 0.18) / 0.65, 0.08, 1.0);
    const sunsetFactor = Math.max(0, 1.0 - Math.abs(sunElev - 0.04) * 4.2);
    const nightFactor = THREE.MathUtils.clamp((-sunElev + 0.05) * 2.5, 0, 1);

    const dayTop = new THREE.Color(0x3882f6);
    const dayHorizon = new THREE.Color(0x9bd2ff);
    const sunsetHorizon = new THREE.Color(0xf97316);
    const nightTop = new THREE.Color(0x050914);
    const nightHorizon = new THREE.Color(0x0f1a2e);

    const topCol = dayTop.clone().lerp(nightTop, nightFactor);
    const horizCol = dayHorizon
      .clone()
      .lerp(sunsetHorizon, sunsetFactor * 0.72)
      .lerp(nightHorizon, nightFactor);

    this.skyDomeUniforms.uTopColor.value.copy(topCol);
    this.skyDomeUniforms.uHorizonColor.value.copy(horizCol);
    this.skyDomeUniforms.uSunsetGlow.value = sunsetFactor * 0.9;
    this.skyDomeUniforms.uSunDir.value.copy(this.sunDirection);

    this.currentSkyColor.copy(topCol).lerp(horizCol, 0.5);
    this.currentFogColor.copy(horizCol);

    const noonSun = new THREE.Color(0xfff6df);
    const sunsetSun = new THREE.Color(0xff944d);
    const moonCol = new THREE.Color(0x6488b8);
    this.currentSunColor
      .copy(noonSun)
      .lerp(sunsetSun, sunsetFactor * 0.85)
      .lerp(moonCol, nightFactor);

    // Stabilize DirectionalLight shadow camera in 1-unit steps around player
    const activeDir = sunElev >= -0.08 ? this.sunDirection : this.sunDirection.clone().negate();
    const snapX = Math.round(playerPos.x);
    const snapZ = Math.round(playerPos.z);
    this.sunLight.target.position.set(snapX, 48, snapZ);
    this.sunLight.position.set(
      snapX + activeDir.x * 110,
      48 + Math.max(0.22, activeDir.y) * 110,
      snapZ + activeDir.z * 110
    );
    this.sunLight.color.copy(this.currentSunColor);
    this.sunLight.intensity = sunElev >= -0.08 ? 0.4 + this.sunBrightness * 1.85 : 0.35;

    this.hemiLight.color.copy(this.currentSkyColor);
    this.hemiLight.groundColor.setHex(nightFactor > 0.5 ? 0x111827 : 0x475569);
    this.hemiLight.intensity = 0.25 + this.sunBrightness * 0.6;

    // Stars visibility
    const starMat = this.starsPoints.material as THREE.PointsMaterial;
    starMat.opacity = nightFactor * 0.95;

    // Drift 3D volumetric clouds smoothly around player
    const cloudMat = this.cloudsMesh.material as THREE.MeshLambertMaterial;
    cloudMat.color.setRGB(
      0.22 + 0.78 * this.sunBrightness,
      0.22 + 0.76 * this.sunBrightness,
      0.28 + 0.72 * this.sunBrightness
    );

    const wrapSpan = 360;
    for (let i = 0; i < this.cloudOffsets.length; i++) {
      const c = this.cloudOffsets[i]!;
      const relX = ((((c.x + elapsedSec * 1.8 - playerPos.x) % wrapSpan) + wrapSpan) % wrapSpan) - wrapSpan * 0.5;
      const relZ = ((((c.z + elapsedSec * 0.4 - playerPos.z) % wrapSpan) + wrapSpan) % wrapSpan) - wrapSpan * 0.5;
      this.dummy.position.set(playerPos.x + relX, 108 + (i % 3) * 1.5, playerPos.z + relZ);
      this.dummy.scale.set(c.sx, 1, c.sz);
      this.dummy.updateMatrix();
      this.cloudsMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.cloudsMesh.instanceMatrix.needsUpdate = true;
  }
}
