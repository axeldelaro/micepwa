import * as THREE from 'three';

export interface WaterShaderUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uSunDir: THREE.IUniform<THREE.Vector3>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uSkyColor: THREE.IUniform<THREE.Color>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogNear: THREE.IUniform<number>;
  uFogFar: THREE.IUniform<number>;
  uSunBrightness: THREE.IUniform<number>;
  uDiffuseMap: THREE.IUniform<THREE.Texture>;
}

/**
 * Realistic GLSL Water Material for "Graphismes Élevés (Ultra Shaders PBR)" mode:
 * - Multi-wave Gerstner/Sine vertex displacement
 * - Analytical wave normal perturbation + Fresnel sky reflection
 * - Blinn-Phong solar specular glints
 * - Shoreline coastal foam using Voxel AO proximity (aVoxelLight.x)
 */
export function createUltraWaterMaterial(diffuseAtlas: THREE.Texture): {
  material: THREE.ShaderMaterial;
  uniforms: WaterShaderUniforms;
} {
  const uniforms: WaterShaderUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
    uSunColor: { value: new THREE.Color(0xfff4d6) },
    uSkyColor: { value: new THREE.Color(0x6fb7ff) },
    uFogColor: { value: new THREE.Color(0x8ec5ff) },
    uFogNear: { value: 45 },
    uFogFar: { value: 120 },
    uSunBrightness: { value: 1.0 },
    uDiffuseMap: { value: diffuseAtlas },
  };

  const vertexShader = /* glsl */ `
    attribute vec4 aVoxelLight;
    uniform float uTime;

    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    varying vec4 vVoxelLight;
    varying float vWaveHeight;
    varying float vCamDist;

    void main() {
      vUv = uv;
      vVoxelLight = aVoxelLight;

      vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
      float topSurface = aVoxelLight.w; // 1.0 on exposed water top faces

      float w1 = sin(worldPos4.x * 1.35 + uTime * 2.2 + worldPos4.z * 0.45) * 0.045;
      float w2 = cos(worldPos4.z * 1.65 - uTime * 1.85 + worldPos4.x * 0.55) * 0.035;
      float w3 = sin((worldPos4.x + worldPos4.z) * 2.8 + uTime * 3.1) * 0.018;
      float disp = (w1 + w2 + w3) * topSurface;

      worldPos4.y += disp;
      vWaveHeight = disp;
      vWorldPos = worldPos4.xyz;

      // Analytical wave slope normal for realistic sun glints
      float dx = (cos(worldPos4.x * 1.35 + uTime * 2.2 + worldPos4.z * 0.45) * 1.35 * 0.045 +
                  cos((worldPos4.x + worldPos4.z) * 2.8 + uTime * 3.1) * 2.8 * 0.018) * topSurface;
      float dz = (-sin(worldPos4.z * 1.65 - uTime * 1.85 + worldPos4.x * 0.55) * 1.65 * 0.035 +
                  cos((worldPos4.x + worldPos4.z) * 2.8 + uTime * 3.1) * 2.8 * 0.018) * topSurface;

      vec3 baseNormal = normalize(mat3(modelMatrix) * normal);
      vNormalW = topSurface > 0.5 ? normalize(vec3(-dx * 2.2, 1.0, -dz * 2.2)) : baseNormal;

      vec4 mvPos = viewMatrix * worldPos4;
      vCamDist = -mvPos.z;
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyColor;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform float uSunBrightness;
    uniform sampler2D uDiffuseMap;

    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    varying vec4 vVoxelLight;
    varying float vWaveHeight;
    varying float vCamDist;

    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      vec3 N = normalize(vNormalW);

      // Subtle animated ripple perturbation
      float r1 = sin(vWorldPos.x * 5.2 + uTime * 3.2) * cos(vWorldPos.z * 5.2 - uTime * 2.7);
      N = normalize(N + vec3(r1 * 0.08, 0.0, -r1 * 0.08));

      // Fresnel Schlick approximation
      float cosTheta = clamp(dot(N, viewDir), 0.0, 1.0);
      float fresnel = 0.08 + 0.82 * pow(1.0 - cosTheta, 3.6);

      // Base deep/shallow turquoise-azure water tint + atlas detail
      vec4 texSample = texture2D(uDiffuseMap, vUv);
      vec3 deepWater = vec3(0.03, 0.24, 0.46);
      vec3 shallowWater = vec3(0.08, 0.52, 0.72);
      vec3 baseWater = mix(deepWater, shallowWater, clamp(0.45 + vWaveHeight * 5.0, 0.0, 1.0));
      baseWater = mix(baseWater, texSample.rgb, 0.18);

      // Smooth voxel sky + torch lighting
      float skyLit = clamp(0.12 + vVoxelLight.y * uSunBrightness * 0.92, 0.08, 1.05);
      vec3 torchGlow = vec3(1.2, 0.88, 0.52) * pow(vVoxelLight.z, 1.4);
      vec3 litWater = baseWater * skyLit + baseWater * torchGlow;

      // Sky reflection via Fresnel
      vec3 reflColor = mix(litWater, uSkyColor * (0.35 + 0.65 * uSunBrightness), fresnel * 0.72);

      // Solar Specular Highlight (Blinn-Phong)
      vec3 halfVec = normalize(uSunDir + viewDir);
      float spec = pow(max(dot(N, halfVec), 0.0), 96.0) * max(0.0, uSunDir.y + 0.15);
      vec3 sunGlint = uSunColor * spec * 1.65 * vVoxelLight.y;

      // Coastal shoreline foam where adjacent solid blocks lower corner AO (vVoxelLight.x < 0.92)
      float shoreMask = clamp((0.92 - vVoxelLight.x) * 2.4, 0.0, 1.0);
      float foamPattern = sin(vWorldPos.x * 6.5 + uTime * 3.8) * cos(vWorldPos.z * 6.5 - uTime * 3.1) * 0.5 + 0.5;
      float foam = smoothstep(0.42, 0.78, shoreMask * (0.65 + 0.35 * foamPattern)) * vVoxelLight.w;
      vec3 foamColor = vec3(0.92, 0.97, 1.0) * skyLit;

      vec3 finalRgb = mix(reflColor + sunGlint, foamColor, foam * 0.78);
      float alpha = clamp(0.66 + fresnel * 0.24 + foam * 0.25, 0.62, 0.94);

      // Distance atmospheric fog
      float fogFactor = smoothstep(uFogNear, uFogFar, vCamDist);
      finalRgb = mix(finalRgb, uFogColor, fogFactor);

      gl_FragColor = vec4(finalRgb, alpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return { material, uniforms };
}
