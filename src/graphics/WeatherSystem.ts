import * as THREE from 'three';

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'storm';

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: '☀️ Ensoleillé / Clair',
  rain: '🌧️ Pluie Réaliste',
  snow: '❄️ Chutes de Neige',
  storm: '⛈️ Orage & Éclairs',
};

/**
 * Dynamic 3D Weather Engine (Rain streaks, Snowflakes, Wet PBR Ground factor & Storm Lightning).
 */
export class WeatherSystem {
  public currentWeather: WeatherKind = 'clear';
  public wetness = 0.0; // 0..1 smooth transition for wet specular reflections on terrain
  public lightningFlash = 0.0; // 0..1 sky flash intensity

  private readonly dropCount = 900;
  private readonly positions: Float32Array;
  private readonly points: THREE.Points;
  private readonly mat: THREE.PointsMaterial;
  private thunderTimer = 9.0;

  public onThunderBoom?: () => void;

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(this.dropCount * 3);
    for (let i = 0; i < this.dropCount; i++) {
      this.positions[i * 3 + 0] = (Math.random() - 0.5) * 44;
      this.positions[i * 3 + 1] = Math.random() * 34;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    this.mat = new THREE.PointsMaterial({
      color: 0xa5d8ff,
      size: 0.22,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.visible = false;
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  public setWeather(w: WeatherKind): void {
    this.currentWeather = w;
    this.points.visible = w !== 'clear';
    if (w === 'snow') {
      this.mat.color.setHex(0xffffff);
      this.mat.size = 0.26;
      this.mat.opacity = 0.88;
    } else {
      this.mat.color.setHex(0x93c5fd);
      this.mat.size = 0.18;
      this.mat.opacity = w === 'storm' ? 0.82 : 0.65;
    }
  }

  public cycleWeather(): WeatherKind {
    const order: WeatherKind[] = ['clear', 'rain', 'snow', 'storm'];
    const next = order[(order.indexOf(this.currentWeather) + 1) % order.length]!;
    this.setWeather(next);
    return next;
  }

  public update(dt: number, elapsedSec: number, playerPos: THREE.Vector3): void {
    const targetWet = this.currentWeather === 'rain' || this.currentWeather === 'storm' ? 1.0 : 0.0;
    this.wetness = THREE.MathUtils.lerp(this.wetness, targetWet, Math.min(1, dt * 0.6));

    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.5);
    }

    if (this.currentWeather === 'storm') {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = 6 + Math.random() * 11;
        this.lightningFlash = 1.0;
        this.onThunderBoom?.();
      }
    }

    if (!this.points.visible) return;

    const isSnow = this.currentWeather === 'snow';
    const fallSpeed = isSnow ? 4.2 : 24.0;
    const windX = isSnow ? Math.sin(elapsedSec * 0.9) * 1.4 : 2.5;

    for (let i = 0; i < this.dropCount; i++) {
      let x = this.positions[i * 3 + 0]! + windX * dt;
      let y = this.positions[i * 3 + 1]! - fallSpeed * dt;
      let z = this.positions[i * 3 + 2]!;

      if (y < playerPos.y - 10) {
        y = playerPos.y + 22 + Math.random() * 6;
        x = playerPos.x + (Math.random() - 0.5) * 44;
        z = playerPos.z + (Math.random() - 0.5) * 44;
      } else {
        if (x < playerPos.x - 22) x += 44;
        if (x > playerPos.x + 22) x -= 44;
        if (z < playerPos.z - 22) z += 44;
        if (z > playerPos.z + 22) z -= 44;
      }

      this.positions[i * 3 + 0] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
    }

    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
