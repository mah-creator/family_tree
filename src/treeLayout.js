import * as d3 from 'd3';
import {
  LEAF_HEIGHT, TWIG_MIN_SPACING_PX, TWIG_ANGULAR_CLEARANCE
} from './leafGeometry.js';

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
const TWIG_LEAF_HEIGHT_PX = LEAF_HEIGHT;
// Minimum radial advance of a leaf past its own parent (fix 3).
const MIN_LEAF_ADVANCE_PX = 70;
// Fix 4: angular padding added to each side of a node's subtree wedge.
const WEDGE_PAD = (4 * Math.PI) / 180;
// Depth-1 limb attachment band, as a fraction of trunk length. The floor was
// 0.35 through fixes 1–4, which left bareTrunkFraction at 0.097 against the
// poster's 0.25–0.30: limbs started almost at the ground and the trunk read as
// a stub. Raised to 0.55 (see also rootTrunkLength in main.js).
// Tuned against bareTrunkFraction (poster target 0.25–0.30) with the trunk
// COLUMN as the reference height, not the short root segment the 0.55 figure
// was originally sized against. MAX stops short of 1.0 so no limb attaches
// exactly at the column top, where the trunk's own subtree already emerges.
const ATTACH_FRAC_MIN = 0.42;
const ATTACH_FRAC_MAX = 0.94;

/**
 * Fix 4: layout angles live in one contiguous 230° interval
 * [leftmostAngle, rightmostAngle] with no wraparound, but atan2 output is
 * [-π, π] — a left-flank below-horizontal point (layout angle ≈ -195°)
 * comes back from atan2 as ≈ +165°. Map atan2 output into the sector's
 * frame before comparing against wedge bounds.
 */
function toSectorFrame(a, rightmostAngle) {
  const hi = rightmostAngle + 0.15;
  while (a > hi) a -= 2 * Math.PI;
  while (a <= hi - 2 * Math.PI) a += 2 * Math.PI;
  return a;
}

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
 * Fix 3: ranks each depth-1 lineage by its own leaf count (subtreeSize) into
 * one of the 3 radial-band tiers (large lineage -> outer, small -> inner),
 * and derives ONE global per-generation radial step from the deepest
 * lineage's own height. Every node's radius (leaf and internal alike) is
 * now built from relativeDepth * globalStep — the same base quantity for
 * both — closing the gap between two independently-tuned formulas that
 * could previously coincide near zero (see the MIN_BASE_LEN note in the
 * leaf-placement block below).
 */
function computeLineageInfo(root, availableRadialSpan, radialBands) {
  const depth1Nodes = root.children || [];
  const infoById = new Map();
  if (depth1Nodes.length === 0) {
    return { infoById, globalStep: availableRadialSpan };
  }

  // The deepest lineage's leaves must land at (not inside) the canopy radius
  // R_min was computed for — dividing the span by maxHeight, not maxHeight+1,
  // is what puts the last generation ON the rim rather than one step short of
  // it. Getting this wrong silently violates R_min's tangential-spacing
  // guarantee (leaves packed inside the radius that guarantee assumed).
  const maxHeight = Math.max(1, ...depth1Nodes.map(n => n.height || 0));
  const globalStep = availableRadialSpan / maxHeight;

  const sortedBySize = depth1Nodes.slice().sort((a, b) => (a.subtreeSize || 1) - (b.subtreeSize || 1));
  sortedBySize.forEach((node, rank) => {
    const tierIndex = Math.min(2, Math.floor((rank / sortedBySize.length) * 3));
    // The tier scales the lineage's whole PER-GENERATION step, not just its
    // final one: a small lineage genuinely terminates closer to the trunk
    // (which is what fills the flanks) instead of merely ending a few px
    // short of a big one. Applying it per-step rather than to the whole
    // accumulated radius is what keeps a leaf from landing behind its own
    // parent — internal nodes in the same lineage use this identical step.
    infoById.set(node.data.id, {
      tierIndex,
      step: globalStep * radialBands[tierIndex],
      height: node.height || 0,
      subtreeSize: node.subtreeSize || 1
    });
  });

  return { infoById, globalStep };
}

function lineageStepFor(node, lineageInfoById, globalStep) {
  const info = lineageInfoById.get(findDepth1Ancestor(node).data.id);
  return info ? info.step : globalStep;
}

function findDepth1Ancestor(node) {
  return node.ancestors().find(a => a.depth === 1) || node;
}

/**
 * Planarity by nested ordering — the rule that makes cross-limb crossings
 * impossible.
 *
 * Fix 1 gave every depth-1 limb its own trunk attachment as its polar center,
 * but arc allocation still handed out angles by global traversal index. Those
 * two don't compose: two subtrees with adjacent angular ranges but origins at
 * different heights overlap in world space, and no amount of per-node wedge
 * tightening can prevent it (fix 4 measured 42 such crossings).
 *
 * The rule: split the sector at vertical; within each half, a LOWER attachment
 * must get an angular range FURTHER from vertical. Low limbs go out wide, high
 * limbs go up — which is both how a real tree is built and what the poster
 * shows. Two limbs can only cross if their height ordering contradicts their
 * angular ordering, and this forbids exactly that, so the arrangement is
 * planar by construction rather than by tuning.
 *
 * This also inverts the old dependency: attachment height used to be derived
 * from each limb's mean child angle (which came from traversal order). Here
 * the ordering is chosen first — larger subtrees attach lower and sweep wider,
 * matching the poster's long low limbs — and angles follow from it.
 *
 * Returns twigs reordered so each limb's block sits in its allotted sector
 * position; angles are then assigned by index as before, keeping every
 * subtree's range contiguous.
 */
function planLimbLayout(root, orderedTwigs) {
  const depth1 = root.children || [];
  const trunkLimbs = depth1.filter(n => n.data.isTrunkLineage);
  const sideLimbs = depth1.filter(n => !n.data.isTrunkLineage);

  const twigsByLimb = new Map();
  orderedTwigs.forEach(t => {
    const limb = findDepth1Ancestor(t.representative);
    if (!twigsByLimb.has(limb)) twigsByLimb.set(limb, []);
    twigsByLimb.get(limb).push(t);
  });

  const bySize = (a, b) =>
    (b.subtreeSize || 1) - (a.subtreeSize || 1) || (a.data.id < b.data.id ? -1 : 1);

  // Balance the two halves by leaf count so angular space is shared fairly
  const right = [], left = [];
  let rw = 0, lw = 0;
  sideLimbs.slice().sort(bySize).forEach(limb => {
    const w = limb.subtreeSize || 1;
    if (rw <= lw) { right.push(limb); rw += w; } else { left.push(limb); lw += w; }
  });

  // Within a half, index 0 = lowest attachment = most lateral range, and that
  // slot goes to the SMALLEST lineage. "Most lateral" in a 230° sector means
  // horizontal-to-below-horizontal, which is where fix 2 widened the sector to
  // let small lineages hang down beside the trunk. Putting the largest lineage
  // there instead (tried first) splayed the two biggest subtrees dead
  // horizontal like arms and left the crown empty; big lineages belong in the
  // near-vertical range where the poster's canopy mass sits.
  const bySizeAsc = (a, b) => -bySize(a, b);
  right.sort(bySizeAsc);
  left.sort(bySizeAsc);

  // The two halves get staggered bands so no left limb attaches at exactly the
  // same height as a right one. Sharing a height re-creates fix 1's original
  // single-origin defect locally: limbs from both halves plus the trunk all
  // radiated from one point at the column top and their subtrees tangled there
  // (every remaining cross-limb crossing traced to that one spot). The stagger
  // is a half-step, so it can never reorder limbs within a half and break the
  // planarity rule.
  const span = ATTACH_FRAC_MAX - ATTACH_FRAC_MIN;
  const assignFracs = (arr, half, lowShift, highShift) => arr.forEach((limb, i) => {
    const denom = Math.max(1, arr.length - 1);
    const lo = ATTACH_FRAC_MIN + lowShift;
    const hi = ATTACH_FRAC_MAX - highShift;
    limb.plannedAttachFrac = arr.length === 1 ? hi : lo + (i / denom) * (hi - lo);
    limb.plannedHalf = half;
    limb.plannedRank = i;
  });
  const stagger = span / 6;
  assignFracs(right, 'right', 0, stagger);
  assignFracs(left, 'left', stagger, 0);
  trunkLimbs.forEach(limb => {
    limb.plannedAttachFrac = ATTACH_FRAC_MAX;
    limb.plannedHalf = 'center';
    limb.plannedRank = 0;
  });

  // Sector runs rightmost -> vertical -> leftmost. Right half most-lateral
  // first; trunk occupies the vertical middle; left half runs back outward,
  // so its nearest-vertical (highest) limb comes first.
  const sequence = [...right, ...trunkLimbs, ...left.slice().reverse()];

  const reordered = [];
  sequence.forEach(limb => {
    (twigsByLimb.get(limb) || []).forEach(t => reordered.push(t));
  });
  // Any twig whose limb somehow went unlisted keeps its original position
  orderedTwigs.forEach(t => { if (!reordered.includes(t)) reordered.push(t); });

  return { orderedTwigs: reordered, sequence, right, left, trunkLimbs };
}

/**
 * Verifies the planarity rule actually held after allocation: within each
 * half, a lower attachment must sit further from vertical. A nonzero count
 * here means limbs can legitimately cross and the guarantee is void.
 */
function verifyLimbOrdering(plan, trunkBaseY) {
  let violations = 0;
  ['right', 'left'].forEach(half => {
    const limbs = plan[half];
    for (let i = 0; i < limbs.length; i++) {
      for (let j = i + 1; j < limbs.length; j++) {
        const a = limbs[i], b = limbs[j];
        if (a.limbOrigin === undefined || b.limbOrigin === undefined) continue;
        if (!a.limbOrigin || !b.limbOrigin) continue;
        const aLower = a.limbOrigin.y > b.limbOrigin.y;
        const aWider = Math.abs(a.targetAngle + Math.PI / 2) > Math.abs(b.targetAngle + Math.PI / 2);
        if (a.limbOrigin.y === b.limbOrigin.y) continue;
        if (aLower !== aWider) violations++;
      }
    }
  });
  return violations;
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
    // Spacing between successive gold trunk ovals. Kept independent of the
    // canopy radius (dropping the flat 1150 radius floor in fix 3 shrank the
    // derived step to 89 and overlapped the ry=36 ovals), and it is the lever
    // that sets total trunk height: the poster's trunk is a tall column of
    // stacked generations, not one long bare segment.
    trunkChainStep = 280,
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
  const { leaves: orderedLeaves, twigs: collectedTwigs } = collectOrderedTwigs(root);
  // Planarity by nested ordering: reorder limb blocks so lower attachments own
  // more-lateral angular ranges (see planLimbLayout). Twig order within a limb
  // — and therefore every subtree's contiguity — is preserved.
  const limbPlan = planLimbLayout(root, collectedTwigs);
  const orderedTwigs = limbPlan.orderedTwigs;
  const N = orderedTwigs.length || 1;

  // 3. Part A - Step 3 & 4: Arc Allocation & R_min Calculation
  // Fix 2: widened to 230° (was 155°) so outer edges reach ~25° past horizontal on
  // both flanks, letting small lineages lean down beside the trunk instead of stopping
  // dead at horizontal.
  const sectorWidthRad = (sectorSpanDeg * Math.PI) / 180; // ~4.014 rad for 230 deg
  const rightmostAngle = -Math.PI / 2 + sectorWidthRad / 2; // Right side start (~25 deg, past horizontal)
  const leftmostAngle = -Math.PI / 2 - sectorWidthRad / 2;  // Left side end (~-205 deg, past horizontal)

  // R_min = clearance * N / (3 * sectorWidth * 0.74). N is twig count, not
  // leaf count — a twig with alternating clustered members is wider than one
  // leaf (leaf height plus ~2x the nudge), so the clearance term is not just
  // leaf height, or angular slots would be spaced for a single leaf and
  // quietly collide. Both terms live in leafGeometry.js and scale with the
  // leaf, so enlarging leaves widens the required radius automatically.
  const R_min = (TWIG_ANGULAR_CLEARANCE * N) / (3 * sectorWidthRad * 0.74);
  // Fix 3: dropped the flat 1150 floor — a single global minimum stopped
  // making sense once radial reach became per-lineage (below); baseCanopyRadius
  // is now purely R_min-derived (the angular-slot tangential-spacing guarantee
  // it still needs to satisfy).
  const baseCanopyRadius = R_min / 0.74 + 180;

  // 4. Part A - Step 2 & 3: Place Twigs by Index into Size-Aware Radial Bands
  // with Irregular Silhouette. Fix 3: band tier now comes from the twig's
  // depth-1 lineage's own subtreeSize (large lineage -> outer band, small ->
  // inner), not raw index parity; a light per-lineage %3 texture keeps it
  // from looking robotically banded. Radius itself is now generations-below-
  // lineage-root * one shared per-generation step (computeLineageInfo) — the
  // same base quantity the internal-node formula below uses, instead of a
  // canopy-wide value computed independently of depth.
  const radialBands = [0.74, 0.94, 1.14];
  // Full canopy radius, not the old 0.65 fraction of it: the fraction was
  // tuned when leaf radius was computed independently of this span, and
  // keeping it here left the outermost leaves short of R_min.
  const availableRadialSpan = baseCanopyRadius;
  const { infoById: lineageInfoById, globalStep } = computeLineageInfo(root, availableRadialSpan, radialBands);

  const lineageLocalIdx = new Map(); // twig.id -> index within its own lineage's twig sequence
  {
    const counters = new Map();
    orderedTwigs.forEach(twig => {
      const key = findDepth1Ancestor(twig.representative).data.id;
      const localIdx = counters.get(key) || 0;
      lineageLocalIdx.set(twig.id, localIdx);
      counters.set(key, localIdx + 1);
    });
  }

  orderedTwigs.forEach((twig, idx) => {
    const repNode = twig.representative;

    // Exact angular position across the sector (Right to Left)
    const t = (idx + 0.5) / N;
    const baseAngle = rightmostAngle - t * sectorWidthRad;

    // Part B - Step 11: Irregular Silhouette Noise (±15%)
    const noise = silhouetteNoise(baseAngle);

    // Fix 3: radial reach driven by the lineage's own size-tiered step
    // (computeLineageInfo) — small lineages terminate near the trunk, large
    // ones reach the rim — with the same step the internal nodes of this
    // lineage use, so a leaf can never land behind its own parent.
    const depth1Ancestor = findDepth1Ancestor(repNode);
    const step = lineageStepFor(repNode, lineageInfoById, globalStep);
    const relativeDepth = repNode.depth - depth1Ancestor.depth;

    // Radial bands, applied per-twig WITHIN the lineage (not by global index
    // parity as before fix 3). This spread is what actually fills the flanks:
    // R_min's spacing guarantee assumes twigs occupy 3 distinct radii per
    // angular slot, so collapsing every twig in a lineage onto one radius
    // (they all sit at the same depth) leaves the inner canopy structurally
    // empty no matter how the lineage tier is tuned.
    const localIdx = lineageLocalIdx.get(twig.id) || 0;
    const bandMultiplier = radialBands[localIdx % 3];

    // Part A - Step 6: Organic ±12% length jitter seeded off node id
    const jitter = (seedHash(repNode.data.id + '_rad') - 0.5) * 0.24; // ±12%
    const rawRadius = relativeDepth * step * bandMultiplier * (1 + noise) * (1 + jitter);

    // Explicit clearance past this leaf's own parent. Band + noise + jitter
    // can otherwise multiply a leaf's whole accumulated radius down below its
    // parent's (7.9px gaps in ~36% of twigs when this was unguarded), which
    // then fed a near-zero vector into the twig-length scaling below. Stating
    // the invariant here — a leaf always sits at least one useful step past
    // its parent — is what makes that downstream floor a true edge-case
    // guard rather than the thing holding the layout together.
    const parentRadius = Math.max(0, relativeDepth - 1) * step;
    const leafRadius = Math.max(rawRadius, parentRadius + MIN_LEAF_ADVANCE_PX);

    repNode.targetAngle = baseAngle;
    repNode.targetRadius = leafRadius;
    // originLead (limb-attachment height compensation) is added later, in
    // the position pass, once limbOrigin is known — see the leaf-placement
    // block below.

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

  // Fix 4: per-node wedge — the angular interval (about the polar center) the
  // node's subtree leaves occupy, padded WEDGE_PAD each side. Contiguous
  // leaf-index allocation makes sibling wedges disjoint (up to the pad), so
  // containing every branch's control points in its own node's wedge makes
  // crossings between unrelated subtrees structurally impossible — and kills
  // the self-curl loops caused by p1 following a parent exit tangent pointing
  // up to ~167° away from the branch's own chord.
  root.eachAfter(node => {
    if (!node.children || node.children.length === 0) {
      node.wedgeRawMin = node.wedgeRawMax = node.targetAngle;
    } else {
      let mn = Infinity, mx = -Infinity;
      node.children.forEach(c => {
        if (c.wedgeRawMin === undefined) return;
        mn = Math.min(mn, c.wedgeRawMin);
        mx = Math.max(mx, c.wedgeRawMax);
      });
      node.wedgeRawMin = mn === Infinity ? node.targetAngle : mn;
      node.wedgeRawMax = mx === -Infinity ? node.targetAngle : mx;
    }
    node.wedgeMin = node.wedgeRawMin - WEDGE_PAD;
    node.wedgeMax = node.wedgeRawMax + WEDGE_PAD;
  });

  // Trunk column height: base -> root oval -> the stacked trunk generations
  // above it. Limbs attach along this whole column, not just the root
  // segment, so the root ancestor's oval stays low (as the poster shows)
  // while the column still supplies the tree's height.
  const maxTrunkDepth = Math.max(0, ...root.descendants()
    .filter(n => n.data.isTrunkLineage).map(n => n.depth));
  const trunkColumnHeight = rootTrunkLength + maxTrunkDepth * trunkChainStep * 0.9;

  // Fix 1: depth-1 limbs attach along the trunk column (ATTACH_FRAC_MIN..MAX
  // of its height), not at a single apex
  const attachments = assignLimbAttachments(root, {
    trunkCenterX, trunkBaseY, trunkColumnHeight
  });

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
      node.x3 = trunkCenterX;
      // Trunk-chain spacing is decoupled from the canopy radius: when the
      // flat 1150 radius floor was dropped (fix 3), depthRadiusStep shrank
      // 149→89 and the gold trunk ovals (ry=36) ended up 80px apart —
      // overlapping, with their side limbs crowded into the same band. The
      // stack needs room for an oval plus clearance per generation,
      // regardless of how wide the canopy happens to be.
      node.y3 = trunkBaseY - rootTrunkLength - node.depth * trunkChainStep * 0.9;
      // Fix 1's per-limb origin principle, extended up the trunk chain: a
      // subtree hanging off a trunk node grows from THAT node, not from the
      // tree base. Previously trunk nodes forced limbOrigin=null, so their
      // side branches were laid out about a phantom center up to 700px below
      // the actual junction — they swept down and across the low side limbs,
      // and were by far the largest source of cross-limb crossings.
      node.limbOrigin = {
        x: trunkCenterX,
        y: node.y3,
        frac: 1, // already at full trunk height: no originLead compensation
        entryTangent: -Math.PI / 2
      };
      return;
    }

    const origin = node.limbOrigin;
    const cx = origin ? origin.x : trunkCenterX;
    const cy = origin ? origin.y : trunkBaseY;
    // Trunk height not consumed by the attachment height — keeps overall reach
    // comparable between a low-attaching limb and a high-attaching one
    const originLead = origin ? trunkColumnHeight * (1 - origin.frac) : trunkColumnHeight;

    if (!node.children || node.children.length === 0) {
      // Terminal leaf (twig representative): polar placement around the
      // owning limb origin. originLead compensates for where along the
      // trunk this limb attaches (Fix 1); node.targetRadius is the
      // depth-based-plus-band radius computed above (Fix 3).
      let x3 = cx + Math.cos(node.targetAngle) * (originLead + node.targetRadius) * 1.05;
      let y3 = cy + Math.sin(node.targetAngle) * (originLead + node.targetRadius) * 0.85;

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

        // Guard against a degenerately short natural parent->leaf vector,
        // whose direction is as unreliable as its length (scaling a near-zero
        // vector by the required-length ratio produces a huge multiplier and
        // throws the branch outside the canopy). Fix 3 made this rare rather
        // than routine: when leaf radius was a full multiplicative
        // attenuation of the whole accumulated depth, 23/63 twigs fell under
        // 60px (worst 7.9px); with band/noise/jitter now modulating only the
        // last generation's step, the worst case is ~51px and only 4 twigs
        // sit under 60. Kept as a genuine floor at 40px (aligned with
        // TWIG_MIN_SPACING_PX) rather than a band-aid over a broken formula —
        // it no longer fires for any current node, but a differently-shaped
        // tree could still produce a near-zero vector here.
        const MIN_BASE_LEN = 40;
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
      // Part B - Step 9: Long sweeping limb crossing trunk axis.
      // Fix 4: the sweep travels along the limb's own wedge, never across it —
      // the raw ±0.25 rad offset could point the junction outside the angular
      // interval the limb's own subtree occupies.
      const sweepSide = (seedHash(node.data.id + '_side') > 0.5) ? 1 : -1;
      const sweepDist = 480 + (seedHash(node.data.id + '_sweep') - 0.5) * 100;
      const rawSweepAngle = node.targetAngle + sweepSide * 0.25;
      const sweepAngle = Math.min(node.wedgeMax - WEDGE_PAD / 2,
        Math.max(node.wedgeMin + WEDGE_PAD / 2, rawSweepAngle));
      node.x3 = cx + Math.cos(sweepAngle) * sweepDist;
      node.y3 = cy - 120 + Math.sin(node.targetAngle) * sweepDist * 0.7;
      // Fix 4: nothing below the ground line (reaching it is fine)
      if (node.y3 > trunkBaseY) node.y3 = trunkBaseY;
      return;
    }

    // Fix 3: relative-to-lineage depth (not absolute tree depth) * the same
    // globalStep the leaf radius above uses — a lineage hanging off a trunk
    // node no longer inherits that trunk node's own traversal depth as if it
    // were generations of its own.
    const internalDepth1Ancestor = findDepth1Ancestor(node);
    const internalRelativeDepth = node.depth - internalDepth1Ancestor.depth;
    const internalStep = lineageStepFor(node, lineageInfoById, globalStep);
    const r = originLead + internalRelativeDepth * internalStep * (1 + (seedHash(node.data.id + '_dlen') - 0.5) * 0.20);
    node.x3 = cx + Math.cos(node.targetAngle) * r * 1.05;
    node.y3 = cy + Math.sin(node.targetAngle) * r * 0.85;
    // Fix 4: internal junctions were never ground-clamped (only leaves were) —
    // a past-horizontal angle from the widened sector could sink one below
    // the trunk base. Reaching the ground line is allowed; crossing it isn't.
    if (node.y3 > trunkBaseY) node.y3 = trunkBaseY;
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

    // Compute S-curve Bézier control points, wedge- and ground-clamped (Fix 4).
    // Clamp center = the same polar center the node's placement used.
    computeSCurveSpineGeometry(node, startTangent, {
      cx: node.limbOrigin ? node.limbOrigin.x : trunkCenterX,
      cy: node.limbOrigin ? node.limbOrigin.y : trunkBaseY,
      grassY: trunkBaseY,
      rightmostAngle
    });
  });

  // 7. Cluster fix: position non-representative twig members by sampling
  // each twig's now-finished spine (must run after the geometry pass above)
  const xStretchTriggerCount = applyTwigMemberSampling(orderedTwigs, trunkBaseY - 100);

  // Planarity assertion: lower attachment must sit further from vertical
  // within each half. Nonzero means limbs may legitimately cross.
  const limbOrderingViolations = verifyLimbOrdering(limbPlan, trunkBaseY);

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
    globalStep: Math.round(globalStep),
    xStretchTriggerCount,
    limbOrderingViolations,
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
  let xStretchTriggerCount = 0;
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
      // clamped case is effectively colinear along X). This breaks the
      // spine-anchoring invariant for the affected twig — tracked below so
      // it stays visible in metrics rather than silently firing.
      xStretchTriggerCount++;
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
  return xStretchTriggerCount;
}

/**
 * Fix 1: Depth-1 limbs attach along the trunk at 35%–100% of its length.
 * Most lateral / downward-leaning limbs attach lowest; most vertical at the apex.
 * Deterministic: sort keyed on mean child angle with id tie-break, jitter seeded on id.
 */
export function assignLimbAttachments(root, { trunkCenterX, trunkBaseY, trunkColumnHeight }) {
  const limbs = (root.children || []).filter(c => !c.data.isTrunkLineage);
  if (limbs.length === 0) return [];

  const attachments = [];
  limbs.forEach(limb => {
    // Height comes from planLimbLayout, which chose it BEFORE angles so that
    // lower attachment implies a more lateral range (the planarity rule).
    // Deriving it here from the limb's mean child angle — as this did through
    // fix 4 — would reintroduce the circularity that rule exists to break.
    const planned = limb.plannedAttachFrac !== undefined ? limb.plannedAttachFrac : ATTACH_FRAC_MAX;
    // Jitter kept well inside the per-rank spacing so it can never reorder
    // two limbs and violate the rule.
    const jitter = (seedHash(limb.data.id + '_attach') - 0.5) * 0.03;
    const frac = Math.max(ATTACH_FRAC_MIN, Math.min(ATTACH_FRAC_MAX, planned + jitter));

    // Leave the trunk partway between vertical and the limb's own heading
    const dev = normalizeSignedAngle(limb.targetAngle + Math.PI / 2);
    const entryTangent = -Math.PI / 2 + 0.6 * dev;

    limb.limbOrigin = {
      x: trunkCenterX,
      y: trunkBaseY - frac * trunkColumnHeight,
      frac,
      entryTangent
    };

    attachments.push({
      id: limb.data.id,
      name: limb.data.name,
      frac: +frac.toFixed(3),
      half: limb.plannedHalf,
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
function computeSCurveSpineGeometry(node, parentExitTangent, clampCtx) {
  const x0 = node.x0;
  const y0 = node.y0;
  const x3 = node.x3;
  const y3 = node.y3;

  const dx = x3 - x0;
  const dy = y3 - y0;
  const L = Math.hypot(dx, dy) || 1;

  // Tangent at end (approaching target)
  const childHeading = Math.atan2(dy, dx);

  // Fix 4: the start tangent follows the parent's exit tangent only within a
  // ±50° cone around the branch's own chord. Unconstrained, a parent exiting
  // up to ~167° away from where this branch actually travels threw p1
  // backwards and looped the branch around itself (the observed self-curls).
  // Clamping the DIRECTION here, rather than repositioning p1 afterwards,
  // keeps the junction smooth instead of introducing a kink.
  const TANGENT_CONE = (50 * Math.PI) / 180;
  const tangentDev = normalizeSignedAngle(parentExitTangent - childHeading);
  const effectiveTangent = childHeading +
    Math.max(-TANGENT_CONE, Math.min(TANGENT_CONE, tangentDev));

  // Tangent at start (cone-clamped parent exit tangent)
  const t0x = Math.cos(effectiveTangent);
  const t0y = Math.sin(effectiveTangent);
  const n0x = -t0y;
  const n0y = t0x;
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

  // Fix 4: clamp p2 into the node's own subtree wedge, measured about the
  // node's polar center with the same 1.05/0.85 elliptical squash placement
  // uses. p2 sits near p3 (inside the wedge by construction), so this fires
  // rarely and is a pure separation win. p1 is deliberately NOT wedge-clamped:
  // it lives near the shared junction p0, whose angle is often outside this
  // node's own wedge, and repositioning it introduced start kinks (curl count
  // went UP when tried) — the tangent cone above handles p1's direction
  // instead.
  // Trunk-lineage segments are exempt: their spine runs the vertical axis,
  // but their subtree's leaves (and hence wedge) sit far to one side — the
  // clamp yanked the trunk's own p2 hundreds of px sideways when applied.
  if (clampCtx && node.wedgeMin !== undefined && !node.data.isTrunkLineage) {
    const ux = (p2x - clampCtx.cx) / 1.05;
    const uy = (p2y - clampCtx.cy) / 0.85;
    let a = toSectorFrame(Math.atan2(uy, ux), clampCtx.rightmostAngle);
    const r = Math.hypot(ux, uy);
    if (a < node.wedgeMin || a > node.wedgeMax) {
      a = a < node.wedgeMin ? node.wedgeMin : node.wedgeMax;
      p2x = clampCtx.cx + Math.cos(a) * r * 1.05;
      p2y = clampCtx.cy + Math.sin(a) * r * 0.85;
    }
  }

  // Fix 4: sag + ground clamps. A control point may sag only modestly below
  // the LOWER of the branch's own endpoints — unbounded, past-horizontal
  // branches plunged their curves far below both endpoints, and flattening
  // those plunges exactly onto the ground line piled dozens of co-linear
  // segments within collision distance of each other (+24 branch-pair
  // collisions when tried). Bounding sag relative to the branch's own
  // endpoints stops the plunge before the line is ever involved; the ground
  // line itself stays an exact clamp with no margin above it, so low
  // branches still REACH the grass — they just don't run along under it.
  if (clampCtx) {
    const maxCtrlY = Math.min(clampCtx.grassY, Math.max(y0, y3) + 40);
    if (p1y > maxCtrlY) p1y = maxCtrlY;
    if (p2y > maxCtrlY) p2y = maxCtrlY;
  }
  // (The old unconditional "upward growth clamp" — p_y ≤ y0 — is gone: it
  // predates fix 2, and for the now-legal down-heading branches (endpoint
  // below start) it flattened control points into a horizontal run with a
  // hook at the end, which is exactly the residual curl signature. The sag
  // clamp above bounds control-point y against BOTH endpoints instead.)

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
