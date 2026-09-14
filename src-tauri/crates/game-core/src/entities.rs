use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vec3 {
    pub const ZERO: Self = Self {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    pub fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }

    pub fn length(&self) -> f32 {
        (self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }

    pub fn normalized(&self) -> Self {
        let len = self.length();
        if len < 1e-6 {
            Self::ZERO
        } else {
            Self {
                x: self.x / len,
                y: self.y / len,
                z: self.z / len,
            }
        }
    }

    pub fn distance_xz(&self, other: &Self) -> f32 {
        let dx = self.x - other.x;
        let dz = self.z - other.z;
        (dx * dx + dz * dz).sqrt()
    }

    pub fn add(&self, other: &Self) -> Self {
        Self {
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }

    pub fn scale(&self, s: f32) -> Self {
        Self {
            x: self.x * s,
            y: self.y * s,
            z: self.z * s,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeaponInfo {
    pub id: super::weapons::WeaponId,
    pub name: String,
    pub damage: f32,
    pub fire_cooldown: f32,
    pub projectile_speed: f32,
    pub kind: super::weapons::ProjectileKind,
    pub explosion_radius: f32,
    pub gravity: f32,
    pub fuse: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerState {
    pub id: u32,
    pub position: Vec3,
    pub yaw: f32,
    pub pitch: f32,
    pub health: f32,
    pub max_health: f32,
    pub shield: f32,
    pub max_shield: f32,
    pub shield_active: bool,
    pub in_vehicle: Option<u32>,
    /// Tree the player is currently climbing, if any
    pub climbing_tree: Option<u32>,
    pub weapon: WeaponInfo,
    pub weapon_slot: u8,
    pub camera_mode: CameraMode,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CameraMode {
    ThirdPerson,
    FirstPerson,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcState {
    pub id: u32,
    pub position: Vec3,
    pub yaw: f32,
    pub health: f32,
    pub max_health: f32,
    pub shield: f32,
    pub max_shield: f32,
    pub kind: String,
    /// True while leg-shot crawl lasts
    pub crawling: bool,
    pub crawl_time_left: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VehicleState {
    pub id: u32,
    pub position: Vec3,
    pub yaw: f32,
    pub occupied: bool,
    pub speed: f32,
    pub kind: String,
    pub health: f32,
    pub max_health: f32,
    pub burning: bool,
    pub destroyed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectileState {
    pub id: u32,
    pub position: Vec3,
    pub velocity: Vec3,
    pub owner_id: u32,
    pub damage: f32,
    pub life: f32,
    pub kind: super::weapons::ProjectileKind,
    pub explosion_radius: f32,
    pub gravity: f32,
    pub fuse: f32,
    pub age: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CombatEventKind {
    Shot,
    Hit,
    Kill,
    Explosion,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HitZone {
    Head,
    Body,
    Leg,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatEvent {
    pub kind: CombatEventKind,
    pub target_id: Option<u32>,
    pub damage: f32,
    pub position: Vec3,
    pub zone: Option<HitZone>,
}

#[derive(Debug, Clone)]
pub struct PlayerInternal {
    pub state: PlayerState,
    pub fire_timer: f32,
    pub interact_latched: bool,
    pub camera_latched: bool,
    pub jump_latched: bool,
}

#[derive(Debug, Clone)]
pub struct NpcInternal {
    pub state: NpcState,
    pub wander_timer: f32,
    pub wander_yaw: f32,
    pub speed: f32,
    pub crawl_timer: f32,
    pub fire_timer: f32,
    /// Become hostile to the player after taking damage or spotting them (guards).
    pub aggro_player: bool,
    /// Current NPC target (faction fight).
    pub target_npc: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeState {
    pub id: u32,
    pub position: Vec3,
    /// Trunk base to canopy top
    pub height: f32,
    pub trunk_radius: f32,
    pub burned: bool,
    pub climbable: bool,
}

#[derive(Debug, Clone)]
pub struct TreeInternal {
    pub state: TreeState,
}

#[derive(Debug, Clone)]
pub struct VehicleInternal {
    pub state: VehicleState,
}

#[derive(Debug, Clone)]
pub struct ProjectileInternal {
    pub state: ProjectileState,
}
