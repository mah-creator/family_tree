/**
 * Layout invariant regression checks. Run against both datasets:
 *   node scripts/check_invariants.mjs
 *
 * These are structural guarantees, not aesthetic preferences. Each one cost
 * real diagnostic work to establish, and several were violated silently for
 * multiple fixes before a metric caught them.
 */
import { readFileSync, existsSync } from 'fs';
import { buildBotanicalLayout } from '../src/treeLayout.js';
import { computeLayoutMetrics } from '../src/layoutMetrics.js';
import { LEAF_WIDTH } from '../src/leafGeometry.js';

const OPTS = { rootTrunkLength: 460, trunkChainStep: 480, rootBaseWidth: 56 };

function layoutToFit(treeData) {
  const probe = buildBotanicalLayout(treeData, {
    ...OPTS, width: 4600, height: 3600, trunkBaseY: 3250, trunkCenterX: 2300
  });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const grow = (x, y, pad) => {
    if (!isFinite(x) || !isFinite(y)) return;
    minX = Math.min(minX, x - pad); maxX = Math.max(maxX, x + pad);
    minY = Math.min(minY, y - pad); maxY = Math.max(maxY, y + pad);
  };
  probe.root.descendants().forEach(n => {
    [n.p0, n.p1, n.p2, n.p3].forEach(p => p && grow(p.x, p.y, 0));
    grow(n.x3, n.y3, LEAF_WIDTH);
  });
  grow(2300, 3250, 80);
  const M = 260;
  return buildBotanicalLayout(treeData, {
    ...OPTS,
    width: Math.ceil(maxX - minX + M * 2),
    height: Math.ceil(maxY - minY + M * 2),
    trunkCenterX: M + (2300 - minX),
    trunkBaseY: M + (3250 - minY)
  });
}

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

for (const file of ['tree.json', 'tree_1000.json']) {
  if (!existsSync(new URL(`../${file}`, import.meta.url))) {
    console.log(`\n${file}: not present, skipping`);
    continue;
  }
  const data = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  const layout = layoutToFit(data);
  const m = computeLayoutMetrics(layout);
  const big = file.includes('1000');

  console.log(`\n${file}  (${m.totalLeaves} leaves, ${m.twigCount} twigs)`);
  check('no branch dips below the ground line', m.branchesBelowTrunkBase === 0,
    `${m.branchesBelowTrunkBase}`);
  check('no self-curling branches', m.curlCount === 0, `${m.curlCount}`);
  check('planarity ordering holds', m.limbOrderingViolations === 0,
    `${m.limbOrderingViolations} violations`);
  check('no junction switchbacks past 90 deg', m.junctionTurningOver90 === 0,
    `max ${m.junctionTurningMaxDeg} deg`);
  check('twig cluster spacing above floor', m.minTwigMemberSpacingPx === null || m.minTwigMemberSpacingPx >= 55,
    `${m.minTwigMemberSpacingPx}px`);
  // Cross-limb crossings are structurally forbidden by the nested ordering.
  // A handful survive at 1,000 nodes; a jump means the ordering broke again.
  check('cross-limb crossings near zero', m.crossLimbIntersections <= (big ? 20 : 2),
    `${m.crossLimbIntersections}`);
  if (!big) {
    check('bare trunk fraction in poster range',
      m.bareTrunkFraction >= 0.22 && m.bareTrunkFraction <= 0.32, `${m.bareTrunkFraction}`);
    check('lowest leaf hangs near the grass', m.lowestLeafFrac < 0.15, `${m.lowestLeafFrac}`);
  }
}

// The sweep (fix 7) is load-bearing, not decoration. Removing it makes
// tree.json roughly 15x worse on cross-limb crossings, because it pulls the
// largest limbs out of the crowded central region. It reads as an aesthetic
// flourish in the code, so this guards it explicitly.
console.log('\nsweep (fix 7) regression guard');
{
  const src = readFileSync(new URL('../src/treeLayout.js', import.meta.url), 'utf8');
  const hasSweep = /sweepingLimbs\s*=\s*new Set\(\s*depth1Subtrees/.test(src) &&
    /sweepingLimbs\.has\(node\.data\.id\)/.test(src);
  check('sweep is still wired up (do NOT remove as decoration)', hasSweep,
    'disabling it took tree.json cross-limb 1 -> 15');
}

console.log(failures === 0 ? '\nAll invariants hold.' : `\n${failures} INVARIANT FAILURE(S).`);
process.exit(failures === 0 ? 0 : 1);
