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

export class MainMenu {
  private readonly container: HTMLDivElement;
  private readonly db: WorldDatabase;

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
      background: radial-gradient(circle at 50% 25%, rgba(16, 48, 38, 0.72) 0%, rgba(7, 11, 20, 0.90) 78%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      overflow-y: auto;
    `;
    parent.appendChild(this.container);
  }

  public async show(autoRoomFromUrl = ''): Promise<void> {
    this.container.style.display = 'flex';
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
    const randomSeed = `VX-${Math.floor(100000 + Math.random() * 900000)}`;

    this.container.innerHTML = `
      <div class="modal-card" style="width: min(980px, 96vw); max-height: 95vh;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;border-bottom:1px solid #334155;padding-bottom:12px;margin-bottom:14px;">
          <div>
            <h1 style="margin:0;font-size:26px;letter-spacing:0.8px;color:#4ade80;">
              ⛏️ VOXELCRAFT ULTIMATE — VUE RÉELLE & P2P
            </h1>
            <div style="font-size:12px;color:#94a3b8;">
              Rendu Cinéma Photo-Réaliste HD 64x • 4 Packs de Design • 5 Modes de Jeu • Météo Dynamique • Arc, Grappin & Architecte • WebRTC P2P
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button type="button" class="voxel-btn" id="btn-menu-fullscreen">⛶ Plein Écran / PWA</button>
          </div>
        </div>

        <!-- Profile & Quick Join Row -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:14px;margin-bottom:14px;">
          <div style="background:rgba(11,16,26,0.78);border:1px solid #334155;border-radius:8px;padding:12px;">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px;">👤 Profil & Avatar Multijoueur</div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
              <input type="text" id="inp-username" class="voxel-input" value="${this.username}" maxlength="16" placeholder="Votre Pseudo" style="flex:1;" />
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="font-size:12px;color:#94a3b8;">Tenue :</span>
              <div id="skin-picker" style="display:flex;gap:6px;"></div>
            </div>
          </div>

          <div style="background:rgba(11,16,26,0.78);border:1px solid #334155;border-radius:8px;padding:12px;">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#38bdf8;">🔗 Rejoindre un Salon Multijoueur P2P</div>
            <div style="display:flex;gap:8px;">
              <input type="text" id="inp-menu-room" class="voxel-input" placeholder="Code Salon (ex: VX-4829)"
                value="${autoRoomFromUrl}" style="flex:1;text-transform:uppercase;font-weight:700;" />
              <button type="button" class="voxel-btn blue" id="btn-menu-join">Rejoindre</button>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:6px;">
              Compatible PC, Android & multi-onglets instantané via WebRTC DataChannels + BroadcastChannel.
            </div>
          </div>
        </div>

        <!-- Create World & Saved Worlds Columns -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:16px;">
          <!-- Create New World -->
          <div style="background:rgba(11,16,26,0.85);border:1px solid #334155;border-radius:8px;padding:14px;">
            <h3 style="margin:0 0 10px;font-size:16px;color:#4ade80;">🌍 Créer un Nouveau Monde</h3>
            <div style="display:flex;flex-direction:column;gap:9px;">
              <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:6px;">
                <input type="text" id="inp-world-name" class="voxel-input" value="Monde Vue Réelle HD" placeholder="Nom du monde" />
                <div style="display:flex;gap:4px;">
                  <input type="text" id="inp-world-seed" class="voxel-input" value="${randomSeed}" placeholder="Seed" style="flex:1;min-width:0;" />
                  <button type="button" class="voxel-btn" id="btn-rand-seed" title="Seed aléatoire">🎲</button>
                </div>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#94a3b8;">
                  Mode de Jeu :
                  <select id="sel-gamemode" class="voxel-select">
                    <option value="survival">⚔️ Survie (Complet)</option>
                    <option value="creative">🪽 Créatif & Architecte</option>
                    <option value="bastion">🛡️ Défense de Bastion (Vagues)</option>
                    <option value="hardcore">💀 Hardcore (1 Vie)</option>
                    <option value="spectator">📷 Spectateur / Cinéma</option>
                  </select>
                </label>

                <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#94a3b8;">
                  Moteur Graphique :
                  <select id="sel-gfxmode" class="voxel-select">
                    <option value="photoreal" selected>📸 Vue Réelle (Cinéma Photo-HD)</option>
                    <option value="ultra">✨ Graphismes Élevés (Shaders PBR)</option>
                    <option value="classic">🎨 Classique Minecraft (60+ FPS)</option>
                  </select>
                </label>
              </div>

              <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#94a3b8;">
                Pack de Design / Textures (aperçu 3D en direct derrière le menu !) :
                <select id="sel-designpack" class="voxel-select">
                  <option value="realiste_hd" ${this.selectedPack === 'realiste_hd' ? 'selected' : ''}>📸 ${DESIGN_PACK_INFO.realiste_hd.name}</option>
                  <option value="classic" ${this.selectedPack === 'classic' ? 'selected' : ''}>🎨 ${DESIGN_PACK_INFO.classic.name}</option>
                  <option value="medieval_rpg" ${this.selectedPack === 'medieval_rpg' ? 'selected' : ''}>🏰 ${DESIGN_PACK_INFO.medieval_rpg.name}</option>
                  <option value="neon_cyber" ${this.selectedPack === 'neon_cyber' ? 'selected' : ''}>⚡ ${DESIGN_PACK_INFO.neon_cyber.name}</option>
                </select>
              </label>

              <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;">
                <button type="button" class="voxel-btn primary" id="btn-play-new-solo" style="flex:1;">
                  ▶ Lancer le Monde
                </button>
                <button type="button" class="voxel-btn blue" id="btn-play-new-host" style="flex:1;">
                  🌐 Créer & Héberger P2P
                </button>
              </div>
            </div>
          </div>

          <!-- Saved Worlds in IndexedDB -->
          <div style="background:rgba(11,16,26,0.85);border:1px solid #334155;border-radius:8px;padding:14px;display:flex;flex-direction:column;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <h3 style="margin:0;font-size:16px;color:#fbbf24;">💾 Mondes Sauvegardés (${savedWorlds.length})</h3>
              <label class="voxel-btn" style="padding:5px 10px;font-size:12px;">
                📂 Importer .json
                <input type="file" id="inp-import-world" accept=".json" style="display:none;" />
              </label>
            </div>
            <div id="saved-worlds-list" style="display:flex;flex-direction:column;gap:8px;max-height:245px;overflow-y:auto;"></div>
          </div>
        </div>
      </div>
    `;

    const skinPicker = this.container.querySelector('#skin-picker') as HTMLDivElement;
    DEFAULT_SKINS.forEach((s, idx) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        background: linear-gradient(135deg, ${s.shirtColor} 50%, ${s.pantsColor} 50%);
        border: 2px solid ${idx === this.skinIndex ? '#facc15' : '#475569'};
      `;
      swatch.addEventListener('click', () => {
        this.skinIndex = idx;
        localStorage.setItem('voxelcraft_skin', String(idx));
        this.render(savedWorlds, (this.container.querySelector('#inp-menu-room') as HTMLInputElement).value);
      });
      skinPicker.appendChild(swatch);
    });

    const packSel = this.container.querySelector('#sel-designpack') as HTMLSelectElement;
    packSel.addEventListener('change', () => {
      const p = packSel.value as DesignPackId;
      this.selectedPack = p;
      localStorage.setItem('voxelcraft_pack', p);
      this.onPreviewDesignPack?.(p);
    });

    const saveProfileInputs = () => {
      const val = (this.container.querySelector('#inp-username') as HTMLInputElement).value.trim() || 'Explorateur';
      this.username = val;
      localStorage.setItem('voxelcraft_username', val);
    };

    this.container.querySelector('#btn-menu-fullscreen')!.addEventListener('click', () => {
      this.onToggleFullscreen?.();
    });

    this.container.querySelector('#btn-rand-seed')!.addEventListener('click', () => {
      (this.container.querySelector('#inp-world-seed') as HTMLInputElement).value =
        `VX-${Math.floor(100000 + Math.random() * 900000)}`;
    });

    const triggerCreate = (hostOnlineImmediately: boolean) => {
      saveProfileInputs();
      const name = (this.container.querySelector('#inp-world-name') as HTMLInputElement).value.trim() || 'Monde Voxel';
      const seed = (this.container.querySelector('#inp-world-seed') as HTMLInputElement).value.trim() || randomSeed;
      const gameMode = (this.container.querySelector('#sel-gamemode') as HTMLSelectElement).value as GameMode;
      const graphicsMode = (this.container.querySelector('#sel-gfxmode') as HTMLSelectElement).value as GraphicsMode;
      const designPack = (this.container.querySelector('#sel-designpack') as HTMLSelectElement).value as DesignPackId;
      this.onCreateWorld?.({ name, seed, gameMode, graphicsMode, designPack, hostOnlineImmediately });
    };

    this.container.querySelector('#btn-play-new-solo')!.addEventListener('click', () => triggerCreate(false));
    this.container.querySelector('#btn-play-new-host')!.addEventListener('click', () => triggerCreate(true));

    this.container.querySelector('#btn-menu-join')!.addEventListener('click', () => {
      saveProfileInputs();
      const raw = (this.container.querySelector('#inp-menu-room') as HTMLInputElement).value.trim();
      if (raw) {
        this.onJoinRoomFromMenu?.(normalizeRoomCode(raw));
      }
    });

    const listEl = this.container.querySelector('#saved-worlds-list') as HTMLDivElement;
    if (savedWorlds.length === 0) {
      listEl.innerHTML = `<div style="color:#64748b;font-size:13px;padding:12px 0;">Aucun monde sauvegardé pour l'instant. Lancez un nouveau monde pour activer la sauvegarde automatique IndexedDB !</div>`;
    } else {
      for (const w of savedWorlds) {
        const item = document.createElement('div');
        item.style.cssText = `
          background: rgba(15, 23, 42, 0.9);
          border: 1px solid #334155;
          border-radius: 6px;
          padding: 8px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        `;
        const dateStr = new Date(w.updatedAt).toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        item.innerHTML = `
          <div>
            <div style="font-weight:700;font-size:13px;">${w.name}</div>
            <div style="font-size:11px;color:#94a3b8;">Seed: ${w.seed} • ${w.gameMode.toUpperCase()} • ${dateStr}</div>
          </div>
          <div style="display:flex;gap:5px;">
            <button type="button" class="voxel-btn primary" data-act="play" style="padding:5px 9px;font-size:12px;">▶</button>
            <button type="button" class="voxel-btn blue" data-act="host" style="padding:5px 9px;font-size:12px;" title="Héberger P2P">🌐</button>
            <button type="button" class="voxel-btn" data-act="export" style="padding:5px 9px;font-size:12px;" title="Exporter .voxelworld.json">💾</button>
            <button type="button" class="voxel-btn danger" data-act="del" style="padding:5px 9px;font-size:12px;" title="Supprimer">🗑️</button>
          </div>
        `;
        item.querySelector('[data-act="play"]')!.addEventListener('click', () => {
          saveProfileInputs();
          this.onLoadSavedWorld?.(w, false);
        });
        item.querySelector('[data-act="host"]')!.addEventListener('click', () => {
          saveProfileInputs();
          this.onLoadSavedWorld?.(w, true);
        });
        item.querySelector('[data-act="export"]')!.addEventListener('click', () => {
          this.db.exportWorldToFile(w);
        });
        item.querySelector('[data-act="del"]')!.addEventListener('click', async () => {
          await this.db.deleteWorld(w.id);
          await this.show(autoRoomFromUrl);
        });
        listEl.appendChild(item);
      }
    }

    const importInp = this.container.querySelector('#inp-import-world') as HTMLInputElement;
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
}
