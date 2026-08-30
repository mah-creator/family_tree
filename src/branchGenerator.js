/**
 * Organic Tapered Branch Polygon Path Generator
 * Samples spine cubic Bézier at 12 points, offsets perpendicular by W(t)/2,
 * and constructs a smooth closed tapered polygon SVG path.
 */

export function createTaperedBranchPolygonPath(node, samples = 12) {
  if (!node.p0 || !node.p1 || !node.p2 || !node.p3) return '';

  const { p0, p1, p2, p3, baseWidth, tipWidth } = node;

  const leftPoints = [];
  const rightPoints = [];

  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const mt = 1 - t;

    // Cubic Bézier Point B(t)
    const bx = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
    const by = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;

    // Cubic Bézier Derivative B'(t)
    const dx = 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
    const dy = 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);

    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;

    // Unit normal vector perpendicular to tangent
    const nx = -ty;
    const ny = tx;

    // Linearly interpolated width at t
    const w = baseWidth + t * (tipWidth - baseWidth);
    const r = w / 2;

    leftPoints.push({
      x: (bx + nx * r).toFixed(2),
      y: (by + ny * r).toFixed(2)
    });

    rightPoints.push({
      x: (bx - nx * r).toFixed(2),
      y: (by - ny * r).toFixed(2)
    });
  }

  // Construct closed polygon SVG path
  let pathStr = `M ${leftPoints[0].x} ${leftPoints[0].y}`;
  for (let i = 1; i < samples; i++) {
    pathStr += ` L ${leftPoints[i].x} ${leftPoints[i].y}`;
  }
  for (let i = samples - 1; i >= 0; i--) {
    pathStr += ` L ${rightPoints[i].x} ${rightPoints[i].y}`;
  }
  pathStr += ' Z';

  return pathStr;
}
