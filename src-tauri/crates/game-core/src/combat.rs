use crate::entities::{
    CombatEvent, CombatEventKind, HitZone, NpcInternal, PlayerInternal, ProjectileInternal,
    TreeInternal, VehicleInternal, Vec3,
};
use crate::weapons::ProjectileKind;

pub const CRAWL_DURATION: f32 = 30.0;
pub const CRAWL_SPEED_MULT: f32 = 0.22;

pub fn apply_damage(
    health: &mut f32,
    shield: &mut f32,
    shield_active: bool,
    damage: f32,
) -> f32 {
    let mut remaining = damage;
    if shield_active && *shield > 0.0 {
        let absorbed = remaining.min(*shield);
        *shield -= absorbed;
        remaining -= absorbed;
    }
    if remaining > 0.0 {
        *health = (*health - remaining).max(0.0);
    }
    remaining
}

pub fn try_fire(
    player: &mut PlayerInternal,
    next_id: &mut u32,
    projectiles: &mut Vec<ProjectileInternal>,
) -> Option<CombatEvent> {
    if player.fire_timer > 0.0 || player.state.in_vehicle.is_some() {
        return None;
    }

    let yaw = player.state.yaw;
    let pitch = player.state.pitch;
    let dir = Vec3::new(
        yaw.sin() * pitch.cos(),
        pitch.sin(),
        yaw.cos() * pitch.cos(),
    )
    .normalized();

    let weapon = &player.state.weapon;
    let up_boost = match weapon.kind {
        ProjectileKind::Grenade => 0.35,
        _ => 0.0,
    };
    let throw_dir = Vec3::new(dir.x, dir.y + up_boost, dir.z).normalized();

    let muzzle = player
        .state
        .position
        .add(&Vec3::new(0.0, 1.45, 0.0))
        .add(&dir.scale(1.1));
    let speed = weapon.projectile_speed;
    let life = match weapon.kind {
        ProjectileKind::Grenade => weapon.fuse + 0.5,
        ProjectileKind::Rocket => 4.0,
        ProjectileKind::Bullet => 2.0,
    };

    projectiles.push(ProjectileInternal {
        state: crate::entities::ProjectileState {
            id: *next_id,
            position: muzzle,
            velocity: throw_dir.scale(speed),
            owner_id: player.state.id,
            damage: weapon.damage,
            life,
            kind: weapon.kind,
            explosion_radius: weapon.explosion_radius,
            gravity: weapon.gravity,
            fuse: weapon.fuse,
            age: 0.0,
        },
    });
    *next_id += 1;
    player.fire_timer = weapon.fire_cooldown;

    Some(CombatEvent {
        kind: CombatEventKind::Shot,
        target_id: None,
        damage: weapon.damage,
        position: muzzle,
        zone: None,
    })
}

pub fn npc_try_fire(
    npc: &mut NpcInternal,
    target_pos: Vec3,
    next_id: &mut u32,
    projectiles: &mut Vec<ProjectileInternal>,
) -> Option<CombatEvent> {
    if npc.fire_timer > 0.0 || npc.state.health <= 0.0 {
        return None;
    }

    let muzzle_y = if npc.state.crawling { 0.45 } else { 1.4 };
    let muzzle = Vec3::new(npc.state.position.x, npc.state.position.y + muzzle_y, npc.state.position.z);
    let aim_at = Vec3::new(target_pos.x, target_pos.y + 1.2, target_pos.z);
    let dir = Vec3::new(
        aim_at.x - muzzle.x,
        aim_at.y - muzzle.y,
        aim_at.z - muzzle.z,
    )
    .normalized();

    let damage = 14.0;
    let speed = 48.0;

    projectiles.push(ProjectileInternal {
        state: crate::entities::ProjectileState {
            id: *next_id,
            position: muzzle.add(&dir.scale(0.6)),
            velocity: dir.scale(speed),
            owner_id: npc.state.id,
            damage,
            life: 2.0,
            kind: ProjectileKind::Bullet,
            explosion_radius: 0.0,
            gravity: 0.0,
            fuse: 0.0,
            age: 0.0,
        },
    });
    *next_id += 1;
    npc.fire_timer = if npc.state.crawling { 1.1 } else { 0.75 };

    // Face the target
    npc.state.yaw = dir.x.atan2(dir.z);
    npc.wander_yaw = npc.state.yaw;

    Some(CombatEvent {
        kind: CombatEventKind::Shot,
        target_id: Some(npc.state.id),
        damage,
        position: muzzle,
        zone: None,
    })
}

fn closest_on_segment(from: &Vec3, to: &Vec3, point: &Vec3) -> Vec3 {
    let ab = Vec3::new(to.x - from.x, to.y - from.y, to.z - from.z);
    let ab_len_sq = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
    if ab_len_sq < 1e-8 {
        return *from;
    }
    let t = ((point.x - from.x) * ab.x + (point.y - from.y) * ab.y + (point.z - from.z) * ab.z)
        / ab_len_sq;
    let t = t.clamp(0.0, 1.0);
    Vec3::new(from.x + ab.x * t, from.y + ab.y * t, from.z + ab.z * t)
}

fn dist_xz_scaled_y(a: &Vec3, b: &Vec3, y_scale: f32) -> f32 {
    let dx = a.x - b.x;
    let dy = (a.y - b.y) * y_scale;
    let dz = a.z - b.z;
    (dx * dx + dy * dy + dz * dz).sqrt()
}

/// Classify hit by height relative to NPC feet (matches character proportions).
pub fn classify_hit_zone(hit_y: f32, feet_y: f32) -> HitZone {
    let h = hit_y - feet_y;
    if h >= 1.55 {
        HitZone::Head
    } else if h < 0.9 {
        HitZone::Leg
    } else {
        HitZone::Body
    }
}

/// Vertical capsule hit: classify zone by impact height so low shots reliably count as legs.
fn hit_vertical_capsule(
    from: &Vec3,
    to: &Vec3,
    feet: &Vec3,
    crawling: bool,
) -> Option<(HitZone, Vec3)> {
    let (ymin, ymax, radius) = if crawling {
        (0.05, 0.65, 0.48)
    } else {
        (0.05, 1.95, 0.48)
    };

    // Sample several heights along the body axis and take the closest approach
    let mut best_dist = f32::MAX;
    let mut best_hit = Vec3::ZERO;
    let steps = 10;
    for i in 0..=steps {
        let t = i as f32 / steps as f32;
        let y = ymin + (ymax - ymin) * t;
        let axis = Vec3::new(feet.x, feet.y + y, feet.z);
        let closest = closest_on_segment(from, to, &axis);
        let d = dist_xz_scaled_y(&closest, &axis, 0.9);
        if d < best_dist {
            best_dist = d;
            best_hit = closest;
        }
    }

    if best_dist > radius {
        return None;
    }

    let zone = if crawling {
        // While prone, treat upper third as head, rest as body/leg
        let h = best_hit.y - feet.y;
        if h >= 0.45 {
            HitZone::Head
        } else if h <= 0.22 {
            HitZone::Leg
        } else {
            HitZone::Body
        }
    } else {
        classify_hit_zone(best_hit.y, feet.y)
    };

    Some((zone, best_hit))
}

fn apply_zone_hit(npc: &mut NpcInternal, zone: HitZone, damage: f32, hit_pos: Vec3) -> CombatEvent {
    // Getting shot always aggroes the attacker context via caller; mark hostile to player when damaged
    npc.aggro_player = true;

    match zone {
        HitZone::Head => {
            let dealt = npc.state.health.max(1.0);
            npc.state.health = 0.0;
            npc.state.shield = 0.0;
            npc.crawl_timer = 0.0;
            npc.state.crawling = false;
            npc.state.crawl_time_left = 0.0;
            CombatEvent {
                kind: CombatEventKind::Kill,
                target_id: Some(npc.state.id),
                damage: dealt,
                position: hit_pos,
                zone: Some(HitZone::Head),
            }
        }
        HitZone::Leg => {
            let health_before = npc.state.health;
            let shield_before = npc.state.shield;
            let use_shield = npc.state.shield > 0.0;
            apply_damage(
                &mut npc.state.health,
                &mut npc.state.shield,
                use_shield,
                damage * 0.65,
            );
            let dealt =
                (health_before - npc.state.health) + (shield_before - npc.state.shield);
            if npc.state.health > 0.0 {
                npc.crawl_timer = CRAWL_DURATION;
                npc.state.crawling = true;
                npc.state.crawl_time_left = CRAWL_DURATION;
            } else {
                npc.crawl_timer = 0.0;
                npc.state.crawling = false;
                npc.state.crawl_time_left = 0.0;
            }
            CombatEvent {
                kind: if npc.state.health <= 0.0 {
                    CombatEventKind::Kill
                } else {
                    CombatEventKind::Hit
                },
                target_id: Some(npc.state.id),
                damage: dealt.max(1.0),
                position: hit_pos,
                zone: Some(HitZone::Leg),
            }
        }
        HitZone::Body => {
            let health_before = npc.state.health;
            let shield_before = npc.state.shield;
            let use_shield = npc.state.shield > 0.0;
            apply_damage(
                &mut npc.state.health,
                &mut npc.state.shield,
                use_shield,
                damage,
            );
            let dealt =
                (health_before - npc.state.health) + (shield_before - npc.state.shield);
            if npc.state.health <= 0.0 {
                npc.crawl_timer = 0.0;
                npc.state.crawling = false;
                npc.state.crawl_time_left = 0.0;
            }
            CombatEvent {
                kind: if npc.state.health <= 0.0 {
                    CombatEventKind::Kill
                } else {
                    CombatEventKind::Hit
                },
                target_id: Some(npc.state.id),
                damage: dealt.max(1.0),
                position: hit_pos,
                zone: Some(HitZone::Body),
            }
        }
    }
}

fn explode_at(
    center: Vec3,
    damage: f32,
    radius: f32,
    npcs: &mut [NpcInternal],
    vehicles: &mut [VehicleInternal],
    trees: &mut [TreeInternal],
    player: &mut PlayerInternal,
) -> Vec<CombatEvent> {
    let mut events = vec![CombatEvent {
        kind: CombatEventKind::Explosion,
        target_id: None,
        damage,
        position: center,
        zone: None,
    }];

    for npc in npcs.iter_mut() {
        if npc.state.health <= 0.0 {
            continue;
        }
        let body = Vec3::new(
            npc.state.position.x,
            npc.state.position.y + 1.0,
            npc.state.position.z,
        );
        let dist = dist_xz_scaled_y(&center, &body, 1.0);
        if dist > radius {
            continue;
        }
        let falloff = (1.0 - dist / radius).max(0.15);
        let dmg = damage * falloff;
        let zone = classify_hit_zone(center.y, npc.state.position.y);
        let zone = if matches!(zone, HitZone::Head) && center.y < npc.state.position.y + 1.4 {
            HitZone::Body
        } else {
            zone
        };
        events.push(apply_zone_hit(npc, zone, dmg, body));
    }

    for veh in vehicles.iter_mut() {
        if veh.state.destroyed {
            continue;
        }
        let body = Vec3::new(
            veh.state.position.x,
            veh.state.position.y + 0.7,
            veh.state.position.z,
        );
        let dist = dist_xz_scaled_y(&center, &body, 1.0);
        if dist > radius + 0.8 {
            continue;
        }
        let falloff = (1.0 - dist / (radius + 0.8)).max(0.2);
        let dmg = damage * falloff * 1.15;
        veh.state.health = (veh.state.health - dmg).max(0.0);
        if veh.state.health < veh.state.max_health * 0.55 {
            veh.state.burning = true;
        }
        if veh.state.health <= 0.0 {
            veh.state.destroyed = true;
            veh.state.burning = true;
            veh.state.speed = 0.0;
            if veh.state.occupied {
                veh.state.occupied = false;
                if player.state.in_vehicle == Some(veh.state.id) {
                    player.state.in_vehicle = None;
                    player.state.position = Vec3::new(
                        veh.state.position.x + 2.2,
                        0.0,
                        veh.state.position.z,
                    );
                }
            }
        }
        events.push(CombatEvent {
            kind: if veh.state.destroyed {
                CombatEventKind::Kill
            } else {
                CombatEventKind::Hit
            },
            target_id: Some(veh.state.id),
            damage: dmg.max(1.0),
            position: body,
            zone: Some(HitZone::Body),
        });
    }

    for tree in trees.iter_mut() {
        if tree.state.burned {
            continue;
        }
        let dist = tree.state.position.distance_xz(&center);
        if dist <= radius + 1.2 {
            tree.state.burned = true;
            tree.state.climbable = false;
            if player.state.climbing_tree == Some(tree.state.id) {
                player.state.climbing_tree = None;
                player.state.position.y = 0.0;
            }
        }
    }

    // Blast can hurt the player too
    let pbody = Vec3::new(
        player.state.position.x,
        player.state.position.y + 1.0,
        player.state.position.z,
    );
    let pdist = dist_xz_scaled_y(&center, &pbody, 1.0);
    if pdist <= radius && player.state.health > 0.0 {
        let falloff = (1.0 - pdist / radius).max(0.15);
        let dmg = damage * falloff * 0.55;
        let use_shield = player.state.shield_active && player.state.shield > 0.0;
        apply_damage(
            &mut player.state.health,
            &mut player.state.shield,
            use_shield,
            dmg,
        );
        events.push(CombatEvent {
            kind: if player.state.health <= 0.0 {
                CombatEventKind::Kill
            } else {
                CombatEventKind::Hit
            },
            target_id: Some(player.state.id),
            damage: dmg.max(1.0),
            position: pbody,
            zone: Some(HitZone::Body),
        });
    }

    events
}

fn hit_vehicle_hull(from: &Vec3, to: &Vec3, veh: &VehicleInternal) -> Option<Vec3> {
    if veh.state.destroyed {
        return None;
    }
    let center = Vec3::new(
        veh.state.position.x,
        veh.state.position.y + 0.7,
        veh.state.position.z,
    );
    let closest = closest_on_segment(from, to, &center);
    let dist = dist_xz_scaled_y(&closest, &center, 0.85);
    if dist <= 1.7 {
        Some(closest)
    } else {
        None
    }
}

pub fn update_and_hit_projectiles(
    projectiles: &mut Vec<ProjectileInternal>,
    npcs: &mut [NpcInternal],
    vehicles: &mut [VehicleInternal],
    trees: &mut [TreeInternal],
    player: &mut PlayerInternal,
    dt: f32,
    world_half: f32,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let mut remove = Vec::new();
    let player_id = player.state.id;

    for (pi, proj) in projectiles.iter_mut().enumerate() {
        if proj.state.gravity > 0.0 {
            proj.state.velocity.y -= proj.state.gravity * dt;
        }

        let from = proj.state.position;
        let to = from.add(&proj.state.velocity.scale(dt));
        proj.state.age += dt;

        let mut exploded = false;
        let mut direct_hit = false;
        let mut blast_anchor = to;

        // Rockets detonate on ground impact
        if proj.state.kind == ProjectileKind::Rocket && to.y <= 0.18 {
            exploded = true;
            blast_anchor = Vec3::new(to.x, 0.25, to.z);
        }

        if proj.state.kind == ProjectileKind::Grenade && to.y <= 0.12 {
            if proj.state.age >= proj.state.fuse * 0.35 {
                exploded = true;
                blast_anchor = Vec3::new(to.x, 0.2, to.z);
            } else {
                proj.state.position = Vec3::new(to.x, 0.12, to.z);
                proj.state.velocity.y = proj.state.velocity.y.abs() * 0.35;
                proj.state.velocity.x *= 0.7;
                proj.state.velocity.z *= 0.7;
                continue;
            }
        }

        if proj.state.kind == ProjectileKind::Grenade && proj.state.age >= proj.state.fuse {
            exploded = true;
            blast_anchor = to;
        }

        if !exploded {
            // Hit NPCs (skip owner)
            for npc in npcs.iter_mut() {
                if npc.state.health <= 0.0 || npc.state.id == proj.state.owner_id {
                    continue;
                }
                let Some((zone, hit_pos)) =
                    hit_vertical_capsule(&from, &to, &npc.state.position, npc.state.crawling)
                else {
                    continue;
                };

                if proj.state.explosion_radius > 0.0 {
                    exploded = true;
                    blast_anchor = hit_pos;
                    proj.state.position = hit_pos;
                } else {
                    events.push(apply_zone_hit(npc, zone, proj.state.damage, hit_pos));
                    direct_hit = true;
                }
                break;
            }
        }

        // Explosive projectiles hit vehicles
        if !exploded && !direct_hit && proj.state.explosion_radius > 0.0 {
            for veh in vehicles.iter() {
                if let Some(hit_pos) = hit_vehicle_hull(&from, &to, veh) {
                    exploded = true;
                    blast_anchor = hit_pos;
                    proj.state.position = hit_pos;
                    break;
                }
            }
        }

        // Explosive projectiles also hit tree trunks
        if !exploded && !direct_hit && proj.state.explosion_radius > 0.0 {
            for tree in trees.iter() {
                if tree.state.burned {
                    continue;
                }
                let center = Vec3::new(
                    tree.state.position.x,
                    tree.state.position.y + tree.state.height * 0.45,
                    tree.state.position.z,
                );
                let closest = closest_on_segment(&from, &to, &center);
                let dist = dist_xz_scaled_y(&closest, &center, 0.7);
                if dist <= tree.state.trunk_radius + 0.55 {
                    exploded = true;
                    blast_anchor = closest;
                    proj.state.position = closest;
                    break;
                }
            }
        }

        // Hit player (if shot by an NPC)
        if !exploded && !direct_hit && proj.state.owner_id != player_id && player.state.health > 0.0
        {
            if let Some((zone, hit_pos)) =
                hit_vertical_capsule(&from, &to, &player.state.position, false)
            {
                if proj.state.explosion_radius > 0.0 {
                    exploded = true;
                    blast_anchor = hit_pos;
                    proj.state.position = hit_pos;
                } else {
                    let use_shield = player.state.shield_active && player.state.shield > 0.0;
                    let before = player.state.health;
                    apply_damage(
                        &mut player.state.health,
                        &mut player.state.shield,
                        use_shield,
                        proj.state.damage,
                    );
                    events.push(CombatEvent {
                        kind: if player.state.health <= 0.0 {
                            CombatEventKind::Kill
                        } else {
                            CombatEventKind::Hit
                        },
                        target_id: Some(player_id),
                        damage: (before - player.state.health).max(1.0),
                        position: hit_pos,
                        zone: Some(zone),
                    });
                    direct_hit = true;
                }
            }
        }

        if !exploded && !direct_hit {
            proj.state.position = to;
            proj.state.life -= dt;
            // Rockets that run out of fuel still detonate
            if proj.state.kind == ProjectileKind::Rocket && proj.state.life <= 0.0 {
                exploded = true;
                blast_anchor = to;
            }
        }

        if exploded {
            events.extend(explode_at(
                blast_anchor,
                proj.state.damage,
                proj.state.explosion_radius.max(1.0),
                npcs,
                vehicles,
                trees,
                player,
            ));
            remove.push(pi);
        } else if direct_hit {
            remove.push(pi);
        }
    }

    for i in remove.into_iter().rev() {
        projectiles.swap_remove(i);
    }

    projectiles.retain(|p| {
        p.state.life > 0.0
            && p.state.position.x.abs() < world_half + 20.0
            && p.state.position.z.abs() < world_half + 20.0
            && p.state.position.y > -5.0
            && p.state.position.y < 60.0
    });

    events
}
