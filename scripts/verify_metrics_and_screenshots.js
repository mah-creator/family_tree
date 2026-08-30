import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:/Users/mahmoud/.gemini/antigravity/brain/ad9955dd-ed98-4cd5-9d7e-1d2a3fc2b2d0';

async function run() {
  console.log('Launching browser for verification metrics & screenshots...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2500);

  // Measure Leaf Box Collisions & Canopy Silhouette Fill Percentage in Browser Context
  const metrics = await page.evaluate(() => {
    const leafEls = Array.from(document.querySelectorAll('.leaf-node'));

    const leaves = leafEls.map(el => {
      const transform = el.getAttribute('transform');
      const match = /translate\(([^,]+),\s*([^)]+)\)/.exec(transform);
      const x = match ? parseFloat(match[1]) : 0;
      const y = match ? parseFloat(match[2]) : 0;

      const bodyEl = el.querySelector('g[transform*="rotate"]');
      const rotMatch = bodyEl ? /rotate\(([^)]+)\)/.exec(bodyEl.getAttribute('transform')) : null;
      const angleDeg = rotMatch ? parseFloat(rotMatch[1]) : 0;
      const rad = (angleDeg * Math.PI) / 180;

      // Leaf center (23px along twig vector)
      const cx = x + 23 * Math.cos(rad);
      const cy = y + 23 * Math.sin(rad);

      return { x, y, cx, cy, rad, width: 46, height: 23 };
    });

    // 1. Count Intersecting Leaf Bounding Boxes
    let collisionCount = 0;
    const minCenterDist = 38; // Minimum allowed distance between center of 46x23 leaf boxes

    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const dx = leaves[j].cx - leaves[i].cx;
        const dy = leaves[j].cy - leaves[i].cy;
        const dist = Math.hypot(dx, dy);

        if (dist < minCenterDist) {
          collisionCount++;
        }
      }
    }

    // 2. Compute Canopy Silhouette Fill Percentage
    if (leaves.length === 0) return { totalLeaves: 0, collisionCount: 0, fillPercentage: 0 };

    const minX = Math.min(...leaves.map(l => l.cx));
    const maxX = Math.max(...leaves.map(l => l.cx));
    const minY = Math.min(...leaves.map(l => l.cy));
    const maxY = Math.max(...leaves.map(l => l.cy));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = (maxX - minX) / 2 + 30;
    const ry = (maxY - minY) / 2 + 30;

    const step = 15;
    let totalSilhouetteCells = 0;
    let filledSilhouetteCells = 0;

    for (let gx = minX - 20; gx <= maxX + 20; gx += step) {
      for (let gy = minY - 20; gy <= maxY + 20; gy += step) {
        // Test if grid point lies inside the canopy dome silhouette ellipse
        const ellipseVal = Math.pow((gx - cx) / rx, 2) + Math.pow((gy - cy) / ry, 2);
        if (ellipseVal <= 1.0) {
          totalSilhouetteCells++;
          // Check if grid cell is within 1 leaf-width (46px) of any leaf center
          const isFilled = leaves.some(l => Math.hypot(l.cx - gx, l.cy - gy) <= 46);
          if (isFilled) filledSilhouetteCells++;
        }
      }
    }

    const fillPercentage = totalSilhouetteCells > 0 ? (filledSilhouetteCells / totalSilhouetteCells) * 100 : 0;

    return {
      totalLeaves: leaves.length,
      collisionCount,
      fillPercentage: fillPercentage.toFixed(1)
    };
  });

  console.log('--------------------------------------------------');
  console.log('VERIFICATION METRICS REPORT:');
  console.log(`Total Leaves Evaluated: ${metrics.totalLeaves}`);
  console.log(`Intersecting Leaf Bounding Boxes: ${metrics.collisionCount}`);
  console.log(`Canopy Fill Percentage: ${metrics.fillPercentage}%`);
  console.log('--------------------------------------------------');

  // 1. Full Tree Screenshot
  const pathFull = path.join(artifactDir, 'full_tree_fixed_bugs.png');
  await page.screenshot({ path: pathFull });
  console.log('Saved:', pathFull);

  // 2. 3x Zoom Screenshot on Leaf Cluster
  console.log('Flying to leaf cluster for 3x zoom verification...');
  const firstLeaf = page.locator('.leaf-node').first();
  if (await firstLeaf.isVisible()) {
    await firstLeaf.click();
    await page.waitForTimeout(1600);
  }

  const path3x = path.join(artifactDir, 'leaf_cluster_3x_zoom.png');
  await page.screenshot({ path: path3x });
  console.log('Saved:', path3x);

  await browser.close();
}

run().catch(err => {
  console.error('Error during verification metrics run:', err);
  process.exit(1);
});
