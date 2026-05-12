// Post-process optimizer result so total recommended hours are filled as much as possible.
// Priority:
// 1. Keep duplicate subject-class blocked.
// 2. For each shortage row, first try one grade.
// 3. If one grade cannot fill the shortage, distribute across grades as evenly as possible.

import { normalizeSubjectPools } from './timetable-optimizer.js';

export function fillTotalDedicatedHours(config = {}, settings = {}, result = null) {
  if (!result?.rows?.length) return result;

  const subjectPools = normalizeSubjectPools(settings.subjectPools || []);
  const gradeClasses = normalizeGradeClasses(config.gradeClasses || []);
  const occupied = makeOccupiedSet(result.rows || []);

  const rows = (result.rows || []).map((row) => ({ ...row, recommendedClasses: [...(row.recommendedClasses || [])] }));

  rows.forEach((row) => {
    const targetHours = Number(row.targetHours || 0);
    if (!row.subject || !targetHours) return;

    let currentHours = calculateCodesHours(row.recommendedClasses, row.subject, subjectPools);
    let shortage = targetHours - currentHours;
    if (shortage <= 0) {
      row.recommendedHours = currentHours;
      return;
    }

    const added = selectShortageFillClasses(row, shortage, gradeClasses, subjectPools, occupied);
    added.forEach((classCode) => {
      const key = makeSubjectClassKey(row.subject, classCode);
      if (occupied.has(key)) return;
      occupied.add(key);
      row.recommendedClasses.push(classCode);
    });

    currentHours = calculateCodesHours(row.recommendedClasses, row.subject, subjectPools);
    row.recommendedHours = currentHours;
    row.grades = [...new Set(row.recommendedClasses.map((code) => Number(String(code).split('-')[0])))]
      .filter(Boolean)
      .sort((a, b) => a - b);

    const warnings = (row.warnings || []).filter((warning) => !String(warning).startsWith('목표 '));
    if (currentHours !== targetHours) warnings.unshift(`목표 ${targetHours}시간 / 추천 ${currentHours}시간`);
    if (added.length) warnings.push('부족 시수 보정 배정 포함');
    row.warnings = [...new Set(warnings)];
  });

  const recommendedTotal = rows.reduce((sum, row) => sum + Number(row.recommendedHours || 0), 0);

  return {
    ...result,
    rows,
    summary: {
      ...(result.summary || {}),
      recommendedTotal,
      gap: recommendedTotal - Number(result.totalDedicatedHours || 0)
    }
  };
}

function selectShortageFillClasses(row, shortage, gradeClasses, subjectPools, occupied) {
  const availableByGrade = makeAvailableByGrade(row, gradeClasses, subjectPools, occupied);
  if (!availableByGrade.size) return [];

  const singleGrade = selectSingleGradeFill(availableByGrade, shortage);
  if (singleGrade.length) return singleGrade;

  return selectBalancedFill(availableByGrade, shortage);
}

function makeAvailableByGrade(row, gradeClasses, subjectPools, occupied) {
  const allowedGrades = getSubjectGrades(row.subject, subjectPools).filter((grade) => getGradeClassCount(gradeClasses, grade) > 0);
  const preferred = Array.isArray(row.preferredGrades) && row.preferredGrades.length
    ? row.preferredGrades.map(Number).filter((grade) => allowedGrades.includes(grade))
    : [];
  const gradeOrder = buildGradeOrder(preferred.length ? preferred : allowedGrades, allowedGrades);
  const map = new Map();

  gradeOrder.forEach((grade) => {
    const hour = getSubjectGradeHour(row.subject, grade, subjectPools);
    const items = makeGradeClassCodes(gradeClasses, grade)
      .filter((code) => !occupied.has(makeSubjectClassKey(row.subject, code)))
      .map((code) => ({ code, grade, hour }));
    if (items.length) map.set(grade, items);
  });

  return map;
}

function buildGradeOrder(primaryGrades, allGrades) {
  const order = [];
  primaryGrades.forEach((grade) => pushUnique(order, Number(grade)));

  [[1, 2], [3, 4], [5, 6], [2, 3], [4, 5]].forEach((pair) => {
    pair.forEach((grade) => {
      if (allGrades.includes(grade)) pushUnique(order, grade);
    });
  });

  allGrades.forEach((grade) => pushUnique(order, Number(grade)));
  return order.filter(Boolean);
}

function selectSingleGradeFill(availableByGrade, shortage) {
  let best = null;

  availableByGrade.forEach((items, grade) => {
    const selected = selectClosestFromItems(items, shortage);
    const hours = sumItemHours(selected);
    if (hours < shortage) return;

    const score = Math.abs(hours - shortage) * 100 + selected.length;
    if (!best || score < best.score) best = { grade, selected, score };
  });

  return best?.selected?.map((item) => item.code) || [];
}

function selectBalancedFill(availableByGrade, shortage) {
  const pools = [...availableByGrade.entries()].map(([grade, items]) => ({ grade, items: [...items], selected: [] }));
  const selected = [];
  let total = 0;

  while (total < shortage && pools.some((pool) => pool.items.length)) {
    pools
      .filter((pool) => pool.items.length)
      .sort((a, b) => {
        if (a.selected.length !== b.selected.length) return a.selected.length - b.selected.length;
        return a.grade - b.grade;
      });

    const pool = pools.find((item) => item.items.length);
    if (!pool) break;

    const next = pickBestNext(pool.items, shortage - total);
    if (!next) break;

    pool.items = pool.items.filter((item) => item.code !== next.code);
    pool.selected.push(next);
    selected.push(next);
    total += next.hour;
  }

  return selected.map((item) => item.code);
}

function selectClosestFromItems(items, shortage) {
  const selected = [];
  let total = 0;
  const queue = [...items];

  while (queue.length && total < shortage) {
    const next = pickBestNext(queue, shortage - total);
    if (!next) break;
    selected.push(next);
    total += next.hour;
    const index = queue.findIndex((item) => item.code === next.code);
    if (index >= 0) queue.splice(index, 1);
  }

  return selected;
}

function pickBestNext(items, remain) {
  if (!items.length) return null;
  const under = items.filter((item) => item.hour <= remain).sort((a, b) => b.hour - a.hour || a.code.localeCompare(b.code, 'ko'))[0];
  if (under) return under;
  return [...items].sort((a, b) => a.hour - b.hour || a.code.localeCompare(b.code, 'ko'))[0];
}

function makeOccupiedSet(rows) {
  const occupied = new Set();
  (rows || []).forEach((row) => {
    (row.recommendedClasses || []).forEach((classCode) => {
      occupied.add(makeSubjectClassKey(row.subject, classCode));
    });
  });
  return occupied;
}

function normalizeGradeClasses(items) {
  return [1, 2, 3, 4, 5, 6].map((grade) => ({
    grade,
    classCount: Number((items || []).find((item) => Number(item.grade) === grade)?.classCount || 0)
  }));
}

function getSubjectGrades(subject, subjectPools) {
  const pool = subjectPools.find((item) => item.subject === subject);
  return pool?.grades?.length ? pool.grades : [1, 2, 3, 4, 5, 6];
}

function getSubjectGradeHour(subject, grade, subjectPools) {
  const pool = subjectPools.find((item) => item.subject === subject);
  return Number(pool?.gradeHours?.[grade] || pool?.gradeHours?.[String(grade)] || 1);
}

function calculateCodesHours(classCodes, subject, subjectPools) {
  return (classCodes || []).reduce((sum, code) => {
    const grade = Number(String(code).split('-')[0]);
    return sum + getSubjectGradeHour(subject, grade, subjectPools);
  }, 0);
}

function getGradeClassCount(gradeClasses, grade) {
  return Number(gradeClasses.find((item) => item.grade === grade)?.classCount || 0);
}

function makeGradeClassCodes(gradeClasses, grade) {
  const count = getGradeClassCount(gradeClasses, grade);
  return Array.from({ length: count }, (_, index) => `${grade}-${index + 1}`);
}

function makeSubjectClassKey(subject, classCode) {
  return `${String(subject || '').trim()}__${String(classCode || '').trim()}`;
}

function sumItemHours(items) {
  return (items || []).reduce((sum, item) => sum + Number(item.hour || 0), 0);
}

function pushUnique(arr, value) {
  if (!arr.includes(value)) arr.push(value);
}
