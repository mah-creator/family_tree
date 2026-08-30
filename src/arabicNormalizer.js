/**
 * Arabic Text Normalization & Lineage Chain Builder
 */

/**
 * Normalizes Arabic text for robust search matching.
 * Unifies hamzas, alef forms, yaa/alef maqsura, taa marbuta, strips diacritics & tatweel,
 * and normalizes space variations (e.g., عبد الله <-> عبدالله <-> عبدله).
 */
export function normalizeArabic(str) {
  if (!str) return '';

  return str
    .trim()
    // Strip Tashkeel / Diacritics
    .replace(/[\u064B-\u0652\u0670]/g, '')
    // Strip Tatweel
    .replace(/\u0640/g, '')
    // Normalize Alef forms (أ, إ, آ, ٱ -> ا)
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Alef Maqsura to Yaa (ى -> ي)
    .replace(/ى/g, 'ي')
    // Normalize Taa Marbuta to Haa (ة -> ه)
    .replace(/ة/g, 'ه')
    // Unify Abd-Name space & spelling variants: "عبد الله" -> "عبدالله", "عبدله" -> "عبدالله"
    .replace(/عبد\s+/g, 'عبد')
    .replace(/عبدله/g, 'عبدالله')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ');
}

/**
 * Builds the full patronymic lineage chain for a person node up to the root.
 * Example: "حسن بن علي بن عبد الله"
 */
export function buildLineageChain(node, nodeMap) {
  if (!node) return '';
  const chain = [node.name];
  let curr = node;
  let depth = 0;

  while (curr.fatherId && nodeMap.has(curr.fatherId) && depth < 20) {
    curr = nodeMap.get(curr.fatherId);
    chain.push(curr.name);
    depth++;
  }

  return chain.join(' بن ');
}
