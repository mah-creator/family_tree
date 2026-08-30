import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:/Users/mahmoud/.gemini/antigravity/brain/ad9955dd-ed98-4cd5-9d7e-1d2a3fc2b2d0';

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    channel: 'msedge', // use installed Windows Edge
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/');

  // Wait for initial growth animation
  await page.waitForTimeout(2200);

  // 1. Default Zoom Screenshot
  const pathDefault = path.join(artifactDir, 'default_zoom.png');
  await page.screenshot({ path: pathDefault });
  console.log('Saved:', pathDefault);

  // 2. Leaf Renderer & Lineage Tracing Screenshot (Search "عبدالله")
  console.log('Performing search for عبدالله ...');
  await page.fill('#search-input', 'عبدالله');
  await page.waitForTimeout(500);

  const firstResult = page.locator('.search-result-item').first();
  if (await firstResult.isVisible()) {
    await firstResult.click();
    console.log('Clicked search result, flying to leaf...');
    await page.waitForTimeout(1400); // wait for camera flight & lineage tracer animation
  }

  const path5x = path.join(artifactDir, 'leaf_5x_lineage.png');
  await page.screenshot({ path: path5x });
  console.log('Saved:', path5x);

  // 3. Mobile Viewport 390px Screenshot
  console.log('Setting viewport to 390x840 mobile width...');
  await page.setViewportSize({ width: 390, height: 840 });
  await page.waitForTimeout(600);

  const pathMobile = path.join(artifactDir, 'mobile_390px.png');
  await page.screenshot({ path: pathMobile });
  console.log('Saved:', pathMobile);

  // 4. 2,000 Node Stress Test & Profiler Screenshot
  console.log('Setting viewport back to 1280x900 and triggering 2,000 node benchmark...');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('#btn-benchmark');
  await page.waitForTimeout(1800);

  // Open profiler card
  await page.click('#btn-profiler');
  await page.waitForTimeout(500);

  // Perform continuous pan/zoom to exercise 2,000 node quadtree culling & measure worst frame duration
  const svg = page.locator('#tree-svg');
  const box = await svg.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 150, { steps: 20 });
    await page.mouse.up();
  }

  await page.waitForTimeout(600);
  const pathStress = path.join(artifactDir, 'stress_test_2000_profiler.png');
  await page.screenshot({ path: pathStress });
  console.log('Saved:', pathStress);

  await browser.close();
  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Screenshot generation error:', err);
  process.exit(1);
});
