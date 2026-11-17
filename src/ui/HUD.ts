import { getBlockOrItem } from '../blocks/BlockRegistry';
import { AGENT_ROLE_INFO, type AgentRole, type VoxelAgentAI } from '../entities/VoxelAgentAI';
import { DESIGN_PACK_INFO, type DesignPackId, type ProceduralAtlas } from '../graphics/ProceduralAtlas';
import { GRAPHICS_MODE_LABELS, type GraphicsMode } from '../graphics/RenderPipeline';
import type { WeatherKind } from '../graphics/WeatherSystem';
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
  public onOpenChat?: () => void;
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

    // 1. Crisp Central Crosshair
    const crosshair = document.createElement('div');
    crosshair.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: 16px;
      height: 16px;
      transform: translate(-50%, -50%);
    `;
    crosshair.innerHTML = `
      <div style="position:absolute;left:7px;top:1px;width:2px;height:14px;background:rgba(255,255,255,0.88);box-shadow:0 0 2px #000;"></div>
      <div style="position:absolute;left:1px;top:7px;width:14px;height:2px;background:rgba(255,255,255,0.88);box-shadow:0 0 2px #000;"></div>
    `;

    // 2. Unified Single-Row Top Bar (Icon-only glass pills on phone, Icon + short text on PC!)
    const topBar = document.createElement('div');
    topBar.className = 'ui-interactive';
    topBar.style.cssText = `
      position: absolute;
      top: calc(8px + var(--safe-top));
      left: calc(10px + var(--safe-left));
      right: calc(10px + var(--safe-right));
      display: flex;
      justify-content: space-between;
      align-items: center;
      pointer-events: none;
    `;

    const leftPills = document.createElement('div');
    leftPills.style.cssText = 'display:flex;gap:5px;pointer-events:auto;';

    const rightPills = document.createElement('div');
    rightPills.style.cssText = 'display:flex;gap:5px;align-items:center;pointer-events:auto;';

    this.gfxBtn = this.makePill('btn-quick-graphics', '📸', 'Vue Réelle', () => this.onToggleGraphicsQuick?.());
    this.packBtn = this.makePill('btn-quick-pack', '🖼️', 'HD 64x', () => this.onCycleDesignPackQuick?.());
    this.weatherBtn = this.makePill('btn-quick-weather', '☀️', 'Clair', () => this.onCycleWeatherQuick?.());
    this.p2pBtn = this.makePill('btn-quick-p2p', '🌐', 'P2P', () => this.onOpenP2PLobby?.());

    const chatBtn = this.makePill('btn-quick-chat', '💬', 'Chat', () => this.onOpenChat?.());
    const f3Btn = this.makePill('btn-quick-f3', '📊', 'F3', () => this.toggleDebug());
    const settingsBtn = this.makePill('btn-quick-settings', '⏸', 'Menu', () => this.onOpenSettings?.());

    this.modeScoreBanner = document.createElement('div');
    this.modeScoreBanner.style.cssText = `
      background: rgba(11, 16, 26, 0.78);
      border: 1px solid rgba(250, 204, 21, 0.5);
      border-radius: 10px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 700;
      color: #fde047;
      display: none;
    `;

    leftPills.append(this.gfxBtn, this.packBtn, this.weatherBtn, this.p2pBtn);
    rightPills.append(this.modeScoreBanner, chatBtn, f3Btn, settingsBtn);
    topBar.append(leftPills, rightPills);

    // 3. Compact F3 Debug Overlay
    this.debugPanel = document.createElement('div');
    this.debugPanel.id = 'f3-debug-overlay';
    this.debugPanel.style.cssText = `
      position: absolute;
      top: calc(48px + var(--safe-top));
      left: calc(10px + var(--safe-left));
      max-width: calc(100vw - 20px);
      background: rgba(9, 13, 22, 0.84);
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 6px 10px;
      font-family: monospace;
      font-size: 11px;
      line-height: 1.4;
      color: #e2e8f0;
      display: none;
    `;

    // 4. Bottom Center HUD (Adaptive Vitals + Responsive Hotbar)
    const bottomCenter = document.createElement('div');
    bottomCenter.style.cssText = `
      position: absolute;
      left: 50%;
      bottom: calc(6px + var(--safe-bottom));
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      max-width: calc(100vw - 12px);
    `;

    this.heldLabelEl = document.createElement('div');
    this.heldLabelEl.style.cssText = `
      font-size: 11px;
      font-weight: 700;
      color: #fef08a;
      text-shadow: 1px 1px 2px #000;
      min-height: 15px;
      max-width: 72vw;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    this.vitalsRow = document.createElement('div');
    this.vitalsRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 0 4px;
      font-size: 12px;
      font-weight: 700;
      text-shadow: 1px 1px 2px #000;
    `;
    this.heartsEl = document.createElement('div');
    this.armorEl = document.createElement('div');
    this.oxygenEl = document.createElement('div');
    this.hungerEl = document.createElement('div');
    this.vitalsRow.append(this.heartsEl, this.armorEl, this.oxygenEl, this.hungerEl);

    const hotbarContainer = document.createElement('div');
    hotbarContainer.className = 'ui-interactive';
    hotbarContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 3px;
      background: rgba(11, 16, 26, 0.84);
      backdrop-filter: blur(4px);
      border: 1.5px solid #475569;
      border-radius: 9px;
      padding: 4px;
    `;

    this.hotbarRow = document.createElement('div');
    this.hotbarRow.style.cssText = 'display: flex; gap: 3px;';

    const bagBtn = document.createElement('button');
    bagBtn.id = 'btn-hud-inventory';
    bagBtn.type = 'button';
    bagBtn.className = 'slot-box hotbar-slot';
    bagBtn.style.background = 'rgba(30, 41, 59, 0.92)';
    bagBtn.style.fontSize = '16px';
    bagBtn.title = 'Inventaire & Craft (E)';
    bagBtn.textContent = '🎒';
    bagBtn.addEventListener('click', () => this.onOpenInventory?.());

    hotbarContainer.append(this.hotbarRow, bagBtn);
    bottomCenter.append(this.heldLabelEl, this.vitalsRow, hotbarContainer);

    this.root.append(crosshair, topBar, this.debugPanel, bottomCenter);
    parent.appendChild(this.root);

    this.inventory.onChange(() => this.renderHotbar());
    this.atlas.onPackChanged((pack) => {
      this.updatePackBadge(pack);
      this.renderHotbar();
    });
    this.renderHotbar();

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') {
        e.preventDefault();
        this.cinemaHideHud = !this.cinemaHideHud;
        this.root.style.opacity = this.cinemaHideHud ? '0' : '1';
      }
    });
  }

  private makePill(id: string, icon: string, text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.id = id;
    b.type = 'button';
    b.className = 'hud-pill';
    b.innerHTML = `<span>${icon}</span><span class="pill-text">${text}</span>`;
    b.addEventListener('click', onClick);
    return b;
  }

  private setPillContent(btn: HTMLButtonElement, icon: string, text: string): void {
    btn.innerHTML = `<span>${icon}</span><span class="pill-text">${text}</span>`;
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  public toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debugPanel.style.display = this.debugVisible ? 'block' : 'none';
  }

  public updateGraphicsBadge(mode: GraphicsMode): void {
    if (mode === 'photoreal') this.setPillContent(this.gfxBtn, '📸', 'Vue Réelle');
    else if (mode === 'ultra') this.setPillContent(this.gfxBtn, '✨', 'Shaders PBR');
    else this.setPillContent(this.gfxBtn, '🎨', 'Classique');
  }

  public updatePackBadge(pack: DesignPackId): void {
    const map: Record<DesignPackId, [string, string]> = {
      realiste_hd: ['🖼️', 'HD 64x'],
      classic: ['🎨', '16x'],
      medieval_rpg: ['🏰', 'RPG'],
      neon_cyber: ['⚡', 'Néon'],
    };
    const [ic, tx] = map[pack];
    this.setPillContent(this.packBtn, ic, tx);
  }

  public updateWeatherBadge(w: WeatherKind): void {
    const map: Record<WeatherKind, [string, string]> = {
      clear: ['☀️', 'Clair'],
      rain: ['🌧️', 'Pluie'],
      snow: ['❄️', 'Neige'],
      storm: ['⛈️', 'Orage'],
    };
    const [ic, tx] = map[w];
    this.setPillContent(this.weatherBtn, ic, tx);
  }

  public updateP2PBadge(roomCode: string, peersCount: number): void {
    if (roomCode) {
      this.p2pBtn.innerHTML = `<span>🌐</span><span style="font-size:11px;color:#4ade80;">${roomCode} (${peersCount + 1})</span>`;
    } else {
      this.setPillContent(this.p2pBtn, '🌐', 'P2P');
    }
  }

  public renderHotbar(): void {
    this.hotbarRow.innerHTML = '';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const stack = this.inventory.slots[i];
      const box = document.createElement('div');
      box.className = `slot-box hotbar-slot${i === this.inventory.selectedHotbar ? ' selected' : ''}`;
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
      this.modeScoreBanner.textContent = `🛡️ V${telemetry.bastionWave} • ${telemetry.killScore} pts`;
    } else if (player.gameMode === 'spectator') {
      this.modeScoreBanner.style.display = 'block';
      this.modeScoreBanner.textContent = '📷 Cinéma';
    } else if (player.gameMode === 'hardcore') {
      this.modeScoreBanner.style.display = 'block';
      this.modeScoreBanner.textContent = `💀 ${telemetry.killScore} pts`;
    } else {
      this.modeScoreBanner.style.display = 'none';
    }

    if (player.isInvulnerableMode()) {
      this.vitalsRow.style.display = 'none';
    } else {
      this.vitalsRow.style.display = 'flex';
      const compactMobile = window.innerWidth < 520 || window.innerHeight < 460;

      if (compactMobile) {
        // Ultra-clean numeric badges on phone so vitals never wrap or crowd the screen!
        const hp = Math.ceil(player.health);
        const abs = Math.ceil(player.absorption);
        this.heartsEl.textContent = `❤️ ${hp}${abs > 0 ? `+${abs}` : ''}`;
        this.armorEl.textContent = player.armor > 0 ? `🛡️ ${player.armor}` : '';
        this.oxygenEl.textContent = player.oxygen < player.maxOxygen ? `🫧 ${Math.ceil(player.oxygen)}` : '';
        this.hungerEl.textContent = `🍗 ${Math.ceil(player.hunger)}`;
      } else {
        const shields = Math.ceil(player.armor / 4);
        this.armorEl.textContent = shields > 0 ? '🛡️'.repeat(shields) : '';
        const fullHearts = Math.ceil(player.health / 2);
        const goldHearts = Math.ceil(player.absorption / 2);
        this.heartsEl.textContent =
          '❤️'.repeat(fullHearts) +
          '🖤'.repeat(Math.max(0, 10 - fullHearts)) +
          (goldHearts > 0 ? ' ' + '💛'.repeat(goldHearts) : '');
        this.oxygenEl.textContent =
          player.oxygen < player.maxOxygen ? '🫧'.repeat(Math.ceil(player.oxygen / 4)) : '';
        const fullFood = Math.ceil(player.hunger / 2);
        this.hungerEl.textContent = '🍗'.repeat(fullFood) + '▫️'.repeat(Math.max(0, 10 - fullFood));
      }
    }

    if (this.debugVisible) {
      this.debugPanel.innerHTML = `
        <div><strong>VOXELCRAFT ULTIMATE</strong> — <strong>${telemetry.fps} FPS</strong></div>
        <div>XYZ : ${telemetry.x.toFixed(1)} / ${telemetry.y.toFixed(1)} / ${telemetry.z.toFixed(1)} (Ch ${telemetry.cx},${telemetry.cz})</div>
        <div>Biome : ${telemetry.biome} | Ciel ${telemetry.skyLight} / Bloc ${telemetry.blockLight}</div>
        <div>Seed : ${telemetry.seed} | ${telemetry.gameMode.toUpperCase()} | ${telemetry.weather.toUpperCase()}</div>
        <div>Rendu : ${GRAPHICS_MODE_LABELS[telemetry.graphicsMode]} | Pack : ${DESIGN_PACK_INFO[telemetry.designPack].name}</div>
        <div>P2P : ${telemetry.p2pStatus} (${telemetry.peerCount} pairs, ${telemetry.pingMs} ms)</div>
      `;
    }
  }

  public openCompanionRadialMenu(agent: VoxelAgentAI, onCloseMenu?: () => void): void {
    this.closeCompanionRadialMenu();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '380px';

    const roles: AgentRole[] = ['guard', 'miner', 'builder', 'trader'];
    const shortTips: Record<AgentRole, string> = {
      guard: 'Escorte & combat',
      miner: 'Récolte minerais/bois',
      builder: 'Construit un abri',
      trader: 'Échanges précieux',
    };

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong style="font-size:16px;">🤖 ${agent.name}</strong>
        <button type="button" class="voxel-btn" id="close-radial-btn">✕</button>
      </div>
      <div id="radial-role-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
      <div id="trader-extra" style="margin-top:10px;"></div>
    `;

    const grid = card.querySelector('#radial-role-grid') as HTMLDivElement;
    for (const r of roles) {
      const info = AGENT_ROLE_INFO[r];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `voxel-btn ${agent.role === r ? 'primary' : ''}`;
      btn.style.cssText = 'flex-direction:column;padding:10px 8px;gap:2px;';
      btn.innerHTML = `
        <div style="font-size:14px;">${info.badge}</div>
        <div style="font-size:10px;font-weight:500;opacity:0.85;">${shortTips[r]}</div>
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
      tradeBtn.style.width = '100%';
      tradeBtn.textContent = '💎 Ouvrir les Échanges';
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
