import {
  BlockId,
  getBlockOrItem,
  ItemId,
} from '../blocks/BlockRegistry';
import {
  getRecipeRequirements,
  matchCraftingGrid,
  matchesIngredient,
  type CraftingRecipe,
} from '../blocks/Recipes';
import type { GameMode } from './PlayerController';
import type { StackSlot } from '../world/WorldManager';

export const HOTBAR_SIZE = 9;
export const INVENTORY_TOTAL_SLOTS = 36;

export class InventoryManager {
  public readonly slots: Array<StackSlot | null> = new Array(INVENTORY_TOTAL_SLOTS).fill(null);
  public selectedHotbar = 0;
  public cursorStack: StackSlot | null = null;
  public readonly craftGrid: Array<StackSlot | null> = new Array(9).fill(null);

  private readonly changeListeners: Array<() => void> = [];

  constructor() {
    this.giveStarterKit('survival');
  }

  public onChange(cb: () => void): void {
    this.changeListeners.push(cb);
  }

  public notifyChanged(): void {
    for (const cb of this.changeListeners) {
      cb();
    }
  }

  public giveStarterKit(mode: GameMode): void {
    this.slots.fill(null);
    if (mode === 'creative' || mode === 'spectator') {
      this.slots[0] = { itemId: ItemId.ARCHITECT_WAND, count: 1 };
      this.slots[1] = { itemId: ItemId.GRAPPLING_HOOK, count: 1, durability: 250 };
      this.slots[2] = { itemId: ItemId.EXCAVATOR_HAMMER, count: 1, durability: 800 };
      this.slots[3] = { itemId: BlockId.MARBLE, count: 64 };
      this.slots[4] = { itemId: BlockId.LANTERN, count: 64 };
      this.slots[5] = { itemId: BlockId.SLIME_BLOCK, count: 64 };
      this.slots[6] = { itemId: ItemId.BUCKET_WATER, count: 1 };
      this.slots[7] = { itemId: BlockId.TNT, count: 64 };
      this.slots[8] = { itemId: ItemId.COMPANION_HORN, count: 8 };
    } else if (mode === 'bastion') {
      this.slots[0] = { itemId: ItemId.IRON_SWORD, count: 1, durability: 250 };
      this.slots[1] = { itemId: ItemId.BOW, count: 1, durability: 384 };
      this.slots[2] = { itemId: ItemId.GRAPPLING_HOOK, count: 1, durability: 250 };
      this.slots[3] = { itemId: BlockId.STONE_BRICKS, count: 64 };
      this.slots[4] = { itemId: BlockId.LANTERN, count: 24 };
      this.slots[5] = { itemId: ItemId.GOLDEN_APPLE, count: 3 };
      this.slots[6] = { itemId: ItemId.COOKED_BEEF, count: 12 };
      this.slots[7] = { itemId: ItemId.COMPANION_HORN, count: 3 };
      this.slots[8] = { itemId: ItemId.ARROW, count: 48 };
    } else if (mode === 'hardcore') {
      this.slots[0] = { itemId: ItemId.STONE_PICKAXE, count: 1, durability: 132 };
      this.slots[1] = { itemId: ItemId.STONE_SWORD, count: 1, durability: 132 };
      this.slots[2] = { itemId: ItemId.BOW, count: 1, durability: 384 };
      this.slots[3] = { itemId: BlockId.TORCH, count: 8 };
      this.slots[4] = { itemId: ItemId.BREAD, count: 4 };
      this.slots[5] = { itemId: ItemId.ARROW, count: 16 };
    } else {
      // Rich Survival Starter Kit with tools, bow, grappling hook, lantern & companion horn!
      this.slots[0] = { itemId: ItemId.IRON_PICKAXE, count: 1, durability: 250 };
      this.slots[1] = { itemId: ItemId.IRON_AXE, count: 1, durability: 250 };
      this.slots[2] = { itemId: ItemId.IRON_SWORD, count: 1, durability: 250 };
      this.slots[3] = { itemId: ItemId.BOW, count: 1, durability: 384 };
      this.slots[4] = { itemId: ItemId.GRAPPLING_HOOK, count: 1, durability: 250 };
      this.slots[5] = { itemId: BlockId.LANTERN, count: 12 };
      this.slots[6] = { itemId: ItemId.BUCKET_EMPTY, count: 1 };
      this.slots[7] = { itemId: ItemId.BREAD, count: 8 };
      this.slots[8] = { itemId: ItemId.COMPANION_HORN, count: 2 };
      this.slots[9] = { itemId: ItemId.ARROW, count: 24 };
      this.slots[10] = { itemId: BlockId.SLIME_BLOCK, count: 6 };
      this.slots[11] = { itemId: ItemId.ARCHITECT_WAND, count: 1 };
    }
    this.notifyChanged();
  }

  public getHeldStack(): StackSlot | null {
    return this.slots[this.selectedHotbar] ?? null;
  }

  public setHeldStack(stack: StackSlot | null): void {
    this.slots[this.selectedHotbar] = stack;
    this.notifyChanged();
  }

  public selectHotbar(idx: number): void {
    this.selectedHotbar = ((idx % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.notifyChanged();
  }

  public cycleHotbar(delta: number): void {
    this.selectHotbar(this.selectedHotbar + delta);
  }

  public addItem(itemId: number, count = 1, durability?: number): number {
    if (itemId <= 0 || count <= 0) return 0;
    const def = getBlockOrItem(itemId);
    let remaining = count;

    if (def.maxStack > 1) {
      for (let i = 0; i < INVENTORY_TOTAL_SLOTS && remaining > 0; i++) {
        const s = this.slots[i];
        if (s && s.itemId === itemId && s.count < def.maxStack) {
          const space = def.maxStack - s.count;
          const add = Math.min(space, remaining);
          s.count += add;
          remaining -= add;
        }
      }
    }

    for (let i = 0; i < INVENTORY_TOTAL_SLOTS && remaining > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(def.maxStack, remaining);
        this.slots[i] = {
          itemId,
          count: add,
          durability: durability ?? (def.maxDurability > 0 ? def.maxDurability : undefined),
        };
        remaining -= add;
      }
    }

    this.notifyChanged();
    return count - remaining;
  }

  public consumeHeldItem(amount = 1, infiniteMode = false): boolean {
    const cur = this.slots[this.selectedHotbar];
    if (!cur || cur.count < amount) return false;
    if (infiniteMode) return true;
    cur.count -= amount;
    if (cur.count <= 0) {
      this.slots[this.selectedHotbar] = null;
    }
    this.notifyChanged();
    return true;
  }

  public damageHeldTool(amount = 1, infiniteMode = false): void {
    if (infiniteMode) return;
    const cur = this.slots[this.selectedHotbar];
    if (!cur) return;
    const def = getBlockOrItem(cur.itemId);
    if (def.maxDurability <= 0) return;
    cur.durability = (cur.durability ?? def.maxDurability) - amount;
    if (cur.durability <= 0) {
      this.slots[this.selectedHotbar] = null;
    }
    this.notifyChanged();
  }

  public pickBlockIntoHotbar(blockId: number, creativeMode: boolean): void {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (this.slots[i]?.itemId === blockId) {
        this.selectHotbar(i);
        return;
      }
    }
    for (let i = HOTBAR_SIZE; i < INVENTORY_TOTAL_SLOTS; i++) {
      if (this.slots[i]?.itemId === blockId) {
        const tmp = this.slots[this.selectedHotbar] ?? null;
        this.slots[this.selectedHotbar] = this.slots[i] ?? null;
        this.slots[i] = tmp;
        this.notifyChanged();
        return;
      }
    }
    if (creativeMode) {
      this.slots[this.selectedHotbar] = { itemId: blockId, count: 64 };
      this.notifyChanged();
    }
  }

  public getCraftOutput(gridSize: 2 | 3): CraftingRecipe | null {
    const ids: number[] = [];
    if (gridSize === 2) {
      ids.push(
        this.craftGrid[0]?.itemId ?? 0,
        this.craftGrid[1]?.itemId ?? 0,
        this.craftGrid[3]?.itemId ?? 0,
        this.craftGrid[4]?.itemId ?? 0
      );
    } else {
      for (let i = 0; i < 9; i++) {
        ids.push(this.craftGrid[i]?.itemId ?? 0);
      }
    }
    return matchCraftingGrid(ids, gridSize);
  }

  public takeCraftGridOutput(gridSize: 2 | 3): boolean {
    const recipe = this.getCraftOutput(gridSize);
    if (!recipe) return false;

    const outDef = getBlockOrItem(recipe.resultId);
    if (this.cursorStack) {
      if (
        this.cursorStack.itemId !== recipe.resultId ||
        this.cursorStack.count + recipe.resultCount > outDef.maxStack
      ) {
        return false;
      }
      this.cursorStack.count += recipe.resultCount;
    } else {
      this.cursorStack = {
        itemId: recipe.resultId,
        count: recipe.resultCount,
        durability: outDef.maxDurability > 0 ? outDef.maxDurability : undefined,
      };
    }

    const indices = gridSize === 2 ? [0, 1, 3, 4] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (const idx of indices) {
      const s = this.craftGrid[idx];
      if (s) {
        s.count--;
        if (s.count <= 0) this.craftGrid[idx] = null;
      }
    }
    this.notifyChanged();
    return true;
  }

  public returnCraftGridToInventory(): void {
    for (let i = 0; i < 9; i++) {
      const s = this.craftGrid[i];
      if (s) {
        this.addItem(s.itemId, s.count, s.durability);
        this.craftGrid[i] = null;
      }
    }
    if (this.cursorStack) {
      this.addItem(this.cursorStack.itemId, this.cursorStack.count, this.cursorStack.durability);
      this.cursorStack = null;
    }
    this.notifyChanged();
  }

  public canCraftFromInventory(recipe: CraftingRecipe, has3x3Table: boolean): boolean {
    if (recipe.requires3x3 && !has3x3Table) return false;
    const reqs = getRecipeRequirements(recipe);
    for (const req of reqs) {
      let available = 0;
      for (const s of this.slots) {
        if (s && matchesIngredient(s.itemId, req.expected)) {
          available += s.count;
        }
      }
      if (available < req.count) return false;
    }
    return true;
  }

  public craftRecipeOneClick(recipe: CraftingRecipe, has3x3Table: boolean): boolean {
    if (!this.canCraftFromInventory(recipe, has3x3Table)) return false;

    const reqs = getRecipeRequirements(recipe);
    for (const req of reqs) {
      let toConsume = req.count;
      for (let i = 0; i < INVENTORY_TOTAL_SLOTS && toConsume > 0; i++) {
        const s = this.slots[i];
        if (s && matchesIngredient(s.itemId, req.expected)) {
          const take = Math.min(s.count, toConsume);
          s.count -= take;
          toConsume -= take;
          if (s.count <= 0) this.slots[i] = null;
        }
      }
    }

    const outDef = getBlockOrItem(recipe.resultId);
    this.addItem(
      recipe.resultId,
      recipe.resultCount,
      outDef.maxDurability > 0 ? outDef.maxDurability : undefined
    );
    return true;
  }

  public countItem(itemId: number): number {
    let sum = 0;
    for (const s of this.slots) {
      if (s && s.itemId === itemId) sum += s.count;
    }
    return sum;
  }

  public removeItemCount(itemId: number, count: number): boolean {
    if (this.countItem(itemId) < count) return false;
    let rem = count;
    for (let i = 0; i < INVENTORY_TOTAL_SLOTS && rem > 0; i++) {
      const s = this.slots[i];
      if (s && s.itemId === itemId) {
        const take = Math.min(s.count, rem);
        s.count -= take;
        rem -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.notifyChanged();
    return true;
  }

  public serialize(): Array<StackSlot | null> {
    return this.slots.map((s) => (s ? { ...s } : null));
  }

  public deserialize(saved: Array<StackSlot | null>): void {
    for (let i = 0; i < INVENTORY_TOTAL_SLOTS; i++) {
      const item = saved[i];
      this.slots[i] = item && item.count > 0 ? { ...item } : null;
    }
    this.notifyChanged();
  }
}
