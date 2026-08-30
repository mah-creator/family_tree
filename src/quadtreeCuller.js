import * as d3 from 'd3';

/**
 * Quadtree Viewport Culling & Explicit Text-LOD Manager
 * Controls DOM node visibility, text element rendering, and gated ambient sway.
 */

export class QuadtreeCuller {
  constructor(allNodes, containerSvg, options = {}) {
    this.allNodes = allNodes;
    this.container = containerSvg;
    this.textLodScaleThreshold = options.textLodScaleThreshold || 1.35;
    this.maxSwayLeafThreshold = options.maxSwayLeafThreshold || 120;

    // Build Quadtree
    this.quadtree = d3.quadtree()
      .x(d => d.x)
      .y(d => d.y)
      .addAll(allNodes);

    this.nodeDomMap = new Map();
  }

  registerDomElement(nodeId, domElement) {
    this.nodeDomMap.set(nodeId, domElement);
  }

  /**
   * Updates visibility and LOD states based on current d3-zoom transform and viewport dimensions.
   */
  updateViewport(transform, viewportWidth, viewportHeight) {
    const { k, x: tx, y: ty } = transform;

    // Calculate world space bounds visible in viewport
    const x0 = (0 - tx) / k - 100;
    const y0 = (0 - ty) / k - 100;
    const x1 = (viewportWidth - tx) / k + 100;
    const y1 = (viewportHeight - ty) / k + 100;

    const visibleNodes = [];

    // Search Quadtree for visible nodes
    this.quadtree.visit((node, xmin, ymin, xmax, ymax) => {
      if (!node.length) {
        // Leaf quadtree node
        const p = node.data;
        if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) {
          visibleNodes.push(p);
        }
      }
      // Return true if quadtree box is completely outside viewport bounds
      return xmin > x1 || xmax < x0 || ymin > y1 || ymax < y0;
    });

    const visibleSet = new Set(visibleNodes.map(n => n.data.id));
    const showText = k >= this.textLodScaleThreshold;
    const enableSway = visibleNodes.length <= this.maxSwayLeafThreshold;

    // Update DOM visibility & Text LOD
    this.nodeDomMap.forEach((el, id) => {
      const isVisible = visibleSet.has(id);

      if (!isVisible) {
        el.style.display = 'none';
        el.classList.remove('leaf-sway');
      } else {
        el.style.display = '';

        // Correction #5: Explicit Text-LOD rule - <text> elements exist DOM-wise or display-wise only when zoomed in
        const textEl = el.querySelector('text, .leaf-text, .founder-text, .trunk-text');
        if (textEl) {
          textEl.style.display = showText ? '' : 'none';
        }

        // Correction #4: Gated ambient sway applied ONLY to in-viewport leaves below count threshold
        if (el.classList.contains('leaf-node')) {
          if (enableSway) {
            el.classList.add('leaf-sway');
          } else {
            el.classList.remove('leaf-sway');
          }
        }
      }
    });

    return {
      visibleCount: visibleNodes.length,
      textVisible: showText,
      swayActive: enableSway
    };
  }
}
