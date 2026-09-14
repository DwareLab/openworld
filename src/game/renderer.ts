import * as THREE from "three";
import type { GameSnapshot, Vec3 } from "./types";
import type { CombatFxState } from "./combatFx";
import {
  animateCombat,
  createCharacter,
  type CharacterKind,
  type CharacterParts,
} from "./models/character";
import { createFpViewmodel, createProjectileMesh, createWeaponModel } from "./models/gun";
import { burnTreeVisual, createDetailedTree } from "./models/tree";
import type { WeaponId } from "./types";

type MeshMap = Map<number, THREE.Object3D>;

type TrackedCharacter = {
  parts: CharacterParts;
  prev: { x: number; y: number; z: number };
  materials: THREE.MeshStandardMaterial[];
};

export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private player: TrackedCharacter;
  private npcMeshes: MeshMap = new Map();
  private npcParts = new Map<number, TrackedCharacter>();
  private vehicleMeshes: MeshMap = new Map();
  private projectileMeshes: MeshMap = new Map();
  private shieldMesh: THREE.Mesh;
  private fpViewmodel: THREE.Group;
  private muzzleFlash: THREE.PointLight;
  private muzzleSprite: THREE.Mesh;
  private animTime = 0;
  private fx: CombatFxState | null = null;
  private equippedWeapon: WeaponId = "pulse_rifle";
  private explosionMeshes = new Map<number, THREE.Group>();
  private explosionLights = new Map<number, THREE.PointLight>();
  private trees: {
    root: THREE.Group;
    burned: boolean;
    id: number;
  }[] = [];
  private treeMeshes: MeshMap = new Map();
  private groundMesh: THREE.Mesh | null = null;
  private craterGroup = new THREE.Group();
  private seenExplosionIds = new Set<number>();
  private vehicleBurn = new Map<
    number,
    { light: THREE.PointLight; smoke: THREE.Mesh }
  >();
  private vehicleBaseColors = new Map<number, number>();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );

    this.scene.background = new THREE.Color(0x87b5d4);
    this.scene.fog = new THREE.Fog(0x87b5d4, 80, 220);

    const hemi = new THREE.HemisphereLight(0xddeeff, 0x445533, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);

    this.buildTerrain();
    this.scene.add(this.craterGroup);

    const playerParts = createCharacter("player");
    const rifle = createWeaponModel("pulse_rifle");
    rifle.scale.setScalar(0.95);
    playerParts.gunMount.add(rifle);
    this.player = {
      parts: playerParts,
      prev: { x: 0, y: 0, z: 0 },
      materials: collectMaterials(playerParts.root),
    };
    this.scene.add(playerParts.root);

    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0x4fd2ff,
        transparent: true,
        opacity: 0.28,
        roughness: 0.2,
        metalness: 0.1,
        depthWrite: false,
      }),
    );
    this.shieldMesh.visible = false;
    this.scene.add(this.shieldMesh);

    this.fpViewmodel = createFpViewmodel();
    this.fpViewmodel.visible = false;
    this.camera.add(this.fpViewmodel);
    this.scene.add(this.camera);

    this.muzzleFlash = new THREE.PointLight(0xffcc66, 0, 8);
    this.scene.add(this.muzzleFlash);
    this.muzzleSprite = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffe099,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.scene.add(this.muzzleSprite);

    window.addEventListener("resize", this.onResize);
  }

  dispose() {
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
  }

  setFx(fx: CombatFxState) {
    this.fx = fx;
  }

  projectToScreen(pos: Vec3): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(pos.x, pos.y, pos.z).project(this.camera);
    const visible = v.z < 1;
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      visible,
    };
  }

  render(
    snapshot: GameSnapshot,
    dt: number,
    look?: { yaw: number; pitch: number; aim: boolean },
  ) {
    this.animTime += dt;
    if (look) {
      snapshot = {
        ...snapshot,
        player: {
          ...snapshot.player,
          yaw: look.yaw,
          pitch: look.pitch,
        },
      };
    }
    this.syncPlayer(snapshot, look);
    this.syncNpcs(snapshot);
    this.syncTrees(snapshot);

    this.syncCollection(snapshot.vehicles, this.vehicleMeshes, (v) => {
      const color = v.kind === "rover" ? 0x3d7a4a : 0xd4a017;
      this.vehicleBaseColors.set(v.id, color);
      return this.createVehicle(color);
    });
    for (const v of snapshot.vehicles) {
      const mesh = this.vehicleMeshes.get(v.id);
      if (!mesh) continue;
      mesh.position.set(v.position.x, v.destroyed ? -0.15 : 0, v.position.z);
      mesh.rotation.y = v.yaw;
      if (v.destroyed) mesh.rotation.z = 0.18;
      mesh.visible = !(
        v.occupied && snapshot.player.camera_mode === "first_person"
      );
      this.syncVehicleBurn(v);
    }

    this.syncCollection(snapshot.projectiles, this.projectileMeshes, (p) =>
      createProjectileMesh(p.kind),
    );
    for (const p of snapshot.projectiles) {
      const mesh = this.projectileMeshes.get(p.id);
      if (!mesh) continue;
      mesh.position.set(p.position.x, p.position.y, p.position.z);
      if (p.kind === "rocket" && p.velocity) {
        const dir = new THREE.Vector3(
          p.velocity.x,
          p.velocity.y,
          p.velocity.z,
        ).normalize();
        mesh.lookAt(mesh.position.clone().add(dir));
        const trail = mesh.getObjectByName("rocket-trail") as THREE.Mesh | undefined;
        const exhaust = mesh.getObjectByName("rocket-exhaust") as THREE.Mesh | undefined;
        if (trail) {
          const pulse = 0.7 + Math.sin(this.animTime * 40) * 0.3;
          trail.scale.set(pulse, pulse, 1);
          (trail.material as THREE.MeshBasicMaterial).opacity = 0.35 + pulse * 0.35;
        }
        if (exhaust) {
          exhaust.scale.setScalar(0.8 + Math.sin(this.animTime * 50) * 0.35);
        }
      }
    }

    this.applyExplosionDestruction(snapshot);
    this.syncExplosions();
    this.updateMuzzle(snapshot, look);
    this.updateCamera(snapshot, look);
    this.renderer.render(this.scene, this.camera);
  }

  private syncPlayer(
    snapshot: GameSnapshot,
    look?: { yaw: number; pitch: number; aim: boolean },
  ) {
    const p = snapshot.player;
    const parts = this.player.parts;

    const dx = p.position.x - this.player.prev.x;
    const dy = p.position.y - this.player.prev.y;
    const dz = p.position.z - this.player.prev.z;
    const climbing = p.climbing_tree != null;
    const moving =
      p.in_vehicle == null &&
      (climbing
        ? Math.hypot(dx, dy, dz) > 0.001
        : Math.hypot(dx, dz) > 0.001);
    this.player.prev = {
      x: p.position.x,
      y: p.position.y,
      z: p.position.z,
    };

    const aiming = look?.aim ?? false;
    const recoil = this.fx?.recoil ?? 0;
    const fireKick = this.fx?.fireKick ?? 0;
    this.syncEquippedWeapon(p.weapon.id);
    animateCombat(
      parts,
      this.animTime,
      moving || climbing,
      p.pitch,
      aiming || (this.fx?.firing ?? false),
      recoil + fireKick * 0.35,
      false,
      p.weapon.id,
      climbing,
    );

    // Apply world position AFTER animation so climb height is not wiped
    const poseOffsetY = 0; // crawl offset if needed later
    parts.root.position.set(
      p.position.x,
      p.position.y + poseOffsetY,
      p.position.z,
    );
    parts.root.rotation.y = p.yaw;

    const showBody =
      !aiming &&
      p.camera_mode === "third_person" &&
      p.in_vehicle == null;
    parts.root.visible = showBody;

    // Deep in canopy: fade body so leaves conceal the climber
    if (climbing && showBody) {
      const tree = snapshot.trees.find((t) => t.id === p.climbing_tree);
      if (tree) {
        const canopyStart = tree.height * 0.48;
        const hideT = Math.min(
          1,
          Math.max(0, (p.position.y - canopyStart) / (tree.height * 0.35)),
        );
        for (const mat of this.player.materials) {
          mat.transparent = hideT > 0.05;
          mat.opacity = 1 - hideT * 0.82;
          mat.depthWrite = hideT < 0.55;
        }
      }
    } else {
      for (const mat of this.player.materials) {
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      }
    }

    // Hide arms/gun viewmodel while looking through the scope
    this.fpViewmodel.visible =
      !aiming &&
      p.camera_mode === "first_person" &&
      p.in_vehicle == null;
    if (this.fpViewmodel.visible) {
      const bob = moving && !aiming ? Math.sin(this.animTime * 10) * 0.012 : 0;
      const kick = recoil * 0.06;
      this.fpViewmodel.position.set(0, bob + kick * 0.25, kick * 0.8);
      this.fpViewmodel.rotation.set(-recoil * 0.14, 0, recoil * 0.03);
    }

    this.shieldMesh.visible = p.shield_active;
    this.shieldMesh.position.set(p.position.x, p.position.y + 1.1, p.position.z);
  }

  private syncTrees(snapshot: GameSnapshot) {
    const seen = new Set<number>();
    for (const tree of snapshot.trees) {
      seen.add(tree.id);
      let mesh = this.treeMeshes.get(tree.id) as THREE.Group | undefined;
      if (!mesh) {
        mesh = createDetailedTree(tree.id, tree.height, tree.trunk_radius);
        mesh.position.set(tree.position.x, 0, tree.position.z);
        this.treeMeshes.set(tree.id, mesh);
        this.trees.push({ root: mesh, burned: false, id: tree.id });
        this.scene.add(mesh);
      }
      const tracked = this.trees.find((t) => t.id === tree.id);
      if (tracked && tree.burned && !tracked.burned) {
        tracked.burned = true;
        burnTreeVisual(tracked.root);
      }
    }
    for (const [id, mesh] of this.treeMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.treeMeshes.delete(id);
        this.trees = this.trees.filter((t) => t.id !== id);
      }
    }
  }

  private syncNpcs(snapshot: GameSnapshot) {
    const alive = snapshot.npcs.filter((n) => n.health > 0);
    const seen = new Set<number>();

    for (const npc of alive) {
      seen.add(npc.id);
      let tracked = this.npcParts.get(npc.id);
      if (!tracked) {
        const kind: CharacterKind =
          npc.kind === "civilian" ? "civilian" : "guard";
        const parts = createCharacter(kind);
        const rifle = createWeaponModel("pulse_rifle");
        rifle.scale.setScalar(0.9);
        parts.gunMount.add(rifle);
        tracked = {
          parts,
          prev: { x: npc.position.x, y: 0, z: npc.position.z },
          materials: collectMaterials(parts.root),
        };
        this.npcParts.set(npc.id, tracked);
        this.npcMeshes.set(npc.id, parts.root);
        this.scene.add(parts.root);
      }

      const dx = npc.position.x - tracked.prev.x;
      const dz = npc.position.z - tracked.prev.z;
      const moving = Math.hypot(dx, dz) > 0.0005;
      tracked.prev = { x: npc.position.x, y: 0, z: npc.position.z };

      tracked.parts.root.position.set(npc.position.x, 0, npc.position.z);
      tracked.parts.root.rotation.y = npc.yaw;
      tracked.parts.root.visible = true;
      animateCombat(
        tracked.parts,
        this.animTime + npc.id * 0.3,
        moving,
        0,
        false,
        0,
        npc.crawling,
      );

      const flash = this.fx?.hitFlash.get(npc.id) ?? 0;
      for (const mat of tracked.materials) {
        mat.emissive.setHex(flash > 0 ? 0xff2200 : 0x000000);
        mat.emissiveIntensity = flash > 0 ? 0.85 : 0;
      }
      if (flash > 0) {
        tracked.parts.root.rotation.z = Math.sin(flash * 40) * 0.12;
      } else {
        tracked.parts.root.rotation.z = 0;
      }
    }

    for (const [id, tracked] of this.npcParts) {
      if (!seen.has(id)) {
        this.scene.remove(tracked.parts.root);
        this.npcParts.delete(id);
        this.npcMeshes.delete(id);
      }
    }
  }

  private updateMuzzle(
    snapshot: GameSnapshot,
    look?: { yaw: number; pitch: number; aim: boolean },
  ) {
    const flash = this.fx?.muzzleFlash ?? 0;
    const p = snapshot.player;
    const yaw = look?.yaw ?? p.yaw;
    const pitch = look?.pitch ?? p.pitch;
    const dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const pos = new THREE.Vector3(
      p.position.x,
      p.position.y + 1.45,
      p.position.z,
    ).add(dir.multiplyScalar(1.15));

    this.muzzleFlash.position.copy(pos);
    this.muzzleFlash.intensity = flash * 6;
    this.muzzleSprite.position.copy(pos);
    const mat = this.muzzleSprite.material as THREE.MeshBasicMaterial;
    mat.opacity = flash * 0.95;
    this.muzzleSprite.scale.setScalar(0.6 + flash * 1.4);
  }

  private updateCamera(
    snapshot: GameSnapshot,
    look?: { yaw: number; pitch: number; aim: boolean },
  ) {
    const p = snapshot.player;
    const yaw = look?.yaw ?? p.yaw;
    const pitch = (look?.pitch ?? p.pitch) + (this.fx?.recoilPitch ?? 0) * (look?.aim ? 0.35 : 1);
    const aiming = look?.aim ?? false;

    const eyeHeight = p.position.y + 1.62;
    const pivot = new THREE.Vector3(p.position.x, eyeHeight, p.position.z);
    const lookDir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const forwardFlat = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const rightFlat = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    if (aiming) {
      // Scope view: eye-level optic, strong zoom for clear target ID
      const scopeEye = pivot
        .clone()
        .add(lookDir.clone().multiplyScalar(0.12))
        .add(rightFlat.clone().multiplyScalar(0.04));
      this.camera.fov = 18;
      this.camera.near = 0.05;
      this.camera.far = 600;
      this.camera.position.copy(scopeEye);
      this.camera.lookAt(scopeEye.clone().add(lookDir.clone().multiplyScalar(80)));
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = 120;
        this.scene.fog.far = 420;
      }
    } else if (p.camera_mode === "first_person") {
      this.camera.fov = 72;
      this.camera.near = 0.1;
      this.camera.far = 500;
      this.camera.position.copy(pivot);
      this.camera.lookAt(pivot.clone().add(lookDir));
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = 80;
        this.scene.fog.far = 220;
      }
    } else {
      const dist = 4.2;
      const shoulder = 0.75;
      const height = 0.85;
      const camPos = pivot
        .clone()
        .add(forwardFlat.clone().multiplyScalar(-dist))
        .add(rightFlat.clone().multiplyScalar(shoulder))
        .add(new THREE.Vector3(0, height, 0));

      this.camera.fov = 65;
      this.camera.near = 0.1;
      this.camera.far = 500;
      this.camera.position.copy(camPos);
      const focus = pivot.clone().add(lookDir.clone().multiplyScalar(10));
      this.camera.lookAt(focus);
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = 80;
        this.scene.fog.far = 220;
      }
    }
    this.camera.updateProjectionMatrix();
  }

  private syncCollection<T extends { id: number }>(
    items: T[],
    map: MeshMap,
    factory: (item: T) => THREE.Object3D,
  ) {
    const seen = new Set<number>();
    for (const item of items) {
      seen.add(item.id);
      if (!map.has(item.id)) {
        const mesh = factory(item);
        map.set(item.id, mesh);
        this.scene.add(mesh);
      }
    }
    for (const [id, mesh] of map) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        map.delete(id);
      }
    }
  }

  private buildTerrain() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260, 64, 64),
      new THREE.MeshStandardMaterial({
        color: 0x5d8f4a,
        roughness: 0.95,
        metalness: 0.05,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const h =
        Math.sin(x * 0.05) * Math.cos(y * 0.05) * 0.35 +
        Math.sin(x * 0.12 + y * 0.08) * 0.15;
      pos.setZ(i, h);
    }
    ground.geometry.computeVertexNormals();
    this.groundMesh = ground;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(240, 48, 0x3f6b35, 0x4a7a3d);
    grid.position.y = 0.02;
    this.scene.add(grid);
  }

  private applyExplosionDestruction(snapshot: GameSnapshot) {
    const fx = this.fx;
    if (!fx) return;
    for (const e of fx.explosions) {
      if (this.seenExplosionIds.has(e.id)) continue;
      this.seenExplosionIds.add(e.id);
      this.spawnCrater(e.x, e.z, e.radius);
      this.scarGround(e.x, e.z, e.radius);
      // Tree burn is authoritative from snapshot; ensure visuals catch up
      for (const tree of snapshot.trees) {
        if (!tree.burned) continue;
        const tracked = this.trees.find((t) => t.id === tree.id);
        if (tracked && !tracked.burned) {
          tracked.burned = true;
          burnTreeVisual(tracked.root);
        }
      }
    }
  }

  private spawnCrater(x: number, z: number, radius: number) {
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(Math.min(4.2, radius * 0.55), 20),
      new THREE.MeshStandardMaterial({
        color: 0x2a1a10,
        roughness: 1,
        metalness: 0,
      }),
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, 0.04, z);
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(
        Math.min(4.2, radius * 0.55) * 0.85,
        Math.min(5.2, radius * 0.75),
        24,
      ),
      new THREE.MeshStandardMaterial({
        color: 0x4a3420,
        roughness: 1,
        metalness: 0,
      }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(x, 0.05, z);
    const ash = new THREE.Mesh(
      new THREE.CircleGeometry(Math.min(3.2, radius * 0.4), 16),
      new THREE.MeshStandardMaterial({
        color: 0x1a120c,
        roughness: 1,
        emissive: 0x331100,
        emissiveIntensity: 0.15,
      }),
    );
    ash.rotation.x = -Math.PI / 2;
    ash.position.set(x, 0.055, z);
    this.craterGroup.add(hole, rim, ash);
  }

  private scarGround(x: number, z: number, radius: number) {
    if (!this.groundMesh) return;
    const pos = this.groundMesh.geometry.attributes.position;
    const r = radius * 0.7;
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i);
      const gz = pos.getY(i); // plane local Y is world Z before rotation
      const dx = gx - x;
      const dz = gz - z;
      const d = Math.hypot(dx, dz);
      if (d > r) continue;
      const falloff = 1 - d / r;
      const dip = falloff * falloff * Math.min(1.4, radius * 0.18);
      pos.setZ(i, pos.getZ(i) - dip);
    }
    pos.needsUpdate = true;
    this.groundMesh.geometry.computeVertexNormals();
  }

  private syncVehicleBurn(v: GameSnapshot["vehicles"][number]) {
    const mesh = this.vehicleMeshes.get(v.id);
    if (!mesh) return;

    if (v.burning || v.destroyed) {
      mesh.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (!mat?.color) return;
        mat.color.setHex(v.destroyed ? 0x1a1a1a : 0x3a2a1a);
        mat.emissive = new THREE.Color(0xff4400);
        mat.emissiveIntensity = v.destroyed ? 0.55 : 0.35;
      });

      let fx = this.vehicleBurn.get(v.id);
      if (!fx) {
        const light = new THREE.PointLight(0xff6622, 2.2, 10);
        light.position.set(0, 1.1, 0);
        mesh.add(light);
        const smoke = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 10, 10),
          new THREE.MeshBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
          }),
        );
        smoke.position.set(0, 1.6, 0);
        mesh.add(smoke);
        fx = { light, smoke };
        this.vehicleBurn.set(v.id, fx);
      }
      fx.light.intensity = 1.6 + Math.sin(this.animTime * 9) * 0.6;
      fx.smoke.position.y = 1.5 + Math.sin(this.animTime * 3 + v.id) * 0.25;
      fx.smoke.scale.setScalar(0.8 + Math.sin(this.animTime * 4) * 0.25);
    }
  }

  private syncEquippedWeapon(id: WeaponId) {
    if (id === this.equippedWeapon) return;
    this.equippedWeapon = id;
    const mount = this.player.parts.gunMount;
    while (mount.children.length) mount.remove(mount.children[0]);
    const model = createWeaponModel(id);
    model.scale.setScalar(
      id === "grenade" ? 1.1 : id === "desert_eagle" ? 1.05 : id === "rocket_launcher" ? 1.05 : 0.95,
    );
    mount.add(model);

    this.camera.remove(this.fpViewmodel);
    this.fpViewmodel = createFpViewmodel(id);
    this.fpViewmodel.visible = false;
    this.camera.add(this.fpViewmodel);
  }

  private syncExplosions() {
    const fx = this.fx;
    const seen = new Set<number>();
    if (fx) {
      for (const e of fx.explosions) {
        seen.add(e.id);
        let group = this.explosionMeshes.get(e.id);
        if (!group) {
          group = new THREE.Group();
          const core = new THREE.Mesh(
            new THREE.SphereGeometry(1, 18, 14),
            new THREE.MeshBasicMaterial({
              color: 0xffee88,
              transparent: true,
              opacity: 0.95,
              depthWrite: false,
            }),
          );
          const shock = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 12),
            new THREE.MeshBasicMaterial({
              color: 0xff6622,
              transparent: true,
              opacity: 0.55,
              depthWrite: false,
              wireframe: false,
            }),
          );
          const smoke = new THREE.Mesh(
            new THREE.SphereGeometry(1, 12, 10),
            new THREE.MeshBasicMaterial({
              color: 0x444444,
              transparent: true,
              opacity: 0.4,
              depthWrite: false,
            }),
          );
          group.add(core, shock, smoke);
          this.explosionMeshes.set(e.id, group);
          this.scene.add(group);

          const light = new THREE.PointLight(0xffaa44, 8, e.radius * 3);
          light.position.set(e.x, e.y + 1, e.z);
          this.explosionLights.set(e.id, light);
          this.scene.add(light);
        }
        const t = 1 - e.life / e.maxLife;
        group.position.set(e.x, e.y + 0.35, e.z);
        const core = group.children[0] as THREE.Mesh;
        const shock = group.children[1] as THREE.Mesh;
        const smoke = group.children[2] as THREE.Mesh;
        core.scale.setScalar(e.radius * (0.25 + t * 0.9));
        shock.scale.setScalar(e.radius * (0.45 + t * 1.6));
        smoke.scale.setScalar(e.radius * (0.3 + t * 1.9));
        (core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - t * 1.2));
        (shock.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.65 * (1 - t));
        (smoke.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.45 * (1 - t * 0.7));
        const light = this.explosionLights.get(e.id);
        if (light) light.intensity = Math.max(0, 10 * (1 - t));
      }
    }
    for (const [id, mesh] of this.explosionMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.explosionMeshes.delete(id);
        const light = this.explosionLights.get(id);
        if (light) {
          this.scene.remove(light);
          this.explosionLights.delete(id);
        }
      }
    }
  }

  private createVehicle(color: number) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.7, 3.4),
      new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.45 }),
    );
    body.position.y = 0.65;
    body.castShadow = true;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.55, 1.4),
      new THREE.MeshStandardMaterial({
        color: 0x1b2430,
        transparent: true,
        opacity: 0.75,
      }),
    );
    cabin.position.set(0, 1.2, -0.2);
    g.add(body, cabin);
    for (const [x, z] of [
      [-0.9, 1.1],
      [0.9, 1.1],
      [-0.9, -1.1],
      [0.9, -1.1],
    ] as const) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10),
        new THREE.MeshStandardMaterial({ color: 0x222222 }),
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.35, z);
      g.add(wheel);
    }
    return g;
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}

function collectMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const mats: THREE.MeshStandardMaterial[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) {
        if (m instanceof THREE.MeshStandardMaterial) mats.push(m);
      }
    } else if (mat instanceof THREE.MeshStandardMaterial) {
      mats.push(mat);
    }
  });
  return mats;
}

export type { Vec3 };
