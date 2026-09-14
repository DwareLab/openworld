use std::sync::Mutex;

use game_core::{GameSnapshot, GameWorld, PlayerInput};
use tauri::State;

struct AppState {
    world: Mutex<GameWorld>,
}

#[tauri::command]
fn init_game(state: State<'_, AppState>) -> GameSnapshot {
    let mut world = state.world.lock().expect("game lock");
    *world = GameWorld::new();
    world.snapshot()
}

#[tauri::command]
fn tick_game(state: State<'_, AppState>, input: PlayerInput, dt: f32) -> GameSnapshot {
    let mut world = state.world.lock().expect("game lock");
    world.tick(input, dt);
    world.snapshot()
}

#[tauri::command]
fn get_snapshot(state: State<'_, AppState>) -> GameSnapshot {
    state.world.lock().expect("game lock").snapshot()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            world: Mutex::new(GameWorld::new()),
        })
        .invoke_handler(tauri::generate_handler![
            init_game,
            tick_game,
            get_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
