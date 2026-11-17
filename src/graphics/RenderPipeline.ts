import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { ProceduralAtlas } from './ProceduralAtlas';
import type { SkySystem } from './SkySystem';
import { createUltraWaterMaterial, type WaterShaderUniforms } from './WaterShader';

export type GraphicsMode = 'classic' | 'ultra' | 'photoreal';

export const GRAPHICS_MODE_LABELS: Record<GraphicsMode, string> = {
  classic: '🎨 Classique Minecraft (60+ FPS)',
  ultra: '✨ Graphismes Élevés (Shaders PBR)',
  photoreal: '📸 Vue Réelle (Cinéma Photo-Réaliste HD)',
};

export interface ActiveWorldMaterials {
  opaque: THREE.Material;
  floraCutout: THREE.Material;
  water: THREE.Material;
  floraDepthMaterial: THREE.Material;
  castChunkShadows: boolean;
}

const CinemaRealismShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uSunScreenPos: { value: new THREE.Vector2(0.5, 0.8) },
    uSunVisible: { value: 0.0 },
    uLightning: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec2 uSunScreenPos;
    uniform float uSunVisible;
    uniform float uLightning;
    varying vec2 vUv;

    void main() {
      vec2 texel = 1.0 / max(uResolution, vec2(1.0));
      vec4 center = texture2D(tDiffuse, vUv);

      // Subtle adaptive micro-contrast sharpening for crisp 64x HD rock/grass detail
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
      vec3 blur = (n + s + e + w) * 0.25;
      vec3 col = center.rgb + (center.rgb - blur) * 0.28;

      // Atmospheric solar lens glare / warm sun halo when looking toward sun
      if (uSunVisible > 0.01) {
        float aspect = uResolution.x / max(1.0, uResolution.y);
        vec2 delta = (vUv - uSunScreenPos) * vec2(aspect, 1.0);
        float d = length(delta);
        float halo = exp(-d * 4.2) * 0.28 * uSunVisible;
        col += vec3(1.0, 0.86, 0.62) * halo;
      }

      // Storm lightning flash boost
      if (uLightning > 0.01) {
        col += vec3(0.45, 0.52, 0.68) * uLightning;
      }

      // Natural cinema S-curve & subtle optical vignette
      float distCenter = length(vUv - vec2(0.5));
      float vignette = smoothstep(0.95, 0.32, distCenter);
      col *= mix(0.84, 1.03, vignette);

      // Subtle vibrant saturation lift
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.12);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), center.a);
    }
  `,
};

export class RenderPipeline {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly atlas: ProceduralAtlas;
  public readonly sky: SkySystem;

  /** Dynamic OptiFine-style PointLight when holding Torch, Lantern, Glowstone, or Lava Bucket */
  public readonly dynamicHandLight: THREE.PointLight;

  private mode: GraphicsMode = 'photoreal';
  private resolutionScale = 1.0;
  private renderDistanceChunks = 6;
  private wetness = 0.0;
  private lightningFlash = 0.0;

  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly cinemaPass: ShaderPass;

  // Classic Mode Materials
  private readonly classicUniforms: {
    uMap: THREE.IUniform<THREE.Texture>;
    uSunBrightness: THREE.IUniform<number>;
    uFogColor: THREE.IUniform<THREE.Color>;
    uFogNear: THREE.IUniform<number>;
    uFogFar: THREE.IUniform<number>;
    uTime: THREE.IUniform<number>;
  };
  private readonly classicOpaqueMat: THREE.ShaderMaterial;
  private readonly classicFloraMat: THREE.ShaderMaterial;
  private readonly classicWaterMat: THREE.ShaderMaterial;

  // Ultra & Photoreal PBR Materials
  private readonly ultraSharedUniforms = {
    uTime: { value: 0 },
    uSunBrightness: { value: 1.0 },
    uWetness: { value: 0.0 },
  };
  private readonly ultraOpaqueMat: THREE.MeshStandardMaterial;
  private readonly ultraFloraMat: THREE.MeshStandardMaterial;
  private readonly ultraWaterMat: THREE.ShaderMaterial;
  private readonly ultraWaterUniforms: WaterShaderUniforms;
  private readonly floraDepthMat: THREE.MeshDepthMaterial;

  private readonly modeListeners: Array<(mats: ActiveWorldMaterials) => void> = [];

  constructor(
    container: HTMLElement,
    atlas: ProceduralAtlas,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sky: SkySystem
  ) {
    this.atlas = atlas;
    this.scene = scene;
    this.camera = camera;
    this.sky = sky;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.atlas.setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.scene.fog = new THREE.Fog(0x9bcaff, 48, 105);

    // Dynamic Held Torch / Lantern Light
    this.dynamicHandLight = new THREE.PointLight(0xffb454, 0, 15, 1.6);
    this.scene.add(this.dynamicHandLight);

    // 1. Classic Materials
    this.classicUniforms = {
      uMap: { value: this.atlas.diffuseTexture },
      uSunBrightness: { value: 1.0 },
      uFogColor: { value: new THREE.Color(0x9bcaff) },
      uFogNear: { value: 48 },
      uFogFar: { value: 105 },
      uTime: { value: 0 },
    };

    this.classicOpaqueMat = this.buildClassicShaderMaterial(false, false);
    this.classicFloraMat = this.buildClassicShaderMaterial(true, false);
    this.classicWaterMat = this.buildClassicShaderMaterial(false, true);

    // 2. Ultra / Photoreal PBR Materials
    this.ultraOpaqueMat = this.buildUltraStandardMaterial(false);
    this.ultraFloraMat = this.buildUltraStandardMaterial(true);

    const waterBundle = createUltraWaterMaterial(this.atlas.diffuseTexture);
    this.ultraWaterMat = waterBundle.material;
    this.ultraWaterUniforms = waterBundle.uniforms;

    this.floraDepthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: this.atlas.diffuseTexture,
      alphaTest: 0.45,
    });

    // 3. Post-Processing Pipeline (RenderPass -> UnrealBloomPass -> CinemaRealismPass -> OutputPass)
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.34,
      0.55,
      0.82
    );
    this.cinemaPass = new ShaderPass(CinemaRealismShader);
    const outputPass = new OutputPass();

    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.cinemaPass);
    this.composer.addPass(outputPass);

    this.applyModeSettings();
    window.addEventListener('resize', () => this.handleResize());
  }

  public setWeatherParams(wetness: number, lightningFlash: number): void {
    this.wetness = wetness;
    this.lightningFlash = lightningFlash;
  }

  public updateDynamicHandLight(pos: THREE.Vector3, emissionLevel: number): void {
    this.dynamicHandLight.position.copy(pos);
    const targetIntensity = this.mode === 'classic' ? 0 : (emissionLevel / 15) * 3.4;
    this.dynamicHandLight.intensity = THREE.MathUtils.lerp(
      this.dynamicHandLight.intensity,
      targetIntensity,
      0.25
    );
  }

  private buildClassicShaderMaterial(alphaCutout: boolean, isWater: boolean): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: this.classicUniforms,
      transparent: isWater,
      depthWrite: !isWater,
      side: alphaCutout || isWater ? THREE.DoubleSide : THREE.FrontSide,
      vertexShader: /* glsl */ `
        attribute vec4 aVoxelLight;
        uniform float uTime;

        varying vec2 vUv;
        varying vec3 vNormalObj;
        varying vec4 vVoxelLight;
        varying float vCamDist;

        void main() {
          vUv = uv;
          vNormalObj = normal;
          vVoxelLight = aVoxelLight;

          vec3 pos = position;
          if (${isWater ? 'true' : 'false'} && aVoxelLight.w > 0.5) {
            vec4 wp = modelMatrix * vec4(pos, 1.0);
            pos.y += sin(wp.x * 1.2 + uTime * 2.0 + wp.z * 0.8) * 0.025;
          }

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          vCamDist = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uSunBrightness;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;

        varying vec2 vUv;
        varying vec3 vNormalObj;
        varying vec4 vVoxelLight;
        varying float vCamDist;

        void main() {
          vec4 texel = texture2D(uMap, vUv);
          ${alphaCutout ? 'if (texel.a < 0.45) discard;' : ''}

          float dirShade = 1.0;
          if (vNormalObj.y < -0.5) dirShade = 0.56;
          else if (abs(vNormalObj.z) > 0.5) dirShade = 0.86;
          else if (abs(vNormalObj.x) > 0.5) dirShade = 0.74;

          float ao = vVoxelLight.x;
          float skyLevel = vVoxelLight.y * uSunBrightness;
          float blkLevel = vVoxelLight.z;

          float baseLight = max(0.055, max(skyLevel, blkLevel));
          vec3 lightTint = vec3(baseLight);
          if (blkLevel > 0.02) {
            float warm = pow(blkLevel, 1.35);
            lightTint = max(lightTint, vec3(warm * 1.16, warm * 0.94, warm * 0.68));
          }

          vec3 litRgb = texel.rgb * dirShade * ao * lightTint;
          float fogFactor = smoothstep(uFogNear, uFogFar, vCamDist);
          litRgb = mix(litRgb, uFogColor, fogFactor);

          float outAlpha = ${isWater ? '0.76' : '1.0'};
          gl_FragColor = vec4(litRgb, outAlpha);
        }
      `,
    });
  }

  private buildUltraStandardMaterial(alphaCutout: boolean): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      map: this.atlas.diffuseTexture,
      normalMap: this.atlas.normalTexture,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: this.atlas.ormTexture,
      metalnessMap: this.atlas.ormTexture,
      emissiveMap: this.atlas.emissiveTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 2.1,
      roughness: 1.0,
      metalness: 1.0,
      alphaTest: alphaCutout ? 0.45 : 0.0,
      side: alphaCutout ? THREE.DoubleSide : THREE.FrontSide,
    });

    mat.customProgramCacheKey = () => (alphaCutout ? 'voxel-ultra-flora-v2' : 'voxel-ultra-opaque-v2');

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.ultraSharedUniforms.uTime;
      shader.uniforms.uSunBrightness = this.ultraSharedUniforms.uSunBrightness;
      shader.uniforms.uWetness = this.ultraSharedUniforms.uWetness;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          attribute vec4 aVoxelLight;
          varying vec4 vVoxelLight;
          uniform float uTime;
          `
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `
          #include <begin_vertex>
          vVoxelLight = aVoxelLight;
          if (aVoxelLight.w > 0.01) {
            vec4 wp = modelMatrix * vec4(transformed, 1.0);
            float swayX = sin(uTime * 2.35 + wp.x * 0.65 + wp.z * 0.55 + wp.y * 0.35) * 0.065 * aVoxelLight.w;
            float swayZ = cos(uTime * 1.85 + wp.z * 0.72 - wp.x * 0.42) * 0.052 * aVoxelLight.w;
            transformed.x += swayX;
            transformed.z += swayZ;
          }
          `
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          varying vec4 vVoxelLight;
          uniform float uSunBrightness;
          uniform float uWetness;
          `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `
          #include <roughnessmap_fragment>
          // Wet glistening stone & grass reflections during rain/storms on sky-exposed blocks
          if (uWetness > 0.01 && vVoxelLight.y > 0.55) {
            roughnessFactor = mix(roughnessFactor, 0.14, uWetness * 0.75);
          }
          `
        )
        .replace(
          '#include <aomap_fragment>',
          /* glsl */ `
          #include <aomap_fragment>
          float voxelAO = pow(vVoxelLight.x, 1.15);
          float skyMask = clamp(0.045 + vVoxelLight.y * 0.955, 0.0, 1.0);
          float directMask = clamp((vVoxelLight.y - 0.12) * 1.4, 0.0, 1.0);
          reflectedLight.indirectDiffuse *= voxelAO * skyMask;
          reflectedLight.directDiffuse *= voxelAO * directMask;
          reflectedLight.directSpecular *= directMask;
          float torchWarm = pow(vVoxelLight.z, 1.32);
          reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.38, 0.98, 0.60) * torchWarm * voxelAO * 1.28;
          `
        );
    };

    return mat;
  }

  public getMode(): GraphicsMode {
    return this.mode;
  }

  public setMode(nextMode: GraphicsMode): void {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    this.applyModeSettings();
    const mats = this.getActiveMaterials();
    for (const cb of this.modeListeners) {
      cb(mats);
    }
  }

  public cycleMode(): GraphicsMode {
    const order: GraphicsMode[] = ['photoreal', 'ultra', 'classic'];
    const next = order[(order.indexOf(this.mode) + 1) % order.length]!;
    this.setMode(next);
    return next;
  }

  public getResolutionScale(): number {
    return this.resolutionScale;
  }

  public setResolutionScale(scale: number): void {
    this.resolutionScale = THREE.MathUtils.clamp(scale, 0.5, 1.0);
    this.handleResize();
  }

  public setFogDistance(renderDistChunks: number): void {
    this.renderDistanceChunks = renderDistChunks;
    const far = Math.max(52, renderDistChunks * 16 - 2);
    const near = far * (this.mode === 'photoreal' ? 0.44 : 0.54);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = near;
      this.scene.fog.far = far;
    }
    this.classicUniforms.uFogNear.value = near;
    this.classicUniforms.uFogFar.value = far;
    this.ultraWaterUniforms.uFogNear.value = near;
    this.ultraWaterUniforms.uFogFar.value = far;
  }

  public getActiveMaterials(): ActiveWorldMaterials {
    if (this.mode === 'ultra' || this.mode === 'photoreal') {
      return {
        opaque: this.ultraOpaqueMat,
        floraCutout: this.ultraFloraMat,
        water: this.ultraWaterMat,
        floraDepthMaterial: this.floraDepthMat,
        castChunkShadows: true,
      };
    }
    return {
      opaque: this.classicOpaqueMat,
      floraCutout: this.classicFloraMat,
      water: this.classicWaterMat,
      floraDepthMaterial: this.floraDepthMat,
      castChunkShadows: false,
    };
  }

  public onMaterialsChanged(listener: (mats: ActiveWorldMaterials) => void): void {
    this.modeListeners.push(listener);
  }

  private applyModeSettings(): void {
    const isAdvanced = this.mode === 'ultra' || this.mode === 'photoreal';
    const isPhotoreal = this.mode === 'photoreal';

    this.renderer.shadowMap.enabled = isAdvanced;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sky.sunLight.castShadow = isAdvanced;

    this.cinemaPass.enabled = isPhotoreal;
    this.bloomPass.strength = isPhotoreal ? 0.42 : 0.34;
    this.ultraOpaqueMat.normalScale.setScalar(isPhotoreal ? 1.35 : 0.9);
    this.ultraFloraMat.normalScale.setScalar(isPhotoreal ? 1.15 : 0.85);

    if (isAdvanced) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = isPhotoreal ? 1.12 : 1.06;
    } else {
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1.0;
    }

    this.handleResize();
  }

  public handleResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();

    const baseDpr = Math.min(window.devicePixelRatio || 1, 2);
    const effectiveDpr = baseDpr * this.resolutionScale;
    this.renderer.setPixelRatio(effectiveDpr);
    this.renderer.setSize(w, h, false);

    this.composer.setPixelRatio(effectiveDpr);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w * effectiveDpr, h * effectiveDpr);
    (this.cinemaPass.uniforms['uResolution']!.value as THREE.Vector2).set(w * effectiveDpr, h * effectiveDpr);
  }

  public renderFrame(elapsedSec: number): void {
    const fogCol = this.sky.currentFogColor.clone();
    if (this.wetness > 0.05) {
      fogCol.lerp(new THREE.Color(0x475569), this.wetness * 0.45);
    }
    if (this.lightningFlash > 0.01) {
      fogCol.lerp(new THREE.Color(0xe2e8f0), this.lightningFlash * 0.7);
    }

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(fogCol);
    }

    this.classicUniforms.uTime.value = elapsedSec;
    this.classicUniforms.uSunBrightness.value = this.sky.sunBrightness;
    this.classicUniforms.uFogColor.value.copy(fogCol);

    this.ultraSharedUniforms.uTime.value = elapsedSec;
    this.ultraSharedUniforms.uSunBrightness.value = this.sky.sunBrightness;
    this.ultraSharedUniforms.uWetness.value = this.wetness;

    this.ultraWaterUniforms.uTime.value = elapsedSec;
    this.ultraWaterUniforms.uSunDir.value.copy(this.sky.sunDirection);
    this.ultraWaterUniforms.uSunColor.value.copy(this.sky.currentSunColor);
    this.ultraWaterUniforms.uSkyColor.value.copy(this.sky.currentSkyColor);
    this.ultraWaterUniforms.uFogColor.value.copy(fogCol);
    this.ultraWaterUniforms.uSunBrightness.value = this.sky.sunBrightness;

    // Project Sun position to screen UV for Photorealistic Solar Glare pass
    if (this.mode === 'photoreal') {
      const sunWorld = this.camera.position.clone().addScaledVector(this.sky.sunDirection, 200);
      const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const facing = camFwd.dot(this.sky.sunDirection);
      const sunProj = sunWorld.project(this.camera);
      (this.cinemaPass.uniforms['uSunScreenPos']!.value as THREE.Vector2).set(
        sunProj.x * 0.5 + 0.5,
        sunProj.y * 0.5 + 0.5
      );
      this.cinemaPass.uniforms['uSunVisible']!.value =
        this.sky.sunDirection.y > 0.02 && facing > 0.15 ? facing * this.sky.sunBrightness : 0.0;
      this.cinemaPass.uniforms['uLightning']!.value = this.lightningFlash;
    }

    this.setFogDistance(this.renderDistanceChunks);

    if (this.mode === 'ultra' || this.mode === 'photoreal') {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
