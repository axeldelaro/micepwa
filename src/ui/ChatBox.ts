export class ChatBox {
  private readonly toastEl: HTMLDivElement;
  private readonly drawerBackdrop: HTMLDivElement;
  private readonly logEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private toastTimer: number | null = null;
  private isOpen = false;

  public onSubmitMessage?: (text: string) => void;
  public onClose?: () => void;

  constructor(parent: HTMLElement) {
    // 1. Sleek Top-Center Auto-Fading Single-Line Toast (never blocks joysticks or hotbar!)
    this.toastEl = document.createElement('div');
    this.toastEl.style.cssText = `
      position: fixed;
      top: calc(50px + var(--safe-top));
      left: 50%;
      transform: translateX(-50%);
      max-width: min(88vw, 460px);
      background: rgba(11, 16, 26, 0.82);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(56, 189, 248, 0.45);
      border-radius: 20px;
      padding: 5px 14px;
      font-size: 12px;
      font-weight: 600;
      color: #f8fafc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.25s ease;
      z-index: 25;
    `;

    // 2. Clean Chat & Command Modal Drawer (only visible when opened via T / Enter / 💬)
    this.drawerBackdrop = document.createElement('div');
    this.drawerBackdrop.className = 'modal-backdrop';
    this.drawerBackdrop.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '500px';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    header.innerHTML = `<strong style="font-size:15px;">💬 Chat & Commandes</strong>`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'voxel-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);

    this.logEl = document.createElement('div');
    this.logEl.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      height: 150px;
      overflow-y: auto;
      background: rgba(9, 13, 22, 0.72);
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 8px;
      margin-bottom: 8px;
      font-size: 12px;
    `;

    // Quick 1-Tap Command Chips for Mobile Players!
    const quickChips = document.createElement('div');
    quickChips.style.cssText = 'display:flex;gap:5px;overflow-x:auto;padding-bottom:6px;margin-bottom:6px;';
    const presets: Array<[string, string]> = [
      ['☀️ Jour', '/time set day'],
      ['🌙 Nuit', '/time set night'],
      ['🌧️ Pluie', '/weather rain'],
      ['☀️ Clair', '/weather clear'],
      ['🤖 +Garde', '/bot spawn guard'],
      ['⛏️ +Mineur', '/bot spawn miner'],
      ['🪽 Créatif', '/gamemode creative'],
      ['⚔️ Survie', '/gamemode survival'],
    ];
    for (const [label, cmd] of presets) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'voxel-btn';
      chip.style.padding = '4px 8px';
      chip.style.fontSize = '11px';
      chip.textContent = label;
      chip.addEventListener('click', () => {
        this.onSubmitMessage?.(cmd);
        this.close();
      });
      quickChips.appendChild(chip);
    }

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:6px;';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'voxel-input';
    this.inputEl.style.flex = '1';
    this.inputEl.placeholder = 'Message ou /commande...';

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'voxel-btn primary';
    sendBtn.textContent = 'Envoyer';
    sendBtn.addEventListener('click', () => this.submit());

    this.inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    inputRow.append(this.inputEl, sendBtn);
    card.append(header, this.logEl, quickChips, inputRow);
    this.drawerBackdrop.appendChild(card);

    parent.append(this.toastEl, this.drawerBackdrop);
  }

  public setVisible(visible: boolean): void {
    if (!visible) {
      this.toastEl.style.opacity = '0';
      this.close();
    }
  }

  public isInputOpen(): boolean {
    return this.isOpen;
  }

  public open(prefillSlash = false): void {
    this.isOpen = true;
    this.drawerBackdrop.style.display = 'flex';
    this.inputEl.value = prefillSlash ? '/' : '';
    window.setTimeout(() => this.inputEl.focus(), 20);
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.drawerBackdrop.style.display = 'none';
    this.inputEl.blur();
    this.onClose?.();
  }

  private submit(): void {
    const txt = this.inputEl.value.trim();
    if (txt.length > 0) {
      this.onSubmitMessage?.(txt);
    }
    this.inputEl.value = '';
    this.close();
  }

  public addMessage(sender: string, text: string, system = false): void {
    const line = document.createElement('div');
    line.style.cssText = `
      color: ${system ? '#fde047' : '#f8fafc'};
      line-height: 1.35;
    `;
    line.innerHTML = `<strong style="color:${system ? '#facc15' : '#38bdf8'};">[${sender}]</strong> `;
    const span = document.createElement('span');
    span.textContent = text;
    line.appendChild(span);

    this.logEl.appendChild(line);
    while (this.logEl.children.length > 35) {
      this.logEl.removeChild(this.logEl.firstChild!);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;

    // Show concise auto-fading pill toast for 2.4s instead of cluttering the screen
    this.toastEl.textContent = system ? text : `${sender} : ${text}`;
    this.toastEl.style.opacity = '1';
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, 2400);
  }
}
