import { emptyInput, type PlayerInput } from "./types";

const LOOK_SENS = 0.0024;
const PITCH_MIN = -1.35;
const PITCH_MAX = 1.35;

/**
 * PUBG-style mouse look: pointer lock + free yaw/pitch.
 * Look angles update immediately on mousemove for snappy camera.
 */
export class InputController {
  private keys = new Set<string>();
  private fireHeld = false;
  private aimHeld = false;
  private pointerLocked = false;
  private toggleCameraQueued = false;
  private weaponSlotQueued: number | null = null;
  private weaponSlot = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("wheel", this.onWheel, { passive: false });
    document.addEventListener("pointerlockchange", this.onPointerLock);
    document.addEventListener("pointerlockerror", this.onPointerLockError);
  }

  setLockChangeListener(cb: (locked: boolean) => void) {
    this.onLockChange = cb;
  }

  requestLock() {
    if (!this.pointerLocked) {
      void this.target.requestPointerLock();
    }
  }

  get isLocked() {
    return this.pointerLocked;
  }

  getLook() {
    return { yaw: this.lookYaw, pitch: this.lookPitch, aim: this.aimHeld };
  }

  get isFiring() {
    return this.fireHeld;
  }

  /** Sync look from sim (e.g. after vehicle enter). */
  setLook(yaw: number, pitch: number) {
    this.lookYaw = yaw;
    this.lookPitch = pitch;
  }

  /** Keep scroll cycling aligned with the sim weapon slot. */
  syncWeaponSlot(slot: number) {
    if (this.weaponSlotQueued == null) {
      this.weaponSlot = ((slot % 4) + 4) % 4;
    }
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("pointerlockchange", this.onPointerLock);
    document.removeEventListener("pointerlockerror", this.onPointerLockError);
    if (document.pointerLockElement === this.target) {
      document.exitPointerLock();
    }
  }

  sample(): PlayerInput {
    const input = emptyInput();
    const forward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const strafe =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);

    input.forward = forward;
    input.strafe = strafe;
    input.sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    input.jump = this.keys.has("Space");
    input.shield = this.keys.has("KeyQ");
    input.aim = this.aimHeld;
    input.fire = this.fireHeld;
    input.interact = this.keys.has("KeyE");
    input.toggle_camera = this.toggleCameraQueued;
    this.toggleCameraQueued = false;
    input.weapon_slot = this.weaponSlotQueued;
    this.weaponSlotQueued = null;
    input.look_yaw = this.lookYaw;
    input.look_pitch = this.lookPitch;
    return input;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code,
      )
    ) {
      e.preventDefault();
    }
    this.keys.add(e.code);
    if (e.code === "KeyV") {
      this.toggleCameraQueued = true;
    }
    if (e.code === "Digit1" || e.code === "Numpad1") this.queueWeapon(0);
    if (e.code === "Digit2" || e.code === "Numpad2") this.queueWeapon(1);
    if (e.code === "Digit3" || e.code === "Numpad3") this.queueWeapon(2);
    if (e.code === "Digit4" || e.code === "Numpad4") this.queueWeapon(3);
  };

  private queueWeapon(slot: number) {
    this.weaponSlot = slot;
    this.weaponSlotQueued = slot;
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.pointerLocked) return;
    e.preventDefault();
    if (Math.abs(e.deltaY) < 1) return;
    const next =
      e.deltaY > 0
        ? (this.weaponSlot + 1) % 4
        : (this.weaponSlot + 3) % 4;
    this.queueWeapon(next);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.pointerLocked) {
      this.requestLock();
      return;
    }
    if (e.button === 0) this.fireHeld = true;
    if (e.button === 2) this.aimHeld = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.fireHeld = false;
    if (e.button === 2) this.aimHeld = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    const sens = this.aimHeld ? LOOK_SENS * 0.38 : LOOK_SENS;
    this.lookYaw -= e.movementX * sens;
    this.lookPitch -= e.movementY * sens;
    if (this.lookPitch < PITCH_MIN) this.lookPitch = PITCH_MIN;
    if (this.lookPitch > PITCH_MAX) this.lookPitch = PITCH_MAX;
  };

  private onPointerLock = () => {
    this.pointerLocked = document.pointerLockElement === this.target;
    if (!this.pointerLocked) {
      this.fireHeld = false;
      this.aimHeld = false;
    }
    this.onLockChange?.(this.pointerLocked);
  };

  private onPointerLockError = () => {
    this.pointerLocked = false;
    this.onLockChange?.(false);
  };
}
