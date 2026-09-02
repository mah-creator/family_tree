import * as d3 from 'd3';
import rawTreeData from '../tree.json';
import { buildBotanicalLayout } from './treeLayout.js';
import { createTaperedBranchPolygonPath } from './branchGenerator.js';
import { createLeafNode } from './leafRenderer.js';
import { QuadtreeCuller } from './quadtreeCuller.js';
import { initCamera, flyToNode } from './camera.js';
import { LineageTracer } from './lineageTracer.js';
import { normalizeArabic, buildLineageChain } from './arabicNormalizer.js';
import { initGrowthAnimation } from './growthAnimation.js';
import { generateSyntheticTree } from './syntheticData.js';
import { computeLayoutMetrics } from './layoutMetrics.js';
import { LEAF_WIDTH } from './leafGeometry.js';

// Provisional world size, used only for the first of two layout passes. The
// real canvas is derived from the measured layout bounds (see layoutToFit) —
// hardcoding it broke twice for the same reason: once when the leaf scale
// changed, and again at 1,000 nodes, where R_min grows with leaf count and
// the canopy came out 11,116 x 7,329 against a fixed 4,600 x 3,600 world.
const PROVISIONAL_W = 4600;
const PROVISIONAL_H = 3600;
const CANVAS_MARGIN = 260;

/**
 * Runs the layout twice: once to discover how big the tree actually wants to
 * be, then again on a world sized to fit it with a uniform margin. The layout
 * is deterministic and seeded, so the second pass reproduces the first exactly
 * apart from the translation.
 */
function layoutToFit(treeData, opts) {
  const probe = buildBotanicalLayout(treeData, {
    ...opts,
    width: PROVISIONAL_W,
    height: PROVISIONAL_H,
    trunkBaseY: PROVISIONAL_H - 350,
    trunkCenterX: PROVISIONAL_W / 2
  });

  // Bounds over everything drawn: branch spines (with their control points,
  // which can bow outside the endpoints) and leaf bodies.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const grow = (x, y, pad) => {
    if (!isFinite(x) || !isFinite(y)) return;
    minX = Math.min(minX, x - pad); maxX = Math.max(maxX, x + pad);
    minY = Math.min(minY, y - pad); maxY = Math.max(maxY, y + pad);
  };
  probe.root.descendants().forEach(n => {
    [n.p0, n.p1, n.p2, n.p3].forEach(p => p && grow(p.x, p.y, 0));
    grow(n.x3, n.y3, LEAF_WIDTH);
  });
  // The trunk base and grass line must stay in frame even if no leaf reaches
  // them, since the root oval sits there.
  grow(probe.layoutOpts.trunkCenterX, probe.layoutOpts.trunkBaseY, 80);

  const treeW = maxX - minX;
  const treeH = maxY - minY;
  const width = Math.ceil(treeW + CANVAS_MARGIN * 2);
  const height = Math.ceil(treeH + CANVAS_MARGIN * 2);
  // Place the trunk so the measured bounds land inside the new world.
  const trunkCenterX = CANVAS_MARGIN + (probe.layoutOpts.trunkCenterX - minX);
  const trunkBaseY = CANVAS_MARGIN + (probe.layoutOpts.trunkBaseY - minY);

  return buildBotanicalLayout(treeData, {
    ...opts, width, height, trunkBaseY, trunkCenterX
  });
}

let activeTreeData = rawTreeData;
let layoutResult = null;
let quadtreeCuller = null;
let cameraObj = null;
let lineageTracer = null;
let isSingleLimbMode = false;

// Performance Profiling Variables
let maxFrameTimeMs = 0;
let lastFrameTimestamp = performance.now();

function measureFrameRate() {
  const now = performance.now();
  const delta = now - lastFrameTimestamp;
  lastFrameTimestamp = now;

  if (delta > maxFrameTimeMs && delta < 500) {
    maxFrameTimeMs = delta;
  }
  requestAnimationFrame(measureFrameRate);
}
requestAnimationFrame(measureFrameRate);

/**
 * Main Application Renderer
 */
function renderTree(treeData) {
  const svg = document.getElementById('tree-svg');
  const zoomContainer = document.getElementById('tree-zoom-container');
  const branchesLayer = document.getElementById('branches-layer');
  const nodesLayer = document.getElementById('nodes-layer');

  branchesLayer.innerHTML = '';
  nodesLayer.innerHTML = '';

  // 1. Botanical Layout
  // Canvas grew with the 1.45x leaf scale: the larger leaves push R_min to
  // 539 and the canopy radius to ~908, which overflowed the old 3600x2800
  // world and left the tree jammed against the frame.
  layoutResult = layoutToFit(treeData, {
    rootTrunkLength: 460,
    trunkChainStep: 480,
    rootBaseWidth: 56,
    singleLimbMode: isSingleLimbMode
  });

  const { root, personMap, rootId } = layoutResult;
  const descendants = root.descendants();

  // 2. Render Branches (Tapered filled polygons)
  descendants.forEach(node => {
    const pathStr = createTaperedBranchPolygonPath(node, 12);

    if (pathStr) {
      const branchPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      branchPath.setAttribute('d', pathStr);
      branchPath.setAttribute('class', 'branch-path');
      branchPath.setAttribute('fill', 'url(#woodLimbGradient)');
      branchPath.setAttribute('stroke', '#2D1A0E');
      branchPath.setAttribute('stroke-width', '0.4');
      branchPath.setAttribute('data-id', node.data.id);
      branchPath.setAttribute('data-depth', node.depth);
      branchesLayer.appendChild(branchPath);
    }
  });

  // 3. Render Nodes (Trunk Ovals, Founder Medallions, Terminal Leaves ONLY)
  descendants.forEach(node => {
    const isRoot = node.data.id === rootId;
    const isTrunk = !!node.data.isTrunkLineage;
    const isFounder = !!node.data.isFounder;
    const isTerminalLeaf = !node.children || node.children.length === 0;
    let nodeEl = null;

    const tipX = node.x3;
    const tipY = node.y3;

    if (isTrunk || isRoot) {
      // Stacked Trunk Lineage Oval Node
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'trunk-node');
      g.setAttribute('transform', `translate(${tipX}, ${tipY})`);
      g.setAttribute('data-id', node.data.id);
      g.setAttribute('data-depth', node.depth);

      const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      ellipse.setAttribute('rx', '72');
      ellipse.setAttribute('ry', '36');
      ellipse.setAttribute('class', 'trunk-oval');

      const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textName.setAttribute('class', 'trunk-text trunk-text-name');
      textName.setAttribute('text-anchor', 'middle');
      textName.setAttribute('y', node.data.note ? '-5' : '4');
      textName.textContent = node.data.name;

      g.appendChild(ellipse);
      g.appendChild(textName);

      if (node.data.note) {
        const textBio = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textBio.setAttribute('class', 'trunk-text trunk-text-bio');
        textBio.setAttribute('text-anchor', 'middle');
        textBio.setAttribute('y', '15');
        textBio.textContent = node.data.note;
        g.appendChild(textBio);
      }

      nodeEl = g;
    } else if (isFounder) {
      // Sub-family Founder Medallion Circle Node
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'founder-node');
      g.setAttribute('transform', `translate(${tipX}, ${tipY})`);
      g.setAttribute('data-id', node.data.id);
      g.setAttribute('data-depth', node.depth);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '32');
      circle.setAttribute('class', 'founder-circle');

      const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textName.setAttribute('class', 'founder-text');
      textName.setAttribute('text-anchor', 'middle');
      textName.setAttribute('y', node.data.founderLabel ? '-4' : '4');
      textName.textContent = node.data.name;

      g.appendChild(circle);
      g.appendChild(textName);

      if (node.data.founderLabel) {
        const textLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textLabel.setAttribute('class', 'founder-text');
        textLabel.setAttribute('text-anchor', 'middle');
        textLabel.setAttribute('y', '13');
        textLabel.setAttribute('font-size', '9px');
        textLabel.textContent = node.data.founderLabel;
        g.appendChild(textLabel);
      }

      nodeEl = g;
    } else if (isTerminalLeaf) {
      // Terminal Leaf Node ONLY (Attached at twig tip, rotated along exit tangent)
      const angleDeg = ((node.exitTangent || 0) * 180) / Math.PI;
      nodeEl = createLeafNode(node, tipX, tipY, angleDeg, true);
      nodeEl.setAttribute('data-depth', node.depth);

      // Petiole: the short stem from the twig spine to the leaf base. Only
      // cluster members that stand off at an angle have one; the tip leaf
      // continues the twig directly.
      if (node.petioleFrom) {
        const stem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        stem.setAttribute('x1', node.petioleFrom.x);
        stem.setAttribute('y1', node.petioleFrom.y);
        stem.setAttribute('x2', tipX);
        stem.setAttribute('y2', tipY);
        stem.setAttribute('stroke', '#4A2E19');
        stem.setAttribute('stroke-width', Math.max(1, (node.parent && node.parent.tipWidth) || 1.5));
        stem.setAttribute('stroke-linecap', 'round');
        stem.setAttribute('class', 'petiole');
        branchesLayer.appendChild(stem);
      }
    }

    if (nodeEl) {
      nodeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        lineageTracer.traceLineage(node);
        flyToNode(cameraObj.zoom, cameraObj.svg, tipX, tipY, 3.5);
      });

      nodesLayer.appendChild(nodeEl);
    }
  });

  // 4. Quadtree Viewport Culling & LOD Manager
  quadtreeCuller = new QuadtreeCuller(descendants, zoomContainer);
  descendants.forEach(node => {
    const el = nodesLayer.querySelector(`[data-id="${node.data.id}"]`);
    if (el) quadtreeCuller.registerDomElement(node.data.id, el);
  });

  // 5. Camera Setup
  cameraObj = initCamera(svg, zoomContainer, {
    width: layoutResult.layoutOpts.width,
    height: layoutResult.layoutOpts.height,
    onZoom: (transform) => {
      const status = quadtreeCuller.updateViewport(transform, window.innerWidth, window.innerHeight);
      updateProfilerUI(status, descendants.length);
    }
  });

  // 6. Lineage Tracer
  lineageTracer = new LineageTracer(personMap, rootId, zoomContainer);

  svg.addEventListener('click', () => {
    lineageTracer.clearTrace();
  });

  // 7. Growth Animation on Load
  initGrowthAnimation(zoomContainer, { durationMs: 1800 });

  const initialStatus = quadtreeCuller.updateViewport(cameraObj.initialTransform, window.innerWidth, window.innerHeight);
  updateProfilerUI(initialStatus, descendants.length);

  // 8. Layout Self-Metrics (headless-reproducible; read via window.__treeMetrics or console)
  const metrics = computeLayoutMetrics(layoutResult);
  window.__treeMetrics = metrics;
  window.__layout = layoutResult;
  window.__culler = quadtreeCuller;
  console.log('[TREE METRICS]', JSON.stringify(metrics, null, 2));

  // Dev hook: position camera at world point (cx, cy) at scale k (verification tooling)
  // Measures the SVG's own rect rather than window.innerWidth: in an embedded
  // preview pane the two disagree, which silently mis-centres the view.
  // Omit k to fit the whole tree.
  window.__setView = (cx, cy, k) => {
    const r = svg.getBoundingClientRect();
    const b = layoutResult.leafBBox || null;
    if (k === undefined) {
      const m = computeLayoutMetrics(layoutResult).leafBBox;
      cx = (m.minX + m.maxX) / 2;
      cy = (m.minY + m.maxY) / 2;
      k = Math.min(r.width / (m.maxX - m.minX), r.height / (m.maxY - m.minY)) * 0.92;
    }
    const t = d3.zoomIdentity
      .translate(r.width / 2 - cx * k, r.height / 2 - cy * k)
      .scale(k);
    cameraObj.svg.call(cameraObj.zoom.transform, t);
    return { cx, cy, k: +k.toFixed(3), viewport: [Math.round(r.width), Math.round(r.height)] };
  };

  // 9. Debug Overlay (attachment points, canopy bands, sector rays, grass line)
  renderDebugOverlay(layoutResult);
}

/**
 * Debug Overlay — makes layout distribution problems visible at a glance.
 * Toggled by #btn-debug; drawn in world coordinates inside the zoom container.
 */
function renderDebugOverlay(layout) {
  const layer = document.getElementById('debug-layer');
  layer.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  const { trunkBaseY, trunkCenterX } = layout.layoutOpts;
  const mk = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };

  // Grass line
  layer.appendChild(mk('line', {
    x1: trunkCenterX - 1500, y1: trunkBaseY, x2: trunkCenterX + 1500, y2: trunkBaseY,
    stroke: '#2D6A4F', 'stroke-width': 3, 'stroke-dasharray': '14 8'
  }));

  // Sector boundary rays
  [layout.sector.rightmostAngle, layout.sector.leftmostAngle].forEach(a => {
    layer.appendChild(mk('line', {
      x1: trunkCenterX, y1: trunkBaseY,
      x2: trunkCenterX + Math.cos(a) * 1600, y2: trunkBaseY + Math.sin(a) * 1600,
      stroke: '#E67E22', 'stroke-width': 2, 'stroke-dasharray': '6 6'
    }));
  });

  // Canopy band ellipses (reference frame: trunk base)
  layout.radialBands.forEach(mult => {
    layer.appendChild(mk('ellipse', {
      cx: trunkCenterX, cy: trunkBaseY,
      rx: layout.baseCanopyRadius * mult * 1.05,
      ry: layout.baseCanopyRadius * mult * 0.85,
      fill: 'none', stroke: '#8E44AD', 'stroke-width': 1.5, 'stroke-dasharray': '4 8', opacity: 0.6
    }));
  });

  // Depth-1 limb attachment points
  (layout.attachments || []).forEach(att => {
    layer.appendChild(mk('circle', {
      cx: att.x, cy: att.y, r: 12,
      fill: '#E91E63', stroke: '#FFFFFF', 'stroke-width': 2.5
    }));
    const label = mk('text', {
      x: att.x + 20, y: att.y + 4, 'font-size': '20px', fill: '#E91E63',
      'font-weight': '700', 'text-anchor': 'start'
    });
    label.textContent = `${att.id} @${Math.round(att.frac * 100)}%`;
    layer.appendChild(label);
  });

  // Trunk-lineage node positions (limb origins for deeper side-subtrees)
  layout.root.descendants()
    .filter(n => n.data.isTrunkLineage && n.depth > 0)
    .forEach(n => {
      layer.appendChild(mk('rect', {
        x: n.x3 - 8, y: n.y3 - 8, width: 16, height: 16,
        fill: 'none', stroke: '#E91E63', 'stroke-width': 2.5
      }));
    });
}

/**
 * Setup Arabic Search Box UI
 */
function setupSearchUI() {
  const input = document.getElementById('search-input');
  const resultsDropdown = document.getElementById('search-results');

  input.addEventListener('input', (e) => {
    const query = normalizeArabic(e.target.value);
    if (!query || query.length < 1) {
      resultsDropdown.classList.remove('active');
      resultsDropdown.innerHTML = '';
      return;
    }

    const { personMap } = layoutResult;
    const matches = [];

    activeTreeData.persons.forEach(person => {
      const normalizedName = normalizeArabic(person.name);
      if (normalizedName.includes(query)) {
        const lineageStr = buildLineageChain(person, personMap);
        matches.push({ person, lineageStr });
      }
    });

    if (matches.length === 0) {
      resultsDropdown.innerHTML = '<div class="search-result-item">لم يتم العثور على نتائج</div>';
      resultsDropdown.classList.add('active');
      return;
    }

    resultsDropdown.innerHTML = matches.slice(0, 15).map(m => `
      <div class="search-result-item" data-id="${m.person.id}">
        <div class="search-result-name">${m.person.name} ${m.person.note ? `<small>(${m.person.note})</small>` : ''}</div>
        <div class="search-result-lineage">${m.lineageStr}</div>
      </div>
    `).join('');

    resultsDropdown.classList.add('active');

    resultsDropdown.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        const node = layoutResult.root.descendants().find(d => d.data.id === id);
        if (node) {
          lineageTracer.traceLineage(node);
          flyToNode(cameraObj.zoom, cameraObj.svg, node.x3, node.y3, 3.6);
        }
        resultsDropdown.classList.remove('active');
        input.value = '';
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ui-panel-overlay')) {
      resultsDropdown.classList.remove('active');
    }
  });
}

/**
 * Update Browser Performance Profiler Card UI
 */
function updateProfilerUI(status, totalNodes) {
  document.getElementById('prof-node-count').textContent = totalNodes;
  document.getElementById('prof-visible-count').textContent = status.visibleCount;

  const fps = Math.round(1000 / Math.max(1, maxFrameTimeMs));
  const profMaxFrame = document.getElementById('prof-max-frame');
  profMaxFrame.textContent = `${maxFrameTimeMs.toFixed(1)} ms (${fps} FPS)`;
  profMaxFrame.style.color = maxFrameTimeMs < 16.7 ? '#52B788' : (maxFrameTimeMs < 33 ? '#F2CB6E' : '#E63946');

  document.getElementById('prof-text-lod').textContent = status.textVisible ? 'مفعّلة (Near Zoom)' : 'مخفية (Far Zoom)';
  document.getElementById('prof-sway-status').textContent = status.swayActive ? 'مفعلة' : 'معطلة للأداء';
}

/**
 * Button Controls Listeners
 */
function setupButtonListeners() {
  const btnSingleLimb = document.getElementById('btn-single-limb');
  if (btnSingleLimb) {
    btnSingleLimb.addEventListener('click', () => {
      isSingleLimbMode = !isSingleLimbMode;
      btnSingleLimb.textContent = isSingleLimbMode ? 'عرض الشجرة كاملة (181 أصل)' : 'معاينة غصن واحد (3 أجيال)';
      renderTree(activeTreeData);
    });
  }

  const btnBenchmark = document.getElementById('btn-benchmark');
  btnBenchmark.addEventListener('click', () => {
    maxFrameTimeMs = 0;
    if (activeTreeData === rawTreeData) {
      activeTreeData = generateSyntheticTree(2000);
      isSingleLimbMode = false;
      btnBenchmark.textContent = 'إعادة المشجرة الأصلية (181 أصل)';
    } else {
      activeTreeData = rawTreeData;
      btnBenchmark.textContent = 'اختبار 2000 أصل (Stress Test)';
    }
    renderTree(activeTreeData);
  });

  document.getElementById('btn-reset-cam').addEventListener('click', () => {
    lineageTracer.clearTrace();
    cameraObj.svg.transition().duration(800).call(cameraObj.zoom.transform, cameraObj.initialTransform);
  });

  const btnProfiler = document.getElementById('btn-profiler');
  const profilerCard = document.getElementById('profiler-card');
  btnProfiler.addEventListener('click', () => {
    profilerCard.classList.toggle('active');
  });

  const btnDebug = document.getElementById('btn-debug');
  if (btnDebug) {
    btnDebug.addEventListener('click', () => {
      const layer = document.getElementById('debug-layer');
      const showing = layer.style.display !== 'none';
      layer.style.display = showing ? 'none' : '';
      btnDebug.style.borderColor = showing ? '' : '#E91E63';
    });
  }
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  renderTree(activeTreeData);
  setupSearchUI();
  setupButtonListeners();
});
