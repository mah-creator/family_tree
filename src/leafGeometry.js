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

export const PETIOLE_ANGLE_MIN = (50 * Math.PI) / 180;
export const PETIOLE_ANGLE_MAX = (65 * Math.PI) / 180;
export const PETIOLE_LEN_FRAC = 0.08; // of leaf length

/**
 * Minimum along-twig spacing between adjacent cluster members. Derived from
 * how much of the twig axis an angled leaf actually occupies: standing off at
 * a petiole angle, a leaf projects LEAF_WIDTH * cos(angle) along the axis
 * instead of its full length, so the flat 58px (leaf-height-derived, from when
 * leaves lay parallel along the twig) is over-strict. Shorter twigs partly
 * offset the clearance increase that the same change forces on R_min.
 */
export const TWIG_MIN_SPACING_PX = Math.round(
  LEAF_WIDTH * Math.cos(PETIOLE_ANGLE_MIN) * 0.9
);

/** Scales the font ramp in leafRenderer so text keeps pace with the leaf. */
export const LEAF_FONT_SCALE = LEAF_SCALE;

// ---- Petiole attachment ----------------------------------------------------
// Cluster leaves leave the twig at an angle on a short stem, rather than lying
// parallel along it. Angles in radians; the tip leaf uses none.

/**
 * Clearance per angular slot in R_min: how wide a twig is across its own axis
 * now that its leaves stand off at a petiole angle rather than lying along it.
 *
 * Measured from built layouts, the actual per-twig perpendicular extent runs
 * median 41-88, p90 ~140, max ~160. Sizing every slot for the maximum (or the
 * 145 the worst-case algebra gives) is far too conservative: it doubles the
 * canopy radius, halves canopy fill (15.3% -> 11.4% at 1,128 leaves) and
 * pushes the aspect ratio from 1.18 to 1.43, because R_min scales the entire
 * canopy off this one number. Measured trade at 1,128 leaves:
 *   clearance  75 -> fill 15.3, aspect 1.18, leaf collisions 1713
 *             100 -> fill 14.2, aspect 1.19, leaf collisions 1136
 *             145 -> fill 11.4, aspect 1.43, leaf collisions  778
 *             175 -> fill 10.0, aspect 1.57, leaf collisions  624
 * 100 sits at roughly the p75 extent and takes a third off leaf collisions
 * for about one point of fill. Outliers past it are relaxation's job, not
 * something to size the whole canopy around.
 */
export const TWIG_CROSS_EXTENT = 100;
