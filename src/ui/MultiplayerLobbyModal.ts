import {
  buildInviteUrl,
  drawQrCodeToCanvas,
  normalizeRoomCode,
  type P2PNetworkManager,
} from '../network/P2PNetworkManager';
import type { PeerIdentityInfo } from '../network/PacketSerializer';

export class MultiplayerLobbyModal {
  private backdrop: HTMLDivElement | null = null;
  private readonly network: P2PNetworkManager;
  private getRosterFn: () => PeerIdentityInfo[];

  public onHostRequested?: () => Promise<string>;
  public onJoinRequested?: (roomCode: string) => Promise<void>;
  public onDisconnectRequested?: () => void;
  public onClose?: () => void;

  constructor(network: P2PNetworkManager, getRosterFn: () => PeerIdentityInfo[]) {
    this.network = network;
    this.getRosterFn = getRosterFn;
  }

  public isOpen(): boolean {
    return this.backdrop !== null;
  }

  public open(prefillJoinCode = ''): void {
    this.close(false);

    const backdrop = document.createElement('div');
    backdrop.id = 'multiplayer-lobby-modal';
    backdrop.className = 'modal-backdrop';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '480px';

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    this.backdrop = backdrop;

    this.renderContent(card, prefillJoinCode);
  }

  public refreshIfOpen(): void {
    if (!this.backdrop) return;
    const card = this.backdrop.querySelector('.modal-card') as HTMLDivElement | null;
    if (card) this.renderContent(card, '');
  }

  private renderContent(card: HTMLDivElement, prefillJoinCode: string): void {
    const isOnline = this.network.role !== 'offline' && this.network.roomCode !== '';

    if (!isOnline) {
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong style="font-size:16px;">🌐 Salon Multijoueur P2P</strong>
          <button type="button" class="voxel-btn" id="btn-close-lobby">✕</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          <button type="button" class="voxel-btn primary" id="btn-start-host" style="width:100%;padding:11px;font-size:14px;">
            🚀 Héberger ce Monde en Ligne
          </button>

          <div style="text-align:center;font-size:11px;color:#64748b;">— ou rejoindre avec un code —</div>

          <div style="display:flex;gap:6px;">
            <input type="text" id="inp-join-code" class="voxel-input" placeholder="VX-4829"
              value="${prefillJoinCode}" style="flex:1;text-transform:uppercase;font-weight:800;text-align:center;" />
            <button type="button" class="voxel-btn blue" id="btn-join-room">Rejoindre</button>
          </div>
        </div>
        <div id="lobby-feedback" style="margin-top:8px;font-size:12px;color:#facc15;text-align:center;"></div>
      `;

      card.querySelector('#btn-close-lobby')!.addEventListener('click', () => this.close(true));

      const feedback = card.querySelector('#lobby-feedback') as HTMLDivElement;
      const hostBtn = card.querySelector('#btn-start-host') as HTMLButtonElement;
      hostBtn.addEventListener('click', async () => {
        hostBtn.disabled = true;
        feedback.textContent = '⏳ Ouverture du salon...';
        try {
          await this.onHostRequested?.();
          this.renderContent(card, '');
        } catch (err) {
          feedback.textContent = `Erreur : ${(err as Error).message}`;
          hostBtn.disabled = false;
        }
      });

      const joinBtn = card.querySelector('#btn-join-room') as HTMLButtonElement;
      const joinInp = card.querySelector('#inp-join-code') as HTMLInputElement;
      joinBtn.addEventListener('click', async () => {
        const raw = joinInp.value.trim();
        if (!raw) return;
        joinBtn.disabled = true;
        feedback.textContent = `⏳ Connexion à ${normalizeRoomCode(raw)}...`;
        try {
          await this.onJoinRequested?.(normalizeRoomCode(raw));
          this.renderContent(card, '');
        } catch (err) {
          feedback.textContent = `⚠️ ${(err as Error).message}`;
          joinBtn.disabled = false;
        }
      });

      return;
    }

    const roomCode = this.network.roomCode;
    const inviteUrl = buildInviteUrl(roomCode);
    const roster = this.getRosterFn();

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <span style="font-size:12px;color:#94a3b8;">Code Salon : </span>
          <strong id="active-room-code" style="font-size:18px;color:#4ade80;font-family:monospace;">${roomCode}</strong>
        </div>
        <button type="button" class="voxel-btn primary" id="btn-close-lobby">▶ Jouer</button>
      </div>

      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center;">
        <div style="flex:1;min-width:190px;display:flex;flex-direction:column;gap:7px;">
          <div style="display:flex;gap:6px;">
            <button type="button" class="voxel-btn primary" id="btn-copy-code" style="flex:1;">📋 Code</button>
            <button type="button" class="voxel-btn blue" id="btn-copy-link" style="flex:1;">🔗 Lien</button>
          </div>

          <div style="background:rgba(9,13,22,0.8);border:1px solid #334155;border-radius:8px;padding:7px 9px;max-height:96px;overflow-y:auto;">
            <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">
              Joueurs (${roster.length}) • ${this.network.getAveragePingMs()} ms
            </div>
            <div id="roster-list" style="display:flex;flex-direction:column;gap:3px;font-size:12px;"></div>
          </div>

          <button type="button" class="voxel-btn danger" id="btn-leave-p2p" style="padding:7px;">🔌 Quitter le Salon</button>
        </div>

        <div style="display:flex;flex-direction:column;align-items:center;background:#fff;padding:6px;border-radius:8px;">
          <canvas id="room-qr-canvas" style="width:132px;height:132px;display:block;"></canvas>
        </div>
      </div>
      <div id="copy-toast" style="margin-top:6px;font-size:11px;color:#4ade80;text-align:center;"></div>
    `;

    const qrCanvas = card.querySelector('#room-qr-canvas') as HTMLCanvasElement;
    drawQrCodeToCanvas(inviteUrl, qrCanvas);

    const rosterEl = card.querySelector('#roster-list') as HTMLDivElement;
    for (const p of roster) {
      const row = document.createElement('div');
      row.textContent = `🟢 ${p.username}`;
      rosterEl.appendChild(row);
    }

    const toast = card.querySelector('#copy-toast') as HTMLDivElement;
    card.querySelector('#btn-copy-code')!.addEventListener('click', () => {
      navigator.clipboard?.writeText(roomCode).catch(() => {});
      toast.textContent = `✅ Code ${roomCode} copié !`;
    });
    card.querySelector('#btn-copy-link')!.addEventListener('click', () => {
      navigator.clipboard?.writeText(inviteUrl).catch(() => {});
      toast.textContent = '✅ Lien d\'invitation copié !';
    });
    card.querySelector('#btn-leave-p2p')!.addEventListener('click', () => {
      this.onDisconnectRequested?.();
      this.renderContent(card, '');
    });
    card.querySelector('#btn-close-lobby')!.addEventListener('click', () => this.close(true));
  }

  public close(notify = true): void {
    if (this.backdrop) {
      this.backdrop.remove();
      this.backdrop = null;
      if (notify) this.onClose?.();
    }
  }
}
