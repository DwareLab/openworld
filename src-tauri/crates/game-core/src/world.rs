use serde::{Deserialize, Serialize};

use super::combat::{npc_try_fire, try_fire, update_and_hit_projectiles};
use super::entities::{
    CameraMode, CombatEvent, NpcInternal, NpcState, PlayerInternal, PlayerState, TreeInternal,
    TreeState, ProjectileInternal, VehicleInternal, VehicleState, Vec3,
};
use super::input::PlayerInput;
use super::weapons::WeaponId;

const WORLD_HALF: f32 = 120.0;
const PLAYER_SPEED: f32 = 6.5;
const SPRINT_MULT: f32 = 1.7;
const VEHICLE_ACCEL: f32 = 18.0;
const VEHICLE_MAX: f32 = 22.0;
const VEHICLE_TURN: f32 = 2.2;
const INTERACT_RANGE: f32 = 3.0;
const CLIMB_SPEED: f32 = 2.6;
const CLIMB_ORBIT: f32 = 1.9;
const CLIMB_MOUNT_RANGE: f32 = 1.4;
const TREE_COUNT: usize = 55;
const ACTIVE_SHOOTERS: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSnapshot {
    pub tick: u64,
    pub world_size: f32,
    pub player: PlayerState,
    pub npcs: Vec<NpcState>,
    pub vehicles: Vec<VehicleState>,
    pub trees: Vec<TreeState>,
    pub projectiles: Vec<super::entities::ProjectileState>,
    pub events: Vec<CombatEvent>,
}

pub struct GameWorld {
    pub tick: u64,
    player: PlayerInternal,
    npcs: Vec<NpcInternal>,
    vehicles: Vec<VehicleInternal>,
    trees: Vec<TreeInternal>,
    projectiles: Vec<ProjectileInternal>,
    next_id: u32,
    events: Vec<CombatEvent>,
}

impl GameWorld {
    pub fn new() -> Self {
        let mut next_id = 1u32;
        let player_id = next_id;
        next_id += 1;

        let mut world = Self {
            tick: 0,
            player: PlayerInternal {
                state: PlayerState {
                    id: player_id,
                    position: Vec3::new(0.0, 0.0, 0.0),
                    yaw: 0.0,
                    pitch: 0.0,
                    health: 100.0,
                    max_health: 100.0,
                    shield: 80.0,
                    max_shield: 80.0,
                    shield_active: false,
                    in_vehicle: None,
                    climbing_tree: None,
                    weapon: WeaponId::PulseRifle.info(),
                    weapon_slot: 0,
                    camera_mode: CameraMode::ThirdPerson,
                },
                fire_timer: 0.0,
                interact_latched: false,
                camera_latched: false,
                jump_latched: false,
            },
            npcs: Vec::new(),
            vehicles: Vec::new(),
            trees: Vec::new(),
            projectiles: Vec::new(),
            next_id,
            events: Vec::new(),
        };

        world.spawn_npcs(ACTIVE_SHOOTERS);
        world.spawn_vehicles(6);
        world.spawn_trees(TREE_COUNT);
        world
    }

    fn spawn_npcs(&mut self, count: usize) {
        for i in 0..count {
            self.spawn_one_shooter(i as u32);
        }
    }

    fn spawn_one_shooter(&mut self, salt: u32) {
        let id = self.next_id;
        self.next_id += 1;
        let player = self.player.state.position;
        // Ring around the player so new shooters always enter the fight
        let angle = (id as f32 + salt as f32) * 2.399_963;
        let radius = 28.0 + ((id.wrapping_mul(17) + salt * 13) % 40) as f32;
        let x = (player.x + angle.cos() * radius).clamp(-WORLD_HALF + 2.0, WORLD_HALF - 2.0);
        let z = (player.z + angle.sin() * radius).clamp(-WORLD_HALF + 2.0, WORLD_HALF - 2.0);
        self.npcs.push(NpcInternal {
            state: NpcState {
                id,
                position: Vec3::new(x, 0.0, z),
                yaw: angle + std::f32::consts::PI,
                health: 70.0,
                max_health: 70.0,
                shield: if id % 3 == 0 { 35.0 } else { 0.0 },
                max_shield: if id % 3 == 0 { 35.0 } else { 0.0 },
                kind: "shooter".into(),
                crawling: false,
                crawl_time_left: 0.0,
            },
            wander_timer: 0.0,
            wander_yaw: angle + std::f32::consts::PI,
            speed: 2.0 + (id % 4) as f32 * 0.35,
            crawl_timer: 0.0,
            fire_timer: (id % 5) as f32 * 0.12,
            aggro_player: true,
            target_npc: None,
        });
    }

    /// Keep exactly ACTIVE_SHOOTERS living armed NPCs in the world.
    fn maintain_shooters(&mut self) {
        self.npcs.retain(|n| n.state.health > 0.0);
        let alive = self.npcs.len();
        if alive >= ACTIVE_SHOOTERS {
            return;
        }
        let need = ACTIVE_SHOOTERS - alive;
        for i in 0..need {
            self.spawn_one_shooter(i as u32 + self.tick as u32);
        }
    }

    fn spawn_vehicles(&mut self, count: usize) {
        for i in 0..count {
            let angle = i as f32 * 1.1 + 0.4;
            let radius = 8.0 + i as f32 * 7.0;
            let id = self.next_id;
            self.next_id += 1;
            self.vehicles.push(VehicleInternal {
                state: VehicleState {
                    id,
                    position: Vec3::new(angle.cos() * radius, 0.0, angle.sin() * radius),
                    yaw: angle + 1.2,
                    occupied: false,
                    speed: 0.0,
                    kind: if i % 2 == 0 {
                        "rover".into()
                    } else {
                        "buggy".into()
                    },
                    health: 120.0,
                    max_health: 120.0,
                    burning: false,
                    destroyed: false,
                },
            });
        }
    }

    fn spawn_trees(&mut self, count: usize) {
        for i in 0..count {
            let angle = i as f32 * 2.399_963;
            let radius = 16.0 + ((i * 19) % 98) as f32;
            let id = self.next_id;
            self.next_id += 1;
            let height = 12.0 + ((i * 5) % 10) as f32 * 0.9;
            let trunk_radius = 0.32 + ((i % 5) as f32) * 0.05;
            self.trees.push(TreeInternal {
                state: TreeState {
                    id,
                    position: Vec3::new(angle.cos() * radius, 0.0, angle.sin() * radius),
                    height,
                    trunk_radius,
                    burned: false,
                    climbable: true,
                },
            });
        }
    }

    pub fn snapshot(&self) -> GameSnapshot {
        GameSnapshot {
            tick: self.tick,
            world_size: WORLD_HALF * 2.0,
            player: self.player.state.clone(),
            npcs: self.npcs.iter().map(|n| n.state.clone()).collect(),
            vehicles: self.vehicles.iter().map(|v| v.state.clone()).collect(),
            trees: self.trees.iter().map(|t| t.state.clone()).collect(),
            projectiles: self.projectiles.iter().map(|p| p.state.clone()).collect(),
            events: self.events.clone(),
        }
    }

    pub fn tick(&mut self, input: PlayerInput, dt: f32) {
        let dt = dt.clamp(0.0, 0.05);
        self.tick = self.tick.wrapping_add(1);
        self.events.clear();

        self.player.fire_timer = (self.player.fire_timer - dt).max(0.0);

        if input.toggle_camera {
            if !self.player.camera_latched {
                self.player.state.camera_mode = match self.player.state.camera_mode {
                    CameraMode::ThirdPerson => CameraMode::FirstPerson,
                    CameraMode::FirstPerson => CameraMode::ThirdPerson,
                };
                self.player.camera_latched = true;
            }
        } else {
            self.player.camera_latched = false;
        }

        if let Some(slot) = input.weapon_slot {
            if let Some(id) = WeaponId::from_slot(slot) {
                if self.player.state.weapon_slot != slot {
                    self.player.state.weapon_slot = slot;
                    self.player.state.weapon = id.info();
                    self.player.fire_timer = 0.15;
                }
            }
        }

        self.player.state.yaw = input.look_yaw;
        self.player.state.pitch = input.look_pitch.clamp(-1.35, 1.35);

        self.player.state.shield_active =
            input.shield && self.player.state.shield > 0.0 && self.player.state.in_vehicle.is_none();

        if self.player.state.shield_active {
            self.player.state.shield =
                (self.player.state.shield - 8.0 * dt).max(0.0);
        } else if self.player.state.shield < self.player.state.max_shield {
            self.player.state.shield =
                (self.player.state.shield + 6.0 * dt).min(self.player.state.max_shield);
        }

        self.handle_interact(&input);
        self.update_player_or_vehicle(&input, dt);

        if input.fire {
            if let Some(ev) =
                try_fire(&mut self.player, &mut self.next_id, &mut self.projectiles)
            {
                self.events.push(ev);
            }
        }

        self.update_npcs(dt);
        let hits = update_and_hit_projectiles(
            &mut self.projectiles,
            &mut self.npcs,
            &mut self.vehicles,
            &mut self.trees,
            &mut self.player,
            dt,
            WORLD_HALF,
        );
        self.events.extend(hits);
        self.maintain_shooters();
        self.clamp_to_world();
    }

    fn handle_interact(&mut self, input: &PlayerInput) {
        if !input.interact {
            self.player.interact_latched = false;
            return;
        }
        if self.player.interact_latched {
            return;
        }
        self.player.interact_latched = true;

        if let Some(vid) = self.player.state.in_vehicle {
            if let Some(v) = self.vehicles.iter_mut().find(|v| v.state.id == vid) {
                v.state.occupied = false;
                v.state.speed = 0.0;
                let exit = Vec3::new(
                    v.state.position.x + v.state.yaw.cos() * 2.2,
                    0.0,
                    v.state.position.z + v.state.yaw.sin() * 2.2,
                );
                self.player.state.position = exit;
            }
            self.player.state.in_vehicle = None;
            return;
        }

        if self.player.state.climbing_tree.is_some() {
            self.player.state.climbing_tree = None;
            self.player.state.position.y = 0.0;
            return;
        }

        let pos = self.player.state.position;
        if let Some(v) = self
            .vehicles
            .iter_mut()
            .filter(|v| !v.state.occupied && !v.state.destroyed)
            .min_by(|a, b| {
                a.state
                    .position
                    .distance_xz(&pos)
                    .partial_cmp(&b.state.position.distance_xz(&pos))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
        {
            if v.state.position.distance_xz(&pos) <= INTERACT_RANGE {
                v.state.occupied = true;
                self.player.state.in_vehicle = Some(v.state.id);
                self.player.state.position = v.state.position;
            }
        }
    }

    fn update_player_or_vehicle(&mut self, input: &PlayerInput, dt: f32) {
        if let Some(vid) = self.player.state.in_vehicle {
            self.player.state.climbing_tree = None;
            if let Some(v) = self.vehicles.iter_mut().find(|v| v.state.id == vid) {
                v.state.yaw += input.strafe * VEHICLE_TURN * dt;
                let target = if input.forward.abs() > 0.01 {
                    input.forward * VEHICLE_MAX
                } else {
                    0.0
                };
                let accel = VEHICLE_ACCEL * dt;
                if v.state.speed < target {
                    v.state.speed = (v.state.speed + accel).min(target);
                } else {
                    v.state.speed = (v.state.speed - accel * 1.4).max(target);
                }

                let dx = v.state.yaw.sin() * v.state.speed * dt;
                let dz = v.state.yaw.cos() * v.state.speed * dt;
                v.state.position.x =
                    (v.state.position.x + dx).clamp(-WORLD_HALF, WORLD_HALF);
                v.state.position.z =
                    (v.state.position.z + dz).clamp(-WORLD_HALF, WORLD_HALF);
                self.player.state.position = v.state.position;
            }
            return;
        }

        // Jump edge: mount / dismount trees
        let jump_pressed = input.jump && !self.player.jump_latched;
        if input.jump {
            self.player.jump_latched = true;
        } else {
            self.player.jump_latched = false;
        }

        if let Some(tid) = self.player.state.climbing_tree {
            let tree = self.trees.iter().find(|t| t.state.id == tid).map(|t| t.state.clone());
            let Some(tree) = tree else {
                self.player.state.climbing_tree = None;
                self.player.state.position.y = 0.0;
                return;
            };
            if tree.burned || !tree.climbable {
                self.player.state.climbing_tree = None;
                self.player.state.position.y = 0.0;
                return;
            }

            if jump_pressed {
                // Drop from tree
                self.player.state.climbing_tree = None;
                self.player.state.position.y = 0.0;
                // Push slightly away from trunk
                let dx = self.player.state.position.x - tree.position.x;
                let dz = self.player.state.position.z - tree.position.z;
                let len = (dx * dx + dz * dz).sqrt().max(0.001);
                self.player.state.position.x += (dx / len) * 0.6;
                self.player.state.position.z += (dz / len) * 0.6;
                return;
            }

            let mut max_y = (tree.height * 0.92).max(2.4);
            // Entering canopy: pull tighter into the leaf volume for cover
            let mut hug = tree.trunk_radius + 0.55;
            if self.player.state.position.y > tree.height * 0.45 {
                hug = tree.trunk_radius + 0.28;
                max_y = (tree.height * 0.95).max(2.4);
            }
            self.player.state.position.y = (self.player.state.position.y
                + input.forward * CLIMB_SPEED * dt)
                .clamp(0.0, max_y);

            if input.strafe.abs() > 0.01 {
                let dx = self.player.state.position.x - tree.position.x;
                let dz = self.player.state.position.z - tree.position.z;
                let mut ang = dx.atan2(dz);
                ang += input.strafe * CLIMB_ORBIT * dt;
                self.player.state.position.x = tree.position.x + ang.sin() * hug;
                self.player.state.position.z = tree.position.z + ang.cos() * hug;
            } else {
                let dx = self.player.state.position.x - tree.position.x;
                let dz = self.player.state.position.z - tree.position.z;
                let len = (dx * dx + dz * dz).sqrt().max(0.001);
                self.player.state.position.x = tree.position.x + (dx / len) * hug;
                self.player.state.position.z = tree.position.z + (dz / len) * hug;
            }

            if self.player.state.position.y <= 0.02 && input.forward < -0.2 {
                self.player.state.climbing_tree = None;
                self.player.state.position.y = 0.0;
            }
            return;
        }

        // Mount nearby climbable tree
        if jump_pressed {
            if let Some(tree) = self.nearest_climbable_tree() {
                let dx = self.player.state.position.x - tree.position.x;
                let dz = self.player.state.position.z - tree.position.z;
                let len = (dx * dx + dz * dz).sqrt().max(0.001);
                let dist = tree.trunk_radius + 0.55;
                self.player.state.climbing_tree = Some(tree.id);
                self.player.state.position.x = tree.position.x + (dx / len) * dist;
                self.player.state.position.z = tree.position.z + (dz / len) * dist;
                self.player.state.position.y = 0.35;
                return;
            }
        }

        let speed = PLAYER_SPEED * if input.sprint { SPRINT_MULT } else { 1.0 };
        let yaw = input.look_yaw;
        let forward = Vec3::new(yaw.sin(), 0.0, yaw.cos());
        let right = Vec3::new(yaw.cos(), 0.0, -yaw.sin());
        let mut move_dir = forward
            .scale(input.forward)
            .add(&right.scale(input.strafe));
        if move_dir.length() > 1e-4 {
            move_dir = move_dir.normalized().scale(speed * dt);
            self.player.state.position.x = (self.player.state.position.x + move_dir.x)
                .clamp(-WORLD_HALF, WORLD_HALF);
            self.player.state.position.z = (self.player.state.position.z + move_dir.z)
                .clamp(-WORLD_HALF, WORLD_HALF);
        }
        self.player.state.position.y = 0.0;
    }

    fn nearest_climbable_tree(&self) -> Option<TreeState> {
        let pos = self.player.state.position;
        self.trees
            .iter()
            .filter(|t| t.state.climbable && !t.state.burned)
            .filter(|t| {
                t.state.position.distance_xz(&pos)
                    <= t.state.trunk_radius + CLIMB_MOUNT_RANGE
            })
            .min_by(|a, b| {
                a.state
                    .position
                    .distance_xz(&pos)
                    .partial_cmp(&b.state.position.distance_xz(&pos))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|t| t.state.clone())
    }

    fn update_npcs(&mut self, dt: f32) {
        let player_pos = self.player.state.position;
        let player_alive = self.player.state.health > 0.0;
        let player_id = self.player.state.id;

        // Snapshot positions/kinds for targeting without borrow conflicts
        let roster: Vec<(u32, Vec3, String, f32, bool)> = self
            .npcs
            .iter()
            .map(|n| {
                (
                    n.state.id,
                    n.state.position,
                    n.state.kind.clone(),
                    n.state.health,
                    n.aggro_player,
                )
            })
            .collect();

        let mut fire_intents: Vec<(usize, Vec3)> = Vec::new();

        for (idx, npc) in self.npcs.iter_mut().enumerate() {
            if npc.state.health <= 0.0 {
                continue;
            }

            npc.fire_timer = (npc.fire_timer - dt).max(0.0);

            if npc.crawl_timer > 0.0 {
                npc.crawl_timer = (npc.crawl_timer - dt).max(0.0);
                npc.state.crawl_time_left = npc.crawl_timer;
                npc.state.crawling = npc.crawl_timer > 0.0;
            } else {
                npc.state.crawling = false;
                npc.state.crawl_time_left = 0.0;
            }

            // Acquire targets — every NPC is an armed shooter
            let engage_range = 48.0;
            let mut aim_at: Option<Vec3> = None;

            // Always hunt the player in range
            if player_alive && npc.state.position.distance_xz(&player_pos) <= engage_range {
                aim_at = Some(player_pos);
                npc.aggro_player = true;
            }

            // Free-for-all: shoot other active shooters too
            let mut best_npc: Option<(u32, Vec3, f32)> = None;
            for (oid, opos, _, ohealth, _) in &roster {
                if *oid == npc.state.id || *ohealth <= 0.0 {
                    continue;
                }
                let dist = npc.state.position.distance_xz(opos);
                if dist > 38.0 {
                    continue;
                }
                if best_npc.map(|(_, _, d)| dist < d).unwrap_or(true) {
                    best_npc = Some((*oid, *opos, dist));
                }
            }

            if let Some((tid, tpos, _)) = best_npc {
                npc.target_npc = Some(tid);
                // Prefer closer NPC over distant player unless player is very close
                let prefer_npc = match aim_at {
                    Some(p) => npc.state.position.distance_xz(&tpos)
                        + 4.0
                        < npc.state.position.distance_xz(&p),
                    None => true,
                };
                if prefer_npc {
                    aim_at = Some(tpos);
                }
            } else if npc.target_npc.is_some() {
                let still = roster.iter().any(|(id, pos, _, hp, _)| {
                    Some(*id) == npc.target_npc
                        && *hp > 0.0
                        && npc.state.position.distance_xz(pos) < 45.0
                });
                if !still {
                    npc.target_npc = None;
                }
            }

            if let Some(target) = aim_at {
                let dx = target.x - npc.state.position.x;
                let dz = target.z - npc.state.position.z;
                let dist = (dx * dx + dz * dz).sqrt();
                npc.state.yaw = dx.atan2(dz);
                npc.wander_yaw = npc.state.yaw;

                // Close distance if far; hold and shoot if in range
                let hold = if npc.state.crawling { 10.0 } else { 14.0 };
                let move_speed = if npc.state.crawling {
                    npc.speed * super::combat::CRAWL_SPEED_MULT
                } else {
                    npc.speed * 1.35
                };

                if dist > hold {
                    npc.state.position.x = (npc.state.position.x
                        + npc.state.yaw.sin() * move_speed * dt)
                        .clamp(-WORLD_HALF, WORLD_HALF);
                    npc.state.position.z = (npc.state.position.z
                        + npc.state.yaw.cos() * move_speed * dt)
                        .clamp(-WORLD_HALF, WORLD_HALF);
                }

                if dist < engage_range && dist > 2.5 {
                    fire_intents.push((idx, target));
                }
            } else {
                // Idle wander
                npc.wander_timer -= dt;
                if npc.wander_timer <= 0.0 {
                    npc.wander_timer = 1.5 + (npc.state.id % 5) as f32 * 0.4;
                    npc.wander_yaw += ((npc.state.id % 7) as f32 - 3.0) * 0.35;
                }
                npc.state.yaw = npc.wander_yaw;
                let move_speed = if npc.state.crawling {
                    npc.speed * super::combat::CRAWL_SPEED_MULT
                } else {
                    npc.speed
                };
                npc.state.position.x = (npc.state.position.x
                    + npc.wander_yaw.sin() * move_speed * dt)
                    .clamp(-WORLD_HALF, WORLD_HALF);
                npc.state.position.z = (npc.state.position.z
                    + npc.wander_yaw.cos() * move_speed * dt)
                    .clamp(-WORLD_HALF, WORLD_HALF);
            }

            if npc.state.shield < npc.state.max_shield {
                npc.state.shield =
                    (npc.state.shield + 2.0 * dt).min(npc.state.max_shield);
            }

            let _ = player_id; // reserved for future friendly-fire rules
        }

        for (idx, target) in fire_intents {
            if let Some(npc) = self.npcs.get_mut(idx) {
                if let Some(ev) =
                    npc_try_fire(npc, target, &mut self.next_id, &mut self.projectiles)
                {
                    self.events.push(ev);
                }
            }
        }
    }

    fn clamp_to_world(&mut self) {
        self.player.state.position.x = self.player.state.position.x.clamp(-WORLD_HALF, WORLD_HALF);
        self.player.state.position.z = self.player.state.position.z.clamp(-WORLD_HALF, WORLD_HALF);
    }
}

impl Default for GameWorld {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::PlayerInput;

    #[test]
    fn spawns_world_and_moves_player() {
        let mut world = GameWorld::new();
        let snap = world.snapshot();
        assert!(!snap.npcs.is_empty());
        assert!(!snap.vehicles.is_empty());
        assert_eq!(snap.player.camera_mode, CameraMode::ThirdPerson);

        let mut input = PlayerInput::default();
        input.forward = 1.0;
        input.look_yaw = 0.0;
        world.tick(input, 0.016);
        assert!(world.snapshot().player.position.z > 0.0);

        let mut toggle = PlayerInput::default();
        toggle.toggle_camera = true;
        world.tick(toggle, 0.016);
        assert_eq!(
            world.snapshot().player.camera_mode,
            CameraMode::FirstPerson
        );
    }

    #[test]
    fn shooting_emits_shot_and_can_damage_npc() {
        let mut world = GameWorld::new();
        // Place an NPC directly in front of the player
        {
            let npc = &mut world.npcs[0];
            npc.state.position = Vec3::new(0.0, 0.0, 8.0);
            npc.wander_timer = 999.0;
            npc.speed = 0.0;
            npc.state.shield = 0.0;
            npc.state.health = 60.0;
        }
        let npc_id = world.npcs[0].state.id;

        let mut input = PlayerInput::default();
        input.look_yaw = 0.0; // face +Z
        input.look_pitch = 0.0;
        input.fire = true;
        world.tick(input.clone(), 0.016);
        assert!(
            world
                .snapshot()
                .events
                .iter()
                .any(|e| matches!(e.kind, crate::entities::CombatEventKind::Shot)),
            "expected shot event"
        );

        input.fire = false;
        for _ in 0..20 {
            world.tick(input.clone(), 0.05);
            let snap = world.snapshot();
            if snap.events.iter().any(|e| {
                matches!(
                    e.kind,
                    crate::entities::CombatEventKind::Hit | crate::entities::CombatEventKind::Kill
                )
            }) {
                break;
            }
        }

        let snap = world.snapshot();
        let npc = snap.npcs.iter().find(|n| n.id == npc_id).unwrap();
        assert!(
            npc.health < 60.0,
            "expected npc health reduced, got {}",
            npc.health
        );
    }

    #[test]
    fn headshot_kills_instantly() {
        assert_eq!(
            crate::combat::classify_hit_zone(1.8, 0.0),
            crate::entities::HitZone::Head
        );
        let mut world = GameWorld::new();
        {
            let npc = &mut world.npcs[0];
            npc.state.position = Vec3::new(0.0, 0.0, 6.0);
            npc.wander_timer = 999.0;
            npc.speed = 0.0;
            npc.state.shield = 40.0;
            npc.state.health = 60.0;
        }
        let npc_id = world.npcs[0].state.id;

        // Fire a bullet straight into the head hit sphere
        world.projectiles.push(crate::entities::ProjectileInternal {
            state: crate::entities::ProjectileState {
                id: 999,
                position: Vec3::new(0.0, 1.78, 4.0),
                velocity: Vec3::new(0.0, 0.0, 40.0),
                owner_id: 1,
                damage: 18.0,
                life: 2.0,
                kind: crate::weapons::ProjectileKind::Bullet,
                explosion_radius: 0.0,
                gravity: 0.0,
                fuse: 0.0,
                age: 0.0,
            },
        });
        let input = PlayerInput::default();
        world.tick(input, 0.05);

        let snap = world.snapshot();
        assert!(
            snap.npcs.iter().find(|n| n.id == npc_id).is_none()
                || snap
                    .npcs
                    .iter()
                    .find(|n| n.id == npc_id)
                    .map(|n| n.health <= 0.0)
                    .unwrap_or(true),
            "headshot should kill npc {}",
            npc_id
        );
        assert!(
            snap.events.iter().any(|e| {
                e.target_id == Some(npc_id)
                    && e.zone == Some(crate::entities::HitZone::Head)
                    && matches!(e.kind, crate::entities::CombatEventKind::Kill)
            }),
            "expected head kill event"
        );
    }

    #[test]
    fn leg_shot_forces_crawl_for_30_seconds() {
        assert_eq!(
            crate::combat::classify_hit_zone(0.4, 0.0),
            crate::entities::HitZone::Leg
        );
        let mut world = GameWorld::new();
        {
            let npc = &mut world.npcs[0];
            npc.state.position = Vec3::new(0.0, 0.0, 6.0);
            npc.wander_timer = 999.0;
            npc.speed = 0.0;
            npc.state.shield = 0.0;
            npc.state.health = 60.0;
        }
        let npc_id = world.npcs[0].state.id;

        world.projectiles.push(crate::entities::ProjectileInternal {
            state: crate::entities::ProjectileState {
                id: 998,
                position: Vec3::new(0.0, 0.45, 4.0),
                velocity: Vec3::new(0.0, 0.0, 40.0),
                owner_id: 1,
                damage: 18.0,
                life: 2.0,
                kind: crate::weapons::ProjectileKind::Bullet,
                explosion_radius: 0.0,
                gravity: 0.0,
                fuse: 0.0,
                age: 0.0,
            },
        });
        let input = PlayerInput::default();
        world.tick(input, 0.05);

        let snap = world.snapshot();
        let npc = snap.npcs.iter().find(|n| n.id == npc_id).unwrap();
        assert!(npc.crawling, "leg shot should force crawl");
        assert!((npc.crawl_time_left - 30.0).abs() < 0.1);
        assert!(npc.health > 0.0, "leg shot alone should not kill full health");
        assert!(
            snap.events.iter().any(|e| e.zone == Some(crate::entities::HitZone::Leg)),
            "expected leg zone event"
        );
    }

    #[test]
    fn guards_engage_player_and_fire() {
        let mut world = GameWorld::new();
        {
            let npc = world
                .npcs
                .iter_mut()
                .find(|n| n.state.kind == "shooter" || n.state.kind == "guard")
                .expect("shooter");
            npc.state.position = Vec3::new(0.0, 0.0, 12.0);
            npc.wander_timer = 999.0;
            npc.speed = 0.0;
            npc.aggro_player = true;
            npc.fire_timer = 0.0;
        }
        let before = world.projectiles.len();
        let input = PlayerInput::default();
        world.tick(input, 0.05);
        assert!(
            world.projectiles.len() > before
                || world.events.iter().any(|e| {
                    matches!(e.kind, crate::entities::CombatEventKind::Shot)
                }),
            "guard should fire at nearby player"
        );
    }

    #[test]
    fn rocket_explodes_on_ground_impact() {
        let mut world = GameWorld::new();
        world.projectiles.push(crate::entities::ProjectileInternal {
            state: crate::entities::ProjectileState {
                id: 997,
                position: Vec3::new(5.0, 1.0, 5.0),
                velocity: Vec3::new(0.0, -30.0, 0.0),
                owner_id: 1,
                damage: 110.0,
                life: 4.0,
                kind: crate::weapons::ProjectileKind::Rocket,
                explosion_radius: 7.5,
                gravity: 1.2,
                fuse: 0.0,
                age: 0.0,
            },
        });
        let input = PlayerInput::default();
        for _ in 0..8 {
            world.tick(input.clone(), 0.05);
            if world.events.iter().any(|e| {
                matches!(e.kind, crate::entities::CombatEventKind::Explosion)
            }) {
                break;
            }
        }
        assert!(
            world.events.iter().any(|e| {
                matches!(e.kind, crate::entities::CombatEventKind::Explosion)
            }),
            "rocket should explode when hitting ground"
        );
    }

    #[test]
    fn maintains_twenty_alive_shooters() {
        let mut world = GameWorld::new();
        assert_eq!(
            world.npcs.iter().filter(|n| n.state.health > 0.0).count(),
            20
        );
        // Kill five
        for npc in world.npcs.iter_mut().take(5) {
            npc.state.health = 0.0;
        }
        let input = PlayerInput::default();
        world.tick(input, 0.016);
        assert_eq!(
            world.npcs.iter().filter(|n| n.state.health > 0.0).count(),
            20,
            "should respawn to keep 20 shooters"
        );
        assert!(world.npcs.iter().all(|n| n.state.kind == "shooter"));
    }
}
