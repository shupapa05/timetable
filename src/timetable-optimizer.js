export function normalizeSubjectPools(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const rawGradeHours = item.gradeHours || item.hours || {};
      const gradeHours = {};
      for (let grade = 1; grade <= 6; grade += 1) {
        const hour = Number(rawGradeHours[grade] ?? rawGradeHours[String(grade)] ?? 0);
        if (hour > 0) gradeHours[grade] = hour;
      }
      if (!Object.keys(gradeHours).length && Array.isArray(item.grades)) {
        item.grades.map(Number).filter((g) => g >= 1 && g <= 6).forEach((grade) => {
          gradeHours[grade] = 1;
        });
      }
      return {
        subject: String(item.subject || '').trim(),
        gradeHours,
        grades: Object.keys(gradeHours).map(Number).sort((a, b) => a - b)
      };
    })
    .filter((item) => item.subject);
}

export function normalizeTeacherAssignments(items = [], firstSubject = '') {
  const rows = Array.isArray(items) ? items : [];
  return rows.map((item) => ({
    subject: String(item.subject || firstSubject || '').trim(),
    weeklyHours: Number(item.weeklyHours || 1),
    fixedTargetHours: item.fixedTargetHours === undefined || item.fixedTargetHours === null ? '' : item.fixedTargetHours,
    preferredGrades: Array.isArray(item.preferredGrades) ? item.preferredGrades.map(Number).filter(Boolean) : [],
    assignedClasses: Array.isArray(item.assignedClasses) ? item.assignedClasses : [],
    roomName: String(item.roomName || '').trim()
  }));
}

export function normalizePlanningTeachers(items = [], teacherCount = 0, subjectPools = []) {
  const count = Math.max(0, Number(teacherCount || items.length || 0));
  const firstSubject = subjectPools[0]?.subject || '';
  return Array.from({ length: count }, (_, index) => {
    const item = items[index] || {};
    const legacy = item.subject || item.fixedTargetHours || item.preferredGrades
      ? [{
          subject: item.subject || firstSubject,
          fixedTargetHours: item.fixedTargetHours ?? '',
          preferredGrades: item.preferredGrades || [],
          assignedClasses: item.assignedClasses || [],
          roomName: item.roomName || ''
        }]
      : [];
    const assignments = normalizeTeacherAssignments(item.assignments || legacy, firstSubject);
    return {
      teacherCode: String(item.teacherCode || `전담${index + 1}`).trim(),
      teacherName: String(item.teacherName || item.teacherCode || `전담${index + 1}`).trim(),
      assignments: assignments.length ? assignments : [{ subject: firstSubject, weeklyHours: 1, fixedTargetHours: '', preferredGrades: [], assignedClasses: [], roomName: '' }]
    };
  });
}

export function flattenPlanningTeachers(planningTeachers = []) {
  const rows = [];
  planningTeachers.forEach((teacher, teacherIndex) => {
    (teacher.assignments || []).forEach((assignment, assignmentIndex) => {
      if (!assignment.subject) return;
      rows.push({
        teacherIndex,
        assignmentIndex,
        teacherCode: teacher.teacherCode || `전담${teacherIndex + 1}`,
        teacherName: teacher.teacherName || teacher.teacherCode || `전담${teacherIndex + 1}`,
        subject: assignment.subject,
        weeklyHours: Number(assignment.weeklyHours || 1),
        fixedTargetHours: assignment.fixedTargetHours ?? '',
        preferredGrades: assignment.preferredGrades || [],
        assignedClasses: assignment.assignedClasses || [],
        roomName: assignment.roomName || ''
      });
    });
  });
  return rows;
}

export function getDefaultOptimizerSettings(config = {}) {
  const planningTeachers = makeInitialPlanningTeachers(config);
  const subjectPools = makeInitialSubjectPools(config, planningTeachers);
  return {
    teacherCount: planningTeachers.length || Number(config.teacherCount || 0) || 0,
    totalDedicatedHours: getCurrentDedicatedHours({ teachers: flattenPlanningTeachers(planningTeachers) }),
    subjectPools,
    planningTeachers,
    teacherTargets: {},
    options: {
      sameGradePriority: true,
      adjacentGradePriority: true,
      lowGradeMoreHours: false,
      equalGradeHours: false
    }
  };
}

export function normalizeOptimizerSettings(config = {}) {
  const base = getDefaultOptimizerSettings(config);
  const saved = config.optimizerStandalone || config.optimizer || {};
  const subjectPools = normalizeSubjectPools(saved.subjectPools || base.subjectPools || []);
  const savedTeacherCount = Number(saved.teacherCount || 0);
  const savedPlanningCount = Array.isArray(saved.planningTeachers) ? saved.planningTeachers.length : 0;
  const teacherCount = Number(savedTeacherCount || savedPlanningCount || base.teacherCount || 0);
  return {
    ...base,
    ...saved,
    teacherCount,
    subjectPools,
    planningTeachers: normalizePlanningTeachers(saved.planningTeachers || base.planningTeachers || [], teacherCount, subjectPools),
    totalDedicatedHours: Number(saved.totalDedicatedHours || calculateSubjectTotalHours(config, subjectPools) || base.totalDedicatedHours || 0),
    options: { ...base.options, ...(saved.options || {}) }
  };
}

export function makeInitialPlanningTeachers(config = {}) {
  const teachers = Array.isArray(config.teachers) ? config.teachers : [];
  if (!teachers.length) return [];
  const map = new Map();
  teachers.forEach((teacher, index) => {
    const code = String(teacher.teacherCode || `전담${index + 1}`).trim();
    if (!map.has(code)) map.set(code, { teacherCode: code, teacherName: teacher.teacherName || code, assignments: [] });
    map.get(code).assignments.push({
      subject: teacher.subject || '',
      fixedTargetHours: '',
      preferredGrades: [],
      assignedClasses: teacher.assignedClasses || [],
      roomName: teacher.roomName || ''
    });
  });
  return [...map.values()];
}

export function makeInitialSubjectPools(config = {}, planningTeachers = []) {
  const subjects = [...new Set(flattenPlanningTeachers(planningTeachers).map((row) => row.subject).filter(Boolean))];
  const grades = getExistingGrades(config);
  return subjects.map((subject) => ({
    subject,
    gradeHours: Object.fromEntries(grades.map((grade) => [grade, 1])),
    grades
  }));
}

export function getCurrentDedicatedHours(config = {}) {
  return (config.teachers || []).reduce((sum, row) => sum + Number(row.weeklyHours || 1) * (row.assignedClasses || []).length, 0);
}

export function optimizeDedicatedAssignments(config = {}, inputSettings = {}) {
  const subjectPools = normalizeSubjectPools(inputSettings.subjectPools || []);
  const planningTeachers = normalizePlanningTeachers(inputSettings.planningTeachers || [], inputSettings.teacherCount || 0, subjectPools);
  const options = {
    sameGradePriority: true,
    adjacentGradePriority: true,
    lowGradeMoreHours: false,
    equalGradeHours: false,
    ...(inputSettings.options || {})
  };
  const rows = flattenPlanningTeachers(planningTeachers).map((row, index) => makeRow(row, index));
  const fixedRows = rows.filter((row) => row.isFixed);
  const autoRows = rows.filter((row) => !row.isFixed);
  const fixedTotal = fixedRows.reduce((sum, row) => sum + row.targetHours, 0);
  const totalDedicatedHours = Number(inputSettings.totalDedicatedHours || calculateSubjectTotalHours(config, subjectPools) || fixedTotal + autoRows.length * 18);
  const remain = Math.max(0, totalDedicatedHours - fixedTotal);
  const base = autoRows.length ? Math.floor(remain / autoRows.length) : 0;
  const extra = autoRows.length ? remain % autoRows.length : 0;
  let autoIndex = 0;
  const gradeClasses = normalizeGradeClasses(config.gradeClasses || []);
  const subjectGradeUsage = new Map();
  const occupiedSubjectClassKeys = new Set();
  const resultRowsByIndex = [];

  [...fixedRows, ...autoRows].forEach((row) => {
    const targetHours = row.isFixed ? row.targetHours : base + (autoIndex++ < extra ? 1 : 0);
    const rec = recommend(row, targetHours, gradeClasses, subjectPools, options, subjectGradeUsage, occupiedSubjectClassKeys);
    rec.classCodes.forEach((code) => {
      occupiedSubjectClassKeys.add(makeSubjectClassKey(row.subject, code));
      const grade = Number(code.split('-')[0]);
      const key = `${row.subject}__${grade}`;
      subjectGradeUsage.set(key, (subjectGradeUsage.get(key) || 0) + getSubjectGradeHour(row.subject, grade, subjectPools));
    });
    resultRowsByIndex[row.index] = { ...row, targetHours, recommendedClasses: rec.classCodes, recommendedHours: rec.hours, grades: rec.grades, warnings: rec.warnings };
  });

  const resultRows = resultRowsByIndex.filter(Boolean);

  return {
    totalDedicatedHours,
    fixedTotal,
    remainingHours: Math.max(0, totalDedicatedHours - fixedTotal),
    autoTeacherCount: autoRows.length,
    rows: resultRows,
    summary: { recommendedTotal: resultRows.reduce((s, r) => s + r.recommendedHours, 0), gap: resultRows.reduce((s, r) => s + r.recommendedHours, 0) - totalDedicatedHours }
  };
}

function makeRow(row, index) {
  const targetHours = Number(row.fixedTargetHours || 0);
  return { ...row, index, rowId: `${row.teacherIndex}_${row.assignmentIndex}_${row.teacherCode}_${row.subject}`, isFixed: targetHours > 0, targetHours };
}

function recommend(row, targetHours, gradeClasses, subjectPools, options = {}, subjectGradeUsage = new Map(), occupiedSubjectClassKeys = new Set()) {
  const allowedGrades = getSubjectGrades(row.subject, subjectPools).filter((grade) => getGradeClassCount(gradeClasses, grade) > 0);
  const explicitGrades = Array.isArray(row.preferredGrades) && row.preferredGrades.length ? row.preferredGrades.filter((grade) => allowedGrades.includes(Number(grade))) : [];
  const candidateGradeSets = explicitGrades.length ? buildExplicitGradeSets(explicitGrades) : buildBalancedGradeSets(allowedGrades, gradeClasses, targetHours, options, row.subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys);
  let best = null;
  for (const gradeSet of candidateGradeSets) {
    const classCodes = selectClassesFromGradeSet(gradeSet, gradeClasses, targetHours, options, row.subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys);
    const hours = calculateCodesHours(classCodes, row.subject, subjectPools);
    const score = scoreCandidate(gradeSet, classCodes, hours, targetHours, gradeClasses, options, row.subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys);
    if (!best || score > best.score) best = { gradeSet, classCodes, hours, score };
  }
  const classCodes = best?.classCodes?.length ? best.classCodes : [];
  const hours = best?.hours || 0;
  const grades = [...new Set(classCodes.map((code) => Number(code.split('-')[0])))].sort((a, b) => a - b);
  const warnings = [];
  if (hours !== targetHours) warnings.push(`목표 ${targetHours}시간 / 추천 ${hours}시간`);
  if (grades.length >= 3) warnings.push('3개 학년 이상 혼합 배정');
  if (grades.length === 2 && Math.abs(grades[0] - grades[1]) > 1) warnings.push('인접하지 않은 학년 혼합');
  if (targetHours > 0 && hours === 0) warnings.push('동일 과목 기준으로 배정 가능한 학급 없음');
  return { classCodes, hours, grades, warnings };
}

function buildExplicitGradeSets(grades) {
  const unique = [...new Set(grades.map(Number))].sort((a, b) => a - b);
  return unique.length ? [unique] : [];
}

function buildBalancedGradeSets(allowedGrades, gradeClasses, targetHours, options, subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys = new Set()) {
  const existing = allowedGrades.filter((grade) => getGradeClassCount(gradeClasses, grade) > 0);
  const single = existing.map((grade) => [grade]);
  const preferredPairs = [[1, 2], [3, 4], [5, 6]].map((pair) => pair.filter((grade) => existing.includes(grade))).filter((pair) => pair.length === 2);
  const adjacentPairs = [[2, 3], [4, 5]].map((pair) => pair.filter((grade) => existing.includes(grade))).filter((pair) => pair.length === 2);
  const triples = buildNeighborTriples(existing);
  const full = existing.length >= 4 ? [existing] : [];
  const candidates = [...single, ...preferredPairs, ...adjacentPairs, ...triples, ...full];
  return candidates.map((grades) => [...new Set(grades)].sort((a, b) => a - b)).filter((grades, index, arr) => grades.length && arr.findIndex((other) => other.join(',') === grades.join(',')) === index).filter((grades) => countAvailableClasses(grades, gradeClasses, subject, occupiedSubjectClassKeys) > 0).sort((a, b) => scoreGradeSetShape(b, targetHours, gradeClasses, options, subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys) - scoreGradeSetShape(a, targetHours, gradeClasses, options, subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys));
}

function buildNeighborTriples(existing) {
  const triples = [];
  for (let grade = 1; grade <= 4; grade += 1) {
    const group = [grade, grade + 1, grade + 2];
    if (group.every((item) => existing.includes(item))) triples.push(group);
  }
  return triples;
}

function scoreGradeSetShape(grades, targetHours, gradeClasses, options, subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys = new Set()) {
  let score = 0;
  const capacity = grades.reduce((sum, grade) => sum + makeGradeClassCodes(gradeClasses, grade).filter((code) => !occupiedSubjectClassKeys.has(makeSubjectClassKey(subject, code))).length * getSubjectGradeHour(subject, grade, subjectPools), 0);
  const shortage = Math.max(0, targetHours - capacity);
  const overage = Math.max(0, capacity - targetHours);
  if (grades.length === 1) score += 1200;
  if (grades.length === 2 && isPreferredPair(grades)) score += 850;
  else if (grades.length === 2 && isAdjacentPair(grades)) score += 650;
  if (grades.length >= 3) score -= 500 * grades.length;
  if (capacity >= targetHours) score += 350;
  score -= shortage * 260;
  score -= overage * 4;
  score -= Math.abs(capacity - targetHours) * 8;
  score -= usagePenalty(grades, subject, subjectGradeUsage);
  score -= mixedHourPenalty(grades, subject, subjectPools);
  if (options.lowGradeMoreHours) score += grades.reduce((sum, grade) => sum + (7 - grade) * 5, 0);
  return score;
}

function selectClassesFromGradeSet(grades, gradeClasses, targetHours, options, subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys = new Set()) {
  if (!targetHours) return [];
  const available = makeAvailableClassItems(grades, gradeClasses, subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys);
  if (!available.length) return [];
  if (grades.length === 1) return selectGreedyClosest(available, targetHours, subject, subjectPools);
  const selected = [];
  while (selected.length < available.length && calculateCodesHours(selected.map((item) => item.code), subject, subjectPools) < targetHours) {
    const currentHours = calculateCodesHours(selected.map((item) => item.code), subject, subjectPools);
    const currentGradeCounts = countSelectedByGrade(selected);
    const next = available.filter((item) => !selected.some((selectedItem) => selectedItem.code === item.code)).map((item) => ({ item, score: scoreNextClassItem(item, selected, currentHours, currentGradeCounts, targetHours, grades, subject, subjectPools) })).sort((a, b) => b.score - a.score)[0]?.item;
    if (!next) break;
    selected.push(next);
  }
  return selected.map((item) => item.code);
}

function makeAvailableClassItems(grades, gradeClasses, subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys = new Set()) {
  return grades.flatMap((grade) => {
    const hour = getSubjectGradeHour(subject, grade, subjectPools);
    const usage = subjectGradeUsage.get(`${subject}__${grade}`) || 0;
    return makeGradeClassCodes(gradeClasses, grade).filter((code) => !occupiedSubjectClassKeys.has(makeSubjectClassKey(subject, code))).map((code) => ({ code, grade, hour, usage }));
  }).sort((a, b) => {
    if (a.usage !== b.usage) return a.usage - b.usage;
    if (a.grade !== b.grade) return a.grade - b.grade;
    return a.code.localeCompare(b.code, 'ko');
  });
}

function selectGreedyClosest(available, targetHours, subject, subjectPools) {
  const selected = [];
  for (const item of available) {
    const before = calculateCodesHours(selected.map((selectedItem) => selectedItem.code), subject, subjectPools);
    if (before >= targetHours) break;
    selected.push(item);
    if (before + item.hour >= targetHours) break;
  }
  return selected.map((item) => item.code);
}

function scoreNextClassItem(item, selected, currentHours, currentGradeCounts, targetHours, grades, subject, subjectPools) {
  const afterHours = currentHours + item.hour;
  const beforeGap = Math.abs(targetHours - currentHours);
  const afterGap = Math.abs(targetHours - afterHours);
  const nextCounts = { ...currentGradeCounts, [item.grade]: (currentGradeCounts[item.grade] || 0) + 1 };
  const balancePenalty = getGradeBalancePenalty(nextCounts, grades);
  const fillScore = beforeGap - afterGap;
  const avoidOvershoot = afterHours > targetHours ? (afterHours - targetHours) * 30 : 0;
  const usagePenaltyValue = item.usage * 4;
  const sameHourBonus = getSameHourBonus(item.grade, grades, subject, subjectPools);
  return fillScore * 100 - balancePenalty * 25 - avoidOvershoot - usagePenaltyValue + sameHourBonus;
}

function countSelectedByGrade(selected) {
  return selected.reduce((map, item) => {
    map[item.grade] = (map[item.grade] || 0) + 1;
    return map;
  }, {});
}

function getGradeBalancePenalty(counts, grades) {
  const values = grades.map((grade) => counts[grade] || 0);
  return Math.max(...values) - Math.min(...values);
}

function getSameHourBonus(grade, grades, subject, subjectPools) {
  const hour = getSubjectGradeHour(subject, grade, subjectPools);
  const sameCount = grades.filter((item) => getSubjectGradeHour(subject, item, subjectPools) === hour).length;
  return sameCount > 1 ? 20 : 0;
}

function scoreCandidate(grades, classCodes, hours, targetHours, gradeClasses, options, subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys = new Set()) {
  let score = scoreGradeSetShape(grades, targetHours, gradeClasses, options, subject, subjectGradeUsage, subjectPools, occupiedSubjectClassKeys);
  const selectedGrades = [...new Set((classCodes || []).map((code) => Number(String(code).split('-')[0])))];
  const gradeCounts = countClassCodesByGrade(classCodes);
  score += Math.min(hours, targetHours) * 12;
  score += hours === targetHours ? 600 : 0;
  score -= hours < targetHours ? (targetHours - hours) * 520 : 0;
  score -= hours > targetHours ? (hours - targetHours) * 360 : 0;
  score -= selectedGrades.length >= 2 ? getGradeBalancePenalty(gradeCounts, selectedGrades) * 45 : 0;
  if (selectedGrades.length >= 3) score -= selectedGrades.length * 400;
  return score;
}

function countClassCodesByGrade(classCodes = []) {
  return classCodes.reduce((map, code) => {
    const grade = Number(String(code).split('-')[0]);
    map[grade] = (map[grade] || 0) + 1;
    return map;
  }, {});
}

function usagePenalty(grades, subject, subjectGradeUsage) {
  return grades.reduce((sum, grade) => sum + (subjectGradeUsage.get(`${subject}__${grade}`) || 0) * 20, 0);
}

function mixedHourPenalty(grades, subject, subjectPools) {
  const hours = [...new Set(grades.map((grade) => getSubjectGradeHour(subject, grade, subjectPools)))];
  return hours.length > 1 ? (hours.length - 1) * 60 : 0;
}

function normalizeGradeClasses(items) {
  return [1, 2, 3, 4, 5, 6].map((grade) => ({ grade, classCount: Number((items || []).find((i) => Number(i.grade) === grade)?.classCount || 0) }));
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
  return (classCodes || []).reduce((sum, code) => sum + getSubjectGradeHour(subject, Number(String(code).split('-')[0]), subjectPools), 0);
}

function calculateSubjectTotalHours(config, subjectPools) {
  const gradeClasses = normalizeGradeClasses(config.gradeClasses || []);
  return subjectPools.reduce((sum, pool) => sum + pool.grades.reduce((gradeSum, grade) => gradeSum + getGradeClassCount(gradeClasses, grade) * getSubjectGradeHour(pool.subject, grade, subjectPools), 0), 0);
}

function getGradeClassCount(gradeClasses, grade) {
  return Number(gradeClasses.find((item) => item.grade === grade)?.classCount || 0);
}

function countAvailableClasses(grades, gradeClasses, subject, occupiedSubjectClassKeys = new Set()) {
  return grades.reduce((sum, grade) => sum + makeGradeClassCodes(gradeClasses, grade).filter((code) => !occupiedSubjectClassKeys.has(makeSubjectClassKey(subject, code))).length, 0);
}

function makeSubjectClassKey(subject, classCode) {
  return `${String(subject || '').trim()}__${String(classCode || '').trim()}`;
}

function isPreferredPair(grades) {
  return ['1-2', '3-4', '5-6'].includes([...grades].sort((a, b) => a - b).join('-'));
}

function isAdjacentPair(grades) {
  const sorted = [...grades].sort((a, b) => a - b);
  return sorted.length === 2 && Math.abs(sorted[0] - sorted[1]) === 1;
}

function makeGradeClassCodes(gradeClasses, grade) {
  const count = getGradeClassCount(gradeClasses, grade);
  return Array.from({ length: count }, (_, index) => `${grade}-${index + 1}`);
}

function getExistingGrades(config = {}) {
  const grades = (config.gradeClasses || []).filter((item) => Number(item.classCount || 0) > 0).map((item) => Number(item.grade));
  return grades.length ? grades : [1, 2, 3, 4, 5, 6];
}
