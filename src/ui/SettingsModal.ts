import type { SoundEngine } from '../audio/SoundEngine';
import type { DesignPackId, ProceduralAtlas } from '../graphics/ProceduralAtlas';
import type { GraphicsMode, RenderPipeline } from '../graphics/RenderPipeline';
import type { WeatherKind, WeatherSystem } from '../graphics/WeatherSystem';
import type { InputManager, KeyBindings } from '../input/InputManager';
import type { TouchAimMode } from '../input/TouchControlsUI';
import type { GameMode, PlayerController } from '../player/PlayerController';
import type { WorldManager } from '../world/WorldManager';

export class SettingsModal {
  private backdrop: HTMLDivElement | null = null;

  private readonly pipeline: RenderPipeline;
  private readonly atlas: ProceduralAtlas;
  private readonly weather: WeatherSystem;
  private readonly player: PlayerController;
  private readonly world: WorldManager;
  private readonly input: InputManager;
  private readonly sound: SoundEngine;

  public onResume?: () => void;
  public onOpenMultiplayerLobby?: () => void;
  public onExportCurrentWorld?: () => void;
  public onExitToMainMenu?: () => void;
  public onToggleFullscreen?: () => void;
  public onGraphicsChanged?: (mode: GraphicsMode) => void;
  public onWeatherChanged?: (w: WeatherKind) => void;
  public onGameModeChanged?: (gm: GameMode) => void;

  constructor(
    pipeline: RenderPipeline,
    atlas: ProceduralAtlas,
    weather: WeatherSystem,
    player: PlayerController,
    world: WorldManager,
    input: InputManager,
    sound: SoundEngine
  ) {
    this.pipeline = pipeline;
    this.atlas = atlas;
    this.weather = weather;
    this.player = player;
    this.world = world;
    this.input = input;
    this.sound = sound;
  }

  public isOpen(): boolean {
    return this.backdrop !== null;
  }

  public open(): void {
    this.close(false);

    const backdrop = document.createElement('div');
    backdrop.id = 'settings-pause-modal';
    backdrop.className = 'modal-backdrop';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '540px';

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    this.backdrop = backdrop;

    this.render(card);
  }

  public close(resume = true): void {
    this.input.keyCaptureCallback = null;
    if (this.backdrop) {
      this.backdrop.remove();
      this.backdrop = null;
      if (resume) this.onResume?.();
    }
  }

  private render(card: HTMLDivElement): void {
    const mode = this.pipeline.getMode();
    const pack = this.atlas.currentPack;
    const curWeather = this.weather.currentWeather;
    const curGm = this.player.gameMode;
    const resScalePct = Math.round(this.pipeline.getResolutionScale() * 100);
    const volPct = Math.round(this.sound.getVolume() * 100);
    const aimMode = this.input.touch.aimMode;

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong style="font-size:16px;">⏸ Pause & Réglages</strong>
        <button type="button" class="voxel-btn primary" id="btn-resume-game">▶ Reprendre</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        <!-- 3 Graphics Modes -->
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:5px;">
          <button type="button" id="btn-mode-photoreal" class="voxel-btn ${mode === 'photoreal' ? 'primary' : ''}" style="padding:7px 4px;font-size:11px;">
            📸 Vue Réelle
          </button>
          <button type="button" id="btn-mode-ultra" class="voxel-btn ${mode === 'ultra' ? 'blue' : ''}" style="padding:7px 4px;font-size:11px;">
            ✨ PBR
          </button>
          <button type="button" id="btn-mode-classic" class="voxel-btn ${mode === 'classic' ? 'amber' : ''}" style="padding:7px 4px;font-size:11px;">
            🎨 60 FPS
          </button>
        </div>

        <!-- Pack, Weather & GameMode Compact Row -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:6px;">
          <select id="sel-pause-pack" class="voxel-select" style="padding:7px;font-size:12px;">
            <option value="realiste_hd" ${pack === 'realiste_hd' ? 'selected' : ''}>📸 Pack HD 64x</option>
            <option value="classic" ${pack === 'classic' ? 'selected' : ''}>🎨 Pack 16x</option>
            <option value="medieval_rpg" ${pack === 'medieval_rpg' ? 'selected' : ''}>🏰 Pack RPG</option>
            <option value="neon_cyber" ${pack === 'neon_cyber' ? 'selected' : ''}>⚡ Pack Néon</option>
          </select>

          <select id="sel-pause-weather" class="voxel-select" style="padding:7px;font-size:12px;">
            <option value="clear" ${curWeather === 'clear' ? 'selected' : ''}>☀️ Clair</option>
            <option value="rain" ${curWeather === 'rain' ? 'selected' : ''}>🌧️ Pluie</option>
            <option value="snow" ${curWeather === 'snow' ? 'selected' : ''}>❄️ Neige</option>
            <option value="storm" ${curWeather === 'storm' ? 'selected' : ''}>⛈️ Orage</option>
          </select>

          <select id="sel-pause-gm" class="voxel-select" style="padding:7px;font-size:12px;">
            <option value="survival" ${curGm === 'survival' ? 'selected' : ''}>⚔️ Survie</option>
            <option value="creative" ${curGm === 'creative' ? 'selected' : ''}>🪽 Créatif</option>
            <option value="bastion" ${curGm === 'bastion' ? 'selected' : ''}>🛡️ Bastion</option>
            <option value="hardcore" ${curGm === 'hardcore' ? 'selected' : ''}>💀 Hardcore</option>
            <option value="spectator" ${curGm === 'spectator' ? 'selected' : ''}>📷 Cinéma</option>
          </select>
        </div>

        <!-- Sliders Grid -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px;background:rgba(9,13,22,0.7);padding:8px 10px;border-radius:8px;border:1px solid #334155;">
          <label style="font-size:11px;display:flex;flex-direction:column;gap:2px;">
            <span>Résolution : <strong id="lbl-res">${resScalePct}%</strong></span>
            <input type="range" id="rng-res" min="50" max="100" step="5" value="${resScalePct}" />
          </label>
          <label style="font-size:11px;display:flex;flex-direction:column;gap:2px;">
            <span> Horizon : <strong id="lbl-dist">${this.world.renderDistance} ch.</strong></span>
            <input type="range" id="rng-dist" min="3" max="8" step="1" value="${this.world.renderDistance}" />
          </label>
          <label style="font-size:11px;display:flex;flex-direction:column;gap:2px;">
            <span>Audio : <strong id="lbl-vol">${volPct}%</strong></span>
            <input type="range" id="rng-vol" min="0" max="100" step="5" value="${volPct}" />
          </label>
        </div>

        <!-- Touch Aim Mode -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span style="font-size:12px;color:#94a3b8;">Visée Tactile :</span>
          <select id="sel-touch-mode" class="voxel-select" style="flex:1;padding:6px 8px;font-size:12px;">
            <option value="split" ${aimMode === 'split' ? 'selected' : ''}>🎯 Boutons Miner / Poser</option>
            <option value="direct" ${aimMode === 'direct' ? 'selected' : ''}>👆 Toucher Direct l'Écran</option>
          </select>
        </div>

        <!-- Collapsible PC Keyboard & Gamepad Section (clean on mobile!) -->
        <details style="background:rgba(9,13,22,0.6);border:1px solid #334155;border-radius:8px;padding:6px 10px;font-size:12px;">
          <summary style="cursor:pointer;color:#94a3b8;font-weight:600;">⌨️ Clavier PC & Manette</summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
            <label style="font-size:11px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <span>Zone morte manette : <strong id="lbl-dz">${Math.round(this.input.gamepad.deadzone * 100)}%</strong></span>
              <input type="range" id="rng-dz" min="5" max="35" step="1" value="${Math.round(this.input.gamepad.deadzone * 100)}" style="max-width:150px;" />
            </label>
            <div id="key-remap-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:5px;"></div>
          </div>
        </details>

        <!-- Action Footer -->
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:5px;padding-top:6px;border-top:1px solid #334155;">
          <button type="button" class="voxel-btn blue" id="btn-pause-lobby" style="padding:8px 4px;font-size:11px;">🌐 P2P</button>
          <button type="button" class="voxel-btn" id="btn-pause-export" style="padding:8px 4px;font-size:11px;">💾 Export</button>
          <button type="button" class="voxel-btn" id="btn-pause-fs" style="padding:8px 4px;font-size:11px;">⛶ Écran</button>
          <button type="button" class="voxel-btn danger" id="btn-exit-menu" style="padding:8px 4px;font-size:11px;">🏠 Menu</button>
        </div>
      </div>
    `;

    card.querySelector('#btn-resume-game')!.addEventListener('click', () => this.close(true));

    const bindGfx = (id: string, m: GraphicsMode) => {
      card.querySelector(id)!.addEventListener('click', () => {
        this.pipeline.setMode(m);
        this.onGraphicsChanged?.(m);
        this.render(card);
      });
    };
    bindGfx('#btn-mode-photoreal', 'photoreal');
    bindGfx('#btn-mode-ultra', 'ultra');
    bindGfx('#btn-mode-classic', 'classic');

    const selPack = card.querySelector('#sel-pause-pack') as HTMLSelectElement;
    selPack.addEventListener('change', () => {
      const p = selPack.value as DesignPackId;
      localStorage.setItem('voxelcraft_pack', p);
      this.atlas.setDesignPack(p);
    });

    const selW = card.querySelector('#sel-pause-weather') as HTMLSelectElement;
    selW.addEventListener('change', () => {
      const w = selW.value as WeatherKind;
      this.weather.setWeather(w);
      this.onWeatherChanged?.(w);
    });

    const selGm = card.querySelector('#sel-pause-gm') as HTMLSelectElement;
    selGm.addEventListener('change', () => {
      const gm = selGm.value as GameMode;
      this.player.setGameMode(gm);
      this.onGameModeChanged?.(gm);
    });

    const rngRes = card.querySelector('#rng-res') as HTMLInputElement;
    rngRes.addEventListener('input', () => {
      const v = Number(rngRes.value);
      card.querySelector('#lbl-res')!.textContent = `${v}%`;
      this.pipeline.setResolutionScale(v / 100);
    });

    const rngDist = card.querySelector('#rng-dist') as HTMLInputElement;
    rngDist.addEventListener('input', () => {
      const v = Number(rngDist.value);
      card.querySelector('#lbl-dist')!.textContent = `${v} ch.`;
      this.world.renderDistance = v;
      this.pipeline.setFogDistance(v);
    });

    const rngVol = card.querySelector('#rng-vol') as HTMLInputElement;
    rngVol.addEventListener('input', () => {
      const v = Number(rngVol.value);
      card.querySelector('#lbl-vol')!.textContent = `${v}%`;
      this.sound.setVolume(v / 100);
    });

    const selTouch = card.querySelector('#sel-touch-mode') as HTMLSelectElement;
    selTouch.addEventListener('change', () => {
      this.input.setTouchAimMode(selTouch.value as TouchAimMode);
    });

    const rngDz = card.querySelector('#rng-dz') as HTMLInputElement;
    rngDz.addEventListener('input', () => {
      const v = Number(rngDz.value);
      card.querySelector('#lbl-dz')!.textContent = `${v}%`;
      this.input.gamepad.deadzone = v / 100;
    });

    const remapEntries: Array<[keyof KeyBindings, string]> = [
      ['forward', 'Avancer'],
      ['backward', 'Reculer'],
      ['left', 'Gauche'],
      ['right', 'Droite'],
      ['jump', 'Saut'],
      ['sneak', 'Accroupi'],
    ];
    const remapGrid = card.querySelector('#key-remap-grid') as HTMLDivElement;
    for (const [field, label] of remapEntries) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'voxel-btn';
      b.style.cssText = 'padding:4px 7px;font-size:11px;justify-content:space-between;';
      b.innerHTML = `<span>${label}</span><code>${this.input.bindings[field]}</code>`;
      b.addEventListener('click', () => {
        b.innerHTML = `<span>${label}</span><code style="color:#facc15;">...</code>`;
        this.input.keyCaptureCallback = (newCode) => {
          this.input.bindings[field] = newCode;
          this.input.saveBindings();
          this.render(card);
        };
      });
      remapGrid.appendChild(b);
    }

    card.querySelector('#btn-pause-lobby')!.addEventListener('click', () => {
      this.close(false);
      this.onOpenMultiplayerLobby?.();
    });
    card.querySelector('#btn-pause-export')!.addEventListener('click', () => {
      this.onExportCurrentWorld?.();
    });
    card.querySelector('#btn-pause-fs')!.addEventListener('click', () => {
      this.onToggleFullscreen?.();
    });
    card.querySelector('#btn-exit-menu')!.addEventListener('click', () => {
      this.close(false);
      this.onExitToMainMenu?.();
    });
  }
}
