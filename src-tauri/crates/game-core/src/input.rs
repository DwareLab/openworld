use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerInput {
    /// Forward/back along look yaw: -1..1
    pub forward: f32,
    /// Strafe left/right: -1..1
    pub strafe: f32,
    /// Absolute look yaw (radians)
    pub look_yaw: f32,
    /// Absolute look pitch (radians)
    pub look_pitch: f32,
    pub jump: bool,
    pub fire: bool,
    pub shield: bool,
    /// Aim down sights (right mouse)
    pub aim: bool,
    pub interact: bool,
    pub toggle_camera: bool,
    pub sprint: bool,
    /// Switch weapon slot 0..3 when Some
    pub weapon_slot: Option<u8>,
}
