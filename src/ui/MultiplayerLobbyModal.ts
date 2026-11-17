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
    card.style.width = 'min(640px, 95vw)';

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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h2 style="margin:0;font-size:20px;">🌐 Salon Multijoueur Serverless P2P (WebRTC)</h2>
          <button type="button" class="voxel-btn" id="btn-close-lobby">✕ Fermer</button>
        </div>
        <p style="margin:0 0 16px;color:#94a3b8;font-size:13px;line-height:1.5;">
          100 % GitHub Pages sans serveur externe : votre navigateur embarque un serveur autoritaire à 20 TPS ou rejoint un salon existant via WebRTC DataChannels.
        </p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(250px, 1fr));gap:14px;">
          <div style="background:rgba(12,17,27,0.8);border:1px solid #334155;border-radius:8px;padding:14px;">
            <h3 style="margin:0 0 8px;font-size:16px;color:#4ade80;">1. Héberger en Ligne</h3>
            <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;">
              Génère un Code de Salon court (ex: <code>VX-4829</code>), un lien direct et un QR Code Android.
            </p>
            <button type="button" class="voxel-btn primary" id="btn-start-host" style="width:100%;">
              🚀 Héberger en Ligne (20 TPS)
            </button>
          </div>

          <div style="background:rgba(12,17,27,0.8);border:1px solid #334155;border-radius:8px;padding:14px;">
            <h3 style="margin:0 0 8px;font-size:16px;color:#38bdf8;">2. Rejoindre un Salon</h3>
            <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">
              Entrez le code à 6 caractères partagé par l'hôte :
            </p>
            <div style="display:flex;gap:8px;">
              <input type="text" id="inp-join-code" class="voxel-input" placeholder="VX-4829"
                value="${prefillJoinCode}" style="flex:1;text-transform:uppercase;font-weight:700;" />
              <button type="button" class="voxel-btn blue" id="btn-join-room">Rejoindre</button>
            </div>
          </div>
        </div>
        <div id="lobby-feedback" style="margin-top:12px;font-size:13px;color:#facc15;"></div>
      `;

      card.querySelector('#btn-close-lobby')!.addEventListener('click', () => this.close(true));

      const feedback = card.querySelector('#lobby-feedback') as HTMLDivElement;
      const hostBtn = card.querySelector('#btn-start-host') as HTMLButtonElement;
      hostBtn.addEventListener('click', async () => {
        hostBtn.disabled = true;
        feedback.textContent = '⏳ Démarrage du serveur embarqué et création du salon WebRTC...';
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
        if (!raw) {
          feedback.textContent = 'Veuillez saisir un code de salon (ex: VX-4829).';
          return;
        }
        joinBtn.disabled = true;
        feedback.textContent = `⏳ Connexion P2P au salon ${normalizeRoomCode(raw)}...`;
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

    // Active Host / Client Session View with Room Code, Invite Link, and Canvas QR Code
    const roomCode = this.network.roomCode;
    const inviteUrl = buildInviteUrl(roomCode);
    const roster = this.getRosterFn();

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;font-size:20px;">
          🌐 Salon Actif : <span id="active-room-code" style="color:#4ade80;font-family:monospace;">${roomCode}</span>
        </h2>
        <button type="button" class="voxel-btn" id="btn-close-lobby">▶ Retour au Jeu</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;align-items:center;">
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="background:rgba(12,17,27,0.85);border:1px solid #334155;border-radius:8px;padding:10px;">
            <div style="font-size:12px;color:#94a3b8;">Statut WebRTC DataChannels</div>
            <div style="font-size:14px;font-weight:700;color:#38bdf8;margin-top:3px;">
              ${this.network.statusText} (Ping moy. : ${this.network.getAveragePingMs()} ms)
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="voxel-btn primary" id="btn-copy-code">📋 Copier Code (${roomCode})</button>
            <button type="button" class="voxel-btn blue" id="btn-copy-link">🔗 Copier Lien d'Invitation</button>
          </div>

          <input type="text" readonly class="voxel-input" value="${inviteUrl}" style="font-size:11px;width:100%;" />

          <div style="background:rgba(12,17,27,0.85);border:1px solid #334155;border-radius:8px;padding:10px;">
            <div style="font-size:12px;font-weight:700;margin-bottom:6px;">Joueurs connectés (${roster.length}) :</div>
            <div id="roster-list" style="display:flex;flex-direction:column;gap:4px;font-size:13px;"></div>
          </div>

          <button type="button" class="voxel-btn danger" id="btn-leave-p2p">🔌 Fermer / Quitter le Salon P2P</button>
        </div>

        <div style="display:flex;flex-direction:column;align-items:center;background:rgba(12,17,27,0.85);border:1px solid #334155;border-radius:8px;padding:12px;">
          <canvas id="room-qr-canvas" style="border-radius:6px;max-width:196px;height:auto;"></canvas>
          <span style="font-size:11px;color:#94a3b8;margin-top:8px;text-align:center;">
            Scannez depuis un smartphone Android pour rejoindre directement le monde !
          </span>
        </div>
      </div>
      <div id="copy-toast" style="margin-top:8px;font-size:12px;color:#4ade80;"></div>
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
      toast.textContent = `✅ Code ${roomCode} copié dans le presse-papiers !`;
    });
    card.querySelector('#btn-copy-link')!.addEventListener('click', () => {
      navigator.clipboard?.writeText(inviteUrl).catch(() => {});
      toast.textContent = '✅ Lien direct d\'invitation copié !';
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
