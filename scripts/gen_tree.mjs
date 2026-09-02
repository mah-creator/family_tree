/**
 * Generates a synthetic genealogy matching the shape of tree_1000.json, for
 * scale testing. Deterministic (seeded), same schema as tree.json.
 *
 * Usage: node scripts/gen_tree.mjs <count> <outfile>
 */
import { writeFileSync } from 'fs';

const count = parseInt(process.argv[2] || '2000', 10);
const outfile = process.argv[3] || `tree_${count}.json`;

let seed = 20260902;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const NAMES = ['محمد', 'علي', 'حسن', 'حسين', 'عبد الله', 'عبد العزيز', 'عبد الرحمن',
  'بلقاسم', 'خالد', 'أحمد', 'عمر', 'إبراهيم', 'سليمان', 'يوسف', 'سعود', 'سعيد',
  'صالح', 'حمد', 'ناصر', 'فيصل', 'هاشم', 'فهد', 'ماجد', 'سالم', 'منصور', 'عوض',
  'مبارك', 'بركات', 'طلال', 'زاهر', 'غانم', 'مقبل', 'جزاع', 'راجح', 'نايف', 'دخيل'];
const FOUNDER_LABELS = ['جد آل بريكة', 'جد آل زاهر', 'جد آل عبد الواحد', 'جد ذوي حسين',
  'جد آل ناصر', 'جد آل سليمان', 'جد آل حمد', 'جد آل ماجد', 'جد آل مبارك', 'جد آل مطاوعة'];
const NOTES = ['يُعرف بـ(أبو خيالة)', 'يُعرف بـ(الشاعر)', 'يُعرف بـ(بن العود)',
  'يُعرف بـ(الدنيش)', 'يُعرف بـ(المطوع)', 'يُعرف بـ(أبو نايف)'];

const persons = [];
const pad = String(count).length;
const id = i => 'p' + String(i).padStart(pad, '0');

// Root plus a trunk spine, mirroring tree_1000: ~8 spine generations.
const MAX_DEPTH = 9;
const SPINE_LEN = 8;
let next = 1;
const rootId = id(next++);
persons.push({
  id: rootId, name: pick(NAMES), fatherId: null,
  birthYearHijri: 1183, deathYearHijri: 1269, note: null,
  isTrunkLineage: true, isFounder: false, founderLabel: null, isDistinguished: false
});

// Build the spine first so trunk-attached subtrees exist at many heights.
const spine = [rootId];
for (let d = 1; d < SPINE_LEN; d++) {
  const sid = id(next++);
  persons.push({
    id: sid, name: pick(NAMES), fatherId: spine[spine.length - 1],
    birthYearHijri: 1183 + d * 28, deathYearHijri: null, note: null,
    isTrunkLineage: true, isFounder: rnd() < 0.3,
    founderLabel: rnd() < 0.3 ? pick(FOUNDER_LABELS) : null, isDistinguished: rnd() < 0.5
  });
  spine.push(sid);
}

// Frontier expansion: each spine node and each ordinary node spawns children
// until the target count is reached, with breadth decaying by depth so the
// limb-size spread spans wide (tree_1000 runs 300 down to 8).
const depthOf = new Map(persons.map((p, i) => [p.id, p.isTrunkLineage ? i : 0]));
let frontier = spine.map((s, i) => ({ pid: s, depth: i }));

while (persons.length < count && frontier.length) {
  const nextFrontier = [];
  for (const { pid, depth } of frontier) {
    if (persons.length >= count) break;
    if (depth >= MAX_DEPTH) continue;
    // Wide near the spine, narrowing with depth.
    const base = depth <= 1 ? 4 : depth <= 3 ? 3 : 2;
    const kids = Math.max(1, Math.round(base * (0.6 + rnd() * 0.9)));
    for (let k = 0; k < kids && persons.length < count; k++) {
      const cid = id(next++);
      const isFounder = rnd() < 0.03;
      persons.push({
        id: cid, name: pick(NAMES), fatherId: pid,
        birthYearHijri: rnd() < 0.6 ? 1200 + depth * 26 + Math.floor(rnd() * 12) : null,
        deathYearHijri: rnd() < 0.5 ? 1270 + depth * 26 + Math.floor(rnd() * 14) : null,
        note: rnd() < 0.05 ? pick(NOTES) : null,
        isTrunkLineage: false,
        isFounder,
        founderLabel: isFounder ? pick(FOUNDER_LABELS) : null,
        isDistinguished: isFounder || rnd() < 0.12
      });
      depthOf.set(cid, depth + 1);
      nextFrontier.push({ pid: cid, depth: depth + 1 });
    }
  }
  frontier = nextFrontier;
}

writeFileSync(new URL(`../${outfile}`, import.meta.url),
  JSON.stringify({ _note: 'SYNTHETIC SCALE-TEST DATA', rootId, persons }, null, 1));

const kids = new Map();
persons.forEach(p => p.fatherId && kids.set(p.fatherId, (kids.get(p.fatherId) || 0) + 1));
const leaves = persons.filter(p => !kids.has(p.id));
const rootKids = persons.filter(p => p.fatherId === rootId);
const sub = i => { let n = 1; persons.filter(p => p.fatherId === i).forEach(c => n += sub(c.id)); return n; };
console.log(`${outfile}: ${persons.length} persons, ${leaves.length} leaves, ` +
  `maxDepth ${Math.max(...[...depthOf.values()])}, root children ${rootKids.length}, ` +
  `limb sizes ${rootKids.map(k => sub(k.id)).sort((a, b) => b - a).join(',')}`);
