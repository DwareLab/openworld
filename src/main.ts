import "./styles.css";
import { Hud } from "./game/hud";
import { InputController } from "./game/input";
import { initGame, tickGame } from "./game/bridge";
import { WorldRenderer } from "./game/renderer";
import { CombatAudio } from "./game/audio";
import { CombatFx } from "./game/combatFx";

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
  const overlay = document.querySelector<HTMLElement>("#overlay");
  const lockGate = document.querySelector<HTMLElement>("#lock-gate");
  if (!canvas || !overlay || !lockGate) {
    throw new Error("Missing game root elements");
  }

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  const renderer = new WorldRenderer(canvas);
  const input = new InputController(canvas);
  const hud = new Hud(overlay);
  const audio = new CombatAudio();
  const combatFx = new CombatFx(audio);
  renderer.setFx(combatFx.state);

  input.setLockChangeListener((locked) => {
    lockGate.classList.toggle("hidden", locked);
    canvas.style.cursor = locked ? "none" : "crosshair";
    if (locked) audio.unlock();
  });

  lockGate.addEventListener("click", () => input.requestLock());
  canvas.addEventListener("click", () => {
    if (!input.isLocked) input.requestLock();
  });

  let snapshot = await initGame();
  input.setLook(snapshot.player.yaw, snapshot.player.pitch);
  hud.update(snapshot, input.getLook(), combatFx.state, renderer);
  renderer.render(snapshot, 0, input.getLook());

  let last = performance.now();
  let busy = false;

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const look = input.getLook();
    input.syncWeaponSlot(snapshot.player.weapon_slot);
    combatFx.setInputFlags(look.aim, input.isFiring);
    combatFx.update(dt);

    hud.update(snapshot, look, combatFx.state, renderer);
    renderer.render(snapshot, dt, look);

    if (busy || !input.isLocked) return;

    const playerInput = input.sample();
    busy = true;
    void tickGame(playerInput, dt)
      .then((next) => {
        snapshot = next;
        combatFx.consumeSnapshot(next);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        busy = false;
      });
  };

  requestAnimationFrame(frame);

  window.addEventListener("beforeunload", () => {
    input.dispose();
    renderer.dispose();
  });
}

void boot();
