import * as THREE from "three";
import type { WeaponId } from "../types";

export type CharacterKind = "player" | "guard" | "civilian";

export type CharacterParts = {
  root: THREE.Group;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  /** Rifle is parented here; oriented so +Z points at the look target. */
  aimPivot: THREE.Group;
  gunMount: THREE.Object3D;
};

const SKIN = {
  player: 0xf0c9a0,
  guard: 0xe0b890,
  civilian: 0xddb892,
};

const CLOTHES: Record<CharacterKind, { torso: number; pants: number; accent: number }> = {
  player: { torso: 0x2f6fed, pants: 0x1f3a6e, accent: 0x1a4fc4 },
  guard: { torso: 0x6b2d2d, pants: 0x2a2a2a, accent: 0xb84a3a },
  civilian: { torso: 0xc4a574, pants: 0x4a5a3a, accent: 0x8b6b3d },
};

function mat(color: number, extras: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.08,
    ...extras,
  });
}

function limb(
  width: number,
  height: number,
  depth: number,
  color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createFace(skin: number): THREE.Group {
  const face = new THREE.Group();

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.48, 0.4),
    mat(skin),
  );
  head.castShadow = true;
  face.add(head);

  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.16, 0.42),
    mat(0x2a1c12),
  );
  hair.position.set(0, 0.2, -0.01);
  face.add(hair);

  const brow = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.04, 0.06),
    mat(0x2a1c12),
  );
  brow.position.set(0, 0.1, 0.2);
  face.add(brow);

  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.07, 0.04),
      mat(0xf5f5f5),
    );
    white.position.set(side * 0.1, 0.05, 0.2);
    face.add(white);

    const iris = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.03),
      mat(0x2b5f9e),
    );
    iris.position.set(side * 0.1, 0.05, 0.22);
    face.add(iris);

    const pupil = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.025, 0.02),
      mat(0x111111),
    );
    pupil.position.set(side * 0.1, 0.05, 0.235);
    face.add(pupil);
  }

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.09, 0.08),
    mat(skin),
  );
  nose.position.set(0, -0.02, 0.22);
  face.add(nose);

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.035, 0.03),
    mat(0x9a3d3d),
  );
  mouth.position.set(0, -0.14, 0.21);
  face.add(mouth);

  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.06), mat(skin));
  earL.position.set(-0.24, 0.02, 0);
  const earR = earL.clone();
  earR.position.x = 0.24;
  face.add(earL, earR);

  return face;
}

function createHand(skin: number): THREE.Group {
  const hand = new THREE.Group();
  const palm = limb(0.12, 0.08, 0.16, skin);
  palm.position.y = -0.02;
  hand.add(palm);

  for (let i = 0; i < 4; i++) {
    const finger = limb(0.028, 0.1, 0.028, skin);
    finger.position.set(-0.045 + i * 0.03, -0.1, 0.04);
    hand.add(finger);
  }

  const thumb = limb(0.03, 0.08, 0.03, skin);
  thumb.position.set(-0.08, -0.04, 0.02);
  thumb.rotation.z = 0.6;
  hand.add(thumb);

  return hand;
}

export function createCharacter(kind: CharacterKind): CharacterParts {
  const clothes = CLOTHES[kind];
  const skin = SKIN[kind];
  const root = new THREE.Group();
  root.name = `character-${kind}`;

  // Legs pivot at hips
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.14, 0.95, 0);
  const leftThigh = limb(0.18, 0.48, 0.2, clothes.pants);
  leftThigh.position.y = -0.24;
  const leftShin = limb(0.16, 0.42, 0.18, clothes.pants);
  leftShin.position.y = -0.66;
  const leftBoot = limb(0.18, 0.12, 0.28, 0x222222);
  leftBoot.position.set(0, -0.92, 0.04);
  leftLeg.add(leftThigh, leftShin, leftBoot);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.14, 0.95, 0);
  const rightThigh = limb(0.18, 0.48, 0.2, clothes.pants);
  rightThigh.position.y = -0.24;
  const rightShin = limb(0.16, 0.42, 0.18, clothes.pants);
  rightShin.position.y = -0.66;
  const rightBoot = limb(0.18, 0.12, 0.28, 0x222222);
  rightBoot.position.set(0, -0.92, 0.04);
  rightLeg.add(rightThigh, rightShin, rightBoot);

  // Torso
  const torso = new THREE.Group();
  torso.position.y = 1.15;
  const chest = limb(0.52, 0.62, 0.3, clothes.torso);
  chest.position.y = 0.1;
  const hips = limb(0.48, 0.22, 0.28, clothes.pants);
  hips.position.y = -0.28;
  const collar = limb(0.5, 0.08, 0.32, clothes.accent);
  collar.position.y = 0.42;
  torso.add(chest, hips, collar);

  // Head / face
  const head = new THREE.Group();
  head.position.set(0, 1.78, 0);
  const neck = limb(0.14, 0.12, 0.14, skin);
  neck.position.y = -0.18;
  const face = createFace(skin);
  face.position.y = 0.08;
  head.add(neck, face);

  // Arms hang at sides initially; animateCombat poses them to the rifle
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.38, 1.48, 0);
  const leftUpper = limb(0.14, 0.36, 0.16, clothes.torso);
  leftUpper.position.y = -0.16;
  const leftFore = limb(0.12, 0.34, 0.14, skin);
  leftFore.position.y = -0.48;
  const leftHand = createHand(skin);
  leftHand.position.set(0, -0.7, 0);
  leftArm.add(leftUpper, leftFore, leftHand);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.38, 1.48, 0);
  const rightUpper = limb(0.14, 0.36, 0.16, clothes.torso);
  rightUpper.position.y = -0.16;
  const rightFore = limb(0.12, 0.34, 0.14, skin);
  rightFore.position.y = -0.48;
  const rightHand = createHand(skin);
  rightHand.position.set(0, -0.7, 0);
  rightArm.add(rightUpper, rightFore, rightHand);

  // Aim pivot lives on the character root so the barrel can track look pitch/yaw
  const aimPivot = new THREE.Group();
  aimPivot.name = "aim-pivot";
  aimPivot.position.set(0.22, 1.42, 0.2);
  const gunMount = new THREE.Group();
  gunMount.name = "gun-mount";
  // Grip sits near origin; barrel extends +Z toward the target
  gunMount.position.set(0, -0.02, -0.15);
  aimPivot.add(gunMount);

  root.add(leftLeg, rightLeg, torso, head, leftArm, rightArm, aimPivot);

  return {
    root,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    aimPivot,
    gunMount,
  };
}

const _forward = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _shoulder = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

/**
 * Point the rifle exactly along the look ray (same direction bullets travel).
 * Arms are posed as a support hold around that aimed weapon.
 */
export function animateCombat(
  parts: CharacterParts,
  time: number,
  moving: boolean,
  aimPitch: number,
  aiming: boolean,
  recoil = 0,
  crawling = false,
  weaponId: WeaponId = "pulse_rifle",
  climbing = false,
) {
  if (crawling) {
    animateCrawl(parts, time, moving);
    return;
  }

  if (climbing) {
    animateClimb(parts, time, moving);
    return;
  }

  const swing = moving && !aiming ? Math.sin(time * 9) * 0.45 : 0;
  parts.leftLeg.rotation.x = swing;
  parts.rightLeg.rotation.x = -swing;

  parts.head.rotation.x = -aimPitch * 0.5;
  parts.torso.rotation.x = aiming ? -aimPitch * 0.1 : -aimPitch * 0.03;
  // Do not write root.position — world height (climbing, etc.) is set by the renderer

  const isRocket = weaponId === "rocket_launcher";
  const isGrenade = weaponId === "grenade";

  _forward.set(0, Math.sin(aimPitch), Math.cos(aimPitch)).normalize();

  if (isRocket) {
    // Over-shoulder tube carry / fire pose
    _shoulder.set(0.18, 1.48, 0.05);
    if (aiming) _shoulder.set(0.1, 1.52, 0.22);
    _shoulder.y += recoil * 0.08;
    _shoulder.z -= recoil * 0.18;
    parts.aimPivot.position.copy(_shoulder);
    parts.aimPivot.visible = true;

    _aimPoint.copy(_forward).multiplyScalar(50).add(new THREE.Vector3(0, 1.55, 0));
    _forward.copy(_aimPoint).sub(_shoulder).normalize();
    _quat.setFromUnitVectors(_zAxis, _forward);
    parts.aimPivot.quaternion.copy(_quat);
    parts.gunMount.rotation.x = -recoil * 0.85;
    parts.gunMount.position.set(0, -0.02 + recoil * 0.05, -0.2 - recoil * 0.22);

    const raise = 1.45 + aimPitch * 0.5 + recoil * 0.5;
    parts.rightArm.rotation.set(-raise, -0.25, 0.15);
    parts.leftArm.rotation.set(-(raise * 0.85), 0.55, 0.75);
    return;
  }

  if (isGrenade) {
    parts.aimPivot.visible = true;
    parts.aimPivot.position.set(0.22, 1.35 + recoil * 0.1, 0.2);
    parts.aimPivot.rotation.set(-0.4 - recoil * 0.8, 0.3, 0.2);
    parts.gunMount.rotation.set(0, 0, 0);
    parts.gunMount.position.set(0, 0, 0);
    parts.rightArm.rotation.set(-1.6 - recoil * 1.2, -0.2, 0.1);
    parts.leftArm.rotation.set(-0.4, 0.3, 0.5);
    return;
  }

  // Right-shoulder hold; ADS brings the gun closer to center/eye line
  if (aiming) {
    _shoulder.set(0.12, 1.5, 0.28);
  } else {
    _shoulder.set(0.26, 1.4, 0.18);
  }
  _shoulder.y += recoil * 0.04;
  _shoulder.z -= recoil * 0.06;
  parts.aimPivot.position.copy(_shoulder);
  parts.aimPivot.visible = true;

  // Aim at a far point on the look ray so barrel converges on the crosshair target
  _aimPoint.copy(_forward).multiplyScalar(50).add(new THREE.Vector3(0, 1.55, 0));
  _forward.copy(_aimPoint).sub(_shoulder).normalize();
  _quat.setFromUnitVectors(_zAxis, _forward);
  parts.aimPivot.quaternion.copy(_quat);

  // Recoil kicks the muzzle up slightly without breaking aim lock
  parts.gunMount.rotation.x = -recoil * 0.4;
  parts.gunMount.position.set(0, -0.02 + recoil * 0.02, -0.15 - recoil * 0.05);

  // Pose arms to cradle the aimed rifle
  const raise = 1.2 + aimPitch * 0.7 + (aiming ? 0.25 : 0);
  parts.rightArm.rotation.set(-raise - recoil * 0.35, aiming ? -0.15 : -0.05, aiming ? 0.05 : -0.1);
  parts.leftArm.rotation.set(
    -(raise * 0.9) - recoil * 0.2,
    aiming ? 0.35 : 0.2,
    aiming ? 0.55 : 0.4,
  );
}

function animateClimb(parts: CharacterParts, time: number, moving: boolean) {
  // Hug the trunk / perch in canopy — keep body compact for leaf cover
  parts.torso.rotation.x = 0.25;
  parts.torso.rotation.z = 0;
  parts.head.rotation.x = 0.15;
  parts.aimPivot.visible = true;
  parts.aimPivot.position.set(0.2, 1.35, 0.12);
  parts.aimPivot.rotation.set(-0.2, 0.1, 0);
  parts.gunMount.rotation.set(0, 0, 0);
  parts.gunMount.position.set(0, 0, -0.1);

  const reach = moving ? Math.sin(time * 6) * 0.35 : 0;
  parts.leftArm.rotation.set(-2.1 + reach, 0.4, 0.9);
  parts.rightArm.rotation.set(-1.9 - reach, -0.35, -0.7);
  parts.leftLeg.rotation.set(0.55 + reach * 0.4, 0.15, 0.2);
  parts.rightLeg.rotation.set(0.35 - reach * 0.4, -0.1, -0.25);
}

function animateCrawl(parts: CharacterParts, time: number, moving: boolean) {
  // Flatten onto the ground so crawl is obvious from third-person
  // Pose offset applied by renderer (do not write world Y here)
  parts.torso.rotation.x = -1.35;
  parts.torso.rotation.z = 0;
  parts.head.rotation.x = 0.55;
  parts.head.rotation.y = 0;
  parts.aimPivot.visible = false;
  parts.gunMount.rotation.set(0, 0, 0);
  parts.gunMount.position.set(0, 0, 0);

  const crawl = moving ? Math.sin(time * 8) * 0.7 : 0;
  parts.leftArm.rotation.set(-1.55 + crawl, 0.35, 1.1);
  parts.rightArm.rotation.set(-1.55 - crawl, -0.35, -1.1);
  parts.leftLeg.rotation.set(0.15 + crawl * 0.5, 0.1, 0.25);
  parts.rightLeg.rotation.set(0.15 - crawl * 0.5, -0.1, -0.25);
}

/** @deprecated use animateCombat */
export function animateWalk(
  parts: CharacterParts,
  time: number,
  moving: boolean,
  _speed = 1,
  aimPitch = 0,
) {
  animateCombat(parts, time, moving, aimPitch, false, 0);
}
