import {
  getAllRegisteredItems,
  getBlockOrItem,
} from '../blocks/BlockRegistry';
import { CRAFTING_RECIPES } from '../blocks/Recipes';
import { MERCHANT_TRADES, type VoxelAgentAI } from '../entities/VoxelAgentAI';
import type { ProceduralAtlas } from '../graphics/ProceduralAtlas';
import {
  HOTBAR_SIZE,
  INVENTORY_TOTAL_SLOTS,
  type InventoryManager,
} from '../player/InventoryManager';
import type { GameMode } from '../player/PlayerController';
import type { ChestState, FurnaceState, StackSlot, WorldManager } from '../world/WorldManager';

export type InventoryContextMode =
  | 'inventory'
  | 'crafting_table'
  | 'furnace'
  | 'chest'
  | 'merchant';

export class InventoryModal {
  private backdrop: HTMLDivElement | null = null;
  private floatingCursorEl: HTMLDivElement | null = null;
  private refreshTimer: number | null = null;

  private contextMode: InventoryContextMode = 'inventory';
  private activeTab: 'craft' | 'creative' = 'craft';
  private creativeSearchQuery = '';
  private activeFurnace: FurnaceState | null = null;
  private activeChest: ChestState | null = null;
  private activeMerchant: VoxelAgentAI | null = null;

  private readonly atlas: ProceduralAtlas;
  private readonly inventory: InventoryManager;
  private readonly world: WorldManager;

  public onClose?: (closedChest?: ChestState) => void;
  public onCraftSuccessSound?: () => void;

  constructor(atlas: ProceduralAtlas, inventory: InventoryManager, world: WorldManager) {
    this.atlas = atlas;
    this.inventory = inventory;
    this.world = world;

    window.addEventListener('mousemove', (e) => {
      if (this.floatingCursorEl) {
        this.floatingCursorEl.style.left = `${e.clientX + 10}px`;
        this.floatingCursorEl.style.top = `${e.clientY + 10}px`;
      }
    });
  }

  public isOpen(): boolean {
    return this.backdrop !== null;
  }

  public openInventory(gameMode: GameMode): void {
    this.contextMode = 'inventory';
    this.activeTab = gameMode === 'creative' ? 'creative' : 'craft';
    this.activeFurnace = null;
    this.activeChest = null;
    this.activeMerchant = null;
    this.mountModal(gameMode);
  }

  public openCraftingTable(gameMode: GameMode): void {
    this.contextMode = 'crafting_table';
    this.activeTab = 'craft';
    this.mountModal(gameMode);
  }

  public openFurnace(x: number, y: number, z: number, gameMode: GameMode): void {
    this.contextMode = 'furnace';
    this.activeFurnace = this.world.getOrCreateFurnace(x, y, z);
    this.mountModal(gameMode);
  }

  public openChest(x: number, y: number, z: number, gameMode: GameMode): void {
    this.contextMode = 'chest';
    this.activeChest = this.world.getOrCreateChest(x, y, z);
    this.mountModal(gameMode);
  }

  public openMerchant(agent: VoxelAgentAI, gameMode: GameMode): void {
    this.contextMode = 'merchant';
    this.activeMerchant = agent;
    this.mountModal(gameMode);
  }

  private mountModal(gameMode: GameMode): void {
    this.close(false);

    const backdrop = document.createElement('div');
    backdrop.id = 'inventory-modal';
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('contextmenu', (e) => e.preventDefault());

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.width = 'min(820px, 96vw)';

    const cursorPreview = document.createElement('div');
    cursorPreview.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 95;
      width: 40px;
      height: 40px;
      display: none;
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    document.body.appendChild(cursorPreview);

    this.backdrop = backdrop;
    this.floatingCursorEl = cursorPreview;

    this.renderCard(card, gameMode);

    if (this.contextMode === 'furnace') {
      this.refreshTimer = window.setInterval(() => {
        if (this.backdrop && this.contextMode === 'furnace') {
          this.renderCard(card, gameMode);
        }
      }, 250);
    }
  }

  public close(notify = true): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    const closedChest = this.activeChest ?? undefined;
    this.activeFurnace = null;
    this.activeChest = null;
    this.activeMerchant = null;
    this.inventory.returnCraftGridToInventory();

    if (this.floatingCursorEl) {
      this.floatingCursorEl.remove();
      this.floatingCursorEl = null;
    }
    if (this.backdrop) {
      this.backdrop.remove();
      this.backdrop = null;
      if (notify) this.onClose?.(closedChest);
    }
  }

  private updateCursorPreview(): void {
    if (!this.floatingCursorEl) return;
    const cs = this.inventory.cursorStack;
    if (!cs || cs.count <= 0) {
      this.floatingCursorEl.style.display = 'none';
      this.floatingCursorEl.innerHTML = '';
      return;
    }
    this.floatingCursorEl.style.display = 'block';
    this.floatingCursorEl.innerHTML = `
      <img src="${this.atlas.getItemIcon(cs.itemId)}" style="width:36px;height:36px;image-rendering:pixelated;" />
      ${cs.count > 1 ? `<span class="slot-count">${cs.count}</span>` : ''}
    `;
  }

  private interactWithSlot(
    getSlot: () => StackSlot | null,
    setSlot: (val: StackSlot | null) => void,
    rightClick: boolean,
    rerender: () => void
  ): void {
    const cur = getSlot();
    const held = this.inventory.cursorStack;

    if (!held) {
      if (!cur) return;
      if (rightClick && cur.count > 1) {
        const half = Math.ceil(cur.count / 2);
        this.inventory.cursorStack = { ...cur, count: half };
        cur.count -= half;
        setSlot(cur.count > 0 ? cur : null);
      } else {
        this.inventory.cursorStack = { ...cur };
        setSlot(null);
      }
    } else {
      const def = getBlockOrItem(held.itemId);
      if (!cur) {
        if (rightClick) {
          setSlot({ ...held, count: 1 });
          held.count--;
          if (held.count <= 0) this.inventory.cursorStack = null;
        } else {
          setSlot({ ...held });
          this.inventory.cursorStack = null;
        }
      } else if (cur.itemId === held.itemId && def.maxStack > 1 && cur.count < def.maxStack) {
        const add = rightClick ? 1 : Math.min(def.maxStack - cur.count, held.count);
        cur.count += add;
        held.count -= add;
        if (held.count <= 0) this.inventory.cursorStack = null;
        setSlot(cur);
      } else {
        // Swap stacks
        this.inventory.cursorStack = { ...cur };
        setSlot({ ...held });
      }
    }

    this.inventory.notifyChanged();
    rerender();
  }

  private buildSlotElement(
    stack: StackSlot | null,
    onMouseDown: (rightClick: boolean) => void,
    highlight = false
  ): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `slot-box${highlight ? ' selected' : ''}`;

    if (stack && stack.count > 0) {
      const def = getBlockOrItem(stack.itemId);
      el.title = def.name;
      const img = document.createElement('img');
      img.src = this.atlas.getItemIcon(stack.itemId);
      img.alt = def.name;
      el.appendChild(img);

      if (stack.count > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'slot-count';
        cnt.textContent = String(stack.count);
        el.appendChild(cnt);
      }
      if (def.maxDurability > 0 && stack.durability !== undefined && stack.durability < def.maxDurability) {
        const dur = document.createElement('div');
        dur.className = 'slot-durability';
        const bar = document.createElement('span');
        bar.style.width = `${Math.max(0, (stack.durability / def.maxDurability) * 100)}%`;
        dur.appendChild(bar);
        el.appendChild(dur);
      }
    }

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onMouseDown(e.button === 2);
    });

    return el;
  }

  private renderCard(card: HTMLDivElement, gameMode: GameMode): void {
    const rerender = () => this.renderCard(card, gameMode);
    this.updateCursorPreview();

    let title = '🎒 Inventaire & Artisanat';
    if (this.contextMode === 'crafting_table') title = '🛠️ Table de Craft (3x3) & Livre de Recettes';
    else if (this.contextMode === 'furnace') title = '🔥 Fourneau de Fonte & Cuisson';
    else if (this.contextMode === 'chest') title = '📦 Coffre de Stockage';
    else if (this.contextMode === 'merchant') title = `💎 Comptoir d'Échanges — ${this.activeMerchant?.name ?? 'Marchand'}`;

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <h2 style="margin:0;font-size:18px;">${title}</h2>
          <div id="inv-tabs-wrap" style="display:flex;gap:6px;"></div>
        </div>
        <button type="button" class="voxel-btn" id="btn-close-inv">✕ Fermer (E)</button>
      </div>
      <div id="inv-upper-section" style="margin-bottom:14px;"></div>
      <div style="border-top:1px solid #334155;padding-top:12px;">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">Sac à dos (27) & Barre d'action (9)</div>
        <div id="inv-backpack-grid" style="display:grid;grid-template-columns:repeat(9, 48px);gap:5px;justify-content:center;margin-bottom:10px;"></div>
        <div id="inv-hotbar-grid" style="display:grid;grid-template-columns:repeat(9, 48px);gap:5px;justify-content:center;"></div>
      </div>
    `;

    card.querySelector('#btn-close-inv')!.addEventListener('click', () => this.close(true));

    // Creative / Craft switch tabs when in standard inventory
    if (this.contextMode === 'inventory' && gameMode === 'creative') {
      const tabs = card.querySelector('#inv-tabs-wrap') as HTMLDivElement;
      const catBtn = document.createElement('button');
      catBtn.type = 'button';
      catBtn.className = `voxel-btn ${this.activeTab === 'creative' ? 'primary' : ''}`;
      catBtn.style.padding = '5px 10px';
      catBtn.textContent = '✨ Catalogue Créatif';
      catBtn.addEventListener('click', () => {
        this.activeTab = 'creative';
        rerender();
      });

      const crfBtn = document.createElement('button');
      crfBtn.type = 'button';
      crfBtn.className = `voxel-btn ${this.activeTab === 'craft' ? 'primary' : ''}`;
      crfBtn.style.padding = '5px 10px';
      crfBtn.textContent = '🛠️ Craft 2x2';
      crfBtn.addEventListener('click', () => {
        this.activeTab = 'craft';
        rerender();
      });
      tabs.append(catBtn, crfBtn);
    }

    const upper = card.querySelector('#inv-upper-section') as HTMLDivElement;

    // ==================== UPPER CONTEXT SECTION ====================
    if (this.contextMode === 'inventory' && this.activeTab === 'creative' && gameMode === 'creative') {
      this.renderCreativeCatalogue(upper, rerender);
    } else if (this.contextMode === 'inventory' || this.contextMode === 'crafting_table') {
      this.renderCraftingAndRecipeBook(upper, this.contextMode === 'crafting_table' ? 3 : 2, rerender);
    } else if (this.contextMode === 'furnace' && this.activeFurnace) {
      this.renderFurnaceSection(upper, this.activeFurnace, rerender);
    } else if (this.contextMode === 'chest' && this.activeChest) {
      this.renderChestSection(upper, this.activeChest, rerender);
    } else if (this.contextMode === 'merchant') {
      this.renderMerchantSection(upper, rerender);
    }

    // ==================== PLAYER BACKPACK & HOTBAR ====================
    const backpackEl = card.querySelector('#inv-backpack-grid') as HTMLDivElement;
    for (let i = HOTBAR_SIZE; i < INVENTORY_TOTAL_SLOTS; i++) {
      backpackEl.appendChild(
        this.buildSlotElement(this.inventory.slots[i] ?? null, (rc) => {
          this.interactWithSlot(
            () => this.inventory.slots[i] ?? null,
            (v) => (this.inventory.slots[i] = v),
            rc,
            rerender
          );
        })
      );
    }

    const hotbarEl = card.querySelector('#inv-hotbar-grid') as HTMLDivElement;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      hotbarEl.appendChild(
        this.buildSlotElement(
          this.inventory.slots[i] ?? null,
          (rc) => {
            this.interactWithSlot(
              () => this.inventory.slots[i] ?? null,
              (v) => (this.inventory.slots[i] = v),
              rc,
              rerender
            );
          },
          i === this.inventory.selectedHotbar
        )
      );
    }
  }

  private renderCreativeCatalogue(upper: HTMLElement, rerender: () => void): void {
    upper.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input type="text" id="inp-creative-search" class="voxel-input" placeholder="🔍 Rechercher un bloc, minerai, outil, TNT..."
          value="${this.creativeSearchQuery}" style="flex:1;" />
      </div>
      <div id="creative-items-grid" style="display:grid;grid-template-columns:repeat(auto-fill, 48px);gap:5px;max-height:195px;overflow-y:auto;justify-content:center;padding:4px;"></div>
    `;

    const searchInp = upper.querySelector('#inp-creative-search') as HTMLInputElement;
    searchInp.addEventListener('input', () => {
      this.creativeSearchQuery = searchInp.value;
      this.populateCreativeGrid(upper.querySelector('#creative-items-grid') as HTMLDivElement, rerender);
    });

    this.populateCreativeGrid(upper.querySelector('#creative-items-grid') as HTMLDivElement, rerender);
  }

  private populateCreativeGrid(gridEl: HTMLDivElement, rerender: () => void): void {
    gridEl.innerHTML = '';
    const q = this.creativeSearchQuery.trim().toLowerCase();
    const items = getAllRegisteredItems().filter(
      (d) => !q || d.name.toLowerCase().includes(q) || d.key.toLowerCase().includes(q)
    );

    for (const def of items) {
      const slot = this.buildSlotElement({ itemId: def.id, count: 1 }, (rightClick) => {
        const giveCount = rightClick ? 1 : def.maxStack;
        this.inventory.addItem(def.id, giveCount, def.maxDurability > 0 ? def.maxDurability : undefined);
        this.onCraftSuccessSound?.();
        rerender();
      });
      gridEl.appendChild(slot);
    }
  }

  private renderCraftingAndRecipeBook(upper: HTMLElement, gridSize: 2 | 3, rerender: () => void): void {
    const has3x3 = gridSize === 3;
    upper.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:16px;align-items:center;">
        <!-- Manual Crafting Grid -->
        <div style="background:rgba(11,16,26,0.75);border:1px solid #334155;border-radius:8px;padding:12px;display:flex;align-items:center;justify-content:center;gap:16px;">
          <div id="craft-input-grid" style="display:grid;grid-template-columns:repeat(${gridSize}, 48px);gap:5px;"></div>
          <div style="font-size:22px;color:#94a3b8;">➔</div>
          <div id="craft-output-holder"></div>
        </div>

        <!-- 1-Click Interactive Recipe Book -->
        <div style="background:rgba(11,16,26,0.75);border:1px solid #334155;border-radius:8px;padding:10px;">
          <div style="font-size:13px;font-weight:700;color:#4ade80;margin-bottom:6px;">
            📖 Livre de Recettes en 1 Clic (${has3x3 ? '2x2 & 3x3' : 'Grille 2x2'})
          </div>
          <div id="recipe-book-list" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:6px;max-height:165px;overflow-y:auto;"></div>
        </div>
      </div>
    `;

    const gridEl = upper.querySelector('#craft-input-grid') as HTMLDivElement;
    const indices = gridSize === 2 ? [0, 1, 3, 4] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (const idx of indices) {
      gridEl.appendChild(
        this.buildSlotElement(this.inventory.craftGrid[idx] ?? null, (rc) => {
          this.interactWithSlot(
            () => this.inventory.craftGrid[idx] ?? null,
            (v) => (this.inventory.craftGrid[idx] = v),
            rc,
            rerender
          );
        })
      );
    }

    const matched = this.inventory.getCraftOutput(gridSize);
    const outStack: StackSlot | null = matched
      ? { itemId: matched.resultId, count: matched.resultCount }
      : null;
    const outEl = this.buildSlotElement(
      outStack,
      () => {
        if (this.inventory.takeCraftGridOutput(gridSize)) {
          this.onCraftSuccessSound?.();
          rerender();
        }
      },
      Boolean(matched)
    );
    upper.querySelector('#craft-output-holder')!.appendChild(outEl);

    // Populate 1-Click Recipe Book
    const bookList = upper.querySelector('#recipe-book-list') as HTMLDivElement;
    const availableRecipes = CRAFTING_RECIPES.filter((r) => !r.requires3x3 || has3x3);
    // Show craftable recipes first!
    availableRecipes.sort((a, b) => {
      const ca = this.inventory.canCraftFromInventory(a, has3x3) ? 0 : 1;
      const cb = this.inventory.canCraftFromInventory(b, has3x3) ? 0 : 1;
      return ca - cb;
    });

    for (const r of availableRecipes) {
      const craftable = this.inventory.canCraftFromInventory(r, has3x3);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `voxel-btn ${craftable ? 'primary' : ''}`;
      btn.style.cssText = `
        padding: 5px 8px;
        justify-content: flex-start;
        font-size: 11px;
        opacity: ${craftable ? '1' : '0.48'};
      `;
      btn.innerHTML = `
        <img src="${this.atlas.getItemIcon(r.resultId)}" style="width:24px;height:24px;image-rendering:pixelated;" />
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.name}</span>
      `;
      btn.addEventListener('click', () => {
        if (this.inventory.craftRecipeOneClick(r, has3x3)) {
          this.onCraftSuccessSound?.();
          rerender();
        }
      });
      bookList.appendChild(btn);
    }
  }

  private renderFurnaceSection(upper: HTMLElement, f: FurnaceState, rerender: () => void): void {
    const burnPct = f.burnTotal > 0 ? Math.min(100, (f.burnRemaining / f.burnTotal) * 100) : 0;
    const cookPct = f.cookTotal > 0 ? Math.min(100, (f.cookProgress / f.cookTotal) * 100) : 0;

    upper.innerHTML = `
      <div style="background:rgba(11,16,26,0.8);border:1px solid #334155;border-radius:8px;padding:16px;display:flex;align-items:center;justify-content:center;gap:24px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
          <span style="font-size:11px;color:#94a3b8;">Minerai / Cru</span>
          <div id="furn-input"></div>
          <div style="width:44px;height:8px;background:#1e293b;border-radius:4px;overflow:hidden;" title="Flamme Combustible">
            <div style="height:100%;width:${burnPct}%;background:#f97316;"></div>
          </div>
          <div id="furn-fuel"></div>
          <span style="font-size:11px;color:#94a3b8;">Combustible (Charbon/Bois)</span>
        </div>

        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <div style="font-size:20px;">${f.burnRemaining > 0 ? '🔥' : '❄️'}</div>
          <div style="width:84px;height:12px;background:#1e293b;border-radius:6px;overflow:hidden;">
            <div style="height:100%;width:${cookPct}%;background:#4ade80;"></div>
          </div>
          <span style="font-size:11px;color:#94a3b8;">${Math.round(cookPct)} %</span>
        </div>

        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <span style="font-size:11px;color:#4ade80;">Résultat Fondu</span>
          <div id="furn-output"></div>
        </div>
      </div>
    `;

    upper.querySelector('#furn-input')!.appendChild(
      this.buildSlotElement(f.input, (rc) => {
        this.interactWithSlot(
          () => f.input,
          (v) => (f.input = v),
          rc,
          rerender
        );
      })
    );
    upper.querySelector('#furn-fuel')!.appendChild(
      this.buildSlotElement(f.fuel, (rc) => {
        this.interactWithSlot(
          () => f.fuel,
          (v) => (f.fuel = v),
          rc,
          rerender
        );
      })
    );
    upper.querySelector('#furn-output')!.appendChild(
      this.buildSlotElement(
        f.output,
        (rc) => {
          this.interactWithSlot(
            () => f.output,
            (v) => (f.output = v),
            rc,
            rerender
          );
        },
        Boolean(f.output)
      )
    );
  }

  private renderChestSection(upper: HTMLElement, chest: ChestState, rerender: () => void): void {
    upper.innerHTML = `
      <div id="chest-slots-grid" style="display:grid;grid-template-columns:repeat(9, 48px);gap:5px;justify-content:center;background:rgba(11,16,26,0.75);padding:10px;border-radius:8px;border:1px solid #334155;"></div>
    `;
    const grid = upper.querySelector('#chest-slots-grid') as HTMLDivElement;
    for (let i = 0; i < 27; i++) {
      grid.appendChild(
        this.buildSlotElement(chest.slots[i] ?? null, (rc) => {
          this.interactWithSlot(
            () => chest.slots[i] ?? null,
            (v) => (chest.slots[i] = v),
            rc,
            rerender
          );
        })
      );
    }
  }

  private renderMerchantSection(upper: HTMLElement, rerender: () => void): void {
    upper.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:8px;max-height:190px;overflow-y:auto;"></div>
    `;
    const wrap = upper.firstElementChild as HTMLDivElement;
    for (const offer of MERCHANT_TRADES) {
      const canAfford = this.inventory.countItem(offer.costItemId) >= offer.costCount;
      const costDef = getBlockOrItem(offer.costItemId);
      const rewDef = getBlockOrItem(offer.rewardItemId);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `voxel-btn ${canAfford ? 'primary' : ''}`;
      btn.style.cssText = `justify-content:space-between;padding:8px 10px;opacity:${canAfford ? '1' : '0.5'};`;
      btn.innerHTML = `
        <span style="display:flex;align-items:center;gap:4px;font-size:12px;">
          <img src="${this.atlas.getItemIcon(offer.costItemId)}" style="width:24px;height:24px;" />
          x${offer.costCount}
        </span>
        <span>➔</span>
        <span style="display:flex;align-items:center;gap:4px;font-size:12px;">
          <img src="${this.atlas.getItemIcon(offer.rewardItemId)}" style="width:24px;height:24px;" />
          x${offer.rewardCount} ${rewDef.name.split(' ')[0]}
        </span>
      `;
      btn.title = `Échanger ${offer.costCount} ${costDef.name} contre ${offer.rewardCount} ${rewDef.name}`;
      btn.addEventListener('click', () => {
        if (this.inventory.removeItemCount(offer.costItemId, offer.costCount)) {
          this.inventory.addItem(
            offer.rewardItemId,
            offer.rewardCount,
            rewDef.maxDurability > 0 ? rewDef.maxDurability : undefined
          );
          this.onCraftSuccessSound?.();
          rerender();
        }
      });
      wrap.appendChild(btn);
    }
  }
}
