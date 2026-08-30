import * as d3 from 'd3';

/**
 * Lineage Tracing Engine
 * Highlights ancestral path from root to selected person node with animated stroke-dashoffset,
 * dimming non-ancestor elements to 15% opacity.
 */

export class LineageTracer {
  constructor(nodeMap, rootId, containerGroup) {
    this.nodeMap = nodeMap;
    this.rootId = rootId;
    this.container = containerGroup;
    this.highlightPathGroup = null;

    this.initHighlightLayer();
  }

  initHighlightLayer() {
    let layer = d3.select(this.container).select('.lineage-highlight-layer');
    if (layer.empty()) {
      layer = d3.select(this.container).append('g')
        .attr('class', 'lineage-highlight-layer')
        .style('pointer-events', 'none');
    }
    this.highlightPathGroup = layer;
  }

  traceLineage(targetNode) {
    if (!targetNode) {
      this.clearTrace();
      return;
    }

    // Build ancestor chain
    const ancestorIds = new Set();
    let curr = targetNode;
    const lineageNodes = [];

    while (curr) {
      ancestorIds.add(curr.data ? curr.data.id : curr.id);
      lineageNodes.push(curr);
      if (curr.parent) {
        curr = curr.parent;
      } else if (curr.fatherId && this.nodeMap.has(curr.fatherId)) {
        curr = this.nodeMap.get(curr.fatherId);
      } else {
        break;
      }
    }

    // Dim non-ancestor nodes & branches
    d3.select(this.container).selectAll('.leaf-node, .trunk-node, .founder-node, .branch-path')
      .transition().duration(300)
      .style('opacity', function() {
        const id = this.getAttribute('data-id') || this.getAttribute('data-target-id');
        return ancestorIds.has(id) ? 1 : 0.15;
      });

    // Clear previous highlight path
    this.highlightPathGroup.selectAll('*').remove();

    // Construct smooth glowing path along lineage nodes
    if (lineageNodes.length > 1) {
      const pathPoints = lineageNodes.map(n => [n.x, n.y]).reverse();
      const lineGenerator = d3.line()
        .x(d => d[0])
        .y(d => d[1])
        .curve(d3.curveCatmullRom.alpha(0.5));

      const pathData = lineGenerator(pathPoints);

      const path = this.highlightPathGroup.append('path')
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', '#FFD700')
        .attr('stroke-width', 6)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .style('filter', 'drop-shadow(0 0 12px rgba(255, 215, 0, 0.95))');

      const totalLength = path.node().getTotalLength();

      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(850)
        .ease(d3.easeCubicOut)
        .attr('stroke-dashoffset', 0);
    }
  }

  clearTrace() {
    this.highlightPathGroup.selectAll('*').remove();
    d3.select(this.container).selectAll('.leaf-node, .trunk-node, .founder-node, .branch-path')
      .transition().duration(300)
      .style('opacity', 1);
  }
}
