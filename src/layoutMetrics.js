import * as d3 from 'd3';

/**
 * Layout self-metrics — computed from the layout model (not the DOM) so numbers
 * are reproducible headlessly and comparable against browser-side verification.
 *
 * Conventions match scripts/verify_metrics_and_screenshots.js:
 *   leaf center = anchor + 23px along exit tangent; collision when center dist < 38.
 * Branch spines sampled at 8 points; two branches collide when any sample pair
 * is closer than 12px and neither node is an ancestor of the other.
 */

const LEAF_MIN_CENTER_DIST = 38;
const BRANCH_MIN_DIST = 12;
const BRANCH_SAMPLES = 8;
const FILL_CELL = 60;

function bezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
  };
}

export function computeLayoutMetrics(layoutResult) {
  const { root, R_min, baseCanopyRadius, layoutOpts, attachments, orderedTwigs, N } = layoutResult;
  const { trunkBaseY, trunkCenterX } = layoutOpts;
  const descendants = root.descendants();

  // ---------- Leaf centers ----------
  const leaves = descendants.filter(n => !n.children || n.children.length === 0);
  const leafCenters = leaves.map(n => {
    const a = n.exitTangent || 0;
    return {
      node: n,
      x: n.x3 + 23 * Math.cos(a),
      y: n.y3 + 23 * Math.sin(a)
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

  samples.forEach(s => {
    qt.visit((qn, x0, y0, x1, y1) => {
      if (!qn.length) {
        let q = qn;
        do {
          const o = q.data;
          if (o.node !== s.node && Math.hypot(o.x - s.x, o.y - s.y) < BRANCH_MIN_DIST) {
            // Siblings near their shared junction are legitimate contact, not a crossing
            const siblings = o.node.parent === s.node.parent;
            const nearJunction = siblings && (o.t < 0.4 || s.t < 0.4);
            if (!isRelated(s.node, o.node) && !nearJunction) {
              const key = [s.node.data.id, o.node.data.id].sort().join('|');
              collidingPairKeys.add(key);
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

  const occupied = new Set();
  leafCenters.forEach(l => {
    occupied.add(`${Math.floor(l.x / FILL_CELL)},${Math.floor(l.y / FILL_CELL)}`);
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

  // Flanks: the two regions beside the trunk that read as empty in the broken layout
  const flankFill = (x0, x1) => {
    const y0 = trunkBaseY - 520, y1 = trunkBaseY - 80;
    let total = 0, filled = 0;
    for (let gx = Math.floor(x0 / FILL_CELL); gx <= Math.floor(x1 / FILL_CELL); gx++) {
      for (let gy = Math.floor(y0 / FILL_CELL); gy <= Math.floor(y1 / FILL_CELL); gy++) {
        total++;
        if (occupied.has(`${gx},${gy}`)) filled++;
      }
    }
    return total ? +(100 * filled / total).toFixed(1) : 0;
  };

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

  return {
    totalLeaves: leaves.length,
    twigCount: N,
    minTwigMemberSpacingPx,
    leafPairCollisions,
    branchPairCollisions: collidingPairKeys.size,
    R_min,
    radiusUsed: baseCanopyRadius,
    canopyFillPct: insideCells ? +(100 * filledCells / insideCells).toFixed(1) : 0,
    leftFlankFillPct: flankFill(trunkCenterX - 460, trunkCenterX - 80),
    rightFlankFillPct: flankFill(trunkCenterX + 80, trunkCenterX + 460),
    leafBBox: {
      minX: Math.round(minX), maxX: Math.round(maxX),
      minY: Math.round(minY), maxY: Math.round(maxY)
    },
    attachments
  };
}
