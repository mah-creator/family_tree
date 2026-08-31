# Handoff — Arabic Illustrated Family Tree

Read this whole document before touching code. It is written for a fresh Claude
Code instance (or a human) who has only this repository directory and the
reference PDF — no memory of any prior conversation. Everything you need is
either in this file or somewhere in the repo; where it isn't, that's flagged
explicitly.

**Branch:** `claude/arabic-family-tree-c30136` (this worktree lives at
`.claude/worktrees/arabic-family-tree-c30136` inside the main checkout at the
repo root — if you were dropped into this directory, you're already on the
right branch; run `git branch --show-current` to confirm).

---

## 1. What this project is

A single-page interactive Arabic family-tree (مشجرة) viewer, built as a pitch
demo to win a freelance contract. It renders 181 people across 5 generations
from `tree.json` as an illustrated botanical tree — trunk, tapered branches,
name-bearing leaves. It must eventually scale to roughly 2,000 people (there's
already a stress-test button that swaps in synthetic data for this — see
§3). Stack: Vite + vanilla JS + d3 (hierarchy, zoom, quadtree, interpolateZoom),
inline SVG. The deliverable is one self-contained HTML file (`dist/index.html`,
built via `npm run build`, ~340KB) — it must not depend on any external
network request, since it may be viewed on mobile data.

**The reference artwork is the spec.** `End-20-12-2024.pdf` (in the repo root)
is a real botanical-tree family poster and it is the visual target — not any
written description of it, including this one. Open it and look at it before
changing layout code. Read it in this repo with any PDF viewer, or via the
`Read` tool with `pages: "1"` if you're an instance that has one.

What to look for when you open it, so you know what you're matching:

- **Orientation.** Root ancestor sits at the base of the trunk on a grass strip;
  growth runs upward. The whole thing sits on cream parchment inside an ornate
  gold-and-red border with corner cartouches reading ما شاء الله / تبارك الله.
- **Trunk.** The main lineage climbs the trunk as a vertical stack of gold
  ovals, one per generation, each with a name and a line of small biographical
  text.
- **Sub-family founders** are gold circles sitting at branch junctions off the
  trunk, each labelled like «جد آل بريكة».
- **Branches** are tapered brown curves — thick where they leave the trunk,
  hairline at the tips — that curve and recurve rather than radiating out
  straight like spokes.
- **Two major limbs cross the trunk axis** and sweep up into the opposite
  side's canopy. This crossing is what stops the whole thing reading as a
  symmetric fountain — it's asymmetric and a little wild, the way a real tree
  is.
- **Leaves cluster in groups of 3–6** along the last twig, not one leaf per
  twig tip. Leaves are green by default; a subset (distinguished individuals)
  are gold.
- **Limbs leave the trunk at several different heights**, not all bursting
  from one point at the top.
- **Canopy silhouette is lumpy and irregular**, not a clean ellipse or arc.

Everything above is generated procedurally from `tree.json`. Never use AI
image generation for any part of the artwork — it's all math (d3 hierarchy +
Bézier geometry + seeded pseudo-randomness) over structured data.

---

## 2. Current state

**Builds clean.** `npm run build` succeeds (vite v5.4.21, ~340KB single-file
output). There is one pre-existing harmless warning —
`Unknown input options: inlineDynamicImports` — from a vite-plugin-singlefile
version mismatch in `vite.config.js`'s `rollupOptions`. It was there before
this session's changes too; it is not a regression signal, ignore it unless
the build actually fails.

**Dependencies:** `npm install` has been run in this worktree (`node_modules/`
exists, is gitignored — see §6). If you're starting fresh elsewhere, run it
before anything else.

**Dev server:** `.claude/launch.json` is configured (`npm run dev` on port
5173) so any harness with dev-server preview tooling (e.g. this session used
an in-app Browser pane with a `preview_start` tool pointed at the
`family-tree-dev` config) can bring it up by name.

### Fix-by-fix status

| # | What | Status |
|---|------|--------|
| 1 | Single-origin limbs → per-limb trunk attachment | **Landed + visually confirmed** |
| 2 | Sector widened to 230° | **Landed + visually confirmed** |
| 3 | Size-aware radial bands + variable depth step | **Untouched** — design decided (see §5), not coded |
| — | Leaf clusters (3 leaves/twig, shared parent twig) | **Untouched** — design decided (see §5), lands together with fix 3 |
| 4 | Wedge containment for branch curves | **Untouched** |
| 5 | Branch-spine relaxation pass | **Untouched** — did not exist at all before this session either (see §6) |
| 6 | S-curved branches | Pre-existing partial implementation, **not yet re-based** on the fix-1/2/3 layout |
| 7 | Long sweeping limbs crossing trunk | Pre-existing partial implementation (sweep distance is currently a fixed ~480px, not the brief's ±80px), **not yet re-based** |
| 8 | Irregular canopy silhouette (seeded noise) | Pre-existing partial implementation, **not yet re-based**, and currently applied to the old single-radius canopy model so its effect will change once fix 3 lands |
| 9 | Twig-tip droop | Pre-existing partial implementation, looks structurally fine, **not yet re-verified visually** post fix-1 |

"Landed + visually confirmed" for fix 1 means: this session ran the dev
server in an in-app browser preview, called a `window.__setView(1800, 1700,
0.15)` dev hook (see §3) to frame the whole canopy, and took a screenshot.
The screenshot showed limbs leaving the trunk at four distinct, visibly
different heights rather than one point, each limb radiating from its own
origin. A debug-overlay screenshot (toggle `#btn-debug`) additionally showed
four labelled magenta attachment markers running from 35% to 100% up the
trunk (`p002@35%`, `p003@57%`, `p005@76%`, `p004@100%`), confirming
`assignLimbAttachments()` is doing what it claims. Neither screenshot survived
as a file on disk — they were inline images in that session's chat — so if
you want to re-confirm, re-run the same steps (§8 gives the exact recipe) and
compare by eye against what's described here and against the PDF. The overall
canopy is still a rough fountain/fan shape at this point, not the lumpy
asymmetric silhouette from the reference — that's expected, since fixes 3
and 4/5 haven't landed yet.

Fix 2 ("landed + visually confirmed"): `sectorSpanDeg` changed 155→230 at
[src/treeLayout.js:77](src/treeLayout.js#L77). A debug-overlay screenshot at
`window.__setView(1800, 2350, 0.45)` showed the orange dashed sector-boundary
rays now dipping visibly past horizontal on both the bottom-left and
bottom-right, with branches leaning down beside the trunk instead of
stopping dead at horizontal — matches the fix's intent. The green dashed
grass line showed no leaf crossing it, confirming the existing flat clamp
(`node.y3 = trunkBaseY - 100` cap, line 208) still holds correctly with the
wider sector — no change was needed there after all (§4's "Fix 2" section
originally flagged this as needing review; it turned out fine as-is, since
the clamp is expressed in absolute world Y tied to `trunkBaseY`, not
relative to any particular limb origin).

### Current headless metrics (run `node scripts/report_metrics.mjs` to
reproduce — this is the ground truth, re-run it after every change)

```json
{
  "totalLeaves": 117,
  "leafPairCollisions": 24,
  "branchPairCollisions": 102,
  "R_min": 446,
  "radiusUsed": 1150,
  "canopyFillPct": 8,
  "leftFlankFillPct": 0,
  "rightFlankFillPct": 0
}
```

These are post-fix-2 numbers (previously, post-fix-1-only: `R_min` 662,
`leafPairCollisions` 4, `branchPairCollisions` 90, `canopyFillPct` 11.8 — see
git history on `src/treeLayout.js` if you want the exact prior state).
`R_min` dropped as expected — a wider sector needs less radius for the same
minimum arc-length spacing between leaves. `leafPairCollisions` and
`branchPairCollisions` both *rose* — this is expected collateral, not a
regression: arc allocation still assigns angle purely from each leaf's
global right-to-left index, the same physical angle regardless of which
limb's origin it's actually placed around (fix 1 gave each limb its own
*origin point*, but did not change how *angle* is assigned), so a wider
angular spread increases the chance that two leaves belonging to different
limbs — placed around origins that differ in Y along the trunk but share the
same X — land close together in absolute world space. Fix 4/5 (wedge
containment + relaxation) is what actually resolves this; don't chase these
numbers down before then. `leftFlankFillPct`/`rightFlankFillPct` are still
0% — expected, since nothing yet targets leaf *density* at the flanks
specifically (arc allocation still uses the old fixed-radius-band model);
that's fix 3's job, not fix 2's.

---

## 3. Architecture orientation

Everything is under `src/`, wired together by `src/main.js`. No framework,
no build-time codegen beyond Vite's bundling.

**`src/treeLayout.js`** — the layout engine. This is where nearly all of
fixes 1–9 land. `buildBotanicalLayout(treeData, options)` is the entry point,
called once per render from `main.js`. Internally it runs in phases, in this
order:

1. **d3.stratify()** turns the flat `tree.json` person list into a
   hierarchy (`root`), keyed on `id` / `fatherId`.
2. **`computeSubtreeSizes(root)`** — bottom-up `eachAfter`, sets
   `node.subtreeSize` (leaf count under this node) and `node.isLeafNode`.
3. **`collectOrderedLeaves(root)`** — right-to-left DFS, sets
   `node.leafIndex` on every leaf so subtrees occupy contiguous index ranges.
   This contiguity is *why* crossings can be made structurally impossible —
   don't break it.
4. **Leaf angle/radius assignment loop** (inside `buildBotanicalLayout`,
   currently lines 124–144) — walks `orderedLeaves` and sets
   `targetAngle` / `targetRadius` per leaf from its index. This is arc
   allocation. It does **not** set `x3`/`y3` (world coordinates) — that
   happens later, after limb origins are known (this split was introduced
   in fix 1; see §4 for why).
5. **First `eachAfter` pass** (lines 154–167) — internal node angles only
   (mean of children's `targetAngle`). Split out from position computation
   as of fix 1.
6. **`assignLimbAttachments(root, ...)`** (lines 285–329, called at line
   170) — fix 1's new function. Decides where each depth-1 limb leaves the
   trunk.
7. **`eachBefore` position pass** (lines 173–224) — top-down. Computes
   `x3`/`y3` (this node's own tip position) for every node, using
   `node.limbOrigin` (inherited from the depth-1 ancestor) instead of always
   reading off `parent.x3`.
8. **Second `eachBefore` pass, geometry** (lines 227–261) — computes the
   actual cubic Bézier spine (`p0`..`p3`) for every branch, via
   `computeTrunkSpineGeometry` (root only) or `computeSCurveSpineGeometry`
   (everyone else). This has to be a separate pass from step 7 because a
   branch's start tangent depends on its parent's *finished* exit tangent,
   which isn't known until the parent's own spine geometry has been
   computed — don't try to merge these two `eachBefore` walks.

`buildBotanicalLayout` returns `{ root, personMap, rootId, maxDepth,
orderedLeaves, N, R_min, baseCanopyRadius, attachments, radialBands,
depthRadiusStep, sector, layoutOpts }`. The extra fields beyond what existed
before this session (`attachments`, `radialBands`, `depthRadiusStep`,
`sector`, `layoutOpts`) exist so `src/layoutMetrics.js` and the debug overlay
can inspect the layout's own model of itself without recomputing anything.

**`src/branchGenerator.js`** — pure function
`createTaperedBranchPolygonPath(node, samples=12)`. Samples the node's cubic
Bézier spine (`p0..p3`) at `samples` points, offsets left/right by half the
interpolated width at each point, and closes it into one SVG polygon path.
Untouched this session, don't need to touch it for fixes 1–5 (wedge clamping
in fix 4 constrains the *spine* control points that go in; this file just
draws whatever spine it's given).

**`src/leafRenderer.js`** — `createLeafNode(node, x, y, angleDeg, showText)`
builds one leaf's SVG `<g>`: a rotated body group (leaf shape + vein) with a
nested text group inside it (this nesting is why Arabic text sits correctly
inside the leaf — don't flatten it back out). One leaf per terminal node
today, each gets its own `<g>` at its own tip. This file is where the cluster
work (§5) will need a new code path: either this function grows a
"sibling offset" parameter, or a new `createLeafCluster` function replaces it
for terminal siblings that share a twig — your call when you get there, but
whichever you pick, the text-nesting-inside-rotated-group pattern must
survive.

**`src/main.js`** — orchestration, not layout math. `renderTree(treeData)`
(lines 40–218) calls `buildBotanicalLayout`, then walks `descendants` twice —
once to draw branch polygons (lines 63–78), once to draw nodes (trunk ovals /
founder medallions / leaves, lines 80–171, dispatched by
`isTrunkLineage` / `isFounder` / "has no children"). Also owns: the quadtree
viewport culler wiring (lines 172–178), camera init (180–188), lineage tracer
init (190–195), growth-on-load animation trigger (197–198), and — new this
session — metrics computation + logging (203–206), a `window.__setView` dev
hook for camera positioning (208–214), and the debug overlay renderer
(216–217, function body 224–283). `setupButtonListeners` (366–410) wires the
UI buttons including the new `#btn-debug` toggle (401–409).

**`src/layoutMetrics.js`** — new this session.
`computeLayoutMetrics(layoutResult)` takes the object `buildBotanicalLayout`
returns and computes: leaf-pair collisions (leaf centers, 23px along exit
tangent from tip, minimum 38px apart — mirrors the pre-existing
`scripts/verify_metrics_and_screenshots.js` browser-side check so numbers are
comparable), branch-spine-pair collisions (8 samples per spine, minimum 12px
apart, ancestor pairs and near-junction siblings exempted), canopy fill
percentage (60px grid cells inside the leaf bounding ellipse), and the same
fill percentage restricted to two flank rectangles beside the trunk. It
already has a `clusterId` exemption stub for leaf-pair collisions (a pair
sharing a `clusterId` is skipped) — that field doesn't exist on any node yet
because clusters don't exist yet; when you build clusters, set
`node.clusterId` on sibling leaves that share a twig and this exemption
starts working for free. Runs identically in Node
(`scripts/report_metrics.mjs`) and in the browser (imported by `main.js`) —
keep it that way; it's what lets you hand a reader exact expected numbers
without needing a browser yourself.

**`src/quadtreeCuller.js`** — viewport culling + text-LOD + ambient-sway
gating for performance at 2000 nodes. Unrelated to the layout fixes, don't
need to touch it. Don't regress it.

**`src/camera.js`** — `initCamera` (d3-zoom setup, `scaleExtent` 0.25–20,
initial framing transform) and `flyToNode` (Van Wijk `d3.interpolateZoom`
flight on click). `minScale` of 0.25 means the *user* can't pinch out far
enough to see the whole 181-person canopy comfortably at small viewport
sizes — that's a pre-existing UX constraint, not something to fix as part of
layout work. `window.__setView` (in `main.js`) bypasses `scaleExtent` for
verification purposes by calling `zoom.transform` directly; that's a dev-only
tool, don't wire it into any user-facing control.

**`src/arabicNormalizer.js`** — `normalizeArabic` (hamza/alef-maqsura/
taa-marbuta unification, diacritic/tatweel stripping, عبدالله ≡ عبد الله ≡
عبدله) and `buildLineageChain`. Untouched, must not regress.

**`src/lineageTracer.js`** — `LineageTracer` class, highlights root→node
ancestry via `stroke-dashoffset` animation on a Catmull-Rom path through
node centers, dims everything else to 15% opacity. Untouched, must not
regress.

**`src/growthAnimation.js`** — depth-staggered entrance animation
(`branchDraw` / `leafAppear` / `nodePop` keyframes, driven by `data-depth`
attributes main.js sets on each element), respects
`prefers-reduced-motion`, skippable on interaction. Untouched.

**`src/syntheticData.js`** — `generateSyntheticTree(2000)`, procedurally
builds a 2000-node tree in the same schema as `tree.json` for the
"Stress Test" button. If you ever change `tree.json`'s schema, this file
needs the same shape.

**`src/style.css`** + **`src/fontEmbedded.css`** — visual styling and the
base64-embedded subsetted Arabic font (Noto Kufi Arabic). Untouched.

**`tree.json`** — the real data: `{ rootId, persons: [{ id, name, fatherId,
birthYearHijri, deathYearHijri, note, isTrunkLineage, isFounder,
founderLabel, isDistinguished }] }`. 181 persons, root `p001`. The trunk
chain (`isTrunkLineage: true`) is `p001 → p006 → p020 → p067` (4 nodes). Root
has 5 direct children; 4 are depth-1 limbs (`p002`, `p003`, `p004`, `p005`)
and one (`p006`) continues the trunk. 117 terminal leaves total. 8 founders,
22 distinguished individuals.

**`vite.config.js`** — `vite-plugin-singlefile` inlines everything into
`dist/index.html` on `npm run build`. `assetsInlineLimit` is set very high
specifically so the embedded font doesn't get split out as a separate file.

---

## 4. The full fix list with landing spots

All line numbers below are current as of commit `14a730d` on this branch.
Re-check them if you've made edits since reading this — they will drift.

### Fix 1 — Single origin (LANDED)

**Was:** All depth-1 limbs started at the trunk apex (old code:
`node.x0 = parent.x3` unconditionally), and every leaf sat on one circle
centred at `(trunkCenterX, trunkBaseY)`. This is why the tree read as a bare
pole with empty flanks.

**Fix, as implemented:** `assignLimbAttachments()` in
[src/treeLayout.js:285-329](src/treeLayout.js#L285-L329) sorts the four
depth-1 limbs by a `laterality` score (angular deviation from straight-up,
with an extra 0.75× weight for the portion of that deviation that's past
horizontal — i.e. downward-leaning limbs score higher) and maps rank to a
trunk-height fraction spanning 0.35 → 1.0, with ±6% seeded jitter
(`seedHash(id + '_attach')`), clamped back into range. Each limb gets a
`limbOrigin = { x, y, frac, entryTangent }` object. The position pass
([src/treeLayout.js:173-224](src/treeLayout.js#L173-L224)) makes every
descendant inherit its ancestor limb's origin (line 189:
`if (!node.limbOrigin) node.limbOrigin = node.parent.limbOrigin || null`)
and uses that origin instead of `trunkCenterX/trunkBaseY` for polar
placement (lines 198–223). The geometry pass
([src/treeLayout.js:227-261](src/treeLayout.js#L227-L261)) makes the
limb-root branch itself start its Bézier spine at `limbOrigin` instead of
`parent.x3/y3` (lines 234–249), with a base width interpolated between the
trunk's base and tip width at the attach height (line 242) and a start
tangent partway between vertical and the limb's own heading
(`limbOrigin.entryTangent`, computed at line 308) instead of inheriting the
trunk's straight-up exit tangent.

**Status:** Landed, visually confirmed (see §2). Metrics reproducible via
`node scripts/report_metrics.mjs` — see §2 for current numbers and the
`attachments` array (four entries, `p002`/`p003`/`p005`/`p004` at 35%/57%/
76%/100%).

### Fix 2 — Sector can't reach below horizontal (LANDED)

**Was:** `sectorSpanDeg` defaulted to `155` at
[src/treeLayout.js:77](src/treeLayout.js#L77). Combined with the sector
center at `-π/2` (straight up), the arc spanned from `rightmostAngle` to
`leftmostAngle` computed at
[src/treeLayout.js:113-115](src/treeLayout.js#L113-L115) — −167.5° to −12.5°
in standard math convention (SVG y-axis points down, so these are measured
the same way atan2 would report them; −90° is straight up, 0°/−180° are
horizontal). The sector couldn't dip below horizontal on either side, so
small lateral lineages couldn't lean down beside the trunk — part of why the
flanks read empty.

**Fix, as implemented:** `sectorSpanDeg` changed `155` → `230`
([src/treeLayout.js:77](src/treeLayout.js#L77)). `rightmostAngle` /
`leftmostAngle` ([src/treeLayout.js:113-118](src/treeLayout.js#L113-L118))
recompute automatically from it (no separate change needed — `sectorWidthRad`
was already in `R_min`'s denominator), now spanning roughly 25° past
horizontal on each side. Comments referencing the old 155°/−8.5°/−171.5°
values were updated to match.

**Grass clamp — investigated, no change needed:** The leaf-y clamp at
[src/treeLayout.js:208](src/treeLayout.js#L208) (`if (node.y3 > trunkBaseY -
100) node.y3 = trunkBaseY - 100;`) looked like it might need reworking to
account for per-limb origin height, since limb origins aren't all at
`trunkBaseY` after fix 1. In practice it didn't: the clamp is expressed in
absolute world Y tied to the fixed `trunkBaseY` constant, not relative to
any limb's origin, so it correctly caps *every* leaf's final Y regardless of
which limb or origin height produced it. Verified via debug-overlay
screenshot at `window.__setView(1800, 2350, 0.45)` — no leaf crosses the
green dashed grass line even with the sector now reaching past horizontal.

**Status:** Landed, visually confirmed (see §2 for the screenshot
description and updated metrics — `R_min` 662→446).

### Fix 3 — Radial position ignores lineage size (UNTOUCHED, design decided)

**Is:** Leaf radial band is `idx % 3` against `radialBands = [0.74, 0.94,
1.14]` ([src/treeLayout.js:122](src/treeLayout.js#L122), applied at
[src/treeLayout.js:134-135](src/treeLayout.js#L134-L135)) — purely
positional, unrelated to how big the leaf's lineage is. Internal-node radial
step is `depthRadiusStep = (baseCanopyRadius * 0.65) / (maxDepth + 1)`
([src/treeLayout.js:148](src/treeLayout.js#L148)), a single fixed value
applied uniformly regardless of how many generations remain below any given
node ([src/treeLayout.js:221](src/treeLayout.js#L221) — `const r = originLead
+ node.depth * depthRadiusStep * (...)`). A short lineage (one generation
deep) gets dragged out to the same per-depth step as a four-generation one,
leaving unnatural gaps.

**Fix to make, and how it now interacts with clusters (see §5 for the
reasoning):** This fix cannot be implemented in isolation from the leaf
cluster decision, because clustering changes what "N" (the leaf count that
drives `R_min` and arc allocation) means. Build them together:

1. Decide the twig grouping first: for each internal node whose children are
   all terminal leaves, group those leaf-children into twigs of up to 3
   (see §5 for the exact clustering rule and the alternating-sides detail).
   Each twig, not each leaf, gets one arc-allocation slot.
2. Rework `collectOrderedLeaves` (or add a sibling function) so `N` becomes
   the twig count, not `orderedLeaves.length`. `R_min`
   ([src/treeLayout.js:118](src/treeLayout.js#L118)) and the leaf angle loop
   ([src/treeLayout.js:124-144](src/treeLayout.js#L124-L144)) both need to
   index by twig, and the two-or-three leaves inside a twig then get their
   own small angular offsets around their twig's `targetAngle` (this is
   where "alternating sides" happens — leaf 1 slightly clockwise of the twig
   angle, leaf 2 slightly counter-clockwise, leaf 3 near-centered, or
   similar).
3. Replace the `idx % 3` band lookup with one derived from the twig's (or
   its parent leaf-node's) depth-1 ancestor's `subtreeSize` — map larger
   `subtreeSize` to outer bands, smaller to inner. Keep some `% 3`-style
   texture *within* a lineage's assigned band range so it doesn't look
   robotically banded, but the primary driver should be lineage size, not
   raw index parity.
4. Replace the fixed `depthRadiusStep` at internal nodes with
   `step = availableRadialSpan / subtreeHeight`, where `subtreeHeight` is
   how many more generations exist below that specific node (d3 gives you
   `node.height` for this after `stratify()` — verify it's still correct
   after any `singleLimbMode` filtering, since that mode trims the person
   list before stratifying). A four-generation lineage should spread its
   depth steps across the full available radial span; a lineage that
   terminates one generation down should stop close to its limb origin
   rather than being stretched to match deeper siblings.

**Status:** Not started. Cluster model and arc-allocation approach are
decided (§5) — what's left is writing the twig-grouping code, reworking `N`
and `collectOrderedLeaves`, and wiring the two new formulas in above.

### Fix 4 — Branches escape their own wedge and cross (UNTOUCHED)

**Is:** Bézier control-point perpendicular offsets in
`computeSCurveSpineGeometry` ([src/treeLayout.js:360-415](src/treeLayout.js#L360-L415))
are seeded at up to 14% of branch length (`s1` at line 384:
`(seedHash(...) - 0.5) * 0.28 * L`, so magnitude ranges 0–14% since
`seedHash` returns 0–1 and the −0.5 centers it) — already under the brief's
15% cap, keep this value as-is. There's currently no wedge concept at all,
so nothing stops a branch's control points from swinging into a sibling's
territory.

**Fix to make:** Give every non-leaf node a wedge —
`[min(childAngles) - 4°, max(childAngles) + 4°]` — computed from its
children's `targetAngle` values (available after the angle pass, line
154–167; a good place to compute and store this is right there, or in a
small follow-up `eachAfter` pass once children's angles are final). Then in
`computeSCurveSpineGeometry`, after computing `p1`/`p2`
([src/treeLayout.js:387-391](src/treeLayout.js#L387-L391)), clamp both
points' angular position (relative to the node's origin) to stay inside the
node's own wedge before falling through to the existing droop/clamp logic at
lines 393–401. Also re-aim the sweeping-limb logic
([src/treeLayout.js:212-219](src/treeLayout.js#L212-L219), the `sweepDist`
block) so its lateral excursion travels along the wedge's own axis rather
than at a fixed ±0.25 radian offset that ignores wedge boundaries — right
now `sweepSide * 0.25` is a magic constant unrelated to any wedge.

Because `collectOrderedLeaves` already guarantees subtrees hold contiguous
leaf-index ranges, wedge containment (once correctly implemented) should
make branch crossings between *unrelated* subtrees structurally impossible —
if you still see crossings after this lands, look for a wedge computed from
stale/pre-jitter angles rather than a fundamentally different cause.

**Status:** Not started.

### Fix 5 — Relaxation only checks leaves (UNTOUCHED — did not exist before this session either; see §6)

**Is:** No relaxation pass exists anywhere in `src/`. There is no quadtree
collision-rejection step in the layout pipeline at all. (The original
diagnosis this project's brief was written against described a
`Tl(root, 50, 30)` call operating on leaves only, from an older minified
bundle — that code is not present in current `src/`. Don't go looking for it
to "extend" it; you're writing it from scratch.) `src/layoutMetrics.js`
*measures* leaf and branch collisions (that's its whole job — see §3) but it
does not *fix* anything; it's read-only diagnostic code.

**Fix to make:** Write a real relaxation pass, called after the geometry
pass (after [src/treeLayout.js:261](src/treeLayout.js#L261), before
`buildBotanicalLayout` returns). Sample each branch spine at 8 points, add
leaf-cluster positions too (once clusters exist — see fix 3/§5), build one
d3 quadtree over all of it, and for any pair closer than 12px where neither
is an ancestor of the other, nudge them apart (perpendicular to their local
tangent is the natural direction, but that's an implementation choice — the
constraint is "closer than 12px between unrelated elements after relaxation
should be ~0", not "must be gradient descent"). `src/layoutMetrics.js`'s
`computeLayoutMetrics` already implements the *measurement* half of this
(same 12px threshold, same ancestor-exemption logic, same sibling/junction
exemption) — read it before writing the relaxation pass so the two agree on
what counts as a collision.

If fix 4 (wedge containment) is implemented correctly first, branch-pair
collisions should already be close to zero by the time you get here, per the
brief. Leaf-pair collisions are the part relaxation is doing the real work
on.

**Status:** Not started.

### Fix 6 — S-curved branches (pre-existing, needs re-basing)

`computeSCurveSpineGeometry`
([src/treeLayout.js:360-415](src/treeLayout.js#L360-L415)) already builds a
compound Bézier: `p1` extends ~40% of branch length along the parent's exit
tangent, `p2` approaches the target from the child's own heading, with
seeded perpendicular offsets of opposite sign (`s1`/`s2`, lines 384–385)
producing the S shape. This logic predates this session and predates fix 1;
it was already being fed `parent.exitTangent` before, and now (post fix 1) it
correctly receives either `parent.exitTangent` or `limbOrigin.entryTangent`
depending on whether the node is a limb root (lines 236–249). **What needs
re-checking:** once fix 4's wedge clamp is added, it clamps these same
`p1`/`p2` points — verify the S-curve shape still reads as an S after
clamping and doesn't get visually flattened by an overly tight wedge.

**Status:** Present, structurally connected correctly to fix 1's output, not
yet re-verified visually and not yet wedge-clamped (fix 4 not done).

### Fix 7 — Long sweeping limbs crossing the trunk (pre-existing, needs re-basing, one known deviation from brief)

[src/treeLayout.js:150-152](src/treeLayout.js#L150-L152) picks the top 2–3
depth-1 subtrees by `subtreeSize` into a `sweepingLimbs` set.
[src/treeLayout.js:212-219](src/treeLayout.js#L212-L219) gives those limbs a
different placement formula: a `sweepDist` of **480px ± 50px**
(`480 + (seedHash(...) - 0.5) * 100`), not the brief's "±80px sweep" — this
is a real deviation, not a typo; someone before this session chose a bigger,
fixed-ish sweep distance rather than a small offset added to normal
placement. Decide deliberately whether to keep the bigger sweep (visually,
it's what makes limbs actually cross the trunk axis rather than just lean
toward it — a small ±80px offset on top of normal radial placement likely
would *not* cross the trunk given the trunk is only ~50px wide and limbs
already reach 600–1000+px out) or reduce it — but if you reduce it, verify
in a screenshot that limbs still visibly cross the trunk axis, since that's
the entire point of this fix per the brief ("This asymmetry is what stops it
reading as a fountain"). This logic also needs to respect fix 4's wedge
containment once that lands — it currently computes `x3/y3` directly without
any wedge awareness, same as everything else pre-fix-4.

**Status:** Present, functionally different constant from the brief's
literal spec, not yet re-verified visually post fix-1, not yet
wedge-constrained.

### Fix 8 — Irregular silhouette (pre-existing, needs re-basing)

`silhouetteNoise(angle)` ([src/treeLayout.js:19-24](src/treeLayout.js#L19-L24))
sums three seeded sine/cosine terms for ±15%-ish low-frequency variation,
applied at [src/treeLayout.js:130-131](src/treeLayout.js#L130-L131)
(`effectiveRadius = baseCanopyRadius * (1.0 + noise)`) before the `R_min`-
derived band multiplication. This is applied *before* the R_min check per
the brief's step 8 requirement (spacing guarantees hold at the tightest
point) — that ordering is already correct. **What changes under fix 3:**
once `baseCanopyRadius` is no longer a single global value driving every
leaf (fix 3 makes radial reach depend on lineage size and depth), re-examine
whether `silhouetteNoise` should still multiply a single global
`baseCanopyRadius`, or whether it needs to modulate each lineage's own
computed radius instead — otherwise the lumpiness could get inconsistently
distributed once band assignment is no longer index-based.

**Status:** Present, mathematically self-consistent with the current (pre
fix-3) radius model, will need re-evaluation once fix 3 changes what radius
means per-leaf.

### Fix 9 — Droop at twig tips (pre-existing, needs visual re-check)

[src/treeLayout.js:393-397](src/treeLayout.js#L393-L397): for any node with
no children, `p2y` gets pushed down by `8 + seedHash(...) * 8` pixels
(4–16px range, applied at half-weight — `p2y += droop * 0.5`) in the last
control point before the tip, producing a gentle downward bend in roughly
the terminal segment while the branch overall still trends upward (subject
to the upward-growth clamp at lines 400–401). This is structurally sound and
independent of everything else. **What needs checking:** once leaf clusters
exist (fix 3/§5), verify droop is applied to the *twig* spine (the shared
branch leading to the cluster), not per-individual-leaf, since with clusters
there's one twig serving 2–3 leaves, not one branch per leaf.

**Status:** Present, likely fine, not yet visually re-confirmed post fix 1,
needs re-pointing at twig spines instead of per-leaf spines once clusters
exist.

### Leaf clusters (UNTOUCHED, design decided — see §5)

**Is:** One leaf per terminal node, one twig per leaf, rendered by
`createLeafNode` in [src/leafRenderer.js](src/leafRenderer.js) and placed at
each leaf node's own `x3/y3` tip
([src/main.js:154-159](src/main.js#L154-L159)). No sharing, no clustering, no
`t = [0.55, 0.78, 1.0]` sampling anywhere in the codebase.

**Fix to make:** See §5 for the full reasoning. Short version: group
terminal siblings into twigs of up to 3, alternating sides along a shared
parent twig, with leaves attached at `t = 0.55 / 0.78 / 1.0` along that
twig's spine. Build this together with fix 3, not after it (§5 explains
why — it changes fix 3's math, not just its visuals).

**Status:** Not started.

---

## 5. Decisions already made, with reasoning

**Leaf clusters share one twig, leaves alternate sides, at
`t = [0.55, 0.78, 1.0]` along the twig's own spine.** The reference PDF
shows leaves growing along a shared final twig, not radiating individually
from a junction — this matches the poster (§1), and it's also what the
brief's step 9 assumes when it says "leaf clusters already exist at
`t = [0.55, 0.78, 1.0]`" (they don't, in this codebase — see §6 — but the
*t*-value convention the brief describes is worth keeping, since it defines
where along a twig's Bézier each leaf's anchor sits).

**Arc allocation must index twigs, not leaves, with `R_min` recomputed from
twig count — and this must be built together with fix 3, not after it, and
not before it either.** Two independent reasons converged on this, both
worth understanding so you don't undo it:

1. *Correctness*: fix 5's relaxation pass needs to check real leaf-cluster
   positions, not a single branch endpoint standing in for 2–3 leaves — a
   pass that only checks branch tips would silently allow two clustered
   leaves to overlap each other or a neighboring twig's leaves, since it
   never looks at where the leaves actually end up relative to the twig's
   endpoint.
2. *Math dependency*: arc allocation currently gives each of the 117 leaves
   its own slot, and `R_min` ([src/treeLayout.js:118](src/treeLayout.js#L118))
   is derived directly from that leaf count (`N`). If sibling leaves start
   sharing a parent twig, you get roughly 40 twigs of ~3 leaves each instead
   of 117 independent slots — that changes `N`, which changes the required
   canopy radius, which changes which band a lineage lands in. Tuning fix
   3's size-aware banding against 117 independent leaf slots and then
   retrofitting clustering afterward would mean redoing fix 3's tuning from
   scratch, since the underlying unit of allocation (`N`) would change out
   from under it.

So: build the twig-grouping logic first (or at least decide it fully) inside
the same work session as fix 3, have `collectOrderedLeaves`/`N`/`R_min`
operate on twig count, and only then tune the size-aware band mapping.

**Limb attachment laterality scoring weights downward-lean extra (0.75× on
the portion of deviation past horizontal), not just angular distance from
vertical.** A limb that's merely off-vertical but still pointing somewhat
upward reads differently in the reference poster than one that's genuinely
drooping sideways-and-down — the brief explicitly calls out "most lateral
*and downward-leaning*" for the lowest attachment, treating these as related
but distinct signals. A pure angular-distance-from-vertical score would rank
a limb pointing due horizontal the same as one pointing 45° past horizontal
(both 90°+ from vertical in absolute terms would actually differ, but a
naive `abs(angle - vertical)` score doesn't specifically reward crossing
past horizontal into "downward" territory the way the brief's wording
implies it should). The extra weight on the past-horizontal portion is what
makes that distinction show up in the sort order.

**`originLead = rootTrunkLength * (1 - frac)` is added on top of
`depthRadiusStep * depth` for a limb's descendants' radial reach.** Without
this term, a limb attached low on the trunk (small `frac`) would have its
descendants' radii computed purely from `depthRadiusStep * depth`, giving it
noticeably less total reach than a limb attached at the apex (`frac = 1.0`),
purely as a side effect of where it happens to leave the trunk — visually
that would make low-attached limbs look stunted relative to high-attached
ones for no reason connected to their actual subtree size or depth. Adding
`rootTrunkLength * (1 - frac)` means a limb attached at 35% gets a `0.65 *
rootTrunkLength` head start compensating for its lower origin, while a limb
at the apex (`frac = 1.0`) gets none (it doesn't need any — it's already as
high as the trunk goes). This keeps overall canopy reach roughly comparable
across limbs regardless of attach height, which is what lets the debug
screenshot in §2 show a canopy that still reads as one connected tree rather
than four disconnected clumps at wildly different scales.

**Limb-root base width interpolates between the trunk's own base and tip
width at the attach fraction**
(`rootBaseWidth + (root.tipWidth - rootBaseWidth) * limbOrigin.frac`, line
242). The trunk visually tapers from thick at the base to thinner at the
apex; a limb leaving low on the trunk should visually appear to come off a
thicker section of trunk than one leaving near the top. This is a small
detail but it's what stops a low-attached limb from looking like it's
awkwardly thin relative to the trunk section it's actually leaving from.

**`layoutMetrics.js` is written to run identically in Node
(`scripts/report_metrics.mjs`) and in the browser (imported directly by
`main.js`), rather than as a browser-only diagnostic.** This means the
"expected metric values" handed to a screenshot-taking tool in the
verification protocol (§8) are always the layout code's *own* self-reported
numbers, computed the exact same way whether or not a browser is available —
there's no separate hand-maintained "expected" calculation that could drift
out of sync with what the actual running code does. If you change the
collision thresholds or fill-grid cell size, change them once in
`layoutMetrics.js` and both the headless script and the live app pick it up.

**Debug overlay (`#btn-debug`, `renderDebugOverlay` in
[src/main.js:224-283](src/main.js#L224-L283)) is a separate SVG layer with
`pointer-events: none`, toggled by `display`, not deleted/rebuilt on every
render toggle.** Keeps it from interfering with leaf/node click-to-trace
interaction, and keeps the render loop in `renderTree` simple (the overlay
is drawn once per `renderTree` call, at the end, from the same
`layoutResult` everything else used — so it's never looking at stale
geometry).

---

## 6. Divergences and traps

**No relaxation pass existed before this session**, despite the original
project brief describing one (`Tl(root, 50, 30)`, from a diagnosis against
an older, different, minified bundle than what's in this `src/` — that
bundle is not in this repository's history as far as this session could
determine). Fix 5 is "add a relaxation pass," not "extend the existing one."
Don't spend time grep-ing for `relax`/`collide`/`quadtree` expecting to find
a partial implementation to build on inside `treeLayout.js` — you won't; the
only quadtree usage in `src/` is `quadtreeCuller.js`'s viewport culling
(unrelated) and `layoutMetrics.js`'s measurement code (read-only, added this
session).

**No leaf clusters existed before this session**, for the same reason — the
brief describes `t = [0.55, 0.78, 1.0]` sampling as already present; it
isn't. This is a build-from-scratch task, not a bug fix on existing cluster
code, and §5 records the design decisions made for how to build it.

**Half-finished "Part B" work (silhouette noise, 480px sweep, S-curves,
droop) sits layered on top of what was, until this session, a broken core
layout.** This is pre-existing code (not written this session) that
implements fixes 6, 7, 8, 9 to varying degrees of fidelity to the brief (see
§4 for each one's specific status and deviations — fix 7's sweep distance in
particular is a real, deliberate-looking deviation from the brief's literal
"±80px", not an error). The decision made this session (confirmed, not
re-litigated) is to **re-base this code onto the fixed layout as fixes 1–5
land, not delete and rewrite it.** It's structurally sound; it just needs to
keep working correctly as its inputs (parent tangents, radius model, wedge
constraints) change underneath it.

**`dist/index.html` is a tracked build artifact, not a generated-and-
gitignored file.** It's committed to the repo (`git ls-files` shows it).
That means: if you change anything under `src/` or `index.html`, run
`npm run build` and include the resulting `dist/index.html` diff in the same
commit — otherwise the "deliverable" file goes stale relative to source and
a reviewer diffing `dist/index.html` against `src/` will see a mismatch that
looks like a bug.

**Pre-existing verification scripts reference a machine-specific path.**
`scripts/verify_metrics_and_screenshots.js`,
`scripts/verify_final_spec.js`, `scripts/verify_single_limb.js`,
`scripts/capture_screenshots.js`, `scripts/capture_no_overlap.js` all predate
this session. The one this session read in full
(`verify_metrics_and_screenshots.js`) hardcodes
`C:/Users/mahmoud/.gemini/antigravity/brain/ad9955dd-.../` as its output
directory and launches Playwright with `channel: 'msedge'` — that path won't
exist on a different machine, and the Edge channel requirement may not
either. Treat these scripts as reference material for the collision-
threshold conventions they use (this session's `layoutMetrics.js` deliberately
mirrors their 38px leaf-center-distance threshold so numbers are comparable)
rather than as working tooling you can just run. If you want a working
headless check, use `scripts/report_metrics.mjs` (this session's addition —
no machine-specific paths, no Playwright dependency, pure Node).

**`.gitignore` didn't actually ignore anything before this session**,
despite a commit in this repo's history literally titled "gitignore file"
(commit `332d31b`) — no `.gitignore` file was actually included in that
commit's changed-files list. This session added a real one
(`node_modules/` only, minimal). If `git status` ever shows `node_modules/`
as untracked-and-about-to-be-staged, something's wrong with the `.gitignore`
— check it's still present and unmodified before running any broad `git add`.

**The vite build prints `Unknown input options: inlineDynamicImports`.**
This is a `vite-plugin-singlefile`/Rollup version-compatibility warning from
`vite.config.js`'s `rollupOptions.inlineDynamicImports` field, and it
predates this session's changes. The build still succeeds and still produces
a correct single-file output. It is not a regression signal from any layout
change — don't chase it unless the build actually starts failing.

**Two separate `eachBefore` walks in `buildBotanicalLayout`** (position pass
at [src/treeLayout.js:173](src/treeLayout.js#L173), geometry pass at
[src/treeLayout.js:227](src/treeLayout.js#L227)) look like they could be
merged into one pass at first glance. They can't, cleanly: the geometry
pass's start tangent for a non-limb-root node reads `parent.exitTangent`
(line 248), which is only set once the parent's *own* geometry (its `p2`,
its derivative at `t=1`) has been computed — i.e., the geometry pass must
visit parents strictly before children and must have each parent's full
Bézier finished before computing any child's. A single merged pass would
need `x3/y3` for a node's *whole subtree* to be known before that node's own
geometry could be computed for width-taper purposes in some orderings, and
in practice the position pass separately needs `limbOrigin` inheritance to
happen top-down before geometry can consume it. Keep them separate.

---

## 7. What must not regress

These worked before this session and must still work after any change:

- **Leaf text renders correctly inside the leaf shape.** The text `<g>` is
  nested inside the rotated leaf-body `<g>`, not a sibling of it — see
  [src/leafRenderer.js:83-116](src/leafRenderer.js#L83-L116) (specifically
  the comment "APPENDED TO leafBodyGroup" at lines 83 and 114). If you touch
  leaf rendering for the cluster work, keep this nesting; flattening it back
  out reintroduces the original text-placement bug.
- **Arabic search normalization** —
  [src/arabicNormalizer.js](src/arabicNormalizer.js), specifically that
  عبدالله / عبد الله / عبدله all normalize to the same string. Untouched this
  session; don't need to touch it for layout work.
- **Tapered branches as filled polygons**, width driven by
  `sqrt(childSubtreeSize / parentSubtreeSize)` —
  [src/branchGenerator.js](src/branchGenerator.js) +
  [src/treeLayout.js:254-257](src/treeLayout.js#L254-L257) (`node.tipWidth =
  Math.max(0.8, node.baseWidth * Math.sqrt(childSize / parentSize))`).
- **Seeded pseudo-randomness keyed on person id** — every random-looking
  choice in the layout (`seedHash(node.data.id + '_something')`) must stay
  keyed on a stable per-person string so the tree renders pixel-identical
  across reloads. When adding new randomized behavior (cluster leaf
  ordering, relaxation nudges, anything), seed it the same way — never use
  `Math.random()` anywhere in `treeLayout.js`, `branchGenerator.js`, or
  `leafRenderer.js`.
- **Leaf-index arc allocation with contiguous subtree ranges** —
  `collectOrderedLeaves` ([src/treeLayout.js:49-64](src/treeLayout.js#L49-L64))
  must keep producing contiguous `leafIndex` ranges per subtree. This is the
  structural property fix 4's wedge-containment claim depends on (§4) — if
  it breaks, wedge clamping stops being sufficient to prevent crossings.
- **`d3.interpolateZoom` camera flight** —
  [src/camera.js:48-87](src/camera.js#L48-L87) (`flyToNode`), triggered on
  leaf/node click and on search-result click.
- **Lineage tracing via `stroke-dashoffset`** —
  [src/lineageTracer.js](src/lineageTracer.js), triggered from the same
  click handlers as camera flight.
- **The single-file build** — `npm run build` must keep producing one
  self-contained `dist/index.html` with the font inlined as base64, no
  external network requests. Don't add any external CDN script/stylesheet
  reference to `index.html` or any `src/*.js` file.
- **The "single limb preview" and "2000-node stress test" buttons** —
  `isSingleLimbMode` (filters to root + first-child chain, 3 generations) and
  the synthetic-data swap ([src/main.js:366-388](src/main.js#L366-L388)) —
  both call `renderTree` with different inputs and must keep working since
  they're useful for isolating layout bugs on a smaller tree while you work.

---

## 8. The verification protocol

**The core constraint: whoever (or whatever) is implementing these fixes
cannot assume it can see the rendered output.** Every real bug found in this
project so far — before and during this session — was found by looking at
the render, not by reading the layout math and reasoning about it abstractly.
Don't trust your own mental model of what a set of Bézier control points and
polar coordinates will look like; check.

**If you have browser preview tooling available** (this session had access
to an in-app Browser pane with `preview_start`/`navigate`/`computer`
(screenshot)/`javascript_tool` tools — check whatever harness you're running
in for something equivalent), use it directly:

1. Start the dev server: this repo has `.claude/launch.json` configured with
   a `family-tree-dev` entry (`npm run dev`, port 5173) — if your tooling
   reads that file format, start it by name; otherwise run `npm run dev`
   yourself and point your browser tooling at `http://localhost:5173`.
2. The initial camera framing only shows a small piece of the tree at
   default zoom (the `initCamera` scale, `initialScale = 0.42` in
   [src/camera.js:32](src/camera.js#L32), frames around world coordinates
   `(1700, 1450)` — reasonable for interactive use but too tight to see the
   whole canopy in one screenshot). Use the `window.__setView(cx, cy, k)` dev
   hook added this session ([src/main.js:208-214](src/main.js#L208-L214)) —
   e.g. `window.__setView(1800, 1700, 0.15)` frames the whole tree; call it
   via whatever JS-execution tool your browser tooling provides.
3. Toggle `#btn-debug` (click it, or `document.getElementById('btn-debug').click()`
   via JS) to overlay: the grass line, the sector boundary rays, the canopy
   band ellipses, and magenta markers at every depth-1 limb's attachment
   point (labelled with id and height fraction) plus every trunk-lineage
   node's position. This overlay is what made fix 1's attachment heights
   visible at a glance — it should do the same for fix 2's widened sector
   and fix 3's size-aware bands once those land.
4. Take a screenshot. Compare by eye against `End-20-12-2024.pdf`.
5. Read `window.__treeMetrics` (or the browser console, which logs it on
   every render as `[TREE METRICS] {...}`) for the live numbers, or just run
   `node scripts/report_metrics.mjs` in a terminal — same numbers, no
   browser required, since `layoutMetrics.js` runs identically in both
   places (§5).

**If you don't have browser preview tooling**, fall back to the protocol
this project has used throughout: stop, and hand back a paste-ready prompt
for a tool that does have browser control (the project's prior instances
used one called Antigravity) to run the app and screenshot it. Always
include, in the prompt you hand back:

- The exact URL and any setup steps (`npm run dev`, wait for port 5173).
- The exact `window.__setView(...)` call(s) to frame what you need to see —
  don't make the screenshotting tool guess a zoom level.
- Whether to toggle `#btn-debug` first.
- Exactly what to compare against in the reference PDF (which structural
  element — trunk ovals, a specific limb, the flank fill, the silhouette).
- **The metric numbers you expect**, computed by actually running
  `node scripts/report_metrics.mjs` against your changes before handing off
  the prompt — not a guess. This is what lets whoever reads the screenshot
  tell whether the render agrees with the code's own model of itself, per
  this project's existing convention. Report these fields specifically:
  - `leafPairCollisions` and `branchPairCollisions` — **once twig clusters
    exist, also report `twigPairCollisions` separately from raw
    `leafPairCollisions`**, since a cluster's own 2–3 leaves sit close
    together by design and must not be counted as a violation against each
    other (the `clusterId`-exemption stub in `layoutMetrics.js` — see §3 —
    handles this once you set `node.clusterId`; until then there's no
    `twigPairCollisions` field to report, since twigs don't exist).
  - `R_min` versus `radiusUsed`.
  - `canopyFillPct` overall, plus `leftFlankFillPct` and `rightFlankFillPct`
    separately.

**Checkpoint cadence** (per the original project brief, still the right
cadence): screenshot after fix 1 (done — see §2), after fix 2, after fix 3
(bundled with clusters — see §5 for why), after fixes 4 and 5 together, and
after fixes 6–9's re-basing is confirmed still correct. Don't batch multiple
fixes into one unreviewed screenshot request beyond what's listed here —
each of these fixes changes the render enough that stacking un-reviewed
changes makes it hard to tell which fix caused which visual problem if
something looks wrong.

---

## 9. Immediate next action

Fixes 1 and 2 are both landed and visually confirmed (§2). **Implement fix 3
together with leaf clustering**, per the design already decided in §5 — do
not implement fix 3's band-mapping logic against the current
117-independent-leaves model and expect to reuse that tuning after adding
clusters; §5 explains why that doesn't work (clustering changes what `N` —
the count driving `R_min` and arc allocation — actually means, from 117
leaves to roughly 40 twigs).

This is the largest remaining piece of work before fix 4/5. Concretely, in
order (full detail in §4's "Fix 3" section):

1. Write the twig-grouping logic: for internal nodes whose children are all
   terminal leaves, group those leaf-children into twigs of up to 3, with
   per-leaf angular offsets around the twig's angle (alternating sides) and
   attachment at `t = 0.55 / 0.78 / 1.0` along the twig's own spine.
2. Rework `collectOrderedLeaves` (or add a sibling function) so `N` counts
   twigs, not leaves, and `R_min` / the angle-allocation loop
   ([src/treeLayout.js:118](src/treeLayout.js#L118),
   [src/treeLayout.js:124-144](src/treeLayout.js#L124-L144)) index by twig.
3. Replace the `idx % 3` radial-band lookup
   ([src/treeLayout.js:134](src/treeLayout.js#L134)) with one derived from
   the depth-1 ancestor's `subtreeSize` (large lineages → outer bands, small
   → inner), keeping light `% 3`-style texture within a lineage.
4. Replace the fixed `depthRadiusStep`
   ([src/treeLayout.js:148](src/treeLayout.js#L148), applied at
   [src/treeLayout.js:221](src/treeLayout.js#L221)) with
   `step = availableRadialSpan / subtreeHeight` per node, so short lineages
   stop near their limb origin instead of being stretched to match deeper
   siblings.
5. In `src/leafRenderer.js`, add whatever's needed to render a twig's 2–3
   leaves at their individual anchor points while keeping the text-nested-
   inside-rotated-group pattern intact (§7 — must not regress).
6. Set `node.clusterId` on sibling leaves sharing a twig — this makes
   `layoutMetrics.js`'s existing collision-exemption logic (§3) start
   working for free, and is also what will let you report `twigPairCollisions`
   separately from `leafPairCollisions` per §8's protocol once you get to a
   checkpoint screenshot.

After the change: rebuild, run `node scripts/report_metrics.mjs`, and expect
`leftFlankFillPct`/`rightFlankFillPct` to move meaningfully off 0 for the
first time (currently 0/0 — §2) since this is the fix that actually targets
leaf density at the flanks, not just the angular range fix 2 opened up.
`leafPairCollisions`/`branchPairCollisions` may still be nonzero — that's
still expected until fix 4/5.
