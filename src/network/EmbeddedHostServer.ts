import type { EntityManager } from '../entities/EntityManager';
import type { AgentRole } from '../entities/VoxelAgentAI';
import type { SkySystem } from '../graphics/SkySystem';
import type { WeatherKind, WeatherSystem } from '../graphics/WeatherSystem';
import type { GameMode, PlayerController } from '../player/PlayerController';
import type { WorldManager } from '../world/WorldManager';
import type { P2PNetworkManager } from './P2PNetworkManager';
import {
  decodeClientPlayerState,
  encodeHostPlayersSnapshot,
  type CompactPlayerState,
  type PeerIdentityInfo,
  type ReliablePacket,
} from './PacketSerializer';

interface HostedPeerSession {
  peerId: string;
  shortNumericId: number;
  username: string;
  skinIndex: number;
  latestState: CompactPlayerState | null;
}

/**
 * Authoritative 20 TPS "Server-in-Browser" running inside the Host's tab on GitHub Pages.
 */
export class EmbeddedHostServer {
  private readonly network: P2PNetworkManager;
  private readonly world: WorldManager;
  private readonly player: PlayerController;
  private readonly entities: EntityManager;
  private readonly sky: SkySystem;
  private readonly weather: WeatherSystem;

  public worldName = 'Monde VoxelCraft';
  private tickInterval: number | null = null;
  private tickCounter = 0;
  private readonly sessions = new Map<string, HostedPeerSession>();

  public onChatReceived?: (sender: string, text: string, system?: boolean) => void;

  constructor(
    network: P2PNetworkManager,
    world: WorldManager,
    player: PlayerController,
    entities: EntityManager,
    sky: SkySystem,
    weather: WeatherSystem
  ) {
    this.network = network;
    this.world = world;
    this.player = player;
    this.entities = entities;
    this.sky = sky;
    this.weather = weather;
  }

  public start(): void {
    this.stop();
    this.sessions.clear();
    this.tickCounter = 0;
    // 20 ticks per second = 50 ms
    this.tickInterval = window.setInterval(() => this.serverTick(), 50);
  }

  public stop(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.sessions.clear();
  }

  public isRunning(): boolean {
    return this.tickInterval !== null;
  }

  public getRoster(): PeerIdentityInfo[] {
    const list: PeerIdentityInfo[] = [
      {
        peerId: this.network.localPeerId,
        shortNumericId: this.network.localShortNumericId,
        username: `${this.player.username} (Hôte)`,
        skinIndex: this.player.skinIndex,
      },
    ];
    for (const s of this.sessions.values()) {
      list.push({
        peerId: s.peerId,
        shortNumericId: s.shortNumericId,
        username: s.username,
        skinIndex: s.skinIndex,
      });
    }
    return list;
  }

  public handlePeerDisconnected(peerId: string): void {
    const s = this.sessions.get(peerId);
    if (s) {
      this.sessions.delete(peerId);
      this.entities.removeRemotePlayer(peerId);
      this.broadcastSystemMessage(`👋 ${s.username} a quitté le monde.`);
      this.network.broadcastReliable({ type: 'ROSTER_UPDATE', roster: this.getRoster() });
    }
  }

  public handleFastBinaryFromClient(peerId: string, buffer: ArrayBuffer): void {
    const decoded = decodeClientPlayerState(buffer);
    if (!decoded) return;
    const s = this.sessions.get(peerId);
    if (!s) return;
    decoded.shortNumericId = s.shortNumericId;
    s.latestState = decoded;

    // Update host's own 3D representation of this remote peer
    this.entities.upsertRemotePlayer(
      s.peerId,
      s.username,
      s.skinIndex,
      decoded.x,
      decoded.y,
      decoded.z,
      decoded.yaw,
      decoded.pitch,
      decoded.sneaking,
      decoded.swinging,
      decoded.heldItemId
    );
  }

  public handleReliableFromClient(peerId: string, packet: ReliablePacket): void {
    switch (packet.type) {
      case 'HELLO': {
        const session: HostedPeerSession = {
          peerId,
          shortNumericId: packet.shortNumericId,
          username: packet.username.slice(0, 18) || 'Joueur',
          skinIndex: packet.skinIndex,
          latestState: null,
        };
        this.sessions.set(peerId, session);

        // 1. Send initial world metadata + roster + chests + companions
        this.network.sendReliableTo(peerId, {
          type: 'WELCOME_INIT',
          worldName: this.worldName,
          seed: this.world.seed,
          gameMode: this.player.gameMode,
          timeOfDay: this.sky.timeOfDay,
          roster: this.getRoster(),
          chests: Array.from(this.world.chests.values()),
          companions: this.entities.serializeCompanions(),
        });

        // 2. Stream compressed worldDeltas in safe 25-chunk batches so WebRTC SCTP never overflows
        const allDeltas = this.world.serializeDeltas();
        const batchSize = 25;
        for (let i = 0; i < allDeltas.length; i += batchSize) {
          this.network.sendReliableTo(peerId, {
            type: 'WORLD_DELTAS_BATCH',
            deltas: allDeltas.slice(i, i + batchSize),
          });
        }

        // 3. Notify everyone
        this.network.broadcastReliable({ type: 'ROSTER_UPDATE', roster: this.getRoster() });
        this.broadcastSystemMessage(`✨ ${session.username} a rejoint la partie !`);
        break;
      }

      case 'BLOCK_EDIT': {
        this.world.setBlock(packet.wx, packet.wy, packet.wz, packet.blockId, false, true);
        this.network.broadcastReliable(packet, peerId);
        break;
      }

      case 'CHEST_SYNC': {
        this.world.chests.set(packet.chest.key, packet.chest);
        this.network.broadcastReliable(packet, peerId);
        break;
      }

      case 'COMPANION_SPAWN': {
        const c = packet.companion;
        this.entities.spawnCompanion(c.x, c.y, c.z, c.role, this.world, c.id, c.name);
        this.network.broadcastReliable(packet, peerId);
        break;
      }

      case 'COMPANION_ROLE': {
        const found = this.entities.companions.find((a) => a.id === packet.companionId);
        if (found) {
          found.setRole(packet.role, this.world);
        }
        this.network.broadcastReliable(packet, peerId);
        break;
      }

      case 'CHAT_MSG': {
        const senderSession = this.sessions.get(peerId);
        const senderName = senderSession?.username ?? packet.sender;
        if (packet.text.startsWith('/')) {
          this.executeCommand(packet.text, peerId);
        } else {
          const msg: ReliablePacket = { type: 'CHAT_MSG', sender: senderName, text: packet.text };
          this.onChatReceived?.(senderName, packet.text, false);
          this.network.broadcastReliable(msg);
        }
        break;
      }

      default:
        break;
    }
  }

  public executeCommand(rawCmd: string, requesterPeerId?: string): void {
    const parts = rawCmd.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase() ?? '';

    const reply = (text: string) => {
      if (!requesterPeerId) {
        this.onChatReceived?.('Serveur', text, true);
      } else {
        this.network.sendReliableTo(requesterPeerId, {
          type: 'CHAT_MSG',
          sender: 'Serveur',
          text,
          system: true,
        });
      }
    };

    if (cmd === '/help') {
      reply('Commandes : /gamemode <survival|creative|hardcore|bastion|spectator>, /weather <clear|rain|snow|storm>, /time set <day|noon|night>, /tp <x> <y> <z>, /wave, /seed, /bot spawn [guard|miner|builder|trader]');
      return;
    }

    if (cmd === '/weather') {
      const w = (parts[1]?.toLowerCase() ?? 'clear') as WeatherKind;
      const valid: WeatherKind[] = ['clear', 'rain', 'snow', 'storm'];
      const chosen: WeatherKind = valid.includes(w) ? w : 'rain';
      this.weather.setWeather(chosen);
      this.network.broadcastReliable({ type: 'WEATHER_SYNC', weather: chosen });
      this.broadcastSystemMessage(`🌦️ Météo définie sur : ${chosen.toUpperCase()}`);
      return;
    }

    if (cmd === '/wave') {
      const nextWave = this.entities.bastionWave + 1;
      const n = this.entities.spawnBastionWave(nextWave, this.world, this.player.physState.position);
      this.broadcastSystemMessage(`⚔️ Vague d'assaut #${nextWave} lancée (${n} assaillants) !`);
      return;
    }

    if (cmd === '/seed') {
      reply(`🌱 Seed du monde : ${this.world.seed}`);
      return;
    }

    if (cmd === '/gamemode') {
      const arg = parts[1]?.toLowerCase();
      const nextMode: GameMode | null =
        arg === 'creative' || arg === '1' || arg === 'c'
          ? 'creative'
          : arg === 'survival' || arg === '0' || arg === 's'
          ? 'survival'
          : arg === 'hardcore' || arg === 'h'
          ? 'hardcore'
          : arg === 'bastion' || arg === 'b'
          ? 'bastion'
          : arg === 'spectator' || arg === '3' || arg === 'sp'
          ? 'spectator'
          : null;
      if (!nextMode) {
        reply('Usage : /gamemode <survival|creative|hardcore|bastion|spectator>');
        return;
      }
      if (!requesterPeerId) {
        this.player.setGameMode(nextMode);
      } else {
        this.network.sendReliableTo(requesterPeerId, { type: 'GAMEMODE_ASSIGN', gameMode: nextMode });
      }
      reply(`🎮 Mode de jeu défini sur : ${nextMode.toUpperCase()}`);
      return;
    }

    if (cmd === '/time' && parts[1]?.toLowerCase() === 'set') {
      const val = parts[2]?.toLowerCase() ?? 'day';
      let ticks = 2500;
      if (val === 'day') ticks = 2500;
      else if (val === 'noon') ticks = 6000;
      else if (val === 'sunset') ticks = 12000;
      else if (val === 'night' || val === 'midnight') ticks = 18000;
      else if (!Number.isNaN(Number(val))) ticks = ((Number(val) % 24000) + 24000) % 24000;

      this.sky.timeOfDay = ticks;
      this.network.broadcastReliable({ type: 'TIME_SYNC', timeOfDay: ticks });
      this.broadcastSystemMessage(`☀️ Heure du monde fixée à ${Math.round(ticks)} ticks.`);
      return;
    }

    if (cmd === '/tp') {
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);
      if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
        reply('Usage : /tp <x> <y> <z>');
        return;
      }
      if (!requesterPeerId) {
        this.player.physState.position.set(x, y, z);
        this.player.physState.velocity.set(0, 0, 0);
        this.player.physState.fallStartY = y;
      } else {
        this.network.sendReliableTo(requesterPeerId, { type: 'TELEPORT_ASSIGN', x, y, z });
      }
      reply(`⚡ Téléporté vers (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}).`);
      return;
    }

    if (cmd === '/bot' && parts[1]?.toLowerCase() === 'spawn') {
      const roleArg = (parts[2]?.toLowerCase() ?? 'guard') as AgentRole;
      const validRoles: AgentRole[] = ['guard', 'miner', 'builder', 'trader'];
      const role: AgentRole = validRoles.includes(roleArg) ? roleArg : 'guard';

      let sx = this.player.physState.position.x + 2;
      let sy = this.player.physState.position.y + 0.5;
      let sz = this.player.physState.position.z + 2;
      if (requesterPeerId) {
        const st = this.sessions.get(requesterPeerId)?.latestState;
        if (st) {
          sx = st.x + 2;
          sy = st.y + 0.5;
          sz = st.z + 2;
        }
      }

      const agent = this.entities.spawnCompanion(sx, sy, sz, role, this.world);
      this.network.broadcastReliable({ type: 'COMPANION_SPAWN', companion: agent.serialize() });
      this.broadcastSystemMessage(`🤖 Agent Compagnon "${agent.name}" (${role}) invoqué !`);
      return;
    }

    reply(`Commande inconnue "${cmd}". Tapez /help pour la liste.`);
  }

  public broadcastSystemMessage(text: string): void {
    this.onChatReceived?.('Serveur', text, true);
    this.network.broadcastReliable({ type: 'CHAT_MSG', sender: 'Serveur', text, system: true });
  }

  private serverTick(): void {
    this.tickCounter++;
    if (this.network.peers.size === 0) return;

    // 1. Broadcast compact 20 Hz binary snapshot of Host + all Clients over Unreliable DataChannel
    const hostHeld = this.player.inventory.getHeldStack()?.itemId ?? 0;
    const states: CompactPlayerState[] = [
      {
        shortNumericId: this.network.localShortNumericId,
        x: this.player.physState.position.x,
        y: this.player.physState.position.y,
        z: this.player.physState.position.z,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        sneaking: this.player.physState.isSneaking,
        swinging: false,
        flying: this.player.physState.isFlying,
        heldItemId: hostHeld,
      },
    ];

    for (const s of this.sessions.values()) {
      if (s.latestState) {
        states.push(s.latestState);
        s.latestState.swinging = false;
      }
    }

    const binBuf = encodeHostPlayersSnapshot(states);
    this.network.broadcastFastBinary(binBuf);

    // 2. Every 4 seconds (80 ticks), sync authoritative Day/Night clock over Reliable channel
    if (this.tickCounter % 80 === 0) {
      this.network.broadcastReliable({ type: 'TIME_SYNC', timeOfDay: this.sky.timeOfDay });
    }
  }
}
