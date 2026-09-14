# Open World — Game Design Notes

## Stack

| Layer | Tech | Role |
|-------|------|------|
| Shell | Tauri 2 | Desktop window, IPC |
| Simulation | Rust | Authoritative world tick |
| Render | Three.js | World, characters, camera |
| Preview | TypeScript local engine | Same API when not in Tauri |

## Simulation loop

1. Frontend samples input (movement, look, fire, shield, interact, camera toggle).
2. Calls `tick_game(input, dt)` on Rust (or local fallback).
3. Receives `GameSnapshot` and updates meshes + HUD.

## Entity types

- **Player** — health, shield energy, weapon, optional vehicle occupancy, camera mode
- **NPC** — wander AI, optional personal shield (guards)
- **Vehicle** — rover / buggy, enter within 3 units
- **Projectile** — hits NPCs, absorbed partly by shields

## Camera

- Default: third person (over-shoulder follow)
- `V`: first person (eye height + crosshair)
