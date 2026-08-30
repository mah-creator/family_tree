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
  layoutResult = buildBotanicalLayout(treeData, {
    width: 3600,
    height: 2800,
    trunkBaseY: 2500,
    trunkCenterX: 1800,
    rootTrunkLength: 320,
    rootBaseWidth: 52,
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
    width: 3600,
    height: 2800,
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
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  renderTree(activeTreeData);
  setupSearchUI();
  setupButtonListeners();
});
