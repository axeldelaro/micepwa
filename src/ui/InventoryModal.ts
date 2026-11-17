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
  private activeTab: 'recipes' | 'grid' | 'creative' = 'recipes';
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
    this.activeTab = gameMode === 'creative' ? 'creative' : 'recipes';
    this.activeFurnace = null;
    this.activeChest = null;
    this.activeMerchant = null;
    this.mountModal(gameMode);
  }

  public openCraftingTable(gameMode: GameMode): void {
    this.contextMode = 'crafting_table';
    this.activeTab = 'recipes';
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
    card.style.maxWidth = '560px';

    const cursorPreview = document.createElement('div');
    cursorPreview.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 95;
      width: 36px;
      height: 36px;
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
      <img src="${this.atlas.getItemIcon(cs.itemId)}" style="width:32px;height:32px;image-rendering:pixelated;" />
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

    let title = '🎒 Sac & Craft';
    if (this.contextMode === 'crafting_table') title = '🛠️ Atelier 3x3';
    else if (this.contextMode === 'furnace') title = '🔥 Fourneau';
    else if (this.contextMode === 'chest') title = '📦 Coffre';
    else if (this.contextMode === 'merchant') title = `💎 ${this.activeMerchant?.name ?? 'Marchand'}`;

    const heldCs = this.inventory.cursorStack;
    const touchSelectionBanner = heldCs
      ? `<div style="display:flex;align-items:center;gap:6px;background:rgba(250,204,21,0.16);border:1px solid #facc15;border-radius:8px;padding:3px 8px;font-size:11px;color:#fef08a;">
           <img src="${this.atlas.getItemIcon(heldCs.itemId)}" style="width:20px;height:20px;" />
           <span>×${heldCs.count} — touchez une case</span>
         </div>`
      : '';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <strong style="font-size:15px;">${title}</strong>
          <div id="inv-tabs-wrap" style="display:flex;gap:4px;"></div>
          ${touchSelectionBanner}
        </div>
        <button type="button" class="voxel-btn" id="btn-close-inv" style="padding:5px 10px;">✕</button>
      </div>

      <div id="inv-upper-section" style="margin-bottom:10px;"></div>

      <div style="border-top:1px solid #334155;padding-top:8px;display:flex;flex-direction:column;gap:6px;">
        <div id="inv-backpack-grid" class="inv-grid-9"></div>
        <div id="inv-hotbar-grid" class="inv-grid-9" style="padding-top:2px;border-top:1px dashed rgba(148,163,184,0.2);"></div>
      </div>
    `;

    card.querySelector('#btn-close-inv')!.addEventListener('click', () => this.close(true));

    // Clean segmented sub-tabs so 1-Click Recipes & Grid don't crowd side-by-side on narrow phones!
    if (this.contextMode === 'inventory' || this.contextMode === 'crafting_table') {
      const tabs = card.querySelector('#inv-tabs-wrap') as HTMLDivElement;
      const addTab = (id: 'recipes' | 'grid' | 'creative', label: string) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `voxel-btn ${this.activeTab === id ? 'primary' : ''}`;
        b.style.padding = '4px 8px';
        b.style.fontSize = '11px';
        b.textContent = label;
        b.addEventListener('click', () => {
          this.activeTab = id;
          rerender();
        });
        tabs.appendChild(b);
      };
      if (gameMode === 'creative') addTab('creative', '✨ Blocs');
      addTab('recipes', '📖 Recettes');
      addTab('grid', this.contextMode === 'crafting_table' ? '🛠️ 3x3' : '🛠️ 2x2');
    }

    const upper = card.querySelector('#inv-upper-section') as HTMLDivElement;

    if ((this.contextMode === 'inventory' || this.contextMode === 'crafting_table') && this.activeTab === 'creative' && gameMode === 'creative') {
      this.renderCreativeCatalogue(upper, rerender);
    } else if (this.contextMode === 'inventory' || this.contextMode === 'crafting_table') {
      const gs = this.contextMode === 'crafting_table' ? 3 : 2;
      if (this.activeTab === 'grid') {
        this.renderManualGrid(upper, gs, rerender);
      } else {
        this.renderRecipeBook(upper, gs === 3, rerender);
      }
    } else if (this.contextMode === 'furnace' && this.activeFurnace) {
      this.renderFurnaceSection(upper, this.activeFurnace, rerender);
    } else if (this.contextMode === 'chest' && this.activeChest) {
      this.renderChestSection(upper, this.activeChest, rerender);
    } else if (this.contextMode === 'merchant') {
      this.renderMerchantSection(upper, rerender);
    }

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
      <input type="text" id="inp-creative-search" class="voxel-input" placeholder="🔍 Rechercher..."
        value="${this.creativeSearchQuery}" style="width:100%;padding:6px 10px;font-size:13px;margin-bottom:6px;" />
      <div id="creative-items-grid" class="inv-grid-9" style="max-height:132px;overflow-y:auto;padding:2px;"></div>
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

  private renderRecipeBook(upper: HTMLElement, has3x3: boolean, rerender: () => void): void {
    upper.innerHTML = `
      <div id="recipe-book-list" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(128px, 1fr));gap:5px;max-height:135px;overflow-y:auto;background:rgba(9,13,22,0.65);padding:6px;border-radius:8px;border:1px solid #334155;"></div>
    `;
    const bookList = upper.querySelector('#recipe-book-list') as HTMLDivElement;
    const availableRecipes = CRAFTING_RECIPES.filter((r) => !r.requires3x3 || has3x3);
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
        padding: 5px 7px;
        justify-content: flex-start;
        font-size: 11px;
        opacity: ${craftable ? '1' : '0.45'};
      `;
      btn.innerHTML = `
        <img src="${this.atlas.getItemIcon(r.resultId)}" style="width:22px;height:22px;image-rendering:pixelated;flex-shrink:0;" />
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

  private renderManualGrid(upper: HTMLElement, gridSize: 2 | 3, rerender: () => void): void {
    upper.innerHTML = `
      <div style="background:rgba(9,13,22,0.7);border:1px solid #334155;border-radius:8px;padding:10px;display:flex;align-items:center;justify-content:center;gap:14px;">
        <div id="craft-input-grid" style="display:grid;grid-template-columns:repeat(${gridSize}, var(--slot-size));gap:4px;"></div>
        <div style="font-size:18px;color:#94a3b8;">➔</div>
        <div id="craft-output-holder"></div>
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
  }

  private renderFurnaceSection(upper: HTMLElement, f: FurnaceState, rerender: () => void): void {
    const burnPct = f.burnTotal > 0 ? Math.min(100, (f.burnRemaining / f.burnTotal) * 100) : 0;
    const cookPct = f.cookTotal > 0 ? Math.min(100, (f.cookProgress / f.cookTotal) * 100) : 0;

    upper.innerHTML = `
      <div style="background:rgba(9,13,22,0.75);border:1px solid #334155;border-radius:8px;padding:10px;display:flex;align-items:center;justify-content:center;gap:16px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div id="furn-input"></div>
          <div style="width:36px;height:6px;background:#1e293b;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${burnPct}%;background:#f97316;"></div>
          </div>
          <div id="furn-fuel"></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div>${f.burnRemaining > 0 ? '🔥' : '❄️'}</div>
          <div style="width:64px;height:10px;background:#1e293b;border-radius:5px;overflow:hidden;">
            <div style="height:100%;width:${cookPct}%;background:#4ade80;"></div>
          </div>
        </div>
        <div id="furn-output"></div>
      </div>
    `;

    upper.querySelector('#furn-input')!.appendChild(
      this.buildSlotElement(f.input, (rc) => {
        this.interactWithSlot(() => f.input, (v) => (f.input = v), rc, rerender);
      })
    );
    upper.querySelector('#furn-fuel')!.appendChild(
      this.buildSlotElement(f.fuel, (rc) => {
        this.interactWithSlot(() => f.fuel, (v) => (f.fuel = v), rc, rerender);
      })
    );
    upper.querySelector('#furn-output')!.appendChild(
      this.buildSlotElement(
        f.output,
        (rc) => {
          this.interactWithSlot(() => f.output, (v) => (f.output = v), rc, rerender);
        },
        Boolean(f.output)
      )
    );
  }

  private renderChestSection(upper: HTMLElement, chest: ChestState, rerender: () => void): void {
    upper.innerHTML = `
      <div id="chest-slots-grid" class="inv-grid-9" style="background:rgba(9,13,22,0.72);padding:6px;border-radius:8px;border:1px solid #334155;"></div>
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
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:6px;max-height:135px;overflow-y:auto;"></div>
    `;
    const wrap = upper.firstElementChild as HTMLDivElement;
    for (const offer of MERCHANT_TRADES) {
      const canAfford = this.inventory.countItem(offer.costItemId) >= offer.costCount;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `voxel-btn ${canAfford ? 'primary' : ''}`;
      btn.style.cssText = `justify-content:space-between;padding:6px 8px;opacity:${canAfford ? '1' : '0.45'};`;
      btn.innerHTML = `
        <span style="display:flex;align-items:center;gap:3px;font-size:11px;">
          <img src="${this.atlas.getItemIcon(offer.costItemId)}" style="width:20px;height:20px;" />×${offer.costCount}
        </span>
        <span>➔</span>
        <span style="display:flex;align-items:center;gap:3px;font-size:11px;">
          <img src="${this.atlas.getItemIcon(offer.rewardItemId)}" style="width:20px;height:20px;" />×${offer.rewardCount}
        </span>
      `;
      btn.addEventListener('click', () => {
        if (this.inventory.removeItemCount(offer.costItemId, offer.costCount)) {
          const rewDef = getBlockOrItem(offer.rewardItemId);
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
