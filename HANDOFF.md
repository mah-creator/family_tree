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
5173) so any harness with dev-server preview tooling can bring it up by name.

**Can you see the render? Check before you trust any visual claim.** The
interactive Browser pane is a Claude Code DESKTOP-app feature and the desktop
app is Mac/Windows only, so a Linux terminal CLI install has no pane — the
tools are absent from the harness entirely, which is not the same as a
localhost restriction. This matters more than it sounds: nearly every real
defect here was invisible in the metrics and obvious in the render. Leaves
lying flat along the branch instead of growing out of it passed every numeric
check. **`scripts/capture.mjs` closes the gap on any platform** — Playwright
writes PNGs, and your `Read` tool renders them. Full protocol in §8; read it
before claiming anything looks right.

### Fix-by-fix status

| # | What | Status |
|---|------|--------|
| 1 | Single-origin limbs → per-limb trunk attachment | **Landed.** Extended twice since: up the trunk chain (spine nodes carry their own origins), then to every trunk-attached subtree |
| 2 | Sector widened to 230° | **Landed** |
| 3 | Size-aware radial reach | **Landed**, then largely superseded — radial position is now `parentRadial + advance + bandIndex × bandGap`, accumulated per node |
| — | Leaf clusters (twigs, shared parent branch) | **Landed.** Cluster size scales with tree size (3–6); leaves attach by petiole, not perpendicular offset |
| 4 | Wedge containment for branch curves | **Landed.** Only `p2` is wedge-clamped; `p1` is governed by a ±50° tangent cone instead (clamping `p1` raised curls) |
| 5 | Relaxation pass | **NOT STARTED — this is the next task.** See §9 |
| 6 | S-curved branches | **Landed.** Flex is capped against neighbour arc distance, not branch length |
| 7 | Long sweeping limbs crossing trunk | **Landed and load-bearing** — see the regression guard in `scripts/check_invariants.mjs`. Disabling it takes tree.json cross-limb crossings 1 → 15 |
| 8 | Irregular canopy silhouette | **Not started.** Do NOT reach for silhouette noise to fix the visible partings between limbs — see §9 |
| 9 | Twig-tip droop | **Landed** |

Beyond the original nine, these were found and fixed by scale testing, and
each is a load-bearing invariant now:

| What | Why it exists |
|---|---|
| Planarity by nested ordering | Cross-limb crossings are structurally forbidden: within each half of the sector, a lower attachment gets a range further from vertical. Asserted by `verifyLimbOrdering` |
| Junction-turning constraint | Caps subtree range at 70° from the parent's heading; trunk-attached units exempt |
| Area-based band packing | Band count scales as √(twigs/7), so `R_min` grows as √N rather than linearly |
| Variable-width angular slots | Each twig claims arc proportional to its own cross-axis extent |
| Additive band offsets | Bands are a real radial distance, not a multiplier on a per-lineage step |
| Chord-vs-tangential bound | A node must advance radially by ≥0.85× the tangential distance it travels |
| Derived canvas | `layoutToFit` runs the layout twice — measure, then size the world to fit |

### Current state (run `node scripts/check_invariants.mjs`, and
`node scripts/report_metrics.mjs [dataset]`, after every change)

Three datasets. `tree.json` (117 leaves) is the real deliverable — the client
pitch is 181 people. The other two are scale tests; the client's eventual
dataset is ~2,000 names, so the 521 and 1,128 columns matter for whether the
design survives, not for how the demo looks.

| | tree (117) | tree_1000 (521) | tree_2000 (1128) |
|---|---|---|---|
| twigs | 64 | 306 | 531 |
| bands / gap | 3 / 82 | 7 / 137 | 9 / 164 |
| R_min / radius | 478 / 669 | 872 / 1221 | 1556 / 2178 |
| canopy W × H | 3402 × 2672 | 6224 × 5678 | 9022 × 6488 |
| aspect | 1.27 | 1.10 | 1.39 |
| canopy fill % | 12.0 | 14.1 | 18.6 |
| leaf collisions | 12 | 66 | 147 |
| cross-limb crossings | 0 | 2 | 32 |
| within-limb crossings | 3 | 40 | 35 |
| max junction turn | 80.4° | 79.2° | 73.5° |
| bare trunk fraction | 0.253 | 0.251 | 0.222 |

Zero throughout, at all three scales: `curlCount`, `branchesBelowTrunkBase`,
`limbOrderingViolations`, `junctionTurningOver90`.

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
orderedLeaves, orderedTwigs, N, R_min, baseCanopyRadius, attachments,
radialBands, depthRadiusStep, sector, layoutOpts }`. `orderedTwigs` (added
alongside leaf clustering) is the array of twig-group objects
(`{ id, parent, members, representative, minMemberSpacing }`) — `N` is now
`orderedTwigs.length`, not `orderedLeaves.length`. `src/layoutMetrics.js`
and the debug overlay use these to inspect the layout's own model of itself
without recomputing anything.

**`src/branchGenerator.js`** — pure function
`createTaperedBranchPolygonPath(node, samples=12)`. Samples the node's cubic
Bézier spine (`p0..p3`) at `samples` points, offsets left/right by half the
interpolated width at each point, and closes it into one SVG polygon path.
**Unchanged, including through leaf clustering** — it already returns `''`
when `p0..p3` are missing, which is exactly the state a non-representative
twig member's node is left in (§4, "Leaf clusters"), so clustered members
draw no branch of their own for free. Don't touch it for fixes 1–5 (wedge clamping
in fix 4 constrains the *spine* control points that go in; this file just
draws whatever spine it's given).

**`src/leafRenderer.js`** — `createLeafNode(node, x, y, angleDeg, showText)`
builds one leaf's SVG `<g>`: a rotated body group (leaf shape + vein) with a
nested text group inside it (this nesting is why Arabic text sits correctly
inside the leaf — don't flatten it back out). **Unchanged, and it turned out
it didn't need to change for leaf clustering** — every leaf, whether a twig
representative or a clustered sibling sampled off a shared spine (§4/§5),
still gets its own call to this exact function with its own `(x, y, angle)`;
the earlier plan in this file speculated a new code path would be needed
here, that speculation was wrong once the representative/spine-sampling
design (§4, "Leaf clusters") was worked out.

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

All line numbers below are current as of commit `801a2cf` on this branch.
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

### Fix 3 — Radial position ignores lineage size (PARTIALLY LANDED)

**Was:** Leaf radial band was `idx % 3` against `radialBands = [0.74, 0.94,
1.14]` ([src/treeLayout.js:122](src/treeLayout.js#L122)) — purely
positional, unrelated to how big the leaf's lineage is. Internal-node radial
step was `depthRadiusStep = (baseCanopyRadius * 0.65) / (maxDepth + 1)`
([src/treeLayout.js:148](src/treeLayout.js#L148)), a single fixed value
applied uniformly regardless of how many generations remain below any given
node. A short lineage (one generation deep) got dragged out to the same
per-depth step as a four-generation one, leaving unnatural gaps.

**What landed (the twig-indexing half):** The leaf-vs-cluster arc-allocation
rework is done — see "Leaf clusters" below, which was implemented together
with this fix per the plan (clustering changes what `N` means, so tuning
band assignment before clustering existed would have meant redoing it).
`collectOrderedTwigs` ([src/treeLayout.js:76-156](src/treeLayout.js#L76-L156))
replaces `collectOrderedLeaves`; `N` is now twig count (64), not leaf count
(117); `R_min`'s clearance constant is 52, not 34 (a twig cluster is wider
than a single leaf). The arc-allocation loop
([src/treeLayout.js:194-223](src/treeLayout.js#L194-L223)) iterates twigs,
assigning angle/radius to each twig's representative.

**What's still NOT done (the size-aware half — this is the actual "fix 3"
from the original brief):**

1. The band lookup is *still* `idx % 3` against the same fixed
   `radialBands`, just now applied per-twig-index instead of per-leaf-index
   ([src/treeLayout.js:206-207](src/treeLayout.js#L206-L207)). It still has
   nothing to do with lineage size. Replace it with one derived from the
   twig's depth-1 ancestor's `subtreeSize` — map larger `subtreeSize` to
   outer bands, smaller to inner. Keep some `% 3`-style texture *within* a
   lineage's assigned band range so it doesn't look robotically banded, but
   the primary driver should be lineage size, not raw index parity.
2. `depthRadiusStep` is still the same single fixed value applied uniformly
   at every internal node ([src/treeLayout.js:227](src/treeLayout.js#L227),
   consumed at [src/treeLayout.js:334](src/treeLayout.js#L334)). Replace it
   with `step = availableRadialSpan / subtreeHeight` per node (`node.height`
   after `stratify()`; verify it's still correct under `singleLimbMode`,
   which trims the person list before stratifying). A four-generation
   lineage should spread its depth steps across the full available radial
   span; a lineage that terminates one generation down should stop close to
   its limb origin rather than being stretched to match deeper siblings.
3. The `baseCanopyRadius` floor (`Math.max(R_min/0.74+180, 1150)`,
   [src/treeLayout.js:184](src/treeLayout.js#L184)) is still a single flat
   1150 regardless of `R_min` — this was deliberately left as-is (agreed
   during this session's design discussion) to be revisited once step 2
   above replaces the single global `baseCanopyRadius` concept with
   per-lineage radial reach; a single flat floor may not make sense once
   reach is computed per-lineage.

Doing 1 and 2 is what should finally move `leftFlankFillPct` /
`rightFlankFillPct` off 0% (still 0/0 as of this commit — see §2) — nothing
implemented so far targets leaf *density* at the flanks specifically, only
the *reach* (fix 2) and the *sharing of branches* (clustering).

**Status:** Partially landed — twig-indexing done, size-aware banding and
variable depth step still pending.

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

### Leaf clusters (LANDED, with two corrections beyond the original design — see §5)

**Was:** One leaf per terminal node, one branch per leaf, each placed at its
own independently arc-allocated `x3/y3` tip. No sharing, no clustering.

**Fix, as implemented:** Terminal siblings are grouped into twigs of up to 3
(`collectOrderedTwigs`,
[src/treeLayout.js:76-156](src/treeLayout.js#L76-L156); balanced chunking —
`n=4` splits `[2,2]`, not `[3,1]`). Only the twig's representative (last
member in traversal order) gets arc-allocated and goes through the normal
position + Bézier-geometry passes unchanged — it owns the twig's one real
branch. Other members get no branch and no arc-allocation slot; they're
anchored afterward by sampling the representative's *finished* spine (see
`applyTwigMemberSampling`,
[src/treeLayout.js:453-508](src/treeLayout.js#L453-L508)) at
`t = [0.45, 0.72, 1.0]` for 3 members or `[0.7, 1.0]` for 2 — widened from
the original `[0.55, 0.78, 1.0]` design (see §5's original reasoning for why
that spacing was chosen, and the correction below for why it changed) — with
a small perpendicular nudge (0.35–0.6 × 22px leaf height, seeded per leaf,
alternating sign) off the local tangent. The tip member (t=1.0, the
representative) gets no nudge. This required **no changes to
`src/leafRenderer.js` or `src/branchGenerator.js`** — `createLeafNode`
already takes an arbitrary `(x, y, angle)` per leaf, and
`createTaperedBranchPolygonPath` already returns `''` when `p0..p3` are
missing, so non-representative members simply draw no branch of their own
for free. `node.clusterId` is set on every member so
`layoutMetrics.js`'s pre-existing collision exemption (§3) activates.

**Two corrections made beyond the originally-approved design** (both are
documented in code comments at their fix sites, and in §2's "Two real bugs"
paragraph above):
1. Terminal branch length now scales explicitly with member count (1x /
   1.35x / 1.7x for 1/2/3 members) with a 40px along-twig spacing floor
   enforced analytically — this replaced an earlier version of the design
   that assumed the existing per-leaf radius formulas would produce a
   reasonably-sized "natural" length to scale from, which turned out false
   for some nodes (13.6px observed) and needed a 60px floor + stable-
   direction fallback.
2. The grass-line clamp needed to be applied to sampled non-representative
   members too, not just the representative's own tip — plus a rare
   secondary correction (X-axis stretch) for the case where that clamp
   flattens a whole twig against the grass line and compresses spacing back
   below the 40px floor.

**Status:** Landed, visually confirmed (§2). `twigCount` 64 from
`totalLeaves` 117, `minTwigMemberSpacingPx` 44 (floor 40) — both reproducible
via `node scripts/report_metrics.mjs`.

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

*Implemented with widened t-values*: `[0.45, 0.72, 1.0]` for 3 members,
`[0.7, 1.0]` for 2 — not the `[0.55, 0.78, 1.0]` originally planned here.
The original spread put adjacent members only ~0.23 of the twig's length
apart, which (combined with a 46px-long leaf shape) meant members could
overlap along the twig axis regardless of how much the twig's own length
was scaled. Widening the *t*-spread (~0.27–0.3 gaps) plus scaling twig
length with member count together satisfy a 40px minimum along-twig spacing
— see the "Leaf clusters" entry in §4 for the two runtime corrections that
were also needed (a degenerate-short-natural-length case, and a grass-clamp
interaction) to make that guarantee actually hold for every twig, not just
the typical case.

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

**Two metrics were silently wrong for a long stretch of this work. Do not
trust numbers recorded before they were fixed.**

- **`radialDist` was never set on cluster members.** Non-representative twig
  members skip the position pass (they are placed by `applyTwigMemberSampling`
  from the representative's finished spine), so their `radialDist` stayed
  `undefined`/0. More than half of all leaves reported 0. Every metric keyed on
  radial position — band separation, radial spread, anything comparing a leaf's
  distance from its polar origin — was computed over a half-zeroed array. This
  is what hid the fact that the radial bands were never realised in world
  space: the check said colliding leaves sat 20px apart radially against a
  nominal 297px band gap, and the 20px was mostly zeros differencing against
  zeros. Fixed in the same commit as the petiole work.
- **The intersection metric lacked the junction exemption** the proximity
  metric already had, so every limb counted as "crossing" the trunk spine at
  its own attachment point. That inflated cross-limb counts and sent one whole
  round of diagnosis after a non-existent ordering hole.

**STANDING CHECK: any constant compared against a length that scales with
canopy size is a scale bug waiting to happen.** Four instances so far, each
found only at 521 or 1,128 leaves and each invisible at 117:

| Constant | Compared against | Broke because |
|---|---|---|
| ±4° wedge margin | angular slot width | slot is 3.6° at 64 twigs, 0.72° at 319 — the pad spanned five slots and containment silently stopped containing |
| flex as fraction of branch length | arc distance to neighbouring slot | branch length grows as √N while arc per slot is held constant by R_min, so branches swept more slots as the tree grew |
| 90px junction exemption | branch length | 30% of a branch at 117 leaves, 14% at 1,128 — hid 321 intersections at scale |
| proportional cluster t-spread | twig length | twig length grows with the canopy, so cluster footprint did too: members ended 361px apart against a 39px floor |

The tell is always the same shape — a fix moves the number far less than it
should, and the temptation is to add another constant. Before doing that, ask
what the constant is being compared against and whether that quantity scales
with N. If it does, express the constant as a fraction of it instead.

**STANDING RULE: never verify a fix with a metric conditioned on the failure
the fix is meant to remove.** The third instance of this was a check that
measured band *separation* only over *colliding* pairs — and colliding pairs
are by definition the ones that failed to separate, so the check selected for
its own null result. It reported 0.10–0.26 where the true figure was ~0.93,
and nearly sent a working fix to the bin. Measure over the whole population,
or over a population chosen independently of the outcome.

The related, weaker lesson: when a metric moves less than a fix should have
moved it, suspect the metric before adding another constant. Three of the
rounds in this project were spent tuning constants against a measurement that
could not have responded.



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

> **READ THIS BEFORE CLAIMING ANYTHING LOOKS RIGHT.**
>
> Almost every real defect in this project was invisible to the metrics and
> visible in one glance at the render. Leaves lying flat along the branch
> instead of growing out of it passed *every* numeric check we had. So did the
> junction switchbacks, the dead-horizontal limbs, and the hairline twigs.
> **Never write "confirmed", "looks correct", or "verified" about appearance
> unless you have actually looked at a picture in this turn.** If you cannot
> look, say so and ask — do not infer appearance from numbers.

### FIRST COLD-START CHECK: can you actually see a picture?

Do this before anything visual, and do not skip it because the previous
session could see. Tool availability is a property of YOUR harness, not of the
repo — the same distinction that makes the Browser pane present here and
absent on a Linux CLI applies to image rendering too, and it has not been
verified there.

```bash
npm run dev &                                  # or in another terminal
node scripts/capture.mjs --shot fit --out shots
```

Then open `shots/fit.png` with your `Read` tool and **describe what you see**
— roughly: a brown trunk with gold ovals stacked up it, green leaves on
branches, a cream background inside a dark red border. If you get an image and
your description matches, the loop works and you are at tier 2. If you get an
error, a file path with no picture, or you find yourself guessing from the
filename, then `capture.mjs` is writing files nobody can look at: **you are at
tier 3 and must ask the human for every visual check.** Say so explicitly at
that point rather than proceeding quietly.

(Verified working in the Claude Code desktop app on Windows. NOT yet verified
in the terminal CLI on Linux — that is exactly what this check settles.)

### Can you see the render? Find out first

Three tiers, in order of preference. **Tier 2 works everywhere and is the
one to use unless you know you have a pane.**

**Tier 1 — interactive browser pane (desktop app only).**
If your tool list has `preview_start` / `computer` / `navigate`
(`mcp__Claude_Browser__*`), you can drive a live pane: `preview_start` with the
`family-tree-dev` config from `.claude/launch.json`, then `window.__setView(...)`
via `javascript_tool`, then `computer` with `action: "screenshot"`.
This is a **Claude Code desktop-app** feature, and the desktop app is
**Mac/Windows only** — so on a Linux terminal CLI install these tools are
simply absent. Not a localhost restriction: the tools are not in the harness
at all. Check your own tool list rather than assuming either way.

Two quirks if you do have it: batching `__setView` and `screenshot` in one
`browser_batch` captures the PRE-batch frame, so issue them as separate calls;
and the pane's rendered viewport can differ from `window.innerWidth`, which is
why `__setView` measures the SVG's own rect instead.

**Tier 2 — headless capture, then look at the file. Works anywhere.**

```bash
npm run dev                    # terminal 1
node scripts/capture.mjs       # terminal 2 — writes shots/*.png
```

Then **open the PNGs with your `Read` tool**, which renders images. That is
the whole trick: Playwright draws, `Read` shows you. Verified working —
Playwright is already a devDependency; the browser binary needs
`npx playwright install chromium` once (Linux may also want
`npx playwright install-deps chromium`).

The standing shot set is `fit`, `trunk`, `cluster`, `crown` — whole tree,
trunk column, a 3x twig crop, and the upper canopy. Add shots rather than
editing existing ones, or you lose before/after comparability. Arbitrary
views: `node scripts/capture.mjs --view 2400,1800,0.6`. Other datasets: point
`src/main.js`'s import at `tree_1000.json`, capture, then **put it back**.

**Tier 3 — ask the human.** If neither works, stop and ask. Do not guess.
Give a numbered list they can act on without re-deriving anything: exact
command, exact view, and what to compare against in the reference PDF. Like
this:

> Please run `npm run dev`, open http://localhost:5173, and capture these
> four. Paste `window.__setView()` in the browser console to fit the tree; it
> returns the `cx, cy, k` it chose, so the others can be given relative to it.
>
> 1. **Whole tree.** Console: `const v = __setView(); __setView(v.cx, v.cy, v.k*0.9)`.
>    Compare against the PDF's overall silhouette: is the crown a broad rounded
>    dome, or a candelabra with visible gaps between limbs?
> 2. **Trunk column.** `const v = __setView(); const o = __layout.layoutOpts;
>    __setView(o.trunkCenterX, o.trunkBaseY - o.height*0.22, v.k*2.2)`.
>    Compare against the poster's trunk: root oval at the base, gold ovals
>    stacked upward, bare trunk roughly the bottom quarter before the first
>    limbs.
> 3. **One leaf cluster, close.** `const v = __setView();
>    const t = __layout.orderedTwigs.filter(x => x.members.length >= 3)[5];
>    const r = t.representative;
>    __setView((r.p0.x + r.x3)/2, (r.p0.y + r.y3)/2, v.k*6)`.
>    Compare against the poster's twigs: each leaf should leave the branch at
>    an angle on its own short stem, alternating sides — NOT lying flat along
>    the branch.
> 4. **Upper canopy.** `const v = __setView(); const m = __treeMetrics.leafBBox;
>    __setView((m.minX+m.maxX)/2, m.minY + (m.maxY-m.minY)*0.25, v.k*1.6)`.
>    Compare against the poster's foliage: is it a continuous mass, or are
>    there radial partings between limbs?

### What to report alongside any screenshot

Run `node scripts/check_invariants.mjs` (both tracked datasets) and
`node scripts/report_metrics.mjs [dataset]`. State the numbers you expect
BEFORE looking, so a disagreement between the render and the code's own model
is visible rather than rationalised. The metrics that have actually caught
things: `curlCount`, `branchesBelowTrunkBase`, `junctionTurningOver90`,
`limbOrderingViolations`, `crossLimbIntersections`, `leafPairCollisions`,
`canopyFillPct`, `bareTrunkFraction`, `minBranchWidthPx`.

**Checkpoint cadence:** look after every change that moves geometry, and
before every commit that claims a visual improvement. Do not stack two
geometry changes behind one screenshot — when it looks wrong you will not know
which one did it, and this project has burned rounds on exactly that.

---

## 9. Immediate next action

**Fix 5 — the relaxation pass. It is the only one of the original nine never
started, and everything else is now in place for it.**

Residual it must handle, from the table in §2:

| | tree (117) | tree_1000 (521) | tree_2000 (1128) |
|---|---|---|---|
| leaf collisions | 12 | 66 | 147 |
| within-limb crossings | 3 | 40 | 35 |
| cross-limb crossings | 0 | 2 | 32 |

Notes that will save you a round:

- **Do not tune it against 117 alone.** Every constant in this layout that was
  fitted at 117 leaves broke at 521 or 1,128 — the ±4° wedge margin, the
  fraction-of-length flex, the flat canopy clearance, the hardcoded canvas.
  Check all three scales on every change; `scripts/check_invariants.mjs` runs
  two of them and `report_metrics.mjs` takes a dataset argument.
- **The residual is mixed, not same-band-only.** At 1,128 both same-band and
  cross-band pairs appear, so a pass that only nudges within a band will miss
  most of it.
- **Cross-limb at 1,128 is 32 and has been creeping** (5 → 20 → 25 → 32 across
  recent changes) while `limbOrderingViolations` stayed 0 the whole time. That
  is the same signature as the bands: the guarantee holds in the allocation and
  not in the drawing. **Diagnose this before relaxing over it** — cross-limb is
  supposed to be structurally impossible, so relaxation there is mopping up a
  leak rather than fixing it. The specific check not yet run: for each
  cross-limb pair, take the intersection point and compute its angle as seen
  from EACH limb's own origin; if a branch from limb A lands inside limb B's
  angular range as measured from B's origin, A is intruding and the ordering
  is not realised in world space.

Then, in order:

1. **Leaf jitter for the radial partings.** The canopy shows visible gaps
   between limbs — a consequence of strict wedge containment, since disjoint
   wedges leave real space between subtrees where the poster has merged
   foliage. **Do not fix this with fix 8's silhouette noise.** Fix it at
   source: drop inter-limb angular padding to near zero and add seeded angular
   jitter to LEAF POSITIONS ONLY, never to branch paths. Leaves then interleave
   across the parting while branches still cannot cross, and
   `leafPairCollisions` polices the result. Size the jitter against the
   headroom the bands actually leave, not a fixed fraction of a slot.
2. **Fix 8, the crown.** Only after the above. Canopy aspect drifts 1.27 →
   1.10 → 1.39 across the three scales; width and height are tabulated in §2
   so you can see whether the sector needs narrowing at scale or the crown
   needs closing over the top.
3. **Canvas 2D migration.** At 1,000 nodes, pan/zoom runs at roughly 0.5 FPS
   (~2,000ms per frame). It is NOT the JS — `updateViewport` measures 4.7ms,
   the quadtree visit 2.1ms. It is browser SVG paint over ~800 branch polygons
   plus ~550 node groups, and CSS filters were roughly half of it (already
   removed). The fix is to move branch and leaf geometry to Canvas 2D and keep
   an SVG or HTML overlay for text and hit-testing at near zoom. Canvas 2D
   redraws ~1,300 filled paths per frame comfortably, and redrawing on zoom
   keeps it crisp rather than pixelated. Do this AFTER the tree looks right —
   the demo has to prove the look first.

### Open design decision: cluster density cannot reach the poster from siblings alone

The poster shows 3–6 leaves per final twig. We show one to three. Half of this
was a scale bug and is fixed; the other half is a design ceiling in the data
shape, and it is a decision rather than a defect.

**Fixed:** cluster members were spread proportionally along the twig, so the
footprint grew with canopy size — median member spacing was 109 / 212 / 361px
across the three scales against a 39px floor. Members are now anchored at a
fixed `CLUSTER_SPACING_PX` back from the tip (`twigTValues(k, twigLength)`),
which decoupled tightness from scale: spacing is now 51 / 52 / 53px at all
three sizes, and leaf collisions fell 311 → 147 at 1,128 leaves. Twigs stay
long; the leaves simply bunch at the end of them, which is the poster's look.

**The ceiling: parents do not have enough leaf children.** Measured, per
parent that has any:

| | mean leaf-children | mean longest contiguous run | parents with ≥4 leaf-children but run ≤2 |
|---|---|---|---|
| tree (117) | 2.29 | 2.25 | 0 |
| tree_1000 (521) | 1.75 | 1.73 | 1 |
| tree_2000 (1128) | 2.12 | 2.12 | 0 |

Note the first two columns are nearly equal, and at 1,128 the two histograms
are **identical**. That disproves the natural hypothesis that flushing the pool
on a non-leaf sibling (`collectOrderedTwigs`) is what caps cluster size:
allowing non-contiguous sibling grouping would gain exactly one twig across all
three datasets. The real ceiling is fan-out — in a 9-generation tree, a node
with 2–4 children mostly has children that are themselves parents, so terminal
siblings are scarce. `maxPerTwig` is correspondingly fiction: it is 6 at 1,128
leaves and no twig exceeds 3 members.

**The decision, for later, with the data above attached:** reaching the
poster's density needs a twig to carry leaves from more than one parent —
cousins, not just siblings. Sibling grouping cannot get there no matter how it
is tuned. That is a real design change: cousins under a shared grandparent do
still occupy one contiguous leaf-index range, so arc allocation and the
planarity ordering survive it, but the twig would then span two parents'
subtrees and the lineage-tracing and search paths would need checking. Do not
implement this as a tuning step — it changes what a twig means.

**One open question worth resolving early:** band realisation was measured two
ways and they disagree. Uncontrolled (median radial separation by band-index
difference) gave 54% at 521 and 93% at 1,128. Controlled per-lineage
(least-squares slope of `radialDist` on `bandIndex` within each lineage) gave
114% / 132% / 139% — i.e. bands over-separating, not under. The controlled
figure is the more trustworthy of the two, since the uncontrolled one is
polluted by lineage-to-lineage radial variation, but neither has been
reconciled and the honest answer is that band realisation is not yet a settled
number. Re-derive it before relying on it.
