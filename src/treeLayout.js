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

// Leaf-cluster ("twig") geometry constants. A twig is the shared branch a
// group of up to 3 sibling leaves grows off of, sampled at these t-fractions
// along the twig's own finished Bézier spine (see collectOrderedTwigs and
// applyTwigMemberSampling).
const TWIG_T_BY_COUNT = { 1: [1.0], 2: [0.7, 1.0], 3: [0.45, 0.72, 1.0] };
const TWIG_MIN_SPACING_PX = 40;
const TWIG_LEAF_HEIGHT_PX = 22;

function minConsecutiveDiff(arr) {
  let min = Infinity;
  for (let i = 1; i < arr.length; i++) min = Math.min(min, arr[i] - arr[i - 1]);
  return min;
}

function balancedChunks(arr, maxSize) {
  const n = arr.length;
  if (n === 0) return [];
  const numChunks = Math.ceil(n / maxSize);
  const base = Math.floor(n / numChunks);
  const remainder = n % numChunks;
  const chunks = [];
  let idx = 0;
  for (let c = 0; c < numChunks; c++) {
    const size = base + (c < remainder ? 1 : 0);
    chunks.push(arr.slice(idx, idx + size));
    idx += size;
  }
  return chunks;
}

/**
 * In-Order Traversal (Right-to-Left for RTL) to collect all leaves in order,
 * AND to group each parent's leaf children into "twigs" of up to 3 — a
 * shared branch that a small cluster of sibling leaves grows off of, matching
 * the reference poster's leaf clusters rather than one branch per leaf.
 * Subtrees occupy strictly contiguous index intervals, making crossings impossible.
 */
export function collectOrderedTwigs(root) {
  const leaves = [];
  const twigs = [];

  function flushPool(pool, parent) {
    if (pool.length === 0) return;
    balancedChunks(pool, 3).forEach(chunk => {
      const representative = chunk[chunk.length - 1];
      const twig = { id: representative.data.id, parent, members: chunk, representative };
      chunk.forEach((m, i) => {
        m.twigGroup = twig;
        m.twigMemberIndex = i;
        m.clusterId = twig.id;
      });
      twigs.push(twig);
    });
  }

  function traverse(node) {
    if (!node.children || node.children.length === 0) {
      node.leafIndex = leaves.length;
      leaves.push(node);
      return;
    }
    // Sibling order: Right to Left (first child on right, last on left).
    // Leaf children are pooled and chunked into twigs; non-leaf children are
    // recursed into normally (flushing whatever leaf pool preceded them, so
    // an interleaved non-leaf sibling never merges leaves from both sides
    // of it into one twig).
    let pool = [];
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (!child.children || child.children.length === 0) {
        child.leafIndex = leaves.length;
        leaves.push(child);
        pool.push(child);
      } else {
        flushPool(pool, node);
        pool = [];
        traverse(child);
      }
    }
    flushPool(pool, node);
  }
  traverse(root);
  return { leaves, twigs };
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
    sectorSpanDeg = 230,
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

  // 2. Part A - Step 1: Collect Ordered Leaves & group them into twigs
  // (clusters of up to 3 sibling leaves sharing one branch — see collectOrderedTwigs)
  const { leaves: orderedLeaves, twigs: orderedTwigs } = collectOrderedTwigs(root);
  const N = orderedTwigs.length || 1;

  // 3. Part A - Step 3 & 4: Arc Allocation & R_min Calculation
  // Fix 2: widened to 230° (was 155°) so outer edges reach ~25° past horizontal on
  // both flanks, letting small lineages lean down beside the trunk instead of stopping
  // dead at horizontal.
  const sectorWidthRad = (sectorSpanDeg * Math.PI) / 180; // ~4.014 rad for 230 deg
  const rightmostAngle = -Math.PI / 2 + sectorWidthRad / 2; // Right side start (~25 deg, past horizontal)
  const leftmostAngle = -Math.PI / 2 - sectorWidthRad / 2;  // Left side end (~-205 deg, past horizontal)

  // R_min = 52 * N / (3 * sectorWidth * 0.74). N is now twig count, not leaf
  // count — a twig with alternating clustered members is wider than one leaf
  // (leaf height 23px + up to ~2x the nudge), so the clearance term is 52,
  // not 34, or angular slots would be spaced for a single leaf and quietly
  // collide once clusters exist.
  const R_min = (52 * N) / (3 * sectorWidthRad * 0.74);
  const baseCanopyRadius = Math.max(R_min / 0.74 + 180, 1150);

  // 4. Part A - Step 2 & 3: Place Twigs by Index into 3 Radial Bands with Irregular Silhouette
  const radialBands = [0.74, 0.94, 1.14];

  orderedTwigs.forEach((twig, idx) => {
    const repNode = twig.representative;

    // Exact angular position across the sector (Right to Left)
    const t = (idx + 0.5) / N;
    const baseAngle = rightmostAngle - t * sectorWidthRad;

    // Part B - Step 11: Irregular Silhouette Noise (±15%)
    const noise = silhouetteNoise(baseAngle);
    const effectiveRadius = baseCanopyRadius * (1.0 + noise);

    // Part A - Step 2: Radial Banding (band = idx % 3)
    const band = idx % 3;
    const bandMultiplier = radialBands[band];

    // Part A - Step 6: Organic ±12% length jitter seeded off node id
    const jitter = (seedHash(repNode.data.id + '_rad') - 0.5) * 0.24; // ±12%
    const leafRadius = effectiveRadius * bandMultiplier * (1 + jitter);

    repNode.targetAngle = baseAngle;
    repNode.targetRadius = leafRadius;
    // World coordinates computed later from the owning limb's origin (Fix 1)

    // Other twig members share the representative's angle (needed by the
    // ancestor angle-averaging pass below); their own position comes later
    // from sampling the representative's finished spine, not polar radius.
    twig.members.forEach(m => { if (m !== repNode) m.targetAngle = baseAngle; });
  });

  // 5. Part A - Step 5: Internal node ANGLES follow children (bottom-up mean)
  const maxDepth = d3.max(root.descendants(), d => d.depth) || 1;
  const depthRadiusStep = (baseCanopyRadius * 0.65) / (maxDepth + 1);

  // Find 2 or 3 highest-leaf-count depth-1 subtrees for long sweeping limbs (Part B - Step 9)
  const depth1Subtrees = (root.children || []).slice().sort((a, b) => (b.subtreeSize || 1) - (a.subtreeSize || 1));
  const sweepingLimbs = new Set(depth1Subtrees.slice(0, 3).map(d => d.data.id));

  root.eachAfter(node => {
    node.personMap = personMap;
    if (node === root) {
      node.targetAngle = -Math.PI / 2;
      return;
    }
    if (!node.children || node.children.length === 0) return; // leaf angles already set

    let sumAngle = 0;
    node.children.forEach(c => {
      sumAngle += c.targetAngle !== undefined ? c.targetAngle : -Math.PI / 2;
    });
    node.targetAngle = sumAngle / node.children.length;
  });

  // Fix 1: depth-1 limbs attach along the trunk (35%–100% of its length), not at a single apex
  const attachments = assignLimbAttachments(root, { trunkCenterX, trunkBaseY, rootTrunkLength });

  // Positions top-down so every node inherits its owning limb's origin
  root.eachBefore(node => {
    if (node === root) {
      node.x0 = trunkCenterX;
      node.y0 = trunkBaseY;
      node.x3 = trunkCenterX;
      node.y3 = trunkBaseY - rootTrunkLength;
      node.baseWidth = rootBaseWidth;
      node.tipWidth = Math.max(16, rootBaseWidth * 0.55);
      node.exitTangent = -Math.PI / 2;
      node.limbOrigin = null;
      return;
    }

    if (node.twigGroup && node.twigGroup.representative !== node) {
      // Non-representative twig member: positioned later by
      // applyTwigMemberSampling, from the representative's finished spine.
      return;
    }

    const isTrunk = !!node.data.isTrunkLineage;

    // Depth-1 limbs got their own origin in assignLimbAttachments; descendants inherit it
    if (!node.limbOrigin) node.limbOrigin = node.parent.limbOrigin || null;

    if (isTrunk) {
      node.limbOrigin = null;
      node.x3 = trunkCenterX;
      node.y3 = trunkBaseY - rootTrunkLength - node.depth * depthRadiusStep * 0.9;
      return;
    }

    const origin = node.limbOrigin;
    const cx = origin ? origin.x : trunkCenterX;
    const cy = origin ? origin.y : trunkBaseY;
    // Trunk length not consumed by the attachment height — keeps overall reach comparable
    const originLead = origin ? rootTrunkLength * (1 - origin.frac) : rootTrunkLength;

    if (!node.children || node.children.length === 0) {
      // Terminal leaf (twig representative): polar placement around the
      // owning limb origin
      let x3 = cx + Math.cos(node.targetAngle) * node.targetRadius * 1.05;
      let y3 = cy + Math.sin(node.targetAngle) * node.targetRadius * 0.85;

      // Cluster fix: scale the twig's own length (parent tip -> this node)
      // with member count, so a multi-leaf cluster has room along the spine.
      // One member keeps today's natural length (scale 1); three members get
      // ~1.7x. Also enforce the 40px along-twig spacing floor analytically —
      // if the natural length is too short for the widened t-spread to clear
      // 40px between adjacent members, extend it (with a 10% safety margin
      // for chord-vs-arc-length approximation on the S-curve).
      const twig = node.twigGroup;
      if (twig && twig.representative === node) {
        const px = node.parent.x3, py = node.parent.y3;
        const naturalDx = x3 - px, naturalDy = y3 - py;
        const naturalLen = Math.hypot(naturalDx, naturalDy);

        // The "natural" parent->leaf vector can be degenerately short (the
        // leaf's own polar radius and the parent's depth-based radius can
        // nearly coincide for some nodes — a rough edge of the pre-existing
        // radius formulas, not something this fix should amplify). Below a
        // floor, both its length AND its direction are unreliable, so fall
        // back to a stable direction (targetAngle, same aspect convention
        // used above) and a stable minimum base length instead of scaling a
        // near-zero vector — a small naturalLen otherwise turns into a huge
        // multiplier and catapults the branch far outside the canopy.
        const MIN_BASE_LEN = 60;
        let dirX, dirY, baseLen;
        if (naturalLen < MIN_BASE_LEN) {
          const rawX = Math.cos(node.targetAngle) * 1.05;
          const rawY = Math.sin(node.targetAngle) * 0.85;
          const rawLen = Math.hypot(rawX, rawY) || 1;
          dirX = rawX / rawLen;
          dirY = rawY / rawLen;
          baseLen = MIN_BASE_LEN;
        } else {
          dirX = naturalDx / naturalLen;
          dirY = naturalDy / naturalLen;
          baseLen = naturalLen;
        }

        const memberCount = twig.members.length;
        let scale = 1 + 0.35 * (memberCount - 1);

        if (memberCount > 1) {
          const tValues = TWIG_T_BY_COUNT[memberCount] || TWIG_T_BY_COUNT[3];
          const minTGap = minConsecutiveDiff(tValues);
          const requiredLen = (TWIG_MIN_SPACING_PX / minTGap) * 1.1;
          if (baseLen * scale < requiredLen) scale = requiredLen / baseLen;
        }

        x3 = px + dirX * baseLen * scale;
        y3 = py + dirY * baseLen * scale;
      }

      node.x3 = x3;
      node.y3 = y3;
      if (node.y3 > trunkBaseY - 100) node.y3 = trunkBaseY - 100;
      return;
    }

    if (sweepingLimbs.has(node.data.id) && node.depth === 1) {
      // Part B - Step 9: Long sweeping limb crossing trunk axis
      const sweepSide = (seedHash(node.data.id + '_side') > 0.5) ? 1 : -1;
      const sweepDist = 480 + (seedHash(node.data.id + '_sweep') - 0.5) * 100;
      node.x3 = cx + Math.cos(node.targetAngle + sweepSide * 0.25) * sweepDist;
      node.y3 = cy - 120 + Math.sin(node.targetAngle) * sweepDist * 0.7;
      return;
    }

    const r = originLead + node.depth * depthRadiusStep * (1 + (seedHash(node.data.id + '_dlen') - 0.5) * 0.20);
    node.x3 = cx + Math.cos(node.targetAngle) * r * 1.05;
    node.y3 = cy + Math.sin(node.targetAngle) * r * 0.85;
  });

  // 6. Compute S-Curved Branch Geometry (Part B - Step 8) from root down to leaves
  root.eachBefore(node => {
    if (node === root) {
      computeTrunkSpineGeometry(node);
      return;
    }

    if (node.twigGroup && node.twigGroup.representative !== node) {
      // No branch of its own — the twig's one physical branch belongs to
      // the representative; this member is anchored by applyTwigMemberSampling.
      return;
    }

    const parent = node.parent;
    const isLimbRoot = node.depth === 1 && !node.data.isTrunkLineage && node.limbOrigin;

    let startTangent;
    if (isLimbRoot) {
      // Fix 1: limb grows from its own trunk attachment, not the apex
      node.x0 = node.limbOrigin.x;
      node.y0 = node.limbOrigin.y;
      // Trunk is thicker lower down: interpolate base→tip width at the attach height
      node.baseWidth = rootBaseWidth + (root.tipWidth - rootBaseWidth) * node.limbOrigin.frac;
      startTangent = node.limbOrigin.entryTangent;
    } else {
      node.x0 = parent.x3;
      node.y0 = parent.y3;
      node.baseWidth = parent.tipWidth;
      startTangent = parent.exitTangent;
    }

    // Width tapering
    const parentSize = parent.subtreeSize || 1;
    const childSize = node.subtreeSize || 1;
    node.tipWidth = Math.max(
      0.8,
      node.baseWidth * Math.sqrt(childSize / parentSize)
    );

    // Compute S-curve Bézier control points
    computeSCurveSpineGeometry(node, startTangent);
  });

  // 7. Cluster fix: position non-representative twig members by sampling
  // each twig's now-finished spine (must run after the geometry pass above)
  applyTwigMemberSampling(orderedTwigs, trunkBaseY - 100);

  return {
    root,
    personMap,
    rootId,
    maxDepth,
    orderedLeaves,
    orderedTwigs,
    N,
    R_min: Math.round(R_min),
    baseCanopyRadius: Math.round(baseCanopyRadius),
    attachments,
    radialBands,
    depthRadiusStep,
    sector: { rightmostAngle, leftmostAngle, sectorSpanDeg },
    layoutOpts: { width, height, trunkBaseY, trunkCenterX, rootTrunkLength, rootBaseWidth }
  };
}

/**
 * Cluster fix: samples a cubic Bézier at parameter t, returning both the
 * point and the tangent angle (derivative direction) there.
 */
function sampleCubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
  const y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;
  const dx = 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const dy = 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  return { x, y, tangent: Math.atan2(dy, dx) };
}

/**
 * Cluster fix: for every twig with more than one member, samples the
 * representative's finished spine at the widened t-spread
 * ([0.45, 0.72, 1.0] for 3, [0.7, 1.0] for 2), nudges non-tip members a
 * small perpendicular distance off the local tangent (alternating sides),
 * and records the minimum along-twig spacing actually achieved for
 * verification. The tip member (t=1.0, the representative itself) gets no
 * nudge — it sits exactly at the branch tip.
 */
function applyTwigMemberSampling(twigs, grassClampY) {
  twigs.forEach(twig => {
    const { members, representative: rep } = twig;
    if (members.length <= 1) {
      twig.minMemberSpacing = null;
      return;
    }
    if (!rep.p0 || !rep.p1 || !rep.p2 || !rep.p3) return;

    const tValues = TWIG_T_BY_COUNT[members.length] || TWIG_T_BY_COUNT[3];
    const sampled = tValues.map(t => sampleCubicBezier(rep.p0, rep.p1, rep.p2, rep.p3, t));

    members.forEach((member, i) => {
      const s = sampled[i];
      const isTip = i === members.length - 1;
      const sign = (i % 2 === 0) ? 1 : -1;
      const nudgeFrac = 0.35 + seedHash(member.data.id + '_twigSide') * 0.25; // 0.35-0.6 of leaf height
      const nudgePx = isTip ? 0 : nudgeFrac * TWIG_LEAF_HEIGHT_PX;
      const nx = Math.cos(s.tangent + Math.PI / 2);
      const ny = Math.sin(s.tangent + Math.PI / 2);
      member.x3 = s.x + nx * nudgePx * sign;
      // Same grass-line ceiling the representative's own placement enforces
      // (treeLayout.js's leaf-placement block) — an S-curve's droop/bulge can
      // otherwise carry an intermediate sample below the clamped tip.
      member.y3 = Math.min(s.y + ny * nudgePx * sign, grassClampY);
      member.exitTangent = s.tangent;
      // LineageTracer reads .x/.y (not .x3/.y3) for its ancestor path — every
      // other node type gets these set inside computeSCurveSpineGeometry /
      // computeTrunkSpineGeometry, which non-representative members skip.
      member.x = member.x3;
      member.y = member.y3;
    });

    let minGap = Infinity;
    for (let i = 1; i < members.length; i++) {
      minGap = Math.min(minGap, Math.hypot(
        members[i].x3 - members[i - 1].x3,
        members[i].y3 - members[i - 1].y3
      ));
    }

    if (minGap < TWIG_MIN_SPACING_PX) {
      // The grass clamp above can flatten every member to the same Y (a twig
      // lying almost along the grass line), collapsing spacing down to
      // whatever X-spread happened to survive. Y is already correctly
      // clamped and must not move; restore the floor by stretching members
      // along X around their shared centroid instead (safe here since the
      // clamped case is effectively colinear along X).
      const cx = members.reduce((sum, m) => sum + m.x3, 0) / members.length;
      const stretch = (TWIG_MIN_SPACING_PX * 1.1) / Math.max(minGap, 1);
      members.forEach(m => { m.x3 = cx + (m.x3 - cx) * stretch; m.x = m.x3; });
      minGap = Infinity;
      for (let i = 1; i < members.length; i++) {
        minGap = Math.min(minGap, Math.hypot(
          members[i].x3 - members[i - 1].x3,
          members[i].y3 - members[i - 1].y3
        ));
      }
    }

    twig.minMemberSpacing = minGap;
  });
}

/**
 * Fix 1: Depth-1 limbs attach along the trunk at 35%–100% of its length.
 * Most lateral / downward-leaning limbs attach lowest; most vertical at the apex.
 * Deterministic: sort keyed on mean child angle with id tie-break, jitter seeded on id.
 */
export function assignLimbAttachments(root, { trunkCenterX, trunkBaseY, rootTrunkLength }) {
  const limbs = (root.children || []).filter(c => !c.data.isTrunkLineage);
  if (limbs.length === 0) return [];

  const laterality = limb => {
    const dev = Math.abs(normalizeSignedAngle(limb.targetAngle + Math.PI / 2));
    const beyondHorizontal = Math.max(0, dev - Math.PI / 2);
    return dev + 0.75 * beyondHorizontal; // downward lean weighted extra
  };

  // Most lateral first → attaches lowest
  const sorted = limbs.slice().sort((a, b) =>
    (laterality(b) - laterality(a)) || (a.data.id < b.data.id ? -1 : 1)
  );

  const attachments = [];
  sorted.forEach((limb, i) => {
    let frac = sorted.length === 1 ? 1.0 : 0.35 + (i / (sorted.length - 1)) * 0.65;
    frac += (seedHash(limb.data.id + '_attach') - 0.5) * 0.06;
    frac = Math.max(0.35, Math.min(1.0, frac));

    // Leave the trunk partway between vertical and the limb's own heading
    const dev = normalizeSignedAngle(limb.targetAngle + Math.PI / 2);
    const entryTangent = -Math.PI / 2 + 0.6 * dev;

    limb.limbOrigin = {
      x: trunkCenterX,
      y: trunkBaseY - frac * rootTrunkLength,
      frac,
      entryTangent
    };

    attachments.push({
      id: limb.data.id,
      name: limb.data.name,
      frac: +frac.toFixed(3),
      x: limb.limbOrigin.x,
      y: Math.round(limb.limbOrigin.y),
      meanAngleDeg: Math.round((limb.targetAngle * 180) / Math.PI),
      subtreeSize: limb.subtreeSize
    });
  });

  return attachments;
}

function normalizeSignedAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
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
