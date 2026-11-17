import type { SoundEngine } from '../audio/SoundEngine';
import { DESIGN_PACK_INFO, type DesignPackId, type ProceduralAtlas } from '../graphics/ProceduralAtlas';
import type { GraphicsMode, RenderPipeline } from '../graphics/RenderPipeline';
import { WEATHER_LABELS, type WeatherKind, type WeatherSystem } from '../graphics/WeatherSystem';
import type { InputManager, KeyBindings } from '../input/InputManager';
import type { TouchAimMode } from '../input/TouchControlsUI';
import { GAMEMODE_LABELS, type GameMode, type PlayerController } from '../player/PlayerController';
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
    card.style.width = 'min(780px, 96vw)';

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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h2 style="margin:0;font-size:20px;">⏸ Menu Pause, Packs Photo-HD, Modes & Contrôles</h2>
        <button type="button" class="voxel-btn primary" id="btn-resume-game">▶ Reprendre la Partie</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(310px, 1fr));gap:14px;">
        <!-- Graphics, Design Packs & Weather -->
        <div style="background:rgba(11,16,26,0.82);border:1px solid #334155;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:9px;">
          <div style="font-weight:700;color:#4ade80;">📸 Rendu & Packs de Design Temps Réel</div>

          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            <button type="button" id="btn-mode-photoreal" class="voxel-btn ${mode === 'photoreal' ? 'primary' : ''}" style="flex:1;font-size:11px;padding:7px;">
              📸 Vue Réelle HD
            </button>
            <button type="button" id="btn-mode-ultra" class="voxel-btn ${mode === 'ultra' ? 'blue' : ''}" style="flex:1;font-size:11px;padding:7px;">
              ✨ Shaders PBR
            </button>
            <button type="button" id="btn-mode-classic" class="voxel-btn ${mode === 'classic' ? 'amber' : ''}" style="flex:1;font-size:11px;padding:7px;">
              🎨 Classique 60FPS
            </button>
          </div>

          <label style="font-size:12px;display:flex;flex-direction:column;gap:4px;">
            <span>Pack de Textures (changement instantané sans recharger !) :</span>
            <select id="sel-pause-pack" class="voxel-select" style="padding:6px;">
              <option value="realiste_hd" ${pack === 'realiste_hd' ? 'selected' : ''}>📸 ${DESIGN_PACK_INFO.realiste_hd.name}</option>
              <option value="classic" ${pack === 'classic' ? 'selected' : ''}>🎨 ${DESIGN_PACK_INFO.classic.name}</option>
              <option value="medieval_rpg" ${pack === 'medieval_rpg' ? 'selected' : ''}>🏰 ${DESIGN_PACK_INFO.medieval_rpg.name}</option>
              <option value="neon_cyber" ${pack === 'neon_cyber' ? 'selected' : ''}>⚡ ${DESIGN_PACK_INFO.neon_cyber.name}</option>
            </select>
          </label>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <label style="font-size:12px;display:flex;flex-direction:column;gap:4px;">
              <span>Météo Dynamique :</span>
              <select id="sel-pause-weather" class="voxel-select" style="padding:6px;">
                <option value="clear" ${curWeather === 'clear' ? 'selected' : ''}>${WEATHER_LABELS.clear}</option>
                <option value="rain" ${curWeather === 'rain' ? 'selected' : ''}>${WEATHER_LABELS.rain}</option>
                <option value="snow" ${curWeather === 'snow' ? 'selected' : ''}>${WEATHER_LABELS.snow}</option>
                <option value="storm" ${curWeather === 'storm' ? 'selected' : ''}>${WEATHER_LABELS.storm}</option>
              </select>
            </label>

            <label style="font-size:12px;display:flex;flex-direction:column;gap:4px;">
              <span>Mode de Jeu :</span>
              <select id="sel-pause-gm" class="voxel-select" style="padding:6px;">
                <option value="survival" ${curGm === 'survival' ? 'selected' : ''}>${GAMEMODE_LABELS.survival}</option>
                <option value="creative" ${curGm === 'creative' ? 'selected' : ''}>${GAMEMODE_LABELS.creative}</option>
                <option value="bastion" ${curGm === 'bastion' ? 'selected' : ''}>${GAMEMODE_LABELS.bastion}</option>
                <option value="hardcore" ${curGm === 'hardcore' ? 'selected' : ''}>${GAMEMODE_LABELS.hardcore}</option>
                <option value="spectator" ${curGm === 'spectator' ? 'selected' : ''}>${GAMEMODE_LABELS.spectator}</option>
              </select>
            </label>
          </div>

          <label style="font-size:12px;display:flex;flex-direction:column;gap:3px;">
            <span>Échelle de Résolution : <strong id="lbl-res">${resScalePct} %</strong></span>
            <input type="range" id="rng-res" min="50" max="100" step="5" value="${resScalePct}" />
          </label>

          <label style="font-size:12px;display:flex;flex-direction:column;gap:3px;">
            <span>Distance de Rendu : <strong id="lbl-dist">${this.world.renderDistance} chunks</strong></span>
            <input type="range" id="rng-dist" min="3" max="8" step="1" value="${this.world.renderDistance}" />
          </label>
        </div>

        <!-- Hybrid Controls & Audio -->
        <div style="background:rgba(11,16,26,0.82);border:1px solid #334155;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:9px;">
          <div style="font-weight:700;color:#38bdf8;">🎮 Contrôles Hybrides & Audio</div>

          <label style="font-size:12px;display:flex;flex-direction:column;gap:3px;">
            <span>Volume Audio Procédural : <strong id="lbl-vol">${volPct} %</strong></span>
            <input type="range" id="rng-vol" min="0" max="100" step="5" value="${volPct}" />
          </label>

          <label style="font-size:12px;display:flex;flex-direction:column;gap:4px;">
            <span>Mode Tactile Mobile :</span>
            <select id="sel-touch-mode" class="voxel-select" style="padding:6px;">
              <option value="split" ${aimMode === 'split' ? 'selected' : ''}>Réticule Central (Boutons Miner/Poser)</option>
              <option value="direct" ${aimMode === 'direct' ? 'selected' : ''}>Toucher Direct (Tap Poser / Appui Long Miner)</option>
            </select>
          </label>

          <label style="font-size:12px;display:flex;flex-direction:column;gap:3px;">
            <span>Zone Morte Manette : <strong id="lbl-dz">${Math.round(this.input.gamepad.deadzone * 100)} %</strong></span>
            <input type="range" id="rng-dz" min="5" max="35" step="1" value="${Math.round(this.input.gamepad.deadzone * 100)}" />
          </label>

          <div style="font-size:12px;color:#94a3b8;">Touches physiques (compatibles AZERTY & QWERTY) :</div>
          <div id="key-remap-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;"></div>
        </div>
      </div>

      <!-- Footer -->
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid #334155;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="voxel-btn blue" id="btn-pause-lobby">🌐 Salon Multijoueur P2P</button>
          <button type="button" class="voxel-btn" id="btn-pause-export">💾 Exporter .voxelworld.json</button>
          <button type="button" class="voxel-btn" id="btn-pause-fs">⛶ Plein Écran</button>
        </div>
        <button type="button" class="voxel-btn danger" id="btn-exit-menu">🏠 Sauvegarder & Menu Principal</button>
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
      card.querySelector('#lbl-res')!.textContent = `${v} %`;
      this.pipeline.setResolutionScale(v / 100);
    });

    const rngDist = card.querySelector('#rng-dist') as HTMLInputElement;
    rngDist.addEventListener('input', () => {
      const v = Number(rngDist.value);
      card.querySelector('#lbl-dist')!.textContent = `${v} chunks`;
      this.world.renderDistance = v;
      this.pipeline.setFogDistance(v);
    });

    const rngVol = card.querySelector('#rng-vol') as HTMLInputElement;
    rngVol.addEventListener('input', () => {
      const v = Number(rngVol.value);
      card.querySelector('#lbl-vol')!.textContent = `${v} %`;
      this.sound.setVolume(v / 100);
    });

    const selTouch = card.querySelector('#sel-touch-mode') as HTMLSelectElement;
    selTouch.addEventListener('change', () => {
      this.input.setTouchAimMode(selTouch.value as TouchAimMode);
    });

    const rngDz = card.querySelector('#rng-dz') as HTMLInputElement;
    rngDz.addEventListener('input', () => {
      const v = Number(rngDz.value);
      card.querySelector('#lbl-dz')!.textContent = `${v} %`;
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
      b.style.cssText = 'padding:5px 8px;font-size:11px;justify-content:space-between;';
      b.innerHTML = `<span>${label}</span><code>${this.input.bindings[field]}</code>`;
      b.addEventListener('click', () => {
        b.innerHTML = `<span>${label}</span><code style="color:#facc15;">Appuyez...</code>`;
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
