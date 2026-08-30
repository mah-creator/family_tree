/**
 * Leaf Renderer Module — Renders individual leaf SVG elements
 * Handles leaf path geometry, twig rotation, text placement inside leaf body,
 * and text flipping to prevent upside-down Arabic typography.
 */

// Leaf path generator (curved botanical leaf shape pointing right at 0 deg)
export function getLeafSVGPath(width = 46, height = 23) {
  const w = width;
  const h = height / 2;
  return `M 0 0 C ${w * 0.25} ${-h * 1.3}, ${w * 0.75} ${-h * 1.1}, ${w} 0 C ${w * 0.75} ${h * 1.1}, ${w * 0.25} ${h * 1.3}, 0 0 Z`;
}

// Leaf central vein path
export function getLeafVeinPath(width = 46) {
  return `M 2 0 Q ${width * 0.5} -1, ${width * 0.88} 0`;
}

/**
 * Calculates optimal font size for Arabic text inside leaf
 * Floor: 8px, Baseline: 12px
 */
export function calculateFontSize(name) {
  if (!name) return { fontSize: 12, truncatedName: '' };

  const len = name.length;
  let fontSize = 12;

  if (len > 12) fontSize = 8.5;
  else if (len > 9) fontSize = 9.5;
  else if (len > 6) fontSize = 11;

  let truncatedName = name;
  if (len > 15 && fontSize <= 8.5) {
    truncatedName = name.substring(0, 13) + '…';
  }

  return { fontSize, truncatedName };
}

/**
 * Creates SVG <g> DOM node for a Leaf
 * @param {Object} node - Leaf node data
 * @param {number} x - Target X coordinate (branch tip)
 * @param {number} y - Target Y coordinate (branch tip)
 * @param {number} angleDeg - Twig exit vector angle in degrees
 * @param {boolean} showText - Whether text should be rendered (Text-LOD)
 */
export function createLeafNode(node, x, y, angleDeg = 0, showText = true) {
  const isDistinguished = !!node.data?.isDistinguished || !!node.isDistinguished;
  const name = node.data?.name || node.name || '';
  const { fontSize, truncatedName } = calculateFontSize(name);

  // Outer group (positioned at branch tip)
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', `leaf-node ${isDistinguished ? 'leaf-distinguished' : 'leaf-standard'}`);
  g.setAttribute('transform', `translate(${x}, ${y})`);
  g.setAttribute('data-id', node.data?.id || node.id);

  // 1. Leaf Body Container (Rotated along twig axis)
  const leafBodyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  leafBodyGroup.setAttribute('transform', `rotate(${angleDeg})`);

  // Leaf SVG shape
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', getLeafSVGPath(46, 23));
  path.setAttribute('class', 'leaf-shape');
  path.setAttribute('fill', isDistinguished ? 'url(#goldLeafGradient)' : 'url(#emeraldLeafGradient)');
  path.setAttribute('stroke', isDistinguished ? '#9A7B2C' : '#1D5A38');
  path.setAttribute('stroke-width', '0.75');

  // Leaf vein
  const vein = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  vein.setAttribute('d', getLeafVeinPath(46));
  vein.setAttribute('class', 'leaf-vein');
  vein.setAttribute('stroke', isDistinguished ? 'rgba(255, 235, 175, 0.6)' : 'rgba(180, 240, 200, 0.45)');
  vein.setAttribute('stroke-width', '0.8');
  vein.setAttribute('fill', 'none');

  leafBodyGroup.appendChild(path);
  leafBodyGroup.appendChild(vein);

  // 2. Text Container — APPENDED TO leafBodyGroup SO IT SITS INSIDE LEAF COORDINATE SYSTEM
  if (showText) {
    // Normalize angleDeg to [-180, 180]
    let normalizedAngle = angleDeg % 360;
    if (normalizedAngle > 180) normalizedAngle -= 360;
    if (normalizedAngle < -180) normalizedAngle += 360;

    // Flip text 180 deg if leaf points into left half (-180 to -90 or 90 to 180) to keep Arabic upright
    const isUpsideDown = Math.abs(normalizedAngle) > 90;
    const textTransform = isUpsideDown ? 'translate(23, 0) rotate(180)' : 'translate(23, 0) rotate(0)';

    const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    textGroup.setAttribute('transform', textTransform);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'leaf-text');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('font-size', `${fontSize}px`);
    text.setAttribute('fill', isDistinguished ? '#3D2800' : '#FFFFFF');
    text.setAttribute('font-weight', '700');
    text.textContent = truncatedName;

    if (name !== truncatedName || node.data?.note) {
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      const note = node.data?.note ? ` (${node.data.note})` : '';
      title.textContent = `${name}${note}`;
      text.appendChild(title);
    }

    textGroup.appendChild(text);
    // APPEND TO leafBodyGroup (ONE-LINE HIERARCHY FIX)
    leafBodyGroup.appendChild(textGroup);
  }

  g.appendChild(leafBodyGroup);
  return g;
}
