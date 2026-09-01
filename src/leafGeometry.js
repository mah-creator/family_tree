/**
 * Leaf geometry — single source of truth.
 *
 * Leaf size is not a rendering detail: the layout's angular-slot clearance
 * (R_min), its along-twig spacing floor, and the collision metric's
 * separation threshold are all expressed in leaf-widths. Those lived as
 * independent magic numbers in treeLayout.js, layoutMetrics.js and
 * leafRenderer.js, so scaling leaves meant changing four files in step or
 * silently invalidating the spacing guarantees. Everything derives from
 * LEAF_SCALE here instead.
 *
 * LEAF_SCALE 1.45: the poster reads as solid foliage, ours as bare branches
 * with leaves at the tips. We have 117 leaves where the poster has several
 * hundred, which this dataset can't change — so coverage has to come from
 * leaf area rather than leaf count. 1.45x is ~2.1x the area per leaf.
 */

export const LEAF_SCALE = 1.45;

// Base dimensions at scale 1.0 (the values used through fixes 1–4).
const BASE_LEAF_WIDTH = 46;
const BASE_LEAF_HEIGHT = 23;
const BASE_MIN_CENTER_DIST = 38;
const BASE_TWIG_CLEARANCE = 52;
const BASE_TWIG_MIN_SPACING = 40;

export const LEAF_WIDTH = Math.round(BASE_LEAF_WIDTH * LEAF_SCALE);
export const LEAF_HEIGHT = Math.round(BASE_LEAF_HEIGHT * LEAF_SCALE);

/** Leaf centre offset from its anchor, along the twig's exit tangent. */
export const LEAF_CENTER_OFFSET = LEAF_WIDTH / 2;

/** Minimum distance between two leaf centres before they count as colliding. */
export const LEAF_MIN_CENTER_DIST = Math.round(BASE_MIN_CENTER_DIST * LEAF_SCALE);

/**
 * Per-twig angular clearance feeding R_min. A twig is wider than one leaf:
 * its clustered members alternate sides, so this is leaf height plus roughly
 * twice the perpendicular nudge.
 */
export const TWIG_ANGULAR_CLEARANCE = Math.round(BASE_TWIG_CLEARANCE * LEAF_SCALE);

/** Minimum along-twig spacing between adjacent cluster members. */
export const TWIG_MIN_SPACING_PX = Math.round(BASE_TWIG_MIN_SPACING * LEAF_SCALE);

/** Scales the font ramp in leafRenderer so text keeps pace with the leaf. */
export const LEAF_FONT_SCALE = LEAF_SCALE;
