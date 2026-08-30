/**
 * Synthetic 2,000-Node Family Tree Data Generator
 * Adheres strictly to the tree.json schema for FPS stress testing.
 */

export function generateSyntheticTree(targetCount = 2000) {
  const rootId = 'p001';
  const persons = [
    {
      id: rootId,
      name: 'علي',
      fatherId: null,
      birthYearHijri: 1150,
      deathYearHijri: 1220,
      note: 'مؤسس السلالة التجريبية',
      isTrunkLineage: true,
      isFounder: true,
      founderLabel: 'الجد الأول',
      isDistinguished: true
    }
  ];

  const arabicNames = [
    'محمد', 'علي', 'حسن', 'حسين', 'عبد الله', 'عبد العزيز', 'عبد الرحمن',
    'بلقاسم', 'خالد', 'أحمد', 'عمر', 'إبراهيم', 'سليمان', 'يوسف', 'سعود',
    'سعيد', 'صالح', 'حمد', 'ناصر', 'فيصل', 'هاشم', 'فهد', 'ماجد', 'فواز'
  ];

  const founderLabels = [
    'جد آل بريكة', 'جد آل زاهر', 'جد آل عبد الواحد', 'جد ذوي حسين',
    'جد آل ناصر', 'جد آل سليمان', 'جد آل حمد', 'جد آل ماجد'
  ];

  let currentId = 2;
  let currentGen = [rootId];
  let genNumber = 1;

  // We build 6-7 generations until targetCount is reached
  while (persons.length < targetCount && currentGen.length > 0) {
    const nextGen = [];
    genNumber++;

    for (const fatherId of currentGen) {
      if (persons.length >= targetCount) break;

      // Children per father: 2 to 5
      const childrenCount = Math.floor(2 + ((fatherId.charCodeAt(fatherId.length - 1) * 7) % 4));

      for (let i = 0; i < childrenCount; i++) {
        if (persons.length >= targetCount) break;

        const id = `p${String(currentId).padStart(4, '0')}`;
        currentId++;
        nextGen.push(id);

        const nameIndex = (currentId + i * 3) % arabicNames.length;
        const isTrunk = i === 0 && fatherId === persons[persons.length - 1].fatherId && genNumber <= 6;
        const isFounder = !isTrunk && (currentId % 45 === 0);
        const isDistinguished = isTrunk || isFounder || (currentId % 15 === 0);

        persons.push({
          id,
          name: arabicNames[nameIndex],
          fatherId,
          birthYearHijri: 1200 + genNumber * 30 + (i * 3),
          deathYearHijri: 1270 + genNumber * 30 + (i * 3),
          note: currentId % 20 === 0 ? 'يُعرف بـ(الشاعر)' : null,
          isTrunkLineage: isTrunk,
          isFounder,
          founderLabel: isFounder ? founderLabels[currentId % founderLabels.length] : null,
          isDistinguished
        });
      }
    }

    currentGen = nextGen;
  }

  return {
    _note: `SYNTHETIC BENCHMARK DATA — ${persons.length} nodes`,
    rootId,
    persons
  };
}
