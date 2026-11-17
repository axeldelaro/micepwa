import type { AgentRole, CompanionSaveData } from '../entities/VoxelAgentAI';
import type { WeatherKind } from '../graphics/WeatherSystem';
import type { GameMode } from '../player/PlayerController';
import type { ChestState } from '../world/WorldManager';

export const enum BinaryPacketOp {
  CLIENT_PLAYER_STATE = 1,
  HOST_PLAYERS_SNAPSHOT = 2,
}

export interface CompactPlayerState {
  shortNumericId: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  sneaking: boolean;
  swinging: boolean;
  flying: boolean;
  heldItemId: number;
}

/**
 * Compact 28-byte binary packet for 20 Hz Unreliable DataChannel (Client -> Host)
 */
export function encodeClientPlayerState(s: CompactPlayerState): ArrayBuffer {
  const buf = new ArrayBuffer(28);
  const view = new DataView(buf);
  view.setUint8(0, BinaryPacketOp.CLIENT_PLAYER_STATE);
  let flags = 0;
  if (s.sneaking) flags |= 1;
  if (s.swinging) flags |= 2;
  if (s.flying) flags |= 4;
  view.setUint8(1, flags);
  view.setUint16(2, s.heldItemId & 0xffff, true);
  view.setUint32(4, s.shortNumericId >>> 0, true);
  view.setFloat32(8, s.x, true);
  view.setFloat32(12, s.y, true);
  view.setFloat32(16, s.z, true);
  view.setFloat32(20, s.yaw, true);
  view.setFloat32(24, s.pitch, true);
  return buf;
}

export function decodeClientPlayerState(buf: ArrayBuffer): CompactPlayerState | null {
  if (buf.byteLength < 28) return null;
  const view = new DataView(buf);
  if (view.getUint8(0) !== BinaryPacketOp.CLIENT_PLAYER_STATE) return null;
  const flags = view.getUint8(1);
  return {
    shortNumericId: view.getUint32(4, true),
    x: view.getFloat32(8, true),
    y: view.getFloat32(12, true),
    z: view.getFloat32(16, true),
    yaw: view.getFloat32(20, true),
    pitch: view.getFloat32(24, true),
    sneaking: (flags & 1) !== 0,
    swinging: (flags & 2) !== 0,
    flying: (flags & 4) !== 0,
    heldItemId: view.getUint16(2, true),
  };
}

/**
 * Compact binary snapshot (2 + N * 26 bytes) for 20 Hz Host -> Clients broadcast
 */
export function encodeHostPlayersSnapshot(players: CompactPlayerState[]): ArrayBuffer {
  const count = Math.min(255, players.length);
  const buf = new ArrayBuffer(2 + count * 26);
  const view = new DataView(buf);
  view.setUint8(0, BinaryPacketOp.HOST_PLAYERS_SNAPSHOT);
  view.setUint8(1, count);

  let off = 2;
  for (let i = 0; i < count; i++) {
    const p = players[i]!;
    let flags = 0;
    if (p.sneaking) flags |= 1;
    if (p.swinging) flags |= 2;
    if (p.flying) flags |= 4;
    view.setUint32(off + 0, p.shortNumericId >>> 0, true);
    view.setUint8(off + 4, flags);
    view.setUint8(off + 5, p.heldItemId & 0xff);
    view.setFloat32(off + 6, p.x, true);
    view.setFloat32(off + 10, p.y, true);
    view.setFloat32(off + 14, p.z, true);
    view.setFloat32(off + 18, p.yaw, true);
    view.setFloat32(off + 22, p.pitch, true);
    off += 26;
  }
  return buf;
}

export function decodeHostPlayersSnapshot(buf: ArrayBuffer): CompactPlayerState[] {
  if (buf.byteLength < 2) return [];
  const view = new DataView(buf);
  if (view.getUint8(0) !== BinaryPacketOp.HOST_PLAYERS_SNAPSHOT) return [];
  const count = view.getUint8(1);
  if (buf.byteLength < 2 + count * 26) return [];

  const out: CompactPlayerState[] = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    const shortNumericId = view.getUint32(off + 0, true);
    const flags = view.getUint8(off + 4);
    const heldItemId = view.getUint8(off + 5);
    out.push({
      shortNumericId,
      x: view.getFloat32(off + 6, true),
      y: view.getFloat32(off + 10, true),
      z: view.getFloat32(off + 14, true),
      yaw: view.getFloat32(off + 18, true),
      pitch: view.getFloat32(off + 22, true),
      sneaking: (flags & 1) !== 0,
      swinging: (flags & 2) !== 0,
      flying: (flags & 4) !== 0,
      heldItemId,
    });
    off += 26;
  }
  return out;
}

// ==================== RELIABLE ORDERED MESSAGES ====================
export interface PeerIdentityInfo {
  peerId: string;
  shortNumericId: number;
  username: string;
  skinIndex: number;
}

export type ReliablePacket =
  | {
      type: 'HELLO';
      username: string;
      skinIndex: number;
      shortNumericId: number;
    }
  | {
      type: 'WELCOME_INIT';
      worldName: string;
      seed: string;
      gameMode: GameMode;
      timeOfDay: number;
      roster: PeerIdentityInfo[];
      chests: ChestState[];
      companions: CompanionSaveData[];
    }
  | {
      type: 'ROSTER_UPDATE';
      roster: PeerIdentityInfo[];
    }
  | {
      type: 'WORLD_DELTAS_BATCH';
      deltas: Array<[string, Array<[number, number]>]>;
    }
  | {
      type: 'BLOCK_EDIT';
      wx: number;
      wy: number;
      wz: number;
      blockId: number;
    }
  | {
      type: 'EXPLOSION';
      cx: number;
      cy: number;
      cz: number;
      radius: number;
      brokenBlocks: Array<[number, number, number]>;
    }
  | {
      type: 'CHEST_SYNC';
      chest: ChestState;
    }
  | {
      type: 'TIME_SYNC';
      timeOfDay: number;
    }
  | {
      type: 'WEATHER_SYNC';
      weather: WeatherKind;
    }
  | {
      type: 'GAMEMODE_ASSIGN';
      gameMode: GameMode;
    }
  | {
      type: 'TELEPORT_ASSIGN';
      x: number;
      y: number;
      z: number;
    }
  | {
      type: 'COMPANION_SPAWN';
      companion: CompanionSaveData;
    }
  | {
      type: 'COMPANION_ROLE';
      companionId: string;
      role: AgentRole;
    }
  | {
      type: 'CHAT_MSG';
      sender: string;
      text: string;
      system?: boolean;
    }
  | {
      type: 'PING';
      sentAt: number;
    }
  | {
      type: 'PONG';
      sentAt: number;
    };

export function hashPeerShortId(peerId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < peerId.length; i++) {
    h ^= peerId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}
