import * as d3 from 'd3';
import {
  LEAF_MIN_CENTER_DIST, LEAF_CENTER_OFFSET, LEAF_WIDTH, LEAF_HEIGHT
} from './leafGeometry.js';

/**
 * Layout self-metrics — computed from the layout model (not the DOM) so numbers
 * are reproducible headlessly and comparable against browser-side verification.
 *
 * Conventions match scripts/verify_metrics_and_screenshots.js:
 *   leaf center = anchor + 23px along exit tangent; collision when center dist < 38.
 * Branch spines sampled at 8 points; two branches collide when any sample pair
 * is closer than 12px and neither node is an ancestor of the other.
 */

const BRANCH_MIN_DIST = 12;
const BRANCH_SAMPLES = 8;
// Radius around a branch's own start point within which contact with another
// branch counts as junction structure rather than a crossing.
const JUNCTION_RADIUS = 90;
const FILL_CELL = 60;

function bezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
  };
}

function bezierDeriv(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
  };
}

export function computeLayoutMetrics(layoutResult) {
  const { root, R_min, baseCanopyRadius, layoutOpts, attachments, orderedTwigs, N, xStretchTriggerCount } = layoutResult;
  const { trunkBaseY, trunkCenterX } = layoutOpts;
  const descendants = root.descendants();

  // ---------- Leaf centers ----------
  const leaves = descendants.filter(n => !n.children || n.children.length === 0);
  const leafCenters = leaves.map(n => {
    const a = n.exitTangent || 0;
    return {
      node: n,
      x: n.x3 + LEAF_CENTER_OFFSET * Math.cos(a),
      y: n.y3 + LEAF_CENTER_OFFSET * Math.sin(a)
    };
  });

  // ---------- 1. Intersecting leaf pairs ----------
  // Leaves sharing a clusterId sit close by design and are exempt (clusters land with fix 3).
  let leafPairCollisions = 0;
  for (let i = 0; i < leafCenters.length; i++) {
    for (let j = i + 1; j < leafCenters.length; j++) {
      const a = leafCenters[i];
      const b = leafCenters[j];
      if (a.node.clusterId != null && a.node.clusterId === b.node.clusterId) continue;
      if (Math.hypot(b.x - a.x, b.y - a.y) < LEAF_MIN_CENTER_DIST) leafPairCollisions++;
    }
  }

  // ---------- 2. Colliding branch pairs (quadtree over spine samples) ----------
  const branchNodes = descendants.filter(n => n.p0 && n.p1 && n.p2 && n.p3);
  const samples = [];
  branchNodes.forEach(node => {
    for (let i = 0; i < BRANCH_SAMPLES; i++) {
      // Start at t=0.15: siblings legitimately share their junction
      const t = 0.15 + (i / (BRANCH_SAMPLES - 1)) * 0.85;
      const p = bezierPoint(node.p0, node.p1, node.p2, node.p3, t);
      samples.push({ node, t, x: p.x, y: p.y });
    }
  });

  const ancestorSets = new Map();
  descendants.forEach(n => {
    ancestorSets.set(n, new Set(n.ancestors().map(a => a.data.id)));
  });
  const isRelated = (a, b) =>
    ancestorSets.get(a).has(b.data.id) || ancestorSets.get(b).has(a.data.id);

  const qt = d3.quadtree().x(d => d.x).y(d => d.y).addAll(samples);
  const collidingPairKeys = new Set();
  // Split by whether the two branches belong to different depth-1 limbs.
  // Cross-limb crossings are the ones the nested-ordering planarity rule is
  // supposed to make impossible; within-limb ones are wedge containment's job.
  const crossLimbKeys = new Set();
  const depth1Of = n => {
    const a = n.ancestors().find(x => x.depth === 1);
    return a ? a.data.id : null;
  };

  samples.forEach(s => {
    qt.visit((qn, x0, y0, x1, y1) => {
      if (!qn.length) {
        let q = qn;
        do {
          const o = q.data;
          if (o.node !== s.node && Math.hypot(o.x - s.x, o.y - s.y) < BRANCH_MIN_DIST) {
            // Contact in a branch's own junction neighbourhood is structural,
            // not a crossing: branches are necessarily close to whatever they
            // just emerged from. This generalises an earlier siblings-only
            // rule, which missed the commonest case — a limb leaving the trunk
            // runs alongside the trunk segment above it, and the two are not
            // siblings (one's parent is the root, the other's is a trunk node).
            // A genuine crossing happens out in the canopy, far from both
            // branches' origins.
            const nearJunction =
              Math.hypot(s.x - s.node.p0.x, s.y - s.node.p0.y) < JUNCTION_RADIUS ||
              Math.hypot(o.x - o.node.p0.x, o.y - o.node.p0.y) < JUNCTION_RADIUS;
            if (!isRelated(s.node, o.node) && !nearJunction) {
              const key = [s.node.data.id, o.node.data.id].sort().join('|');
              collidingPairKeys.add(key);
              const la = depth1Of(s.node), lb = depth1Of(o.node);
              if (la && lb && la !== lb) crossLimbKeys.add(key);
            }
          }
          q = q.next;
        } while (q);
      }
      return x0 > s.x + BRANCH_MIN_DIST || x1 < s.x - BRANCH_MIN_DIST ||
             y0 > s.y + BRANCH_MIN_DIST || y1 < s.y - BRANCH_MIN_DIST;
    });
  });

  // ---------- 3. Canopy fill ----------
  const xs = leafCenters.map(l => l.x);
  const ys = leafCenters.map(l => l.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  // Mark every cell the leaf's body covers, not just the one under its centre.
  // Centre-only marking capped fill at (leaf count / cells) regardless of how
  // large the leaves actually were, so it could not register the 1.45x scale-up
  // at all and read "sparse" for two different reasons at once.
  const occupied = new Set();
  const halfW = LEAF_WIDTH / 2;
  const halfH = LEAF_HEIGHT / 2;
  leafCenters.forEach(l => {
    const gx0 = Math.floor((l.x - halfW) / FILL_CELL);
    const gx1 = Math.floor((l.x + halfW) / FILL_CELL);
    const gy0 = Math.floor((l.y - halfH) / FILL_CELL);
    const gy1 = Math.floor((l.y + halfH) / FILL_CELL);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) occupied.add(`${gx},${gy}`);
    }
  });

  // Overall: ellipse inscribed in the leaf bounding box
  const ecx = (minX + maxX) / 2, ecy = (minY + maxY) / 2;
  const erx = Math.max(1, (maxX - minX) / 2), ery = Math.max(1, (maxY - minY) / 2);
  let insideCells = 0, filledCells = 0;
  for (let gx = Math.floor(minX / FILL_CELL); gx <= Math.floor(maxX / FILL_CELL); gx++) {
    for (let gy = Math.floor(minY / FILL_CELL); gy <= Math.floor(maxY / FILL_CELL); gy++) {
      const ccx = (gx + 0.5) * FILL_CELL, ccy = (gy + 0.5) * FILL_CELL;
      const dx = (ccx - ecx) / erx, dy = (ccy - ecy) / ery;
      if (dx * dx + dy * dy <= 1) {
        insideCells++;
        if (occupied.has(`${gx},${gy}`)) filledCells++;
      }
    }
  }

  // ---------- 4. Twig-cluster spacing ----------
  // Minimum along-twig spacing actually achieved across every multi-member
  // twig (computed by applyTwigMemberSampling in treeLayout.js). Must stay
  // >= 40px per the twig-length/t-spread design; report null if no twig has
  // more than one member yet.
  const multiMemberSpacings = (orderedTwigs || [])
    .map(t => t.minMemberSpacing)
    .filter(v => v != null && isFinite(v));
  const minTwigMemberSpacingPx = multiMemberSpacings.length
    ? Math.round(Math.min(...multiMemberSpacings) * 10) / 10
    : null;

  // ---------- 5. Branch shape health: curls & below-ground ----------
  // curlCount: branches whose tangent direction turns >150° in total along
  // the spine — a visible self-curl (fix 4's wedge clamp should zero this).
  // branchesBelowTrunkBase: any spine sample below the trunk base / ground
  // line (must be 0 after fix 4's grass clamp; low-REACHING branches are
  // fine and wanted, crossing the ground is the bug).
  // branchesBelowGrassMargin: dips into the 100px strip just above the base —
  // informational, nonzero by design (poster has leaves near grass level);
  // the trunk's own spine always counts once here.
  let curlCount = 0, branchesBelowTrunkBase = 0, branchesBelowGrassMargin = 0;
  branchNodes.forEach(node => {
    let maxY = -Infinity, turn = 0, prevA = null;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const p = bezierPoint(node.p0, node.p1, node.p2, node.p3, t);
      if (p.y > maxY) maxY = p.y;
      const d = bezierDeriv(node.p0, node.p1, node.p2, node.p3, t);
      const a = Math.atan2(d.y, d.x);
      if (prevA !== null) {
        let da = a - prevA;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        turn += Math.abs(da);
      }
      prevA = a;
    }
    if (turn > (150 * Math.PI) / 180) curlCount++;
    if (maxY > trunkBaseY + 0.5) branchesBelowTrunkBase++;
    if (maxY > trunkBaseY - 100) branchesBelowGrassMargin++;
  });

  // ---------- 4b. True branch intersections ----------
  // branchPairCollisions measures PROXIMITY (<12px), which conflates two very
  // different things: branches that actually cross, and siblings running
  // near-parallel just past a shared junction. The latter is unavoidable at
  // density — every child leaves along its parent's exit tangent, so siblings
  // share a heading for the first ~40% of their length — and it is what makes
  // that count explode from 10 to 343 between the 117- and 521-leaf sets.
  // This counts real segment intersections instead, which is unambiguous:
  // two branches either cross or they do not.
  const polylines = branchNodes.map(node => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      pts.push(bezierPoint(node.p0, node.p1, node.p2, node.p3, i / 12));
    }
    return { node, pts };
  });
  const segsIntersect = (a, b, c, d) => {
    const s1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const s2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
    const s3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
    const s4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
    return (s1 > 0) !== (s2 > 0) && (s3 > 0) !== (s4 > 0);
  };
  let branchIntersections = 0;
  let crossLimbIntersections = 0;
  for (let i = 0; i < polylines.length; i++) {
    for (let j = i + 1; j < polylines.length; j++) {
      const A = polylines[i], B = polylines[j];
      if (isRelated(A.node, B.node)) continue;
      // Siblings share p0 exactly; their first segments meet there by
      // construction, which is a junction, not a crossing.
      const sib = A.node.parent === B.node.parent;
      // Same junction exemption the proximity measure uses, and for the same
      // reason: a branch meeting another near where either of them STARTS is
      // structure, not a crossing. Without it, every limb was counted as
      // crossing the trunk spine at its own attachment point — which is
      // unavoidable, since the limb originates on the trunk. That accounted
      // for all 9 "cross-limb" intersections on tree.json (each one landing
      // exactly at the limb's own attachment height).
      const nearStart = (p) =>
        Math.hypot(p.x - A.pts[0].x, p.y - A.pts[0].y) < JUNCTION_RADIUS ||
        Math.hypot(p.x - B.pts[0].x, p.y - B.pts[0].y) < JUNCTION_RADIUS;
      let hit = false;
      for (let m = sib ? 1 : 0; m < A.pts.length - 1 && !hit; m++) {
        for (let n = sib ? 1 : 0; n < B.pts.length - 1; n++) {
          if (segsIntersect(A.pts[m], A.pts[m + 1], B.pts[n], B.pts[n + 1])) {
            if (nearStart(A.pts[m])) continue;
            hit = true; break;
          }
        }
      }
      if (hit) {
        branchIntersections++;
        const la = depth1Of(A.node), lb = depth1Of(B.node);
        if (la && lb && la !== lb) crossLimbIntersections++;
      }
    }
  }

  // ---------- 5b. Junction turning ----------
  // Angle between a parent's exit tangent and the child's own chord. A child
  // whose allocated angle sits far from where its parent arrives heads back
  // the way the parent came, and the pair reads as a switchback loop — which
  // no per-branch curvature check catches, because each segment is individually
  // smooth and the reversal happens ACROSS the junction. Target: max < 70°,
  // zero above 90°.
  let junctionTurningMaxDeg = 0;
  let junctionTurningOver90 = 0;
  let junctionTurningWorstId = null;
  descendants.forEach(node => {
    const p = node.parent;
    if (!p || p.exitTangent === undefined || !node.p0 || !node.p3) return;
    // Trunk-attached units are excluded — a node whose parent is the root or
    // any spine node leaves the vertical trunk at a deliberately wide angle,
    // so a large turn there is the intended attachment, not a doubling-back.
    // Matches the exemption in constrainJunctionTurning; testing only
    // depth <= 1 missed the units hanging off deeper spine nodes.
    if (node.depth <= 1) return;
    if (p === root || p.data.isTrunkLineage) return;
    const chord = Math.atan2(node.p3.y - node.p0.y, node.p3.x - node.p0.x);
    let d = chord - p.exitTangent;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const deg = Math.abs((d * 180) / Math.PI);
    if (deg > junctionTurningMaxDeg) {
      junctionTurningMaxDeg = deg;
      junctionTurningWorstId = node.data.id;
    }
    if (deg > 90) junctionTurningOver90++;
  });

  // ---------- 5c. Per-limb angular width vs leaf share ----------
  // If arc allocation is proportional, a limb's share of the sector should
  // match its share of the leaves. A limb far wider than its leaf count
  // justifies means allocation is inserting slack — an empty wedge in the
  // canopy that no amount of silhouette noise would fix.
  const limbStats = [];
  (root.children || []).forEach(limb => {
    const limbLeaves = limb.leaves ? limb.leaves() : [];
    const angles = limbLeaves.map(l => l.targetAngle).filter(a => a !== undefined);
    if (!angles.length) return;
    const widthDeg = ((Math.max(...angles) - Math.min(...angles)) * 180) / Math.PI;
    limbStats.push({
      id: limb.data.id,
      leaves: limbLeaves.length,
      leafSharePct: +((100 * limbLeaves.length) / leaves.length).toFixed(1),
      angularWidthDeg: +widthDeg.toFixed(1),
      angularSharePct: +((100 * widthDeg) / layoutResult.sector.sectorSpanDeg).toFixed(1)
    });
  });

  // ---------- 6. Poster-grounded canopy position ----------
  // Replaces the old flank-fill boxes (80–460px beside the trunk), which were
  // unsatisfiable by construction: the innermost radial band sits at
  // 0.74 × baseCanopyRadius, outside the boxes entirely. What the poster
  // actually exhibits, measured from the reference PDF:
  //   bare trunk ≈ 25–30% of total tree height before the first major limb;
  //   lowest leaves hang within ~10–15% of the trunk base.
  const treeTopY = Math.min(...leafCenters.map(l => l.y));
  const treeHeight = Math.max(1, trunkBaseY - treeTopY);
  const lowestLeafY = Math.max(...leafCenters.map(l => l.y));
  const lowestAttachY = attachments && attachments.length
    ? Math.max(...attachments.map(a => a.y))
    : trunkBaseY;
  const bareTrunkFraction = +((trunkBaseY - lowestAttachY) / treeHeight).toFixed(3);
  const lowestLeafFrac = +((trunkBaseY - lowestLeafY) / treeHeight).toFixed(3);
  // Robust companion to lowestLeafFrac: height of the 10th-percentile-lowest
  // leaf. lowestLeafFrac can be satisfied by a couple of clamp-flattened
  // outliers while the canopy mass still floats high — this is the number
  // that tracks where foliage visually BEGINS (the actual complaint behind
  // the old flank metric). No hard target yet; drives the trunk-shortening
  // step after fix 4.
  const sortedLeafYs = leafCenters.map(l => l.y).sort((a, b) => b - a);
  const p10LeafY = sortedLeafYs[Math.floor(sortedLeafYs.length * 0.1)] ?? lowestLeafY;
  const canopyLowerEdgeFrac = +((trunkBaseY - p10LeafY) / treeHeight).toFixed(3);

  return {
    // Poster-grounded targets: bareTrunkFraction 0.25–0.30, lowestLeafFrac < 0.15
    bareTrunkFraction,
    lowestLeafFrac,
    canopyLowerEdgeFrac,
    curlCount,
    junctionTurningMaxDeg: +junctionTurningMaxDeg.toFixed(1),
    junctionTurningOver90,
    junctionTurningWorstId,
    branchesBelowTrunkBase,
    branchesBelowGrassMargin,
    totalLeaves: leaves.length,
    twigCount: N,
    minTwigMemberSpacingPx,
    // Count of twigs where the grass clamp flattened members to the same Y
    // and the X-stretch correction had to fire to restore the 40px floor —
    // each occurrence breaks the "members sit on their own twig's spine"
    // invariant. Should stay a handful; if fix 3 pushes more leaves toward
    // the flanks and this climbs, X-stretch is the wrong fix for that volume.
    xStretchTriggerCount: xStretchTriggerCount || 0,
    leafPairCollisions,
    // True crossings — the number that matters. branchPairCollisions below is
    // the older proximity measure, kept for continuity.
    branchIntersections,
    crossLimbIntersections,
    branchPairCollisions: collidingPairKeys.size,
    crossLimbCrossings: crossLimbKeys.size,
    withinLimbCrossings: collidingPairKeys.size - crossLimbKeys.size,
    limbOrderingViolations: layoutResult.limbOrderingViolations ?? null,
    bandCount: layoutResult.bandCount,
    bindingConstraint: layoutResult.bindingConstraint,
    maxPerTwig: layoutResult.maxPerTwig,
    R_min,
    radiusUsed: baseCanopyRadius,
    canopyAspect: +((maxX - minX) / Math.max(1, maxY - minY)).toFixed(2),
    minBranchWidthPx: +Math.min(...descendants
      .filter(n => n.tipWidth != null).map(n => n.tipWidth)).toFixed(2),
    canopyFillPct: insideCells ? +(100 * filledCells / insideCells).toFixed(1) : 0,
    limbStats,
    leafBBox: {
      minX: Math.round(minX), maxX: Math.round(maxX),
      minY: Math.round(minY), maxY: Math.round(maxY)
    },
    attachments
  };
}
