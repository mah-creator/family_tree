import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:/Users/mahmoud/.gemini/antigravity/brain/ad9955dd-ed98-4cd5-9d7e-1d2a3fc2b2d0';

async function run() {
  console.log('Launching browser for single limb verification...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2000);

  // 1. Single Limb Verification Screenshot
  const pathSingleLimb = path.join(artifactDir, 'single_limb_verification.png');
  await page.screenshot({ path: pathSingleLimb });
  console.log('Saved:', pathSingleLimb);

  // 2. Click button to render Full 181 Tree
  console.log('Toggling to full 181 tree view...');
  await page.click('#btn-single-limb');
  await page.waitForTimeout(2000);

  const pathFullTree = path.join(artifactDir, 'full_tree_new_geometry.png');
  await page.screenshot({ path: pathFullTree });
  console.log('Saved:', pathFullTree);

  await browser.close();
  console.log('VERIFICATION SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
