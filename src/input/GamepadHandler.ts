export interface GamepadPollResult {
  active: boolean;
  moveX: number;
  moveZ: number;
  lookDeltaX: number;
  lookDeltaY: number;
  jumpHeld: boolean;
  jumpJustPressed: boolean;
  doubleJumpTriggered: boolean;
  sneakHeld: boolean;
  sprintTogglePressed: boolean;
  mineHeld: boolean;
  placeJustPressed: boolean;
  hotbarDelta: number;
  inventoryJustPressed: boolean;
  pauseJustPressed: boolean;
  cameraToggleJustPressed: boolean;
}

export class GamepadHandler {
  public deadzone = 0.16;
  public sensitivity = 3.2;

  private prevButtons: boolean[] = new Array(20).fill(false);
  private lastJumpPressTime = 0;

  // Virtual cursor state when UI modals are open
  private cursorX = window.innerWidth * 0.5;
  private cursorY = window.innerHeight * 0.5;
  private readonly cursorEl: HTMLElement;
  private lastHoveredEl: HTMLElement | null = null;

  constructor() {
    this.cursorEl = document.getElementById('gamepad-virtual-cursor')!;
  }

  private applyDeadzone(val: number, exponential = false): number {
    const abs = Math.abs(val);
    if (abs < this.deadzone) return 0;
    const norm = (abs - this.deadzone) / (1.0 - this.deadzone);
    const curved = exponential ? Math.pow(norm, 1.85) : norm;
    return Math.sign(val) * curved;
  }

  public vibrate(durationMs = 90, weakMagnitude = 0.35, strongMagnitude = 0.55): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const actuator = gp.vibrationActuator as
        | {
            playEffect?: (
              type: string,
              params: { startDelay: number; duration: number; weakMagnitude: number; strongMagnitude: number }
            ) => Promise<unknown>;
          }
        | undefined;
      if (actuator && typeof actuator.playEffect === 'function') {
        actuator
          .playEffect('dual-rumble', {
            startDelay: 0,
            duration: durationMs,
            weakMagnitude,
            strongMagnitude,
          })
          .catch(() => {});
      }
    }
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(Math.min(120, durationMs));
    }
  }

  public poll(dt: number, uiModalOpen: boolean, onUiCancel?: () => void): GamepadPollResult {
    const empty: GamepadPollResult = {
      active: false,
      moveX: 0,
      moveZ: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      jumpHeld: false,
      jumpJustPressed: false,
      doubleJumpTriggered: false,
      sneakHeld: false,
      sprintTogglePressed: false,
      mineHeld: false,
      placeJustPressed: false,
      hotbarDelta: 0,
      inventoryJustPressed: false,
      pauseJustPressed: false,
      cameraToggleJustPressed: false,
    };

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        gp = p;
        break;
      }
    }

    if (!gp) {
      this.cursorEl.style.display = 'none';
      return empty;
    }

    const btn = (idx: number): boolean => Boolean(gp!.buttons[idx]?.pressed);
    const justPressed = (idx: number): boolean => btn(idx) && !this.prevButtons[idx];

    const lx = this.applyDeadzone(gp.axes[0] ?? 0, false);
    const ly = this.applyDeadzone(gp.axes[1] ?? 0, false);
    const rx = this.applyDeadzone(gp.axes[2] ?? 0, true);
    const ry = this.applyDeadzone(gp.axes[3] ?? 0, true);

    let anyInput = Math.abs(lx) > 0 || Math.abs(ly) > 0 || Math.abs(rx) > 0 || Math.abs(ry) > 0;
    for (let i = 0; i < gp.buttons.length && i < 20; i++) {
      if (gp.buttons[i]?.pressed) anyInput = true;
    }

    // Virtual Gamepad Cursor inside UI Menus / Inventory / Crafting
    if (uiModalOpen) {
      let dpadX = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
      let dpadY = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
      const vx = Math.abs(lx) > 0 ? lx : dpadX * 0.75;
      const vy = Math.abs(ly) > 0 ? ly : dpadY * 0.75;

      if (anyInput) {
        this.cursorEl.style.display = 'block';
      }

      if (vx !== 0 || vy !== 0) {
        const cursorSpeed = 560;
        this.cursorX = Math.max(8, Math.min(window.innerWidth - 8, this.cursorX + vx * cursorSpeed * dt));
        this.cursorY = Math.max(8, Math.min(window.innerHeight - 8, this.cursorY + vy * cursorSpeed * dt));
        this.cursorEl.style.left = `${this.cursorX}px`;
        this.cursorEl.style.top = `${this.cursorY}px`;
      }

      const elAtPoint = document.elementFromPoint(this.cursorX, this.cursorY) as HTMLElement | null;
      const interactive = elAtPoint?.closest('.slot-box, .voxel-btn, input, select, button') as HTMLElement | null;
      if (this.lastHoveredEl && this.lastHoveredEl !== interactive) {
        this.lastHoveredEl.classList.remove('gp-hover');
      }
      if (interactive) {
        interactive.classList.add('gp-hover');
        this.lastHoveredEl = interactive;
      }

      if (justPressed(0) && interactive) {
        interactive.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        interactive.click();
      } else if (justPressed(2) && interactive) {
        // X / Square -> Right-click (split stack / place 1 in crafting)
        interactive.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
        interactive.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
      }

      if ((justPressed(1) || justPressed(3) || justPressed(9)) && onUiCancel) {
        onUiCancel();
      }

      for (let i = 0; i < 20; i++) this.prevButtons[i] = btn(i);
      empty.active = anyInput;
      return empty;
    }

    this.cursorEl.style.display = 'none';
    if (this.lastHoveredEl) {
      this.lastHoveredEl.classList.remove('gp-hover');
      this.lastHoveredEl = null;
    }

    const jumpJust = justPressed(0);
    let dblJump = false;
    if (jumpJust) {
      const now = performance.now();
      if (now - this.lastJumpPressTime < 320) {
        dblJump = true;
        this.lastJumpPressTime = 0;
      } else {
        this.lastJumpPressTime = now;
      }
    }

    const rtVal = gp.buttons[7]?.value ?? (btn(7) ? 1 : 0);
    const ltVal = gp.buttons[6]?.value ?? (btn(6) ? 1 : 0);
    const prevLt = this.prevButtons[6];

    const res: GamepadPollResult = {
      active: anyInput,
      moveX: lx,
      moveZ: ly,
      lookDeltaX: rx * this.sensitivity * dt,
      lookDeltaY: ry * this.sensitivity * 0.85 * dt,
      jumpHeld: btn(0),
      jumpJustPressed: jumpJust,
      doubleJumpTriggered: dblJump,
      sneakHeld: btn(1),
      sprintTogglePressed: justPressed(10), // L3
      mineHeld: rtVal > 0.35,
      placeJustPressed: ltVal > 0.45 && !prevLt,
      hotbarDelta: (justPressed(5) ? 1 : 0) - (justPressed(4) ? 1 : 0), // RB / LB
      inventoryJustPressed: justPressed(3), // Y / Triangle
      pauseJustPressed: justPressed(9), // Start / Options
      cameraToggleJustPressed: justPressed(11), // R3 -> F5
    };

    for (let i = 0; i < 20; i++) {
      this.prevButtons[i] = i === 6 ? ltVal > 0.45 : btn(i);
    }

    return res;
  }
}
