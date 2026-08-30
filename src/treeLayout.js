import * as d3 from 'd3';

/**
 * Seeded PRNG helper for deterministic organic irregularity.
 */
export function seedHash(str) {
  let hash = 0;
  if (!str) return 0.5;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

/**
 * Low-frequency seeded noise for lumpy/irregular canopy silhouette.
 */
export function silhouetteNoise(angle) {
  const s1 = Math.sin(angle * 2.5 + 1.2) * 0.08;
  const s2 = Math.sin(angle * 5.0 - 0.8) * 0.05;
  const s3 = Math.cos(angle * 3.7 + 2.1) * 0.04;
  return s1 + s2 + s3; // ±15% variation
}

/**
 * Computes subtree leaf counts and marks terminal leaves.
 */
export function computeSubtreeSizes(root) {
  root.eachAfter(node => {
    if (!node.children || node.children.length === 0) {
      node.subtreeSize = 1;
      node.isLeafNode = true;
    } else {
      let sum = 0;
      for (const child of node.children) {
        sum += child.subtreeSize || 1;
      }
      node.subtreeSize = Math.max(1, sum);
      node.isLeafNode = false;
    }
  });
}

/**
 * In-Order Traversal (Right-to-Left for RTL) to collect all leaves in order.
 * Subtrees occupy strictly contiguous index intervals, making crossings impossible.
 */
export function collectOrderedLeaves(root) {
  const leaves = [];
  function traverse(node) {
    if (!node.children || node.children.length === 0) {
      node.leafIndex = leaves.length;
      leaves.push(node);
      return;
    }
    // Sibling order: Right to Left (first child on right, last on left)
    for (let i = 0; i < node.children.length; i++) {
      traverse(node.children[i]);
    }
  }
  traverse(root);
  return leaves;
}

/**
 * Main Botanical Layout Engine — Leaf-Indexed Arc Allocation (Reingold-Tilford in Polar Form)
 */
export function buildBotanicalLayout(treeData, options = {}) {
  const {
    width = 3800,
    height = 3000,
    trunkBaseY = height - 240,
    trunkCenterX = width / 2,
    rootTrunkLength = 340,
    rootBaseWidth = 54,
    sectorSpanDeg = 155,
    singleLimbMode = false
  } = options;

  const rootId = treeData.rootId || treeData.persons[0]?.id;

  let personList = treeData.persons;
  if (singleLimbMode) {
    const personMapTemp = new Map(personList.map(p => [p.id, p]));
    const rootP = personMapTemp.get(rootId);
    const validIds = new Set([rootId]);

    let curr = rootP;
    for (let gen = 0; gen < 3; gen++) {
      const children = personList.filter(p => p.fatherId === curr.id);
      children.forEach(c => validIds.add(c.id));
      if (children.length > 0) curr = children[0];
    }
    personList = personList.filter(p => validIds.has(p.id));
  }

  const personMap = new Map(personList.map(p => [p.id, p]));

  // 1. Build D3 Hierarchy
  const stratify = d3.stratify()
    .id(d => d.id)
    .parentId(d => d.fatherId);

  const root = stratify(personList);
  computeSubtreeSizes(root);

  // 2. Part A - Step 1: Collect Ordered Leaves (Right-to-Left for RTL)
  const orderedLeaves = collectOrderedLeaves(root);
  const N = orderedLeaves.length || 1;

  // 3. Part A - Step 3 & 4: Arc Allocation & R_min Calculation
  const sectorWidthRad = (sectorSpanDeg * Math.PI) / 180; // ~2.705 rad for 155 deg
  const rightmostAngle = -Math.PI / 2 + sectorWidthRad / 2; // Right side start (~-8.5 deg)
  const leftmostAngle = -Math.PI / 2 - sectorWidthRad / 2;  // Left side end (~-171.5 deg)

  // R_min = 34 * N / (3 * sectorWidth * 0.74)
  const R_min = (34 * N) / (3 * sectorWidthRad * 0.74);
  const baseCanopyRadius = Math.max(R_min / 0.74 + 180, 1150);

  // 4. Part A - Step 2 & 3: Place Leaves by Index into 3 Radial Bands with Irregular Silhouette
  const radialBands = [0.74, 0.94, 1.14];

  orderedLeaves.forEach((leafNode, idx) => {
    // Exact angular position across 155° sector (Right to Left)
    const t = (idx + 0.5) / N;
    const baseAngle = rightmostAngle - t * sectorWidthRad;

    // Part B - Step 11: Irregular Silhouette Noise (±15%)
    const noise = silhouetteNoise(baseAngle);
    const effectiveRadius = baseCanopyRadius * (1.0 + noise);

    // Part A - Step 2: Radial Banding (band = idx % 3)
    const band = idx % 3;
    const bandMultiplier = radialBands[band];

    // Part A - Step 6: Organic ±12% length jitter seeded off node id
    const jitter = (seedHash(leafNode.data.id + '_rad') - 0.5) * 0.24; // ±12%
    const leafRadius = effectiveRadius * bandMultiplier * (1 + jitter);

    leafNode.targetAngle = baseAngle;
    leafNode.targetRadius = leafRadius;

    // World coordinates for leaf tip
    leafNode.x3 = trunkCenterX + Math.cos(baseAngle) * leafRadius * 1.05;
    leafNode.y3 = trunkBaseY + Math.sin(baseAngle) * leafRadius * 0.85;

    // Upward clamping
    if (leafNode.y3 > trunkBaseY - 100) {
      leafNode.y3 = trunkBaseY - 100;
    }
  });

  // 5. Part A - Step 5: Internal nodes follow children (Polar Reingold-Tilford)
  const maxDepth = d3.max(root.descendants(), d => d.depth) || 1;
  const depthRadiusStep = (baseCanopyRadius * 0.65) / (maxDepth + 1);

  // Find 2 or 3 highest-leaf-count depth-1 subtrees for long sweeping limbs (Part B - Step 9)
  const depth1Subtrees = (root.children || []).slice().sort((a, b) => (b.subtreeSize || 1) - (a.subtreeSize || 1));
  const sweepingLimbs = new Set(depth1Subtrees.slice(0, 3).map(d => d.data.id));

  // Compute angles & radii for internal nodes bottom-up
  root.eachAfter(node => {
    node.personMap = personMap;
    if (node === root) {
      node.targetAngle = -Math.PI / 2;
      node.x0 = trunkCenterX;
      node.y0 = trunkBaseY;
      node.x3 = trunkCenterX;
      node.y3 = trunkBaseY - rootTrunkLength;
      node.baseWidth = rootBaseWidth;
      node.tipWidth = Math.max(16, rootBaseWidth * 0.55);
      node.exitTangent = -Math.PI / 2;
      return;
    }

    if (!node.children || node.children.length === 0) {
      // Leaf node angles already set
      return;
    }

    // Mean of children's target angles
    let sumAngle = 0;
    node.children.forEach(c => {
      sumAngle += c.targetAngle !== undefined ? c.targetAngle : -Math.PI / 2;
    });
    node.targetAngle = sumAngle / node.children.length;

    // Internal node position
    const isTrunk = !!node.data.isTrunkLineage;
    const isSweeping = sweepingLimbs.has(node.data.id);

    if (isTrunk) {
      node.x3 = trunkCenterX;
      node.y3 = trunkBaseY - rootTrunkLength - node.depth * depthRadiusStep * 0.9;
    } else if (isSweeping && node.depth === 1) {
      // Part B - Step 9: Long sweeping limb crossing trunk axis
      const sweepSide = (seedHash(node.data.id + '_side') > 0.5) ? 1 : -1;
      const sweepDist = 480 + (seedHash(node.data.id + '_sweep') - 0.5) * 100;
      node.x3 = trunkCenterX + Math.cos(node.targetAngle + sweepSide * 0.25) * sweepDist;
      node.y3 = trunkBaseY - rootTrunkLength - 120 + Math.sin(node.targetAngle) * sweepDist * 0.7;
    } else {
      const r = rootTrunkLength + node.depth * depthRadiusStep * (1 + (seedHash(node.data.id + '_dlen') - 0.5) * 0.20);
      node.x3 = trunkCenterX + Math.cos(node.targetAngle) * r * 1.05;
      node.y3 = trunkBaseY + Math.sin(node.targetAngle) * r * 0.85;
    }
  });

  // 6. Compute S-Curved Branch Geometry (Part B - Step 8) from root down to leaves
  root.eachBefore(node => {
    if (node === root) {
      computeTrunkSpineGeometry(node);
      return;
    }

    const parent = node.parent;
    node.x0 = parent.x3;
    node.y0 = parent.y3;

    // Width tapering
    node.baseWidth = parent.tipWidth;
    const parentSize = parent.subtreeSize || 1;
    const childSize = node.subtreeSize || 1;
    node.tipWidth = Math.max(
      0.8,
      node.baseWidth * Math.sqrt(childSize / parentSize)
    );

    // Compute S-curve Bézier control points
    computeSCurveSpineGeometry(node, parent.exitTangent);
  });

  return {
    root,
    personMap,
    rootId,
    maxDepth,
    orderedLeaves,
    N,
    R_min: Math.round(R_min),
    baseCanopyRadius: Math.round(baseCanopyRadius)
  };
}

/**
 * Computes straight majestic vertical trunk geometry.
 */
function computeTrunkSpineGeometry(rootNode) {
  const x0 = rootNode.x0;
  const y0 = rootNode.y0;
  const x3 = rootNode.x3;
  const y3 = rootNode.y3;

  rootNode.p0 = { x: x0, y: y0 };
  rootNode.p1 = { x: x0, y: y0 - (y0 - y3) * 0.35 };
  rootNode.p2 = { x: x3, y: y3 + (y0 - y3) * 0.35 };
  rootNode.p3 = { x: x3, y: y3 };
  rootNode.exitTangent = -Math.PI / 2;
  rootNode.x = x3;
  rootNode.y = y3;
}

/**
 * Part B - Step 8: S-Curved Branch Spine Geometry
 * Compound Bézier where P1 extends along parent exit tangent (~40%)
 * and P2 approaches destination from child heading, with opposite perpendicular offsets.
 */
function computeSCurveSpineGeometry(node, parentExitTangent) {
  const x0 = node.x0;
  const y0 = node.y0;
  const x3 = node.x3;
  const y3 = node.y3;

  const dx = x3 - x0;
  const dy = y3 - y0;
  const L = Math.hypot(dx, dy) || 1;

  // Tangent at start (along parent exit tangent)
  const t0x = Math.cos(parentExitTangent);
  const t0y = Math.sin(parentExitTangent);
  const n0x = -t0y;
  const n0y = t0x;

  // Tangent at end (approaching target)
  const childHeading = Math.atan2(dy, dx);
  const t3x = Math.cos(childHeading);
  const t3y = Math.sin(childHeading);
  const n3x = -t3y;
  const n3y = t3x;

  // Seeded perpendicular offsets of opposite sign (producing organic S-curve)
  const s1 = (seedHash(node.data.id + '_s1') - 0.5) * 0.28 * L;
  const s2 = -s1 * 0.85;

  let p1x = x0 + t0x * (0.40 * L) + n0x * s1;
  let p1y = y0 + t0y * (0.40 * L) + n0y * s1;

  let p2x = x3 - t3x * (0.40 * L) + n3x * s2;
  let p2y = y3 - t3y * (0.40 * L) + n3y * s2;

  // Part B - Step 12: Slight droop at twig tips (last 15% of terminal branches)
  if (node.isLeafNode || !node.children || node.children.length === 0) {
    const droop = 8.0 + seedHash(node.data.id + '_droop') * 8.0;
    p2y += droop * 0.5;
  }

  // Upward growth clamp
  if (p1y > y0) p1y = y0;
  if (p2y > y0) p2y = y0;

  node.p0 = { x: x0, y: y0 };
  node.p1 = { x: p1x, y: p1y };
  node.p2 = { x: p2x, y: p2y };
  node.p3 = { x: x3, y: y3 };

  // Exit tangent at tip (derivative B'(1) = 3 * (P3 - P2))
  const exitDx = x3 - p2x;
  const exitDy = y3 - p2y;
  node.exitTangent = Math.atan2(exitDy, exitDx);

  node.x = x3;
  node.y = y3;
}
