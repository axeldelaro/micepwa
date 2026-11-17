import { DEFAULT_SKINS } from '../entities/RemotePlayer';
import { DESIGN_PACK_INFO, type DesignPackId } from '../graphics/ProceduralAtlas';
import type { GraphicsMode } from '../graphics/RenderPipeline';
import { normalizeRoomCode } from '../network/P2PNetworkManager';
import type { GameMode } from '../player/PlayerController';
import type { WorldDatabase, WorldSaveRecord } from '../storage/WorldDatabase';

export interface NewWorldOptions {
  name: string;
  seed: string;
  gameMode: GameMode;
  graphicsMode: GraphicsMode;
  designPack: DesignPackId;
  hostOnlineImmediately: boolean;
}

type MenuTab = 'play' | 'multi' | 'worlds' | 'profile';

export class MainMenu {
  private readonly container: HTMLDivElement;
  private readonly db: WorldDatabase;

  private activeTab: MenuTab = 'play';
  private draftName = 'Mon Monde';
  private draftSeed = `VX-${Math.floor(100000 + Math.random() * 900000)}`;
  private draftMode: GameMode = 'survival';
  private draftGfx: GraphicsMode = 'photoreal';

  public username = localStorage.getItem('voxelcraft_username') || 'Explorateur';
  public skinIndex = Number(localStorage.getItem('voxelcraft_skin') || '0');
  public selectedPack: DesignPackId =
    (localStorage.getItem('voxelcraft_pack') as DesignPackId | null) || 'realiste_hd';

  public onCreateWorld?: (opts: NewWorldOptions) => void;
  public onLoadSavedWorld?: (record: WorldSaveRecord, hostOnline: boolean) => void;
  public onJoinRoomFromMenu?: (roomCode: string) => void;
  public onPreviewDesignPack?: (pack: DesignPackId) => void;
  public onToggleFullscreen?: () => void;

  constructor(parent: HTMLElement, db: WorldDatabase) {
    this.db = db;
    this.container = document.createElement('div');
    this.container.id = 'main-menu-screen';
    this.container.className = 'ui-interactive';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 35;
      background: radial-gradient(circle at 50% 30%, rgba(15, 42, 34, 0.55) 0%, rgba(7, 11, 20, 0.86) 80%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: calc(10px + var(--safe-top)) calc(10px + var(--safe-right))
        calc(10px + var(--safe-bottom)) calc(10px + var(--safe-left));
    `;
    parent.appendChild(this.container);
  }

  public async show(autoRoomFromUrl = ''): Promise<void> {
    this.container.style.display = 'flex';
    if (autoRoomFromUrl) {
      this.activeTab = 'multi';
    }
    const savedWorlds = await this.db.listWorlds();
    this.render(savedWorlds, autoRoomFromUrl);
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  public isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  private render(savedWorlds: WorldSaveRecord[], autoRoomFromUrl: string): void {
    this.container.innerHTML = `
      <div class="modal-card" style="max-width: 520px; display: flex; flex-direction: column; gap: 10px;">
        <!-- Compact Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:22px;">⛏️</span>
            <div>
              <div style="font-size:17px;font-weight:800;color:#4ade80;letter-spacing:0.5px;line-height:1.1;">
                VOXELCRAFT
              </div>
              <div style="font-size:10px;color:#94a3b8;font-weight:600;">ULTIMATE HD • P2P</div>
            </div>
          </div>
          <button type="button" class="voxel-btn" id="btn-menu-fullscreen" style="padding:6px 10px;font-size:12px;">
            ⛶ Plein Écran
          </button>
        </div>

        <!-- Sleek 4-Tab Segmented Bar -->
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:5px;background:rgba(9,13,22,0.8);padding:4px;border-radius:10px;border:1px solid #334155;">
          <button type="button" class="voxel-btn ${this.activeTab === 'play' ? 'primary' : ''}" data-tab="play" style="padding:7px 4px;font-size:12px;">
            🌍 Jouer
          </button>
          <button type="button" class="voxel-btn ${this.activeTab === 'multi' ? 'blue' : ''}" data-tab="multi" style="padding:7px 4px;font-size:12px;">
            🌐 Multi
          </button>
          <button type="button" class="voxel-btn ${this.activeTab === 'worlds' ? 'amber' : ''}" data-tab="worlds" style="padding:7px 4px;font-size:12px;">
            💾 (${savedWorlds.length})
          </button>
          <button type="button" class="voxel-btn ${this.activeTab === 'profile' ? 'primary' : ''}" data-tab="profile" style="padding:7px 4px;font-size:12px;">
            👤 Profil
          </button>
        </div>

        <!-- Tab Body -->
        <div id="menu-tab-body"></div>
      </div>
    `;

    this.container.querySelector('#btn-menu-fullscreen')!.addEventListener('click', () => {
      this.onToggleFullscreen?.();
    });

    this.container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = (btn as HTMLElement).dataset.tab as MenuTab;
        this.render(savedWorlds, autoRoomFromUrl);
      });
    });

    const body = this.container.querySelector('#menu-tab-body') as HTMLDivElement;

    if (this.activeTab === 'play') {
      this.renderPlayTab(body);
    } else if (this.activeTab === 'multi') {
      this.renderMultiTab(body, autoRoomFromUrl);
    } else if (this.activeTab === 'worlds') {
      this.renderWorldsTab(body, savedWorlds, autoRoomFromUrl);
    } else {
      this.renderProfileTab(body, savedWorlds, autoRoomFromUrl);
    }
  }

  private renderPlayTab(body: HTMLElement): void {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:6px;">
          <input type="text" id="inp-world-name" class="voxel-input" value="${this.draftName}" placeholder="Nom du monde" style="padding:8px 10px;font-size:14px;" />
          <div style="display:flex;gap:4px;">
            <input type="text" id="inp-world-seed" class="voxel-input" value="${this.draftSeed}" placeholder="Seed" style="flex:1;padding:8px;font-size:13px;" />
            <button type="button" class="voxel-btn" id="btn-rand-seed" style="padding:0 9px;">🎲</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <select id="sel-gamemode" class="voxel-select" style="padding:8px;font-size:13px;">
            <option value="survival" ${this.draftMode === 'survival' ? 'selected' : ''}>⚔️ Survie</option>
            <option value="creative" ${this.draftMode === 'creative' ? 'selected' : ''}>🪽 Créatif</option>
            <option value="bastion" ${this.draftMode === 'bastion' ? 'selected' : ''}>🛡️ Bastion</option>
            <option value="hardcore" ${this.draftMode === 'hardcore' ? 'selected' : ''}>💀 Hardcore</option>
            <option value="spectator" ${this.draftMode === 'spectator' ? 'selected' : ''}>📷 Cinéma</option>
          </select>

          <select id="sel-gfxmode" class="voxel-select" style="padding:8px;font-size:13px;">
            <option value="photoreal" ${this.draftGfx === 'photoreal' ? 'selected' : ''}>📸 Vue Réelle HD</option>
            <option value="ultra" ${this.draftGfx === 'ultra' ? 'selected' : ''}>✨ Shaders PBR</option>
            <option value="classic" ${this.draftGfx === 'classic' ? 'selected' : ''}>🎨 Classique 60FPS</option>
          </select>
        </div>

        <!-- Compact 4-Pack Visual Selector -->
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:5px;">
          ${(['realiste_hd', 'classic', 'medieval_rpg', 'neon_cyber'] as DesignPackId[])
            .map((pid) => {
              const labels: Record<DesignPackId, string> = {
                realiste_hd: '📸 HD 64x',
                classic: '🎨 16x',
                medieval_rpg: '🏰 RPG',
                neon_cyber: '⚡ Néon',
              };
              return `<button type="button" class="voxel-btn ${this.selectedPack === pid ? 'amber' : ''}" data-pack="${pid}" style="padding:6px 4px;font-size:11px;">${labels[pid]}</button>`;
            })
            .join('')}
        </div>

        <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:8px;margin-top:2px;">
          <button type="button" class="voxel-btn primary" id="btn-play-new-solo" style="padding:11px;font-size:14px;">
            ▶ JOUER
          </button>
          <button type="button" class="voxel-btn blue" id="btn-play-new-host" style="padding:11px;font-size:13px;">
            🌐 Héberger
          </button>
        </div>
      </div>
    `;

    const nameInp = body.querySelector('#inp-world-name') as HTMLInputElement;
    const seedInp = body.querySelector('#inp-world-seed') as HTMLInputElement;
    const gmSel = body.querySelector('#sel-gamemode') as HTMLSelectElement;
    const gfxSel = body.querySelector('#sel-gfxmode') as HTMLSelectElement;

    nameInp.addEventListener('input', () => (this.draftName = nameInp.value));
    seedInp.addEventListener('input', () => (this.draftSeed = seedInp.value));
    gmSel.addEventListener('change', () => (this.draftMode = gmSel.value as GameMode));
    gfxSel.addEventListener('change', () => (this.draftGfx = gfxSel.value as GraphicsMode));

    body.querySelector('#btn-rand-seed')!.addEventListener('click', () => {
      this.draftSeed = `VX-${Math.floor(100000 + Math.random() * 900000)}`;
      seedInp.value = this.draftSeed;
    });

    body.querySelectorAll('[data-pack]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = (btn as HTMLElement).dataset.pack as DesignPackId;
        this.selectedPack = p;
        localStorage.setItem('voxelcraft_pack', p);
        this.onPreviewDesignPack?.(p);
        this.renderPlayTab(body);
      });
    });

    const launch = (hostOnlineImmediately: boolean) => {
      this.onCreateWorld?.({
        name: this.draftName.trim() || 'Mon Monde',
        seed: this.draftSeed.trim() || 'VX-2026',
        gameMode: this.draftMode,
        graphicsMode: this.draftGfx,
        designPack: this.selectedPack,
        hostOnlineImmediately,
      });
    };

    body.querySelector('#btn-play-new-solo')!.addEventListener('click', () => launch(false));
    body.querySelector('#btn-play-new-host')!.addEventListener('click', () => launch(true));
  }

  private renderMultiTab(body: HTMLElement, autoRoomFromUrl: string): void {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;padding:4px 0;">
        <div style="display:flex;gap:6px;">
          <input type="text" id="inp-menu-room" class="voxel-input" placeholder="Code Salon (ex: VX-4829)"
            value="${autoRoomFromUrl}" style="flex:1;text-transform:uppercase;font-weight:800;text-align:center;letter-spacing:1px;" />
          <button type="button" class="voxel-btn blue" id="btn-menu-join" style="padding:10px 16px;">
            🔗 Rejoindre
          </button>
        </div>

        <div style="text-align:center;font-size:11px;color:#64748b;">— ou —</div>

        <button type="button" class="voxel-btn primary" id="btn-multi-host-new" style="padding:11px;width:100%;">
          🚀 Créer & Héberger un Salon P2P
        </button>
      </div>
    `;

    body.querySelector('#btn-menu-join')!.addEventListener('click', () => {
      const raw = (body.querySelector('#inp-menu-room') as HTMLInputElement).value.trim();
      if (raw) {
        this.onJoinRoomFromMenu?.(normalizeRoomCode(raw));
      }
    });

    body.querySelector('#btn-multi-host-new')!.addEventListener('click', () => {
      this.onCreateWorld?.({
        name: this.draftName.trim() || 'Salon P2P',
        seed: this.draftSeed,
        gameMode: this.draftMode,
        graphicsMode: this.draftGfx,
        designPack: this.selectedPack,
        hostOnlineImmediately: true,
      });
    });
  }

  private renderWorldsTab(
    body: HTMLElement,
    savedWorlds: WorldSaveRecord[],
    autoRoomFromUrl: string
  ): void {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div id="saved-worlds-list" style="display:flex;flex-direction:column;gap:6px;max-height:190px;overflow-y:auto;"></div>
        <label class="voxel-btn" style="width:100%;padding:8px;">
          📂 Importer un fichier .voxelworld.json
          <input type="file" id="inp-import-world" accept=".json" style="display:none;" />
        </label>
      </div>
    `;

    const listEl = body.querySelector('#saved-worlds-list') as HTMLDivElement;
    if (savedWorlds.length === 0) {
      listEl.innerHTML = `<div style="color:#64748b;font-size:12px;text-align:center;padding:18px 0;">Aucun monde sauvegardé.</div>`;
    } else {
      for (const w of savedWorlds) {
        const row = document.createElement('div');
        row.style.cssText = `
          background: rgba(9, 13, 22, 0.85);
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 7px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
        `;
        row.innerHTML = `
          <div style="min-width:0;flex:1;">
            <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${w.name}</div>
            <div style="font-size:10px;color:#94a3b8;">${w.gameMode.toUpperCase()} • ${w.seed}</div>
          </div>
          <div style="display:flex;gap:4px;">
            <button type="button" class="voxel-btn primary" data-act="play" style="padding:6px 10px;">▶</button>
            <button type="button" class="voxel-btn blue" data-act="host" style="padding:6px 9px;">🌐</button>
            <button type="button" class="voxel-btn" data-act="export" style="padding:6px 9px;">💾</button>
            <button type="button" class="voxel-btn danger" data-act="del" style="padding:6px 9px;">🗑️</button>
          </div>
        `;
        row.querySelector('[data-act="play"]')!.addEventListener('click', () => this.onLoadSavedWorld?.(w, false));
        row.querySelector('[data-act="host"]')!.addEventListener('click', () => this.onLoadSavedWorld?.(w, true));
        row.querySelector('[data-act="export"]')!.addEventListener('click', () => this.db.exportWorldToFile(w));
        row.querySelector('[data-act="del"]')!.addEventListener('click', async () => {
          await this.db.deleteWorld(w.id);
          await this.show(autoRoomFromUrl);
        });
        listEl.appendChild(row);
      }
    }

    const importInp = body.querySelector('#inp-import-world') as HTMLInputElement;
    importInp.addEventListener('change', async () => {
      const f = importInp.files?.[0];
      if (!f) return;
      try {
        await this.db.importWorldFromFile(f);
        await this.show(autoRoomFromUrl);
      } catch (err) {
        alert((err as Error).message);
      }
    });
  }

  private renderProfileTab(
    body: HTMLElement,
    savedWorlds: WorldSaveRecord[],
    autoRoomFromUrl: string
  ): void {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;padding:4px 0;">
        <label style="font-size:12px;color:#94a3b8;display:flex;flex-direction:column;gap:4px;">
          Pseudo en jeu :
          <input type="text" id="inp-username" class="voxel-input" value="${this.username}" maxlength="16" placeholder="Votre Pseudo" />
        </label>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:12px;color:#94a3b8;">Couleur d'avatar :</span>
          <div id="skin-picker" style="display:flex;gap:8px;"></div>
        </div>
      </div>
    `;

    const inp = body.querySelector('#inp-username') as HTMLInputElement;
    inp.addEventListener('input', () => {
      this.username = inp.value.trim() || 'Explorateur';
      localStorage.setItem('voxelcraft_username', this.username);
    });

    const skinPicker = body.querySelector('#skin-picker') as HTMLDivElement;
    DEFAULT_SKINS.forEach((s, idx) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.style.cssText = `
        width: 34px;
        height: 34px;
        border-radius: 8px;
        cursor: pointer;
        background: linear-gradient(135deg, ${s.shirtColor} 50%, ${s.pantsColor} 50%);
        border: 2.5px solid ${idx === this.skinIndex ? '#facc15' : '#475569'};
      `;
      swatch.addEventListener('click', () => {
        this.skinIndex = idx;
        localStorage.setItem('voxelcraft_skin', String(idx));
        this.renderProfileTab(body, savedWorlds, autoRoomFromUrl);
      });
      skinPicker.appendChild(swatch);
    });

    void DESIGN_PACK_INFO;
  }
}
