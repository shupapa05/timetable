export function getDefaultOptimizerSettings(config = {}) {
  const planningTeachers = makeInitialPlanningTeachers(config);
  const subjectPools = makeInitialSubjectPools(config, planningTeachers);
  const currentTotal = getCurrentDedicatedHours({ teachers: planningTeachers });
  return {
    teacherCount: planningTeachers.length || 0,
    totalDedicatedHours: currentTotal || 0,
    subjectPools,
    planningTeachers,
    teacherTargets: {},
    options: {
      singleSubjectPriority: true,
      sameGradePriority: true,
      adjacentGradePriority: true,
      balanceTeacherLoad: true,
      balanceHomeroomLoad: true,
      allowTwoSubjectMix: true,
      allowThreeSubjectMix: false
    }
  };
}

export function normalizeOptimizerSettings(config = {}) {
  const base = getDefaultOptimizerSettings(config);
  const saved = config.optimizer || {};
  const teacherCount = Number(saved.teacherCount || base.teacherCount || 0);
  const subjectPools = normalizeSubjectPools(saved.subjectPools || base.subjectPools || []);
  const savedPlanning = Array.isArray(saved.planningTeachers) ? saved.planningTeachers : base.planningTeachers;
  const planningTeachers = normalizePlanningTeachers(savedPlanning, teacherCount, subjectPools);

  return {
    ...base,
    ...saved,
    teacherCount,
    totalDedicatedHours: Number(saved.totalDedicatedHours || base.totalDedicatedHours || 0),
    subjectPools,
    planningTeachers,
    teacherTargets: {
      ...base.teacherTargets,
      ...(saved.teacherTargets || {})
    },
    options: {
      ...base.options,
      ...(saved.options || {})
    }
  };
}

export function makeInitialPlanningTeachers(config = {}) {
  const teachers = Array.isArray(config.teachers) ? config.teachers : [];
  if (teachers.length) {
    return teachers.map((teacher, index) => ({
      teacherCode: String(teacher.teacherCode || `전담${index + 1}`).trim(),
      teacherName: String(teacher.teacherName || teacher.teacherCode || `전담${index + 1}`).trim(),
      subject: String(teacher.subject || '').trim(),
      weeklyHours: Number(teacher.weeklyHours || teacher.perClassHours || 1),
      fixedTargetHours: '',
      preferredGrades: [],
      assignedClasses: Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : []
    }));
  }
  return [];
}

export function makeInitialSubjectPools(config = {}, planningTeachers = []) {
  const subjects = [...new Set((planningTeachers || []).map((teacher) => String(teacher.subject || '').trim()).filter(Boolean))];
  return subjects.map((subject) => ({ subject, grades: getExistingGrades(config) }));
}

export function normalizeSubjectPools(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      subject: String(item.subject || '').trim(),
      grades: Array.isArray(item.grades) ? item.grades.map(Number).filter((grade) => grade >= 1 && grade <= 6) : []
    }))
    .filter((item) => item.subject);
}

export function normalizePlanningTeachers(items = [], teacherCount = 0, subjectPools = []) {
  const count = Math.max(0, Number(teacherCount || items.length || 0));
  const firstSubject = subjectPools[0]?.subject || '';
  return Array.from({ length: count }, (_unused, index) => {
    const item = items[index] || {};
    return {
      teacherCode: String(item.teacherCode || `전담${index + 1}`).trim(),
      teacherName: String(item.teacherName || item.teacherCode || `전담${index + 1}`).trim(),
      subject: String(item.subject || firstSubject || '').trim(),
      weeklyHours: Math.max(1, Number(item.weeklyHours || 1)),
      fixedTargetHours: item.fixedTargetHours === undefined || item.fixedTargetHours === null ? '' : item.fixedTargetHours,
      preferredGrades: Array.isArray(item.preferredGrades) ? item.preferredGrades.map(Number).filter(Boolean) : [],
      assignedClasses: Array.isArray(item.assignedClasses) ? item.assignedClasses : []
    };
  });
}

export function getCurrentDedicatedHours(config = {}) {
  return (config.teachers || []).reduce((sum, teacher) => {
    const weeklyHours = Number(teacher.weeklyHours || teacher.perClassHours || 0);
    const classCount = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses.length : 0;
    return sum + weeklyHours * classCount;
  }, 0);
}

export function optimizeDedicatedAssignments(config = {}, inputSettings = {}) {
  const normalized = normalizeOptimizerSettings({
    ...config,
    optimizer: {
      ...(config.optimizer || {}),
      ...inputSettings
    }
  });

  const subjectPools = normalizeSubjectPools(inputSettings.subjectPools || normalized.subjectPools);
  const settings = {
    ...normalized,
    ...inputSettings,
    subjectPools,
    planningTeachers: normalizePlanningTeachers(
      inputSettings.planningTeachers || normalized.planningTeachers,
      inputSettings.teacherCount || normalized.teacherCount,
      subjectPools
    ),
    teacherTargets: {
      ...normalized.teacherTargets,
      ...(inputSettings.teacherTargets || {})
    },
    options: {
      ...normalized.options,
      ...(inputSettings.options || {})
    }
  };

  const teachers = settings.planningTeachers
    .map((teacher, index) => makeTeacherCandidate(teacher, index, settings))
    .filter((teacher) => teacher.weeklyHours > 0);

  const gradeClasses = normalizeGradeClasses(config.gradeClasses || []);
  const totalDedicatedHours = Number(settings.totalDedicatedHours || 0);
  const fixedTotal = teachers.reduce((sum, teacher) => teacher.isFixed ? sum + teacher.targetHours : sum, 0);
  const autoTeachers = teachers.filter((teacher) => !teacher.isFixed);
  const remainingHours = Math.max(0, totalDedicatedHours - fixedTotal);
  const autoBase = autoTeachers.length ? Math.floor(remainingHours / autoTeachers.length) : 0;
  const autoRemainder = autoTeachers.length ? remainingHours % autoTeachers.length : 0;

  let autoIndex = 0;
  const rows = teachers.map((teacher) => {
    const targetHours = teacher.isFixed
      ? teacher.targetHours
      : autoBase + (autoIndex++ < autoRemainder ? 1 : 0);
    const recommended = recommendClassesForTeacher({
      ...teacher,
      targetHours
    }, gradeClasses, settings.options, subjectPools);

    return {
      ...teacher,
      targetHours,
      recommendedClasses: recommended.classCodes,
      recommendedHours: recommended.classCodes.length * teacher.weeklyHours,
      grades: recommended.grades,
      warnings: recommended.warnings
    };
  });

  return {
    totalDedicatedHours,
    fixedTotal,
    remainingHours,
    autoTeacherCount: autoTeachers.length,
    rows,
    summary: makeSummary(rows, gradeClasses, totalDedicatedHours)
  };
}

function makeTeacherCandidate(teacher, index, settings) {
  const rowId = getTeacherRowId(teacher, index);
  const rawTarget = teacher.fixedTargetHours !== '' && teacher.fixedTargetHours !== undefined && teacher.fixedTargetHours !== null
    ? teacher.fixedTargetHours
    : settings.teacherTargets[rowId];
  const targetHours = rawTarget === '' || rawTarget === null || rawTarget === undefined
    ? 0
    : Number(rawTarget || 0);

  return {
    rowId,
    index,
    teacherCode: String(teacher.teacherCode || `전담${index + 1}`).trim(),
    teacherName: String(teacher.teacherName || teacher.teacherCode || `전담${index + 1}`).trim(),
    subject: String(teacher.subject || '').trim() || '미정',
    weeklyHours: Number(teacher.weeklyHours || teacher.perClassHours || 1),
    currentClasses: Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : [],
    preferredGrades: Array.isArray(teacher.preferredGrades) ? teacher.preferredGrades : [],
    isFixed: targetHours > 0,
    targetHours
  };
}

export function getTeacherRowId(teacher, index) {
  const teacherCode = String(teacher?.teacherCode || `전담${index + 1}`).trim();
  const subject = String(teacher?.subject || '미정').trim() || '미정';
  return `${index}__${teacherCode}__${subject}`;
}

function normalizeGradeClasses(items) {
  const map = new Map();
  for (let grade = 1; grade <= 6; grade += 1) map.set(grade, 0);
  (items || []).forEach((item) => {
    const grade = Number(item.grade || 0);
    if (grade >= 1 && grade <= 6) {
      map.set(grade, Math.max(0, Number(item.classCount || 0)));
    }
  });
  return [...map.entries()].map(([grade, classCount]) => ({ grade, classCount }));
}

function makeAllClassCodes(gradeClasses, allowedGrades = null) {
  const allow = Array.isArray(allowedGrades) && allowedGrades.length ? new Set(allowedGrades.map(Number)) : null;
  return gradeClasses.flatMap((item) => {
    if (allow && !allow.has(Number(item.grade))) return [];
    return Array.from({ length: Number(item.classCount || 0) }, (_unused, index) => `${item.grade}-${index + 1}`);
  });
}

function recommendClassesForTeacher(teacher, gradeClasses, options = {}, subjectPools = []) {
  const warnings = [];
  const subjectGrades = getSubjectGrades(teacher.subject, subjectPools);
  const targetClassCount = teacher.weeklyHours > 0
    ? Math.max(0, Math.round(teacher.targetHours / teacher.weeklyHours))
    : 0;
  const classCodes = makeAllClassCodes(gradeClasses, subjectGrades);

  if (!targetClassCount || !classCodes.length) {
    return { classCodes: [], grades: [], warnings: ['추천할 학급이 없습니다.'] };
  }

  const preferredGrades = getPreferredGrades(teacher, gradeClasses, subjectGrades);
  const selected = [];

  for (const grade of preferredGrades) {
    const gradeClassCodes = makeGradeClassCodes(gradeClasses, grade);
    if (!gradeClassCodes.length) continue;

    const remaining = targetClassCount - selected.length;
    if (remaining <= 0) break;

    if (options.sameGradePriority !== false && gradeClassCodes.length <= remaining) {
      selected.push(...gradeClassCodes);
    } else if (selected.length === 0) {
      selected.push(...gradeClassCodes.slice(0, remaining));
      if (gradeClassCodes.length > remaining) warnings.push(`${grade}학년 일부 학급만 배정됨`);
    }
  }

  if (selected.length < targetClassCount) {
    for (const code of classCodes) {
      if (selected.includes(code)) continue;
      selected.push(code);
      if (selected.length >= targetClassCount) break;
    }
  }

  const unique = [...new Set(selected)].slice(0, targetClassCount);
  const grades = [...new Set(unique.map((code) => Number(String(code).split('-')[0])))].filter(Boolean).sort((a, b) => a - b);

  if (grades.length >= 3) warnings.push('3개 학년 이상 혼합 배정');
  if (grades.length === 2 && Math.abs(grades[0] - grades[1]) > 1) warnings.push('인접하지 않은 학년 혼합');
  if (teacher.subject === '미정') warnings.push('과목 미입력');

  const recommendedHours = unique.length * teacher.weeklyHours;
  if (recommendedHours !== teacher.targetHours) {
    warnings.push(`목표 ${teacher.targetHours}시간 / 추천 ${recommendedHours}시간`);
  }

  return { classCodes: unique, grades, warnings };
}

function getSubjectGrades(subject, subjectPools) {
  const found = subjectPools.find((item) => item.subject === subject);
  return found?.grades?.length ? found.grades : [1, 2, 3, 4, 5, 6];
}

function getPreferredGrades(teacher, gradeClasses, allowedGrades = null) {
  const allow = Array.isArray(allowedGrades) && allowedGrades.length ? new Set(allowedGrades.map(Number)) : null;
  const filterAllowed = (grades) => grades.filter((grade) => !allow || allow.has(Number(grade)));
  const explicitGrades = Array.isArray(teacher.preferredGrades) ? filterAllowed(teacher.preferredGrades.filter(Boolean)) : [];
  if (explicitGrades.length) return explicitGrades.concat(filterAllowed([1, 2, 3, 4, 5, 6]).filter((grade) => !explicitGrades.includes(grade)));

  const currentGrades = filterAllowed([...new Set((teacher.currentClasses || [])
    .map((code) => Number(String(code).split('-')[0]))
    .filter(Boolean))]);

  if (currentGrades.length) return currentGrades.concat(filterAllowed([1, 2, 3, 4, 5, 6]).filter((grade) => !currentGrades.includes(grade)));

  const existingGrades = filterAllowed(gradeClasses.filter((item) => item.classCount > 0).map((item) => item.grade));
  const commonOrder = [5, 6, 3, 4, 1, 2];
  return commonOrder.filter((grade) => existingGrades.includes(grade))
    .concat(existingGrades.filter((grade) => !commonOrder.includes(grade)));
}

function makeGradeClassCodes(gradeClasses, grade) {
  const item = gradeClasses.find((entry) => entry.grade === grade);
  const count = Number(item?.classCount || 0);
  return Array.from({ length: count }, (_unused, index) => `${grade}-${index + 1}`);
}

function getExistingGrades(config = {}) {
  const grades = (config.gradeClasses || []).filter((item) => Number(item.classCount || 0) > 0).map((item) => Number(item.grade));
  return grades.length ? grades : [1, 2, 3, 4, 5, 6];
}

function makeSummary(rows, gradeClasses, totalDedicatedHours) {
  const recommendedTotal = rows.reduce((sum, row) => sum + Number(row.recommendedHours || 0), 0);
  const byGrade = new Map(gradeClasses.map((item) => [item.grade, 0]));

  rows.forEach((row) => {
    row.recommendedClasses.forEach((classCode) => {
      const grade = Number(String(classCode).split('-')[0]);
      byGrade.set(grade, (byGrade.get(grade) || 0) + row.weeklyHours);
    });
  });

  return {
    recommendedTotal,
    gap: recommendedTotal - totalDedicatedHours,
    byGrade: [...byGrade.entries()].map(([grade, hours]) => ({ grade, hours }))
  };
}
