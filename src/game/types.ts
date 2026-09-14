export type Vec3 = { x: number; y: number; z: number };

export type CameraMode = "third_person" | "first_person";

export type WeaponId =
  | "pulse_rifle"
  | "desert_eagle"
  | "rocket_launcher"
  | "grenade";

export type ProjectileKind = "bullet" | "rocket" | "grenade";

export type WeaponInfo = {
  id: WeaponId;
  name: string;
  damage: number;
  fire_cooldown: number;
  projectile_speed: number;
  kind: ProjectileKind;
  explosion_radius: number;
  gravity: number;
  fuse: number;
};

export type PlayerState = {
  id: number;
  position: Vec3;
  yaw: number;
  pitch: number;
  health: number;
  max_health: number;
  shield: number;
  max_shield: number;
  shield_active: boolean;
  in_vehicle: number | null;
  climbing_tree: number | null;
  weapon: WeaponInfo;
  weapon_slot: number;
  camera_mode: CameraMode;
};

export type NpcState = {
  id: number;
  position: Vec3;
  yaw: number;
  health: number;
  max_health: number;
  shield: number;
  max_shield: number;
  kind: string;
  crawling: boolean;
  crawl_time_left: number;
};

export type VehicleState = {
  id: number;
  position: Vec3;
  yaw: number;
  occupied: boolean;
  speed: number;
  kind: string;
  health: number;
  max_health: number;
  burning: boolean;
  destroyed: boolean;
};

export type TreeState = {
  id: number;
  position: Vec3;
  height: number;
  trunk_radius: number;
  burned: boolean;
  climbable: boolean;
};

export type ProjectileState = {
  id: number;
  position: Vec3;
  velocity: Vec3;
  owner_id: number;
  damage: number;
  life: number;
  kind: ProjectileKind;
  explosion_radius: number;
  gravity: number;
  fuse: number;
  age: number;
};

export type CombatEventKind = "shot" | "hit" | "kill" | "explosion";

export type HitZone = "head" | "body" | "leg";

export type CombatEvent = {
  kind: CombatEventKind;
  target_id: number | null;
  damage: number;
  position: Vec3;
  zone: HitZone | null;
};

export type GameSnapshot = {
  tick: number;
  world_size: number;
  player: PlayerState;
  npcs: NpcState[];
  vehicles: VehicleState[];
  trees: TreeState[];
  projectiles: ProjectileState[];
  events: CombatEvent[];
};

export type PlayerInput = {
  forward: number;
  strafe: number;
  look_yaw: number;
  look_pitch: number;
  jump: boolean;
  fire: boolean;
  shield: boolean;
  aim: boolean;
  interact: boolean;
  toggle_camera: boolean;
  sprint: boolean;
  weapon_slot: number | null;
};

export const WEAPON_LOADOUT: WeaponInfo[] = [
  {
    id: "pulse_rifle",
    name: "Pulse Rifle",
    damage: 18,
    fire_cooldown: 0.16,
    projectile_speed: 70,
    kind: "bullet",
    explosion_radius: 0,
    gravity: 0,
    fuse: 0,
  },
  {
    id: "desert_eagle",
    name: "Desert Eagle",
    damage: 55,
    fire_cooldown: 0.42,
    projectile_speed: 85,
    kind: "bullet",
    explosion_radius: 0,
    gravity: 0,
    fuse: 0,
  },
  {
    id: "rocket_launcher",
    name: "Rocket Launcher",
    damage: 110,
    fire_cooldown: 1.45,
    projectile_speed: 32,
    kind: "rocket",
    explosion_radius: 7.5,
    gravity: 1.2,
    fuse: 0,
  },
  {
    id: "grenade",
    name: "Frag Grenade",
    damage: 85,
    fire_cooldown: 1.1,
    projectile_speed: 16,
    kind: "grenade",
    explosion_radius: 6,
    gravity: 18,
    fuse: 2.2,
  },
];

export function emptyInput(): PlayerInput {
  return {
    forward: 0,
    strafe: 0,
    look_yaw: 0,
    look_pitch: 0,
    jump: false,
    fire: false,
    shield: false,
    aim: false,
    interact: false,
    toggle_camera: false,
    sprint: false,
    weapon_slot: null,
  };
}
