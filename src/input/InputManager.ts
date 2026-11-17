import { GamepadHandler } from './GamepadHandler';
import { TouchControlsUI, type TouchAimMode } from './TouchControlsUI';

export type ActiveInputDevice = 'keyboard_mouse' | 'gamepad' | 'touch';

export interface KeyBindings {
  forward: string;
  backward: string;
  left: string;
  right: string;
  jump: string;
  sneak: string;
  sprint: string;
  inventory: string;
  drop: string;
  chat: string;
  cameraToggle: string;
  debugOverlay: string;
}

const BINDINGS_STORAGE_KEY = 'voxelcraft_keybindings_v1';

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: 'KeyW', // Physical Z on AZERTY, W on QWERTY!
  backward: 'KeyS',
  left: 'KeyA', // Physical Q on AZERTY, A on QWERTY!
  right: 'KeyD',
  jump: 'Space',
  sneak: 'ShiftLeft',
  sprint: 'ControlLeft',
  inventory: 'KeyE',
  drop: 'KeyQ',
  chat: 'KeyT',
  cameraToggle: 'F5',
  debugOverlay: 'F3',
};

export interface FrameInputSnapshot {
  device: ActiveInputDevice;
  moveForward: number; // -1..1 (+1 = forward)
  moveStrafe: number; // -1..1 (+1 = right)
  lookDeltaYaw: number;
  lookDeltaPitch: number;
  jumpHeld: boolean;
  sneakHeld: boolean;
  sprintActive: boolean;
  flyToggleTriggered: boolean;
  flyUpExtra: boolean;
  flyDownExtra: boolean;
  mineHeld: boolean;
  placeTriggered: boolean;
  pickBlockTriggered: boolean;
  dropTriggered: boolean;
  hotbarSelectIndex: number | null;
  hotbarCycleDelta: number;
  directMineNdc: { x: number; y: number } | null;
}

export class InputManager {
  public activeDevice: ActiveInputDevice = 'keyboard_mouse';
  public bindings: KeyBindings;
  public mouseSensitivity = 0.0022;

  public readonly gamepad: GamepadHandler;
  public readonly touch: TouchControlsUI;

  private readonly keysDown = new Set<string>();
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private leftMouseHeld = false;
  private rightClickQueued = false;
  private middleClickQueued = false;
  private wheelDelta = 0;
  private hotbarDigitQueued: number | null = null;
  private dropQueued = false;
  private flyToggleQueued = false;
  private sprintLatched = false;

  private lastSpaceDownTime = 0;
  private lastForwardDownTime = 0;
  private pointerLockAcquiredAt = 0;
  private programmaticUnlock = false;
  private gameplayActive = false;
  private uiModalOpen = true;
  private isCreativeMode = false;

  private readonly canvasElement: HTMLCanvasElement;

  public onToggleInventory?: () => void;
  public onTogglePause?: () => void;
  public onOpenChat?: (prefillSlash?: boolean) => void;
  public onToggleCamera?: () => void;
  public onToggleDebugF3?: () => void;
  public onDirectTouchPlace?: (ndcX: number, ndcY: number) => void;

  /** Optional hook used by SettingsModal when remapping a key */
  public keyCaptureCallback: ((code: string) => void) | null = null;

  constructor(canvasElement: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvasElement = canvasElement;
    this.bindings = this.loadBindings();
    this.gamepad = new GamepadHandler();
    this.touch = new TouchControlsUI(uiRoot);

    this.touch.onTouchDetected = () => this.switchDevice('touch');
    this.touch.onPlaceAction = () => {
      this.rightClickQueued = true;
    };
    this.touch.onDirectTapPlace = (nx, ny) => {
      this.onDirectTouchPlace?.(nx, ny);
    };
    this.touch.onToggleFly = () => {
      this.flyToggleQueued = true;
    };
    this.touch.onOpenInventory = () => this.onToggleInventory?.();
    this.touch.onOpenPause = () => this.onTogglePause?.();
    this.touch.onOpenChat = () => this.onOpenChat?.(false);

    this.bindKeyboardAndMouse();
  }

  private loadBindings(): KeyBindings {
    try {
      const raw = localStorage.getItem(BINDINGS_STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_KEY_BINDINGS, ...(JSON.parse(raw) as Partial<KeyBindings>) };
      }
    } catch {
      // ignore storage restrictions
    }
    return { ...DEFAULT_KEY_BINDINGS };
  }

  public saveBindings(): void {
    try {
      localStorage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
      // ignore
    }
  }

  public setTouchAimMode(mode: TouchAimMode): void {
    this.touch.setAimMode(mode);
  }

  public setUIState(gameplayActive: boolean, modalOpen: boolean, creativeMode: boolean): void {
    this.gameplayActive = gameplayActive;
    this.uiModalOpen = modalOpen;
    this.isCreativeMode = creativeMode;

    if (modalOpen || !gameplayActive) {
      this.releasePointerLock();
      this.leftMouseHeld = false;
      this.keysDown.clear();
    }

    this.touch.setVisible(gameplayActive && !modalOpen && this.activeDevice === 'touch', creativeMode);
  }

  public requestPointerLockIfDesktop(): void {
    if (this.activeDevice === 'keyboard_mouse' && this.gameplayActive && !this.uiModalOpen) {
      if (document.pointerLockElement !== this.canvasElement) {
        this.canvasElement.requestPointerLock?.();
      }
    }
  }

  public releasePointerLock(): void {
    if (document.pointerLockElement) {
      this.programmaticUnlock = true;
      document.exitPointerLock?.();
    }
  }

  private switchDevice(dev: ActiveInputDevice): void {
    if (this.activeDevice === dev) return;
    this.activeDevice = dev;
    this.touch.setVisible(this.gameplayActive && !this.uiModalOpen && dev === 'touch', this.isCreativeMode);
  }

  private bindKeyboardAndMouse(): void {
    window.addEventListener('keydown', (e) => {
      if (this.keyCaptureCallback) {
        e.preventDefault();
        const cb = this.keyCaptureCallback;
        this.keyCaptureCallback = null;
        cb(e.code);
        return;
      }

      const target = e.target as HTMLElement | null;
      const typingInField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (typingInField) {
        if (e.code === 'Escape') {
          (target as HTMLElement).blur();
        }
        return;
      }

      this.switchDevice('keyboard_mouse');

      if (e.code === this.bindings.debugOverlay) {
        e.preventDefault();
        this.onToggleDebugF3?.();
        return;
      }

      if (e.code === 'Escape') {
        if (this.gameplayActive) {
          this.onTogglePause?.();
        }
        return;
      }

      if (!this.gameplayActive) return;

      if (e.code === this.bindings.inventory) {
        e.preventDefault();
        this.onToggleInventory?.();
        return;
      }

      if (this.uiModalOpen) return;

      if (e.code === this.bindings.chat || e.code === 'Enter') {
        e.preventDefault();
        this.onOpenChat?.(false);
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        this.onOpenChat?.(true);
        return;
      }
      if (e.code === this.bindings.cameraToggle) {
        e.preventDefault();
        this.onToggleCamera?.();
        return;
      }
      if (e.code === this.bindings.drop && !e.repeat) {
        this.dropQueued = true;
      }

      // Digits 1..9 -> Hotbar 0..8
      if (e.code.startsWith('Digit')) {
        const num = Number(e.code.slice(5));
        if (num >= 1 && num <= 9) {
          this.hotbarDigitQueued = num - 1;
        }
      }

      // Double-tap Space -> Toggle Creative Fly
      if (e.code === this.bindings.jump && !e.repeat) {
        const now = performance.now();
        if (now - this.lastSpaceDownTime < 300) {
          this.flyToggleQueued = true;
          this.lastSpaceDownTime = 0;
        } else {
          this.lastSpaceDownTime = now;
        }
      }

      // Double-tap Forward -> Sprint latch
      if (e.code === this.bindings.forward && !e.repeat) {
        const now = performance.now();
        if (now - this.lastForwardDownTime < 280) {
          this.sprintLatched = true;
        }
        this.lastForwardDownTime = now;
      }

      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      if (e.code === this.bindings.forward) {
        this.sprintLatched = false;
      }
    });

    this.canvasElement.addEventListener('mousedown', (e) => {
      if (!this.gameplayActive || this.uiModalOpen) return;
      if (this.activeDevice === 'touch') return;
      this.switchDevice('keyboard_mouse');

      if (document.pointerLockElement !== this.canvasElement) {
        this.canvasElement.requestPointerLock?.();
      }

      if (e.button === 0) {
        this.leftMouseHeld = true;
      } else if (e.button === 2) {
        this.rightClickQueued = true;
      } else if (e.button === 1) {
        e.preventDefault();
        this.middleClickQueued = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftMouseHeld = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.gameplayActive && !this.uiModalOpen) {
        e.preventDefault();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvasElement) {
        this.pointerLockAcquiredAt = performance.now();
        this.programmaticUnlock = false;
      } else {
        this.leftMouseHeld = false;
        if (!this.programmaticUnlock && this.gameplayActive && !this.uiModalOpen && this.activeDevice === 'keyboard_mouse') {
          this.onTogglePause?.();
        }
        this.programmaticUnlock = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvasElement && this.gameplayActive && !this.uiModalOpen) {
        // Guard against OS cursor-warp spike right when Pointer Lock activates
        if (performance.now() - this.pointerLockAcquiredAt < 65) return;
        if (Math.abs(e.movementX) > 160 || Math.abs(e.movementY) > 160) return;

        this.switchDevice('keyboard_mouse');
        this.mouseDeltaX += e.movementX * this.mouseSensitivity;
        this.mouseDeltaY += e.movementY * this.mouseSensitivity;
      }
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.gameplayActive || this.uiModalOpen) return;
        this.wheelDelta += e.deltaY > 0 ? 1 : -1;
      },
      { passive: true }
    );
  }

  public sampleFrameInput(dt: number, onUiCancel?: () => void): FrameInputSnapshot {
    const gp = this.gamepad.poll(dt, this.uiModalOpen, onUiCancel);
    if (gp.active) {
      this.switchDevice('gamepad');
      if (gp.inventoryJustPressed && this.gameplayActive) this.onToggleInventory?.();
      if (gp.pauseJustPressed && this.gameplayActive) this.onTogglePause?.();
      if (gp.cameraToggleJustPressed && this.gameplayActive && !this.uiModalOpen) this.onToggleCamera?.();
      if (gp.sprintTogglePressed) this.sprintLatched = !this.sprintLatched;
    }

    const touchLook = this.touch.consumeLookDelta();

    let moveForward = 0;
    let moveStrafe = 0;
    if (this.keysDown.has(this.bindings.forward) || this.keysDown.has('ArrowUp')) moveForward += 1;
    if (this.keysDown.has(this.bindings.backward) || this.keysDown.has('ArrowDown')) moveForward -= 1;
    if (this.keysDown.has(this.bindings.right) || this.keysDown.has('ArrowRight')) moveStrafe += 1;
    if (this.keysDown.has(this.bindings.left) || this.keysDown.has('ArrowLeft')) moveStrafe -= 1;

    if (Math.abs(gp.moveZ) > 0 || Math.abs(gp.moveX) > 0) {
      moveForward = -gp.moveZ;
      moveStrafe = gp.moveX;
    } else if (this.activeDevice === 'touch') {
      moveForward = -this.touch.moveZ;
      moveStrafe = this.touch.moveX;
    }

    const sprintActive =
      moveForward > 0.2 &&
      (this.keysDown.has(this.bindings.sprint) || this.sprintLatched || this.touch.sprintLocked);

    const snap: FrameInputSnapshot = {
      device: this.activeDevice,
      moveForward,
      moveStrafe,
      lookDeltaYaw: -(this.mouseDeltaX + gp.lookDeltaX + touchLook.dx),
      lookDeltaPitch: -(this.mouseDeltaY + gp.lookDeltaY + touchLook.dy),
      jumpHeld: this.keysDown.has(this.bindings.jump) || gp.jumpHeld || this.touch.jumpHeld || this.touch.flyUpHeld,
      sneakHeld:
        this.keysDown.has(this.bindings.sneak) || gp.sneakHeld || this.touch.sneakToggled || this.touch.flyDownHeld,
      sprintActive,
      flyToggleTriggered: this.flyToggleQueued || gp.doubleJumpTriggered,
      flyUpExtra: this.touch.flyUpHeld,
      flyDownExtra: this.touch.flyDownHeld,
      mineHeld: this.leftMouseHeld || gp.mineHeld || this.touch.splitMineHeld || this.touch.directMineActive,
      placeTriggered: this.rightClickQueued || gp.placeJustPressed,
      pickBlockTriggered: this.middleClickQueued,
      dropTriggered: this.dropQueued,
      hotbarSelectIndex: this.hotbarDigitQueued,
      hotbarCycleDelta: this.wheelDelta + gp.hotbarDelta,
      directMineNdc: this.touch.directMineActive
        ? { x: this.touch.directMineNdcX, y: this.touch.directMineNdcY }
        : null,
    };

    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.rightClickQueued = false;
    this.middleClickQueued = false;
    this.wheelDelta = 0;
    this.hotbarDigitQueued = null;
    this.dropQueued = false;
    this.flyToggleQueued = false;

    return snap;
  }
}
