import Peer, { type DataConnection } from 'peerjs';
import { joinRoom, selfId as trysteroSelfId, type ActionSender, type Room } from 'trystero';
import { hashPeerShortId, type ReliablePacket } from './PacketSerializer';

export type P2PRole = 'offline' | 'host' | 'client';

interface ConnectedPeerPair {
  peerId: string;
  reliableConn?: DataConnection;
  fastConn?: DataConnection;
  viaTrystero?: boolean;
  viaLocalBroadcast?: boolean;
  pingMs: number;
}

const PUBLIC_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function roomCodeToPeerId(roomCode: string): string {
  const clean = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `voxelcraft-ghp-host-${clean}`;
}

export function normalizeRoomCode(raw: string): string {
  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.startsWith('VX') && clean.length >= 6) {
    return `VX-${clean.slice(2, 6)}`;
  }
  if (clean.length === 4) {
    return `VX-${clean}`;
  }
  return clean.slice(0, 7) || 'VX-1024';
}

export function generateShortRoomCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `VX-${num}`;
}

export function buildInviteUrl(roomCode: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('room', normalizeRoomCode(roomCode));
  url.hash = '';
  return url.toString();
}

export class P2PNetworkManager {
  public role: P2PRole = 'offline';
  public roomCode = '';
  public localPeerId = 'solo-local';
  public localShortNumericId = hashPeerShortId('solo-local');
  public statusText = 'Solo / Hors-ligne';

  private peer: Peer | null = null;
  private trysteroRoom: Room | null = null;
  private trysteroSendReliable: ActionSender<string> | null = null;
  private trysteroSendFast: ActionSender<Uint8Array> | null = null;
  private localChannel: BroadcastChannel | null = null;
  private readonly tabSessionId = `tab-${Math.random().toString(36).slice(2, 9)}`;

  public readonly peers = new Map<string, ConnectedPeerPair>();
  private pingTimer: number | null = null;

  public onPeerConnected?: (peerId: string) => void;
  public onPeerDisconnected?: (peerId: string) => void;
  public onReliableMessage?: (fromPeerId: string, packet: ReliablePacket) => void;
  public onFastBinaryMessage?: (fromPeerId: string, buffer: ArrayBuffer) => void;
  public onStatusChange?: (status: string) => void;

  private setStatus(s: string): void {
    this.statusText = s;
    this.onStatusChange?.(s);
  }

  public getAveragePingMs(): number {
    if (this.peers.size === 0) return 0;
    let sum = 0;
    let count = 0;
    for (const p of this.peers.values()) {
      if (p.pingMs > 0) {
        sum += p.pingMs;
        count++;
      }
    }
    return count > 0 ? Math.round(sum / count) : 0;
  }

  public disconnect(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const p of this.peers.values()) {
      p.reliableConn?.close();
      p.fastConn?.close();
    }
    this.peers.clear();

    if (this.localChannel) {
      this.localChannel.postMessage({ kind: 'BYE', from: this.tabSessionId });
      this.localChannel.close();
      this.localChannel = null;
    }
    if (this.trysteroRoom) {
      this.trysteroRoom.leave().catch(() => {});
      this.trysteroRoom = null;
      this.trysteroSendReliable = null;
      this.trysteroSendFast = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    this.role = 'offline';
    this.roomCode = '';
    this.localPeerId = 'solo-local';
    this.localShortNumericId = hashPeerShortId('solo-local');
    this.setStatus('Solo / Hors-ligne');
  }

  /**
   * Starts embedded Host mode with a 6-char room code (e.g. VX-4829) over PeerJS + Trystero WebRTC fallback.
   */
  public async startHosting(customRoomCode?: string): Promise<string> {
    this.disconnect();
    this.role = 'host';
    this.roomCode = customRoomCode ? normalizeRoomCode(customRoomCode) : generateShortRoomCode();
    const hostPeerId = roomCodeToPeerId(this.roomCode);

    this.setStatus(`Initialisation du salon ${this.roomCode}...`);

    // Activate instant Local BroadcastChannel (for multi-tab same-PC testing) + Trystero WebRTC relay mesh
    this.initLocalBroadcastTransport(this.roomCode);
    this.initTrysteroFallback(this.roomCode);

    return new Promise((resolve) => {
      let resolved = false;
      const finish = (id: string, label: string) => {
        if (resolved) return;
        resolved = true;
        this.localPeerId = id;
        this.localShortNumericId = hashPeerShortId(id);
        this.setStatus(label);
        this.startPingLoop();
        resolve(this.roomCode);
      };

      try {
        const peer = new Peer(hostPeerId, {
          config: { iceServers: PUBLIC_ICE_SERVERS },
        });
        this.peer = peer;

        peer.on('open', (id) => {
          finish(id, `Hôte P2P Actif (${this.roomCode})`);
        });

        peer.on('connection', (conn) => {
          this.attachPeerJSConnection(conn);
        });

        peer.on('error', (err) => {
          if (err.type === 'unavailable-id') {
            // Collision on 4-digit room code: regenerate once automatically
            this.roomCode = generateShortRoomCode();
            peer.destroy();
            this.startHosting(this.roomCode).then(resolve);
            resolved = true;
            return;
          }
          // Fallback seamlessly to Trystero serverless signaling
          finish(`trystero-host-${trysteroSelfId}`, `Hôte P2P Relais Serverless (${this.roomCode})`);
        });

        window.setTimeout(() => {
          finish(`trystero-host-${trysteroSelfId}`, `Hôte P2P (${this.roomCode})`);
        }, 4500);
      } catch {
        finish(`trystero-host-${trysteroSelfId}`, `Hôte P2P Serverless (${this.roomCode})`);
      }
    });
  }

  /**
   * Connects as a Client to an existing Host via short Room Code (e.g. VX-4829).
   */
  public async joinRoomByCode(code: string): Promise<void> {
    this.disconnect();
    this.role = 'client';
    this.roomCode = normalizeRoomCode(code);
    const targetHostPeerId = roomCodeToPeerId(this.roomCode);

    this.setStatus(`Connexion au salon ${this.roomCode}...`);
    this.localPeerId = this.tabSessionId;
    this.localShortNumericId = hashPeerShortId(this.tabSessionId);
    this.initLocalBroadcastTransport(this.roomCode);
    this.initTrysteroFallback(this.roomCode);

    return new Promise((resolve, reject) => {
      let connected = false;

      const onConnectedSuccess = () => {
        if (connected) return;
        connected = true;
        this.setStatus(`Connecté au salon ${this.roomCode}`);
        this.startPingLoop();
        resolve();
      };

      const prevOnConn = this.onPeerConnected;
      this.onPeerConnected = (pid) => {
        prevOnConn?.(pid);
        onConnectedSuccess();
      };

      try {
        const peer = new Peer({
          config: { iceServers: PUBLIC_ICE_SERVERS },
        });
        this.peer = peer;

        peer.on('open', (myId) => {
          this.localPeerId = myId;
          this.localShortNumericId = hashPeerShortId(myId);

          // 1. Reliable Ordered DataChannel (seed, worldDeltas, blocks, chests, chat)
          const relConn = peer.connect(targetHostPeerId, {
            label: 'vx-reliable',
            reliable: true,
            serialization: 'json',
          });
          this.attachPeerJSConnection(relConn);

          // 2. Fast Unordered DataChannel (20 Hz ArrayBuffer player states)
          const fastConn = peer.connect(targetHostPeerId, {
            label: 'vx-fast',
            reliable: false,
            serialization: 'raw',
          });
          this.attachPeerJSConnection(fastConn);
        });

        peer.on('error', () => {
          this.localPeerId = `trystero-client-${trysteroSelfId}`;
          this.localShortNumericId = hashPeerShortId(this.localPeerId);
          this.setStatus(`Recherche P2P serverless (${this.roomCode})...`);
        });
      } catch {
        this.localPeerId = `trystero-client-${trysteroSelfId}`;
        this.localShortNumericId = hashPeerShortId(this.localPeerId);
      }

      window.setTimeout(() => {
        if (!connected) {
          if (this.peers.size > 0) {
            onConnectedSuccess();
          } else {
            this.setStatus(`Délai dépassé pour ${this.roomCode}`);
            reject(new Error(`Impossible de joindre l'hôte du salon ${this.roomCode}. Vérifiez que l'hôte a ouvert le salon.`));
          }
        }
      }, 12000);
    });
  }

  private attachPeerJSConnection(conn: DataConnection): void {
    const remoteId = conn.peer;
    const isFast = conn.label === 'vx-fast';

    conn.on('open', () => {
      // Configure underlying RTCDataChannel if accessible for strict maxRetransmits = 0 on fast channel
      const dc = (conn as unknown as { dataChannel?: RTCDataChannel }).dataChannel;
      if (dc && isFast) {
        dc.binaryType = 'arraybuffer';
      }

      let entry = this.peers.get(remoteId);
      const isFirstChannel = !entry;
      if (!entry) {
        entry = { peerId: remoteId, pingMs: 0 };
        this.peers.set(remoteId, entry);
      }

      if (isFast) {
        entry.fastConn = conn;
      } else {
        entry.reliableConn = conn;
      }

      if (isFirstChannel || (!isFast && entry.reliableConn === conn)) {
        this.onPeerConnected?.(remoteId);
      }
    });

    conn.on('data', (data: unknown) => {
      if (isFast || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        const buf =
          data instanceof ArrayBuffer
            ? data
            : ArrayBuffer.isView(data)
            ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
            : null;
        if (buf) {
          this.onFastBinaryMessage?.(remoteId, buf);
        }
        return;
      }

      const pkt = data as ReliablePacket;
      if (pkt && typeof pkt === 'object' && 'type' in pkt) {
        if (pkt.type === 'PING') {
          this.sendReliableTo(remoteId, { type: 'PONG', sentAt: pkt.sentAt });
          return;
        }
        if (pkt.type === 'PONG') {
          const entry = this.peers.get(remoteId);
          if (entry) entry.pingMs = Math.max(1, Math.round(performance.now() - pkt.sentAt));
          return;
        }
        this.onReliableMessage?.(remoteId, pkt);
      }
    });

    conn.on('close', () => {
      const entry = this.peers.get(remoteId);
      if (!entry) return;
      if (isFast) entry.fastConn = undefined;
      else entry.reliableConn = undefined;

      if (!entry.fastConn && !entry.reliableConn && !entry.viaTrystero) {
        this.peers.delete(remoteId);
        this.onPeerDisconnected?.(remoteId);
      }
    });
  }

  private initTrysteroFallback(roomCode: string): void {
    try {
      const room = joinRoom(
        {
          appId: 'voxelcraft-online-ghpages-v1',
          rtcConfig: { iceServers: PUBLIC_ICE_SERVERS },
        },
        normalizeRoomCode(roomCode)
      );
      this.trysteroRoom = room;

      const [sendRel, getRel] = room.makeAction<string>('vxrel');
      const [sendFast, getFast] = room.makeAction<Uint8Array>('vxfast');
      this.trysteroSendReliable = sendRel;
      this.trysteroSendFast = sendFast;

      room.onPeerJoin((pid) => {
        // Avoid duplicate registration if PeerJS already linked this session
        if (!this.peers.has(pid) && this.peers.size === 0) {
          this.peers.set(pid, { peerId: pid, viaTrystero: true, pingMs: 18 });
          this.onPeerConnected?.(pid);
        }
      });

      room.onPeerLeave((pid) => {
        const entry = this.peers.get(pid);
        if (entry?.viaTrystero) {
          this.peers.delete(pid);
          this.onPeerDisconnected?.(pid);
        }
      });

      getRel((jsonStr, pid) => {
        if (!this.peers.get(pid)?.viaTrystero) return;
        try {
          const pkt = JSON.parse(jsonStr) as ReliablePacket;
          if (pkt.type === 'PING') {
            this.sendReliableTo(pid, { type: 'PONG', sentAt: pkt.sentAt });
            return;
          }
          if (pkt.type === 'PONG') {
            const entry = this.peers.get(pid);
            if (entry) entry.pingMs = Math.max(1, Math.round(performance.now() - pkt.sentAt));
            return;
          }
          this.onReliableMessage?.(pid, pkt);
        } catch {
          // ignore malformed packet
        }
      });

      getFast((bytes, pid) => {
        if (!this.peers.get(pid)?.viaTrystero) return;
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        this.onFastBinaryMessage?.(pid, buf);
      });
    } catch {
      // Offline mode without network access still works cleanly
    }
  }

  private initLocalBroadcastTransport(roomCode: string): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const ch = new BroadcastChannel(`voxelcraft-p2p-${normalizeRoomCode(roomCode)}`);
      this.localChannel = ch;

      ch.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as {
          kind: 'SYN' | 'ACK' | 'BYE' | 'REL' | 'FAST';
          from: string;
          to?: string;
          pkt?: ReliablePacket;
          buf?: ArrayBuffer;
        };
        if (!msg || msg.from === this.tabSessionId) return;
        if (msg.to && msg.to !== this.tabSessionId) return;

        if (msg.kind === 'SYN' && this.role === 'host') {
          if (!this.peers.has(msg.from)) {
            this.peers.set(msg.from, { peerId: msg.from, viaLocalBroadcast: true, pingMs: 1 });
            ch.postMessage({ kind: 'ACK', from: this.tabSessionId, to: msg.from });
            this.onPeerConnected?.(msg.from);
          }
          return;
        }

        if (msg.kind === 'ACK' && this.role === 'client') {
          if (!this.peers.has(msg.from)) {
            this.peers.set(msg.from, { peerId: msg.from, viaLocalBroadcast: true, pingMs: 1 });
            this.onPeerConnected?.(msg.from);
          }
          return;
        }

        if (msg.kind === 'BYE') {
          if (this.peers.get(msg.from)?.viaLocalBroadcast) {
            this.peers.delete(msg.from);
            this.onPeerDisconnected?.(msg.from);
          }
          return;
        }

        if (msg.kind === 'REL' && msg.pkt && this.peers.get(msg.from)?.viaLocalBroadcast) {
          if (msg.pkt.type === 'PING') {
            this.sendReliableTo(msg.from, { type: 'PONG', sentAt: msg.pkt.sentAt });
            return;
          }
          if (msg.pkt.type === 'PONG') {
            const entry = this.peers.get(msg.from);
            if (entry) entry.pingMs = Math.max(1, Math.round(performance.now() - msg.pkt.sentAt));
            return;
          }
          this.onReliableMessage?.(msg.from, msg.pkt);
        } else if (msg.kind === 'FAST' && msg.buf && this.peers.get(msg.from)?.viaLocalBroadcast) {
          this.onFastBinaryMessage?.(msg.from, msg.buf);
        }
      };

      if (this.role === 'client') {
        window.setTimeout(() => {
          ch.postMessage({ kind: 'SYN', from: this.tabSessionId });
        }, 40);
      }
    } catch {
      // ignore if BroadcastChannel unavailable
    }
  }

  public sendReliableTo(peerId: string, packet: ReliablePacket): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    if (entry.viaLocalBroadcast && this.localChannel) {
      this.localChannel.postMessage({ kind: 'REL', from: this.tabSessionId, to: peerId, pkt: packet });
    } else if (entry.reliableConn?.open) {
      entry.reliableConn.send(packet);
    } else if (entry.viaTrystero && this.trysteroSendReliable) {
      this.trysteroSendReliable(JSON.stringify(packet), peerId).catch(() => {});
    }
  }

  public broadcastReliable(packet: ReliablePacket, excludePeerId?: string): void {
    for (const [pid, entry] of this.peers.entries()) {
      if (pid === excludePeerId) continue;
      if (entry.viaLocalBroadcast && this.localChannel) {
        this.localChannel.postMessage({ kind: 'REL', from: this.tabSessionId, to: pid, pkt: packet });
      } else if (entry.reliableConn?.open) {
        entry.reliableConn.send(packet);
      } else if (entry.viaTrystero && this.trysteroSendReliable) {
        this.trysteroSendReliable(JSON.stringify(packet), pid).catch(() => {});
      }
    }
  }

  public broadcastFastBinary(buffer: ArrayBuffer): void {
    const bytes = new Uint8Array(buffer);
    for (const [pid, entry] of this.peers.entries()) {
      if (entry.viaLocalBroadcast && this.localChannel) {
        this.localChannel.postMessage({ kind: 'FAST', from: this.tabSessionId, to: pid, buf: buffer });
      } else if (entry.fastConn?.open) {
        entry.fastConn.send(buffer);
      } else if (entry.viaTrystero && this.trysteroSendFast) {
        this.trysteroSendFast(bytes, pid).catch(() => {});
      }
    }
  }

  private startPingLoop(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => {
      this.broadcastReliable({ type: 'PING', sentAt: performance.now() });
    }, 2500);
  }
}

// ============================================================================
// PURE TYPESCRIPT ISO/IEC 18004 QR CODE GENERATOR ON CANVAS (LEVEL L, V1..V6)
// Zero external dependencies — 100% static & scannable offline on GitHub Pages
// ============================================================================

const QR_VERSIONS: Array<{
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewordsPerBlock: number;
  numBlocks: number;
  align: number[];
}> = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewordsPerBlock: 7, numBlocks: 1, align: [] },
  { version: 2, size: 25, dataCodewords: 34, ecCodewordsPerBlock: 10, numBlocks: 1, align: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecCodewordsPerBlock: 15, numBlocks: 1, align: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewordsPerBlock: 20, numBlocks: 1, align: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecCodewordsPerBlock: 26, numBlocks: 1, align: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecCodewordsPerBlock: 18, numBlocks: 2, align: [6, 34] },
];

function gfMul(a: number, b: number): number {
  let res = 0;
  let x = a;
  let y = b;
  while (y > 0) {
    if (y & 1) res ^= x;
    y >>= 1;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  return res;
}

function rsComputeRemainder(data: Uint8Array, degree: number): Uint8Array {
  // Build generator polynomial (x - 2^0)(x - 2^1)...(x - 2^(degree-1))
  let gen = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]!;
      next[j + 1] ^= gfMul(gen[j]!, root);
    }
    gen = next;
    root = gfMul(root, 2);
  }

  const rem = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ rem[0]!;
    rem.copyWithin(0, 1);
    rem[degree - 1] = 0;
    for (let j = 0; j < degree; j++) {
      rem[j] ^= gfMul(gen[j + 1]!, factor);
    }
  }
  return rem;
}

export function drawQrCodeToCanvas(text: string, canvas: HTMLCanvasElement): void {
  const utf8 = new TextEncoder().encode(text);
  // Pick smallest QR version supporting utf8.length + 2 bytes header
  const spec =
    QR_VERSIONS.find((v) => v.dataCodewords >= utf8.length + 3) ?? QR_VERSIONS[QR_VERSIONS.length - 1]!;
  const payload = utf8.length + 3 > spec.dataCodewords ? utf8.slice(0, spec.dataCodewords - 3) : utf8;

  // 1. Encode bit stream: Byte Mode (0100) + 8-bit char count + bytes + terminator + pad 0xEC/0x11
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };

  pushBits(0b0100, 4);
  pushBits(payload.length, 8);
  for (const b of payload) pushBits(b, 8);

  const maxBits = spec.dataCodewords * 8;
  const term = Math.min(4, maxBits - bits.length);
  pushBits(0, term);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b]!;
    dataBytes[i] = byte;
  }
  const pads = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < spec.dataCodewords; i++, p++) {
    dataBytes[i] = pads[p % 2]!;
  }

  // 2. Reed-Solomon ECC & Block Interleaving
  const blockDataLen = Math.floor(spec.dataCodewords / spec.numBlocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let b = 0; b < spec.numBlocks; b++) {
    const slice = dataBytes.slice(b * blockDataLen, (b + 1) * blockDataLen);
    dataBlocks.push(slice);
    ecBlocks.push(rsComputeRemainder(slice, spec.ecCodewordsPerBlock));
  }

  const fullCodewords: number[] = [];
  for (let i = 0; i < blockDataLen; i++) {
    for (let b = 0; b < spec.numBlocks; b++) fullCodewords.push(dataBlocks[b]![i]!);
  }
  for (let i = 0; i < spec.ecCodewordsPerBlock; i++) {
    for (let b = 0; b < spec.numBlocks; b++) fullCodewords.push(ecBlocks[b]![i]!);
  }

  // 3. Matrix Construction
  const N = spec.size;
  const modules: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  const isFunc: boolean[][] = Array.from({ length: N }, () => new Array(N).fill(false));

  const setFunc = (x: number, y: number, dark: boolean) => {
    if (x < 0 || x >= N || y < 0 || y >= N) return;
    modules[y]![x] = dark ? 1 : 0;
    isFunc[y]![x] = true;
  };

  const drawFinder = (ox: number, oy: number) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        const dark = dist !== 2 && dist !== 4;
        setFunc(ox + dx, oy + dy, dark);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(N - 7, 0);
  drawFinder(0, N - 7);

  for (let i = 8; i < N - 8; i++) {
    setFunc(i, 6, i % 2 === 0);
    setFunc(6, i, i % 2 === 0);
  }

  for (const ay of spec.align) {
    for (const ax of spec.align) {
      if ((ax < 9 && ay < 9) || (ax > N - 10 && ay < 9) || (ax < 9 && ay > N - 10)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunc(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve Format Info modules + Dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunc[8]![i] = true;
      isFunc[i]![8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunc[8]![N - 1 - i] = true;
    isFunc[N - 1 - i]![8] = true;
  }
  setFunc(8, N - 8, true);

  // 4. Zigzag Data Placement + Mask 0 ((x + y) % 2 === 0)
  const allBits: number[] = [];
  for (const cw of fullCodewords) {
    for (let b = 7; b >= 0; b--) allBits.push((cw >>> b) & 1);
  }

  let bitIdx = 0;
  for (let right = N - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < N; vert++) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? N - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (!isFunc[y]![x]) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++]! : 0;
          const invert = (x + y) % 2 === 0 ? 1 : 0;
          modules[y]![x] = bit ^ invert;
        }
      }
    }
  }

  // 5. Write BCH Format Information for ECC Level L (01) + Mask 0 (000) -> data = 0b01000
  const fmtData = (0b01 << 3) | 0;
  let rem = fmtData << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  }
  const fmtBits = ((fmtData << 10) | rem) ^ 0x5412;
  const fBit = (i: number) => ((fmtBits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) setFunc(8, i, fBit(i));
  setFunc(8, 7, fBit(6));
  setFunc(8, 8, fBit(7));
  setFunc(7, 8, fBit(8));
  for (let i = 9; i < 15; i++) setFunc(14 - i, 8, fBit(i));

  for (let i = 0; i < 8; i++) setFunc(N - 1 - i, 8, fBit(i));
  for (let i = 8; i < 15; i++) setFunc(8, N - 15 + i, fBit(i));
  setFunc(8, N - 8, true);

  // 6. Render crisp QR Code onto target HTMLCanvasElement
  const quiet = 3;
  const totalMods = N + quiet * 2;
  const pxScale = Math.max(4, Math.floor(196 / totalMods));
  const canvasSize = totalMods * pxScale;
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = '#0f172a';

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (modules[y]![x] === 1) {
        ctx.fillRect((x + quiet) * pxScale, (y + quiet) * pxScale, pxScale, pxScale);
      }
    }
  }
}
