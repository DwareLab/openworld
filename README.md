# Open World

Desktop open-world prototype built with **Rust + Tauri 2** for simulation, and **Three.js** for rendering.

## Features

- Open outdoor map with terrain and trees
- People (wandering civilians and guards)
- Driveable vehicles (enter / exit with `E`)
- Pulse rifle (left mouse) and energy shield (`Q` or right mouse)
- Third-person camera by default, toggle first-person with `V`

## Controls

| Action | Input |
|--------|--------|
| Move | WASD / arrows |
| Sprint | Shift |
| Look | Mouse (click to lock) |
| Aim (ADS) | Right mouse |
| Fire | Left mouse |
| Shield | Q |
| Enter / exit vehicle | E |
| Toggle TPV / FPV | V |

## Architecture

- `src-tauri/crates/game-core/` — authoritative Rust simulation (player, NPCs, vehicles, combat)
- `src-tauri/src/` — Tauri shell + commands: `init_game`, `tick_game`, `get_snapshot`
- `src/game/` — Three.js renderer, HUD, input, and a local JS fallback for browser-only preview

When running inside the desktop shell, the frontend calls Rust each frame. With `npm run dev` alone, a TypeScript mirror of the sim runs so you can play without Linux WebKit packages.

## Setup

### 1. Node deps

```bash
npm install
```

### 2. Linux desktop prerequisites (for `tauri dev`)

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### 3. Run

Browser preview (local TS sim):

```bash
npm run dev
```

Desktop app (Rust sim + Tauri window):

```bash
npm run tauri:dev
```

## Next ideas

- Procedural cities / biomes
- Inventory and weapon switching
- Vehicle combat and NPC AI aggression
- Save / load world state from Rust
- Multiplayer sync over a Rust server
