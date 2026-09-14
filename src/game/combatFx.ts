import type { CombatEvent, GameSnapshot, Vec3, WeaponId } from "./types";
import type { CombatAudio } from "./audio";

export type DamageFloater = {
  id: number;
  text: string;
  x: number;
  y: number;
  z: number;
  life: number;
  maxLife: number;
  kill: boolean;
};

export type ExplosionFx = {
  id: number;
  x: number;
  y: number;
  z: number;
  life: number;
  maxLife: number;
  radius: number;
};

export type CombatFxState = {
  recoil: number;
  recoilPitch: number;
  muzzleFlash: number;
  hitMarker: number;
  aiming: boolean;
  firing: boolean;
  fireKick: number;
  floaters: DamageFloater[];
  explosions: ExplosionFx[];
  hitFlash: Map<number, number>;
  lastWeaponId: WeaponId | null;
};

export class CombatFx {
  state: CombatFxState = {
    recoil: 0,
    recoilPitch: 0,
    muzzleFlash: 0,
    hitMarker: 0,
    aiming: false,
    firing: false,
    fireKick: 0,
    floaters: [],
    explosions: [],
    hitFlash: new Map(),
    lastWeaponId: null,
  };

  private floaterId = 1;
  private explosionId = 1;
  private lastTick = -1;

  constructor(private readonly audio: CombatAudio) {}

  setInputFlags(aiming: boolean, firing: boolean) {
    this.state.aiming = aiming;
    this.state.firing = firing;
  }

  consumeSnapshot(snapshot: GameSnapshot) {
    if (snapshot.tick === this.lastTick) return;
    this.lastTick = snapshot.tick;
    this.state.lastWeaponId = snapshot.player.weapon.id;
    for (const ev of snapshot.events ?? []) {
      this.handleEvent(ev, snapshot.player.weapon.id);
    }
  }

  update(dt: number) {
    this.state.recoil = Math.max(0, this.state.recoil - dt * 9);
    this.state.recoilPitch = Math.max(0, this.state.recoilPitch - dt * 6);
    this.state.muzzleFlash = Math.max(0, this.state.muzzleFlash - dt * 14);
    this.state.hitMarker = Math.max(0, this.state.hitMarker - dt * 4);
    this.state.fireKick = Math.max(0, this.state.fireKick - dt * 8);

    for (const [id, t] of [...this.state.hitFlash.entries()]) {
      const next = t - dt;
      if (next <= 0) this.state.hitFlash.delete(id);
      else this.state.hitFlash.set(id, next);
    }

    this.state.floaters = this.state.floaters
      .map((f) => ({
        ...f,
        life: f.life - dt,
        y: f.y + dt * 1.2,
      }))
      .filter((f) => f.life > 0);

    this.state.explosions = this.state.explosions
      .map((e) => ({ ...e, life: e.life - dt }))
      .filter((e) => e.life > 0);
  }

  private handleEvent(ev: CombatEvent, weaponId: WeaponId) {
    if (ev.kind === "shot") {
      // Player shots have no target_id; NPC shots stamp the shooter id.
      if (ev.target_id != null) {
        this.audio.playShot();
        return;
      }
      if (weaponId === "desert_eagle") {
        this.audio.playDeagle();
        this.state.recoil = Math.min(1.8, this.state.recoil + 1.35);
        this.state.recoilPitch = Math.min(0.35, this.state.recoilPitch + 0.18);
        this.state.fireKick = 1.2;
        this.state.muzzleFlash = 1.2;
      } else if (weaponId === "rocket_launcher") {
        this.audio.playRocket();
        this.state.recoil = Math.min(2.2, this.state.recoil + 1.8);
        this.state.recoilPitch = Math.min(0.45, this.state.recoilPitch + 0.28);
        this.state.fireKick = 1.6;
        this.state.muzzleFlash = 1.8;
      } else if (weaponId === "grenade") {
        this.audio.playGrenadeThrow();
        this.state.recoil = Math.min(0.6, this.state.recoil + 0.35);
        this.state.fireKick = 0.7;
        this.state.muzzleFlash = 0;
      } else {
        this.audio.playShot();
        this.state.recoil = Math.min(1.4, this.state.recoil + 0.85);
        this.state.recoilPitch = Math.min(0.22, this.state.recoilPitch + 0.09);
        this.state.fireKick = 0.85;
        this.state.muzzleFlash = 1;
      }
      return;
    }

    if (ev.kind === "explosion") {
      this.audio.playExplosion();
      const radius = Math.max(4.5, Math.sqrt(ev.damage) * 0.75 + ev.damage * 0.04);
      this.state.explosions.push({
        id: this.explosionId++,
        x: ev.position.x,
        y: Math.max(0.15, ev.position.y),
        z: ev.position.z,
        life: 0.9,
        maxLife: 0.9,
        radius,
      });
      this.state.hitMarker = 1;
      this.state.recoilPitch = Math.min(0.2, this.state.recoilPitch + 0.06);
      return;
    }

    if (ev.kind === "hit" || ev.kind === "kill") {
      if (ev.kind === "kill") this.audio.playKill();
      else this.audio.playHit();

      this.state.hitMarker = 1;
      if (ev.target_id != null) {
        this.state.hitFlash.set(ev.target_id, ev.zone === "head" ? 0.55 : 0.35);
      }
      this.spawnFloater(
        ev.position,
        Math.round(ev.damage),
        ev.kind === "kill",
        ev.zone,
      );
    }
  }

  private spawnFloater(
    pos: Vec3,
    damage: number,
    kill: boolean,
    zone: CombatEvent["zone"] = null,
  ) {
    let text = kill ? `${damage}!` : `${damage}`;
    if (zone === "head") text = kill ? `HEADSHOT ${damage}` : `HEAD ${damage}`;
    else if (zone === "leg") text = `LEG ${damage}`;

    this.state.floaters.push({
      id: this.floaterId++,
      text,
      x: pos.x + (Math.random() - 0.5) * 0.4,
      y: pos.y + 0.4,
      z: pos.z + (Math.random() - 0.5) * 0.4,
      life: zone === "head" ? 1.15 : 0.85,
      maxLife: zone === "head" ? 1.15 : 0.85,
      kill: kill || zone === "head",
    });
  }
}
