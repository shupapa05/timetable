export function normalizeSubjectPools(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      subject: String(item.subject || '').trim(),
      grades: Array.isArray(item.grades) ? item.grades.map(Number).filter((g) => g >= 1 && g <= 6) : []
    }))
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
    options: { sameGradePriority: true }
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
  return subjects.map((subject) => ({ subject, grades }));
}

export function getCurrentDedicatedHours(config = {}) {
  return (config.teachers || []).reduce((sum, row) => sum + Number(row.weeklyHours || 1) * (row.assignedClasses || []).length, 0);
}

export function optimizeDedicatedAssignments(config = {}, inputSettings = {}) {
  const subjectPools = normalizeSubjectPools(inputSettings.subjectPools || []);
  const planningTeachers = normalizePlanningTeachers(inputSettings.planningTeachers || [], inputSettings.teacherCount || 0, subjectPools);
  const rows = flattenPlanningTeachers(planningTeachers).map((row, index) => makeRow(row, index));
  const fixedTotal = rows.reduce((sum, row) => sum + (row.isFixed ? row.targetHours : 0), 0);
  const autoRows = rows.filter((row) => !row.isFixed);
  const totalDedicatedHours = Number(inputSettings.totalDedicatedHours || fixedTotal + autoRows.length * 18);
  const remain = Math.max(0, totalDedicatedHours - fixedTotal);
  const base = autoRows.length ? Math.floor(remain / autoRows.length) : 0;
  const extra = autoRows.length ? remain % autoRows.length : 0;
  let autoIndex = 0;
  const gradeClasses = normalizeGradeClasses(config.gradeClasses || []);

  const resultRows = rows.map((row) => {
    const targetHours = row.isFixed ? row.targetHours : base + (autoIndex++ < extra ? 1 : 0);
    const rec = recommend(row, targetHours, gradeClasses, subjectPools);
    return { ...row, targetHours, recommendedClasses: rec.classCodes, recommendedHours: rec.classCodes.length, grades: rec.grades, warnings: rec.warnings };
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

function recommend(row, targetHours, gradeClasses, subjectPools) {
  const allowedGrades = getSubjectGrades(row.subject, subjectPools);
  const preferred = row.preferredGrades?.length ? row.preferredGrades.filter((g) => allowedGrades.includes(g)) : preferredGradeOrder(allowedGrades, gradeClasses);
  const selected = [];
  for (const grade of preferred) {
    const codes = makeGradeClassCodes(gradeClasses, grade);
    const remain = targetHours - selected.length;
    if (remain <= 0) break;
    if (codes.length <= remain) selected.push(...codes);
    else if (!selected.length) selected.push(...codes.slice(0, remain));
  }
  for (const grade of allowedGrades) {
    for (const code of makeGradeClassCodes(gradeClasses, grade)) {
      if (selected.length >= targetHours) break;
      if (!selected.includes(code)) selected.push(code);
    }
  }
  const classCodes = [...new Set(selected)].slice(0, targetHours);
  const grades = [...new Set(classCodes.map((code) => Number(code.split('-')[0])))].sort((a, b) => a - b);
  const warnings = [];
  if (classCodes.length !== targetHours) warnings.push(`목표 ${targetHours}시간 / 추천 ${classCodes.length}시간`);
  if (grades.length >= 3) warnings.push('3개 학년 이상 혼합 배정');
  if (grades.length === 2 && Math.abs(grades[0] - grades[1]) > 1) warnings.push('인접하지 않은 학년 혼합');
  return { classCodes, grades, warnings };
}

function normalizeGradeClasses(items) {
  return [1, 2, 3, 4, 5, 6].map((grade) => ({ grade, classCount: Number((items || []).find((i) => Number(i.grade) === grade)?.classCount || 0) }));
}

function getSubjectGrades(subject, subjectPools) {
  return subjectPools.find((pool) => pool.subject === subject)?.grades?.length ? subjectPools.find((pool) => pool.subject === subject).grades : [1, 2, 3, 4, 5, 6];
}

function preferredGradeOrder(allowedGrades, gradeClasses) {
  const existing = gradeClasses.filter((item) => item.classCount > 0 && allowedGrades.includes(item.grade)).map((item) => item.grade);
  const order = [5, 6, 3, 4, 1, 2];
  return order.filter((g) => existing.includes(g)).concat(existing.filter((g) => !order.includes(g)));
}

function makeGradeClassCodes(gradeClasses, grade) {
  const count = Number(gradeClasses.find((item) => item.grade === grade)?.classCount || 0);
  return Array.from({ length: count }, (_, index) => `${grade}-${index + 1}`);
}

function getExistingGrades(config = {}) {
  const grades = (config.gradeClasses || []).filter((item) => Number(item.classCount || 0) > 0).map((item) => Number(item.grade));
  return grades.length ? grades : [1, 2, 3, 4, 5, 6];
}
