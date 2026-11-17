export const enum TileId {
  GRASS_TOP = 0,
  GRASS_SIDE = 1,
  DIRT = 2,
  STONE = 3,
  COBBLESTONE = 4,
  SAND = 5,
  SANDSTONE_SIDE = 6,
  SANDSTONE_TOP = 7,
  GRAVEL = 8,
  OAK_LOG_SIDE = 9,
  OAK_LOG_TOP = 10,
  OAK_PLANKS = 11,
  OAK_LEAVES = 12,
  BIRCH_LOG_SIDE = 13,
  BIRCH_LOG_TOP = 14,
  BIRCH_PLANKS = 15,
  BIRCH_LEAVES = 16,
  SPRUCE_LOG_SIDE = 17,
  SPRUCE_LOG_TOP = 18,
  SPRUCE_PLANKS = 19,
  SPRUCE_LEAVES = 20,
  WATER = 21,
  LAVA = 22,
  GLASS = 23,
  BRICKS = 24,
  STONE_BRICKS = 25,
  SNOW = 26,
  SNOW_GRASS_SIDE = 27,
  ICE = 28,
  COAL_ORE = 29,
  IRON_ORE = 30,
  GOLD_ORE = 31,
  DIAMOND_ORE = 32,
  EMERALD_ORE = 33,
  BEDROCK = 34,
  CRAFTING_TOP = 35,
  CRAFTING_SIDE = 36,
  FURNACE_FRONT_OFF = 37,
  FURNACE_FRONT_ON = 38,
  FURNACE_SIDE = 39,
  FURNACE_TOP = 40,
  CHEST_FRONT = 41,
  CHEST_SIDE = 42,
  CHEST_TOP = 43,
  TNT_SIDE = 44,
  TNT_TOP = 45,
  TNT_BOTTOM = 46,
  GLOWSTONE = 47,
  TORCH = 48,
  CACTUS_SIDE = 49,
  CACTUS_TOP = 50,
  FLOWER_RED = 51,
  FLOWER_YELLOW = 52,
  TALL_GRASS = 53,
  CRACK_0 = 54,
  CRACK_1 = 55,
  CRACK_2 = 56,
  CRACK_3 = 57,
  CRACK_4 = 58,
  CRACK_5 = 59,
  CRACK_6 = 60,
  CRACK_7 = 61,
  CRACK_8 = 62,
  CRACK_9 = 63,
  // Ultimate Edition HD Blocks (64..76)
  OBSIDIAN = 64,
  BOOKSHELF_SIDE = 65,
  LANTERN = 66,
  MOSSY_COBBLESTONE = 67,
  MARBLE = 68,
  GOLD_BLOCK = 69,
  DIAMOND_BLOCK = 70,
  EMERALD_BLOCK = 71,
  IRON_BLOCK = 72,
  MAGMA_BLOCK = 73,
  SLIME_BLOCK = 74,
  POLISHED_BASALT = 75,
  AMETHYST_CRYSTAL = 76,
}

export const MAX_USED_TILE_ID = 76;
export const ATLAS_GRID_SIZE = 16; // 16x16 = 256 tile capacity on 2048x2048 power-of-two HD atlas

export const enum BlockId {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  COBBLESTONE = 4,
  SAND = 5,
  SANDSTONE = 6,
  GRAVEL = 7,
  OAK_LOG = 8,
  BIRCH_LOG = 9,
  SPRUCE_LOG = 10,
  OAK_PLANKS = 11,
  BIRCH_PLANKS = 12,
  SPRUCE_PLANKS = 13,
  OAK_LEAVES = 14,
  BIRCH_LEAVES = 15,
  SPRUCE_LEAVES = 16,
  WATER = 17,
  LAVA = 18,
  GLASS = 19,
  BRICKS = 20,
  STONE_BRICKS = 21,
  SNOW = 22,
  ICE = 23,
  COAL_ORE = 24,
  IRON_ORE = 25,
  GOLD_ORE = 26,
  DIAMOND_ORE = 27,
  EMERALD_ORE = 28,
  BEDROCK = 29,
  CRAFTING_TABLE = 30,
  FURNACE_OFF = 31,
  FURNACE_ON = 32,
  CHEST = 33,
  TNT = 34,
  GLOWSTONE = 35,
  TORCH = 36,
  CACTUS = 37,
  FLOWER_RED = 38,
  FLOWER_YELLOW = 39,
  TALL_GRASS = 40,
  SNOWY_GRASS = 41,
  // Ultimate Edition Blocks
  OBSIDIAN = 42,
  BOOKSHELF = 43,
  LANTERN = 44,
  MOSSY_COBBLESTONE = 45,
  MARBLE = 46,
  GOLD_BLOCK = 47,
  DIAMOND_BLOCK = 48,
  EMERALD_BLOCK = 49,
  IRON_BLOCK = 50,
  MAGMA_BLOCK = 51,
  SLIME_BLOCK = 52,
  POLISHED_BASALT = 53,
  AMETHYST_CRYSTAL = 54,
}

export const enum ItemId {
  STICK = 100,
  COAL = 101,
  IRON_INGOT = 102,
  GOLD_INGOT = 103,
  DIAMOND = 104,
  EMERALD = 105,
  BRICK = 106,
  FLINT = 107,

  RAW_PORK = 110,
  COOKED_PORK = 111,
  RAW_BEEF = 112,
  COOKED_BEEF = 113,
  APPLE = 114,
  BREAD = 115,
  RAW_MUTTON = 116,
  COOKED_MUTTON = 117,

  WOOD_PICKAXE = 120,
  WOOD_AXE = 121,
  WOOD_SHOVEL = 122,
  WOOD_SWORD = 123,

  STONE_PICKAXE = 124,
  STONE_AXE = 125,
  STONE_SHOVEL = 126,
  STONE_SWORD = 127,

  IRON_PICKAXE = 128,
  IRON_AXE = 129,
  IRON_SHOVEL = 130,
  IRON_SWORD = 131,

  DIAMOND_PICKAXE = 132,
  DIAMOND_AXE = 133,
  DIAMOND_SHOVEL = 134,
  DIAMOND_SWORD = 135,

  COMPANION_HORN = 140,
  BOW = 141,
  ARROW = 142,
  GRAPPLING_HOOK = 143,
  EXCAVATOR_HAMMER = 144,
  BUCKET_EMPTY = 145,
  BUCKET_WATER = 146,
  BUCKET_LAVA = 147,
  GOLDEN_APPLE = 148,
  IRON_ARMOR = 149,
  DIAMOND_ARMOR = 150,
  ARCHITECT_WAND = 151,
  SLIMEBALL = 152,
}

export type ToolType = 'none' | 'pickaxe' | 'axe' | 'shovel' | 'sword';
export type SoundGroup = 'grass' | 'stone' | 'wood' | 'sand' | 'water' | 'snow' | 'glass';
export type BlockRenderType = 'air' | 'solid' | 'liquid' | 'cutout' | 'cactus' | 'cross' | 'torch' | 'lantern';
export type ItemCategory = 'terrain' | 'wood' | 'mineral' | 'utility' | 'flora' | 'tool' | 'material' | 'food';
export type ItemIconShape =
  | 'block'
  | 'pickaxe'
  | 'axe'
  | 'shovel'
  | 'sword'
  | 'stick'
  | 'coal'
  | 'ingot'
  | 'gem'
  | 'meat'
  | 'apple'
  | 'bread'
  | 'horn'
  | 'bow'
  | 'arrow'
  | 'grapple'
  | 'hammer'
  | 'bucket'
  | 'armor'
  | 'wand';

export interface BlockFaces {
  top: number;
  bottom: number;
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ItemOrBlockDef {
  id: number;
  key: string;
  name: string;
  category: ItemCategory;
  isBlock: boolean;
  solid: boolean;
  opaque: boolean;
  renderType: BlockRenderType;
  lightEmission: number;
  lightAttenuation: number;
  hardness: number;
  preferredTool: ToolType;
  minToolTier: number;
  gravity: boolean;
  interactable: boolean;
  windSway: boolean;
  bouncy: boolean;
  soundGroup: SoundGroup;
  faces: BlockFaces;
  dropId: number;
  dropCount: number;
  maxStack: number;
  // Tool attributes
  toolType: ToolType;
  toolTier: number;
  toolSpeed: number;
  maxDurability: number;
  attackDamage: number;
  // Food & Armor attributes
  foodRestore: number;
  armorPoints: number;
  // Icon styling for non-block items
  iconShape: ItemIconShape;
  primaryColor: string;
  secondaryColor: string;
}

function allFaces(tile: number): BlockFaces {
  return { top: tile, bottom: tile, north: tile, south: tile, east: tile, west: tile };
}

function topBottomSide(top: number, bottom: number, side: number): BlockFaces {
  return { top, bottom, north: side, south: side, east: side, west: side };
}

function frontBox(top: number, bottom: number, front: number, side: number): BlockFaces {
  return { top, bottom, north: front, south: side, east: side, west: side };
}

const REGISTRY = new Map<number, ItemOrBlockDef>();
const FAST_BLOCKS: (ItemOrBlockDef | undefined)[] = new Array(256);

function register(partial: Partial<ItemOrBlockDef> & { id: number; key: string; name: string }): void {
  const isBlock = partial.isBlock ?? partial.id < 100;
  const def: ItemOrBlockDef = {
    id: partial.id,
    key: partial.key,
    name: partial.name,
    category: partial.category ?? (isBlock ? 'terrain' : 'material'),
    isBlock,
    solid: partial.solid ?? isBlock,
    opaque: partial.opaque ?? isBlock,
    renderType: partial.renderType ?? (isBlock ? 'solid' : 'air'),
    lightEmission: partial.lightEmission ?? 0,
    lightAttenuation: partial.lightAttenuation ?? (partial.opaque === false ? 1 : 15),
    hardness: partial.hardness ?? 1.0,
    preferredTool: partial.preferredTool ?? 'none',
    minToolTier: partial.minToolTier ?? 0,
    gravity: partial.gravity ?? false,
    interactable: partial.interactable ?? false,
    windSway: partial.windSway ?? false,
    bouncy: partial.bouncy ?? false,
    soundGroup: partial.soundGroup ?? 'stone',
    faces: partial.faces ?? allFaces(TileId.STONE),
    dropId: partial.dropId ?? partial.id,
    dropCount: partial.dropCount ?? 1,
    maxStack: partial.maxStack ?? 64,
    toolType: partial.toolType ?? 'none',
    toolTier: partial.toolTier ?? 0,
    toolSpeed: partial.toolSpeed ?? 1,
    maxDurability: partial.maxDurability ?? 0,
    attackDamage: partial.attackDamage ?? 1,
    foodRestore: partial.foodRestore ?? 0,
    armorPoints: partial.armorPoints ?? 0,
    iconShape: partial.iconShape ?? 'block',
    primaryColor: partial.primaryColor ?? '#ffffff',
    secondaryColor: partial.secondaryColor ?? '#8b5a2b',
  };
  REGISTRY.set(def.id, def);
  if (def.id >= 0 && def.id < 256) {
    FAST_BLOCKS[def.id] = def;
  }
}

// ==================== BLOCKS ====================
register({ id: BlockId.AIR, key: 'air', name: 'Air', solid: false, opaque: false, renderType: 'air', lightAttenuation: 1, hardness: 0, dropCount: 0 });
register({ id: BlockId.GRASS, key: 'grass', name: 'Bloc d\'Herbe', category: 'terrain', hardness: 0.65, preferredTool: 'shovel', soundGroup: 'grass', faces: topBottomSide(TileId.GRASS_TOP, TileId.DIRT, TileId.GRASS_SIDE), dropId: BlockId.DIRT });
register({ id: BlockId.DIRT, key: 'dirt', name: 'Terre Riche', category: 'terrain', hardness: 0.55, preferredTool: 'shovel', soundGroup: 'grass', faces: allFaces(TileId.DIRT) });
register({ id: BlockId.STONE, key: 'stone', name: 'Pierre Naturelle', category: 'terrain', hardness: 1.6, preferredTool: 'pickaxe', minToolTier: 1, soundGroup: 'stone', faces: allFaces(TileId.STONE), dropId: BlockId.COBBLESTONE });
register({ id: BlockId.COBBLESTONE, key: 'cobblestone', name: 'Pierre Taillée Brute (Cobble)', category: 'terrain', hardness: 1.9, preferredTool: 'pickaxe', minToolTier: 1, soundGroup: 'stone', faces: allFaces(TileId.COBBLESTONE) });
register({ id: BlockId.SAND, key: 'sand', name: 'Sable Fin', category: 'terrain', hardness: 0.55, preferredTool: 'shovel', gravity: true, soundGroup: 'sand', faces: allFaces(TileId.SAND) });
register({ id: BlockId.SANDSTONE, key: 'sandstone', name: 'Grès Ciselé', category: 'terrain', hardness: 1.2, preferredTool: 'pickaxe', minToolTier: 1, soundGroup: 'stone', faces: topBottomSide(TileId.SANDSTONE_TOP, TileId.SANDSTONE_TOP, TileId.SANDSTONE_SIDE) });
register({ id: BlockId.GRAVEL, key: 'gravel', name: 'Gravier', category: 'terrain', hardness: 0.65, preferredTool: 'shovel', gravity: true, soundGroup: 'sand', faces: allFaces(TileId.GRAVEL) });

register({ id: BlockId.OAK_LOG, key: 'oak_log', name: 'Bois de Chêne', category: 'wood', hardness: 1.8, preferredTool: 'axe', soundGroup: 'wood', faces: topBottomSide(TileId.OAK_LOG_TOP, TileId.OAK_LOG_TOP, TileId.OAK_LOG_SIDE) });
register({ id: BlockId.BIRCH_LOG, key: 'birch_log', name: 'Bois de Bouleau', category: 'wood', hardness: 1.8, preferredTool: 'axe', soundGroup: 'wood', faces: topBottomSide(TileId.BIRCH_LOG_TOP, TileId.BIRCH_LOG_TOP, TileId.BIRCH_LOG_SIDE) });
register({ id: BlockId.SPRUCE_LOG, key: 'spruce_log', name: 'Bois de Sapin', category: 'wood', hardness: 1.8, preferredTool: 'axe', soundGroup: 'wood', faces: topBottomSide(TileId.SPRUCE_LOG_TOP, TileId.SPRUCE_LOG_TOP, TileId.SPRUCE_LOG_SIDE) });

register({ id: BlockId.OAK_PLANKS, key: 'oak_planks', name: 'Planches de Chêne', category: 'wood', hardness: 1.7, preferredTool: 'axe', soundGroup: 'wood', faces: allFaces(TileId.OAK_PLANKS) });
register({ id: BlockId.BIRCH_PLANKS, key: 'birch_planks', name: 'Planches de Bouleau', category: 'wood', hardness: 1.7, preferredTool: 'axe', soundGroup: 'wood', faces: allFaces(TileId.BIRCH_PLANKS) });
register({ id: BlockId.SPRUCE_PLANKS, key: 'spruce_planks', name: 'Planches de Sapin', category: 'wood', hardness: 1.7, preferredTool: 'axe', soundGroup: 'wood', faces: allFaces(TileId.SPRUCE_PLANKS) });

register({ id: BlockId.OAK_LEAVES, key: 'oak_leaves', name: 'Feuilles de Chêne', category: 'flora', opaque: false, renderType: 'cutout', lightAttenuation: 2, hardness: 0.25, windSway: true, soundGroup: 'grass', faces: allFaces(TileId.OAK_LEAVES) });
register({ id: BlockId.BIRCH_LEAVES, key: 'birch_leaves', name: 'Feuilles de Bouleau', category: 'flora', opaque: false, renderType: 'cutout', lightAttenuation: 2, hardness: 0.25, windSway: true, soundGroup: 'grass', faces: allFaces(TileId.BIRCH_LEAVES) });
register({ id: BlockId.SPRUCE_LEAVES, key: 'spruce_leaves', name: 'Feuilles de Sapin', category: 'flora', opaque: false, renderType: 'cutout', lightAttenuation: 2, hardness: 0.25, windSway: true, soundGroup: 'grass', faces: allFaces(TileId.SPRUCE_LEAVES) });

register({ id: BlockId.WATER, key: 'water', name: 'Eau Cristalline', category: 'terrain', solid: false, opaque: false, renderType: 'liquid', lightAttenuation: 2, hardness: -1, soundGroup: 'water', faces: allFaces(TileId.WATER), dropCount: 0 });
register({ id: BlockId.LAVA, key: 'lava', name: 'Lave en Fusion', category: 'terrain', solid: false, opaque: false, renderType: 'liquid', lightEmission: 15, lightAttenuation: 2, hardness: -1, soundGroup: 'water', faces: allFaces(TileId.LAVA), dropCount: 0 });
register({ id: BlockId.GLASS, key: 'glass', name: 'Verre Architectural', category: 'utility', opaque: false, renderType: 'cutout', lightAttenuation: 1, hardness: 0.4, soundGroup: 'glass', faces: allFaces(TileId.GLASS), dropCount: 0 });

register({ id: BlockId.BRICKS, key: 'bricks', name: 'Briques d\'Argile', category: 'terrain', hardness: 2.0, preferredTool: 'pickaxe', minToolTier: 1, soundGroup: 'stone', faces: allFaces(TileId.BRICKS) });
register({ id: BlockId.STONE_BRICKS, key: 'stone_bricks', name: 'Briques de Pierre Taillée', category: 'terrain', hardness: 1.9, preferredTool: 'pickaxe', minToolTier: 1, soundGroup: 'stone', faces: allFaces(TileId.STONE_BRICKS) });
register({ id: BlockId.SNOW, key: 'snow', name: 'Bloc de Neige Fraîche', category: 'terrain', hardness: 0.35, preferredTool: 'shovel', soundGroup: 'snow', faces: allFaces(TileId.SNOW) });
register({ id: BlockId.ICE, key: 'ice', name: 'Glace Translucide', category: 'terrain', opaque: false, renderType: 'cutout', lightAttenuation: 2, hardness: 0.55, preferredTool: 'pickaxe', soundGroup: 'glass', faces: allFaces(TileId.ICE) });

register({ id: BlockId.COAL_ORE, key: 'coal_ore', name: 'Minerai de Charbon', category: 'mineral', hardness: 2.4, preferredTool: 'pickaxe', minToolTier: 1, soundGroup: 'stone', faces: allFaces(TileId.COAL_ORE), dropId: ItemId.COAL });
register({ id: BlockId.IRON_ORE, key: 'iron_ore', name: 'Minerai de Fer', category: 'mineral', hardness: 2.8, preferredTool: 'pickaxe', minToolTier: 2, soundGroup: 'stone', faces: allFaces(TileId.IRON_ORE) });
register({ id: BlockId.GOLD_ORE, key: 'gold_ore', name: 'Minerai d\'Or', category: 'mineral', hardness: 3.0, preferredTool: 'pickaxe', minToolTier: 3, soundGroup: 'stone', faces: allFaces(TileId.GOLD_ORE) });
register({ id: BlockId.DIAMOND_ORE, key: 'diamond_ore', name: 'Minerai de Diamant', category: 'mineral', hardness: 3.4, preferredTool: 'pickaxe', minToolTier: 3, soundGroup: 'stone', faces: allFaces(TileId.DIAMOND_ORE), dropId: ItemId.DIAMOND });
register({ id: BlockId.EMERALD_ORE, key: 'emerald_ore', name: 'Minerai d\'Émeraude', category: 'mineral', hardness: 3.4, preferredTool: 'pickaxe', minToolTier: 3, soundGroup: 'stone', faces: allFaces(TileId.EMERALD_ORE), dropId: ItemId.EMERALD });

register({ id: BlockId.BEDROCK, key: 'bedrock', name: 'Bedrock', category: 'terrain', hardness: -1, soundGroup: 'stone', faces: allFaces(TileId.BEDROCK), dropCount: 0 });
register({ id: BlockId.CRAFTING_TABLE, key: 'crafting_table', name: 'Table de Craft', category: 'utility', hardness: 2.0, preferredTool: 'axe', interactable: true, soundGroup: 'wood', faces: topBottomSide(TileId.CRAFTING_TOP, TileId.OAK_PLANKS, TileId.CRAFTING_SIDE) });
register({ id: BlockId.FURNACE_OFF, key: 'furnace', name: 'Fourneau', category: 'utility', hardness: 2.6, preferredTool: 'pickaxe', minToolTier: 1, interactable: true, soundGroup: 'stone', faces: frontBox(TileId.FURNACE_TOP, TileId.FURNACE_TOP, TileId.FURNACE_FRONT_OFF, TileId.FURNACE_SIDE) });
register({ id: BlockId.FURNACE_ON, key: 'furnace_lit', name: 'Fourneau Allumé', category: 'utility', lightEmission: 13, hardness: 2.6, preferredTool: 'pickaxe', minToolTier: 1, interactable: true, soundGroup: 'stone', faces: frontBox(TileId.FURNACE_TOP, TileId.FURNACE_TOP, TileId.FURNACE_FRONT_ON, TileId.FURNACE_SIDE), dropId: BlockId.FURNACE_OFF });
register({ id: BlockId.CHEST, key: 'chest', name: 'Coffre de Stockage', category: 'utility', hardness: 2.0, preferredTool: 'axe', interactable: true, soundGroup: 'wood', faces: frontBox(TileId.CHEST_TOP, TileId.CHEST_TOP, TileId.CHEST_FRONT, TileId.CHEST_SIDE) });
register({ id: BlockId.TNT, key: 'tnt', name: 'TNT Explosive', category: 'utility', hardness: 0.15, interactable: true, soundGroup: 'grass', faces: topBottomSide(TileId.TNT_TOP, TileId.TNT_BOTTOM, TileId.TNT_SIDE) });
register({ id: BlockId.GLOWSTONE, key: 'glowstone', name: 'Glowstone (Pierre Lumineuse)', category: 'utility', lightEmission: 15, hardness: 0.5, soundGroup: 'glass', faces: allFaces(TileId.GLOWSTONE) });
register({ id: BlockId.TORCH, key: 'torch', name: 'Torche Vive', category: 'utility', solid: false, opaque: false, renderType: 'torch', lightEmission: 14, lightAttenuation: 1, hardness: 0.08, soundGroup: 'wood', faces: allFaces(TileId.TORCH) });
register({ id: BlockId.CACTUS, key: 'cactus', name: 'Cactus du Désert', category: 'flora', opaque: false, renderType: 'cactus', lightAttenuation: 1, hardness: 0.45, soundGroup: 'grass', faces: topBottomSide(TileId.CACTUS_TOP, TileId.CACTUS_TOP, TileId.CACTUS_SIDE) });
register({ id: BlockId.FLOWER_RED, key: 'flower_red', name: 'Coquelicot Sauvage', category: 'flora', solid: false, opaque: false, renderType: 'cross', lightAttenuation: 1, hardness: 0.05, windSway: true, soundGroup: 'grass', faces: allFaces(TileId.FLOWER_RED) });
register({ id: BlockId.FLOWER_YELLOW, key: 'flower_yellow', name: 'Pissenlit Doré', category: 'flora', solid: false, opaque: false, renderType: 'cross', lightAttenuation: 1, hardness: 0.05, windSway: true, soundGroup: 'grass', faces: allFaces(TileId.FLOWER_YELLOW) });
register({ id: BlockId.TALL_GRASS, key: 'tall_grass', name: 'Hautes Herbes', category: 'flora', solid: false, opaque: false, renderType: 'cross', lightAttenuation: 1, hardness: 0.05, windSway: true, soundGroup: 'grass', faces: allFaces(TileId.TALL_GRASS), dropCount: 0 });
register({ id: BlockId.SNOWY_GRASS, key: 'snowy_grass', name: 'Herbe Enneigée', category: 'terrain', hardness: 0.65, preferredTool: 'shovel', soundGroup: 'snow', faces: topBottomSide(TileId.SNOW, TileId.DIRT, TileId.SNOW_GRASS_SIDE), dropId: BlockId.DIRT });

// ==================== ULTIMATE EDITION NEW BLOCKS ====================
register({ id: BlockId.OBSIDIAN, key: 'obsidian', name: 'Obsidienne Volcanique', category: 'mineral', hardness: 6.5, preferredTool: 'pickaxe', minToolTier: 4, soundGroup: 'stone', faces: allFaces(TileId.OBSIDIAN) });
register({ id: BlockId.BOOKSHELF, key: 'bookshelf', name: 'Bibliothèque Ancienne', category: 'wood', hardness: 1.5, preferredTool: 'axe', soundGroup: 'wood', faces: topBottomSide(TileId.OAK_PLANKS, TileId.OAK_PLANKS, TileId.BOOKSHELF_SIDE) });
register({ id: BlockId.LANTERN, key: 'lantern', name: 'Lanterne Forgée', category: 'utility', solid: false, opaque: false, renderType: 'lantern', lightEmission: 15, lightAttenuation: 1, hardness: 0.4, soundGroup: 'stone', faces: allFaces(TileId.LANTERN) });
register({ id: BlockId.MOSSY_COBBLESTONE, key: 'mossy_cobble', name: 'Pierre Moussue des Ruines', category: 'terrain', hardness: 1.9, preferredTool: 'pickaxe', minToolTier: 1, soundGroup: 'stone', faces: allFaces(TileId.MOSSY_COBBLESTONE) });
register({ id: BlockId.MARBLE, key: 'marble', name: 'Marbre Blanc Ciselé', category: 'terrain', hardness: 1.8, preferredTool: 'pickaxe', minToolTier: 1, soundGroup: 'stone', faces: allFaces(TileId.MARBLE) });
register({ id: BlockId.GOLD_BLOCK, key: 'gold_block', name: 'Bloc d\'Or Massif', category: 'mineral', hardness: 3.0, preferredTool: 'pickaxe', minToolTier: 2, soundGroup: 'stone', faces: allFaces(TileId.GOLD_BLOCK) });
register({ id: BlockId.DIAMOND_BLOCK, key: 'diamond_block', name: 'Bloc de Diamant Pur', category: 'mineral', hardness: 3.5, preferredTool: 'pickaxe', minToolTier: 3, soundGroup: 'stone', faces: allFaces(TileId.DIAMOND_BLOCK) });
register({ id: BlockId.EMERALD_BLOCK, key: 'emerald_block', name: 'Bloc d\'Émeraude Royale', category: 'mineral', hardness: 3.5, preferredTool: 'pickaxe', minToolTier: 3, soundGroup: 'stone', faces: allFaces(TileId.EMERALD_BLOCK) });
register({ id: BlockId.IRON_BLOCK, key: 'iron_block', name: 'Bloc d\'Acier Forgé', category: 'mineral', hardness: 2.8, preferredTool: 'pickaxe', minToolTier: 2, soundGroup: 'stone', faces: allFaces(TileId.IRON_BLOCK) });
register({ id: BlockId.MAGMA_BLOCK, key: 'magma_block', name: 'Bloc de Magma Incandescent', category: 'terrain', lightEmission: 10, hardness: 1.4, preferredTool: 'pickaxe', minToolTier: 1, soundGroup: 'stone', faces: allFaces(TileId.MAGMA_BLOCK) });
register({ id: BlockId.SLIME_BLOCK, key: 'slime_block', name: 'Bloc de Slime Trampoline', category: 'utility', opaque: false, renderType: 'cutout', lightAttenuation: 2, hardness: 0.25, bouncy: true, soundGroup: 'grass', faces: allFaces(TileId.SLIME_BLOCK) });
register({ id: BlockId.POLISHED_BASALT, key: 'polished_basalt', name: 'Basalte Noir Poli', category: 'terrain', hardness: 1.8, preferredTool: 'pickaxe', minToolTier: 1, soundGroup: 'stone', faces: allFaces(TileId.POLISHED_BASALT) });
register({ id: BlockId.AMETHYST_CRYSTAL, key: 'amethyst_crystal', name: 'Cristal d\'Améthyste Lumineux', category: 'mineral', solid: false, opaque: false, renderType: 'cross', lightEmission: 12, lightAttenuation: 1, hardness: 0.6, soundGroup: 'glass', faces: allFaces(TileId.AMETHYST_CRYSTAL) });

// ==================== NON-BLOCK ITEMS & MATERIALS ====================
register({ id: ItemId.STICK, key: 'stick', name: 'Bâton', isBlock: false, category: 'material', iconShape: 'stick', primaryColor: '#a16207', secondaryColor: '#713f12' });
register({ id: ItemId.COAL, key: 'coal', name: 'Charbon', isBlock: false, category: 'material', iconShape: 'coal', primaryColor: '#1e293b', secondaryColor: '#0f172a' });
register({ id: ItemId.IRON_INGOT, key: 'iron_ingot', name: 'Lingot de Fer', isBlock: false, category: 'material', iconShape: 'ingot', primaryColor: '#e2e8f0', secondaryColor: '#94a3b8' });
register({ id: ItemId.GOLD_INGOT, key: 'gold_ingot', name: 'Lingot d\'Or', isBlock: false, category: 'material', iconShape: 'ingot', primaryColor: '#facc15', secondaryColor: '#ca8a04' });
register({ id: ItemId.DIAMOND, key: 'diamond', name: 'Diamant', isBlock: false, category: 'material', iconShape: 'gem', primaryColor: '#38bdf8', secondaryColor: '#0284c7' });
register({ id: ItemId.EMERALD, key: 'emerald', name: 'Émeraude', isBlock: false, category: 'material', iconShape: 'gem', primaryColor: '#22c55e', secondaryColor: '#15803d' });
register({ id: ItemId.BRICK, key: 'brick', name: 'Brique Cuite', isBlock: false, category: 'material', iconShape: 'ingot', primaryColor: '#b94e3c', secondaryColor: '#7f2d20' });
register({ id: ItemId.FLINT, key: 'flint', name: 'Silex Affûté', isBlock: false, category: 'material', iconShape: 'coal', primaryColor: '#475569', secondaryColor: '#1e293b' });
register({ id: ItemId.SLIMEBALL, key: 'slimeball', name: 'Perle de Slime Élastique', isBlock: false, category: 'material', iconShape: 'gem', primaryColor: '#84cc16', secondaryColor: '#4d7c0f' });

// ==================== FOOD ====================
register({ id: ItemId.RAW_PORK, key: 'raw_pork', name: 'Côtelette de Porc Crue', isBlock: false, category: 'food', foodRestore: 3, iconShape: 'meat', primaryColor: '#fb7185', secondaryColor: '#fda4af' });
register({ id: ItemId.COOKED_PORK, key: 'cooked_pork', name: 'Côtelette de Porc Cuite', isBlock: false, category: 'food', foodRestore: 8, iconShape: 'meat', primaryColor: '#b45309', secondaryColor: '#fcd34d' });
register({ id: ItemId.RAW_BEEF, key: 'raw_beef', name: 'Bœuf Cru', isBlock: false, category: 'food', foodRestore: 3, iconShape: 'meat', primaryColor: '#dc2626', secondaryColor: '#fca5a5' });
register({ id: ItemId.COOKED_BEEF, key: 'cooked_beef', name: 'Steak Grillé', isBlock: false, category: 'food', foodRestore: 8, iconShape: 'meat', primaryColor: '#78350f', secondaryColor: '#d97706' });
register({ id: ItemId.APPLE, key: 'apple', name: 'Pomme Rouge', isBlock: false, category: 'food', foodRestore: 4, iconShape: 'apple', primaryColor: '#ef4444', secondaryColor: '#22c55e' });
register({ id: ItemId.GOLDEN_APPLE, key: 'golden_apple', name: 'Pomme Dorée Enchantée (+Absorption)', isBlock: false, category: 'food', foodRestore: 10, iconShape: 'apple', primaryColor: '#facc15', secondaryColor: '#38bdf8' });
register({ id: ItemId.BREAD, key: 'bread', name: 'Pain Doré', isBlock: false, category: 'food', foodRestore: 5, iconShape: 'bread', primaryColor: '#d97706', secondaryColor: '#92400e' });
register({ id: ItemId.RAW_MUTTON, key: 'raw_mutton', name: 'Mouton Cru', isBlock: false, category: 'food', foodRestore: 2, iconShape: 'meat', primaryColor: '#e11d48', secondaryColor: '#fecdd3' });
register({ id: ItemId.COOKED_MUTTON, key: 'cooked_mutton', name: 'Mouton Rôti', isBlock: false, category: 'food', foodRestore: 6, iconShape: 'meat', primaryColor: '#92400e', secondaryColor: '#fbbf24' });

// ==================== TOOLS (4 TIERS x 4 TYPES) ====================
interface ToolTierSpec {
  baseId: number;
  label: string;
  keyPrefix: string;
  tier: number;
  speed: number;
  durability: number;
  baseDmg: number;
  color: string;
}

const TOOL_TIERS: ToolTierSpec[] = [
  { baseId: 120, label: 'en Bois', keyPrefix: 'wood', tier: 1, speed: 2.2, durability: 60, baseDmg: 3, color: '#b47a3c' },
  { baseId: 124, label: 'en Pierre', keyPrefix: 'stone', tier: 2, speed: 4.0, durability: 132, baseDmg: 4, color: '#94a3b8' },
  { baseId: 128, label: 'en Fer', keyPrefix: 'iron', tier: 3, speed: 6.2, durability: 250, baseDmg: 5, color: '#f1f5f9' },
  { baseId: 132, label: 'en Diamant', keyPrefix: 'diamond', tier: 4, speed: 8.8, durability: 1024, baseDmg: 7, color: '#38bdf8' },
];

for (const t of TOOL_TIERS) {
  register({ id: t.baseId + 0, key: `${t.keyPrefix}_pickaxe`, name: `Pioche ${t.label}`, isBlock: false, category: 'tool', maxStack: 1, toolType: 'pickaxe', toolTier: t.tier, toolSpeed: t.speed, maxDurability: t.durability, attackDamage: t.baseDmg, iconShape: 'pickaxe', primaryColor: t.color, secondaryColor: '#78471c' });
  register({ id: t.baseId + 1, key: `${t.keyPrefix}_axe`, name: `Hache ${t.label}`, isBlock: false, category: 'tool', maxStack: 1, toolType: 'axe', toolTier: t.tier, toolSpeed: t.speed, maxDurability: t.durability, attackDamage: t.baseDmg + 1, iconShape: 'axe', primaryColor: t.color, secondaryColor: '#78471c' });
  register({ id: t.baseId + 2, key: `${t.keyPrefix}_shovel`, name: `Pelle ${t.label}`, isBlock: false, category: 'tool', maxStack: 1, toolType: 'shovel', toolTier: t.tier, toolSpeed: t.speed, maxDurability: t.durability, attackDamage: Math.max(2, t.baseDmg - 1), iconShape: 'shovel', primaryColor: t.color, secondaryColor: '#78471c' });
  register({ id: t.baseId + 3, key: `${t.keyPrefix}_sword`, name: `Épée ${t.label}`, isBlock: false, category: 'tool', maxStack: 1, toolType: 'sword', toolTier: t.tier, toolSpeed: 1.5, maxDurability: t.durability, attackDamage: t.baseDmg + 2, iconShape: 'sword', primaryColor: t.color, secondaryColor: '#78471c' });
}

// ==================== SPECIAL WEAPONS, GADGETS, BUCKETS & ARMOR ====================
register({ id: ItemId.COMPANION_HORN, key: 'companion_horn', name: 'Cor d\'Appel d\'Agent Compagnon', isBlock: false, category: 'utility', maxStack: 16, iconShape: 'horn', primaryColor: '#fbbf24', secondaryColor: '#38bdf8' });
register({ id: ItemId.BOW, key: 'bow', name: 'Arc Chasseur Longue Portée', isBlock: false, category: 'tool', maxStack: 1, maxDurability: 384, attackDamage: 3, iconShape: 'bow', primaryColor: '#a16207', secondaryColor: '#e2e8f0' });
register({ id: ItemId.ARROW, key: 'arrow', name: 'Flèche Empennée', isBlock: false, category: 'tool', maxStack: 64, iconShape: 'arrow', primaryColor: '#cbd5e1', secondaryColor: '#ef4444' });
register({ id: ItemId.GRAPPLING_HOOK, key: 'grappling_hook', name: 'Grappin Véloce (Propulsion 30m)', isBlock: false, category: 'tool', maxStack: 1, maxDurability: 250, iconShape: 'grapple', primaryColor: '#38bdf8', secondaryColor: '#94a3b8' });
register({ id: ItemId.EXCAVATOR_HAMMER, key: 'excavator_hammer', name: 'Marteau d\'Excavation 3x3', isBlock: false, category: 'tool', maxStack: 1, toolType: 'pickaxe', toolTier: 4, toolSpeed: 7.5, maxDurability: 800, attackDamage: 8, iconShape: 'hammer', primaryColor: '#a855f7', secondaryColor: '#facc15' });
register({ id: ItemId.BUCKET_EMPTY, key: 'bucket_empty', name: 'Seau en Fer Vide', isBlock: false, category: 'utility', maxStack: 16, iconShape: 'bucket', primaryColor: '#cbd5e1', secondaryColor: '#64748b' });
register({ id: ItemId.BUCKET_WATER, key: 'bucket_water', name: 'Seau d\'Eau', isBlock: false, category: 'utility', maxStack: 1, iconShape: 'bucket', primaryColor: '#cbd5e1', secondaryColor: '#0284c7' });
register({ id: ItemId.BUCKET_LAVA, key: 'bucket_lava', name: 'Seau de Lave Incandescente', isBlock: false, category: 'utility', maxStack: 1, lightEmission: 15, iconShape: 'bucket', primaryColor: '#cbd5e1', secondaryColor: '#f97316' });
register({ id: ItemId.IRON_ARMOR, key: 'iron_armor', name: 'Armure Complète en Fer (+12 🛡️)', isBlock: false, category: 'tool', maxStack: 1, armorPoints: 12, iconShape: 'armor', primaryColor: '#e2e8f0', secondaryColor: '#64748b' });
register({ id: ItemId.DIAMOND_ARMOR, key: 'diamond_armor', name: 'Armure Royale en Diamant (+20 🛡️)', isBlock: false, category: 'tool', maxStack: 1, armorPoints: 20, iconShape: 'armor', primaryColor: '#38bdf8', secondaryColor: '#0284c7' });
register({ id: ItemId.ARCHITECT_WAND, key: 'architect_wand', name: 'Baguette d\'Architecte (Structures 1-Clic)', isBlock: false, category: 'utility', maxStack: 1, iconShape: 'wand', primaryColor: '#f472b6', secondaryColor: '#facc15' });

export function getBlockOrItem(id: number): ItemOrBlockDef {
  return FAST_BLOCKS[id] ?? REGISTRY.get(id) ?? FAST_BLOCKS[BlockId.AIR]!;
}

export function isSolidBlock(id: number): boolean {
  const b = FAST_BLOCKS[id];
  return b ? b.solid : false;
}

export function isOpaqueBlock(id: number): boolean {
  const b = FAST_BLOCKS[id];
  return b ? b.opaque : false;
}

export function getLightEmission(id: number): number {
  const b = FAST_BLOCKS[id] ?? REGISTRY.get(id);
  return b ? b.lightEmission : 0;
}

export function getLightAttenuation(id: number): number {
  const b = FAST_BLOCKS[id];
  return b ? b.lightAttenuation : 1;
}

export function getAllRegisteredItems(): ItemOrBlockDef[] {
  return Array.from(REGISTRY.values()).filter((d) => d.id !== BlockId.AIR && d.id !== BlockId.FURNACE_ON);
}

export function isPlanksId(id: number): boolean {
  return id === BlockId.OAK_PLANKS || id === BlockId.BIRCH_PLANKS || id === BlockId.SPRUCE_PLANKS;
}

export function isLogId(id: number): boolean {
  return id === BlockId.OAK_LOG || id === BlockId.BIRCH_LOG || id === BlockId.SPRUCE_LOG;
}
