export function getDefaultOptimizerSettings(config = {}) {
  const currentTotal = getCurrentDedicatedHours(config);
  return {
    totalDedicatedHours: currentTotal || 0,
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
  return {
    ...base,
    ...saved,
    totalDedicatedHours: Number(saved.totalDedicatedHours || base.totalDedicatedHours || 0),
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

export function getCurrentDedicatedHours(config = {}) {
  return (config.teachers || []).reduce((sum, teacher) => {
    const weeklyHours = Number(teacher.weeklyHours || teacher.perClassHours || 0);
    const classCount = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses.length : 0;
    return sum + weeklyHours * classCount;
  }, 0);
}

export function optimizeDedicatedAssignments(config = {}, inputSettings = {}) {
  const settings = {
    ...normalizeOptimizerSettings(config),
    ...inputSettings,
    teacherTargets: {
      ...normalizeOptimizerSettings(config).teacherTargets,
      ...(inputSettings.teacherTargets || {})
    },
    options: {
      ...normalizeOptimizerSettings(config).options,
      ...(inputSettings.options || {})
    }
  };

  const teachers = (config.teachers || [])
    .map((teacher, index) => makeTeacherCandidate(teacher, index, settings))
    .filter((teacher) => teacher.subject && teacher.weeklyHours > 0);

  const gradeClasses = normalizeGradeClasses(config.gradeClasses || []);
  const classCodes = makeAllClassCodes(gradeClasses);
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
    }, gradeClasses, classCodes, settings.options);

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
  const rawTarget = settings.teacherTargets[rowId];
  const targetHours = rawTarget === '' || rawTarget === null || rawTarget === undefined
    ? 0
    : Number(rawTarget || 0);

  return {
    rowId,
    index,
    teacherCode: String(teacher.teacherCode || `전담${index + 1}`).trim(),
    teacherName: String(teacher.teacherName || teacher.teacherCode || `전담${index + 1}`).trim(),
    subject: String(teacher.subject || '').trim(),
    weeklyHours: Number(teacher.weeklyHours || teacher.perClassHours || 0),
    currentClasses: Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : [],
    isFixed: targetHours > 0,
    targetHours
  };
}

export function getTeacherRowId(teacher, index) {
  const teacherCode = String(teacher?.teacherCode || `전담${index + 1}`).trim();
  const subject = String(teacher?.subject || '과목').trim();
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

function makeAllClassCodes(gradeClasses) {
  return gradeClasses.flatMap((item) => {
    return Array.from({ length: Number(item.classCount || 0) }, (_unused, index) => `${item.grade}-${index + 1}`);
  });
}

function recommendClassesForTeacher(teacher, gradeClasses, classCodes, options = {}) {
  const warnings = [];
  const targetClassCount = teacher.weeklyHours > 0
    ? Math.max(0, Math.round(teacher.targetHours / teacher.weeklyHours))
    : 0;

  if (!targetClassCount || !classCodes.length) {
    return { classCodes: [], grades: [], warnings: ['추천할 학급이 없습니다.'] };
  }

  const preferredGrades = getPreferredGrades(teacher.currentClasses, gradeClasses);
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

  const recommendedHours = unique.length * teacher.weeklyHours;
  if (recommendedHours !== teacher.targetHours) {
    warnings.push(`목표 ${teacher.targetHours}시간 / 추천 ${recommendedHours}시간`);
  }

  return { classCodes: unique, grades, warnings };
}

function getPreferredGrades(currentClasses, gradeClasses) {
  const currentGrades = [...new Set((currentClasses || [])
    .map((code) => Number(String(code).split('-')[0]))
    .filter(Boolean))];

  if (currentGrades.length) return currentGrades.concat([1, 2, 3, 4, 5, 6].filter((grade) => !currentGrades.includes(grade)));

  const existingGrades = gradeClasses.filter((item) => item.classCount > 0).map((item) => item.grade);
  const commonOrder = [5, 6, 3, 4, 1, 2];
  return commonOrder.filter((grade) => existingGrades.includes(grade))
    .concat(existingGrades.filter((grade) => !commonOrder.includes(grade)));
}

function makeGradeClassCodes(gradeClasses, grade) {
  const item = gradeClasses.find((entry) => entry.grade === grade);
  const count = Number(item?.classCount || 0);
  return Array.from({ length: count }, (_unused, index) => `${grade}-${index + 1}`);
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
