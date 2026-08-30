import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:/Users/mahmoud/.gemini/antigravity/brain/ad9955dd-ed98-4cd5-9d7e-1d2a3fc2b2d0';

async function run() {
  console.log('Launching browser to capture zero-overlap family tree screenshot...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2200);

  const pathNoOverlap = path.join(artifactDir, 'zero_overlap_family_tree.png');
  await page.screenshot({ path: pathNoOverlap });
  console.log('Saved:', pathNoOverlap);

  await browser.close();
  console.log('SCREENSHOT CAPTURED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
