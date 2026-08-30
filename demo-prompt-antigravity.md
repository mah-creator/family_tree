# Antigravity Demo Prompt — Arabic Illustrated Family Tree

Paste below the line into Antigravity. Attach the reference artwork PDF and `tree.json` to the workspace first.

**Settings:** use the middle autonomy mode (agent decides, pauses at verification checkpoints). Do not run this fully autonomous — the branch geometry needs your eyes on it. Worth trying both Gemini 3 Pro and Claude Sonnet on the renderer; they diverge a lot on this kind of task.

---

Build a **single-page visual demo** of an Arabic family-tree (مشجرة) viewer, matching the attached reference artwork. This is a pitch demo to win a contract — its only job is to prove the illustration can be generated from data and that navigating it feels great. It is **not** the production app.

## Step 0 — Ground yourself before writing code

1. Check your knowledge base for anything covering RTL and Arabic typography, SVG rendering and animation, or d3 layout algorithms. Load what's there.
2. Read the attached reference PDF **in full** and study its structure — this is an illustrated poster, not a chart. Read `tree.json` and understand its shape before designing anything.
3. Write a plan: layout algorithm, branch geometry approach, LOD strategy, and file structure. **Stop and wait for my approval.** Do not start coding.
4. As you work, save anything reusable to the knowledge base — the leaf path generator, the Arabic normalization function, the seeded-hash helper. The production build will reuse them.

## Verify visually, every step — this is why I'm using Antigravity

You can run the terminal and drive the browser. Use both. Never report a rendering step complete without visual proof:

- After each change to the renderer, start the dev server, open the page, and **screenshot the tree** at default zoom, at 5x on a random leaf, and at 390px viewport width.
- **Compare each screenshot against the reference PDF** and state explicitly what matches and what doesn't — canopy silhouette, branch taper, leaf density, trunk oval stack, colour palette, frame placement.
- Fix visual mismatches before moving to the next step. "The code runs" is not the bar; "it looks like the poster" is.
- Test the interactions in the browser too: perform a search, trigger a camera flight, click a leaf and confirm the lineage trace draws. Screenshot mid-animation.
- Attach these screenshots as artifacts so I can leave feedback on them directly.

## In scope

- One page. The tree, and nothing else.
- Data from a **static JSON file** — no database, no backend, no auth, no admin panel.
- **~500 nodes** (a quarter of the eventual 2,000).
- The full visual style from the reference.
- Pan, zoom, search, camera flight, lineage tracing, load animation.

## Explicitly out of scope

Admin panel, authentication, database, CMS pages, bulk import, PDF export, privacy rules, correction submissions. Do not build any of it. Do not stub it with placeholder UI.

## The reference artwork

The attached PDF is a printed poster, **not** a box-and-line dendrogram. Study it before designing anything.

- Botanical tree illustration on a cream/parchment background with a subtle geometric Islamic pattern, framed by an ornate gold-and-red border with decorative cartouches (ما شاء الله / تبارك الله) in the top corners. Green grass base.
- **Root ancestor at the bottom of the trunk**; growth runs upward.
- **The main lineage climbs the trunk as a vertical stack of gold/amber ovals**, one per generation, each with a name and small biographical text.
- **Sub-family founders are gold circles at branch junctions**, labelled like (جد آل بريكة).
- **Branches are tapered organic brown curves** — thick at the trunk, thin at the tips.
- **Every terminal descendant is a leaf** with the name inside, oriented along its twig. Green by default, gold for a distinguished subset.
- Dense canopy packed into a rounded silhouette.

Generate this **procedurally from the JSON**. Never use AI image generation for any part of it.

## Rendering approach

1. **Abstract layout first** — `d3-hierarchy` tidy tree or a fan layout for collision-free positions, root at bottom, generations upward. All correctness lives here.
2. **Map into botanical space** — fan transform spreading the canopy into a rounded silhouette, outermost generation constrained to an ellipse.
3. **Branches as tapered filled paths**, not strokes. Width from subtree size (Strahler number or descendant count). Cubic Béziers with control points along the parent's tangent so junctions flow smoothly.
4. **Seeded pseudo-randomness** for curvature jitter, leaf rotation, and length variation — hashed from each node's stable ID, never `Math.random()`. This makes it look hand-drawn while rendering identically every load. Keep this even in the demo; it's the foundation of the production "no distortion after update" guarantee.
5. **Leaves are SVG paths with the name inside.** Rotate the leaf to its twig, counter-rotate the text so Arabic stays upright. Auto-fit long names down to a font-size floor, then truncate with a tooltip.
6. **The decorative frame, cartouches, and background pattern are a static layer that does not zoom or pan.** If they scale with the tree they distort.

Vector only. Text must stay crisp at 20x zoom. No overlapping nodes, no crossing branches.

## Navigation — this is what sells the demo

**1. Pan and zoom.** `d3-zoom` applied to a single root `<g>`. Wheel, trackpad pinch, touch pinch, drag. `scaleExtent` ~0.3x–20x, plus `translateExtent` so the tree can't be lost off-screen.

**2. Camera flight with `d3.interpolateZoom`.** On search or result click, the camera **pulls back, arcs across the canopy, and dives into the target** — Van Wijk–Nuij smooth zooming. Never a straight-line slide at constant zoom; that's disorienting on a poster-sized canvas. Duration scales with distance, ~600ms near to ~1,600ms cross-canopy, `easeCubicInOut`. **This single detail is most of what makes the demo feel premium.**

**3. Animated lineage tracing.** On selecting a person, draw their path from the root upward using `stroke-dasharray` + animated `stroke-dashoffset`, so the route visibly grows along the trunk out to the leaf over ~800ms, while non-path nodes dim to ~15% opacity. **This is the moment that wins the contract** — it's the client's "easy to trace" requirement made visible. Polish it more than anything else.

**4. Growth animation on load.** Branches draw outward from the root by depth; leaves fade and scale in on a depth-staggered delay. Cap at 2 seconds, skippable by any interaction, first load only.

**5. Search.** A search box that finds any name and flies to it. Must normalize Arabic before matching — unify hamza forms (أ إ آ → ا), ى→ي, ة→ه, strip diacritics and tatweel, collapse whitespace, and treat عبدالله and عبد الله as the same. The reference data contains both spellings; without this, search silently fails.

**6. Ambient leaf sway.** Subtle CSS rotation with per-leaf delay from the seeded hash, in-viewport leaves only. Small touch, big effect.

Honor `prefers-reduced-motion`.

## Architecture the demo must not skip

At 500 nodes you can get away with rendering everything. At 2,000 you cannot — **2,000 Arabic `<text>` nodes will stall the main thread**, because shaping and ligature layout is expensive. If you build the demo without culling, the production version will need a rewrite.

So build these in now, even though 500 nodes doesn't need them:

- **Viewport culling** via `d3-quadtree` — only nodes intersecting the viewport get DOM elements. Also use the quadtree for hit-testing; never loop all nodes on mousemove.
- **Semantic zoom / LOD.** Far: trunk, main limbs, canopy silhouette, no text. Mid: branches and leaf shapes, names only on trunk ancestors and founders. Near: full leaves with names.
- Animate **only** `transform` and `opacity`, never `x`/`y`/`d`/`width` across many elements.
- Throttle transform writes to `requestAnimationFrame`.

**Then stress-test it, and do not skip this.** Generate 2,000 dummy nodes in the same schema, load them, and measure the real frame rate during pan and zoom using the browser's performance tooling. Report the actual number with a screenshot of the profile — not an estimate, not an assurance. Something that renders beautifully at 181 nodes and dies at 2,000 is a failed demo, because 2,000 is what the client is buying. If you cannot hold 60fps, stop and tell me rather than working around it silently.

## Data

Use the **attached `tree.json`** — 181 people across 5 generations. Do not invent your own dataset; this one is deliberately shaped to break naive implementations.

What's in it and why it matters:

- **5 generations**, distributed 1 / 5 / 15 / 53 / 107 — a narrow base widening into a dense canopy, like the reference poster.
- **A trunk lineage** (`isTrunkLineage: true`) running root-to-tip, one person per generation. These render as the stacked gold ovals up the trunk.
- **8 sub-family founders** (`isFounder`, with `founderLabel` such as `جد آل بريكة`) at branch junctions, rendering as gold circles.
- **Heavy name collisions on purpose**: 23 people named حسن, 19 named بلقاسم, 17 each named عبد العزيز and حسين. Any search result list showing bare names is useless — results must show the full lineage chain (فلان بن فلان بن فلان).
- **Deliberate spelling variants** of the same name — عبد الله also appears as عبدله and عبد اللّه, حسين as حسن, عبد الرحمن as عبدالرحمن. **Searching عبدالله must find عبد الله and عبدله.** If it doesn't, normalization is broken.
- **Sparse dates.** Older generations mostly have Hijri years; younger ones are largely `null`. Nothing may break or render an empty parenthesis when dates are missing.
- **Uneven branching**, including nodes with zero children mid-canopy — the layout must not assume a balanced tree.
- **117 leaves**, each needing a name-bearing leaf shape.

Schema (excerpt):

```json
{
 "_note": "SAMPLE DATA — بيانات تجريبية للعرض فقط، ليست أنساباً حقيقية",
 "rootId": "p001",
 "persons": [
  {
   "id": "p001",
   "name": "علي",
   "fatherId": null,
   "birthYearHijri": 1239,
   "deathYearHijri": null,
   "note": null,
   "isTrunkLineage": true,
   "isFounder": false,
   "founderLabel": null,
   "isDistinguished": true
  },
  {
   "id": "p002",
   "name": "حسن",
   "fatherId": "p001",
   "birthYearHijri": 1269,
   "deathYearHijri": 1337,
   "note": "يُعرف بـ(أبو خيالة)",
   "isTrunkLineage": false,
   "isFounder": true,
   "founderLabel": "جد آل بريكة",
   "isDistinguished": true
  },
  {
   "id": "p003",
   "name": "عبد الله",
   "fatherId": "p001",
   "birthYearHijri": 1272,
   "deathYearHijri": 1345,
   "note": null,
   "isTrunkLineage": false,
   "isFounder": false,
   "founderLabel": null,
   "isDistinguished": false
  },
  {
   "id": "p011",
   "name": "حسين",
   "fatherId": "p003",
   "birthYearHijri": 1314,
   "deathYearHijri": 1390,
   "note": null,
   "isTrunkLineage": false,
   "isFounder": false,
   "founderLabel": null,
   "isDistinguished": false
  },
  {
   "id": "p012",
   "name": "خالد",
   "fatherId": "p004",
   "birthYearHijri": 1306,
   "deathYearHijri": 1376,
   "note": "يُعرف بـ(أبو ملح)",
   "isTrunkLineage": false,
   "isFounder": true,
   "founderLabel": "جد آل زاهر",
   "isDistinguished": true
  }
 ]
}
```

Field notes:
- `fatherId` is `null` only for the root (`rootId`).
- `note` is `null` most of the time; when present it holds a laqab like `يُعرف بـ(الشاعر)` for display under the name.
- `isDistinguished: true` → gold leaf instead of green. Founders are always distinguished.
- Years are Hijri.

Keep the loader generic — real client data will be dropped in by swapping this file, at roughly 10x the size. **Also generate a synthetic 2,000-node file in the same schema for the stress test above.** Do not display the synthetic one; it exists only to measure frame rate.

## Must work on a phone

The client will open this on their phone. Full mobile browse mode is out of scope, but pinch-zoom, tap-to-select, and search must work, and nothing may be broken or clipped. Test at 390px wide.

## Deliverable

A single runnable page I can deploy to a static host and send as a link. Arabic UI, RTL-correct, real Arabic font (Noto Kufi Arabic or IBM Plex Sans Arabic) — not a Latin font with Arabic fallback.

Start with Step 0.
