import type { GameSnapshot, PlayerInput } from "./types";
import { WEAPON_LOADOUT, emptyInput } from "./types";

/** Browser fallback so `npm run dev` works without the desktop shell. */
class LocalEngine {
  private snapshot: GameSnapshot;
  private nextId = 100;
  private fireTimer = 0;
  private interactLatched = false;
  private cameraLatched = false;
  private jumpLatched = false;
  private npcWander: {
    timer: number;
    yaw: number;
    speed: number;
    crawlTimer: number;
    fireTimer: number;
    aggroPlayer: boolean;
    targetNpc: number | null;
  }[] = [];

  constructor() {
    this.snapshot = this.createWorld();
  }

  init(): GameSnapshot {
    this.snapshot = this.createWorld();
    this.fireTimer = 0;
    this.interactLatched = false;
    this.cameraLatched = false;
    this.jumpLatched = false;
    return structuredClone(this.snapshot);
  }

  tick(input: PlayerInput, dt: number): GameSnapshot {
    const d = Math.min(Math.max(dt, 0), 0.05);
    const s = this.snapshot;
    s.tick += 1;
    s.events = [];
    this.fireTimer = Math.max(0, this.fireTimer - d);

    if (input.toggle_camera) {
      if (!this.cameraLatched) {
        s.player.camera_mode =
          s.player.camera_mode === "third_person"
            ? "first_person"
            : "third_person";
        this.cameraLatched = true;
      }
    } else {
      this.cameraLatched = false;
    }

    if (input.weapon_slot != null && input.weapon_slot !== s.player.weapon_slot) {
      const w = WEAPON_LOADOUT[input.weapon_slot];
      if (w) {
        s.player.weapon_slot = input.weapon_slot;
        s.player.weapon = { ...w };
        this.fireTimer = 0.15;
      }
    }

    s.player.yaw = input.look_yaw;
    s.player.pitch = clamp(input.look_pitch, -1.35, 1.35);
    s.player.shield_active =
      input.shield && s.player.shield > 0 && s.player.in_vehicle == null;

    if (s.player.shield_active) {
      s.player.shield = Math.max(0, s.player.shield - 8 * d);
    } else {
      s.player.shield = Math.min(s.player.max_shield, s.player.shield + 6 * d);
    }

    this.handleInteract(input);
    this.movePlayerOrVehicle(input, d);

    if (input.fire) this.tryFire();
    this.updateNpcs(d);
    this.updateProjectiles(d);
    this.maintainShooters();

    return structuredClone(s);
  }

  private createWorld(): GameSnapshot {
    this.nextId = 1;
    const playerId = this.nextId++;
    const npcs = [];
    this.npcWander = [];
    for (let i = 0; i < 20; i++) {
      const spawned = this.spawnShooterNpc(i, { x: 0, z: 0 });
      npcs.push(spawned.npc);
      this.npcWander.push(spawned.wander);
    }

    const vehicles = [];
    for (let i = 0; i < 6; i++) {
      const angle = i * 1.1 + 0.4;
      const radius = 8 + i * 7;
      vehicles.push({
        id: this.nextId++,
        position: { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius },
        yaw: angle + 1.2,
        occupied: false,
        speed: 0,
        kind: i % 2 === 0 ? "rover" : "buggy",
        health: 120,
        max_health: 120,
        burning: false,
        destroyed: false,
      });
    }

    const trees = [];
    for (let i = 0; i < 55; i++) {
      const angle = i * 2.399963;
      const radius = 16 + ((i * 19) % 98);
      trees.push({
        id: this.nextId++,
        position: {
          x: Math.cos(angle) * radius,
          y: 0,
          z: Math.sin(angle) * radius,
        },
        height: 12 + ((i * 5) % 10) * 0.9,
        trunk_radius: 0.32 + (i % 5) * 0.05,
        burned: false,
        climbable: true,
      });
    }

    return {
      tick: 0,
      world_size: 240,
      player: {
        id: playerId,
        position: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        health: 100,
        max_health: 100,
        shield: 80,
        max_shield: 80,
        shield_active: false,
        in_vehicle: null,
        climbing_tree: null,
        weapon: { ...WEAPON_LOADOUT[0] },
        weapon_slot: 0,
        camera_mode: "third_person",
      },
      npcs,
      vehicles,
      trees,
      projectiles: [],
      events: [],
    };
  }

  private spawnShooterNpc(
    salt = 0,
    around: { x: number; z: number } | null = null,
  ) {
    const player = around ?? this.snapshot.player.position;
    const id = this.nextId++;
    const angle = (id + salt) * 2.399963;
    const radius = 28 + ((id * 17 + salt * 13) % 40);
    const half = (this.snapshot?.world_size ?? 240) / 2;
    const x = clamp(player.x + Math.cos(angle) * radius, -half + 2, half - 2);
    const z = clamp(player.z + Math.sin(angle) * radius, -half + 2, half - 2);
    const npc = {
      id,
      position: { x, y: 0, z },
      yaw: angle + Math.PI,
      health: 70,
      max_health: 70,
      shield: id % 3 === 0 ? 35 : 0,
      max_shield: id % 3 === 0 ? 35 : 0,
      kind: "shooter",
      crawling: false,
      crawl_time_left: 0,
    };
    return {
      npc,
      wander: {
        timer: 0,
        yaw: angle + Math.PI,
        speed: 2 + (id % 4) * 0.35,
        crawlTimer: 0,
        fireTimer: (id % 5) * 0.12,
        aggroPlayer: true,
        targetNpc: null as number | null,
      },
    };
  }

  private maintainShooters() {
    const keptNpcs = [];
    const keptWander = [];
    for (let i = 0; i < this.snapshot.npcs.length; i++) {
      if (this.snapshot.npcs[i].health > 0) {
        keptNpcs.push(this.snapshot.npcs[i]);
        keptWander.push(this.npcWander[i]);
      }
    }
    this.snapshot.npcs = keptNpcs;
    this.npcWander = keptWander;
    while (this.snapshot.npcs.length < 20) {
      const spawned = this.spawnShooterNpc(this.snapshot.tick + this.snapshot.npcs.length);
      this.snapshot.npcs.push(spawned.npc);
      this.npcWander.push(spawned.wander);
    }
  }

  private handleInteract(input: PlayerInput) {
    const s = this.snapshot;
    if (!input.interact) {
      this.interactLatched = false;
      return;
    }
    if (this.interactLatched) return;
    this.interactLatched = true;

    if (s.player.in_vehicle != null) {
      const v = s.vehicles.find((x) => x.id === s.player.in_vehicle);
      if (v) {
        v.occupied = false;
        v.speed = 0;
        s.player.position = {
          x: v.position.x + Math.cos(v.yaw) * 2.2,
          y: 0,
          z: v.position.z + Math.sin(v.yaw) * 2.2,
        };
      }
      s.player.in_vehicle = null;
      return;
    }

    if (s.player.climbing_tree != null) {
      s.player.climbing_tree = null;
      s.player.position.y = 0;
      return;
    }

    let best = null as (typeof s.vehicles)[0] | null;
    let bestDist = 3;
    for (const v of s.vehicles) {
      if (v.occupied || v.destroyed) continue;
      const d = distXZ(s.player.position, v.position);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    if (best) {
      best.occupied = true;
      s.player.in_vehicle = best.id;
      s.player.position = { ...best.position };
    }
  }

  private movePlayerOrVehicle(input: PlayerInput, dt: number) {
    const s = this.snapshot;
    const half = s.world_size / 2;

    if (s.player.in_vehicle != null) {
      s.player.climbing_tree = null;
      const v = s.vehicles.find((x) => x.id === s.player.in_vehicle);
      if (!v) return;
      v.yaw += input.strafe * 2.2 * dt;
      const target = Math.abs(input.forward) > 0.01 ? input.forward * 22 : 0;
      const accel = 18 * dt;
      if (v.speed < target) v.speed = Math.min(target, v.speed + accel);
      else v.speed = Math.max(target, v.speed - accel * 1.4);
      v.position.x = clamp(v.position.x + Math.sin(v.yaw) * v.speed * dt, -half, half);
      v.position.z = clamp(v.position.z + Math.cos(v.yaw) * v.speed * dt, -half, half);
      s.player.position = { ...v.position };
      return;
    }

    const jumpPressed = input.jump && !this.jumpLatched;
    this.jumpLatched = input.jump;

    if (s.player.climbing_tree != null) {
      const tree = s.trees.find((t) => t.id === s.player.climbing_tree);
      if (!tree || tree.burned || !tree.climbable) {
        s.player.climbing_tree = null;
        s.player.position.y = 0;
        return;
      }

      if (jumpPressed) {
        s.player.climbing_tree = null;
        s.player.position.y = 0;
        const dx = s.player.position.x - tree.position.x;
        const dz = s.player.position.z - tree.position.z;
        const len = Math.hypot(dx, dz) || 1;
        s.player.position.x += (dx / len) * 0.6;
        s.player.position.z += (dz / len) * 0.6;
        return;
      }

      const maxY = Math.max(2.4, tree.height * 0.92);
      s.player.position.y = clamp(
        s.player.position.y + input.forward * 2.6 * dt,
        0,
        s.player.position.y > tree.height * 0.45
          ? Math.max(2.4, tree.height * 0.95)
          : maxY,
      );

      let hug = Math.max(0.55, tree.trunk_radius + 0.55);
      if (s.player.position.y > tree.height * 0.45) {
        hug = tree.trunk_radius + 0.28;
      }
      if (Math.abs(input.strafe) > 0.01) {
        const dx = s.player.position.x - tree.position.x;
        const dz = s.player.position.z - tree.position.z;
        let ang = Math.atan2(dx, dz);
        ang += input.strafe * 1.9 * dt;
        s.player.position.x = tree.position.x + Math.sin(ang) * hug;
        s.player.position.z = tree.position.z + Math.cos(ang) * hug;
      } else {
        const dx = s.player.position.x - tree.position.x;
        const dz = s.player.position.z - tree.position.z;
        const len = Math.hypot(dx, dz) || 1;
        s.player.position.x = tree.position.x + (dx / len) * hug;
        s.player.position.z = tree.position.z + (dz / len) * hug;
      }

      if (s.player.position.y <= 0.02 && input.forward < -0.2) {
        s.player.climbing_tree = null;
        s.player.position.y = 0;
      }
      return;
    }

    if (jumpPressed) {
      let best: (typeof s.trees)[0] | null = null;
      let bestDist = Infinity;
      for (const t of s.trees) {
        if (!t.climbable || t.burned) continue;
        const d = distXZ(s.player.position, t.position);
        if (d <= t.trunk_radius + 1.4 && d < bestDist) {
          bestDist = d;
          best = t;
        }
      }
      if (best) {
        const dx = s.player.position.x - best.position.x;
        const dz = s.player.position.z - best.position.z;
        const len = Math.hypot(dx, dz) || 1;
        const dist = best.trunk_radius + 0.55;
        s.player.climbing_tree = best.id;
        s.player.position.x = best.position.x + (dx / len) * dist;
        s.player.position.z = best.position.z + (dz / len) * dist;
        s.player.position.y = 0.35;
        return;
      }
    }

    const speed = 6.5 * (input.sprint ? 1.7 : 1);
    const yaw = input.look_yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let mx = fx * input.forward + rx * input.strafe;
    let mz = fz * input.forward + rz * input.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1e-4) {
      mx = (mx / len) * speed * dt;
      mz = (mz / len) * speed * dt;
      s.player.position.x = clamp(s.player.position.x + mx, -half, half);
      s.player.position.z = clamp(s.player.position.z + mz, -half, half);
    }
    s.player.position.y = 0;
  }

  private tryFire() {
    const s = this.snapshot;
    if (this.fireTimer > 0 || s.player.in_vehicle != null) return;
    const yaw = s.player.yaw;
    const pitch = s.player.pitch;
    const dx = Math.sin(yaw) * Math.cos(pitch);
    const dy = Math.sin(pitch);
    const dz = Math.cos(yaw) * Math.cos(pitch);
    const len = Math.hypot(dx, dy, dz) || 1;
    const w = s.player.weapon;
    const upBoost = w.kind === "grenade" ? 0.35 : 0;
    const tdx = dx / len;
    const tdy = (dy / len + upBoost);
    const tdz = dz / len;
    const tlen = Math.hypot(tdx, tdy, tdz) || 1;
    const speed = w.projectile_speed;
    const muzzle = {
      x: s.player.position.x + (dx / len) * 1.1,
      y: s.player.position.y + 1.45 + (dy / len) * 1.1,
      z: s.player.position.z + (dz / len) * 1.1,
    };
    const life =
      w.kind === "grenade" ? w.fuse + 0.5 : w.kind === "rocket" ? 4 : 2;
    s.projectiles.push({
      id: this.nextId++,
      position: muzzle,
      velocity: {
        x: (tdx / tlen) * speed,
        y: (tdy / tlen) * speed,
        z: (tdz / tlen) * speed,
      },
      owner_id: s.player.id,
      damage: w.damage,
      life,
      kind: w.kind,
      explosion_radius: w.explosion_radius,
      gravity: w.gravity,
      fuse: w.fuse,
      age: 0,
    });
    this.fireTimer = w.fire_cooldown;
    s.events.push({
      kind: "shot",
      target_id: null,
      damage: w.damage,
      position: muzzle,
      zone: null,
    });
  }

  private updateNpcs(dt: number) {
    const half = this.snapshot.world_size / 2;
    const player = this.snapshot.player;
    const playerAlive = player.health > 0;
    const roster = this.snapshot.npcs.map((n, i) => ({
      id: n.id,
      pos: n.position,
      kind: n.kind,
      health: n.health,
      idx: i,
    }));

    const fireIntents: { idx: number; target: { x: number; y: number; z: number } }[] =
      [];

    this.snapshot.npcs.forEach((npc, i) => {
      if (npc.health <= 0) return;
      const w = this.npcWander[i];
      w.fireTimer = Math.max(0, w.fireTimer - dt);

      if (w.crawlTimer > 0) {
        w.crawlTimer = Math.max(0, w.crawlTimer - dt);
        npc.crawl_time_left = w.crawlTimer;
        npc.crawling = w.crawlTimer > 0;
      } else {
        npc.crawling = false;
        npc.crawl_time_left = 0;
      }

      const engageRange = 48;
      let aimAt: { x: number; y: number; z: number } | null = null;

      if (playerAlive && distXZ(npc.position, player.position) <= engageRange) {
        aimAt = { ...player.position };
        w.aggroPlayer = true;
      }

      let bestNpc: { id: number; pos: { x: number; y: number; z: number }; dist: number } | null =
        null;
      for (const o of roster) {
        if (o.id === npc.id || o.health <= 0) continue;
        const d = distXZ(npc.position, o.pos);
        if (d > 38) continue;
        if (!bestNpc || d < bestNpc.dist) {
          bestNpc = { id: o.id, pos: { ...o.pos }, dist: d };
        }
      }

      if (bestNpc) {
        w.targetNpc = bestNpc.id;
        const preferNpc =
          !aimAt || bestNpc.dist + 4 < distXZ(npc.position, aimAt);
        if (preferNpc) aimAt = bestNpc.pos;
      } else if (w.targetNpc != null) {
        const still = roster.some(
          (o) =>
            o.id === w.targetNpc &&
            o.health > 0 &&
            distXZ(npc.position, o.pos) < 45,
        );
        if (!still) w.targetNpc = null;
      }

      if (aimAt) {
        const dx = aimAt.x - npc.position.x;
        const dz = aimAt.z - npc.position.z;
        const dist = Math.hypot(dx, dz);
        npc.yaw = Math.atan2(dx, dz);
        w.yaw = npc.yaw;

        const hold = npc.crawling ? 10 : 14;
        const moveSpeed = npc.crawling ? w.speed * 0.22 : w.speed * 1.35;
        if (dist > hold) {
          npc.position.x = clamp(
            npc.position.x + Math.sin(npc.yaw) * moveSpeed * dt,
            -half,
            half,
          );
          npc.position.z = clamp(
            npc.position.z + Math.cos(npc.yaw) * moveSpeed * dt,
            -half,
            half,
          );
        }
        if (dist < engageRange && dist > 2.5) {
          fireIntents.push({ idx: i, target: aimAt });
        }
      } else {
        w.timer -= dt;
        if (w.timer <= 0) {
          w.timer = 1.5 + (npc.id % 5) * 0.4;
          w.yaw += ((npc.id % 7) - 3) * 0.35;
        }
        npc.yaw = w.yaw;
        const moveSpeed = npc.crawling ? w.speed * 0.22 : w.speed;
        npc.position.x = clamp(
          npc.position.x + Math.sin(w.yaw) * moveSpeed * dt,
          -half,
          half,
        );
        npc.position.z = clamp(
          npc.position.z + Math.cos(w.yaw) * moveSpeed * dt,
          -half,
          half,
        );
      }

      if (npc.shield < npc.max_shield) {
        npc.shield = Math.min(npc.max_shield, npc.shield + 2 * dt);
      }
    });

    for (const intent of fireIntents) {
      this.npcTryFire(intent.idx, intent.target);
    }
  }

  private npcTryFire(
    idx: number,
    target: { x: number; y: number; z: number },
  ) {
    const npc = this.snapshot.npcs[idx];
    const w = this.npcWander[idx];
    if (!npc || !w || w.fireTimer > 0 || npc.health <= 0) return;

    const muzzleY = npc.crawling ? 0.45 : 1.4;
    const muzzle = {
      x: npc.position.x,
      y: npc.position.y + muzzleY,
      z: npc.position.z,
    };
    const aim = { x: target.x, y: target.y + 1.2, z: target.z };
    let dx = aim.x - muzzle.x;
    let dy = aim.y - muzzle.y;
    let dz = aim.z - muzzle.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;

    const damage = 14;
    const speed = 48;
    this.snapshot.projectiles.push({
      id: this.nextId++,
      position: {
        x: muzzle.x + dx * 0.6,
        y: muzzle.y + dy * 0.6,
        z: muzzle.z + dz * 0.6,
      },
      velocity: { x: dx * speed, y: dy * speed, z: dz * speed },
      owner_id: npc.id,
      damage,
      life: 2,
      kind: "bullet",
      explosion_radius: 0,
      gravity: 0,
      fuse: 0,
      age: 0,
    });
    w.fireTimer = npc.crawling ? 1.1 : 0.75;
    npc.yaw = Math.atan2(dx, dz);
    w.yaw = npc.yaw;
    this.snapshot.events.push({
      kind: "shot",
      target_id: npc.id,
      damage,
      position: muzzle,
      zone: null,
    });
  }

  private updateProjectiles(dt: number) {
    const half = this.snapshot.world_size / 2 + 20;
    const remove = new Set<number>();
    const playerId = this.snapshot.player.id;

    for (const p of this.snapshot.projectiles) {
      if (p.gravity > 0) p.velocity.y -= p.gravity * dt;
      p.age += dt;

      const from = { ...p.position };
      let to = {
        x: p.position.x + p.velocity.x * dt,
        y: p.position.y + p.velocity.y * dt,
        z: p.position.z + p.velocity.z * dt,
      };

      let exploded = false;
      let directHit = false;
      let blast = { ...to };

      if (p.kind === "rocket" && to.y <= 0.18) {
        exploded = true;
        blast = { x: to.x, y: 0.25, z: to.z };
      }

      if (p.kind === "grenade" && to.y <= 0.12) {
        if (p.age >= p.fuse * 0.35) {
          exploded = true;
          blast = { x: to.x, y: 0.2, z: to.z };
        } else {
          p.position = { x: to.x, y: 0.12, z: to.z };
          p.velocity.y = Math.abs(p.velocity.y) * 0.35;
          p.velocity.x *= 0.7;
          p.velocity.z *= 0.7;
          continue;
        }
      }

      if (p.kind === "grenade" && p.age >= p.fuse) {
        exploded = true;
        blast = { ...to };
      }

      if (!exploded) {
        for (const npc of this.snapshot.npcs) {
          if (npc.health <= 0 || npc.id === p.owner_id) continue;
          const hitInfo = hitVerticalCapsule(
            from,
            to,
            npc.position,
            npc.crawling,
          );
          if (!hitInfo) continue;

          if (p.explosion_radius > 0) {
            exploded = true;
            blast = hitInfo.hitPos;
          } else {
            this.applyNpcHit(npc, hitInfo.zone, p.damage, hitInfo.hitPos);
            directHit = true;
          }
          break;
        }
      }

      if (!exploded && !directHit && p.explosion_radius > 0) {
        for (const v of this.snapshot.vehicles) {
          if (v.destroyed) continue;
          const center = {
            x: v.position.x,
            y: v.position.y + 0.7,
            z: v.position.z,
          };
          const closest = closestOnSegment(from, to, center);
          const dist = Math.hypot(
            closest.x - center.x,
            (closest.y - center.y) * 0.85,
            closest.z - center.z,
          );
          if (dist <= 1.7) {
            exploded = true;
            blast = closest;
            break;
          }
        }
      }

      if (!exploded && !directHit && p.explosion_radius > 0) {
        for (const tree of this.snapshot.trees) {
          if (tree.burned) continue;
          const center = {
            x: tree.position.x,
            y: tree.position.y + tree.height * 0.45,
            z: tree.position.z,
          };
          const closest = closestOnSegment(from, to, center);
          const dist = Math.hypot(
            closest.x - center.x,
            (closest.y - center.y) * 0.7,
            closest.z - center.z,
          );
          if (dist <= tree.trunk_radius + 0.55) {
            exploded = true;
            blast = closest;
            break;
          }
        }
      }

      if (
        !exploded &&
        !directHit &&
        p.owner_id !== playerId &&
        this.snapshot.player.health > 0
      ) {
        const hitInfo = hitVerticalCapsule(
          from,
          to,
          this.snapshot.player.position,
          false,
        );
        if (hitInfo) {
          if (p.explosion_radius > 0) {
            exploded = true;
            blast = hitInfo.hitPos;
          } else {
            this.applyPlayerHit(p.damage, hitInfo.hitPos, hitInfo.zone);
            directHit = true;
          }
        }
      }

      if (!exploded && !directHit) {
        p.position = to;
        p.life -= dt;
        if (p.kind === "rocket" && p.life <= 0) {
          exploded = true;
          blast = { ...to };
        }
      }

      if (exploded) {
        this.explodeAt(blast, p.damage, Math.max(1, p.explosion_radius));
        remove.add(p.id);
      } else if (directHit) {
        remove.add(p.id);
      }
    }

    this.snapshot.projectiles = this.snapshot.projectiles.filter(
      (p) =>
        !remove.has(p.id) &&
        p.life > 0 &&
        Math.abs(p.position.x) < half &&
        Math.abs(p.position.z) < half &&
        p.position.y > -5 &&
        p.position.y < 60,
    );
  }

  private explodeAt(
    center: { x: number; y: number; z: number },
    damage: number,
    radius: number,
  ) {
    this.snapshot.events.push({
      kind: "explosion",
      target_id: null,
      damage,
      position: { ...center },
      zone: null,
    });

    for (const npc of this.snapshot.npcs) {
      if (npc.health <= 0) continue;
      const body = {
        x: npc.position.x,
        y: npc.position.y + 1,
        z: npc.position.z,
      };
      const dist = Math.hypot(
        center.x - body.x,
        center.y - body.y,
        center.z - body.z,
      );
      if (dist > radius) continue;
      const falloff = Math.max(0.15, 1 - dist / radius);
      const h = center.y - npc.position.y;
      const zone: "head" | "body" | "leg" =
        h >= 1.55 ? "head" : h < 0.9 ? "leg" : "body";
      const z =
        zone === "head" && center.y < npc.position.y + 1.4 ? "body" : zone;
      this.applyNpcHit(npc, z, damage * falloff, body);
    }

    for (const v of this.snapshot.vehicles) {
      if (v.destroyed) continue;
      const body = {
        x: v.position.x,
        y: v.position.y + 0.7,
        z: v.position.z,
      };
      const dist = Math.hypot(
        center.x - body.x,
        center.y - body.y,
        center.z - body.z,
      );
      if (dist > radius + 0.8) continue;
      const falloff = Math.max(0.2, 1 - dist / (radius + 0.8));
      const dmg = damage * falloff * 1.15;
      v.health = Math.max(0, v.health - dmg);
      if (v.health < v.max_health * 0.55) v.burning = true;
      if (v.health <= 0) {
        v.destroyed = true;
        v.burning = true;
        v.speed = 0;
        if (v.occupied) {
          v.occupied = false;
          if (this.snapshot.player.in_vehicle === v.id) {
            this.snapshot.player.in_vehicle = null;
            this.snapshot.player.position = {
              x: v.position.x + 2.2,
              y: 0,
              z: v.position.z,
            };
          }
        }
      }
      this.snapshot.events.push({
        kind: v.destroyed ? "kill" : "hit",
        target_id: v.id,
        damage: Math.max(1, dmg),
        position: body,
        zone: "body",
      });
    }

    for (const tree of this.snapshot.trees) {
      if (tree.burned) continue;
      const dist = distXZ(center, tree.position);
      if (dist <= radius + 1.2) {
        tree.burned = true;
        tree.climbable = false;
        if (this.snapshot.player.climbing_tree === tree.id) {
          this.snapshot.player.climbing_tree = null;
          this.snapshot.player.position.y = 0;
        }
      }
    }

    const player = this.snapshot.player;
    if (player.health > 0) {
      const pbody = {
        x: player.position.x,
        y: player.position.y + 1,
        z: player.position.z,
      };
      const pdist = Math.hypot(
        center.x - pbody.x,
        center.y - pbody.y,
        center.z - pbody.z,
      );
      if (pdist <= radius) {
        const falloff = Math.max(0.15, 1 - pdist / radius);
        this.applyPlayerHit(damage * falloff * 0.55, pbody, "body");
      }
    }
  }

  private applyPlayerHit(
    damage: number,
    hitPos: { x: number; y: number; z: number },
    zone: "head" | "body" | "leg",
  ) {
    const player = this.snapshot.player;
    let dmg = damage;
    const before = player.health;
    if (player.shield_active && player.shield > 0) {
      const absorbed = Math.min(player.shield, dmg);
      player.shield -= absorbed;
      dmg -= absorbed;
    }
    player.health = Math.max(0, player.health - dmg);
    this.snapshot.events.push({
      kind: player.health <= 0 ? "kill" : "hit",
      target_id: player.id,
      damage: Math.max(1, before - player.health),
      position: hitPos,
      zone,
    });
  }

  private applyNpcHit(
    npc: GameSnapshot["npcs"][number],
    zone: "head" | "body" | "leg",
    damage: number,
    hitPos: { x: number; y: number; z: number },
  ) {
    const idx = this.snapshot.npcs.findIndex((n) => n.id === npc.id);
    const npcWander = this.npcWander[idx];
    if (npcWander) npcWander.aggroPlayer = true;

    if (zone === "head") {
      const dealt = Math.max(1, npc.health);
      npc.health = 0;
      npc.shield = 0;
      npc.crawling = false;
      npc.crawl_time_left = 0;
      if (npcWander) npcWander.crawlTimer = 0;
      this.snapshot.events.push({
        kind: "kill",
        target_id: npc.id,
        damage: dealt,
        position: hitPos,
        zone: "head",
      });
      return;
    }

    const healthBefore = npc.health;
    const shieldBefore = npc.shield;
    let dmg = zone === "leg" ? damage * 0.65 : damage;
    if (npc.shield > 0) {
      const absorbed = Math.min(npc.shield, dmg);
      npc.shield -= absorbed;
      dmg -= absorbed;
    }
    npc.health = Math.max(0, npc.health - dmg);
    const dealt = healthBefore - npc.health + (shieldBefore - npc.shield);

    if (zone === "leg" && npc.health > 0) {
      if (npcWander) npcWander.crawlTimer = 30;
      npc.crawling = true;
      npc.crawl_time_left = 30;
    }
    if (npc.health <= 0) {
      npc.crawling = false;
      npc.crawl_time_left = 0;
      if (npcWander) npcWander.crawlTimer = 0;
    }

    this.snapshot.events.push({
      kind: npc.health <= 0 ? "kill" : "hit",
      target_id: npc.id,
      damage: Math.max(1, dealt),
      position: hitPos,
      zone,
    });
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function distXZ(
  a: { x: number; z: number },
  b: { x: number; z: number },
) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function closestOnSegment(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  point: { x: number; y: number; z: number },
) {
  const abx = to.x - from.x;
  const aby = to.y - from.y;
  const abz = to.z - from.z;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq < 1e-8) return { ...from };
  let t =
    ((point.x - from.x) * abx +
      (point.y - from.y) * aby +
      (point.z - from.z) * abz) /
    abLenSq;
  t = Math.max(0, Math.min(1, t));
  return {
    x: from.x + abx * t,
    y: from.y + aby * t,
    z: from.z + abz * t,
  };
}

function hitVerticalCapsule(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  feet: { x: number; y: number; z: number },
  crawling: boolean,
): { zone: "head" | "body" | "leg"; hitPos: { x: number; y: number; z: number } } | null {
  const ymin = 0.05;
  const ymax = crawling ? 0.65 : 1.95;
  const radius = 0.48;
  let bestDist = Infinity;
  let bestHit = { x: 0, y: 0, z: 0 };
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = ymin + (ymax - ymin) * t;
    const axis = { x: feet.x, y: feet.y + y, z: feet.z };
    const closest = closestOnSegment(from, to, axis);
    const dist = Math.hypot(
      closest.x - axis.x,
      (closest.y - axis.y) * 0.9,
      closest.z - axis.z,
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestHit = closest;
    }
  }
  if (bestDist > radius) return null;

  const h = bestHit.y - feet.y;
  let zone: "head" | "body" | "leg";
  if (crawling) {
    zone = h >= 0.45 ? "head" : h <= 0.22 ? "leg" : "body";
  } else if (h >= 1.55) {
    zone = "head";
  } else if (h < 0.9) {
    zone = "leg";
  } else {
    zone = "body";
  }
  return { zone, hitPos: bestHit };
}

const local = new LocalEngine();

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function initGame(): Promise<GameSnapshot> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<GameSnapshot>("init_game");
  }
  return local.init();
}

export async function tickGame(
  input: PlayerInput,
  dt: number,
): Promise<GameSnapshot> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<GameSnapshot>("tick_game", { input, dt });
  }
  return local.tick(input, dt);
}

export { emptyInput };
