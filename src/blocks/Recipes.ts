import { BlockId, ItemId, isLogId, isPlanksId } from './BlockRegistry';

export const ANY_PLANKS = -1;
export const ANY_LOG = -2;

export interface CraftingRecipe {
  id: string;
  name: string;
  requires3x3: boolean;
  width: number;
  height: number;
  pattern: number[];
  resultId: number;
  resultCount: number;
}

export interface SmeltingRecipe {
  inputId: number;
  outputId: number;
  outputCount: number;
  cookTimeSec: number;
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  // Logs -> 4 Planks
  { id: 'oak_planks', name: 'Planches de Chêne (x4)', requires3x3: false, width: 1, height: 1, pattern: [BlockId.OAK_LOG], resultId: BlockId.OAK_PLANKS, resultCount: 4 },
  { id: 'birch_planks', name: 'Planches de Bouleau (x4)', requires3x3: false, width: 1, height: 1, pattern: [BlockId.BIRCH_LOG], resultId: BlockId.BIRCH_PLANKS, resultCount: 4 },
  { id: 'spruce_planks', name: 'Planches de Sapin (x4)', requires3x3: false, width: 1, height: 1, pattern: [BlockId.SPRUCE_LOG], resultId: BlockId.SPRUCE_PLANKS, resultCount: 4 },

  // Sticks, Crafting Table, Torches, Lantern
  { id: 'sticks', name: 'Bâtons (x4)', requires3x3: false, width: 1, height: 2, pattern: [ANY_PLANKS, ANY_PLANKS], resultId: ItemId.STICK, resultCount: 4 },
  { id: 'crafting_table', name: 'Table de Craft', requires3x3: false, width: 2, height: 2, pattern: [ANY_PLANKS, ANY_PLANKS, ANY_PLANKS, ANY_PLANKS], resultId: BlockId.CRAFTING_TABLE, resultCount: 1 },
  { id: 'torches', name: 'Torches (x4)', requires3x3: false, width: 1, height: 2, pattern: [ItemId.COAL, ItemId.STICK], resultId: BlockId.TORCH, resultCount: 4 },
  { id: 'lantern', name: 'Lanterne Forgée (x2)', requires3x3: false, width: 1, height: 2, pattern: [ItemId.IRON_INGOT, BlockId.TORCH], resultId: BlockId.LANTERN, resultCount: 2 },

  // Decorative & Architectural Blocks (2x2 & 3x3)
  { id: 'sandstone', name: 'Grès Ciselé', requires3x3: false, width: 2, height: 2, pattern: [BlockId.SAND, BlockId.SAND, BlockId.SAND, BlockId.SAND], resultId: BlockId.SANDSTONE, resultCount: 1 },
  { id: 'stone_bricks', name: 'Briques de Pierre (x4)', requires3x3: false, width: 2, height: 2, pattern: [BlockId.STONE, BlockId.STONE, BlockId.STONE, BlockId.STONE], resultId: BlockId.STONE_BRICKS, resultCount: 4 },
  { id: 'marble_craft', name: 'Marbre Blanc Ciselé (x4)', requires3x3: false, width: 2, height: 2, pattern: [BlockId.STONE, BlockId.SAND, BlockId.SAND, BlockId.STONE], resultId: BlockId.MARBLE, resultCount: 4 },
  { id: 'basalt_craft', name: 'Basalte Noir Poli (x4)', requires3x3: false, width: 2, height: 2, pattern: [BlockId.COBBLESTONE, ItemId.COAL, ItemId.COAL, BlockId.COBBLESTONE], resultId: BlockId.POLISHED_BASALT, resultCount: 4 },
  { id: 'mossy_craft', name: 'Pierre Moussue (x2)', requires3x3: false, width: 2, height: 1, pattern: [BlockId.COBBLESTONE, BlockId.OAK_LEAVES], resultId: BlockId.MOSSY_COBBLESTONE, resultCount: 2 },
  { id: 'bricks_block', name: 'Bloc de Briques', requires3x3: false, width: 2, height: 2, pattern: [ItemId.BRICK, ItemId.BRICK, ItemId.BRICK, ItemId.BRICK], resultId: BlockId.BRICKS, resultCount: 1 },
  { id: 'glowstone_craft', name: 'Glowstone', requires3x3: false, width: 2, height: 2, pattern: [BlockId.TORCH, BlockId.TORCH, BlockId.TORCH, BlockId.GLASS], resultId: BlockId.GLOWSTONE, resultCount: 1 },
  { id: 'slime_block', name: 'Bloc de Slime Trampoline', requires3x3: false, width: 2, height: 2, pattern: [ItemId.SLIMEBALL, ItemId.SLIMEBALL, ItemId.SLIMEBALL, ItemId.SLIMEBALL], resultId: BlockId.SLIME_BLOCK, resultCount: 1 },
  { id: 'bookshelf', name: 'Bibliothèque Ancienne', requires3x3: true, width: 3, height: 3, pattern: [ANY_PLANKS, ANY_PLANKS, ANY_PLANKS, ItemId.STICK, ANY_PLANKS, ItemId.STICK, ANY_PLANKS, ANY_PLANKS, ANY_PLANKS], resultId: BlockId.BOOKSHELF, resultCount: 1 },

  // Mineral Blocks (3x3)
  { id: 'iron_block', name: 'Bloc d\'Acier Forgé', requires3x3: true, width: 3, height: 3, pattern: new Array(9).fill(ItemId.IRON_INGOT), resultId: BlockId.IRON_BLOCK, resultCount: 1 },
  { id: 'gold_block', name: 'Bloc d\'Or Massif', requires3x3: true, width: 3, height: 3, pattern: new Array(9).fill(ItemId.GOLD_INGOT), resultId: BlockId.GOLD_BLOCK, resultCount: 1 },
  { id: 'diamond_block', name: 'Bloc de Diamant Pur', requires3x3: true, width: 3, height: 3, pattern: new Array(9).fill(ItemId.DIAMOND), resultId: BlockId.DIAMOND_BLOCK, resultCount: 1 },
  { id: 'emerald_block', name: 'Bloc d\'Émeraude Royale', requires3x3: true, width: 3, height: 3, pattern: new Array(9).fill(ItemId.EMERALD), resultId: BlockId.EMERALD_BLOCK, resultCount: 1 },

  // Utility Blocks
  { id: 'furnace', name: 'Fourneau', requires3x3: true, width: 3, height: 3, pattern: [BlockId.COBBLESTONE, BlockId.COBBLESTONE, BlockId.COBBLESTONE, BlockId.COBBLESTONE, 0, BlockId.COBBLESTONE, BlockId.COBBLESTONE, BlockId.COBBLESTONE, BlockId.COBBLESTONE], resultId: BlockId.FURNACE_OFF, resultCount: 1 },
  { id: 'chest', name: 'Coffre de Stockage', requires3x3: true, width: 3, height: 3, pattern: [ANY_PLANKS, ANY_PLANKS, ANY_PLANKS, ANY_PLANKS, 0, ANY_PLANKS, ANY_PLANKS, ANY_PLANKS, ANY_PLANKS], resultId: BlockId.CHEST, resultCount: 1 },
  { id: 'tnt', name: 'TNT Explosive', requires3x3: true, width: 3, height: 3, pattern: [ItemId.COAL, BlockId.SAND, ItemId.COAL, BlockId.SAND, ItemId.COAL, BlockId.SAND, ItemId.COAL, BlockId.SAND, ItemId.COAL], resultId: BlockId.TNT, resultCount: 1 },

  // Weapons, Gadgets, Buckets, Armor & Food
  { id: 'bow', name: 'Arc Chasseur', requires3x3: true, width: 2, height: 3, pattern: [ItemId.STICK, ItemId.FLINT, ItemId.STICK, ItemId.STICK, ItemId.STICK, ItemId.FLINT], resultId: ItemId.BOW, resultCount: 1 },
  { id: 'arrows', name: 'Flèches Empennées (x8)', requires3x3: false, width: 1, height: 2, pattern: [ItemId.FLINT, ItemId.STICK], resultId: ItemId.ARROW, resultCount: 8 },
  { id: 'grappling_hook', name: 'Grappin Véloce', requires3x3: true, width: 3, height: 3, pattern: [0, ItemId.IRON_INGOT, ItemId.IRON_INGOT, 0, ItemId.STICK, ItemId.IRON_INGOT, ItemId.STICK, 0, 0], resultId: ItemId.GRAPPLING_HOOK, resultCount: 1 },
  { id: 'excavator_hammer', name: 'Marteau d\'Excavation 3x3', requires3x3: true, width: 3, height: 3, pattern: [BlockId.IRON_BLOCK, ItemId.DIAMOND, BlockId.IRON_BLOCK, 0, ItemId.STICK, 0, 0, ItemId.STICK, 0], resultId: ItemId.EXCAVATOR_HAMMER, resultCount: 1 },
  { id: 'bucket', name: 'Seau en Fer Vide', requires3x3: true, width: 3, height: 2, pattern: [ItemId.IRON_INGOT, 0, ItemId.IRON_INGOT, 0, ItemId.IRON_INGOT, 0], resultId: ItemId.BUCKET_EMPTY, resultCount: 1 },
  { id: 'iron_armor', name: 'Armure Complète en Fer', requires3x3: true, width: 3, height: 3, pattern: [ItemId.IRON_INGOT, 0, ItemId.IRON_INGOT, ItemId.IRON_INGOT, ItemId.IRON_INGOT, ItemId.IRON_INGOT, ItemId.IRON_INGOT, ItemId.IRON_INGOT, ItemId.IRON_INGOT], resultId: ItemId.IRON_ARMOR, resultCount: 1 },
  { id: 'diamond_armor', name: 'Armure Royale en Diamant', requires3x3: true, width: 3, height: 3, pattern: [ItemId.DIAMOND, 0, ItemId.DIAMOND, ItemId.DIAMOND, ItemId.DIAMOND, ItemId.DIAMOND, ItemId.DIAMOND, ItemId.DIAMOND, ItemId.DIAMOND], resultId: ItemId.DIAMOND_ARMOR, resultCount: 1 },
  { id: 'golden_apple', name: 'Pomme Dorée Enchantée', requires3x3: true, width: 3, height: 3, pattern: [ItemId.GOLD_INGOT, ItemId.GOLD_INGOT, ItemId.GOLD_INGOT, ItemId.GOLD_INGOT, ItemId.APPLE, ItemId.GOLD_INGOT, ItemId.GOLD_INGOT, ItemId.GOLD_INGOT, ItemId.GOLD_INGOT], resultId: ItemId.GOLDEN_APPLE, resultCount: 1 },
  { id: 'companion_horn', name: 'Cor d\'Agent Compagnon', requires3x3: true, width: 3, height: 2, pattern: [ANY_PLANKS, ItemId.IRON_INGOT, ANY_PLANKS, 0, ItemId.STICK, 0], resultId: ItemId.COMPANION_HORN, resultCount: 1 },
  { id: 'architect_wand', name: 'Baguette d\'Architecte', requires3x3: true, width: 1, height: 3, pattern: [ItemId.EMERALD, ItemId.GOLD_INGOT, ItemId.STICK], resultId: ItemId.ARCHITECT_WAND, resultCount: 1 },
  { id: 'bread', name: 'Pain Doré (x2)', requires3x3: true, width: 3, height: 1, pattern: [ItemId.APPLE, ItemId.COAL, ItemId.APPLE], resultId: ItemId.BREAD, resultCount: 2 },

  // ==================== TOOLS: WOOD / STONE / IRON / DIAMOND ====================
  { id: 'wood_pickaxe', name: 'Pioche en Bois', requires3x3: true, width: 3, height: 3, pattern: [ANY_PLANKS, ANY_PLANKS, ANY_PLANKS, 0, ItemId.STICK, 0, 0, ItemId.STICK, 0], resultId: ItemId.WOOD_PICKAXE, resultCount: 1 },
  { id: 'wood_axe', name: 'Hache en Bois', requires3x3: true, width: 2, height: 3, pattern: [ANY_PLANKS, ANY_PLANKS, ANY_PLANKS, ItemId.STICK, 0, ItemId.STICK], resultId: ItemId.WOOD_AXE, resultCount: 1 },
  { id: 'wood_shovel', name: 'Pelle en Bois', requires3x3: true, width: 1, height: 3, pattern: [ANY_PLANKS, ItemId.STICK, ItemId.STICK], resultId: ItemId.WOOD_SHOVEL, resultCount: 1 },
  { id: 'wood_sword', name: 'Épée en Bois', requires3x3: true, width: 1, height: 3, pattern: [ANY_PLANKS, ANY_PLANKS, ItemId.STICK], resultId: ItemId.WOOD_SWORD, resultCount: 1 },

  { id: 'stone_pickaxe', name: 'Pioche en Pierre', requires3x3: true, width: 3, height: 3, pattern: [BlockId.COBBLESTONE, BlockId.COBBLESTONE, BlockId.COBBLESTONE, 0, ItemId.STICK, 0, 0, ItemId.STICK, 0], resultId: ItemId.STONE_PICKAXE, resultCount: 1 },
  { id: 'stone_axe', name: 'Hache en Pierre', requires3x3: true, width: 2, height: 3, pattern: [BlockId.COBBLESTONE, BlockId.COBBLESTONE, BlockId.COBBLESTONE, ItemId.STICK, 0, ItemId.STICK], resultId: ItemId.STONE_AXE, resultCount: 1 },
  { id: 'stone_shovel', name: 'Pelle en Pierre', requires3x3: true, width: 1, height: 3, pattern: [BlockId.COBBLESTONE, ItemId.STICK, ItemId.STICK], resultId: ItemId.STONE_SHOVEL, resultCount: 1 },
  { id: 'stone_sword', name: 'Épée en Pierre', requires3x3: true, width: 1, height: 3, pattern: [BlockId.COBBLESTONE, BlockId.COBBLESTONE, ItemId.STICK], resultId: ItemId.STONE_SWORD, resultCount: 1 },

  { id: 'iron_pickaxe', name: 'Pioche en Fer', requires3x3: true, width: 3, height: 3, pattern: [ItemId.IRON_INGOT, ItemId.IRON_INGOT, ItemId.IRON_INGOT, 0, ItemId.STICK, 0, 0, ItemId.STICK, 0], resultId: ItemId.IRON_PICKAXE, resultCount: 1 },
  { id: 'iron_axe', name: 'Hache en Fer', requires3x3: true, width: 2, height: 3, pattern: [ItemId.IRON_INGOT, ItemId.IRON_INGOT, ItemId.IRON_INGOT, ItemId.STICK, 0, ItemId.STICK], resultId: ItemId.IRON_AXE, resultCount: 1 },
  { id: 'iron_shovel', name: 'Pelle en Fer', requires3x3: true, width: 1, height: 3, pattern: [ItemId.IRON_INGOT, ItemId.STICK, ItemId.STICK], resultId: ItemId.IRON_SHOVEL, resultCount: 1 },
  { id: 'iron_sword', name: 'Épée en Fer', requires3x3: true, width: 1, height: 3, pattern: [ItemId.IRON_INGOT, ItemId.IRON_INGOT, ItemId.STICK], resultId: ItemId.IRON_SWORD, resultCount: 1 },

  { id: 'diamond_pickaxe', name: 'Pioche en Diamant', requires3x3: true, width: 3, height: 3, pattern: [ItemId.DIAMOND, ItemId.DIAMOND, ItemId.DIAMOND, 0, ItemId.STICK, 0, 0, ItemId.STICK, 0], resultId: ItemId.DIAMOND_PICKAXE, resultCount: 1 },
  { id: 'diamond_axe', name: 'Hache en Diamant', requires3x3: true, width: 2, height: 3, pattern: [ItemId.DIAMOND, ItemId.DIAMOND, ItemId.DIAMOND, ItemId.STICK, 0, ItemId.STICK], resultId: ItemId.DIAMOND_AXE, resultCount: 1 },
  { id: 'diamond_shovel', name: 'Pelle en Diamant', requires3x3: true, width: 1, height: 3, pattern: [ItemId.DIAMOND, ItemId.STICK, ItemId.STICK], resultId: ItemId.DIAMOND_SHOVEL, resultCount: 1 },
  { id: 'diamond_sword', name: 'Épée en Diamant', requires3x3: true, width: 1, height: 3, pattern: [ItemId.DIAMOND, ItemId.DIAMOND, ItemId.STICK], resultId: ItemId.DIAMOND_SWORD, resultCount: 1 },
];

export const SMELTING_RECIPES: SmeltingRecipe[] = [
  { inputId: BlockId.IRON_ORE, outputId: ItemId.IRON_INGOT, outputCount: 1, cookTimeSec: 5 },
  { inputId: BlockId.GOLD_ORE, outputId: ItemId.GOLD_INGOT, outputCount: 1, cookTimeSec: 5 },
  { inputId: BlockId.SAND, outputId: BlockId.GLASS, outputCount: 1, cookTimeSec: 4 },
  { inputId: BlockId.COBBLESTONE, outputId: BlockId.STONE, outputCount: 1, cookTimeSec: 4 },
  { inputId: BlockId.DIRT, outputId: ItemId.BRICK, outputCount: 1, cookTimeSec: 4 },
  { inputId: BlockId.GRAVEL, outputId: ItemId.FLINT, outputCount: 1, cookTimeSec: 3 },
  { inputId: BlockId.CACTUS, outputId: ItemId.SLIMEBALL, outputCount: 1, cookTimeSec: 4 },
  { inputId: BlockId.OAK_LOG, outputId: ItemId.COAL, outputCount: 1, cookTimeSec: 4 },
  { inputId: BlockId.BIRCH_LOG, outputId: ItemId.COAL, outputCount: 1, cookTimeSec: 4 },
  { inputId: BlockId.SPRUCE_LOG, outputId: ItemId.COAL, outputCount: 1, cookTimeSec: 4 },
  { inputId: ItemId.RAW_PORK, outputId: ItemId.COOKED_PORK, outputCount: 1, cookTimeSec: 4 },
  { inputId: ItemId.RAW_BEEF, outputId: ItemId.COOKED_BEEF, outputCount: 1, cookTimeSec: 4 },
  { inputId: ItemId.RAW_MUTTON, outputId: ItemId.COOKED_MUTTON, outputCount: 1, cookTimeSec: 4 },
];

export function getFuelBurnSeconds(itemId: number): number {
  if (itemId === ItemId.BUCKET_LAVA) return 120;
  if (itemId === ItemId.COAL) return 32;
  if (isLogId(itemId)) return 15;
  if (isPlanksId(itemId) || itemId === BlockId.CRAFTING_TABLE || itemId === BlockId.CHEST) return 10;
  if (itemId === ItemId.STICK) return 4;
  return 0;
}

export function getSmeltingRecipe(inputId: number): SmeltingRecipe | undefined {
  return SMELTING_RECIPES.find((r) => r.inputId === inputId);
}

export function matchesIngredient(slotItemId: number, expected: number): boolean {
  if (expected === 0) return slotItemId === 0;
  if (slotItemId === 0) return false;
  if (expected === ANY_PLANKS) return isPlanksId(slotItemId);
  if (expected === ANY_LOG) return isLogId(slotItemId);
  return slotItemId === expected;
}

export function matchCraftingGrid(gridIds: number[], gridSize: 2 | 3): CraftingRecipe | null {
  let minX: number = gridSize;
  let minY: number = gridSize;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const id = gridIds[y * gridSize + x] ?? 0;
      if (id !== 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;

  for (const recipe of CRAFTING_RECIPES) {
    if (recipe.requires3x3 && gridSize < 3) continue;
    if (recipe.width !== boxW || recipe.height !== boxH) continue;

    let ok = true;
    for (let ry = 0; ry < boxH && ok; ry++) {
      for (let rx = 0; rx < boxW; rx++) {
        const actual = gridIds[(minY + ry) * gridSize + (minX + rx)] ?? 0;
        const expected = recipe.pattern[ry * boxW + rx]!;
        if (!matchesIngredient(actual, expected)) {
          ok = false;
          break;
        }
      }
    }
    if (ok) return recipe;

    if (boxW > 1) {
      let mirrorOk = true;
      for (let ry = 0; ry < boxH && mirrorOk; ry++) {
        for (let rx = 0; rx < boxW; rx++) {
          const actual = gridIds[(minY + ry) * gridSize + (minX + rx)] ?? 0;
          const expected = recipe.pattern[ry * boxW + (boxW - 1 - rx)]!;
          if (!matchesIngredient(actual, expected)) {
            mirrorOk = false;
            break;
          }
        }
      }
      if (mirrorOk) return recipe;
    }
  }

  return null;
}

export interface IngredientRequirement {
  expected: number;
  count: number;
}

export function getRecipeRequirements(recipe: CraftingRecipe): IngredientRequirement[] {
  const map = new Map<number, number>();
  for (const code of recipe.pattern) {
    if (code === 0) continue;
    map.set(code, (map.get(code) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([expected, count]) => ({ expected, count }));
}
