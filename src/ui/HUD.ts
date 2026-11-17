import { getBlockOrItem } from '../blocks/BlockRegistry';
import { AGENT_ROLE_INFO, type AgentRole, type VoxelAgentAI } from '../entities/VoxelAgentAI';
import { DESIGN_PACK_INFO, type DesignPackId, type ProceduralAtlas } from '../graphics/ProceduralAtlas';
import { GRAPHICS_MODE_LABELS, type GraphicsMode } from '../graphics/RenderPipeline';
import { WEATHER_LABELS, type WeatherKind } from '../graphics/WeatherSystem';
import { HOTBAR_SIZE, type InventoryManager } from '../player/InventoryManager';
import type { PlayerController } from '../player/PlayerController';

export interface DebugTelemetry {
  fps: number;
  x: number;
  y: number;
  z: number;
  cx: number;
  cz: number;
  biome: string;
  skyLight: number;
  blockLight: number;
  seed: string;
  gameMode: string;
  graphicsMode: GraphicsMode;
  designPack: DesignPackId;
  weather: WeatherKind;
  killScore: number;
  bastionWave: number;
  inputDevice: string;
  p2pStatus: string;
  peerCount: number;
  pingMs: number;
}

export class HUD {
  private readonly root: HTMLDivElement;
  private readonly vitalsRow: HTMLDivElement;
  private readonly armorEl: HTMLDivElement;
  private readonly heartsEl: HTMLDivElement;
  private readonly oxygenEl: HTMLDivElement;
  private readonly hungerEl: HTMLDivElement;
  private readonly heldLabelEl: HTMLDivElement;
  private readonly modeScoreBanner: HTMLDivElement;
  private readonly hotbarRow: HTMLDivElement;
  private readonly debugPanel: HTMLDivElement;
  private readonly gfxBtn: HTMLButtonElement;
  private readonly packBtn: HTMLButtonElement;
  private readonly weatherBtn: HTMLButtonElement;
  private readonly p2pBtn: HTMLButtonElement;
  private radialBackdrop: HTMLDivElement | null = null;

  public debugVisible = false;
  public cinemaHideHud = false;

  private readonly atlas: ProceduralAtlas;
  private readonly inventory: InventoryManager;

  public onToggleGraphicsQuick?: () => void;
  public onCycleDesignPackQuick?: () => void;
  public onCycleWeatherQuick?: () => void;
  public onOpenP2PLobby?: () => void;
  public onOpenInventory?: () => void;
  public onOpenSettings?: () => void;
  public onAssignCompanionRole?: (agent: VoxelAgentAI, role: AgentRole) => void;
  public onOpenMerchantTrades?: (agent: VoxelAgentAI) => void;

  constructor(parent: HTMLElement, atlas: ProceduralAtlas, inventory: InventoryManager) {
    this.atlas = atlas;
    this.inventory = inventory;

    this.root = document.createElement('div');
    this.root.id = 'hud-overlay';
    this.root.style.cssText = 'position: fixed; inset: 0; pointer-events: none; display: none; z-index: 15;';

    // 1. Central Crosshair
    const crosshair = document.createElement('div');
    crosshair.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: 18px;
      height: 18px;
      transform: translate(-50%, -50%);
    `;
    crosshair.innerHTML = `
      <div style="position:absolute;left:8px;top:1px;width:2px;height:16px;background:rgba(255,255,255,0.88);box-shadow:0 0 2px #000;"></div>
      <div style="position:absolute;left:1px;top:8px;width:16px;height:2px;background:rgba(255,255,255,0.88);box-shadow:0 0 2px #000;"></div>
    `;

    // 2. Top-Left Quick Action Bar
    const topBar = document.createElement('div');
    topBar.className = 'ui-interactive';
    topBar.style.cssText = `
      position: absolute;
      top: 10px;
      left: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    `;

    this.gfxBtn = document.createElement('button');
    this.gfxBtn.id = 'btn-quick-graphics';
    this.gfxBtn.type = 'button';
    this.gfxBtn.className = 'voxel-btn primary';
    this.gfxBtn.style.padding = '5px 10px';
    this.gfxBtn.style.fontSize = '12px';
    this.gfxBtn.textContent = GRAPHICS_MODE_LABELS.photoreal;
    this.gfxBtn.addEventListener('click', () => this.onToggleGraphicsQuick?.());

    this.packBtn = document.createElement('button');
    this.packBtn.id = 'btn-quick-pack';
    this.packBtn.type = 'button';
    this.packBtn.className = 'voxel-btn amber';
    this.packBtn.style.padding = '5px 10px';
    this.packBtn.style.fontSize = '12px';
    this.packBtn.textContent = DESIGN_PACK_INFO.realiste_hd.badge;
    this.packBtn.addEventListener('click', () => this.onCycleDesignPackQuick?.());

    this.weatherBtn = document.createElement('button');
    this.weatherBtn.id = 'btn-quick-weather';
    this.weatherBtn.type = 'button';
    this.weatherBtn.className = 'voxel-btn';
    this.weatherBtn.style.padding = '5px 10px';
    this.weatherBtn.style.fontSize = '12px';
    this.weatherBtn.textContent = '☀️ Météo';
    this.weatherBtn.addEventListener('click', () => this.onCycleWeatherQuick?.());

    this.p2pBtn = document.createElement('button');
    this.p2pBtn.id = 'btn-quick-p2p';
    this.p2pBtn.type = 'button';
    this.p2pBtn.className = 'voxel-btn blue';
    this.p2pBtn.style.padding = '5px 10px';
    this.p2pBtn.style.fontSize = '12px';
    this.p2pBtn.textContent = '🌐 Salon P2P';
    this.p2pBtn.addEventListener('click', () => this.onOpenP2PLobby?.());

    const f3Btn = document.createElement('button');
    f3Btn.id = 'btn-quick-f3';
    f3Btn.type = 'button';
    f3Btn.className = 'voxel-btn';
    f3Btn.style.padding = '5px 9px';
    f3Btn.style.fontSize = '12px';
    f3Btn.textContent = 'F3';
    f3Btn.addEventListener('click', () => this.toggleDebug());

    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'btn-quick-settings';
    settingsBtn.type = 'button';
    settingsBtn.className = 'voxel-btn';
    settingsBtn.style.padding = '5px 10px';
    settingsBtn.style.fontSize = '12px';
    settingsBtn.textContent = '⚙️ Menu';
    settingsBtn.addEventListener('click', () => this.onOpenSettings?.());

    topBar.append(this.gfxBtn, this.packBtn, this.weatherBtn, this.p2pBtn, f3Btn, settingsBtn);

    // Top-Center Mode / Bastion Wave & Score Banner
    this.modeScoreBanner = document.createElement('div');
    this.modeScoreBanner.style.cssText = `
      position: absolute;
      top: 12px;
      right: 16px;
      background: rgba(11, 16, 26, 0.78);
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 700;
      color: #fde047;
    `;

    // 3. F3 Debug Telemetry Overlay
    this.debugPanel = document.createElement('div');
    this.debugPanel.id = 'f3-debug-overlay';
    this.debugPanel.style.cssText = `
      position: absolute;
      top: 48px;
      left: 12px;
      background: rgba(9, 13, 22, 0.84);
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px 12px;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.45;
      color: #e2e8f0;
      display: none;
    `;

    // 4. Bottom Center HUD
    const bottomCenter = document.createElement('div');
    bottomCenter.style.cssText = `
      position: absolute;
      left: 50%;
      bottom: 10px;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    `;

    this.heldLabelEl = document.createElement('div');
    this.heldLabelEl.style.cssText = `
      font-size: 13px;
      font-weight: 700;
      color: #fef08a;
      text-shadow: 1px 1px 2px #000;
      min-height: 18px;
    `;

    this.armorEl = document.createElement('div');
    this.armorEl.style.cssText = 'font-size:13px;text-shadow:1px 1px 2px #000;align-self:flex-start;padding-left:4px;';

    this.vitalsRow = document.createElement('div');
    this.vitalsRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      max-width: 484px;
      padding: 0 4px;
      font-size: 14px;
      text-shadow: 1px 1px 2px #000;
    `;
    this.heartsEl = document.createElement('div');
    this.oxygenEl = document.createElement('div');
    this.hungerEl = document.createElement('div');
    this.vitalsRow.append(this.heartsEl, this.oxygenEl, this.hungerEl);

    const hotbarContainer = document.createElement('div');
    hotbarContainer.className = 'ui-interactive';
    hotbarContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(11, 16, 26, 0.85);
      border: 2px solid #475569;
      border-radius: 8px;
      padding: 5px;
    `;

    this.hotbarRow = document.createElement('div');
    this.hotbarRow.style.cssText = 'display: flex; gap: 4px;';

    const bagBtn = document.createElement('button');
    bagBtn.id = 'btn-hud-inventory';
    bagBtn.type = 'button';
    bagBtn.className = 'voxel-btn';
    bagBtn.style.height = '48px';
    bagBtn.style.padding = '0 10px';
    bagBtn.title = 'Inventaire & Craft (E)';
    bagBtn.textContent = '🎒';
    bagBtn.addEventListener('click', () => this.onOpenInventory?.());

    hotbarContainer.append(this.hotbarRow, bagBtn);
    bottomCenter.append(this.heldLabelEl, this.armorEl, this.vitalsRow, hotbarContainer);

    this.root.append(crosshair, topBar, this.modeScoreBanner, this.debugPanel, bottomCenter);
    parent.appendChild(this.root);

    this.inventory.onChange(() => this.renderHotbar());
    this.atlas.onPackChanged((pack) => {
      this.updatePackBadge(pack);
      this.renderHotbar();
    });
    this.renderHotbar();

    // F1 key: toggle clean cinema screenshot mode (hides HUD)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') {
        e.preventDefault();
        this.cinemaHideHud = !this.cinemaHideHud;
        this.root.style.opacity = this.cinemaHideHud ? '0' : '1';
      }
    });
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  public toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debugPanel.style.display = this.debugVisible ? 'block' : 'none';
  }

  public updateGraphicsBadge(mode: GraphicsMode): void {
    this.gfxBtn.textContent = GRAPHICS_MODE_LABELS[mode];
    this.gfxBtn.className = mode === 'photoreal' ? 'voxel-btn primary' : mode === 'ultra' ? 'voxel-btn blue' : 'voxel-btn amber';
  }

  public updatePackBadge(pack: DesignPackId): void {
    this.packBtn.textContent = DESIGN_PACK_INFO[pack].badge;
  }

  public updateWeatherBadge(w: WeatherKind): void {
    this.weatherBtn.textContent = WEATHER_LABELS[w];
  }

  public updateP2PBadge(roomCode: string, peersCount: number): void {
    if (roomCode) {
      this.p2pBtn.textContent = `🌐 ${roomCode} (${peersCount + 1} j.)`;
    } else {
      this.p2pBtn.textContent = '🌐 Salon P2P';
    }
  }

  public renderHotbar(): void {
    this.hotbarRow.innerHTML = '';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const stack = this.inventory.slots[i];
      const box = document.createElement('div');
      box.className = `slot-box${i === this.inventory.selectedHotbar ? ' selected' : ''}`;
      box.addEventListener('click', () => this.inventory.selectHotbar(i));

      if (stack && stack.count > 0) {
        const def = getBlockOrItem(stack.itemId);
        const img = document.createElement('img');
        img.src = this.atlas.getItemIcon(stack.itemId);
        img.alt = def.name;
        box.appendChild(img);

        if (stack.count > 1) {
          const cnt = document.createElement('span');
          cnt.className = 'slot-count';
          cnt.textContent = String(stack.count);
          box.appendChild(cnt);
        }

        if (def.maxDurability > 0 && stack.durability !== undefined && stack.durability < def.maxDurability) {
          const durWrap = document.createElement('div');
          durWrap.className = 'slot-durability';
          const bar = document.createElement('span');
          const pct = Math.max(0, Math.min(100, (stack.durability / def.maxDurability) * 100));
          bar.style.width = `${pct}%`;
          bar.style.background = pct > 50 ? '#22c55e' : pct > 22 ? '#facc15' : '#ef4444';
          durWrap.appendChild(bar);
          box.appendChild(durWrap);
        }
      }

      this.hotbarRow.appendChild(box);
    }

    const held = this.inventory.getHeldStack();
    this.heldLabelEl.textContent = held ? getBlockOrItem(held.itemId).name : '';
  }

  public updateVitalsAndDebug(player: PlayerController, telemetry: DebugTelemetry): void {
    if (player.gameMode === 'bastion') {
      this.modeScoreBanner.style.display = 'block';
      this.modeScoreBanner.textContent = `🛡️ BASTION — Vague ${telemetry.bastionWave} • Score ${telemetry.killScore}`;
    } else if (player.gameMode === 'spectator') {
      this.modeScoreBanner.style.display = 'block';
      this.modeScoreBanner.textContent = '📷 MODE CINÉMA (Molette = Zoom • F1 = Masquer HUD)';
    } else if (player.gameMode === 'hardcore') {
      this.modeScoreBanner.style.display = 'block';
      this.modeScoreBanner.textContent = `💀 HARDCORE • Score ${telemetry.killScore}`;
    } else {
      this.modeScoreBanner.style.display = 'none';
    }

    if (player.isInvulnerableMode()) {
      this.vitalsRow.style.display = 'none';
      this.armorEl.textContent = '';
    } else {
      this.vitalsRow.style.display = 'flex';
      const shields = Math.ceil(player.armor / 2);
      this.armorEl.textContent = shields > 0 ? '🛡️'.repeat(shields) : '';

      const fullHearts = Math.ceil(player.health / 2);
      const goldHearts = Math.ceil(player.absorption / 2);
      const heartGlyph = player.gameMode === 'hardcore' ? '❤️‍🔥' : '❤️';
      this.heartsEl.textContent =
        heartGlyph.repeat(fullHearts) +
        '🖤'.repeat(Math.max(0, 10 - fullHearts)) +
        (goldHearts > 0 ? ' ' + '💛'.repeat(goldHearts) : '');

      if (player.oxygen < player.maxOxygen) {
        const bubbles = Math.ceil(player.oxygen / 2);
        this.oxygenEl.textContent = '🫧'.repeat(bubbles);
      } else {
        this.oxygenEl.textContent = '';
      }

      const fullFood = Math.ceil(player.hunger / 2);
      this.hungerEl.textContent = '🍗'.repeat(fullFood) + '▫️'.repeat(Math.max(0, 10 - fullFood));
    }

    if (this.debugVisible) {
      this.debugPanel.innerHTML = `
        <div><strong>VOXELCRAFT ULTIMATE (GitHub Pages)</strong> — <strong>${telemetry.fps} FPS</strong></div>
        <div>XYZ : ${telemetry.x.toFixed(2)} / ${telemetry.y.toFixed(2)} / ${telemetry.z.toFixed(2)} (Chunk ${telemetry.cx}, ${telemetry.cz})</div>
        <div>Biome : ${telemetry.biome} | Lumière : Ciel ${telemetry.skyLight} / Bloc ${telemetry.blockLight}</div>
        <div>Seed : ${telemetry.seed} | Mode : ${telemetry.gameMode.toUpperCase()} | Météo : ${telemetry.weather.toUpperCase()}</div>
        <div>Rendu : ${GRAPHICS_MODE_LABELS[telemetry.graphicsMode]} | Pack : ${DESIGN_PACK_INFO[telemetry.designPack].name}</div>
        <div>Contrôle : ${telemetry.inputDevice}</div>
        <div>Réseau P2P : ${telemetry.p2pStatus} | Pairs : ${telemetry.peerCount} | Ping : ${telemetry.pingMs} ms</div>
      `;
    }
  }

  public openCompanionRadialMenu(agent: VoxelAgentAI, onCloseMenu?: () => void): void {
    this.closeCompanionRadialMenu();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.width = '460px';

    const roles: AgentRole[] = ['guard', 'miner', 'builder', 'trader'];
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:18px;">🤖 Agent Compagnon : ${agent.name}</h3>
        <button type="button" class="voxel-btn" id="close-radial-btn">✕</button>
      </div>
      <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;">
        Assignez un rôle autonome à cet agent IA :
      </p>
      <div id="radial-role-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"></div>
      <div id="trader-extra" style="margin-top:12px;display:flex;justify-content:flex-end;"></div>
    `;

    const grid = card.querySelector('#radial-role-grid') as HTMLDivElement;
    for (const r of roles) {
      const info = AGENT_ROLE_INFO[r];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `voxel-btn ${agent.role === r ? 'primary' : ''}`;
      btn.style.cssText = 'flex-direction:column;align-items:flex-start;padding:12px;text-align:left;';
      btn.innerHTML = `
        <div style="font-size:15px;">${info.badge}</div>
        <div style="font-size:11px;font-weight:400;opacity:0.88;">${info.description}</div>
      `;
      btn.addEventListener('click', () => {
        this.onAssignCompanionRole?.(agent, r);
        this.closeCompanionRadialMenu();
        onCloseMenu?.();
      });
      grid.appendChild(btn);
    }

    if (agent.role === 'trader') {
      const tradeBtn = document.createElement('button');
      tradeBtn.type = 'button';
      tradeBtn.className = 'voxel-btn amber';
      tradeBtn.textContent = '💎 Ouvrir le Comptoir d\'Échanges';
      tradeBtn.addEventListener('click', () => {
        this.closeCompanionRadialMenu();
        this.onOpenMerchantTrades?.(agent);
      });
      card.querySelector('#trader-extra')!.appendChild(tradeBtn);
    }

    card.querySelector('#close-radial-btn')!.addEventListener('click', () => {
      this.closeCompanionRadialMenu();
      onCloseMenu?.();
    });

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    this.radialBackdrop = backdrop;
  }

  public closeCompanionRadialMenu(): void {
    if (this.radialBackdrop) {
      this.radialBackdrop.remove();
      this.radialBackdrop = null;
    }
  }

  public isRadialMenuOpen(): boolean {
    return this.radialBackdrop !== null;
  }
}
