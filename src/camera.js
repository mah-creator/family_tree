import * as d3 from 'd3';

/**
 * Camera Navigation Engine
 * Provides d3-zoom bounds and smooth Van Wijk camera flight (d3.interpolateZoom).
 */

export function initCamera(svgElement, zoomContainerGroup, options = {}) {
  const {
    width = 3400,
    height = 2600,
    minScale = 0.12,
    maxScale = 20,
    onZoom = null
  } = options;

  const svg = d3.select(svgElement);

  const zoom = d3.zoom()
    .scaleExtent([minScale, maxScale])
    .translateExtent([[-800, -800], [width + 800, height + 800]])
    .on('zoom', (event) => {
      d3.select(zoomContainerGroup).attr('transform', event.transform);
      if (onZoom) onZoom(event.transform);
    });

  svg.call(zoom);

  // Initial framing: fit the whole world into the viewport. Both the scale
  // (0.42) and the focus point (1700, 1450) used to be hardcoded for a
  // 3400x2600 canvas, so enlarging the world for the 1.45x leaves left the
  // tree off-centre and overscaled. Derived from width/height now.
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 900;
  const initialScale = Math.max(
    minScale,
    Math.min(viewportWidth / width, viewportHeight / height) * 0.92
  );

  const initialTransform = d3.zoomIdentity
    .translate(
      viewportWidth / 2 - (width / 2) * initialScale,
      viewportHeight / 2 - (height / 2) * initialScale
    )
    .scale(initialScale);

  svg.call(zoom.transform, initialTransform);

  return { zoom, svg, initialTransform };
}

/**
 * Smooth Van Wijk camera flight to target node coordinates.
 * PULLS BACK, ARCS ACROSS CANOPY, AND DIVES INTO TARGET.
 */
export function flyToNode(zoom, svgSelection, targetX, targetY, targetScale = 3.2, options = {}) {
  const { onEnd = null } = options;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const currentTransform = d3.zoomTransform(svgSelection.node());
  const startX = (viewportWidth / 2 - currentTransform.x) / currentTransform.k;
  const startY = (viewportHeight / 2 - currentTransform.y) / currentTransform.k;
  const startK = currentTransform.k;

  const endX = targetX;
  const endY = targetY;
  const endK = targetScale;

  // Van Wijk zoom interpolator
  const interpolator = d3.interpolateZoom(
    [startX, startY, viewportWidth / startK],
    [endX, endY, viewportWidth / endK]
  );

  const duration = Math.min(1600, Math.max(650, interpolator.duration * 0.7));

  svgSelection.transition()
    .duration(duration)
    .ease(d3.easeCubicInOut)
    .tween('zoom', () => {
      return (t) => {
        const [x, y, w] = interpolator(t);
        const k = viewportWidth / w;
        const transform = d3.zoomIdentity
          .translate(viewportWidth / 2 - x * k, viewportHeight / 2 - y * k)
          .scale(k);

        svgSelection.call(zoom.transform, transform);
      };
    })
    .on('end', () => {
      if (onEnd) onEnd();
    });
}
