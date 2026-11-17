export type TouchAimMode = 'split' | 'direct';

export class TouchControlsUI {
  public readonly root: HTMLDivElement;
  public aimMode: TouchAimMode = 'split';
  public inertia = 0.82;

  public moveX = 0;
  public moveZ = 0;
  public sprintLocked = false;

  public jumpHeld = false;
  public sneakToggled = false;
  public flyUpHeld = false;
  public flyDownHeld = false;
  public splitMineHeld = false;

  public directMineActive = false;
  public directMineNdcX = 0;
  public directMineNdcY = 0;

  private lookVelX = 0;
  private lookVelY = 0;
  private pendingLookX = 0;
  private pendingLookY = 0;

  private joyTouchId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;

  private camTouchId: number | null = null;
  private camStartX = 0;
  private camStartY = 0;
  private camLastX = 0;
  private camLastY = 0;
  private camStartTime = 0;
  private camMovedDist = 0;
  private holdTimer: number | null = null;

  private readonly joyBase: HTMLDivElement;
  private readonly joyKnob: HTMLDivElement;
  private readonly splitButtonsWrap: HTMLDivElement;
  private readonly flyButtonsWrap: HTMLDivElement;
  private readonly sneakBtn: HTMLButtonElement;
  private readonly touchRing: HTMLDivElement;
  private readonly ringCircle: SVGCircleElement;

  public onPlaceAction?: () => void;
  public onDirectTapPlace?: (ndcX: number, ndcY: number) => void;
  public onToggleFly?: () => void;
  public onOpenInventory?: () => void;
  public onOpenPause?: () => void;
  public onOpenChat?: () => void;
  public onTouchDetected?: () => void;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'touch-controls-overlay';
    this.root.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      display: none;
      z-index: 18;
    `;

    // Left Floating Ergonomic Joystick (positioned cleanly above hotbar line!)
    this.joyBase = document.createElement('div');
    this.joyBase.style.cssText = `
      position: absolute;
      left: calc(18px + var(--safe-left));
      bottom: calc(68px + var(--safe-bottom));
      width: 102px;
      height: 102px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.36);
      border: 2px solid rgba(148, 163, 184, 0.42);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s ease;
    `;
    this.joyKnob = document.createElement('div');
    this.joyKnob.style.cssText = `
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: rgba(56, 189, 248, 0.72);
      border: 2px solid #e0f2fe;
      transform: translate(0px, 0px);
    `;
    this.joyBase.appendChild(this.joyKnob);

    // Right Ergonomic Icon-Only Thumb Cluster (Zero text clutter, positioned cleanly above hotbar!)
    const rightCluster = document.createElement('div');
    rightCluster.className = 'ui-interactive';
    rightCluster.style.cssText = `
      position: absolute;
      right: calc(16px + var(--safe-right));
      bottom: calc(68px + var(--safe-bottom));
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    `;

    this.flyButtonsWrap = document.createElement('div');
    this.flyButtonsWrap.style.cssText = 'display: none; gap: 7px;';
    const flyToggleBtn = this.makeIconPad('🪽', 42, 'Vol', () => this.onToggleFly?.());
    const flyUpBtn = this.makeHoldPad('⬆️', 42, 'Monter', (down) => (this.flyUpHeld = down));
    const flyDownBtn = this.makeHoldPad('⬇️', 42, 'Descendre', (down) => (this.flyDownHeld = down));
    this.flyButtonsWrap.append(flyToggleBtn, flyUpBtn, flyDownBtn);

    this.splitButtonsWrap = document.createElement('div');
    this.splitButtonsWrap.style.cssText = 'display: flex; gap: 9px;';
    const mineBtn = this.makeHoldPad('⛏️', 54, 'Miner / Attaquer', (down) => (this.splitMineHeld = down));
    const placeBtn = this.makeIconPad('🧱', 54, 'Poser / Utiliser', () => this.onPlaceAction?.());
    this.splitButtonsWrap.append(mineBtn, placeBtn);

    const moveRow = document.createElement('div');
    moveRow.style.cssText = 'display: flex; gap: 9px; align-items: center;';
    this.sneakBtn = this.makeIconPad('🦵', 46, 'Accroupi', () => {
      this.sneakToggled = !this.sneakToggled;
      this.sneakBtn.style.borderColor = this.sneakToggled ? '#facc15' : 'rgba(148,163,184,0.5)';
      this.sneakBtn.style.background = this.sneakToggled
        ? 'rgba(234, 179, 8, 0.35)'
        : 'rgba(15, 23, 42, 0.58)';
    });
    const jumpBtn = this.makeHoldPad('⏫', 56, 'Sauter', (down) => (this.jumpHeld = down));
    moveRow.append(this.sneakBtn, jumpBtn);

    rightCluster.append(this.flyButtonsWrap, this.splitButtonsWrap, moveRow);

    // Direct-touch radial mining progress ring
    this.touchRing = document.createElement('div');
    this.touchRing.style.cssText = `
      position: fixed;
      width: 64px;
      height: 64px;
      margin-left: -32px;
      margin-top: -32px;
      pointer-events: none;
      display: none;
    `;
    this.touchRing.innerHTML = `
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="26" stroke="rgba(255,255,255,0.25)" stroke-width="5" fill="none" />
        <circle id="direct-mine-arc" cx="32" cy="32" r="26" stroke="#facc15" stroke-width="5" fill="none"
          stroke-dasharray="164" stroke-dashoffset="164" transform="rotate(-90 32 32)" />
      </svg>
    `;
    this.ringCircle = this.touchRing.querySelector('#direct-mine-arc') as SVGCircleElement;

    this.root.append(this.joyBase, rightCluster, this.touchRing);
    parent.appendChild(this.root);

    this.bindTouchZones();
  }

  private makeIconPad(icon: string, size: number, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.textContent = icon;
    b.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.58);
      backdrop-filter: blur(4px);
      border: 2px solid rgba(148, 163, 184, 0.5);
      color: #f8fafc;
      font-size: ${Math.round(size * 0.42)}px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      padding: 0;
    `;
    b.addEventListener(
      'touchstart',
      (e) => {
        e.stopPropagation();
        b.style.transform = 'scale(0.91)';
        this.onTouchDetected?.();
        onClick();
      },
      { passive: true }
    );
    b.addEventListener(
      'touchend',
      () => {
        b.style.transform = 'scale(1)';
      },
      { passive: true }
    );
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private makeHoldPad(icon: string, size: number, title: string, onHold: (down: boolean) => void): HTMLButtonElement {
    const b = this.makeIconPad(icon, size, title, () => {});
    b.addEventListener(
      'touchstart',
      (e) => {
        e.stopPropagation();
        b.style.transform = 'scale(0.91)';
        b.style.borderColor = '#38bdf8';
        this.onTouchDetected?.();
        onHold(true);
      },
      { passive: true }
    );
    const release = (e: TouchEvent) => {
      e.stopPropagation();
      b.style.transform = 'scale(1)';
      b.style.borderColor = 'rgba(148, 163, 184, 0.5)';
      onHold(false);
    };
    b.addEventListener('touchend', release, { passive: true });
    b.addEventListener('touchcancel', release, { passive: true });
    return b;
  }

  private bindTouchZones(): void {
    window.addEventListener(
      'touchstart',
      (ev) => {
        this.onTouchDetected?.();
        if (!ev.changedTouches) return;
        const target = ev.target as HTMLElement | null;
        if (target?.closest('.ui-interactive, .modal-backdrop')) return;

        for (let i = 0; i < ev.changedTouches.length; i++) {
          const t = ev.changedTouches[i]!;
          if (t.clientX < window.innerWidth * 0.45 && this.joyTouchId === null) {
            this.joyTouchId = t.identifier;
            this.joyOriginX = t.clientX;
            this.joyOriginY = t.clientY;
            const clampLeft = Math.max(12, Math.min(window.innerWidth * 0.35, t.clientX - 51));
            const clampBottom = Math.max(66, Math.min(window.innerHeight * 0.45, window.innerHeight - t.clientY - 51));
            this.joyBase.style.left = `${clampLeft}px`;
            this.joyBase.style.bottom = `${clampBottom}px`;
          } else if (this.camTouchId === null) {
            this.camTouchId = t.identifier;
            this.camStartX = t.clientX;
            this.camStartY = t.clientY;
            this.camLastX = t.clientX;
            this.camLastY = t.clientY;
            this.camStartTime = performance.now();
            this.camMovedDist = 0;
            this.lookVelX = 0;
            this.lookVelY = 0;

            if (this.aimMode === 'direct') {
              this.holdTimer = window.setTimeout(() => {
                if (this.camTouchId !== null && this.camMovedDist < 16) {
                  this.directMineActive = true;
                  this.directMineNdcX = (this.camLastX / window.innerWidth) * 2 - 1;
                  this.directMineNdcY = -(this.camLastY / window.innerHeight) * 2 + 1;
                  this.touchRing.style.left = `${this.camLastX}px`;
                  this.touchRing.style.top = `${this.camLastY}px`;
                  this.touchRing.style.display = 'block';
                }
              }, 240);
            }
          }
        }
      },
      { passive: true }
    );

    window.addEventListener(
      'touchmove',
      (ev) => {
        if (!ev.changedTouches) return;
        for (let i = 0; i < ev.changedTouches.length; i++) {
          const t = ev.changedTouches[i]!;
          if (t.identifier === this.joyTouchId) {
            const dx = t.clientX - this.joyOriginX;
            const dy = t.clientY - this.joyOriginY;
            const maxR = 40;
            const dist = Math.hypot(dx, dy);
            const clamped = Math.min(maxR, dist);
            const angle = Math.atan2(dy, dx);
            const kx = Math.cos(angle) * clamped;
            const ky = Math.sin(angle) * clamped;
            this.joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;

            this.moveX = kx / maxR;
            this.moveZ = ky / maxR;
            this.sprintLocked = this.moveZ < -0.88;
            this.joyKnob.style.background = this.sprintLocked
              ? 'rgba(250, 204, 21, 0.88)'
              : 'rgba(56, 189, 248, 0.72)';
          } else if (t.identifier === this.camTouchId) {
            const dx = t.clientX - this.camLastX;
            const dy = t.clientY - this.camLastY;
            this.camLastX = t.clientX;
            this.camLastY = t.clientY;
            this.camMovedDist += Math.hypot(dx, dy);

            if (this.directMineActive) {
              this.directMineNdcX = (t.clientX / window.innerWidth) * 2 - 1;
              this.directMineNdcY = -(t.clientY / window.innerHeight) * 2 + 1;
              this.touchRing.style.left = `${t.clientX}px`;
              this.touchRing.style.top = `${t.clientY}px`;
            } else {
              const sens = 0.0052;
              this.pendingLookX += dx * sens;
              this.pendingLookY += dy * sens;
              this.lookVelX = dx * sens;
              this.lookVelY = dy * sens;
            }
          }
        }
      },
      { passive: true }
    );

    const endHandler = (ev: TouchEvent) => {
      if (!ev.changedTouches) return;
      for (let i = 0; i < ev.changedTouches.length; i++) {
        const t = ev.changedTouches[i]!;
        if (t.identifier === this.joyTouchId) {
          this.joyTouchId = null;
          this.moveX = 0;
          this.moveZ = 0;
          this.sprintLocked = false;
          this.joyKnob.style.transform = 'translate(0px, 0px)';
          this.joyKnob.style.background = 'rgba(56, 189, 248, 0.72)';
        } else if (t.identifier === this.camTouchId) {
          if (this.holdTimer !== null) {
            clearTimeout(this.holdTimer);
            this.holdTimer = null;
          }
          const duration = performance.now() - this.camStartTime;
          if (this.aimMode === 'direct' && !this.directMineActive && duration < 230 && this.camMovedDist < 14) {
            const ndcX = (this.camStartX / window.innerWidth) * 2 - 1;
            const ndcY = -(this.camStartY / window.innerHeight) * 2 + 1;
            this.onDirectTapPlace?.(ndcX, ndcY);
          }
          this.directMineActive = false;
          this.touchRing.style.display = 'none';
          this.camTouchId = null;
        }
      }
    };

    window.addEventListener('touchend', endHandler, { passive: true });
    window.addEventListener('touchcancel', endHandler, { passive: true });
  }

  public setVisible(visible: boolean, isCreativeMode: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
    this.flyButtonsWrap.style.display = isCreativeMode ? 'flex' : 'none';
    this.splitButtonsWrap.style.display = this.aimMode === 'split' ? 'flex' : 'none';
  }

  public setAimMode(mode: TouchAimMode): void {
    this.aimMode = mode;
    this.splitButtonsWrap.style.display = mode === 'split' ? 'flex' : 'none';
  }

  public setDirectMineProgress(progress01: number): void {
    const circumference = 164;
    const offset = circumference * (1.0 - Math.max(0, Math.min(1, progress01)));
    this.ringCircle.style.strokeDashoffset = `${offset}`;
  }

  public consumeLookDelta(): { dx: number; dy: number } {
    if (this.camTouchId === null) {
      this.pendingLookX += this.lookVelX;
      this.pendingLookY += this.lookVelY;
      this.lookVelX *= this.inertia;
      this.lookVelY *= this.inertia;
      if (Math.abs(this.lookVelX) < 0.0001) this.lookVelX = 0;
      if (Math.abs(this.lookVelY) < 0.0001) this.lookVelY = 0;
    }
    const out = { dx: this.pendingLookX, dy: this.pendingLookY };
    this.pendingLookX = 0;
    this.pendingLookY = 0;
    return out;
  }
}
