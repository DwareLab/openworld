import type { GameSnapshot } from "./types";
import type { CombatFxState } from "./combatFx";
import type { WorldRenderer } from "./renderer";

export class Hud {
  private root: HTMLElement;
  private healthFill: HTMLElement;
  private shieldFill: HTMLElement;
  private meta: HTMLElement;
  private prompt: HTMLElement;
  private crosshair: HTMLElement;
  private hitMarker: HTMLElement;
  private floaters: HTMLElement;
  private scope: HTMLElement;
  private scopeMag: HTMLElement;
  private help: HTMLElement;
  private weaponBar: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "hud";
    this.root.innerHTML = `
      <div class="bars">
        <div class="bar health"><div class="fill" id="health-fill"></div></div>
        <div class="bar shield"><div class="fill" id="shield-fill"></div></div>
      </div>
      <div id="hud-meta"></div>
      <div id="hud-prompt"></div>
      <div id="crosshair"></div>
      <div id="hit-marker"></div>
      <div id="damage-floaters"></div>
      <div id="scope-overlay" class="hidden" aria-hidden="true">
        <div class="scope-lens">
          <div class="scope-glass"></div>
          <div class="scope-reticle">
            <span class="scope-h"></span>
            <span class="scope-v"></span>
            <span class="scope-dot"></span>
            <span class="scope-tick t1"></span>
            <span class="scope-tick t2"></span>
            <span class="scope-tick t3"></span>
            <span class="scope-tick t4"></span>
          </div>
          <div class="scope-ring"></div>
        </div>
        <div id="scope-mag">4x</div>
      </div>
      <div id="weapon-bar">
        <div class="wep" data-slot="0"><span>1</span> Rifle</div>
        <div class="wep" data-slot="1"><span>2</span> Deagle</div>
        <div class="wep" data-slot="2"><span>3</span> Rocket</div>
        <div class="wep" data-slot="3"><span>4</span> Grenade</div>
      </div>
      <div id="hud-help">
        Scroll / 1-4 weapons · Mouse look · WASD · LMB fire · RMB scope · Q shield<br/>
        E vehicle · Space climb tree · V camera
      </div>
    `;
    parent.appendChild(this.root);
    this.healthFill = this.root.querySelector("#health-fill") as HTMLElement;
    this.shieldFill = this.root.querySelector("#shield-fill") as HTMLElement;
    this.meta = this.root.querySelector("#hud-meta") as HTMLElement;
    this.prompt = this.root.querySelector("#hud-prompt") as HTMLElement;
    this.crosshair = this.root.querySelector("#crosshair") as HTMLElement;
    this.hitMarker = this.root.querySelector("#hit-marker") as HTMLElement;
    this.floaters = this.root.querySelector("#damage-floaters") as HTMLElement;
    this.scope = this.root.querySelector("#scope-overlay") as HTMLElement;
    this.scopeMag = this.root.querySelector("#scope-mag") as HTMLElement;
    this.help = this.root.querySelector("#hud-help") as HTMLElement;
    this.weaponBar = this.root.querySelector("#weapon-bar") as HTMLElement;
  }

  update(
    snapshot: GameSnapshot,
    look?: { yaw: number; pitch: number; aim: boolean },
    fx?: CombatFxState,
    renderer?: WorldRenderer,
  ) {
    const p = snapshot.player;
    const hp = (p.health / p.max_health) * 100;
    const sh = (p.shield / p.max_shield) * 100;
    this.healthFill.style.width = `${hp}%`;
    this.shieldFill.style.width = `${sh}%`;
    this.shieldFill.parentElement?.classList.toggle("active", p.shield_active);

    const aiming = look?.aim ?? false;
    const mode =
      p.camera_mode === "first_person" ? "First Person" : "Third Person";
    const ads = aiming ? " · Scoped 4x" : "";
    const climb = p.climbing_tree != null ? " · Climbing" : "";
    const vehicle = p.in_vehicle != null ? " · In vehicle" : "";
    this.meta.textContent = `${mode}${ads} · ${p.weapon.name}${vehicle}${climb}`;

    this.weaponBar.querySelectorAll(".wep").forEach((el) => {
      const slot = Number((el as HTMLElement).dataset.slot);
      el.classList.toggle("active", slot === p.weapon_slot);
    });

    let nearVehicle = false;
    let nearTree = false;
    if (p.in_vehicle == null && p.climbing_tree == null) {
      for (const v of snapshot.vehicles) {
        if (v.occupied || v.destroyed) continue;
        const d = Math.hypot(
          v.position.x - p.position.x,
          v.position.z - p.position.z,
        );
        if (d < 3) {
          nearVehicle = true;
          break;
        }
      }
      for (const t of snapshot.trees ?? []) {
        if (!t.climbable || t.burned) continue;
        const d = Math.hypot(
          t.position.x - p.position.x,
          t.position.z - p.position.z,
        );
        if (d <= t.trunk_radius + 1.4) {
          nearTree = true;
          break;
        }
      }
    }
    this.prompt.textContent =
      p.climbing_tree != null
              ? "W/S climb into leaves · A/D circle · Space or E to drop"
        : p.in_vehicle != null
          ? "Press E to exit vehicle"
          : nearVehicle
            ? "Press E to enter vehicle"
            : nearTree
              ? "Press Space to climb tree"
              : "";

    // Hip-fire / FPV use simple crosshair; scoped view uses optic overlay
    const showCross =
      !aiming && p.camera_mode === "first_person";
    this.crosshair.classList.toggle("fpv", showCross);
    this.crosshair.classList.toggle("ads", false);

    this.scope.classList.toggle("hidden", !aiming);
    this.scope.setAttribute("aria-hidden", aiming ? "false" : "true");
    this.help.classList.toggle("dimmed", aiming);
    this.scopeMag.textContent = "4x SCOPE";

    const hit = fx?.hitMarker ?? 0;
    this.hitMarker.classList.toggle("show", hit > 0.05);
    this.hitMarker.style.opacity = String(Math.min(1, hit));

    this.floaters.innerHTML = "";
    if (fx && renderer) {
      for (const f of fx.floaters) {
        const screen = renderer.projectToScreen({ x: f.x, y: f.y, z: f.z });
        if (!screen.visible) continue;
        const el = document.createElement("div");
        el.className = `dmg-floater${f.kill ? " kill" : ""}`;
        el.textContent = f.text;
        const fade = f.life / f.maxLife;
        el.style.left = `${screen.x}px`;
        el.style.top = `${screen.y}px`;
        el.style.opacity = String(fade);
        this.floaters.appendChild(el);
      }
    }
  }
}
