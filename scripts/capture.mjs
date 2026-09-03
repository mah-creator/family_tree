/**
 * Headless screenshot capture — the portable substitute for an interactive
 * browser pane.
 *
 * The Claude Code DESKTOP app has an in-app Browser pane (preview_start /
 * computer screenshot) that an agent can drive directly. The terminal CLI does
 * not, and the desktop app is Mac/Windows only — so on Linux there is no pane.
 * This script closes that gap: it writes PNGs to disk, and an agent can then
 * look at them with its Read tool, which renders images. Visual verification
 * therefore survives the move; it just becomes two steps instead of one.
 *
 * Usage:
 *   npm run dev                       # in another terminal, or use --serve
 *   node scripts/capture.mjs                        # default shot set
 *   node scripts/capture.mjs --out shots            # choose output dir
 *   node scripts/capture.mjs --shot fit             # one named shot
 *   node scripts/capture.mjs --view 2400,1800,0.6   # arbitrary cx,cy,k
 *
 * Each shot is a { name, view } where view is either 'fit' (frame the whole
 * canopy) or [cx, cy, k] in world coordinates. window.__setView is a dev hook
 * exposed by src/main.js; called with no arguments it fits the canopy and
 * returns the values it chose.
 */
import { mkdirSync, existsSync } from 'fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const argVal = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const URL_BASE = argVal('--url', 'http://localhost:5173');
const OUT = argVal('--out', 'shots');
const ONLY = argVal('--shot', null);
const CUSTOM = argVal('--view', null);
const VIEWPORT = { width: 1400, height: 1000 };

// The standing shot set. Keep these stable so successive runs are comparable;
// add to it rather than editing, or you lose the before/after.
const SHOTS = [
  { name: 'fit', view: 'fit', note: 'whole tree — silhouette, limb spread, trunk proportion' },
  { name: 'trunk', view: 'trunk', note: 'trunk column — oval stack, bare fraction, attachment heights' },
  { name: 'cluster', view: 'cluster', note: '3x crop of one twig — petiole attachment, leaf angles' },
  { name: 'crown', view: 'crown', note: 'upper canopy — partings between limbs, crown closure' }
];

if (CUSTOM) {
  const [cx, cy, k] = CUSTOM.split(',').map(Number);
  SHOTS.length = 0;
  SHOTS.push({ name: 'custom', view: [cx, cy, k], note: `cx=${cx} cy=${cy} k=${k}` });
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });

page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

// 'load', not 'networkidle': the Vite dev server holds an HMR websocket open,
// so the network never goes idle and networkidle times out every time.
await page.goto(URL_BASE, { waitUntil: 'load' });
// Growth animation is ~1.8s and skips on interaction; wait it out so shots are
// of the settled tree rather than a half-drawn one.
await page.waitForFunction(() => typeof window.__setView === 'function', { timeout: 15000 });
await page.waitForTimeout(2500);

const metrics = await page.evaluate(() => window.__treeMetrics);
console.log(`dataset: ${metrics.totalLeaves} leaves, ${metrics.twigCount} twigs, ` +
  `${metrics.bandCount} bands, radius ${metrics.radiusUsed}`);

for (const shot of SHOTS) {
  if (ONLY && shot.name !== ONLY) continue;

  const applied = await page.evaluate(async (view) => {
    const fit = window.__setView();
    if (view === 'fit') {
      // Back off slightly so the canopy is not flush against the frame.
      return window.__setView(fit.cx, fit.cy, fit.k * 0.9);
    }
    if (view === 'trunk') {
      const o = window.__layout.layoutOpts;
      return window.__setView(o.trunkCenterX, o.trunkBaseY - o.height * 0.22, fit.k * 2.2);
    }
    if (view === 'crown') {
      const m = window.__treeMetrics.leafBBox;
      return window.__setView((m.minX + m.maxX) / 2, m.minY + (m.maxY - m.minY) * 0.25, fit.k * 1.6);
    }
    if (view === 'cluster') {
      // Pick a multi-member twig and frame it tightly.
      const twigs = window.__layout.orderedTwigs.filter(t => t.members.length >= 3);
      const t = twigs[Math.floor(twigs.length / 2)] || window.__layout.orderedTwigs[0];
      const r = t.representative;
      return window.__setView((r.p0.x + r.x3) / 2, (r.p0.y + r.y3) / 2, fit.k * 6);
    }
    return window.__setView(view[0], view[1], view[2]);
  }, shot.view);

  await page.waitForTimeout(400);
  const file = `${OUT}/${shot.name}.png`;
  await page.screenshot({ path: file });
  console.log(`${file}  k=${applied.k}  cx=${Math.round(applied.cx)} cy=${Math.round(applied.cy)}  — ${shot.note}`);
}

await browser.close();
