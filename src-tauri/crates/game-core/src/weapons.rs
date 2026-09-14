use serde::{Deserialize, Serialize};

use super::entities::WeaponInfo;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WeaponId {
    PulseRifle,
    DesertEagle,
    RocketLauncher,
    Grenade,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProjectileKind {
    Bullet,
    Rocket,
    Grenade,
}

impl WeaponId {
    pub fn all() -> [WeaponId; 4] {
        [
            WeaponId::PulseRifle,
            WeaponId::DesertEagle,
            WeaponId::RocketLauncher,
            WeaponId::Grenade,
        ]
    }

    pub fn from_slot(slot: u8) -> Option<WeaponId> {
        match slot {
            0 => Some(WeaponId::PulseRifle),
            1 => Some(WeaponId::DesertEagle),
            2 => Some(WeaponId::RocketLauncher),
            3 => Some(WeaponId::Grenade),
            _ => None,
        }
    }

    pub fn slot(self) -> u8 {
        match self {
            WeaponId::PulseRifle => 0,
            WeaponId::DesertEagle => 1,
            WeaponId::RocketLauncher => 2,
            WeaponId::Grenade => 3,
        }
    }

    pub fn info(self) -> WeaponInfo {
        match self {
            WeaponId::PulseRifle => WeaponInfo {
                id: self,
                name: "Pulse Rifle".into(),
                damage: 18.0,
                fire_cooldown: 0.16,
                projectile_speed: 70.0,
                kind: ProjectileKind::Bullet,
                explosion_radius: 0.0,
                gravity: 0.0,
                fuse: 0.0,
            },
            WeaponId::DesertEagle => WeaponInfo {
                id: self,
                name: "Desert Eagle".into(),
                damage: 55.0,
                fire_cooldown: 0.42,
                projectile_speed: 85.0,
                kind: ProjectileKind::Bullet,
                explosion_radius: 0.0,
                gravity: 0.0,
                fuse: 0.0,
            },
            WeaponId::RocketLauncher => WeaponInfo {
                id: self,
                name: "Rocket Launcher".into(),
                damage: 110.0,
                fire_cooldown: 1.45,
                projectile_speed: 32.0,
                kind: ProjectileKind::Rocket,
                explosion_radius: 7.5,
                gravity: 1.2,
                fuse: 0.0,
            },
            WeaponId::Grenade => WeaponInfo {
                id: self,
                name: "Frag Grenade".into(),
                damage: 85.0,
                fire_cooldown: 1.1,
                projectile_speed: 16.0,
                kind: ProjectileKind::Grenade,
                explosion_radius: 6.0,
                gravity: 18.0,
                fuse: 2.2,
            },
        }
    }
}
