import * as THREE from "three";
import type { WeaponId } from "../types";

function metal(color: number, roughness = 0.35, metalness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** Assault-rifle style weapon built from primitives. */
export function createRifle(): THREE.Group {
  const gun = new THREE.Group();
  gun.name = "rifle";

  const receiver = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.14, 0.55),
    metal(0x2c3038),
  );
  receiver.position.set(0, 0.02, 0);
  receiver.castShadow = true;
  gun.add(receiver);

  const upperRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.04, 0.5),
    metal(0x1a1d22, 0.4, 0.7),
  );
  upperRail.position.set(0, 0.1, 0.02);
  gun.add(upperRail);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.032, 0.55, 10),
    metal(0x1b1e24, 0.3, 0.9),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, 0.48);
  barrel.castShadow = true;
  gun.add(barrel);

  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.035, 0.1, 10),
    metal(0x111318, 0.25, 0.95),
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.03, 0.78);
  gun.add(muzzle);

  const flashHider = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.03, 0.08, 8),
    metal(0x0d0f12),
  );
  flashHider.rotation.x = Math.PI / 2;
  flashHider.position.set(0, 0.03, 0.86);
  gun.add(flashHider);

  const handguard = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.1, 0.32),
    metal(0x3a3f48, 0.55, 0.4),
  );
  handguard.position.set(0, 0.0, 0.28);
  gun.add(handguard);

  const mag = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.22, 0.12),
    metal(0x22262c, 0.5, 0.6),
  );
  mag.position.set(0, -0.16, 0.02);
  mag.rotation.x = 0.12;
  gun.add(mag);

  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.18, 0.1),
    metal(0x1c1f24, 0.65, 0.25),
  );
  grip.position.set(0, -0.14, -0.14);
  grip.rotation.x = 0.35;
  gun.add(grip);

  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.28),
    metal(0x2a2e35, 0.5, 0.5),
  );
  stock.position.set(0, 0.0, -0.38);
  gun.add(stock);

  const butt = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.18, 0.06),
    metal(0x171a1f, 0.6, 0.3),
  );
  butt.position.set(0, -0.02, -0.54);
  gun.add(butt);

  const sightFront = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.08, 0.02),
    metal(0x111111),
  );
  sightFront.position.set(0, 0.14, 0.55);
  gun.add(sightFront);

  const sightRear = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.06, 0.04),
    metal(0x111111),
  );
  sightRear.position.set(0, 0.14, -0.08);
  gun.add(sightRear);

  return gun;
}

export function createDesertEagle(): THREE.Group {
  const gun = new THREE.Group();
  gun.name = "desert_eagle";

  const slide = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.42),
    metal(0x3a3f45, 0.3, 0.9),
  );
  slide.position.set(0, 0.04, 0.05);
  gun.add(slide);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.025, 0.28, 10),
    metal(0x1a1d22),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.05, 0.38);
  gun.add(barrel);

  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.2, 0.1),
    metal(0x1c1410, 0.7, 0.2),
  );
  grip.position.set(0, -0.1, -0.05);
  grip.rotation.x = 0.28;
  gun.add(grip);

  const trigger = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.05, 0.04),
    metal(0x111111),
  );
  trigger.position.set(0, -0.02, 0.02);
  gun.add(trigger);

  const hammer = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.05, 0.04),
    metal(0x222222),
  );
  hammer.position.set(0, 0.08, -0.14);
  gun.add(hammer);

  return gun;
}

export function createRocketLauncher(): THREE.Group {
  const gun = new THREE.Group();
  gun.name = "rocket_launcher";

  // Main launch tube
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.13, 1.35, 16),
    metal(0x5a6848, 0.5, 0.4),
  );
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0.06, 0.12);
  tube.castShadow = true;
  gun.add(tube);

  // Heat shield rings
  for (const z of [-0.35, 0.05, 0.45]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.135, 0.018, 8, 16),
      metal(0x2a3024, 0.4, 0.7),
    );
    ring.position.set(0, 0.06, z);
    gun.add(ring);
  }

  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.145, 0.12, 0.16, 14),
    metal(0x1a1e16, 0.3, 0.85),
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.06, 0.82);
  gun.add(muzzle);

  const breech = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.13, 0.14, 14),
    metal(0x222820),
  );
  breech.rotation.x = Math.PI / 2;
  breech.position.set(0, 0.06, -0.58);
  gun.add(breech);

  // Loaded warhead visible in tube tip
  const warhead = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.22, 10),
    metal(0x8a3a2a, 0.45, 0.55),
  );
  warhead.rotation.x = Math.PI / 2;
  warhead.position.set(0, 0.06, 0.7);
  gun.add(warhead);

  const frontGrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.16, 0.08),
    metal(0x1a1a1a, 0.7, 0.2),
  );
  frontGrip.position.set(0, -0.12, 0.28);
  gun.add(frontGrip);

  const rearGrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.2, 0.1),
    metal(0x1a1a1a, 0.7, 0.2),
  );
  rearGrip.position.set(0, -0.16, -0.12);
  rearGrip.rotation.x = 0.2;
  gun.add(rearGrip);

  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.1, 0.22),
    metal(0x3a4030, 0.55, 0.35),
  );
  stock.position.set(0, 0.0, -0.72);
  gun.add(stock);

  const optic = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.1, 0.14),
    metal(0x111111),
  );
  optic.position.set(0.1, 0.18, 0.05);
  gun.add(optic);

  const opticLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10),
    new THREE.MeshStandardMaterial({
      color: 0x224422,
      emissive: 0x113311,
      emissiveIntensity: 0.4,
      metalness: 0.2,
      roughness: 0.3,
    }),
  );
  opticLens.rotation.x = Math.PI / 2;
  opticLens.position.set(0.1, 0.18, 0.13);
  gun.add(opticLens);

  const shoulderPad = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.16, 0.08),
    metal(0x2a2a2a, 0.8, 0.15),
  );
  shoulderPad.position.set(0, -0.02, -0.86);
  gun.add(shoulderPad);

  return gun;
}

export function createGrenade(): THREE.Group {
  const gun = new THREE.Group();
  gun.name = "grenade";

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    metal(0x3d5a2e, 0.65, 0.4),
  );
  gun.add(body);

  const lever = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.12, 0.02),
    metal(0x888888),
  );
  lever.position.set(0.06, 0.04, 0);
  gun.add(lever);

  const pin = new THREE.Mesh(
    new THREE.TorusGeometry(0.03, 0.008, 6, 10),
    metal(0xcccccc, 0.3, 0.9),
  );
  pin.position.set(0, 0.1, 0);
  pin.rotation.x = Math.PI / 2;
  gun.add(pin);

  return gun;
}

export function createWeaponModel(id: WeaponId): THREE.Group {
  switch (id) {
    case "desert_eagle":
      return createDesertEagle();
    case "rocket_launcher":
      return createRocketLauncher();
    case "grenade":
      return createGrenade();
    case "pulse_rifle":
    default:
      return createRifle();
  }
}

export function createProjectileMesh(kind: string): THREE.Object3D {
  if (kind === "rocket") {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.7, 12),
      new THREE.MeshStandardMaterial({
        color: 0x6b7a4a,
        metalness: 0.55,
        roughness: 0.35,
        emissive: 0x442200,
        emissiveIntensity: 0.55,
      }),
    );
    body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.28, 12),
      new THREE.MeshStandardMaterial({ color: 0x8a3030, metalness: 0.65 }),
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.45;
    const fins = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.04, 0.16),
      metal(0x333333),
    );
    fins.position.z = -0.28;
    const exhaust = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 }),
    );
    exhaust.position.z = -0.42;
    exhaust.name = "rocket-exhaust";
    const trail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.14, 0.55, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff6622,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    trail.rotation.x = Math.PI / 2;
    trail.position.z = -0.7;
    trail.name = "rocket-trail";
    g.add(body, tip, fins, exhaust, trail);
    return g;
  }

  if (kind === "grenade") {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x3d5a2e,
        metalness: 0.45,
        roughness: 0.55,
      }),
    );
  }

  // bullet tracer
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0xffe066,
      emissive: 0xffaa00,
      emissiveIntensity: 1.4,
    }),
  );
}

/** First-person viewmodel: arms + active weapon, parented to camera. */
export function createFpViewmodel(weaponId: WeaponId = "pulse_rifle"): THREE.Group {
  const root = new THREE.Group();
  root.name = "fp-viewmodel";

  const skin = 0xf0c9a0;
  const sleeve = 0x2f6fed;

  const rightArm = new THREE.Group();
  rightArm.position.set(0.28, -0.28, -0.45);
  rightArm.rotation.set(-0.15, 0.2, 0.1);

  const rUpper = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.28),
    new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.7 }),
  );
  rUpper.position.z = 0.05;
  const rFore = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.28),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 }),
  );
  rFore.position.z = -0.22;
  const rHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.08, 0.14),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 }),
  );
  rHand.position.z = -0.4;
  rightArm.add(rUpper, rFore, rHand);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.12, -0.32, -0.55);
  leftArm.rotation.set(-0.25, -0.15, -0.2);

  const lFore = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.3),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 }),
  );
  const lHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.08, 0.12),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 }),
  );
  lHand.position.z = -0.2;
  leftArm.add(lFore, lHand);

  const mount = new THREE.Group();
  mount.name = "fp-weapon-mount";
  const weapon = createWeaponModel(weaponId);
  weapon.scale.setScalar(
    weaponId === "grenade" ? 1.2 : weaponId === "rocket_launcher" ? 0.95 : 0.85,
  );
  weapon.rotation.set(0.02, Math.PI, 0.02);
  weapon.position.set(0.22, -0.24, -0.48);
  if (weaponId === "grenade") {
    weapon.position.set(0.18, -0.2, -0.4);
    weapon.rotation.set(0.2, 0.4, 0.1);
  }
  if (weaponId === "rocket_launcher") {
    rightArm.position.set(0.32, -0.22, -0.5);
    leftArm.position.set(-0.05, -0.28, -0.72);
    weapon.position.set(0.12, -0.18, -0.7);
    weapon.rotation.set(0.08, Math.PI, -0.08);
    weapon.scale.setScalar(1.05);
  }
  mount.add(weapon);

  root.add(rightArm, leftArm, mount);
  return root;
}
