export class ChatBox {
  private readonly container: HTMLDivElement;
  private readonly logEl: HTMLDivElement;
  private readonly inputRow: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private isOpen = false;

  public onSubmitMessage?: (text: string) => void;
  public onClose?: () => void;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      left: 14px;
      bottom: 92px;
      width: min(440px, 78vw);
      z-index: 26;
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
    `;

    this.logEl = document.createElement('div');
    this.logEl.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 190px;
      overflow-y: auto;
      font-size: 13px;
      text-shadow: 1px 1px 2px #000;
    `;

    this.inputRow = document.createElement('div');
    this.inputRow.className = 'ui-interactive';
    this.inputRow.style.cssText = `
      display: none;
      gap: 6px;
      align-items: center;
    `;

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'voxel-input';
    this.inputEl.style.flex = '1';
    this.inputEl.placeholder = 'Message ou commande (/help, /gamemode, /time set, /tp, /bot spawn)...';

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

    this.inputRow.append(this.inputEl, sendBtn);
    this.container.append(this.logEl, this.inputRow);
    parent.appendChild(this.container);
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  public isInputOpen(): boolean {
    return this.isOpen;
  }

  public open(prefillSlash = false): void {
    this.isOpen = true;
    this.inputRow.style.display = 'flex';
    this.logEl.style.pointerEvents = 'auto';
    this.inputEl.value = prefillSlash ? '/' : '';
    window.setTimeout(() => this.inputEl.focus(), 10);
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.inputRow.style.display = 'none';
    this.logEl.style.pointerEvents = 'none';
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
      background: rgba(9, 13, 22, 0.68);
      border-left: 3px solid ${system ? '#facc15' : '#38bdf8'};
      padding: 4px 8px;
      border-radius: 4px;
      color: ${system ? '#fef08a' : '#f8fafc'};
      transition: opacity 0.4s ease;
    `;
    const strong = document.createElement('strong');
    strong.style.color = system ? '#facc15' : '#7dd3fc';
    strong.textContent = `[${sender}] `;
    const span = document.createElement('span');
    span.textContent = text;
    line.append(strong, span);

    this.logEl.appendChild(line);
    while (this.logEl.children.length > 30) {
      this.logEl.removeChild(this.logEl.firstChild!);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;

    window.setTimeout(() => {
      if (!this.isOpen) {
        line.style.opacity = '0.35';
      }
    }, 9000);
  }
}
