import * as THREE from "three";

function bark(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0.02,
  });
}

function leaf(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.0,
  });
}

/** Seeded pseudo-random in [0, 1). */
function rnd(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Detailed climbable tree: tapered trunk, roots, branches, layered canopy.
 */
export function createDetailedTree(
  seed: number,
  height: number,
  trunkRadius: number,
): THREE.Group {
  const root = new THREE.Group();
  root.name = "tree";

  const trunkColor = rnd(seed) > 0.5 ? 0x6b4a2e : 0x5a3d24;
  const leafA = rnd(seed + 1) > 0.5 ? 0x2f6b34 : 0x3a7a3c;
  const leafB = rnd(seed + 2) > 0.5 ? 0x245a2a : 0x1f4f28;

  // Segmented tapered trunk — more segments for tall trees
  const segments = Math.max(5, Math.round(height / 2.2));
  let y = 0;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const h = height * 0.58 * (t1 - t0);
    const r0 = trunkRadius * (1.2 - t0 * 0.6);
    const r1 = trunkRadius * (1.2 - t1 * 0.6);
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, h, 8),
      bark(trunkColor),
    );
    seg.position.y = y + h * 0.5;
    seg.castShadow = true;
    seg.receiveShadow = true;
    root.add(seg);
    y += h;
  }

  // Root flares
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + seed * 0.2;
    const flare = new THREE.Mesh(
      new THREE.ConeGeometry(trunkRadius * 0.55, 0.55, 5),
      bark(trunkColor),
    );
    flare.position.set(Math.cos(a) * trunkRadius * 0.7, 0.15, Math.sin(a) * trunkRadius * 0.7);
    flare.rotation.z = Math.PI / 2;
    flare.rotation.y = -a;
    flare.castShadow = true;
    root.add(flare);
  }

  // Side branches
  const branchCount = 4 + Math.floor(rnd(seed + 3) * 3);
  for (let i = 0; i < branchCount; i++) {
    const a = rnd(seed + 10 + i) * Math.PI * 2;
    const bh = height * (0.35 + rnd(seed + 20 + i) * 0.35);
    const len = 0.55 + rnd(seed + 30 + i) * 0.7;
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.07, len, 5),
      bark(trunkColor),
    );
    branch.position.set(
      Math.cos(a) * (trunkRadius + len * 0.35),
      bh,
      Math.sin(a) * (trunkRadius + len * 0.35),
    );
    branch.rotation.z = Math.PI / 2 - 0.35;
    branch.rotation.y = -a;
    branch.castShadow = true;
    root.add(branch);

    // Leaf cluster at branch tip
    const cluster = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35 + rnd(seed + 40 + i) * 0.25, 0),
      leaf(i % 2 === 0 ? leafA : leafB),
    );
    cluster.position.set(
      Math.cos(a) * (trunkRadius + len * 0.85),
      bh + 0.15,
      Math.sin(a) * (trunkRadius + len * 0.85),
    );
    cluster.castShadow = true;
    root.add(cluster);
  }

  // Layered canopy — dense enough to conceal a climber (upper ~half of tree)
  const canopyY = height * 0.52;
  const layers = [
    { y: canopyY + 0.15, r: 1.85, color: leafA },
    { y: canopyY + 0.75, r: 1.7, color: leafB },
    { y: canopyY + 1.35, r: 1.45, color: leafA },
    { y: canopyY + 1.9, r: 1.15, color: leafB },
    { y: canopyY + 2.35, r: 0.85, color: leafA },
  ];
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const scale = 0.9 + rnd(seed + layer.y) * 0.35;
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(layer.r * scale, 1),
      leaf(layer.color),
    );
    crown.position.y = layer.y;
    crown.position.x = (rnd(seed + layer.y * 2) - 0.5) * 0.2;
    crown.position.z = (rnd(seed + layer.y * 3) - 0.5) * 0.2;
    crown.scale.y = 0.7 + rnd(seed + layer.y * 4) * 0.25;
    crown.castShadow = true;
    crown.receiveShadow = true;
    crown.userData.canopy = true;
    root.add(crown);

    // Extra filler clumps so body disappears into foliage
    for (let k = 0; k < 3; k++) {
      const a = rnd(seed + li * 17 + k) * Math.PI * 2;
      const fill = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.55 + rnd(seed + 90 + k) * 0.35, 0),
        leaf(k % 2 === 0 ? leafA : leafB),
      );
      fill.position.set(
        Math.cos(a) * (0.6 + rnd(seed + 100 + k) * 0.7),
        layer.y + (rnd(seed + 110 + k) - 0.5) * 0.4,
        Math.sin(a) * (0.6 + rnd(seed + 120 + k) * 0.7),
      );
      fill.castShadow = true;
      fill.userData.canopy = true;
      root.add(fill);
    }
  }

  // Top tip
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 1.25, 7),
    leaf(leafB),
  );
  tip.position.y = height * 0.98;
  tip.castShadow = true;
  tip.userData.canopy = true;
  root.add(tip);

  // Climb holds (visual only)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const hy = 0.5 + i * (height * 0.5) / 6;
    const hold = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.05, 0.12),
      bark(0x4a3220),
    );
    hold.position.set(Math.cos(a) * (trunkRadius + 0.02), hy, Math.sin(a) * (trunkRadius + 0.02));
    hold.rotation.y = -a;
    root.add(hold);
  }

  root.userData.trunk = root.children[0];
  root.userData.canopyMats = root.children
    .filter((c) => c instanceof THREE.Mesh)
    .map((c) => (c as THREE.Mesh).material);

  return root;
}

export function burnTreeVisual(root: THREE.Group) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material as THREE.MeshStandardMaterial;
    if (!mat?.color) return;
    const isLeaf =
      obj.geometry instanceof THREE.IcosahedronGeometry ||
      obj.geometry instanceof THREE.ConeGeometry;
    if (isLeaf) {
      mat.color.setHex(0x2a1810);
      mat.emissive = new THREE.Color(0xff5500);
      mat.emissiveIntensity = 0.75;
    } else {
      mat.color.setHex(0x1a120c);
      mat.emissive = new THREE.Color(0x000000);
      mat.emissiveIntensity = 0;
    }
  });
  root.rotation.z = (Math.random() - 0.5) * 0.55;
  root.rotation.x = 0.12 + Math.random() * 0.28;
  if (!root.getObjectByName("tree-fire")) {
    const fire = new THREE.PointLight(0xff6622, 1.4, 8);
    fire.name = "tree-fire";
    fire.position.set(0, 1.8, 0);
    root.add(fire);
  }
}
