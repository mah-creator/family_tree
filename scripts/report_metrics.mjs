/**
 * Headless layout metrics report — runs buildBotanicalLayout + computeLayoutMetrics
 * in Node with the exact options renderTree uses, printing the deterministic
 * expected numbers for any given code state. No browser involved.
 *
 * Usage: node scripts/report_metrics.mjs [dataset.json]
 *   defaults to tree.json; pass e.g. tree_1000.json for the scale diagnostic.
 */
import { readFileSync } from 'fs';
import { buildBotanicalLayout } from '../src/treeLayout.js';
import { computeLayoutMetrics } from '../src/layoutMetrics.js';

const dataset = process.argv[2] || 'tree.json';
const treeData = JSON.parse(
  readFileSync(new URL(`../${dataset}`, import.meta.url), 'utf8')
);

// MUST mirror renderTree() options in src/main.js
const layout = buildBotanicalLayout(treeData, {
  width: 4600,
  height: 3600,
  trunkBaseY: 3250,
  trunkCenterX: 2300,
  rootTrunkLength: 460,
  trunkChainStep: 480,
  rootBaseWidth: 56
});

const metrics = computeLayoutMetrics(layout);
console.log(JSON.stringify(metrics, null, 2));
