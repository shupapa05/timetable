export const DAYS = ['월', '화', '수', '목', '금'];
export const PERIODS = [1, 2, 3, 4, 5, 6];
export const MAX_TEACHERS = 20;

export function getDefaultConfig() {
  return {
    school: { maxPeriods: 6, name: '', year: new Date().getFullYear() },
    gradeClasses: [1, 2, 3, 4, 5, 6].map((grade) => ({ grade, classCount: 0 })),
    rooms: [
      { name: '과학실1', capacity: 1 },
      { name: '과학실2', capacity: 1 },
      { name: '영어실1', capacity: 1 },
      { name: '체육관', capacity: 1 }
    ],
    teachers: [
      {
        teacherCode: '전담1',
        teacherName: '전담1',
        subject: '과학',
        roomName: '과학실1',
        weeklyHours: 2,
        blockPattern: '1+1',
        assignedClasses: []
      }
    ],
    commonBlocks: [],
    teacherBlocks: [],
    roomBlocks: [],
    roomAssignments: [],
    lockedLessons: [],
    weeklySchedule: getDefaultWeeklySchedule(),
    viewOptions: { colorMode: 'subject', focusHighlight: false, theme: 'light' },
    rules: {
      lowerGradeMorningFirst: true,
      subjectFirst: true,
      sameGradeBlockDayFirst: true,
      sameSubjectDayFirst: true,
      separateGradeBlockAndSingleDay: true,
      dayWaveByTeacher: true,
      sameGradeFirst: true,
      classNumberOrder: true,
      balanceDays: true,
      maxDailyClassLoadEnabled: true,
      maxDailySameSubjectEnabled: true,
      useDoubleBlocks: true,
      scienceFirst: true,
      scienceSameGradeDayFirst: true,
      restrictSixthPeriod: false,
      sixthPeriodAllowedDays: ['화', '목'],
      roomAssignmentsFirst: false
    }
  };
}

export function normalizeConfig(config) {
  const base = getDefaultConfig();
  config = config || {};

  return {
    ...base,
    ...config,
    school: { ...base.school, ...(config.school || {}) },
    gradeClasses: Array.isArray(config.gradeClasses) ? config.gradeClasses : base.gradeClasses,
    rooms: Array.isArray(config.rooms) ? config.rooms : base.rooms,
    teachers: Array.isArray(config.teachers) ? config.teachers : base.teachers,
    commonBlocks: Array.isArray(config.commonBlocks) ? config.commonBlocks : [],
    teacherBlocks: Array.isArray(config.teacherBlocks) ? config.teacherBlocks : [],
    roomBlocks: Array.isArray(config.roomBlocks) ? config.roomBlocks : [],
    roomAssignments: Array.isArray(config.roomAssignments) ? config.roomAssignments : [],
    lockedLessons: Array.isArray(config.lockedLessons) ? config.lockedLessons : [],
    weeklySchedule: normalizeWeeklySchedule(config.weeklySchedule || base.weeklySchedule),
    viewOptions: { ...base.viewOptions, ...(config.viewOptions || {}) },
    rules: { ...base.rules, ...(config.rules || {}) }
  };
}

export function getDefaultWeeklySchedule() {
  return [
    { grade: 1, daily: [4, 5, 5, 5, 4] },
    { grade: 2, daily: [4, 5, 5, 5, 4] },
    { grade: 3, daily: [5, 6, 5, 5, 5] },
    { grade: 4, daily: [5, 6, 5, 5, 5] },
    { grade: 5, daily: [6, 6, 5, 6, 6] },
    { grade: 6, daily: [6, 6, 5, 6, 6] }
  ];
}

function normalizeWeeklySchedule(schedule) {
  const defaults = getDefaultWeeklySchedule();
  const input = Array.isArray(schedule) ? schedule : [];

  return defaults.map((defaultItem) => {
    const found = input.find((item) => Number(item.grade) === defaultItem.grade);
    const daily = Array.isArray(found?.daily) ? found.daily : defaultItem.daily;
    return {
      grade: defaultItem.grade,
      daily: DAYS.map((_day, index) => Math.max(0, Math.min(6, Number(daily[index] ?? defaultItem.daily[index]))))
    };
  });
}

const TIMETABLE_VARIANTS = [
  { name: '균형형', dayOffset: 0, periodOrder: [1, 2, 3, 4, 5, 6], blockStarts: [1, 3, 5] },
  { name: '화요일 우선형', dayOffset: 1, periodOrder: [1, 2, 3, 4, 5, 6], blockStarts: [1, 3, 5] },
  { name: '오전 밀집형', dayOffset: 0, periodOrder: [1, 2, 3, 4, 5, 6], blockStarts: [1, 3, 5] },
  { name: '후반 요일 우선형', dayOffset: 3, reverseDays: true, periodOrder: [1, 2, 3, 4, 5, 6], blockStarts: [1, 3, 5] },
  { name: '분산 보강형', dayOffset: 4, periodOrder: [2, 1, 4, 3, 5, 6], blockStarts: [1, 3, 5] }
];

export function buildTimetable(config, options = {}) {
  config = normalizeConfig(config);
  config._variant = options.variant || config._variant || {};
  validateConfig(config);

  const grid = makeEmptyTeacherGrid(config);
  const unplacedLessons = [];
  const fixedRoomState = hasFixedRoomAssignments(config)
    ? buildFixedRoomAssignmentState(config, unplacedLessons)
    : null;
  config._fixedRoomState = fixedRoomState;
  const lessons = createLessons(config);
  const grouped = groupBy(lessons, (lesson) => lesson.teacher);
  const lockedCounts = applyLockedLessons(grid, config, unplacedLessons);

  if (config.rules?.dayWaveByTeacher === false) {
    Object.keys(grouped)
      .sort(compareTeacherCode)
      .forEach((teacherCode) => {
        const split = splitLessonsByType(grouped[teacherCode], config.rules, config);
        consumeLockedUnits(split.blocks, 2, lockedCounts).forEach((lesson) => {
          if (!placeBlock(grid, config, lesson)) {
            unplacedLessons.push(makeUnplaced(lesson, '2시간 블록', '가능한 연속 시간이 없습니다.'));
          }
        });
        consumeLockedUnits(split.singles, 1, lockedCounts).forEach((lesson) => {
          if (!placeSingle(grid, config, lesson)) {
            unplacedLessons.push(makeUnplaced(lesson, '1시간 단일', '가능한 시간이 없습니다.'));
          }
        });
      });
  } else {
    placeLessonsByDayWave(grid, config, grouped, lockedCounts, unplacedLessons);
  }

  if (config.rules?.separateGradeBlockAndSingleDay !== false) {
    optimizeSingleDaySeparation(grid, config);
  }
  optimizeTeacherPreferredDayCoverage(grid, config, [0, 1]);
  optimizeNonScienceLateSingles(grid, config);

  const roomTimetable = buildRoomTimetable(config, grid, unplacedLessons, fixedRoomState);

  const result = {
    days: DAYS,
    periods: PERIODS,
    teachers: makeTeacherView(config, grid),
    rooms: roomTimetable,
    lessons,
    unplacedLessons,
    warnings: validateResult(grid)
  };

  result.classTimetables = makeClassTimetables(config, result.teachers);
  result.classHourSummaries = makeClassHourSummaries(config, result.classTimetables);
  result.teacherLoadSummaries = makeTeacherLoadSummaries(result.teachers);
  result.warnings = result.warnings.concat(makeClassLoadWarnings(result.classHourSummaries));
  result.metrics = makeResultMetrics(result, config);
  return result;
}

export function buildTimetableCandidates(config, count = 3) {
  const attempts = [
    { label: '기본', rules: {} },
    { label: '학년집중 완화', rules: { sameGradeFirst: false } },
    { label: '반번호 순서 완화', rules: { classNumberOrder: false } }
  ];
  const results = makeCandidatesFromAttempts(config, attempts, Math.max(3, count));
  return results.length ? results : [{
    id: 'candidate-1',
    name: '기본형',
    summary: '기본 시간표 작성 결과',
    result: buildTimetable(config)
  }];
}

export function buildRecoveryCandidates(config, count = 3) {
  const attempts = [
    { label: '하루 3시간 제한 완화', rules: { maxDailyClassLoadEnabled: false } },
    { label: '같은 과목 2시간 제한 완화', rules: { maxDailySameSubjectEnabled: false } },
    { label: '저학년 오후 허용', rules: { lowerGradeMorningFirst: false } },
    {
      label: '강화 재시도',
      rules: {
        maxDailyClassLoadEnabled: false,
        maxDailySameSubjectEnabled: false,
        lowerGradeMorningFirst: false
      }
    }
  ];

  return makeCandidatesFromAttempts(config, attempts, count);
}

export function inspectConfig(config) {
  config = normalizeConfig(config);

  const issues = [];
  const gradeClassMap = new Map((config.gradeClasses || []).map((item) => [Number(item.grade), Number(item.classCount || 0)]));
  const roomNames = new Set((config.rooms || []).map((room) => String(room.name || '').trim()).filter(Boolean));
  const subjectClassOwner = {};

  if (!(config.gradeClasses || []).some((item) => Number(item.classCount || 0) > 0)) {
    issues.push({ type: 'CONFIG', message: '학급 수가 입력된 학년이 없습니다.' });
  }

  (config.teachers || []).forEach((teacher) => {
    const teacherCode = String(teacher.teacherCode || '').trim();
    const subject = String(teacher.subject || '').trim();
    const roomName = String(teacher.roomName || '').trim();
    const weeklyHours = Number(teacher.weeklyHours || 0);
    const hasRoomHoursInput = teacher.roomHours !== undefined && teacher.roomHours !== null && teacher.roomHours !== '';
    const rawRoomHours = hasRoomHoursInput ? Number(teacher.roomHours || 0) : (roomName ? weeklyHours : 0);
    const assignedClasses = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : [];

    if (!teacherCode) issues.push({ type: 'CONFIG', message: '전담번호가 비어 있는 배정이 있습니다.' });
    if (!subject) issues.push({ type: 'CONFIG', message: `${teacherCode || '전담'} 배정에 과목이 비어 있습니다.` });
    if (weeklyHours <= 0) issues.push({ type: 'CONFIG', message: `${teacherCode || '전담'} ${subject || ''}의 시수가 올바르지 않습니다.` });
    if (roomName && !roomNames.has(roomName)) issues.push({ type: 'CONFIG', message: `${teacherCode} ${subject}의 특별실 "${roomName}"이 특별실 목록에 없습니다.` });
    if (roomName && rawRoomHours > weeklyHours) issues.push({ type: 'CONFIG', message: `${teacherCode} ${subject}의 특별실 시수가 총 시수를 초과합니다.` });
    if (roomName && rawRoomHours < 0) issues.push({ type: 'CONFIG', message: `${teacherCode} ${subject}의 특별실 시수는 0 이상이어야 합니다.` });
    if (!roomName && rawRoomHours > 0) issues.push({ type: 'CONFIG', message: `${teacherCode} ${subject}의 특별실 시수를 사용하려면 특별실을 선택해야 합니다.` });
    if (!assignedClasses.length) issues.push({ type: 'CONFIG', message: `${teacherCode || '전담'} ${subject || ''}에 선택된 학급이 없습니다.` });

    assignedClasses.forEach((classCode) => {
      const parsed = parseClassCode(classCode);
      const classCount = gradeClassMap.get(parsed.grade) || 0;
      if (!parsed.ok || parsed.classNo > classCount) {
        issues.push({ type: 'CONFIG', message: `${teacherCode} ${subject}의 ${classCode}은 학급 수 설정과 맞지 않습니다.` });
      }

      const key = `${subject}|${classCode}`;
      if (subjectClassOwner[key] && subjectClassOwner[key] !== teacherCode) {
        issues.push({ type: 'CONFIG', message: `${subject} ${classCode}이 여러 전담에게 중복 배정되었습니다.` });
      }
      subjectClassOwner[key] = teacherCode;
    });

    if (!isBlockPatternValid(teacher.blockPattern, weeklyHours)) {
      issues.push({ type: 'CONFIG', message: `${teacherCode} ${subject}의 수업형태와 시수가 맞지 않아 자동형태로 처리됩니다.` });
    }
  });

  (config.roomAssignments || []).forEach((assignment) => {
    const roomName = String(assignment.roomName || '').trim();
    if (roomName && !roomNames.has(roomName)) {
      issues.push({ type: 'CONFIG', message: `특별실 배정의 "${roomName}"이 특별실 목록에 없습니다.` });
    }

    (assignment.items || []).forEach((item) => {
      const hours = Number(item.hours || 0);
      const grade = Number(item.grade || 0);
      const hoursMode = String(item.hoursMode || 'perClass') === 'perGrade' ? 'perGrade' : 'perClass';

      if (hours <= 0) {
        issues.push({ type: 'CONFIG', message: `${roomName} 특별실 배정의 ${grade}학년 시수가 올바르지 않습니다.` });
      }

      if (hoursMode === 'perGrade' && (gradeClassMap.get(grade) || 0) <= 0) {
        issues.push({ type: 'CONFIG', message: `${roomName} 특별실 배정의 ${grade}학년은 학급 수가 0입니다.` });
      }

      (item.classCodes || []).forEach((classCode) => {
        const parsed = parseClassCode(classCode);
        const classCount = gradeClassMap.get(parsed.grade) || 0;
        if (!parsed.ok || parsed.classNo > classCount) {
          issues.push({ type: 'CONFIG', message: `${roomName} 특별실 배정의 ${classCode}은 학급 수 설정과 맞지 않습니다.` });
        }
      });
    });
  });

  return dedupeIssues(issues);
}

function validateConfig(config) {
  if (!config.gradeClasses.some((item) => Number(item.classCount || 0) > 0)) {
    throw new Error('최소 1개 학년 이상의 학급 수를 입력해야 합니다.');
  }

  if (!config.teachers.some((teacher) => Array.isArray(teacher.assignedClasses) && teacher.assignedClasses.length)) {
    throw new Error('전담 배정에서 최소 1개 이상의 학년반을 선택해야 합니다.');
  }
}

function makeEmptyTeacherGrid(config) {
  const result = {};
  getTeacherCodes(config).forEach((teacherCode) => {
    result[teacherCode] = PERIODS.map(() => DAYS.map(() => null));
  });

  config.commonBlocks.forEach((block) => {
    const dayIndex = DAYS.indexOf(block.day);
    const period = Number(block.period || 0);
    if (dayIndex < 0 || period < 1 || period > 6) return;
    Object.keys(result).forEach((teacherCode) => {
      result[teacherCode][period - 1][dayIndex] = { blocked: true, value: '금지' };
    });
  });

  config.teacherBlocks.forEach((block) => {
    const teacherCode = String(block.teacherCode || '').trim();
    const dayIndex = DAYS.indexOf(block.day);
    const period = Number(block.period || 0);
    if (!result[teacherCode] || dayIndex < 0 || period < 1 || period > 6) return;
    result[teacherCode][period - 1][dayIndex] = { blocked: true, value: '금지' };
  });

  return result;
}

function getTeacherCodes(config) {
  const codes = config.teachers
    .map((teacher, index) => teacher.teacherCode || teacher.teacherName || `전담${index + 1}`)
    .filter(Boolean);
  return [...new Set(codes)].sort(compareTeacherCode);
}

function createLessons(config) {
  const rows = [];
  const duplicateCheck = {};
  const gradeClassCountMap = new Map((config.gradeClasses || []).map((item) => [
    Number(item.grade),
    Number(item.classCount || 0)
  ]));

  config.teachers.forEach((teacher) => {
    const teacherCode = String(teacher.teacherCode || teacher.teacherName || '').trim();
    const subject = String(teacher.subject || '').trim();
    const roomName = String(teacher.roomName || '').trim();
    const weeklyHours = Number(teacher.weeklyHours || teacher.perClassHours || 0);
    const blockPattern = String(teacher.blockPattern || '').trim();
    const hasRoomHoursInput = teacher.roomHours !== undefined && teacher.roomHours !== null && teacher.roomHours !== '';
    const rawRoomHours = hasRoomHoursInput ? Number(teacher.roomHours || 0) : (roomName ? weeklyHours : 0);
    const roomHours = roomName ? Math.max(0, Math.min(weeklyHours, Math.round(rawRoomHours))) : 0;
    const classHours = Math.max(0, weeklyHours - roomHours);

    if (!teacherCode || !subject || weeklyHours <= 0) return;

    (teacher.assignedClasses || []).forEach((classCode) => {
      const parsed = parseClassCode(classCode);
      if (!parsed.ok) throw new Error(`${teacherCode} / ${subject} 설정 오류: 반코드 "${classCode}"를 해석할 수 없습니다.`);

      const dupKey = `${subject}|${classCode}`;
      if (duplicateCheck[dupKey] && duplicateCheck[dupKey] !== teacherCode) {
        throw new Error(`중복 배정 오류: ${subject} ${classCode}이(가) 여러 전담에게 배정되어 있습니다.`);
      }
      duplicateCheck[dupKey] = teacherCode;

      if (roomHours > 0) {
        rows.push({
          teacher: teacherCode,
          subject,
          classCode,
          grade: parsed.grade,
          classNo: parsed.classNo,
          gradeClassCount: gradeClassCountMap.get(parsed.grade) || 0,
          gradePriority: config.rules?.sameGradeFirst ? (gradeClassCountMap.get(parsed.grade) || 0) : 0,
          count: roomHours,
          blockPattern,
          roomName,
          useRoom: true
        });
      }

      if (classHours > 0) {
        rows.push({
          teacher: teacherCode,
          subject,
          classCode,
          grade: parsed.grade,
          classNo: parsed.classNo,
          gradeClassCount: gradeClassCountMap.get(parsed.grade) || 0,
          gradePriority: config.rules?.sameGradeFirst ? (gradeClassCountMap.get(parsed.grade) || 0) : 0,
          count: classHours,
          blockPattern,
          roomName: '',
          useRoom: false
        });
      }
    });
  });

  return rows.sort((a, b) => compareLesson(a, b, config));
}

function splitLessonsByType(lessons, rules, config = null) {
  const blocks = [];
  const singles = [];

  lessons.forEach((lesson) => {
    const units = parseBlockPattern(lesson.blockPattern, lesson.count, rules.useDoubleBlocks);
    const hasBlockUnit = units.includes(2);
    const hasSingleUnit = units.includes(1);

    units.forEach((unit) => {
      const unitLesson = {
        ...lesson,
        preferDifferentGradeWithBlock: unit === 1 && hasBlockUnit,
        hasBlockSiblingUnit: hasBlockUnit,
        hasSingleSiblingUnit: hasSingleUnit
      };
      if (unit === 2) blocks.push(unitLesson);
      else singles.push(unitLesson);
    });
  });

  return {
    blocks: blocks.sort((a, b) => compareBlockLessonPriority(a, b, config)),
    singles: singles.sort((a, b) => compareLesson(a, b, config))
  };
}

function parseBlockPattern(pattern, weeklyHours, useDoubleBlocks) {
  let total = Number(weeklyHours || 0);
  if (total <= 0) return [];
  if (useDoubleBlocks === false) return Array.from({ length: total }, () => 1);

  const text = String(pattern || '').trim();
  if (text) {
    const parts = text.split('+').map((part) => Number(part.trim())).filter((value) => value === 1 || value === 2);
    const sum = parts.reduce((acc, cur) => acc + cur, 0);
    if (parts.length && sum === total) return parts;
  }

  const result = [];
  while (total >= 2) {
    result.push(2);
    total -= 2;
  }
  while (total >= 1) {
    result.push(1);
    total -= 1;
  }
  return result;
}

function placeLessonsByDayWave(grid, config, grouped, lockedCounts, unplacedLessons) {
  const teacherCodes = Object.keys(grouped).sort(compareTeacherCode);
  const teacherQueues = {};

  teacherCodes.forEach((teacherCode) => {
    const split = splitLessonsByType(grouped[teacherCode], config.rules, config);
    teacherQueues[teacherCode] = {
      blocks: consumeLockedUnits(split.blocks, 2, lockedCounts),
      singles: consumeLockedUnits(split.singles, 1, lockedCounts)
    };
  });

  if (config.rules?.scienceFirst !== false) {
    placeSciencePriorityLessons(grid, config, teacherCodes, teacherQueues);
  }

  const dayOrder = [0, 1, 2, 3, 4];
  // 요일별로 전담 1~N 순회하며 1~2교시 -> 3~4교시 -> 잔여 순서로 배치한다.
  dayOrder.forEach((dayIndex) => {
    runDayWaveRoundRobin(grid, config, teacherCodes, teacherQueues, dayIndex, {
      sameGradeDayFirst: config.rules?.sameGradeBlockDayFirst !== false,
      allowSameSubjectOverflow: true,
      maxPeriod: 2,
      allowedBlockStarts: [1],
      avoidSameGradeSingleDayForBlocks: config.rules?.separateGradeBlockAndSingleDay !== false,
      avoidSameClassSingleDayForBlocks: true,
      allowGradeMixFallbackForBlocks: false
    }, 'blocks');

    runDayWaveRoundRobin(grid, config, teacherCodes, teacherQueues, dayIndex, {
      sameGradeDayFirst: config.rules?.sameGradeBlockDayFirst !== false,
      allowSameSubjectOverflow: true,
      maxPeriod: 4,
      allowedBlockStarts: [3],
      avoidSameGradeSingleDayForBlocks: config.rules?.separateGradeBlockAndSingleDay !== false,
      avoidSameClassSingleDayForBlocks: true,
      allowGradeMixFallbackForBlocks: false
    }, 'blocks');
  });

  dayOrder.forEach((dayIndex) => {
    runDayWaveRoundRobin(grid, config, teacherCodes, teacherQueues, dayIndex, {
      sameGradeDayFirst: config.rules?.sameGradeBlockDayFirst !== false,
      avoidSameGradeSingleDayForBlocks: config.rules?.separateGradeBlockAndSingleDay !== false,
      avoidSameClassSingleDayForBlocks: true,
      allowGradeMixFallbackForBlocks: false
    }, 'blocks');
  });

  dayOrder.forEach((dayIndex) => {
    runDayWaveRoundRobin(grid, config, teacherCodes, teacherQueues, dayIndex, {
      preferDifferentGradeForSingles: true,
      allowSameSubjectOverflow: true,
      maxPeriod: 2,
      allowedPeriods: [1, 2],
      avoidSameGradeBlockDayForSingles: config.rules?.separateGradeBlockAndSingleDay !== false,
      avoidSameClassBlockDayForSingles: true
    }, 'singles');

    runDayWaveRoundRobin(grid, config, teacherCodes, teacherQueues, dayIndex, {
      preferDifferentGradeForSingles: true,
      allowSameSubjectOverflow: true,
      maxPeriod: 4,
      allowedPeriods: [3, 4],
      avoidSameGradeBlockDayForSingles: config.rules?.separateGradeBlockAndSingleDay !== false,
      avoidSameClassBlockDayForSingles: true
    }, 'singles');
  });

  dayOrder.forEach((dayIndex) => {
    runDayWaveRoundRobin(grid, config, teacherCodes, teacherQueues, dayIndex, {
      preferDifferentGradeForSingles: true,
      avoidSameGradeBlockDayForSingles: config.rules?.separateGradeBlockAndSingleDay !== false,
      avoidSameClassBlockDayForSingles: true
    }, 'singles');
  });

  teacherCodes.forEach((teacherCode) => {
    const queue = teacherQueues[teacherCode];
    if (!queue) return;
    const strictDayOrder = [0, 1, 2, 3, 4];

    queue.blocks.forEach((lesson) => {
      const strictBlockPlaced = placeBlockWithDayOrder(grid, config, lesson, strictDayOrder, {
        sameGradeDayFirst: config.rules?.sameGradeBlockDayFirst !== false,
        avoidSameGradeSingleDayForBlocks: config.rules?.separateGradeBlockAndSingleDay !== false,
        avoidSameClassSingleDayForBlocks: true
      });
      if (strictBlockPlaced) return;

      if (!placeBlockWithDayOrder(grid, config, lesson, strictDayOrder, {
        sameGradeDayFirst: config.rules?.sameGradeBlockDayFirst !== false,
        avoidSameClassSingleDayForBlocks: true
      })) {
        if (!placeBlockWithDayOrder(grid, config, lesson, strictDayOrder, {
          sameGradeDayFirst: config.rules?.sameGradeBlockDayFirst !== false
        })) {
          unplacedLessons.push(makeUnplaced(lesson, '2시간 블록', '가능한 연속 시간이 없습니다.'));
        }
      }
    });

    queue.singles.forEach((lesson) => {
      const strictSinglePlaced = placeSingleWithDayOrder(grid, config, lesson, strictDayOrder, {
        preferDifferentGradeForSingles: !isScienceLesson(lesson),
        preferSameGradeForSingles: isScienceLesson(lesson) && config.rules?.scienceSameGradeDayFirst !== false,
        avoidSameGradeBlockDayForSingles: config.rules?.separateGradeBlockAndSingleDay !== false,
        avoidSameClassBlockDayForSingles: true
      });
      if (strictSinglePlaced) return;

      if (!placeSingleWithDayOrder(grid, config, lesson, strictDayOrder, {
        preferDifferentGradeForSingles: !isScienceLesson(lesson),
        preferSameGradeForSingles: isScienceLesson(lesson) && config.rules?.scienceSameGradeDayFirst !== false,
        avoidSameClassBlockDayForSingles: true
      })) {
        if (!placeSingleWithDayOrder(grid, config, lesson, strictDayOrder, {
          preferDifferentGradeForSingles: !isScienceLesson(lesson),
          preferSameGradeForSingles: isScienceLesson(lesson) && config.rules?.scienceSameGradeDayFirst !== false
        })) {
          if (!placeSingleWithDayOrder(grid, config, lesson, strictDayOrder, null)) {
            unplacedLessons.push(makeUnplaced(lesson, '1시간 단일', '가능한 시간이 없습니다.'));
          }
        }
      }
    });
  });
}

function runDayWavePhase(grid, config, teacherCodes, teacherQueues, dayOrder, phaseOptions = {}) {
  const placeBlocks = phaseOptions.placeBlocks !== false;
  const placeSingles = phaseOptions.placeSingles !== false;

  dayOrder.forEach((dayIndex) => {
    if (placeBlocks) {
      runDayWaveRoundRobin(grid, config, teacherCodes, teacherQueues, dayIndex, {
        ...phaseOptions,
        sameGradeDayFirst: config.rules?.sameGradeBlockDayFirst !== false,
        avoidSameGradeSingleDayForBlocks: config.rules?.separateGradeBlockAndSingleDay !== false,
        avoidSameClassSingleDayForBlocks: true
      }, 'blocks');
    }

    if (placeSingles) {
      runDayWaveRoundRobin(grid, config, teacherCodes, teacherQueues, dayIndex, {
        ...phaseOptions,
        preferDifferentGradeForSingles: true,
        avoidSameGradeBlockDayForSingles: config.rules?.separateGradeBlockAndSingleDay !== false,
        avoidSameClassBlockDayForSingles: true
      }, 'singles');
    }
  });
}

function placeSciencePriorityLessons(grid, config, teacherCodes, teacherQueues) {
  const scienceQueues = {};
  const scienceTeacherCodes = [];

  teacherCodes.forEach((teacherCode) => {
    const queue = teacherQueues[teacherCode];
    if (!queue) return;

    const scienceBlocks = takeMatchingLessons(queue.blocks, isScienceLesson);
    const scienceSingles = takeMatchingLessons(queue.singles, isScienceLesson);

    if (scienceBlocks.length || scienceSingles.length) {
      scienceQueues[teacherCode] = {
        blocks: scienceBlocks,
        singles: scienceSingles
      };
      scienceTeacherCodes.push(teacherCode);
    }
  });

  if (!scienceTeacherCodes.length) return;

  const dayOrder = [0, 1, 2, 3, 4];
  const scienceBlockOptions = {
    sciencePriority: true,
    sameGradeDayFirst: config.rules?.scienceSameGradeDayFirst !== false,
    allowSameSubjectOverflow: true,
    avoidSameGradeSingleDayForBlocks: false,
    avoidSameClassSingleDayForBlocks: true,
    allowGradeMixFallbackForBlocks: true
  };
  const scienceSingleOptions = {
    sciencePriority: true,
    preferSameGradeForSingles: config.rules?.scienceSameGradeDayFirst !== false,
    allowSameSubjectOverflow: true,
    avoidSameGradeBlockDayForSingles: false,
    avoidSameClassBlockDayForSingles: true
  };

  dayOrder.forEach((dayIndex) => {
    runDayWaveRoundRobin(grid, config, scienceTeacherCodes, scienceQueues, dayIndex, {
      ...scienceBlockOptions,
      maxPeriod: 2,
      allowedBlockStarts: [1]
    }, 'blocks');

    runDayWaveRoundRobin(grid, config, scienceTeacherCodes, scienceQueues, dayIndex, {
      ...scienceBlockOptions,
      maxPeriod: 4,
      allowedBlockStarts: [3]
    }, 'blocks');
  });

  getPreferredLateDayOrder(config).forEach((dayIndex) => {
    runDayWaveRoundRobin(grid, config, scienceTeacherCodes, scienceQueues, dayIndex, {
      ...scienceBlockOptions,
      allowedBlockStarts: [5]
    }, 'blocks');
  });

  dayOrder.forEach((dayIndex) => {
    runDayWaveRoundRobin(grid, config, scienceTeacherCodes, scienceQueues, dayIndex, {
      ...scienceSingleOptions,
      maxPeriod: 2,
      allowedPeriods: [1, 2]
    }, 'singles');

    runDayWaveRoundRobin(grid, config, scienceTeacherCodes, scienceQueues, dayIndex, {
      ...scienceSingleOptions,
      maxPeriod: 4,
      allowedPeriods: [3, 4]
    }, 'singles');
  });

  getPreferredLateDayOrder(config).forEach((dayIndex) => {
    runDayWaveRoundRobin(grid, config, scienceTeacherCodes, scienceQueues, dayIndex, {
      ...scienceSingleOptions,
      allowedPeriods: [5, 6]
    }, 'singles');
  });

  scienceTeacherCodes.forEach((teacherCode) => {
    const scienceQueue = scienceQueues[teacherCode];
    const mainQueue = teacherQueues[teacherCode];
    if (!scienceQueue || !mainQueue) return;

    mainQueue.blocks = scienceQueue.blocks.concat(mainQueue.blocks);
    mainQueue.singles = scienceQueue.singles.concat(mainQueue.singles);
  });
}

function takeMatchingLessons(items, predicate) {
  const taken = [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const lesson = items[index];
    if (!predicate(lesson)) continue;
    taken.unshift(lesson);
    items.splice(index, 1);
  }
  return taken;
}

function runDayWaveRoundRobin(grid, config, teacherCodes, teacherQueues, dayIndex, phaseOptions, unitType) {
  const isBlock = unitType === 'blocks';
  let progressed = true;

  while (progressed) {
    progressed = false;
    const waveTeacherCodes = getWaveTeacherOrder(teacherCodes, teacherQueues, grid, dayIndex, unitType);

    waveTeacherCodes.forEach((teacherCode) => {
      const queue = teacherQueues[teacherCode];
      if (!queue) return;

      const list = isBlock ? queue.blocks : queue.singles;
      for (let index = 0; index < list.length; index += 1) {
        const lesson = list[index];
        const ok = isBlock
          ? placeBlockOnDay(grid, config, lesson, dayIndex, phaseOptions)
          : placeSingleOnDay(grid, config, lesson, dayIndex, phaseOptions);
        if (!ok) continue;

        list.splice(index, 1);
        progressed = true;

        // 2시간 블록은 같은 전담/같은 과목이 있으면 같은 요일에 연속 배치 우선
        if (isBlock) {
          if (config.rules?.sameGradeBlockDayFirst !== false) {
            placeSameGradeBlocksBurst(grid, config, queue, dayIndex, phaseOptions, lesson.grade);
          }
          if (config.rules?.sameSubjectDayFirst !== false) {
            placeSameSubjectBlocksBurst(grid, config, queue, dayIndex, phaseOptions, lesson.subject);
          }
        } else if (phaseOptions?.preferSameGradeForSingles === true) {
          placeSameGradeSinglesBurst(grid, config, queue, dayIndex, phaseOptions, lesson.grade);
        }
        break;
      }
    });
  }
}

function getWaveTeacherOrder(teacherCodes, teacherQueues, grid, dayIndex, unitType) {
  return teacherCodes.slice().sort((a, b) => {
    const qa = teacherQueues[a];
    const qb = teacherQueues[b];
    const pa = unitType === 'blocks' ? Number(qa?.blocks?.length || 0) : Number(qa?.singles?.length || 0);
    const pb = unitType === 'blocks' ? Number(qb?.blocks?.length || 0) : Number(qb?.singles?.length || 0);

    const pendingDiff = Number(pb > 0) - Number(pa > 0);
    if (pendingDiff) return pendingDiff;
    if (pa !== pb) return pb - pa;

    const dayLoadDiff = countDayLoad(grid[a] || [], dayIndex) - countDayLoad(grid[b] || [], dayIndex);
    if (dayLoadDiff) return dayLoadDiff;

    if (dayIndex <= 1) {
      const monTueA = countDayLoad(grid[a] || [], 0) + countDayLoad(grid[a] || [], 1);
      const monTueB = countDayLoad(grid[b] || [], 0) + countDayLoad(grid[b] || [], 1);
      if (monTueA !== monTueB) return monTueA - monTueB;
    }

    return compareTeacherCode(a, b);
  });
}

function placeSameSubjectBlocksBurst(grid, config, queue, dayIndex, phaseOptions, subject) {
  const targetSubject = String(subject || '');
  if (!targetSubject) return;

  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < queue.blocks.length; index += 1) {
      const lesson = queue.blocks[index];
      if (String(lesson.subject || '') !== targetSubject) continue;
      if (!placeBlockOnDay(grid, config, lesson, dayIndex, phaseOptions)) continue;
      queue.blocks.splice(index, 1);
      changed = true;
      break;
    }
  }
}

function placeSameGradeBlocksBurst(grid, config, queue, dayIndex, phaseOptions, grade) {
  const targetGrade = Number(grade);
  if (!Number.isFinite(targetGrade)) return;

  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < queue.blocks.length; index += 1) {
      const lesson = queue.blocks[index];
      if (Number(lesson.grade) !== targetGrade) continue;
      if (!placeBlockOnDay(grid, config, lesson, dayIndex, phaseOptions)) continue;
      queue.blocks.splice(index, 1);
      changed = true;
      break;
    }
  }
}

function placeSameGradeSinglesBurst(grid, config, queue, dayIndex, phaseOptions, grade) {
  const targetGrade = Number(grade);
  if (!Number.isFinite(targetGrade)) return;

  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < queue.singles.length; index += 1) {
      const lesson = queue.singles[index];
      if (Number(lesson.grade) !== targetGrade) continue;
      if (!placeSingleOnDay(grid, config, lesson, dayIndex, phaseOptions)) continue;
      queue.singles.splice(index, 1);
      changed = true;
      break;
    }
  }
}

function placeBlock(grid, config, lesson) {
  const dayOrder = getDayOrder(grid, config, lesson.teacher);
  return placeBlockWithDayOrder(grid, config, lesson, dayOrder, null);
}

function placeBlockOnDay(grid, config, lesson, dayIndex, options = null) {
  return placeBlockWithDayOrder(grid, config, lesson, [dayIndex], options);
}

function placeBlockWithDayOrder(grid, config, lesson, dayOrder, options = null) {
  const startOrder = Array.isArray(config._variant?.blockStarts) ? config._variant.blockStarts : [1, 3, 5];
  const allowedBlockStarts = Array.isArray(options?.allowedBlockStarts) && options.allowedBlockStarts.length
    ? options.allowedBlockStarts.map((v) => Number(v))
    : null;
  const starts = startOrder.filter((period) => {
    if (allowedBlockStarts && !allowedBlockStarts.includes(Number(period))) return false;
    return isPeriodAllowed(config, lesson, period) && isPeriodAllowed(config, lesson, period + 1);
  });
  const maxPeriod = Number(options?.maxPeriod || 0);
  const allowSameSubjectOverflow = options?.allowSameSubjectOverflow === true;
  const avoidSameGradeSingleDay = options?.avoidSameGradeSingleDayForBlocks === true;
  const avoidSameClassSingleDay = options?.avoidSameClassSingleDayForBlocks === true;
  const allowGradeMixFallback = options?.allowGradeMixFallbackForBlocks !== false;
  const strictCandidates = [];
  const fallbackCandidates = [];

  for (const dayIndex of dayOrder) {
    const hasSameGradeSingle = avoidSameGradeSingleDay && hasTeacherGradeSingleOnDay(grid, lesson.teacher, lesson.grade, dayIndex);
    const hasSameClassSingle = avoidSameClassSingleDay
      && hasTeacherClassSingleOnDay(grid, lesson.teacher, lesson.classCode, lesson.subject, dayIndex);
    const sameSubjectInDay = getTeacherSameSubjectLoad(grid, lesson.teacher, lesson.subject, dayIndex) > 0;
    for (const startPeriod of starts) {
      if (maxPeriod > 0 && startPeriod + 1 > maxPeriod && !(allowSameSubjectOverflow && sameSubjectInDay)) continue;
      if (!canPlaceBlock(grid, config, lesson, dayIndex, startPeriod)) continue;
      const candidate = {
        dayIndex,
        dayRank: dayOrder.indexOf(dayIndex),
        period: startPeriod,
        startPeriod,
        late: startPeriod > 4,
        sameSubjectLoad: getTeacherSameSubjectLoad(grid, lesson.teacher, lesson.subject, dayIndex),
        sameGradeLoad: getTeacherSameGradeLoad(grid, lesson.teacher, lesson.grade, dayIndex)
      };

      if (hasSameGradeSingle || hasSameClassSingle) fallbackCandidates.push(candidate);
      else strictCandidates.push(candidate);
    }
  }

  const blockComparator = options?.sameGradeDayFirst === true
    ? (a, b) => compareBlockPlacementCandidate(config, a, b)
    : (a, b) => compareTeacherPlacementCandidate(config, a, b);

  strictCandidates.sort(blockComparator);
  fallbackCandidates.sort(blockComparator);
  const chosen = strictCandidates[0] || (allowGradeMixFallback ? fallbackCandidates[0] : null);
  if (!chosen) return false;

  writeLesson(grid, lesson, chosen.dayIndex, chosen.startPeriod);
  writeLesson(grid, lesson, chosen.dayIndex, chosen.startPeriod + 1);
  return true;
}

function placeSingle(grid, config, lesson) {
  const dayOrder = getDayOrder(grid, config, lesson.teacher);
  return placeSingleWithDayOrder(grid, config, lesson, dayOrder, null);
}

function placeSingleOnDay(grid, config, lesson, dayIndex, options = null) {
  return placeSingleWithDayOrder(grid, config, lesson, [dayIndex], options);
}

function placeSingleWithDayOrder(grid, config, lesson, dayOrder, options = null) {
  const candidates = [];
  const basePeriodOrder = Array.isArray(config._variant?.periodOrder) ? config._variant.periodOrder : PERIODS;
  const allowedPeriods = Array.isArray(options?.allowedPeriods) && options.allowedPeriods.length
    ? options.allowedPeriods.map((v) => Number(v))
    : null;
  const periodOrder = allowedPeriods
    ? basePeriodOrder.filter((period) => allowedPeriods.includes(Number(period)))
    : basePeriodOrder;
  const maxPeriod = Number(options?.maxPeriod || 0);
  const allowSameSubjectOverflow = options?.allowSameSubjectOverflow === true;
  const avoidSameGradeBlockDay = options?.avoidSameGradeBlockDayForSingles === true;
  const avoidSameClassBlockDay = options?.avoidSameClassBlockDayForSingles === true;
  const preferDifferentGrade = options?.preferDifferentGradeForSingles === true && lesson?.preferDifferentGradeWithBlock === true;
  const preferSameGrade = options?.preferSameGradeForSingles === true;

  for (const dayIndex of dayOrder) {
    if (avoidSameGradeBlockDay && hasTeacherGradeBlockOnDay(grid, lesson.teacher, lesson.grade, dayIndex)) {
      continue;
    }
    if (avoidSameClassBlockDay && hasTeacherClassBlockOnDay(grid, lesson.teacher, lesson.classCode, lesson.subject, dayIndex)) {
      continue;
    }
    const sameSubjectInDay = getTeacherSameSubjectLoad(grid, lesson.teacher, lesson.subject, dayIndex) > 0;
    for (const period of periodOrder) {
      if (maxPeriod > 0 && period > maxPeriod && !(allowSameSubjectOverflow && sameSubjectInDay)) continue;
      if (!canPlaceSingle(grid, config, lesson, dayIndex, period)) continue;
      candidates.push({
        dayIndex,
        period,
        late: period > 4,
        dayRank: dayOrder.indexOf(dayIndex),
        sameSubjectLoad: getTeacherSameSubjectLoad(grid, lesson.teacher, lesson.subject, dayIndex),
        sameGradeLoad: getTeacherSameGradeLoad(grid, lesson.teacher, lesson.grade, dayIndex),
        differentGradeLoad: getTeacherDifferentGradeLoad(grid, lesson.teacher, lesson.grade, dayIndex)
      });
    }
  }

  if (preferDifferentGrade) {
    candidates.sort((a, b) => {
      const diffGradeLoad = Number(b.differentGradeLoad || 0) - Number(a.differentGradeLoad || 0);
      if (diffGradeLoad) return diffGradeLoad;
      return compareTeacherPlacementCandidate(config, a, b);
    });
  } else if (preferSameGrade) {
    candidates.sort((a, b) => {
      const sameGradeDiff = Number(b.sameGradeLoad || 0) - Number(a.sameGradeLoad || 0);
      if (sameGradeDiff) return sameGradeDiff;
      return compareTeacherPlacementCandidate(config, a, b);
    });
  } else {
    candidates.sort((a, b) => compareTeacherPlacementCandidate(config, a, b));
  }
  const chosen = candidates[0];
  if (!chosen) return false;

  writeLesson(grid, lesson, chosen.dayIndex, chosen.period);
  return true;
}

function applyLockedLessons(grid, config, unplacedLessons) {
  const counts = {};

  (config.lockedLessons || []).forEach((lock) => {
    const teacher = String(lock.teacher || '').trim();
    const subject = String(lock.subject || '').trim();
    const classCode = String(lock.classCode || '').trim();
    const roomName = String(lock.roomName || '').trim();
    const dayIndex = Number(lock.dayIndex);
    const period = Number(lock.period);
    const duration = Number(lock.duration || 1);

    if (!teacher || !subject || !classCode || !grid[teacher]) return;
    if (dayIndex < 0 || dayIndex > 4 || period < 1 || period > 6 || period + duration - 1 > 6) return;

    const lesson = {
      teacher,
      subject,
      classCode,
      roomName,
      useRoom: !!roomName,
      ...parseClassCode(classCode)
    };

    const periods = Array.from({ length: duration }, (_v, index) => period + index);
    const ok = periods.every((p) => {
      const cell = grid[teacher][p - 1][dayIndex];
      if (cell) return false;
      if (hasClassAtTime(grid, classCode, dayIndex, p)) return false;
      if (roomName && isRoomBlocked(config, roomName, dayIndex, p)) return false;
      if (roomName && hasFixedRoomAtTime(config, roomName, dayIndex, p)) return false;
      if (roomName && hasRoomAtTime(grid, config, roomName, dayIndex, p)) return false;
      return true;
    });

    if (!ok) {
      unplacedLessons.push(makeUnplaced(lesson, `${duration}시간 잠금`, '잠금된 시간에 충돌이 있습니다.'));
      return;
    }

    periods.forEach((p) => writeLesson(grid, lesson, dayIndex, p, true));
    const key = makeUnitKey(lesson, duration);
    counts[key] = (counts[key] || 0) + 1;
  });

  return counts;
}

function consumeLockedUnits(units, duration, counts) {
  return units.filter((lesson) => {
    const key = makeUnitKey(lesson, duration);
    if (counts[key] > 0) {
      counts[key] -= 1;
      return false;
    }
    return true;
  });
}

function makeUnitKey(lesson, duration) {
  return [
    lesson.teacher || '',
    lesson.subject || '',
    lesson.classCode || '',
    lesson.roomName || '',
    duration
  ].join('|');
}

function optimizeNonScienceLateSingles(grid, config) {
  let moved = true;
  while (moved) {
    moved = false;

    for (const teacherCode of getTeacherCodes(config)) {
      const teacherGrid = grid[teacherCode];
      if (!teacherGrid) continue;

      for (let periodIndex = 4; periodIndex < PERIODS.length; periodIndex += 1) {
        for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex += 1) {
          const cell = teacherGrid[periodIndex][dayIndex];
          if (!cell || cell.blocked || cell.locked || !cell.value || isScienceLesson(cell)) continue;

          const lesson = {
            teacher: teacherCode,
            subject: cell.subject,
            classCode: cell.classCode,
            roomName: cell.roomName || '',
            useRoom: !!cell.roomName,
            ...parseClassCode(cell.classCode)
          };

          teacherGrid[periodIndex][dayIndex] = null;
          const target = findEarlierSingleSlot(grid, config, lesson);
          if (target) {
            writeLesson(grid, lesson, target.dayIndex, target.period);
            moved = true;
          } else {
            teacherGrid[periodIndex][dayIndex] = cell;
          }
        }
      }
    }
  }
}

function findEarlierSingleSlot(grid, config, lesson) {
  const candidates = [];

  for (const dayIndex of [0, 1, 2, 3, 4]) {
    for (const period of [1, 2, 3, 4]) {
      if (!canPlaceSingle(grid, config, lesson, dayIndex, period)) continue;
      candidates.push({
        dayIndex,
        period,
        dayRank: dayIndex,
        late: false,
        sameSubjectLoad: getTeacherSameSubjectLoad(grid, lesson.teacher, lesson.subject, dayIndex),
        sameGradeLoad: getTeacherSameGradeLoad(grid, lesson.teacher, lesson.grade, dayIndex),
        differentGradeLoad: getTeacherDifferentGradeLoad(grid, lesson.teacher, lesson.grade, dayIndex)
      });
    }
  }

  candidates.sort((a, b) => compareTeacherPlacementCandidate(config, a, b));
  return candidates[0] || null;
}

function canPlaceBlock(grid, config, lesson, dayIndex, startPeriod) {
  if (!canPlaceSingle(grid, config, lesson, dayIndex, startPeriod)) return false;
  if (!canPlaceSingle(grid, config, lesson, dayIndex, startPeriod + 1)) return false;

  const info = getExistingDayInfo(grid, lesson.classCode, dayIndex);
  const subject = subjectShortName(lesson.subject);
  const sameCount = info.subjectCounts[subject] || 0;
  const enforceDailyClassLoad = config.rules.maxDailyClassLoadEnabled || config.rules?.separateGradeBlockAndSingleDay !== false;
  const enforceDailySameSubject = config.rules.maxDailySameSubjectEnabled || config.rules?.separateGradeBlockAndSingleDay !== false;
  if (enforceDailyClassLoad && info.total + 2 > 3) return false;
  if (enforceDailySameSubject && sameCount + 2 > 2) return false;
  return true;
}

function canPlaceSingle(grid, config, lesson, dayIndex, period) {
  if (!isDayPeriodAllowed(config, dayIndex, period)) return false;
  if (!isPeriodAllowed(config, lesson, period)) return false;

  const teacherGrid = grid[lesson.teacher];
  if (!teacherGrid) return false;

  const cell = teacherGrid[period - 1][dayIndex];
  if (cell) return false;

  const info = getExistingDayInfo(grid, lesson.classCode, dayIndex);
  const subject = subjectShortName(lesson.subject);
  const sameCount = info.subjectCounts[subject] || 0;
  const enforceDailyClassLoad = config.rules.maxDailyClassLoadEnabled || config.rules?.separateGradeBlockAndSingleDay !== false;
  const enforceDailySameSubject = config.rules.maxDailySameSubjectEnabled || config.rules?.separateGradeBlockAndSingleDay !== false;
  if (enforceDailyClassLoad && info.total + 1 > 3) return false;
  if (enforceDailySameSubject && sameCount + 1 > 2) return false;
  if (hasClassAtTime(grid, lesson.classCode, dayIndex, period)) return false;
  if (shouldKeepSingleUnitsSeparated(config, lesson) && hasSameLessonOnDay(grid, lesson, dayIndex)) return false;
  if (isFixedClassBusy(config, lesson.classCode, dayIndex, period)) return false;
  if (lesson.useRoom && isRoomBlocked(config, lesson.roomName, dayIndex, period)) return false;
  if (lesson.useRoom && hasFixedRoomAtTime(config, lesson.roomName, dayIndex, period)) return false;
  if (lesson.useRoom && hasRoomAtTime(grid, config, lesson.roomName, dayIndex, period)) return false;

  return true;
}

function shouldKeepSingleUnitsSeparated(config, lesson) {
  if (lesson?.hasBlockSiblingUnit === true) return false;
  const teacherCode = String(lesson?.teacher || '').trim();
  const subject = String(lesson?.subject || '').trim();
  const classCode = String(lesson?.classCode || '').trim();
  if (!teacherCode || !subject || !classCode) return false;

  const setting = (config.teachers || []).find((teacher) =>
    String(teacher.teacherCode || '').trim() === teacherCode &&
    String(teacher.subject || '').trim() === subject &&
    (teacher.assignedClasses || []).map(String).includes(classCode)
  );
  if (!setting) return false;

  const units = parseBlockPattern(setting.blockPattern, Number(setting.weeklyHours || 0), true);
  return units.length > 1 && units.every((unit) => unit === 1);
}

function hasSameLessonOnDay(grid, lesson, dayIndex) {
  const teacherGrid = grid[lesson.teacher];
  if (!teacherGrid) return false;
  return PERIODS.some((period) => {
    const cell = teacherGrid[period - 1]?.[dayIndex];
    return cell &&
      String(cell.classCode || '') === String(lesson.classCode || '') &&
      String(cell.subject || '') === String(lesson.subject || '');
  });
}

function writeLesson(grid, lesson, dayIndex, period, locked = false) {
  grid[lesson.teacher][period - 1][dayIndex] = {
    value: `${subjectShortName(lesson.subject)}(${lesson.classCode})`,
    teacher: lesson.teacher,
    subject: lesson.subject,
    classCode: lesson.classCode,
    roomName: lesson.roomName || '',
    locked
  };
}

function hasClassAtTime(grid, classCode, dayIndex, period) {
  return Object.values(grid).some((teacherGrid) => {
    const cell = teacherGrid[period - 1][dayIndex];
    return cell && cell.classCode === classCode;
  });
}

function hasRoomAtTime(grid, config, roomName, dayIndex, period) {
  roomName = String(roomName || '').trim();
  if (!roomName) return false;

  const capacity = getRoomCapacity(config, roomName);
  let used = 0;
  Object.values(grid).forEach((teacherGrid) => {
    const cell = teacherGrid[period - 1][dayIndex];
    if (cell && cell.roomName === roomName) used += 1;
  });
  return used >= capacity;
}

function isRoomBlocked(config, roomName, dayIndex, period) {
  roomName = String(roomName || '').trim();
  if (!roomName) return false;

  const day = DAYS[dayIndex];
  return (config.roomBlocks || []).some((block) =>
    String(block.roomName || '').trim() === roomName &&
    block.day === day &&
    Number(block.period) === Number(period)
  );
}

function isFixedClassBusy(config, classCode, dayIndex, period) {
  const state = config._fixedRoomState;
  if (!state) return false;
  return isClassBusy(state.classBusy, classCode, dayIndex, period);
}

function hasFixedRoomAtTime(config, roomName, dayIndex, period) {
  const state = config._fixedRoomState;
  if (!state || !roomName) return false;

  const roomCell = state.roomGrid[roomName]?.[period - 1]?.[dayIndex];
  if (!roomCell || roomCell.blocked) return false;

  return roomCell.entries.length >= getRoomCapacity(config, roomName);
}

function hasFixedRoomAssignments(config) {
  return (config.roomAssignments || []).some((assignment) => isFixedRoomAssignment(config, assignment));
}

function isFixedRoomAssignment(config, assignment) {
  if (assignment.fixedFirst === true) return true;
  if (assignment.fixedFirst === false) return false;
  return config.rules?.roomAssignmentsFirst === true;
}

function buildFixedRoomAssignmentState(config, unplacedLessons) {
  const state = makeRoomState(config, makeEmptyTeacherGrid(config));
  placeRoomAssignmentsIntoState(config, state, unplacedLessons, true);
  return state;
}

function buildRoomTimetable(config, teacherGrid, unplacedLessons, fixedRoomState) {
  const state = makeRoomState(config, teacherGrid, fixedRoomState);

  if (!fixedRoomState) {
    placeRoomAssignmentsIntoState(config, state, unplacedLessons);
  } else {
    placeRoomAssignmentsIntoState(config, state, unplacedLessons, false);
  }

  return makeRoomView(config, state.roomGrid);
}

function placeRoomAssignmentsIntoState(config, state, unplacedLessons, fixedOnly = null) {
  (config.roomAssignments || []).forEach((assignment) => {
    const fixed = isFixedRoomAssignment(config, assignment);
    if (fixedOnly === true && !fixed) return;
    if (fixedOnly === false && fixed) return;

    const roomName = String(assignment.roomName || '').trim();
    if (!roomName || !state.roomGrid[roomName]) return;

    const orderedItems = (assignment.items || []).slice().sort((a, b) => compareRoomAssignmentItemPriority(config, a, b));

    orderedItems.forEach((item) => {
      const grade = Number(item.grade || 0);
      const hours = Math.max(1, Math.round(Number(item.hours || 1)));
      const blockMode = String(item.blockMode || 'single') === 'double' ? 'double' : 'single';
      const hoursMode = String(item.hoursMode || 'perClass') === 'perGrade' ? 'perGrade' : 'perClass';
      const classCodes = normalizeRoomAssignmentClassCodes(config, item, grade, hoursMode);

      if (!classCodes.length) return;

      if (hoursMode === 'perGrade') {
        placeRoomHoursForGradeTotal(config, state, unplacedLessons, roomName, classCodes, grade, hours, blockMode);
      } else {
        classCodes.forEach((classCode) => {
          placeRoomHoursForSingleClass(config, state, unplacedLessons, roomName, classCode, hours, blockMode);
        });
      }
    });
  });
}

function compareRoomAssignmentItemPriority(config, a, b) {
  const aGrade = Number(a.grade || 0);
  const bGrade = Number(b.grade || 0);

  const aClassCount = estimateRoomAssignmentClassCount(config, a, aGrade);
  const bClassCount = estimateRoomAssignmentClassCount(config, b, bGrade);

  if (aClassCount !== bClassCount) return bClassCount - aClassCount;

  const aHours = Number(a.hours || 0);
  const bHours = Number(b.hours || 0);
  if (aHours !== bHours) return bHours - aHours;

  return aGrade - bGrade;
}

function estimateRoomAssignmentClassCount(config, item, grade) {
  const hoursMode = String(item?.hoursMode || 'perClass') === 'perGrade' ? 'perGrade' : 'perClass';
  if (hoursMode === 'perGrade') {
    return getGradeClassCodesFromConfig(config, grade).length;
  }
  return Array.isArray(item?.classCodes) ? item.classCodes.length : 0;
}

function normalizeRoomAssignmentClassCodes(config, item, grade, hoursMode) {
  const explicit = Array.isArray(item.classCodes)
    ? [...new Set(item.classCodes.map((classCode) => String(classCode || '').trim()).filter(Boolean))]
    : [];

  if (hoursMode !== 'perGrade') return explicit;

  const byGrade = getGradeClassCodesFromConfig(config, grade);
  if (byGrade.length) return byGrade;
  return explicit;
}

function getGradeClassCodesFromConfig(config, grade) {
  const item = (config.gradeClasses || []).find((row) => Number(row.grade) === Number(grade));
  const classCount = Number(item?.classCount || 0);
  if (!Number.isFinite(classCount) || classCount <= 0) return [];
  return Array.from({ length: classCount }, (_value, index) => `${grade}-${index + 1}`);
}

function placeRoomHoursForSingleClass(config, state, unplacedLessons, roomName, classCode, hours, blockMode) {
  let remaining = Math.max(0, Math.round(Number(hours || 0)));

  if (blockMode === 'double') {
    while (remaining >= 2) {
      const slot = findRoomDoubleSlot(config, state, roomName, classCode);
      if (!slot) {
        unplacedLessons.push(makeRoomUnplaced(roomName, classCode, '2시간 블록', '특별실에 배치 가능한 연속 시간이 없습니다.'));
        break;
      }

      writeRoomLesson(state, roomName, classCode, slot.dayIndex, slot.startPeriod);
      writeRoomLesson(state, roomName, classCode, slot.dayIndex, slot.startPeriod + 1);
      remaining -= 2;
    }
  }

  while (remaining > 0) {
    const slot = findRoomSingleSlot(config, state, roomName, classCode);
    if (!slot) {
      unplacedLessons.push(makeRoomUnplaced(roomName, classCode, '1시간 단일', '특별실에 배치 가능한 시간이 없습니다.'));
      break;
    }

    writeRoomLesson(state, roomName, classCode, slot.dayIndex, slot.period);
    remaining -= 1;
  }
}

function placeRoomHoursForGradeTotal(config, state, unplacedLessons, roomName, classCodes, grade, hours, blockMode) {
  const targets = Array.isArray(classCodes) ? classCodes.filter(Boolean) : [];
  if (!targets.length) return;

  const fallbackClassCode = targets[0];
  const gradeLabel = `${grade}학년`;
  let remaining = Math.max(0, Math.round(Number(hours || 0)));
  let preferredDayIndex = null;

  if (blockMode === 'double') {
    while (remaining >= 2) {
      let slot = preferredDayIndex === null
        ? null
        : findRoomGroupDoubleSlot(config, state, roomName, targets, { preferredDayIndex });
      if (!slot) {
        slot = findRoomGroupDoubleSlot(config, state, roomName, targets);
      }
      if (!slot) {
        unplacedLessons.push(makeRoomUnplaced(roomName, fallbackClassCode, '2시간 블록', `${grade}학년 총량 배정에 필요한 연속 시간이 부족합니다.`));
        break;
      }

      if (preferredDayIndex === null) preferredDayIndex = slot.dayIndex;
      writeRoomLesson(state, roomName, slot.classCode, slot.dayIndex, slot.startPeriod, gradeLabel);
      writeRoomLesson(state, roomName, slot.classCode, slot.dayIndex, slot.startPeriod + 1, gradeLabel);
      remaining -= 2;
    }
  }

  while (remaining > 0) {
    let slot = preferredDayIndex === null
      ? null
      : findRoomGroupSingleSlot(config, state, roomName, targets, { preferredDayIndex });
    if (!slot) {
      slot = findRoomGroupSingleSlot(config, state, roomName, targets);
    }
    if (!slot) {
      unplacedLessons.push(makeRoomUnplaced(roomName, fallbackClassCode, '1시간 단일', `${grade}학년 총량 배정에 필요한 시간이 부족합니다.`));
      break;
    }

    if (preferredDayIndex === null) preferredDayIndex = slot.dayIndex;
    writeRoomLesson(state, roomName, slot.classCode, slot.dayIndex, slot.period, gradeLabel);
    remaining -= 1;
  }
}

function findRoomGroupDoubleSlot(config, state, roomName, classCodes, options = null) {
  const candidates = [];

  classCodes.forEach((classCode) => {
    const slot = findRoomDoubleSlot(config, state, roomName, classCode, options);
    if (!slot) return;
    candidates.push({
      ...slot,
      classCode,
      classTotalLoad: getClassTotalLoad(state.classBusy, classCode)
    });
  });

  candidates.sort(compareRoomGroupCandidate);
  return candidates[0] || null;
}

function findRoomGroupSingleSlot(config, state, roomName, classCodes, options = null) {
  const candidates = [];

  classCodes.forEach((classCode) => {
    const slot = findRoomSingleSlot(config, state, roomName, classCode, options);
    if (!slot) return;
    candidates.push({
      ...slot,
      classCode,
      classTotalLoad: getClassTotalLoad(state.classBusy, classCode)
    });
  });

  candidates.sort(compareRoomGroupCandidate);
  return candidates[0] || null;
}

function getClassTotalLoad(classBusy, classCode) {
  return (classBusy[classCode] || []).reduce((total, row) => total + row.filter(Boolean).length, 0);
}

function compareRoomGroupCandidate(a, b) {
  if (a.classTotalLoad !== b.classTotalLoad) return a.classTotalLoad - b.classTotalLoad;
  return compareRoomCandidate(a, b);
}

function makeRoomState(config, teacherGrid, baseState = null) {
  const roomGrid = baseState ? cloneRoomGrid(baseState.roomGrid) : {};
  const classBusy = baseState ? cloneBusyGrid(baseState.classBusy) : {};

  if (!baseState) {
    (config.rooms || []).forEach((room) => {
      const roomName = String(room.name || '').trim();
      if (!roomName) return;
      roomGrid[roomName] = makeEmptyRoomGrid();
    });

    (config.roomBlocks || []).forEach((block) => {
      const roomName = String(block.roomName || '').trim();
      const dayIndex = DAYS.indexOf(block.day);
      const period = Number(block.period || 0);
      if (!roomGrid[roomName] || dayIndex < 0 || period < 1 || period > 6) return;
      roomGrid[roomName][period - 1][dayIndex] = { blocked: true, entries: [] };
    });
  }

  Object.values(teacherGrid).forEach((grid) => {
    grid.forEach((row, periodIndex) => {
      row.forEach((cell, dayIndex) => {
        if (!cell || cell.blocked) return;
        markClassBusy(classBusy, cell.classCode, dayIndex, periodIndex + 1);
        if (!cell.roomName) return;

        if (!roomGrid[cell.roomName]) {
          roomGrid[cell.roomName] = makeEmptyRoomGrid();
        }

        const roomCell = roomGrid[cell.roomName][periodIndex][dayIndex];
        if (roomCell.blocked) return;
        roomCell.entries.push({
          value: cell.value,
          classCode: cell.classCode,
          source: '전담'
        });
      });
    });
  });

  return { roomGrid, classBusy };
}

function cloneRoomGrid(roomGrid) {
  const clone = {};
  Object.keys(roomGrid || {}).forEach((roomName) => {
    clone[roomName] = roomGrid[roomName].map((row) => row.map((cell) => ({
      blocked: !!cell.blocked,
      entries: (cell.entries || []).map((entry) => ({ ...entry }))
    })));
  });
  return clone;
}

function cloneBusyGrid(classBusy) {
  const clone = {};
  Object.keys(classBusy || {}).forEach((classCode) => {
    clone[classCode] = classBusy[classCode].map((row) => row.slice());
  });
  return clone;
}

function makeEmptyRoomGrid() {
  return PERIODS.map(() => DAYS.map(() => ({ blocked: false, entries: [] })));
}

function findRoomDoubleSlot(config, state, roomName, classCode, options = null) {
  const starts = [1, 3, 5];
  const candidates = [];
  const parsed = parseClassCode(classCode);
  const grade = parsed.ok ? parsed.grade : null;
  const preferredDayIndex = Number.isInteger(options?.preferredDayIndex) ? Number(options.preferredDayIndex) : null;

  DAYS.forEach((_day, dayIndex) => {
    if (preferredDayIndex !== null && dayIndex !== preferredDayIndex) return;
    starts.forEach((startPeriod) => {
      if (!canUseRoomSlot(config, state, roomName, classCode, dayIndex, startPeriod)) return;
      if (!canUseRoomSlot(config, state, roomName, classCode, dayIndex, startPeriod + 1)) return;

      candidates.push({
        dayIndex,
        startPeriod,
        classDayLoad: getClassDayLoad(state.classBusy, classCode, dayIndex),
        roomDayLoad: getRoomDayLoad(state.roomGrid, roomName, dayIndex),
        sameGradeRoomLoad: grade ? getRoomSameGradeLoad(state.roomGrid, roomName, grade, dayIndex) : 0
      });
    });
  });

  candidates.sort((a, b) => compareRoomCandidateWithRules(config, a, b));
  return candidates[0] || null;
}

function findRoomSingleSlot(config, state, roomName, classCode, options = null) {
  const candidates = [];
  const parsed = parseClassCode(classCode);
  const grade = parsed.ok ? parsed.grade : null;
  const preferredDayIndex = Number.isInteger(options?.preferredDayIndex) ? Number(options.preferredDayIndex) : null;

  DAYS.forEach((_day, dayIndex) => {
    if (preferredDayIndex !== null && dayIndex !== preferredDayIndex) return;
    PERIODS.forEach((period) => {
      if (!canUseRoomSlot(config, state, roomName, classCode, dayIndex, period)) return;

      candidates.push({
        dayIndex,
        period,
        classDayLoad: getClassDayLoad(state.classBusy, classCode, dayIndex),
        roomDayLoad: getRoomDayLoad(state.roomGrid, roomName, dayIndex),
        sameGradeRoomLoad: grade ? getRoomSameGradeLoad(state.roomGrid, roomName, grade, dayIndex) : 0
      });
    });
  });

  candidates.sort((a, b) => compareRoomCandidateWithRules(config, a, b));
  return candidates[0] || null;
}

function canUseRoomSlot(config, state, roomName, classCode, dayIndex, period) {
  if (isClassBusy(state.classBusy, classCode, dayIndex, period)) return false;

  const roomCell = state.roomGrid[roomName]?.[period - 1]?.[dayIndex];
  if (!roomCell || roomCell.blocked) return false;

  return roomCell.entries.length < getRoomCapacity(config, roomName);
}

function writeRoomLesson(state, roomName, classCode, dayIndex, period, displayValue = null) {
  const roomCell = state.roomGrid[roomName][period - 1][dayIndex];
  roomCell.entries.push({
    value: displayValue || classCode,
    classCode,
    source: '특별실'
  });
  markClassBusy(state.classBusy, classCode, dayIndex, period);
}

function markClassBusy(classBusy, classCode, dayIndex, period) {
  if (!classCode) return;
  if (!classBusy[classCode]) classBusy[classCode] = makeEmptyBusyGrid();
  classBusy[classCode][period - 1][dayIndex] = true;
}

function makeEmptyBusyGrid() {
  return PERIODS.map(() => DAYS.map(() => false));
}

function isClassBusy(classBusy, classCode, dayIndex, period) {
  return !!classBusy[classCode]?.[period - 1]?.[dayIndex];
}

function getClassDayLoad(classBusy, classCode, dayIndex) {
  return (classBusy[classCode] || []).reduce((count, row) => count + (row[dayIndex] ? 1 : 0), 0);
}

function getRoomDayLoad(roomGrid, roomName, dayIndex) {
  return (roomGrid[roomName] || []).reduce((count, row) => count + row[dayIndex].entries.length, 0);
}

function compareRoomCandidate(a, b) {
  if (a.classDayLoad !== b.classDayLoad) return a.classDayLoad - b.classDayLoad;
  if (a.roomDayLoad !== b.roomDayLoad) return a.roomDayLoad - b.roomDayLoad;
  const periodA = a.period || a.startPeriod;
  const periodB = b.period || b.startPeriod;
  if (periodA !== periodB) return periodA - periodB;
  return a.dayIndex - b.dayIndex;
}

function compareRoomCandidateWithRules(config, a, b) {
  const morningDiff = getMorningBand(a) - getMorningBand(b);
  if (morningDiff) return morningDiff;

  if (config.rules?.sameGradeFirst) {
    const sameGradeDiff = Number(b.sameGradeRoomLoad || 0) - Number(a.sameGradeRoomLoad || 0);
    if (sameGradeDiff) return sameGradeDiff;
  }
  return compareRoomCandidate(a, b);
}

function getRoomSameGradeLoad(roomGrid, roomName, grade, dayIndex) {
  return (roomGrid[roomName] || []).reduce((count, row) => {
    const entries = row[dayIndex]?.entries || [];
    const add = entries.reduce((inner, entry) => {
      const parsed = parseClassCode(entry.classCode);
      return inner + (parsed.ok && Number(parsed.grade) === Number(grade) ? 1 : 0);
    }, 0);
    return count + add;
  }, 0);
}

function makeRoomView(config, roomGrid) {
  return Object.keys(roomGrid).map((roomName) => {
    const room = (config.rooms || []).find((item) => String(item.name || '').trim() === roomName);
    return {
      roomName,
      capacity: Number(room?.capacity || 1),
      grid: roomGrid[roomName].map((row, periodIndex) => row.map((cell, dayIndex) => ({
        dayIndex,
        period: periodIndex + 1,
        value: joinRoomEntryValues(cell.entries || []),
        entries: (cell.entries || []).map((entry) => ({ ...entry })),
        isBlocked: !!cell.blocked
      })))
    };
  });
}

function joinRoomEntryValues(entries) {
  const values = entries.map((entry) => String(entry.value || '').trim()).filter(Boolean);
  return [...new Set(values)].join(' / ');
}

function makeRoomUnplaced(roomName, classCode, unitType, reason) {
  const parsed = parseClassCode(classCode);
  return {
    teacher: '특별실',
    subject: roomName,
    grade: parsed.grade,
    classNo: parsed.classNo,
    classCode,
    unitType,
    roomName,
    reason: `특별실 시간 부족: ${reason}`
  };
}

function getExistingDayInfo(grid, classCode, dayIndex) {
  const result = { total: 0, periods: [], subjectCounts: {} };

  Object.values(grid).forEach((teacherGrid) => {
    PERIODS.forEach((period) => {
      const cell = teacherGrid[period - 1][dayIndex];
      if (!cell || cell.classCode !== classCode) return;
      result.total += 1;
      result.periods.push(period);
      const subject = subjectShortName(cell.subject);
      result.subjectCounts[subject] = (result.subjectCounts[subject] || 0) + 1;
    });
  });

  return result;
}

function getTeacherSameGradeLoad(grid, teacherCode, grade, dayIndex) {
  const teacherGrid = grid[teacherCode] || [];
  let count = 0;

  PERIODS.forEach((period) => {
    const cell = teacherGrid[period - 1]?.[dayIndex];
    if (!cell || cell.blocked || !cell.classCode) return;
    const parsed = parseClassCode(cell.classCode);
    if (parsed.ok && Number(parsed.grade) === Number(grade)) count += 1;
  });

  return count;
}

function getTeacherDifferentGradeLoad(grid, teacherCode, grade, dayIndex) {
  const teacherGrid = grid[teacherCode] || [];
  let count = 0;

  PERIODS.forEach((period) => {
    const cell = teacherGrid[period - 1]?.[dayIndex];
    if (!cell || cell.blocked || !cell.classCode) return;
    const parsed = parseClassCode(cell.classCode);
    if (parsed.ok && Number(parsed.grade) !== Number(grade)) count += 1;
  });

  return count;
}

function getTeacherSameSubjectLoad(grid, teacherCode, subject, dayIndex) {
  const teacherGrid = grid[teacherCode] || [];
  const target = subjectShortName(subject);
  let count = 0;

  PERIODS.forEach((period) => {
    const cell = teacherGrid[period - 1]?.[dayIndex];
    if (!cell || cell.blocked || !cell.value) return;
    if (subjectShortName(cell.subject) === target) count += 1;
  });

  return count;
}

function hasTeacherGradeBlockOnDay(grid, teacherCode, grade, dayIndex) {
  const teacherGrid = grid[teacherCode] || [];
  for (let period = 1; period <= 5; period += 1) {
    const current = teacherGrid[period - 1]?.[dayIndex];
    const next = teacherGrid[period]?.[dayIndex];
    if (!current || !next) continue;
    if (!current.classCode || !next.classCode) continue;
    if (String(current.classCode) !== String(next.classCode)) continue;
    if (String(current.subject || '') !== String(next.subject || '')) continue;
    const parsed = parseClassCode(current.classCode);
    if (parsed.ok && Number(parsed.grade) === Number(grade)) return true;
  }
  return false;
}

function hasTeacherGradeSingleOnDay(grid, teacherCode, grade, dayIndex) {
  const teacherGrid = grid[teacherCode] || [];
  for (let period = 1; period <= 6; period += 1) {
    const cell = teacherGrid[period - 1]?.[dayIndex];
    if (!cell || cell.blocked || !cell.classCode) continue;
    const parsed = parseClassCode(cell.classCode);
    if (!parsed.ok || Number(parsed.grade) !== Number(grade)) continue;

    const prev = teacherGrid[period - 2]?.[dayIndex];
    const next = teacherGrid[period]?.[dayIndex];
    const samePrev = prev && !prev.blocked
      && String(prev.classCode || '') === String(cell.classCode || '')
      && String(prev.subject || '') === String(cell.subject || '');
    const sameNext = next && !next.blocked
      && String(next.classCode || '') === String(cell.classCode || '')
      && String(next.subject || '') === String(cell.subject || '');

    if (!samePrev && !sameNext) return true;
  }
  return false;
}

function hasTeacherClassBlockOnDay(grid, teacherCode, classCode, subject, dayIndex) {
  const teacherGrid = grid[teacherCode] || [];
  const targetClass = String(classCode || '');
  const targetSubject = String(subject || '');

  for (let period = 1; period <= 5; period += 1) {
    const current = teacherGrid[period - 1]?.[dayIndex];
    const next = teacherGrid[period]?.[dayIndex];
    if (!current || !next || current.blocked || next.blocked) continue;
    if (String(current.classCode || '') !== targetClass || String(next.classCode || '') !== targetClass) continue;
    if (String(current.subject || '') !== targetSubject || String(next.subject || '') !== targetSubject) continue;
    return true;
  }

  return false;
}

function hasTeacherClassSingleOnDay(grid, teacherCode, classCode, subject, dayIndex) {
  const teacherGrid = grid[teacherCode] || [];
  const targetClass = String(classCode || '');
  const targetSubject = String(subject || '');

  for (let period = 1; period <= 6; period += 1) {
    const cell = teacherGrid[period - 1]?.[dayIndex];
    if (!cell || cell.blocked) continue;
    if (String(cell.classCode || '') !== targetClass) continue;
    if (String(cell.subject || '') !== targetSubject) continue;

    const prev = teacherGrid[period - 2]?.[dayIndex];
    const next = teacherGrid[period]?.[dayIndex];
    const samePrev = prev && !prev.blocked
      && String(prev.classCode || '') === targetClass
      && String(prev.subject || '') === targetSubject;
    const sameNext = next && !next.blocked
      && String(next.classCode || '') === targetClass
      && String(next.subject || '') === targetSubject;

    if (!samePrev && !sameNext) return true;
  }

  return false;
}

function optimizeSingleDaySeparation(grid, config) {
  const teacherCodes = Object.keys(grid).sort(compareTeacherCode);

  teacherCodes.forEach((teacherCode) => {
    let changed = true;
    let guard = 0;

    while (changed && guard < 300) {
      changed = false;
      guard += 1;

      const singles = collectRelocatableSinglesForTeacher(grid, teacherCode);
      for (const item of singles) {
        if (!relocateSingleOffBlockDay(grid, config, item)) continue;
        changed = true;
        break;
      }
    }
  });
}

function optimizeTeacherPreferredDayCoverage(grid, config, preferredDays = [0, 1]) {
  const teacherCodes = Object.keys(grid).sort(compareTeacherCode);
  teacherCodes.forEach((teacherCode) => {
    preferredDays.forEach((dayIndex) => {
      if (countDayLoad(grid[teacherCode] || [], dayIndex) > 0) return;
      moveSingleForPreferredDay(grid, config, teacherCode, dayIndex);
    });
  });
}

function moveSingleForPreferredDay(grid, config, teacherCode, targetDayIndex) {
  const teacherGrid = grid[teacherCode] || [];
  const candidates = [];

  for (let sourceDay = 0; sourceDay < 5; sourceDay += 1) {
    if (sourceDay === targetDayIndex) continue;
    const sourceLoad = countDayLoad(teacherGrid, sourceDay);
    if (sourceLoad <= 1) continue;

    for (let period = 1; period <= 6; period += 1) {
      const cell = teacherGrid[period - 1]?.[sourceDay];
      if (!cell || cell.blocked || cell.locked || !cell.classCode) continue;
      if (isTeacherCellPartOfBlock(teacherGrid, sourceDay, period)) continue;

      candidates.push({
        sourceDay,
        sourceLoad,
        period,
        cell
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.sourceLoad !== b.sourceLoad) return b.sourceLoad - a.sourceLoad;
    if (a.sourceDay !== b.sourceDay) return b.sourceDay - a.sourceDay;
    return b.period - a.period;
  });

  const targetPeriods = [1, 2, 3, 4, 5, 6];
  for (const candidate of candidates) {
    const parsed = parseClassCode(candidate.cell.classCode);
    const lesson = {
      teacher: teacherCode,
      subject: candidate.cell.subject,
      classCode: candidate.cell.classCode,
      roomName: candidate.cell.roomName || '',
      useRoom: !!candidate.cell.roomName,
      grade: parsed.grade,
      classNo: parsed.classNo
    };

    for (const targetPeriod of targetPeriods) {
      if (!canPlaceSingle(grid, config, lesson, targetDayIndex, targetPeriod)) continue;
      writeLesson(grid, lesson, targetDayIndex, targetPeriod, false);
      teacherGrid[candidate.period - 1][candidate.sourceDay] = null;
      return true;
    }
  }

  return moveBlockForPreferredDay(grid, config, teacherCode, targetDayIndex);
}

function moveBlockForPreferredDay(grid, config, teacherCode, targetDayIndex) {
  const teacherGrid = grid[teacherCode] || [];
  const blockCandidates = [];

  for (let sourceDay = 0; sourceDay < 5; sourceDay += 1) {
    if (sourceDay === targetDayIndex) continue;
    const sourceLoad = countDayLoad(teacherGrid, sourceDay);
    if (sourceLoad <= 2) continue;

    for (let start = 1; start <= 5; start += 1) {
      const first = teacherGrid[start - 1]?.[sourceDay];
      const second = teacherGrid[start]?.[sourceDay];
      if (!first || !second) continue;
      if (first.blocked || second.blocked || first.locked || second.locked) continue;
      if (!first.classCode || !second.classCode) continue;
      if (String(first.classCode || '') !== String(second.classCode || '')) continue;
      if (String(first.subject || '') !== String(second.subject || '')) continue;

      blockCandidates.push({
        sourceDay,
        sourceLoad,
        start,
        first
      });
    }
  }

  blockCandidates.sort((a, b) => {
    if (a.sourceLoad !== b.sourceLoad) return b.sourceLoad - a.sourceLoad;
    if (a.sourceDay !== b.sourceDay) return b.sourceDay - a.sourceDay;
    return b.start - a.start;
  });

  const targetStarts = [1, 3, 5];
  for (const candidate of blockCandidates) {
    const parsed = parseClassCode(candidate.first.classCode);
    const lesson = {
      teacher: teacherCode,
      subject: candidate.first.subject,
      classCode: candidate.first.classCode,
      roomName: candidate.first.roomName || '',
      useRoom: !!candidate.first.roomName,
      grade: parsed.grade,
      classNo: parsed.classNo
    };

    for (const targetStart of targetStarts) {
      if (!canPlaceBlock(grid, config, lesson, targetDayIndex, targetStart)) continue;
      writeLesson(grid, lesson, targetDayIndex, targetStart, false);
      writeLesson(grid, lesson, targetDayIndex, targetStart + 1, false);
      teacherGrid[candidate.start - 1][candidate.sourceDay] = null;
      teacherGrid[candidate.start][candidate.sourceDay] = null;
      return true;
    }
  }

  return false;
}

function collectRelocatableSinglesForTeacher(grid, teacherCode) {
  const teacherGrid = grid[teacherCode] || [];
  const results = [];

  for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
    for (let period = 1; period <= 6; period += 1) {
      const cell = teacherGrid[period - 1]?.[dayIndex];
      if (!cell || cell.blocked || cell.locked || !cell.classCode) continue;
      if (isTeacherCellPartOfBlock(teacherGrid, dayIndex, period)) continue;

      const parsed = parseClassCode(cell.classCode);
      if (!parsed.ok) continue;

      const hasClassBlock = hasTeacherClassBlockOnDay(grid, teacherCode, cell.classCode, cell.subject, dayIndex);
      const hasGradeBlock = hasTeacherGradeBlockOnDay(grid, teacherCode, parsed.grade, dayIndex);
      if (!hasClassBlock && !hasGradeBlock) continue;

      results.push({
        teacherCode,
        dayIndex,
        period,
        grade: parsed.grade,
        classCode: cell.classCode,
        subject: cell.subject,
        roomName: cell.roomName || '',
        hasClassBlock,
        hasGradeBlock
      });
    }
  }

  return results.sort((a, b) => {
    const classPriority = Number(b.hasClassBlock) - Number(a.hasClassBlock);
    if (classPriority) return classPriority;
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return a.period - b.period;
  });
}

function relocateSingleOffBlockDay(grid, config, item) {
  const lesson = {
    teacher: item.teacherCode,
    subject: item.subject,
    classCode: item.classCode,
    roomName: item.roomName || '',
    useRoom: !!item.roomName
  };

  const strictMoved = tryRelocateSingle(grid, config, lesson, item.grade, item.dayIndex, item.period, {
    avoidClassBlockDay: true,
    avoidGradeBlockDay: true
  });
  return strictMoved;
}

function tryRelocateSingle(grid, config, lesson, grade, sourceDayIndex, sourcePeriod, options = {}) {
  const dayOrder = [0, 1, 2, 3, 4];
  const periodOrder = Array.isArray(config._variant?.periodOrder) ? config._variant.periodOrder : PERIODS;

  for (const dayIndex of dayOrder) {
    if (dayIndex === sourceDayIndex) continue;
    if (options.avoidClassBlockDay && hasTeacherClassBlockOnDay(grid, lesson.teacher, lesson.classCode, lesson.subject, dayIndex)) continue;
    if (options.avoidGradeBlockDay && hasTeacherGradeBlockOnDay(grid, lesson.teacher, grade, dayIndex)) continue;

    for (const period of periodOrder) {
      if (!canPlaceSingle(grid, config, lesson, dayIndex, period)) continue;
      writeLesson(grid, lesson, dayIndex, period, false);
      grid[lesson.teacher][sourcePeriod - 1][sourceDayIndex] = null;
      return true;
    }
  }

  return false;
}

function isTeacherCellPartOfBlock(teacherGrid, dayIndex, period) {
  const cell = teacherGrid[period - 1]?.[dayIndex];
  if (!cell || cell.blocked || !cell.classCode) return false;

  const prev = teacherGrid[period - 2]?.[dayIndex];
  const next = teacherGrid[period]?.[dayIndex];
  const samePrev = prev
    && !prev.blocked
    && String(prev.classCode || '') === String(cell.classCode || '')
    && String(prev.subject || '') === String(cell.subject || '');
  const sameNext = next
    && !next.blocked
    && String(next.classCode || '') === String(cell.classCode || '')
    && String(next.subject || '') === String(cell.subject || '');

  return !!(samePrev || sameNext);
}

function compareTeacherPlacementCandidate(config, a, b) {
  const sixthPenaltyDiff = getSixthPeriodPenalty(config, a) - getSixthPeriodPenalty(config, b);
  if (sixthPenaltyDiff) return sixthPenaltyDiff;

  const morningDiff = getMorningBand(a) - getMorningBand(b);
  if (morningDiff) return morningDiff;

  if (config.rules?.sameSubjectDayFirst !== false) {
    const sameSubjectDiff = Number(b.sameSubjectLoad || 0) - Number(a.sameSubjectLoad || 0);
    if (sameSubjectDiff) return sameSubjectDiff;
  }

  if (config.rules?.sameGradeFirst) {
    const sameGradeDiff = Number(b.sameGradeLoad || 0) - Number(a.sameGradeLoad || 0);
    if (sameGradeDiff) return sameGradeDiff;
  }

  if (Number(a.late) !== Number(b.late)) return Number(a.late) - Number(b.late);
  if (Number(a.period) !== Number(b.period)) return Number(a.period) - Number(b.period);
  return Number(a.dayRank) - Number(b.dayRank);
}

function compareBlockPlacementCandidate(config, a, b) {
  const sameGradeDiff = Number(b.sameGradeLoad || 0) - Number(a.sameGradeLoad || 0);
  if (sameGradeDiff) return sameGradeDiff;
  return compareTeacherPlacementCandidate(config, a, b);
}

function getMorningBand(candidate) {
  const period = Number(candidate.period || candidate.startPeriod || 0);
  if (period <= 2) return 0;
  if (period <= 4) return 1;
  return 2;
}

function getSixthPeriodPenalty(config, candidate) {
  const period = Number(candidate.period || candidate.startPeriod || 0);
  const duration = Number(candidate.startPeriod ? 2 : 1);
  const touchesSixth = period === 6 || (duration === 2 && period === 5);
  if (!touchesSixth) return 0;
  const dayIndex = Number(candidate.dayIndex);
  return getAllowedSixthPeriodDays(config).includes(dayIndex) ? 1 : 4;
}

function getDayOrder(grid, config, teacherCode) {
  const variant = config._variant || {};
  const baseDays = [0, 1, 2, 3, 4];
  const offset = Number(variant.dayOffset || 0);
  const shiftedDays = baseDays.map((day) => (day + offset) % 5);
  const orderedDays = variant.reverseDays ? shiftedDays.reverse() : shiftedDays;

  if (!config.rules.balanceDays) return orderedDays;
  const teacherGrid = grid[teacherCode] || [];
  const priority = new Map(orderedDays.map((day, index) => [day, index]));
  return orderedDays.slice().sort((a, b) => countDayLoad(teacherGrid, a) - countDayLoad(teacherGrid, b) || priority.get(a) - priority.get(b));
}

function countDayLoad(teacherGrid, dayIndex) {
  return teacherGrid.reduce((count, row) => count + (row[dayIndex] ? 1 : 0), 0);
}

function isPeriodAllowed(config, lesson, period) {
  if (!config.rules.lowerGradeMorningFirst) return true;
  return !(lesson.grade === 1 || lesson.grade === 2) || period <= 4;
}

function isDayPeriodAllowed(config, dayIndex, period) {
  if (Number(period) !== 6 || config.rules?.restrictSixthPeriod === false) return true;
  return getAllowedSixthPeriodDays(config).includes(Number(dayIndex));
}

function getAllowedSixthPeriodDays(config) {
  const raw = Array.isArray(config.rules?.sixthPeriodAllowedDays)
    ? config.rules.sixthPeriodAllowedDays
    : ['화', '목'];
  const indexes = raw
    .map((day) => typeof day === 'number' ? day : DAYS.indexOf(String(day || '').trim()))
    .filter((dayIndex) => dayIndex >= 0 && dayIndex < DAYS.length);
  return indexes.length ? [...new Set(indexes)] : [1, 3];
}

function getPreferredLateDayOrder(config) {
  const allowed = getAllowedSixthPeriodDays(config);
  const preferred = [3, 1].filter((dayIndex) => allowed.includes(dayIndex));
  return preferred.concat(allowed.filter((dayIndex) => !preferred.includes(dayIndex)));
}

function makeTeacherView(config, grid) {
  return getTeacherCodes(config).map((teacherCode) => {
    const lessons = config.teachers.filter((teacher) => teacher.teacherCode === teacherCode);
    const displayName = getTeacherDisplayName(config, teacherCode);
    const header = makeTeacherHeader(displayName, lessons);
    return {
      teacherName: teacherCode,
      displayName,
      header,
      grid: grid[teacherCode].map((row, periodIndex) => row.map((cell, dayIndex) => ({
        dayIndex,
        period: periodIndex + 1,
        value: cell && !cell.blocked ? cell.value : '',
        isBlocked: !!(cell && cell.blocked),
        roomName: cell && !cell.blocked ? (cell.roomName || '교실') : '',
        classCode: cell && cell.classCode ? cell.classCode : '',
        subject: cell && cell.subject ? cell.subject : '',
        teacher: cell && cell.teacher ? cell.teacher : teacherCode,
        locked: !!(cell && cell.locked)
      })))
    };
  });
}

function makeClassTimetables(config, teachers) {
  const classCodes = [];

  (config.gradeClasses || []).forEach((item) => {
    const grade = Number(item.grade);
    const classCount = Number(item.classCount || 0);
    for (let classNo = 1; classNo <= classCount; classNo += 1) {
      classCodes.push(`${grade}-${classNo}`);
    }
  });

  return classCodes.map((classCode) => {
    const parsed = parseClassCode(classCode);
    const grid = PERIODS.map((period) => DAYS.map((_day, dayIndex) => ({
      dayIndex,
      period,
      value: '',
      teacher: '',
      subject: '',
      roomName: '',
      source: ''
    })));

    (teachers || []).forEach((teacher) => {
      (teacher.grid || []).forEach((row, periodIndex) => {
        row.forEach((cell, dayIndex) => {
          if (!cell || !cell.value || cell.classCode !== classCode) return;
          grid[periodIndex][dayIndex] = {
            dayIndex,
            period: periodIndex + 1,
            value: cell.value,
            teacher: teacher.displayName || teacher.teacherName,
            teacherCode: teacher.teacherName,
            subject: cell.subject || '',
            roomName: cell.roomName || '교실',
            source: '전담',
            locked: !!cell.locked
          };
        });
      });
    });

    return {
      classCode,
      grade: parsed.grade,
      classNo: parsed.classNo,
      grid
    };
  });
}

function makeClassHourSummaries(config, classTimetables) {
  const scheduleMap = new Map((config.weeklySchedule || getDefaultWeeklySchedule()).map((item) => [
    Number(item.grade),
    item.daily || []
  ]));

  return (classTimetables || []).map((item) => {
    const dailyTotal = scheduleMap.get(item.grade) || getDefaultWeeklySchedule().find((g) => g.grade === item.grade)?.daily || [0, 0, 0, 0, 0];
    const dailyDedicated = DAYS.map((_day, dayIndex) => {
      return item.grid.reduce((count, row) => count + (row[dayIndex]?.value ? 1 : 0), 0);
    });
    const totalHours = dailyTotal.reduce((sum, value) => sum + Number(value || 0), 0);
    const dedicatedHours = dailyDedicated.reduce((sum, value) => sum + value, 0);

    return {
      classCode: item.classCode,
      grade: item.grade,
      classNo: item.classNo,
      dailyTotal,
      dailyDedicated,
      totalHours,
      dedicatedHours,
      remainingHours: Math.max(0, totalHours - dedicatedHours),
      warnings: dailyDedicated
        .map((hours, dayIndex) => ({ day: DAYS[dayIndex], hours, limit: dailyTotal[dayIndex] || 0 }))
        .filter((row) => row.hours >= 3 || row.hours > row.limit)
    };
  });
}

function makeTeacherLoadSummaries(teachers) {
  return (teachers || []).map((teacher) => {
    const daily = DAYS.map((_day, dayIndex) => {
      return (teacher.grid || []).reduce((count, row) => count + (row[dayIndex]?.value ? 1 : 0), 0);
    });

    return {
      teacherName: teacher.teacherName,
      displayName: teacher.displayName,
      header: teacher.header,
      daily,
      total: daily.reduce((sum, value) => sum + value, 0)
    };
  });
}

function makeClassLoadWarnings(classHourSummaries) {
  const warnings = [];

  (classHourSummaries || []).forEach((summary) => {
    (summary.warnings || []).forEach((warning) => {
      if (warning.hours > warning.limit) {
        warnings.push({
          type: 'CLASS_DAILY_OVER',
          location: '주당 수업시수',
          message: `${summary.classCode}반 ${warning.day}요일 전담 ${warning.hours}시간이 해당 요일 총 ${warning.limit}시간을 넘습니다.`
        });
      } else if (warning.hours >= 3) {
        warnings.push({
          type: 'CLASS_DAILY_HEAVY',
          location: '주당 수업시수',
          message: `${summary.classCode}반 ${warning.day}요일 전담이 ${warning.hours}시간으로 몰려 있습니다.`
        });
      }
    });
  });

  return warnings;
}

function getTeacherDisplayName(config, teacherCode) {
  const found = (config.teachers || []).find((teacher) => teacher.teacherCode === teacherCode);
  return String(found?.teacherName || found?.displayName || teacherCode).trim() || teacherCode;
}

function makeTeacherHeader(displayName, lessons) {
  const bySubject = new Map();

  lessons.forEach((lesson) => {
    const subject = String(lesson.subject || '').trim();
    if (!subject) return;

    if (!bySubject.has(subject)) bySubject.set(subject, new Set());

    (lesson.assignedClasses || []).forEach((classCode) => {
      const parsed = parseClassCode(classCode);
      if (parsed.ok) bySubject.get(subject).add(parsed.grade);
    });
  });

  const parts = Array.from(bySubject.entries()).map(([subject, grades]) => {
    const gradeText = Array.from(grades).sort((a, b) => a - b).join(',');
    return gradeText ? `${subject}(${gradeText}학년)` : subject;
  });

  return parts.length ? `${displayName} (${parts.join(', ')})` : displayName;
}

function validateResult(grid) {
  const warnings = [];
  const classMap = {};
  const roomMap = {};

  Object.keys(grid).forEach((teacher) => {
    grid[teacher].forEach((row, periodIndex) => {
      row.forEach((cell, dayIndex) => {
        if (!cell || cell.blocked) return;
        const timeKey = `${dayIndex}-${periodIndex + 1}`;
        if (cell.classCode) pushMap(classMap, `${timeKey}-${cell.classCode}`, { teacher, ...cell });
        if (cell.roomName) pushMap(roomMap, `${timeKey}-${cell.roomName}`, { teacher, ...cell });
      });
    });
  });

  Object.values(classMap).forEach((items) => {
    if (items.length > 1) warnings.push({ type: 'CLASS_DUPLICATE', message: '같은 시간에 같은 반이 중복 배치되었습니다.', items });
  });
  Object.values(roomMap).forEach((items) => {
    if (items.length > 1) warnings.push({ type: 'ROOM_DUPLICATE', message: '같은 시간에 같은 특별실이 중복 사용됩니다.', items });
  });

  return warnings;
}

function makeUnplaced(lesson, unitType, reason) {
  const category = classifyUnplacedLesson(lesson, unitType);
  return {
    teacher: lesson.teacher,
    subject: lesson.subject,
    grade: lesson.grade,
    classNo: lesson.classNo,
    classCode: lesson.classCode,
    unitType,
    roomName: lesson.roomName || '',
    reason: `${category}: ${reason}`
  };
}

function classifyUnplacedLesson(lesson, unitType) {
  if (String(unitType || '').includes('블록')) {
    return '연속 시간 부족';
  }

  if (lesson.roomName) {
    return '특별실 또는 반 시간 충돌';
  }

  if (lesson.grade === 1 || lesson.grade === 2) {
    return '저학년 오전 제한';
  }

  return '전담/반 빈 시간 부족';
}

function getRoomCapacity(config, roomName) {
  const found = config.rooms.find((room) => String(room.name || '').trim() === roomName);
  return Math.max(1, Number(found?.capacity || 1));
}

function parseClassCode(code) {
  const match = String(code || '').match(/^(\d+)-(\d+)/);
  if (!match) return { ok: false, grade: 999, classNo: 999 };
  return { ok: true, grade: Number(match[1]), classNo: Number(match[2]) };
}

function subjectShortName(subject) {
  return String(subject || '').trim().substring(0, 1);
}

function isScienceLesson(lesson) {
  const subject = String(lesson?.subject || '').trim().toLowerCase();
  return subject.includes('과학') || subject === 'sci' || subject.includes('science');
}

function compareTeacherCode(a, b) {
  return (Number(String(a).replace('전담', '')) || 999) - (Number(String(b).replace('전담', '')) || 999);
}

function compareLesson(a, b, config = null) {
  const teacher = compareTeacherCode(a.teacher, b.teacher);
  if (teacher) return teacher;
  if (config?.rules?.subjectFirst !== false && String(a.subject) !== String(b.subject)) {
    return String(a.subject).localeCompare(String(b.subject));
  }
  const gradePriorityDiff = Number(b.gradePriority || 0) - Number(a.gradePriority || 0);
  if (gradePriorityDiff) return gradePriorityDiff;
  if (a.grade !== b.grade) return a.grade - b.grade;
  if (String(a.subject) !== String(b.subject)) return String(a.subject).localeCompare(String(b.subject));
  return a.classNo - b.classNo;
}

function compareBlockLessonPriority(a, b, config = null) {
  const teacher = compareTeacherCode(a.teacher, b.teacher);
  if (teacher) return teacher;

  if (isScienceLesson(a) && isScienceLesson(b) && a.grade !== b.grade) {
    return a.grade - b.grade;
  }

  // 2시간 블록은 학년 단위 진도 확보를 위해 학급 수가 많은 학년을 먼저 처리
  const classCountDiff = Number(b.gradeClassCount || 0) - Number(a.gradeClassCount || 0);
  if (classCountDiff) return classCountDiff;

  const gradePriorityDiff = Number(b.gradePriority || 0) - Number(a.gradePriority || 0);
  if (gradePriorityDiff) return gradePriorityDiff;

  if (a.grade !== b.grade) return a.grade - b.grade;
  if (String(a.subject) !== String(b.subject)) return String(a.subject).localeCompare(String(b.subject));
  return a.classNo - b.classNo;
}

function groupBy(items, getKey) {
  return items.reduce((map, item) => {
    const key = getKey(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
    return map;
  }, {});
}

function pushMap(map, key, value) {
  if (!map[key]) map[key] = [];
  map[key].push(value);
}

function makeCandidatesFromAttempts(config, attempts, count) {
  const results = [];
  const seen = new Set();

  attempts.forEach((attempt) => {
    TIMETABLE_VARIANTS.forEach((variant) => {
      const attemptConfig = {
        ...config,
        rules: {
          ...(config.rules || {}),
          ...(attempt.rules || {})
        }
      };
      const result = buildTimetable(attemptConfig, { variant });
      const signature = makeResultSignature(result);
      if (seen.has(signature)) return;

      seen.add(signature);
      results.push({
        id: `candidate-${results.length + 1}`,
        name: attempt.label ? `${attempt.label} · ${variant.name}` : variant.name,
        summary: makeCandidateSummary(result),
        metrics: result.metrics,
        result
      });
    });
  });

  results.sort(compareCandidateResult);
  return results.slice(0, count);
}

function compareCandidateResult(a, b) {
  const am = a.metrics || a.result?.metrics || {};
  const bm = b.metrics || b.result?.metrics || {};

  if ((am.unplacedCount || 0) !== (bm.unplacedCount || 0)) return (am.unplacedCount || 0) - (bm.unplacedCount || 0);
  if ((am.warningCount || 0) !== (bm.warningCount || 0)) return (am.warningCount || 0) - (bm.warningCount || 0);
  if ((am.morningCount || 0) !== (bm.morningCount || 0)) return (bm.morningCount || 0) - (am.morningCount || 0);
  if ((am.mondayMorningCount || 0) !== (bm.mondayMorningCount || 0)) return (bm.mondayMorningCount || 0) - (am.mondayMorningCount || 0);
  if ((am.middayCount || 0) !== (bm.middayCount || 0)) return (am.middayCount || 0) - (bm.middayCount || 0);
  if ((am.nonPreferredSixthCount || 0) !== (bm.nonPreferredSixthCount || 0)) return (am.nonPreferredSixthCount || 0) - (bm.nonPreferredSixthCount || 0);
  if ((am.daySpread || 0) !== (bm.daySpread || 0)) return (am.daySpread || 0) - (bm.daySpread || 0);
  return (am.lateCount || 0) - (bm.lateCount || 0);
}
function makeResultSignature(result) {
  return (result.teachers || []).map((teacher) =>
    teacher.grid.map((row) => row.map((cell) => cell.value || (cell.isBlocked ? 'X' : '')).join(',')).join('|')
  ).join('||');
}

function makeCandidateSummary(result) {
  const metrics = result.metrics || makeResultMetrics(result);
  const unplacedCount = metrics.unplacedCount;
  const warningCount = metrics.warningCount;

  if (unplacedCount) {
    return `\uBBF8\uBC30\uCE58 ${unplacedCount}\uAC74 / \uAC80\uC99D ${warningCount}\uAC74 / 1-2\uAD50\uC2DC ${metrics.morningCount}\uCE78 / 5-6\uAD50\uC2DC ${metrics.lateCount}\uCE78`;
  }

  return `\uBBF8\uBC30\uCE58 \uC5C6\uC74C / 1-2\uAD50\uC2DC ${metrics.morningCount}\uCE78 / 5-6\uAD50\uC2DC ${metrics.lateCount}\uCE78 / \uAC80\uC99D ${warningCount}\uAC74`;
}
function makeResultMetrics(result, config = null) {
  const dayLoads = DAYS.map(() => 0);
  let lateCount = 0;
  let morningCount = 0;
  let mondayMorningCount = 0;
  let middayCount = 0;
  let nonPreferredSixthCount = 0;
  let placedCount = 0;

  (result.teachers || []).forEach((teacher) => {
    (teacher.grid || []).forEach((row, periodIndex) => {
      row.forEach((cell, dayIndex) => {
        if (!cell || cell.isBlocked || !cell.value) return;
        const period = periodIndex + 1;
        placedCount += 1;
        dayLoads[dayIndex] += 1;
        if (period <= 2) {
          morningCount += 1;
          if (dayIndex === 0) mondayMorningCount += 1;
        }
        if (period >= 3 && period <= 4) middayCount += 1;
        if (period >= 5) lateCount += 1;
        if (period === 6 && !getAllowedSixthPeriodDays(config || {}).includes(dayIndex)) {
          nonPreferredSixthCount += 1;
        }
      });
    });
  });

  const activeDayLoads = dayLoads.filter((load) => load > 0);
  const daySpread = activeDayLoads.length ? Math.max(...activeDayLoads) - Math.min(...activeDayLoads) : 0;

  return {
    unplacedCount: (result.unplacedLessons || []).length,
    warningCount: (result.warnings || []).filter((warning) => !isWeeklyHoursWarning(warning)).length,
    lessonCount: (result.lessons || []).length,
    placedCount,
    morningCount,
    mondayMorningCount,
    middayCount,
    nonPreferredSixthCount,
    lateCount,
    daySpread
  };
}

function isBlockPatternValid(pattern, weeklyHours) {
  const total = Number(weeklyHours || 0);
  const text = String(pattern || '').trim();
  if (!text || total <= 0) return true;

  const parts = text.split('+').map((part) => Number(part.trim())).filter((value) => value === 1 || value === 2);
  return parts.length > 0 && parts.reduce((sum, value) => sum + value, 0) === total;
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = issue.message;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((issue) => ({
    ...issue,
    location: issue.location || inferIssueLocation(issue.message)
  }));
}

function inferIssueLocation(message) {
  const text = String(message || '');
  if (text.includes('학급 수')) return '기본 설정 > 학급 수';
  if (text.includes('특별실 목록')) return '기본 설정 > 특별실';
  if (text.includes('특별실 배정')) return '특별실 배정';
  if (text.includes('특별실') && text.includes('목록')) return '기본 설정 > 특별실';
  return '전담 배정';
}

function isWeeklyHoursWarning(warning) {
  return warning?.type === 'CLASS_DAILY_OVER' || warning?.type === 'CLASS_DAILY_HEAVY';
}


