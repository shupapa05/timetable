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
    weeklyHours: 1,
    fixedTargetHours: item.fixedTargetHours === undefined || item.fixedTargetHours === null ? '' : item.fixedTargetHours,
    preferredGrades: Array.isArray(item.preferredGrades) ? item.preferredGrades.map(Number).filter(Boolean) : [],
    assignedClasses: Array.isArray(item.assignedClasses) ? item.assignedClasses : []
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
          assignedClasses: item.assignedClasses || []
        }]
      : [];
    const assignments = normalizeTeacherAssignments(item.assignments || legacy, firstSubject);
    return {
      teacherCode: String(item.teacherCode || `전담${index + 1}`).trim(),
      teacherName: String(item.teacherName || item.teacherCode || `전담${index + 1}`).trim(),
      assignments: assignments.length ? assignments : [{ subject: firstSubject, weeklyHours: 1, fixedTargetHours: '', preferredGrades: [], assignedClasses: [] }]
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
        weeklyHours: 1,
        fixedTargetHours: assignment.fixedTargetHours ?? '',
        preferredGrades: assignment.preferredGrades || [],
        assignedClasses: assignment.assignedClasses || []
      });
    });
  });
  return rows;
}

export function getDefaultOptimizerSettings(config = {}) {
  const planningTeachers = makeInitialPlanningTeachers(config);
  const subjectPools = makeInitialSubjectPools(config, planningTeachers);
  return {
    teacherCount: planningTeachers.length || 0,
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
  const saved = config.optimizer || {};
  const subjectPools = normalizeSubjectPools(saved.subjectPools || base.subjectPools || []);
  const teacherCount = Number(saved.teacherCount || base.teacherCount || 0);
  return {
    ...base,
    ...saved,
    teacherCount,
    subjectPools,
    planningTeachers: normalizePlanningTeachers(saved.planningTeachers || base.planningTeachers || [], teacherCount, subjectPools),
    totalDedicatedHours: Number(saved.totalDedicatedHours || base.totalDedicatedHours || 0),
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
      assignedClasses: teacher.assignedClasses || []
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
  const fixedTotal = rows.reduce((sum, row) => sum + (row.isFixed ? row.targetHours : 0), 0);
  const autoRows = rows.filter((row) => !row.isFixed);
  const totalDedicatedHours = Number(inputSettings.totalDedicatedHours || calculateSubjectTotalHours(config, subjectPools) || fixedTotal + autoRows.length * 18);
  const remain = Math.max(0, totalDedicatedHours - fixedTotal);
  const base = autoRows.length ? Math.floor(remain / autoRows.length) : 0;
  const extra = autoRows.length ? remain % autoRows.length : 0;
  let autoIndex = 0;
  const gradeClasses = normalizeGradeClasses(config.gradeClasses || []);
  const subjectGradeUsage = new Map();

  const resultRows = rows.map((row) => {
    const targetHours = row.isFixed ? row.targetHours : base + (autoIndex++ < extra ? 1 : 0);
    const rec = recommend(row, targetHours, gradeClasses, subjectPools, options, subjectGradeUsage);
    rec.classCodes.forEach((code) => {
      const grade = Number(code.split('-')[0]);
      const key = `${row.subject}__${grade}`;
      subjectGradeUsage.set(key, (subjectGradeUsage.get(key) || 0) + getSubjectGradeHour(row.subject, grade, subjectPools));
    });
    return { ...row, targetHours, recommendedClasses: rec.classCodes, recommendedHours: rec.hours, grades: rec.grades, warnings: rec.warnings };
  });

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

function recommend(row, targetHours, gradeClasses, subjectPools, options = {}, subjectGradeUsage = new Map()) {
  const allowedGrades = getSubjectGrades(row.subject, subjectPools)
    .filter((grade) => getGradeClassCount(gradeClasses, grade) > 0);
  const explicitGrades = Array.isArray(row.preferredGrades) && row.preferredGrades.length
    ? row.preferredGrades.filter((grade) => allowedGrades.includes(Number(grade)))
    : [];

  const candidateGradeSets = explicitGrades.length
    ? buildExplicitGradeSets(explicitGrades)
    : buildBalancedGradeSets(allowedGrades, gradeClasses, targetHours, options, row.subject, subjectGradeUsage, subjectPools);

  let best = null;
  for (const gradeSet of candidateGradeSets) {
    const classCodes = selectClassesFromGradeSet(gradeSet, gradeClasses, targetHours, options, row.subject, subjectGradeUsage, subjectPools);
    const hours = calculateCodesHours(classCodes, row.subject, subjectPools);
    const score = scoreCandidate(gradeSet, classCodes, hours, targetHours, options, row.subject, subjectGradeUsage, subjectPools);
    if (!best || score > best.score) best = { gradeSet, classCodes, hours, score };
  }

  const classCodes = best?.classCodes?.length ? best.classCodes : [];
  const hours = best?.hours || 0;
  const grades = [...new Set(classCodes.map((code) => Number(code.split('-')[0])))].sort((a, b) => a - b);
  const warnings = [];
  if (hours !== targetHours) warnings.push(`목표 ${targetHours}시간 / 추천 ${hours}시간`);
  if (grades.length >= 3) warnings.push('3개 학년 이상 혼합 배정');
  if (grades.length === 2 && Math.abs(grades[0] - grades[1]) > 1) warnings.push('인접하지 않은 학년 혼합');
  return { classCodes, hours, grades, warnings };
}

function buildExplicitGradeSets(grades) {
  const unique = [...new Set(grades.map(Number))].sort((a, b) => a - b);
  return unique.length ? [unique] : [];
}

function buildBalancedGradeSets(allowedGrades, gradeClasses, targetHours, options, subject, subjectGradeUsage, subjectPools) {
  const existing = allowedGrades.filter((grade) => getGradeClassCount(gradeClasses, grade) > 0);
  const single = existing.map((grade) => [grade]);
  const preferredPairs = [[1, 2], [3, 4], [5, 6]]
    .map((pair) => pair.filter((grade) => existing.includes(grade)))
    .filter((pair) => pair.length === 2);
  const adjacentPairs = [[2, 3], [4, 5]]
    .map((pair) => pair.filter((grade) => existing.includes(grade)))
    .filter((pair) => pair.length === 2);
  const full = existing.length ? [existing] : [];

  const candidates = [...single, ...preferredPairs, ...adjacentPairs, ...full];
  return candidates
    .map((grades) => [...new Set(grades)].sort((a, b) => a - b))
    .filter((grades, index, arr) => grades.length && arr.findIndex((other) => other.join(',') === grades.join(',')) === index)
    .sort((a, b) => scoreGradeSetShape(b, targetHours, gradeClasses, options, subject, subjectGradeUsage, subjectPools) - scoreGradeSetShape(a, targetHours, gradeClasses, options, subject, subjectGradeUsage, subjectPools));
}

function scoreGradeSetShape(grades, targetHours, gradeClasses, options, subject, subjectGradeUsage, subjectPools) {
  let score = 0;
  const capacity = grades.reduce((sum, grade) => sum + getGradeClassCount(gradeClasses, grade) * getSubjectGradeHour(subject, grade, subjectPools), 0);
  const shortage = Math.max(0, targetHours - capacity);
  if (grades.length === 1) score += 1000;
  if (grades.length === 2 && isPreferredPair(grades)) score += 750;
  else if (grades.length === 2 && isAdjacentPair(grades)) score += 550;
  if (grades.length >= 3) score -= 350 * grades.length;
  score -= shortage * 200;
  score -= Math.abs(capacity - targetHours) * 6;
  score -= usagePenalty(grades, subject, subjectGradeUsage);
  if (options.lowGradeMoreHours) score += grades.reduce((sum, grade) => sum + (7 - grade) * 5, 0);
  return score;
}

function selectClassesFromGradeSet(grades, gradeClasses, targetHours, options, subject, subjectGradeUsage, subjectPools) {
  if (!targetHours) return [];
  const selected = [];
  const gradeOrder = orderGradesForSelection(grades, options, subject, subjectGradeUsage);
  for (const grade of gradeOrder) {
    const remaining = targetHours - calculateCodesHours(selected, subject, subjectPools);
    if (remaining <= 0) break;
    const codes = makeGradeClassCodes(gradeClasses, grade);
    for (const code of codes) {
      if (calculateCodesHours(selected, subject, subjectPools) >= targetHours) break;
      selected.push(code);
    }
  }
  return [...new Set(selected)];
}

function orderGradesForSelection(grades, options, subject, subjectGradeUsage) {
  return [...grades].sort((a, b) => {
    const usageA = subjectGradeUsage.get(`${subject}__${a}`) || 0;
    const usageB = subjectGradeUsage.get(`${subject}__${b}`) || 0;
    if (usageA !== usageB) return usageA - usageB;
    if (options.lowGradeMoreHours) return a - b;
    return a - b;
  });
}

function scoreCandidate(grades, classCodes, hours, targetHours, options, subject, subjectGradeUsage, subjectPools) {
  let score = scoreGradeSetShape(grades, targetHours, normalizeGradeClasses([]), options, subject, subjectGradeUsage, subjectPools);
  score += Math.min(hours, targetHours) * 10;
  score -= Math.abs(targetHours - hours) * 500;
  return score;
}

function usagePenalty(grades, subject, subjectGradeUsage) {
  return grades.reduce((sum, grade) => sum + (subjectGradeUsage.get(`${subject}__${grade}`) || 0) * 20, 0);
}

function normalizeGradeClasses(items) {
  return [1, 2, 3, 4, 5, 6].map((grade) => ({ grade, classCount: Number((items || []).find((i) => Number(i.grade) === grade)?.classCount || 0) }));
}

function getSubjectGrades(subject, subjectPools) {
  return subjectPools.find((pool) => pool.subject === subject)?.grades?.length ? subjectPools.find((pool) => pool.subject === subject).grades : [1, 2, 3, 4, 5, 6];
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
  return subjectPools.reduce((sum, pool) => {
    return sum + pool.grades.reduce((gradeSum, grade) => gradeSum + getGradeClassCount(gradeClasses, grade) * getSubjectGradeHour(pool.subject, grade, subjectPools), 0);
  }, 0);
}

function getGradeClassCount(gradeClasses, grade) {
  return Number(gradeClasses.find((item) => item.grade === grade)?.classCount || 0);
}

function isPreferredPair(grades) {
  const key = [...grades].sort((a, b) => a - b).join('-');
  return ['1-2', '3-4', '5-6'].includes(key);
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
