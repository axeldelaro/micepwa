import type { CompanionSaveData } from '../entities/VoxelAgentAI';
import type { GameMode } from '../player/PlayerController';
import type { ChestState, FurnaceState, StackSlot } from '../world/WorldManager';

export interface SavedPlayerRecord {
  playerId: string;
  username: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  hunger: number;
  gameMode: GameMode;
  inventory: Array<StackSlot | null>;
}

export interface WorldSaveRecord {
  id: string;
  name: string;
  seed: string;
  gameMode: GameMode;
  timeOfDay: number;
  createdAt: number;
  updatedAt: number;
  deltas: Array<[string, Array<[number, number]>]>;
  chests: ChestState[];
  furnaces: FurnaceState[];
  companions: CompanionSaveData[];
  players: Record<string, SavedPlayerRecord>;
}

const DB_NAME = 'voxelcraft_online_db';
const DB_VERSION = 1;
const STORE_WORLDS = 'worlds';

export class WorldDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_WORLDS)) {
          const store = db.createObjectStore(STORE_WORLDS, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  public async listWorlds(): Promise<WorldSaveRecord[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_WORLDS, 'readonly');
      const store = tx.objectStore(STORE_WORLDS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as WorldSaveRecord[]) ?? [];
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getWorld(id: string): Promise<WorldSaveRecord | undefined> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_WORLDS, 'readonly');
      const req = tx.objectStore(STORE_WORLDS).get(id);
      req.onsuccess = () => resolve(req.result as WorldSaveRecord | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  public async saveWorld(record: WorldSaveRecord): Promise<void> {
    record.updatedAt = Date.now();
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_WORLDS, 'readwrite');
      tx.objectStore(STORE_WORLDS).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async deleteWorld(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_WORLDS, 'readwrite');
      tx.objectStore(STORE_WORLDS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public exportWorldToFile(record: WorldSaveRecord): void {
    const payload = JSON.stringify(record, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = record.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase() || 'monde';
    a.href = url;
    a.download = `${safeName}.voxelworld.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public async importWorldFromFile(file: File): Promise<WorldSaveRecord> {
    const text = await file.text();
    const parsed = JSON.parse(text) as Partial<WorldSaveRecord>;
    if (!parsed.seed || typeof parsed.seed !== 'string') {
      throw new Error('Fichier .voxelworld.json invalide (seed manquante).');
    }
    const now = Date.now();
    const record: WorldSaveRecord = {
      id: `world-${now.toString(36)}-${Math.floor(Math.random() * 999)}`,
      name: parsed.name ? `${parsed.name} (Importé)` : 'Monde Importé',
      seed: parsed.seed,
      gameMode: parsed.gameMode === 'creative' ? 'creative' : 'survival',
      timeOfDay: typeof parsed.timeOfDay === 'number' ? parsed.timeOfDay : 4200,
      createdAt: parsed.createdAt ?? now,
      updatedAt: now,
      deltas: Array.isArray(parsed.deltas) ? parsed.deltas : [],
      chests: Array.isArray(parsed.chests) ? parsed.chests : [],
      furnaces: Array.isArray(parsed.furnaces) ? parsed.furnaces : [],
      companions: Array.isArray(parsed.companions) ? parsed.companions : [],
      players: parsed.players ?? {},
    };
    await this.saveWorld(record);
    return record;
  }
}
