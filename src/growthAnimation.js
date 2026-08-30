/**
 * Growth-On-Load Animation & Motion Preferences Manager
 * Handles depth-staggered branch growth and leaf scale/fade-in.
 * Respects prefers-reduced-motion, skippable by interaction, max 2s duration.
 */

export function initGrowthAnimation(containerElement, options = {}) {
  const {
    durationMs = 1800,
    onComplete = null
  } = options;

  // Check prefers-reduced-motion
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    containerElement.classList.add('growth-complete');
    if (onComplete) onComplete();
    return { skip: () => {} };
  }

  let isSkipped = false;

  // Apply animation classes to branches and leaves by depth
  const branches = containerElement.querySelectorAll('.branch-path');
  const leaves = containerElement.querySelectorAll('.leaf-node');
  const nodes = containerElement.querySelectorAll('.trunk-node, .founder-node');

  const maxDepth = 6;
  const stepDelay = durationMs / maxDepth;

  branches.forEach(b => {
    const depth = parseInt(b.getAttribute('data-depth') || '1', 10);
    const delay = Math.min(1.8, (depth * stepDelay) / 1000);
    b.style.animation = `branchDraw 0.6s ease-out ${delay}s both`;
  });

  leaves.forEach(l => {
    const depth = parseInt(l.getAttribute('data-depth') || '1', 10);
    const delay = Math.min(1.8, (depth * stepDelay + 200) / 1000);
    l.style.animation = `leafAppear 0.5s ease-out ${delay}s both`;
  });

  nodes.forEach(n => {
    const depth = parseInt(n.getAttribute('data-depth') || '1', 10);
    const delay = Math.min(1.8, (depth * stepDelay) / 1000);
    n.style.animation = `nodePop 0.4s ease-out ${delay}s both`;
  });

  const skip = () => {
    if (isSkipped) return;
    isSkipped = true;
    branches.forEach(b => b.style.animation = 'none');
    leaves.forEach(l => l.style.animation = 'none');
    nodes.forEach(n => n.style.animation = 'none');
    containerElement.classList.add('growth-complete');
    if (onComplete) onComplete();
  };

  // Skip on user interaction
  const handleUserInteraction = () => {
    skip();
    window.removeEventListener('pointerdown', handleUserInteraction);
    window.removeEventListener('wheel', handleUserInteraction);
  };

  window.addEventListener('pointerdown', handleUserInteraction, { once: true });
  window.addEventListener('wheel', handleUserInteraction, { once: true });

  setTimeout(() => {
    skip();
  }, durationMs + 200);

  return { skip };
}
