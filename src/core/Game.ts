import * as THREE from 'three';
import { SoundEngine } from '../audio/SoundEngine';
import { EntityManager } from '../entities/EntityManager';
import { ParticleSystem } from '../graphics/ParticleSystem';
import { DESIGN_PACK_INFO, ProceduralAtlas, type DesignPackId } from '../graphics/ProceduralAtlas';
import { GRAPHICS_MODE_LABELS, RenderPipeline } from '../graphics/RenderPipeline';
import { SkySystem } from '../graphics/SkySystem';
import { WEATHER_LABELS, WeatherSystem } from '../graphics/WeatherSystem';
import { InputManager } from '../input/InputManager';
import { EmbeddedHostServer } from '../network/EmbeddedHostServer';
import { P2PNetworkManager } from '../network/P2PNetworkManager';
import {
  decodeHostPlayersSnapshot,
  encodeClientPlayerState,
  type PeerIdentityInfo,
  type ReliablePacket,
} from '../network/PacketSerializer';
import { InventoryManager } from '../player/InventoryManager';
import { PlayerController } from '../player/PlayerController';
import { WorldDatabase, type WorldSaveRecord } from '../storage/WorldDatabase';
import { ChatBox } from '../ui/ChatBox';
import { HUD } from '../ui/HUD';
import { InventoryModal } from '../ui/InventoryModal';
import { MainMenu, type NewWorldOptions } from '../ui/MainMenu';
import { MultiplayerLobbyModal } from '../ui/MultiplayerLobbyModal';
import { SettingsModal } from '../ui/SettingsModal';
import { worldToChunkCoord } from '../world/Chunk';
import { WorldManager } from '../world/WorldManager';

export class Game {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly atlas: ProceduralAtlas;
  public readonly sky: SkySystem;
  public readonly weather: WeatherSystem;
  public readonly pipeline: RenderPipeline;
  public readonly particles: ParticleSystem;
  public readonly world: WorldManager;
  public readonly entities: EntityManager;
  public readonly inventory: InventoryManager;
  public readonly sound: SoundEngine;
  public readonly input: InputManager;
  public readonly player: PlayerController;

  public readonly db: WorldDatabase;
  public readonly network: P2PNetworkManager;
  public readonly hostServer: EmbeddedHostServer;

  public readonly mainMenu: MainMenu;
  public readonly hud: HUD;
  public readonly chatBox: ChatBox;
  public readonly inventoryModal: InventoryModal;
  public readonly settingsModal: SettingsModal;
  public readonly lobbyModal: MultiplayerLobbyModal;

  private activeWorldRecord: WorldSaveRecord | null = null;
  private clientRoster: PeerIdentityInfo[] = [];
  private inWorld = false;

  private lastFrameMs = performance.now();
  private elapsedSec = 0;
  private fpsFrames = 0;
  private fpsTimer = 0;
  private currentFps = 60;
  private clientStateSendAccum = 0;
  private autoSaveAccum = 0;
  private bastionWaveTimer = 28;
  private wakeLockSentinel: WakeLockSentinel | null = null;

  constructor() {
    const canvasContainer = document.getElementById('game-canvas-container')!;
    const uiRoot = document.getElementById('ui-root')!;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 450);

    const savedPack = (localStorage.getItem('voxelcraft_pack') as DesignPackId | null) || 'realiste_hd';
    this.atlas = new ProceduralAtlas(savedPack);
    this.sky = new SkySystem(this.scene);
    this.weather = new WeatherSystem(this.scene);
    this.pipeline = new RenderPipeline(canvasContainer, this.atlas, this.scene, this.camera, this.sky);
    this.particles = new ParticleSystem(this.scene, this.atlas);
    this.world = new WorldManager('VOXELCRAFT-2026', this.scene, this.pipeline, this.particles);
    this.entities = new EntityManager(this.scene, this.particles);
    this.inventory = new InventoryManager();
    this.sound = new SoundEngine();
    this.input = new InputManager(this.pipeline.renderer.domElement, uiRoot);

    this.player = new PlayerController(
      this.camera,
      this.scene,
      this.atlas,
      this.world,
      this.particles,
      this.entities,
      this.inventory,
      this.sound,
      this.input
    );

    this.db = new WorldDatabase();
    this.network = new P2PNetworkManager();
    this.hostServer = new EmbeddedHostServer(
      this.network,
      this.world,
      this.player,
      this.entities,
      this.sky,
      this.weather
    );

    this.hud = new HUD(uiRoot, this.atlas, this.inventory);
    this.hud.updatePackBadge(this.atlas.currentPack);
    this.chatBox = new ChatBox(uiRoot);
    this.inventoryModal = new InventoryModal(this.atlas, this.inventory, this.world);
    this.settingsModal = new SettingsModal(
      this.pipeline,
      this.atlas,
      this.weather,
      this.player,
      this.world,
      this.input,
      this.sound
    );
    this.lobbyModal = new MultiplayerLobbyModal(this.network, () =>
      this.network.role === 'host' ? this.hostServer.getRoster() : this.clientRoster
    );
    this.mainMenu = new MainMenu(uiRoot, this.db);

    this.wireCallbacks();
    this.bootInitialExperience();

    requestAnimationFrame((t) => this.loop(t));
  }

  private isAnyModalOpen(): boolean {
    return (
      this.mainMenu.isVisible() ||
      this.inventoryModal.isOpen() ||
      this.settingsModal.isOpen() ||
      this.lobbyModal.isOpen() ||
      this.chatBox.isInputOpen() ||
      this.hud.isRadialMenuOpen()
    );
  }

  private syncInputLockState(): void {
    const modalOpen = this.isAnyModalOpen();
    this.input.setUIState(
      this.inWorld,
      modalOpen,
      this.player.gameMode === 'creative' || this.player.gameMode === 'spectator'
    );
  }

  private wireCallbacks(): void {
    this.weather.onThunderBoom = () => {
      if (this.inWorld) this.sound.playExplosion();
    };

    this.world.onBlockChangedCallback = (wx, wy, wz, blockId) => {
      if (this.network.role !== 'offline') {
        this.network.broadcastReliable({ type: 'BLOCK_EDIT', wx, wy, wz, blockId });
      }
    };

    this.world.onExplosionCallback = (cx, cy, cz, radius, brokenBlocks) => {
      this.sound.playExplosion();
      this.input.gamepad.vibrate(320, 0.85, 1.0);
      this.entities.applyExplosionDamage(cx, cy, cz, radius);

      const d = this.player.physState.position.distanceTo(new THREE.Vector3(cx, cy, cz));
      if (d <= radius) {
        const dmg = Math.ceil((1 - d / radius) * 18);
        this.player.applyDamage(dmg, this.player.physState.position.x - cx, this.player.physState.position.z - cz);
      }

      if (this.network.role === 'host') {
        this.network.broadcastReliable({ type: 'EXPLOSION', cx, cy, cz, radius, brokenBlocks });
      }
    };

    this.player.onOpenCraftingTable = () => {
      this.inventoryModal.openCraftingTable(this.player.gameMode);
      this.syncInputLockState();
    };
    this.player.onOpenFurnace = (x, y, z) => {
      this.inventoryModal.openFurnace(x, y, z, this.player.gameMode);
      this.syncInputLockState();
    };
    this.player.onOpenChest = (x, y, z) => {
      this.inventoryModal.openChest(x, y, z, this.player.gameMode);
      this.syncInputLockState();
    };
    this.player.onInteractCompanion = (agent) => {
      this.hud.openCompanionRadialMenu(agent, () => this.syncInputLockState());
      this.syncInputLockState();
    };
    this.player.onNotifyToast = (msg) => {
      this.chatBox.addMessage('Info', msg, true);
    };

    this.input.onToggleInventory = () => {
      if (this.inventoryModal.isOpen()) {
        this.inventoryModal.close(true);
      } else if (!this.isAnyModalOpen()) {
        this.inventoryModal.openInventory(this.player.gameMode);
        this.syncInputLockState();
      }
    };

    this.input.onTogglePause = () => {
      if (this.inventoryModal.isOpen()) {
        this.inventoryModal.close(true);
        return;
      }
      if (this.lobbyModal.isOpen()) {
        this.lobbyModal.close(true);
        return;
      }
      if (this.hud.isRadialMenuOpen()) {
        this.hud.closeCompanionRadialMenu();
        this.syncInputLockState();
        return;
      }
      if (this.settingsModal.isOpen()) {
        this.settingsModal.close(true);
      } else if (this.inWorld) {
        this.settingsModal.open();
        this.syncInputLockState();
      }
    };

    this.input.onOpenChat = (slash = false) => {
      if (!this.isAnyModalOpen()) {
        this.chatBox.open(slash);
        this.syncInputLockState();
      }
    };

    this.input.onToggleCamera = () => {
      this.player.cycleCameraMode();
    };

    this.input.onToggleDebugF3 = () => {
      this.hud.toggleDebug();
    };

    this.input.onDirectTouchPlace = (nx, ny) => {
      this.player.handleDirectTouchPlaceAtNdc(nx, ny);
    };

    // HUD Quick Buttons (Graphics, Design Pack, Weather, P2P, Inventory, Settings)
    this.hud.onToggleGraphicsQuick = () => {
      const next = this.pipeline.cycleMode();
      this.hud.updateGraphicsBadge(next);
      this.chatBox.addMessage('Graphismes', `Moteur actif : ${GRAPHICS_MODE_LABELS[next]}`, true);
    };

    this.hud.onCycleDesignPackQuick = () => {
      const nextPack = this.atlas.cycleDesignPack();
      localStorage.setItem('voxelcraft_pack', nextPack);
      this.chatBox.addMessage('Pack Design', `Pack appliqué : ${DESIGN_PACK_INFO[nextPack].name}`, true);
    };

    this.hud.onCycleWeatherQuick = () => {
      const nextW = this.weather.cycleWeather();
      this.hud.updateWeatherBadge(nextW);
      if (this.network.role === 'host') {
        this.network.broadcastReliable({ type: 'WEATHER_SYNC', weather: nextW });
      }
      this.chatBox.addMessage('Météo', `Météo active : ${WEATHER_LABELS[nextW]}`, true);
    };

    this.hud.onOpenP2PLobby = () => {
      this.lobbyModal.open();
      this.syncInputLockState();
    };

    this.hud.onOpenInventory = () => {
      this.inventoryModal.openInventory(this.player.gameMode);
      this.syncInputLockState();
    };

    this.hud.onOpenSettings = () => {
      this.settingsModal.open();
      this.syncInputLockState();
    };

    this.hud.onAssignCompanionRole = (agent, role) => {
      agent.setRole(role, this.world);
      this.chatBox.addMessage('Agent IA', `${agent.name} est désormais assigné au rôle : ${role.toUpperCase()}`, true);
      if (this.network.role !== 'offline') {
        this.network.broadcastReliable({ type: 'COMPANION_ROLE', companionId: agent.id, role });
      }
    };

    this.hud.onOpenMerchantTrades = (agent) => {
      this.inventoryModal.openMerchant(agent, this.player.gameMode);
      this.syncInputLockState();
    };

    this.inventoryModal.onCraftSuccessSound = () => this.sound.playPickupPop();
    this.inventoryModal.onClose = (closedChest) => {
      if (closedChest) {
        this.sound.playChest(false);
        if (this.network.role !== 'offline') {
          this.network.broadcastReliable({ type: 'CHEST_SYNC', chest: closedChest });
        }
      }
      this.syncInputLockState();
    };

    this.settingsModal.onResume = () => this.syncInputLockState();
    this.settingsModal.onGraphicsChanged = (m) => this.hud.updateGraphicsBadge(m);
    this.settingsModal.onWeatherChanged = (w) => {
      this.hud.updateWeatherBadge(w);
      if (this.network.role === 'host') {
        this.network.broadcastReliable({ type: 'WEATHER_SYNC', weather: w });
      }
    };
    this.settingsModal.onGameModeChanged = () => this.syncInputLockState();
    this.settingsModal.onOpenMultiplayerLobby = () => {
      this.lobbyModal.open();
      this.syncInputLockState();
    };
    this.settingsModal.onExportCurrentWorld = async () => {
      await this.persistCurrentWorld();
      if (this.activeWorldRecord) {
        this.db.exportWorldToFile(this.activeWorldRecord);
      }
    };
    this.settingsModal.onToggleFullscreen = () => this.toggleFullscreenAndWakeLock();
    this.settingsModal.onExitToMainMenu = async () => {
      await this.persistCurrentWorld();
      this.hostServer.stop();
      this.network.disconnect();
      this.inWorld = false;
      this.player.viewModelGroup.visible = false;
      this.hud.setVisible(false);
      this.chatBox.setVisible(false);
      await this.mainMenu.show();
      this.syncInputLockState();
    };

    // Chat & Commands
    this.chatBox.onClose = () => this.syncInputLockState();
    this.chatBox.onSubmitMessage = (text) => {
      if (text.startsWith('/')) {
        if (this.network.role === 'client') {
          this.network.broadcastReliable({ type: 'CHAT_MSG', sender: this.player.username, text });
        } else {
          this.hostServer.executeCommand(text);
        }
        return;
      }

      if (this.network.role === 'client') {
        this.network.broadcastReliable({ type: 'CHAT_MSG', sender: this.player.username, text });
      } else if (this.network.role === 'host') {
        this.chatBox.addMessage(this.player.username, text, false);
        this.network.broadcastReliable({ type: 'CHAT_MSG', sender: this.player.username, text });
      } else {
        this.chatBox.addMessage(this.player.username, text, false);
      }
    };

    this.hostServer.onChatReceived = (sender, text, sys) => {
      this.chatBox.addMessage(sender, text, sys);
    };

    // Multiplayer P2P Lobby & Network Wiring
    this.lobbyModal.onClose = () => this.syncInputLockState();
    this.lobbyModal.onHostRequested = async () => {
      const code = await this.network.startHosting();
      this.hostServer.worldName = this.activeWorldRecord?.name ?? 'Monde VoxelCraft';
      this.hostServer.start();
      this.hud.updateP2PBadge(code, this.network.peers.size);
      this.chatBox.addMessage('Réseau P2P', `Salon ouvert ! Code : ${code}`, true);
      return code;
    };
    this.lobbyModal.onJoinRequested = async (code) => {
      await this.joinMultiplayerWorld(code);
    };
    this.lobbyModal.onDisconnectRequested = () => {
      this.hostServer.stop();
      this.network.disconnect();
      this.entities.clearAll();
      this.hud.updateP2PBadge('', 0);
    };

    this.network.onPeerConnected = (peerId) => {
      this.hud.updateP2PBadge(this.network.roomCode, this.network.peers.size);
      this.lobbyModal.refreshIfOpen();
      if (this.network.role === 'client') {
        this.network.sendReliableTo(peerId, {
          type: 'HELLO',
          username: this.player.username,
          skinIndex: this.player.skinIndex,
          shortNumericId: this.network.localShortNumericId,
        });
      }
    };

    this.network.onPeerDisconnected = (peerId) => {
      this.hud.updateP2PBadge(this.network.roomCode, this.network.peers.size);
      this.lobbyModal.refreshIfOpen();
      if (this.network.role === 'host') {
        this.hostServer.handlePeerDisconnected(peerId);
      } else {
        this.entities.removeRemotePlayer(peerId);
      }
    };

    this.network.onReliableMessage = (fromPeerId, pkt) => {
      if (this.network.role === 'host') {
        this.hostServer.handleReliableFromClient(fromPeerId, pkt);
      } else {
        this.handleClientReliablePacket(pkt);
      }
    };

    this.network.onFastBinaryMessage = (fromPeerId, buf) => {
      if (this.network.role === 'host') {
        this.hostServer.handleFastBinaryFromClient(fromPeerId, buf);
      } else {
        this.handleClientFastSnapshot(buf);
      }
    };

    // Main Menu Launchers
    this.mainMenu.onToggleFullscreen = () => this.toggleFullscreenAndWakeLock();
    this.mainMenu.onPreviewDesignPack = (pack) => {
      this.atlas.setDesignPack(pack);
    };
    this.mainMenu.onCreateWorld = async (opts) => {
      await this.startNewWorld(opts);
    };
    this.mainMenu.onLoadSavedWorld = async (record, hostOnline) => {
      await this.loadExistingWorld(record, hostOnline);
    };
    this.mainMenu.onJoinRoomFromMenu = async (roomCode) => {
      this.player.setProfile(this.mainMenu.username, this.mainMenu.skinIndex, this.scene);
      this.mainMenu.hide();
      this.inWorld = true;
      this.player.viewModelGroup.visible = this.player.cameraMode === 0;
      this.player.syncCameraTransform(0.016);
      this.hud.setVisible(true);
      this.chatBox.setVisible(true);
      this.lobbyModal.open(roomCode);
      this.syncInputLockState();
      try {
        await this.joinMultiplayerWorld(roomCode);
        this.lobbyModal.close(true);
      } catch (err) {
        this.chatBox.addMessage('Erreur P2P', (err as Error).message, true);
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.inWorld) {
        this.persistCurrentWorld().catch(() => {});
      }
    });
  }

  private async bootInitialExperience(): Promise<void> {
    const previewSpawnY = this.world.generator.getSpawnHeight(8, 8);
    this.player.physState.position.set(8.5, previewSpawnY + 6, 8.5);
    this.world.update(0.016, 8.5, 8.5);

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room')?.trim() ?? '';
    await this.mainMenu.show(roomParam);
    this.syncInputLockState();
  }

  private async startNewWorld(opts: NewWorldOptions): Promise<void> {
    this.sound.unlock();
    this.requestWakeLock();
    this.player.setProfile(this.mainMenu.username, this.mainMenu.skinIndex, this.scene);

    this.atlas.setDesignPack(opts.designPack);
    this.pipeline.setMode(opts.graphicsMode);
    this.hud.updateGraphicsBadge(opts.graphicsMode);
    this.hud.updatePackBadge(opts.designPack);
    this.weather.setWeather('clear');
    this.hud.updateWeatherBadge('clear');

    this.entities.clearAll();
    this.particles.clearAll();
    this.world.resetWorld(opts.seed);

    this.player.armor = opts.gameMode === 'bastion' ? 12 : 0;
    this.player.absorption = 0;
    this.player.setGameMode(opts.gameMode);
    this.inventory.giveStarterKit(opts.gameMode);
    this.sky.timeOfDay = opts.gameMode === 'bastion' ? 13500 : 3800;
    this.player.respawnAtSpawn();

    // Spawn Companion Agent(s)
    this.entities.spawnCompanion(
      this.player.physState.position.x + 2.5,
      this.player.physState.position.y,
      this.player.physState.position.z - 2.0,
      'guard',
      this.world
    );
    if (opts.gameMode === 'bastion') {
      this.entities.spawnCompanion(
        this.player.physState.position.x - 2.5,
        this.player.physState.position.y,
        this.player.physState.position.z - 2.0,
        'guard',
        this.world
      );
      this.bastionWaveTimer = 8;
    }

    const now = Date.now();
    this.activeWorldRecord = {
      id: `world-${now.toString(36)}`,
      name: opts.name,
      seed: opts.seed,
      gameMode: opts.gameMode,
      timeOfDay: this.sky.timeOfDay,
      createdAt: now,
      updatedAt: now,
      deltas: [],
      chests: [],
      furnaces: [],
      companions: this.entities.serializeCompanions(),
      players: {},
    };
    await this.persistCurrentWorld();

    this.mainMenu.hide();
    this.inWorld = true;
    this.player.viewModelGroup.visible = this.player.cameraMode === 0 && opts.gameMode !== 'spectator';
    this.player.syncCameraTransform(0.016);
    this.hud.setVisible(true);
    this.chatBox.setVisible(true);
    this.chatBox.addMessage(
      'Bienvenue',
      `Monde "${opts.name}" (${DESIGN_PACK_INFO[opts.designPack].name}) prêt ! Testez l'Arc, le Grappin, la Baguette d'Architecte, la Météo ou tapez /help.`,
      true
    );

    if (opts.hostOnlineImmediately) {
      this.lobbyModal.open();
      const code = await this.network.startHosting();
      this.hostServer.worldName = opts.name;
      this.hostServer.start();
      this.hud.updateP2PBadge(code, 0);
      this.lobbyModal.refreshIfOpen();
    }

    this.syncInputLockState();
  }

  private async loadExistingWorld(record: WorldSaveRecord, hostOnline: boolean): Promise<void> {
    this.sound.unlock();
    this.requestWakeLock();
    this.player.setProfile(this.mainMenu.username, this.mainMenu.skinIndex, this.scene);

    this.activeWorldRecord = record;
    this.entities.clearAll();
    this.particles.clearAll();
    this.world.resetWorld(record.seed, record.deltas, record.furnaces, record.chests);
    this.sky.timeOfDay = record.timeOfDay;
    this.entities.loadSavedCompanions(record.companions ?? [], this.world);

    const savedPlayer = record.players['local'];
    if (savedPlayer) {
      this.player.setGameMode(savedPlayer.gameMode);
      this.player.physState.position.set(savedPlayer.x, savedPlayer.y, savedPlayer.z);
      this.player.physState.fallStartY = savedPlayer.y;
      this.player.yaw = savedPlayer.yaw;
      this.player.pitch = savedPlayer.pitch;
      this.player.health = savedPlayer.health;
      this.player.hunger = savedPlayer.hunger;
      this.inventory.deserialize(savedPlayer.inventory);
    } else {
      this.player.setGameMode(record.gameMode);
      this.inventory.giveStarterKit(record.gameMode);
      this.player.respawnAtSpawn();
    }

    this.mainMenu.hide();
    this.inWorld = true;
    this.player.viewModelGroup.visible = this.player.cameraMode === 0 && this.player.gameMode !== 'spectator';
    this.player.syncCameraTransform(0.016);
    this.hud.setVisible(true);
    this.chatBox.setVisible(true);
    this.hud.updateGraphicsBadge(this.pipeline.getMode());

    if (hostOnline) {
      this.lobbyModal.open();
      const code = await this.network.startHosting();
      this.hostServer.worldName = record.name;
      this.hostServer.start();
      this.hud.updateP2PBadge(code, 0);
      this.lobbyModal.refreshIfOpen();
    }

    this.syncInputLockState();
  }

  private async joinMultiplayerWorld(roomCode: string): Promise<void> {
    this.hostServer.stop();
    await this.network.joinRoomByCode(roomCode);
    this.hud.updateP2PBadge(this.network.roomCode, this.network.peers.size);
  }

  private handleClientReliablePacket(pkt: ReliablePacket): void {
    switch (pkt.type) {
      case 'WELCOME_INIT': {
        this.activeWorldRecord = null;
        this.clientRoster = pkt.roster;
        this.entities.clearAll();
        this.particles.clearAll();
        this.world.resetWorld(pkt.seed, [], [], pkt.chests);
        this.sky.timeOfDay = pkt.timeOfDay;
        this.player.setGameMode(pkt.gameMode);
        this.inventory.giveStarterKit(pkt.gameMode);
        this.player.respawnAtSpawn();
        this.entities.loadSavedCompanions(pkt.companions, this.world);
        this.lobbyModal.refreshIfOpen();
        this.chatBox.addMessage('Réseau P2P', `Connecté au monde "${pkt.worldName}" !`, true);
        break;
      }
      case 'ROSTER_UPDATE': {
        this.clientRoster = pkt.roster;
        this.lobbyModal.refreshIfOpen();
        break;
      }
      case 'WORLD_DELTAS_BATCH': {
        this.world.applyNetworkDeltasBatch(pkt.deltas);
        break;
      }
      case 'BLOCK_EDIT': {
        this.world.setBlock(pkt.wx, pkt.wy, pkt.wz, pkt.blockId, false, true);
        break;
      }
      case 'EXPLOSION': {
        for (const [bx, by, bz] of pkt.brokenBlocks) {
          this.world.setBlock(bx, by, bz, 0, false, false);
        }
        this.particles.spawnExplosionBurst(pkt.cx, pkt.cy, pkt.cz);
        this.sound.playExplosion();
        break;
      }
      case 'CHEST_SYNC': {
        this.world.chests.set(pkt.chest.key, pkt.chest);
        break;
      }
      case 'TIME_SYNC': {
        this.sky.timeOfDay = pkt.timeOfDay;
        break;
      }
      case 'WEATHER_SYNC': {
        this.weather.setWeather(pkt.weather);
        this.hud.updateWeatherBadge(pkt.weather);
        break;
      }
      case 'GAMEMODE_ASSIGN': {
        this.player.setGameMode(pkt.gameMode);
        this.syncInputLockState();
        break;
      }
      case 'TELEPORT_ASSIGN': {
        this.player.physState.position.set(pkt.x, pkt.y, pkt.z);
        this.player.physState.velocity.set(0, 0, 0);
        this.player.physState.fallStartY = pkt.y;
        break;
      }
      case 'COMPANION_SPAWN': {
        const c = pkt.companion;
        this.entities.spawnCompanion(c.x, c.y, c.z, c.role, this.world, c.id, c.name);
        break;
      }
      case 'COMPANION_ROLE': {
        const a = this.entities.companions.find((x) => x.id === pkt.companionId);
        a?.setRole(pkt.role, this.world);
        break;
      }
      case 'CHAT_MSG': {
        this.chatBox.addMessage(pkt.sender, pkt.text, pkt.system);
        break;
      }
      default:
        break;
    }
  }

  private handleClientFastSnapshot(buf: ArrayBuffer): void {
    const list = decodeHostPlayersSnapshot(buf);
    for (const st of list) {
      if (st.shortNumericId === this.network.localShortNumericId) continue;
      const info = this.clientRoster.find((r) => r.shortNumericId === st.shortNumericId);
      const pid = info?.peerId ?? `peer-${st.shortNumericId}`;
      const uname = info?.username ?? 'Joueur';
      const skin = info?.skinIndex ?? 0;
      this.entities.upsertRemotePlayer(
        pid,
        uname,
        skin,
        st.x,
        st.y,
        st.z,
        st.yaw,
        st.pitch,
        st.sneaking,
        st.swinging,
        st.heldItemId
      );
    }
  }

  public async persistCurrentWorld(): Promise<void> {
    if (!this.inWorld || !this.activeWorldRecord || this.network.role === 'client') return;

    this.activeWorldRecord.timeOfDay = this.sky.timeOfDay;
    this.activeWorldRecord.gameMode = this.player.gameMode;
    this.activeWorldRecord.deltas = this.world.serializeDeltas();
    this.activeWorldRecord.chests = Array.from(this.world.chests.values());
    this.activeWorldRecord.furnaces = Array.from(this.world.furnaces.values());
    this.activeWorldRecord.companions = this.entities.serializeCompanions();
    this.activeWorldRecord.players['local'] = {
      playerId: 'local',
      username: this.player.username,
      x: this.player.physState.position.x,
      y: this.player.physState.position.y,
      z: this.player.physState.position.z,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      health: this.player.health,
      hunger: this.player.hunger,
      gameMode: this.player.gameMode,
      inventory: this.inventory.serialize(),
    };

    await this.db.saveWorld(this.activeWorldRecord);
  }

  private async toggleFullscreenAndWakeLock(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        const scr = screen as Screen & { orientation?: { lock?: (mode: string) => Promise<void> } };
        await scr.orientation?.lock?.('landscape').catch(() => {});
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
    this.requestWakeLock();
  }

  private requestWakeLock(): void {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
    };
    if (nav.wakeLock && !this.wakeLockSentinel) {
      nav.wakeLock
        .request('screen')
        .then((s) => {
          this.wakeLockSentinel = s;
          s.addEventListener('release', () => {
            this.wakeLockSentinel = null;
          });
        })
        .catch(() => {});
    }
  }

  private loop(nowMs: number): void {
    const rawDt = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    this.elapsedSec += dt;

    this.fpsFrames++;
    this.fpsTimer += rawDt;
    if (this.fpsTimer >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    const modalOpen = this.isAnyModalOpen();
    const snap = this.input.sampleFrameInput(dt, () => this.input.onTogglePause?.());

    if (this.inWorld) {
      if (!modalOpen) {
        this.player.update(dt, snap);
      } else {
        this.player.ensureNotEmbeddedInTerrain();
        this.player.syncCameraTransform(dt);
      }

      const pPos = this.player.physState.position;
      this.sky.update(dt, this.elapsedSec, pPos, this.network.role !== 'client');
      this.weather.update(dt, this.elapsedSec, pPos);
      this.pipeline.setWeatherParams(this.weather.wetness, this.weather.lightningFlash);
      this.pipeline.updateDynamicHandLight(
        this.player.getEyePosition(),
        this.player.getHeldLightEmission()
      );
      this.world.update(dt, pPos.x, pPos.z);

      // Bastion wave progression
      if (this.player.gameMode === 'bastion' && this.network.role !== 'client') {
        this.bastionWaveTimer -= dt;
        const activeHostiles = this.entities.mobs.filter((m) => m.hostile).length;
        if (this.bastionWaveTimer <= 0 && activeHostiles <= 2) {
          this.bastionWaveTimer = 38;
          const nextWave = this.entities.bastionWave + 1;
          const n = this.entities.spawnBastionWave(nextWave, this.world, pPos);
          this.chatBox.addMessage('Bastion', `⚔️ VAGUE #${nextWave} EN APPROCHE (${n} monstres) !`, true);
        }
      }

      this.particles.update(
        dt,
        (wx, wy, wz) => this.world.isSolidAt(wx, wy, wz),
        pPos,
        (drop) => {
          if (this.player.gameMode === 'spectator') return false;
          const added = this.inventory.addItem(drop.itemId, drop.count, drop.durability);
          if (added > 0) {
            this.sound.playPickupPop();
            return added >= drop.count;
          }
          return false;
        }
      );

      this.entities.update(
        dt,
        this.world,
        pPos,
        !this.player.isInvulnerableMode(),
        this.sky.sunBrightness,
        (dmg, kx, kz) => this.player.applyDamage(dmg, kx, kz)
      );

      if (this.network.role === 'client' && this.network.peers.size > 0) {
        this.clientStateSendAccum += dt;
        if (this.clientStateSendAccum >= 0.05) {
          this.clientStateSendAccum = 0;
          const held = this.inventory.getHeldStack()?.itemId ?? 0;
          const bin = encodeClientPlayerState({
            shortNumericId: this.network.localShortNumericId,
            x: pPos.x,
            y: pPos.y,
            z: pPos.z,
            yaw: this.player.yaw,
            pitch: this.player.pitch,
            sneaking: this.player.physState.isSneaking,
            swinging: snap.mineHeld,
            flying: this.player.physState.isFlying,
            heldItemId: held,
          });
          this.network.broadcastFastBinary(bin);
        }
      }

      this.autoSaveAccum += dt;
      if (this.autoSaveAccum >= 15) {
        this.autoSaveAccum = 0;
        this.persistCurrentWorld().catch(() => {});
      }

      const light = this.world.getLightAt(pPos.x, pPos.y + 1, pPos.z);
      this.hud.updateVitalsAndDebug(this.player, {
        fps: this.currentFps,
        x: pPos.x,
        y: pPos.y,
        z: pPos.z,
        cx: worldToChunkCoord(Math.floor(pPos.x)),
        cz: worldToChunkCoord(Math.floor(pPos.z)),
        biome: this.world.getBiomeLabelAt(pPos.x, pPos.z),
        skyLight: light.sky,
        blockLight: light.block,
        seed: this.world.seed,
        gameMode: this.player.gameMode,
        graphicsMode: this.pipeline.getMode(),
        designPack: this.atlas.currentPack,
        weather: this.weather.currentWeather,
        killScore: this.entities.killScore,
        bastionWave: this.entities.bastionWave,
        inputDevice:
          this.input.activeDevice === 'gamepad'
            ? 'Manette Gamepad'
            : this.input.activeDevice === 'touch'
            ? `Écran Tactile (${this.input.touch.aimMode})`
            : 'Clavier / Souris',
        p2pStatus: this.network.statusText,
        peerCount: this.network.peers.size,
        pingMs: this.network.getAveragePingMs(),
      });
    } else {
      const pPos = this.player.physState.position;
      this.world.update(dt, pPos.x, pPos.z);
      this.sky.update(dt, this.elapsedSec, pPos, true);
      this.weather.update(dt, this.elapsedSec, pPos);
      this.pipeline.setWeatherParams(this.weather.wetness, this.weather.lightningFlash);
      const angle = this.elapsedSec * 0.12;
      const orbitDist = 18;
      const ox = Math.cos(angle) * orbitDist;
      const oz = Math.sin(angle) * orbitDist;
      this.camera.position.set(pPos.x + ox, pPos.y + 12, pPos.z + oz);
      const orbitYaw = Math.atan2(ox, oz);
      const orbitPitch = -Math.atan2(14, orbitDist);
      this.camera.rotation.set(orbitPitch, orbitYaw, 0, 'YXZ');
    }

    this.pipeline.renderFrame(this.elapsedSec);
    requestAnimationFrame((t) => this.loop(t));
  }
}
