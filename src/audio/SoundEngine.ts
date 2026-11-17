import type { SoundGroup } from '../blocks/BlockRegistry';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.65;
  private muted = false;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);

      // Shared 2-second white noise buffer for footsteps, mining, explosions, and wind
      const sampleRate = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, sampleRate * 2, sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.setupWindAmbience();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private setupWindAmbience(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 360;
    this.windFilter.Q.value = 2.8;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.015;

    src.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    src.start();
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
    this.setVolume(this.volume);
  }

  public updateAmbience(playerY: number, underwater: boolean): void {
    if (!this.ctx || !this.windGain || !this.windFilter) return;
    const t = this.ctx.currentTime;
    if (underwater) {
      this.windFilter.frequency.setTargetAtTime(140, t, 0.2);
      this.windGain.gain.setTargetAtTime(0.04, t, 0.2);
    } else {
      const altFactor = Math.max(0, Math.min(1, (playerY - 48) / 55));
      this.windFilter.frequency.setTargetAtTime(300 + altFactor * 480, t, 0.3);
      this.windGain.gain.setTargetAtTime(0.008 + altFactor * 0.035, t, 0.3);
    }
  }

  private playFilteredNoise(
    duration: number,
    freq: number,
    q: number,
    gainPeak: number,
    filterType: BiquadFilterType = 'bandpass'
  ): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq * (0.9 + Math.random() * 0.2), now);
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    src.start(now, Math.random() * 1.2, duration + 0.02);
  }

  private playTone(
    startFreq: number,
    endFreq: number,
    duration: number,
    gainPeak: number,
    type: OscillatorType = 'triangle'
  ): void {
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  public playFootstep(group: SoundGroup): void {
    switch (group) {
      case 'grass':
        this.playFilteredNoise(0.09, 1350, 1.8, 0.14);
        break;
      case 'stone':
        this.playFilteredNoise(0.06, 850, 3.2, 0.13);
        this.playTone(190, 95, 0.05, 0.07, 'sine');
        break;
      case 'wood':
        this.playTone(230, 115, 0.07, 0.14, 'triangle');
        this.playFilteredNoise(0.05, 650, 2.5, 0.08);
        break;
      case 'sand':
        this.playFilteredNoise(0.11, 2200, 1.2, 0.11);
        break;
      case 'snow':
        this.playFilteredNoise(0.09, 2900, 1.6, 0.13);
        break;
      case 'water':
        this.playFilteredNoise(0.16, 620, 1.4, 0.16, 'lowpass');
        this.playTone(320, 520, 0.09, 0.06, 'sine');
        break;
      case 'glass':
        this.playTone(950, 620, 0.05, 0.08, 'sine');
        break;
    }
  }

  public playMineHit(group: SoundGroup): void {
    this.playFootstep(group);
  }

  public playBlockBreak(group: SoundGroup): void {
    if (group === 'glass') {
      this.playFilteredNoise(0.18, 3800, 2.2, 0.25, 'highpass');
      this.playTone(1450, 720, 0.12, 0.15, 'triangle');
      return;
    }
    this.playFilteredNoise(0.18, group === 'wood' ? 780 : 1100, 1.4, 0.28);
    this.playTone(group === 'stone' ? 220 : 170, 65, 0.14, 0.2, 'triangle');
  }

  public playBlockPlace(group: SoundGroup): void {
    this.playTone(group === 'wood' ? 210 : 260, 140, 0.08, 0.18, 'triangle');
    this.playFilteredNoise(0.07, 980, 2.0, 0.14);
  }

  public playPickupPop(): void {
    const base = 440 + Math.random() * 140;
    this.playTone(base, base * 1.65, 0.085, 0.2, 'sine');
  }

  public playChest(open: boolean): void {
    if (open) {
      this.playTone(180, 310, 0.16, 0.18, 'sawtooth');
    } else {
      this.playTone(280, 130, 0.13, 0.18, 'triangle');
    }
  }

  public playFuseHiss(): void {
    this.playFilteredNoise(0.55, 3200, 1.5, 0.22, 'highpass');
  }

  public playExplosion(): void {
    this.playFilteredNoise(0.95, 220, 0.7, 0.65, 'lowpass');
    this.playTone(115, 26, 0.75, 0.55, 'sawtooth');
  }

  public playAttackSwing(): void {
    this.playFilteredNoise(0.1, 1400, 1.3, 0.18);
  }

  public playHurt(): void {
    this.playTone(290, 110, 0.18, 0.3, 'sawtooth');
    this.playFilteredNoise(0.12, 900, 1.8, 0.22);
  }

  public playEat(): void {
    this.playFilteredNoise(0.08, 1600, 1.6, 0.18);
    this.playTone(240, 180, 0.07, 0.1, 'triangle');
  }

  public playHorn(): void {
    this.playTone(293.66, 440, 0.45, 0.26, 'sawtooth');
  }

  public playUiClick(): void {
    this.playTone(620, 480, 0.04, 0.1, 'sine');
  }
}
